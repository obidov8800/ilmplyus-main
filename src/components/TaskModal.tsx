import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API } from '@/api/api';
import DateInput from '@/components/DateInput';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { useCreateMutation, useUpdateMutation } from '@/hooks/useMutations';
import { useTaskOperators, type TaskOperator } from '@/pages/tasks/useTaskOperators';
import type {
  Task,
  TaskPriority as Priority,
  CreateTaskPayload,
  UpdateTaskPayload,
} from '@/types/task.types';
import type { Lid as LidResult } from '@/types/lid.types';

interface TaskModalProps {
  onClose: () => void;
  editTask?: Task;
  initialLidId?: number;
  initialLidName?: string;
}

const PRIORITY_OPTIONS: { label: string; value: Priority }[] = [
  { label: 'Shoshilinch', value: 'shoshilinch' },
  { label: 'O‘rta', value: 'orta' },
  { label: 'Sekin', value: 'sekin' },
];

function deadlineToInputs(deadline: string): { date: string; time: string } {
  const d = new Date(deadline);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function buildDeadline(date: string, time: string): string {
  // ISO string generates zero-offset (UTC) time which causes issues when backend treats it blindly.
  // We send the specific time format as-is to preserve local GMT+5 hour value.
  return `${date} ${time}:00`;
}

function isValidTime(time: string): boolean {
  if (!time.includes(':')) return false;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  if (h > 23 || m > 59) return false;
  return true;
}

function getShortName(full_name: string): string {
  const parts = full_name.trim().split(' ');
  return `${parts[0] ?? ''} ${parts[1] ?? ''}`.trim();
}

export default function TaskModal({
  onClose,
  editTask,
  initialLidId,
  initialLidName,
}: TaskModalProps) {
  const { t } = useTranslation();
  const isEdit = !!editTask;

  const [comment, setComment] = useState(isEdit ? (editTask?.description ?? '') : '');

  const [lidSearch, setLidSearch] = useState(
    isEdit ? `${editTask.lid.first_name} ${editTask.lid.last_name}` : (initialLidName ?? ''),
  );

  const [selectedLidId, setSelectedLidId] = useState<number | null>(
    isEdit ? editTask.lid_id : (initialLidId ?? null),
  );

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [priority, setPriority] = useState<Priority>(isEdit ? editTask.priority : 'orta');

  const defaultInputs = isEdit ? deadlineToInputs(editTask.deadline) : { date: '', time: '' };

  const [date, setDate] = useState(defaultInputs.date);
  const [time, setTime] = useState(defaultInputs.time);
  const [timeError, setTimeError] = useState(false);

  const [operatorId, setOperatorId] = useState<number | ''>(isEdit ? editTask.operator_id : '');
  const [operatorPicked, setOperatorPicked] = useState(isEdit);

  const { operators, currentUserId } = useTaskOperators();

  const selectedOperatorId: number | '' = operatorPicked ? operatorId : currentUserId || '';

  /**
   * Vazifa biriktirilgan xodim ro'yxatda bo'lmasligi mumkin (masalan uning
   * foydalanuvchi hisobi o'chirilgan) — bunday holatda u vazifadan olinib qo'shiladi,
   * aks holda tahrirlashda tanlov bo'sh ko'rinib, saqlashda boshqa odamga o'tib ketardi.
   */
  const operatorChoices = useMemo<TaskOperator[]>(() => {
    if (!isEdit || operators.some((o) => o.userId === editTask.operator_id)) return operators;

    const fullName = editTask.operator?.full_name ?? '';
    return [
      {
        userId: editTask.operator_id,
        fullName,
        shortName: getShortName(fullName),
      },
      ...operators,
    ];
  }, [isEdit, editTask, operators]);

  const { data: lidData, isLoading: isLidsLoading } = useQuery<any, Error>({
    queryKey: ['lids', lidSearch],
    queryFn: () => API.get('/lids', { params: { search: lidSearch } }).then((r) => r.data),
    enabled: !selectedLidId,
  });

  const lidResults: LidResult[] = Array.isArray(lidData)
    ? lidData
    : Array.isArray(lidData?.data)
      ? lidData.data
      : (lidData?.data?.data ?? []);

  const createMutation = useCreateMutation<any, Error, CreateTaskPayload>(
    (payload) => API.post('/tasks', payload),
    [['tasks']],
  );

  const updateMutation = useUpdateMutation<any, Error, UpdateTaskPayload>(
    (payload) => API.put(`/tasks/${editTask!.id}`, payload),
    [['tasks']],
  );

  const handleTimeInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    let formatted = digits;

    if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    }

    setTime(formatted);

    if (formatted.length === 5) {
      setTimeError(!isValidTime(formatted));
    } else {
      setTimeError(false);
    }
  };

  const handleSelectLid = (lid: LidResult) => {
    setSelectedLidId(lid.id);
    setLidSearch(`${lid.first_name} ${lid.last_name}`);
    setShowSuggestions(false);
  };

  const handleSubmit = () => {
    if (!date || !time || timeError) {
      notifications.show({
        title: t('taskModal.errors.title'),
        message: t('taskModal.errors.dateTime'),
        color: 'red',
      });
      return;
    }
    if (!comment.trim()) {
      notifications.show({
        title: t('taskModal.errors.title'),
        message: t('taskModal.errors.comment'),
        color: 'red',
      });
      return;
    }
    if (selectedOperatorId === '') {
      notifications.show({
        title: t('taskModal.errors.title'),
        message: t('taskModal.errors.operator'),
        color: 'red',
      });
      return;
    }

    const finalOperatorId = selectedOperatorId;
    const deadline = buildDeadline(date, time);

    if (isEdit) {
      updateMutation.mutate(
        {
          priority,
          deadline,
          operator_id: finalOperatorId,
          description: comment,
        },
        { onSuccess: onClose },
      );
      return;
    }

    if (!selectedLidId) {
      notifications.show({
        title: t('taskModal.errors.title'),
        message: t('taskModal.errors.lid'),
        color: 'red',
      });
      return;
    }

    createMutation.mutate(
      {
        lid_id: selectedLidId,
        operator_id: finalOperatorId,
        deadline,
        priority,
        description: comment,
      },
      { onSuccess: onClose },
    );
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="modal-overlay">
      <div className="modal modal--form">
        <div className="modal__title">
          {isEdit ? t('taskModal.editTitle') : t('taskModal.createTitle')}
        </div>

        {!isEdit && (
          <div className="modal__field">
            <label className="modal__label">{t('taskModal.selectLid')}</label>

            <div className="modal__search-wrap">
              <input
                className="modal__input"
                placeholder={t('taskModal.lidPlaceholder')}
                value={lidSearch}
                onChange={(e) => {
                  setLidSearch(e.target.value);
                  setSelectedLidId(null);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              />

              <span className="modal__search-icon">🔍</span>

              {showSuggestions && (
                <div className="modal__suggestions">
                  {isLidsLoading ? (
                    <div
                      className="modal__suggestion-item"
                      style={{ color: '#888', cursor: 'default' }}
                    >
                      {t('taskModal.loading')}
                    </div>
                  ) : lidResults.length > 0 ? (
                    lidResults.map((lid) => (
                      <div
                        key={lid.id}
                        className="modal__suggestion-item"
                        onMouseDown={() => handleSelectLid(lid)}
                      >
                        {lid.first_name} {lid.last_name} — ID: {lid.id}
                      </div>
                    ))
                  ) : (
                    <div
                      className="modal__suggestion-item"
                      style={{ color: '#888', cursor: 'default' }}
                    >
                      {t('taskModal.noData')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal__field">
          <label className="modal__label">{t('taskModal.priority')}</label>

          <div className="modal__priority-group">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`modal__priority-btn${priority === opt.value ? ' active' : ''}`}
                onClick={() => setPriority(opt.value)}
                type="button"
              >
                {t(`taskModal.priorityOptions.${opt.value}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="modal__row">
          <div className="modal__field">
            <label className="modal__label">{t('taskModal.date')}</label>

            <DateInput
              className="modal__input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="modal__field">
            <label className="modal__label">{t('taskModal.time')}</label>

            <input
              className={`modal__input${timeError ? ' modal__input--error' : ''}`}
              placeholder="10:00"
              value={time}
              onChange={(e) => handleTimeInput(e.target.value)}
              maxLength={5}
            />
          </div>
        </div>

        <div className="modal__field">
          <label className="modal__label">{t('taskModal.operator')}</label>

          <select
            className="modal__select"
            value={selectedOperatorId}
            onChange={(e) => {
              setOperatorPicked(true);
              setOperatorId(e.target.value === '' ? '' : Number(e.target.value));
            }}
          >
            <option value="">{t('taskModal.selectOperator')}</option>

            {operatorChoices.map((o) => (
              <option key={o.userId} value={o.userId}>
                {o.shortName}
              </option>
            ))}
          </select>
        </div>

        <div className="modal__field">
          <label className="modal__label">{t('taskModal.comment')}</label>

          <textarea
            className="modal__textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 20 }}>
          <button className="modal__save-btn" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? t('taskModal.saving') : t('taskModal.saveBtn')}
          </button>
          <button className="modal__close" onClick={onClose}>
            {t('taskModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
