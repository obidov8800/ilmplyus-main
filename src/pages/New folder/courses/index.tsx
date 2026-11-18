import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AddCourseModal from './AddCourseModal';
import CoursePriceHistoryModal from './CoursePriceHistoryModal';
import { API } from '@/api/api';
import { fetchAllPages } from '@/api/fetchAllPages';
import { getLocalized } from '@/utils/getLocalized';
import { useCreateMutation, useUpdateMutation } from '@/hooks/useMutations';
import type {
  CoursePrice,
  CoursesFilterState,
  CourseStatus,
  CourseStatusPayload,
  SaveCoursePayload,
} from '@/types/course.types';
import { EMPTY_COURSES_FILTER } from '@/types/course.types';
import { useTranslation } from 'react-i18next';
import { Protected } from '@/components/Protected';
import { Pagination } from '@/components/Pagination';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues, type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import FilterButton from '@/components/FilterButton';
import { useOptions, optionLabel } from '@/api/options';
import useAuthStore from '@/store/useAuthStore';
import { formatDateTime } from '@/utils/date';
import SortableTh from '@/components/SortableTh';
import { useTableSort, type TableSort } from '@/hooks/useTableSort';
import { notifications } from '@mantine/notifications';
import { StatusBadge, PctCell } from './courseShared';
import { STATUS_DISPLAY, formatNarx, groupKey, groupCoursePrices } from './courseFormat';
import './courses.css';
import { useNavigate } from 'react-router-dom';

type CoursesFilterKey = keyof CoursesFilterState & string;

function getLevelNames(levels: any[] | undefined, lang: string) {
  return levels?.map((l) => getLocalized(l, 'name', lang)).join(', ') ?? '';
}

function applyCoursesFilter(
  rows: CoursePrice[],
  f: CoursesFilterState,
  search: string,
  lang: string,
): CoursePrice[] {
  let result = rows;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (r) =>
        getLocalized(r.course, 'name', lang).toLowerCase().includes(q) ||
        getLevelNames(r.course.levels, lang).toLowerCase().includes(q) ||
        getLocalized(r.branch, 'name', lang).toLowerCase().includes(q),
    );
  }
  if (f.courseName.trim()) {
    const q = f.courseName.trim().toLowerCase();
    result = result.filter((r) => getLocalized(r.course, 'name', lang).toLowerCase().includes(q));
  }
  if (f.levelName.trim()) {
    const q = f.levelName.trim().toLowerCase();
    result = result.filter((r) => getLevelNames(r.course.levels, lang).toLowerCase().includes(q));
  }
  if (f.branchName.trim()) {
    const q = f.branchName.trim().toLowerCase();
    result = result.filter((r) => getLocalized(r.branch, 'name', lang).toLowerCase().includes(q));
  }
  if (f.dateFrom) {
    const from = new Date(f.dateFrom).getTime();
    result = result.filter((r) => new Date(r.created_at).getTime() >= from);
  }
  if (f.dateTo) {
    const to = new Date(f.dateTo).getTime() + 86399999;
    result = result.filter((r) => new Date(r.created_at).getTime() <= to);
  }
  return result;
}

/** Jadval ustidagi tablar — `all` dan tashqarisi `holat` bo'yicha filtrlaydi. */
type StatusTab = 'all' | CourseStatus;

const STATUS_TABS: { key: StatusTab; labelKey: string }[] = [
  { key: 'all', labelKey: 'course.tabs.all' },
  ...(Object.keys(STATUS_DISPLAY) as CourseStatus[]).map((key) => ({
    key: key as StatusTab,
    labelKey: STATUS_DISPLAY[key].labelKey,
  })),
];

interface StatusTabsProps {
  active: StatusTab;
  counts: Record<StatusTab, number>;
  onChange: (tab: StatusTab) => void;
}

function StatusTabs({ active, counts, onChange }: StatusTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="courses-tabs" role="tablist" aria-label="Holat bo‘yicha tablar">
      {STATUS_TABS.map(({ key, labelKey }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`courses-tab${active === key ? ' courses-tab--active' : ''}`}
          onClick={() => onChange(key)}
        >
          {t(labelKey)}
          <span className="courses-tab__count">{counts[key]}</span>
        </button>
      ))}
    </div>
  );
}

function LevelBadge({ name }: { name: string }) {
  return <span className="courses-level-badge">{name}</span>;
}

// Generic `PATCH /course_prices/{id}` body'dagi `status` ni e'tiborsiz qoldiradi
// (200 "Narx yangilandi" qaytaradi, lekin status eskiligicha qoladi) — har bir
// o'tish uchun shu id ga qo'shiladigan maxsus endpoint ishlatiladi.
const STATUS_ENDPOINT: Record<Exclude<CourseStatus, 'pending'>, string> = {
  submitted: 'submit-for-approval',
  approved: 'approve',
  rejected: 'reject',
  old_price: 'old-price',
};

/** So'rov muvaffaqiyatli, lekin backend statusni o'zgartirmagan holat. */
class StatusNotAppliedError extends Error {}

/** Eski yozuvlarda `cancelled` uchrashi mumkin — hammasi `rejected` ga keltiriladi. */
function normalizeStatus(status?: string | null): CourseStatus {
  if (status === 'cancelled') return 'rejected';
  return status && status in STATUS_DISPLAY ? (status as CourseStatus) : 'pending';
}

/** `"10000000.00"` → `10000000`. */
function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Status endpointi yozuvning barcha maydonlarini ham validatsiya qiladi
 * (`branch_id`, `course_id`, `level_id`, `new_price`, `lessons_count`,
 * `lesson_price`, `start_date` — bo'lmasa 422). Shu sababli payloadga joriy
 * qatorning to'liq qiymatlari + amalni kim/qachon bajargani qo'shib yuboriladi;
 * user id login qilgan foydalanuvchidan, vaqt client soatidan olinadi.
 */
function buildStatusPayload(
  row: CoursePrice,
  status: CourseStatus,
  userId?: number,
): CourseStatusPayload & Record<string, unknown> {
  const now = new Date().toISOString();

  const payload: CourseStatusPayload & Record<string, unknown> = {
    branch_id: row.branch_id ?? row.branch?.id,
    course_id: row.course_id ?? row.course?.id,
    level_id: row.level_id ?? row.level?.id ?? null,
    old_price: toNumber(row.old_price),
    new_price: toNumber(row.new_price),
    lessons_count: row.lessons_count,
    lesson_price: toNumber(row.lesson_price),
    percentage: row.percentage,
    start_date: row.start_date,
    comment: row.comment ?? '',
    status,
  };

  if (status === 'approved') {
    payload.approved_by = userId ?? null;
    payload.approved_at = now;
  } else if (status === 'rejected') {
    payload.rejected_by = userId ?? null;
    payload.rejected_at = now;
  } else {
    // submitted — yozuvni yaratgan/yuborayotgan operator.
    payload.created_by = row.created_by ?? userId ?? null;
  }

  return payload;
}

interface OperatorRowProps {
  row: CoursePrice;
  isSelected: boolean;
  onToggle: (id: number) => void;
  historyCount: number;
  onView: (row: CoursePrice) => void;
}

function OperatorRow({ row, isSelected, onToggle, historyCount, onView }: OperatorRowProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <tr className={`courses-table__row${isSelected ? ' courses-table__row--selected' : ''}`}>
      <td className="courses-table__td courses-table__td--cb">
        <input
          type="checkbox"
          className="courses-table__checkbox"
          checked={isSelected}
          onChange={() => onToggle(row.id)}
          aria-label={`${getLocalized(row.course, 'name', lang)} tanlash`}
        />
      </td>
      <td className="courses-table__td">{row.id}</td>
      <td className="courses-table__td">
        <span className="courses-table__course-name">{getLocalized(row.course, 'name', lang)}</span>
      </td>
      <td className="courses-table__td" data-label="Daraja">
        <LevelBadge name={getLocalized(row.level, 'name', lang)} />
      </td>
      {/* Eski/yangi narx endi alohida ustunlarda — qolgan tafsilot (dars
          soni, dars narxi, amal sanasi, yaratdi/tasdiqladi, izoh) "Ko'rish"
          modalida. */}
      <td className="courses-table__td courses-table__td--num" data-label={t('course.oldPrice')}>
        <span className="courses-table__price courses-table__price--old">
          {formatNarx(row.old_price)}
        </span>
      </td>
      <td className="courses-table__td courses-table__td--num" data-label={t('course.newPrice')}>
        <span className="courses-table__price courses-table__price--new">
          {formatNarx(row.new_price)}
        </span>
      </td>
      <td className="courses-table__td courses-table__td--num" data-label="O‘zgarish">
        <PctCell value={row.percentage} />
      </td>
      <td className="courses-table__td" data-label="Filial">
        {getLocalized(row.branch, 'name', lang)}
      </td>
      <td className="courses-table__td" data-label="Sana">
        {formatDateTime(row.created_at, '')}
      </td>
      <td className="courses-table__td" data-label="Holat">
        {row.holat && (
          <span title={row.holat === 'rejected' ? (row.rejection_reason ?? '') : undefined}>
            <StatusBadge status={row.holat} />
          </span>
        )}
      </td>
      <td className="courses-table__td courses-table__td--actions" data-label={t('course.actions')}>
        <div className="row-actions">
          <button
            type="button"
            className="row-action row-action--view"
            onClick={() => onView(row)}
            title={
              historyCount > 1
                ? t('course.viewHistoryCount', { count: historyCount })
                : t('course.viewHistory')
            }
          >
            <i className="fa-solid fa-eye" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface OperatorTableProps {
  rows: CoursePrice[];
  selectedIds: Set<number>;
  onToggleOne: (id: number) => void;
  onToggleAll: () => void;
  sort: TableSort<CoursePrice>;
  historyByGroup: Map<string, CoursePrice[]>;
  onView: (row: CoursePrice) => void;
}

function OperatorTable({
  rows,
  selectedIds,
  onToggleOne,
  onToggleAll,
  sort,
  historyByGroup,
  onView,
}: OperatorTableProps) {
  const { t } = useTranslation();
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someSelected = rows.some((r) => selectedIds.has(r.id)) && !allSelected;
  const cbRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (cbRef.current) cbRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className="courses-table-wrap">
      <table className="courses-table data-table" aria-label="Operator kurslari jadvali">
        <thead className="courses-table__head">
          <tr>
            <th className="courses-table__th courses-table__th--cb">
              <input
                ref={cbRef}
                type="checkbox"
                className="courses-table__checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label="Hammasini tanlash"
              />
            </th>
            <SortableTh className="courses-table__th" sortKey="id" sort={sort}>
              #
            </SortableTh>
            <th className="courses-table__th">{t('course.courseName')}</th>
            <th className="courses-table__th">{t('course.level')}</th>
            {/* Dars soni, amal sanasi, yaratdi/tasdiqladi — ixcham jadval
                o'rniga endi "Ko'rish" modalida to'liq holda. */}
            <th className="courses-table__th courses-table__th--num">{t('course.oldPrice')}</th>
            <th className="courses-table__th courses-table__th--num">{t('course.newPrice')}</th>
            <th className="courses-table__th courses-table__th--num">{t('course.change')}</th>
            <th className="courses-table__th">{t('course.branch')}</th>
            <th className="courses-table__th">{t('course.date')}</th>
            <th className="courses-table__th">{t('course.state')}</th>
            <th className="courses-table__th">{t('course.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <OperatorRow
              key={row.id}
              row={row}
              isSelected={selectedIds.has(row.id)}
              onToggle={onToggleOne}
              historyCount={historyByGroup.get(groupKey(row))?.length ?? 1}
              onView={onView}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Courses() {
  const { t, i18n } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const [currentPage, setCurrentPage] = useState(1);
  const [coursesPerPage, setCoursesPerPage] = useState(15);
  const [search, setSearch] = useState('');
  const [coursesFilter, setCoursesFilter] =
    useState<FilterBarValues<CoursesFilterKey>>(EMPTY_COURSES_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  // "Ko'rish" tugmasi bosilgan guruh kaliti — shu guruhning to'liq tarixi modalda ochiladi.
  const [historyGroupKey, setHistoryGroupKey] = useState<string | null>(null);

  // `/course_prices` `per_page`ni ham, filtrni ham qo'llamaydi — ilgari faqat
  // joriy sahifadagi ~15 qator filtrlanardi, tab sanoqlari ham noto'g'ri edi.
  // Endi barcha sahifalar bir marta olinib, filtr/tab/qidiruv + sahifalash
  // klient tomonda bajariladi.
  const {
    data: allRows = [],
    isLoading,
    isError,
  } = useQuery<CoursePrice[]>({
    queryKey: ['course_prices', 'all'],
    queryFn: () => fetchAllPages<CoursePrice>('/course_prices'),
  });

  const rawRows = allRows;

  const createMutation = useCreateMutation(
    (payload: SaveCoursePayload) => API.post('/course_prices', payload).then((r) => r.data),
    [['course_prices']],
  );

  const updateMutation = useUpdateMutation(
    (payload: SaveCoursePayload) =>
      API.put(`/course_prices/${payload.id}`, payload).then((r) => r.data),
    [['course_prices']],
  );

  const updateStatusMutation = useUpdateMutation<
    void,
    Error,
    { rows: CoursePrice[]; status: CourseStatus }
  >(
    async ({ rows, status }) => {
      const endpoint = STATUS_ENDPOINT[status as Exclude<CourseStatus, 'pending'>];
      if (!endpoint) throw new Error(`Noto'g'ri status: ${status}`);

      const results = await Promise.all(
        rows.map((row) =>
          API.patch(
            `/course_prices/${row.id}/${endpoint}`,
            buildStatusPayload(row, status, currentUser?.id),
          ).then((r) => r.data),
        ),
      );

      // Backend 200 qaytarib, statusni o'zgartirmasligi mumkin — javobdan status
      // o'qilsa va nishonga mos kelmasa, jim qolmay xato ko'tariladi.
      const ignored = results.filter((res) => {
        const returned = res?.data?.status ?? res?.status;
        return typeof returned === 'string' && normalizeStatus(returned) !== status;
      });
      if (ignored.length) throw new StatusNotAppliedError();
    },
    [['course_prices']],
  );

  const rows = useMemo<CoursePrice[]>(
    () => rawRows.map((item) => ({ ...item, holat: normalizeStatus(item.holat ?? item.status) })),
    [rawRows],
  );

  const filteredRows = useMemo(
    () => applyCoursesFilter(rows, coursesFilter, search, i18n.language),
    [rows, coursesFilter, search, i18n.language],
  );

  // Bir xil kurs+daraja+filial uchun bir nechta tarixiy yozuv bo'lishi mumkin
  // (`groupCoursePrices` izohiga qarang) — jadval faqat har guruhning bitta
  // dolzarb yozuvini ko'rsatadi, qolgani "Ko'rish" tugmasi orqali ochiladi.
  const { representativeRows, historyByGroup, oldPriceRows } = useMemo(
    () => groupCoursePrices(filteredRows),
    [filteredRows],
  );

  // "Barchasi" tabi — har guruhning dolzarb narxi + guruhda faol narx bo'lsa ham
  // ko'rinmay qoladigan barcha `old_price` (eski narx) yozuvlari. Aks holda eski
  // narxlar faqat alohida "Eski narx" tabida ko'rinardi.
  const allRowsForTab = useMemo(() => {
    const seen = new Set(representativeRows.map((r) => r.id));
    return [...representativeRows, ...oldPriceRows.filter((r) => !seen.has(r.id))];
  }, [representativeRows, oldPriceRows]);

  // Tab sanoqlari dedup qilingan (bitta guruh — bitta hisob) ro'yxat bo'yicha,
  // "Eski narx" esa bundan mustasno: `oldPriceRows` guruhda faol so'rov
  // bor-yo'qligidan qat'i nazar barcha `old_price` yozuvlarni o'z ichiga oladi
  // — aks holda faol narxi bor kurslarning eski narxlari hisobga kirmay qolardi.
  const tabCounts = useMemo(() => {
    const counts = {
      all: allRowsForTab.length,
      pending: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      old_price: oldPriceRows.length,
    } as Record<StatusTab, number>;
    representativeRows.forEach((r) => {
      const status = (r.holat ?? 'pending') as CourseStatus;
      if (status !== 'old_price' && status in counts) counts[status] += 1;
    });
    return counts;
  }, [representativeRows, oldPriceRows, allRowsForTab]);

  const visibleRows = useMemo(() => {
    if (statusTab === 'all') return allRowsForTab;
    if (statusTab === 'old_price') return oldPriceRows;
    return representativeRows.filter((r) => r.holat === statusTab);
  }, [representativeRows, oldPriceRows, allRowsForTab, statusTab]);

  // Default — eng oxirgi qo'shilgan narx tepada; ID ustuni bosilsa asc/desc.
  const sort = useTableSort<CoursePrice>(visibleRows);
  const displayedRows = sort.rows;

  const coursesTotal = displayedRows.length;
  const coursesLastPage = Math.max(1, Math.ceil(coursesTotal / coursesPerPage));
  const coursesPage = Math.min(currentPage, coursesLastPage);
  const pagedRows = displayedRows.slice(
    (coursesPage - 1) * coursesPerPage,
    coursesPage * coursesPerPage,
  );
  const coursesFrom = coursesTotal === 0 ? 0 : (coursesPage - 1) * coursesPerPage + 1;
  const coursesTo = Math.min(coursesPage * coursesPerPage, coursesTotal);

  // Tab almashsa, ko'rinmay qolgan qatorlarning tanlovi amallarga qo'shilib ketmasin.
  const handleTabChange = useCallback((tab: StatusTab) => {
    setStatusTab(tab);
    setSelectedIds(new Set());
    setCurrentPage(1);
  }, []);

  const { data: courseOptions = [] } = useOptions('courses');
  const { data: branchOptions = [] } = useOptions('branches');

  // Tanlangan kursning darajalari — kurs tanlanmaguncha daraja tanlab bo'lmaydi.
  const levelOptions = useMemo(() => {
    if (!coursesFilter.courseName) return [];
    return courseOptions.find((c) => c.label === coursesFilter.courseName)?.levels ?? [];
  }, [courseOptions, coursesFilter.courseName]);

  const filterFields: FilterBarField<CoursesFilterKey>[] = [
    {
      key: 'courseName',
      label: t('course.courseName'),
      placeholder: t('course.courseName'),
      options: courseOptions.map((c) => ({ value: c.label, label: c.label })),
    },
    {
      key: 'levelName',
      label: t('course.level'),
      placeholder: t('course.level'),
      disabled: !coursesFilter.courseName,
      options: levelOptions.map((l) => {
        const name = optionLabel(l, i18n.language);
        return { value: name, label: name };
      }),
    },
    {
      key: 'branchName',
      label: t('course.branch'),
      placeholder: t('course.branch'),
      options: branchOptions.map((b) => ({ value: b.label, label: b.label })),
    },
    { key: 'dateFrom', label: `${t('course.date')} ${t('course.from')}`, type: 'date' },
    { key: 'dateTo', label: `${t('course.date')} ${t('course.to')}`, type: 'date' },
  ];

  const activeFilterCount = countFilterBarValues(coursesFilter);

  const handleFiltersChange = useCallback((next: FilterBarValues<CoursesFilterKey>) => {
    setCurrentPage(1);
    setCoursesFilter((prev) => ({
      ...next,
      // Kurs almashsa, oldingi kursning darajasi tanlovda qolib ketmasin.
      levelName: next.courseName !== prev.courseName ? '' : next.levelName,
    }));
  }, []);

  const handleFiltersReset = useCallback(() => {
    setCurrentPage(1);
    setCoursesFilter(EMPTY_COURSES_FILTER);
  }, []);

  const handleSaveCourse = useCallback(
    (payload: SaveCoursePayload) => {
      // Faqat hali "Tasdiqlashga yuborish"ga chiqarilmagan (pending) qoralama
      // ustidan yoziladi. Boshqa holatdagi (submitted/approved/rejected/
      // old_price) mavjud yozuv ustidan yozilsa, tarix yo'qolib ketardi va
      // tasdiqlangan eski narx hech qachon "Eski narx"ga o'tmasdi — shu
      // sababli bunday holatda har doim YANGI yozuv yaratiladi.
      const existing = rows.find(
        (r) =>
          r.branch_id === payload.branch_id &&
          r.course_id === payload.course_id &&
          r.level_id === payload.level_id &&
          r.holat === 'pending',
      );

      if (existing) {
        updateMutation.mutate(
          {
            ...payload,
            id: existing.id,
            created_by: currentUser?.id ?? null,
          },
          {
            onSuccess: () => {
              setIsModalOpen(false);
            },
          },
        );
      } else {
        createMutation.mutate(
          {
            ...payload,
            created_by: currentUser?.id ?? null,
          },
          {
            onSuccess: () => {
              setIsModalOpen(false);
            },
          },
        );
      }
    },
    [rows, createMutation, updateMutation, currentUser],
  );

  // Prays-list: barcha sahifalardagi narxlardan faqat eng oxirgi tasdiqlanganlari olinadi
  // va to'g'ridan-to'g'ri PDF fayl sifatida yuklab olinadi (print oynasi ochilmaydi).
  // const handleDownloadPriceList = useCallback(async () => {
  //   setIsPriceListLoading(true);
  //   try {
  //     const allRows = await fetchAllCoursePrices();
  //     const cityByBranchId = Object.fromEntries(
  //       branchOptions.filter((b) => b.city).map((b) => [b.id, b.city as string]),
  //     );
  //     const sections = buildPriceListSections(allRows, i18n.language, cityByBranchId);

  //     if (!sections.length) {
  //       notifications.show({
  //         title: t('course.priceList'),
  //         message: t('course.priceListEmpty'),
  //         color: 'orange',
  //       });
  //       return;
  //     }

  //     await downloadPriceListPdf(sections, `prays-list-${dateToIso(new Date())}.pdf`);
  //   } catch {
  //     notifications.show({
  //       title: t('course.error'),
  //       message: t('course.priceListError'),
  //       color: 'red',
  //     });
  //   } finally {
  //     setIsPriceListLoading(false);
  //   }
  // }, [branchOptions, i18n.language, t]);

  const handleToggleOne = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSel = pagedRows.every((r) => prev.has(r.id));
      const next = new Set(prev);
      pagedRows.forEach((r) => (allSel ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  }, [pagedRows]);

  const handleViewHistory = useCallback((row: CoursePrice) => {
    setHistoryGroupKey(groupKey(row));
  }, []);

  const historyRows = historyGroupKey ? (historyByGroup.get(historyGroupKey) ?? []) : [];

  // pending = hali yuborilmagan (Tasdiqlashga yuborish kerak) — shu holat
  //           "Yangi narx" deb ko'rsatiladi, avtomatik indeksatsiya ham
  //           shu holatda qo'shadi (kim yaratgani bo'sh keladi)
  // submitted = yuborilgan, admin ko'rib chiqishi kerak
  // approved = tasdiqlangan
  const hasPendingSelected = useMemo(
    () => pagedRows.some((r) => selectedIds.has(r.id) && r.holat === 'pending'),
    [pagedRows, selectedIds],
  );

  const hasSubmittedSelected = useMemo(
    () => pagedRows.some((r) => selectedIds.has(r.id) && r.holat === 'submitted'),
    [pagedRows, selectedIds],
  );

  const showApproveRejectBtns = hasSubmittedSelected;

  /** Tanlangan qatorlardan `from` holatidagilarini `to` holatiga o'tkazadi. */
  const changeStatus = useCallback(
    (from: CourseStatus, to: CourseStatus) => {
      const selected = pagedRows.filter((r) => selectedIds.has(r.id) && r.holat === from);
      if (!selected.length) return;
      updateStatusMutation.mutate(
        { rows: selected, status: to },
        {
          // Muvaffaqiyatda toast chiqmaydi — jadvalning o'zi yangilanadi.
          onSuccess: () => setSelectedIds(new Set()),
          onError: (err) => {
            // Tarmoq/HTTP xatolarini API interceptori ko'rsatadi; bu yerda faqat
            // "200 qaytdi, lekin status o'zgarmadi" holati uchun xabar beriladi.
            if (!(err instanceof StatusNotAppliedError)) return;
            notifications.show({
              title: t('course.error'),
              message: t('course.statusNotChanged'),
              color: 'red',
            });
          },
        },
      );
    },
    [pagedRows, selectedIds, updateStatusMutation, t],
  );

  const handleSendApproval = useCallback(
    () => changeStatus('pending', 'submitted'),
    [changeStatus],
  );

  const handleApproveSelected = useCallback(
    () => changeStatus('submitted', 'approved'),
    [changeStatus],
  );

  const handleRejectSelected = useCallback(
    () => changeStatus('submitted', 'rejected'),
    [changeStatus],
  );

  const navigate = useNavigate();

  return (
    <section className="courses container">
      <div className="courses-top">
        <div className="courses-top-actions">
          {!showApproveRejectBtns && (
            <Protected permission="course_prices.submit_for_approval">
              <button
                type="button"
                className="courses-top__send-btn"
                onClick={handleSendApproval}
                disabled={!hasPendingSelected || updateStatusMutation.isPending}
                aria-label="Tasdiqlashga yuborish"
                title={
                  hasPendingSelected
                    ? undefined
                    : `${t('course.tabs.pending')} holatidagi qatorlarni belgilang`
                }
              >
                {updateStatusMutation.isPending ? t('course.savingBtn') : t('course.sendToConfirm')}
              </button>
            </Protected>
          )}
          {showApproveRejectBtns && (
            <>
              <Protected permission="course_prices.approve">
                <button
                  type="button"
                  className="courses-top__approve-btn"
                  onClick={handleApproveSelected}
                  disabled={!hasSubmittedSelected || updateStatusMutation.isPending}
                  aria-label="Tasdiqlash"
                >
                  {updateStatusMutation.isPending ? t('course.savingBtn') : t('course.confirm')}
                </button>
              </Protected>
              <Protected permission="course_prices.reject">
                <button
                  type="button"
                  className="courses-top__reject-btn"
                  onClick={handleRejectSelected}
                  disabled={!hasSubmittedSelected || updateStatusMutation.isPending}
                  aria-label="Rad etish"
                >
                  {updateStatusMutation.isPending ? t('course.savingBtn') : t('course.cancel')}
                </button>
              </Protected>
            </>
          )}
        </div>

        <div className="courses-top-right">
          <form
            className="courses-top__search"
            onSubmit={(e) => e.preventDefault()}
            role="search"
            aria-label={t('course.searchLabel')}
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              type="search"
              placeholder={t('course.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              aria-label={t('course.searchLabel')}
            />
          </form>
          <FilterButton
            onClick={() => setFilterOpen((v) => !v)}
            active={filterOpen || activeFilterCount > 0}
            expanded={filterOpen}
            count={activeFilterCount}
            label={t('course.filter')}
          />
          <Protected permission="course_prices.view">
            <button
              type="button"
              className="courses-top__pricelist-btn"
              onClick={() => navigate('/courses/price-list')}
            >
              <i className="fa-solid fa-file-pdf" />
              {t('course.priceList')}
            </button>
          </Protected>
          {/* Narx qo'shish — `POST /course_prices`, backend ruxsati `course_prices.create` (kurs yaratish `courses.create` EMAS:
              buxgalterga faqat narx qo'shish ruxsati berilganda tugma chiqmay qolardi). */}
          <Protected permission="course_prices.create">
            <button
              type="button"
              className="courses-top__add-btn"
              onClick={() => setIsModalOpen(true)}
              aria-label={t('course.addNewPrice')}
            >
              {t('course.add')}
            </button>
          </Protected>
        </div>
      </div>

      <div className="courses-content">
        <StatusTabs active={statusTab} counts={tabCounts} onChange={handleTabChange} />

        {filterOpen && (
          <FilterBar
            fields={filterFields}
            values={coursesFilter}
            onChange={handleFiltersChange}
            onReset={handleFiltersReset}
            onClose={() => setFilterOpen(false)}
          />
        )}

        {isLoading && (
          <div className="courses-loading" role="status" aria-live="polite">
            {t('course.loading')}...
          </div>
        )}

        {isError && (
          <div className="courses-error" role="alert">
            {t('course.error')}
          </div>
        )}

        {!isLoading && !isError && displayedRows.length === 0 && (
          <div className="courses-empty">{t('course.notFound')}</div>
        )}

        {!isLoading && !isError && displayedRows.length > 0 && (
          <OperatorTable
            rows={pagedRows}
            selectedIds={selectedIds}
            onToggleOne={handleToggleOne}
            onToggleAll={handleToggleAll}
            sort={sort}
            historyByGroup={historyByGroup}
            onView={handleViewHistory}
          />
        )}

        {!isLoading && !isError && coursesTotal > 0 && (
          <Pagination
            currentPage={coursesPage}
            lastPage={coursesLastPage}
            from={coursesFrom}
            to={coursesTo}
            total={coursesTotal}
            onPageChange={setCurrentPage}
            pageSize={coursesPerPage}
            onPageSizeChange={(size) => {
              setCoursesPerPage(size);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {isModalOpen && (
        <AddCourseModal
          coursePrices={rows}
          isSaving={createMutation.isPending || updateMutation.isPending}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveCourse}
        />
      )}

      {historyGroupKey && historyRows.length > 0 && (
        <CoursePriceHistoryModal
          rows={historyRows}
          lang={i18n.language}
          onClose={() => setHistoryGroupKey(null)}
        />
      )}
    </section>
  );
}
