import EmployeeProfilePage from './employee';

// O'qituvchi ham xodim — bitta umumiy `EmployeeProfilePage`dan foydalanadi,
// farqi shuki bu yerda balans ko'rsatiladi (`Aloqa/Shartnoma/Kurslar`
// tomonlari o'qituvchi bilan hisob-kitobni shu balansdan kuzatishi mumkin).
const TeacherProfilePage = () => <EmployeeProfilePage showBalance />;

export default TeacherProfilePage;
