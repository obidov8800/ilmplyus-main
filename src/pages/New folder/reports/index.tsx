import { useTranslation } from 'react-i18next';

/**
 * «Hisobotlar» — bo'lim hali ishga tushmagan. Ilgari bu yerda bo'sh `<div>` edi:
 * yon menyudagi havola bosilganda foydalanuvchi butunlay bo'sh sahifani ko'rardi
 * va sahifa buzilganmi yoki yo'qmi bilolmasdi. Endi qisqa tushuntirish chiqadi.
 */
const Reports = () => {
  const { t } = useTranslation();

  return (
    <section className="reports-page container page-root">
      <div className="card" role="status" style={{ textAlign: 'center', padding: '56px 24px' }}>
        <i
          className="fa-solid fa-chart-line"
          aria-hidden="true"
          style={{ fontSize: 40, color: 'var(--color-accent)' }}
        />
        <p
          style={{
            marginTop: 16,
            fontFamily: 'noto-m, sans-serif',
            fontSize: 16,
            color: '#555',
          }}
        >
          {t('reports.comingSoon')}
        </p>
      </div>
    </section>
  );
};

export default Reports;
