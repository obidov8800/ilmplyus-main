// =============================================================================
// SIP Context — React Context definition only (no Provider logic here)
// =============================================================================
import { createContext, useContext } from 'react';
import type { SipContextValue } from './types';
import { INITIAL_TRANSFER_STATE } from './types';

const defaultCtx: SipContextValue = {
  registrationStatus: 'unregistered',
  registered:         false,
  registrationError:  null,
  callState:          'idle',
  callTarget:         null,
  elapsed:            0,
  held:               false,
  muted:              false,
  transfer:           INITIAL_TRANSFER_STATE,
  conferenceParticipants: [],
  credentialsReady:   false,
  extension:          null,
  makeCall:           async () => undefined,
  hangup:             async () => undefined,
  answer:             async () => undefined,
  mute:               () => undefined,
  hold:               async () => undefined,
  sendDtmf:           () => undefined,
  blindTransfer:      async () => undefined,
  attendedTransfer:   async () => undefined,
  completeTransfer:   async () => undefined,
  cancelTransfer:     async () => undefined,
  mergeConsultation:  async () => undefined,
  removeConferenceParticipant: async () => undefined,
};

export const SipContext = createContext<SipContextValue>(defaultCtx);

/** Hook for consuming SipContext inside any component */
export function useSipContext(): SipContextValue {
  return useContext(SipContext);
}
