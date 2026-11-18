import { useEffect } from 'react';

/*
 * Butun ilova bo'ylab: gorizontal scroll bo'ladigan istalgan konteynerni
 * sichqoncha bilan "ushlab tortib" scroll qilish (Trello/Google Maps uslubi).
 *
 * Nega hook har bir sahifaga alohida ulanmaydi: ilovada o'nlab turli
 * `overflow-x: auto` konteyner bor (jadval o'ramlari, dars jadvali, lidlar
 * doskasi, chop etish oldindan ko'rish sahifalari...), har biriga alohida
 * ref ulash ko'p va takrorlanuvchi bo'lardi, ustiga yangi sahifa qo'shilganda
 * yana unutilib qolishi mumkin edi. Shu o'rniga bitta global listener (shu
 * hook `App.tsx`da bir marta chaqiriladi) sichqoncha bosilgan joydan yuqoriga
 * qarab birinchi haqiqatan gorizontal scroll bo'ladigan ota-elementni topadi
 * va shu bilan ishlaydi — qaysi sahifa, qaysi klass ekanidan qat'i nazar.
 *
 * Chetlab o'tiladigan holatlar:
 *  - Sichqoncha o'ng/o'rta tugmasi yoki teginish (touch — planshetda allaqachon
 *    tabiiy svayp bilan scroll bo'ladi, unga xalaqit bermaslik kerak).
 *  - `draggable="true"` elementlar (masalan lidlar doskasidagi kartalar —
 *    ular o'zining HTML5 drag-and-drop'iga ega, ikkalasi to'qnashmasligi kerak).
 *  - Input/textarea/select/button/link/contenteditable — oddiy bosish,
 *    matn tanlash yoki tugma bosish davom etishi kerak.
 *  - Kichik harakat (< THRESHOLD) — bu "sudrash" emas, oddiy klik, shuning
 *    uchun keyingi `click` bloklanmaydi.
 */

const DRAG_THRESHOLD = 4;
const EXCLUDE_SELECTOR =
  '[draggable="true"], input, textarea, select, button, a, [contenteditable="true"], [data-no-drag-scroll]';

function findHorizontalScrollAncestor(start: Element | null): HTMLElement | null {
  let node = start as HTMLElement | null;
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowX = getComputedStyle(node).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export default function useGlobalDragScroll() {
  useEffect(() => {
    let target: HTMLElement | null = null;
    let dragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    const suppressNextClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== 'mouse') return;
      const origin = e.target as HTMLElement | null;
      if (!origin || origin.closest(EXCLUDE_SELECTOR)) return;

      const scrollable = findHorizontalScrollAncestor(origin);
      if (!scrollable) return;

      target = scrollable;
      dragging = false;
      startX = e.clientX;
      startScrollLeft = scrollable.scrollLeft;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!target) return;
      const dx = e.clientX - startX;

      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        dragging = true;
        target.classList.add('drag-scrolling');
      }

      target.scrollLeft = startScrollLeft - dx;
      e.preventDefault();
    };

    const endDrag = () => {
      if (target && dragging) {
        target.classList.remove('drag-scrolling');
        // Sudrab bo'lgach ostidagi elementga tasodifiy `click` (masalan
        // karta ochilib ketishi) tushmasin — keyingi bitta klikni yutamiz.
        window.addEventListener('click', suppressNextClick, { capture: true, once: true });
      }
      target = null;
      dragging = false;
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', endDrag);
      document.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('click', suppressNextClick, { capture: true });
    };
  }, []);
}
