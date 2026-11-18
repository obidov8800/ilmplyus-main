# permissions/ — ruxsat qoidalari (bitta joy)

Papka **Admin** (`ilmplyus-dashboard-main`) va **User** (`ilmplyus-main`) ilovalarida BIR XIL — birida o'zgartirsangiz,
ikkinchisiga ham nusxa ko'chiring.

| Fayl | Nima |
|---|---|
| `permissionCatalog.ts` | har bo'lim va ruxsat nima qiladi (Rollar sahifasidagi undov (!) matnlari) |
| `permissionPolicy.ts` | Rollar sahifasi: bo'limlar (Pedagogik / Moliyaviy / Ma'muriy / Sotuv va boshqa), beshta asosiy ustun, yashirin va eskirgan ruxsatlar, bir sahifadagi bo'limlar, shablonlar |
| `permissionDeps.ts` | bo'lim ichidagi bog'liqliklar (`show/create/edit/delete` ⇒ `view`, `edit` ⇒ `show`) va avtomatik `lookups.view` |
| `scope.ts` | qamrov «o'ziniki / hammasi»: `canSeeAll(module)` va `ownEmployeeId` |

## Uch qoida

1. **Sahifa ruxsati yetarli.** Sahifa ma'lumotni faqat o'z bo'limi endpointidan va `/options/*` dan oladi
   (`lookups.view` — yashirin, rolga o'zi qo'shiladi). Boshqa bo'limning ruxsati kerak emas va avtomatik qo'shilmaydi.
2. **Ruxsati yo'q so'rov yuborilmaydi.** So'rovdan oldin ruxsat tekshiriladi: bor bo'lsa to'liq endpoint, yo'q bo'lsa
   `/options`. Yordamchi so'rovlarda `skip403Toast` — toast faqat foydalanuvchi o'zi bosgan amalga chiqadi.
3. **«O'ziniki yoki hammasi»** faqat `canSeeAll` da hal qilinadi.

## Yangi sahifa qo'shish — to'rt qadam

1. **Katalogga modul:** backend ruxsati (`modul.view` …) `permissionCatalog.ts` ga (`GROUP_INFO`) va
   `permissionPolicy.ts` dagi tegishli bo'limga (`PERMISSION_SECTIONS`) yoziladi.
2. **Kerakli `/options` ro'yxatlari:** sahifaga boshqa bo'limdan kerak bo'lgan ro'yxat/maydon faqat `/options/*` dan
   olinadi (`useOptions`). `/options` da maydon yetishmasa — boshqa ruxsat qo'shilmaydi, backend topshirig'i yoziladi.
3. **Marshrut va menyu:** `App.tsx` dagi `PermissionRoute`, `Aside.tsx` dagi menyu bandi va (User) `utils/homeRoute.ts`
   dagi bosh sahifa nomzodi — hammasi BIR XIL ruxsat bilan.
4. **Test matritsasiga qator:** `.claude/tools/audit/role_matrix_test.mjs` — `PAGES` ro'yxatiga sahifa va
   `ENDPOINTS` jadvaliga uning endpointi (`/x` → `x.view`). Har shablon rol bilan test o'tishi shart.
