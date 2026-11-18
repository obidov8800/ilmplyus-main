import type { FineStatus } from './types';

/** `new` | `accepted` | `cancelled` — filtr selecti va badge uchun. */
export const FINE_STATUSES: FineStatus[] = ['new', 'accepted', 'cancelled'];

export function statusI18nKey(status: FineStatus | string | undefined): string {
  return `penalties.status.${status || 'new'}`;
}

export function statusClass(status: FineStatus | string | undefined): string {
  switch (status) {
    case 'accepted':
      return 'pen-status--accepted';
    case 'cancelled':
      return 'pen-status--cancelled';
    default:
      return 'pen-status--new';
  }
}

/** Qabul/bekor qilish va tahrirlash faqat `new` holatida mumkin. */
export const isEditable = (status: FineStatus | string) => status === 'new';

export const FINE_PERMISSIONS = {
  view: 'employee_fines.view',
  create: 'employee_fines.create',
  edit: 'employee_fines.edit',
  accept: 'employee_fines.accept',
  cancel: 'employee_fines.cancel',
} as const;

export const FINE_TYPE_PERMISSIONS = {
  view: 'fine_types.view',
  create: 'fine_types.create',
  edit: 'fine_types.edit',
  delete: 'fine_types.delete',
} as const;
