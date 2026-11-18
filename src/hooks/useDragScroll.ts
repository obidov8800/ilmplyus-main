import { useCallback, useEffect, useRef } from 'react';

/**
 * Gorizontal scroll bo'ladigan elementni sichqoncha bilan "ushlab surish"
 * imkonini beradi (jadval keng bo'lib ketganda qulay).
 *
 * `ref`ni scroll konteyneriga (`overflow-x: auto`) berasiz. Matn belgilash yoki
 * tugma/link/input ustida bosilganda surish boshlanmaydi. Overflow bo'lsa
 * elementga `.is-scrollable`, surilayotganda `.is-drag-scrolling` klassi qo'shiladi.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    if (
      (e.target as HTMLElement).closest(
        'button, a, input, select, textarea, [role="button"], label',
      )
    )
      return;
    if (el.scrollWidth <= el.clientWidth) return;
    state.current = { down: true, startX: e.pageX, startLeft: el.scrollLeft, moved: false };
    el.classList.add('is-drag-scrolling');
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () =>
      el.classList.toggle('is-scrollable', el.scrollWidth > el.clientWidth + 1);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    const mo = new MutationObserver(sync);
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      const s = state.current;
      if (!el || !s.down) return;
      const dx = e.pageX - s.startX;
      if (Math.abs(dx) > 3) s.moved = true;
      el.scrollLeft = s.startLeft - dx;
      e.preventDefault();
    };
    const onUp = () => {
      if (!state.current.down) return;
      state.current.down = false;
      ref.current?.classList.remove('is-drag-scrolling');
    };
    const onClickCapture = (e: MouseEvent) => {
      if (state.current.moved) {
        e.stopPropagation();
        e.preventDefault();
        state.current.moved = false;
      }
    };
    const el = ref.current;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el?.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el?.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return { ref, onMouseDown };
}
