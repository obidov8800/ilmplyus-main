// =============================================================================
// Shared SIP target sanitization
//
// PBX dial patterns match digit-only extensions/trunk numbers (e.g. `_9XX.`),
// not E.164-style `+` prefixes. `makeCall` always stripped this before
// dialing — but transfer (blind, attended-consult, complete) built its own
// `sip:${ext}@domain` URI straight from whatever string was passed in, with
// no such cleanup. That was invisible while every transfer target was an
// internal operator login (already a clean digit string), but once contacts
// could hold a saved external number — possibly typed/stored with a leading
// "+" — transferring to one could build a URI the dial plan does not match,
// which the PBX answers with a 503: the exact "to'g'ridan-to'g'ri
// yo'naltirishda 503" symptom reported.
// =============================================================================

/** Digits and a leading `+` only, then the `+` itself is dropped. */
export function cleanTarget(raw: string): string {
  return raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
}
