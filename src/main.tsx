import { createRoot } from "react-dom/client";
import { unstable_HistoryRouter as HistoryRouter } from "react-router-dom";
import { appHistory } from "./utils/prettyHistory";
import { MantineProvider, createTheme } from "@mantine/core";
import App from "./App.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Notifications } from "@mantine/notifications";
import { SipProvider } from "./features/sip/SipProvider";
import { i18nReady } from "./i18n";
import NetworkStatus from "./components/NetworkStatus";
import { WorkHoursProvider } from "./components/WorkHoursProvider";
import { registerOfflineWorker } from "./utils/registerOfflineWorker";
import "./index.css";

/*
 * Mantine modallari uchun umumiy sozlama.
 *
 * Ilovada ikki xil modal bor: qo'lda yozilgani (`.modal-overlay`, uslubi
 * `styles/modal.css` da) va Mantine `<Modal>`. Ikkalasi bir xil ko'rinishi
 * uchun bu yerda radius, ichki bo'shliq va fon quyuqligi shu CSS'dagi
 * qiymatlarga tenglashtirilgan. Har bir modalda alohida yozib chiqish shart
 * emas — sahifadagi `radius`/`padding` proplari kerak bo'lsa ustidan yozadi.
 */
const theme = createTheme({
  /*
   * Shrift va asosiy rang — ilovaning qolgan qismi bilan bir xil.
   *
   * Ilgari Mantine o'zining tizim shrifti (`-apple-system, Segoe UI...`) va
   * standart ko'k rangini ishlatardi: Mantine komponentlari (Foydalanuvchilar,
   * Viloyatlar, Tumanlar, modallar) ilovaning Noto Sans JP shrifti va
   * `#003366` brend rangidan farqli ko'rinardi, qurilma/OT'ga qarab shrift
   * ham o'zgarardi.
   */
  fontFamily: 'noto-r, sans-serif',
  headings: { fontFamily: 'noto-b, sans-serif' },
  primaryColor: 'brand',
  colors: {
    // 6-qadam (asosiy) = #003366 (`--color-primary`).
    brand: [
      '#e8f0f8',
      '#cfdeee',
      '#9fbddd',
      '#6e9bcc',
      '#3f7abb',
      '#1d5fa8',
      '#003366',
      '#002b56',
      '#002347',
      '#001a37',
    ],
  },
  components: {
    Modal: {
      defaultProps: {
        centered: true,
        radius: 14,
        padding: 28,
        overlayProps: { backgroundOpacity: 0.45, blur: 0 },
      },
    },
  },
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      // MA'LUMOT YANGILIGI ("kiritgan ma'lumotim sahifani yangilamaguncha chiqmaydi" muammosi) — TINMASDAN SO'ROV YO'Q
      // (ilgari har 15–30 soniyada hamma ochiq so'rovlar qayta yuborilardi: foydalanuvchi ko'paygan sari backend sekinlashardi):
      //  1) o'zgartiruvchi so'rov (POST/PUT/PATCH/DELETE) muvaffaqiyatli bo'lgach HAMMA ma'lumot darhol
      //     yangilanadi — `utils/dataSync.ts` (`api/api.ts` interceptor'idan chaqiriladi): ochiq turgan
      //     jadvallar, selectlar, hisoblagichlar qayta yuklanadi, boshqa sahifalar keshi eskirgan deb belgilanadi;
      //  2) boshqa foydalanuvchilar kiritgan ma'lumot: sahifa ochilganda (`refetchOnMount`), oyna qayta
      //     fokus olganda va internet qayta ulanganda — FAQAT ma'lumot 1 daqiqadan eski bo'lsa — qayta tortiladi
      //     (stale-while-revalidate: avval keshdagisi ko'rinadi, keyin yangisi o'zi almashadi);
      //  3) `/me` (rol/ruxsat) va ish vaqti — o'z siyosati bilan: `services/account.ts`, `components/WorkHoursProvider.tsx`.
      // Og'ir ro'yxatlar (`fetchAllPages`) o'z `staleTime`i bilan (5 daqiqa) — har safar ko'p so'rov ketmasin.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: (failureCount: number, error: unknown) => {
        const err = error as { response?: { status?: number } };
        if (err?.response?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

/*
 * Og'ir ro'yxatlar (`fetchAllPages` — barcha sahifani yig'adi, ko'p so'rov ketadi): umumiy `staleTime` (1 daqiqa)
 * ular uchun juda qisqa — sahifaga qaytganda har safar o'nlab so'rov ketmasin. Yozuvchi so'rovdan keyin esa ular
 * `staleTime`dan qat'i nazar darhol yangilanadi (`utils/dataSync.ts`).
 */
const HEAVY_LIST_KEYS = [
  ['users', 'all'],
  ['groups', 'list', 'all'],
  ['lids', 'all'],
  ['tests', 'all'],
  ['course_prices', 'all'],
  ['payroll-sheet', 'all'],
  ['student-contracts', 'all'],
] as const;
for (const key of HEAVY_LIST_KEYS) queryClient.setQueryDefaults(key, { staleTime: 5 * 60 * 1000 });

/*
 * Render qilishdan oldin `i18nReady`ni kutamiz.
 *
 * Saqlangan til `uz` (fallback) bo'lsa bu deyarli bepul — keyingi
 * mikrotaskda hal bo'ladi. `ru`/`en` bo'lsa, shu tilning tarjima bo'lagi
 * (dinamik import) shu yerda yuklab olinadi — aks holda ilova avval
 * o'zbekcha render bo'lib, so'ng haqiqiy tilga "yalt etib" almashib qolardi.
 */
registerOfflineWorker();

i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      {/* Adres satrida chiroyli o'zbekcha manzillar (`/tolovlar`), ilova ichida avvalgi yo'llar: utils/prettyPaths.ts */}
      <HistoryRouter history={appHistory}>
        <MantineProvider theme={theme}>
          {/* SipProvider wraps App so SIP registration persists across navigation.
              It self-guards internally — only connects when isAuth = true. */}
          <SipProvider>
            {/* Ish vaqti (`/me/work-hours`): vaqtdan tashqarida yozuvchi tugmalar o'chadi, so'rovlar ketmaydi. */}
            <WorkHoursProvider>
              <App />
            </WorkHoursProvider>
            <NetworkStatus />
            {/* zIndex — modal pardalaridan (10000) yuqorida: oyna ochiq paytdagi xato xabari qoraygan parda ostida qolmasin. */}
            <Notifications position="top-right" zIndex={10100} styles={{ notification: { boxShadow: 'none' } }} />
          </SipProvider>
        </MantineProvider>
      </HistoryRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>,
  );
});

