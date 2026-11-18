import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPermissions, fetchRoles, syncRolePermissions } from './roles.service';
import type { Role, Permission } from './roles.service';
import './roles.css';
import InfoHint from '@/components/InfoHint';
import { GENERAL_RULES_HINT, buildGroupHint } from '@/permissions/permissionCatalog';
import {
  indexPermissions,
  isHiddenPermission,
  isKeptHiddenPermission,
  namesOf,
  rowEntries,
  type ModuleRow,
} from '@/permissions/permissionPolicy';
import { finalizeForSave } from '@/permissions/permissionDeps';
import PermissionMatrix from './PermissionMatrix';
import { usePermission } from '@/hooks/usePermission';
import { actionLabel, moduleLabel } from './permissionLabels';

const renderInfo = (row: ModuleRow) => (
  <InfoHint wide text={buildGroupHint(row.module, rowEntries(row).map((entry) => entry.action))} />
);

const RoleManagement = () => {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: fetchRoles,
  });

  const canViewPermissions = usePermission('permissions.view');
  const { data: permissions = [], isLoading: permsLoading } = useQuery<Permission[]>({
    queryKey: ['permissions', canViewPermissions],
    queryFn: () => fetchPermissions(canViewPermissions),
  });

  const syncMutation = useMutation({
    mutationFn: ({ roleId, ids }: { roleId: number; ids: number[] }) => syncRolePermissions(roleId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const { entries, byName } = useMemo(() => indexPermissions(permissions), [permissions]);
  const exists = useCallback((name: string) => byName.has(name), [byName]);

  // Rolning saqlangan ruxsatlari (barchasi) va matritsada ko'rinadiganlari (yashirin/eskirganlarsiz).
  const roleNames = useMemo(() => namesOf(selectedRole?.permissions), [selectedRole]);
  const visibleOf = useCallback(
    (names: Set<string>) => new Set([...names].filter((name) => byName.has(name) && !isHiddenPermission(name))),
    [byName],
  );
  const savedSelected = useMemo(() => visibleOf(roleNames), [visibleOf, roleNames]);
  // Saqlanmagan o'zgarishlar: qo'shilgan + olib tashlangan ruxsatlar.
  const changes =
    [...selected].filter((name) => !savedSelected.has(name)).length +
    [...savedSelected].filter((name) => !selected.has(name)).length;

  const handleRoleSelect = (role: Role) => {
    setSelectedRoleId(role.id);
    setSelected(visibleOf(namesOf(role.permissions)));
  };

  const handleSave = () => {
    if (selectedRoleId === null) return;
    // `lookups.view` avtomatik, eskirganlar tushadi, yashirin `permissions.*` saqlanib qoladi.
    const kept = [...roleNames].filter(isKeptHiddenPermission);
    const final = finalizeForSave([...selected, ...kept], exists);
    const ids = [...final].map((name) => byName.get(name)?.id).filter((id): id is number => typeof id === 'number');
    syncMutation.mutate({ roleId: selectedRoleId, ids });
  };

  return (
    <section className="roles container">
      <div className="roles-header">
        <h1>
          Rollar va Ruxsatlar
          {/* Undov (!) — ruxsatlar qanday ishlashi haqida umumiy qoidalar. */}
          <InfoHint wide text={GENERAL_RULES_HINT} />
        </h1>
      </div>

      <div className="roles-layout">
        <div className="roles-sidebar">
          <h2>Rollar</h2>
          {rolesLoading ? (
            <p className="roles-loading">Yuklanmoqda...</p>
          ) : (
            <ul className="roles-list">
              {roles.map((role) => (
                <li
                  key={role.id}
                  className={`roles-list__item ${selectedRoleId === role.id ? 'active' : ''}`}
                  onClick={() => handleRoleSelect(role)}
                >
                  <span className="roles-list__icon">
                    <i className="fa-solid fa-user-shield" />
                  </span>
                  <span className="roles-list__name">{role.name}</span>
                  <span className="roles-list__badge">{role.permissions.length}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="roles-permissions">
          {selectedRole ? (
            <>
              <div className="roles-permissions__header">
                <div>
                  <h2>{selectedRole.name}</h2>
                  <p>{selected.size} ta ruxsat tanlangan</p>
                </div>
              </div>

              {permsLoading ? (
                <p className="roles-loading">Yuklanmoqda...</p>
              ) : (
                <PermissionMatrix
                  entries={entries}
                  selected={selected}
                  onChange={setSelected}
                  saved={savedSelected}
                  moduleLabel={moduleLabel}
                  actionLabel={actionLabel}
                  renderInfo={renderInfo}
                />
              )}

              <div className="pm-savebar" role="region" aria-label="Saqlash paneli">
                <div className="pm-savebar__info">
                  {changes > 0 ? (
                    <span className="pm-savebar__dirty">
                      <b>{changes} ta o‘zgarish saqlanmagan</b>
                    </span>
                  ) : (
                    <span>O‘zgarish yo‘q</span>
                  )}
                  {' · '}jami {selected.size} ta ruxsat belgilangan
                </div>
                {changes > 0 && (
                  <button type="button" className="pm-btn" onClick={() => setSelected(savedSelected)} disabled={syncMutation.isPending}>
                    Bekor qilish
                  </button>
                )}
                <button type="button" className="roles-save-btn" onClick={handleSave} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" /> Saqlanmoqda...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-floppy-disk" /> Saqlash
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="roles-empty">
              <i className="fa-solid fa-hand-pointer" />
              <p>Rolni tanlang</p>
              <span>Ruxsatlarni boshqarish uchun chap tomondagi roldan birini tanlang</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default RoleManagement;
