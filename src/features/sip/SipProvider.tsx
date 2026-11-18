// =============================================================================
// SIP Provider — Top-level orchestrator
//
// Responsibility:
//   1. Wait for CRM auth (user.id available)
//   2. Fetch /ip-telefon-operators, match by pinfl → extract login + password
//   3. Instantiate all services
//   4. Register SIP
//   5. Expose SipContext to all children
//
// Placed above <App> so SIP stays alive across page navigation.
// =============================================================================
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { API }                   from '@/api/api';
import useAuthStore               from '@/store/useAuthStore';
import useDashboardSettings       from '@/store/useDashboardSettings';
import { SipContext }             from './SipContext';
import { sipLogger }              from './LoggerService';
import { telephonyEvents }        from './TelephonyEventService';
import { INITIAL_TRANSFER_STATE } from './types';
import type { AudioService }      from './AudioService';
import type { RegistrationService } from './RegistrationService';
import type { ReconnectService }  from './ReconnectService';
import type { SessionService }    from './SessionService';
import type { TransferService }   from './TransferService';
import type {
  CallState,
  ConferenceParticipant,
  RegistrationStatus,
  SipContextValue,
  SipCredentials,
  TransferState,
} from './types';

/*
 * `sip.js` (SIP/WebRTC stack) shu 5 ta servis orqali keladi va yengil emas —
 * o'lchov bo'yicha ilova ishga tushishidagi eng katta yagona bo'lak shu edi
 * (~645 KB), garchi SipProvider "faqat isAuth=true bo'lganda ulanadi" desa
 * ham: sinf importlari statik bo'lgani uchun bundler ularni baribir asosiy
 * bo'lakka qo'shib qo'yardi. Endi faqat TYPE sifatida statik import qilingan
 * (yuqorida, `useRef`larga tur berish uchun — build vaqtida butunlay
 * o'chiriladi), haqiqiy klasslar esa pastda `init()` ichida, autentifikatsiya
 * tasdiqlangandan keyingina dinamik `import()` bilan yuklanadi.
 */

interface IpTelefonOperator {
  id: number;
  user_id: number;
  login: number | string;
  password: string;
  user?: { id: number; full_name: string; username: string; phone: string };
}

const SIP_SERVER = import.meta.env.VITE_SIP_SERVER as string;
const SIP_DOMAIN = import.meta.env.VITE_SIP_DOMAIN as string;

/** How long a completed/failed transfer banner stays on screen */
const TRANSFER_RESULT_LINGER_MS = 3000;

interface Props {
  children: ReactNode;
}

export const SipProvider: React.FC<Props> = ({ children }) => {
  // ── Auth state ─────────────────────────────────────────────────────────────
  const isAuth = useAuthStore(s => s.isAuth);
  const user   = useAuthStore(s => s.user);
  const setSipCredentials = useAuthStore(s => s.setSipCredentials);
  const { hasFeature } = useDashboardSettings();
  const canUseIpTelephone = hasFeature('ip_telephone.view');

  // ── UI-reactive state ──────────────────────────────────────────────────────
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>('unregistered');
  const [registrationError,  setRegistrationError]  = useState<string | null>(null);
  const [callState,          setCallState]          = useState<CallState>('idle');
  const [callTarget,         setCallTarget]         = useState<string | null>(null);
  const [elapsed,            setElapsed]            = useState(0);
  const [held,               setHeld]               = useState(false);
  const [muted,              setMuted]              = useState(false);
  const [transfer,           setTransfer]           = useState<TransferState>(INITIAL_TRANSFER_STATE);
  const [conferenceParticipants, setConferenceParticipants] = useState<ConferenceParticipant[]>([]);
  const [credentialsReady,   setCredentialsReady]   = useState(false);
  const [extension,          setExtension]          = useState<string | null>(null);

  // ── Service refs (not React state — services must survive re-renders) ──────
  const regSvcRef      = useRef<RegistrationService | null>(null);
  const sessionSvcRef  = useRef<SessionService | null>(null);
  const audioSvcRef    = useRef<AudioService | null>(null);
  const transferSvcRef = useRef<TransferService | null>(null);
  const reconnectSvcRef= useRef<ReconnectService | null>(null);
  const transferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initialise / tear-down SIP stack ──────────────────────────────────────
  useEffect(() => {
    // Operator `user_id` bo'yicha topiladi. O'z login/paroli bilan kirgan xodimning (`/employee/login`) `user.id`si aslida
    // `employees.id` — uni `users.id` deb solishtirib bo'lmaydi (boshqa odamning SIP hisobi chiqib qolardi).
    if (!isAuth || !user?.id || user.account_type === 'employee' || !canUseIpTelephone) return;

    // `alive` is checked after EVERY await. The old code checked a `mounted`
    // flag once, before the two longest awaits (UserAgent.start and REGISTER),
    // so an effect re-run — which happens on every login as permissions load —
    // could leave a fully registered UserAgent behind with no ref pointing at
    // it. FreePBX then kept routing queue calls to that dead browser leg.
    let alive = true;
    const owned: { dispose: () => void | Promise<void> }[] = [];

    const init = async () => {
      try {
        sipLogger.info('AUTH', `Fetching SIP credentials for user_id=${user.id}`);

        // Kredensiallarni so'rash bilan bir vaqtda sip.js'ga bog'liq
        // servislarni ham yuklaymiz — ikkalasi parallel ketadi, birortasi
        // ikkinchisini kutib turmaydi.
        const [res, { AudioService }, { RegistrationService }, { SessionService }, { TransferService }] =
          await Promise.all([
            API.get('/ip-telefon-operators'),
            import('./AudioService'),
            import('./RegistrationService'),
            import('./SessionService'),
            import('./TransferService'),
          ]);
        if (!alive) return;

        const operators: IpTelefonOperator[] = Array.isArray(res.data)
          ? res.data
          : (res.data?.data ?? []);

        const operator = operators.find((o) => o.user_id === user.id);

        if (!operator) {
          sipLogger.warn(
            'AUTH',
            `No operator found for user_id=${user.id} — SIP not registered`,
          );
          return;
        }

        const credentials: SipCredentials = {
          login:    String(operator.login),
          password: operator.password,
          aor:      `sip:${operator.login}@${SIP_DOMAIN}`,
          domain:   SIP_DOMAIN,
          wsServer: SIP_SERVER,
        };

        sipLogger.info(
          'AUTH',
          `Operator matched — login=${credentials.login}  aor=${credentials.aor}`,
        );

        setSipCredentials(credentials.login, credentials.password);
        setCredentialsReady(true);
        setExtension(credentials.login);
        telephonyEvents.setExtension(credentials.login);

        // ── Services ────────────────────────────────────────────────────────

        const audioSvc = new AudioService();
        audioSvcRef.current = audioSvc;
        owned.push(audioSvc);

        const sessionSvc = new SessionService(audioSvc, SIP_DOMAIN);
        sessionSvcRef.current = sessionSvc;
        owned.push(sessionSvc);

        sessionSvc.setDelegate({
          onCallStateChange: (state, target) => {
            if (!alive) return;
            setCallState(state);
            setCallTarget(target);
            telephonyEvents.emitCallState(state, target);
          },
          onHoldChange: (isHeld) => { if (alive) setHeld(isHeld); },
          onMuteChange: (isMuted) => { if (alive) setMuted(isMuted); },
          onSessionStart: () => { /* timer started inside SessionService */ },
          onSessionEnd: (summary) => {
            if (!alive) return;
            setElapsed(0);
            // Resolve any REFER still in flight — see notePrimaryEnded().
            transferSvcRef.current?.notePrimaryEnded();
            // Realtime: the history page refreshes off this, no polling.
            telephonyEvents.emitCallEnded(summary);
          },
          onConferenceChange: (participants) => {
            if (alive) setConferenceParticipants(participants);
          },
        });

        sessionSvc.setOnElapsedChange(secs => {
          if (alive) setElapsed(secs);
        });

        const regSvc = new RegistrationService(credentials);
        regSvcRef.current = regSvc;
        owned.push({ dispose: () => regSvc.dispose() });

        regSvc.on('registered', () => {
          if (!alive) return;
          setRegistrationStatus('registered');
          setRegistrationError(null);
          telephonyEvents.emitRegistration('registered');
        });
        regSvc.on('unregistered', () => {
          if (!alive) return;
          setRegistrationStatus('unregistered');
          telephonyEvents.emitRegistration('unregistered');
        });
        regSvc.on('failed', (err) => {
          if (!alive) return;
          setRegistrationStatus('failed');
          setRegistrationError(err?.message ?? 'Registratsiya xatosi');
          telephonyEvents.emitRegistration('failed');
        });

        regSvc.setInviteHandler(invitation => sessionSvc.handleInvitation(invitation));

        setRegistrationStatus('registering');

        const ua = await regSvc.initialize();
        if (!alive) { await regSvc.dispose().catch(() => undefined); return; }

        sessionSvc.setUserAgent(ua);

        const transferSvc = new TransferService(sessionSvc, SIP_DOMAIN);
        transferSvcRef.current = transferSvc;
        transferSvc.onStateChange(state => {
          if (!alive) return;
          setTransfer(state);

          // Auto-clear the terminal banner so the drawer returns to normal
          if (transferTimerRef.current) clearTimeout(transferTimerRef.current);
          if (state.phase === 'completed' || state.phase === 'failed') {
            transferTimerRef.current = setTimeout(() => {
              transferSvcRef.current?.reset();
            }, TRANSFER_RESULT_LINGER_MS);
          }
        });

        await regSvc.register();
        if (!alive) { await regSvc.dispose().catch(() => undefined); return; }

        const { ReconnectService } = await import('./ReconnectService');
        if (!alive) return;
        const reconnectSvc = new ReconnectService(regSvc);
        reconnectSvcRef.current = reconnectSvc;
        reconnectSvc.start();
        owned.push({ dispose: () => reconnectSvc.stop() });

      } catch (err) {
        sipLogger.error('AUTH', 'SIP initialisation failed', err);
        if (alive) {
          setRegistrationStatus('failed');
          setRegistrationError(err instanceof Error ? err.message : 'SIP ulanmadi');
        }
      }
    };

    init();

    return () => {
      alive = false;
      sipLogger.info('AUTH', 'SipProvider tearing down services');

      if (transferTimerRef.current) {
        clearTimeout(transferTimerRef.current);
        transferTimerRef.current = null;
      }

      // Dispose in reverse creation order; anything created after the teardown
      // started is disposed by the `alive` guards inside init().
      for (const svc of owned.reverse()) {
        try {
          const r = svc.dispose();
          if (r instanceof Promise) r.catch(() => undefined);
        } catch { /* ignore */ }
      }

      reconnectSvcRef.current = null;
      sessionSvcRef.current   = null;
      regSvcRef.current       = null;
      audioSvcRef.current     = null;
      transferSvcRef.current  = null;
    };
    // Re-initialise only when auth state or account changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuth, user?.id, user?.account_type, canUseIpTelephone]);

  // ── Clean shutdown on tab close ────────────────────────────────────────────
  // Without this the registration lives on for the full `expires` window and
  // FreePBX keeps queueing calls to a browser that is gone.
  useEffect(() => {
    const onUnload = () => {
      sessionSvcRef.current?.dispose();
      regSvcRef.current?.dispose();
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  // ── Action callbacks (stable refs — no rerenders on action calls) ──────────

  const makeCall = useCallback(async (phoneNumber: string) => {
    const svc = sessionSvcRef.current;
    if (!svc) {
      sipLogger.warn('SESSION', 'makeCall: SessionService not ready');
      return;
    }
    try {
      await svc.makeCall(phoneNumber);
    } catch (err) {
      sipLogger.error('SESSION', 'makeCall failed', err);
      setCallState('error');
      setTimeout(() => setCallState('idle'), 2000);
    }
  }, []);

  const hangup = useCallback(async () => {
    transferSvcRef.current?.reset();
    await sessionSvcRef.current?.hangup();
  }, []);

  const answer = useCallback(async () => {
    await sessionSvcRef.current?.answer();
  }, []);

  const mute = useCallback((value: boolean) => {
    sessionSvcRef.current?.mute(value);
  }, []);

  const hold = useCallback(async (value: boolean) => {
    await sessionSvcRef.current?.hold(value);
  }, []);

  const sendDtmf = useCallback((tone: string) => {
    sessionSvcRef.current?.sendDtmf(tone);
  }, []);

  const blindTransfer = useCallback(async (ext: string) => {
    const svc = transferSvcRef.current;
    if (!svc) { sipLogger.warn('TRANSFER', 'TransferService not ready'); return; }
    await svc.blindTransfer(ext).catch(() => undefined);
  }, []);

  const attendedTransfer = useCallback(async (ext: string) => {
    const svc = transferSvcRef.current;
    if (!svc) { sipLogger.warn('TRANSFER', 'TransferService not ready'); return; }
    await svc.attendedTransfer(ext).catch(() => undefined);
  }, []);

  const completeTransfer = useCallback(async () => {
    await transferSvcRef.current?.completeTransfer().catch(() => undefined);
  }, []);

  const cancelTransfer = useCallback(async () => {
    await transferSvcRef.current?.cancelTransfer().catch(() => undefined);
  }, []);

  const mergeConsultation = useCallback(async () => {
    await transferSvcRef.current?.mergeConsultation().catch(() => undefined);
  }, []);

  const removeConferenceParticipant = useCallback(async (callId: string) => {
    await sessionSvcRef.current?.removeConferenceParticipant(callId).catch((err) =>
      sipLogger.error('CONFERENCE', 'Failed to remove participant', err),
    );
  }, []);

  // ── Context value ──────────────────────────────────────────────────────────

  const ctxValue = useMemo<SipContextValue>(() => ({
    registrationStatus,
    registered: registrationStatus === 'registered',
    registrationError,
    callState,
    callTarget,
    elapsed,
    held,
    muted,
    transfer,
    conferenceParticipants,
    credentialsReady,
    extension,
    makeCall,
    hangup,
    answer,
    mute,
    hold,
    sendDtmf,
    blindTransfer,
    attendedTransfer,
    completeTransfer,
    cancelTransfer,
    mergeConsultation,
    removeConferenceParticipant,
  }), [
    registrationStatus, registrationError, callState, callTarget, elapsed,
    held, muted, transfer, conferenceParticipants, credentialsReady, extension,
    makeCall, hangup, answer, mute, hold, sendDtmf,
    blindTransfer, attendedTransfer, completeTransfer, cancelTransfer,
    mergeConsultation, removeConferenceParticipant,
  ]);

  return (
    <SipContext.Provider value={ctxValue}>
      {children}
    </SipContext.Provider>
  );
};
