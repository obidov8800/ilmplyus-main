import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Joriy tabning mazmunini (`.dash-tab-content`) PDF ga yuklab beradi.
 *
 * `window.print()` ISHLATILMAYDI — Chrome print oynasi sana/URL/sarlavhani
 * o'zi qo'shadi va sahifa kodidan o'chirib bo'lmaydi. Shu sabab tabning
 * to'g'ridan-to'g'ri bolalari (`.dash-stats-row` / `.dash-mid-row` / `.dash-card`)
 * navbat bilan `html2canvas` orqali rasterizatsiya qilinadi va portret A4
 * PDF ga joylanadi — karta o'rtasidan kesilmasin uchun har blok butunligicha
 * qo'yiladi, joy yetmasa yangi sahifa ochiladi. Andoza `payroll-sheets/pdfExport.ts`
 * bilan bir xil (u landscape, bu portret).
 */

const PAGE_W_MM = 210; // A4 portret
const PAGE_H_MM = 297;
const MARGIN_MM = 10;
const GAP_MM = 4;
const CONTENT_W_MM = PAGE_W_MM - MARGIN_MM * 2;
const CONTENT_H_MM = PAGE_H_MM - MARGIN_MM * 2;

export async function exportDashboardPdf(
  root: HTMLElement,
  filename: string,
  title?: string,
): Promise<void> {
  const blocks = Array.from(root.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.offsetHeight > 0,
  );
  if (blocks.length === 0) return;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = MARGIN_MM;
  let placedOnPage = false;

  if (title) {
    pdf.setFontSize(13);
    pdf.setTextColor(30, 41, 59);
    pdf.text(title, MARGIN_MM, y + 4);
    y += 12;
    placedOnPage = true;
  }

  for (const block of blocks) {
    const canvas = await html2canvas(block, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 0,
    });
    if (!canvas.width || !canvas.height) continue;

    let imgW = CONTENT_W_MM;
    let imgH = (canvas.height / canvas.width) * imgW;
    let x = MARGIN_MM;

    if (imgH > CONTENT_H_MM) {
      // Bir sahifadan baland blok — balandlikka moslab kichraytiramiz
      // (buzilib cho'zilmasin), o'z sahifasiga qo'yiladi.
      imgH = CONTENT_H_MM;
      imgW = (canvas.width / canvas.height) * imgH;
      x = MARGIN_MM + (CONTENT_W_MM - imgW) / 2;
      if (placedOnPage) pdf.addPage();
      y = MARGIN_MM;
    } else if (placedOnPage && y + imgH > MARGIN_MM + CONTENT_H_MM) {
      pdf.addPage();
      y = MARGIN_MM;
    }

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, imgW, imgH);
    y += imgH + GAP_MM;
    placedOnPage = true;
  }

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
