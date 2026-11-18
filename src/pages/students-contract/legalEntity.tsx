import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import {
  type OrganizationFormData,
  emptyOrganization,
  type OrganizationStudentFormData,
  emptyOrganizationStudent,
} from '@/types/studentContract.types';
import { LID_STATUS, type Lid } from '@/types/lid.types';
import { advanceLidStatus } from '@/pages/lid/lid.service';
import './studentsContracts.css';
import { API } from '@/api/api';
import { useOptions, optionLabel, type Option } from '@/api/options';
import { useLidSearch } from './useLidSearch';
import { lookupPersonByJshshir, applyPersonMatch } from './jshshirLookup';
import { findMissingField, isValidLidId, type FieldPair } from './requiredFields';
import DateInput from '@/components/DateInput';
import PhoneInput from '@/components/PhoneInput';
import { PHONE_PREFIX, formatPhone, isValidPhone, toApiPhone, toApiPhones } from '@/utils/phone';

const formatDateForInput = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ToggleButton = ({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (val: string) => void;
}) => (
  <div
    style={{
      display: 'flex',
      background: '#fff',
      border: '1px solid #cbd5e1',
      borderRadius: '10px',
      padding: '2px',
      width: 'fit-content',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}
  >
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        style={{
          padding: '8px 24px',
          borderRadius: '8px',
          border: 'none',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          background: value === opt.value ? '#003366' : 'transparent',
          color: value === opt.value ? '#fff' : '#64748b',
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const OrganizationStudentCard = ({
  student,
  index,
  onChange,
  onRemove,
  showRemove,
  allGroups,
  allCourses,
  jshStatus = 'idle',
  jshMatchName = '',
}: {
  student: OrganizationStudentFormData;
  index: number;
  onChange: (
    index: number,
    field: keyof OrganizationStudentFormData,
    value: string | boolean,
  ) => void;
  onRemove: (index: number) => void;
  showRemove: boolean;
  allGroups: Option[];
  allCourses: Option[];
  jshStatus?: 'idle' | 'loading' | 'found' | 'none';
  jshMatchName?: string;
}) => {
  const { t, i18n } = useTranslation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { results: filteredLids, isSearching } = useLidSearch(searchTerm, showDropdown);

  // Guruhlar tanlangan kurs va bosqichga mos kelsagina tanlanadi
  const filteredGroups =
    student.course_id && student.level_id
      ? (allGroups || []).filter(
          (g) =>
            String(g.course_id ?? '') === student.course_id &&
            String(g.level_id ?? '') === student.level_id,
        )
      : [];

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
    onChange(index, 'lid_id', String(lid.id));
    onChange(index, 'first_name', lid.first_name || student.first_name);
    onChange(index, 'last_name', lid.last_name || student.last_name);
    onChange(index, 'father_name', lid.father_name || student.father_name);
    onChange(index, 'birth_date', lid.birth_date || student.birth_date);
    onChange(index, 'phone', lid.phone ? formatPhone(lid.phone) : student.phone);
    onChange(index, 'course_id', lid.course_id ? String(lid.course_id) : student.course_id);
    onChange(index, 'group_id', lid.group_id ? String(lid.group_id) : student.group_id);
    const addressStr = [
      lid.region?.name_uz || lid.region?.name_uz,
      lid.district?.name_uz || lid.district?.name_uz,
    ]
      .filter(Boolean)
      .join(', ');

    onChange(index, 'level_id', lid.level_id ? String(lid.level_id) : student.level_id);
    onChange(index, 'residential_address', addressStr || student.residential_address);
    onChange(index, 'registered_address', addressStr || student.registered_address);
    onChange(
      index,
      'monthly_price',
      lid.course_price?.new_price
        ? String(lid.course_price.new_price)
        : student.monthly_price || '',
    );

    setShowDropdown(false);
    setSearchTerm('');
  };

  return (
    <div
      className="sc-form-card"
      style={{
        background: '#fff',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        marginBottom: '20px',
        position: 'relative',
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
        <h3 style={{ margin: 0, fontSize: '18px', color: '#003366' }}>
          {t('studentsContract.legal.studentNum', { num: index + 1 })}
        </h3>
        {showRemove && (
          <button
            onClick={() => onRemove(index)}
            style={{
              background: '#fff5f5',
              color: '#e53e3e',
              border: '1px solid #feb2b2',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            <i className="fa-solid fa-trash-can" style={{ marginRight: '6px' }}></i>{' '}
            {t('studentsContract.legal.remove')}
          </button>
        )}
      </div>

      <div className="sc-form-row">
        <div className="sc-form-col" style={{ flex: 1, marginBottom: '10px' }}>
          <label className="sc-form-label">
            {t('studentsContract.legal.thisPerson')} <span>*</span>
          </label>
          <ToggleButton
            options={[
              { label: t('studentsContract.legal.adultPerson'), value: 'false' },
              { label: t('studentsContract.legal.minorPerson'), value: 'true' },
            ]}
            value={String(student.is_minor)}
            onChange={(val) => onChange(index, 'is_minor', val === 'true')}
          />
        </div>
      </div>

      <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
        <div className="sc-form-col" style={{ position: 'relative', flex: 1 }} ref={dropdownRef}>
          <label className="sc-form-label">
            {t('studentsContract.form.lidId')} <span>*</span>
          </label>
          <input
            type="text"
            className="sc-form-input"
            placeholder={t('studentsContract.form.lidSearchPlaceholder')}
            value={student.lid_id || searchTerm}
            onFocus={() => setShowDropdown(true)}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
              if (!e.target.value) onChange(index, 'lid_id', '');
            }}
          />
          {showDropdown && (
            <div
              className="sc-lid-dropdown"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 100,
                maxHeight: '250px',
                overflowY: 'auto',
                marginTop: '4px',
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
              ) : filteredLids.length > 0 ? (
                filteredLids.map((lid) => (
                  <div
                    key={lid.id}
                    className="sc-lid-option"
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                    onClick={() => handleLidSelect(lid)}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                      ID: {lid.id} - {lid.first_name} {lid.last_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {lid.phone} | {lid.course?.name_uz || t('studentsContract.legal.noCourse')}
                    </div>
                  </div>
                ))
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
        <div className="sc-form-col" style={{ flex: 1 }}>
          <label className="sc-form-label">
            {t('studentsContract.form.jshshir')} <span>*</span>
          </label>
          <div className="sc-jshshir-field">
            <input
              type="text"
              className="sc-form-input"
              placeholder="00000000000000"
              maxLength={14}
              value={student.jshshir}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                if (val.length <= 14) onChange(index, 'jshshir', val);
              }}
            />
            {jshStatus === 'loading' && (
              <i className="fa-solid fa-spinner fa-spin sc-jshshir-spinner" aria-hidden="true" />
            )}
          </div>
          {jshStatus === 'loading' && (
            <div className="sc-jshshir-hint">{t('studentsContract.autofill.checking')}</div>
          )}
          {jshStatus === 'found' && (
            <div className="sc-jshshir-hint sc-jshshir-hint--ok">
              {t('studentsContract.autofill.found', { name: jshMatchName })}
            </div>
          )}
          {jshStatus === 'none' && (
            <div className="sc-jshshir-hint">
              {t('studentsContract.autofill.notFoundInline')}
            </div>
          )}
        </div>
      </div>

      <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
        {student.is_minor ? (
          <>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.birthCertSeriesNum')} <span>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="sc-passport-series"
                  style={{
                    width: '80px',
                    textTransform: 'uppercase',
                  }}
                  placeholder="AA"
                  maxLength={4}
                  value={student.birth_cert_series}
                  onChange={(e) =>
                    onChange(index, 'birth_cert_series', e.target.value.toUpperCase())
                  }
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
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.form.passportGivenDate')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={student.birth_cert_given_date}
                onChange={(e) => onChange(index, 'birth_cert_given_date', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
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
          </>
        ) : (
          <>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.passportSeriesNum')} <span>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="sc-passport-series"
                  style={{
                    width: '80px',
                    textTransform: 'uppercase',
                  }}
                  placeholder="AA"
                  maxLength={2}
                  value={student.passport_series}
                  onChange={(e) => onChange(index, 'passport_series', e.target.value.toUpperCase())}
                />
                <input
                  type="text"
                  className="sc-passport-number"
                  style={{
                    flex: 1,
                  }}
                  placeholder="Raqam"
                  maxLength={7}
                  value={student.passport_number}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 7) onChange(index, 'passport_number', val);
                  }}
                />
              </div>
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.form.passportGivenDate')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={student.passport_given_date}
                onChange={(e) => onChange(index, 'passport_given_date', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.passportExpiry')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={student.passport_expiry_date}
                onChange={(e) => onChange(index, 'passport_expiry_date', e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
        <div className="sc-form-col" style={{ flex: 1 }}>
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
        <div className="sc-form-col" style={{ flex: 1 }}>
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
        <div className="sc-form-col" style={{ flex: 1 }}>
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

      <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
        <div className="sc-form-col" style={{ flex: 1 }}>
          <label className="sc-form-label">
            {t('studentsContract.form.birthDate')} <span>*</span>
          </label>
          <DateInput
            className="sc-form-input"
            value={student.birth_date}
            onChange={(e) => onChange(index, 'birth_date', e.target.value)}
          />
        </div>
        <div className="sc-form-col" style={{ flex: 1 }}>
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
        <div className="sc-form-col" style={{ flex: 1 }}>
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
      </div>

      <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
        <div className="sc-form-col" style={{ flex: 1 }}>
          <label className="sc-form-label">{t('studentsContract.form.monthlyPrice')}</label>
          <input
            type="number"
            className="sc-form-input"
            placeholder="500000"
            value={student.monthly_price}
            onChange={(e) => onChange(index, 'monthly_price', e.target.value)}
          />
        </div>
        <div className="sc-form-col" style={{ flex: 1 }}>
          <label className="sc-form-label">{t('studentsContract.form.totalPrice')}</label>
          <input
            type="number"
            className="sc-form-input"
            placeholder="3000000"
            value={student.total_price}
            onChange={(e) => onChange(index, 'total_price', e.target.value)}
          />
        </div>
        <div className="sc-form-col" style={{ flex: 1 }}>
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

      <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
        <div className="sc-form-col" style={{ flex: 1 }}>
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
          <label className="sc-form-label">{t('studentsContract.form.courseStartDate')}</label>
          <DateInput
            className="sc-form-input"
            value={student.course_start_date}
            onChange={(e) => onChange(index, 'course_start_date', e.target.value)}
          />
        </div>
        <div className="sc-form-col" style={{ flex: 1 }}>
          <label className="sc-form-label">{t('studentsContract.form.courseEndDate')}</label>
          <DateInput
            className="sc-form-input"
            value={student.course_end_date}
            onChange={(e) => onChange(index, 'course_end_date', e.target.value)}
          />
        </div>
      </div>

      <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
        <div className="sc-form-col" style={{ flex: 1 }}>
          <label className="sc-form-label">
            {t('studentsContract.legal.residentialAddress')} <span>*</span>
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
        {!student.is_minor && (
          <div className="sc-form-col" style={{ flex: 1 }}>
            <label className="sc-form-label">
              {t('studentsContract.legal.registeredAddress')} <span>*</span>
            </label>
            <textarea
              className="sc-form-textarea"
              style={{
                minHeight: '80px',
                width: '100%',
              }}
              placeholder="Kiriting"
              value={student.registered_address}
              onChange={(e) => onChange(index, 'registered_address', e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const LegalEntity = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [organization, setOrganization] = useState<OrganizationFormData>({
    ...emptyOrganization,
  });
  const [students, setStudents] = useState<OrganizationStudentFormData[]>([
    { ...emptyOrganizationStudent },
  ]);

  // Har o'quvchi qatori uchun JSHSHR tekshiruvi holati (input yonidagi
  // spinner + natija yozuvi). Kalit — qator indeksi.
  const [jshByIdx, setJshByIdx] = useState<
    Record<number, { state: 'idle' | 'loading' | 'found' | 'none'; name?: string }>
  >({});

  const { data: contractToEdit, isLoading: isFetchingContract } = useQuery({
    queryKey: ['student-contract', id],
    queryFn: () => API.get(`/student-contracts/${id}`).then((res) => res.data),
    enabled: !!id,
  });

  useEffect(() => {
    if (contractToEdit && id) {
      const contract = contractToEdit.contract || contractToEdit.data || contractToEdit;
      if (contract.organization) {
        const o = contract.organization;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrganization({
          inn: o.stir || '',
          language: contract.language || 'uz',
          branch_id: String(contract.branch_id || ''),
          city: contract.branch?.city || '',
          contract_date: formatDateForInput(contract.contract_date),
          has_trustee: o.has_power_of_attorney ? 'Ishonchnoma bilan' : 'Ishonchnomasiz',
          trustee_date: formatDateForInput(o.power_of_attorney_date),
          trustee_number: o.power_of_attorney_number || '',
          organization_name: o.organization_name || '',
          organization_branch: o.has_branch ? 'bor' : "yo'q",
          branch_name: o.org_branch_name || '',
          branch_address: o.org_branch_address || '',
          director_last_name: o.director_last_name || '',
          director_first_name: o.director_first_name || '',
          director_father_name: o.director_father_name || '',
          contract_start_date: formatDateForInput(o.contract_start_date),
          contract_end_date: formatDateForInput(o.contract_end_date),
          phones: [formatPhone(o.phone)],
          ifut: o.ifut_oked || '',
          account_number: o.bank_account || '',
          bank_name: o.bank_name || '',
          mfo: o.mfo || '',
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
            is_minor: !!s.is_minor,
            passport_series: s.passport_series || '',
            passport_number: s.passport_number || '',
            passport_given_date: formatDateForInput(
              s.passport_given_date as string | null | undefined,
            ),
            passport_expiry_date: formatDateForInput(
              s.passport_expiry_date as string | null | undefined,
            ),
            registered_address: s.registered_address || '',
          })) as OrganizationStudentFormData[],
        );
      }
    }
  }, [contractToEdit, id]);

  const { data: allGroups } = useOptions('groups');

  const { data: allCourses } = useOptions('courses');

  const { data: branchesData } = useOptions('branches');
  const branches = branchesData ?? [];

  const handleOrgChange = (field: keyof OrganizationFormData, value: string) => {
    let finalValue = value;
    if (
      field === 'inn' ||
      field === 'mfo' ||
      field === 'account_number' ||
      field === 'trustee_number' ||
      field === 'ifut'
    ) {
      finalValue = value.replace(/\D/g, '');
    }
    setOrganization((prev) => ({ ...prev, [field]: finalValue }));
  };

  const handlePhoneChange = (index: number, value: string) => {
    const newPhones = [...organization.phones];
    newPhones[index] = formatPhone(value);
    setOrganization((prev) => ({ ...prev, phones: newPhones }));
  };

  const addPhone = () => {
    setOrganization((prev) => ({ ...prev, phones: [...prev.phones, PHONE_PREFIX] }));
  };

  const removePhone = (index: number) => {
    if (organization.phones.length > 1) {
      const newPhones = organization.phones.filter((_, i) => i !== index);
      setOrganization((prev) => ({ ...prev, phones: newPhones }));
    }
  };

  const handleStudentChange = (
    index: number,
    field: keyof OrganizationStudentFormData,
    value: string | boolean,
  ) => {
    let finalValue = value;
    if (field === 'phone' && typeof value === 'string') finalValue = formatPhone(value);
    if (field === 'jshshir' && typeof value === 'string') {
      finalValue = value.replace(/\D/g, '').slice(0, 14);
    }
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

    if (field === 'jshshir' && typeof finalValue === 'string' && !id) {
      const jshshir = finalValue;
      if (jshshir.length !== 14) {
        setJshByIdx((p) => ({ ...p, [index]: { state: 'idle' } }));
      } else {
        setJshByIdx((p) => ({ ...p, [index]: { state: 'loading' } }));
        void lookupPersonByJshshir(jshshir)
          .then((match) => {
            setJshByIdx((p) =>
              // Qator o'sha payt boshqa JSHSHR ga o'tgan bo'lsa — tegilmaydi.
              p[index]?.state !== 'loading'
                ? p
                : {
                    ...p,
                    [index]: match
                      ? { state: 'found', name: match.displayName }
                      : { state: 'none' },
                  },
            );
            if (!match) return;
            setStudents((prev) =>
              prev.map((s, i) =>
                i === index && s.jshshir === jshshir ? applyPersonMatch(s, match) : s,
              ),
            );
            notifications.show({
              color: 'green',
              message: t('studentsContract.autofill.found', { name: match.displayName }),
            });
          })
          .catch(() => setJshByIdx((p) => ({ ...p, [index]: { state: 'idle' } })));
      }
    }
  };

  const addStudent = () => setStudents((prev) => [...prev, { ...emptyOrganizationStudent }]);
  const removeStudent = (index: number) => {
    if (students.length > 1) setStudents((prev) => prev.filter((_, i) => i !== index));
  };

  const isStep1Valid = () => {
    const o = organization;
    return (
      o.inn &&
      o.organization_name &&
      isValidPhone(o.phones[0]) &&
      o.account_number &&
      o.bank_name &&
      o.mfo &&
      o.director_first_name &&
      o.director_last_name
    );
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => API.post('/student-contracts', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-contracts'] });
      // Shartnomadagi har bir o'quvchi o'z lidini "Shartnoma" ustuniga
      // o'tkazadi (lidsiz qo'shilgan o'quvchi uchun jimgina hech narsa).
      students.forEach((s) => advanceLidStatus(s.lid_id, LID_STATUS.CONTRACT_SIGNED));
      notifications.show({
        title: t('studentsContract.legal.successTitle'),
        message: t('studentsContract.legal.contractCreated'),
        color: 'green',
      });
      navigate('/students-contract');
    },
    onError: () =>
      notifications.show({
        title: t('studentsContract.legal.errorTitle'),
        message: t('studentsContract.legal.createError'),
        color: 'red',
      }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => API.put(`/student-contracts/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-contracts'] });
      notifications.show({
        title: t('studentsContract.legal.successTitle'),
        message: t('studentsContract.legal.contractUpdated'),
        color: 'green',
      });
      navigate('/students-contract');
    },
    onError: () =>
      notifications.show({
        title: t('studentsContract.legal.errorTitle'),
        message: t('studentsContract.legal.updateError'),
        color: 'red',
      }),
  });

  const handleSubmit = () => {
    // Tashkilot maydonlari to'liq to'ldirilishi shart
    const orgFields: FieldPair[] = [
      [t('studentsContract.legal.orgStir'), organization.inn],
      [t('studentsContract.form.language'), organization.language],
      [t('studentsContract.legal.branch'), organization.branch_id],
      [t('studentsContract.form.contractDate'), organization.contract_date],
      [t('studentsContract.legal.orgName'), organization.organization_name],
      ...(organization.has_trustee === 'Ishonchnoma bilan'
        ? ([
            [t('studentsContract.legal.trusteeDate'), organization.trustee_date],
            [t('studentsContract.legal.trusteeNum'), organization.trustee_number],
          ] as FieldPair[])
        : []),
      ...(organization.organization_branch === 'bor'
        ? ([
            [t('studentsContract.legal.branchName'), organization.branch_name],
            [t('studentsContract.legal.branchAddress'), organization.branch_address],
          ] as FieldPair[])
        : []),
      [t('studentsContract.legal.directorLastName'), organization.director_last_name],
      [t('studentsContract.legal.directorFirstName'), organization.director_first_name],
      [t('studentsContract.legal.directorFatherName'), organization.director_father_name],
      [t('studentsContract.legal.contractStartDate'), organization.contract_start_date],
      [t('studentsContract.legal.contractEndDate'), organization.contract_end_date],
      [t('studentsContract.form.phone'), toApiPhone(organization.phones[0])],
      [t('studentsContract.legal.ifut'), organization.ifut],
      [t('studentsContract.legal.accountNum'), organization.account_number],
      [t('studentsContract.legal.bankName'), organization.bank_name],
      [t('studentsContract.legal.mfo'), organization.mfo],
    ];
    const missingOrg = findMissingField(orgFields);
    if (missingOrg) {
      notifications.show({
        title: t('studentsContract.form.requiredTitle'),
        message: t('studentsContract.form.requiredField', { field: missingOrg }),
        color: 'red',
      });
      setStep(1);
      return;
    }

    // Tashkilotning barcha raqamlari `+998` + 9 raqam formatida bo'lishi kerak
    if (organization.phones.some((p) => !isValidPhone(p))) {
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
        [t('studentsContract.form.jshshir'), s.jshshir],
        ...(s.is_minor
          ? ([
              [t('studentsContract.legal.birthCertSeriesNum'), s.birth_cert_series],
              [t('studentsContract.legal.birthCertSeriesNum'), s.birth_cert_number],
              [t('studentsContract.form.passportGivenDate'), s.birth_cert_given_date],
            ] as FieldPair[])
          : ([
              [t('studentsContract.legal.passportSeriesNum'), s.passport_series],
              [t('studentsContract.legal.passportSeriesNum'), s.passport_number],
              [t('studentsContract.form.passportGivenDate'), s.passport_given_date],
              [t('studentsContract.legal.passportExpiry'), s.passport_expiry_date],
            ] as FieldPair[])),
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
        [t('studentsContract.legal.residentialAddress'), s.residential_address],
        [t('studentsContract.legal.registeredAddress'), s.registered_address],
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
      contract_type: 'legal_bilateral',
      language: organization.language,
      branch_id: Number(organization.branch_id),
      city: organization.city,
      contract_date: organization.contract_date || null,
      organization: {
        stir: organization.inn,
        organization_name: organization.organization_name,
        has_power_of_attorney: organization.has_trustee === 'Ishonchnoma bilan',
        power_of_attorney_date: organization.trustee_date || null,
        power_of_attorney_number: organization.trustee_number || null,
        has_branch: organization.organization_branch === 'bor',
        org_branch_name: organization.branch_name || null,
        org_branch_address: organization.branch_address || null,
        director_first_name: organization.director_first_name,
        director_last_name: organization.director_last_name,
        director_father_name: organization.director_father_name,
        phone: toApiPhone(organization.phones[0]),
        extra_phones: toApiPhones(organization.phones.slice(1)),
        ifut_oked: organization.ifut,
        bank_account: organization.account_number,
        bank_name: organization.bank_name,
        mfo: organization.mfo,
        contract_start_date: organization.contract_start_date || null,
        contract_end_date: organization.contract_end_date || null,
      },
      students: students.map((s, idx) => {
        const studentPayload: Record<string, unknown> = {
          ...s,
          phone: toApiPhone(s.phone),
          lid_id: Number(s.lid_id),
          course_id: Number(s.course_id),
          level_id: Number(s.level_id),
          group_id: Number(s.group_id),
          monthly_price: Number(s.monthly_price) || 0,
          total_price: Number(s.total_price) || 0,
          course_start_date: s.course_start_date,
          course_end_date: s.course_end_date,
        };
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
          style={{
            textTransform: 'uppercase',
            fontFamily: 'noto-sb',
            fontSize: '16px',
            color: '#000',
          }}
        >
          {t('studentsContract.legal.title')}
        </span>
      </div>

      <div
        className="sc-step-bar"
        style={{
          display: 'flex',
          background: '#003366',
          borderRadius: '40px',
          margin: '16px 0',
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
          {t('studentsContract.legal.step1')}
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
            else
              notifications.show({
                title: t('studentsContract.legal.errorTitle'),
                message: t('studentsContract.legal.errorOrgMsg'),
                color: 'red',
              });
          }}
        >
          {t('studentsContract.legal.step2')}
        </div>
      </div>

      {step === 1 && (
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
          <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
            <div className="sc-form-col" style={{ flex: 2 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.orgStir')} <span>*</span>
              </label>
              <div className="sc-stir-wrap">
                <input
                  type="text"
                  className="sc-form-input sc-stir-input"
                  inputMode="numeric"
                  placeholder="000000000"
                  value={organization.inn}
                  onChange={(e) => handleOrgChange('inn', e.target.value)}
                />
                <a
                  className="sc-stir-link"
                  href="https://fo.birdarcha.uz/pub/search"
                  target="_blank"
                  rel="noopener noreferrer">
                  {t('studentsContract.legal.checkReestor')}
                  <i className="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
              </div>
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.form.language')} <span>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  className="sc-form-select"
                  style={{
                    appearance: 'none',
                  }}
                  value={organization.language}
                  onChange={(e) => handleOrgChange('language', e.target.value)}
                >
                  <option value="uz">UZ</option>
                  <option value="ru">RU</option>
                  <option value="en">EN</option>
                </select>
                <i
                  className="fa-solid fa-caret-down"
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#003366',
                    pointerEvents: 'none',
                  }}
                ></i>
              </div>
            </div>
          </div>

          <div className="sc-form-row" style={{ display: 'flex', gap: '18px', marginTop: '18px' }}>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.branch')} <span>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  className="sc-form-select"
                  style={{
                    appearance: 'none',
                  }}
                  value={organization.branch_id}
                  onChange={(e) => {
                    const branchId = e.target.value;
                    const selectedBranch = branches.find((b) => String(b.id) === branchId);
                    if (selectedBranch) {
                      setOrganization((prev) => ({
                        ...prev,
                        branch_id: branchId,
                        city: selectedBranch.city || '',
                      }));
                    } else {
                      handleOrgChange('branch_id', branchId);
                    }
                  }}
                >
                  <option value="">{t('studentsContract.form.select')}</option>
                  {branches?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <i
                  className="fa-solid fa-caret-down"
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#003366',
                    pointerEvents: 'none',
                  }}
                ></i>
              </div>
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">{t('studentsContract.form.city')}</label>
              <input
                type="text"
                className="sc-form-input"
                placeholder={t('studentsContract.legal.autoFill')}
                value={organization.city}
                readOnly
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.form.contractDate')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={organization.contract_date}
                onChange={(e) => handleOrgChange('contract_date', e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: '20px 0',
            }}
          >
            <div
              style={{
                background: '#FFEFDB',
                color: '#FE9100',
                padding: '8px',
                borderRadius: '8px',
              }}
            >
              <i className="fa-solid fa-building"></i>
            </div>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>
              {t('studentsContract.legal.orgInfoTitle')}
            </h3>
          </div>

          <div className="sc-form-row" style={{ display: 'flex', gap: '18px' }}>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.trustee')} <span>*</span>
              </label>
              <ToggleButton
                options={[
                  { label: t('studentsContract.legal.noTrustee'), value: 'Ishonchnomasiz' },
                  { label: t('studentsContract.legal.hasTrustee'), value: 'Ishonchnoma bilan' },
                ]}
                value={organization.has_trustee}
                onChange={(val) => handleOrgChange('has_trustee', val)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.trusteeDate')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={organization.trustee_date}
                onChange={(e) => handleOrgChange('trustee_date', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.trusteeNum')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="kiriting"
                value={organization.trustee_number}
                onChange={(e) => handleOrgChange('trustee_number', e.target.value)}
              />
            </div>
          </div>

          <div className="sc-form-row" style={{ display: 'flex', gap: '18px', marginTop: '18px' }}>
            <div className="sc-form-col" style={{ flex: 2 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.orgName')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={organization.organization_name}
                onChange={(e) => handleOrgChange('organization_name', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.orgBranch')} <span>*</span>
              </label>
              <ToggleButton
                options={[
                  { label: t('studentsContract.legal.noOrgBranch'), value: "yo'q" },
                  { label: t('studentsContract.legal.hasOrgBranch'), value: 'bor' },
                ]}
                value={organization.organization_branch}
                onChange={(val) => handleOrgChange('organization_branch', val)}
              />
            </div>
          </div>

          {organization.organization_branch === 'bor' && (
            <>
              <div className="sc-form-row" style={{ marginTop: '18px' }}>
                <div className="sc-form-col">
                  <label className="sc-form-label">
                    {t('studentsContract.legal.branchName')} <span>*</span>
                  </label>
                  <input
                    type="text"
                    className="sc-form-input"
                    placeholder="Kiriting"
                    value={organization.branch_name}
                    onChange={(e) => handleOrgChange('branch_name', e.target.value)}
                  />
                </div>
              </div>

              <div className="sc-form-row" style={{ marginTop: '18px' }}>
                <div className="sc-form-col">
                  <label className="sc-form-label">
                    {t('studentsContract.legal.branchAddress')} <span>*</span>
                  </label>
                  <input
                    type="text"
                    className="sc-form-input"
                    placeholder="Kiriting"
                    value={organization.branch_address}
                    onChange={(e) => handleOrgChange('branch_address', e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="sc-form-row" style={{ display: 'flex', gap: '18px', marginTop: '18px' }}>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.directorLastName')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={organization.director_last_name}
                onChange={(e) => handleOrgChange('director_last_name', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.directorFirstName')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={organization.director_first_name}
                onChange={(e) => handleOrgChange('director_first_name', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.directorFatherName')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={organization.director_father_name}
                onChange={(e) => handleOrgChange('director_father_name', e.target.value)}
              />
            </div>
          </div>

          <div className="sc-form-row" style={{ display: 'flex', gap: '18px', marginTop: '18px' }}>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.contractStartDate')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={organization.contract_start_date}
                onChange={(e) => handleOrgChange('contract_start_date', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.contractEndDate')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={organization.contract_end_date}
                onChange={(e) => handleOrgChange('contract_end_date', e.target.value)}
              />
            </div>
          </div>

          {organization.phones.map((phone, idx) => (
            <div
              key={idx}
              className="sc-form-row"
              style={{ display: 'flex', gap: '18px', marginTop: '18px' }}
            >
              <div className="sc-form-col" style={{ flex: 1 }}>
                <label className="sc-form-label">
                  {t('studentsContract.legal.phoneLabel', { num: idx + 1 })} <span>*</span>
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <PhoneInput
                    className="sc-form-input"
                    value={phone}
                    onChange={(v) => handlePhoneChange(idx, v)}
                  />
                  {idx === organization.phones.length - 1 ? (
                    <div
                      onClick={addPhone}
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
                      onClick={() => removePhone(idx)}
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

          <div className="sc-form-row" style={{ display: 'flex', gap: '18px', marginTop: '18px' }}>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.ifut')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={organization.ifut}
                onChange={(e) => handleOrgChange('ifut', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.accountNum')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={organization.account_number}
                onChange={(e) => handleOrgChange('account_number', e.target.value)}
              />
            </div>
            <div className="sc-form-col" style={{ flex: 1 }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.bankName')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={organization.bank_name}
                onChange={(e) => handleOrgChange('bank_name', e.target.value)}
              />
            </div>
          </div>

          <div className="sc-form-row" style={{ display: 'flex', gap: '18px', marginTop: '18px' }}>
            <div className="sc-form-col" style={{ flex: '0 0 32%' }}>
              <label className="sc-form-label">
                {t('studentsContract.legal.mfo')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={organization.mfo}
                onChange={(e) => handleOrgChange('mfo', e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '30px',
            }}
          >
            <button
              className="sc-form-next-btn"
              onClick={() => {
                if (isStep1Valid()) setStep(2);
                else
                  notifications.show({
                    title: t('studentsContract.legal.errorTitle'),
                    message: t('studentsContract.legal.errorOrgMsg'),
                    color: 'red',
                  });
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
        </div>
      )}

      {step === 2 && (
        <>
          {students.map((s, idx) => (
            <OrganizationStudentCard
              key={idx}
              index={idx}
              student={s}
              onChange={handleStudentChange}
              onRemove={removeStudent}
              showRemove={students.length > 1}
              allGroups={allGroups || []}
              allCourses={allCourses || []}
              jshStatus={jshByIdx[idx]?.state ?? 'idle'}
              jshMatchName={jshByIdx[idx]?.name}
            />
          ))}
          <button
            style={{
              width: '100%',
              padding: '14px',
              border: '2px dashed #FE9100',
              borderRadius: '12px',
              background: '#fff',
              color: '#FE9100',
              cursor: 'pointer',
              marginBottom: '20px',
              fontWeight: '600',
              fontSize: '15px',
            }}
            onClick={addStudent}
          >
            {t('studentsContract.legal.addStudent')}
          </button>
          <div
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

export default LegalEntity;
