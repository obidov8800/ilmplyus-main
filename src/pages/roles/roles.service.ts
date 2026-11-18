import { API } from '../../api/api';

export interface Permission {
  id: number;
  name: string;
}

export interface Role {
  id: number;
  name: string;
  permissions: Permission[];
}

/**
 * Tizimdagi barcha ruxsatlar. `permissions.view` bo'lsa `/permissions`, bo'lmasa tanlov ro'yxati `/options/permissions`
 * (`lookups.view`, backend stage15 B4) — Rollar sahifasi uchun `roles.*` yetadi.
 */
export const fetchPermissions = async (canViewPermissions = true): Promise<Permission[]> => {
  if (!canViewPermissions) {
    const { data } = await API.get('/options/permissions', { skip403Toast: true } as object);
    const rows: { id: number; label: string }[] = Array.isArray(data) ? data : (data?.data ?? []);
    return rows.map((row) => ({ id: row.id, name: row.label }));
  }
  const { data } = await API.get<Permission[]>('/permissions');
  return data;
};

export const fetchRoles = async (): Promise<Role[]> => {
  const { data } = await API.get<Role[]>('/roles');
  return data;
};

export const syncRolePermissions = async (
  roleId: number,
  permissionIds: number[],
): Promise<void> => {
  await API.post(`/roles/${roleId}/permissions`, { permissions: permissionIds });
};
