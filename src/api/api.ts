import axios, { type AxiosRequestConfig } from 'axios';
import useAuthStore from '../store/useAuthStore';
import { queryClient } from '../main';
import { notifications } from '@mantine/notifications';
import { describeForbidden } from '../utils/permissionHints';
import { isAdminUser } from '../utils/roles';
import { API_BASE_URL } from './baseUrl';
import { scheduleDataSync } from '../utils/dataSync';
import { requestMeRefresh } from '../utils/meRefresh';
import { confirmNetworkFailure, isOffline, reportNetworkOk } from '../utils/netState';
import { networkErrorToast } from '../utils/netText';
import {
  OUTSIDE_WORK_HOURS_CODE,
  getWorkHoursLock,
  isAlwaysOpenRequest,
  isMutatingRequest,
  writeWorkHoursCache,
  type WorkHoursStatus,
} from '../utils/workHours';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** `true` bo'lsa, bu yozuvchi so'rov ma'lumot sinxronini (`utils/dataSync.ts`) qo'zg'amaydi. */
    skipDataSync?: boolean;
    /** So'rov xatosini komponent o'zi ko'rsatadi; global xato bildirishnomasini chiqarmaydi. */
    silentError?: boolean;
  }
}

export const API = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    /*
     * `Accept: application/json` shart — bo'lmasa, backend (Laravel)
     * so'rovni "AJAX/API" deb emas, oddiy brauzer (veb-forma) so'rovi deb
     * hisoblaydi va JSON xato o'rniga login sahifasiga 302 redirect
     * qaytaradi (`Location: https://control.ilmplyus.uz`, JSON body yo'q).
     * Natijada frontend token/foydalanuvchi ma'lumotini HTML sahifadan
     * o'qishga urinib, keyingi so'rovlarda 401 olib "Sessiya muddati
     * tugadi" xabarini ko'rsatardi — aslida login hech qachon
     * muvaffaqiyatli bo'lmagan, sababi esa noto'g'ri Accept sarlavhasi edi.
     */
    Accept: 'application/json',
  },
});

/**
 * So'rov konfiguratsiyasiga qo'shimcha bayroq.
 *
 * `skip403Toast` — 403 kelganda "Ruxsat yo'q" xabarini ko'rsatmaydi. Faqat
 * zaxira manbasi bor so'rovlar uchun: xato yutilmaydi (chaqiruvchi uni oladi),
 * shunchaki foydalanuvchiga keraksiz xabar chiqmaydi.
 */
export type SilentForbiddenConfig = AxiosRequestConfig & {
  skip403Toast?: boolean;
  /** Xato toasti chiqmaydi (xato chaqiruvchiga uzatiladi): chaqiruvchi o'zi umumiy xulosa ko'rsatadi. */
  silentError?: boolean;
};

/**
 * Token talab qilmaydigan (ochiq) endpointlar.
 *
 * Nega: interceptor localStorage'dagi tokenni har bir so'rovga, jumladan
 * `/login`ga ham, shartsiz qo'shib yuborardi. Agar oldingi sessiyadan eskirgan
 * yoki serverda bekor qilingan token qolib ketgan bo'lsa (client hali "muddati
 * o'tmagan" deb hisoblasa ham), backend uni login/parolni tekshirishdan oldin
 * rad etib "Unauthenticated." qaytarardi — foydalanuvchi to'g'ri parol bilan
 * ham hech qachon kira olmasdi. Shu endpointlarga token umuman yuborilmaydi.
 */
const PUBLIC_ENDPOINTS = ['/login', '/employee/login', '/set-password'];

API.interceptors.request.use((config) => {
  if (PUBLIC_ENDPOINTS.some((path) => config.url?.startsWith(path))) {
    return config;
  }

  const { token, isExpired, logout } = useAuthStore.getState();

  if (token) {
    if (isExpired()) {
      logout();
      return Promise.reject(new Error('Token expired'));
    }

    config.headers.Authorization = `Bearer ${token}`;
  }

  /*
   * Ish vaqtidan tashqarida (`GET /me/work-hours` → `can_write: false`) hech qanday yozuvchi so'rov serverga
   * yuborilmaydi: tugma/modal qayerdan chaqirilganidan qat'i nazar (Protected'ga o'ralmagan joylar ham shu yerda
   * ushlanadi). Holat noma'lum bo'lsa so'rov ketadi — to'siq baribir backendda (403 `outside_work_hours`).
   */
  if (token && isMutatingRequest(config) && !isAlwaysOpenRequest(config)) {
    const lock = getWorkHoursLock(useAuthStore.getState().user?.id);
    if (lock) {
      notifications.show({
        id: 'work-hours-blocked',
        color: 'yellow',
        title: 'Ish vaqtidan tashqarida',
        message: lock.message || 'Hozircha ma’lumotlarni faqat ko‘rishingiz mumkin.',
      });
      return Promise.reject(new axios.CanceledError(OUTSIDE_WORK_HOURS_CODE));
    }
  }

  return config;
});

/**
 * Some stored text (question text, lookup names, notes) was saved with a
 * broken encoding: the Uzbek apostrophe (the o`/g` okina and the
 * glottal-stop mark) was lost and replaced by U+FFFD ("replacement
 * character", renders as a black diamond) when the source was imported
 * from a mis-encoded CSV/Excel file. The original character is gone from
 * the data, but is recoverable from context: a U+FFFD right after o/g is
 * the okina (U+2018), otherwise it is the glottal-stop apostrophe
 * (U+2019). Every response string is repaired here before it reaches the
 * UI. The real fix belongs in the database; this is a display-only guard.
 */
function repairEncoding(value: unknown): unknown {
  if (typeof value === 'string') {
    if (!value.includes('\uFFFD')) return value;
    return value.replace(/([oOgG])\uFFFD/g, '$1\u2018').replace(/\uFFFD/g, '\u2019');
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = repairEncoding(value[i]);
    return value;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = repairEncoding(record[key]);
    return value;
  }
  return value;
}

API.interceptors.response.use(
  (res) => {
    // Javob keldi — internet bor (offline sahifasini yopadi).
    reportNetworkOk();
    // U+FFFD kabi buzuq kodlashli matnlarni UI oldidan tuzatib beramiz.
    if (res.data && typeof res.data === 'object') {
      res.data = repairEncoding(res.data);
    }
    // Yozuvchi so'rov (POST/PUT/PATCH/DELETE) muvaffaqiyatli tugadi — ekrandagi hamma ma'lumot F5 siz
    // yangilanadi (batafsil: utils/dataSync.ts).
    scheduleDataSync(res.config);
    return res;
  },
  (error) => {
    // Ish vaqtidan tashqari bekor qilingan so'rov (yuqoridagi request interceptor) — toast allaqachon chiqqan.
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error.response?.status;
    // Javob umuman kelmadi — aloqa tekshiriladi; internet yo'q bo'lsa butun ekranli «Internet aloqasi yo'q» sahifasi chiqadi.
    if (error?.code === 'ERR_NETWORK') confirmNetworkFailure();

    /*
     * Backend ish vaqtidan tashqarida yozuvni rad etdi: `403 { code: 'outside_work_hours', message, work_hours }`.
     * Oddiy ruxsat xatosidan (403 permission) farqlash uchun FAQAT `code` tekshiriladi. Javobdagi `work_hours`
     * ekrandagi holatni darhol yangilaydi (tugmalar o'chadi, banner chiqadi) — keyingi daqiqalik so'rovni kutmaydi.
     */
    if (status === 403 && error.response?.data?.code === OUTSIDE_WORK_HOURS_CODE) {
      const workHours = error.response.data.work_hours as WorkHoursStatus | undefined;
      const userId = useAuthStore.getState().user?.id;
      if (workHours && typeof workHours.can_write === 'boolean') {
        writeWorkHoursCache(userId, workHours);
        queryClient?.setQueryData(['me', 'work-hours', userId ?? null], workHours);
      } else {
        queryClient?.invalidateQueries({ queryKey: ['me', 'work-hours'] });
      }
      if (!(error.config as SilentForbiddenConfig | undefined)?.silentError) {
        notifications.show({
          id: 'work-hours-blocked',
          color: 'yellow',
          title: 'Ish vaqtidan tashqarida',
          message: error.response.data.message || 'Hozircha ma’lumotlarni faqat ko‘rishingiz mumkin.',
        });
      }
      return Promise.reject(error);
    }

    // Ruxsat xatosi (403) — rol/ruxsat o'zgargan bo'lishi mumkin: `/me` (30 soniyada ko'pi bilan bir marta) qayta so'raladi.
    if (status === 403 && error.config?.url !== '/me') requestMeRefresh(queryClient);

    if (status === 401) {
      /*
       * Token serverda yaroqsiz bo'lib qoldi — sessiya muddati tugagani
       * (frontend 6 soat deb hisoblaydi, backend ham shunga yaqin muddatda
       * eskirtiradi) yoki token boshqa sabab bilan bekor qilingani uchun.
       * Bu foydalanuvchi uchun kutilgan holat, texnik nosozlik emas — shu
       * sabab backendning xom "Unauthenticated." xabari o'rniga tushunarli
       * "sessiya tugadi" xabari ko'rsatiladi ("Xatolik" emas).
       *
       * Login sahifasida bo'lsak (masalan noto'g'ri parol emas, balki shu
       * kabi holat) qo'shimcha xabar shart emas — foydalanuvchi allaqachon
       * login formasida.
       */
      if (window.location.pathname !== '/login') {
        notifications.show({
          id: 'session-expired-notification',
          title: 'Sessiya muddati tugadi',
          message: 'Xavfsizlik uchun seans yopildi. Iltimos, qaytadan tizimga kiring.',
          color: 'yellow',
          autoClose: 6000,
        });
      }

      logoutAndRedirect();
      return Promise.reject(error);
    }

    // `silentError` — chaqiruvchi xatoni o'zi qayta ishlaydi (masalan bir nechta filial bo'yicha ketma-ket so'rov): toast chiqmaydi.
    if ((error.config as SilentForbiddenConfig | undefined)?.silentError) {
      return Promise.reject(error);
    }

    const skip403Toast = (error.config as SilentForbiddenConfig | undefined)?.skip403Toast;

    if (status === 403 && skip403Toast) {
      // Zaxira manbasi bor so'rov — xabar chiqarmay, xatoni chaqiruvchiga uzatamiz.
      return Promise.reject(error);
    }

    if (status === 403) {
      // Ruxsat kodi kabi texnik tafsilot faqat adminga ko'rsatiladi — u
      // rollarni o'zi sozlaydi. Qolganlarga oddiy xabar.
      const isAdmin = isAdminUser(useAuthStore.getState().user);

      const hint = isAdmin
        ? describeForbidden(error.config?.method, error.config?.url, error.response?.data)
        : null;

      // Adminga: qaysi ruxsat yetishmayotgani toastning o'zida yozilsin —
      // DevTools'dan so'rovni qidirishga hojat qolmasin.
      const lines = hint
        ? [
            `Kerakli ruxsat: ${hint.permission}${hint.exact ? '' : ' (taxminan)'}`,
            hint.actionLabel ? `Amal: ${hint.actionLabel}` : null,
            `So'rov: ${hint.request}`,
          ].filter(Boolean)
        : ["Sahifaga ruxsat yo'q, adminga murojaat qiling"];

      notifications.show({
        id: `forbidden-${hint?.permission ?? 'notification'}`,
        title: hint?.page ? `Ruxsat yo'q — ${hint.page}` : "Ruxsat yo'q",
        message: lines.join('\n'),
        color: 'red',
        autoClose: 8000,
        styles: { description: { whiteSpace: 'pre-line' } },
      });
    } else {
      // Internet yo'q (butun ekranli sahifa aytadi, har so'rovga xabar kerak emas) yoki server xatosi (5xx) — tushunarli xabar.
      const net = networkErrorToast(error, isOffline());
      if (net) {
        if (!net.silent) {
          notifications.show({
            id: 'global-error-notification',
            title: net.title,
            message: net.message,
            color: 'red',
            autoClose: 5000,
          });
        }
        return Promise.reject(error);
      }

      // Ba'zi endpointlar ma'lumot bo'lmasa 404 qaytaradi (backendda hali
      // to'liq ulanmagan) — bu holatda UI o'zi bo'sh/nol ko'rinishga tushadi,
      // shuning uchun qizil "Xatolik" toasti chiqarilmaydi.
      const quiet404 =
        status === 404 &&
        (error.config?.url?.startsWith('/lids/') ||
          // Taqsimlash so'rovlari ro'yxati — backend endpointi hali bo'lmasligi mumkin;
          // sahifa buni o'zi tushunarli xabar bilan ko'rsatadi.
          error.config?.url === '/payroll/distributions' ||
          // Siklogramma — sahifa xatoni o'zi ko'rsatadi (qayta urinish tugmasi bilan), toast takrorlanmasin.
          error.config?.url === '/cyclogram-events' ||
          /\/tests\/\d+\/(stats|results)$/.test(error.config?.url ?? ''));
      if (quiet404) {
        return Promise.reject(error);
      }

      /*
       * Laravel tekshiruvi (422) barcha xatolarni `errors` obyektida qaytaradi,
       * `message` da esa faqat birinchisi va «(and 2 more errors)» bo'ladi.
       * Shu sababli qaysi maydon rad etilgani ko'rinmay qolardi — endi
       * hammasi ro'yxat bilan chiqadi.
       */
      const data = error.response?.data as
        | { message?: string; errors?: Record<string, string[]> }
        | undefined;

      const validationLines = data?.errors
        ? Object.entries(data.errors).map(([field, messages]) => `• ${field}: ${messages.join(' ')}`)
        : [];

      const errorMessage = validationLines.length
        ? validationLines.join('\n')
        : data?.message || error.message;

      notifications.show({
        id: 'global-error-notification',
        title: 'Xatolik',
        message: errorMessage || "Noma'lum xatolik yuz berdi",
        color: 'red',
        autoClose: validationLines.length ? 12000 : 4000,
        styles: { description: { whiteSpace: 'pre-line' } },
      });
    }

    return Promise.reject(error);
  },
);

function logoutAndRedirect() {
  const { logout } = useAuthStore.getState();
  logout();

  queryClient?.clear();
}
