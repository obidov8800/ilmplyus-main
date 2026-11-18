import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * PDF/chop etish — brauzer "Chop etish" oynasi (window.print()) UMUMAN
 * ishlatilmaydi. Sabab: Chrome print oynasi sana/vaqt, URL va sahifa
 * sarlavhasini o'zi qo'shib qo'yadi va buni sahifa kodidan o'chirib
 * bo'lmaydi (faqat brauzerning o'z "Headers and footers" sozlamasi orqali,
 * foydalanuvchi tomonidan). Shu sabab bo'lim (`.ps-pdf-sheet`) elementlari
 * html2canvas bilan rasterizatsiya qilinib, jsPDF orqali ko'p sahifali
 * landscape A4 PDF sifatida yig'iladi va darhol yuklab beriladi — xuddi
 * shu andoza `course-prices/priceListPdf.ts`da ham ishlatilgan.
 *
 * MUHIM: elementlar EKRANDAGI (modal ~1300px keng) holicha suratga
 * olinmaydi — u juda "yassi" (keng, pastroq) chiqib, A4 sahifada katta
 * bo'sh joy qoldirardi. Shu sabab har bir bo'lim vaqtincha ekrandan
 * tashqarida (`left:-10000px`), sahifa kontent kengligiga mos TOR
 * konteynerga klonlanib, o'sha yerda suratga olinadi — xuddi haqiqiy
 * bosma varaqdagidek nisbatda (kenglik/balandlik) chiqadi.
 */

const PAGE_WIDTH_MM = 297; // A4 landscape
const PAGE_HEIGHT_MM = 210;
const MARGIN_LEFT_MM = 0; // Marginsiz — butun varaqni egallaydi.
const MARGIN_OTHER_MM = 0;

const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_LEFT_MM - MARGIN_OTHER_MM;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_OTHER_MM * 2;

const MM_PER_PX = 25.4 / 96; // CSS px → mm (96 dpi)
const CONTENT_WIDTH_PX = Math.round(CONTENT_WIDTH_MM / MM_PER_PX);

/**
 * Berilgan elementlarni (har biri — bitta bo'lim) navbat bilan
 * rasterizatsiya qilib, bitta ko'p sahifali PDF sifatida yuklab beradi.
 */
export async function exportPayrollPdf(
  sheetElements: HTMLElement[],
  filename: string,
): Promise<void> {
  if (sheetElements.length === 0) return;

  // Ekrandan tashqarida, sahifa kontent kengligiga mos tor "sahna" —
  // bo'lim shu yerga klonlanib, xuddi bosma varaqdagidek nisbatda suratga
  // olinadi. CSS klasslar global bo'lgani uchun klonga ham qo'llanadi.
  const stage = document.createElement('div');
  stage.className = 'ps-pdf-export-stage';
  stage.style.cssText = `position:fixed;left:-10000px;top:0;width:${CONTENT_WIDTH_PX}px;background:#fff;z-index:-1;`;
  document.body.appendChild(stage);

  try {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    for (let i = 0; i < sheetElements.length; i++) {
      const clone = sheetElements[i].cloneNode(true) as HTMLElement;
      stage.innerHTML = '';
      stage.appendChild(clone);
      // Rasmlar (muhrlar) va layout joylashib bo'lishi uchun bir freym kutamiz.
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
      });

      // Kenglik sahifa kontent hajmiga aniq moslanadi, balandlik nisbatan
      // hisoblanadi — juda ko'p xodimli bo'lim chekkaga sal chiqib ketishi
      // mumkin (buzilib cho'zilib ketishdan ko'ra xavfsizroq).
      const imgHeightMm = (canvas.height / canvas.width) * CONTENT_WIDTH_MM;
      // Bo'sh joy qolsa — tepa/pastga baravar taqsimlanadi (faqat tepada
      // to'planib qolmasin uchun), lekin bo'lim balandroq bo'lsa tepadan
      // boshlanadi (manfiy bo'lmaydi).
      const yMm = MARGIN_OTHER_MM + Math.max(0, (CONTENT_HEIGHT_MM - imgHeightMm) / 2);

      if (i > 0) pdf.addPage();
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.95),
        'JPEG',
        MARGIN_LEFT_MM,
        yMm,
        CONTENT_WIDTH_MM,
        imgHeightMm,
      );
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(stage);
  }
}
