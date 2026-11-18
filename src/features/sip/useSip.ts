// =============================================================================
// useSip — Thin adapter hook
// Reads from SipContext and returns the interface page components consume.
// The remoteAudioRef param is kept for backward compatibility but ignored —
// AudioService manages its own DOM element independently.
// =============================================================================
import type React from 'react';
import { useSipContext } from './SipContext';
import type { ConferenceParticipant, TransferState } from './types';

export type CallState =
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'active'
  | 'ended'
  | 'error';

export interface UseSipReturn {
  callState:         CallState;
  callTarget:        string | null;
  registered:        boolean;
  registrationError: string | null;
  extension:         string | null;
  held:              boolean;
  muted:             boolean;
  transfer:          TransferState;
  conferenceParticipants: ConferenceParticipant[];
  makeCall:          (phoneNumber: string) => Promise<void>;
  hangup:            () => Promise<void>;
  answer:            () => Promise<void>;
  mute:              (muted: boolean) => void;
  hold:              (held: boolean) => Promise<void>;
  sendDtmf:          (tone: string) => void;
  /** Blind transfer — hands the caller straight to `ext` */
  blindTransfer:     (ext: string) => Promise<void>;
  /** Attended transfer step 1 — park the caller and consult `ext` */
  attendedTransfer:  (ext: string) => Promise<void>;
  /** Attended transfer step 2 — hand the parked caller over */
  completeTransfer:  () => Promise<void>;
  /** Abort a consultation and go back to the parked caller */
  cancelTransfer:    () => Promise<void>;
  /** Bridge the consultation in instead of handing it off — everyone stays connected */
  mergeConsultation: () => Promise<void>;
  /** Drop one bridged conference participant, leaving everyone else connected */
  removeConferenceParticipant: (callId: string) => Promise<void>;
  elapsed:           number;
}

/**
 * Drop-in replacement for the old useSip hook.
 * The optional remoteAudioRef parameter is accepted but unused — kept so
 * existing pages need zero changes.
 */
export function useSip(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _remoteAudioRef?: React.RefObject<HTMLAudioElement | null>,
): UseSipReturn {
  const ctx = useSipContext();

  return {
    callState:         ctx.callState,
    callTarget:        ctx.callTarget,
    registered:        ctx.registered,
    registrationError: ctx.registrationError,
    extension:         ctx.extension,
    held:              ctx.held,
    muted:             ctx.muted,
    transfer:          ctx.transfer,
    conferenceParticipants: ctx.conferenceParticipants,
    makeCall:          ctx.makeCall,
    hangup:            ctx.hangup,
    answer:            ctx.answer,
    mute:              ctx.mute,
    hold:              ctx.hold,
    sendDtmf:          ctx.sendDtmf,
    blindTransfer:     ctx.blindTransfer,
    attendedTransfer:  ctx.attendedTransfer,
    completeTransfer:  ctx.completeTransfer,
    cancelTransfer:    ctx.cancelTransfer,
    mergeConsultation: ctx.mergeConsultation,
    removeConferenceParticipant: ctx.removeConferenceParticipant,
    elapsed:           ctx.elapsed,
  };
}
