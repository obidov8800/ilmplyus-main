import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptions } from '@/api/options';
import AttendanceTimeTable from './AttendanceTimeTable';
import AttendanceStatusTable from './AttendanceStatusTable';
import './attendanceTabs.css';

type AttendanceView = 'time' | 'status';

const Attendance = () => {
  const { t } = useTranslation();
  const [view, setView] = useState<AttendanceView>('time');
  // Bo'lim filtri: bo'sh qiymat = «Barcha bo'limlar» (standart). Ikkala ko'rinishga ham ta'sir qiladi.
  const [departmentId, setDepartmentId] = useState('');
  const { data: departments = [] } = useOptions('departments');

  // Filtr jadvalning to'q sarlavhasida, oy almashtirish tugmalaridan keyin chiqadi
  // (har jadval o'z sarlavhasiga qo'yadi), shuning uchun tugun shu yerda quriladi.
  const departmentFilter = (
    <select
      className="attendance-department-filter"
      value={departmentId}
      onChange={(e) => setDepartmentId(e.target.value)}
      aria-label={t('attendance.departmentFilter')}
    >
      <option value="">{t('attendance.allDepartments')}</option>
      {departments.map((d) => (
        <option key={d.id} value={String(d.id)}>
          {d.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="attendance-wrapper container">
      <div className="attendance-tabs">
        <button
          type="button"
          className={`attendance-tab ${view === 'time' ? 'active' : ''}`}
          onClick={() => setView('time')}
        >
          {t('attendance.tabs.time')}
        </button>
        <button
          type="button"
          className={`attendance-tab ${view === 'status' ? 'active' : ''}`}
          onClick={() => setView('status')}
        >
          {t('attendance.tabs.status')}
        </button>
      </div>

      {view === 'time' ? (
        <AttendanceTimeTable departmentId={departmentId} departmentFilter={departmentFilter} />
      ) : (
        <AttendanceStatusTable departmentId={departmentId} departmentFilter={departmentFilter} />
      )}
    </div>
  );
};

export default Attendance;
