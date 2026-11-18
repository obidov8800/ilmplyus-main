import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LEGACY_UZ, SEGMENTS, UNCHANGED_SEGMENTS, checkSegments, prettifyUrl, toInternalPath, toPrettyPath } from './prettyPaths.ts';

/** `App.tsx` dagi barcha `<Route path="…">` yo'llari (ichki, ilova ishlatadigan shakl). */
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const routePaths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*');

/** Ataylab TARJIMA QILINMAYDIGAN segmentlar: ochiq havolalar (SMS/QR'da tarqalgan) va tayyor atamalar. */
const KEEP = new Set(['', 'login', 'set-password', 'contract', 'view', 'chek', 'face-id', ...UNCHANGED_SEGMENTS]);

test('jadval yaxlit: API nomi bilan bir xil/takroriy/band/to‘qnashuvchi nom yo‘q', () => {
  assert.deepEqual(checkSegments(), []);
});

test('har bir marshrut yo‘li: ichki → chiroyli → ichki aynan qaytadi', () => {
  assert.ok(routePaths.length > 40, `marshrutlar topilmadi (${routePaths.length})`);
  for (const path of routePaths) {
    assert.equal(toInternalPath(toPrettyPath(path)), path, path);
  }
});

test('ikki turli marshrut bir xil chiroyli manzilga tushmaydi', () => {
  const seen = new Map();
  for (const path of routePaths) {
    const pretty = toPrettyPath(path);
    assert.ok(!seen.has(pretty) || seen.get(pretty) === path, `${path} va ${seen.get(pretty)} → ${pretty}`);
    seen.set(pretty, path);
  }
});

test('hamma segment tarjima qilingan, yoki ataylab saqlangan, yoki parametr', () => {
  const unmapped = new Set();
  for (const path of routePaths) {
    for (const segment of path.split('/')) {
      if (segment.startsWith(':') || KEEP.has(segment)) continue;
      if (!Object.hasOwn(SEGMENTS, segment)) unmapped.add(`${segment}  (${path})`);
    }
  }
  assert.deepEqual([...unmapped], []);
});

test('ilovadagi hech bir sahifa manzili ichki (API) nomi bilan bir xil emas', () => {
  // `create/edit/new/add` va ochiq havolalar bundan mustasno; qolgan har bir tarjima qilinadigan segment o'zgargan bo'lsin
  for (const path of routePaths) {
    for (const segment of path.split('/')) {
      if (segment.startsWith(':') || KEEP.has(segment)) continue;
      assert.notEqual(toPrettyPath('/' + segment), '/' + segment, `${segment} (${path}) o'zgarmagan`);
    }
  }
});

test('ochiq havolalar o‘zgarmaydi', () => {
  for (const path of ['/login', '/set-password', '/', '/chek/123', '/contract/abc', '/contract/view/abc']) {
    assert.equal(toPrettyPath(path), path, path);
    assert.equal(toInternalPath(path), path, path);
  }
});

test('namunalar (inglizcha, API nomidan farqli)', () => {
  assert.equal(toPrettyPath('/preschool-attendance'), '/prep-attendance');
  assert.equal(toPrettyPath('/payments'), '/billing');
  assert.equal(toPrettyPath('/daily-cash-reports'), '/daily-cash');
  assert.equal(toInternalPath('/billing'), '/payments');
  assert.equal(toPrettyPath('/students-contract/adult/edit/5'), '/learner-agreements/adults/edit/5');
  assert.equal(toInternalPath('/learner-agreements/adults/edit/5'), '/students-contract/adult/edit/5');
  assert.equal(toPrettyPath('/users/42/edit'), '/accounts/42/edit');
  assert.equal(toInternalPath('/accounts/42/edit'), '/users/42/edit');
  // eski ichki manzil ham ochiladi va chiroyli nomga almashtiriladi
  assert.equal(toInternalPath('/payments'), '/payments');
  assert.equal(toPrettyPath(toInternalPath('/payments/archive')), '/billing/archived-items');
  // so'rov va belgi saqlanadi
  assert.equal(prettifyUrl('/payments?page=2&q=users#top'), '/billing?page=2&q=users#top');
  // prototip kalitlari
  assert.equal(toPrettyPath('/constructor/__proto__/toString'), '/constructor/__proto__/toString');
});

test('11-09 dagi o‘zbekcha manzillar ham ochiladi va inglizchaga almashadi', () => {
  assert.equal(toInternalPath('/tolovlar'), '/payments');
  assert.equal(toInternalPath('/davomat'), '/preschool-attendance');
  assert.equal(toPrettyPath(toInternalPath('/kunlik-kassa')), '/daily-cash');
  assert.equal(toInternalPath('/oquvchi-shartnomalari/katta-yoshli/tahrirlash/5'), '/students-contract/adult/edit/5');
  assert.equal(toPrettyPath(toInternalPath('/foydalanuvchilar/42/tahrirlash')), '/accounts/42/edit');
  // har bir marshrutning o'zbekcha shakli ichki yo'lga qaytadi
  for (const path of routePaths) {
    const uz = path
      .split('/')
      .map((s) => (Object.hasOwn(LEGACY_UZ, s) ? LEGACY_UZ[s] : s))
      .join('/');
    assert.equal(toInternalPath(uz), path, `${path} ← ${uz}`);
  }
});
