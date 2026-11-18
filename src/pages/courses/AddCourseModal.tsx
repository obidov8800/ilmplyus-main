import { groupDigits } from '@/utils/formatNumber';
import { useCallback, useMemo, useState } from 'react';
import { useOptions, optionLabel } from '@/api/options';
import type {
  CourseFormErrors as AddCourseFormErrors,
  CourseFormState as AddCourseFormState,
  CoursePrice,
  SaveCoursePayload,
} from '@/types/course.types';
import { useTranslation } from 'react-i18next';
import { legacyLessonFields, previousLessonsCount } from './legacyLessons';

interface AddCourseModalProps {
  coursePrices: CoursePrice[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: SaveCoursePayload) => void;
}

const EMPTY_FORM: AddCourseFormState = {
  filial: '',
  kurs: '',
  level: '',
  old_price: '',
  new_price: '',
  percentage: '',
  start_date: '',
  comment: '',
};

/** Tanlangan filial+kurs+daraja bo'yicha mavjud narx yozuvi (eski narxni to'ldirish uchun). */
function findCoursePrice(
  coursePrices: CoursePrice[],
  filial: string,
  kurs: string,
  level: string,
): CoursePrice | null {
  if (!kurs) return null;
  let filtered = coursePrices.filter((cp) => String(cp.course_id) === kurs);
  if (level) filtered = filtered.filter((cp) => String(cp.level_id) === level);
  if (!filtered.length) return null;
  if (filial) {
    const exact = filtered.find((cp) => String(cp.branch_id) === filial);
    return exact ?? filtered[0];
  }
  return filtered[0];
}

/** Mavjud narxning matnli ko'rinishi — topilmasa bo'sh satr. */
function autoOldPriceValue(
  coursePrices: CoursePrice[],
  filial: string,
  kurs: string,
  level: string,
): string {
  const match = findCoursePrice(coursePrices, filial, kurs, level);
  const price = match ? parseFloat(match.new_price) || 0 : 0;
  return price ? String(price) : '';
}

function getDaysInMonth(month: string): number {
  if (!month) return 31;
  const m = parseInt(month, 10);
  if ([1, 3, 5, 7, 8, 10, 12].includes(m)) return 31;
  if ([4, 6, 9, 11].includes(m)) return 30;
  return 29;
}

export default function AddCourseModal({
  coursePrices,
  isSaving,
  onClose,
  onSave,
}: AddCourseModalProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const MONTHS = [
    { value: '01', label: t('attendance.month.jan') },
    { value: '02', label: t('attendance.month.feb') },
    { value: '03', label: t('attendance.month.mar') },
    { value: '04', label: t('attendance.month.apr') },
    { value: '05', label: t('attendance.month.may') },
    { value: '06', label: t('attendance.month.jun') },
    { value: '07', label: t('attendance.month.jul') },
    { value: '08', label: t('attendance.month.aug') },
    { value: '09', label: t('attendance.month.sept') },
    { value: '10', label: t('attendance.month.oct') },
    { value: '11', label: t('attendance.month.nov') },
    { value: '12', label: t('attendance.month.dec') },
  ];

  const [form, setForm] = useState<AddCourseFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<AddCourseFormErrors>({});
  const [startDay, setStartDay] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const { data: branches = [], isLoading: isLoadingData } = useOptions('branches');

  // Filtrlash serverda: /options/courses?branch_id=...
  const { data: filteredCourses = [] } = useOptions(
    'courses',
    { branch_id: form.filial || undefined },
    { enabled: !!form.filial },
  );

  const selectedCourseLevels = useMemo(() => {
    if (!form.kurs) return [];
    const course = filteredCourses.find((c) => String(c.id) === form.kurs);
    return course?.levels ?? [];
  }, [filteredCourses, form.kurs]);

  const daysInMonth = useMemo(() => getDaysInMonth(startMonth), [startMonth]);

  const dayOptions = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const v = String(i + 1).padStart(2, '0');
        return { value: v, label: v };
      }),
    [daysInMonth],
  );

  const oldPriceRaw = useMemo(() => Number(form.old_price) || 0, [form.old_price]);
  const newPriceRaw = useMemo(() => Number(form.new_price) || 0, [form.new_price]);

  /** Qo'lda kiritiladigan kelgusi o'sish foizi. */
  const percentageRaw = useMemo(() => Number(form.percentage) || 0, [form.percentage]);

  /** `start_date` kelganda narx shu qiymatga aylanadi: yangi narx + foiz. */
  const scheduledPriceRaw = useMemo(() => {
    if (!newPriceRaw || !percentageRaw) return 0;
    return Math.round(newPriceRaw * (1 + percentageRaw / 100));
  }, [newPriceRaw, percentageRaw]);

  /** Eski narxga nisbatan hozirgi o'zgarish — faqat ma'lumot uchun ko'rsatiladi. */
  const currentDiffPercent = useMemo(() => {
    if (!oldPriceRaw || !newPriceRaw) return null;
    return Math.round(((newPriceRaw - oldPriceRaw) / oldPriceRaw) * 100);
  }, [oldPriceRaw, newPriceRaw]);

  const foizIsUp = useMemo(() => newPriceRaw > oldPriceRaw, [newPriceRaw, oldPriceRaw]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;

      // Filial/kurs/daraja almashganda eski narx mavjud narxdan qayta to'ldiriladi.
      // Foydalanuvchi keyin uni qo'lda o'zgartirsa, tanlov o'zgarmaguncha saqlanib qoladi.
      if (name === 'filial') {
        setForm((prev) => ({
          ...prev,
          filial: value,
          kurs: '',
          level: '',
          old_price: '',
        }));
      } else if (name === 'kurs') {
        setForm((prev) => ({
          ...prev,
          kurs: value,
          level: '',
          old_price: autoOldPriceValue(coursePrices, prev.filial, value, ''),
        }));
      } else if (name === 'level') {
        setForm((prev) => ({
          ...prev,
          level: value,
          old_price: autoOldPriceValue(coursePrices, prev.filial, prev.kurs, value),
        }));
      } else {
        setForm((prev) => ({ ...prev, [name]: value }));
      }

      setErrors((prev) => ({ ...prev, [name]: undefined }));
    },
    [coursePrices],
  );

  const handleDayChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const day = e.target.value;
      setStartDay(day);
      setErrors((prev) => ({ ...prev, start_date: undefined }));
      setForm((prev) => ({
        ...prev,
        start_date: day && startMonth ? `${day}.${startMonth}` : '',
      }));
    },
    [startMonth],
  );

  const handleMonthChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const month = e.target.value;
      setStartMonth(month);
      setErrors((prev) => ({ ...prev, start_date: undefined }));
      const maxDay = getDaysInMonth(month);
      const validDay = startDay && parseInt(startDay, 10) <= maxDay ? startDay : '';
      if (!validDay) setStartDay('');
      setForm((prev) => ({
        ...prev,
        start_date: validDay && month ? `${validDay}.${month}` : '',
      }));
    },
    [startDay],
  );

  const validate = useCallback((): boolean => {
    const next: AddCourseFormErrors = {};
    if (!form.filial) next.filial = t('course.selectBranch');
    if (!form.kurs) next.kurs = t('course.chooseCourse');
    if (!form.level) next.level = t('course.chooseLevel');
    if (!form.new_price || Number(form.new_price) <= 0) next.new_price = t('course.addNewPrice');
    if (form.percentage !== '' && (percentageRaw < -100 || percentageRaw > 100))
      next.percentage = t('course.percentageRange');
    if (!form.start_date) next.start_date = t('course.chooseDayOrMonth');
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, percentageRaw, t]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    // Darslar soni formada yo'q — guruh kunlaridan hisoblanadi; backend talabi uchun qiymat `legacyLessons.ts` da.
    const lessonsCount = previousLessonsCount(coursePrices, form.filial, form.kurs, form.level);
    const payload: SaveCoursePayload = {
      branch_id: Number(form.filial),
      course_id: Number(form.kurs),
      level_id: Number(form.level),
      old_price: oldPriceRaw,
      new_price: newPriceRaw,
      ...legacyLessonFields(newPriceRaw, lessonsCount),
      percentage: percentageRaw,
      start_date: form.start_date,
      comment: form.comment || '',
    };
    await onSave(payload);
  }, [form, onSave, validate, oldPriceRaw, newPriceRaw, percentageRaw, coursePrices]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !isSaving) onClose();
    },
    [onClose, isSaving],
  );

  const todayLabel = useMemo(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }, []);

  return (
    <div
      className="courses-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="courses-modal-title"
    >
      <div className="courses-modal">
        <div className="courses-modal__header">
          <h2 className="courses-modal__title" id="courses-modal-title">
            {t('course.courseTitle')}
          </h2>
          <span className="courses-modal__date">📅 {todayLabel}</span>
        </div>

        <div className="courses-modal__body">
          {isLoadingData ? (
            <div className="courses-modal__loading">{t('course.loading')}...</div>
          ) : (
            <>
              <div className="courses-modal__row">
                <div className="courses-modal__field">
                  <label htmlFor="cm-filial" className="courses-modal__label">
                    {t('course.selectBranch')}
                  </label>
                  <select
                    id="cm-filial"
                    name="filial"
                    className={`courses-modal__select${errors.filial ? ' courses-modal__select--error' : ''}`}
                    value={form.filial}
                    onChange={handleChange}
                    disabled={isSaving}
                  >
                    <option value="">{t('course.choose')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                  {errors.filial && <span className="courses-modal__error">{errors.filial}</span>}
                </div>

                <div className="courses-modal__field">
                  <label htmlFor="cm-kurs" className="courses-modal__label">
                    {t('course.chooseCourse')}
                  </label>
                  <select
                    id="cm-kurs"
                    name="kurs"
                    className={`courses-modal__select${errors.kurs ? ' courses-modal__select--error' : ''}`}
                    value={form.kurs}
                    onChange={handleChange}
                    disabled={isSaving || !form.filial}
                  >
                    <option value="">{t('course.choose')}</option>

                    {filteredCourses.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {errors.kurs && <span className="courses-modal__error">{errors.kurs}</span>}
                </div>
              </div>

              <div className="courses-modal__row">
                <div className="courses-modal__field">
                  <label htmlFor="cm-level" className="courses-modal__label">
                    {t('course.selectLevel')}
                  </label>
                  <select
                    id="cm-level"
                    name="level"
                    className={`courses-modal__select${errors.level ? ' courses-modal__select--error' : ''}`}
                    value={form.level}
                    onChange={handleChange}
                    disabled={isSaving || !form.kurs}
                  >
                    <option value="">{t('course.choose')}</option>
                    {selectedCourseLevels.map((l) => (
                      <option key={l.id} value={String(l.id)}>
                        {optionLabel(l, lang)}
                      </option>
                    ))}
                  </select>
                  {errors.level && <span className="courses-modal__error">{errors.level}</span>}
                </div>
              </div>

              <div className="courses-modal__row">
                <div className="courses-modal__field">
                  <label htmlFor="cm-old-price" className="courses-modal__label">
                    {t('course.oldPrice')}
                  </label>
                  <div className="courses-modal__input-wrap">
                    <input
                      id="cm-old-price"
                      name="old_price"
                      className={`courses-modal__input${errors.old_price ? ' courses-modal__input--error' : ''}`}
                      type="number"
                      value={form.old_price}
                      onChange={handleChange}
                      placeholder="0"
                      min={0}
                      disabled={isSaving}
                    />
                    <span className="courses-modal__currency">UZS</span>
                  </div>
                  <span className="courses-modal__hint">{t('course.oldPriceHint')}</span>
                </div>

                <div className="courses-modal__field">
                  <label htmlFor="cm-new-price" className="courses-modal__label">
                    {t('course.newPriceMonthly')}
                  </label>
                  <div className="courses-modal__input-wrap">
                    <input
                      id="cm-new-price"
                      name="new_price"
                      className={`courses-modal__input${errors.new_price ? ' courses-modal__input--error' : ''}`}
                      type="number"
                      value={form.new_price}
                      onChange={handleChange}
                      placeholder="0"
                      min={0}
                      disabled={isSaving}
                    />
                    <span className="courses-modal__currency">UZS</span>
                  </div>
                  {currentDiffPercent !== null && currentDiffPercent !== 0 && (
                    <span
                      className={`courses-modal__hint${foizIsUp ? ' courses-modal__hint--up' : ' courses-modal__hint--down'}`}
                    >
                      {t('course.priceChanging')}: {currentDiffPercent > 0 ? '+' : ''}
                      {currentDiffPercent}%
                    </span>
                  )}
                  {errors.new_price && (
                    <span className="courses-modal__error">{errors.new_price}</span>
                  )}
                </div>
              </div>

              <div className="courses-modal__row">
                <div className="courses-modal__field">
                  <label htmlFor="cm-foiz" className="courses-modal__label">
                    {t('course.changingPercentage')}
                  </label>
                  <div className="courses-modal__input-wrap">
                    <input
                      id="cm-foiz"
                      name="percentage"
                      className={`courses-modal__input${errors.percentage ? ' courses-modal__input--error' : ''}`}
                      type="number"
                      value={form.percentage}
                      onChange={handleChange}
                      placeholder="0"
                      min={-100}
                      max={100}
                      step={0.1}
                      disabled={isSaving}
                    />
                    <span className="courses-modal__currency">%</span>
                  </div>
                  <span className="courses-modal__hint">{t('course.fixedTerm')}</span>
                  {errors.percentage && (
                    <span className="courses-modal__error">{errors.percentage}</span>
                  )}
                </div>

                <div className="courses-modal__field">
                  <label className="courses-modal__label">{t('course.changeDate')}</label>
                  <div className="courses-modal__date-row">
                    <select
                      id="cm-start-day"
                      className={`courses-modal__select courses-modal__select--half${errors.start_date ? ' courses-modal__select--error' : ''}`}
                      value={startDay}
                      onChange={handleDayChange}
                      disabled={isSaving}
                    >
                      <option value="">{t('course.day')}</option>
                      {dayOptions.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <select
                      id="cm-start-month"
                      className={`courses-modal__select courses-modal__select--half${errors.start_date ? ' courses-modal__select--error' : ''}`}
                      value={startMonth}
                      onChange={handleMonthChange}
                      disabled={isSaving}
                    >
                      <option value="">{t('course.month')}</option>
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="courses-modal__hint">{t('course.changeTerm')}</span>
                  {scheduledPriceRaw > 0 && (
                    <span className="courses-modal__hint courses-modal__hint--up">
                      {t('course.scheduledPrice', {
                        date: form.start_date || '—.—',
                        from: groupDigits(newPriceRaw),
                        to: groupDigits(scheduledPriceRaw),
                      })}
                    </span>
                  )}
                  {errors.start_date && (
                    <span className="courses-modal__error">{errors.start_date}</span>
                  )}
                </div>
              </div>

              <div className="courses-modal__field courses-modal__field--full">
                <label htmlFor="cm-comment" className="courses-modal__label">
                  {t('course.comment')}
                </label>
                <textarea
                  id="cm-comment"
                  name="comment"
                  className="courses-modal__textarea"
                  value={form.comment}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Izoh yozing..."
                  disabled={isSaving}
                />
              </div>
            </>
          )}
        </div>

        <div className="courses-modal__footer">
          <button
            type="button"
            className="courses-modal__btn courses-modal__btn--save"
            onClick={handleSave}
            disabled={isSaving || isLoadingData}
          >
            {isSaving ? t('course.savingBtn') : t('course.saveBtn')}
          </button>
          <button
            type="button"
            className="courses-modal__btn courses-modal__btn--cancel"
            onClick={onClose}
            disabled={isSaving}
          >
            {t('course.cancelBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
