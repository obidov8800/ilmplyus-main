import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import './studentsContracts.css';
import { emptyMinorStudent, emptyRepresentative } from '@/types/studentContract.types';
import type { MinorStudentFormData, RepresentativeFormData } from '@/types/studentContract.types';
import { LID_STATUS, type Lid } from '@/types/lid.types';
import { advanceLidStatus } from '@/pages/lid/lid.service';
import { notifications } from '@mantine/notifications';
import { API } from '@/api/api';
import { useOptions, optionLabel, type Option } from '@/api/options';
import { useLidSearch } from './useLidSearch';
import { lookupPersonByJshshir, applyPersonMatch } from './jshshirLookup';
import { findMissingField, isValidLidId, type FieldPair } from './requiredFields';
import DateInput from '@/components/DateInput';
import PhoneInput from '@/components/PhoneInput';
import { PHONE_PREFIX, formatPhone, isValidPhone, toApiPhone, toApiPhones } from '@/utils/phone';

// Helper: convert ISO date string to YYYY-MM-DD for date inputs
const formatDateForInput = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // ISO format: extract date part
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const MinorStudentCard = ({
  student,
  index,
  onChange,
  onRemove,
  showRemove,
  allGroups,
  allCourses,
}: {
  student: MinorStudentFormData;
  index: number;
  onChange: (index: number, field: keyof MinorStudentFormData, value: string) => void;
  onRemove: (index: number) => void;
  showRemove: boolean;
  allGroups: Option[];
  allCourses: Option[];
}) => {
  const { t, i18n } = useTranslation();
  const [lidSearchTerm, setLidSearchTerm] = useState(student.lid_id || '');
  const [showLidDropdown, setShowLidDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { results: searchResults, isSearching } = useLidSearch(
    lidSearchTerm,
    showLidDropdown && lidSearchTerm.length > 0,
  );

  // Guruhlar tanlangan kurs va bosqichga mos kelsagina tanlanadi
  const filteredGroups = useMemo(() => {
    if (!student.course_id || !student.level_id) return [];
    return (allGroups || []).filter(
      (g) =>
        String(g.course_id ?? '') === student.course_id &&
        String(g.level_id ?? '') === student.level_id,
    );
  }, [allGroups, student.course_id, student.level_id]);

  // Tanlangan guruh kurs/bosqichga mos kelmasa tozalanadi (masalan, liddan kelgan guruh)
  useEffect(() => {
    if (!student.group_id || !allGroups?.length) return;
    const g = allGroups.find((x) => String(x.id) === student.group_id);
    if (!g) return;
    const mismatch =
      (student.course_id && String(g.course_id ?? '') !== student.course_id) ||
      (student.level_id && String(g.level_id ?? '') !== student.level_id);
    if (mismatch) onChange(index, 'group_id', '');
  }, [student.group_id, student.course_id, student.level_id, allGroups, index, onChange]);

  const handleLidSelect = (lid: Lid) => {
    const addressStr = [
      lid.region?.name_uz || lid.region?.name_uz,
      lid.district?.name_uz || lid.district?.name_uz,
    ]
      .filter(Boolean)
      .join(', ');

    onChange(index, 'lid_id', String(lid.id));
    onChange(index, 'first_name', lid.first_name || student.first_name);
    onChange(index, 'last_name', lid.last_name || student.last_name);
    onChange(index, 'father_name', lid.father_name || student.father_name);
    onChange(index, 'birth_date', lid.birth_date || student.birth_date);
    onChange(index, 'phone', lid.phone ? formatPhone(lid.phone) : student.phone);
    onChange(index, 'course_id', lid.course_id ? String(lid.course_id) : student.course_id);
    onChange(index, 'group_id', lid.group_id ? String(lid.group_id) : student.group_id);
    onChange(index, 'level_id', lid.level_id ? String(lid.level_id) : student.level_id);
    onChange(index, 'residential_address', addressStr || student.residential_address);
    onChange(
      index,
      'monthly_price',
      lid.course_price?.new_price
        ? String(lid.course_price.new_price)
        : student.monthly_price || '',
    );

    setLidSearchTerm(String(lid.id));
    setShowLidDropdown(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowLidDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div
      className="sc-student-card"
      style={{
        background: '#fff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '20px',
        position: 'relative',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <div style={{ flex: 1, display: 'flex', gap: '20px' }}>
          <div className="sc-form-col" style={{ position: 'relative', flex: 1 }} ref={dropdownRef}>
            <label className="sc-form-label">
              {t('studentsContract.form.lidId')} <span>*</span>
            </label>
            <input
              type="text"
              className="sc-form-input"
              style={{
                borderColor: '#003366',
              }}
              placeholder={t('studentsContract.form.lidSearchPlaceholder')}
              value={lidSearchTerm || student.lid_id}
              onChange={(e) => {
                setLidSearchTerm(e.target.value);
                onChange(index, 'lid_id', e.target.value);
                setShowLidDropdown(true);
              }}
              onFocus={() => setShowLidDropdown(true)}
            />
            {showLidDropdown && lidSearchTerm.length > 0 && (
              <div
                className="sc-lid-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginTop: '4px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
              >
                {isSearching ? (
                  <div
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                      color: '#64748b',
                    }}
                  >
                    {t('studentsContract.form.searching')}
                  </div>
                ) : searchResults.length > 0 ? (
                  <>
                    <div
                      className="sc-lid-dropdown-header"
                      style={{
                        display: 'flex',
                        background: '#f8fafc',
                        padding: '8px 12px',
                        borderBottom: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: '#64748b',
                        fontWeight: '500',
                      }}
                    >
                      <div style={{ width: '60px' }}>{t('studentsContract.form.dropdownId')}</div>
                      <div style={{ flex: 2 }}>{t('studentsContract.form.dropdownName')}</div>
                      <div style={{ flex: 2 }}>{t('studentsContract.form.dropdownPhone')}</div>
                    </div>
                    {searchResults.map((lid: Lid) => (
                      <div
                        key={lid.id}
                        className="sc-lid-dropdown-item"
                        style={{
                          display: 'flex',
                          padding: '10px 12px',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'background 0.2s',
                        }}
                        onClick={() => handleLidSelect(lid)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ width: '60px' }}>{lid.id}</div>
                        <div style={{ flex: 2 }}>
                          {lid.first_name} {lid.last_name}
                        </div>
                        <div style={{ flex: 2 }}>{lid.phone}</div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                      color: '#64748b',
                    }}
                  >
                    {t('studentsContract.form.notFound')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {showRemove && (
          <button
            className="sc-remove-student-btn"
            style={{
              background: '#ffefef',
              color: '#ff4d4f',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              marginLeft: '20px',
            }}
            onClick={() => onRemove(index)}
          >
            {t('studentsContract.minor.removeStudent')}
          </button>
        )}
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.language')} <span>*</span>
          </label>
          <select
            className="sc-form-select"
            value={student.language}
            onChange={(e) => onChange(index, 'language', e.target.value)}
          >
            <option value="uz">UZ</option>
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.citizenship')} <span>*</span>
          </label>
          <select
            className="sc-form-select"
            value={student.citizenship}
            onChange={(e) => onChange(index, 'citizenship', e.target.value)}
          >
            <option value="citizen">{t('studentsContract.form.citizenUz')}</option>
            <option value="foreign">{t('studentsContract.form.citizenForeign')}</option>
          </select>
        </div>
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.passport')} <span>*</span>
          </label>
          <div className="sc-passport-group" style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="sc-passport-series"
              style={{
                width: '80px',
                textTransform: 'uppercase',
              }}
              placeholder="A-AA"
              maxLength={4}
              value={student.birth_cert_series}
              onChange={(e) => onChange(index, 'birth_cert_series', e.target.value.toUpperCase())}
            />
            <input
              type="text"
              className="sc-passport-number"
              style={{
                flex: 1,
              }}
              placeholder="Raqam"
              maxLength={7}
              value={student.birth_cert_number}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                if (val.length <= 7) onChange(index, 'birth_cert_number', val);
              }}
            />
          </div>
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.passportGivenDate')} <span>*</span>
          </label>
          <DateInput
            className="sc-form-input"
            value={student.birth_cert_given_date}
            onChange={(e) => onChange(index, 'birth_cert_given_date', e.target.value)}
          />
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.birthPlace')} <span>*</span>
          </label>
          <input
            type="text"
            className="sc-form-input"
            placeholder="Kiriting"
            value={student.birth_place}
            onChange={(e) => onChange(index, 'birth_place', e.target.value)}
          />
        </div>
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.lastName')} <span>*</span>
          </label>
          <input
            type="text"
            className="sc-form-input"
            placeholder="Kiriting"
            value={student.last_name}
            onChange={(e) => onChange(index, 'last_name', e.target.value)}
          />
        </div>
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.firstName')} <span>*</span>
          </label>
          <input
            type="text"
            className="sc-form-input"
            placeholder="Kiriting"
            value={student.first_name}
            onChange={(e) => onChange(index, 'first_name', e.target.value)}
          />
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.fatherName')} <span>*</span>
          </label>
          <input
            type="text"
            className="sc-form-input"
            placeholder="Kiriting"
            value={student.father_name}
            onChange={(e) => onChange(index, 'father_name', e.target.value)}
          />
        </div>
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.birthDate')} <span>*</span>
          </label>
          <DateInput
            className="sc-form-input"
            value={student.birth_date}
            onChange={(e) => onChange(index, 'birth_date', e.target.value)}
          />
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.course')} <span>*</span>
          </label>
          <select
            className="sc-form-select"
            value={student.course_id}
            onChange={(e) => {
              // Kurs o'zgarsa bosqich va guruh qaytadan tanlanadi
              onChange(index, 'course_id', e.target.value);
              onChange(index, 'level_id', '');
              onChange(index, 'group_id', '');
            }}
          >
            <option value="">{t('studentsContract.form.select')}</option>
            {(allCourses || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.level')} <span>*</span>
          </label>
          <select
            className="sc-form-select"
            value={student.level_id}
            disabled={!student.course_id}
            onChange={(e) => {
              // Bosqich o'zgarsa guruh qaytadan tanlanadi
              onChange(index, 'level_id', e.target.value);
              onChange(index, 'group_id', '');
            }}
          >
            <option value="">{t('studentsContract.form.select')}</option>
            {((allCourses || []).find((c) => String(c.id) === student.course_id)?.levels || []).map(
              (l) => (
                <option key={l.id} value={l.id}>
                  {optionLabel(l, i18n.language)}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">
            {t('studentsContract.form.group')} <span>*</span>
          </label>
          <select
            className="sc-form-select"
            value={student.group_id}
            disabled={!student.course_id || !student.level_id || filteredGroups.length === 0}
            onChange={(e) => onChange(index, 'group_id', e.target.value)}
          >
            <option value="">
              {!student.course_id || !student.level_id
                ? t('studentsContract.form.selectCourseFirst')
                : filteredGroups.length === 0
                  ? t('studentsContract.form.noMatchingGroup')
                  : t('studentsContract.form.select')}
            </option>
            {filteredGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col">
          <label className="sc-form-label">{t('studentsContract.form.monthlyPrice')}</label>
          <input
            type="number"
            className="sc-form-input"
            placeholder="500000"
            value={student.monthly_price}
            onChange={(e) => onChange(index, 'monthly_price', e.target.value)}
          />
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">{t('studentsContract.form.totalPrice')}</label>
          <input
            type="number"
            className="sc-form-input"
            placeholder="3000000"
            value={student.total_price}
            onChange={(e) => onChange(index, 'total_price', e.target.value)}
          />
        </div>
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col">
          <label className="sc-form-label">{t('studentsContract.form.courseStartDate')}</label>
          <DateInput
            className="sc-form-input"
            value={student.course_start_date}
            onChange={(e) => onChange(index, 'course_start_date', e.target.value)}
          />
        </div>
        <div className="sc-form-col">
          <label className="sc-form-label">{t('studentsContract.form.courseEndDate')}</label>
          <DateInput
            className="sc-form-input"
            value={student.course_end_date}
            onChange={(e) => onChange(index, 'course_end_date', e.target.value)}
          />
        </div>
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col" style={{ flex: '0 0 50%' }}>
          <label className="sc-form-label">
            {t('studentsContract.form.phone')} <span>*</span>
          </label>
          <PhoneInput
            className="sc-form-input"
            value={student.phone}
            onChange={(v) => onChange(index, 'phone', v)}
          />
        </div>
        <div className="sc-form-col" style={{ flex: 1 }}>
          <label className="sc-form-label">
            {t('studentsContract.form.residentialAddress')} <span>*</span>
          </label>
          <textarea
            className="sc-form-textarea"
            style={{
              minHeight: '80px',
              width: '100%',
            }}
            placeholder="Kiriting"
            value={student.residential_address}
            onChange={(e) => onChange(index, 'residential_address', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

const UnderAge = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [representative, setRepresentative] = useState<RepresentativeFormData>({
    ...emptyRepresentative,
    phones: [PHONE_PREFIX],
  });
  const [students, setStudents] = useState<MinorStudentFormData[]>([
    { ...emptyMinorStudent, phone: PHONE_PREFIX },
  ]);

  const { data: contractToEdit, isLoading: isFetchingContract } = useQuery({
    queryKey: ['student-contract', id],
    queryFn: () => API.get(`/student-contracts/${id}`).then((res) => res.data),
    enabled: !!id,
  });

  useEffect(() => {
    if (contractToEdit && id) {
      const contract = contractToEdit.contract || contractToEdit.data || contractToEdit;
      if (contract.representative) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRepresentative({
          representative_type: contract.representative.representative_type || 'Ota',
          first_name: contract.representative.first_name || '',
          last_name: contract.representative.last_name || '',
          father_name: contract.representative.father_name || '',
          jshshir: contract.representative.jshshir || '',
          citizenship: contract.representative.citizenship || 'citizen',
          phones: [formatPhone(contract.representative.phone)],
          passport_series: contract.representative.passport_series || '',
          passport_number: contract.representative.passport_number || '',
          birth_date: formatDateForInput(contract.representative.birth_date),
          passport_given_date: formatDateForInput(contract.representative.passport_given_date),
          passport_expiry_date: formatDateForInput(contract.representative.passport_expiry_date),
          registered_address: contract.representative.registered_address || '',
          residential_address: contract.representative.residential_address || '',
          language: contract.language || 'uz',
          passport_given_by: contract.representative.passport_given_by || '',
        });
      }

      if (contract.contract_students && contract.contract_students.length > 0) {
        setStudents(
          contract.contract_students.map((s: Record<string, unknown>) => ({
            lid_id: String(s.lid_id),
            first_name: s.first_name || '',
            last_name: s.last_name || '',
            father_name: s.father_name || '',
            birth_date: formatDateForInput(s.birth_date as string | null | undefined),
            birth_cert_series: s.birth_cert_series || '',
            birth_cert_number: s.birth_cert_number || '',
            birth_cert_given_date: formatDateForInput(
              s.birth_cert_given_date as string | null | undefined,
            ),
            birth_cert_expiry_date: formatDateForInput(
              s.birth_cert_expiry_date as string | null | undefined,
            ),
            birth_place: s.birth_place || '',
            phone: formatPhone(s.phone as string | null | undefined),
            course_id: String(s.course_id || ''),
            level_id: String(s.level_id || ''),
            group_id: String(s.group_id || ''),
            residential_address: s.residential_address || '',
            jshshir: s.jshshir || '',
            language: contract.language || 'uz',
            citizenship: s.citizenship || 'citizen',
          })) as MinorStudentFormData[],
        );
      }
    }
  }, [contractToEdit, id]);

  const { data: allGroups } = useOptions('groups');

  const { data: allCourses } = useOptions('courses');

  // Vakil JSHSHR bazadan tekshirilayotganini input yonida ko'rsatish uchun.
  const [repJshState, setRepJshState] = useState<'idle' | 'loading' | 'found' | 'none'>('idle');
  const [repJshMatchName, setRepJshMatchName] = useState('');
  const latestRepJshRef = useRef('');

  // JSHSHR to'liq (14 raqam) kiritilganda — bazadan odamni topib, mavjud
  // ma'lumotlarini to'ldiradi. Faqat yangi shartnomada (`id` yo'q).
  const autofillFromJshshir = async (
    jshshir: string,
    apply: (m: Parameters<typeof applyPersonMatch>[1]) => void,
  ) => {
    if (id || jshshir.length !== 14) return;
    latestRepJshRef.current = jshshir;
    setRepJshState('loading');
    setRepJshMatchName('');
    let match: Awaited<ReturnType<typeof lookupPersonByJshshir>> = null;
    try {
      match = await lookupPersonByJshshir(jshshir);
    } catch {
      if (latestRepJshRef.current === jshshir) setRepJshState('idle');
      return;
    }
    if (latestRepJshRef.current !== jshshir) return;
    if (!match) {
      setRepJshState('none');
      return;
    }
    apply(match);
    setRepJshState('found');
    setRepJshMatchName(match.displayName);
    notifications.show({
      color: 'green',
      message: t('studentsContract.autofill.found', { name: match.displayName }),
    });
  };

  const handleRepChange = (field: keyof RepresentativeFormData, value: string) => {
    let finalValue = value;
    if (field === 'passport_series') finalValue = value.toUpperCase();
    if (field === 'passport_number' || field === 'jshshir') {
      finalValue = value.replace(/\D/g, '');
      if (field === 'passport_number' && finalValue.length > 7) return;
      if (field === 'jshshir' && finalValue.length > 14) return;
    }

    setRepresentative((prev) => ({ ...prev, [field]: finalValue }));

    if (field === 'jshshir') {
      if (finalValue.length === 14) {
        void autofillFromJshshir(finalValue, (match) =>
          setRepresentative((prev) =>
            prev.jshshir === finalValue ? applyPersonMatch(prev, match) : prev,
          ),
        );
      } else {
        latestRepJshRef.current = finalValue;
        setRepJshState('idle');
        setRepJshMatchName('');
      }
    }
  };

  const handleRepPhoneChange = (pIdx: number, value: string) => {
    setRepresentative((prev) => {
      const newPhones = [...prev.phones];
      newPhones[pIdx] = formatPhone(value);
      return { ...prev, phones: newPhones };
    });
  };

  const addRepPhone = () => {
    setRepresentative((prev) => ({
      ...prev,
      phones: [...prev.phones, PHONE_PREFIX],
    }));
  };

  const removeRepPhone = (pIdx: number) => {
    setRepresentative((prev) => ({
      ...prev,
      phones: prev.phones.filter((_, i) => i !== pIdx),
    }));
  };

  const handleStudentChange = (index: number, field: keyof MinorStudentFormData, value: string) => {
    let finalValue = value;
    if (field === 'phone') finalValue = formatPhone(value);
    if (field === 'jshshir') finalValue = value.replace(/\D/g, '').slice(0, 14);
    setStudents((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, [field]: finalValue };

        // Auto-fill dates when group is selected
        if (field === 'group_id' && value && allGroups) {
          const group = allGroups.find((g) => String(g.id) === value);
          // Sanasi bo'lmagan guruh qo'lda kiritilgan sanalarni bo'shatib yubormasin
          if (group && (group.start_date || group.end_date)) {
            updated.course_start_date = formatDateForInput(group.start_date);
            updated.course_end_date = formatDateForInput(group.end_date);
          }
        }

        // Auto-calculate total price
        if (
          (field === 'monthly_price' ||
            field === 'group_id' ||
            field === 'course_start_date' ||
            field === 'course_end_date') &&
          updated.monthly_price &&
          updated.course_start_date &&
          updated.course_end_date
        ) {
          const start = new Date(updated.course_start_date);
          const end = new Date(updated.course_end_date);
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const months =
              (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            updated.total_price = String(Number(updated.monthly_price) * Math.max(months, 1));
          }
        }

        return updated;
      }),
    );

    if (field === 'jshshir' && finalValue.length === 14) {
      void autofillFromJshshir(finalValue, (match) =>
        setStudents((prev) =>
          prev.map((s, i) =>
            i === index && s.jshshir === finalValue ? applyPersonMatch(s, match) : s,
          ),
        ),
      );
    }
  };

  const addStudent = () => {
    setStudents((prev) => [...prev, { ...emptyMinorStudent, phone: PHONE_PREFIX }]);
  };

  const removeStudent = (index: number) => {
    if (students.length > 1) {
      setStudents((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const isStep1Valid = () => {
    const r = representative;
    return (
      r.first_name &&
      r.last_name &&
      r.father_name &&
      r.jshshir &&
      r.phones &&
      r.passport_series &&
      r.passport_number &&
      r.birth_date &&
      r.passport_given_date &&
      r.registered_address &&
      r.residential_address
    );
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => API.post('/student-contracts', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-contracts'] });
      // Shartnomadagi har bir o'quvchi o'z lidini "Shartnoma" ustuniga
      // o'tkazadi (lidsiz qo'shilgan o'quvchi uchun jimgina hech narsa).
      students.forEach((s) => advanceLidStatus(s.lid_id, LID_STATUS.CONTRACT_SIGNED));
      navigate('/students-contract');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => API.put(`/student-contracts/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-contracts'] });
      navigate('/students-contract');
    },
  });

  const handleSubmit = () => {
    // Vakil maydonlari to'liq to'ldirilishi shart
    const repFields: FieldPair[] = [
      [t('studentsContract.form.jshshir'), representative.jshshir],
      [t('studentsContract.form.citizenship'), representative.citizenship],
      [t('studentsContract.minor.representative'), representative.representative_type],
      [t('studentsContract.form.language'), representative.language],
      [t('studentsContract.form.birthDate'), representative.birth_date],
      [t('studentsContract.form.passport'), representative.passport_series],
      [t('studentsContract.form.passport'), representative.passport_number],
      [t('studentsContract.form.passportGivenDate'), representative.passport_given_date],
      [t('studentsContract.minor.passportExpiry'), representative.passport_expiry_date],
      [t('studentsContract.form.passportGivenBy'), representative.passport_given_by],
      [t('studentsContract.form.lastName'), representative.last_name],
      [t('studentsContract.form.firstName'), representative.first_name],
      [t('studentsContract.form.fatherName'), representative.father_name],
      [t('studentsContract.form.phone'), toApiPhone(representative.phones[0])],
      [t('studentsContract.minor.registeredAddress'), representative.registered_address],
      [t('studentsContract.minor.realAddress'), representative.residential_address],
    ];
    const missingRep = findMissingField(repFields);
    if (missingRep) {
      notifications.show({
        title: t('studentsContract.form.requiredTitle'),
        message: t('studentsContract.form.requiredRepField', { field: missingRep }),
        color: 'red',
      });
      setStep(1);
      return;
    }

    // Vakilning barcha raqamlari `+998` + 9 raqam formatida bo'lishi kerak
    if (representative.phones.some((p) => !isValidPhone(p))) {
      notifications.show({
        title: t('studentsContract.form.requiredTitle'),
        message: t('phoneInput.invalid'),
        color: 'red',
      });
      setStep(1);
      return;
    }

    // Har bir o'quvchining maydonlari ham to'liq bo'lishi shart
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const studentFields: FieldPair[] = [
        [t('studentsContract.form.lidId'), s.lid_id],
        [t('studentsContract.form.language'), s.language],
        [t('studentsContract.form.citizenship'), s.citizenship],
        [t('studentsContract.form.passport'), s.birth_cert_series],
        [t('studentsContract.form.passport'), s.birth_cert_number],
        [t('studentsContract.form.passportGivenDate'), s.birth_cert_given_date],
        [t('studentsContract.form.birthPlace'), s.birth_place],
        [t('studentsContract.form.lastName'), s.last_name],
        [t('studentsContract.form.firstName'), s.first_name],
        [t('studentsContract.form.fatherName'), s.father_name],
        [t('studentsContract.form.birthDate'), s.birth_date],
        [t('studentsContract.form.course'), s.course_id],
        [t('studentsContract.form.level'), s.level_id],
        [t('studentsContract.form.group'), s.group_id],
        [t('studentsContract.form.monthlyPrice'), s.monthly_price],
        [t('studentsContract.form.totalPrice'), s.total_price],
        [t('studentsContract.form.courseStartDate'), s.course_start_date],
        [t('studentsContract.form.courseEndDate'), s.course_end_date],
        [t('studentsContract.form.phone'), toApiPhone(s.phone)],
        [t('studentsContract.form.residentialAddress'), s.residential_address],
      ];
      const missingStudent = findMissingField(studentFields);
      if (missingStudent || !isValidLidId(s.lid_id)) {
        notifications.show({
          title: t('studentsContract.form.requiredTitle'),
          message: missingStudent
            ? t('studentsContract.form.requiredStudentField', {
                num: i + 1,
                field: missingStudent,
              })
            : t('studentsContract.form.lidInvalid'),
          color: 'red',
        });
        setStep(2);
        return;
      }
      if (!isValidPhone(s.phone)) {
        notifications.show({
          title: t('studentsContract.form.requiredTitle'),
          message: t('phoneInput.invalid'),
          color: 'red',
        });
        setStep(2);
        return;
      }
    }

    const payload = {
      contract_type: 'minor',
      language: representative.language,
      branch_id: 1,
      representative: {
        representative_type: representative.representative_type,
        first_name: representative.first_name,
        last_name: representative.last_name,
        father_name: representative.father_name,
        jshshir: representative.jshshir,
        citizenship: representative.citizenship,
        phone: toApiPhone(representative.phones[0]),
        extra_phones: toApiPhones(representative.phones.slice(1)),
        passport_series: representative.passport_series,
        passport_number: representative.passport_number,
        birth_date: representative.birth_date,
        passport_given_date: representative.passport_given_date,
        passport_expiry_date: representative.passport_expiry_date,
        passport_given_by: representative.passport_given_by,
        registered_address: representative.registered_address,
        residential_address: representative.residential_address,
      },
      students: students.map((s, idx) => {
        const studentPayload: Record<string, unknown> = {
          lid_id: Number(s.lid_id),
          is_minor: true,
          jshshir: s.jshshir,
          language: s.language,
          citizenship: s.citizenship,
          first_name: s.first_name,
          last_name: s.last_name,
          father_name: s.father_name,
          birth_date: s.birth_date,
          birth_cert_series: s.birth_cert_series,
          birth_cert_number: s.birth_cert_number,
          birth_cert_given_date: s.birth_cert_given_date,
          birth_cert_expiry_date: s.birth_cert_expiry_date,
          birth_place: s.birth_place,
          phone: toApiPhone(s.phone),
          course_id: Number(s.course_id),
          level_id: Number(s.level_id),
          group_id: Number(s.group_id),
          residential_address: s.residential_address,
          monthly_price: Number(s.monthly_price) || 0,
          total_price: Number(s.total_price) || 0,
          course_start_date: s.course_start_date,
          course_end_date: s.course_end_date,
        };
        // Include student id for update
        if (id && contractToEdit) {
          const contract = contractToEdit.contract || contractToEdit.data || contractToEdit;
          const existingStudent = contract.contract_students?.[idx];
          if (existingStudent?.id) studentPayload.id = existingStudent.id;
        }
        return studentPayload;
      }),
    };

    if (id) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  if (id && isFetchingContract) {
    return (
      <div className="students-contract container" style={{ marginTop: 50, marginLeft: 140 }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          {t('studentsContract.details.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="students-contract container" style={{ marginTop: 50, marginLeft: 140 }}>
      <div
        className="sc-page-top"
        style={{
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
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
          <i className="fa-solid fa-user"></i>
        </div>
        <span
          className="sc-page-top-title"
          style={{
            textTransform: 'uppercase',
            fontFamily: 'noto-sb',
            fontSize: '16px',
            color: '#000',
          }}
        >
          {t('studentsContract.minor.title')}
        </span>
      </div>

      <div
        className="sc-step-bar"
        style={{
          display: 'flex',
          background: '#003366',
          borderRadius: '40px',
          margin: '16px 0',
          padding: '0',
          overflow: 'hidden',
        }}
      >
        <div
          className={`sc-step-item ${step === 1 ? 'active' : ''}`}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '14px',
            cursor: 'pointer',
            background: '#003366',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '14px',
            textTransform: 'uppercase',
            borderRight: '1px solid rgba(255,255,255,0.1)',
          }}
          onClick={() => setStep(1)}
        >
          {t('studentsContract.minor.step1')}
        </div>
        <div
          className={`sc-step-item ${step === 2 ? 'active' : ''}`}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '14px',
            cursor: 'pointer',
            background: step === 2 ? '#003366' : '#5d7ca4',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '14px',
            textTransform: 'uppercase',
          }}
          onClick={() => {
            if (isStep1Valid()) setStep(2);
            else {
              notifications.show({
                title: t('studentsContract.minor.errorTitle'),
                message: t('studentsContract.minor.errorRepMsg'),
                color: 'red',
              });
            }
          }}
        >
          {t('studentsContract.minor.step2')}
        </div>
      </div>

      {step === 1 && (
        <>
          <div
            className="sc-form-card"
            style={{
              background: '#fff',
              padding: '24px',
              borderRadius: '12px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              marginBottom: '20px',
            }}
          >
            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.jshshir')} <span>*</span>
                </label>
                <div className="sc-jshshir-field">
                  <input
                    type="text"
                    className="sc-form-input"
                    placeholder="00000000000000"
                    maxLength={14}
                    value={representative.jshshir}
                    onChange={(e) => handleRepChange('jshshir', e.target.value)}
                  />
                  {repJshState === 'loading' && (
                    <i
                      className="fa-solid fa-spinner fa-spin sc-jshshir-spinner"
                      aria-hidden="true"
                    />
                  )}
                </div>
                {repJshState === 'loading' && (
                  <div className="sc-jshshir-hint">
                    {t('studentsContract.autofill.checking')}
                  </div>
                )}
                {repJshState === 'found' && (
                  <div className="sc-jshshir-hint sc-jshshir-hint--ok">
                    {t('studentsContract.autofill.found', { name: repJshMatchName })}
                  </div>
                )}
                {repJshState === 'none' && (
                  <div className="sc-jshshir-hint">
                    {t('studentsContract.autofill.notFoundInline')}
                  </div>
                )}
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.citizenship')} <span>*</span>
                </label>
                <select
                  className="sc-form-select"
                  value={representative.citizenship}
                  onChange={(e) => handleRepChange('citizenship', e.target.value)}
                >
                  <option value="citizen">{t('studentsContract.form.citizenUz')}</option>
                  <option value="foreign">{t('studentsContract.form.citizenForeign')}</option>
                </select>
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.minor.representative')} <span>*</span>
                </label>
                <select
                  className="sc-form-select"
                  value={representative.representative_type}
                  onChange={(e) => handleRepChange('representative_type', e.target.value)}
                >
                  <option value="Ota">{t('studentsContract.minor.repTypeFather')}</option>
                  <option value="Ona">{t('studentsContract.minor.repTypeMother')}</option>
                  <option value="Vasiy">{t('studentsContract.minor.repTypeGuardian')}</option>
                  <option value="Boshqa">{t('studentsContract.minor.repTypeOther')}</option>
                </select>
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.language')} <span>*</span>
                </label>
                <select
                  className="sc-form-select"
                  value={representative.language}
                  onChange={(e) => handleRepChange('language', e.target.value)}
                >
                  <option value="uz">UZ</option>
                  <option value="ru">RU</option>
                  <option value="en">EN</option>
                </select>
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.birthDate')} <span>*</span>
                </label>
                <DateInput
                  className="sc-form-input"
                  value={representative.birth_date}
                  onChange={(e) => handleRepChange('birth_date', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.passport')} <span>*</span>
                </label>
                <div className="sc-passport-group" style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="sc-passport-series"
                    style={{
                      width: '80px',
                      textTransform: 'uppercase',
                    }}
                    placeholder="AA"
                    maxLength={2}
                    value={representative.passport_series}
                    onChange={(e) => handleRepChange('passport_series', e.target.value)}
                  />
                  <input
                    type="text"
                    className="sc-passport-number"
                    style={{
                      flex: 1,
                    }}
                    placeholder="1234567"
                    maxLength={7}
                    value={representative.passport_number}
                    onChange={(e) => handleRepChange('passport_number', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.passportGivenDate')} <span>*</span>
                </label>
                <DateInput
                  className="sc-form-input"
                  value={representative.passport_given_date}
                  onChange={(e) => handleRepChange('passport_given_date', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.minor.passportExpiry')}
                </label>
                <DateInput
                  className="sc-form-input"
                  value={representative.passport_expiry_date}
                  onChange={(e) => handleRepChange('passport_expiry_date', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.passportGivenBy')} <span>*</span>
                </label>
                <input
                  type="text"
                  className="sc-form-input"
                  placeholder="Kiriting"
                  value={representative.passport_given_by}
                  onChange={(e) => handleRepChange('passport_given_by', e.target.value)}
                />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.lastName')} <span>*</span>
                </label>
                <input
                  type="text"
                  className="sc-form-input"
                  placeholder="Kiriting"
                  value={representative.last_name}
                  onChange={(e) => handleRepChange('last_name', e.target.value)}
                />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.firstName')} <span>*</span>
                </label>
                <input
                  type="text"
                  className="sc-form-input"
                  placeholder="Kiriting"
                  value={representative.first_name}
                  onChange={(e) => handleRepChange('first_name', e.target.value)}
                />
              </div>
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.form.fatherName')} <span>*</span>
                </label>
                <input
                  type="text"
                  className="sc-form-input"
                  placeholder="Kiriting"
                  value={representative.father_name}
                  onChange={(e) => handleRepChange('father_name', e.target.value)}
                />
              </div>
            </div>

            {representative.phones.map((phone, pIdx) => (
              <div
                key={pIdx}
                className="sc-form-row"
                style={{
                  display: 'flex',
                  gap: '18px',
                  marginTop: pIdx > 0 ? '18px' : '0',
                }}
              >
                <div className="sc-form-col" style={{ flex: '0 0 32%' }}>
                  <label className="sc-form-label">
                    {t('studentsContract.minor.phoneLabel', { num: pIdx + 1 })} <span>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <PhoneInput
                      className="sc-form-input"
                      value={phone}
                      onChange={(v) => handleRepPhoneChange(pIdx, v)}
                    />
                    {pIdx === representative.phones.length - 1 ? (
                      <div
                        onClick={addRepPhone}
                        style={{
                          background: '#003366',
                          color: '#fff',
                          height: '42px',
                          width: '42px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <i className="fa-solid fa-plus"></i>
                      </div>
                    ) : (
                      <div
                        onClick={() => removeRepPhone(pIdx)}
                        style={{
                          background: '#fee2e2',
                          color: '#ef4444',
                          height: '42px',
                          width: '42px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <i className="fa-solid fa-trash"></i>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="sc-form-row">
              <div className="sc-form-col">
                <label className="sc-form-label">
                  {t('studentsContract.minor.registeredAddress')} <span>*</span>
                </label>
                <input
                  type="text"
                  className="sc-form-input"
                  placeholder="Kiriting"
                  value={representative.registered_address}
                  onChange={(e) => handleRepChange('registered_address', e.target.value)}
                />
              </div>
            </div>

            <div className="sc-form-row">
              <div className="sc-form-col" style={{ flex: 1 }}>
                <label className="sc-form-label">
                  {t('studentsContract.minor.realAddress')} <span>*</span>
                </label>
                <textarea
                  className="sc-form-textarea"
                  style={{
                    minHeight: '100px',
                    width: '100%',
                  }}
                  placeholder="Kiriting"
                  value={representative.residential_address}
                  onChange={(e) => handleRepChange('residential_address', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div
            className="sc-form-actions"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '20px',
            }}
          >
            <button
              className="sc-form-next-btn"
              onClick={() => {
                if (isStep1Valid()) setStep(2);
                else {
                  notifications.show({
                    title: t('studentsContract.minor.errorTitle'),
                    message: t('studentsContract.minor.errorRepMsg'),
                    color: 'red',
                  });
                }
              }}
            >
              {t('studentsContract.minor.next')}
            </button>
            <button
              className="sc-form-cancel-btn"
              onClick={() => navigate('/students-contract')}
            >
              {t('studentsContract.form.cancel')}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {students.map((student, index) => (
            <MinorStudentCard
              key={index}
              student={student}
              index={index}
              onChange={handleStudentChange}
              onRemove={removeStudent}
              showRemove={students.length > 1}
              allGroups={allGroups || []}
              allCourses={allCourses || []}
            />
          ))}

          <button
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
            onClick={addStudent}
          >
            {t('studentsContract.minor.addStudent')}
          </button>

          <div
            className="sc-form-actions"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '20px',
            }}
          >
            <button
              className="sc-form-prev-btn"
              onClick={() => setStep(1)}
            >
              {t('studentsContract.minor.prev')}
            </button>
            <button
              className="sc-form-cancel-btn"
              onClick={() => navigate('/students-contract')}
            >
              {t('studentsContract.form.cancel')}
            </button>
            <button
              className="sc-form-save-btn"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? t('studentsContract.form.saving')
                : t('studentsContract.form.save')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default UnderAge;
