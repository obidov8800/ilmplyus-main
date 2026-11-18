// =============================================================================
// CallModal — shared call UI (dialpad / active call / incoming ring / transfer)
//
// Lives in features/sip (not pages/ip-telephone) so it can be mounted from
// GlobalCallWidget — which shows an incoming call popup on every authenticated
// page, not just the IP-telephony history page — without dragging that page's
// history-table bundle (API calls, lid lookups, etc.) along with it.
//
// The CSS is intentionally still imported from the ip-telephone page: it was
// written for this component and splitting it out risked missing rules. The
// import is safe from either caller — bundlers dedupe by resolved file path.
// =============================================================================
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from '@/api/api';
import type { ConferenceParticipant, TransferState } from './types';
import '../../pages/ip-telephone/ipTelephone.css';

export interface IpTelefonOperator {
  id: number;
  user_id: number;
  branch_id?: number | null;
  branch?: { id: number; name_uz: string | null; name_ru?: string | null };
  filial?: string;
  name?: string;
  login: number | string;
  user?: {
    id: number;
    full_name: string;
    username: string;
    phone: string;
  };
  /**
   * `GET /ip-telefon-operators/{id}/contacts` qaytaradi 405 — bu sub-resurs
   * uchun alohida ro'yxat endpointi yo'q, faqat qo'shish/tahrirlash/o'chirish
   * bor. Kontaktlar ro'yxati buning o'rniga operatorning shu maydonida,
   * `/ip-telefon-operators` javobining ICHIDA keladi.
   */
  contacts?: IpTelefonContact[];
}

/**
 * Operator oldindan saqlab qo'ygan tashqi raqam (tezkor yo'naltirish uchun).
 * Qo'shish/tahrirlash/o'chirish yo'naltirish oynasidagi "Kontaktlar" tabida
 * qilinadi; ro'yxat esa operator obyektining o'zi bilan birga keladi
 * (yuqoridagi izohga qarang).
 */
export interface IpTelefonContact {
  id: number;
  name: string;
  phone: string;
}

export interface CallModalProps {
  initialNumber: string;
  onCall: (number: string) => void;
  onHangup: () => void;
  onMute: (muted: boolean) => void;
  onHold: (held: boolean) => Promise<void>;
  onSendDtmf: (tone: string) => void;
  onAnswer: () => Promise<void>;
  callState: string;
  elapsed: number;
  onClose: () => void;
  onBlindTransfer: (ext: string) => Promise<void>;
  onAttendedTransfer: (ext: string) => Promise<void>;
  onCompleteTransfer: () => Promise<void>;
  onCancelTransfer: () => Promise<void>;
  /** Bridge the current consultation in instead of handing the call off */
  onMergeConsultation: () => Promise<void>;
  /** Drop one bridged conference participant, leaving everyone else connected */
  onRemoveConferenceParticipant: (callId: string) => Promise<void>;
  transfer: TransferState;
  /** Extra legs bridged in alongside the primary call, if any */
  conferenceParticipants: ConferenceParticipant[];
  isHeld: boolean;
  isMuted: boolean;
  operators: IpTelefonOperator[];
  /** This browser's own registered extension — scopes the saved-contacts list */
  extension: string | null;
  floating?: boolean;
  /** The modal's own maximize/minimize-to-corner control */
  onToggleFloating?: () => void;
  /** Minimized state is controlled by the parent (GlobalCallWidget) so it can
   *  keep rendering the minimized bar for its slide-out animation after the
   *  call has already ended — see `closing`. */
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  /** True while the parent is playing the minimized bar's exit animation
   *  before actually unmounting this component. */
  closing?: boolean;
}

const DIALPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/**
 * Live feedback for an in-flight transfer.
 *
 * The `consulting` phase is what makes "Kutib yo‘naltirish" an actual attended
 * transfer: the caller is parked, the operator is talking to the target, and
 * nothing is handed over until they press Complete.
 */
const TransferStatusPanel: React.FC<{
  transfer: TransferState;
  onComplete: () => Promise<void>;
  onCancel: () => Promise<void>;
  onMerge: () => Promise<void>;
}> = ({ transfer, onComplete, onCancel, onMerge }) => {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const ext = transfer.target ?? '';

  const run = async (fn: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    try {
      await fn();
    } finally {
      setWorking(false);
    }
  };

  const tone =
    transfer.phase === 'failed' ? 'danger'
    : transfer.phase === 'completed' ? 'success'
    : 'info';

  const label =
    transfer.phase === 'transferring' ? t('ipTelephone.callModal.transferring', { ext })
    : transfer.phase === 'consulting' ? t('ipTelephone.callModal.consulting', { ext })
    : transfer.phase === 'completing' ? t('ipTelephone.callModal.completing')
    : transfer.phase === 'completed' ? t('ipTelephone.callModal.completed', { ext })
    : transfer.error || t('ipTelephone.callModal.transferFailed');

  const icon =
    transfer.phase === 'failed' ? 'fa-circle-exclamation'
    : transfer.phase === 'completed' ? 'fa-circle-check'
    : transfer.phase === 'consulting' ? 'fa-headset'
    : 'fa-spinner fa-spin';

  return (
    <div className="ipt-transfer-status">
      <div className={`ipt-transfer-badge ipt-transfer-badge--${tone}`}>
        <i className={`fas ${icon}`} />
        <span>
          {label}
          {transfer.phase === 'consulting' && (
            <span className="ipt-transfer-hint">{t('ipTelephone.callModal.consultingHint')}</span>
          )}
        </span>
      </div>

      {transfer.phase === 'consulting' && (
        <div className="ipt-transfer-actions">
          <button
            onClick={() => run(onMerge)}
            disabled={working}
            className="ipt-transfer-action ipt-transfer-action--merge"
          >
            <i className="fa-solid fa-user-group" />
            {t('ipTelephone.callModal.mergeToConference')}
          </button>
          <div className="ipt-transfer-actions-row">
            <button
              onClick={() => run(onComplete)}
              disabled={working}
              className="ipt-transfer-action ipt-transfer-action--complete"
            >
              {t('ipTelephone.callModal.completeTransfer')}
            </button>
            <button
              onClick={() => run(onCancel)}
              disabled={working}
              className="ipt-transfer-action ipt-transfer-action--cancel"
            >
              {t('ipTelephone.callModal.cancelTransfer')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const CallModal: React.FC<CallModalProps> = ({
  initialNumber,
  onCall,
  onHangup,
  onMute,
  onHold,
  // The in-call keypad now types the "who to consult next" target instead
  // of sending touch tones (see pressKey) — kept on the props contract for
  // whenever real mid-call DTMF (IVR navigation) gets its own affordance.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSendDtmf: _onSendDtmf,
  onAnswer,
  callState,
  elapsed,
  onClose,
  onBlindTransfer,
  onAttendedTransfer,
  onCompleteTransfer,
  onCancelTransfer,
  onMergeConsultation,
  onRemoveConferenceParticipant,
  transfer,
  conferenceParticipants,
  isHeld,
  isMuted,
  operators,
  extension,
  floating = false,
  onToggleFloating,
  minimized,
  onMinimizedChange,
  closing = false,
}) => {
  const { t } = useTranslation();
  const [number, setNumber] = useState(initialNumber);
  // Hold/mute are owned by the SIP layer — mirroring them in local state let
  // the button drift out of sync with the real SDP direction when a re-INVITE
  // failed. Read them straight from the session instead.
  const muted = isMuted;
  const held = isHeld;
  const [showDialpad, setShowDialpad] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
  // A number typed straight into the drawer — for consulting/conferencing
  // someone who isn't in the operator list (an accountant's mobile, a
  // client's own number, …). Kept separate from `number`/the main dialpad
  // display, which doubles as the DTMF buffer for the call already in
  // progress — typing here never sends tones into that call by mistake.
  const [manualExt, setManualExt] = useState('');

  // ── Saved contacts (backend) ──
  // Operatorning o'z hisobiga bog'langan tashqi raqamlar — shu yerning
  // o'zida (Kontaktlar tabida) qo'shiladi/tahrirlanadi/o'chiriladi.
  const [drawerTab, setDrawerTab] = useState<'operators' | 'contacts'>('operators');
  // `GET .../contacts` qaytaradi 405 — ro'yxat shu sub-resursdan emas,
  // operatorning o'zi bilan birga (`/ip-telefon-operators` javobi ichidagi
  // `contacts` maydonidan) keladi. Shu sabab bu yerda alohida GET yo'q —
  // faqat operator ro'yxatini (u allaqachon `contacts` bilan keladi) qayta
  // so'rab, kerakli operatorni topib olamiz.
  const [contactsOverride, setContactsOverride] = useState<IpTelefonContact[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '' });
  const [editingContactId, setEditingContactId] = useState<number | null>(null);

  const myOperator = useMemo(
    () => operators.find((o) => String(o.login) === extension) ?? null,
    [operators, extension],
  );
  const myOperatorId = myOperator?.id ?? null;
  const contacts = contactsOverride ?? myOperator?.contacts ?? [];

  // `operators` prop kirish paytida bir marta olingan (GlobalCallWidget) —
  // drawer ochilganda eng yangisini olish uchun qayta so'raladi, so'ng har
  // bir qo'shish/tahrirlash/o'chirishdan keyin ham shu tarzda yangilanadi.
  const refreshContacts = useCallback(async () => {
    if (!myOperatorId) return;
    setContactsLoading(true);
    try {
      const r = await API.get('/ip-telefon-operators');
      const list: IpTelefonOperator[] = Array.isArray(r.data) ? r.data : (r.data as any)?.data || [];
      const fresh = list.find((o) => o.id === myOperatorId);
      setContactsOverride(fresh?.contacts ?? []);
    } catch {
      /* eskisi (myOperator.contacts) ko'rsatilishda davom etadi */
    } finally {
      setContactsLoading(false);
    }
  }, [myOperatorId]);

  useEffect(() => {
    setContactsOverride(null);
    if (!myOperatorId || !showDrawer) return;
    refreshContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myOperatorId, showDrawer]);

  const resetContactForm = () => {
    setContactForm({ name: '', phone: '' });
    setEditingContactId(null);
    setShowAddContact(false);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myOperatorId) return;
    const name = contactForm.name.trim();
    // Backend "+998..." formatini xatosiz saqlaydi (tasdiqlangan) — shu
    // sabab bu yerda "+" saqlab qolinadi (o'qish uchun standart ko'rinish).
    // Yo'naltirishda PBX faqat raqam talab qiladi — bu tozalash TransferService
    // (`cleanTarget`) orqali chaqiruv PAYTIDA, alohida, amalga oshiriladi.
    const phone = contactForm.phone.replace(/[^\d+]/g, '');
    if (!name || !phone) return;

    if (editingContactId) {
      await API.put(`/ip-telefon-operators/${myOperatorId}/contacts/${editingContactId}`, {
        name,
        phone,
      });
    } else {
      await API.post(`/ip-telefon-operators/${myOperatorId}/contacts`, { name, phone });
    }
    resetContactForm();
    await refreshContacts();
  };

  const handleContactEditClick = (c: IpTelefonContact) => {
    setEditingContactId(c.id);
    setContactForm({ name: c.name, phone: c.phone });
    setShowAddContact(true);
  };

  const handleContactDeleteClick = async (id: number) => {
    if (!myOperatorId) return;
    await API.delete(`/ip-telefon-operators/${myOperatorId}/contacts/${id}`);
    if (editingContactId === id) resetContactForm();
    await refreshContacts();
  };

  const handleContactDial = async (contact: IpTelefonContact, mode: 'direct' | 'hold') => {
    if (transfer.phase !== 'idle') return;
    setSelectedOpId(null);
    setSelectedContactId(contact.id);
    if (mode === 'direct') await onBlindTransfer(contact.phone);
    else await onAttendedTransfer(contact.phone);
  };

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const keyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAnswering, setIsAnswering] = useState(false);

  // ── Drag to reposition ──
  // Grab the header bar and drop the popup anywhere on screen — it starts
  // where the CSS puts it (corner widget or centered) and only switches to
  // an explicit fixed position once the operator actually drags it.
  // Remounts on every new call popup (GlobalCallWidget conditionally
  // renders CallModal), so this naturally resets instead of sticking a
  // stale position on the next call.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return; // header still needs its own buttons
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    const wrapper = wrapperRef.current;
    if (!start || !wrapper) return;

    let nextX = start.origX + (e.clientX - start.startX);
    let nextY = start.origY + (e.clientY - start.startY);
    // Keep it reachable — never let the operator drag the popup fully off-screen.
    nextX = Math.min(Math.max(0, nextX), window.innerWidth - wrapper.offsetWidth);
    nextY = Math.min(Math.max(0, nextY), window.innerHeight - wrapper.offsetHeight);
    setDragPos({ x: nextX, y: nextY });
  };

  const handleDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const isInCall = callState === 'active' || callState === 'connecting';
  const isIncoming = callState === 'ringing';

  useEffect(() => {
    setNumber(initialNumber);
  }, [initialNumber]);

  // A transfer that is still running (or showing its result) must keep the
  // drawer mounted, otherwise the operator never sees why it failed.
  const transferBusy = transfer.phase !== 'idle';

  useEffect(() => {
    if (isInCall || isIncoming) setShowDialpad(false);
    else if (!transferBusy) {
      setShowDialpad(true);
      setShowDrawer(false);
      setSelectedOpId(null);
      setIsAnswering(false);
    }
  }, [isInCall, isIncoming, transferBusy]);

  // While a call is already up, the keypad's job switches from "dial a
  // number" to "who do I want to bring in next" — typing must land in
  // `manualExt` (the same buffer the drawer's manual-number field and the
  // round Call button below both read from), not the primary call's own
  // `number`/DTMF buffer. Mixing the two was what sent a colleague's whole
  // phone number out as touch tones into the live customer call earlier.
  const pressKey = (k: string) => {
    if (isInCall) setManualExt((v) => v + k);
    else setNumber((v) => v + k);
    activateKey(k);
  };

  const backspace = () => {
    if (isInCall) setManualExt((v) => v.slice(0, -1));
    else setNumber((v) => v.slice(0, -1));
    activateKey('Backspace');
  };

  const activateKey = (k: string) => {
    setActiveKey(k);
    if (keyTimeoutRef.current) clearTimeout(keyTimeoutRef.current);
    keyTimeoutRef.current = setTimeout(() => setActiveKey(null), 150);
  };

  const toggleHold = async () => {
    await onHold(!held);
  };

  const toggleMute = () => {
    onMute(!muted);
  };

  // Same as handleOperatorClick, but for a number typed into the drawer (or
  // the in-call keypad) instead of picked from the operator list — an
  // accountant's mobile, an outside line, anything not registered as an
  // internal extension. Declared here (above the keydown effect that calls
  // it) so that effect's closure never captures a not-yet-initialized const.
  const handleManualDial = async (mode: 'direct' | 'hold') => {
    const ext = manualExt.trim();
    if (transfer.phase !== 'idle' || !ext) return;

    setSelectedOpId(null);
    setManualExt('');
    if (mode === 'direct') await onBlindTransfer(ext);
    else await onAttendedTransfer(ext);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The manual-number field (added for consulting/conferencing an
      // outside number) is the first real <input> this modal has ever had.
      // The old guard here (`tagName === 'INPUT' && target !== activeElement`)
      // never actually matches while typing — the focused input IS the
      // event target — so every keystroke meant for that field was instead
      // being hijacked as a dialpad digit (appended to the main `number` /
      // sent as a DTMF tone into whatever call is active), which is very
      // likely why a garbled, doubled-up number showed up as the consult
      // target. Any focused text input must fully own its own keystrokes.
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (/^[\d*#]$/.test(e.key)) {
        e.preventDefault();
        pressKey(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Enter' && number.length > 0 && callState === 'idle') {
        e.preventDefault();
        onCall(number);
      } else if (e.key === 'Enter' && callState === 'active' && manualExt.trim()) {
        e.preventDefault();
        handleManualDial('hold');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callState, number, manualExt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = async () => {
    if (isAnswering) return;
    setIsAnswering(true);
    try {
      await onAnswer();
    } catch (err) {
      console.error('Answer error in modal:', err);
      setIsAnswering(false);
    }
  };

  const handleOperatorClick = async (op: IpTelefonOperator, mode: 'direct' | 'hold') => {
    // While a transfer is in flight the row buttons take over; clicking another
    // operator mid-consultation would strand the parked caller.
    if (transfer.phase !== 'idle') return;

    setSelectedOpId(op.id);
    const ext = String(op.login);
    if (mode === 'direct') await onBlindTransfer(ext);
    else await onAttendedTransfer(ext);
  };

  const elapsed_m = Math.floor(elapsed / 60);
  const elapsed_s = (elapsed % 60).toString().padStart(2, '0');

  // `closing` keeps this branch active for one more render after the call
  // has already ended (isInCall/isIncoming both false by then) so the bar
  // can slide back up into the header instead of just vanishing — see
  // GlobalCallWidget, which unmounts this component only once the exit
  // animation below has had time to finish.
  if (minimized && (isInCall || isIncoming || closing)) {
    return (
      <div className={`ipt-minimized-bar${closing ? ' ipt-minimized-bar--closing' : ''}`}>
        <div className="ipt-min-info">
          <div className="ipt-min-number">
            <i
              className="fas fa-phone-alt"
              style={{ marginRight: '10px', fontSize: '14px', opacity: 0.8 }}
            />
            {number || initialNumber}
          </div>
          <div className="ipt-min-timer">
            <span className="ipt-timer-dot" />
            {elapsed_m}:{elapsed_s}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button
            onClick={toggleMute}
            className="ipt-tg-btn"
            title={muted ? t('ipTelephone.callModal.muteOff') : t('ipTelephone.callModal.muteOn')}
          >
            <i
              className={`fas ${muted ? 'fa-microphone-slash' : 'fa-microphone'}`}
              style={{ color: muted ? '#E70A0A' : '#fff' }}
            />
          </button>

          <button
            onClick={() => onMinimizedChange(false)}
            className="ipt-tg-btn"
            title={t('ipTelephone.callModal.maximize')}
          >
            <i className="fas fa-expand-alt" />
          </button>

          <button onClick={onHangup} className="ipt-minimized-hangup-btn">
            <i className="fas fa-phone ipt-icon-hangup" />
            {t('ipTelephone.callModal.endCall')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={floating ? 'ipt-floating-widget' : 'ipt-modal-overlay'}>
      <div
        ref={wrapperRef}
        className="ipt-modal-wrapper"
        style={
          dragPos
            ? { width: showDrawer ? '680px' : '380px', position: 'fixed', left: dragPos.x, top: dragPos.y, margin: 0 }
            : { width: showDrawer ? '680px' : '380px' }
        }
      >
        {/* ── LEFT PANEL ── */}
        <div className="ipt-unified-modal">
          <div
            className={`ipt-tg-header ${dragging ? 'ipt-tg-header--dragging' : ''}`}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            title={t('ipTelephone.callModal.dragHint')}
          >
            <button
              onClick={() => onMinimizedChange(true)}
              className="ipt-tg-btn"
              title={t('ipTelephone.callModal.minimize')}
            >
              <i className="fas fa-minus" />
            </button>
            <button
              onClick={onToggleFloating}
              className="ipt-tg-btn"
              title={t(floating ? 'ipTelephone.callModal.maximize' : 'ipTelephone.callModal.minimizeToCorner')}
            >
              <i className={`far ${floating ? 'fa-square' : 'fa-window-minimize'}`} />
            </button>
            <button
              onClick={onClose}
              className="ipt-tg-btn"
              title={t('ipTelephone.callModal.close')}
            >
              <i className="fas fa-times" />
            </button>
          </div>

          {/* ── ACTIVE CALL VIEW ── */}
          {isInCall || isIncoming ? (
            <div
              className="ipt-unified-modal"
              style={{ padding: 0, minHeight: 'auto', width: '100%' }}
            >
              <div className="ipt-avatar-circle">
                <i className="fa-solid fa-user" />
              </div>
              <div className="ipt-call-number">{number || initialNumber}</div>

              {callState === 'active' && (
                <div className="ipt-call-timer">
                  <span className="ipt-timer-dot" />
                  <span className="ipt-timer-text">
                    {elapsed_m}:{elapsed_s}
                  </span>
                </div>
              )}
              {isIncoming && (
                <div className="ipt-timer-text" style={{ fontSize: '14px', opacity: 0.7 }}>
                  {t('ipTelephone.callModal.incoming')}
                </div>
              )}
              {callState === 'connecting' && (
                <div className="ipt-timer-text" style={{ fontSize: '14px', opacity: 0.7 }}>
                  {t('ipTelephone.callModal.connecting')}
                </div>
              )}

              {/* ── CONFERENCE STRIP ──
                  Everyone bridged in alongside the primary call, e.g. after
                  "Konferensiyaga qo'shish". Each chip can be dropped on its
                  own without ending the call for the rest of the room. */}
              {conferenceParticipants.length > 0 && (
                <div className="ipt-conf-strip">
                  <span className="ipt-conf-strip-label">
                    <i className="fa-solid fa-user-group" />
                    {t('ipTelephone.callModal.conferenceCount', {
                      count: conferenceParticipants.length + 1,
                    })}
                  </span>
                  <div className="ipt-conf-chips">
                    {conferenceParticipants.map((p) => (
                      <span key={p.callId} className="ipt-conf-chip">
                        {p.remote}
                        <button
                          type="button"
                          onClick={() => onRemoveConferenceParticipant(p.callId)}
                          title={t('ipTelephone.callModal.removeParticipant')}
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── IN-CALL KEYPAD — dial someone new to consult ──
                  The "Klaviatura" action button toggled `showDialpad`, but
                  the numeric grid only ever rendered in the pre-call dialpad
                  view below — during an active call there was nowhere for
                  it to appear, so the button looked broken. What's typed
                  here goes into `manualExt` (pressKey), the same buffer the
                  round Call button and the drawer's manual-number field
                  both read from — type a number, press Call, and the
                  current call is parked while this one is dialed. */}
              {callState === 'active' && showDialpad && (
                <>
                  <div className="ipt-dial-input-area ipt-dial-input-area--incall">
                    <span className="ipt-dial-display ipt-dial-display--incall">
                      {manualExt || t('ipTelephone.callModal.manualNumberPlaceholder')}
                    </span>
                    <button
                      onClick={backspace}
                      disabled={!manualExt}
                      className={`ipt-backspace-btn ${activeKey === 'Backspace' ? 'active' : ''}`}
                    >
                      <i className="fa-solid fa-delete-left" />
                    </button>
                  </div>
                  <div className="ipt-dial-grid ipt-dial-grid--incall">
                    {DIALPAD_KEYS.map((k) => (
                      <button
                        key={k}
                        onClick={() => pressKey(k)}
                        className={`ipt-dial-key ${activeKey === k ? 'active' : ''}`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── DIALPAD VIEW ── */
            <>
              <div
                style={{
                  width: '160px',
                  background: 'rgba(255,255,255,0.3)',
                  marginBottom: '20px',
                  borderRadius: '2px',
                }}
              />
              <div className="ipt-dial-input-area">
                <span className="ipt-dial-display">
                  {number || t('ipTelephone.callModal.numberPlaceholder')}
                </span>
                <button
                  onClick={backspace}
                  disabled={!number}
                  className={`ipt-backspace-btn ${activeKey === 'Backspace' ? 'active' : ''}`}
                >
                  <i className="fa-solid fa-delete-left" />
                </button>
              </div>

              {showDialpad && (
                <div className="ipt-dial-grid">
                  {DIALPAD_KEYS.map((k) => (
                    <button
                      key={k}
                      onClick={() => pressKey(k)}
                      className={`ipt-dial-key ${activeKey === k ? 'active' : ''}`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── BUTTON ROW ──
              Mobile-app style: icon + label under it, 3 columns so 6 actions
              settle into 2 rows (matches every phone dialer, WhatsApp
              included), instead of a single row of icon-only circles. */}
          <div className="ipt-action-grid">
            <button
              onClick={toggleHold}
              disabled={callState !== 'active'}
              className={`ipt-action-btn ${held ? 'ipt-action-btn--on' : ''}`}
            >
              <span className="ipt-action-icon ipt-btn-hold">
                <i className={`fas ${held ? 'fa-play' : 'fa-pause'}`} />
              </span>
              <span className="ipt-action-label">{t('ipTelephone.callModal.holdLabel')}</span>
            </button>

            <button
              onClick={toggleMute}
              disabled={callState !== 'active'}
              className={`ipt-action-btn ${muted ? 'ipt-action-btn--on' : ''}`}
            >
              <span className="ipt-action-icon ipt-btn-mute">
                <i className={`fas ${muted ? 'fa-microphone-slash' : 'fa-microphone'}`} />
              </span>
              <span className="ipt-action-label">{t('ipTelephone.callModal.muteLabel')}</span>
            </button>

            <button
              onClick={() => setShowDrawer((v) => !v)}
              disabled={callState !== 'active'}
              className={`ipt-action-btn ${showDrawer ? 'ipt-action-btn--on' : ''}`}
            >
              <span className="ipt-action-icon ipt-btn-share">
                <i className="fa-solid fa-share" />
              </span>
              <span className="ipt-action-label">{t('ipTelephone.callModal.transferLabel')}</span>
            </button>

            <button
              disabled={
                isAnswering ||
                callState === 'connecting' ||
                (callState === 'idle' && !number) ||
                (callState === 'active' && !manualExt.trim())
              }
              onClick={() => {
                if (callState === 'ringing') {
                  handleAnswer();
                } else if (callState === 'idle' && number) {
                  onCall(number);
                } else if (callState === 'active' && manualExt.trim()) {
                  // Same as the drawer's headset button: park the current
                  // call and consult whoever was just typed in.
                  handleManualDial('hold');
                }
              }}
              className="ipt-action-btn"
            >
              <span className="ipt-action-icon ipt-btn-answer">
                {isAnswering ? (
                  <i className="fas fa-spinner fa-spin" />
                ) : (
                  <i className="fas fa-phone-alt" />
                )}
              </span>
              <span className="ipt-action-label">
                {callState === 'ringing'
                  ? isAnswering
                    ? t('ipTelephone.callModal.answering')
                    : t('ipTelephone.callModal.answer')
                  : t('ipTelephone.callModal.call')}
              </span>
            </button>

            <button onClick={callState !== 'idle' ? onHangup : onClose} className="ipt-action-btn">
              <span className="ipt-action-icon ipt-btn-hangup">
                <i className={`fas ${callState !== 'idle' ? 'fa-phone ipt-icon-hangup' : 'fa-times'}`} />
              </span>
              <span className="ipt-action-label">
                {callState !== 'idle'
                  ? t('ipTelephone.callModal.hangupLabel')
                  : t('ipTelephone.callModal.close')}
              </span>
            </button>

            <button
              onClick={() => setShowDialpad((v) => !v)}
              className={`ipt-action-btn ${showDialpad ? 'ipt-action-btn--on' : ''}`}
            >
              <span className="ipt-action-icon ipt-btn-dialpad">
                <i className="fas fa-th" />
              </span>
              <span className="ipt-action-label">{t('ipTelephone.callModal.dialpad')}</span>
            </button>
          </div>
        </div>

        {/* ── RIGHT DRAWER ── */}
        {showDrawer && (
          <div className="ipt-right-drawer">
            <div className="ipt-drawer-header">
              <span className="ipt-drawer-title">
                <i className="fa-solid fa-share" />
                {t('ipTelephone.callModal.transfer')}
              </span>
              <button
                type="button"
                className="ipt-tg-btn ipt-drawer-close"
                onClick={() => setShowDrawer(false)}
                title={t('ipTelephone.callModal.close')}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {/* ── MANUAL NUMBER ──
                For anyone not in the operator list — an accountant's
                mobile, an outside line. Separate from the main dialpad's
                `number`, which is the DTMF buffer for the call already in
                progress. */}
            <div className="ipt-manual-dial">
              <span className="ipt-manual-dial-label">
                {t('ipTelephone.callModal.manualNumberLabel')}
              </span>
              <div className="ipt-manual-dial-row">
                <input
                  type="tel"
                  inputMode="tel"
                  value={manualExt}
                  onChange={(e) => setManualExt(e.target.value.replace(/[^\d+]/g, ''))}
                  disabled={transferBusy}
                  placeholder={t('ipTelephone.callModal.manualNumberPlaceholder')}
                  className="ipt-manual-dial-input"
                />
                <button
                  type="button"
                  disabled={transferBusy || !manualExt.trim()}
                  onClick={() => handleManualDial('hold')}
                  className="ipt-op-action ipt-op-action--hold"
                  title={t('ipTelephone.callModal.holdTransfer')}
                >
                  <i className="fa-solid fa-headset" />
                </button>
              </div>
            </div>

            {/* ── TRANSFER STATUS ──
                Blind transfer ends our leg the moment FreePBX bridges the
                caller, so without this panel the modal just vanished and the
                operator could not tell success from failure. */}
            {transferBusy && (
              <TransferStatusPanel
                transfer={transfer}
                onComplete={onCompleteTransfer}
                onCancel={onCancelTransfer}
                onMerge={onMergeConsultation}
              />
            )}

            {/* ── OPERATORLAR / KONTAKTLAR ──
                Kontaktlar tabida tashqi raqamlarni shu yerning o'zida
                qo'shish/tahrirlash/o'chirish mumkin. */}
            <div className="ipt-mode-tabs">
              {(['operators', 'contacts'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDrawerTab(tab)}
                  className={`ipt-mode-btn ${drawerTab === tab ? 'active' : ''}`}
                >
                  {tab === 'operators'
                    ? t('ipTelephone.tabOperators', 'Operatorlar')
                    : t('ipTelephone.tabContacts', 'Kontaktlar')}
                </button>
              ))}
              {drawerTab === 'contacts' && myOperatorId && (
                <button
                  type="button"
                  onClick={() => {
                    if (showAddContact) resetContactForm();
                    else setShowAddContact(true);
                  }}
                  title={t('ipTelephone.callModal.addContact', 'Kontakt qo‘shish')}
                  className={`ipt-mode-tabs-add-btn ${showAddContact ? 'ipt-mode-tabs-add-btn--close' : ''}`}
                >
                  {showAddContact ? (
                    <i className="fa-solid fa-xmark" />
                  ) : (
                    t('registrationModal.add')
                  )}
                </button>
              )}
            </div>

            {drawerTab === 'contacts' && showAddContact && (
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
                    setContactForm((p) => ({ ...p, phone: e.target.value.replace(/[^\d+]/g, '') }))
                  }
                  className="ipt-manual-dial-input"
                  required
                />
                <button type="submit" className="ipt-contact-save-btn">
                  {editingContactId ? t('ipTelephone.callModal.save', 'Saqlash') : t('registrationModal.add', 'Qo‘shish')}
                </button>
              </form>
            )}

            {/* Each row picks its own mode now — no more global "direct vs
                hold" tabs above the list. The extension number moved into
                the subtitle line to make room for these two per-row actions. */}
            {drawerTab === 'operators' ? (
              <div className="ipt-operator-list">
                {operators.length === 0 ? (
                  <div className="ipt-operator-empty">{t('ipTelephone.callModal.noOperators')}</div>
                ) : (
                  operators.map((op) => {
                    const selected = selectedOpId === op.id;
                    const fullName = op.user?.full_name || op.name || t('ipTelephone.defaultOperator');
                    const initials = fullName
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase();

                    return (
                      <div
                        key={op.id}
                        className={`ipt-operator-item ${selected ? 'ipt-operator-item--selected' : ''}`}
                      >
                        <span className="ipt-operator-avatar">{initials || '?'}</span>
                        <div className="ipt-operator-info">
                          <div className="ipt-op-name">{fullName}</div>
                          <div className="ipt-op-branch">
                            {op.filial || t('ipTelephone.mainBranch')} · {op.login}
                          </div>
                        </div>
                        <div className="ipt-op-actions">
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => handleOperatorClick(op, 'direct')}
                            className="ipt-op-action ipt-op-action--direct"
                            title={t('ipTelephone.callModal.directTransfer')}
                          >
                            <i className="fa-solid fa-arrow-right" />
                          </button>
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => handleOperatorClick(op, 'hold')}
                            className="ipt-op-action ipt-op-action--hold"
                            title={t('ipTelephone.callModal.holdTransfer')}
                          >
                            <i className="fa-solid fa-headset" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="ipt-operator-list">
                {contactsLoading ? (
                  <div className="ipt-operator-empty">
                    <i className="fas fa-spinner fa-spin" /> {t('ipTelephone.loading')}
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="ipt-operator-empty">
                    {t('ipTelephone.noContacts', 'Kontaktlar yo‘q')}
                  </div>
                ) : (
                  contacts.map((contact) => {
                    const selected = selectedContactId === contact.id;
                    return (
                      <div
                        key={contact.id}
                        className={`ipt-operator-item ${selected ? 'ipt-operator-item--selected' : ''}`}
                      >
                        <span className="ipt-operator-avatar">
                          {contact.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="ipt-operator-info">
                          <div className="ipt-op-name">{contact.name}</div>
                          <div className="ipt-op-branch">{contact.phone}</div>
                        </div>
                        <div className="ipt-op-actions">
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => handleContactDial(contact, 'hold')}
                            className="ipt-op-action ipt-op-action--hold"
                            title={t('ipTelephone.callModal.holdTransfer')}
                          >
                            <i className="fa-solid fa-headset" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleContactEditClick(contact)}
                            className="ipt-op-action"
                            title={t('registrationModal.edit', 'Tahrirlash')}
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleContactDeleteClick(contact.id)}
                            className="ipt-op-action ipt-op-action--delete"
                            title={t('ipTelephone.callModal.removeContact', 'O‘chirish')}
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
