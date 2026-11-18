import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Group as MGroup, ActionIcon } from '@mantine/core';
import './groups.css';
import { useOptions, optionLabel, type Option } from '@/api/options';
import { deleteGroup } from './groups.service';
import { fetchAllPages } from '@/api/fetchAllPages';
import GroupFormModal from './GroupFormModal';
import TeacherGroups from './TeacherGroups';
import GroupStudentsPage from './GroupStudentsPage';
import GroupTestResultsPage from './GroupTestResultsPage';
import GroupNextStepPage from './GroupNextStepPage';
import { Protected } from '@/components/Protected';
import { Pagination } from '@/components/Pagination';
import FilterButton from '@/components/FilterButton';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues } from '@/components/FilterBar/filterBar.utils';
import { fetchLids } from '../lid/lid.service';
import { getLocalized } from '@/utils/getLocalized';
import SortableTh from '@/components/SortableTh';
import { useTableSort } from '@/hooks/useTableSort';
import type { Lid } from '@/types/lid.types';
import { useCanSeeAll } from '@/hooks/useCanSeeAll';
import { usePermission } from '@/hooks/usePermission';
import type { Group, GroupFilterState as FilterState } from '@/types/group.types';

const DAY_SHORT: Record<string, string> = {
  monday: 'Du',
  tuesday: 'Se',
  wednesday: 'Ch',
  thursday: 'Pa',
  friday: 'Ju',
  saturday: 'Sha',
};

function formatDays(days: string[], t: TFunction): string {
  return days
    ?.map((d) => t(`groups.days.${d}Short`, { defaultValue: DAY_SHORT[d] ?? d }))
    .join(', ');
}

// Ilgari server faqat bitta sahifani qaytarardi, filtr esa o'sha sahifada
// ishlab, "Jami" server jami bilan mos kelmasdi. Endi butun ro'yxat bir marta
// olinadi — filtr va sahifalash klient tomonda.
function useAllGroups() {
  return useQuery<Group[]>({
    queryKey: ['groups', 'list', 'all'],
    queryFn: () => fetchAllPages<Group>('/groups'),
  });
}


// function useGroupLevels(courseId: number | null) {
//   return useQuery<Level[]>({
//     queryKey: ["group-levels", courseId],
//     enabled: !!courseId,
//     queryFn: async () => {
//       const res = await API.get<{ data: Level[] }>("/levels", {
//         params: { course_id: courseId },
//       });
//       return Array.isArray(res.data) ? res.data : [];
//     },
//   });
// }

type GroupFilterKey = 'courseId' | 'levelId' | 'teacherId' | 'academicYearId';

const EMPTY_GROUP_FILTERS: Record<GroupFilterKey, string> = {
  courseId: '',
  levelId: '',
  teacherId: '',
  academicYearId: '',
};

interface GroupsFilterBarProps {
  filter: FilterState;
  setFilter: React.Dispatch<React.SetStateAction<FilterState>>;
  onClose: () => void;
  employees: Option[];
}

/** Jadval ustidagi saralash qatori — kurs, daraja (kursga bog'liq) va o'qituvchi. */
function GroupsFilterBar({ filter, setFilter, onClose, employees }: GroupsFilterBarProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: allCourses } = useOptions('courses');
  const { data: academicYears } = useOptions('academic_years');

  const courseLevels = useMemo(() => {
    if (!filter.courseId || !allCourses) return [];
    return allCourses.find((c) => c.id === Number(filter.courseId))?.levels ?? [];
  }, [filter.courseId, allCourses]);

  const fields: FilterBarField<GroupFilterKey>[] = [
    {
      key: 'courseId',
      label: t('groups.filterCourse'),
      placeholder: t('groups.selectCourseOption'),
      options: (allCourses ?? []).map((c) => ({ value: c.id, label: c.label })),
    },
    {
      key: 'levelId',
      label: t('groups.filterLevel'),
      placeholder: t('groups.selectLevelOption'),
      disabled: !filter.courseId,
      options: courseLevels.map((l) => ({ value: l.id, label: optionLabel(l, lang) })),
    },
    {
      key: 'teacherId',
      label: t('groups.filterTeacher'),
      placeholder: t('groups.selectTeacherOption'),
      options: employees.map((emp) => ({ value: emp.id, label: emp.label })),
    },
    // O'quv yillari faqat maktabga tayyorlov filiallarida ishlatiladi — yil yo'q bo'lsa maydon ko'rinmaydi.
    ...((academicYears ?? []).length > 0 || filter.academicYearId
      ? [
          {
            key: 'academicYearId' as const,
            label: t('groups.filterAcademicYear'),
            placeholder: t('groups.selectAcademicYearOption'),
            options: (academicYears ?? []).map((y) => ({ value: y.id, label: y.label })),
          },
        ]
      : []),
  ];

  const values: Record<GroupFilterKey, string> = {
    courseId: filter.courseId,
    levelId: filter.levelId,
    teacherId: filter.teacherId,
    academicYearId: filter.academicYearId,
  };

  // Kurs almashsa, oldingi kursning darajasi tanlovda qolib ketmasin.
  const handleChange = (next: Record<GroupFilterKey, string>) => {
    setFilter((prev) => ({
      ...prev,
      ...next,
      levelId: next.courseId !== prev.courseId ? '' : next.levelId,
    }));
  };

  return (
    <FilterBar
      fields={fields}
      values={values}
      onChange={handleChange}
      onReset={() => setFilter((prev) => ({ ...prev, ...EMPTY_GROUP_FILTERS }))}
      onClose={onClose}
      ariaLabel={t('groups.filterTitle')}
    />
  );
}

const Groups = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  type StudentsView = 'students' | 'results' | 'nextStep' | null;

  const [modalOpen, setModalOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [studentsGroupId, setStudentsGroupId] = useState<number | null>(null);
  const [studentsView, setStudentsView] = useState<StudentsView>(null);
  const [examSessionId, setExamSessionId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterState>({
    courseId: '',
    levelId: '',
    teacherId: '',
    academicYearId: '',
    search: '',
  });

  const activeFilterCount = countFilterBarValues({
    courseId: filter.courseId,
    levelId: filter.levelId,
    teacherId: filter.teacherId,
    academicYearId: filter.academicYearId,
  });

  // Filtr o'zgarsa 1-sahifaga qaytamiz — aks holda filtrlangan natija joriy
  // sahifadan kam bo'lsa bo'sh jadval ko'rinardi.
  const setFilterAndResetPage: typeof setFilter = (updater) => {
    setPage(1);
    setFilter(updater);
  };

  const { data: groups, isLoading } = useAllGroups();
  const { data: employees } = useOptions('employees');
  const queryClient = useQueryClient();

  // Guruhdagi lidlar soni — lidlar ro'yxatidan (faqat rolda «Lidlar» sahifasi bo'lsa: boshqa bo'lim so'rovi
  // ruxsatsiz yuborilmaydi). Yo'q bo'lsa — guruhning o'z `lids_count` maydoni (backend bersa).
  const canViewLids = usePermission('lids.view');
  const { data: allLidsData } = useQuery<Lid[]>({
    queryKey: ['all-lids'],
    queryFn: () => fetchLids({ page: 1, per_page: 1000 }),
    enabled: canViewLids,
  });

  const lidCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    if (Array.isArray(allLidsData)) {
      allLidsData.forEach((lid) => {
        if (lid.group_id) {
          counts[lid.group_id] = (counts[lid.group_id] || 0) + 1;
        }
      });
    }
    return counts;
  }, [allLidsData]);

  const studentsGroup = useMemo(
    () => (studentsGroupId ? (groups?.find((g) => g.id === studentsGroupId) ?? null) : null),
    [groups, studentsGroupId],
  );

  const deleteMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void deleteMutation;

  const matchedGroups = useMemo(() => {
    if (!groups) return [];

    return groups.filter((g) => {
      if (filter.courseId && g.course?.id !== Number(filter.courseId)) return false;

      if (filter.levelId && g.level?.id !== Number(filter.levelId)) return false;

      if (filter.teacherId && g.teacher?.id !== Number(filter.teacherId)) return false;

      if (
        filter.academicYearId &&
        (g.academic_year_id ?? g.academic_year?.id) !== Number(filter.academicYearId)
      )
        return false;

      if (filter.search && !g.name.toLowerCase().includes(filter.search.toLowerCase()))
        return false;

      return true;
    });
  }, [groups, filter]);

  // Default — eng oxirgi ochilgan guruh tepada; ID ustuni bosilsa asc/desc.
  const sort = useTableSort(matchedGroups);
  const sortedGroups = sort.rows;

  // «O'quv yili» ustuni faqat guruhlardan birortasi o'quv yiliga bog'langan bo'lsa chiqadi
  // (hozircha hamma filial oddiy — jadval o'zgarmaydi).
  const showAcademicYear = (groups ?? []).some((g) => g.academic_year_id != null);
  const columnCount = showAcademicYear ? 10 : 9;

  const groupsTotal = sortedGroups.length;
  const totalPages = Math.max(1, Math.ceil(groupsTotal / perPage));
  const safePage = Math.min(page, totalPages);
  const filteredGroups = sortedGroups.slice((safePage - 1) * perPage, safePage * perPage);

  function goToLastPage() {
    setPage(Math.max(1, Math.ceil((groupsTotal + 1) / perPage)));
  }

  return (
    <section className="groups container">
      {!studentsView && (
        <>
          <div className="groups-top">
            <div className="groups-top-right">
              <>
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
                    placeholder={t('groups.searchPlaceholder')}
                    value={filter.search}
                    onChange={(e) =>
                      setFilterAndResetPage((prev) => ({ ...prev, search: e.target.value }))
                    }
                  />
                </div>

                <FilterButton
                  onClick={() => setFilterOpen((v) => !v)}
                  active={filterOpen || activeFilterCount > 0}
                  expanded={filterOpen}
                  count={activeFilterCount}
                  label={t('groups.filterButton')}
                />

                <Protected permission="groups.create">
                  <button className="groups-add-btn" onClick={() => setModalOpen(true)}>
                    {t('groups.createGroupTitle')}
                  </button>
                </Protected>
              </>
            </div>
          </div>

          <div className="groups-content">
            {filterOpen && (
              <GroupsFilterBar
                filter={filter}
                setFilter={setFilterAndResetPage}
                onClose={() => setFilterOpen(false)}
                employees={employees ?? []}
              />
            )}
            <table className="groups-table">
              <thead>
                <tr>
                  <SortableTh sortKey="id" sort={sort}>
                    {t('groups.tableId')}
                  </SortableTh>
                  <th>{t('groups.tableGroupName')}</th>
                  {showAcademicYear && <th>{t('groups.academicYear')}</th>}
                  <th>{t('groups.tableCourse')}</th>
                  <th>{t('groups.tableLevel')}</th>
                  <th>{t('groups.tableDuration')}</th>
                  <th>{t('groups.tableStudentsCount')}</th>
                  <th>{t('groups.tableWeekDays')}</th>
                  <th>{t('groups.tableTeacher')}</th>
                  <th>{t('dashboard.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={columnCount} className="groups-table-loading">
                      {t('groups.loading')}
                    </td>
                  </tr>
                ) : !groups || groups.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="groups-table-empty">
                      {t('groups.noData')}
                    </td>
                  </tr>
                ) : (
                  filteredGroups?.map((group) => (
                    <tr key={group.id}>
                      <td>{group.id}</td>
                      <td>{group.name?.toUpperCase()}</td>
                      {showAcademicYear && <td>{group.academic_year?.name ?? '—'}</td>}
                      <td>{getLocalized(group.course, 'name', lang)}</td>
                      <td>{getLocalized(group.level, 'name', lang)}</td>
                      <td>
                        {group.duration} {t('groups.hours')}
                      </td>
                      <td
                        style={{ cursor: 'pointer', color: '#228be6', fontWeight: 500 }}
                        onClick={() =>
                          navigate(`/groups/${group.id}/members`, {
                            state: { groupName: group.name?.toUpperCase() },
                          })
                        }
                      >
                        {group.max_students} / {lidCounts[group.id] ?? (group as { lids_count?: number }).lids_count ?? 0}
                      </td>
                      <td>{formatDays(group.days, t)}</td>
                      <td>
                        {group.teacher
                          ? `${group.teacher.first_name} ${group.teacher.last_name}`
                          : '—'}
                      </td>
                      <td>
                        <MGroup gap="xs">
                          <Protected permission="tests.view">
                            <ActionIcon
                              variant="light"
                              color="green"
                              onClick={() => {
                                setStudentsGroupId(group.id);
                                setStudentsView('students');
                              }}
                            >
                              <i className="fa-solid fa-eye" />
                            </ActionIcon>
                          </Protected>
                          <Protected permission="groups.edit">
                            <ActionIcon
                              variant="light"
                              color="blue"
                              onClick={() => setEditingGroupId(group.id)}
                            >
                              <i className="fa-solid fa-pen" />
                            </ActionIcon>
                          </Protected>
                          {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                          <Protected permission="groups.delete">
                            <ActionIcon
                              variant="light"
                              color="red"
                              onClick={() => {
                                if (window.confirm(t('lid.modals.confirmDelete'))) {
                                  deleteMutation.mutate(group.id);
                                }
                              }}
                            >
                              <i className="fa-solid fa-trash" />
                            </ActionIcon>
                          </Protected>
                          */}
                        </MGroup>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Telefon ko'rinishi — 9 ustunli jadval o'rniga karta ro'yxati.
                `.groups-table` `@media (max-width: 768px)` da yashiriladi. */}
            <div className="groups-cards">
              {isLoading ? (
                <div className="groups-cards__msg">{t('groups.loading')}</div>
              ) : !groups || groups.length === 0 ? (
                <div className="groups-cards__msg">{t('groups.noData')}</div>
              ) : (
                <div className="data-cards">
                  {filteredGroups?.map((group) => (
                    <div key={group.id} className="data-card">
                      <div className="data-card__head">
                        <span className="data-card__title">{group.name?.toUpperCase()}</span>
                        <MGroup gap="xs">
                          <Protected permission="tests.view">
                            <ActionIcon
                              variant="light"
                              color="green"
                              onClick={() => {
                                setStudentsGroupId(group.id);
                                setStudentsView('students');
                              }}
                            >
                              <i className="fa-solid fa-eye" />
                            </ActionIcon>
                          </Protected>
                          <Protected permission="groups.edit">
                            <ActionIcon
                              variant="light"
                              color="blue"
                              onClick={() => setEditingGroupId(group.id)}
                            >
                              <i className="fa-solid fa-pen" />
                            </ActionIcon>
                          </Protected>
                        </MGroup>
                      </div>
                      {showAcademicYear && (
                        <div className="data-card__row">
                          <span className="data-card__label">{t('groups.academicYear')}</span>
                          <span className="data-card__value">{group.academic_year?.name ?? '—'}</span>
                        </div>
                      )}
                      <div className="data-card__row">
                        <span className="data-card__label">{t('groups.tableCourse')}</span>
                        <span className="data-card__value">
                          {getLocalized(group.course, 'name', lang)}
                        </span>
                      </div>
                      <div className="data-card__row">
                        <span className="data-card__label">{t('groups.tableLevel')}</span>
                        <span className="data-card__value">
                          {getLocalized(group.level, 'name', lang)}
                        </span>
                      </div>
                      <div className="data-card__row">
                        <span className="data-card__label">{t('groups.tableDuration')}</span>
                        <span className="data-card__value">
                          {group.duration} {t('groups.hours')}
                        </span>
                      </div>
                      <div className="data-card__row">
                        <span className="data-card__label">
                          {t('groups.tableStudentsCount')}
                        </span>
                        <span
                          className="data-card__value groups-cards__link"
                          onClick={() =>
                            navigate(`/groups/${group.id}/members`, {
                              state: { groupName: group.name?.toUpperCase() },
                            })
                          }
                        >
                          {group.max_students} / {lidCounts[group.id] ?? (group as { lids_count?: number }).lids_count ?? 0}
                        </span>
                      </div>
                      <div className="data-card__row">
                        <span className="data-card__label">{t('groups.tableWeekDays')}</span>
                        <span className="data-card__value">{formatDays(group.days, t)}</span>
                      </div>
                      <div className="data-card__row">
                        <span className="data-card__label">{t('groups.tableTeacher')}</span>
                        <span className="data-card__value">
                          {group.teacher
                            ? `${group.teacher.first_name} ${group.teacher.last_name}`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {groupsTotal > 0 && (
              <Pagination
                currentPage={safePage}
                lastPage={totalPages}
                total={groupsTotal}
                from={groupsTotal === 0 ? 0 : (safePage - 1) * perPage + 1}
                to={Math.min(safePage * perPage, groupsTotal)}
                onPageChange={setPage}
                pageSize={perPage}
                onPageSizeChange={(size) => {
                  setPerPage(size);
                  setPage(1);
                }}
              />
            )}
          </div>

          {(modalOpen || !!editingGroupId) && (
            <GroupFormModal
              onClose={() => {
                setModalOpen(false);
                setEditingGroupId(null);
              }}
              editingGroupId={editingGroupId}
              groups={groups ?? []}
              onCreated={goToLastPage}
            />
          )}
        </>
      )}

      {studentsView === 'students' && studentsGroup && (
        <GroupStudentsPage
          group={studentsGroup}
          onClose={() => {
            setStudentsView(null);
            setStudentsGroupId(null);
          }}
          onNext={(sessionId) => {
            setExamSessionId(sessionId);
            setStudentsView('results');
          }}
        />
      )}

      {studentsView === 'results' && studentsGroup && examSessionId && (
        <GroupTestResultsPage
          group={studentsGroup}
          sessionId={examSessionId}
          onClose={() => {
            setStudentsView(null);
            setStudentsGroupId(null);
            setExamSessionId(null);
          }}
          onNextStep={() => setStudentsView('nextStep')}
        />
      )}

      {studentsView === 'nextStep' && studentsGroup && (
        <GroupNextStepPage
          group={studentsGroup}
          onClose={() => setStudentsView('results')}
          onSaved={() => {
            setStudentsView(null);
            setStudentsGroupId(null);
            setExamSessionId(null);
          }}
        />
      )}
    </section>
  );
};

const GroupsPage = () => {
  /*
   * Guruh yarata oladigan foydalanuvchi — to'liq boshqaruv jadvali (barcha
   * guruhlar, filtrlar, «Guruh yaratish»). Qolganlar (sahifaga `groups.view`
   * bilan kirgan o'qituvchilar) — faqat O'ZIGA biriktirilgan guruhlar, kartalar
   * ko'rinishida.
   *
   * Ilgari bu tanlov rol NOMIga bog'liq edi (`role === 'teacher'` / `'o'qituvchi'`).
   * Backendda boshqacha nomlangan rol (masalan «Ustoz») berilganda o'qituvchi
   * `<Groups />` ga tushib, HAMMA guruhni ko'rib qolardi — shu tuzatildi.
   * Qaror yagona joyda — `canSeeAll('groups')` (`permissions/scope.ts`): hozir `groups.create`, backend B3 dan keyin
   * `groups.view_all`.
   */
  const seeAllGroups = useCanSeeAll('groups');

  return seeAllGroups ? <Groups /> : <TeacherGroups />;
};

export default GroupsPage;
