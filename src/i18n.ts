import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import uzJson from './messages/uz.json';

type SupportedLng = 'uz' | 'ru' | 'en';

/*
 * Tarjima bo'laklarini kerak bo'lganda yuklash.
 *
 * Ilgari uchala til (`uz`/`ru`/`en`, ~2790 qatordan) `main.tsx` ishga
 * tushishi bilan barchasi statik import qilinardi — foydalanuvchi bir
 * vaqtning o'zida faqat bittasidan foydalansa ham. Endi faqat `uz` (fallback
 * til) eager qoladi, qolgan ikkitasi faqat kerak bo'lganda (saqlangan til
 * yoki keyingi almashtirish) dinamik import bilan qo'shiladi.
 */
const dynamicLoaders: Record<Exclude<SupportedLng, 'uz'>, () => Promise<{ default: object }>> = {
  ru: () => import('./messages/ru.json'),
  en: () => import('./messages/en.json'),
};

const SUPPORTED: SupportedLng[] = ['uz', 'ru', 'en'];

const isSupported = (value: string | null): value is SupportedLng =>
  value !== null && (SUPPORTED as string[]).includes(value);

const savedLanguage = localStorage.getItem('i18nextLng');
const initialLanguage: SupportedLng = isSupported(savedLanguage) ? savedLanguage : 'uz';

const resources: Partial<Record<SupportedLng, { translation: object }>> = {
  uz: { translation: uzJson },
};

/*
 * `main.tsx` render qilishdan oldin shu promise'ni kutadi — shunda saqlangan
 * til `ru`/`en` bo'lsa ham, birinchi render to'g'ridan-to'g'ri haqiqiy tilda
 * chiqadi ("avval o'zbekcha ko'rinib, keyin almashish" yalt etishi bo'lmaydi).
 * `uz` uchun bu deyarli bepul — keyingi mikrotaskgacha kutish.
 */
const initialLoad: Promise<void> =
  initialLanguage === 'uz'
    ? Promise.resolve()
    : dynamicLoaders[initialLanguage]().then((mod) => {
        resources[initialLanguage] = { translation: mod.default };
      });

export const i18nReady = initialLoad.then(() =>
  i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    fallbackLng: 'uz',
    interpolation: {
      escapeValue: false,
    },
  }),
);

/**
 * Berilgan til bo'lagini (agar hali yuklanmagan bo'lsa) dinamik import bilan
 * qo'shib, keyin joriy tilga o'tkazadi. `LanguageSelect` shu orqali chaqiradi.
 */
export async function loadLanguage(lng: string): Promise<void> {
  if (!isSupported(lng)) return;
  if (lng !== 'uz' && !i18n.hasResourceBundle(lng, 'translation')) {
    const mod = await dynamicLoaders[lng]();
    i18n.addResourceBundle(lng, 'translation', mod.default);
  }
  await i18n.changeLanguage(lng);
}

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('i18nextLng', lng);
});

export default i18n;
