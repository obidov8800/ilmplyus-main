import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '@/store/useAuthStore';
import { getLocalized } from '@/utils/getLocalized';
import ConfirmModal from '@/components/ConfirmModal';
import { FAQ_MODULES, isModuleVisible } from '@/data/faqModules';
import { deleteFaqEntry, fetchFaqEntries, getFaqVideoObjectUrl } from '@/services/faqService';
import { getYoutubeEmbedUrl } from './faqHelpers';
import FaqEditModal from './FaqEditModal';
import type { FaqEntry, FaqImage } from '@/types/faq.types';
import './faq.css';

/**
 * FAQ mazmuni — sidebar (`/faq`, `Layout` ichida) va login sahifasida
 * (tizimga kirmasdan) BIR XIL komponent orqali ko'rsatiladi.
 *
 * Ruxsat filtri har doim BIR XIL mantiqda ishlaydi: login sahifasida
 * foydalanuvchi hali autentifikatsiya qilinmagani uchun `permissions` bo'sh
 * — shu sabab faqat ruxsat talab qilmaydigan ("umumiy") savollar avtomatik
 * ko'rinadi, tizimga kirgach esa `Aside.tsx` bilan bir xil ruxsatlarga qarab
 * tegishli bo'limlar ham qo'shiladi ("guruhga ruxsat bo'lsa — guruh FAQ'i
 * chiqadi" talabiga mos).
 */

function FaqVideo({ entry }: { entry: FaqEntry }) {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!entry.videoId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    getFaqVideoObjectUrl(entry.videoId).then((url) => {
      if (cancelled) return;
      objectUrl = url;
      setBlobUrl(url);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry.videoId]);

  const youtubeEmbed = entry.videoUrl ? getYoutubeEmbedUrl(entry.videoUrl) : null;

  if (youtubeEmbed) {
    return (
      <div className="faq-video-wrap">
        <iframe
          src={youtubeEmbed}
          className="faq-video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (entry.videoUrl) {
    return (
      <div className="faq-video-wrap faq-video-wrap--file">
        <video
          src={entry.videoUrl}
          poster={entry.videoPoster ?? undefined}
          className="faq-video"
          controls
          playsInline
          preload="none"
        />
      </div>
    );
  }

  if (entry.videoId) {
    return blobUrl ? (
      <div className="faq-video-wrap">
        <video src={blobUrl} className="faq-video" controls />
      </div>
    ) : (
      <p className="faq-video-loading">{t('faq.videoLoading')}</p>
    );
  }

  return null;
}

/** Skrinshotlar: kichik rasmlar, bosilsa — butun ekranli ko'rinish (←/→/Esc bilan). */
function FaqImages({ images }: { images: FaqImage[] }) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<number | null>(null);

  const step = (dir: 1 | -1) =>
    setActive((i) => (i === null ? i : (i + dir + images.length) % images.length));

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, images.length]);

  const current = active === null ? null : images[active];

  return (
    <>
      <div className={`faq-images ${images.length === 1 ? 'faq-images--single' : ''}`}>
        {images.map((img, i) => {
          const caption = getLocalized(img, 'caption', i18n.language);
          return (
            <figure key={img.src} className="faq-figure">
              <button
                type="button"
                className="faq-figure__btn"
                onClick={() => setActive(i)}
                title={t('faq.zoomHint')}
              >
                <img src={img.src} alt={caption === '-' ? '' : caption} loading="lazy" className="faq-figure__img" />
                <span className="faq-figure__zoom">
                  <i className="fa-solid fa-magnifying-glass-plus" />
                </span>
              </button>
              {caption !== '-' && <figcaption className="faq-figure__caption">{caption}</figcaption>}
            </figure>
          );
        })}
      </div>

      {current && active !== null && createPortal(
        <div className="faq-lightbox" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <button
            type="button"
            className="faq-lightbox__close"
            aria-label={t('faq.close')}
            onClick={() => setActive(null)}
          >
            <i className="fa-solid fa-xmark" />
          </button>
          {images.length > 1 && (
            <button
              type="button"
              className="faq-lightbox__nav faq-lightbox__nav--prev"
              aria-label={t('faq.prev')}
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
            >
              <i className="fa-solid fa-chevron-left" />
            </button>
          )}
          <figure className="faq-lightbox__figure" onClick={(e) => e.stopPropagation()}>
            <img src={current.src} alt="" className="faq-lightbox__img" />
            {getLocalized(current, 'caption', i18n.language) !== '-' && (
              <figcaption className="faq-lightbox__caption">
                {getLocalized(current, 'caption', i18n.language)}
              </figcaption>
            )}
          </figure>
          {images.length > 1 && (
            <button
              type="button"
              className="faq-lightbox__nav faq-lightbox__nav--next"
              aria-label={t('faq.next')}
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
            >
              <i className="fa-solid fa-chevron-right" />
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

interface FaqContentProps {
  /** `true` bo'lsa sahifa tor login-modal ichida, ortiqcha bo'sh joysiz ko'rsatiladi. */
  compact?: boolean;
}

export default function FaqContent({ compact = false }: FaqContentProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);

  const isAdmin = user?.role === 'admin';

  const hasPermission = (p: string): boolean => {
    if (!p) return true;
    if (isAdmin) return true;
    return permissionsLoaded && permissions.includes(p);
  };

  const { data: entries = [] } = useQuery({
    queryKey: ['faq-entries'],
    queryFn: fetchFaqEntries,
  });

  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [openQuestions, setOpenQuestions] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ entry: FaqEntry | null; moduleKey?: string } | null>(null);
  const [deleting, setDeleting] = useState<FaqEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const visibleModules = useMemo(
    () => FAQ_MODULES.filter((m) => isModuleVisible(m, hasPermission)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions, permissionsLoaded, isAdmin],
  );

  const entriesByModule = useMemo(() => {
    const map = new Map<string, FaqEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.moduleKey) ?? [];
      list.push(entry);
      map.set(entry.moduleKey, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [entries]);

  const toggleModule = (key: string) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleQuestion = (id: string) => {
    setOpenQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['faq-entries'] });

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    await deleteFaqEntry(deleting.id);
    setDeleteBusy(false);
    setDeleting(null);
    refetch();
  };

  return (
    <div className={`faq-content ${compact ? 'faq-content--compact' : ''}`}>
      {!compact && (
        <div className="faq-header">
          <p className="faq-header__subtitle">{t('faq.subtitle')}</p>
        </div>
      )}

      {visibleModules.map((module) => {
        const moduleEntries = entriesByModule.get(module.key) ?? [];
        const isOpen = openModules.has(module.key);
        if (moduleEntries.length === 0 && !isAdmin) return null;

        return (
          <div key={module.key} className="faq-module">
            <button
              type="button"
              className="faq-module__header"
              onClick={() => toggleModule(module.key)}
            >
              <span className="faq-module__title">{t(module.labelKey)}</span>
              <span className="faq-module__count">{moduleEntries.length}</span>
              <i className={`fa-solid fa-chevron-${isOpen ? 'up' : 'down'} faq-module__chevron`} />
            </button>

            {isOpen && (
              <div className="faq-module__body">
                {moduleEntries.length === 0 && (
                  <p className="faq-empty-hint">{t('faq.noEntries')}</p>
                )}
                {moduleEntries.map((entry) => {
                  const isQOpen = openQuestions.has(entry.id);
                  const question = getLocalized(entry, 'question', i18n.language);
                  const answer = getLocalized(entry, 'answer', i18n.language);
                  const hasVideo = !!entry.videoId || !!entry.videoUrl;
                  return (
                    <div key={entry.id} className="faq-item">
                      <button
                        type="button"
                        className="faq-item__question"
                        onClick={() => toggleQuestion(entry.id)}
                      >
                        <i className="fa-solid fa-circle-question faq-item__q-icon" />
                        <span>{question}</span>
                        <i
                          className={`fa-solid fa-chevron-${isQOpen ? 'up' : 'down'} faq-item__chevron`}
                        />
                      </button>
                      {isQOpen && (
                        <div className="faq-item__answer">
                          <p>{answer}</p>
                          {!!entry.images?.length && <FaqImages images={entry.images} />}
                          {hasVideo ? (
                            <>
                              <p className="faq-video-title">
                                <i className="fa-solid fa-circle-play" /> {t('faq.watchVideo')}
                              </p>
                              <FaqVideo entry={entry} />
                            </>
                          ) : (
                            isAdmin && <p className="faq-video-missing">{t('faq.noVideoYet')}</p>
                          )}
                          {isAdmin && (
                            <div className="faq-item__admin-actions">
                              <button
                                type="button"
                                className="faq-item__admin-btn"
                                onClick={() => setEditing({ entry })}
                              >
                                <i className="fa-solid fa-pen" /> {t('faq.editEntry')}
                              </button>
                              <button
                                type="button"
                                className="faq-item__admin-btn faq-item__admin-btn--danger"
                                onClick={() => setDeleting(entry)}
                              >
                                <i className="fa-solid fa-trash" /> {t('faq.deleteEntry')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {isAdmin && (
                  <button
                    type="button"
                    className="faq-add-btn btn-accent"
                    onClick={() => setEditing({ entry: null, moduleKey: module.key })}
                  >
                    {t('faq.addEntry')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <FaqEditModal
          entry={editing.entry}
          defaultModuleKey={editing.moduleKey}
          onClose={() => setEditing(null)}
          onSaved={refetch}
        />
      )}

      {deleting && (
        <ConfirmModal
          open={!!deleting}
          title={t('faq.deleteEntry')}
          message={t('faq.deleteConfirm')}
          confirmLabel={t('faq.deleteEntry')}
          cancelLabel={t('faq.cancel')}
          tone="danger"
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
