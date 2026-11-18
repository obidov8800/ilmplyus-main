// =============================================================================
// Registration Service — UserAgent + Registerer lifecycle
// Professional REGISTER / UNREGISTER with typed event emitter
// =============================================================================
import {
  UserAgent,
  type UserAgentOptions,
  Registerer,
  RegistererState,
  UserAgentState,
  type Invitation,
} from 'sip.js';
import { sipLogger } from './LoggerService';
import type { SipCredentials, RegistrationServiceEvents } from './types';

type EventKey = keyof RegistrationServiceEvents;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener<T extends EventKey> = (data: RegistrationServiceEvents[T]) => any;

export class RegistrationService {
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private credentials: SipCredentials;

  // Typed event emitter (no external dep)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: Map<EventKey, Set<Listener<any>>> = new Map();

  // Externally set invite handler (wired by SipProvider → SessionService)
  private inviteHandler: ((invitation: Invitation) => void) | null = null;

  constructor(credentials: SipCredentials) {
    this.credentials = credentials;
  }

  // ---------------------------------------------------------------------------
  // Event emitter helpers
  // ---------------------------------------------------------------------------

  on<K extends EventKey>(event: K, listener: Listener<K>): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as Listener<EventKey>);
  }

  off<K extends EventKey>(event: K, listener: Listener<K>): void {
    this.listeners.get(event)?.delete(listener as Listener<EventKey>);
  }

  private emit<K extends EventKey>(event: K, data?: RegistrationServiceEvents[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(data as RegistrationServiceEvents[K]));
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  getUserAgent(): UserAgent | null {
    return this.ua;
  }

  setInviteHandler(handler: (invitation: Invitation) => void): void {
    this.inviteHandler = handler;
  }

  // ---------------------------------------------------------------------------
  // Initialise UserAgent (connects WebSocket transport)
  // ---------------------------------------------------------------------------

  async initialize(): Promise<UserAgent> {
    const { login, password, aor, wsServer } = this.credentials;

    const uri = UserAgent.makeURI(aor);
    if (!uri) throw new Error(`[SIP] Invalid AOR: ${aor}`);

    const uaOptions: UserAgentOptions = {
      uri,
      authorizationUsername: login,
      authorizationPassword: password,
      transportOptions: {
        server: wsServer,
        // Reconnection is handled by ReconnectService with exponential backoff
        reconnectionAttempts: 0,
        reconnectionDelay: 0,
      },
      sessionDescriptionHandlerFactoryOptions: {
        iceGatheringTimeout: 3000,
        peerConnectionConfiguration: {
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          rtcpMuxPolicy: 'require',
          bundlePolicy: 'max-bundle',
        },
        constraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        },
      },
      delegate: {
        onConnect: () => {
          sipLogger.info('WS', `Transport connected → ${wsServer}`);
          this.emit('transportConnected');
        },
        onDisconnect: (error?: Error) => {
          if (error) {
            sipLogger.error('WS', 'Transport disconnected with error', error);
          } else {
            sipLogger.warn('WS', 'Transport disconnected (clean)');
          }
          this.emit('transportDisconnected', error);
        },
        onInvite: (invitation: Invitation) => {
          sipLogger.info(
            'INVITE',
            `Incoming INVITE from ${invitation.remoteIdentity.uri.user ?? invitation.remoteIdentity.uri.toString()}`,
          );
          this.inviteHandler?.(invitation);
        },
      },
      // Silence SIP.js internal verbose logging — our logger handles it
      logLevel: 'error',
    };

    sipLogger.info('REGISTER', `Creating UserAgent for ${aor}`);
    this.ua = new UserAgent(uaOptions);

    sipLogger.info('WS', `Connecting to ${wsServer}…`);
    await this.ua.start();
    sipLogger.info('WS', 'UserAgent started — WebSocket transport up');

    return this.ua;
  }

  // ---------------------------------------------------------------------------
  // Send REGISTER
  // ---------------------------------------------------------------------------

  async register(): Promise<void> {
    if (!this.ua) throw new Error('[SIP] UserAgent not initialised');

    // Replace any previous registerer. We only try a courtesy UNREGISTER when
    // the transport is actually up — awaiting one on a socket that just died
    // (the reconnect path) stalls for the full transaction timeout and can
    // clear the registration we are about to restore.
    if (this.registerer) {
      const stale = this.registerer;
      this.registerer = null;
      if (this.ua.transport.isConnected()) {
        try {
          await stale.unregister();
        } catch {
          /* ignore */
        }
      }
    }

    this.registerer = new Registerer(this.ua, {
      expires: 300, // 5-minute registration
      refreshFrequency: 90, // re-register at 90 % of expires = ~270 s
    });

    this.registerer.stateChange.addListener((state: RegistererState) => {
      switch (state) {
        case RegistererState.Registered:
          sipLogger.info(
            'REGISTER',
            `✓ Registered — sip:${this.credentials.login}@${this.credentials.domain}`,
          );
          this.emit('registered');
          break;
        case RegistererState.Unregistered:
          sipLogger.warn(
            'REGISTER',
            `Unregistered — sip:${this.credentials.login}@${this.credentials.domain}`,
          );
          this.emit('unregistered');
          break;
        case RegistererState.Terminated:
          sipLogger.error('REGISTER', 'Registerer terminated');
          break;
        default:
          break;
      }
    });

    sipLogger.info(
      'REGISTER',
      `Sending REGISTER for sip:${this.credentials.login}@${this.credentials.domain}`,
    );

    await this.registerer.register({
      // Without a requestDelegate a rejected REGISTER (wrong password → 401,
      // endpoint not permitted → 403, unknown AOR → 404) resolves silently and
      // the UI sits on "unregistered" forever with no explanation.
      requestDelegate: {
        onReject: (response) => {
          const code = response.message.statusCode ?? 0;
          const phrase = response.message.reasonPhrase ?? '';
          sipLogger.error('REGISTER', `REGISTER rejected — ${code} ${phrase}`);
          this.emit('failed', new Error(this.describeRegisterFailure(code, phrase)));
        },
      },
    });
  }

  /** Turns a REGISTER status code into something an operator can act on */
  private describeRegisterFailure(code: number, phrase: string): string {
    switch (code) {
      case 401:
      case 407:
        return 'SIP paroli noto‘g‘ri (401)';
      case 403:
        return 'FreePBX ulanishni rad etdi (403)';
      case 404:
        return `Extension ${this.credentials.login} FreePBX'da topilmadi (404)`;
      case 408:
        return 'FreePBX javob bermadi (408)';
      default:
        return `Registratsiya xatosi ${code} ${phrase}`.trim();
    }
  }

  // ---------------------------------------------------------------------------
  // Send UNREGISTER
  // ---------------------------------------------------------------------------

  async unregister(): Promise<void> {
    if (!this.registerer) return;
    try {
      await this.registerer.unregister();
      sipLogger.info('REGISTER', 'UNREGISTER sent');
    } catch (err) {
      sipLogger.error('REGISTER', 'UNREGISTER failed', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Reconnect transport (called by ReconnectService)
  // ---------------------------------------------------------------------------

  async reconnect(): Promise<void> {
    if (!this.ua || this.ua.state === UserAgentState.Stopped) {
      throw new Error('[SIP] UserAgent stopped — cannot reconnect');
    }
    sipLogger.info('WS', 'Reconnecting transport…');
    await this.ua.reconnect();
    sipLogger.info('WS', 'Transport reconnected — re-registering…');
    await this.register();
  }

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  async dispose(): Promise<void> {
    try {
      if (this.registerer && this.registerer.state !== RegistererState.Terminated) {
        await this.registerer.unregister();
      }
    } catch {
      /* ignore during teardown */
    }

    try {
      if (this.ua && this.ua.state !== UserAgentState.Stopped) {
        await this.ua.stop();
      }
    } catch {
      /* ignore during teardown */
    }

    this.registerer = null;
    this.ua = null;
    sipLogger.info('REGISTER', 'RegistrationService disposed');
  }
}
