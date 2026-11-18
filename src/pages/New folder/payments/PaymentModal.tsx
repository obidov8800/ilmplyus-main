import { formBranches, selectedFormBranch } from '@/utils/formBranches';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOptions, type Option } from '@/api/options';
import { formatSum } from '@/api/preschool';
import { fetchStudentMonths, suggestedPeriod } from '@/api/preschoolPayments';
import {
  MANUAL_ENTRY_METHODS,
  compareMethods,
  isUsableCommission,
  useBranchCommissions,
} from '@/api/commissions';
import { normalizePaymentMethod } from '@/utils/paymentMethod';
import { dateToIso } from '@/utils/date';
import { currentPeriod, normalizePaymentPeriod, periodLabel, periodOfDate } from '@/utils/paymentPeriod';
import { findStudentByAccount, normalizeAccount, toBranchCodes } from '@/utils/studentAccount';
import SearchSelect from '@/components/SearchSelect';
import type { Payment, SavePaymentPayload } from '@/types/payment.types';
import useAuthStore from '@/store/useAuthStore';

/** "Aliyev Karim Akmalovich" → "AK" (o'quvchi kartasidagi doira uchun). */
function initialsOf(name: string | undefined): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

interface PaymentModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (payload: SavePaymentPayload) => void;
  payment?: Payment | null;
  isSaving: boolean;
}

export default function PaymentModal({
  opened,
  onClose,
  onSave,
  payment,
  isSaving,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  const [amount, setAmount] = useState('');
  const [paymentTypeKey, setPaymentTypeKey] = useState('');
  const [studentId, setStudentId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [account, setAccount] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchChoice, setBranchChoice] = useState('');
  const { data: branchOptions } = useOptions('branches', undefined, { enabled: opened });
  const branches = useMemo(
    () => formBranches(user, branchOptions),
    [user, branchOptions],
  );
  const activeBranchId = useMemo(() => selectedFormBranch(branches, branchChoice), [branches, branchChoice]);

  // Tanlangan to'lov oyi (`YYYY-MM`). `null` — hali tanlanmagan: maktabga tayyorlovda eng eski qarzdor oy, qolganlarida joriy oy.
  const [periodChoice, setPeriodChoice] = useState<string | null>(null);

  // ── Fetch all students ──
  // GET /options/students: { id, label, student_code, balance, branch_id,
  //                          groups: [{id,label}], courses: [{id,label,group_id}] }
  const { data: studentRows = [], isLoading: studentsLoading } = useOptions('students', { branch_id: activeBranchId }, { enabled: opened && !!activeBranchId });

  // ── Fetch all groups ──
  const { data: groupsData } = useOptions('groups', { branch_id: activeBranchId }, { enabled: opened && !!activeBranchId });

  // `?? []` ni to'g'ridan-to'g'ri qoldirsak, har renderda yangi massiv bo'lib
  // quyidagi useMemo bekorga qayta hisoblanadi.
  const groups: Option[] = useMemo(() => activeBranchId ? (groupsData ?? []).filter((g) => g.branch_id == null || String(g.branch_id) === activeBranchId) : [], [groupsData, activeBranchId]);
  const studentsData = useMemo(() => activeBranchId ? studentRows.filter((s) => s.branch_id == null || String(s.branch_id) === activeBranchId) : [], [studentRows, activeBranchId]);

  // Tartib: AVVAL guruh, keyin shu guruhning o'quvchilari (guruh tanlanmaguncha o'quvchi ro'yxati bo'sh va o'chiq).
  // Istisno — o'quvchi hisob raqami bo'yicha topilgan bo'lsa (guruhi o'zi tanlanadi).
  // `groups` ni bermagan o'quvchi (backend maydonni yubormagan) filtrlanmaydi.
  const studentOptions = useMemo(
    () =>
      !groupId && !studentId
        ? []
        : studentsData
            .filter((s) => !groupId || s.groups == null || s.groups.some((g) => String(g.id) === groupId) || String(s.id) === studentId)
            .map((s) => ({ value: String(s.id), label: s.label })),
    [studentsData, groupId, studentId],
  );

  const selectedStudent = studentsData.find((s) => String(s.id) === studentId);

  // Maktabga tayyorlov (preschool) filial guruhi o'quv yiliga bog'langan (`academic_year_id`) va kursi bo'lmaydi.
  const isPreschoolGroup = groups.find((g) => String(g.id) === groupId)?.academic_year_id != null;

  // Maktabga tayyorlovda balans yo'q — har oy alohida: to'langan / oylik narx / qarz. Jurnal ruxsati bo'lmasa
  // so'rov xato beradi va panel chiqmaydi (summa cheklanmaydi, eski oy tanlovi qoladi).
  const monthsQuery = useQuery({
    // `payments` bilan boshlanadi — to'lov yaratilgach/tahrirlangach ro'yxat bilan birga qayta yuklanadi.
    queryKey: ['payments', 'preschool-months', groupId, studentId],
    queryFn: () => fetchStudentMonths(Number(groupId), Number(studentId)),
    enabled: opened && isPreschoolGroup && !!groupId && !!studentId,
    retry: false,
    staleTime: 0,
  });
  const monthsData = isPreschoolGroup ? monthsQuery.data : undefined;
  const period = periodChoice ?? suggestedPeriod(monthsData);
  const monthRow = monthsData?.months.find((m) => m.period === period);

  // O'quvchi tanlangan bo'lsa (select orqali yoki shaxsiy hisob raqami bo'yicha topilib),
  // guruh ro'yxati faqat o'shanikiga qisqaradi; tanlanmagan bo'lsa — hamma guruhlar.
  const groupOptions = useMemo(() => {
    const all = groups.map((g) => ({ value: String(g.id), label: g.label }));
    const studentGroups = selectedStudent?.groups;
    // `undefined` — backend maydonni umuman bermagan, filtrlashga asos yo'q.
    // `[]` — o'quvchi hech qaysi guruhda emas, demak ro'yxat ham bo'sh bo'lishi kerak.
    if (!selectedStudent || studentGroups == null) return all;

    const own = studentGroups.filter((g) => groups.some((option) => option.id === g.id)).map((g) => ({
      value: String(g.id),
      // O'quvchi ichidagi guruhda `label` bo'lmasa /options/groups dagi nomga tushamiz.
      label: g.label ?? all.find((o) => o.value === String(g.id))?.label ?? String(g.id),
    }));

    // Tahrirlashda saqlangan guruh o'quvchining joriy ro'yxatida bo'lmasligi mumkin
    // (guruhdan chiqarilgan) — uni qo'shmasak, select bo'sh ko'rinib qolardi.
    if (groupId && !own.some((o) => o.value === groupId)) {
      const current = all.find((o) => o.value === groupId);
      if (current) own.push(current);
    }
    return own;
  }, [groups, selectedStudent, groupId]);

  // Filial kodi: «Filial» tanlanishi bilan o'sha filialning kodi (`/options/branches` → `branch_code`) chiqadi —
  // o'quvchi tanlanmagan bo'lsa ham. O'quvchi tanlangach uning kodlari ustun (bir nechta bo'lsa tanlash mumkin).
  const selectedBranchCodes = useMemo(
    () => toBranchCodes(branches.find((b) => String(b.id) === activeBranchId)?.branch_code),
    [branches, activeBranchId],
  );
  const studentBranchCodes = useMemo(
    () => toBranchCodes(selectedStudent?.branch_code),
    [selectedStudent?.branch_code],
  );
  const branchCodes = studentBranchCodes.length > 0 ? studentBranchCodes : selectedBranchCodes;

  // `activeKey` dagi kabi: qo'lda tanlangan kod ro'yxatda bo'lmasa (o'quvchi almashdi) tanlangan filialning kodiga,
  // u ham bo'lmasa birinchisiga tushamiz — effekt orqali state yangilash shart emas.
  const activeBranchCode = branchCodes.includes(branchCode)
    ? branchCode
    : (branchCodes.find((code) => selectedBranchCodes.includes(code)) ?? branchCodes[0] ?? '');

  // Hisob raqami holati: bo'sh (yoki o'quvchilar hali yuklanmoqda) | o'quvchi topildi | topilmadi.
  const accountStatus: 'idle' | 'found' | 'missing' =
    !normalizeAccount(account) || !activeBranchId || studentsLoading
      ? 'idle'
      : selectedStudent
        ? 'found'
        : 'missing';
  // Kartada ko'rsatiladigan to'liq raqam: filial kodi + o'quvchi kodi (SMS'dagi «Shaxsiy hisobvaraq»).
  const fullAccount = selectedStudent?.student_code
    ? `${activeBranchCode ? `${activeBranchCode} ` : ''}${selectedStudent.student_code}`
    : '';

  // Maktabga tayyorlov o'quvchisida balans ko'rsatilmaydi (backend to'lovni balansga qo'shsa ham — oylik hisob yuritiladi).
  const studentBalance = isPreschoolGroup ? null : (selectedStudent?.balance ?? null);
  const lastPaymentDate = selectedStudent?.last_payment_date ?? null;

  // Tanlangan oy uchun ko'pi bilan to'lanadigan summa = oylik narx − shu oyda to'langan. Tahrirlanayotgan to'lovning
  // o'z summasi o'sha oy hisobida allaqachon bor — uni qaytarib qo'shamiz. `null` — narx yo'q, cheklov yo'q.
  const editedPeriod = payment
    ? (normalizePaymentPeriod(payment.payment_period) ??
      periodOfDate(String(payment.payment_date ?? payment.created_at ?? '')))
    : null;
  const ownAmount =
    payment && editedPeriod === period && String(payment.student_id) === studentId
      ? Number(payment.amount) || 0
      : 0;
  const monthLimit = monthRow && monthRow.debt !== null ? monthRow.debt + ownAmount : null;
  const monthFullyPaid = monthLimit !== null && monthLimit <= 0;
  const amountNumber = Number(amount) || 0;
  const overLimit = monthLimit !== null && amountNumber > monthLimit;

  // Tahrirlanayotgan yozuvning to'lov turi (bo'lsa) — ro'yxatdan tushib
  // qolmasligi uchun.
  const editingMethod = normalizePaymentMethod(
    payment?.payment_method ?? payment?.payment_type,
  );

  // ── To'lov turlari: filialga bog'liq ──
  // O'quvchi tanlanmaguncha operatorning o'z filiali bo'yicha ko'rsatamiz.
  const branchId = activeBranchId ? Number(activeBranchId) : null;

  const { data: commissionsData, isLoading: commissionsLoading } = useBranchCommissions(
    branchId,
    opened,
  );

  const paymentTypes = (commissionsData ?? [])
    .filter(isUsableCommission)
    // Qo'lda kiritishda faqat naqd, karta va bank o'tkazmasi ko'rsatiladi.
    // Filialning komissiya sozlamalarida Click/Payme/Paynet ham bo'lishi mumkin,
    // lekin ular onlayn to'lov shlyuzi orqali o'zi tushadi — xodim ularni qo'lda
    // kiritmaydi. Tahrirlashda esa yozuvning O'Z turi ro'yxatda qoldiriladi,
    // aks holda eski (masalan Paynet) to'lov saqlanganda turi jimgina
    // o'zgarib ketardi.
    .filter(
      (c) =>
        MANUAL_ENTRY_METHODS.includes(c.payment_method) ||
        c.payment_method === editingMethod,
    )
    .sort((a, b) => compareMethods(a.payment_method, b.payment_method))
    .map((c) => ({
      key: c.payment_method,
      label: t(`payments.paymentTypes.${c.payment_method}`, { defaultValue: c.payment_method }),
      percent: Number(c.commission_percent) || 0,
    }));

  // Tanlangan tur filialning ro'yxatida bo'lmasa (filial almashdi yoki eski yozuvda
  // "Naqd" kabi tarjima saqlangan) — mos kelganiga, topilmasa birinchisiga tushamiz.
  const activeKey =
    paymentTypes.find((pt) => pt.key === paymentTypeKey)?.key ??
    paymentTypes.find((pt) => pt.label === paymentTypeKey)?.key ??
    paymentTypes[0]?.key ??
    '';

  // const selectedType = paymentTypes.find((pt) => pt.key === activeKey);
  // const commissionAmount = selectedType ? (Number(amount) || 0) * (selectedType.percent / 100) : 0;

  useEffect(() => {
    if (!opened) return;
    if (payment) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBranchChoice(String(payment.branch_id ?? payment.student?.branch_id ?? ''));
      setAmount(String(payment.amount));
      // Eski yozuvlarda `payment_method` matn ("Naqd", "Paynet") bo'lishi mumkin.
      setPaymentTypeKey(normalizePaymentMethod(payment.payment_method ?? payment.payment_type));
      setStudentId(String(payment.student_id));
      setGroupId(payment.group_id ? String(payment.group_id) : '');
      setAccount(payment.student?.student_code ?? '');
      setBranchCode(toBranchCodes(payment.branch?.branch_code)[0] ?? '');
      setPeriodChoice(
        normalizePaymentPeriod(payment.payment_period) ??
          periodOfDate(String(payment.payment_date ?? payment.created_at ?? '')),
      );
    } else {
      setBranchChoice('');
      setAmount('');
      setPaymentTypeKey('');
      setStudentId('');
      setGroupId('');
      setAccount('');
      setBranchCode('');
      setPeriodChoice(null);
    }
  }, [payment, opened]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranchId || !selectedStudent || !studentId || !amount || !activeKey) return;
    // Oylik narxdan oshiq (yoki to'liq to'langan oyga) to'lov qabul qilinmaydi.
    if (overLimit || monthFullyPaid || (groupId && !groupOptions.some((g) => g.value === groupId))) return;

    // Guruh nomi: avval /options/groups dan, topilmasa o'quvchining o'z guruhidan.
    const groupFromList = groups.find((g) => String(g.id) === groupId);
    const groupFromStudent = selectedStudent?.groups?.find((g) => String(g.id) === groupId);

    const groupName = groupFromList?.label ?? groupFromStudent?.label;
    // /options/students kurslarni `group_id` bilan beradi — guruh bo'yicha topamiz.
    const courseId =
      groupFromList?.course_id ??
      selectedStudent?.courses?.find((c) => String(c.group_id) === groupId)?.id;
    // O'qituvchi faqat /options/groups da bor.
    const teacherId = groupFromList?.teacher_id;

    const fullName = selectedStudent?.label;

    onSave({
      amount: Number(amount),
      payment_method: activeKey,
      student_id: Number(studentId),
      // `toISOString()` emas: u UTC beradi va UTC+5 da yarim tundan 05:00 gacha
      // qo'shilgan to'lov kechagi sana bo'lib ketardi. `dateToIso` — mahalliy sana.
      payment_date: dateToIso(new Date()),
      group_id: groupId ? Number(groupId) : undefined,
      group: groupName,
      full_name: fullName || undefined,
      branch_id: Number(activeBranchId),
      course_id: courseId,
      teacher_id: teacherId,
      user_id: user?.id,
      // Yangi to'lovda doim yuboriladi (`YYYY-MM`); mavjud oddiy to'lovning davri tahrirda o'zgartirilmaydi.
      payment_period: isPreschoolGroup || !payment ? period : undefined,
    });
  };

  // O'quvchi yoki guruh almashsa, oy qayta tanlanadi (yangi o'quvchining eng eski qarzdor oyi taklif qilinadi).
  const handleGroupChange = (id: string) => {
    setGroupId(id);
    setPeriodChoice(null);
    // Tanlangan o'quvchi yangi guruhda bo'lmasa — tozalanadi (boshqa guruh o'quvchisiga to'lov yozilib ketmasin).
    const current = studentsData.find((s) => String(s.id) === studentId);
    if (current && id && current.groups != null && !current.groups.some((g) => String(g.id) === id)) {
      setStudentId('');
      setAccount('');
    }
  };

  // O'quvchi tanlanganda guruh: avval tanlangan guruh o'quvchiniki bo'lsa u qoladi (guruh orqali topilgan o'quvchi
  // boshqa guruhiga o'tib ketmasin), bo'lmasa — o'quvchining birinchi guruhi.
  const groupForStudent = (student: (typeof studentsData)[number]): string => {
    const own = (student.groups ?? []).filter((g) => groups.some((option) => option.id === g.id));
    const keep = own.find((g) => String(g.id) === groupId);
    const next = keep ?? own[0];
    return next ? String(next.id) : '';
  };

  const handleStudentChange = (id: string) => {
    setStudentId(id);
    setPeriodChoice(null);
    const student = studentsData.find((s) => String(s.id) === id);
    if (student) {
      setAccount(student.student_code ?? '');
      setGroupId(groupForStudent(student));
    } else {
      // O'quvchi tozalansa guruh qoladi: kassir shu guruhdan boshqa o'quvchini tanlay oladi.
      setAccount('');
    }
  };

  // Hisob raqami IXTIYORIY: bo'sh qoldirilsa o'quvchi ro'yxatdan tanlanadi. Raqam kiritilsa (faqat o'quvchi kodi
  // yoki filial kodi bilan to'liq raqam) mos o'quvchi o'zi tanlanadi. Mos kelmasa o'quvchi tanlovi tozalanadi —
  // aks holda maydonda boshqa raqam, saqlanadigan to'lov esa avval tanlangan o'quvchiga tegishli bo'lib qolardi.
  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const match = findStudentByAccount(studentsData, raw);
    setPeriodChoice(null);
    if (match) {
      const { student } = match;
      // To'liq raqam kiritilgan bo'lsa maydonda faqat o'quvchi kodi qoladi — filial kodi chapdagi katakda.
      setAccount(match.branchCode ? String(student.student_code ?? '') : raw);
      if (match.branchCode) setBranchCode(match.branchCode);
      setStudentId(String(student.id));
      setGroupId(groupForStudent(student));
    } else {
      setAccount(raw);
      setStudentId('');
      setGroupId('');
    }
  };

  if (!opened) return null;

  return (
    <div className="payment-modal-overlay" onClick={onClose}>
      <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="payment-modal-header">
          <span className="payment-modal-title">{t('payments.modal.title')}</span>
          <button className="payment-modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="payment-modal-body">
            <div className="payment-form-grid">
              {branches.length > 1 && <div className="form-group form-group-full">
                <label className="form-label" htmlFor="payment-branch">{t('expenses.branch')}</label>
                <select id="payment-branch" className="form-select" value={activeBranchId} required onChange={(e) => {
                  setBranchChoice(e.target.value); setStudentId(''); setGroupId(''); setAccount('');
                  setBranchCode(''); setPaymentTypeKey(''); setPeriodChoice(null);
                }}>
                  <option value="">{t('expenses.choose')}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>}

              {/* O'quvchi hisob raqami — IXTIYORIY: filial kodi (o'quvchidan avtomatik) + o'quvchi kodi */}
              <div className="form-group">
                <label className="form-label payment-label-row" htmlFor="payment-account">
                  <span>{t('payments.modal.account')}</span>
                  <span className="payment-optional">{t('payments.modal.optional')}</span>
                </label>

                <div className={`account-field${accountStatus === 'found' ? ' account-field--found' : ''}${accountStatus === 'missing' ? ' account-field--missing' : ''}`}>
                  {branchCodes.length > 1 ? (
                    <select
                      className="form-select account-field__branch"
                      value={activeBranchCode}
                      onChange={(e) => setBranchCode(e.target.value)}
                      aria-label={t('payments.modal.branchCode')}
                    >
                      {branchCodes.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  ) : (
                    // Bitta yoki umuman kod bo'lmasa tanlashga hojat yo'q — faqat ko'rsatamiz.
                    <input
                      className="form-input account-field__branch"
                      value={activeBranchCode}
                      readOnly
                      tabIndex={-1}
                      placeholder="0000"
                      aria-label={t('payments.modal.branchCode')}
                    />
                  )}

                  <input
                    id="payment-account"
                    className="form-input account-field__code"
                    value={account}
                    onChange={handleAccountChange}
                    placeholder={t('payments.modal.accountPlaceholder')}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <span
                  className={`payment-account-hint payment-account-hint--${accountStatus}`}
                  role={accountStatus === 'missing' ? 'alert' : undefined}
                >
                  {accountStatus === 'found'
                    ? t('payments.modal.accountFound')
                    : accountStatus === 'missing'
                      ? t('payments.modal.accountMissing')
                      : t('payments.modal.accountHint')}
                </span>
              </div>

              {/* Guruh */}
              <div className="form-group">
                <label className="form-label">{t('payments.modal.group')}</label>
                <SearchSelect
                  value={groupId}
                  onChange={handleGroupChange}
                  options={groupOptions}
                  placeholder={t('payments.modal.selectGroup')}
                />
                {/* Hisob raqamini bilmagan kassir uchun yo'l: avval guruh, keyin o'quvchi */}
                {!studentId && (
                  <span className="payment-account-hint">
                    {!groupId
                      ? t('payments.modal.groupHint')
                      : studentOptions.length > 0
                        ? t('payments.modal.groupStudentsCount', { count: studentOptions.length })
                        : t('payments.modal.groupNoStudents')}
                  </span>
                )}
              </div>

              {/* O'quvchi */}
              <div className="form-group">
                <label className="form-label">{t('payments.modal.student')}</label>
                <SearchSelect
                  value={studentId}
                  onChange={handleStudentChange}
                  options={studentOptions}
                  disabled={!groupId && !studentId}
                  placeholder={
                    !groupId && !studentId ? t('payments.modal.selectGroupFirst') : t('payments.modal.selectStudent')
                  }
                />
              </div>

              {/* Summasi */}
              <div className="form-group">
                <label className="form-label payment-label-row" htmlFor="payment-amount">
                  <span>{t('payments.modal.amount')}</span>
                  {amountNumber > 0 && <span className="payment-amount-readout">{formatSum(amountNumber)}</span>}
                </label>
                <div className="payment-amount-wrap">
                  <input
                    id="payment-amount"
                    className={`form-input${overLimit ? ' payment-amount-invalid' : ''}`}
                    type="number"
                    min="0"
                    max={monthLimit !== null ? monthLimit : undefined}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    required
                  />
                  <span className="payment-amount-suffix">{t('payments.modal.currency')}</span>
                </div>
                {monthLimit !== null && monthLimit > 0 && (
                  <div className="payment-amount-hint">
                    <span>
                      {t('payments.modal.maxAmount', { sum: formatSum(monthLimit) })}
                    </span>
                    <button
                      type="button"
                      className="payment-amount-fill"
                      onClick={() => setAmount(String(monthLimit))}
                    >
                      {t('payments.modal.payRemaining')}
                    </button>
                  </div>
                )}
                {overLimit && (
                  <span className="payment-amount-error" role="alert">
                    {monthFullyPaid
                      ? t('payments.modal.monthFullyPaid')
                      : t('payments.modal.overLimit', { sum: formatSum(monthLimit) })}
                  </span>
                )}
              </div>
              {/* Tanlangan o'quvchi kartasi: kim, hisob raqami, balans, oxirgi to'lov */}
              {selectedStudent && (
                <div className="payment-student-card">
                  <span className="payment-student-avatar" aria-hidden="true">
                    {initialsOf(selectedStudent.label)}
                  </span>
                  <div className="payment-student-main">
                    <span className="payment-student-name">{selectedStudent.label}</span>
                    {fullAccount && (
                      <span className="payment-student-account">
                        {t('payments.modal.cardAccount')}: <b>{fullAccount}</b>
                      </span>
                    )}
                  </div>
                  {(lastPaymentDate !== null || studentBalance !== null) && (
                    <div className="payment-student-stats">
                      {studentBalance !== null && (
                        <div className="payment-info-item">
                          <span className="info-label">{t('payments.modal.balance')}</span>
                          <span className={`info-value ${Number(studentBalance) < 0 ? 'red' : 'green'}`}>
                            {formatSum(studentBalance)} {t('payments.modal.currency')}
                          </span>
                        </div>
                      )}
                      {lastPaymentDate && (
                        <div className="payment-info-item">
                          <span className="info-label">{t('payments.modal.lastPaymentDate')}</span>
                          <span className="info-value">{lastPaymentDate}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* To'lov oyi — faqat maktabga tayyorlov filial guruhi uchun */}
            {isPreschoolGroup && (
              <div className="form-group payment-period-field">
                <label className="form-label" htmlFor="payment-period">
                  {t('payments.modal.period')}
                </label>
                {monthsData && monthsData.months.length > 0 ? (
                  <select
                    id="payment-period"
                    className="form-select"
                    value={period}
                    onChange={(e) => setPeriodChoice(e.target.value)}
                  >
                    {/* Tahrirlanayotgan to'lovning oyi ro'yxatda bo'lmasa ham tanlov bo'sh qolmasin */}
                    {!monthRow && <option value={period}>{periodLabel(period, t)}</option>}
                    {monthsData.months.map((m) => (
                      <option key={m.period} value={m.period}>
                        {m.debt === null
                          ? t('payments.modal.optionNoPrice', { month: periodLabel(m.period, t) })
                          : m.debt === 0
                            ? t('payments.modal.optionPaid', { month: periodLabel(m.period, t) })
                            : t(m.advance ? 'payments.modal.optionAdvance' : 'payments.modal.optionDebt', {
                                month: periodLabel(m.period, t),
                                sum: formatSum(m.debt),
                              })}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="payment-period"
                    className="form-input"
                    type="month"
                    value={period}
                    onChange={(e) => setPeriodChoice(e.target.value || currentPeriod())}
                  />
                )}
                <span className="payment-period-hint">
                  {monthsData ? t('payments.modal.periodHintMonthly') : t('payments.modal.periodHint')}
                </span>
              </div>
            )}

            {/* Maktabga tayyorlov: balans o'rniga tanlangan oy va jami qarz */}
            {isPreschoolGroup && monthsQuery.isLoading && (
              <div className="payment-month-panel payment-month-panel--muted">
                {t('payments.modal.monthsLoading')}
              </div>
            )}
            {isPreschoolGroup && monthsData && (
              <div className="payment-month-panel">
                {monthRow && (
                  <>
                    <div className="payment-month-row">
                      <span className="info-label">{t('payments.modal.monthlyPrice')}</span>
                      <span className="info-value">
                        {monthRow.expected !== null
                          ? `${formatSum(monthRow.expected)} ${t('payments.modal.currency')}`
                          : '—'}
                      </span>
                    </div>
                    <div className="payment-month-row">
                      <span className="info-label">{t('payments.modal.monthPaid')}</span>
                      <span className="info-value">
                        {formatSum(monthRow.paid)} {t('payments.modal.currency')}
                      </span>
                    </div>
                    {monthRow.debt !== null && (
                      <div className="payment-month-row">
                        <span className="info-label">{t('payments.modal.monthRemaining')}</span>
                        <span className={`info-value ${monthRow.debt > 0 ? 'red' : 'green'}`}>
                          {formatSum(monthRow.debt)} {t('payments.modal.currency')}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="payment-month-row payment-month-row--total">
                  <span className="info-label">{t('payments.modal.totalDebt')}</span>
                  {monthsData.totalDebt > 0 ? (
                    <span className="info-value red">
                      {formatSum(monthsData.totalDebt)} {t('payments.modal.currency')} (
                      {t('payments.modal.debtMonths', { count: monthsData.debtMonths })})
                    </span>
                  ) : (
                    <span className="info-value green">{t('payments.modal.noDebt')}</span>
                  )}
                </div>
                {monthFullyPaid && !overLimit && (
                  <div className="payment-month-note payment-month-note--ok">
                    {t('payments.modal.monthFullyPaid')}
                  </div>
                )}
                {monthRow && monthRow.expected === null && (
                  <div className="payment-month-note">{t('payments.modal.noMonthPrice')}</div>
                )}
              </div>
            )}

            {/* To'lov turi */}
            <div className="payment-type-row">
              <span className="payment-type-label">{t('payments.modal.paymentType')}</span>
              {commissionsLoading ? (
                <div className="payment-type-empty">{t('payments.modal.loading')}</div>
              ) : paymentTypes.length === 0 ? (
                <div className="payment-type-empty">{t('payments.modal.noPaymentTypes')}</div>
              ) : (
                <div className="payment-type-tabs">
                  {paymentTypes.map((type) => (
                    <button
                      key={type.key}
                      type="button"
                      className={`payment-type-tab${activeKey === type.key ? ' active' : ''}`}
                      onClick={() => setPaymentTypeKey(type.key)}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              )}

              {/* {commissionAmount > 0 && (
                <div className="payment-type-commission">
                  {t('payments.modal.commission')}:{' '}
                  <b>
                    {Math.round(commissionAmount).toLocaleString()} {t('payments.modal.currency')}
                  </b>
                </div>
              )} */}
            </div>
          </div>

          {/* Buttons */}
          <div className="payment-modal-footer">
            <button
              type="submit"
              className="modal-btn-save"
              disabled={isSaving || !activeBranchId || !selectedStudent || !activeKey || !studentId || overLimit || monthFullyPaid}
            >
              {isSaving ? t('payments.modal.saving') : t('payments.modal.save')}
            </button>
            <button type="button" className="modal-btn-cancel" onClick={onClose}>
              {t('payments.modal.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
