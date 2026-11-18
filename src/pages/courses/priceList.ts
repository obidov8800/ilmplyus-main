/**
 * "Prays-list" — tasdiqlangan kurs narxlarining rasmiy ro'yxati.
 *
 * Har bir kurs+daraja uchun FAQAT eng oxirgi `approved` yozuv olinadi va
 * uning `new_price` qiymati narx sifatida ko'rsatiladi. Hujjat filiallarga
 * ajratiladi (har bir filial yangi sahifadan boshlanadi), so'ng to'g'ridan
 * to'g'ri PDF fayl sifatida yuklab olinadi — print oynasi ochilmaydi.
 */
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { API } from '@/api/api';
import { getLocalized } from '@/utils/getLocalized';
import { compareByNewest } from '@/utils/sortByNewest';
import type { CoursePrice, CoursePriceListResponse } from '@/types/course.types';
import logoUrl from '@/assets/images/logo-main-blue.svg';

/** Filial ma'lumotlari to'liq kelmasa hujjat sarlavhasida ishlatiladigan qiymatlar. */
const DEFAULT_ORG_NAME = '“ILM PLYUS O‘QUV” NTM';
const DEFAULT_DIRECTOR = 'G.B.Abdukarimova';

/** Bitta so'rovda maksimal yozuv; backend `per_page` ni e'tiborsiz qoldirsa ham sahifalab o'qiladi. */
const PAGE_SIZE = 200;
/** Cheksiz siklga tushmaslik uchun sahifalar chegarasi. */
const MAX_PAGES = 50;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
/** A4 eni 96 dpi da — px. */
const DOC_WIDTH_PX = 820;

/** Sarlavha bloki joy egallagani uchun birinchi sahifaga kamroq qator sig'adi. */
const FIRST_PAGE_ROWS = 18;
const NEXT_PAGE_ROWS = 24;

export interface PriceListRow {
  name: string;
  level: string;
  price: string;
}

export interface PriceListSection {
  branchId: number;
  branchName: string;
  city: string;
  orgName: string;
  directorName: string;
  rows: PriceListRow[];
}

const UZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

/** `2026-yil 01-sentabr` ko'rinishi. */
export function formatUzDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-yil ${day}-${UZ_MONTHS[date.getMonth()]}`;
}

/** `390000` → `390 000`. */
export function formatPrice(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return String(value ?? '');
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** "Abdukarimova Gulnora Baxtiyorovna" → "G.B.Abdukarimova". */
function toDirectorShortName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const [last, first, father] = parts;
  const initials = [first, father]
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join('');
  return `${initials}${last}`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}

/** Barcha sahifalardagi kurs narxlarini yig'ib beradi. */
export async function fetchAllCoursePrices(): Promise<CoursePrice[]> {
  const first: CoursePriceListResponse = await API.get('/course_prices', {
    params: { page: 1, per_page: PAGE_SIZE },
  }).then((r) => r.data);

  const rows: CoursePrice[] = [...(first.data ?? [])];
  const lastPage = Math.min(first.last_page || 1, MAX_PAGES);

  for (let page = 2; page <= lastPage; page++) {
    const res: CoursePriceListResponse = await API.get('/course_prices', {
      params: { page, per_page: PAGE_SIZE },
    }).then((r) => r.data);
    rows.push(...(res.data ?? []));
  }

  return rows;
}

/** Kurs nomi + (daraja) — daraja nomi kurs nomida allaqachon bo'lsa takrorlanmaydi. */
function buildRowName(row: CoursePrice, lang: string): string {
  const course = getLocalized(row.course, 'name', lang);
  const level = row.level ? getLocalized(row.level, 'name', lang) : '';
  if (!level || level === '-' || course.toLowerCase().includes(level.toLowerCase())) return course;
  return `${course} (${level})`;
}

/**
 * Tasdiqlangan narxlardan hujjat bo'limlarini yig'adi:
 * filial → kurs+daraja bo'yicha eng oxirgi `approved` yozuv.
 */
export function buildPriceListSections(
  allRows: CoursePrice[],
  lang: string,
  cityByBranchId: Record<number, string> = {},
): PriceListSection[] {
  const approved = allRows.filter((r) => (r.holat ?? r.status) === 'approved');
  // Eng yangisi birinchi bo'lsin — shunda har bir kurs uchun birinchi uchragani olinadi.
  const sorted = [...approved].sort(compareByNewest);

  const sections = new Map<number, PriceListSection>();
  const seenCourses = new Map<number, Set<string>>();

  for (const row of sorted) {
    const branchId = row.branch_id ?? row.branch?.id ?? 0;
    const courseKey = `${row.course_id ?? row.course?.id ?? 0}-${row.level_id ?? 0}`;

    let seen = seenCourses.get(branchId);
    if (!seen) {
      seen = new Set<string>();
      seenCourses.set(branchId, seen);
    }
    if (seen.has(courseKey)) continue;
    seen.add(courseKey);

    let section = sections.get(branchId);
    if (!section) {
      section = {
        branchId,
        branchName: getLocalized(row.branch, 'name', lang),
        city: row.branch?.city || cityByBranchId[branchId] || '',
        orgName: row.branch?.legal_name || DEFAULT_ORG_NAME,
        directorName: toDirectorShortName(row.branch?.director_name) || DEFAULT_DIRECTOR,
        rows: [],
      };
      sections.set(branchId, section);
    }

    section.rows.push({
      name: buildRowName(row, lang),
      level: row.level ? getLocalized(row.level, 'name', lang) : '-',
      price: formatPrice(row.new_price),
    });
  }

  const result = [...sections.values()];
  result.forEach((s) => s.rows.sort((a, b) => a.name.localeCompare(b.name, 'uz')));
  return result.sort((a, b) => a.branchName.localeCompare(b.branchName, 'uz'));
}

/** SVG logoni data-URI ga o'giradi — html2canvas tashqi fayllarni ba'zan o'qiy olmaydi. */
async function loadLogoDataUri(): Promise<string> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return logoUrl;
    const svg = await res.text();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return logoUrl;
  }
}

const DOC_STYLES = `
*{
    margin:0;
    padding:0;
    box-sizing:border-box;
}

body{
    background:#eef2f6;
    font-family:Arial,Helvetica,sans-serif;
}

.pl-page{

    width:${DOC_WIDTH_PX}px;

    margin:20px auto;

    background:#fff;

    overflow:hidden;

    box-shadow:0 10px 35px rgba(0,0,0,.08);

    color:#003366;

}

.pl-top-line{

    height:8px;

    background:#FE9100;

}

.pl-content{

    padding:39px 59px 39px 39px;

}

.pl-top{

    display:flex;

    justify-content:space-between;

    align-items:flex-start;

    gap:40px;

}

.pl-logo{

    width:270px;

    object-fit:contain;

}

.pl-approve{

    display:flex;

    flex-direction:column;

    align-items:flex:flex-end;

    text-align:right;

    line-height:1.7;

    color:#0b3767;

    min-width:280px;

}

.pl-approve-title{

    font-size:14px;

    font-weight:700;

    margin-bottom:10px;

}

.pl-org{

    font-size:13px;

    font-weight:600;

}

.pl-director{

    display:flex;

    align-items:center;

    justify-content:flex-end;

    gap:10px;

    margin-top:12px;

    font-size:13px;

    font-weight:700;

}

.pl-line{

    width:80px;

    height:1px;

    background:#0b3767;

}

.pl-date{

    margin-top:8px;

    font-size:12px;

    color:#52667c;

}

.pl-divider{

    height:1px;

    background:#d8e3ef;

    margin:42px 0;

}

.pl-title{

    text-align:center;

    color:#003366;

    font-size:20px;

    font-weight:800;

    line-height:1.55;

    letter-spacing:.4px;

}

.pl-sub{

    margin-top:18px;

    text-align:center;

    color:#FE9100;

    font-size:18px;

    font-weight:700;

}

.pl-table{

    width:100%;

    margin-top:50px;

    border-collapse:collapse;

    table-layout:fixed;

}

.pl-table thead th{

    background:#003366;

    color:#fff;

    padding:18px 12px;

    font-size:16px;

    font-weight:700;

    border:1px solid #003366;

}

.pl-table tbody td{

    border:1px solid #dfe6ee;

    padding:18px 14px;

    font-size:15px;

    color:#1f2f3f;

}

.pl-table tbody tr{

    background:#fff;

}

.pl-col-num{

    width:11%;

    text-align:center;

}

.pl-col-course{

    width:36%;

}

.pl-col-level{

    width:34%;

    text-align:center;

}

.pl-col-price{

    width:19%;

    text-align:center;

    color:#FE9100 !important;

    font-weight:700;

}

.pl-footer{

    margin-top:18px;

    text-align:right;

    font-size:16px;

    color:#697b8c;

}
`;

interface PageChunk {
  section: PriceListSection;
  rows: PriceListRow[];
  startIndex: number;
  withHeader: boolean;
}

function splitIntoPages(sections: PriceListSection[]): PageChunk[] {
  const chunks: PageChunk[] = [];
  for (const section of sections) {
    let index = 0;
    while (index < section.rows.length) {
      const withHeader = index === 0;
      const size = withHeader ? FIRST_PAGE_ROWS : NEXT_PAGE_ROWS;
      chunks.push({
        section,
        rows: section.rows.slice(index, index + size),
        startIndex: index,
        withHeader,
      });
      index += size;
    }
  }
  return chunks;
}

function renderPageHtml(chunk: PageChunk, logo: string, dateText: string): string {
  const { section } = chunk;

  return `
<div class="pl-page">

    <div class="pl-top-line"></div>

    <div class="pl-content">

        <div class="pl-top">

            <img
                class="pl-logo"
                src="${logo}"
            />

            <div class="pl-approve">

                <div class="pl-approve-title">

                    "TASDIQLAYMAN"

                </div>

                <div class="pl-org">

                    ${escapeHtml(section.orgName)}

                </div>

                <div class="pl-director">

                    <span>M.O'</span>

                    <span class="pl-line"></span>

                    <strong>${escapeHtml(section.directorName)}</strong>

                </div>

                <div class="pl-date">

                    ${escapeHtml(dateText)}

                </div>

            </div>

        </div>

        <div class="pl-divider"></div>

        <div class="pl-title">

            "ILM PLYUS O'QUV"
            <br>
            NODAVLAT TA'LIM MUASSASASI
            <br>
            YANGI NARXNOMA

        </div>

        <div class="pl-sub">

            "${escapeHtml(section.branchName)}"

        </div>

        <table class="pl-table">

            <thead>

                <tr>

                    <th class="pl-col-num">
                        №
                    </th>

                    <th class="pl-col-course">
                        KURS NOMI
                    </th>

                    <th class="pl-col-level">
                        DARAJASI
                    </th>

                    <th class="pl-col-price">
                        NARXI
                    </th>

                </tr>

            </thead>

            <tbody>

                ${chunk.rows
                  .map(
                    (row, index) => `

                <tr>

                    <td class="pl-col-num">

                        ${chunk.startIndex + index + 1}

                    </td>

                    <td class="pl-col-course">

                        ${escapeHtml(row.name)}

                    </td>

                    <td class="pl-col-level">

                        ${escapeHtml(row.level)}

                    </td>

                    <td class="pl-col-price">

                        ${escapeHtml(row.price)} so'm

                    </td>

                </tr>

                `,
                  )
                  .join('')}

            </tbody>

        </table>

        <div class="pl-footer">

            Narxlar ${escapeHtml(dateText)} holatiga ko'ra

        </div>

    </div>

</div>
`;
}

/** Hujjatni to'g'ridan-to'g'ri PDF fayl sifatida yuklab beradi (print oynasisiz). */
export async function downloadPriceListPdf(
  sections: PriceListSection[],
  filename: string,
): Promise<void> {
  if (!sections.length) return;

  const logo = await loadLogoDataUri();
  const dateText = formatUzDate(new Date());
  const pages = splitIntoPages(sections);

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${DOC_WIDTH_PX}px;background:#fff;z-index:-1;`;
  const styleTag = document.createElement('style');
  styleTag.textContent = DOC_STYLES;
  host.appendChild(styleTag);
  const mount = document.createElement('div');
  host.appendChild(mount);
  document.body.appendChild(host);

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    for (let i = 0; i < pages.length; i++) {
      mount.innerHTML = renderPageHtml(pages[i], logo, dateText);

      const canvas = await html2canvas(mount.firstElementChild as HTMLElement, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        imageTimeout: 0,
        removeContainer: true,
        windowWidth: DOC_WIDTH_PX,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg');
      let width = A4_WIDTH_MM;
      let height = (canvas.height / canvas.width) * width;
      if (height > A4_HEIGHT_MM) {
        height = A4_HEIGHT_MM;
        width = (canvas.width / canvas.height) * height;
      }

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', (A4_WIDTH_MM - width) / 2, 0, width, height);
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(host);
  }
}
