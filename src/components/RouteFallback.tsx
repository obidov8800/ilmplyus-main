import { Loader } from '@mantine/core';

/**
 * Sahifa bo'lagi (chunk) yuklanayotgan paytdagi oraliq ko'rinish.
 *
 * Sahifalar `React.lazy` bilan alohida fayllarga bo'lingan — shu sababli
 * birinchi ochilishda qisqa pauza bo'lishi mumkin. Bu yerda hech qanday
 * ma'lumot ko'rsatilmaydi, faqat kutish belgisi.
 */
const RouteFallback = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      width: '100%',
    }}
  >
    <Loader size="sm" color="gray" />
  </div>
);

export default RouteFallback;
