// =============================================================================
// SIP Logger Service — Structured, tagged logging for every SIP event
//
// Beyond console output it keeps an in-memory ring buffer so a support engineer
// can export the last N events after a failed call (see `export()`), which is
// the only practical way to debug a 100+ operator deployment remotely.
// =============================================================================

export type LogTag =
  | 'REGISTER'
  | 'INVITE'
  | 'SESSION'
  | 'AUDIO'
  | 'TRANSFER'
  | 'REFER'
  | 'NOTIFY'
  | 'RECONNECT'
  | 'QUEUE'
  | 'ICE'
  | 'WS'
  | 'DTMF'
  | 'PRESENCE'
  | 'AUTH'
  | 'HOLD'
  | 'REALTIME'
  | 'CONFERENCE';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface SipLogEntry {
  ts: number;
  level: LogLevel;
  tag: LogTag;
  message: string;
  data?: unknown;
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  info:  'color: #4a9eff; font-weight: 600;',
  warn:  'color: #ffb340; font-weight: 600;',
  error: 'color: #ff5555; font-weight: 600;',
  debug: 'color: #888888; font-weight: 400;',
};

/** Console methods per level — avoids a switch on every call */
const LEVEL_SINKS: Record<LogLevel, (...args: unknown[]) => void> = {
  info:  (...a) => console.info(...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
  debug: (...a) => console.debug(...a),
};

const RING_BUFFER_SIZE = 500;

class SipLoggerService {
  private enabled = import.meta.env.DEV;
  /** Errors and warnings are always kept, even when console output is off */
  private buffer: SipLogEntry[] = [];

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  info(tag: LogTag, message: string, data?: unknown): void {
    this.write('info', tag, message, data);
  }

  warn(tag: LogTag, message: string, data?: unknown): void {
    this.write('warn', tag, message, data);
  }

  error(tag: LogTag, message: string, data?: unknown): void {
    this.write('error', tag, message, data);
  }

  debug(tag: LogTag, message: string, data?: unknown): void {
    this.write('debug', tag, message, data);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Last N entries, newest last — for a "copy diagnostics" button */
  history(): readonly SipLogEntry[] {
    return this.buffer;
  }

  /** Plain-text dump suitable for pasting into a bug report */
  export(): string {
    return this.buffer
      .map((e) => {
        const line = `${new Date(e.ts).toISOString()} [${e.level.toUpperCase()}][${e.tag}] ${e.message}`;
        if (e.data === undefined) return line;
        let serialized: string;
        try {
          serialized = e.data instanceof Error
            ? `${e.data.name}: ${e.data.message}`
            : JSON.stringify(e.data);
        } catch {
          serialized = String(e.data);
        }
        return `${line} :: ${serialized}`;
      })
      .join('\n');
  }

  clear(): void {
    this.buffer = [];
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private write(level: LogLevel, tag: LogTag, message: string, data?: unknown): void {
    // Buffer first — diagnostics must survive even when console output is muted
    this.buffer.push({ ts: Date.now(), level, tag, message, data });
    if (this.buffer.length > RING_BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - RING_BUFFER_SIZE);
    }

    // Errors always reach the console; everything else respects `enabled`
    if (!this.enabled && level !== 'error') return;

    const label = `%c[SIP][${tag}] ${this.timestamp()} — ${message}`;
    const sink = LEVEL_SINKS[level];
    if (data !== undefined) sink(label, LEVEL_STYLES[level], data);
    else sink(label, LEVEL_STYLES[level]);
  }

  private timestamp(): string {
    return new Date().toISOString().slice(11, 23); // HH:mm:ss.mmm
  }
}

/** Singleton logger — import and use across all SIP services */
export const sipLogger = new SipLoggerService();

// Expose for on-site debugging: `__sipLog.export()` in the browser console.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__sipLog = sipLogger;
}
