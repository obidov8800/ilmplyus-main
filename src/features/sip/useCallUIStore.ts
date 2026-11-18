// =============================================================================
// Call UI store — who should be showing the call popup right now, and how
//
// The SIP session itself (SipProvider/SipContext) already lives above the
// router and survives navigation. Before this store, *displaying* the call
// was still owned by whichever page's button started it (ip-telephone's row
// click, the Lid board's phone click, ...) via local `useState`. Navigating
// away unmounted that page and took the popup with it — the call stayed
// connected (audio, timer, everything) but became invisible and unreachable.
//
// GlobalCallWidget (mounted once in Layout, never unmounts on navigation) is
// now the only thing that renders the call popup, reading this store. Any
// page can ask for the popup via `openCall()` without owning it.
// =============================================================================
import { create } from 'zustand';

interface CallUIState {
  /** Whether the call popup should be rendered right now. */
  visible: boolean;
  /** true = small corner widget; false = full-screen overlay. */
  floating: boolean;
  /** Number to dial / show before the SIP layer reports its own callTarget. */
  initialNumber: string;

  /** Open the popup — e.g. clicking a phone number, or an incoming ring. */
  openCall: (number: string, opts?: { floating?: boolean }) => void;
  /** Hide the popup (call ended, or the user closed it). */
  close: () => void;
  /** The modal's own "Kattalashtirish"/"Kichraytirish" button — same call, different size. */
  toggleFloating: () => void;
}

const useCallUIStore = create<CallUIState>((set) => ({
  visible: false,
  floating: false,
  initialNumber: '',

  // Every trigger opens the popup the same way — a small corner widget that
  // doesn't block whatever the operator was doing. Full-screen is now an
  // explicit choice (toggleFloating), not something that silently differs
  // by which button was clicked.
  openCall: (number, opts) =>
    set({ visible: true, floating: opts?.floating ?? true, initialNumber: number }),

  close: () => set({ visible: false, floating: true, initialNumber: '' }),

  toggleFloating: () => set((s) => ({ floating: !s.floating })),
}));

export default useCallUIStore;
