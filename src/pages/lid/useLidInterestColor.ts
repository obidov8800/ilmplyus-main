import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { normalizeInterestColor, type LidInterestColor } from '@/types/lid.types';
import { updateLidInterestColor } from './lid.service';
import { patchLidInCache } from './lidCache';

/**
 * Lid rangini o'zgartirish: backendga `PATCH /lids/{id}` yuboradi, natija esa
 * darhol ko'rinadi (lokal holat + keshdagi barcha ro'yxatlar). Xato bo'lsa
 * eski rang qaytariladi. Lokal holat kerak, chunki tafsilot oynasi lidning
 * eski nusxasini (state) ushlab turadi — keshni yangilash unga yetib bormaydi.
 */
export function useLidInterestColor(
  lidId: number,
  initial: LidInterestColor | null | undefined,
) {
  const queryClient = useQueryClient();
  const incoming = normalizeInterestColor(initial);
  const [color, setColor] = useState<LidInterestColor | null>(incoming);
  const [seenIncoming, setSeenIncoming] = useState<LidInterestColor | null>(incoming);

  // Tashqaridan (ro'yxat yangilanishidan) boshqa rang kelsa — shunga moslashamiz.
  if (incoming !== seenIncoming) {
    setSeenIncoming(incoming);
    setColor(incoming);
  }

  const mutation = useMutation({
    mutationFn: (next: LidInterestColor | null) => updateLidInterestColor(lidId, next),
    onMutate: (next) => {
      const previous = color;
      setColor(next);
      patchLidInCache(queryClient, lidId, { interest_color: next });
      return { previous };
    },
    onError: (_error, _next, context) => {
      const previous = context?.previous ?? null;
      setColor(previous);
      patchLidInCache(queryClient, lidId, { interest_color: previous });
    },
  });

  return { color, setColor: mutation.mutate, isPending: mutation.isPending };
}
