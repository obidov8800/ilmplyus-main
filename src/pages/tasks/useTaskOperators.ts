import { useOptions, type Option } from '@/api/options';
import useAuthStore from '@/store/useAuthStore';

/** Vazifa biriktiriladigan foydalanuvchi; `task.operator_id` — `users.id`. */
export interface TaskOperator {
  userId: number;
  fullName: string;
  /** Ro'yxatlarda ko'rsatiladigan qisqa nom: «Familiya Ism». */
  shortName: string;
}

function toShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return `${parts[0] ?? ''} ${parts[1] ?? ''}`.trim();
}

export function useTaskOperators() {
  const user = useAuthStore((s) => s.user);

  const { data: users, isLoading } = useOptions('users');
  const operators: TaskOperator[] = (users ?? [])
    .map((operator: Option) => ({
      userId: operator.id,
      fullName: operator.label || '',
      shortName: toShortName(operator.label || ''),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    operators,
    currentUserId: user?.id ?? 0,
    isLoading,
  };
}
