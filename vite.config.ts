import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { loadBackend } from "../_shared/backend";

/**
 * BACKEND MANZILI — butun loyiha uchun BITTA joyda: `D:\ilmplyus\backend.env`
 * (`BACKEND_URL`). Bu yerda, `public/.htaccess`da, `.env`da yoki kodda manzil
 * YOZILMAYDI — hammasi shu yerdan olinadi. Batafsil: `D:\ilmplyus\BACKEND-MANZILI.md`.
 */
const backend = loadBackend(__dirname);

/**
 * Backend manzilini `backend.env`dan qo'llaydi:
 *  • dev — fayl o'zgarsa server O'ZI qayta ishga tushadi (proksi yangi manzilni oladi);
 *  • build — `dist/.htaccess`dagi `/api` va `/storage` qoidalariga manzilni yozadi
 *    (+ deploy skriptlari o'qiydigan `dist/.htbackend` belgisi).
 */
function backendPlugin(): Plugin {
  let outDir = "";
  return {
    name: "ilmplyus-backend",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      const onFile = (file: string) => {
        if (!backend.isBackendFile(file)) return;
        server.config.logger.info("\x1b[36m[backend]\x1b[0m backend.env o‘zgardi — server qayta ishga tushmoqda…");
        void server.restart();
      };
      server.watcher.add(backend.file);
      server.watcher.on("change", onFile);
      server.watcher.on("add", onFile);
    },
    writeBundle() {
      backend.stamp(outDir);
    },
  };
}

/**
 * Bo'sh (0 bayt) CSS bo'laklarini olib tashlaydi.
 *
 * Vite `lazy` sahifaga CSS import qilinganda, o'sha CSS'ning barcha qoidalari
 * boshqa umumiy bo'lakka birlashib ketsa ham, bo'sh `.css` faylini baribir
 * chiqaradi va JS ichidagi `__vitePreload` unga havola qoldiradi. Ba'zi
 * static-hosting/CDN'lar 0 baytli fayllarni ko'chirmaydi yoki 404 qaytaradi →
 * "Unable to preload CSS ... 404" xatosi (sahifa ochilmay qoladi). Bu plagin
 * bo'sh CSS asset'larini o'chirib, JS'dagi havolalarini ham tozalaydi.
 * `enforce: 'post'` + `order: 'post'` — Vite'ning CSS/preload plaginlaridan keyin.
 *
 * ESLATMA: `build.cssCodeSplit: false` bo'lgani uchun endi CSS bo'laklari
 * umuman chiqmaydi — bu plagin uxlab turibdi (no-op). `cssCodeSplit` qayta
 * yoqilsa, ehtiyot chorasi sifatida joyida qoladi.
 */
function dropEmptyCssChunks(): Plugin {
  return {
    name: "drop-empty-css-chunks",
    apply: "build",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const empty: string[] = [];
        for (const [name, asset] of Object.entries(bundle)) {
          if (
            asset.type === "asset" &&
            name.endsWith(".css") &&
            String(asset.source ?? "").trim() === ""
          ) {
            empty.push(name);
            delete bundle[name];
          }
        }
        if (empty.length === 0) return;
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk") continue;
          for (const css of empty) {
            chunk.code = chunk.code
              .split(`,"${css}"`).join("")
              .split(`"${css}",`).join("")
              .split(`"${css}"`).join("");
            chunk.viteMetadata?.importedCss?.delete(css);
          }
        }
      },
    },
  };
}

/**
 * PLANSHET = «mobil ilova» dizayni.
 *
 * Mobil dizayn (pastki panel, hamburger menyu, jadval o'rniga kartalar, pastdan chiquvchi oynalar) faqat
 * `@media (max-width: …)` bilan yoqiladi. Katta sensorli ekranlar (Samsung Tab gorizontal 1280–1480px, iPad
 * gorizontal, «desktop sayt» rejimi) bu chegaradan KENG bo'lgani uchun oddiy kompyuter ko'rinishi (chap yon
 * menyuli) chiqardi.
 *
 * Bu plagin `src/` dagi har bir faqat-`max-width` media qoidasini (planshet va telefon bosqichlari: 700–1100px —
 * pastki panel/hamburger 900px, kartalar 768px, 1024px …) sensorli qurilmalar uchun ham qo'llaydi: asosiy
 * ko'rsatkich — `pointer: coarse` (barmoq; sichqonchali kompyuter `fine`), ekran 1600px dan kichik. Kompyuter va telefon
 * uchun hech narsa o'zgarmaydi. Eng kichik telefon bosqichlari (≤640px: bir ustunli maydonlar, kichik oraliqlar)
 * planshetga qo'llanmaydi — u yerda joy yetarli. Bir xil qiymat JS'da: `src/utils/compactViewport.ts`.
 */
const TOUCH_TABLET_QUERY =
  "(pointer: coarse) and (max-device-width: 1600px), (pointer: coarse) and (max-width: 1600px)";

function tabletMobileCss() {
  return {
    postcssPlugin: "ilmplyus-tablet-mobile",
    Once(root: {
      source?: { input?: { file?: string } };
      walkAtRules: (name: string, cb: (rule: { params: string }) => void) => void;
    }) {
      const file = (root.source?.input?.file ?? "").replace(/\\/g, "/");
      if (!file.includes("/src/") || file.includes("/node_modules/")) return;
      root.walkAtRules("media", (rule) => {
        const m = /^\(\s*max-width\s*:\s*([\d.]+)(px|em)\s*\)$/.exec(rule.params.trim());
        if (!m) return;
        const px = parseFloat(m[1]) * (m[2] === "em" ? 16 : 1);
        if (px < 700 || px > 1100) return;
        rule.params = `${rule.params.trim()}, ${TOUCH_TABLET_QUERY}`;
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  css: {
    postcss: { plugins: [tabletMobileCss()] },
  },
  /*
   * Ildiz (domen ildizi)dan absolyut yo'llar.
   *
   * Ilgari `base: './'` edi — pastki papkada joylashtirish uchun. Lekin
   * bu ilova SPA: `/groups`, `/students-contract/5` kabi marshrutlarga
   * to'g'ridan-to'g'ri kirilganda (yoki sahifa yangilanganda) server
   * `index.html`ni O'SHA manzilda qaytaradi (Apache/Vercel'dagi SPA
   * fallback). Nisbiy `./assets/...` esa brauzerda JORIY manzilga nisbatan
   * hisoblanadi — bir segmentli `/groups` uchun tasodifan to'g'ri chiqishi
   * mumkin, lekin `/students-contract/5` kabi ko'p segmentli manzillarda
   * `/students-contract/assets/...` deb noto'g'ri hisoblab, "Expected a
   * JavaScript module but server responded with text/html" xatosini
   * berardi (front.easypos.uz'da aynan shu ko'rindi).
   *
   * Ilova faqat domen ildizida joylashtirilgani uchun (pastki papka kerak
   * emas — tasdiqlangan) `/assets/...` (absolyut) har doim to'g'ri —
   * qaysi marshrutdan so'ralishidan qat'i nazar. Apache tarafda mos
   * SPA-fallback `public/.htaccess`da.
   */
  base: '/',
  plugins: [react(), dropEmptyCssChunks(), backendPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    /*
     * BITTA CSS fayli — sahifalarga bo'linmaydi.
     *
     * `cssCodeSplit: true` (standart) da bir CSS modul bir nechta `lazy`
     * sahifa tomonidan import qilinsa, Vite uni faqat BITTA bo'lakning
     * preload ro'yxatiga qo'shadi — boshqa yo'ldan kirilganda `<link>` umuman
     * ulanmay, toolbar/modal uslubsiz chiqardi (admin ilovada `finance.css` da
     * aynan shu bo'ldi). Eski "Unable to preload CSS ... 404" ham shu sinfdan.
     * `false` — barcha CSS bitta `index-*.css` ga yig'iladi, `index.html` da
     * doim `<link>` bilan ulanadi: preload "raqs"i yo'q, 404 yo'q, noto'g'ri
     * biriktirish yo'q. Asset fayllar soni ham kamayadi.
     */
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        /*
         * Juda mayda JS bo'laklarni qo'shnisiga qo'shib yuboradi —
         * chunklash bosqichida, xesh nomlar to'g'ri qayta hisoblanadi.
         */
        experimentalMinChunkSize: 10_000,
        /*
         * Faqat ilova ishga tushishi bilan baribir kerak bo'ladigan kutubxonalar
         * alohida bo'lakka olinadi — kod yangilanganda brauzer ularni keshdan
         * oladi, qayta yuklamaydi.
         *
         * MUHIM: bu ro'yxatga faqat *eager* (darhol kerak) paketlar qo'yiladi.
         * jspdf, recharts, docx kabi og'ir paketlar bu yerga qo'shilsa, Rollup
         * ularni entry'ga statik bog'lab qo'yadi va ular kerak-nokerak
         * boshlanishida yuklanadi — o'lchab tekshirilgan. Qolganini Vite o'zi
         * dinamik import chegaralari bo'yicha bo'ladi.
         */
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id))
            return 'vendor-react';
          if (/[\\/]node_modules[\\/]@mantine[\\/]/.test(id)) return 'vendor-mantine';
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'vendor-query';
        },
      },
    },
  },
  server: {
    proxy: {
      "/ipt-api": {
        target: "https://mainoffice.uz:8181",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ipt-api/, ""),
      },
      /*
       * DEV proxy — `/api` va `/storage` so'rovlari Vite dev serverining
       * o'ziga ketadi, u esa backendga (`backend.env`dagi `BACKEND_URL`)
       * SERVER TOMONIDAN uzatadi. Production'da xuddi shu vazifani Apache
       * bajaradi (`dist/.htaccess`, build paytida shu YAGONA manzildan
       * yoziladi). Kod esa doim nisbiy `/api` ga murojaat qiladi
       * (`src/api/baseUrl.ts`).
       *
       * Natija: brauzer (DevTools > Network) faqat shu saytning o'z domenini
       * ko'radi, backend manzili tashqariga chiqmaydi; CORS ham kerak emas
       * (so'rov bir xil origin ichida qoladi).
       */
      ...backend.proxy,
    },
  },
});
