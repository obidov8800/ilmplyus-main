import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import useAuthStore from './store/useAuthStore';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PermissionRoute from './components/PermissionRoute';
import RouteFallback from './components/RouteFallback';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import { usePrefetchRoutes } from './utils/prefetchRoutes';
// import { prefetchCallHistory } from './pages/ip-telephone/callHistory';
import useGlobalDragScroll from './hooks/useGlobalDragScroll';
import ContractsOnlyApp from './ContractsOnlyApp';

/*
 * Sahifalar `lazy` bilan yuklanadi.
 *
 * Nega: barchasi to'g'ridan-to'g'ri import qilinganda ilova bitta ~3.6 MB'lik
 * faylga yig'ilardi — ichida jspdf, html2canvas, docx, recharts kabi faqat
 * ayrim sahifalarga keraklilari ham bor edi. Brauzer shuning hammasini yuklab,
 * ishga tushirmaguncha birorta API so'rovi ketmasdi. Endi har sahifa o'z
 * bo'lagida: ochilish paytida faqat kerakligi yuklanadi.
 *
 * Marshrutlar ro'yxati va ruxsat tekshiruvlari o'zgarmagan.
 */
// const Dashboard = lazy(() => import('./pages/dashboard'));
// const Lids = lazy(() => import('./pages/lid'));
// // const Payments = lazy(() => import('./pages/payments'));
// const Courses = lazy(() => import('./pages/courses'));
// const Reports = lazy(() => import('./pages/reports'));
// const Tasks = lazy(() => import('./pages/tasks'));
// const Cyclogram = lazy(() => import('./pages/cyclogram'));
// const Registration = lazy(() => import('./pages/registration'));
// const NotFound = lazy(() => import('./pages/notFound'));
// const LoginPage = lazy(() => import('./pages/login'));
// const Attendance = lazy(() => import('./pages/attendance'));
// const EmployeeAttendanceDetail = lazy(() => import('./pages/attendance/EmployeeAttendanceDetail'));
// // const Groups = lazy(() => import('./pages/groups'));
// // const GroupMembersPage = lazy(() => import('./pages/groups/GroupMembersPage'));
// const Contracts = lazy(() => import('./pages/contracts'));
// const ContractDetailPage = lazy(() => import('./pages/contracts/ContractDetailPage'));
// const StudentsAttendance = lazy(() => import('./pages/students-attendance'));
// const PreschoolAttendance = lazy(() => import('./pages/preschool-attendance'));
// const PreschoolPrices = lazy(() => import('./pages/preschool-prices'));
// const PreschoolContracts = lazy(() => import('./pages/preschool-contracts'));
// const PreschoolContractCreate = lazy(() => import('./pages/preschool-contracts/PreschoolContractCreate'));
// const ContractsCreate = lazy(() => import('./pages/contracts/ContractsCreate'));
// const RoleManagement = lazy(() => import('./pages/roles/RoleManagement'));
// const Users = lazy(() => import('./pages/users'));
// const Regions = lazy(() => import('./pages/regions'));
// const Districts = lazy(() => import('./pages/districts'));
// const Expenses = lazy(() => import('./pages/expenses'));
// const Lessons = lazy(() => import('./pages/lessons'));
// const LessonSchedule = lazy(() => import('./pages/lesson-schedule'));
// // Marshrut bo'lagi yuklanayotgan paytda PBX tarixi ham boshlanadi: ma'lumot
// // kutish bo'lak yuklashdan KEYIN emas, u bilan BIRGA o'tadi.
// const IPTelephone = lazy(() => {
//   prefetchCallHistory();
//   return import('./pages/ip-telephone');
// });
// const StudentsContract = lazy(() => import('./pages/students-contract'));
// const UnderAge = lazy(() => import('./pages/students-contract/underAge'));
// const LegalEntity = lazy(() => import('./pages/students-contract/legalEntity'));
// const RepresentativeEntity = lazy(() => import('./pages/students-contract/representativeEntity'));
// const ContractDetails = lazy(() => import('./pages/students-contract/ContractDetails'));
// const StudentExamPage = lazy(() => import('./pages/student-exam'));
// const StudentExamsPage = lazy(() => import('./pages/student-exams'));
// const ProfilePage = lazy(() => import('./pages/profile'));
// const NotificationsPage = lazy(() => import('./pages/notifications'));
// const FaqPage = lazy(() => import('./pages/faq'));
// const DemoLesson = lazy(() => import('./pages/demo-lesson'));
// // `chek` moduli nomlangan eksport beradi — `lazy` esa `default` kutadi.
// const ChekDownloadPage = lazy(() =>
//   import('./pages/chek').then((m) => ({ default: m.ChekDownloadPage })),
// );
// const ContractConfirmPage = lazy(() => import('./pages/contract-confirm'));
// const SetPasswordPage = lazy(() => import('./pages/set-password'));
// const Finances = lazy(() => import('./pages/finance'));
// const DebtsPage = lazy(() => import('./pages/debts'));
// const PayrollDistribution = lazy(() => import('./pages/payroll-distribution'));
// const PayrollAdjustments = lazy(() => import('./pages/payroll-adjustments'));
// const AdjustmentForm = lazy(() => import('./pages/payroll-adjustments/AdjustmentForm'));
// const PayrollDistributionRequests = lazy(
//   () => import('./pages/payroll-distribution-requests'),
// );
// const DailyCashReports = lazy(() => import('./pages/daily-cash-reports'));
// const FinanceGeneration = lazy(() => import('./pages/finance-generation'));
// const AdvanceSchedule = lazy(() => import('./pages/advance-schedule'));
// const SalarySchedule = lazy(() => import('./pages/salary-schedule'));
// const Penalties = lazy(() => import('./pages/penalties'));
// const FinancePlans = lazy(() => import('./pages/finance-plans'));
// const MonthEndAnalysis = lazy(() => import('./pages/month-end-analysis'));
// const PriceListPage = lazy(() => import('./pages/courses/PriceListPage'));
// const TestPage = lazy(() => import('./pages/students-test'));

import {
  COURSES_PAGE_VIEW,
  LESSON_SCHEDULE_VIEW,
  STAFF_ATTENDANCE_VIEW,
  STUDENT_ATTENDANCE_VIEW,
  DAILY_CASH_REPORTS_VIEW,
  DEBTS_VIEW,
  FINANCE_ACCOUNTS_VIEW,
  FINANCIAL_PLANS_VIEW,
  MONTH_END_ANALYSIS_VIEW,
  PAYROLL_ADJUSTMENTS_VIEW,
  PAYROLL_DISTRIBUTION_REQUESTS_VIEW,
  PAYROLL_DISTRIBUTION_VIEW,
  PAYROLL_SHEETS_VIEW,
  PENALTIES_VIEW,
} from './utils/financePermissions';

import './index.css';
import './styles/modal.css';
import './styles/primitives.css';
import './styles/consistency.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

const FullApp = () => {
  const isAuth = useAuthStore((state) => state.isAuth);
  const { pathname } = useLocation();

  // Ko'p ishlatiladigan sahifalar brauzer bo'sh turganda oldindan yuklanadi —
  // menyudan bosilganda kutish bo'lmaydi.
  usePrefetchRoutes(isAuth);

  // Gorizontal scroll bo'ladigan istalgan konteynerni (dars jadvali, lidlar
  // doskasi, jadval o'ramlari...) sichqoncha bilan ushlab tortib scroll
  // qilish — butun ilova bo'ylab bitta joyda ulanadi.
  useGlobalDragScroll();

  return (
    <ChunkErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/*
           * Kanonik marshrut — backend endi shu manzilga qaytaradi:
           * `config('app.frontend_url').'/contract/'.$hash_link` (SMS
           * qisqa linki `/c/{short_code}` dan 302 orqali). Eski
           * `/contract/view/:hash` avvalgi versiya bilan moslik uchun
           * qoldirilgan.
           */}
          <Route path="/contract/:hash" element={<ContractConfirmPage />} />
          <Route path="/contract/view/:hash" element={<ContractConfirmPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          {/* To'lov cheki (QR kod): imzoli havola kirmasdan ochiladi — imzosiz havola kirishni so'raydi */}
          <Route path="/chek/:id" element={<ChekDownloadPage />} />
          <Route path="/login" element={isAuth ? <Navigate to="/" replace /> : <LoginPage />} />
  
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
  
              <Route element={<PermissionRoute permission="lids.view" />}>
                <Route path="/lids" element={<Lids />} />
              </Route>
  
              {/* <Route element={<PermissionRoute permission="payments.view" />}>
                <Route path="/payments" element={<Payments />} />
              </Route> */}
  
              {/* «Lidlar ro'yxati» sahifasi lidlar bilan ishlaydi (`fetchLids`), shuning
                uchun `students.view` emas, `lids.view` talab qilinadi — yon menyu ham
                shu ruxsatga qarab ko'rsatadi. */}
              <Route element={<PermissionRoute permission="lids.view" />}>
                <Route path="/registration" element={<Registration />} />
              </Route>
  
              {/* Yon menyu va mobil panel «Kurslar» havolasini `course_prices.view` bilan
                  ko'rsatadi, sahifaning o'zi ham `/course_prices` bilan ishlaydi —
                  marshrut ham shu ruxsatni qabul qilishi shart (aks holda havola
                  ko'rinadi-yu, bosilganda bosh sahifaga qaytarib yuboriladi). */}
              <Route element={<PermissionRoute anyOf={COURSES_PAGE_VIEW} />}>
                <Route path="/courses" element={<Courses />} />
                <Route path="/courses/price-list" element={<PriceListPage />} />
              </Route>
  
              {/* «Guruhlar» sahifasi `groups.view` («Sahifani ko'rish») bilan ochiladi. Sahifaning o'zi
                  ko'rinishni tanlaydi: `groups.create` bor — to'liq boshqaruv jadvali; yo'q (masalan
                  o'qituvchi) — faqat O'ZIGA biriktirilgan guruhlar kartalari (`pages/groups/index.tsx`).
                  Guruh a'zolari sahifasi — boshqaruv amali, `groups.edit` kerak. */}
              {/* <Route element={<PermissionRoute permission="groups.view" />}>
                <Route path="/groups" element={<Groups />} />
              </Route>
              <Route element={<PermissionRoute permission="groups.edit" />}>
                <Route path="/groups/:groupId/members" element={<GroupMembersPage />} />
              </Route> */}

              {/* «Dars jadvali» — faqat `lessons_schedules.view` (menyu, marshrut, bosh sahifa bir xil). Guruhlar
                  `groups.view` bo'lsa `/groups`, bo'lmasa `/options/groups` dan keladi. */}
              <Route element={<PermissionRoute anyOf={LESSON_SCHEDULE_VIEW} />}>
                <Route path="/lesson-schedule" element={<LessonSchedule />} />
              </Route>
  
              <Route element={<PermissionRoute permission="reports.view" />}>
                <Route path="/reports" element={<Reports />} />
              </Route>
  
              <Route element={<PermissionRoute permission="tasks.view" />}>
                <Route path="/tasks" element={<Tasks />} />
                {/* Siklogramma — «Vazifalar» bo'limida; backendda alohida ruxsat yo'q, `tasks.view` bilan ochiladi. */}
                <Route path="/cyclogram" element={<Cyclogram />} />
              </Route>
  
              {/* Menyu havolasi `.view` YOKI `.create` bilan chiqadi — marshrut ham shunday. */}
              <Route element={<PermissionRoute anyOf={STUDENT_ATTENDANCE_VIEW} />}>
                <Route path="/students-attendance" element={<StudentsAttendance />} />
              </Route>

              {/* Maktabga tayyorlov filial: kunlik davomat jurnali va ta'lim narxi */}
              <Route element={<PermissionRoute permission="preschool_attendances.view" />}>
                <Route path="/preschool-attendance" element={<PreschoolAttendance />} />
              </Route>
              <Route element={<PermissionRoute permission="preschool_prices.view" />}>
                <Route path="/preschool-prices" element={<PreschoolPrices />} />
              </Route>
              {/* Maktabga tayyorlov shartnomasi: ro'yxat va yaratish (`student_contracts.*` dan alohida ruxsat) */}
              <Route element={<PermissionRoute permission="preschool_contracts.view" />}>
                <Route path="/preschool-contracts" element={<PreschoolContracts />} />
              </Route>
              <Route element={<PermissionRoute permission="preschool_contracts.create" />}>
                <Route path="/preschool-contracts/new" element={<PreschoolContractCreate />} />
              </Route>
  
              <Route element={<PermissionRoute permission="lessons.view" />}>
                <Route path="/lessons" element={<Lessons />} />
              </Route>
  
              <Route element={<PermissionRoute anyOf={STAFF_ATTENDANCE_VIEW} />}>
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/attendance/:employeeId" element={<EmployeeAttendanceDetail />} />
              </Route>
  
              {/* Ro'yxat — `view`; forma va bitta shartnoma — o'z amali bilan (to'g'ridan-to'g'ri manzil orqali ham
                ruxsatsiz forma ochilmaydi: ilgari uchalasi ham `view` bilan ochilib, saqlashda «Ruxsat yo'q» chiqardi). */}
              <Route element={<PermissionRoute permission="employee_contracts.view" />}>
                <Route path="/contracts" element={<Contracts />} />
              </Route>
              <Route element={<PermissionRoute permission="employee_contracts.create" />}>
                <Route path="/contracts/create" element={<ContractsCreate />} />
              </Route>
              <Route element={<PermissionRoute permission="employee_contracts.show" />}>
                <Route path="/contracts/:id" element={<ContractDetailPage />} />
              </Route>
  
              {/* Ish haqi taqsimoti — ko'rish/yaratish/tahrirlashdan bittasi yetarli,
                «Saqlash» tugmasi sahifa ichida alohida tekshiriladi. */}
              <Route element={<PermissionRoute anyOf={PAYROLL_DISTRIBUTION_VIEW} />}>
                <Route path="/payroll/distributions/:employeeId" element={<PayrollDistribution />} />
              </Route>
  
              <Route element={<PermissionRoute permission="roles.view" />}>
                <Route path="/roles" element={<RoleManagement />} />
              </Route>
  
              <Route element={<PermissionRoute permission="users.view" />}>
                <Route path="/users" element={<Users />} />
              </Route>
  
              <Route element={<PermissionRoute permission="regions.view" />}>
                <Route path="/regions" element={<Regions />} />
              </Route>
  
              <Route element={<PermissionRoute permission="districts.view" />}>
                <Route path="/districts" element={<Districts />} />
              </Route>
  
              <Route element={<PermissionRoute permission="expenses.view" />}>
                <Route path="/expenses" element={<Expenses />} />
              </Route>
  
              <Route element={<PermissionRoute permission="tests.view" />}>
                <Route path="/test" element={<TestPage />} />
              </Route>
  
              {/* "Mening testlarim" — o'quvchi (test topshiruvchi) uchun. Rolдан
                  `exam_sessions.view` olib qo'yilса (masalan o'qituvchi rolida),
                  menyuдан ham, to'g'ridan-to'g'ri manzildan ham ochilmaydi. */}
              <Route element={<PermissionRoute permission="exam_sessions.view" />}>
                <Route path="/student-exams" element={<StudentExamsPage />} />
                <Route path="/student-exam/:sessionId" element={<StudentExamPage />} />
              </Route>
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/faq" element={<FaqPage />} />
  
              <Route path="/ip-telephone" element={<IPTelephone />} />
              {/* Menyu ham shu ruxsat bilan chiqadi — ilgari marshrut himoyasiz edi (manzil orqali ochilsa 403). */}
              <Route element={<PermissionRoute permission="demo_lessons.view" />}>
                <Route path="/demo-lesson" element={<DemoLesson />} />
              </Route>
  
              {/* Moliya — har bir sahifa yon menyudagi havola bilan bir xil ruxsat
                ro'yxatidan qo'riqlanadi (`utils/financePermissions`). */}
              <Route element={<PermissionRoute anyOf={FINANCE_ACCOUNTS_VIEW} />}>
                <Route path="/finances" element={<Finances />} />
              </Route>
              <Route element={<PermissionRoute anyOf={DEBTS_VIEW} />}>
                <Route path="/debts" element={<DebtsPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={DAILY_CASH_REPORTS_VIEW} />}>
                <Route path="/daily-cash-reports" element={<DailyCashReports />} />
              </Route>
              <Route element={<PermissionRoute anyOf={PAYROLL_ADJUSTMENTS_VIEW} />}>
                <Route path="/payroll-adjustments" element={<PayrollAdjustments />} />
                <Route path="/payroll-adjustments/:id" element={<AdjustmentForm />} />
              </Route>
              {/* Yaratish/tahrirlash alohida ruxsat talab qiladi — .view yetarli emas. */}
              <Route element={<PermissionRoute permission="payroll_adjustments.create" />}>
                <Route path="/payroll-adjustments/create" element={<AdjustmentForm />} />
              </Route>
              <Route element={<PermissionRoute permission="payroll_adjustments.edit" />}>
                <Route path="/payroll-adjustments/:id/edit" element={<AdjustmentForm />} />
              </Route>

              {/* Taqsimlangan oylikni direktor → bosh admin tasdiqlaydi. */}
              <Route element={<PermissionRoute anyOf={PAYROLL_DISTRIBUTION_REQUESTS_VIEW} />}>
                <Route path="/payroll-distribution-requests" element={<PayrollDistributionRequests />} />
              </Route>
  
              {/* Generatsiya va avans/oylik jadvallari — bitta `payroll_sheets.view`.
                Generatsiya tugmasi sahifa ichida `payroll_sheets.generate` bilan. */}
              <Route element={<PermissionRoute anyOf={PAYROLL_SHEETS_VIEW} />}>
                <Route path="/finance-generation" element={<FinanceGeneration />} />
                <Route path="/advance-schedule" element={<AdvanceSchedule />} />
                <Route path="/salary-schedule" element={<SalarySchedule />} />
              </Route>
              {/* Jarimalar sahifasida xodimga jarima kiritish/ko'rish — jarima
                turlarini boshqarish endi shu yerda emas, Ilmplyus Dashboardda. */}
              <Route element={<PermissionRoute anyOf={PENALTIES_VIEW} />}>
                <Route path="/penalties" element={<Penalties />} />
              </Route>
              <Route element={<PermissionRoute anyOf={FINANCIAL_PLANS_VIEW} />}>
                <Route path="/finance-plans" element={<FinancePlans />} />
              </Route>
              {/* Oy yakuni tahlili `/financial-plans/{id}/analysis` ga boradi —
                sahifaning o'zi ham shu ruxsatni tekshiradi. */}
              <Route element={<PermissionRoute anyOf={MONTH_END_ANALYSIS_VIEW} />}>
                <Route path="/month-end-analysis" element={<MonthEndAnalysis />} />
              </Route>
  
              {/* Ro'yxat — `view`, yangi shartnoma formalari — `create`, tahrirlash — `edit`, bitta shartnoma — `show`
                (Admin bilan bir xil). */}
              <Route element={<PermissionRoute permission="student_contracts.view" />}>
                <Route path="/students-contract" element={<StudentsContract />} />
              </Route>
              <Route element={<PermissionRoute permission="student_contracts.create" />}>
                <Route path="/students-contract/adult" element={<StudentsContract />} />
                <Route path="/students-contract/minor" element={<UnderAge />} />
                <Route path="/students-contract/legal_bilateral" element={<LegalEntity />} />
                <Route
                  path="/students-contract/legal_trilateral"
                  element={<RepresentativeEntity />}
                />
              </Route>
              <Route element={<PermissionRoute permission="student_contracts.edit" />}>
                <Route path="/students-contract/adult/edit/:id" element={<StudentsContract />} />
                <Route path="/students-contract/minor/edit/:id" element={<UnderAge />} />
                <Route path="/students-contract/legal_bilateral/edit/:id" element={<LegalEntity />} />
                <Route
                  path="/students-contract/legal_trilateral/edit/:id"
                  element={<RepresentativeEntity />}
                />
              </Route>
              <Route element={<PermissionRoute permission="student_contracts.show" />}>
                <Route path="/students-contract/:id" element={<ContractDetails />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
};

// Sinov build'i (`VITE_CONTRACTS_ONLY=1`): faqat xodim shartnomalari; to'liq ilova bundle'dan chiqib ketadi.
const App = import.meta.env.VITE_CONTRACTS_ONLY === '1' ? ContractsOnlyApp : FullApp;

export default App;
