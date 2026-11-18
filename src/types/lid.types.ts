import type { BaseEntity, PaginatedResponse } from "./common.types";
import type { Region } from "./region.types";
import type { District } from "./district.types";
import type { Branch } from "./user.types";
import type { Course, CourseLevel, CoursePrice } from "./course.types";
import type { Group } from "./group.types";
import { getLocalized } from "@/utils/getLocalized";

export interface LidSource extends BaseEntity {
  name: string;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
  link?: string;
}

export interface LidOperator extends BaseEntity {
  full_name: string;
  username: string;
  phone: string;
}

export const LID_STATUS = {
  NEW_ONLINE: 1, // Onlayn
  NEW_OFFLINE: 2, // Ofline
  CONTACTED: 3, // O‘rnatildi
  NOT_CONTACTED: 4, // O‘rnatilmadi
  NOT_INTERESTED: 5, // Qiziqmadi
  DEMO_SCHEDULED: 6, // Kelmoqchi
  DEMO_ATTENDED: 7, // Keldi
  DEMO_MISSED: 8, // Kelmadi
  CONTRACT_SIGNED: 9, // Shartnoma
  PAID: 10, // To‘lov
} as const;

export type LidStatus = (typeof LID_STATUS)[keyof typeof LID_STATUS];

/**
 * Lidning "qiziqish rangi" belgisi — operator/menejer tomonidan qo'lda
 * qo'yiladigan tezkor teg (backend ustuni `color`, nullable string). Har rang —
 * mijoz turi (`lid.interest.<kalit>` — nomi, `…Desc` — ma'nosi; tartib shu yerdagi
 * ro'yxat tartibida ko'rsatiladi). Ro'yxat va rang<->ma'no bog'lanishi butun
 * loyihada (User + Admin) BIR XIL bo'lishi kerak — o'zgartirilsa ikkalasida ham
 * sinxron qilinsin. Eski `gray` (kulrang) olib tashlangan: bazada saqlangan bo'lsa
 * `normalizeInterestColor` uni `null` (belgisiz) deb qaytaradi.
 */
export const LID_INTEREST_COLORS = [
  { key: "red", hex: "#e53e3e", labelKey: "lid.interest.red", descKey: "lid.interest.redDesc" },
  { key: "orange", hex: "#f97316", labelKey: "lid.interest.orange", descKey: "lid.interest.orangeDesc" },
  { key: "yellow", hex: "#eab308", labelKey: "lid.interest.yellow", descKey: "lid.interest.yellowDesc" },
  { key: "green", hex: "#22c55e", labelKey: "lid.interest.green", descKey: "lid.interest.greenDesc" },
  { key: "lightblue", hex: "#38bdf8", labelKey: "lid.interest.lightblue", descKey: "lid.interest.lightblueDesc" },
  { key: "blue", hex: "#3b82f6", labelKey: "lid.interest.blue", descKey: "lid.interest.blueDesc" },
  { key: "purple", hex: "#a855f7", labelKey: "lid.interest.purple", descKey: "lid.interest.purpleDesc" },
] as const;

export type LidInterestColor = (typeof LID_INTEREST_COLORS)[number]["key"];

/**
 * Backend qiymatini ro'yxatdagi kalitga keltiradi: `red`/`Red`/` red ` yoki
 * rang kodi (`#e53e3e`) ham qabul qilinadi; tanib bo'lmasa `null`.
 */
export function normalizeInterestColor(value: unknown): LidInterestColor | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return LID_INTEREST_COLORS.find((c) => c.key === v || c.hex.toLowerCase() === v)?.key ?? null;
}

export function getInterestColorMeta(color: string | null | undefined) {
  const key = normalizeInterestColor(color);
  return key ? (LID_INTEREST_COLORS.find((c) => c.key === key) ?? null) : null;
}

export interface Lid extends BaseEntity {
  first_name: string;
  last_name: string;
  father_name: string | null;
  birth_date: string | null;
  gender: "male" | "female";
  phone: string;
  region_id: number | null;
  district_id: number | null;
  branch_id: number | null;
  course_id: number | null;
  level_id: number | null;
  group_id: number | null;
  source_id: number | null;
  comments: LidComment[];
  status: LidStatus;
  operator_id?: number | null;
  region: Region | null;
  district: District | null;
  branch: Branch | null;
  course: Course | null;
  level: CourseLevel | null;
  group: Group | null; // TODO: Define Group specifically for Lid if needed, or use Group from group.types
  source: LidSource | null;
  operator: LidOperator | null;
  course_price?: CoursePrice | null;
  permissions?: string[];
  /** Backend ustuni (`l_i_d_s.color`) — xom qiymat; UI `interest_color` dan foydalanadi. */
  color?: string | null;
  /** `color` dan `normalizeInterestColor` bilan olingan UI qiymati. */
  interest_color?: LidInterestColor | null;
}

export type LidsPaginatedResponse = PaginatedResponse<Lid[]>;

export interface LidComment {
  text: string;
  author_name: string | null;
  created_at: string;
}

export interface CreateLidPayload {
  first_name: string;
  last_name: string;
  father_name: string;
  birth_date: string;
  gender: "male" | "female";
  phone: string;
  operator_id: number;
  region_id: string;
  district_id: string;
  branch_id: string;
  course_id: string;
  level_id: string;
  group_id: string;
  source_id: string;
  comment: string;
  status: number;
}

// Helpers moved from lid.types.ts
export function getName(obj: unknown, lang: string): string {
  if (!obj) return "—";
  return getLocalized(obj, "name", lang);
}

export function formatGender(gender: Lid["gender"] | string): string {
  if (gender === "male") return "Erkak";
  if (gender === "female") return "Ayol";
  return gender || "—";
}

export function getSourceKey(source: LidSource | null | undefined): string {
  if (!source) return "";
  const name = source.name || source.name_uz || source.name_ru || source.name_en || "";
  return name.toLowerCase();
}

export function getSourceLabel(
  source: LidSource | null | undefined,
  lang: string,
): string {
  if (!source) return "—";
  return getLocalized(source, "name", lang);
}
