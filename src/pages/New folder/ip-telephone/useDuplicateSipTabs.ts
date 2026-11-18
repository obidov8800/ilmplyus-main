/**
 * Bir xil ichki raqam bir nechta oynada ro'yxatdan o'tganini aniqlaydi.
 *
 * MUAMMO: "SIP ulangan, lekin qo'ng'iroq qilinganda o'chib qolmoqda".
 * Sababi ko'pincha bitta ichki raqamning IKKI joydan ro'yxatdan o'tishi:
 * masalan xodim ilovani ikkita oynada (yoki ikkita brauzer varag'ida) ochib
 * qo'ygan. Har bir oyna o'z SIP mijozini yaratadi va bir xil manzil
 * (`sip:<login>@...`) bilan REGISTER yuboradi. PBX bir raqamga bitta
 * qurilmani hisoblaydi — oxirgi ro'yxatdan o'tgan oyna eskisini siqib
 * chiqaradi. Eski oyna buni bilmaydi: unda "SIP ulangan" yozuvi turaveradi,
 * lekin qo'ng'iroq boshlanishi bilan javob boshqa oynaga ketadi va suhbat
 * uziladi.
 *
 * Buni PBX tomonidan tuzatib bo'lmaydi (raqam bitta), lekin ogohlantirish
 * mumkin: har bir oyna `BroadcastChannel` orqali o'z ichki raqamini e'lon
 * qiladi va boshqa oynadan bir xil raqam eshitilsa, sahifada ogohlantirish
 * chiqadi.
 *
 * CHEKLOV: `BroadcastChannel` faqat BITTA brauzer va BITTA domen ichida
 * ishlaydi. Boshqa kompyuterdan yoki stol telefonidan bo'lgan ikkinchi
 * ro'yxatdan o'tishni bu yerdan ko'rib bo'lmaydi — u holda sababni PBX
 * tomonida qidirish kerak.
 */
import { useEffect, useState } from 'react';

const CHANNEL = 'ilmplyus-sip-registration';
/** Har necha ms'da "men shu yerdaman" deb e'lon qilinadi. */
const ANNOUNCE_MS = 4000;
/** Shuncha vaqt jim turgan oyna yopilgan deb hisoblanadi. */
const STALE_MS = 12000;

interface Announcement {
  id: string;
  ext: string;
}

export function useDuplicateSipTabs(extension: string | null, registered: boolean): boolean {
  const [duplicate, setDuplicate] = useState(false);

  useEffect(() => {
    if (!extension || !registered || typeof BroadcastChannel === 'undefined') return;

    const selfId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = new BroadcastChannel(CHANNEL);
    // Boshqa oynalar oxirgi marta qachon eshitilgani.
    const seen = new Map<string, number>();

    const announce = () => {
      channel.postMessage({ id: selfId, ext: extension } satisfies Announcement);
    };

    channel.onmessage = (event: MessageEvent<Announcement>) => {
      const msg = event.data;
      if (!msg || msg.id === selfId || msg.ext !== extension) return;
      seen.set(msg.id, Date.now());
      setDuplicate(true);
      // Yangi kelgan oyna ham bizni eshitsin — u hali e'lon qilib ulgurmagan
      // bo'lishi mumkin, aks holda ogohlantirish faqat bitta tomonda chiqardi.
      announce();
    };

    const tick = () => {
      announce();
      const now = Date.now();
      seen.forEach((ts, id) => {
        if (now - ts > STALE_MS) seen.delete(id);
      });
      setDuplicate(seen.size > 0);
    };

    announce();
    const timer = window.setInterval(tick, ANNOUNCE_MS);

    return () => {
      window.clearInterval(timer);
      channel.close();
      // Ichki raqam yoki ulanish holati o'zgarsa, ogohlantirish eski
      // ma'lumot bilan qolib ketmasin.
      setDuplicate(false);
    };
  }, [extension, registered]);

  return duplicate;
}
