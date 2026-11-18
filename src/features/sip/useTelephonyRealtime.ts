// =============================================================================
// useTelephonyRealtime — React binding for the telephony event bus
//
// Subscribes a component to live SIP-driven events without re-subscribing on
// every render: handlers are kept in refs so callers can pass inline arrows.
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import { telephonyEvents } from './TelephonyEventService';
import type { TelephonyEventMap } from './TelephonyEventService';
import type { CallSummary, OperatorStatus } from './types';

export interface TelephonyRealtimeHandlers {
  /** Fires the moment a call ends — use it to refresh history with no polling */
  onCallEnded?: (summary: CallSummary) => void;
  /** Fires on every primary-call state transition */
  onCallState?: (payload: TelephonyEventMap['callState']) => void;
  /** Fires when any operator's availability changes */
  onOperatorStatus?: (payload: TelephonyEventMap['operatorStatus']) => void;
}

export function useTelephonyRealtime(handlers: TelephonyRealtimeHandlers): void {
  const ref = useRef(handlers);

  // Keep the latest handlers without re-subscribing on every render
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const unsubscribers = [
      telephonyEvents.on('callEnded', (s) => ref.current.onCallEnded?.(s)),
      telephonyEvents.on('callState', (p) => ref.current.onCallState?.(p)),
      telephonyEvents.on('operatorStatus', (p) => ref.current.onOperatorStatus?.(p)),
    ];
    return () => unsubscribers.forEach((off) => off());
  }, []);
}

/**
 * Live availability map keyed by extension.
 * Lets the transfer drawer grey out operators who are already on a call.
 */
export function useOperatorStatuses(): Record<string, OperatorStatus> {
  const [statuses, setStatuses] = useState<Record<string, OperatorStatus>>(() =>
    Object.fromEntries(telephonyEvents.getAllOperatorStatus()),
  );

  useEffect(() => {
    return telephonyEvents.on('operatorStatus', ({ extension, status }) => {
      setStatuses((prev) =>
        prev[extension] === status ? prev : { ...prev, [extension]: status },
      );
    });
  }, []);

  return statuses;
}
