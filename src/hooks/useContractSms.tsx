import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { sendContractSms } from '@/api/contractSms';
import { notifySuccess } from '@/utils/notify';

/*
 * Shartnoma tasdiqlash SMS'ini qayta yuborish: tugma bosilganda SMS DARHOL shartnoma egasiga yuboriladi
 * (qabul qiluvchini backend o'zi tanlaydi — shartnoma tuzilgan shaxs: voyaga yetgan o'quvchi yoki vakil),
 * oraliq «kimga yuborilsin» oynasi yo'q. Muvaffaqiyatda xabar, xatoni umumiy `api.ts` ko'rsatadi.
 * Kurs va maktabga tayyorlov shartnomalarida bir xil ishlatiladi.
 */

export interface ContractSmsTarget {
  id: number;
  /** Shartnoma raqami. */
  number: string;
  /** Qabul qiluvchi telefon (backend javobida bo'lmasa xabarda ko'rsatiladi). */
  phone: string;
  /** Shartnoma allaqachon tasdiqlangan (faol). */
  confirmed: boolean;
}

export function useContractSms(onSent?: () => void) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<ContractSmsTarget | null>(null);

  const mutation = useMutation({
    mutationFn: (item: ContractSmsTarget) => sendContractSms(item.id),
    onSuccess: (data, item) => {
      notifySuccess(t('contractSms.sent', { phone: data?.phone ?? item.phone ?? '' }));
      onSent?.();
    },
    onSettled: () => setTarget(null),
  });

  return {
    /** SMS'ni darhol yuboradi. */
    ask: (item: ContractSmsTarget) => {
      if (mutation.isPending) return;
      setTarget(item);
      mutation.mutate(item);
    },
    /** Endi oyna yo'q — mavjud joylashuvlar buzilmasligi uchun bo'sh qoldirilgan. */
    modal: null,
    /** Hozir SMS yuborilayotgan shartnoma id'si (tugmada aylanuvchi belgi uchun). */
    sendingId: mutation.isPending ? (target?.id ?? null) : null,
  };
}
