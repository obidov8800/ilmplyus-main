import { useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import InfoHint from '../InfoHint';
import { useEmployeeStatus, useHasNoBranch } from '../../hooks/useEmployeeStatus';
import useAuthStore from '../../store/useAuthStore';
import './accessNotice.css';

/** «Shartnomangiz yo'q» bildirishnomasi tizimga kirgandan keyin shuncha vaqt turadi (yoki × bilan yopiladi). */
const CONTRACT_NOTICE_MS = 10_000;
/** Xabar shu kirish (token) uchun ko'rsatilganini eslab qolish — sahifa almashganda/yangilanganda qayta chiqmasin. */
const SEEN_KEY = 'access-notice-contract-seen';

const readSeen = (token: string | null): boolean => {
  try {
    return sessionStorage.getItem(SEEN_KEY) === (token ?? '');
  } catch {
    return false;
  }
};

const writeSeen = (token: string | null) => {
  try {
    sessionStorage.setItem(SEEN_KEY, token ?? '');
  } catch {
    /* private rejim — shu oynada baribir bir marta chiqadi */
  }
};

interface Props {
  /** `contract` — kirgandan keyin tepada BIR MARTA «Shartnomangiz yo'q»; `branch` — filial biriktirilmagan (to'lov/chiqim). */
  kind?: 'contract' | 'branch';
}

/**
 * Shartnomasiz foydalanuvchi: tizimga har kirganda o'ng tepada bitta qisqa bildirishnoma («Sizning shartnomangiz yo‘q.»);
 * u o'zi yo'qoladi (10 soniya) yoki × bilan yopiladi va shu kirish davomida qayta chiqmaydi. Bo'limlar ichida
 * (dars, vazifa, profil) alohida ogohlantirish YO'Q.
 * Filialsiz foydalanuvchi uchun to'lov/chiqim bo'limlarida alohida (yopilmaydigan) tushuntirish qoladi.
 */
export default function AccessNotice({ kind = 'contract' }: Props) {
  const status = useEmployeeStatus();
  const noBranch = useHasNoBranch();
  const token = useAuthStore((state) => state.token);

  // Shu kirishda xabar hali ko'rsatilmaganmi — komponent ochilgan paytdagi holat (keyin o'zgarmaydi).
  const [fresh] = useState(() => !readSeen(token));

  const eligible = kind === 'contract' && (status === 'no_employee' || status === 'no_contract');
  const show = eligible && fresh;

  // «Shartnomangiz yo'q» — sahifa ichidagi blok emas, boshqa xatolik/ogohlantirishlar kabi ekranning o'ng tepasida
  // chiqadigan bildirishnoma (`<Notifications position="top-right" />`). Shu kirish uchun BIR MARTA.
  useEffect(() => {
    if (!show) return;
    writeSeen(token);
    notifications.show({
      id: 'access-notice-contract',
      color: 'yellow',
      title: 'Ogohlantirish',
      message: 'Sizning shartnomangiz yo‘q.',
      autoClose: CONTRACT_NOTICE_MS,
    });
  }, [show, token]);

  if (kind === 'branch') {
    if (!noBranch) return null;
    return (
      <div className="an-notice an-notice--branch" role="status">
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
        <span className="an-notice__text">
          Sizga filial biriktirilmagan.{' '}
          <InfoHint
            wide
            text={
              'To‘lov va chiqimni faqat o‘zingizga biriktirilgan filialga kiritish mumkin. Hozir sizga filial biriktirilmagan, shuning uchun to‘lov/chiqim kiritolmaysiz.\n\nNima qilish kerak: administratorga murojaat qiling — «Foydalanuvchilar» bo‘limida sizga filial biriktirilishi kerak.'
            }
          />
        </span>
      </div>
    );
  }

  return null;
}
