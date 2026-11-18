import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { elementToPdf } from '@/utils/pdfViewer';
import { API } from '@/api/api';
import { publicAPI } from '@/api/publicApi';
import useAuthStore from '@/store/useAuthStore';
import { getLocalized } from '@/utils/getLocalized';
import { paymentMethodLabel } from '@/utils/paymentMethod';
import { formatDate, formatTime } from '@/utils/date';
import { formatSum } from '@/api/preschool';
import { realNamePart } from '@/utils/personName';
import { normalizePaymentPeriod, periodLabel } from '@/utils/paymentPeriod';
import type { Payment } from '@/types/payment.types';
import logoChek from '../../assets/images/logo-chek.svg';
import naqsh from '../../assets/images/naqsh.svg';
import './chek.css';

export interface ChekData {
  id: number;
  /** QR kod imzosi (`/chek/{id}?sig=…`) — bo'sh bo'lsa QR imzosiz (eski) havola bo'ladi. */
  sig: string;
  fullName: string;
  branch: string;
  /** Kurs nomi; maktabga tayyorlov guruhida kurs yo'q — bo'sh (qator chiqmaydi). */
  course: string;
  group: string;
  /** To'lov oyi (`YYYY-MM`) — faqat maktabga tayyorlov to'lovida; aks holda bo'sh. */
  period: string;
  teacher: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  paymentTime: string;
  cashier: string;
}

export function buildChekData(p: Payment, lang: string): ChekData {
  // To'lov vaqti `created_at` dan (backend UTC beradi) — mahalliy vaqtga o'giriladi.
  const dateRaw = p.created_at ?? p.payment_date ?? '';
  const dateStr = formatDate(dateRaw);
  const timeStr = formatTime(dateRaw);

  // Ism qismlari: `------` kabi to'ldirgich «otasining ismi» chekda `A.-.Muydinov` bo'lib chiqmasin.
  const t = p.teacher;
  const first = realNamePart(t?.first_name);
  const middle = realNamePart(t?.middle_name);
  const last = realNamePart(t?.last_name);
  const teacher = `${first ? `${first[0]}.` : ''}${middle ? `${middle[0]}.` : ''}${last ?? ''}`.trim() || '—';

  // Maktabga tayyorlov to'lovi: `/payments` javobidagi `branch.type`; eski javobda (type yo'q) — kursi yo'qligidan.
  const branchType = (p.branch ?? p.student?.branch)?.type;
  const preschool = branchType ? branchType === 'preschool' : !p.course;

  return {
    id: p.id,
    sig: p.receipt_sig ?? '',
    fullName:
      p.student?.full_name ||
      `${p.student?.last_name ?? ''} ${p.student?.first_name ?? ''} ${p.student?.father_name ?? ''}`.trim() ||
      '—',
    branch: getLocalized(p.branch ?? p.student?.branch, 'name', lang),
    course: p.course ? getLocalized(p.course, 'name', lang) : preschool ? '' : '—',
    group: p.group?.name ?? '—',
    period: preschool ? (normalizePaymentPeriod(p.payment_period) ?? '') : '',
    teacher,
    amount: `${formatSum(p.amount)} so‘m`,
    paymentMethod: paymentMethodLabel(p.payment_method ?? p.payment_type),
    paymentDate: dateStr,
    paymentTime: timeStr,
    cashier: p.cashier?.full_name ?? p.cashier?.username ?? '—',
  };
}

function ChekSection({
  data,
  chekRef,
}: {
  data: ChekData;
  chekRef: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  // Imzoli havola kirmasdan ochiladi (faqat chek chiqadi); imzo bo'lmasa (eski backend) — eski havola.
  const qrUrl = `https://my.ilmplyus.uz/chek/${data.id}?${data.sig ? `sig=${encodeURIComponent(data.sig)}&` : ''}download=pdf`;

  return (
    <section className="chek" ref={chekRef}>
      <img src={logoChek} className="logo" alt="logo" />
      <img src={naqsh} className="naqsh" alt="" />
      <div className="chek-content">
        <div className="chek-row">
          <span>{t('payments.chek.fio')}:</span>
          <span>{data.fullName}</span>
        </div>
        <div className="chek-row">
          <span>{t('payments.chek.branch')}:</span>
          <span>{data.branch}</span>
        </div>
        {data.course && (
          <div className="chek-row">
            <span>{t('payments.chek.course')}:</span>
            <span>{data.course}</span>
          </div>
        )}
        <div className="chek-row">
          <span>{t('payments.chek.group')}:</span>
          <span>{data.group}</span>
        </div>
        {data.period && (
          <div className="chek-row">
            <span>{t('payments.chek.period')}:</span>
            <span>{periodLabel(data.period, t)}</span>
          </div>
        )}
        <div className="chek-row">
          <span>{t('payments.chek.teacher')}:</span>
          <span style={{ whiteSpace: 'pre-line' }}>{data.teacher}</span>
        </div>
        <div className="chek-row">
          <span>{t('payments.chek.amount')}:</span>
          <span>{data.amount}</span>
        </div>
        <div className="chek-row">
          <span>{t('payments.chek.paymentMethod')}:</span>
          <span>{data.paymentMethod}</span>
        </div>
        <div className="chek-row">
          <span>{t('payments.chek.paymentId')}:</span>
          <span>{data.id}</span>
        </div>
        <div className="chek-row date-row">
          <span>{t('payments.chek.paymentDate')}:</span>
          <span>{data.paymentDate}</span>
        </div>
        <div className="chek-row">
          <span>{t('payments.chek.paymentTime')}:</span>
          <span>{data.paymentTime}</span>
        </div>
        <div className="chek-row">
          <span>{t('payments.chek.cashier')}:</span>
          <span style={{ whiteSpace: 'pre-line' }}>{data.cashier}</span>
        </div>
      </div>
      <div className="chek-bottom">
        <h1>"ILMPLYUS O‘QUV" NTM</h1>
        <h1>STIR | 303451853</h1>
        <QRCodeCanvas
          value={qrUrl}
          size={353}
          className="qr-code"
          bgColor="#ffffff"
          fgColor="#000000"
        />
        <p>www.ilmplyus.uz</p>
      </div>
    </section>
  );
}

/** PDF'da chekning chap va o'ng tomonida qoladigan oq joy. */
const PDF_SIDE_PADDING_PX = 5;

/**
 * Ekranda chek `--chek-scale` bilan kichraytirilgan bo'lishi mumkin. html2canvas
 * elementni qanday ko'rinsa shunday oladi, shuning uchun surat olishdan oldin
 * masshtab vaqtincha 1 ga qaytariladi — PDF har doim to'liq o'lchamda chiqadi.
 */
function withoutPreviewScale<T>(element: HTMLElement | null, run: () => Promise<T>): Promise<T> {
  const wrapper = element?.closest<HTMLElement>('.chek-scale') ?? null;
  if (!wrapper) return run();

  const previous = wrapper.style.getPropertyValue('--chek-scale');
  wrapper.style.setProperty('--chek-scale', '1');

  return run().finally(() => {
    if (previous) wrapper.style.setProperty('--chek-scale', previous);
    else wrapper.style.removeProperty('--chek-scale');
  });
}

/**
 * CHOP ETISH: sahifa o'lchami chekning o'z balandligiga moslanadi.
 *
 * Nega kerak: Chrome `@page { size: 58mm auto }` ni QABUL QILMAYDI (noto'g'ri deklaratsiya sifatida tashlab yuboradi),
 * shunda sahifa o'lchamini ilovadagi boshqa global `@page` qoidasi (masalan oylik jadvalining `A4 landscape`i) belgilab,
 * chek yotiq A4 ga tushib qoladi. Termoprinterda (58mm) esa chek o'z kengligi va balandligida chiqishi kerak.
 * Shuning uchun chop etishdan oldin chekning bosib chiqarish ko'rinishidagi balandligi o'lchanadi va
 * `@page chek { size: 58mm {balandlik}mm }` vaqtincha qo'shiladi (chop etilgach olib tashlanadi).
 */
const PRINT_MEASURE_CLASS = 'chek-print-measure';

/** `@media print` ichidagi (chekka tegishli) uslublarni ekranda ham amal qiladigan, `.chek-print-measure` ostida turuvchi qoidalarga aylantiradi. */
function printRulesAsScreenCss(): string {
  const out: string[] = [];
  const visit = (rules: CSSRuleList, inPrint: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        visit(rule.cssRules, inPrint || rule.media.mediaText.trim() === 'print');
      } else if (inPrint && rule instanceof CSSStyleRule) {
        const selectors = rule.selectorText
          .split(',')
          .map((sel) => sel.trim())
          // `body:has(...)`, `html` kabi sahifa darajasidagi qoidalar o'lchash konteyneriga tegishli emas
          .filter((sel) => sel && !/^(html|body)\b/.test(sel) && !sel.includes(':has('))
          .map((sel) => `.${PRINT_MEASURE_CLASS} ${sel}`);
        if (selectors.length) out.push(`${selectors.join(',')}{${rule.style.cssText}}`);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules, false);
    } catch {
      /* boshqa domendagi uslub jadvali — o'qib bo'lmaydi, chekka tegishli emas */
    }
  }
  return out.join('\n');
}

/** Chekning bosib chiqarish ko'rinishidagi balandligi (mm); o'lchab bo'lmasa `null`. */
async function measurePrintHeightMm(chek: HTMLElement): Promise<number | null> {
  const style = document.createElement('style');
  style.textContent = printRulesAsScreenCss();
  const box = document.createElement('div');
  box.className = PRINT_MEASURE_CLASS;
  box.style.cssText = 'position:absolute;left:-10000px;top:0;width:58mm;pointer-events:none;';
  const clone = chek.cloneNode(true) as HTMLElement;
  box.appendChild(clone);
  document.head.appendChild(style);
  document.body.appendChild(box);
  try {
    await Promise.all(
      Array.from(clone.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)),
    );
    const px = clone.getBoundingClientRect().height;
    return px > 0 ? (px * 25.4) / 96 : null;
  } finally {
    box.remove();
    style.remove();
  }
}

/** Chop etishdan oldin `@page chek` o'lchamini qo'yadi; qaytgan funksiya uni olib tashlaydi. */
async function prepareChekPrintPage(chek: HTMLElement | null): Promise<() => void> {
  if (!chek) return () => undefined;
  let heightMm: number | null = null;
  try {
    heightMm = await measurePrintHeightMm(chek);
  } catch {
    heightMm = null;
  }
  if (!heightMm) return () => undefined;
  const style = document.createElement('style');
  // +3mm zaxira: o'lchash va haqiqiy chop etish orasidagi farq oxirgi qatorni keyingi sahifaga surib yubormasin.
  // Sahifa chetlari 0 (nomlangan `chek` sahifada ham, umumiy `@page` va birinchi sahifada ham): Chrome chetlar aniq berilganda
  // sarlavha/pastki yozuvni (sana, sahifa nomi, havola, «1/1») chiqarmaydi.
  style.textContent =
    `@page { margin: 0; } @page :first { margin: 0; } ` +
    `@page chek { size: 58mm ${(heightMm + 3).toFixed(1)}mm; margin: 0; }`;
  document.head.appendChild(style);
  return () => style.remove();
}

/** «Chop etish» tugmasi: sahifa o'lchamini moslab, so'ng brauzerning bosib chiqarish oynasini ochadi. */
async function printChek(chek: HTMLElement | null): Promise<void> {
  const cleanup = await prepareChekPrintPage(chek);
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

/** «PDF yuklash» tugmasi (va QR havoladagi `?download=pdf`): chek PDF fayl bo'lib yuklab olinadi. */
function useDownloadPDF(chekRef: React.RefObject<HTMLElement | null>, id: number | string) {
  return useCallback(async () => {
    if (!chekRef.current) return;
    const pdf = await withoutPreviewScale(chekRef.current, () =>
      elementToPdf(chekRef.current as HTMLElement, {
        sidePaddingPx: PDF_SIDE_PADDING_PX,
        // Telefonda oyna 660px chekdan tor — klonlangan hujjat chekni kesib qo'ymasin.
        windowWidth: Math.max(window.innerWidth, 700),
      }),
    );
    pdf.setProperties({ title: `Chek №${id}`, creator: 'ILM PLYUS' });
    pdf.save(`chek-${id}.pdf`);
  }, [chekRef, id]);
}

/**
 * Chek o'z tabiiy o'lchamida (660px kenglik, ~1500px balandlik) chiziladi — bu
 * chop etish va PDF uchun kerak, lekin ekranga sig'maydi. Shuning uchun ko'rish
 * uchun `transform: scale()` qo'llanadi: `transform` layout o'lchamini
 * o'zgartirmaydi, ya'ni o'lchash natijasi masshtabga bog'liq emas va qayta
 * hisoblash sikli yuzaga kelmaydi.
 */
function useFitScale(
  fitRef: React.RefObject<HTMLElement | null>,
  chekRef: React.RefObject<HTMLElement | null>,
) {
  const [{ scale, visualWidth }, setFit] = useState({ scale: 1, visualWidth: 0 });

  useLayoutEffect(() => {
    const fit = fitRef.current;
    const chek = chekRef.current;
    if (!fit || !chek) return;

    const measure = () => {
      const naturalWidth = chek.offsetWidth;
      const naturalHeight = chek.offsetHeight;
      if (!naturalWidth || !naturalHeight) return;

      const next = Math.min(1, fit.clientHeight / naturalHeight, fit.clientWidth / naturalWidth);
      setFit({ scale: next, visualWidth: naturalWidth * next });
    };

    measure();

    // Rasm (naqsh) kech yuklansa chek balandligi o'zgaradi, oyna o'lchami esa
    // mavjud joyni o'zgartiradi — ikkalasini ham kuzatamiz.
    const observer = new ResizeObserver(measure);
    observer.observe(fit);
    observer.observe(chek);

    return () => observer.disconnect();
  }, [fitRef, chekRef]);

  return { scale, visualWidth };
}

interface ChekProps {
  data: ChekData;
  onClose: () => void;
}

const Chek = ({ data, onClose }: ChekProps) => {
  const { t } = useTranslation();
  const chekRef = useRef<HTMLElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const { scale, visualWidth } = useFitScale(fitRef, chekRef);
  const downloadPDF = useDownloadPDF(chekRef, data.id);

  return createPortal(
    <div
      className="chek-modal-overlay"
      style={
        {
          '--chek-scale': scale,
          // Tugmalar qatori kichraytirilgan chek kengligiga tenglashadi.
          '--chek-visual-width': visualWidth ? `${Math.round(visualWidth)}px` : undefined,
        } as CSSProperties
      }
    >
      <div className="chek-modal-actions">
        <button className="chek-action-btn" onClick={() => void printChek(chekRef.current)}>
          <i className="fa-solid fa-print" /> {t('payments.chek.print')}
        </button>
        <button className="chek-action-btn" onClick={() => void downloadPDF()}>
          <i className="fa-solid fa-file-pdf" /> {t('payments.chek.downloadPdf')}
        </button>
        <button className="chek-action-btn chek-close-btn" onClick={onClose}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* `.chek-fit` — qolgan bo'sh joyni o'lchaydi, `.chek-scale` — o'sha joyga siqadi. */}
      <div className="chek-fit" ref={fitRef}>
        <div className="chek-scale">
          <ChekSection data={data} chekRef={chekRef} />
        </div>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Telefonda (QR skaner) chek ekran kengligiga sig'adi: 660px kenglikdagi chek `transform: scale()` bilan
 * kichraytiriladi, tashqi quti esa kichraygan o'lchamni egallaydi (pastda bo'sh joy qolmasin).
 */
function useWidthFit(chekRef: React.RefObject<HTMLElement | null>, ready: boolean) {
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 });

  useLayoutEffect(() => {
    const chek = chekRef.current;
    if (!ready || !chek) return;

    const measure = () => {
      const naturalWidth = chek.offsetWidth;
      const naturalHeight = chek.offsetHeight;
      if (!naturalWidth || !naturalHeight) return;
      const next = Math.min(1, (document.documentElement.clientWidth - 32) / naturalWidth);
      setFit({
        scale: next,
        width: Math.round(naturalWidth * next),
        height: Math.round(naturalHeight * next),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(chek);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [chekRef, ready]);

  return fit;
}

/**
 * QR koddagi chek sahifasi (`/chek/:id?sig=…`) — TIZIMGA KIRMASDAN ochiladi, faqat chek ko'rinadi.
 * Imzo (`sig`) bor bo'lsa chek ommaviy endpointdan olinadi (`/receipts/payment/{id}`); imzosiz (eski) havola esa
 * faqat tizimga kirgan xodim uchun — aks holda kirish sahifasiga yuboriladi.
 */
export const ChekDownloadPage = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const isAuth = useAuthStore((state) => state.isAuth);
  const chekRef = useRef<HTMLElement>(null);

  const sig = searchParams.get('sig') ?? '';
  const canLoad = !!id && (!!sig || isAuth);

  const { data: payment, isLoading } = useQuery<Payment>({
    queryKey: ['payment-chek', id, sig],
    queryFn: () =>
      (sig
        ? publicAPI.get(`/receipts/payment/${id}`, { params: { sig } })
        : API.get(`/payments/${id}`)
      ).then((r) => r.data),
    enabled: canLoad,
    // Noto'g'ri/eskirgan havola (404) qayta-qayta so'ralmasin; tarmoq xatosida esa qayta uriniladi.
    retry: (count, error) =>
      (error as { response?: { status?: number } })?.response?.status !== 404 && count < 2,
  });

  const downloadPDF = useDownloadPDF(chekRef, id ?? '');
  const fit = useWidthFit(chekRef, !!payment);

  useEffect(() => {
    if (payment && searchParams.get('download') === 'pdf') {
      const timer = setTimeout(() => void downloadPDF(), 800);
      return () => clearTimeout(timer);
    }
  }, [payment, searchParams, downloadPDF]);

  if (!sig && !isAuth) return <Navigate to="/login" replace />;
  if (isLoading) return <div className="chek-page-loading">{t('payments.chek.loading')}</div>;
  if (!payment) return <div className="chek-page-loading">{t('payments.chek.notFound')}</div>;

  const chekData = buildChekData(payment, i18n.language);

  return (
    <div className="chek-page">
      <div
        className="chek-page-actions"
        style={fit.width ? { width: Math.max(fit.width, 340) } : undefined}
      >
        <button className="chek-action-btn" onClick={() => void printChek(chekRef.current)}>
          <i className="fa-solid fa-print" /> {t('payments.chek.print')}
        </button>
        <button className="chek-action-btn" onClick={() => void downloadPDF()}>
          <i className="fa-solid fa-file-pdf" /> {t('payments.chek.downloadPdf')}
        </button>
      </div>
      <div
        className="chek-page-fit"
        style={fit.width ? { width: fit.width, height: fit.height } : undefined}
      >
        <div
          className="chek-scale chek-scale--page"
          style={{ '--chek-scale': fit.scale } as CSSProperties}
        >
          <ChekSection data={chekData} chekRef={chekRef} />
        </div>
      </div>
    </div>
  );
};

export default Chek;
