import { groupDigits } from '@/utils/formatNumber';
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API } from '@/api/api';
import './groupStudents.css';
import type { Group } from '@/types/group.types';
import type { EligibleStudent } from '@/types/exam.types';
import { formatDate } from '@/utils/date';
import { getLocalized } from '@/utils/getLocalized';
import { useDragScroll } from '@/hooks/useDragScroll';
import DateInput from '@/components/DateInput';

interface GroupTestResultsPageProps {
  group: Group;
  sessionId: number;
  onClose: () => void;
  onNextStep: () => void;
}

interface SessionInfo {
  test?: { name: string; questions_count?: number; time_limit?: number; pass_percentage?: number };
  exam_date?: string;
  start_time?: string;
  end_time?: string;
  min_attendance_pct?: number;
  check_debt?: boolean;
}

interface EligibleStudentsResponse {
  session: SessionInfo;
  students: EligibleStudent[];
}

interface RetakeModalProps {
  studentName: string;
  attemptId: number;
  onClose: () => void;
  onConfirm: (attemptId: number, retakeDate: string, retakeNote: string) => void;
  isPending: boolean;
}

function RetakeModal({ studentName, attemptId, onClose, onConfirm, isPending }: RetakeModalProps) {
  const { t } = useTranslation();
  const [retakeDate, setRetakeDate] = useState('');
  const [retakeNote, setRetakeNote] = useState('');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 28,
          minWidth: 360,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>
          {t('groups.testResults.retakeTitle')}
        </h3>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 18px' }}>{studentName}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t('groups.testResults.retakeDate')} <span style={{ color: 'red' }}>*</span>
            </label>
            <DateInput
              value={retakeDate}
              onChange={(e) => setRetakeDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t('groups.testResults.retakeNote')}
            </label>
            <input
              type="text"
              value={retakeNote}
              placeholder={t('groups.testResults.retakePlaceholder')}
              onChange={(e) => setRetakeNote(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="gs-btn-secondary" onClick={onClose}>
            {t('groups.testResults.retakeCancel')}
          </button>
          <button
            className="gs-btn-primary"
            disabled={!retakeDate || isPending}
            onClick={() => onConfirm(attemptId, retakeDate, retakeNote)}
          >
            {isPending
              ? t('groups.testResults.retakeSaving')
              : t('groups.testResults.retakeConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

const GroupTestResultsPage = ({
  group,
  sessionId,
  onClose,
  onNextStep,
}: GroupTestResultsPageProps) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { ref: tableScrollRef, onMouseDown: onTableScrollMouseDown } =
    useDragScroll<HTMLDivElement>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [retakeTarget, setRetakeTarget] = useState<{ attemptId: number; name: string } | null>(
    null,
  );

  const { data, isLoading } = useQuery<EligibleStudentsResponse>({
    queryKey: ['exam-session-eligible', sessionId],
    queryFn: async () => {
      const res = await API.get<EligibleStudentsResponse>(
        `/exam-sessions/${sessionId}/eligible-students`,
      );
      return res.data;
    },
    enabled: !!sessionId,
  });

  const retakeMutation = useMutation({
    mutationFn: ({
      attemptId,
      retakeDate,
      retakeNote,
    }: {
      attemptId: number;
      retakeDate: string;
      retakeNote: string;
    }) =>
      API.post(`/exam-attempts/${attemptId}/grant-retake`, {
        retake_date: retakeDate,
        retake_note: retakeNote,
      }),
    onSuccess: () => {
      setRetakeTarget(null);
      queryClient.invalidateQueries({ queryKey: ['exam-session-eligible', sessionId] });
    },
  });

  const session = data?.session;
  const students = useMemo(() => data?.students ?? [], [data?.students]);

  const stats = useMemo(
    () => ({
      total: students.length,
      eligible: students.filter((s) => s.is_eligible).length,
      submitted: students.filter(
        (s) => s.attempt_status === 'submitted' || s.attempt_status === 'timed_out',
      ).length,
      passed: students.filter((s) => s.is_passed === true).length,
      failed: students.filter((s) => s.attempt_status != null && s.is_passed === false).length,
      not_submitted: students.filter((s) => s.attempt_status == null && s.is_eligible).length,
    }),
    [students],
  );

  const filteredStudents = useMemo(() => {
    let list = students;
    if (statusFilter === 'eligible') list = list.filter((s) => s.is_eligible);
    else if (statusFilter === 'not_eligible') list = list.filter((s) => !s.is_eligible);
    else if (statusFilter === 'passed') list = list.filter((s) => s.is_passed === true);
    else if (statusFilter === 'failed')
      list = list.filter((s) => s.attempt_status != null && s.is_passed === false);
    else if (statusFilter === 'not_submitted') list = list.filter((s) => s.attempt_status == null);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.full_name.toLowerCase().includes(q));
    }
    return list;
  }, [students, search, statusFilter]);

  function getAttemptBadge(s: EligibleStudent) {
    if (!s.is_eligible) {
      const reason =
        s.ineligible_reason === 'has_debt'
          ? t('groups.testResults.debtorLabel')
          : t('groups.testResults.attendanceLow');
      return <span className="gs-badge gs-badge--not-permitted">{reason}</span>;
    }
    if (s.attempt_status == null)
      return (
        <span className="gs-badge" style={{ background: '#f0f0f0', color: '#777' }}>
          {t('groups.testResults.statusNotSubmitted')}
        </span>
      );
    if (s.is_passed === true)
      return (
        <span className="gs-badge gs-badge--permitted">{t('groups.testResults.statusPassed')}</span>
      );
    if (s.is_passed === false)
      return (
        <span className="gs-badge gs-badge--not-permitted">
          {t('groups.testResults.statusFailed')}
        </span>
      );
    return (
      <span className="gs-badge" style={{ background: '#e8f4fd', color: '#1971c2' }}>
        {t('groups.testResults.inProcess')}
      </span>
    );
  }

  function formatBalance(balance?: string): string {
    if (!balance) return '—';
    const num = parseFloat(balance);
    if (isNaN(num) || num === 0) return '—';
    return groupDigits(num, 0);
  }

  function getResultLabel(s: EligibleStudent): string {
    if (!s.is_eligible)
      return s.ineligible_reason === 'has_debt'
        ? t('groups.testResults.debtorLabel')
        : t('groups.testResults.attendanceLow');
    if (s.attempt_status == null) return t('groups.testResults.statusNotSubmitted');
    if (s.is_passed === true) return t('groups.testResults.statusPassed');
    if (s.is_passed === false) return t('groups.testResults.statusFailed');
    return t('groups.testResults.inProcess');
  }

  const downloadPdf = useCallback(async () => {
    const [{ jsPDF }, html2canvasModule] = await Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ]);
    const html2canvas = html2canvasModule.default;

    const div = document.createElement('div');
    div.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;background:#fff;padding:24px;width:760px;font-family:noto-m;';

    div.innerHTML = `
      <h2 style="margin:0 0 6px;font-size:15px;color:#003366;">${group.name} — Test natijalari</h2>
      <p style="margin:0 0 16px;font-size:12px;color:#777;">${session?.test?.name ?? ''} | ${formatDate(session?.exam_date)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#003366;color:#fff;">
            <th style="padding:9px 14px;text-align:left;width:50px;">ID</th>
            <th style="padding:9px 14px;text-align:left;">F.I.Sh</th>
            <th style="padding:9px 14px;text-align:left;width:130px;">Test natijasi</th>
          </tr>
        </thead>
        <tbody>
          ${students
            .map(
              (s, idx) => `
            <tr style="border-bottom:1px solid #eee;background:${idx % 2 === 1 ? '#f9f9f9' : '#fff'};">
              <td style="padding:8px 14px;">${idx + 1}</td>
              <td style="padding:8px 14px;">${s.full_name}</td>
              <td style="padding:8px 14px;">${getResultLabel(s)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;

    document.body.appendChild(div);
    try {
      const canvas = await html2canvas(div, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      let posY = 10;
      let remaining = imgH;
      let page = 0;
      while (remaining > 0) {
        if (page > 0) pdf.addPage();
        const sliceH = Math.min(remaining, pageH - 20);
        pdf.addImage(imgData, 'PNG', 10, posY, imgW, imgH);
        remaining -= sliceH;
        posY -= sliceH;
        page++;
      }
      pdf.save(`${group.name}-test-natijalari.pdf`);
    } finally {
      document.body.removeChild(div);
    }
  }, [students, group, session]);

  return (
    <div className="gs-page-view">
      <div className="gs-top-bar">
        <button className="gs-btn-primary" onClick={onNextStep}>
          <i className="fa-solid fa-arrow-right" style={{ marginRight: 8 }} />
          {t('groups.testResults.nextStep', { defaultValue: 'Keyingi bosqichga o‘tkazish' })}
        </button>
        <button className="gs-btn-secondary" onClick={downloadPdf}>
          <i className="fa-solid fa-file-pdf" style={{ marginRight: 8 }} />
          {t('groups.testResults.downloadPdf', { defaultValue: 'PDF yuklash' })}
        </button>
        <button className="gs-btn-close" onClick={onClose}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Test info */}
      <div className="gs-section">
        <div className="gs-section-header">
          <div className="gs-section-title">
            <i className="fa-solid fa-circle-info" />
            {t('groups.testResults.testInfo', { defaultValue: "TEST MA'LUMOTLARI" })}
          </div>
        </div>

        {isLoading ? (
          <div className="gs-table-loading">
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
            {t('groups.testResults.loading', { defaultValue: 'Yuklanmoqda...' })}
          </div>
        ) : (
          <>
            <div className="gtr-info-grid">
              <div className="gtr-info-item">
                <span className="gtr-info-label">{t('groups.testResults.testName')}</span>
                <span className="gtr-info-value">{session?.test?.name ?? '—'}</span>
              </div>
              <div className="gtr-info-item">
                <span className="gtr-info-label">{t('groups.testResults.group')}</span>
                <span className="gtr-info-value">{group.name}</span>
              </div>
              <div className="gtr-info-item">
                <span className="gtr-info-label">{t('groups.testResults.course')}</span>
                <span className="gtr-info-value">{getLocalized(group.course, 'name', lang)}</span>
              </div>
              <div className="gtr-info-item">
                <span className="gtr-info-label">{t('groups.testResults.level')}</span>
                <span className="gtr-info-value">{getLocalized(group.level, 'name', lang)}</span>
              </div>
              <div className="gtr-info-item">
                <span className="gtr-info-label">{t('groups.testResults.date')}</span>
                <span className="gtr-info-value">{formatDate(session?.exam_date)}</span>
              </div>
              <div className="gtr-info-item">
                <span className="gtr-info-label">{t('groups.testResults.time')}</span>
                <span className="gtr-info-value">
                  {session?.start_time?.slice(0, 5) ?? '—'} –{' '}
                  {session?.end_time?.slice(0, 5) ?? '—'}
                </span>
              </div>
              <div className="gtr-info-item">
                <span className="gtr-info-label">{t('groups.testResults.questionsCount')}</span>
                <span className="gtr-info-value">
                  {session?.test?.questions_count != null
                    ? `${session.test.questions_count}ta`
                    : '—'}
                </span>
              </div>
              <div className="gtr-info-item">
                <span className="gtr-info-label">{t('groups.testResults.timeLimit')}</span>
                <span className="gtr-info-value">
                  {session?.test?.time_limit != null ? `${session.test.time_limit} min` : '—'}
                </span>
              </div>
            </div>

            <div className="gtr-stats">
              <div className="gtr-stat-card">
                <span className="gtr-stat-value">{stats.total}</span>
                <span className="gtr-stat-label">{t('groups.testResults.totalStudents')}</span>
              </div>
              <div className="gtr-stat-card">
                <span className="gtr-stat-value">{stats.eligible}</span>
                <span className="gtr-stat-label">{t('groups.testResults.eligible')}</span>
              </div>
              <div className="gtr-stat-card">
                <span className="gtr-stat-value">{stats.passed}</span>
                <span className="gtr-stat-label">{t('groups.testResults.passed')}</span>
              </div>
              <div className="gtr-stat-card">
                <span className="gtr-stat-value">{stats.failed}</span>
                <span className="gtr-stat-label">{t('groups.testResults.failed')}</span>
              </div>
              <div className="gtr-stat-card">
                <span className="gtr-stat-value">{stats.not_submitted}</span>
                <span className="gtr-stat-label">{t('groups.testResults.notSubmitted')}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Students table */}
      <div className="gs-section">
        <div className="gs-section-header">
          <div className="gs-section-title">
            <i className="fa-solid fa-circle-info" />
            {t('groups.testResults.studentsListTitle')}
          </div>
        </div>

        <div className="gs-table-toolbar">
          <div className="gs-search-wrap">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              className="gs-search-input"
              type="text"
              placeholder={t('groups.students.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="gs-filter-select-wrap">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('groups.students.filterAll')}</option>
              <option value="eligible">{t('groups.testResults.permitted')}</option>
              <option value="not_eligible">{t('groups.testResults.notPermitted')}</option>
              <option value="passed">{t('groups.testResults.statusPassed')}</option>
              <option value="failed">{t('groups.testResults.statusFailed')}</option>
              <option value="not_submitted">{t('groups.testResults.statusNotSubmitted')}</option>
            </select>
            <i className="fa-solid fa-chevron-down" />
          </div>
        </div>

        <div
          className="gs-table-wrap responsive-table-wrap"
          ref={tableScrollRef}
          onMouseDown={onTableScrollMouseDown}
        >
          <table className="gs-table">
            <thead>
              <tr>
                <th>№</th>
                <th>{t('groups.testResults.colFish')}</th>
                <th>{t('groups.testResults.colAttendance')}</th>
                <th>{t('groups.testResults.colDebt')}</th>
                <th>{t('groups.testResults.colResult')}</th>
                <th>{t('groups.testResults.colDecision')}</th>
                <th>{t('groups.testResults.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="gs-table-loading">
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    {t('groups.testResults.loading')}
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="gs-table-empty">
                    {t('groups.testResults.noData')}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => {
                  const canRetake =
                    s.attempt_id != null &&
                    s.attempt_status != null &&
                    s.is_passed === false &&
                    s.decision !== 'retake';
                  return (
                    <tr key={s.student_id}>
                      <td>{idx + 1}</td>
                      <td>{s.full_name}</td>
                      <td>
                        <span
                          style={{
                            color: s.attendance_pct < 70 ? '#e03131' : '#2f9e44',
                            fontWeight: 600,
                          }}
                        >
                          {Math.min(s.attendance_pct, 100)}%
                        </span>
                      </td>
                      <td>
                        {s.has_debt ? (
                          <span style={{ color: '#e03131', fontWeight: 600, fontSize: 13 }}>
                            {formatBalance(s.balance)}
                          </span>
                        ) : formatBalance(s.balance) !== '—' ? (
                          <span style={{ color: '#2f9e44', fontWeight: 600, fontSize: 13 }}>
                            {formatBalance(s.balance)}
                          </span>
                        ) : (
                          <span style={{ color: '#777', fontSize: 13 }}>—</span>
                        )}
                      </td>
                      <td>{getAttemptBadge(s)}</td>
                      <td>
                        {s.decision === 'retake' ? (
                          <span style={{ fontSize: 12, color: '#1971c2' }}>
                            {t('groups.testResults.retakeDecision')} {formatDate(s.retake_date)}
                          </span>
                        ) : s.decision ? (
                          <span style={{ fontSize: 12 }}>{s.decision}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {canRetake ? (
                          <button
                            className="gs-btn-secondary"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() =>
                              setRetakeTarget({ attemptId: s.attempt_id!, name: s.full_name })
                            }
                          >
                            {t('groups.testResults.retakeBtn')}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
        <div className="responsive-cards">
          {isLoading ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('groups.testResults.loading')}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('groups.testResults.noData')}
            </div>
          ) : (
            filteredStudents.map((s, idx) => {
              const canRetake =
                s.attempt_id != null &&
                s.attempt_status != null &&
                s.is_passed === false &&
                s.decision !== 'retake';
              return (
                <div key={s.student_id} className="data-card">
                  <div className="data-card__head">
                    <span className="data-card__title">
                      {idx + 1}. {s.full_name}
                    </span>
                    {getAttemptBadge(s)}
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">
                      {t('groups.testResults.colAttendance')}
                    </span>
                    <span
                      className="data-card__value"
                      style={{
                        color: s.attendance_pct < 70 ? '#e03131' : '#2f9e44',
                        fontWeight: 600,
                      }}
                    >
                      {Math.min(s.attendance_pct, 100)}%
                    </span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">
                      {t('groups.testResults.colDebt')}
                    </span>
                    <span className="data-card__value">{formatBalance(s.balance)}</span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">
                      {t('groups.testResults.colDecision')}
                    </span>
                    <span className="data-card__value">
                      {s.decision === 'retake'
                        ? `${t('groups.testResults.retakeDecision')} ${formatDate(s.retake_date)}`
                        : s.decision || '—'}
                    </span>
                  </div>
                  {canRetake && (
                    <div className="data-card__actions">
                      <button
                        className="gs-btn-secondary"
                        style={{ fontSize: 12, padding: '6px 14px' }}
                        onClick={() =>
                          setRetakeTarget({ attemptId: s.attempt_id!, name: s.full_name })
                        }
                      >
                        {t('groups.testResults.retakeBtn')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {retakeTarget && (
        <RetakeModal
          studentName={retakeTarget.name}
          attemptId={retakeTarget.attemptId}
          onClose={() => setRetakeTarget(null)}
          isPending={retakeMutation.isPending}
          onConfirm={(attemptId, retakeDate, retakeNote) =>
            retakeMutation.mutate({ attemptId, retakeDate, retakeNote })
          }
        />
      )}
    </div>
  );
};

export default GroupTestResultsPage;
