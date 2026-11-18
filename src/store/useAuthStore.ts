import { create } from "zustand";
import type { User } from "../types/user.types";
import { withoutDeletePermissions } from "../utils/deletePolicy";
import { storeWithoutSensitive, withoutSensitive } from "../utils/sensitiveFields";

interface AuthState {
  token: string | null;
  expiresAt: number | null;
  user: User | null;
  permissions: string[];
  permissionsLoaded: boolean;
  isAuth: boolean;

  /** SIP extension login (e.g. "1001") — populated by SipProvider from API, never from .env */
  sipLogin: string | null;
  /** SIP auth password — populated by SipProvider from API, never from .env */
  sipPassword: string | null;

  setToken: (token: string, ttlMinutes: number) => void;
  setUser: (user: User) => void;
  setPermissions: (permissions: string[]) => void;
  /** Store SIP credentials matched from /ip-telefon-operators by user.pinfl */
  setSipCredentials: (login: string, password: string) => void;
  logout: () => void;
  isExpired: () => boolean;
}

const PERMISSIONS_KEY = "permissions";

/**
 * localStorage qiymatini xavfsiz o'qiydi. Buzilgan yozuv (masalan `"undefined"`
 * matni) `JSON.parse` xatosi bilan modul yuklanishidayoq ilovani butunlay
 * qulatardi — foydalanuvchi oq ekranni ko'rib, brauzer xotirasini qo'lda
 * tozalamaguncha kira olmasdi.
 */
const readJson = <T,>(key: string): T | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

const getStoredAuth = () => {
  const parsed = readJson<{ token?: string; expiresAt?: number }>("auth");
  if (!parsed) return null;

  if (Date.now() > (parsed.expiresAt as number)) {
    localStorage.removeItem("auth");
    localStorage.removeItem(PERMISSIONS_KEY);
    return null;
  }

  return parsed;
};

const storedAuth = getStoredAuth();

/**
 * Ruxsatlar ham localStorage'da saqlanadi.
 *
 * Nega: `PermissionRoute` va yon menyu `permissionsLoaded` ni kutadi, u esa
 * faqat `/me` javobidan keyin `true` bo'lardi. Natijada har sahifa yangilanishida
 * ketma-ketlik `/me` → sahifa mount → sahifa so'rovlari bo'lib, ma'lumot ikkita
 * ketma-ket so'rovdan keyin kelardi. Saqlangan ro'yxat bilan sahifa darhol
 * ochiladi va o'z so'rovlarini `/me` bilan barobar yuboradi.
 *
 * Bu faqat interfeys uchun — haqiqiy tekshiruv baribir backendda (403).
 * `/me` kelgach ro'yxat yangilanadi, chiqishda va token eskirganda o'chiriladi.
 */
const getStoredPermissions = (): string[] => {
  if (!storedAuth) return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(PERMISSIONS_KEY) || "null");
    return Array.isArray(parsed) ? withoutDeletePermissions(parsed.filter((p): p is string => typeof p === "string")) : [];
  } catch {
    return [];
  }
};

const storedPermissions = getStoredPermissions();

/** Saqlangan foydalanuvchi — nozik maydonlarsiz (eski keshda PINFL qolgan bo'lsa, darhol tozalanadi). */
const getStoredUser = (): User | null => {
  const stored = readJson<User>("user");
  if (!stored) return null;
  const clean = withoutSensitive(stored);
  if (JSON.stringify(clean) !== JSON.stringify(stored)) storeWithoutSensitive("user", clean);
  return clean;
};

const useAuthStore = create<AuthState>((set, get) => ({
  token: storedAuth?.token ?? null,
  expiresAt: storedAuth?.expiresAt ?? null,
  user: getStoredUser(),
  permissions: storedPermissions,
  // Saqlangan ro'yxat faqat /me umuman olinmasa (tarmoq yo'q) zaxira — marshrut tekshiruvi YANGI /me javobini kutadi.
  permissionsLoaded: false,
  isAuth: !!storedAuth?.token,

  // SIP credentials — not persisted to localStorage (fetched fresh on each login)
  sipLogin:    null,
  sipPassword: null,

  setToken: (token, ttlMinutes) => {
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;

    localStorage.setItem("auth", JSON.stringify({ token, expiresAt }));

    set({
      token,
      expiresAt,
      isAuth: true,
    });
  },

  setUser: (user) => {
    // PINFL, balans kabi maydonlar keshga yozilmaydi — faqat xotirada (`utils/sensitiveFields`).
    storeWithoutSensitive("user", user);
    set({ user });
  },

  setPermissions: (all) => {
    // Staff ilovasida o'chirish ruxsatlari yo'q (`utils/deletePolicy`).
    const permissions = withoutDeletePermissions(all);
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    set({ permissions, permissionsLoaded: true });
  },

  setSipCredentials: (login, password) => {
    set({ sipLogin: login, sipPassword: password });
  },

  logout: () => {
    localStorage.removeItem("auth");
    localStorage.removeItem("user");
    localStorage.removeItem(PERMISSIONS_KEY);

    set({
      token: null,
      expiresAt: null,
      user: null,
      permissions: [],
      permissionsLoaded: false,
      isAuth: false,
      // Clear SIP credentials on logout
      sipLogin:    null,
      sipPassword: null,
    });
  },

  isExpired: () => {
    const { expiresAt } = get();
    if (!expiresAt) return true;
    return Date.now() > expiresAt;
  },
}));

export default useAuthStore;
