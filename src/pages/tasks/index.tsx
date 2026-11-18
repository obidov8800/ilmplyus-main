import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TaskCard from '@/components/TaskCard';
import TaskModal from '@/components/TaskModal';
import './tasks.css';
import { API } from '@/api/api';
import { Protected } from '@/components/Protected';
import { usePermission } from '@/hooks/usePermission';
import { useTaskOperators } from './useTaskOperators';
import { sortByNewest } from '@/utils/sortByNewest';
import type { Task, TaskStatus } from '@/types/task.types';

type FilterStatus = 'barchasi' | TaskStatus;

const FILTER_OPTIONS: { value: FilterStatus }[] = [
  { value: 'barchasi' },
  { value: 'bajarish' },
  { value: 'bajarildi' },
  { value: 'bajarilmadi' },
];

export default function Tasks() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('barchasi');
  const [operatorFilter, setOperatorFilter] = useState<number | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>(undefined);

  /**
   * Ilgari ko'rinish rol NOMIga qarab tanlanardi (`roles[].name === 'operator'`),
   * ya'ni backendda rol nomi o'zgarsa sahifa buzilardi. Endi faqat ruxsat:
   * vazifa yarata oladigan foydalanuvchi — boshqaruvchi (barcha vazifalar, operator
   * filtri, yaratish tugmasi), qolganlar esa faqat o'ziga biriktirilganini ko'radi.
   */
  const canManage = usePermission('tasks.create');

  const { operators, currentUserId, isLoading: operatorsLoading } = useTaskOperators();

  const effectiveOperatorFilter = canManage ? operatorFilter : currentUserId;

  const {
    data: tasksRaw,
    isLoading,
    isError,
  } = useQuery<Task[], Error>({
    queryKey: ['tasks'],
    queryFn: () =>
      API.get('/tasks').then((r) => {
        const responseData = r.data;
        if (Array.isArray(responseData)) return responseData;
        if (Array.isArray(responseData?.data)) return responseData.data;
        return [];
      }),
  });

  // O'z vazifalarini ko'rsatish uchun xodim id'si kerak — u kelguncha «vazifa yo'q»
  // deb ko'rsatmaymiz, aks holda ro'yxat bir zumga bo'sh bo'lib chaqnaydi.
  const showLoading = isLoading || (!canManage && operatorsLoading);

  const filteredTasks: Task[] = sortByNewest(
    (tasksRaw ?? []).filter((task) => {
      const statusMatch = activeFilter === 'barchasi' || task.status === activeFilter;
      const operatorMatch =
        effectiveOperatorFilter === '' || task.operator_id === Number(effectiveOperatorFilter);
      return statusMatch && operatorMatch;
    }),
  );

  const handleOpenCreate = () => {
    setEditTask(undefined);
    setModalOpen(true);
  };

  const handleOpenEdit = (task: Task) => {
    setEditTask(task);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditTask(undefined);
  };

  const statusFilters = (
    <div className="tasks-filters">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`tasks-filter-btn${activeFilter === opt.value ? ' active' : ''}`}
          onClick={() => setActiveFilter(opt.value)}
        >
          {t(`tasks.filter.${opt.value}`)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="tasks container">
      {canManage ? (
        <div className="tasks-top">
          <div className="tasks-top-left">
            {statusFilters}

            <select
              className="tasks-operator-select"
              value={operatorFilter}
              onChange={(e) =>
                setOperatorFilter(e.target.value === '' ? '' : Number(e.target.value))
              }
            >
              <option value="">{t('tasks.allOperators')}</option>

              {operators.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.shortName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Protected permission="tasks.create">
              <button className="tasks-create-btn" onClick={handleOpenCreate}>
                {t('tasks.createTask')}
              </button>
            </Protected>
          </div>
        </div>
      ) : (
        <div className="tasks-top tasks-top--operator">
          <h2 className="tasks-title">{t('tasks.taskList')}</h2>

          <div className="tasks-top-right">{statusFilters}</div>
        </div>
      )}

      {showLoading && <div className="tasks-state loading">{t('tasks.loading')}</div>}

      {isError && <div className="tasks-state error">{t('tasks.error')}</div>}

      {!showLoading && !isError && filteredTasks.length === 0 && (
        <div className="tasks-state">{t('tasks.noTasks')}</div>
      )}

      {!showLoading && !isError && filteredTasks.length > 0 && (
        <div className="tasks-content">
          {filteredTasks?.map((task) => (
            <TaskCard key={task.id} task={task} canManage={canManage} onEdit={handleOpenEdit} />
          ))}
        </div>
      )}

      {modalOpen && <TaskModal onClose={handleCloseModal} editTask={editTask} />}
    </div>
  );
}
