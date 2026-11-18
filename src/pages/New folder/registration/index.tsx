import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EMPTY_FILTER } from '@/components/FilterDropdown/Filterdropdown.constants';
import type {
  FilterState,
  StudentGender,
} from '@/components/FilterDropdown/Filterdropdown.constants';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues } from '@/components/FilterBar/filterBar.utils';
import FilterButton from '@/components/FilterButton';
import { useOptions, optionLabel } from '@/api/options';
import { RegistrationModal } from '@/components/RegistrationModal';
import { DeleteConfirmationModal } from '@/components/RegistrationModal/DeleteConfirmModal';
import { fetchAllPages } from '@/api/fetchAllPages';
import { Pagination } from '@/components/Pagination';
import { sortByNewest } from '@/utils/sortByNewest';
import { parseServerDate, toTashkentDate } from '@/utils/date';
import type { Lid } from '@/types/lid.types';
import { getName, formatGender, getSourceKey, getSourceLabel } from '@/types/lid.types';
import './registration.css';
import { useTranslation } from 'react-i18next';
import { Protected } from '../../components/Protected';

type RegistrationFilterKey = 'source' | 'gender' | 'course' | 'level' | 'date';

type PageSize = 5 | 10 | 20 | 50 | 100 | 200 | 500;
const PAGE_SIZE_OPTIONS: PageSize[] = [5, 10, 20, 50, 100, 200, 500];

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${minutes} ${day}.${month}.${year}`;
}

function applyClientFilters(
  lids: Lid[],
  search: string,
  filters: FilterState,
  lang: string,
): Lid[] {
  const q = search.trim().toLowerCase();

  return lids.filter((s) => {
    const courseName = getName(s.course, lang);
    const groupName = getName(s.group, lang);
    const branchName = getName(s.branch, lang);
    const genderLabel = formatGender(s.gender) as StudentGender;

    if (q) {
      const fullName = `${s.first_name} ${s.last_name}`;
      const haystack =
        `${fullName} ${s.phone} ${courseName} ${groupName} ${branchName}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.sources.length > 0 && (!s.source_id || !filters.sources.includes(s.source_id)))
      return false;
    if (filters.genders.length > 0 && !filters.genders.includes(genderLabel)) return false;

    // Direction filtering (courses and levels)
    if (filters.courses.length > 0) {
      const isCourseSelected = s.course_id && filters.courses.includes(s.course_id);
      const isLevelSelected = s.level_id && filters.levels.includes(s.level_id);

      // If they selected a specific level, they MUST match that level
      if (filters.levels.length > 0) {
        if (!isLevelSelected) return false;
      } else {
        // If no levels selected but course is selected, they MUST match the course
        if (!isCourseSelected) return false;
      }
    } else if (filters.levels.length > 0) {
      // Just levels selected
      if (!s.level_id || !filters.levels.includes(s.level_id)) return false;
    }

    // Date filtering
    if (filters.date) {
      // Toshkent kalendari bo'yicha (UTC kuni emas) — tunda yaratilgan lid
      // oldingi kunga tushib qolmasin.
      const lidDate = parseServerDate(s.created_at) ?? new Date();
      if (toTashkentDate(lidDate) !== filters.date) return false;
    }

    return true;
  });
}

const Registration = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const { data: sources = [] } = useOptions('sources');
  const { data: courses = [] } = useOptions('courses');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<number | undefined>(undefined);

  // Ilgari server faqat bitta sahifani qaytarib, qidiruv/filtr o'sha sahifada
  // ishlardi — boshqa sahifadagi lid topilmasdi. Endi butun ro'yxat bir marta
  // olinadi, filtrlash + sahifalash klient tomonda.
  const { data: allLids = [], isLoading, isError } = useQuery<Lid[]>({
    queryKey: ['lids', 'all'],
    queryFn: () => fetchAllPages<Lid>('/lids'),
  });

  const filteredAll = useMemo(
    () => sortByNewest(applyClientFilters(allLids, search, filters, lang)),
    [allLids, search, filters, lang],
  );

  const total = filteredAll.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const filteredData = useMemo(
    () => filteredAll.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredAll, safePage, pageSize],
  );

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  }, []);

  // `applyClientFilters` ro'yxat bilan ishlaydi; saralash qatorida har maydondan
  // bittadan tanlanadi, shuning uchun bir elementli ro'yxatga o'giriladi.
  const filterValues: Record<RegistrationFilterKey, string> = {
    source: filters.sources[0] ? String(filters.sources[0]) : '',
    gender: filters.genders[0] ?? '',
    course: filters.courses[0] ? String(filters.courses[0]) : '',
    level: filters.levels[0] ? String(filters.levels[0]) : '',
    date: filters.date,
  };

  const levelOptions = useMemo(() => {
    if (!filterValues.course) return [];
    return courses.find((c) => c.id === Number(filterValues.course))?.levels ?? [];
  }, [courses, filterValues.course]);

  const filterFields: FilterBarField<RegistrationFilterKey>[] = [
    {
      key: 'source',
      label: t('filterDropdown.source'),
      placeholder: t('filterDropdown.source'),
      options: sources.map((s) => ({ value: s.id, label: s.label })),
    },
    {
      key: 'gender',
      label: t('filterDropdown.gender'),
      placeholder: t('filterDropdown.gender'),
      options: [
        { value: 'Erkak', label: t('registrationModal.gender.male') },
        { value: 'Ayol', label: t('registrationModal.gender.female') },
      ],
    },
    {
      key: 'course',
      label: t('filterDropdown.direction'),
      placeholder: t('filterDropdown.direction'),
      options: courses.map((c) => ({ value: c.id, label: c.label })),
    },
    {
      key: 'level',
      label: t('groups.filterLevel'),
      placeholder: t('groups.selectLevelOption'),
      disabled: !filterValues.course,
      options: levelOptions.map((l) => ({ value: l.id, label: optionLabel(l, lang) })),
    },
    {
      key: 'date',
      label: t('dashboard.date'),
      type: 'date',
    },
  ];

  const activeFilterCount = countFilterBarValues(filterValues);

  const handleFiltersChange = useCallback((next: Record<RegistrationFilterKey, string>) => {
    setFilters((prev) => {
      const prevCourse = prev.courses[0] ? String(prev.courses[0]) : '';
      // Kurs almashsa, oldingi kursning darajasi tanlovda qolib ketmasin.
      const level = next.course !== prevCourse ? '' : next.level;
      return {
        sources: next.source ? [Number(next.source)] : [],
        genders: next.gender ? [next.gender as StudentGender] : [],
        courses: next.course ? [Number(next.course)] : [],
        levels: level ? [Number(level)] : [],
        date: next.date,
      };
    });
    setCurrentPage(1);
  }, []);

  const handleFiltersReset = useCallback(() => {
    setFilters(EMPTY_FILTER);
    setCurrentPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size as PageSize);
    setCurrentPage(1);
  }, []);

  const handleOpenModal = useCallback(() => {
    setEditId(undefined);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditId(undefined);
  }, []);

  const handleOpenEdit = useCallback((id: number) => {
    setEditId(id);
    setIsModalOpen(true);
  }, []);

  const handleOpenDelete = useCallback((id: number) => {
    setDeleteId(id);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDeleteId(undefined);
  }, []);

  const startItem = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, total);
  const showPagination = total > 0;

  return (
    <>
      <section className="registration container">
        <div className="registration-top">
          <div className="registration-top__actions">
            <form
              className="registration-top__search"
              onSubmit={(e) => e.preventDefault()}
              role="search"
              aria-label={t('registration.searchFormAriaLabel')}
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                type="search"
                placeholder={t('registration.inputPlaceholder')}
                value={search}
                onChange={handleSearchChange}
                aria-label={t('registration.searchInputAriaLabel')}
              />
            </form>
            <FilterButton
              onClick={() => setFilterOpen((v) => !v)}
              active={filterOpen || activeFilterCount > 0}
              expanded={filterOpen}
              count={activeFilterCount}
            />
            <Protected permission="lids.create">
              <button
                type="button"
                className="registration-top__register-btn"
                onClick={handleOpenModal}
                aria-label={t('registration.registerAriaLabel')}
              >
                {t('registration.registerNew')}
              </button>
            </Protected>
          </div>
        </div>

        <div className="dashboard-bottom">
          {filterOpen && (
            <FilterBar
              fields={filterFields}
              values={filterValues}
              onChange={handleFiltersChange}
              onReset={handleFiltersReset}
              onClose={() => setFilterOpen(false)}
            />
          )}

          <div
            className="db-table-wrapper responsive-table-wrap"
            role="region"
            aria-label={t('registration.tableAriaLabel')}
            tabIndex={0}
          >
            <table className="db-table data-table">
              <thead>
                <tr>
                  <th scope="col">{t('dashboard.id')}</th>
                  <th scope="col">{t('dashboard.student')}</th>
                  <th scope="col">{t('dashboard.field')}</th>
                  <th scope="col">{t('dashboard.group')}</th>
                  <th scope="col">{t('dashboard.gender')}</th>
                  <th scope="col">{t('dashboard.branch')}</th>
                  <th scope="col">{t('dashboard.source')}</th>
                  <th scope="col">{t('dashboard.date')}</th>
                  <th scope="col">{t('dashboard.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="db-empty-state" aria-live="polite">
                      <div className="db-empty-state__inner">
                        <p>{t('dashboard.loading')}...</p>
                      </div>
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={9} className="db-empty-state" aria-live="polite">
                      <div className="db-empty-state__inner">
                        <p>{t('dashboard.error')}</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length > 0 ? (
                  filteredData.map((student: Lid) => {
                    const fullName = `${student.first_name} ${student.last_name}`;
                    return (
                      <tr key={student.id} className="db-table__row">
                        <td>
                          <span className="db-id-cell">{student.id}</span>
                        </td>
                        <td>
                          <div className="db-student-cell">
                            <div className="db-student-cell__avatar" aria-hidden="true">
                              {getInitials(student.first_name, student.last_name)}
                            </div>
                            <div className="db-student-cell__info">
                              <span className="db-student-cell__name">{fullName}</span>
                              <span className="db-student-cell__phone">{student.phone}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="db-direction-cell">
                            <span className="db-direction-cell__dot" aria-hidden="true" />
                            <span className="db-direction-cell__text">
                              {getName(student.course, lang)} {getName(student.level, lang)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="db-group-cell">{getName(student.group, lang)}</span>
                        </td>
                        <td>
                          <span className="db-gender-cell">{formatGender(student.gender)}</span>
                        </td>
                        <td>
                          <span className="db-branch-cell">{getName(student.branch, lang)}</span>
                        </td>
                        <td>
                          <span
                            className={`db-source-badge db-source-badge--${getSourceKey(student.source)}`}
                          >
                            {getSourceLabel(student.source, lang)}
                          </span>
                        </td>
                        <td>
                          <span className="db-date-cell">{formatDate(student.created_at)}</span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <Protected
                              permission="lids.edit"
                              scopePermissions={student.permissions}
                            >
                              <button
                                type="button"
                                className="row-action row-action--edit"
                                onClick={() => handleOpenEdit(student.id)}
                              >
                                <i className="fa-solid fa-pen" />
                              </button>
                            </Protected>
                            {/* `lids.edit` emas, `lids.delete` — arxivlash
                                aslida shu yozuvni o'chirish (soft-delete)
                                bilan bir xil amal, shuning uchun tahrirlash
                                emas, aynan shu ruxsat bilan boshqariladi.
                                Rollar bo'limida (`/roles`) shu ruxsat
                                berilmagan har qanday rolga tugma butunlay
                                ko'rinmaydi — admin allaqachon shu ruxsatga
                                ega. */}
                            <Protected permission="lids.delete">
                              <button
                                type="button"
                                className="row-action row-action--secondary"
                                aria-label={t('registration.archiveAriaLabel', { name: fullName })}
                                onClick={() => handleOpenDelete(student.id)}
                              >
                                <i className="fa-solid fa-box-archive" />
                              </button>
                            </Protected>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="db-empty-state" aria-live="polite">
                      <div className="db-empty-state__inner">
                        <i
                          className="fa-solid fa-magnifying-glass db-empty-state__icon"
                          aria-hidden="true"
                        />
                        <p>{t('registration.resultsNotFound')}</p>
                        <span>{t('registration.changeFilters')}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
          <div className="responsive-cards">
            {isLoading ? (
              <div className="data-card" style={{ textAlign: 'center' }}>
                {t('dashboard.loading')}...
              </div>
            ) : isError ? (
              <div className="data-card" style={{ textAlign: 'center' }}>
                {t('dashboard.error')}
              </div>
            ) : filteredData.length === 0 ? (
              <div className="data-card" style={{ textAlign: 'center' }}>
                {t('registration.resultsNotFound')}
              </div>
            ) : (
              filteredData.map((student: Lid) => {
                const fullName = `${student.first_name} ${student.last_name}`;
                return (
                  <div key={student.id} className="data-card">
                    <div className="data-card__head">
                      <span className="data-card__title">{fullName}</span>
                    </div>
                    <div className="data-card__actions">
                        <Protected
                          permission="lids.edit"
                          scopePermissions={student.permissions}
                        >
                          <button
                            type="button"
                            className="row-action row-action--edit"
                            onClick={() => handleOpenEdit(student.id)}
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                        </Protected>
                        <Protected permission="lids.delete">
                          <button
                            type="button"
                            className="row-action row-action--secondary"
                            aria-label={t('registration.archiveAriaLabel', { name: fullName })}
                            onClick={() => handleOpenDelete(student.id)}
                          >
                            <i className="fa-solid fa-box-archive" />
                          </button>
                        </Protected>
                      </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('dashboard.id')}</span>
                      <span className="data-card__value">{student.id}</span>
                    </div>
                    {student.phone && (
                      <div className="data-card__row">
                        <span className="data-card__label">
                          {t('registrationModal.phone', 'Telefon')}
                        </span>
                        <span className="data-card__value">{student.phone}</span>
                      </div>
                    )}
                    <div className="data-card__row">
                      <span className="data-card__label">{t('dashboard.field')}</span>
                      <span className="data-card__value">
                        {getName(student.course, lang)} {getName(student.level, lang)}
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('dashboard.group')}</span>
                      <span className="data-card__value">{getName(student.group, lang)}</span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('dashboard.gender')}</span>
                      <span className="data-card__value">{formatGender(student.gender)}</span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('dashboard.branch')}</span>
                      <span className="data-card__value">{getName(student.branch, lang)}</span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('dashboard.source')}</span>
                      <span className="data-card__value">
                        <span
                          className={`db-source-badge db-source-badge--${getSourceKey(student.source)}`}
                        >
                          {getSourceLabel(student.source, lang)}
                        </span>
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('dashboard.date')}</span>
                      <span className="data-card__value">{formatDate(student.created_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showPagination && (
            <Pagination
              currentPage={safePage}
              lastPage={totalPages}
              total={total}
              from={startItem}
              to={endItem}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          )}
        </div>
      </section>

      {isModalOpen && <RegistrationModal onClose={handleCloseModal} editId={editId} />}

      {deleteId != null && <DeleteConfirmationModal lidId={deleteId} onClose={handleCloseDelete} />}
    </>
  );
};

export default Registration;
