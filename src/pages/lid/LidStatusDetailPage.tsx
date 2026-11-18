import { useState, useCallback, useRef, useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import LeadCard from '@/components/LidCard';
import LeadDetailsModal from '@/components/LeadDetailsModal';
import { fetchLidsByStatus, fetchAllLidsByStatus } from './lid.service';
import type { Lid } from '@/types/lid.types';

const STATUSES = [
  { id: 1, titleKey: 'lid.columns.online' },
  { id: 2, titleKey: 'lid.columns.offline' },
  { id: 3, titleKey: 'lid.columns.contactEstablished' },
  { id: 4, titleKey: 'lid.columns.contactNotEstablished' },
  { id: 5, titleKey: 'lid.columns.notInterested' },
  { id: 6, titleKey: 'lid.columns.willCome' },
  { id: 7, titleKey: 'lid.columns.came' },
  { id: 8, titleKey: 'lid.columns.didNotCome' },
];

const NOOP_DRAG = () => {};

function StatusTabButton({
  statusId,
  titleKey,
  isActive,
  onClick,
}: {
  statusId: number;
  titleKey: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['lids', 'status-count', statusId],
    queryFn: () => fetchLidsByStatus({ status: statusId, page: 1, per_page: 1 }),
    staleTime: 30_000,
  });
  const count = data?.total ?? 0;

  return (
    <button
      className={`lid-detail-tab${isActive ? ' lid-detail-tab--active' : ''}`}
      onClick={onClick}
      type="button"
    >
      {t(titleKey)}
      <sup className="lid-detail-tab__count">{count}</sup>
    </button>
  );
}

interface LidStatusDetailPageProps {
  initialStatusId: number;
  onBack: () => void;
}

export default function LidStatusDetailPage({ initialStatusId, onBack }: LidStatusDetailPageProps) {
  const { t } = useTranslation();
  const [activeStatusId, setActiveStatusId] = useState(initialStatusId);
  const [selectedLead, setSelectedLead] = useState<Lid | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const trimmedSearch = debouncedSearch.trim();
  const isSearching = trimmedSearch !== '';

  // Oddiy ko'rinish: infinite-scroll, 40 tadan (qidiruv YO'Q holatda).
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['lids', 'detail', activeStatusId],
    queryFn: ({ pageParam }) =>
      fetchLidsByStatus({ status: activeStatusId, page: pageParam as number, per_page: 40 }),
    getNextPageParam: (lastPage) =>
      lastPage.current_page < lastPage.last_page ? lastPage.current_page + 1 : undefined,
    initialPageParam: 1,
    enabled: !isSearching,
  });

  // Qidiruv: TEKSHIRILGAN — backend `/lids?search=`ni e'tiborsiz qoldiradi
  // (natija filtrsiz bilan bir xil chiqadi), shuning uchun serverga
  // tayanib bo'lmaydi. Shu holatdagi BUTUN ro'yxat bir marta
  // (`fetchAllLidsByStatus`) olib kelinadi va nomi/raqami bo'yicha
  // mahalliy filtrlanadi — 500 ta lid bo'lsa ham hammasi qidiriladi,
  // faqat hozircha yuklangan (40 tadan) qatorlar emas.
  const { data: fullList, isFetching: isFullListFetching } = useQuery({
    queryKey: ['lids', 'detail-full', activeStatusId],
    queryFn: () => fetchAllLidsByStatus(activeStatusId),
    enabled: isSearching,
    staleTime: 60_000,
  });

  const allLeads = isSearching ? (fullList ?? []) : (data?.pages.flatMap((p) => p.data) ?? []);

  const leads = isSearching
    ? allLeads.filter((l) => {
        const q = trimmedSearch.toLowerCase();
        const full = `${l.first_name} ${l.last_name} ${l.phone ?? ''}`.toLowerCase();
        return full.includes(q);
      })
    : allLeads;

  const isBusy = isSearching && isFullListFetching;

  const handleScroll = useCallback(() => {
    if (!contentRef.current || isSearching || !hasNextPage || isFetchingNextPage) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 120) fetchNextPage();
  }, [isSearching, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleTabClick = useCallback((id: number) => {
    setActiveStatusId(id);
  }, []);

  return (
    <div className="lid-detail-page">
      <div className="lid-detail-header">
        <button className="lid-detail-back-btn" onClick={onBack} type="button">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('lid.detail.back', { defaultValue: 'Orqaga' })}
        </button>
        <span className="lid-detail-header-title">
          {t('lid.detail.pageTitle', { defaultValue: 'Lidlar' })}
        </span>

        <div className="lid-detail-search-wrap">
          <FontAwesomeIcon icon={faSearch} className="lid-detail-search-icon" />
          <input
            ref={searchInputRef}
            className="lid-detail-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('lid.detail.searchPlaceholder', { defaultValue: 'Qidirish...' })}
          />
          {searchQuery && (
            <button
              className="lid-detail-search-clear"
              type="button"
              aria-label={t('lidColumn.searchAria', { defaultValue: 'Qidirishni tozalash' })}
              onClick={() => {
                setSearchQuery('');
                setDebouncedSearch('');
                searchInputRef.current?.focus();
              }}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>
      </div>

      <div className="lid-detail-tabs">
        {STATUSES.map((s) => (
          <StatusTabButton
            key={s.id}
            statusId={s.id}
            titleKey={s.titleKey}
            isActive={s.id === activeStatusId}
            onClick={() => handleTabClick(s.id)}
          />
        ))}
      </div>

      <div className="lid-detail-content" ref={contentRef} onScroll={handleScroll}>
        {leads.length === 0 && !isFetchingNextPage && isBusy ? (
          <div className="lid-detail-loading">
            {t('lid.detail.loading', { defaultValue: 'Yuklanmoqda...' })}
          </div>
        ) : leads.length === 0 && !isFetchingNextPage ? (
          <div className="lid-detail-empty">
            {searchQuery.trim()
              ? t('lidColumn.noResults', { defaultValue: 'Natija topilmadi' })
              : t('lid.detail.empty', { defaultValue: 'Lidlar topilmadi' })}
          </div>
        ) : (
          <div className="lid-detail-grid">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                color="#FE9100"
                onDragStart={NOOP_DRAG}
                onClick={setSelectedLead}
              />
            ))}

            {isFetchingNextPage && (
              <div className="lid-detail-loading">
                {t('lid.detail.loading', { defaultValue: 'Yuklanmoqda...' })}
              </div>
            )}

            {!isFetchingNextPage && !isSearching && hasNextPage && (
              <button
                className="lid-detail-load-more"
                type="button"
                onClick={() => fetchNextPage()}
              >
                {t('lid.detail.loadMore', { defaultValue: "Ko'proq yuklash" })}
              </button>
            )}
          </div>
        )}
      </div>

      {selectedLead && (
        <LeadDetailsModal
          key={selectedLead.id}
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onEdit={setSelectedLead}
        />
      )}
    </div>
  );
}
