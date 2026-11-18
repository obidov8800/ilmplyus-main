import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FAQ_MODULES } from '@/data/faqModules';
import { deleteFaqVideo, saveFaqEntry, uploadFaqVideo } from '@/services/faqService';
import type { FaqEntry } from '@/types/faq.types';

interface FaqEditModalProps {
  /** Tahrirlash uchun mavjud yozuv, yoki yangi qo'shishda oldindan tanlangan modul. */
  entry: FaqEntry | null;
  defaultModuleKey?: string;
  onClose: () => void;
  onSaved: () => void;
}

type VideoSource = 'none' | 'file' | 'url';

/**
 * Admin uchun savol-javob qo'shish/tahrirlash oynasi.
 *
 * Video ikki xil manbadan bo'lishi mumkin: fayl yuklash (IndexedDB'ga
 * saqlanadi, batafsili `faqVideoStore.ts`da) yoki tashqi havola (masalan
 * YouTube). Ikkalasi bir vaqtda bo'lmaydi — radio orqali tanlanadi.
 */
export default function FaqEditModal({ entry, defaultModuleKey, onClose, onSaved }: FaqEditModalProps) {
  const { t } = useTranslation();

  const [moduleKey, setModuleKey] = useState(entry?.moduleKey ?? defaultModuleKey ?? 'general');
  const [question, setQuestion] = useState(entry?.question_uz ?? '');
  const [answer, setAnswer] = useState(entry?.answer_uz ?? '');
  const [videoSource, setVideoSource] = useState<VideoSource>(
    entry?.videoId ? 'file' : entry?.videoUrl ? 'url' : 'none',
  );
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState(entry?.videoUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = question.trim().length > 0 && answer.trim().length > 0;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      let videoId: string | null = entry?.videoId ?? null;
      let finalVideoUrl: string | null = entry?.videoUrl ?? null;

      if (videoSource === 'file' && videoFile) {
        // Eski video (agar bo'lsa) endi kerak emas — joy band qilib turmasin.
        if (entry?.videoId) await deleteFaqVideo(entry.videoId).catch(() => undefined);
        videoId = await uploadFaqVideo(videoFile);
        finalVideoUrl = null;
      } else if (videoSource === 'url') {
        if (entry?.videoId) await deleteFaqVideo(entry.videoId).catch(() => undefined);
        videoId = null;
        finalVideoUrl = videoUrl.trim() || null;
      } else if (videoSource === 'none') {
        if (entry?.videoId) await deleteFaqVideo(entry.videoId).catch(() => undefined);
        videoId = null;
        finalVideoUrl = null;
      }

      const id = entry?.id ?? `faq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const order = entry?.order ?? Date.now();

      await saveFaqEntry({
        id,
        moduleKey,
        question_uz: question.trim(),
        question_ru: entry?.question_ru,
        question_en: entry?.question_en,
        answer_uz: answer.trim(),
        answer_ru: entry?.answer_ru,
        answer_en: entry?.answer_en,
        videoId,
        videoUrl: finalVideoUrl,
        videoPoster: finalVideoUrl ? entry?.videoPoster : null,
        images: entry?.images,
        order,
      });

      onSaved();
      onClose();
    } catch {
      setError(t('faq.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="faq-modal-overlay" onClick={onClose}>
      <div className="faq-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="faq-modal__title">
          {entry ? t('faq.editEntry') : t('faq.addEntry')}
        </h3>

        <label className="faq-modal__label">{t('faq.moduleLabel')}</label>
        <select
          className="faq-modal__input"
          value={moduleKey}
          onChange={(e) => setModuleKey(e.target.value)}
        >
          {FAQ_MODULES.map((m) => (
            <option key={m.key} value={m.key}>
              {t(m.labelKey)}
            </option>
          ))}
        </select>

        <label className="faq-modal__label">{t('faq.questionLabel')}</label>
        <input
          className="faq-modal__input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('faq.questionPlaceholder')}
        />

        <label className="faq-modal__label">{t('faq.answerLabel')}</label>
        <textarea
          className="faq-modal__input faq-modal__textarea"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={t('faq.answerPlaceholder')}
          rows={5}
        />

        <label className="faq-modal__label">{t('faq.videoLabel')}</label>
        <div className="faq-modal__video-tabs">
          <button
            type="button"
            className={`faq-modal__video-tab${videoSource === 'none' ? ' active' : ''}`}
            onClick={() => setVideoSource('none')}
          >
            {t('faq.videoNone')}
          </button>
          <button
            type="button"
            className={`faq-modal__video-tab${videoSource === 'file' ? ' active' : ''}`}
            onClick={() => setVideoSource('file')}
          >
            {t('faq.videoUpload')}
          </button>
          <button
            type="button"
            className={`faq-modal__video-tab${videoSource === 'url' ? ' active' : ''}`}
            onClick={() => setVideoSource('url')}
          >
            {t('faq.videoUrl')}
          </button>
        </div>

        {videoSource === 'file' && (
          <div>
            <input
              type="file"
              accept="video/*"
              className="faq-modal__input"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
            {!videoFile && entry?.videoId && (
              <p className="faq-modal__hint">{t('faq.videoKeepExisting')}</p>
            )}
          </div>
        )}
        {videoSource === 'url' && (
          <input
            className="faq-modal__input"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
          />
        )}

        {error && <p className="faq-modal__error">{error}</p>}

        <div className="faq-modal__actions">
          <button type="button" className="faq-modal__btn-cancel" onClick={onClose}>
            {t('faq.cancel')}
          </button>
          <button
            type="button"
            className="faq-modal__btn-save"
            disabled={!isValid || saving}
            onClick={handleSave}
          >
            {saving ? t('faq.saving') : t('faq.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
