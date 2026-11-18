import { useCallback, memo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import type { Lid } from '@/types/lid.types';
import { formatGender } from '@/types/lid.types';
import LeadCard from './LidCard';
import FilterDropdown from '@/components/FilterDropdown';
import type {
  FilterState,
  StudentGender,
} from '@/components/FilterDropdown/Filterdropdown.constants';
import { fetchLidsByStatus, fetchAllLidsByStatus } from '@/pages/lid/lid.service';
import { usePermission } from '@/hooks/usePermission';
import { WriteGuard } from '@/components/Protected';
import { parseServerDate, toTashkentDate } from '@/utils/date';

export interface Column {
  id: number;
  title: string;
  color: string;
  groupId: number;
}

interface LeadColumnProps {
  column: Column;
  /** Provide only for columns that should NOT self-fetch (e.g. status 9 archived) */
  leads?: Lid[];
  filter: FilterState;
  isLastSection?: boolean;
  onDrop: (columnId: number) => void;
  onDragStart: (lead: Lid) => void;
  onFilterChange: (columnId: number, filter: FilterState) => void;
  onLeadClick: (lead: Lid) => void;
  onAddClick: (columnId: number) => void;
  onTitleClick?: (columnId: number) => void;
}

function LeadColumn({
  column,
  leads: externalLeads,
  filter,
  isLastSection,
  onDrop,
  onDragStart,
  onFilterChange,
  onLeadClick,
  onAddClick,
  onTitleClick,
}: LeadColumnProps) {
  const { t } = useTranslation();
  // Ro'yxatga olish sahifasida "Yangi LID qo'shish" `lids.create`ga
  // bog'langan (`Protected` orqali) — bu doskadagi "+" tugmasi esa avval
  // hech qanday ruxsatga tekshirilmasdan RegistrationModal'ni ochardi,
  // ya'ni faqat `lids.view`i bor xodim ham shu yerdan LID yarata olardi.
  const canCreateLid = usePermission('lids.create');

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const selfFetch = externalLeads === undefined;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const trimmedSearch = debouncedSearch.trim();
  const isSearching = trimmedSearch !== '';

  // Oddiy ko'rinish: infinite-scroll, 10 tadan (qidiruv YO'Q holatda).
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['lids', 'status', column.id],
    queryFn: ({ pageParam }) =>
      fetchLidsByStatus({ status: column.id, page: pageParam as number, per_page: 10 }),
    getNextPageParam: (lastPage) =>
      lastPage.current_page < lastPage.last_page ? lastPage.current_page + 1 : undefined,
    initialPageParam: 1,
    enabled: selfFetch && !isSearching,
  });

  // Qidiruv: TEKSHIRILGAN — backend `/lids?search=`ni e'tiborsiz qoldiradi
  // (natija filtrsiz bilan bir xil chiqadi), shuning uchun serverga
  // tayanib bo'lmaydi. Shu ustundagi HOLAT bo'yicha butun ro'yxat bir
  // marta (`fetchAllLidsByStatus`) olib kelinadi va pastda nomi/raqami
  // bo'yicha mahalliy filtrlanadi — natijada 121 ta lid bo'lsa ham
  // HAMMASI qidiriladi, faqat hozircha yuklangan 10-20 tasi emas.
  const { data: fullList, isFetching: isFullListFetching } = useQuery({
    queryKey: ['lids', 'status-full', column.id],
    queryFn: () => fetchAllLidsByStatus(column.id),
    enabled: selfFetch && isSearching,
    staleTime: 60_000,
  });

  const rawLeads: Lid[] = !selfFetch
    ? (externalLeads ?? [])
    : isSearching
      ? (fullList ?? [])
      : (infiniteData?.pages.flatMap((p) => p.data) ?? []);

  const totalCount = selfFetch
    ? (infiniteData?.pages[0]?.total ?? fullList?.length ?? 0)
    : (externalLeads?.length ?? 0);

  const isBusy = selfFetch && isSearching && isFullListFetching;

  // Qolgan filtrlar (manba/jins/kurs/daraja/sana) va matnli qidiruv —
  // ikkalasi ham shu bosqichda, yuklangan (yoki qidiruvda — TO'LIQ)
  // ro'yxat ustida ishlaydi.
  const filteredLeads = rawLeads.filter((l) => {
    const genderLabel = formatGender(l.gender) as StudentGender;

    if (filter.sources.length > 0 && (!l.source_id || !filter.sources.includes(l.source_id)))
      return false;
    if (filter.genders.length > 0 && !filter.genders.includes(genderLabel)) return false;

    if (filter.courses.length > 0) {
      const isCourseSelected = l.course_id && filter.courses.includes(l.course_id);
      const isLevelSelected = l.level_id && filter.levels.includes(l.level_id);
      if (filter.levels.length > 0) {
        if (!isLevelSelected) return false;
      } else {
        if (!isCourseSelected) return false;
      }
    } else if (filter.levels.length > 0) {
      if (!l.level_id || !filter.levels.includes(l.level_id)) return false;
    }

    if (filter.date) {
      // Lid yaratilgan KUN — Toshkent kalendari bo'yicha. Ilgari UTC kuni olinardi:
      // tunda (00:00–05:00) yaratilgan lid oldingi kunga tushib, sana filtrida
      // topilmasdi (onlayn lidlar ko'pincha aynan tunda keladi).
      const lidDate = parseServerDate(l.created_at) ?? new Date();
      if (toTashkentDate(lidDate) !== filter.date) return false;
    }

    if (isSearching) {
      const q = trimmedSearch.toLowerCase();
      const full = `${l.first_name} ${l.last_name} ${l.phone ?? ''}`.toLowerCase();
      if (!full.includes(q)) return false;
    }

    return true;
  });

  // Infinite scroll: load more when near bottom (qidiruvda YO'Q — to'liq
  // ro'yxat allaqachon mahalliyda).
  const handleScroll = useCallback(() => {
    if (!bodyRef.current || !selfFetch || isSearching || !hasNextPage || isFetchingNextPage)
      return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 60) {
      fetchNextPage();
    }
  }, [selfFetch, isSearching, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    // Debounce (350ms) kutib o'tirmasdan darhol oddiy ro'yxatga qaytadi.
    setDebouncedSearch('');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(() => {
    onDrop(column.id);
  }, [onDrop, column.id]);

  const handleFilterChange = useCallback(
    (newFilter: FilterState) => {
      onFilterChange(column.id, newFilter);
    },
    [column.id, onFilterChange],
  );

  const HIDDEN_GROUP_ID = 4;
  const isRightmost = column.id === 8 || column.id === 10;
  // `align="left"` panelni CHAP chetidan boshlab O'NGGA (`fd-panel--left`,
  // `left:0`) o'stiradi; `align="right"` esa O'NG chetidan CHAPGA
  // (`fd-panel--right`, `right:0`). Bu ikkalasi ILGARI TESKARI edi: eng
  // CHAP ustun ("Onlayn", 1-ustun) CHAPGA o'suvchi panel olardi va 300px
  // kenglik ekranning chap chetidan (yon menyu ortidan) toshib chiqardi
  // — foydalanuvchi ko'rgan "filtr tiqilib qolgan" holati shundan edi.
  // Endi eng CHAP ustun O'NGGA, eng O'NG ustun CHAPGA o'sadi.
  const dropdownAlign = isRightmost ? 'right' : 'left';

  return (
    <div
      className="lead-column"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-label={t('lidColumn.columnAria', { title: column.title })}
    >
      <div className="lead-column__header" style={{ background: column.color }}>
        {searchOpen ? (
          <div className="lead-column__search-bar">
            <FontAwesomeIcon icon={faSearch} className="lead-column__search-icon-inside" />
            <input
              ref={inputRef}
              className="lead-column__search-input"
              type="text"
              placeholder={t('lidColumn.searchPlaceholder', {
                defaultValue: 'Qidirish...',
              })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              className="lead-column__search-close"
              type="button"
              aria-label="Qidirishni yopish"
              onClick={closeSearch}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        ) : (
          <>
            <span
              className={`lead-column__title${onTitleClick ? ' lead-column__title--clickable' : ''}`}
              onClick={onTitleClick ? () => onTitleClick(column.id) : undefined}
            >
              {column.title}
            </span>
            <div className="lead-column__header-right">
              <span className="lead-column__badge">{totalCount}</span>

              {/* «+» — yangi lid qo'shish (ilgari ustun tepasida katta «Qo'shish» tugmasi edi). */}
              {column.groupId !== HIDDEN_GROUP_ID && column.id !== 1 && canCreateLid && (
                <WriteGuard>
                  <button
                    className="lead-column__search-btn lead-column__plus-btn"
                    type="button"
                    title={t('registrationModal.add')}
                    aria-label={t('lidColumn.addLeadAria')}
                    onClick={() => onAddClick(column.id)}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                  </button>
                </WriteGuard>
              )}

              <button
                className="lead-column__search-btn"
                type="button"
                aria-label={t('lidColumn.searchAria', {
                  defaultValue: 'Qidirish',
                })}
                onClick={openSearch}
              >
                <FontAwesomeIcon icon={faSearch} />
              </button>

              <FilterDropdown
                filters={filter}
                onChange={handleFilterChange}
                align={dropdownAlign}
                trigger={
                  <button
                    className="lead-column__menu-btn"
                    type="button"
                    aria-label={t('lidColumn.menuAria', {
                      title: column.title,
                    })}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="5" r="1.8" fill="white" />
                      <circle cx="12" cy="12" r="1.8" fill="white" />
                      <circle cx="12" cy="19" r="1.8" fill="white" />
                    </svg>
                  </button>
                }
              />
            </div>
          </>
        )}
      </div>

      <div className="lead-column__body" ref={bodyRef} onScroll={handleScroll}>
        {filteredLeads.length === 0 && isSearching && !isBusy ? (
          <div className="lead-column__no-results">
            <i className="fa-solid fa-search" aria-hidden="true" />
            <span>{t('lidColumn.noResults', { defaultValue: 'Natija topilmadi' })}</span>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              color={column.color}
              isLastSection={isLastSection}
              onDragStart={onDragStart}
              onClick={onLeadClick}
            />
          ))
        )}

        {isFetchingNextPage || isBusy ? (
          <div className="lead-column__loading">Yuklanmoqda...</div>
        ) : (
          !isSearching &&
          selfFetch &&
          hasNextPage && (
            <button
              className="lead-column__load-more"
              type="button"
              onClick={() => fetchNextPage()}
              aria-label="Ko'proq yuklash"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default memo(LeadColumn);
