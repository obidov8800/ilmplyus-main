import { useAccount } from '../../services/account';
import StudentProfilePage from './student';
import TeacherProfilePage from './teacher';
import OperatorProfilePage from './operator';
import ManagerProfilePage from './manager';
import EmployeeProfilePage from './employee';

const ProfilePage = () => {
  // Hisob turiga (xodim-foydalanuvchi / o'z login/paroli bilan kirgan xodim) qaramay rollar yagona servisdan olinadi.
  const { account } = useAccount();
  // Rol nomidagi apostrof turli belgi bo'lishi mumkin («O‘qituvchi» — U+2018): tekshiruv uchun oddiyga keltiriladi.
  const roles: string[] = (account?.roleNames ?? []).map((name) => name.toLowerCase().replace(/[‘’ʻʼ`´]/g, "'"));

  const is = (keyword: string) => roles.some((r) => r.includes(keyword));

  if (is('student') || is('talaba')) return <StudentProfilePage />;
  if (is('teacher') || is("o'qituvchi") || is('ustoz')) return <TeacherProfilePage />;
  if (is('operator')) return <OperatorProfilePage />;
  if (is('manager') || is('menejer')) return <ManagerProfilePage />;

  // Qolgan barcha xodim turlari (kassir, HR va h.k.) — talaba profili
  // EMAS (avval shu yerga tushib qolib, `/students/{user.id}` orqali
  // tasodifan boshqa o'quvchining ma'lumotini ko'rsatib yuborardi), balki
  // umumiy xodim profili, balanssiz.
  return <EmployeeProfilePage />;
};

export default ProfilePage;
