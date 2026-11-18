// =============================================================================
// GlobalCallWidget — app-wide call popup
//
// Mounted once in Layout (above <Outlet>), so it never unmounts on route
// change. It renders CallModal whenever useCallUIStore says to — for BOTH
// directions:
//   - incoming rings (detected here from the shared SipContext), and
//   - outgoing calls a page asked for via useCallUIStore.openCall().
// Because this lives above the router, the popup (and the call itself, which
// was already global via SipProvider) now survives navigating to another
// page mid-call instead of disappearing with the page that opened it.
// =============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '@/api/api';
import useAuthStore from '@/store/useAuthStore';
import useDashboardSettings from '@/store/useDashboardSettings';
import { useSip } from './useSip';
import { CallModal, type IpTelefonOperator } from './CallModal';
import useCallUIStore from './useCallUIStore';

/** Matches `.ipt-minimized-bar--closing`'s animation-duration in ipTelephone.css. */
const MINIMIZED_CLOSE_ANIMATION_MS = 300;

const GlobalCallWidget: React.FC = () => {
  const isAuth = useAuthStore((s) => s.isAuth);
  const { hasFeature } = useDashboardSettings();
  const canUseIpTelephone = hasFeature('ip_telephone.view');

  const {
    callState,
    callTarget,
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
    transfer,
    conferenceParticipants,
    held,
    muted,
    elapsed,
    extension,
  } = useSip();

  const visible = useCallUIStore((s) => s.visible);
  const floating = useCallUIStore((s) => s.floating);
  const initialNumber = useCallUIStore((s) => s.initialNumber);
  const openCall = useCallUIStore((s) => s.openCall);
  const closeCall = useCallUIStore((s) => s.close);
  const toggleFloating = useCallUIStore((s) => s.toggleFloating);

  const [operators, setOperators] = useState<IpTelefonOperator[]>([]);

  // Minimized state lives here (not inside CallModal) so it survives the
  // call ending: the minimized bar needs one more render — with `closing`
  // set — to play its slide-back-up-into-the-header animation instead of
  // just disappearing the instant the call ends.
  //
  // `shouldRender` is deliberately NOT its own piece of state that mirrors
  // `visible` through an effect — that would lag `visible` by a render (the
  // effect only runs after the commit where `visible` flipped), so a fresh
  // incoming ring would render nothing for an extra pass. Deriving it
  // straight from `visible`/`closing` below shows the popup the instant
  // `visible` becomes true, same render.
  const [minimized, setMinimized] = useState(false);
  const minimizedRef = useRef(false);
  minimizedRef.current = minimized;
  const [closing, setClosing] = useState(false);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (visible) {
      if (!wasVisible) setMinimized(false); // every new call popup starts un-minimized
      setClosing(false);
      return;
    }

    if (!wasVisible || !minimizedRef.current) return; // nothing was showing, or nothing to animate

    setClosing(true);
    const timer = setTimeout(() => setClosing(false), MINIMIZED_CLOSE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const shouldRender = visible || closing;

  // Operator list is only needed for the in-call transfer drawer — fetched
  // once per login, not on every page, since this component lives in Layout.
  useEffect(() => {
    if (!isAuth || !canUseIpTelephone) return;
    let alive = true;
    API.get('/ip-telefon-operators')
      .then((r) => {
        if (!alive) return;
        setOperators(Array.isArray(r.data) ? r.data : (r.data?.data ?? []));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isAuth, canUseIpTelephone]);

  useEffect(() => {
    if (callState === 'ringing') {
      // Same corner-widget entry point as every outgoing trigger now uses —
      // "Kattalashtirish" inside the popup is there for whoever wants it
      // full-screen, instead of that being decided by which button rang it.
      if (!visible) openCall('');
    } else if (callState === 'idle' && transfer.phase === 'idle') {
      if (visible) closeCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, transfer.phase]);

  const handleHangup = useCallback(async () => {
    closeCall();
    try {
      await hangup();
    } catch (err) {
      console.error('Hangup error:', err);
    }
  }, [hangup, closeCall]);

  const handleAnswer = useCallback(async () => {
    try {
      await answer();
    } catch (err) {
      console.error('Answer error:', err);
    }
  }, [answer]);

  const handleClose = useCallback(async () => {
    closeCall();
    if (callState !== 'idle') {
      try {
        await hangup();
      } catch (err) {
        console.error('Close hangup error:', err);
      }
    }
  }, [callState, hangup, closeCall]);

  if (!isAuth || !canUseIpTelephone || !shouldRender) return null;

  return (
    <CallModal
      initialNumber={initialNumber || callTarget || ''}
      floating={floating}
      onToggleFloating={toggleFloating}
      minimized={minimized}
      onMinimizedChange={setMinimized}
      closing={closing}
      onClose={handleClose}
      onCall={(num) => makeCall(num)}
      onHangup={handleHangup}
      onAnswer={handleAnswer}
      onMute={mute}
      onHold={hold}
      onSendDtmf={sendDtmf}
      onBlindTransfer={blindTransfer}
      onAttendedTransfer={attendedTransfer}
      onCompleteTransfer={completeTransfer}
      onCancelTransfer={cancelTransfer}
      onMergeConsultation={mergeConsultation}
      onRemoveConferenceParticipant={removeConferenceParticipant}
      transfer={transfer}
      conferenceParticipants={conferenceParticipants}
      isHeld={held}
      isMuted={muted}
      callState={callState}
      elapsed={elapsed}
      operators={operators}
      extension={extension}
    />
  );
};

export default GlobalCallWidget;
