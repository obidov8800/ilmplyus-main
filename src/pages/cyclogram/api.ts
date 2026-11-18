/* ------------------------------------------------------------------ *
 * Siklogramma — tashkilotning yillik tadbirlar ro'yxati (har yili shu oy va kunda takrorlanadi).
 *
 * Manba Markaziy ofisning marketing tizimi, lekin u FAQAT server-server ishlaydi (kalit IP'ga bog'langan).
 * Backend (`cyclogram:sync`, har soatda) ro'yxatni o'z bazasiga ko'chiradi va shu yerga beradi:
 *
 *   GET /cyclogram-events   ?month=1..12 (ixtiyoriy)   — ruxsat: `tasks.view`
 *   → { data: [{ id, name, participants, month, day, updated_at }], organization: { name, ... } }
 *
 * Bazadagi nusxa o'zi kesh vazifasini bajaradi — frontend alohida kesh SAQLAMAYDI: sahifa har ochilganda
 * (va oynaga qaytganda) ro'yxat serverdan yangidan olinadi.
 * ------------------------------------------------------------------ */
import { useQuery } from '@tanstack/react-query';
import { API, type SilentForbiddenConfig } from '@/api/api';

export interface CyclogramEvent {
  id: number;
  name: string;
  /** Qatnashuvchilar — erkin matn, bir necha qator bo'lishi mumkin. */
  participants: string | null;
  /** 1–12 (1 = yanvar). */
  month: number;
  /** 1–31; `null` — tadbir butun oyga tegishli. */
  day: number | null;
  updated_at: string | null;
}

export interface CyclogramOrganization {
  name?: string;
  short_code?: string;
  full_name_uz?: string;
  full_name_ru?: string;
}

export interface CyclogramData {
  events: CyclogramEvent[];
  organization: CyclogramOrganization | null;
  /** Ro'yxatdagi eng so'nggi `updated_at` — «oxirgi yangilanish» uchun. */
  updatedAt: string | null;
}

type Raw = Record<string, unknown>;

function toEvent(raw: Raw): CyclogramEvent | null {
  const id = Number(raw.id);
  const month = Number(raw.month);
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!Number.isFinite(id) || !name || !Number.isInteger(month) || month < 1 || month > 12) return null;

  const day = raw.day === null || raw.day === undefined || raw.day === '' ? null : Number(raw.day);
  const participants = typeof raw.participants === 'string' ? raw.participants.trim() : '';

  return {
    id,
    name,
    participants: participants || null,
    month,
    day: day !== null && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  };
}

/** Oy, keyin kun; kuni yo'q tadbirlar oy oxirida, keyin nomi bo'yicha (API tartibi bilan bir xil). */
export function sortEvents(list: CyclogramEvent[]): CyclogramEvent[] {
  return [...list].sort(
    (a, b) =>
      a.month - b.month ||
      (a.day ?? 99) - (b.day ?? 99) ||
      a.name.localeCompare(b.name, 'uz'),
  );
}

export async function fetchCyclogram(): Promise<CyclogramData> {
  // Sahifa xatoni o'zi tushunarli ko'rsatadi (qayta urinish tugmasi bilan) — global toast takrorlanmasin.
  const config: SilentForbiddenConfig = { skip403Toast: true };
  const { data } = await API.get('/cyclogram-events', config);

  const rawList: unknown = Array.isArray(data) ? data : (data as Raw | null)?.data;
  const events = sortEvents(
    (Array.isArray(rawList) ? (rawList as Raw[]) : [])
      .map(toEvent)
      .filter((e): e is CyclogramEvent => e !== null),
  );

  const organization = (data as Raw | null)?.organization;
  const updatedAt = events.reduce<string | null>(
    (latest, e) => (e.updated_at && (!latest || e.updated_at > latest) ? e.updated_at : latest),
    null,
  );

  return {
    events,
    organization: organization && typeof organization === 'object' ? (organization as CyclogramOrganization) : null,
    updatedAt,
  };
}

/** Kesh yo'q (`staleTime/gcTime: 0`): backend bazasidagi nusxa tez, shuning uchun har ochilganda yangi ro'yxat olinadi. */
export function useCyclogram() {
  return useQuery({
    queryKey: ['cyclogram-events'],
    queryFn: fetchCyclogram,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/** Tadbirning shu yildagi sanasi. 29-fevral kabisa bo'lmagan yilda 28-fevralga o'tadi. */
export function eventDate(event: CyclogramEvent, year: number): Date {
  const lastDay = new Date(year, event.month, 0).getDate();
  return new Date(year, event.month - 1, Math.min(event.day ?? 1, lastDay));
}

/**
 * Bugundan keyingi eng yaqin takrorlanish. Butun oyga tegishli tadbir (`day: null`) joriy oyda
 * «davom etmoqda» — sanasi bugun deb olinadi.
 */
export function nextOccurrence(event: CyclogramEvent, today: Date): { date: Date; ongoing: boolean } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (event.day === null && event.month === start.getMonth() + 1) {
    return { date: start, ongoing: true };
  }

  const thisYear = eventDate(event, start.getFullYear());
  const date = thisYear >= start ? thisYear : eventDate(event, start.getFullYear() + 1);
  return { date, ongoing: false };
}
