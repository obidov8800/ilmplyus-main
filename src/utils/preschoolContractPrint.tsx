import { PreschoolContractDocument } from './preschoolContractDocument';
import { PRINT_PAGE_CSS, buildPreschoolDocData } from './preschoolContractData';
import { A4_W_PX, closePdfWindow, openPdfWindow, pagesToPdf, paginateHtml, showPdf } from './pdfViewer';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PDF / chop etish — hujjat haqiqiy A4 PDF bo'lib PDF ko'ruvchida ochiladi (yoki darhol chop etiladi).
 * Ilgari HTML alohida oynada `window.print()` qilinardi va brauzer har sahifaga sana-vaqt, sarlavha,
 * `about:blank`, «1/3» yozuvlarini qo'shardi — endi ular yo'q. Chegaralar avvalgi `@page` bilan bir xil.
 * `extraHtml` — hujjat oxiriga qo'shiladigan blok (masalan tasdiqlash kartalari).
 */
/**
 * Hujjat oxiridagi «YUBORILGAN / TASDIQLANGAN» kartalari. Holat `GET /student-contracts/{id}` ning `computed.card`
 * idan olinadi (shartnoma yuborilmagan bo'lsa karta yo'q). Xato bo'lsa hujjat kartasiz chiqadi.
 */
async function loadStatusHtml(contract: any): Promise<string | undefined> {
  if (!contract?.id) return undefined;
  try {
    const { API } = await import('@/api/api');
    const res = await API.get(`/student-contracts/${contract.id}`).then((r) => r.data);
    const computed = res?.computed;
    if (!computed?.show_card || !computed.card) return undefined;
    const full = res?.contract || res?.data || contract;
    const branch = full?.branch ?? contract?.branch ?? {};
    const { buildStatusBlockHTML } = await import('./contractPdf');
    return buildStatusBlockHTML({
      orgName: branch.legal_name || branch.name_uz || '—',
      orgDirector: branch.director_name || '—',
      date: computed.card.date,
      studentName: computed.card.name,
      studentPhone: computed.card.phone,
      studentOrg: computed.card.org,
      studentStatus: computed.card.status,
      studentStatusText: computed.card.status_text,
      orgLabel: 'MAKTAB',
      studentLabel: 'VAKIL',
    });
  } catch {
    return undefined;
  }
}

export async function printPreschoolContract(
  contract: any,
  options: { mode?: 'pdf' | 'print'; extraHtml?: string } = {},
): Promise<void> {
  const mode = options.mode ?? 'pdf';
  const data = buildPreschoolDocData(contract);
  const title = `Shartnoma №${data.number}`.replace(/[<>&"]/g, '');
  // Oyna bosish paytida (birinchi `await` dan oldin) ochiladi — aks holda brauzer pop-up deb bloklaydi.
  const win = mode === 'print' ? openPdfWindow(title) : null;

  const host = document.createElement('div');
  try {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(<PreschoolContractDocument data={data} />);

    // `@page`/`@media screen` qoidalari bu yerda kerak emas — chegaralarni sahifalovchi o'zi qo'yadi.
    const css = PRINT_PAGE_CSS.replace(/@page[^}]*}/g, '').replace(/@media screen\s*{[^}]*}\s*}/g, '');
    // Ixcham ko'rinish (xodim/o'quvchi shartnomalari kabi): kichikroq shrift, zich qator va band oralig'i.
    // Hujjat ichidagi `DOCUMENT_CSS` keyin keladi, shuning uchun `.pcx.pcx` bilan ustun qilinadi (ekran ko'rinishiga tegmaydi).
    const compact =
      '.pcx.pcx{font-size:11pt;line-height:1}' +
      '.pcx.pcx .pcx-meta{margin:8px 0}' +
      '.pcx.pcx .pcx-p{margin:0 0 2px}' +
      '.pcx.pcx .pcx-h{margin:8px 0 3px}' +
      '.pcx.pcx .pcx-gap{height:8px}';
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_PX}px;background:#fff;`;
    host.innerHTML = `<style>${css}${compact}</style>${html}`;
    document.body.appendChild(host);

    const extraHtml = options.extraHtml ?? (await loadStatusHtml(contract));
    const pages = paginateHtml(host, '.pcx', { top: 20, right: 15, bottom: 20, left: 30 }, extraHtml, { maxPages: 3 });
    const pdf = await pagesToPdf(pages);
    showPdf(pdf, title, mode, win);
  } catch (err) {
    closePdfWindow(win);
    throw err;
  } finally {
    host.remove();
  }
}
