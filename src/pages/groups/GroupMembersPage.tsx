import { groupDigits } from '@/utils/formatNumber';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchAllGroups, fetchGroupStudents } from './groups.service';
import type { GroupStudent } from '@/types/group.types';
import { sortByNewest } from '@/utils/sortByNewest';
import './groups.css';

/* ------------------------------------------------------------------ *
 * Guruh a'zolarining to'liq ma'lumotlari — alohida sahifa.
 *
 * Ilgari guruhlar ro'yxatida "max / bor" ustunini bosish `GroupLidsModal`ni
 * ochardi — u faqat lidlarni (Ism/Familiya/Telefon) ko'rsatardi. Endi shu
 * o'rniga shu sahifaga o'tiladi: haqiqiy o'quvchilar (`GroupStudent`,
 * `/students` dan guruh bo'yicha filtrlangan), balans va hisob holati
 * (aktiv/nofaol) hamda qarzdorlik bilan.
 *
 * Dizayn — guruhlar ro'yxati sahifasi (`groups.css` / `.groups-table`) bilan
 * bir xil, alohida uslub emas — shu sababli shu yerdagi CSS klasslari ham
 * o'sha fayldan olinadi (GroupStudentsPage'dagi imtihon oqimi uslubi emas).
 * ------------------------------------------------------------------ */

interface LocationState {
  groupName?: string;
}

function formatBalance(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "0 SO'M";
  return `${n.toLocaleString('ru-RU')} SO'M`;
}

function formatDebt(debt: number): string {
  return groupDigits(debt);
}

const GroupMembersPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const [search, setSearch] = useState('');

  // Guruhlar ro'yxatidan o'tilganda nomi state orqali keladi — qayta so'rov
  // shart emas. To'g'ridan-to'g'ri havola bilan kirilsa (yangilash, ulashish)
  // — ro'yxatdan qidiramiz.
  const stateGroupName = (location.state as LocationState | null)?.groupName;

  const { data: allGroups } = useQuery({
    queryKey: ['groups-all'],
    queryFn: fetchAllGroups,
    enabled: !stateGroupName && Number.isFinite(id),
  });

  const groupName =
    stateGroupName ?? allGroups?.find((g) => g.id === id)?.name?.toUpperCase() ?? '';

  const { data: studentsData, isLoading } = useQuery<GroupStudent[]>({
    queryKey: ['group-members', id],
    queryFn: () => fetchGroupStudents(id),
    enabled: Number.isFinite(id),
  });

  const students = useMemo(() => sortByNewest(studentsData ?? []), [studentsData]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.trim().toLowerCase();
    return students.filter((s) =>
      `${s.first_name} ${s.last_name} ${s.phone ?? ''} ${s.student_code ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [students, search]);

  return (
    <section className="groups container">
      <div className="groups-detail-header">
        <h1 className="groups-detail-title">
          {groupName} — {t('groups.members.titleSuffix')}
        </h1>
        <button className="groups-back-btn" type="button" onClick={() => navigate(-1)}>
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 8 }} />
          {t('groups.members.back')}
        </button>
      </div>

      <div className="groups-top">
        <div className="groups-top-right">
          <div className="groups-search">
            <svg
              className="groups-search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t('groups.students.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="groups-content">
        <div className="responsive-table-wrap">
        <table className="groups-table">
          <thead>
            <tr>
              <th>№</th>
              <th>{t('groups.students.colFish')}</th>
              <th>{t('groups.students.colAccountNumber')}</th>
              <th>{t('registrationModal.fields.phone')}</th>
              <th>{t('groups.members.colBalance')}</th>
              <th>{t('groups.members.colStatus')}</th>
              <th>{t('groups.students.colDebt')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="groups-table-loading">
                  {t('groups.students.loading')}
                </td>
              </tr>
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="groups-table-empty">
                  {t('groups.noData')}
                </td>
              </tr>
            ) : (
              filteredStudents.map((student, idx) => (
                <tr key={student.id}>
                  <td>{idx + 1}</td>
                  <td>
                    {student.first_name} {student.last_name}
                    {student.father_name ? ` ${student.father_name}` : ''}
                  </td>
                  <td>{student.student_code || '—'}</td>
                  <td>{student.phone || '-'}</td>
                  <td>{formatBalance(student.balance)}</td>
                  <td>
                    <span
                      className={`groups-status-badge ${student.is_active ? 'groups-status-badge--active' : 'groups-status-badge--inactive'}`}
                    >
                      {student.is_active
                        ? t('groups.members.statusActive')
                        : t('groups.members.statusInactive')}
                    </span>
                  </td>
                  <td>
                    {(student.debt ?? 0) > 0 ? (
                      <span className="groups-debt-amount">{formatDebt(student.debt ?? 0)}</span>
                    ) : (
                      <span className="groups-debt-none">{t('groups.students.noDebt')}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
        <div className="responsive-cards">
          {isLoading ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('groups.students.loading')}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('groups.noData')}
            </div>
          ) : (
            filteredStudents.map((student, idx) => (
              <div key={student.id} className="data-card">
                <div className="data-card__head">
                  <span className="data-card__title">
                    {idx + 1}. {student.first_name} {student.last_name}
                    {student.father_name ? ` ${student.father_name}` : ''}
                  </span>
                  <span
                    className={`groups-status-badge ${student.is_active ? 'groups-status-badge--active' : 'groups-status-badge--inactive'}`}
                  >
                    {student.is_active
                      ? t('groups.members.statusActive')
                      : t('groups.members.statusInactive')}
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">
                    {t('groups.students.colAccountNumber')}
                  </span>
                  <span className="data-card__value">{student.student_code || '—'}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">
                    {t('registrationModal.fields.phone')}
                  </span>
                  <span className="data-card__value">{student.phone || '-'}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('groups.members.colBalance')}</span>
                  <span className="data-card__value">{formatBalance(student.balance)}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('groups.students.colDebt')}</span>
                  <span className="data-card__value">
                    {(student.debt ?? 0) > 0 ? (
                      <span className="groups-debt-amount">
                        {formatDebt(student.debt ?? 0)}
                      </span>
                    ) : (
                      <span className="groups-debt-none">{t('groups.students.noDebt')}</span>
                    )}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default GroupMembersPage;
