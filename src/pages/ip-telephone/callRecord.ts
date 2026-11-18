/**
 * PBX (`mainoffice.uz`) qo'ng'iroq yozuvi (CDR) tiplari va SOF tahlil
 * yordamchilari — `ip-telephone/index.tsx` va boshqaruv panelining "Sotuv"
 * tabidagi telefon statistikasi shu yerdan foydalanadi.
 */

export interface CallRecord {
  vaqt: string;
  raqam: string;
  davomiyligi: number;
  operator: string;
  status: 'ANSWERED' | 'FAILED' | 'NO ANSWER';
  baho: string;
  recordingfile: string;
  /**
   * Faqat `collapseCallLegs` natijasida bo'ladi: qo'ng'iroq nechta CDR qatordan
   * (oyoqdan) yig'ilgan. PBX javobida bu maydon yo'q.
   */
  legs?: number;
}

export interface HistoryResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  data: CallRecord[];
}

export function formatDuration(sec: number): string {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * PBX `vaqt` maydoni zona belgisisiz Toshkent devor vaqti
 * ("2026-09-01T12:52:42") — UTC EMAS. `Date` ga bevosita bermasdan satrdan
 * o'qiladi, so'ng LOKAL sana sifatida quriladi (ilova Toshkent bo'yicha
 * ishlagani uchun to'g'ri chiqadi).
 */
export function parseCallDate(vaqt: string): Date | null {
  if (!vaqt) return null;
  const m = vaqt.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0'));
  }
  const dt = new Date(vaqt);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Barcha chiquvchi qo'ng'iroqlar shu shahar raqamidan ketadi — ichki raqam emas. */
export const MAIN_TRUNK = '552051515';

/**
 * Kiruvchi qo'ng'iroqlar avval tushadigan ichki raqam (guruh/navbat) — odam
 * emas: har bir kiruvchi qo'ng'iroqda unga jiringlash urinishlari (FAILED /
 * NO ANSWER) yoziladi va u hech qachon chiquvchi qo'ng'iroq qilmaydi. Haqiqiy
 * operator — shu qo'ng'iroqqa undan keyin javob bergan boshqa ichki raqam.
 * Faqat shu raqamning o'zi javob bergan qo'ng'iroq (hech bir operator ulanmagan —
 * avtojavob/ovozli xabar) operatorsiz hisoblanadi.
 */
export const INBOUND_GROUP_EXT = '1000';

export const isOperatorNumber = (num: string): boolean => {
  if (!num) return false;
  return num === MAIN_TRUNK || (num.length === 4 && Number(num) >= 1000);
};

export type CallDirection = 'in' | 'out' | 'unknown';

export const getCallInfo = (r: CallRecord): { client: string; op: string; direction: CallDirection } => {
  let client = r.operator;
  let op = r.raqam;
  let direction: CallDirection = 'unknown';

  if (isOperatorNumber(r.raqam) && !isOperatorNumber(r.operator)) {
    op = r.raqam;
    client = r.operator;
    direction = 'out';
  } else if (!isOperatorNumber(r.raqam) && isOperatorNumber(r.operator)) {
    client = r.raqam;
    op = r.operator;
    direction = 'in';
  } else {
    if (r.recordingfile?.startsWith('in-')) direction = 'in';
    else if (r.recordingfile?.startsWith('out-')) direction = 'out';
  }

  if (r.recordingfile) {
    if (r.recordingfile.startsWith('in-')) direction = 'in';
    if (r.recordingfile.startsWith('out-')) direction = 'out';
  }

  return { client, op, direction };
};

export const getLoginFromRecordingFile = (filename: string): string | null => {
  if (!filename) return null;
  const match = filename.match(/^(?:in|out)-\d+-(\d+)-/);
  return match ? match[1] : null;
};

/**
 * Qo'ng'iroqni bajargan operatorning ichki raqami.
 *
 * Kiruvchida CDR `operator` maydonida ichki raqam turadi, yozuv fayli nomida esa
 * (`in-<shahar raqami>-<MIJOZ>-…`) ichki raqam YO'Q — ikkinchi raqam mijozning
 * o'zi. Ilgari fayl nomi avval o'qilardi va "Operator" ustunida mijozning o'z
 * raqami chiqardi. Javob berilmagan kiruvchini hech kim bajarmagan (`null`);
 * faqat guruh (`INBOUND_GROUP_EXT`) javob bergan bo'lsa ham operator yo'q (`null`).
 *
 * Chiquvchida hammasi bitta shahar raqamidan (`MAIN_TRUNK`) ketadi va ichki raqam
 * faqat yozuv fayli nomida (`out-<mijoz>-<ICHKI>-…`) qoladi — yozuv bo'lmasa,
 * chiquvchini hech kimga bog'lab bo'lmaydi.
 */
export const resolveOperatorLogin = (r: CallRecord): string | null => {
  const { op, direction } = getCallInfo(r);

  if (direction === 'in') {
    const answeredByOperator =
      r.status === 'ANSWERED' && op !== MAIN_TRUNK && op !== INBOUND_GROUP_EXT;
    return answeredByOperator && isOperatorNumber(op) ? op : null;
  }
  return getLoginFromRecordingFile(r.recordingfile);
};

// ── Bitta qo'ng'iroq = bitta qator ──────────────────────────────────────────
// PBX (Asterisk CDR) har bir "oyoq"ni (leg) alohida yozuv qilib beradi: kiruvchi
// qo'ng'iroq ichki raqam(lar)ga yo'naltirilganda har bir jiringlash urinishi va
// har bir qurilma uchun alohida qator tushadi (FAILED / NO ANSWER / ANSWERED).
// Bitta qo'ng'iroqning hamma oyoqlari BIR XIL yozuv fayli nomiga ega (nomida
// Asterisk uniqueid bor), shu sabab shu nom qo'ng'iroqning o'zini bildiradi.
// Birlashtirmasdan jadvalda bitta qo'ng'iroq 4–60 marta takrorlanib chiqardi,
// statistikada esa javob berilganlik foizi va holatlar soni buzilardi.
// Chiquvchi qo'ng'iroqlar doim bitta qatordan iborat — ularga ta'sir qilmaydi.

/** Bitta qo'ng'iroqning barcha oyoqlari uchun umumiy kalit. */
export const callKey = (r: CallRecord): string =>
  r.recordingfile || `${r.vaqt}|${r.raqam}|${r.operator}`;

/**
 * Holat ustuvorligi — qo'ng'iroq natijasini uning ENG yaxshi oyog'i belgilaydi:
 * birontasi javob bergan bo'lsa "javob berildi"; hech kim javob bermagan bo'lsa
 * "javobsiz" (jiringlagan, lekin olinmagan); qolgan oyoqlar (FAILED) — ulanmagan
 * qurilmalar shovqini, ular natijani buzmasligi kerak.
 */
const STATUS_RANK: Record<string, number> = { ANSWERED: 4, 'NO ANSWER': 3, BUSY: 2, FAILED: 1 };
const statusRank = (s: string): number => STATUS_RANK[s] ?? 0;
const durationOf = (r: CallRecord): number => Number(r.davomiyligi) || 0;

/** Yangisi birinchi. PBX `vaqt` formati qat'iy ("YYYY-MM-DDTHH:MM:SS"), satr taqqoslash yetadi. */
const byStartDesc = (a: CallRecord, b: CallRecord): number =>
  a.vaqt < b.vaqt ? 1 : a.vaqt > b.vaqt ? -1 : 0;

/**
 * Kiruvchi qo'ng'iroqqa javob bergan operatorning ichki raqami.
 *
 * Javob berilganda CDR'da odatda ikkita ANSWERED oyoq bo'ladi: guruh
 * (`INBOUND_GROUP_EXT`, butun suhbat davomiyligi bilan) va unga ulangan haqiqiy
 * operator (qisqa oyoq). Operator sifatida guruhdan BOSHQA ichki raqam olinadi
 * (bir nechta bo'lsa — eng uzun oyoqniki); topilmasa `null` (qo'ng'iroqqa guruhning
 * o'zi javob bergan — oyoqdagi raqam o'zgarishsiz qoladi).
 */
function answeringExt(group: CallRecord[]): string | null {
  let found: CallRecord | null = null;
  for (const leg of group) {
    if (leg.status !== 'ANSWERED') continue;
    // mijoz -> ichki raqam oyog'i (masalan `LC-1001` kabi ichki kanal oyoqlari emas)
    if (isOperatorNumber(leg.raqam) || !isOperatorNumber(leg.operator)) continue;
    if (leg.operator === INBOUND_GROUP_EXT || leg.operator === MAIN_TRUNK) continue;
    if (!found || durationOf(leg) > durationOf(found)) found = leg;
  }
  return found ? found.operator : null;
}

/**
 * CDR qatorlarini (oyoqlarni) qo'ng'iroqlarga birlashtiradi.
 *
 * - qo'ng'iroq vaqti — oyoqlarning ENG ERTA vaqti (qo'ng'iroq boshlangan payt;
 *   yozuv fayli nomidagi vaqt bilan mos);
 * - holat — eng yaxshi oyoqniki (`STATUS_RANK`);
 * - davomiyligi va qolgan maydonlar — o'sha holatdagi eng uzun oyoqdan (javob
 *   berilganda bu haqiqiy suhbat davomiyligi);
 * - javob berilgan KIRUVCHI qo'ng'iroqda `operator` — javob bergan operatorning
 *   ichki raqami (`answeringExt`), qolgan hollarda tanlangan oyoqniki;
 * - natija yangi qo'ng'iroqdan eskisiga tartiblanadi.
 */
export function collapseCallLegs(legs: CallRecord[]): CallRecord[] {
  const groups = new Map<string, CallRecord[]>();
  for (const leg of legs) {
    const key = callKey(leg);
    const group = groups.get(key);
    if (group) group.push(leg);
    else groups.set(key, [leg]);
  }

  const calls: CallRecord[] = [];
  for (const group of groups.values()) {
    let best = group[0];
    let start = group[0].vaqt;
    for (let i = 1; i < group.length; i++) {
      const leg = group[i];
      if (leg.vaqt < start) start = leg.vaqt;
      const byStatus = statusRank(leg.status) - statusRank(best.status);
      if (byStatus > 0 || (byStatus === 0 && durationOf(leg) > durationOf(best))) best = leg;
    }
    const answeredBy =
      best.status === 'ANSWERED' && getCallInfo(best).direction === 'in' ? answeringExt(group) : null;
    calls.push({
      ...best,
      ...(answeredBy ? { operator: answeredBy } : null),
      vaqt: start,
      legs: group.length,
    });
  }
  return calls.sort(byStartDesc);
}

/**
 * Mavjud qo'ng'iroqlar ro'yxatiga (`prev`) yangi olingan, ALLAQACHON birlashtirilgan
 * qo'ng'iroqlarni (`incoming`) qo'shadi.
 *
 * - yangi qo'ng'iroq (kaliti ro'yxatda yo'q) — qo'shiladi;
 * - ro'yxatdagi qo'ng'iroq — faqat yangi variantda oyoqlar KO'PROQ bo'lsa
 *   almashtiriladi (CDR oyoqlari bir necha soniya kechikib tushishi mumkin).
 *   Oxirgi qatorlar oynasi eski qo'ng'iroqni o'rtasidan kesib qo'yishi mumkin —
 *   unda oyoq KAMROQ bo'ladi va to'liq variant saqlanib qoladi;
 * - hech narsa o'zgarmasa, o'sha `prev` massivi qaytadi (ortiqcha render yo'q).
 */
export function mergeCalls(prev: CallRecord[], incoming: CallRecord[]): CallRecord[] {
  if (!incoming.length) return prev;

  const indexByKey = new Map<string, number>();
  prev.forEach((r, i) => indexByKey.set(callKey(r), i));

  let replaced: CallRecord[] | null = null;
  const added: CallRecord[] = [];
  for (const call of incoming) {
    const i = indexByKey.get(callKey(call));
    if (i === undefined) {
      added.push(call);
    } else if ((call.legs ?? 1) > (prev[i].legs ?? 1)) {
      replaced ??= prev.slice();
      replaced[i] = call;
    }
  }
  if (!added.length && !replaced) return prev;
  return [...added, ...(replaced ?? prev)].sort(byStartDesc);
}

/** PBXdan yangi olingan OXIRGI qatorlarni (oyoqlarni) birlashtirib, ro'yxatga qo'shadi. */
export function mergeLatestCalls(prev: CallRecord[], latestLegs: CallRecord[]): CallRecord[] {
  return mergeCalls(prev, collapseCallLegs(latestLegs));
}
