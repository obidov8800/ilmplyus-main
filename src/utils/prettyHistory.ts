import { UNSAFE_createBrowserHistory as createBrowserHistory, type To } from 'react-router-dom';
import { prettifyUrl, toInternalPath, toPrettyPath } from './prettyPaths';

/**
 * Brauzer tarixi ustidagi yupqa qatlam (`<unstable_HistoryRouter history={appHistory}>`).
 *
 * Router va butun ilova ICHKI yo'llarni ko'radi (`/payments`), brauzer adres satrida esa chiroyli nom (`/tolovlar`):
 *  - o'qishda (`location`, `listen`) adres satridagi nom ichki yo'lga qaytariladi;
 *  - yozishda (`push`, `replace`, `createHref`) ichki yo'l chiroyli nomga o'tkaziladi.
 * Shuning uchun `navigate('/payments')`, `<Link to=…>`, `useLocation()`, menyu va ruxsat tekshiruvlari o'zgarishsiz ishlaydi.
 * Jadval: `prettyPaths.ts`.
 */
type BrowserHistory = ReturnType<typeof createBrowserHistory>;
type HistoryLocation = BrowserHistory['location'];

const prettyTo = (to: To): To => {
  if (typeof to === 'string') return prettifyUrl(to);
  return to.pathname ? { ...to, pathname: toPrettyPath(to.pathname) } : to;
};

const internalLocation = (location: HistoryLocation): HistoryLocation => ({
  ...location,
  pathname: toInternalPath(location.pathname),
});

function createPrettyHistory(base: BrowserHistory): BrowserHistory {
  return {
    get action() {
      return base.action;
    },
    get location() {
      return internalLocation(base.location);
    },
    createHref: (to) => base.createHref(prettyTo(to)),
    createURL: (to) => base.createURL(prettyTo(to)),
    // Kodlash shakli o'zgarmaydi; natija router ichida ichki yo'l sifatida ishlatiladi.
    encodeLocation: (to) => base.encodeLocation(to),
    push: (to, state) => base.push(prettyTo(to), state),
    replace: (to, state) => base.replace(prettyTo(to), state),
    go: (delta) => base.go(delta),
    listen: (listener) => base.listen((update) => listener({ ...update, location: internalLocation(update.location) })),
  };
}

function createAppHistory(): BrowserHistory {
  // `v5Compat` shart: usiz `push`/`replace` router'ga xabar bermaydi (adres satri o'zgaradi, sahifa esa yo'q).
  const base = createBrowserHistory({ v5Compat: true });

  // Eski (inglizcha) manzil bilan kirilsa yoki yangilansa — adres satrini chiroyli nomga almashtiramiz (yozuv qo'shilmaydi).
  const { pathname, search, hash } = base.location;
  const pretty = toPrettyPath(toInternalPath(pathname));
  if (pretty !== pathname) base.replace({ pathname: pretty, search, hash }, base.location.state);

  return createPrettyHistory(base);
}

export const appHistory = createAppHistory();
