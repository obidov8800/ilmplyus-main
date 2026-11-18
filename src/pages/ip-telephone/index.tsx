import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { API } from '@/api/api';
import useAuthStore from '@/store/useAuthStore';
import { isAdminUser } from '@/utils/isAdminUser';
import { fetchLids } from '@/pages/lid/lid.service';
import { registerDataCache, useDataVersion } from '@/utils/dataSync';
import './ipTelephone.css';
import { useSip } from './useSip';
import type { IpTelefonOperator, IpTelefonContact } from '@/features/sip/CallModal';
import useCallUIStore from '@/features/sip/useCallUIStore';
import { useTelephonyRealtime } from '@/features/sip/useTelephonyRealtime';
import type { CallSummary } from '@/features/sip/types';
import { useTranslation } from 'react-i18next';
import LeadDetailsModal from '@/components/LeadDetailsModal';
import type { Lid } from '@/types/lid.types';
import useDashboardSettings from '@/store/useDashboardSettings';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues, type FilterBarValues } from '@/components/FilterBar/filterBar.utils';
import FilterButton from '@/components/FilterButton';

import {
  type CallRecord,
  getCallInfo,
  resolveOperatorLogin,
  formatDuration,
  mergeCalls,
  MAIN_TRUNK,
} from './callRecord';
import {
  PBX_BASE_URL as BASE_URL,
  fetchRecentCalls,
  loadCallHistory,
  peekCallHistory,
  rememberCallHistory,
} from './callHistory';
import { CallStatusBadge, CallStatusLegend } from './callStatus';
import { useDuplicateSipTabs } from './useDuplicateSipTabs';

type IptFilterKey = 'operator' | 'filial' | 'date';

/**
 * Operatorlar va lidlar ro'yxati sahifadan chiqib-kirganda qayta yuklanmasin.
 * Qo'ng'iroqlar tarixi `callHistory.ts`da saqlanadi.
 */
interface LookupCache {
  operators: IpTelefonOperator[] | null;
  operatorsAt: number;
  phoneToName: Record<string, string> | null;
  phoneToLid: Record<string, Lid> | null;
  lidsAt: number;
}
const lookupCache: LookupCache = {
  operators: null,
  operatorsAt: 0,
  phoneToName: null,
  phoneToLid: null,
  lidsAt: 0,
};
/** Operatorlar kamdan-kam o'zgaradi, lidlar ro'yxati esa og'ir (1000 ta) — shuncha vaqt qayta so'ralmaydi. */
const OPERATORS_TTL_MS = 60_000;
const LIDS_TTL_MS = 10 * 60_000;

// Yozuvchi so'rovdan keyin (yangi lid qo'shildi, operator o'zgardi...) bu xotira eskiradi: raqam → mijoz ismi
// ro'yxati yangi lidni ko'rmay, qo'ng'iroq F5 gacha "noma'lum raqam" bo'lib qolardi. TTL'ni nolga tushiramiz.
registerDataCache(() => {
  lookupCache.operatorsAt = 0;
  lookupCache.lidsAt = 0;
});

// PBX (`mainoffice.uz`) qo'ng'iroq vaqtini zona belgisisiz qaytaradi
// (masalan "2026-08-24T13:24:00") — bu UTC EMAS, serverning o'z (Toshkent)
// devor vaqti, chunki PBX mahalliy qurilma, bulutdagi UTC xizmat emas.
// Shu sabab umumiy `utils/date.ts`dagi `formatDateTime` bu yerga mos
// emas — u zona belgisiz vaqtni UTC deb hisoblaydi (asosiy backend
// uchun to'g'ri, lekin PBX uchun noto'g'ri: haqiqiy vaqtga yana +5 soat
// qo'shib, masalan 13:24 o'rniga 18:24 ko'rsatib qo'yardi). Shu sabab
// raqamlar `Date`dan umuman o'tkazmasdan, to'g'ridan-to'g'ri satrning
// o'zidan olinadi — qaysi qurilmadan ko'rilishidan qat'i nazar bir xil.
function formatDateTime(iso: string): string {
  if (!iso) return '-';
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${hour}:${minute} ${day}.${month}.${year}`;
  }
  // Kutilmagan format uchun zaxira — hech bo'lmasa nimadir ko'rsatiladi.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const time = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('ru-RU');
  return `${time} ${date}`;
}

// ── Hozirgina tugagan qo'ng'iroq ────────────────────────────────────────────
// Asterisk CDR yozuvini kanal butunlay yopilgandan KEYIN yozadi va bu bir
// necha soniya kechikadi. Shu sabab "tugadi -> jadvalda ko'rindi" oralig'ida
// bo'shliq bor edi. Endi suhbat tugashi bilan SIP hodisasidagi ma'lumotdan
// VAQTINCHA qator yasaladi va darhol jadval boshiga qo'yiladi; PBX yozuvi
// kelgach o'sha vaqtinchalik qator o'chiriladi.

/** Vaqtinchalik qator — PBX yozuvi kelmaguncha ko'rsatiladi. */
type PendingRecord = CallRecord & {
  __pending: true;
  /** Qo'ng'iroqni bajargan ichki raqam (yozuv fayli yo'q, shu sabab alohida). */
  __opLogin: string | null;
  /** Nechta millisekunddan beri turibdi — eskirganini tashlash uchun. */
  __addedAt: number;
};

const isPendingRecord = (r: CallRecord): r is PendingRecord =>
  (r as PendingRecord).__pending === true;

/** PBX `vaqt` formatidagi (zona belgisisiz, mahalliy) satr. */
function toPbxTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

/** SIP hodisasidagi yakuniy holatni CDR disposition'iga o'giradi. */
function summaryStatus(s: CallSummary): string {
  if (s.answeredAt) return 'ANSWERED';
  if (s.reason === 'busy') return 'BUSY';
  if (s.reason === 'rejected' || s.reason === 'canceled' || s.reason === 'failed') return 'FAILED';
  return 'NO ANSWER';
}

/** Tugagan suhbatdan vaqtinchalik jadval qatorini yasaydi. */
function summaryToPending(s: CallSummary, extension: string | null): PendingRecord {
  const digits = (s.remote || '').replace(/\D/g, '');
  const startedAt = s.endedAt - (s.duration || 0) * 1000;
  const ext = extension || '';
  const isIn = s.direction === 'inbound';

  return {
    // `getCallInfo` yo'nalishni raqamlarning o'zidan aniqlaydi: ichki raqam
    // qaysi maydonda turgani "kiruvchi"/"chiquvchi"ni belgilaydi.
    raqam: isIn ? digits : ext || MAIN_TRUNK,
    operator: isIn ? ext || MAIN_TRUNK : digits,
    vaqt: toPbxTime(startedAt),
    davomiyligi: Math.max(0, Math.round(s.duration || 0)),
    status: summaryStatus(s) as CallRecord['status'],
    baho: '',
    recordingfile: '',
    __pending: true,
    __opLogin: ext || null,
    __addedAt: Date.now(),
  };
}

/** Vaqtinchalik qator PBX yozuvi bilan bir xilmi. */
function pendingMatchesReal(p: PendingRecord, real: CallRecord): boolean {
  const tail = (n: string) => n.replace(/\D/g, '').slice(-9);
  const pInfo = getCallInfo(p);
  const rInfo = getCallInfo(real);
  if (!tail(pInfo.client) || tail(pInfo.client) !== tail(rInfo.client)) return false;
  // PBX yozuvidagi vaqt taxminan bir xil bo'lishi kerak (±3 daqiqa) — aks
  // holda o'sha raqam bilan bo'lgan ESKI suhbat ham mos kelib qolardi.
  const pt = new Date(p.vaqt).getTime();
  const rt = new Date(real.vaqt).getTime();
  return Number.isFinite(pt) && Number.isFinite(rt) && Math.abs(pt - rt) < 3 * 60 * 1000;
}

interface AudioPlayerProps {
  filename: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ filename }) => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const fetchAndPlay = useCallback(async () => {
    if (audioUrl) {
      const audio = audioRef.current!;
      if (playing) {
        audio.pause();
        setPlaying(false);
      } else {
        window.dispatchEvent(new CustomEvent('stopAllAudio', { detail: filename }));
        audio.play();
        setPlaying(true);
      }
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/get_link/${filename}`);
      const json = await res.json();

      let url: string =
        json.download_url || json.url || json.link || json.file_url || json.path || '';

      if (url.startsWith('/')) {
        url = `${BASE_URL}${url}`;
      }

      if (!url) {
        throw new Error('Audio URL topilmadi');
      }

      setAudioUrl(url);
    } catch {
      setLoading(false);
    }
  }, [audioUrl, playing, filename]);

  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setLoading(false);
    });
    audio.addEventListener('timeupdate', () => {
      setProgress(audio.currentTime / audio.duration || 0);
    });
    audio.addEventListener('ended', () => {
      setPlaying(false);
      setProgress(0);
    });
    audio
      .play()
      .then(() => {
        window.dispatchEvent(new CustomEvent('stopAllAudio', { detail: filename }));
        setPlaying(true);
      })
      .catch(() => setLoading(false));

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl, filename]);

  useEffect(() => {
    const handleStopOtherAudio = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail !== filename) {
        if (audioRef.current && playing) {
          audioRef.current.pause();
          setPlaying(false);
        }
      }
    };

    window.addEventListener('stopAllAudio', handleStopOtherAudio);
    return () => window.removeEventListener('stopAllAudio', handleStopOtherAudio);
  }, [playing, filename]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setProgress(val);
    if (audioRef.current) audioRef.current.currentTime = val * audioRef.current.duration;
  };

  const displayTime = duration ? formatDuration(Math.round(duration)) : '';

  return (
    <div className="ipt-audio-player">
      <button
        className={`ipt-play-btn${loading ? ' ipt-loading' : ''}`}
        onClick={fetchAndPlay}
        disabled={loading}
        title={playing ? t('ipTelephone.audio.pause') : t('ipTelephone.audio.play')}
      >
        {loading ? (
          <i className="fas fa-spinner fa-spin" />
        ) : playing ? (
          <i className="fas fa-pause" />
        ) : (
          <i className="fas fa-play" />
        )}
      </button>

      <input
        type="range"
        className="ipt-progress"
        min={0}
        max={1}
        step={0.001}
        value={progress}
        onChange={seek}
      />

      {displayTime && <span className="ipt-duration">{displayTime}</span>}
    </div>
  );
};

const IPTelephone: React.FC = () => {
  const { t } = useTranslation();
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const location = useLocation();

  // Call display (the popup itself) is owned by GlobalCallWidget in Layout —
  // it survives navigation, where a locally-rendered modal would not. This
  // page only asks for it via useCallUIStore and reads call state to reflect
  // it in the table (active-row highlight, disabled buttons, SIP badge).
  const { callState, callTarget, registered, extension } = useSip(
    remoteAudioRef as React.RefObject<HTMLAudioElement>,
  );
  const openCall = useCallUIStore((s) => s.openCall);

  const currentUser = useAuthStore((s) => s.user);

  const { hasFeature } = useDashboardSettings();
  const canListen = hasFeature('ip_telephone.listen_recordings');

  // Sahifaga qaytilganda oxirgi ma'lum ma'lumot DARHOL ko'rinadi (bo'sh jadval /
  // aylanish belgisi chiqmaydi) — keyin u arzon yangilanadi.
  const [records, setRecords] = useState<CallRecord[]>(() => peekCallHistory() ?? []);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  /** Hozirgina tugagan, PBX yozuvi hali kelmagan qatorlar. */
  const [pendingRows, setPendingRows] = useState<PendingRecord[]>([]);
  const [loading, setLoading] = useState(() => !(peekCallHistory() && lookupCache.operators));
  /** Sahifadagi qatorlar soni — endi server limiti emas, mahalliy sahifalash. */
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);

  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [filterOperator, setFilterOperator] = useState('');
  const [filterFilial, setFilterFilial] = useState('');
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [operators, setOperators] = useState<IpTelefonOperator[]>(
    () => lookupCache.operators ?? [],
  );
  const [phoneToName, setPhoneToName] = useState<Record<string, string>>(
    () => lookupCache.phoneToName ?? {},
  );
  const [phoneToLid, setPhoneToLid] = useState<Record<string, Lid>>(
    () => lookupCache.phoneToLid ?? {},
  );
  const [selectedLid, setSelectedLid] = useState<Lid | null>(null);

  // ── "Operatorlar / Kontaktlar" paneli (Saralash tugmasidan oldin) ──
  // Kontaktlar — shu foydalanuvchining o'ziga tegishli operator yozuviga
  // (user_id orqali topiladi) bog'langan, tezkor yo'naltirish uchun oldindan
  // saqlab qo'yiladigan tashqi raqamlar. `GET .../contacts` 403/405 qaytaradi
  // — ro'yxat operatorning o'zi bilan birga (`/ip-telefon-operators`
  // javobi ichidagi `contacts` maydonidan) keladi.
  const myOperators = useMemo(
    // O'z login/paroli bilan kirgan xodimning `id`si `employees.id` — `user_id` bilan solishtirilmaydi.
    () => (currentUser?.account_type === 'employee' ? [] : operators.filter((o) => o.user_id === currentUser?.id)),
    [operators, currentUser?.id, currentUser?.account_type],
  );
  const myOperator = myOperators[0] ?? null;
  const contacts = myOperator?.contacts ?? [];

  /**
   * Operator yozuvlaridagi TAKRORLANISH ogohlantirishlari.
   *
  * SIP kredensiali `user_id` bo'yicha TOPILGAN BIRINCHI yozuvdan olinadi
   * (`SipProvider`), ichki raqam esa PBX'da bitta qurilmaga hisoblanadi.
   * Shu sabab ikkita muammo qo'ng'iroqni "ulanib, keyin uzilib qolish"ga
   * olib keladi va ikkalasi ham FAQAT ma'lumotlar bazasida (admin panelda)
   * tuzatiladi — frontend ularni o'zi tuzata olmaydi, lekin ko'rsatib
   * bera oladi:
  *   1) bitta foydalanuvchiga bir nechta operator yozuvi;
   *   2) bitta ichki raqam (login) bir nechta operator yozuvida — ikki
   *      brauzer bir xil raqam bilan ro'yxatdan o'tsa, PBX eskisini uzadi.
   */
  const sipTabConflict = useDuplicateSipTabs(extension, registered);

  const operatorWarnings = useMemo(() => {
    const list: string[] = [];

    if (sipTabConflict && extension) {
      list.push(t('ipTelephone.duplicateTabWarn', { ext: extension }));
    }

    if (myOperators.length > 1) {
      const name = myOperator?.user?.full_name ?? currentUser?.full_name ?? '—';
      list.push(t('ipTelephone.duplicateOperatorWarn', { name }));
    }

    const myLogin = myOperator ? String(myOperator.login) : null;
    if (myLogin) {
      const sameExt = operators.filter((o) => String(o.login) === myLogin);
      if (sameExt.length > 1) {
        list.push(t('ipTelephone.duplicateExtensionWarn', { ext: myLogin }));
      }
    }

    return list;
  }, [myOperators, myOperator, operators, currentUser?.full_name, sipTabConflict, extension, t]);

  const [showContactsPanel, setShowContactsPanel] = useState(false);
  const [contactsPanelTab, setContactsPanelTab] = useState<'operators' | 'contacts'>('operators');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '' });
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const contactsPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contactsPanelRef.current && !contactsPanelRef.current.contains(e.target as Node)) {
        setShowContactsPanel(false);
      }
    };
    if (showContactsPanel) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showContactsPanel]);

  const refetchOperators = useCallback(async () => {
    setContactsLoading(true);
    try {
      const { data } = await API.get('/ip-telefon-operators');
      setOperators(
        Array.isArray(data) ? data : ((data as { data?: IpTelefonOperator[] })?.data ?? []),
      );
    } catch {
      /* eskisi (myOperator.contacts) ko'rsatilishda davom etadi */
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showContactsPanel) refetchOperators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showContactsPanel]);

  const resetContactForm = () => {
    setContactForm({ name: '', phone: '' });
    setEditingContactId(null);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myOperator) return;
    const name = contactForm.name.trim();
    // Backend "+998..." formatini xatosiz saqlaydi (tasdiqlangan) — shu
    // sabab bu yerda "+" saqlab qolinadi (o'qish uchun standart ko'rinish).
    // Yo'naltirishda PBX faqat raqam talab qiladi — bu tozalash TransferService
    // (`cleanTarget`) orqali chaqiruv PAYTIDA, alohida, amalga oshiriladi.
    const phone = contactForm.phone.replace(/[^\d+]/g, '');
    if (!name || !phone) return;

    if (editingContactId) {
      await API.put(`/ip-telefon-operators/${myOperator.id}/contacts/${editingContactId}`, {
        name,
        phone,
      });
    } else {
      await API.post(`/ip-telefon-operators/${myOperator.id}/contacts`, { name, phone });
    }
    resetContactForm();
    await refetchOperators();
  };

  const handleContactEdit = (c: IpTelefonContact) => {
    setEditingContactId(c.id);
    setContactForm({ name: c.name, phone: c.phone });
  };

  const handleContactDelete = async (id: number) => {
    if (!myOperator) return;
    await API.delete(`/ip-telefon-operators/${myOperator.id}/contacts/${id}`);
    if (editingContactId === id) resetContactForm();
    await refetchOperators();
  };

  const FILTERS = [
    { key: 'all', label: t('ipTelephone.filters.all') },
    { key: 'in', label: t('ipTelephone.filters.in') },
    { key: 'out', label: t('ipTelephone.filters.out') },
    { key: 'missed', label: t('ipTelephone.filters.missed') },
    { key: 'rejected', label: t('ipTelephone.filters.rejected') },
  ];

  const getLidName = useCallback(
    (phone: string): string | null => {
      const digits = phone.replace(/\D/g, '');
      return phoneToName[digits] ?? phoneToName[digits.slice(-9)] ?? null;
    },
    [phoneToName],
  );

  const getLidByPhone = useCallback(
    (phone: string): Lid | null => {
      const digits = phone.replace(/\D/g, '');
      return phoneToLid[digits] ?? phoneToLid[digits.slice(-9)] ?? null;
    },
    [phoneToLid],
  );

  const findOperator = useCallback(
    (opLogin: string | null) =>
      opLogin ? (operators.find((o) => String(o.login) === opLogin) ?? null) : null,
    [operators],
  );

  /**
   * Qatorni bajargan ichki raqam.
   *
   * Vaqtinchalik (hozirgina tugagan) qatorda yozuv fayli yo'q, shu sabab
   * `resolveOperatorLogin` chiquvchi qo'ng'iroq uchun `null` qaytaradi —
   * bunday qatorda ichki raqam SIP seansidan bevosita olinadi.
   */
  const recordOpLogin = useCallback(
    (r: CallRecord): string | null =>
      isPendingRecord(r) ? r.__opLogin : resolveOperatorLogin(r),
    [],
  );

  const getOperatorName = useCallback(
    (opLogin: string | null): string => {
      if (!opLogin) return '—';
      const found = findOperator(opLogin);
      if (!found) return opLogin;
      if (found.user?.full_name) return found.user.full_name;
      return found.name || opLogin;
    },
    [findOperator],
  );

  /** Qo'ng'iroq qaysi filialga tegishli — operatorning ichki raqami orqali. */
  const getRecordBranchId = useCallback(
    (r: CallRecord): number | null => {
      const found = findOperator(recordOpLogin(r));
      return found?.branch_id ?? found?.branch?.id ?? null;
    },
    [findOperator, recordOpLogin],
  );

  // Legacy entry point: something navigating here with a number to dial in
  // route state opens straight into the global popup (no local modal state
  // needed on this page anymore). LeadDetailsModal now opens the popup
  // directly instead of navigating, but this still covers any other caller
  // that does the same.
  useEffect(() => {
    const state = location.state as { callNumber?: string } | null;
    if (state?.callNumber) {
      openCall(state.callNumber);
      window.history.replaceState({}, '');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Sahifa ochilganda ma'lumotni yig'adi. Manbalar (tarix, operatorlar, lidlar)
   * BIR-BIRINI KUTMAYDI — har biri kelishi bilan o'z holatini yangilaydi. Ilgari
   * hammasi bitta `Promise.all` da kutilardi: jadval eng sekin (og'ir lidlar)
   * so'rov tugamaguncha bo'sh turardi, tarix sahifalari esa ketma-ket olinardi.
   *
   * - oxirgi tashrifdagi ma'lumot DARHOL ko'rinadi (state shundan boshlanadi),
   *   ustiga arzon yangilash: faqat oxirgi qo'ng'iroqlar (`fetchRecentCalls`);
   * - jadval tarix + operatorlar kelgach chiziladi — operatorlarsiz filial va
   *   operator nomi noto'g'ri chiqib, so'ng "sakrab" o'zgarardi;
   * - lidlar (eng og'iri) kelgach mijoz ismlari qo'shiladi.
   */
  const loadTelephonyData = useCallback(() => {
    const now = Date.now();
    const cachedCalls = peekCallHistory();

    let historyReady = !!cachedCalls;
    let operatorsReady = !!lookupCache.operators;
    const settle = () => {
      if (historyReady && operatorsReady) setLoading(false);
    };
    settle();

    // 1) Qo'ng'iroqlar tarixi
    (cachedCalls ? fetchRecentCalls(cachedCalls) : loadCallHistory())
      .then((fresh) => {
        setRecords((prev) => {
          const next = mergeCalls(prev, fresh);
          if (next !== prev) rememberCallHistory(next);
          return next;
        });
      })
      .catch(() => {
        /* jadval bor holatda qoladi; keyingi kirishda qayta uriniladi */
      })
      .finally(() => {
        historyReady = true;
        settle();
      });

    // 2) Operatorlar
    if (!lookupCache.operators || now - lookupCache.operatorsAt > OPERATORS_TTL_MS) {
      API.get('/ip-telefon-operators')
        .then(
          (r) => (Array.isArray(r.data) ? r.data : (r.data?.data ?? [])) as IpTelefonOperator[],
        )
        .then((ops) => {
          lookupCache.operators = ops;
          lookupCache.operatorsAt = Date.now();
          setOperators(ops);
        })
        .catch(() => {
          /* eski ro'yxat (bo'lsa) qoladi */
        })
        .finally(() => {
          operatorsReady = true;
          settle();
        });
    }

    // 3) Lidlar — jadvalni kutdirmaydi, kelgach mijoz ismlari qo'shiladi
    if (!lookupCache.phoneToName || now - lookupCache.lidsAt > LIDS_TTL_MS) {
      fetchLids({ page: 1, per_page: 1000 })
        .then((list) => {
          const nameMap: Record<string, string> = {};
          const lidMap: Record<string, Lid> = {};
          list.forEach((lid) => {
            if (!lid.phone) return;
            const digits = lid.phone.replace(/\D/g, '');
            const fish = [lid.last_name, lid.first_name].filter(Boolean).join(' ');
            nameMap[digits] = fish;
            lidMap[digits] = lid;
            if (digits.length >= 9) {
              nameMap[digits.slice(-9)] = fish;
              lidMap[digits.slice(-9)] = lid;
            }
          });
          lookupCache.phoneToName = nameMap;
          lookupCache.phoneToLid = lidMap;
          lookupCache.lidsAt = Date.now();
          setPhoneToName(nameMap);
          setPhoneToLid(lidMap);
        })
        .catch(() => {
          /* ismlar chiqmaydi, jadval ishlayveradi */
        });
    }
    // Tarix butunligicha yuklanadi — sahifa hajmi (`limit`) faqat mahalliy
    // sahifalashga ta'sir qiladi, so'rovga emas.
  }, []);

  // `dataVersion` — yozuvchi so'rov muvaffaqiyatli bo'lganda o'zgaradi (utils/dataSync.ts): sahifa ochiq turganda
  // ham operatorlar va lidlar (mijoz ismlari) qayta yuklanadi.
  const dataVersion = useDataVersion();
  useEffect(() => {
    loadTelephonyData();
  }, [loadTelephonyData, dataVersion]);

  // ── REALTIME ──
  // The SIP socket already tells us the instant a call ends, so the history
  // table refreshes itself instead of waiting for a manual reload or a poll.
  // Asterisk writes the CDR as the channel tears down; a short delay avoids
  // racing it and fetching the list without the row we just generated.
  /**
   * Qo'ng'iroq tugagach faqat OXIRGI yozuvlarni olib, ro'yxatga qo'shadi.
   *
   * Butun tarixni qayta yuklash shart emas (minglab qator) — bitta kichik so'rov
   * yetadi va yangi qator darhol chiqadi. Olingan qatorlar ham qo'ng'iroqlarga
   * birlashtiriladi; ro'yxatda allaqachon bor qo'ng'iroq faqat oyoqlari ko'proq
   * bo'lsagina yangilanadi (CDR oyoqlari kechikib tushishi mumkin), shuning
   * uchun bir necha marta chaqirish xavfsiz — `mergeCalls`.
   */
  const refreshLatest = useCallback(async () => {
    const fresh = await fetchRecentCalls(recordsRef.current).catch(() => [] as CallRecord[]);
    if (!fresh.length) return;

    setRecords((prev) => {
      const next = mergeCalls(prev, fresh);
      if (next !== prev) rememberCallHistory(next);
      return next;
    });
  }, []);

  const extensionRef = useRef(extension);
  extensionRef.current = extension;

  useTelephonyRealtime({
    onCallEnded: (summary) => {
      // 1) DARHOL: suhbat tugagan zahoti SIP hodisasidagi ma'lumotdan
      //    vaqtinchalik qator qo'yiladi — foydalanuvchi kutib turmaydi.
      setPendingRows((prev) => [summaryToPending(summary, extensionRef.current), ...prev]);

      // 2) KEYIN: Asterisk CDR ni kanal yopilgandan KEYIN yozadi va bu ba'zan
      //    bir necha soniya kechikadi, shuning uchun bir necha marta qayta
      //    uriniladi. Haqiqiy yozuv kelgach vaqtinchalik qator o'chadi.
      [800, 2000, 4000, 8000, 15000].forEach((ms) => {
        window.setTimeout(() => {
          void refreshLatest();
        }, ms);
      });
    },
  });

  // Vaqtinchalik qatorni PBX yozuvi almashtirgach olib tashlaymiz. Yozuv
  // umuman kelmasa ham qator abadiy qolib ketmasin — 3 daqiqadan keyin
  // baribir o'chadi (bu holda jadval oddiygina PBX ma'lumotini ko'rsatadi).
  useEffect(() => {
    if (!pendingRows.length) return;
    setPendingRows((prev) => {
      const next = prev.filter(
        (p) =>
          Date.now() - p.__addedAt < 3 * 60 * 1000 &&
          !records.some((r) => pendingMatchesReal(p, r)),
      );
      return next.length === prev.length ? prev : next;
    });
  }, [records, pendingRows.length]);

  useEffect(() => {
    if (!pendingRows.length) return;
    const timer = window.setTimeout(
      () => setPendingRows((prev) => prev.filter((p) => Date.now() - p.__addedAt < 3 * 60 * 1000)),
      3 * 60 * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [pendingRows]);

  // Incoming rings, hangup/close and hiding the popup once the call ends are
  // all handled by GlobalCallWidget now — this just asks for the popup with
  // the row's number pre-filled, floating so the table stays usable.
  const handleCallClick = useCallback(
    (raqam: string) => {
      if (callState !== 'idle') return;
      openCall(raqam);
    },
    [callState, openCall],
  );

  const uniqueBranches = operators
    .filter((o) => o.branch)
    .reduce<{ id: number; name: string }[]>((acc, o) => {
      if (!o.branch || acc.find((b) => b.id === o.branch!.id)) return acc;
      acc.push({ id: o.branch.id, name: o.branch.name_uz || String(o.branch.id) });
      return acc;
    }, []);

  const filterValues: FilterBarValues<IptFilterKey> = {
    operator: filterOperator,
    filial: filterFilial,
    date: dateFilter,
  };

  const filterFields: FilterBarField<IptFilterKey>[] = [
    {
      key: 'operator',
      label: t('ipTelephone.filterByOperator'),
      placeholder: t('ipTelephone.allOperators'),
      options: operators.map((o) => ({
        value: String(o.login),
        label: o.user?.full_name
          ? o.user.full_name
          : o.name || String(o.login),
      })),
    },
    {
      key: 'filial',
      label: t('ipTelephone.filterByBranch'),
      placeholder: t('ipTelephone.allBranches'),
      options: uniqueBranches.map((b) => ({ value: String(b.id), label: b.name })),
    },
    {
      key: 'date',
      label: t('ipTelephone.dateFilter'),
      type: 'date',
    },
  ];

  const activeFilterCount = countFilterBarValues(filterValues);

  const handleFiltersChange = useCallback((next: FilterBarValues<IptFilterKey>) => {
    setFilterOperator(next.operator);
    setFilterFilial(next.filial);
    setDateFilter(next.date);
  }, []);

  const handleFiltersReset = useCallback(() => {
    setFilterOperator('');
    setFilterFilial('');
    setDateFilter('');
  }, []);

  // Foydalanuvchi o'z filialining qo'ng'iroqlarini ko'radi. Admin — hammasini.
  // Filiali aniqlanmagan qatorlar (asosan yozuvsiz chiquvchi qo'ng'iroqlar,
  // ular bitta shahar raqamidan ketadi) yashirilmaydi — aks holda data yo'qoladi.
  const ownBranchId = isAdminUser(currentUser) ? null : (currentUser?.branch_id ?? null);

  // Hozirgina tugagan qo'ng'iroqlar PBX yozuvidan oldin keladi — shuning
  // uchun ular ro'yxatning boshiga qo'yiladi va oddiy qatorlar kabi
  // filtrlanadi.
  const allRows: CallRecord[] = pendingRows.length ? [...pendingRows, ...records] : records;

  const displayed = allRows.filter((r) => {
    const { client, op, direction } = getCallInfo(r);

    const matchOwnBranch = (() => {
      if (ownBranchId == null) return true;
      const recBranchId = getRecordBranchId(r);
      return recBranchId == null || recBranchId === ownBranchId;
    })();
    if (!matchOwnBranch) return false;

    const matchSearch = !search || client.includes(search) || op.includes(search);

    let matchTab = true;
    if (activeFilter === 'missed') {
      matchTab = r.status === 'NO ANSWER';
    } else if (activeFilter === 'rejected') {
      matchTab = r.status === 'FAILED';
    } else if (activeFilter === 'in') {
      matchTab = direction === 'in';
    } else if (activeFilter === 'out') {
      matchTab = direction === 'out';
    }

    const matchDate = (() => {
      if (!dateFilter) return true;
      const recDate = new Date(r.vaqt).toLocaleDateString('ru-RU');
      const filterDate = new Date(dateFilter).toLocaleDateString('ru-RU');
      return recDate === filterDate;
    })();

    const matchOperator = !filterOperator || recordOpLogin(r) === filterOperator;

    const matchFilial = !filterFilial || String(getRecordBranchId(r)) === filterFilial;

    return matchSearch && matchTab && matchDate && matchOperator && matchFilial;
  });

  // ── Sahifalash ──
  // Filtr butun tarix bo'yicha ishlaydi, ekranga esa faqat joriy sahifa
  // chiqadi. "Jami" — filtrlangan yozuvlar soni (filtrsiz holatda butun tarix).
  const totalFiltered = displayed.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);
  const paged = displayed.slice((safePage - 1) * limit, safePage * limit);

  // Filtr yoki sahifa hajmi o'zgarsa boshiga qaytamiz — aks holda bo'sh
  // sahifada turib qolish mumkin edi.
  useEffect(() => {
    setPage(1);
  }, [search, activeFilter, dateFilter, filterOperator, filterFilial, limit]);

  const isCallActive = callState !== 'idle';

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      <div className="ipt-page container">
        <div className="ipt-header">
          <div className="ipt-header-right">
            <span className={`ipt-sip-status ${registered ? 'registered' : 'unregistered'}`}>
              <span className="ipt-sip-dot" />
              {registered ? t('ipTelephone.sipConnected') : t('ipTelephone.sipDisconnected')}
            </span>

            <button
              className="ipt-call-btn"
              disabled={isCallActive}
              onClick={() => openCall('')}
            >
              {t('ipTelephone.callBtn')}
            </button>
          </div>
        </div>

        {operatorWarnings.length > 0 && (
          <div className="ipt-warnings" role="alert">
            {operatorWarnings.map((w) => (
              <p key={w} className="ipt-warning">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                <span>{w}</span>
              </p>
            ))}
          </div>
        )}

        <div className="ipt-card">
          <div className="ipt-toolbar">
            <div className="ipt-tabs">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`ipt-tab${activeFilter === f.key ? ' active' : ''}`}
                  onClick={() => setActiveFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
              <CallStatusLegend />
            </div>

            <div className="ipt-toolbar-right">
              <div className="ipt-contacts-panel-wrap" ref={contactsPanelRef}>
                <button
                  type="button"
                  className={`filter-trigger-btn${showContactsPanel ? ' filter-trigger-btn--active' : ''}`}
                  onClick={() => setShowContactsPanel((v) => !v)}
                  aria-expanded={showContactsPanel}
                >
                  <i className="fa-solid fa-address-book filter-trigger-btn__icon" aria-hidden="true" />
                  {t('ipTelephone.contactsPanelBtn', 'Kontaktlar')}
                </button>

                {showContactsPanel && (
                  <div className="ipt-contacts-panel">
                    <div className="ipt-contacts-panel-header">
                      <span className="ipt-contacts-panel-title">
                        <i className="fa-solid fa-address-book" />
                        {t('ipTelephone.contactsPanelBtn', 'Kontaktlar')}
                      </span>
                      <button
                        type="button"
                        className="ipt-contacts-panel-close"
                        onClick={() => setShowContactsPanel(false)}
                        title={t('ipTelephone.callModal.close')}
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>

                    <div className="ipt-mode-tabs">
                      <button
                        className={`ipt-mode-btn ${contactsPanelTab === 'operators' ? 'active' : ''}`}
                        onClick={() => setContactsPanelTab('operators')}
                      >
                        {t('ipTelephone.tabOperators', 'Operatorlar')}
                      </button>
                      <button
                        className={`ipt-mode-btn ${contactsPanelTab === 'contacts' ? 'active' : ''}`}
                        onClick={() => setContactsPanelTab('contacts')}
                      >
                        {t('ipTelephone.tabContacts', 'Kontaktlar')}
                      </button>
                    </div>

                    {contactsPanelTab === 'operators' ? (
                      <div className="ipt-operator-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {operators.length === 0 ? (
                          <div className="ipt-operator-empty">
                            {t('ipTelephone.callModal.noOperators')}
                          </div>
                        ) : (
                          operators.map((op) => {
                            const fullName = op.user?.full_name
                              ? op.user.full_name
                              : op.name || t('ipTelephone.defaultOperator');
                            const initials = fullName
                              .split(' ')
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join('')
                              .toUpperCase();
                            return (
                              <div key={op.id} className="ipt-operator-item">
                                <span className="ipt-operator-avatar">{initials || '?'}</span>
                                <div className="ipt-operator-info">
                                  <div className="ipt-op-name">{fullName}</div>
                                  <div className="ipt-op-branch">
                                    {op.filial || t('ipTelephone.mainBranch')} · {op.login}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : !myOperator ? (
                      <div className="ipt-operator-empty">
                        {t('ipTelephone.noOwnOperator', 'Sizga bog‘langan operator topilmadi')}
                      </div>
                    ) : (
                      <>
                        <form onSubmit={handleContactSubmit} className="ipt-contact-form">
                          <input
                            type="text"
                            placeholder={t('ipTelephone.contactNamePlaceholder', 'Ism')}
                            value={contactForm.name}
                            onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                            className="ipt-manual-dial-input"
                            required
                          />
                          <input
                            type="tel"
                            inputMode="tel"
                            placeholder={t('ipTelephone.contactPhonePlaceholder', 'Telefon raqam')}
                            value={contactForm.phone}
                            onChange={(e) =>
                              setContactForm((p) => ({
                                ...p,
                                phone: e.target.value.replace(/[^\d+]/g, ''),
                              }))
                            }
                            className="ipt-manual-dial-input"
                            required
                          />
                          <button type="submit" className="ipt-contact-save-btn">
                            {editingContactId
                              ? t('ipTelephone.callModal.save', 'Saqlash')
                              : t('registrationModal.add', 'Qo‘shish')}
                          </button>
                        </form>

                        <div className="ipt-operator-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
                          {contactsLoading ? (
                            <div className="ipt-operator-empty">
                              <i className="fas fa-spinner fa-spin" /> {t('ipTelephone.loading')}
                            </div>
                          ) : contacts.length === 0 ? (
                            <div className="ipt-operator-empty">
                              {t('ipTelephone.noContacts', 'Kontaktlar yo‘q')}
                            </div>
                          ) : (
                            contacts.map((c) => (
                              <div key={c.id} className="ipt-operator-item">
                                <span className="ipt-operator-avatar">
                                  {c.name.slice(0, 2).toUpperCase()}
                                </span>
                                <div className="ipt-operator-info">
                                  <div className="ipt-op-name">{c.name}</div>
                                  <div className="ipt-op-branch">{c.phone}</div>
                                </div>
                                <div className="ipt-op-actions">
                                  <button
                                    type="button"
                                    onClick={() => handleContactEdit(c)}
                                    className="ipt-op-action"
                                    title={t('registrationModal.edit', 'Tahrirlash')}
                                  >
                                    <i className="fa-solid fa-pen" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleContactDelete(c.id)}
                                    className="ipt-op-action ipt-op-action--delete"
                                    title={t('ipTelephone.callModal.removeContact', 'O‘chirish')}
                                  >
                                    <i className="fa-solid fa-trash" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <FilterButton
                onClick={() => setShowSortPanel((v) => !v)}
                active={showSortPanel || activeFilterCount > 0}
                expanded={showSortPanel}
                count={activeFilterCount}
                label={t('ipTelephone.sortBtn')}
              />

              <div className="ipt-search-wrap">
                <i className="fas fa-search ipt-search-icon" />
                <input
                  className="ipt-search"
                  placeholder={t('ipTelephone.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {showSortPanel && (
            <FilterBar
              fields={filterFields}
              values={filterValues}
              onChange={handleFiltersChange}
              onReset={handleFiltersReset}
              onClose={() => setShowSortPanel(false)}
            />
          )}

          <div className="ipt-table-scroll">
          <table className="ipt-table data-table">
            {/* Ustun kengliklari qat'iy belgilangan (`table-layout: fixed`) —
                aks holda uzun mijoz ismi butun jadvalni qiyshaytirib,
                "Sana va vaqt" ustunini ikki qatorga bo'lib yuborardi. */}
            <colgroup>
              <col className="ipt-col--status" />
              <col className="ipt-col--client" />
              <col className="ipt-col--branch" />
              <col className="ipt-col--operator" />
              <col className="ipt-col--duration" />
              <col className="ipt-col--datetime" />
              <col className="ipt-col--actions" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('ipTelephone.table.status')}</th>
                <th>{t('ipTelephone.table.client')}</th>
                <th>{t('ipTelephone.table.branch')}</th>
                <th>{t('ipTelephone.table.operator')}</th>
                <th>{t('ipTelephone.table.duration')}</th>
                <th>{t('ipTelephone.table.datetime')}</th>
                <th>{t('ipTelephone.table.recording')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="ipt-loading-cell">
                    <i className="fas fa-spinner fa-spin" /> {t('ipTelephone.loading')}
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ipt-empty-cell">
                    {t('ipTelephone.noData')}
                  </td>
                </tr>
              ) : (
                paged.map((rec, idx) => {
                  const { client, direction } = getCallInfo(rec);
                  const recOpLogin = recordOpLogin(rec);
                  const recOperator = findOperator(recOpLogin);
                  const pending = isPendingRecord(rec);
                  const hasRecording = !!rec.recordingfile && rec.status === 'ANSWERED';
                  const isCalling = isCallActive && callTarget === `+${client}`;

                  return (
                    <tr
                      key={pending ? `pending-${rec.__addedAt}` : idx}
                      className={`${isCalling ? 'ipt-row-active' : ''}${pending ? ' ipt-row-pending' : ''}`}
                    >
                      <td>
                        <CallStatusBadge
                          status={rec.status}
                          direction={direction}
                          pending={pending}
                        />
                      </td>

                      <td className="ipt-phone-cell">
                        {getLidName(client) ? (
                          <span
                            className="ipt-client-link"
                            onClick={() => {
                              const lid = getLidByPhone(client);
                              if (lid) setSelectedLid(lid);
                            }}
                          >
                            <span style={{ fontWeight: 600, color: '#003366' }}>
                              {getLidName(client)}
                            </span>
                            <br />
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{client}</span>
                          </span>
                        ) : (
                          client
                        )}
                      </td>

                      {/* Filial faqat operator aniqlangandagina ma'lum. Ilgari bu yerda
                          topilmagan holat "Asosiy" deb ko'rsatilardi — bu noto'g'ri edi. */}
                      <td className="ipt-branch-cell">
                        {recOperator?.branch?.name_uz || recOperator?.filial || '—'}
                      </td>

                      <td className="ipt-operator-cell">{getOperatorName(recOpLogin)}</td>

                      <td className="ipt-duration-cell">
                        {rec.status === 'ANSWERED' && rec.davomiyligi > 0
                          ? formatDuration(rec.davomiyligi)
                          : '—'}
                      </td>

                      <td className="ipt-date-cell">
                        {formatDateTime(rec.vaqt)}
                        {pending && (
                          <span className="ipt-pending-tag" title={t('ipTelephone.pendingHint')}>
                            {t('ipTelephone.justNow')}
                          </span>
                        )}
                      </td>

                      <td>
                        <div
                          className={`ipt-actions-cell${!canListen ? ' ipt-actions-cell--centered' : ''}`}
                        >
                          <button
                            className={`ipt-row-call-btn${isCalling ? ' calling' : ''}`}
                            title={
                              isCalling
                                ? t('ipTelephone.callModal.callInProgress')
                                : t('ipTelephone.callModal.makeCall')
                            }
                            disabled={isCallActive && !isCalling}
                            onClick={() => handleCallClick(client)}
                          >
                            <i className={`fas ${isCalling ? 'fa-phone-volume' : 'fa-phone'}`} />
                          </button>

                          {canListen && hasRecording ? (
                            <AudioPlayer filename={rec.recordingfile} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>

          <div className="ipt-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span className="ipt-total-info">
                {t('ipTelephone.totalCalls', { count: totalFiltered })}
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  color: '#666',
                }}
              >
                <span>{t('ipTelephone.rows')}</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    outline: 'none',
                    cursor: 'pointer',
                    background: '#fff',
                    color: '#333',
                    fontSize: '14px',
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Sahifalar — ilgari umuman yo'q edi: 20 tadan keyingi
                qo'ng'iroqlarga o'tishning iloji bo'lmagan. */}
            {totalPages > 1 && (
              <div className="ipt-pager">
                <button
                  type="button"
                  className="ipt-pager__btn"
                  onClick={() => setPage(1)}
                  disabled={safePage === 1}
                  aria-label="←←"
                >
                  <i className="fa-solid fa-angles-left" />
                </button>
                <button
                  type="button"
                  className="ipt-pager__btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  <i className="fa-solid fa-angle-left" />
                </button>
                <span className="ipt-pager__info">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="ipt-pager__btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                >
                  <i className="fa-solid fa-angle-right" />
                </button>
                <button
                  type="button"
                  className="ipt-pager__btn"
                  onClick={() => setPage(totalPages)}
                  disabled={safePage === totalPages}
                >
                  <i className="fa-solid fa-angles-right" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedLid && (
        <LeadDetailsModal
          lead={selectedLid}
          onClose={() => setSelectedLid(null)}
          onEdit={setSelectedLid}
        />
      )}
    </>
  );
};

const IPTelephoneWrapper: React.FC = () => {
  const { hasFeature, settingsReady } = useDashboardSettings();

  // On a hard refresh, dashboard-settings hasn't come back from the API yet
  // and `hasFeature` reads an empty features list in the meantime — bouncing
  // straight to "/" here treated "not loaded yet" as "not permitted", so
  // refreshing this page always kicked even authorized operators back to
  // the home page. Wait for the real permissions before deciding.
  if (!settingsReady) return null;

  if (!hasFeature('ip_telephone.view')) {
    return <Navigate to="/" replace />;
  }

  return <IPTelephone />;
};

export default IPTelephoneWrapper;
