// =============================================================================
// Reconnect Service — Exponential-backoff WebSocket reconnect + heartbeat
// =============================================================================
import { UserAgentState } from 'sip.js';
import { sipLogger } from './LoggerService';
import type { RegistrationService } from './RegistrationService';

export class ReconnectService {
  private registrationService: RegistrationService;

  // Backoff state
  private attemptCount = 0;
  private readonly BASE_DELAY_MS    = 1_000;
  private readonly MAX_DELAY_MS     = 60_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Heartbeat — detects silent disconnects (30 s interval)
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_MS = 30_000;

  private disposed = false;

  constructor(registrationService: RegistrationService) {
    this.registrationService = registrationService;
  }

  start(): void {
    this.disposed = false;
    this.registrationService.on('transportDisconnected', this.onDisconnect);
    this.registrationService.on('transportConnected',    this.onConnect);
    this.startHeartbeat();
    sipLogger.info('RECONNECT', 'ReconnectService started (exponential-backoff ready)');
  }

  stop(): void {
    this.disposed = true;
    this.registrationService.off('transportDisconnected', this.onDisconnect);
    this.registrationService.off('transportConnected',    this.onConnect);
    this.clearReconnectTimer();
    this.stopHeartbeat();
    sipLogger.info('RECONNECT', 'ReconnectService stopped');
  }

  // ---------------------------------------------------------------------------
  // Transport event handlers
  // ---------------------------------------------------------------------------

  private onDisconnect = (_error?: Error): void => {
    if (this.disposed) return;
    this.scheduleReconnect();
  };

  private onConnect = (): void => {
    // Reset backoff counter on successful connection
    this.attemptCount = 0;
    this.clearReconnectTimer();
    sipLogger.info('RECONNECT', 'Transport up — backoff counter reset');
  };

  // ---------------------------------------------------------------------------
  // Exponential backoff
  // ---------------------------------------------------------------------------

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const delay = Math.min(
      this.BASE_DELAY_MS * Math.pow(2, this.attemptCount),
      this.MAX_DELAY_MS,
    );
    this.attemptCount += 1;

    sipLogger.warn(
      'RECONNECT',
      `Transport down — attempt #${this.attemptCount} in ${delay} ms`,
    );

    this.reconnectTimer = setTimeout(async () => {
      if (this.disposed) return;

      const ua = this.registrationService.getUserAgent();
      if (!ua || ua.state === UserAgentState.Stopped) return;

      try {
        await this.registrationService.reconnect();
        sipLogger.info('RECONNECT', `Reconnect #${this.attemptCount} succeeded`);
      } catch (err) {
        sipLogger.error('RECONNECT', `Reconnect #${this.attemptCount} failed`, err);
        // Schedule the next attempt
        this.scheduleReconnect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Heartbeat — catches silent TCP drops that don't fire onDisconnect
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.disposed) return;

      const ua = this.registrationService.getUserAgent();
      if (!ua || ua.state !== UserAgentState.Started) return;

      // Access transport connection state via duck-typing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transport = ua.transport as any;
      const isConnected: boolean =
        typeof transport.isConnected === 'function'
          ? (transport.isConnected() as boolean)
          : typeof transport._state === 'string'
            ? transport._state === 'Connected'
            : true; // assume connected if we can't inspect

      if (!isConnected) {
        sipLogger.warn('RECONNECT', 'Heartbeat detected silent disconnect — triggering reconnect');
        this.onDisconnect();
      }
    }, this.HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
