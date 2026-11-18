import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { API } from '@/api/api';
import type { CoursePriceListResponse } from '@/types/course.types';
import Logo from '@/assets/images/logo-main-blue.svg';

import {
  fetchAllCoursePrices,
  buildPriceListSections,
  downloadPriceListPdf,
  formatPrice,
  formatUzDate,
} from './priceList';

import './priceListPage.css';

export default function PriceListPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);

  const { data } = useQuery<CoursePriceListResponse>({
    queryKey: ['course_prices_preview'],
    queryFn: () =>
      API.get('/course_prices', {
        params: {
          page: 1,
        },
      }).then((r) => r.data),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);

  const previewRows = useMemo(() => {
    return rows.filter((x) => (x.holat ?? x.status) === 'approved').slice(0, 10);
  }, [rows]);

  const branchName = useMemo(() => {
    if (!previewRows.length) return '';

    return previewRows[0].branch?.name_uz ?? '';
  }, [previewRows]);

  const dateText = useMemo(() => formatUzDate(new Date()), []);

  const handleDownload = async () => {
    try {
      setLoading(true);

      const allRows = await fetchAllCoursePrices();

      const sections = buildPriceListSections(allRows, i18n.language);

      await downloadPriceListPdf(
        sections,
        `PriceList-${new Date().toISOString().slice(0, 10)}.pdf`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="price-page">
      <div className="price-paper">
        <div className="price-top-line" />

        <div className="price-header">
          <img src={Logo} className="price-logo" alt="" />

          <div className="price-approve">
            <h3>"TASDIQLAYMAN"</h3>
            <p>"ILM PLYUS O'QUV" NTM</p>
            <strong>M.O'_____ G.B.Abdukarimova</strong> <br />
            <span>{new Date().toLocaleDateString('uz-UZ')}</span>
          </div>
        </div>

        <div className="price-divider" />

        <h1>
          "ILM PLYUS O'QUV" <br />
          NODAVLAT TA'LIM MUASSASASI <br />
          YANGI NARXNOMA
        </h1>

        <h2>"{branchName}"</h2>

        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>KURS NOMI</th>
              <th>DARAJASI</th>
              <th>NARXI</th>
            </tr>
          </thead>

          <tbody>
            {previewRows.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>

                <td>{item.course?.name_uz}</td>

                <td>{item.level?.name_uz}</td>

                <td className="price-color">{formatPrice(item.new_price)} so'm</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="price-footer">Narxlar {dateText} holatiga ko'ra</div>
      </div>

      <div className="price-actions">
        <button className="download-btn" disabled={loading} onClick={handleDownload}>
          {loading ? 'Yuklanmoqda...' : 'PDF yuklash'}
        </button>

        <button className="back-btn" onClick={() => navigate(-1)}>
          Orqaga
        </button>
      </div>
    </div>
  );
}
