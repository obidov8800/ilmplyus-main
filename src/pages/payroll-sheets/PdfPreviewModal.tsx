import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/utils/date';
import { getApiErrorMessage } from '@/utils/apiError';
import { usePrintData } from './api';
import { formatMoney, formatPeriodLabel } from './helpers';
import { exportPayrollPdf } from './pdfExport';
import type { PrintRow, SheetType } from './types';
/*
 * Muhr rasmlari ilgari `public/`da (to'g'ridan-to'g'ri satr yo'l bilan)
 * turardi — bu ularni Vite'ning build quvuriga umuman kiritmasdi: build
 * qilinganda `dist/`ning ILDIZIGA (boshqa hamma rasm/JS/CSS kabi
 * `dist/assets/`ga emas) xeshsiz nusxalanardi. Endi oddiy `import` —
 * boshqa har qanday rasm kabi `dist/assets/`ga tarkib-xeshi bilan
 * chiqadi, shu bilan `.htaccess`dagi uzoq muddatli keshlash qoidasi ham
 * (faqat `assets/` yo'liga tegishli) ularga ham qo'llanadi.
 */
import stampSealImg from '@/assets/images/payroll-sheets/BRILLIANT EDUCATION 11.png';
import stampApprovedImg from '@/assets/images/payroll-sheets/Утверждено.png';

interface Props {
  sheetId: number;
  /** Galochka bilan tanlangan xodimlar; bo'sh bo'lsa backend barchasini beradi. */
  employeeIds: number[];
  departmentId?: string;
  /** Backend `type_label`ni doim kirillcha ("Аванс"/"Ойлик") beradi — hujjat
   * lotin yozuvida bo'lgani uchun shu maydon o'rniga shu prop orqali
   * lokalizatsiya qilingan nom ("Avans"/"Oylik") ishlatiladi. */
  type: SheetType;
  onClose: () => void;
}

/** Bitta bo'lim ustunlari yig'indisi — pastdagi "Jami" qatori uchun. */
function sumColumn(rows: PrintRow[], pick: (row: PrintRow) => number): number {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}

const STAMP_SEAL_SRC = stampSealImg;
const STAMP_APPROVED_SRC = stampApprovedImg;

/**
 * «PDF ko'rinishi» — ma'lumot `GET /payroll/sheets/{id}/print` dan keladi:
 * bo'limlar backendda majburiy ajratilgan va sarlavhalar ham tayyor.
 * Chop etishda har bir bo'lim alohida (albom yo'nalishli) varaqqa chiqadi.
 */
const PdfPreviewModal = ({ sheetId, employeeIds, departmentId, type, onClose }: Props) => {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = usePrintData(
    sheetId,
    { employee_ids: employeeIds, department_id: departmentId },
    true,
  );
  const sheetRefs = useRef<(HTMLElement | null)[]>([]);
  const [exporting, setExporting] = useState(false);

  const head = data?.sheet;
  const periodLabel = head?.period ? formatPeriodLabel(head.period, t) : '';
  const typeLabel = t(`payrollSheets.type.${type}`);
  /* Faqat shu vedomost turiga tegishli to'lov ustuni ko'rsatiladi — Avans
     PDFida Oylik ustunlari (yoki aksincha) chiqmasligi kerak. */
  const nonCashLabel = t('payrollSheets.columns.nonCash', { type: typeLabel });
  const cashLabel = t('payrollSheets.columns.cash', { type: typeLabel });
  const rowNonCash = (row: PrintRow) =>
    type === 'advance' ? row.advance_cashless : row.salary_cashless;
  const rowCash = (row: PrintRow) => (type === 'advance' ? row.advance_cash : row.salary_cash);
  const heading = head
    ? `${typeLabel} – ${periodLabel} – ${head.branch_name}`
    : t('payrollSheets.pdf.title');
  /* Xodimi yo'q (0 qator) bo'limlar uchun bo'sh sahifa chiqarilmaydi —
     backend filialning BARCHA bo'limlarini qaytaradi, ularning ba'zilarida
     shu vedomostda xodim bo'lmasligi mumkin. */
  const departments = (data?.departments ?? []).filter((group) => group.rows.length > 0);

  const handleExport = async () => {
    const elements = sheetRefs.current.filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    setExporting(true);
    try {
      const parts = [typeLabel, head?.period, head?.branch_name].filter(Boolean);
      const filename = `${parts.join('_').replace(/\s+/g, '-')}.pdf`;
      await exportPayrollPdf(elements, filename);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div
        className="ps-modal ps-modal--pdf"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ps-modal-head">
          <h2>
            {t('payrollSheets.pdf.title')} — {heading}
          </h2>
          <button
            className="ps-modal-close"
            type="button"
            onClick={onClose}
            aria-label={t('modalPattern.close')}
          >
            ×
          </button>
        </div>

        <div className="ps-modal-body ps-pdf-scroll">
          {isLoading ? (
            <p className="ps-empty">{t('payrollSheets.loading')}</p>
          ) : isError ? (
            <p className="ps-empty">{getApiErrorMessage(error, t('payrollSheets.loadError'))}</p>
          ) : (
            <div className="ps-pdf">
              {departments.length === 0 ? (
                <p className="ps-empty">{t('payrollSheets.noData')}</p>
              ) : (
                departments.map((group, index) => {
                  const totals = {
                    oklad: sumColumn(group.rows, (r) => r.oklad),
                    non_cash: sumColumn(group.rows, rowNonCash),
                    cash: sumColumn(group.rows, rowCash),
                    income_tax: sumColumn(group.rows, (r) => r.income_tax_amount),
                    pension_fund: sumColumn(group.rows, (r) => r.pension_fund_amount),
                    total_payout: sumColumn(group.rows, (r) => r.total_payout),
                  };

                  const sectionHeading = head
                    ? `${typeLabel} – ${periodLabel} – ${head.branch_name}${
                        group.department_name ? ` – ${group.department_name}` : ''
                      }`
                    : group.title;

                  return (
                    <section
                      className="ps-pdf-sheet"
                      key={group.department_name}
                      ref={(el) => {
                        sheetRefs.current[index] = el;
                      }}
                    >
                      <h3 className="ps-pdf-heading">{sectionHeading}</h3>

                      <table className="ps-pdf-table">
                        <thead>
                          <tr>
                            <th>№</th>
                            <th style={{ textAlign: 'left' }}>{t('payrollSheets.columns.fullName')}</th>
                            <th>{t('payrollSheets.columns.position')}</th>
                            <th className="ps-num">{t('payrollSheets.columns.oklad')}</th>
                            <th className="ps-num">{nonCashLabel}</th>
                            <th className="ps-num">{cashLabel}</th>
                            <th className="ps-num">{t('payrollSheets.columns.incomeTax')}</th>
                            <th className="ps-num">{t('payrollSheets.columns.pensionTax')}</th>
                            <th className="ps-num">{t('payrollSheets.columns.total')}</th>
                            <th className="ps-col-signature" style={{ width: 100, minWidth: 100 }}>
                              {t('payrollSheets.pdf.signature')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr key={`${group.department_name}-${row.no}`}>
                              <td>{row.no}</td>
                              <td style={{ textAlign: 'left' }}>{row.employee_name}</td>
                              <td>{row.position_name}</td>
                              <td className="ps-num">{formatMoney(row.oklad)}</td>
                              <td className="ps-num">{formatMoney(rowNonCash(row))}</td>
                              <td className="ps-num">{formatMoney(rowCash(row))}</td>
                              <td className="ps-num">{formatMoney(row.income_tax_amount)}</td>
                              <td className="ps-num">{formatMoney(row.pension_fund_amount)}</td>
                              <td className="ps-num ps-strong">{formatMoney(row.total_payout)}</td>
                              <td className="ps-col-signature" style={{ width: 100, minWidth: 100 }}>
                                {row.signature ?? ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3}>{t('payrollSheets.total')}</td>
                            <td className="ps-num">{formatMoney(totals.oklad)}</td>
                            <td className="ps-num">{formatMoney(totals.non_cash)}</td>
                            <td className="ps-num">{formatMoney(totals.cash)}</td>
                            <td className="ps-num">{formatMoney(totals.income_tax)}</td>
                            <td className="ps-num">{formatMoney(totals.pension_fund)}</td>
                            <td className="ps-num ps-strong">{formatMoney(totals.total_payout)}</td>
                            <td className="ps-col-signature" style={{ width: 100, minWidth: 100 }} />
                          </tr>
                        </tfoot>
                      </table>

                      <div className="ps-pdf-footer">
                        <div className="ps-pdf-footer-info">
                          <div className="ps-pdf-footer-date">
                            {formatDate(head?.approved_at)}
                          </div>
                          <div className="ps-pdf-footer-line">
                            {t('payrollSheets.pdf.director')}:{' '}
                            <strong>{head?.director_name ?? '—'}</strong>
                          </div>
                          <div className="ps-pdf-footer-line">
                            {t('payrollSheets.pdf.accountant')}: <strong>Ikromjonov Sardorbek</strong>
                          </div>
                        </div>

                        <div className="ps-pdf-footer-stamps">
                          <img
                            src={STAMP_SEAL_SRC}
                            alt={t('payrollSheets.pdf.stampSealPlaceholder')}
                            className="ps-pdf-stamp ps-pdf-stamp-seal"
                          />
                          <img
                            src={STAMP_APPROVED_SRC}
                            alt={t('payrollSheets.pdf.stampApprovedPlaceholder')}
                            className="ps-pdf-stamp ps-pdf-stamp-approved"
                          />
                        </div>
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="ps-modal-foot">
          <button className="ps-btn ps-btn--ghost" type="button" onClick={onClose}>
            {t('payrollSheets.pdf.close')}
          </button>
          <button
            className="ps-btn ps-btn--primary"
            type="button"
            disabled={isLoading || isError || exporting || departments.length === 0}
            onClick={handleExport}
          >
            {exporting ? (
              <i className="fa-solid fa-spinner fa-spin" />
            ) : (
              <i className="fa-solid fa-download" />
            )}{' '}
            {exporting ? t('payrollSheets.pdf.downloading') : t('payrollSheets.pdf.download')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfPreviewModal;
