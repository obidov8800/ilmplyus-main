import { API } from '@/api/api';
import { safeLastPage, safeList, safeTotal, type RawList } from '@/api/normalize';
import type { Group, GroupCreatePayload, GroupStudent, GroupsResult } from '@/types/group.types';

/**
 * Guruhlar bo'limining API qatlami.
 *
 * Eslatma: filial / kurs / xona / xodim selectlari uchun bu yerda funksiya yo'q —
 * ular `@/api/options` dagi `useOptions` orqali `/options/{entity}` dan olinadi
 * va faqat `lookups.view` ruxsatini talab qiladi.
 */

// ── Guruhlar ──────────────────────────────────────────────────────────────────

/**
 * Guruhlar ro'yxati, `id` bo'yicha tartiblangan.
 * `params` berilmasa backend o'zining standart sahifasini qaytaradi.
 */
export async function fetchGroups(params?: {
  page?: number;
  limit?: number;
}): Promise<GroupsResult> {
  // Backend `per_page` kutadi — boshqa hech bir endpoint `limit` deb qabul
  // qilmaydi. `limit` shu bilan bir vaqtda ham yuboriladi (orqaga moslik uchun,
  // agar kimdir shu nomga tayangan bo'lsa), lekin asosiysi `per_page`.
  const { page, limit } = params ?? {};
  const { data } = await API.get<RawList<Group>>('/groups', {
    params: { page, per_page: limit, limit },
  });

  const groups = safeList<Group>(data).sort((a, b) => a.id - b.id);

  return {
    groups,
    lastPage: safeLastPage(data, 1),
    total: safeTotal(data, groups.length),
  };
}

/** Sahifalashsiz to'liq ro'yxat — xona/o'qituvchi bandligini tekshirish uchun. */
export async function fetchAllGroups(): Promise<Group[]> {
  const { data } = await API.get<RawList<Group>>('/groups');
  return safeList<Group>(data);
}

// ── Guruh mutatsiyalari ───────────────────────────────────────────────────────

export async function createGroup(payload: GroupCreatePayload): Promise<void> {
  await API.post('/groups', payload);
}

export async function updateGroup(id: number, payload: GroupCreatePayload): Promise<void> {
  await API.put(`/groups/${id}`, payload);
}

export async function deleteGroup(id: number): Promise<void> {
  await API.delete(`/groups/${id}`);
}

// ── Guruh o'quvchilari ────────────────────────────────────────────────────────

/** Backend guruh bo'yicha filtrlamaydi, shuning uchun ro'yxat frontendda filtrlanadi. */
export async function fetchGroupStudents(groupId: number): Promise<GroupStudent[]> {
  const { data } = await API.get<RawList<GroupStudent>>('/students');

  return safeList<GroupStudent>(data).filter((s) =>
    s.groups?.some((g) => g.id === groupId || g.pivot?.group_id === groupId),
  );
}
