import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import '../students-contract/studentsContracts.css';
import './preschoolContract.css';
import DateInput from '@/components/DateInput';
import PhoneInput from '@/components/PhoneInput';
import { formatPhone } from '@/utils/phone';
import { notifyError } from '@/utils/notify';
import { contractMonths } from '@/utils/preschoolContractView';
import { useOptions, optionLabel, type Option } from '@/api/options';
import { createPreschoolContract, fetchContractMonthlyPrice, isValidContractPhone } from '@/api/preschoolContracts';
import { applyPersonMatch, lookupPersonByJshshir } from '../students-contract/jshshirLookup';
import {
  CONTRACT_CITIZENSHIPS,
  CONTRACT_LANGUAGES,
  REPRESENTATIVE_TYPES,
  STUDENT_GENDERS,
  emptyPreschoolContractForm,
  emptyRepresentative,
  type PreschoolContractForm,
  type PreschoolRepresentativeForm,
} from '@/types/preschoolContract.types';

/*
 * Maktabga tayyorlov shartnomasini yaratish. Ko'rinishi va tartibi kurs shartnomasining «Vakil bilan» (voyaga yetmagan)
 * varianti bilan bir xil — 1-qadam: vakil (ota-ona), 2-qadam: bola + shartnoma. Farqi: ariza (lid) yo'q (bola shartnomaning
 * o'zi bilan yaratiladi), kurs/daraja yo'q — o'rniga filial, o'quv yili va maktabga tayyorlov guruhi («Sinf»).
 * `sc-*` klasslari (`pages/students-contract/studentsContracts.css`) har ilovaning o'z uslubida chiqadi.
 * Admin va User ilovalarida bir xil fayl.
 */

const NO_OPTIONS: Option[] = [];

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayIso = () => isoOf(new Date());
const yesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoOf(d);
};

const formatSum = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;

/** Axios xatosidan birinchi tushunarli xabar: `errors` ichidagi birinchi qator, bo'lmasa `message`. */
function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string; error?: string; errors?: Record<string, string[]> } } })
    ?.response?.data;
  const first = data?.errors ? Object.values(data.errors).flat()[0] : undefined;
  return first || data?.message || data?.error || fallback;
}

const REP_TYPE_KEYS: Record<string, string> = {
  Ota: 'repTypeFather',
  Ona: 'repTypeMother',
  Vasiy: 'repTypeGuardian',
  Boshqa: 'repTypeOther',
};

/** Matn maydonlari (vakil kartasi): qiymat kiritilganda tozalanadi. */
type RepTextField =
  | 'jshshir'
  | 'birth_date'
  | 'passport_series'
  | 'passport_number'
  | 'passport_given_date'
  | 'passport_expiry_date'
  | 'passport_given_by'
  | 'last_name'
  | 'first_name'
  | 'father_name'
  | 'registered_address'
  | 'residential_address';

interface JshState {
  state: 'loading' | 'found' | 'none';
  name: string;
}

interface Props {
  /**
   * Amal tugmalari ko'rinishi: `user` — `sc-form-*` klasslari (User uslubi), `admin` — Admin'dagi kurs shartnomasi kabi
   * inline uslub (to'q sariq «Keyingisi/Saqlash», kulrang «Bekor qilish»).
   */
  variant?: 'user' | 'admin';
}

export default function PreschoolContractForm({ variant = 'user' }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<PreschoolContractForm>(() => emptyPreschoolContractForm(todayIso()));
  const [showErrors, setShowErrors] = useState(false);
  const [jsh, setJsh] = useState<Record<number, JshState>>({});
  const latestJsh = useRef<Record<number, string>>({});

  const set = <K extends keyof PreschoolContractForm>(key: K, value: PreschoolContractForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const L = (key: string, params?: Record<string, unknown>) => t(`preschoolContracts.form.${key}`, params);
  const SL = (key: string) => t(`studentsContract.form.${key}`);

  const { data: branches = NO_OPTIONS } = useOptions('branches', { type: 'preschool' });
  const { data: years = NO_OPTIONS } = useOptions('academic_years');
  const { data: activeYears = NO_OPTIONS } = useOptions('academic_years', { status: 'active' });

  // Tanlanmagan bo'lsa — faol o'quv yili (forma qiymati yozilmaydi, faqat ko'rsatiladi va yuboriladi)
  const yearId = form.academic_year_id || (activeYears[0] ? String(activeYears[0].id) : '');
  const branchId = form.branch_id;
  const year = years.find((y) => String(y.id) === yearId);
  const branch = branches.find((b) => String(b.id) === branchId);

  const { data: groups = NO_OPTIONS } = useOptions(
    'groups',
    { academic_year_id: yearId, branch_id: branchId },
    { enabled: !!yearId && !!branchId },
  );
  const preschoolGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          g.academic_year_id != null &&
          (!yearId || String(g.academic_year_id) === yearId) &&
          (!branchId || g.branch_id == null || String(g.branch_id) === branchId),
      ),
    [groups, yearId, branchId],
  );

  const { data: price } = useQuery({
    queryKey: ['preschool-contract-price', yearId, branchId],
    queryFn: () => fetchContractMonthlyPrice(Number(yearId), branchId ? Number(branchId) : null),
    enabled: !!yearId && !!branchId,
    staleTime: 60_000,
  });

  // Sanalar: kiritilmagan bo'lsa — mantiqiy boshlang'ich qiymat (o'quv yili oxiri / shartnoma sanasi)
  const endDate = form.end_date || (year?.end_date ?? '');
  const studyStart = form.study_start_date || form.contract_date;
  const firstPayment = form.first_payment_date || studyStart;
  const months = contractMonths(studyStart, endDate);
  const total = price != null && months > 0 ? price * months : null;

  // ── Vakil (ota-ona) ──
  const patchRep = (key: number, patch: Partial<PreschoolRepresentativeForm>) =>
    setForm((prev) => ({
      ...prev,
      representatives: prev.representatives.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));

  /** JSHSHIR to'liq (14 raqam) kiritilganda bazadan odamni topib, mavjud ma'lumotlarini to'ldiradi. */
  const autofillRep = async (key: number, jshshir: string) => {
    latestJsh.current[key] = jshshir;
    setJsh((prev) => ({ ...prev, [key]: { state: 'loading', name: '' } }));
    let match: Awaited<ReturnType<typeof lookupPersonByJshshir>> = null;
    try {
      match = await lookupPersonByJshshir(jshshir);
    } catch {
      if (latestJsh.current[key] === jshshir) {
        setJsh((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
      return;
    }
    if (latestJsh.current[key] !== jshshir) return;
    if (!match) {
      setJsh((prev) => ({ ...prev, [key]: { state: 'none', name: '' } }));
      return;
    }
    const found = match;
    setForm((prev) => ({
      ...prev,
      representatives: prev.representatives.map((r) =>
        r.key === key && r.jshshir === jshshir ? applyPersonMatch(r, found) : r,
      ),
    }));
    setJsh((prev) => ({ ...prev, [key]: { state: 'found', name: found.displayName } }));
  };

  const changeRep = (key: number, field: RepTextField, value: string) => {
    let v = value;
    if (field === 'passport_series') v = value.toUpperCase().slice(0, 2);
    if (field === 'passport_number') v = value.replace(/\D/g, '').slice(0, 7);
    if (field === 'jshshir') v = value.replace(/\D/g, '').slice(0, 14);
    patchRep(key, { [field]: v });

    if (field === 'jshshir') {
      if (v.length === 14) {
        void autofillRep(key, v);
      } else {
        latestJsh.current[key] = v;
        setJsh((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  };

  const setRepPhone = (key: number, idx: number, value: string) =>
    setForm((prev) => ({
      ...prev,
      representatives: prev.representatives.map((r) =>
        r.key === key ? { ...r, phones: r.phones.map((p, i) => (i === idx ? formatPhone(value) : p)) } : r,
      ),
    }));

  const addRepPhone = (key: number) =>
    setForm((prev) => ({
      ...prev,
      representatives: prev.representatives.map((r) => (r.key === key ? { ...r, phones: [...r.phones, '+998'] } : r)),
    }));

  const removeRepPhone = (key: number, idx: number) =>
    setForm((prev) => ({
      ...prev,
      representatives: prev.representatives.map((r) =>
        r.key === key ? { ...r, phones: r.phones.filter((_, i) => i !== idx) } : r,
      ),
    }));

  const addRep = () =>
    setForm((prev) => ({
      ...prev,
      // Yangi vakil turi: hali ishlatilmagan birinchi tur (Ota → Ona → Vasiy), hammasi band bo'lsa «Boshqa»
      representatives: [
        ...prev.representatives,
        emptyRepresentative(
          REPRESENTATIVE_TYPES.find((type) => !prev.representatives.some((r) => r.representative_type === type)) ??
            'Boshqa',
        ),
      ],
    }));

  const removeRep = (key: number) =>
    setForm((prev) => ({ ...prev, representatives: prev.representatives.filter((r) => r.key !== key) }));

  // ── Majburiy maydonlar ──
  const effective: PreschoolContractForm = {
    ...form,
    academic_year_id: yearId,
    end_date: endDate,
    study_start_date: studyStart,
    first_payment_date: firstPayment,
  };

  type Issue = { key: string; label: string };

  const repMissing: Issue[] = [];
  const repBad = new Set<string>();
  form.representatives.forEach((r, i) => {
    const n = i + 1;
    const prefix = form.representatives.length > 1 ? `${L('repNo', { n })}: ` : '';
    if (!r.last_name.trim()) repMissing.push({ key: `rep${n}_last`, label: prefix + SL('lastName') });
    if (!r.first_name.trim()) repMissing.push({ key: `rep${n}_first`, label: prefix + SL('firstName') });
    const first = r.phones[0] ?? '';
    if (formatPhone(first) === '+998') repMissing.push({ key: `rep${n}_phone0`, label: prefix + SL('phone') });
    r.phones.forEach((p, pi) => {
      if (formatPhone(p) !== '+998' && !isValidContractPhone(p)) repBad.add(`rep${n}_phone${pi}`);
    });
  });

  const childMissing: Issue[] = [];
  const need = (key: string, value: string, label: string) => {
    if (!value || !value.trim()) childMissing.push({ key, label });
  };
  need('branch', effective.branch_id, L('branch'));
  need('year', effective.academic_year_id, L('academicYear'));
  need('group', effective.group_id, L('group'));
  need('last_name', effective.last_name, SL('lastName'));
  need('first_name', effective.first_name, SL('firstName'));
  need('father_name', effective.father_name, SL('fatherName'));
  need('birth_date', effective.birth_date, SL('birthDate'));
  need('birth_place', effective.birth_place, SL('birthPlace'));
  need('gender', effective.gender, L('gender'));
  need('address', effective.residential_address, L('address'));
  need('cert_series', effective.birth_cert_series, SL('passport'));
  need('cert_number', effective.birth_cert_number, SL('passport'));
  need('contract_date', effective.contract_date, L('contractDate'));
  need('end_date', effective.end_date, L('endDate'));
  need('study_start', effective.study_start_date, L('studyStart'));
  need('first_payment', effective.first_payment_date, L('firstPayment'));

  const childBad = new Set<string>();
  if (formatPhone(form.phone) !== '+998' && !isValidContractPhone(form.phone)) childBad.add('phone');

  // Sana qoidalari backend bilan bir xil: tug'ilgan sana — o'tgan kun, tugash ≥ shartnoma sanasi, o'qish boshlanishi ≤ tugash
  const dateIssues: { key: string; message: string }[] = [];
  if (effective.birth_date && effective.birth_date > yesterdayIso()) {
    dateIssues.push({ key: 'birth_date', message: L('birthDateFuture') });
  }
  if (effective.end_date && effective.contract_date && effective.end_date < effective.contract_date) {
    dateIssues.push({ key: 'end_date', message: L('endBeforeContract') });
  }
  if (effective.study_start_date && effective.end_date && effective.study_start_date > effective.end_date) {
    dateIssues.push({ key: 'study_start', message: L('studyAfterEnd') });
  }

  const flagged = new Set<string>([
    ...repMissing.map((m) => m.key),
    ...repBad,
    ...childMissing.map((m) => m.key),
    ...childBad,
    ...dateIssues.map((d) => d.key),
  ]);
  const bad = (key: string) => (showErrors && flagged.has(key) ? ' psc-invalid' : '');

  const unique = (items: Issue[]) => [...new Set(items.map((m) => m.label))].join(', ');

  const repProblem = (): string | null => {
    if (repMissing.length > 0) return L('required', { fields: unique(repMissing) });
    if (repBad.size > 0) return L('invalidPhone');
    return null;
  };

  const childProblem = (): string | null => {
    if (childMissing.length > 0) return L('required', { fields: unique(childMissing) });
    if (childBad.size > 0) return L('invalidPhone');
    if (dateIssues.length > 0) return dateIssues[0].message;
    return null;
  };

  const createMutation = useMutation({
    mutationFn: () => createPreschoolContract(effective),
    onSuccess: (created) =>
      navigate('/preschool-contracts', { state: { created: created.contract_number ?? String(created.contract_id) } }),
    onError: (error) => notifyError(errorMessage(error, L('errorGeneric'))),
  });

  // Xabarlar sahifa ichidagi blok emas — ekranning o'ng tepasidagi bildirishnoma (`utils/notify.ts`) orqali chiqadi.
  const goNext = () => {
    const problem = repProblem();
    if (problem) {
      setShowErrors(true);
      notifyError(problem);
      return;
    }
    setShowErrors(false);
    setStep(2);
  };

  const goStep = (target: 1 | 2) => {
    if (target === 1) {
      setStep(1);
    } else {
      goNext();
    }
  };

  const submit = () => {
    const repIssue = repProblem();
    if (repIssue) {
      setShowErrors(true);
      notifyError(repIssue);
      setStep(1);
      return;
    }
    const childIssue = childProblem();
    if (childIssue) {
      setShowErrors(true);
      notifyError(childIssue);
      return;
    }
    createMutation.mutate();
  };

  const goBack = () => navigate('/preschool-contracts');

  const admin = variant === 'admin';
  const adminBtn = (kind: 'primary' | 'outline' | 'cancel') =>
    admin
      ? {
          padding: '10px 24px',
          borderRadius: '8px',
          border: kind === 'primary' ? 'none' : kind === 'outline' ? '1px solid #FE9100' : '1px solid #e2e8f0',
          background: kind === 'primary' ? '#FE9100' : '#fff',
          color: kind === 'primary' ? '#fff' : kind === 'outline' ? '#FE9100' : '#64748b',
          cursor: 'pointer',
          fontWeight: '500',
        }
      : undefined;

  const nextButton = (
    <button type="button" className="sc-form-next-btn" style={adminBtn('primary')} onClick={goNext}>
      {t('studentsContract.minor.next')}
    </button>
  );
  const cancelButton = (
    <button type="button" className="sc-form-cancel-btn" style={adminBtn('cancel')} onClick={goBack}>
      {SL('cancel')}
    </button>
  );
  const prevButton = (
    <button type="button" className="sc-form-prev-btn" style={adminBtn('outline')} onClick={() => goStep(1)}>
      {t('studentsContract.minor.prev')}
    </button>
  );
  const saveButton = (
    <button
      type="button"
      className="sc-form-save-btn"
      style={adminBtn('primary')}
      onClick={submit}
      disabled={createMutation.isPending}
    >
      {createMutation.isPending ? SL('saving') : SL('save')}
    </button>
  );

  const stepBarItem = (target: 1 | 2) => (
    <div
      className={`sc-step-item ${step === target ? 'active' : ''}`}
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '14px',
        cursor: 'pointer',
        background: step === target ? '#003366' : '#5d7ca4',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '14px',
        textTransform: 'uppercase',
        borderRight: target === 1 ? '1px solid rgba(255,255,255,0.1)' : undefined,
      }}
      role="tab"
      aria-selected={step === target}
      onClick={() => goStep(target)}
    >
      {t(`studentsContract.minor.step${target}`)}
    </div>
  );

  const cardStyle = {
    background: '#fff',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
    marginBottom: '20px',
  } as const;

  const circleBtn = (kind: 'add' | 'remove', onClick: () => void, label: string) => (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className={kind === 'add' ? 'psc-phone-add' : 'psc-phone-remove'}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      style={{
        background: kind === 'add' ? '#FE9100' : '#fee2e2',
        color: kind === 'add' ? '#fff' : '#ef4444',
        height: '42px',
        width: kind === 'add' ? 'auto' : '42px',
        padding: kind === 'add' ? '0 18px' : 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '10px',
        cursor: 'pointer',
        flexShrink: 0,
        fontFamily: 'noto-b, sans-serif',
        fontSize: '14px',
        whiteSpace: 'nowrap',
      }}
    >
      {kind === 'add' ? t('registrationModal.add') : <i className="fa-solid fa-trash"></i>}
    </div>
  );

  return (
    <div className="students-contract container">
      <div className="sc-page-top" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          className="sc-page-top-icon"
          style={{
            background: '#FFEFDB',
            color: '#FE9100',
            padding: '10px 24px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
          }}
        >
          <i className="fa-solid fa-child"></i>
        </div>
        <span
          className="sc-page-top-title"
          style={{ textTransform: 'uppercase', fontFamily: 'noto-sb', fontSize: '16px', color: '#000' }}
        >
          {t('preschoolContracts.pageTop')}
        </span>
      </div>

      <div
        className="sc-step-bar"
        role="tablist"
        style={{ display: 'flex', background: '#003366', borderRadius: '40px', margin: '16px 0', padding: '0', overflow: 'hidden' }}
      >
        {stepBarItem(1)}
        {stepBarItem(2)}
      </div>

      {step === 1 && (
        <>
          {form.representatives.map((r, idx) => {
            const n = idx + 1;
            const js = jsh[r.key];
            return (
              <div key={r.key} className="sc-form-card psc-rep-card" style={cardStyle}>
                {form.representatives.length > 1 && (
                  <div className="psc-rep-head">
                    <strong>{L('repNo', { n })}</strong>
                    <button
                      type="button"
                      className="sc-remove-student-btn"
                      style={{
                        background: '#ffefef',
                        color: '#ff4d4f',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                      onClick={() => removeRep(r.key)}
                    >
                      {L('removeRep')}
                    </button>
                  </div>
                )}

                <div className="sc-form-row">
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-jshshir-${r.key}`}>
                      {SL('jshshir')}
                    </label>
                    <div className="sc-jshshir-field">
                      <input
                        id={`psc-rep-jshshir-${r.key}`}
                        type="text"
                        className="sc-form-input"
                        placeholder="00000000000000"
                        maxLength={14}
                        value={r.jshshir}
                        onChange={(e) => changeRep(r.key, 'jshshir', e.target.value)}
                      />
                      {js?.state === 'loading' && (
                        <i className="fa-solid fa-spinner fa-spin sc-jshshir-spinner" aria-hidden="true" />
                      )}
                    </div>
                    {js?.state === 'loading' && <div className="sc-jshshir-hint">{L('jshshirChecking')}</div>}
                    {js?.state === 'found' && (
                      <div className="sc-jshshir-hint sc-jshshir-hint--ok">{L('jshshirFound', { name: js.name })}</div>
                    )}
                    {js?.state === 'none' && <div className="sc-jshshir-hint">{L('jshshirNone')}</div>}
                  </div>
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-citizenship-${r.key}`}>
                      {SL('citizenship')} <span>*</span>
                    </label>
                    <select
                      id={`psc-rep-citizenship-${r.key}`}
                      className="sc-form-select"
                      value={r.citizenship}
                      onChange={(e) => patchRep(r.key, { citizenship: e.target.value as PreschoolRepresentativeForm['citizenship'] })}
                    >
                      {CONTRACT_CITIZENSHIPS.map((c) => (
                        <option key={c} value={c}>
                          {t(`preschoolContracts.citizenships.${c}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-type-${r.key}`}>
                      {t('studentsContract.minor.representative')} <span>*</span>
                    </label>
                    <select
                      id={`psc-rep-type-${r.key}`}
                      className="sc-form-select"
                      value={r.representative_type}
                      onChange={(e) => patchRep(r.key, { representative_type: e.target.value as PreschoolRepresentativeForm['representative_type'] })}
                    >
                      {REPRESENTATIVE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`studentsContract.minor.${REP_TYPE_KEYS[type]}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sc-form-row">
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-birth-${r.key}`}>
                      {SL('birthDate')}
                    </label>
                    <DateInput
                      id={`psc-rep-birth-${r.key}`}
                      className="sc-form-input"
                      value={r.birth_date}
                      onChange={(e) => changeRep(r.key, 'birth_date', e.target.value)}
                    />
                  </div>
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-pseries-${r.key}`}>
                      {SL('passport')}
                    </label>
                    <div className="sc-passport-group" style={{ display: 'flex', gap: '8px' }}>
                      <input
                        id={`psc-rep-pseries-${r.key}`}
                        type="text"
                        className="sc-passport-series"
                        style={{ width: '80px', textTransform: 'uppercase' }}
                        placeholder="AA"
                        maxLength={2}
                        value={r.passport_series}
                        onChange={(e) => changeRep(r.key, 'passport_series', e.target.value)}
                      />
                      <input
                        id={`psc-rep-pnumber-${r.key}`}
                        type="text"
                        className="sc-passport-number"
                        style={{ flex: 1 }}
                        placeholder="1234567"
                        maxLength={7}
                        value={r.passport_number}
                        onChange={(e) => changeRep(r.key, 'passport_number', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-pgiven-${r.key}`}>
                      {SL('passportGivenDate')}
                    </label>
                    <DateInput
                      id={`psc-rep-pgiven-${r.key}`}
                      className="sc-form-input"
                      value={r.passport_given_date}
                      onChange={(e) => changeRep(r.key, 'passport_given_date', e.target.value)}
                    />
                  </div>
                </div>

                <div className="sc-form-row">
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-pexpiry-${r.key}`}>
                      {t('studentsContract.minor.passportExpiry')}
                    </label>
                    <DateInput
                      id={`psc-rep-pexpiry-${r.key}`}
                      className="sc-form-input"
                      value={r.passport_expiry_date}
                      onChange={(e) => changeRep(r.key, 'passport_expiry_date', e.target.value)}
                    />
                  </div>
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-pby-${r.key}`}>
                      {SL('passportGivenBy')}
                    </label>
                    <input
                      id={`psc-rep-pby-${r.key}`}
                      type="text"
                      className="sc-form-input"
                      placeholder={L('enter')}
                      value={r.passport_given_by}
                      onChange={(e) => changeRep(r.key, 'passport_given_by', e.target.value)}
                    />
                  </div>
                </div>

                <div className="sc-form-row">
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-last-${r.key}`}>
                      {SL('lastName')} <span>*</span>
                    </label>
                    <input
                      id={`psc-rep-last-${r.key}`}
                      type="text"
                      className={`sc-form-input${bad(`rep${n}_last`)}`}
                      placeholder={L('enter')}
                      value={r.last_name}
                      onChange={(e) => changeRep(r.key, 'last_name', e.target.value)}
                    />
                  </div>
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-first-${r.key}`}>
                      {SL('firstName')} <span>*</span>
                    </label>
                    <input
                      id={`psc-rep-first-${r.key}`}
                      type="text"
                      className={`sc-form-input${bad(`rep${n}_first`)}`}
                      placeholder={L('enter')}
                      value={r.first_name}
                      onChange={(e) => changeRep(r.key, 'first_name', e.target.value)}
                    />
                  </div>
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-father-${r.key}`}>
                      {SL('fatherName')}
                    </label>
                    <input
                      id={`psc-rep-father-${r.key}`}
                      type="text"
                      className="sc-form-input"
                      placeholder={L('enter')}
                      value={r.father_name}
                      onChange={(e) => changeRep(r.key, 'father_name', e.target.value)}
                    />
                  </div>
                </div>

                {r.phones.map((phone, pIdx) => (
                  <div
                    key={pIdx}
                    className="sc-form-row"
                    style={{ display: 'flex', gap: '18px', marginTop: pIdx > 0 ? '18px' : '0' }}
                  >
                    <div className="sc-form-col" style={{ flex: '0 0 32%' }}>
                      <label className="sc-form-label" htmlFor={`psc-rep-phone-${r.key}-${pIdx}`}>
                        {t('studentsContract.minor.phoneLabel', { num: pIdx + 1 })}
                        {pIdx === 0 && <span> *</span>}
                      </label>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <PhoneInput
                          id={`psc-rep-phone-${r.key}-${pIdx}`}
                          className={`sc-form-input${bad(`rep${n}_phone${pIdx}`)}`}
                          value={phone}
                          onChange={(v) => setRepPhone(r.key, pIdx, v)}
                        />
                        {pIdx === r.phones.length - 1
                          ? circleBtn('add', () => addRepPhone(r.key), L('addPhone'))
                          : circleBtn('remove', () => removeRepPhone(r.key, pIdx), L('removePhone'))}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="sc-form-row">
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-reg-${r.key}`}>
                      {t('studentsContract.minor.registeredAddress')}
                    </label>
                    <input
                      id={`psc-rep-reg-${r.key}`}
                      type="text"
                      className="sc-form-input"
                      placeholder={L('enter')}
                      value={r.registered_address}
                      onChange={(e) => changeRep(r.key, 'registered_address', e.target.value)}
                    />
                  </div>
                  <div className="sc-form-col">
                    <label className="sc-form-label" htmlFor={`psc-rep-addr-${r.key}`}>
                      {t('studentsContract.minor.realAddress')}
                    </label>
                    <input
                      id={`psc-rep-addr-${r.key}`}
                      type="text"
                      className="sc-form-input"
                      placeholder={L('enter')}
                      value={r.residential_address}
                      onChange={(e) => changeRep(r.key, 'residential_address', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="sc-add-student-btn"
            style={{
              width: '100%',
              padding: '12px',
              border: '1px dashed #FE9100',
              borderRadius: '8px',
              background: '#fff',
              color: '#FE9100',
              cursor: 'pointer',
              fontWeight: '500',
              marginBottom: '20px',
            }}
            onClick={addRep}
          >
            {L('addRep')}
          </button>

          <div className="sc-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            {admin ? cancelButton : nextButton}
            {admin ? nextButton : cancelButton}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {/* ── Bola ── */}
          <div className="sc-form-card" style={cardStyle}>
            <h3 className="psc-card-title">{L('sectionStudent')}</h3>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-citizenship">
                  {SL('citizenship')} <span>*</span>
                </label>
                <select
                  id="psc-citizenship"
                  className="sc-form-select"
                  value={form.citizenship}
                  onChange={(e) => set('citizenship', e.target.value as PreschoolContractForm['citizenship'])}
                >
                  {CONTRACT_CITIZENSHIPS.map((c) => (
                    <option key={c} value={c}>
                      {t(`preschoolContracts.citizenships.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-cert-series">
                  {SL('passport')} <span>*</span>
                </label>
                <div className="sc-passport-group" style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="psc-cert-series"
                    type="text"
                    className={`sc-passport-series${bad('cert_series')}`}
                    style={{ width: '80px', textTransform: 'uppercase' }}
                    placeholder="A-AA"
                    maxLength={4}
                    value={form.birth_cert_series}
                    onChange={(e) => set('birth_cert_series', e.target.value.toUpperCase())}
                  />
                  <input
                    id="psc-cert-number"
                    type="text"
                    className={`sc-passport-number${bad('cert_number')}`}
                    style={{ flex: 1 }}
                    placeholder={L('number')}
                    maxLength={7}
                    value={form.birth_cert_number}
                    onChange={(e) => set('birth_cert_number', e.target.value.replace(/\D/g, '').slice(0, 7))}
                  />
                </div>
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-cert-given">
                  {SL('passportGivenDate')}
                </label>
                <DateInput
                  id="psc-cert-given"
                  className="sc-form-input"
                  value={form.birth_cert_given_date}
                  onChange={(e) => set('birth_cert_given_date', e.target.value)}
                />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-birth-place">
                  {SL('birthPlace')} <span>*</span>
                </label>
                <input
                  id="psc-birth-place"
                  type="text"
                  className={`sc-form-input${bad('birth_place')}`}
                  placeholder={L('enter')}
                  value={form.birth_place}
                  onChange={(e) => set('birth_place', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-birth-date">
                  {SL('birthDate')} <span>*</span>
                </label>
                <DateInput
                  id="psc-birth-date"
                  className={`sc-form-input${bad('birth_date')}`}
                  value={form.birth_date}
                  max={yesterdayIso()}
                  onChange={(e) => set('birth_date', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-gender">
                  {L('gender')} <span>*</span>
                </label>
                <select
                  id="psc-gender"
                  className={`sc-form-select${bad('gender')}`}
                  value={form.gender}
                  onChange={(e) => set('gender', e.target.value as PreschoolContractForm['gender'])}
                >
                  <option value="">{SL('select')}</option>
                  {STUDENT_GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {t(`preschoolContracts.genders.${g}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-last-name">
                  {SL('lastName')} <span>*</span>
                </label>
                <input
                  id="psc-last-name"
                  type="text"
                  className={`sc-form-input${bad('last_name')}`}
                  placeholder={L('enter')}
                  value={form.last_name}
                  onChange={(e) => set('last_name', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-first-name">
                  {SL('firstName')} <span>*</span>
                </label>
                <input
                  id="psc-first-name"
                  type="text"
                  className={`sc-form-input${bad('first_name')}`}
                  placeholder={L('enter')}
                  value={form.first_name}
                  onChange={(e) => set('first_name', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-father-name">
                  {SL('fatherName')} <span>*</span>
                </label>
                <input
                  id="psc-father-name"
                  type="text"
                  className={`sc-form-input${bad('father_name')}`}
                  placeholder={L('enter')}
                  value={form.father_name}
                  onChange={(e) => set('father_name', e.target.value)}
                />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col" style={{ flex: '0 0 32%' }}>
                <label className="sc-form-label" htmlFor="psc-phone">
                  {L('phoneOptional')}
                </label>
                <PhoneInput
                  id="psc-phone"
                  className={`sc-form-input${bad('phone')}`}
                  value={form.phone}
                  onChange={(v) => set('phone', v)}
                />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-address">
                  {L('address')} <span>*</span>
                </label>
                <input
                  id="psc-address"
                  type="text"
                  className={`sc-form-input${bad('address')}`}
                  placeholder={L('enter')}
                  value={form.residential_address}
                  onChange={(e) => set('residential_address', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Shartnoma ── */}
          <div className="sc-form-card" style={cardStyle}>
            <h3 className="psc-card-title">{L('sectionContract')}</h3>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-language">
                  {SL('language')} <span>*</span>
                </label>
                <select
                  id="psc-language"
                  className="sc-form-select"
                  value={form.language}
                  onChange={(e) => set('language', e.target.value as PreschoolContractForm['language'])}
                >
                  {CONTRACT_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-branch">
                  {L('branch')} <span>*</span>
                </label>
                <select
                  id="psc-branch"
                  className={`sc-form-select${bad('branch')}`}
                  value={form.branch_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, branch_id: e.target.value, group_id: '' }))}
                >
                  <option value="">{SL('select')}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {optionLabel(b, i18n.language)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-city">
                  {L('city')}
                </label>
                <input id="psc-city" type="text" className="sc-form-input" value={branch?.city ?? ''} readOnly disabled />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-year">
                  {L('academicYear')} <span>*</span>
                </label>
                <select
                  id="psc-year"
                  className={`sc-form-select${bad('year')}`}
                  value={yearId}
                  onChange={(e) => setForm((prev) => ({ ...prev, academic_year_id: e.target.value, group_id: '', end_date: '' }))}
                >
                  <option value="">{SL('select')}</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-group">
                  {L('group')} <span>*</span>
                </label>
                <select
                  id="psc-group"
                  className={`sc-form-select${bad('group')}`}
                  value={form.group_id}
                  disabled={!branchId}
                  onChange={(e) => set('group_id', e.target.value)}
                >
                  <option value="">
                    {!branchId ? L('selectBranchFirst') : preschoolGroups.length === 0 ? L('noGroups') : SL('select')}
                  </option>
                  {preschoolGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-price">
                  {L('monthlyPrice')}
                </label>
                <input
                  id="psc-price"
                  type="text"
                  className="sc-form-input"
                  readOnly
                  disabled
                  value={price != null ? `${formatSum(price)} ${L('currency')}` : ''}
                  placeholder={L('priceUnknown')}
                />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-contract-date">
                  {L('contractDate')} <span>*</span>
                </label>
                <DateInput
                  id="psc-contract-date"
                  className={`sc-form-input${bad('contract_date')}`}
                  value={form.contract_date}
                  onChange={(e) => set('contract_date', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-end-date">
                  {L('endDate')} <span>*</span>
                </label>
                <DateInput
                  id="psc-end-date"
                  className={`sc-form-input${bad('end_date')}`}
                  value={endDate}
                  onChange={(e) => set('end_date', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-first-payment">
                  {L('firstPayment')} <span>*</span>
                </label>
                <DateInput
                  id="psc-first-payment"
                  className={`sc-form-input${bad('first_payment')}`}
                  value={firstPayment}
                  onChange={(e) => set('first_payment_date', e.target.value)}
                />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-study-start">
                  {L('studyStart')} <span>*</span>
                </label>
                <DateInput
                  id="psc-study-start"
                  className={`sc-form-input${bad('study_start')}`}
                  value={studyStart}
                  onChange={(e) => set('study_start_date', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-months">
                  {L('monthsCount')}
                </label>
                <input id="psc-months" type="text" className="sc-form-input" readOnly disabled value={months > 0 ? String(months) : ''} />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label" htmlFor="psc-total">
                  {L('totalPrice')}
                </label>
                <input
                  id="psc-total"
                  type="text"
                  className="sc-form-input"
                  readOnly
                  disabled
                  value={total != null ? `${formatSum(total)} ${L('currency')}` : ''}
                  placeholder={L('priceUnknown')}
                />
              </div>
            </div>
          </div>

          <div className="sc-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            {admin ? (
              <>
                {cancelButton}
                {prevButton}
                {saveButton}
              </>
            ) : (
              <>
                {prevButton}
                {cancelButton}
                {saveButton}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
