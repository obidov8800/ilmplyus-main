import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { API, type SilentForbiddenConfig } from '@/api/api';
import { fetchOptions, optionsQueryKey, type Option, type OptionEntity } from '@/api/options';
import { usePermission } from '@/hooks/usePermission';
import { useCanSeeAll } from '@/hooks/useCanSeeAll';
import type { Course } from '@/types/course.types';
import type { Group, Room, Teacher } from '@/types/group.types';
import type { Branch } from '@/types/user.types';
import { useOwnTeacher } from './useOwnTeacher';

/**
 * Guruhlar ro'yxati — kunlari (`days`), vaqti va xonasi bilan. Dars jadvali, Darslar, Demo dars, Davomat va
 * ro'yxatga olish oynasi shu bitta joydan oladi.
 *
 * Manba so'rovdan OLDIN ruxsatga qarab tanlanadi («ruxsati yo'q so'rov yuborilmaydi»):
 *  1) `groups.view` bor — `GET /groups`: to'liq ro'yxat, bitta so'rov.
 *  2) yo'q — `/options/groups` (+ `employees|courses|branches|rooms` nomlari), `lookups.view` bilan. Boshqa bo'lim
 *     ruxsati (`groups.show`) ishlatilmaydi: kunlar `/options/groups` da bo'lmasa (backend B4 gacha) — `daysMissing`.
 *  3) `/options` ham 403 — `blocked` (sahifa sababini tushuntiradi).
 * Qamrov («o'z guruhlari» yoki hammasi) — `scope` bo'limi bo'yicha `canSeeAll` (`permissions/scope.ts`).
 */

const quiet: SilentForbiddenConfig = { skip403Toast: true };

export type GroupsParams = Record<string, string | number | undefined>;

type LiteGroup = Group & { daysKnown?: boolean };

export interface GroupsDataOptions {
  /** `/groups` parametrlari (zaxira yo'lida shulardan `/options/groups` qo'llaydiganlari olinadi). */
  params?: GroupsParams;
  enabled?: boolean;
  /**
   * Qamrov qaysi bo'lim bo'yicha (`lessons_schedules`, `lessons`, `student_attendance`, `demo_lessons`…): `canSeeAll`
   * `false` bo'lsa faqat O'Z guruhlari. Berilmasa — qamrovsiz (masalan lidni guruhga yozish oynasi).
   */
  scope?: string;
  staleTime?: number;
}

const isForbidden = (err: unknown) => (err as { response?: { status?: number } })?.response?.status === 403;

const OPTION_GROUP_FILTERS = ['branch_id', 'academic_year_id', 'course_id', 'level_id', 'teacher_id', 'limit', 'search'];

function optionParams(params?: GroupsParams) {
  if (!params) return undefined;
  return Object.fromEntries(Object.entries(params).filter(([key]) => OPTION_GROUP_FILTERS.includes(key)));
}

async function fetchFull(params?: GroupsParams): Promise<Group[]> {
  const res = await API.get('/groups', { ...quiet, params });
  const data = res.data;
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.data) ? data.data : [];
}

/** `lookups.view` bilan: guruhlar va ularning o'qituvchi/kurs/filial/xona nomlari (hammasi bir-biridan mustaqil keshlanadi). */
async function fetchLite(qc: QueryClient, params?: GroupsParams): Promise<LiteGroup[]> {
  const shared = (entity: OptionEntity) =>
    qc.fetchQuery({ queryKey: optionsQueryKey(entity), queryFn: () => fetchOptions(entity, undefined, quiet), staleTime: 15 * 1000 });

  const [rows, employees, courses, branches, rooms] = await Promise.all([
    fetchOptions('groups', optionParams(params), quiet),
    shared('employees'),
    shared('courses'),
    shared('branches'),
    shared('rooms'),
  ]);
  const byId = (list: Option[]) => new Map(list.map((o) => [o.id, o]));
  const employeeById = byId(employees);
  const courseById = byId(courses);
  const branchById = byId(branches);
  const roomById = byId(rooms);

  return rows.map((row) => {
    const r = row as Option & { days?: unknown[]; start_time?: string; end_time?: string; duration?: number; academic_year_id?: number | null };
    const teacher = r.teacher_id ? employeeById.get(r.teacher_id) : undefined;
    const course = r.course_id ? courseById.get(r.course_id) : undefined;
    const branch = r.branch_id ? branchById.get(r.branch_id) : undefined;
    const room = r.room_id ? roomById.get(r.room_id) : undefined;
    const days = Array.isArray(r.days)
      ? r.days.map((d) => String(typeof d === 'object' && d ? ((d as { day?: string }).day ?? '') : d))
      : undefined;
    return {
      id: r.id,
      name: r.label,
      branch: branch
        ? ({ id: branch.id, name_uz: branch.label, name: branch.label } as unknown as Branch)
        : ({ id: r.branch_id } as Branch),
      academic_year_id: r.academic_year_id ?? null,
      course: course ? ({ id: course.id, name_uz: course.label, name: course.label } as unknown as Course) : null,
      level: r.level_id ? ({ id: r.level_id } as unknown as Group['level']) : null,
      teacher: r.teacher_id
        ? ({ id: r.teacher_id, first_name: teacher?.label ?? '', last_name: '' } as unknown as Teacher)
        : null,
      room: room ? ({ id: room.id, name: room.label, name_uz: room.label, floor: room.floor } as unknown as Room) : null,
      duration: r.duration ?? 0,
      max_students: 0,
      start_date: null,
      end_date: null,
      start_time: r.start_time ?? '',
      end_time: r.end_time ?? '',
      days: days ?? [],
      daysKnown: days !== undefined,
    } as unknown as LiteGroup;
  });
}

export function useGroupsData({ params, enabled = true, scope, staleTime = 30 * 1000 }: GroupsDataOptions = {}) {
  const qc = useQueryClient();
  const canViewGroups = usePermission('groups.view');
  const canUseOptions = usePermission('lookups.view');
  const seeAll = useCanSeeAll(scope ?? 'groups');
  const { isOwnTeacher } = useOwnTeacher();
  const paramsKey = JSON.stringify(params ?? {});

  const full = useQuery({
    queryKey: ['groups', 'data', 'full', paramsKey],
    queryFn: () => fetchFull(params),
    enabled: enabled && canViewGroups,
    retry: false,
    staleTime,
  });

  const lite = useQuery({
    queryKey: ['groups', 'data', 'lite', paramsKey],
    queryFn: () => fetchLite(qc, params),
    enabled: enabled && !canViewGroups && canUseOptions,
    retry: false,
    staleTime,
  });

  const base = useMemo<LiteGroup[]>(
    () => (canViewGroups ? (full.data ?? []) : (lite.data ?? [])),
    [canViewGroups, full.data, lite.data],
  );
  const ownOnly = !!scope && !seeAll;
  const groups = useMemo<Group[]>(
    () => (ownOnly ? base.filter((g) => isOwnTeacher(g.teacher)) : base),
    [ownOnly, base, isOwnTeacher],
  );

  const blocked = !canViewGroups && (!canUseOptions || isForbidden(lite.error));
  // `/options/groups` dars kunlarini hali bermaydi (backend B4) — jadval kunlarsiz qoladi, sahifa sababini aytadi.
  const daysMissing = !canViewGroups && !blocked && base.some((g) => !g.daysKnown);
  // Guruhlar hali kelayotgan bo'lsa — sahifa «bo'sh» deb yozmaydi.
  const isPending = enabled && !blocked && (canViewGroups ? full.isPending : lite.isPending);

  return { groups, ownOnly, blocked, daysMissing, isPending };
}
