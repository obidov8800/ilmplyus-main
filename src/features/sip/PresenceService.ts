// =============================================================================
// Presence Service — SUBSCRIBE / NOTIFY for operator presence
// Used to show idle/busy/unavailable status in the transfer drawer
// =============================================================================
import { sipLogger } from './LoggerService';

export type PresenceState = 'idle' | 'busy' | 'unavailable' | 'unknown';

export interface PresenceEntry {
  extension: string;
  state: PresenceState;
  note?: string;
  updatedAt: number;
}

type PresenceChangeCallback = (extension: string, entry: PresenceEntry) => void;

export class PresenceService {
  /** extension → PresenceEntry */
  private presenceMap = new Map<string, PresenceEntry>();
  private onChangeCallback: PresenceChangeCallback | null = null;

  setOnChange(cb: PresenceChangeCallback): void {
    this.onChangeCallback = cb;
  }

  /** Update presence from an external NOTIFY body (pidf+xml or plain text) */
  updateFromNotify(extension: string, body: string, contentType: string): void {
    let state: PresenceState = 'unknown';
    let note: string | undefined;

    if (contentType.includes('pidf+xml')) {
      state = this.parsePidf(body);
    } else if (contentType.includes('text/plain')) {
      const lower = body.toLowerCase().trim();
      if (lower.includes('idle'))        state = 'idle';
      else if (lower.includes('busy'))   state = 'busy';
      else if (lower.includes('unavailable')) state = 'unavailable';
    }

    const entry: PresenceEntry = { extension, state, note, updatedAt: Date.now() };
    this.presenceMap.set(extension, entry);
    this.onChangeCallback?.(extension, entry);

    sipLogger.info('PRESENCE', `Extension ${extension} → ${state}`);
  }

  /** Manually set an extension as busy (called when we answer a call to that ext) */
  markBusy(extension: string): void {
    const entry: PresenceEntry = { extension, state: 'busy', updatedAt: Date.now() };
    this.presenceMap.set(extension, entry);
    this.onChangeCallback?.(extension, entry);
  }

  getPresence(extension: string): PresenceState {
    return this.presenceMap.get(extension)?.state ?? 'unknown';
  }

  getAllPresence(): Map<string, PresenceEntry> {
    return this.presenceMap;
  }

  dispose(): void {
    this.presenceMap.clear();
    this.onChangeCallback = null;
    sipLogger.info('PRESENCE', 'PresenceService disposed');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private parsePidf(xml: string): PresenceState {
    try {
      // Basic PIDF parsing without a full XML parser
      if (xml.includes('<basic>open</basic>'))   return 'idle';
      if (xml.includes('<basic>closed</basic>')) return 'unavailable';
      if (xml.includes('busy'))                  return 'busy';
    } catch {
      // ignore malformed XML
    }
    return 'unknown';
  }
}
