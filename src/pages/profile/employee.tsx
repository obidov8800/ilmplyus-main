import { useQuery } from '@tanstack/react-query';
import { API } from '../../api/api';
import useAuthStore from '../../store/useAuthStore';
import { useAccount } from '../../services/account';
import { formatDate } from '@/utils/date';
import './studentProfile.css';
import { usePermission } from '@/hooks/usePermission';

interface EmployeeData {
  id: number;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  birth_date?: string;
  passport_series?: string;
  passport_number?: string;
  pinfl?: string;
  jshshr?: string;
  phone?: string;
  address_current?: string;
  address_reg?: string;
  balance?: number;
  status?: string;
  photo_url?: string | null;
  photo?: string | null;
  image?: string | null;
}

interface EmployeeProfilePageProps {
  /**
   * O'qituvchida balans ko'rsatiladi (o'z hisob-kitobini ko'rish uchun),
   * oddiy xodim turlarida esa yo'q — bu talaba balansi bilan chalkashib
   * ketgan avvalgi xatoning o'rniga qo'yilgan.
   */
  showBalance?: boolean;
}

// Komponent har render'da qayta yaratilmasligi uchun tashqarida e'lon
// qilingan (render ichida e'lon qilinsa, React uni har safar "yangi"
// komponent deb hisoblab, ichki holatini asossiz qayta tiklashi mumkin).
const InfoRow = ({
  label,
  value,
  blue,
}: {
  label: string;
  value?: string | null;
  blue?: boolean;
}) => (
  <div className="sp-info-row">
    <span className="sp-info-key">{label}</span>
    <span className={`sp-info-val${blue ? ' sp-info-val-blue' : ''}`}>{value || '-'}</span>
  </div>
);

/**
 * Xodim (shu jumladan o'qituvchi) o'z profilini ko'radigan sahifa.
 *
 * Ilgari rol talaba/operator/menejer/o'qituvchiga mos kelmasa (masalan
 * kassir, HR kabi umumiy xodimlar), `index.tsx` `StudentProfilePage`ni
 * ko'rsatib yuborardi — u esa `/students/{user.id}` dan ma'lumot olardi.
 * `users.id` va `students.id` alohida jadvallar bo'lgani uchun bu
 * TASODIFAN boshqa (haqiqiy) o'quvchining ismi/balansini ko'rsatib
 * yuborishi mumkin edi. Bu sahifa o'rniga xodim yozuvini (`/employees`,
 * `user_id` bo'yicha) olib, faqat shaxsiy ma'lumotlarni ko'rsatadi —
 * talabaga xos yorliqlar (Vakil, Kurslarim, Vazifalar...) va balans
 * yo'q, agar `showBalance` berilmagan bo'lsa.
 */
const EmployeeProfilePage = ({ showBalance = false }: EmployeeProfilePageProps) => {
  const user = useAuthStore((s) => s.user);
  // Ism/telefon/shaxsiy ma'lumot — yagona hisob servisidan (`/me`): qo'shimcha so'rovsiz darhol ko'rinadi.
  const { account } = useAccount();
  // `/employees` — `employees.view` ruxsatini talab qiladi. Ruxsati yo'q xodim (masalan kassir) uchun so'ralmaydi
  // (har safar 403 va qizil xabar chiqmasin) — profil faqat `/me` dagi ma'lumot bilan ko'rsatiladi.
  const canViewEmployees = usePermission('employees.view');

  const { data: fetchedProfile } = useQuery<EmployeeData | null>({
    queryKey: ['employee-profile', user?.id, canViewEmployees],
    queryFn: async () => {
      // O'z login/paroli bilan kirgan xodim (`/employee/login`): `user.id` — allaqachon `employees.id`. `?user_id=` bilan
      // qidirilsa, `users.id` deb tushunilib BOSHQA xodimning yozuvi chiqib qolardi.
      if (user?.account_type === 'employee') {
        const { data } = await API.get(`/employees/${user.id}`);
        return data?.data ?? data;
      }

      // Avval `/employees?user_id=` orqali qidiramiz — xodimning o'z ID'si
      // (`employees.id`) login qilgan foydalanuvchi ID'sidan (`users.id`)
      // FARQLI bo'lishi mumkin. To'g'ridan-to'g'ri `/employees/{user.id}`
      // chaqirish tasodifan boshqa xodimning yozuvini qaytarib yuborishi
      // mumkin edi (xuddi avvalgi talaba-profili xatosidagi kabi).
      try {
        const { data: list } = await API.get('/employees', {
          params: { user_id: user?.id },
        });
        const employees = Array.isArray(list) ? list : list?.data || [];
        if (employees.length > 0) return employees[0];
      } catch {
        // pastdagi zaxiraga o'tamiz
      }

      const { data } = await API.get(`/employees/${user?.id}`);
      return data;
    },
    enabled: !!user?.id && canViewEmployees,
    // Profil kam o'zgaradi: sahifaga har kirganda emas, 5 daqiqada bir marta qayta so'raladi.
    staleTime: 5 * 60 * 1000,
  });

  // O'z login/paroli bilan kirgan xodimda `/me` xodimning o'z yozuvini beradi — `/employees` ruxsati bo'lmasa ham
  // (o'qituvchi) shaxsiy ma'lumot shu yerdan ko'rinadi.
  const profile: EmployeeData | null =
    fetchedProfile ?? (account?.kind === 'employee' ? (account.raw as unknown as EmployeeData) : null);

  const fullName =
    [profile?.last_name, profile?.first_name, profile?.middle_name]
      .filter(Boolean)
      .join(' ') ||
    account?.fullName ||
    '-';

  const formatBalance = (v?: number) =>
    v != null ? `${Number(v).toLocaleString('ru-RU')} SO'M` : "0 SO'M";

  const photoUrl = profile?.photo_url || profile?.photo || profile?.image;
  const address = profile?.address_current || profile?.address_reg;
  const pinfl = profile?.pinfl || profile?.jshshr;
  const passport = [profile?.passport_series, profile?.passport_number]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="sp-page container">
      <div className="sp-header-card">
        <div className="sp-photo-wrap">
          {photoUrl ? (
            <img src={photoUrl} alt="profile" className="sp-photo-img" />
          ) : (
            <span className="sp-photo-plus">+</span>
          )}
        </div>

        <div className="sp-info-area">
          <div className="sp-info-section-label">Shaxsiy ma'lumotlar</div>
          <div className="sp-info-grid">
            <InfoRow label="F.I.SH" value={fullName} blue />
            <InfoRow
              label="TUG'ILGAN SANASI"
              value={profile?.birth_date ? formatDate(profile.birth_date, '-') : undefined}
            />
            <InfoRow label="PASSPORT SERIYA VA RAQAM" value={passport} blue />
            <InfoRow label="PINFL" value={pinfl} />
            <InfoRow label="TELEFON NOMER" value={profile?.phone} />
            <div className="sp-info-row sp-info-col-full">
              <span className="sp-info-key">YASHASH MANZILI</span>
              <span className="sp-info-val">{address || '-'}</span>
            </div>
          </div>

          <div className="sp-badges">
            {showBalance && (
              <span className="sp-badge-balance">
                BALANS&nbsp;&nbsp;{formatBalance(profile?.balance)}
              </span>
            )}
            <span className="sp-badge-status">
              STATUS
              <span className="sp-badge-status-dot" />
              {profile?.status === 'active' ? 'Aktiv' : profile?.status || '-'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfilePage;
