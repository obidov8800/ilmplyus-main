import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Hujjatni brauzerning chop etish oynasi (HTML → `window.print()`) o'rniga HAQIQIY PDF qilib ko'rsatish.
 *
 * Nega: HTML'ni chop etganda brauzer har sahifaga o'zining sarlavha/pastki yozuvlarini qo'shadi
 * (sana-vaqt, sahifa nomi, `about:blank`, «1/6»). PDF ko'ruvchida (Chrome PDF viewer) esa hujjat
 * toza chiqadi, nomi ko'rinadi, undan yuklab olish va chop etish mumkin — chop etilganda ham
 * brauzer yozuvlari qo'shilmaydi.
 *
 * Ishlatish: `const win = openPdfWindow(title)` — ALBATTA bosish (click) ichida, birinchi `await` dan
 * OLDIN (aks holda brauzer yangi oynani pop-up deb bloklaydi). So'ng PDF tayyor bo'lgach `showPdf(...)`.
 */

const A4_W_MM = 210;
const A4_H_MM = 297;
/** A4 96dpi da (docx-preview ham shu o'lchamda chizadi). */
export const A4_W_PX = 794;
export const A4_H_PX = 1123;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Bosish paytida darhol bo'sh oyna ochadi («Tayyorlanmoqda…»); PDF tayyor bo'lgach unga yuklanadi. */
export function openPdfWindow(title: string): Window | null {
  const win = window.open('', '_blank');
  if (!win) return null;
  try {
    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
        `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;` +
        `background:#525659;color:#fff;font:16px system-ui,sans-serif">Hujjat tayyorlanmoqda…</body></html>`,
    );
    win.document.close();
  } catch {
    /* oyna ochildi, matn yozilmasa ham PDF yuklanadi */
  }
  return win;
}

/**
 * Tayyor PDF'ni beradi.
 * - `pdf` («PDF yuklash»): fayl kompyuterga yuklab olinadi (`<nom>.pdf`).
 * - `print` («Chop etish»): oldindan ochilgan oynada PDF ko'ruvchi ochiladi — nomi, sahifalar,
 *   yuklab olish va chop etish tugmalari bilan; chop etilganda brauzer yozuvlari qo'shilmaydi.
 */
export function showPdf(pdf: jsPDF, title: string, mode: 'pdf' | 'print', win: Window | null): void {
  pdf.setProperties({ title, creator: 'ILM PLYUS' });
  pdf.setDisplayMode('fullwidth', 'continuous');

  if (mode === 'pdf') {
    closePdfWindow(win);
    pdf.save(`${title.replace(/[\/:*?"<>|]+/g, ' ').trim() || 'hujjat'}.pdf`);
    return;
  }

  const url = URL.createObjectURL(pdf.output('blob'));
  // Ko'ruvchi oyna yopilguncha URL kerak — bir necha daqiqadan keyin bo'shatiladi.
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  if (win && !win.closed) {
    win.location.href = url;
  } else if (!window.open(url, '_blank')) {
    // Pop-up bloklangan bo'lsa — hech bo'lmasa fayl sifatida saqlanadi.
    pdf.save(`${title}.pdf`);
  }
}

/** Hujjat tayyorlanmagan bo'lsa (xato) — oldindan ochilgan bo'sh oynani yopadi. */
export function closePdfWindow(win: Window | null): void {
  try {
    if (win && !win.closed) win.close();
  } catch {
    /* ignore */
  }
}

/** A4 sahifa elementlarini (har biri 794×1123px) suratga olib, A4 PDF yasaydi. */
export async function pagesToPdf(pages: HTMLElement[]): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      // Sahifa A4 dan kattaroq masshtabda chizilgan bo'lishi mumkin (sig'dirish) — o'z o'lchami olinadi.
      width: pages[i].offsetWidth || A4_W_PX,
      height: pages[i].offsetHeight || A4_H_PX,
      windowWidth: pages[i].offsetWidth || A4_W_PX,
      logging: false,
    });
    if (i > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, A4_W_MM, A4_H_MM, undefined, 'FAST');
  }
  return pdf;
}

/** Bitta elementni (masalan chek) o'z o'lchamidagi bitta sahifali PDF ga aylantiradi. */
export async function elementToPdf(
  element: HTMLElement,
  options: { sidePaddingPx?: number; windowWidth?: number } = {},
): Promise<jsPDF> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    windowWidth: options.windowWidth,
    logging: false,
  });
  const pxToMm = 0.2645833333;
  const imgWidth = (canvas.width / 2) * pxToMm;
  const imgHeight = (canvas.height / 2) * pxToMm;
  const side = (options.sidePaddingPx ?? 0) * pxToMm;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [imgWidth + side * 2, imgHeight] });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', side, 0, imgWidth, imgHeight);
  return pdf;
}

interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Umumiy sahifalash: manba bloklar tartib bilan A4 sahifalarga joylanadi. Blok sig'masa — agar u
 * bo'linadigan konteyner bo'lsa (bo'lim, div) ichidagi bolalari birma-bir joylanadi, aks holda
 * (paragraf, jadval, rasm, satr) butunligicha keyingi sahifaga o'tadi — satr o'rtasidan kesilmaydi.
 * Konteynerlar har sahifada qayta (bo'sh nusxa sifatida) ochiladi, shuning uchun ularning CSS'i saqlanadi.
 */
class Paginator {
  pages: HTMLElement[] = [];
  private body: HTMLElement | null = null;
  private shells = new Map<Element, HTMLElement>();

  private out: HTMLElement;
  private margins: (pageIndex: number) => Margins;
  private pageTemplate: () => HTMLElement;

  /** Sahifa masshtabi: 1 — A4 96dpi; 1,1 — sahifa 10% kattaroq chiziladi va PDF'da A4 ga kichraytiriladi (matn ixchamroq). */
  private k: number;

  constructor(
    out: HTMLElement,
    margins: (pageIndex: number) => Margins,
    pageTemplate: () => HTMLElement,
    k = 1,
  ) {
    this.out = out;
    this.margins = margins;
    this.pageTemplate = pageTemplate;
    this.k = k;
  }

  newPage(): void {
    const k = this.k;
    const raw = this.margins(this.pages.length);
    const m = { top: raw.top * k, right: raw.right * k, bottom: raw.bottom * k, left: raw.left * k };
    const W = Math.round(A4_W_PX * k);
    const H = Math.round(A4_H_PX * k);
    const sec = this.pageTemplate();
    sec.style.cssText =
      `box-sizing:border-box;width:${W}px;height:${H}px;min-height:${H}px;` +
      `padding:${m.top}px ${m.right}px ${m.bottom}px ${m.left}px;margin:0;overflow:hidden;background:#fff;box-shadow:none;`;
    const art = document.createElement('article');
    art.style.cssText = `margin:0;padding:0;max-height:none;`;
    art.dataset.limit = String(H - m.top - m.bottom);
    sec.appendChild(art);
    this.out.appendChild(sec);
    this.pages.push(sec);
    this.body = art;
    this.shells = new Map();
  }

  private fits(): boolean {
    // ~0,8sm zaxira pastki chegara hisobidan: oxirgi bir-ikki qator (sana, imzo) yolg'iz yangi sahifaga o'tib qolmasin.
    return this.body!.scrollHeight <= Number(this.body!.dataset.limit) + 30;
  }

  /** Joriy sahifada `chain` (manba ajdodlar) uchun bo'sh nusxalar zanjiri — eng ichkisini qaytaradi. */
  private target(chain: Element[]): HTMLElement {
    let parent = this.body!;
    for (const src of chain) {
      let shell = this.shells.get(src);
      if (!shell) {
        shell = src.cloneNode(false) as HTMLElement;
        parent.appendChild(shell);
        this.shells.set(src, shell);
      }
      parent = shell;
    }
    return parent;
  }

  private static atomic(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return true;
    if (node.childElementCount === 0) return true;
    if (node.dataset.keep) return true;
    return /^(P|TABLE|TR|IMG|SVG|CANVAS|H[1-6]|LI)$/.test(node.tagName);
  }

  place(node: Node, chain: Element[] = []): void {
    if (!this.body) this.newPage();
    let parent = this.target(chain);
    parent.appendChild(node);
    if (this.fits()) return;
    node.parentNode?.removeChild(node);

    if (!Paginator.atomic(node)) {
      const el = node as HTMLElement;
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && !(child.textContent || '').trim()) continue;
        this.place(child, [...chain, el]);
      }
      return;
    }

    // Bo'linmaydigan blok: yangi sahifaga (sahifa bo'sh bo'lsa ham sig'masa — shu sahifada qoladi)
    const pageHasContent = (this.body!.textContent || '').trim().length > 0;
    if (pageHasContent) {
      this.newPage();
      parent = this.target(chain);
    }
    parent.appendChild(node);
  }
}

/**
 * docx-preview chizgan bo'limlarni (`section.docx`) haqiqiy A4 sahifalarga bo'ladi.
 *
 * docx-preview Word'dagi kabi avtomatik sahifalamaydi — bitta bo'lim bir necha sahifa balandligida
 * bo'lishi mumkin (ilgari buni brauzerning chop etishi qilardi). Chegaralar avvalgi chop etish bilan
 * bir xil (ikki tomonlama — «oyna»): toq sahifa chapi 3sm / o'ngi 1,5sm, juft sahifada aksincha;
 * tepa/past 2sm. Word bo'lim (sahifa) uzilishi yangi sahifadan boshlanadi.
 *
 * `extra` — hujjat oxiriga alohida sahifa(lar)da qo'shiladigan HTML (masalan tasdiqlash holati bloki).
 * Natija sahifalari `host` ichida qoladi — suratga olingach chaqiruvchi `host` ni o'chiradi.
 */
export function paginateDocxSections(
  host: HTMLElement,
  extra?: string,
  options: { maxPages?: number; startScale?: number } = {},
): HTMLElement[] {
  const CM = 37.795; // 1sm (96dpi)
  const wrapper = host.querySelector<HTMLElement>('.docx-wrapper') ?? host;
  const maxPages = options.maxPages ?? Infinity;

  const attempt = (k: number) => {
    // Har urinishda manbaning nusxasi sahifalanadi (asl manba keyingi urinish uchun butun qoladi).
    const src = wrapper.cloneNode(true) as HTMLElement;
    const sources = Array.from(src.querySelectorAll<HTMLElement>(':scope > section.docx'));
    // Natija sahifalari shu yerda — docx-preview uslublari (`.docx-wrapper > section.docx …`) amal qilsin.
    const out = document.createElement('div');
    out.className = wrapper.className || 'docx-wrapper';
    out.style.cssText = 'padding:0;margin:0;background:#fff;display:block;';
    wrapper.after(out);

    let template: HTMLElement | null = sources[0] ?? null;
    const pg = new Paginator(
      out,
      (i) => {
        const odd = i % 2 === 0; // 1-sahifa — toq (old tomon)
        return { top: 2 * CM, bottom: 2 * CM, left: (odd ? 3 : 1.5) * CM, right: (odd ? 1.5 : 3) * CM };
      },
      () => {
        const sec = (template ? template.cloneNode(false) : document.createElement('section')) as HTMLElement;
        if (!template) sec.className = 'docx';
        return sec;
      },
      k,
    );
    sources.forEach((section) => {
      template = section;
      pg.newPage();
      const holder = section.querySelector<HTMLElement>(':scope > article') ?? section;
      Array.from(holder.childNodes).forEach((b) => pg.place(b));
    });
    return { pg, out, setTemplate: (t: HTMLElement | null) => (template = t) };
  };

  // Hujjat `maxPages` dan oshsa — sahifa biroz kattaroq masshtabda chiziladi (PDF'da A4 ga kichrayadi,
  // ya'ni matn ixchamroq bo'ladi): 1 → 1,04 → … → ko'pi bilan 1,3 (shrift ~23% kichik).
  // `startScale` > 1 — ixcham hujjat: sahifa boshidanoq kattaroq masshtabda chiziladi (matn kichikroq).
  let k = options.startScale ?? 1;
  let res = attempt(k);
  while (res.pg.pages.length > maxPages && k < 1.3) {
    res.out.remove();
    k = Math.round((k + 0.04) * 100) / 100;
    res = attempt(k);
  }

  if (extra) {
    const tmp = document.createElement('div');
    tmp.innerHTML = extra;
    res.setTemplate(null);
    res.pg.newPage();
    Array.from(tmp.childNodes).forEach((b) => res.pg.place(b));
  }

  wrapper.remove();
  return res.pg.pages;
}

/**
 * Oddiy HTML hujjatni (masalan maktabga tayyorlov shartnomasi) A4 sahifalarga bo'ladi.
 * `rootSelector` — hujjatning asosiy elementi (uning bolalari sahifalanadi va har sahifada uning
 * bo'sh nusxasi ichida turadi — `.pcx p` kabi CSS saqlanadi). `marginsMm` — sahifa chegaralari.
 */
export function paginateHtml(
  host: HTMLElement,
  rootSelector: string,
  marginsMm: { top: number; right: number; bottom: number; left: number },
  extra?: string,
  options: { maxPages?: number } = {},
): HTMLElement[] {
  const MM = 3.7795;
  const root0 = host.querySelector<HTMLElement>(rootSelector) ?? host;
  const maxPages = options.maxPages ?? Infinity;

  const attempt = (k: number) => {
    // Har urinishda manbaning nusxasi sahifalanadi (asl manba keyingi urinish uchun butun qoladi).
    const root = root0.cloneNode(true) as HTMLElement;
    const out = document.createElement('div');
    host.appendChild(out);
    const pg = new Paginator(
      out,
      () => ({
        top: marginsMm.top * MM,
        right: marginsMm.right * MM,
        bottom: marginsMm.bottom * MM,
        left: marginsMm.left * MM,
      }),
      () => document.createElement('section'),
      k,
    );
    pg.newPage();
    // Holat kartalari rekvizitlar bilan BIR BLOK: sig'masa rekvizitlar sarlavhasi ham kartalar bilan birga
    // keyingi sahifaga tushadi (kartalar rekvizitlardan ajralib qolmaydi).
    if (extra) {
      const req = root.querySelector<HTMLElement>('.pcx-req');
      const head = req?.previousElementSibling as HTMLElement | null;
      if (req && head && head.parentNode === root) {
        const keep = document.createElement('div');
        keep.dataset.keep = '1';
        root.insertBefore(keep, head);
        keep.append(head, req);
        const tail = document.createElement('div');
        tail.innerHTML = `<div style="height:16px"></div>${extra}`;
        Array.from(tail.childNodes).forEach((b) => keep.appendChild(b));
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = extra;
        root.appendChild(tmp);
      }
    }
    // Asosiy element (masalan `.pcx`) har sahifada bo'sh nusxa sifatida — ichidagi CSS ishlasin.
    Array.from(root.childNodes).forEach((b) => pg.place(b, [root]));
    return { pg, out };
  };

  // `maxPages` dan oshsa — sahifa biroz kattaroq masshtabda chiziladi (PDF'da A4 ga kichrayadi, ya'ni matn
  // ixchamroq bo'ladi): 1 → 1,04 → … → ko'pi bilan 1,3. Matn o'zgarmaydi.
  let k = 1;
  let res = attempt(k);
  while (res.pg.pages.length > maxPages && k < 1.3) {
    res.out.remove();
    k = Math.round((k + 0.04) * 100) / 100;
    res = attempt(k);
  }
  root0.remove();
  return res.pg.pages;
}
