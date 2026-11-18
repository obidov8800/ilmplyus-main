import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import useAuthStore from '@/store/useAuthStore';
import './studentsContracts.css';
import {
  emptyStudent,
  type StudentContract,
  type StudentFormData,
} from '@/types/studentContract.types';
import { LID_STATUS, type Lid } from '@/types/lid.types';
import { fetchLidById, advanceLidStatus } from '@/pages/lid/lid.service';
import { fetchAllPages } from '@/api/fetchAllPages';
import { useLidSearch } from './useLidSearch';
import { lookupPersonByJshshir, applyPersonMatch } from './jshshirLookup';
import { findMissingField, type FieldPair } from './requiredFields';
import { notifications } from '@mantine/notifications';
import { API } from '@/api/api';
import SortableTh from '@/components/SortableTh';
import { useTableSort } from '@/hooks/useTableSort';
import { useOptions, optionLabel } from '@/api/options';
import StudentContractView, { smsPhoneOf, makeStudentContractDocument } from './StudentContractView';
import { notifyError } from '@/utils/notify';
import ListToolbar from '@/components/ListToolbar';
import { useContractSms } from '@/hooks/useContractSms';
import { isSmsContractType, smsPermissionFor } from '@/api/contractSms';
import '@/pages/preschool-contracts/preschoolContract.css';
import '@/styles/preschool.css';
import DateInput from '@/components/DateInput';
import PhoneInput from '@/components/PhoneInput';
import { formatPhone, isValidPhone, toApiPhone, toApiPhones } from '@/utils/phone';
import { Pagination } from '@/components/Pagination';
import { type FilterBarField } from '@/components/FilterBar';
import { WriteGuard } from '@/components/Protected';

type ScFilterKey = 'branch' | 'course' | 'group' | 'status' | 'date';

const EMPTY_SC_FILTERS: Record<ScFilterKey, string> = {
  branch: '',
  course: '',
  group: '',
  status: '',
  date: '',
};

const getStatusType = (status: string) => {
  switch (status) {
    case 'active':
      return 'active';
    case 'completed':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    default:
      return 'in_progress';
  }
};

const getStatusKey = (status: string): string => {
  switch (status) {
    case 'active':
      return 'studentsContract.status.active';
    case 'completed':
      return 'studentsContract.status.completed';
    case 'in_progress':
      return 'studentsContract.status.inProgress';
    case 'cancelled':
      return 'studentsContract.status.cancelled';
    case 'expired':
      return 'studentsContract.status.expired';
    default:
      return 'studentsContract.status.inProgress';
  }
};

const getInitials = (first: string = '', last: string = '') => {
  if (!first && !last) return 'N';
  return `${first[0] || ''}${last[0] || ''}`.toUpperCase();
};

/**
 * Bitta shartnomaga bir nechta o'quvchi (`contract_students`) biriktirilgan
 * bo'lishi mumkin. Backend ularni har doim bir xil tartibda qaytarishga
 * kafolat bermaydi (aniq `ORDER BY` yo'q) — shuning uchun oddiy
 * `contract_students?.[0]` sahifa har yangilanganda boshqa o'quvchini
 * "asosiy" qilib ko'rsatib qo'yishi mumkin edi: jadvaldagi ism-familiya,
 * guruh/yo'nalish, hatto TAHRIRLASH formasidagi butun ma'lumot (pasport,
 * manzil, telefon...) — foydalanuvchi "o'quvchi bir xil tartibda
 * turmayapti" deb ko'rgan xatti-harakat aynan shu edi.
 *
 * O'zining `id`si (eng kichigi — kontraktga birinchi qo'shilgani) bo'yicha
 * saralab olish natijani backend javobi tartibidan qat'i nazar DOIM bir
 * xil, barqaror qiladi.
 */
const getPrimaryStudent = <T extends { id: number }>(item: {
  contract_students?: T[];
}): T | undefined => {
  const list = item.contract_students;
  if (!list || list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  return [...list].sort((a, b) => a.id - b.id)[0];
};

const getMainPerson = (item: StudentContract) => {
  const student = getPrimaryStudent(item);
  if (student && (student.first_name || student.last_name)) {
    return {
      name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
      phone: student.phone || '',
      initials: getInitials(student.first_name, student.last_name),
    };
  }

  if (item.representative) {
    return {
      name: `${item.representative.first_name || ''} ${item.representative.last_name || ''}`.trim(),
      phone: item.representative.phone || '',
      initials: getInitials(item.representative.first_name, item.representative.last_name),
    };
  }

  return { name: "Noma'lum", phone: '', initials: 'N' };
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${hours}:${minutes} ${day}.${month}.${year}`;
};

const getCourseGroup = (item: StudentContract) => {
  const student = getPrimaryStudent(item);
  return {
    course: student?.level?.name_uz || 'Kiritilmagan',
    group: student?.group?.name || 'Kiritilmagan',
  };
};

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

const AdultContractForm = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const [formData, setFormData] = useState<StudentFormData>({
    ...emptyStudent,
  });
  const [studentId, setStudentId] = useState<number | null>(null);
  const [lidSearchTerm, setLidSearchTerm] = useState('');
  const [showLidDropdown, setShowLidDropdown] = useState(false);
  const [pendingLidId, setPendingLidId] = useState<number | null>(
    (location.state as { lidId?: number } | null)?.lidId ?? null,
  );

  const { data: contractToEdit, isLoading: isFetchingContract } = useQuery({
    queryKey: ['student-contract', id],
    queryFn: () => API.get(`/student-contracts/${id}`).then((res) => res.data),
    enabled: !!id,
  });

  useEffect(() => {
    if (contractToEdit && id) {
      const contract = contractToEdit.contract || contractToEdit.data || contractToEdit;
      // `contract` shu yerda tiplanmagan (xom API javobi) — qolgan maydonlar
      // kabi `student` ham erkin shaklda ishlatiladi.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const student = getPrimaryStudent<any>(contract);
      if (student) {
         
        setStudentId(student.id || null);
        setFormData({
          lid_id: String(student.lid_id),
          jshshir: student.jshshir || '',
          language: contract.language || 'uz',
          citizenship: student.citizenship || 'citizen',
          branch_id: contract.branch_id ? String(contract.branch_id) : '',
          city: contract.branch?.city || '',
          passport_series: (student.passport_series || '').toUpperCase(),
          passport_number: student.passport_number || '',
          passport_given_date: formatDateForInput(student.passport_given_date),
          passport_expiry_date: formatDateForInput(student.passport_expiry_date),
          passport_given_by: student.passport_given_by || '',
          birth_place: student.birth_place || '',
          last_name: student.last_name || '',
          first_name: student.first_name || '',
          father_name: student.father_name || '',
          birth_date: formatDateForInput(student.birth_date),
          group_id: student.group_id ? String(student.group_id) : '',
          course_id: student.course_id ? String(student.course_id) : '',
          level_id: student.level_id ? String(student.level_id) : '',
          // Asosiy raqam birinchi, qo'shimcha raqamlar ortidan (formadagi tartibda)
          phones: [
            student.phone ? formatPhone(student.phone) : '+998',
            ...(student.extra_phones || []).map(formatPhone),
          ],
          residential_address: student.residential_address || '',
          registered_address: student.registered_address || '',
          monthly_price: student.monthly_price ? String(student.monthly_price) : '',
          total_price: student.total_price ? String(student.total_price) : '',
          course_start_date: formatDateForInput(student.course_start_date),
          course_end_date: formatDateForInput(student.course_end_date),
          contract_date: formatDateForInput(contract.contract_date),
          end_date: formatDateForInput(contract.end_date),
          notes: contract.notes || '',
        });

        setLidSearchTerm(String(student.lid_id));
      }
    }
  }, [contractToEdit, id]);

  // Liddan kelganda faqat shu lidni id bo'yicha olamiz — 1000 talik ro'yxat kerak emas
  const { data: pendingLid } = useQuery({
    queryKey: ['lid', pendingLidId],
    queryFn: () => fetchLidById(pendingLidId!),
    enabled: !!pendingLidId,
  });

  // Qo'lda qidirish server tomonda bajariladi — 1000 talik ro'yxat yuklanmaydi
  const { results: searchResults, isSearching } = useLidSearch(
    lidSearchTerm,
    showLidDropdown && lidSearchTerm.length > 0,
  );

  const { data: allBranches } = useOptions('branches');

  const { data: allGroups } = useOptions('groups');

  const { data: allCourses } = useOptions('courses');

  // Guruhlar tanlangan kurs va bosqichga mos kelsagina tanlanadi
  const filteredGroups = useMemo(() => {
    if (!formData.course_id || !formData.level_id) return [];
    return (allGroups || []).filter(
      (g) => String(g.course_id) === formData.course_id && String(g.level_id) === formData.level_id,
    );
  }, [allGroups, formData.course_id, formData.level_id]);

  // Tanlangan guruh kurs/bosqichga mos kelmasa tozalanadi (masalan, liddan kelgan guruh)
  useEffect(() => {
    if (!formData.group_id || !allGroups) return;
    const g = allGroups.find((x) => String(x.id) === formData.group_id);
    if (!g) return;
    const mismatch =
      (formData.course_id && String(g.course_id) !== formData.course_id) ||
      (formData.level_id && String(g.level_id) !== formData.level_id);
    if (mismatch) {
       
      setFormData((prev) => ({ ...prev, group_id: '' }));
    }
  }, [formData.group_id, formData.course_id, formData.level_id, allGroups]);

  // Filial tanlangan, lekin city bo'sh qolgan bo'lsa (masalan, lid filiallardan oldin kelganda) to'ldiramiz
  useEffect(() => {
    if (!formData.branch_id || formData.city || !allBranches) return;
    const b = allBranches.find((x) => String(x.id) === formData.branch_id);
    if (b?.city) {
       
      setFormData((prev) => ({ ...prev, city: b.city || '' }));
    }
  }, [allBranches, formData.branch_id, formData.city]);

  const handleLidSelect = (lid: Lid) => {
    const addressStr = [
      lid.region?.name_uz || lid.region?.name_uz,
      lid.district?.name_uz || lid.district?.name_uz,
    ]
      .filter(Boolean)
      .join(', ');

    const lidBranchId = lid.branch_id ?? lid.branch?.id ?? null;
    const branchCity =
      lid.branch?.city ||
      (lidBranchId
        ? (allBranches || []).find((b) => String(b.id) === String(lidBranchId))?.city
        : undefined);

    setFormData((prev) => ({
      ...prev,
      lid_id: String(lid.id),
      branch_id: lidBranchId ? String(lidBranchId) : prev.branch_id,
      city: branchCity || prev.city,
      first_name: lid.first_name || prev.first_name,
      last_name: lid.last_name || prev.last_name,
      father_name: lid.father_name || prev.father_name,
      birth_date: lid.birth_date || prev.birth_date,
      phones: lid.phone ? [formatPhone(lid.phone)] : prev.phones,
      course_id: lid.course_id ? String(lid.course_id) : prev.course_id,
      group_id: lid.group_id ? String(lid.group_id) : prev.group_id,
      level_id: lid.level_id ? String(lid.level_id) : prev.level_id,
      residential_address: addressStr || prev.residential_address,
      monthly_price: lid.course_price?.new_price
        ? String(lid.course_price.new_price)
        : prev.monthly_price,
    }));

    setLidSearchTerm(String(lid.id));
    setShowLidDropdown(false);
  };

  useEffect(() => {
    if (!pendingLid || !pendingLidId) return;
     
    setPendingLidId(null);
    window.history.replaceState({}, '');
    handleLidSelect(pendingLid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLid]);

  /*
   * Maydon turi bo'yicha umumlashtirilgan: `phones` kabi ro'yxat maydonlari
   * ham qabul qilinadi. Ilgari qiymat faqat `string` deb belgilangan edi va
   * telefonlar ro'yxatini uzatishda tip xatosi chiqardi.
   */
  const handleChange = <K extends keyof StudentFormData>(
    field: K,
    value: StudentFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // JSHSHR bazadan tekshirilayotganini input yonida ko'rsatish uchun.
  const [jshshirState, setJshshirState] = useState<'idle' | 'loading' | 'found' | 'none'>('idle');
  const [jshshirMatchName, setJshshirMatchName] = useState('');
  // Foydalanuvchi so'rov ketayotgan payt raqamni o'zgartirsa — eski natija
  // qo'llanmasligi uchun oxirgi kiritilgan qiymatni ushlaymiz.
  const latestJshshirRef = useRef('');

  // JSHSHR to'liq (14 raqam) kiritilganda — bazadan odamni topib, mavjud
  // ma'lumotlarini formaga to'ldiradi. Faqat yangi shartnomada (tahrirlashda
  // `id` bor — foydalanuvchi ma'lumotini bexosdan almashtirib qo'ymaslik uchun).
  const handleJshshirInput = async (raw: string) => {
    const val = raw.replace(/\D/g, '').slice(0, 14);
    handleChange('jshshir', val);
    latestJshshirRef.current = val;
    if (id) return;
    if (val.length !== 14) {
      setJshshirState('idle');
      setJshshirMatchName('');
      return;
    }
    setJshshirState('loading');
    setJshshirMatchName('');
    let match: Awaited<ReturnType<typeof lookupPersonByJshshir>> = null;
    try {
      match = await lookupPersonByJshshir(val);
    } catch {
      if (latestJshshirRef.current === val) setJshshirState('idle');
      return;
    }
    if (latestJshshirRef.current !== val) return; // boshqa raqamga o'tildi
    if (!match) {
      setJshshirState('none');
      return;
    }
    setJshshirState('found');
    setJshshirMatchName(match.displayName);
    setFormData((prev) => (prev.jshshir === val ? applyPersonMatch(prev, match) : prev));
    notifications.show({
      color: 'green',
      message: t('studentsContract.autofill.found', { name: match.displayName }),
    });
  };

  // Auto-fill dates and calculate total price when group is selected
  useEffect(() => {
    if (formData.group_id && allGroups) {
      const selectedGroup = allGroups.find((g) => String(g.id) === formData.group_id);
      // Sanasi bo'lmagan guruh qo'lda kiritilgan sanalarni bo'shatib yubormasin
      if (selectedGroup && (selectedGroup.start_date || selectedGroup.end_date)) {
         
        setFormData((prev) => {
          // Only update if dates are empty or just changed group
          const newStartDate = formatDateForInput(selectedGroup.start_date);
          const newEndDate = formatDateForInput(selectedGroup.end_date);

          if (prev.course_start_date !== newStartDate || prev.course_end_date !== newEndDate) {
            return {
              ...prev,
              course_start_date: newStartDate,
              course_end_date: newEndDate,
            };
          }
          return prev;
        });
      }
    }
  }, [formData.group_id, allGroups]);

  // Auto-calculate total price based on monthly_price and duration
  useEffect(() => {
    if (formData.monthly_price && formData.course_start_date && formData.course_end_date) {
      const start = new Date(formData.course_start_date);
      const end = new Date(formData.course_end_date);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const months =
          (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        const total = Number(formData.monthly_price) * Math.max(months, 1);

         
        setFormData((prev) => ({ ...prev, total_price: String(total) }));
      }
    }
  }, [formData.monthly_price, formData.course_start_date, formData.course_end_date]);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => API.post('/student-contracts', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-contracts'] });
      // Shartnoma lid asosida (JSHSHR qidiruv/"Shartnoma tuzish" orqali)
      // yaratilgan bo'lsa — lidni avtomatik "Shartnoma" ustuniga o'tkazadi.
      // `formData.lid_id` bo'sh bo'lsa (texnik xodim uchun lidsiz shartnoma
      // yaratilsa) `advanceLidStatus` jimgina hech narsa qilmaydi.
      advanceLidStatus(formData.lid_id, LID_STATUS.CONTRACT_SIGNED);
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
    // Barcha inputlar to'ldirilmaguncha yuborilmaydi (izoh ixtiyoriy, shahar filialdan olinadi)
    const requiredFields: FieldPair[] = [
      [t('studentsContract.form.lidId'), formData.lid_id],
      [t('studentsContract.form.jshshir'), formData.jshshir],
      [t('studentsContract.form.language'), formData.language],
      [t('studentsContract.form.citizenship'), formData.citizenship],
      [t('studentsContract.form.branch'), formData.branch_id],
      [t('studentsContract.form.passport'), formData.passport_series],
      [t('studentsContract.form.passport'), formData.passport_number],
      [t('studentsContract.form.passportGivenDate'), formData.passport_given_date],
      [t('studentsContract.form.passportExpiry'), formData.passport_expiry_date],
      [t('studentsContract.form.passportGivenBy'), formData.passport_given_by],
      [t('studentsContract.form.lastName'), formData.last_name],
      [t('studentsContract.form.firstName'), formData.first_name],
      [t('studentsContract.form.fatherName'), formData.father_name],
      [t('studentsContract.form.birthDate'), formData.birth_date],
      [t('studentsContract.form.course'), formData.course_id],
      [t('studentsContract.form.level'), formData.level_id],
      [t('studentsContract.form.group'), formData.group_id],
      [t('studentsContract.form.phone'), toApiPhone(formData.phones[0])],
      [t('studentsContract.form.residentialAddress'), formData.residential_address],
      [t('studentsContract.form.registeredAddress'), formData.registered_address],
      [t('studentsContract.form.monthlyPrice'), formData.monthly_price],
      [t('studentsContract.form.totalPrice'), formData.total_price],
      [t('studentsContract.form.courseStartDate'), formData.course_start_date],
      [t('studentsContract.form.courseEndDate'), formData.course_end_date],
      [t('studentsContract.form.contractDate'), formData.contract_date],
      [t('studentsContract.form.contractEndDate'), formData.end_date],
    ];
    const missing = findMissingField(requiredFields);
    if (missing) {
      notifications.show({
        title: t('studentsContract.form.requiredTitle'),
        message: t('studentsContract.form.requiredField', { field: missing }),
        color: 'red',
      });
      return;
    }
    // Asosiy raqam ham, qo'shimchalari ham +998 va 9 ta raqam formatida bo'lishi kerak
    if (formData.phones.some((p) => !isValidPhone(p))) {
      notifications.show({
        title: t('studentsContract.form.requiredTitle'),
        message: t('phoneInput.invalid'),
        color: 'red',
      });
      return;
    }

    const studentPayload: Record<string, unknown> = {
      lid_id: Number(formData.lid_id),
      is_minor: false,
      jshshir: formData.jshshir,
      first_name: formData.first_name,
      last_name: formData.last_name,
      father_name: formData.father_name,
      birth_date: formData.birth_date,
      citizenship: formData.citizenship,
      phone: toApiPhone(formData.phones[0]),
      extra_phones: toApiPhones(formData.phones.slice(1)),
      passport_series: formData.passport_series,
      passport_number: formData.passport_number,
      passport_given_date: formData.passport_given_date,
      passport_expiry_date: formData.passport_expiry_date,
      passport_given_by: formData.passport_given_by,
      registered_address: formData.registered_address || formData.residential_address,
      residential_address: formData.residential_address,
      course_id: Number(formData.course_id),
      level_id: Number(formData.level_id),
      group_id: Number(formData.group_id),
      monthly_price: Number(formData.monthly_price) || 0,
      total_price: Number(formData.total_price) || 0,
      course_start_date: formData.course_start_date,
      course_end_date: formData.course_end_date,
    };

    // Include student id for update
    if (id && studentId) {
      studentPayload.id = studentId;
    }

    const payload = {
      contract_type: 'adult',
      language: formData.language,
      branch_id: Number(formData.branch_id),
      city: formData.city,
      contract_date: formData.contract_date,
      end_date: formData.end_date || null,
      students: [studentPayload],
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
        <div style={{ textAlign: 'center', padding: 40 }}>{t('studentsContract.form.loading')}</div>
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
          {t('studentsContract.form.title')}
        </span>
      </div>

      <div className="sc-section-card">
        <div
          className="sc-section-card-header"
          style={{
            justifyContent: 'center',
            background: '#0f3460',
            borderRadius: '10px',
            margin: '16px',
            padding: '12px 24px',
          }}
        >
          <span
            style={{
              color: '#fff',
              fontFamily: 'noto-b',
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {t('studentsContract.form.step1')}
          </span>
        </div>

        <div className="sc-section-card-body">
          {/* Shablon bo'yicha 12 ustunli tarmoq — har bir maydon o'z kengligini
              `sc-col-*` bilan oladi (`studentsContracts.css`). */}
          <div className="sc-form-grid cols-12" style={{ gap: '14px 16px', marginBottom: '16px' }}>
            {}
            <div className="sc-form-group sc-col-3" style={{ position: 'relative' }}>
              <label className="sc-form-label">
                {t('studentsContract.form.lidId')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder={t('studentsContract.form.lidSearchPlaceholder')}
                value={lidSearchTerm || formData.lid_id}
                onChange={(e) => {
                  setLidSearchTerm(e.target.value);
                  handleChange('lid_id', e.target.value);
                  setShowLidDropdown(true);
                  if (e.target.value === '') {
                    // Just clearing search
                  }
                }}
                onFocus={() => setShowLidDropdown(true)}
                onBlur={() => setTimeout(() => setShowLidDropdown(false), 200)}
              />
              {showLidDropdown && lidSearchTerm.length > 0 && (
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
                    marginTop: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 10,
                  }}
                >
                  {isSearching ? (
                    <div
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: '13px',
                      }}
                    >
                      {t('studentsContract.form.searching')}
                    </div>
                  ) : searchResults && searchResults.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr
                          style={{
                            background: '#f8faff',
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          <th
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              fontSize: '12px',
                              color: '#64748b',
                              fontWeight: 600,
                            }}
                          >
                            {t('studentsContract.form.dropdownId')}
                          </th>
                          <th
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              fontSize: '12px',
                              color: '#64748b',
                              fontWeight: 600,
                            }}
                          >
                            {t('studentsContract.form.dropdownName')}
                          </th>
                          <th
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              fontSize: '12px',
                              color: '#64748b',
                              fontWeight: 600,
                            }}
                          >
                            {t('studentsContract.form.dropdownPhone')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.map((lid: Lid) => (
                          <tr
                            key={lid.id}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer',
                              transition: 'background 0.2s',
                            }}
                            onClick={() => handleLidSelect(lid)}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f5ff')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td
                              style={{
                                padding: '8px 12px',
                                fontSize: '13px',
                                color: '#1e293b',
                              }}
                            >
                              {lid.id}
                            </td>
                            <td
                              style={{
                                padding: '8px 12px',
                                fontSize: '13px',
                                color: '#1e293b',
                              }}
                            >
                              {lid.first_name} {lid.last_name}
                            </td>
                            <td
                              style={{
                                padding: '8px 12px',
                                fontSize: '13px',
                                color: '#1e293b',
                              }}
                            >
                              {lid.phone}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: '13px',
                      }}
                    >
                      {t('studentsContract.form.notFound')}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="sc-form-group sc-col-5">
              <label className="sc-form-label">
                {t('studentsContract.form.jshshir')} <span>*</span>
              </label>
              <div className="sc-jshshir-field">
                <input
                  type="text"
                  className="sc-form-input"
                  placeholder="00000000000000"
                  maxLength={14}
                  value={formData.jshshir}
                  style={
                    formData.jshshir.length > 0 && formData.jshshir.length < 14
                      ? { borderColor: '#ef4444' }
                      : {}
                  }
                  onChange={(e) => {
                    void handleJshshirInput(e.target.value);
                  }}
                />
                {jshshirState === 'loading' && (
                  <i className="fa-solid fa-spinner fa-spin sc-jshshir-spinner" aria-hidden="true" />
                )}
              </div>
              {jshshirState === 'loading' && (
                <div className="sc-jshshir-hint">{t('studentsContract.autofill.checking')}</div>
              )}
              {jshshirState === 'found' && (
                <div className="sc-jshshir-hint sc-jshshir-hint--ok">
                  {t('studentsContract.autofill.found', { name: jshshirMatchName })}
                </div>
              )}
              {jshshirState === 'none' && (
                <div className="sc-jshshir-hint">{t('studentsContract.autofill.notFoundInline')}</div>
              )}
            </div>

            {}
            <div className="sc-form-group sc-row-start sc-col-2">
              <label className="sc-form-label">
                {t('studentsContract.form.language')} <span>*</span>
              </label>
              <select
                className="sc-form-select"
                value={formData.language}
                onChange={(e) => handleChange('language', e.target.value)}
              >
                <option value="uz">UZ</option>
                <option value="ru">RU</option>
                <option value="en">EN</option>
              </select>
            </div>
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">
                {t('studentsContract.form.citizenship')} <span>*</span>
              </label>
              <select
                className="sc-form-select"
                value={formData.citizenship}
                onChange={(e) => handleChange('citizenship', e.target.value)}
              >
                <option value="citizen">{t('studentsContract.form.citizenUz')}</option>
                <option value="foreign">{t('studentsContract.form.citizenForeign')}</option>
              </select>
            </div>

            <div className="sc-form-group sc-row-start sc-col-3">
              <label className="sc-form-label">
                {t('studentsContract.form.branch')} <span>*</span>
              </label>
              <select
                className="sc-form-select"
                value={formData.branch_id}
                onChange={(e) => {
                  const branchId = e.target.value;
                  const branch = (allBranches || []).find((b) => String(b.id) === branchId);
                  setFormData((prev) => ({
                    ...prev,
                    branch_id: branchId,
                    city: branch?.city || '',
                  }));
                }}
              >
                <option value="">{t('studentsContract.form.select')}</option>
                {(allBranches || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sc-form-group sc-col-5">
              <label className="sc-form-label">{t('studentsContract.form.city')}</label>
              <input
                type="text"
                className="sc-form-input"
                value={formData.city}
                readOnly
                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
              />
            </div>
            <div className="sc-form-group sc-col-4">
              <label className="sc-form-label">{t('studentsContract.form.contractDate')}</label>
              <DateInput
                className="sc-form-input"
                value={formData.contract_date}
                onChange={(e) => handleChange('contract_date', e.target.value)}
              />
            </div>
          </div>

          {/* Formaning ikkinchi qismi ham birinchisi bilan bir xil 12 ustunli
              tarmoqda — aks holda `sc-col-*` kengliklari 4 ustunli tarmoqqa
              tushib, maydonlar butun kenglikka cho'zilib ketardi. */}
          <div className="sc-form-grid cols-12" style={{ gap: '14px 16px' }}>
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">
                {t('studentsContract.form.passport')} <span>*</span>
              </label>
              <div className="sc-passport-group" style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="sc-form-input"
                  style={{ width: '70px', textTransform: 'uppercase' }}
                  placeholder="AA"
                  maxLength={2}
                  value={formData.passport_series}
                  onChange={(e) => {
                    const val = e.target.value
                      .replace(/[^a-zA-Z]/g, '')
                      .toUpperCase()
                      .slice(0, 2);
                    handleChange('passport_series', val);
                  }}
                />
                <input
                  type="text"
                  className="sc-form-input"
                  style={{ flex: 1 }}
                  placeholder="1234567"
                  maxLength={7}
                  value={formData.passport_number}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 7);
                    handleChange('passport_number', val);
                  }}
                />
              </div>
            </div>
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">
                {t('studentsContract.form.passportGivenDate')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={formData.passport_given_date}
                onChange={(e) => handleChange('passport_given_date', e.target.value)}
              />
            </div>

            {}
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">{t('studentsContract.form.passportExpiry')}</label>
              <DateInput
                className="sc-form-input"
                value={formData.passport_expiry_date}
                onChange={(e) => handleChange('passport_expiry_date', e.target.value)}
              />
            </div>
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">{t('studentsContract.form.passportGivenBy')}</label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={formData.passport_given_by}
                onChange={(e) => handleChange('passport_given_by', e.target.value)}
              />
            </div>

            {/* FISh - Familya, Ism, Sharif (bir qatorda) */}
            <div className="sc-form-group sc-row-start sc-col-4">
              <label className="sc-form-label">
                {t('studentsContract.form.lastName')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={formData.last_name}
                onChange={(e) => handleChange('last_name', e.target.value)}
              />
            </div>
            <div className="sc-form-group sc-col-4">
              <label className="sc-form-label">
                {t('studentsContract.form.firstName')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={formData.first_name}
                onChange={(e) => handleChange('first_name', e.target.value)}
              />
            </div>
            <div className="sc-form-group sc-col-4">
              <label className="sc-form-label">
                {t('studentsContract.form.fatherName')} <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={formData.father_name}
                onChange={(e) => handleChange('father_name', e.target.value)}
              />
            </div>

            {}
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">
                {t('studentsContract.form.birthDate')} <span>*</span>
              </label>
              <DateInput
                className="sc-form-input"
                value={formData.birth_date}
                onChange={(e) => handleChange('birth_date', e.target.value)}
              />
            </div>
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">
                {t('studentsContract.form.course')} <span>*</span>
              </label>
              <select
                className="sc-form-select"
                value={formData.course_id}
                onChange={(e) => {
                  const courseId = e.target.value;
                  // Kurs o'zgarsa bosqich va guruh qaytadan tanlanadi
                  setFormData((prev) => ({
                    ...prev,
                    course_id: courseId,
                    level_id: '',
                    group_id: '',
                  }));
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
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">
                {t('studentsContract.form.level')} <span>*</span>
              </label>
              <select
                className="sc-form-select"
                value={formData.level_id}
                disabled={!formData.course_id}
                onChange={(e) => {
                  const levelId = e.target.value;
                  // Bosqich o'zgarsa guruh qaytadan tanlanadi
                  setFormData((prev) => ({ ...prev, level_id: levelId, group_id: '' }));
                }}
              >
                <option value="">{t('studentsContract.form.select')}</option>
                {(
                  (allCourses || []).find((c) => String(c.id) === formData.course_id)?.levels || []
                ).map((l) => (
                  <option key={l.id} value={l.id}>
                    {optionLabel(l, i18n.language)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">
                {t('studentsContract.form.group')} <span>*</span>
              </label>
              <select
                className="sc-form-select"
                value={formData.group_id}
                disabled={!formData.course_id || !formData.level_id || filteredGroups.length === 0}
                onChange={(e) => handleChange('group_id', e.target.value)}
              >
                <option value="">
                  {!formData.course_id || !formData.level_id
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

            {/* Telefon raqamlar - horizontal layout */}
            

            {/* Manzillar */}
            
            

            {/* Kurs narxlari */}
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">{t('studentsContract.form.monthlyPrice')}</label>
              <input
                type="number"
                className="sc-form-input"
                placeholder="500000"
                value={formData.monthly_price}
                onChange={(e) => handleChange('monthly_price', e.target.value)}
              />
            </div>
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">{t('studentsContract.form.totalPrice')}</label>
              <input
                type="number"
                className="sc-form-input"
                placeholder="3000000"
                value={formData.total_price}
                onChange={(e) => handleChange('total_price', e.target.value)}
              />
            </div>
            <div className="sc-form-group sc-col-3 sc-row-start">
              <label className="sc-form-label">{t('studentsContract.form.courseStartDate')}</label>
              <DateInput
                className="sc-form-input"
                value={formData.course_start_date}
                onChange={(e) => handleChange('course_start_date', e.target.value)}
              />
            </div>
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">{t('studentsContract.form.courseEndDate')}</label>
              <DateInput
                className="sc-form-input"
                value={formData.course_end_date}
                onChange={(e) => handleChange('course_end_date', e.target.value)}
              />
            </div>

            {/* Shartnoma sanasi va izoh */}
            
            <div className="sc-form-group sc-col-3">
              <label className="sc-form-label">{t('studentsContract.form.contractEndDate')}</label>
              <DateInput
                className="sc-form-input"
                value={formData.end_date}
                onChange={(e) => handleChange('end_date', e.target.value)}
              />
            </div>
            {/* Har bir telefon raqami alohida maydon — qolgan maydonlar bilan bir xil
                o'lchamda, qatorda uchtadan joylashadi. Uchtadan oshsa keyingi
                qatorga tushib davom etadi. */}
            {formData.phones.map((phone, index) => (
              <div key={index} className="sc-form-group sc-col-4">
                <label className="sc-form-label">
                  {t('studentsContract.form.phone')} <span>*</span>
                </label>
                <div className="sc-phone-item">
                  <PhoneInput
                    className="sc-form-input"
                    value={phone}
                    onChange={(v) => {
                      const newPhones = [...formData.phones];
                      newPhones[index] = v;
                      handleChange('phones', newPhones);
                    }}
                  />
                  {index > 0 && (
                    <button
                      type="button"
                      className="sc-phone-remove"
                      title="O'chirish"
                      onClick={() => {
                        const newPhones = formData.phones.filter((_, i) => i !== index);
                        handleChange('phones', newPhones);
                      }}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="sc-form-group sc-col-4">
              <span className="sc-form-label" aria-hidden="true">
                &nbsp;
              </span>
              <button
                type="button"
                className="sc-phone-add"
                onClick={() => handleChange('phones', [...formData.phones, '+998'])}
              >
                Telefon qo'shish
              </button>
            </div>
            <div className="sc-form-group sc-row-start sc-col-6">
              <label className="sc-form-label">
                Doimiy yashash manzili <span>*</span>
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={formData.residential_address}
                onChange={(e) => handleChange('residential_address', e.target.value)}
              />
            </div>
            <div className="sc-form-group sc-col-6">
              <label className="sc-form-label">
                Ro'yxatdan o'tgan manzili
              </label>
              <input
                type="text"
                className="sc-form-input"
                placeholder="Kiriting"
                value={formData.registered_address}
                onChange={(e) => handleChange('registered_address', e.target.value)}
              />
            </div>
          </div>
        </div>


        <div className="sc-form-actions" style={{ justifyContent: 'flex-end', paddingRight: 16 }}>
        <button
          className="sc-form-save-btn"
          onClick={handleSubmit}
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {createMutation.isPending || updateMutation.isPending
            ? t('studentsContract.form.saving')
            : t('studentsContract.form.save')}
        </button>
        <button
          className="sc-form-cancel-btn"
          onClick={() => navigate('/students-contract')}
        >
          {t('studentsContract.form.cancel')}
        </button>
      </div>

      </div>

    </div>
  );
};

const StudentsContract = () => {
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Record<ScFilterKey, string>>(EMPTY_SC_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // «Ko'rish» — maktabga tayyorlov shartnomasidagi kabi oyna (PDF yuklash, chop etish, SMS shu yerda ham).
  const [viewId, setViewId] = useState<number | null>(null);
  // Qatordagi «PDF» / «Chop etish» — qaysi biri ishlayotgani (`id:rejim`).
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const permissions = useAuthStore((s) => s.permissions);
  const can = (p: string) => permissions.includes(p);
  const editAllowed = can('student_contracts.edit');

  const isAdultForm = location.pathname.includes('/students-contract/adult');

  // Ilgari server bitta sahifani qaytarib, filtrlar (filial/yo'nalish/guruh/holat/
  // sana) o'sha sahifada ishlardi — boshqa sahifadagi shartnoma filtrga tushmasdi
  // va "Jami" server jami bilan mos kelmasdi. Endi butun ro'yxat bir marta olinadi,
  // qidiruv + filtr + sahifalash klient tomonda.
  const { data: allContractsRaw = [], isLoading } = useQuery<StudentContract[]>({
    queryKey: ['student-contracts', 'all'],
    queryFn: () => fetchAllPages<StudentContract>('/student-contracts'),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !isAdultForm,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => API.delete(`/student-contracts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-contracts'] });
    },
  });

  // Tasdiqlash SMS'ini qayta yuborish — tasdiqlash oynasi bilan (kimga ketishi ko'rsatiladi).
  const contractSms = useContractSms(() => queryClient.invalidateQueries({ queryKey: ['student-contracts'] }));

  // Maktabga tayyorlov shartnomalari alohida bo'limda — bu ro'yxatda chiqmaydi.
  const allContracts = allContractsRaw.filter((c) => c.contract_type !== 'preschool');

  // Filial/guruh/yo'nalishda `id` kelmaydi (faqat nom), shuning uchun variantlar
  // ro'yxatning o'zidan yig'iladi va nom bo'yicha solishtiriladi.
  const uniqueValues = (pick: (c: StudentContract) => string) =>
    [...new Set(allContracts.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const contractBranch = (c: StudentContract) => c.branch?.name_uz || c.branch?.city || '';
  const contractGroup = (c: StudentContract) => getPrimaryStudent(c)?.group?.name || '';
  const contractCourse = (c: StudentContract) => getPrimaryStudent(c)?.level?.name_uz || '';

  const filterFields: FilterBarField<ScFilterKey>[] = [
    {
      key: 'branch',
      label: t('studentsContract.table.branch'),
      options: uniqueValues(contractBranch).map((v) => ({ value: v, label: v })),
    },
    {
      key: 'course',
      label: t('studentsContract.table.direction'),
      options: uniqueValues(contractCourse).map((v) => ({ value: v, label: v })),
    },
    {
      key: 'group',
      label: t('studentsContract.table.group'),
      options: uniqueValues(contractGroup).map((v) => ({ value: v, label: v })),
    },
    {
      key: 'status',
      label: t('studentsContract.table.status'),
      options: uniqueValues((c) => c.status).map((s) => ({ value: s, label: t(getStatusKey(s)) })),
    },
    {
      key: 'date',
      label: t('studentsContract.table.date'),
      type: 'date',
    },
  ];

  const searchNeedle = searchQuery.trim().toLowerCase();
  const filteredContracts = allContracts.filter((c) => {
    if (filters.branch && contractBranch(c) !== filters.branch) return false;
    if (filters.course && contractCourse(c) !== filters.course) return false;
    if (filters.group && contractGroup(c) !== filters.group) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.date && (c.created_at ?? '').slice(0, 10) !== filters.date) return false;
    if (searchNeedle) {
      const person = getMainPerson(c);
      const haystack =
        `${person.name} ${person.phone} ${contractBranch(c)} ${contractGroup(c)} ${contractCourse(c)}`.toLowerCase();
      if (!haystack.includes(searchNeedle)) return false;
    }
    return true;
  });

  // Default — eng oxirgi shartnoma tepada, ustun bosilsa o'sha bo'yicha saralanadi.
  const sort = useTableSort<StudentContract>(filteredContracts);
  const sortedContracts = sort.rows;

  if (isAdultForm) {
    return <AdultContractForm />;
  }

  const totalItems = sortedContracts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const contracts = sortedContracts.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  );
  const startItem = totalItems > 0 ? (safePage - 1) * itemsPerPage + 1 : 0;
  const endItem = Math.min(safePage * itemsPerPage, totalItems);

  const handleContractSelect = (type: string) => {
    setShowModal(false);
    switch (type) {
      case 'adult':
        navigate('/students-contract/adult');
        break;
      case 'minor':
        navigate('/students-contract/minor');
        break;
      case 'legal_bilateral':
        navigate('/students-contract/legal_bilateral');
        break;
      case 'legal_trilateral':
        navigate('/students-contract/legal_trilateral');
        break;
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm(t('studentsContract.deleteConfirm'))) {
      deleteMutation.mutate(id);
    }
  };
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void handleDelete;

  const handleEdit = (item: StudentContract) => {
    const type =
      item.contract_type === 'adult'
        ? 'adult'
        : item.contract_type === 'minor'
          ? 'minor'
          : item.contract_type === 'legal_bilateral'
            ? 'legal_bilateral'
            : item.contract_type === 'legal_trilateral'
              ? 'legal_trilateral'
              : 'adult';

    navigate(`/students-contract/${type}/edit/${item.id}`);
  };

  const statusBadge = (item: StudentContract) => (
    <span className={`psc-status psc-status--${getStatusType(item.status)}`}>{t(getStatusKey(item.status))}</span>
  );

  const runDocument = async (id: number, mode: 'pdf' | 'print') => {
    setDocBusy(`${id}:${mode}`);
    try {
      await makeStudentContractDocument(id, mode);
    } catch {
      notifyError(t(mode === 'pdf' ? 'studentsContract.view.pdfError' : 'studentsContract.view.printError'));
    } finally {
      setDocBusy(null);
    }
  };

  const actions = (item: StudentContract) => {
    const phone = smsPhoneOf(item);
    return (
      <span className="psc-row-actions">
        {can('student_contracts.show') && (
          <button
            type="button"
            className="psc-icon-btn psc-icon-btn--view"
            title={t('studentsContract.action.actions')}
            aria-label={t('studentsContract.action.actions')}
            onClick={() => setViewId(item.id)}
          >
            <i className="fa-solid fa-eye" />
          </button>
        )}
        {editAllowed && (
          <button
            type="button"
            className="psc-icon-btn psc-icon-btn--edit"
            title={t('studentsContract.action.edit')}
            aria-label={t('studentsContract.action.edit')}
            onClick={() => handleEdit(item)}
          >
            <i className="fa-solid fa-pen" />
          </button>
        )}
        {can('student_contracts.show') && (
          <>
            <button
              type="button"
              className="psc-icon-btn psc-icon-btn--pdf"
              title={t('studentsContract.view.pdf')}
              aria-label={t('studentsContract.view.pdf')}
              disabled={docBusy !== null}
              onClick={() => runDocument(item.id, 'pdf')}
            >
              <i className={docBusy === `${item.id}:pdf` ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} />
            </button>
            <button
              type="button"
              className="psc-icon-btn psc-icon-btn--print"
              title={t('studentsContract.view.print')}
              aria-label={t('studentsContract.view.print')}
              disabled={docBusy !== null}
              onClick={() => runDocument(item.id, 'print')}
            >
              <i className={docBusy === `${item.id}:print` ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-print'} />
            </button>
          </>
        )}
        {isSmsContractType(item.contract_type) && can(smsPermissionFor(item.contract_type)) && (
          <button
            type="button"
            className="psc-icon-btn psc-icon-btn--sms"
            title={t('contractSms.action')}
            aria-label={t('contractSms.action')}
            disabled={contractSms.sendingId === item.id}
            onClick={() =>
              contractSms.ask({ id: item.id, number: item.contract_number, phone, confirmed: item.status === 'active' })
            }
          >
            <i className={contractSms.sendingId === item.id ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-paper-plane'} />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="pp-page list-page container">
      <ListToolbar
        search={{
          value: searchQuery,
          onChange: (v) => {
            setSearchQuery(v);
            setCurrentPage(1);
          },
          placeholder: t('studentsContract.searchPlaceholder'),
        }}
        filter={{
          fields: filterFields,
          values: filters,
          onChange: (next) => {
            setCurrentPage(1);
            setFilters(next);
          },
          onReset: () => {
            setCurrentPage(1);
            setFilters(EMPTY_SC_FILTERS);
          },
          ariaLabel: t('studentsContract.filter'),
        }}
      >
        {can('student_contracts.create') && (
          <WriteGuard>
            <button className="btn-accent" type="button" onClick={() => setShowModal(true)}>
              {t('studentsContract.createBtn')}
            </button>
          </WriteGuard>
        )}
      </ListToolbar>

      <div className="list-table-wrap responsive-table-wrap">
        <table className="list-table">
          <thead>
            <tr>
              <SortableTh sortKey="id" sort={sort}>
                ID
              </SortableTh>
              <th>{t('studentsContract.view.number')}</th>
              <th>{t('studentsContract.table.student')}</th>
              <th>{t('preschoolContracts.columns.representative')}</th>
              <th>{t('studentsContract.table.group')}</th>
              <th>{t('studentsContract.table.branch')}</th>
              <th>{t('studentsContract.table.date')}</th>
              <th>{t('studentsContract.table.status')}</th>
              <th>{t('studentsContract.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9}>{t('studentsContract.loading')}</td>
              </tr>
            ) : contracts.length === 0 ? (
              <tr>
                <td colSpan={9}>{t('studentsContract.noData')}</td>
              </tr>
            ) : (
              contracts.map((item) => {
                const person = getMainPerson(item);
                const courseGroup = getCourseGroup(item);
                return (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.contract_number || '—'}</td>
                    <td>{person.name}</td>
                    <td>{`${item.representative?.first_name ?? ''} ${item.representative?.last_name ?? ''}`.trim() || '—'}</td>
                    <td>{courseGroup.group || '—'}</td>
                    <td>{item.branch?.name_uz || item.branch?.city || '—'}</td>
                    <td>{formatDateTime(item.created_at)}</td>
                    <td>{statusBadge(item)}</td>
                    <td>{actions(item)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
      <div className="responsive-cards">
        {contracts.map((item) => {
          const person = getMainPerson(item);
          const courseGroup = getCourseGroup(item);
          return (
            <div key={item.id} className="data-card">
              <div className="data-card__head">
                <span className="data-card__title">{person.name}</span>
                {statusBadge(item)}
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('studentsContract.view.number')}</span>
                <span className="data-card__value">{item.contract_number || '—'}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('studentsContract.table.direction')}</span>
                <span className="data-card__value">{courseGroup.course || '—'}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('studentsContract.table.group')}</span>
                <span className="data-card__value">{courseGroup.group || '—'}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('studentsContract.table.branch')}</span>
                <span className="data-card__value">{item.branch?.name_uz || item.branch?.city || '—'}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t('studentsContract.table.date')}</span>
                <span className="data-card__value">{formatDateTime(item.created_at)}</span>
              </div>
              <div className="data-card__row">{actions(item)}</div>
            </div>
          );
        })}
        {!isLoading && contracts.length === 0 && (
          <div className="data-card" style={{ textAlign: 'center' }}>
            {t('studentsContract.noData')}
          </div>
        )}
      </div>

      {totalItems > 0 && (
        <Pagination
          currentPage={safePage}
          lastPage={totalPages}
          total={totalItems}
          from={startItem}
          to={endItem}
          onPageChange={setCurrentPage}
          pageSize={itemsPerPage}
          onPageSizeChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
        />
      )}

      {showModal && (
        <div className="sc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sc-modal-header">
              <span className="sc-modal-header-title">{t('studentsContract.modal.title')}</span>
              <button className="sc-modal-close" onClick={() => setShowModal(false)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="sc-modal-body">
              <button className="sc-contract-option" onClick={() => handleContractSelect('adult')}>
                <span className="sc-contract-option-icon">
                  <i className="fa-solid fa-user"></i>
                </span>
                <span className="sc-contract-option-text">{t('studentsContract.modal.adult')}</span>
                <span className="sc-contract-option-arrow">
                  <i className="fa-solid fa-chevron-right"></i>
                </span>
              </button>
              <button className="sc-contract-option" onClick={() => handleContractSelect('minor')}>
                <span className="sc-contract-option-icon">
                  <i className="fa-solid fa-child"></i>
                </span>
                <span className="sc-contract-option-text">{t('studentsContract.modal.minor')}</span>
                <span className="sc-contract-option-arrow">
                  <i className="fa-solid fa-chevron-right"></i>
                </span>
              </button>
              <button
                className="sc-contract-option"
                onClick={() => handleContractSelect('legal_bilateral')}
              >
                <span className="sc-contract-option-icon">
                  <i className="fa-solid fa-building"></i>
                </span>
                <span className="sc-contract-option-text">
                  {t('studentsContract.modal.legalBilateral')}
                </span>
                <span className="sc-contract-option-arrow">
                  <i className="fa-solid fa-chevron-right"></i>
                </span>
              </button>
              <button
                className="sc-contract-option"
                onClick={() => handleContractSelect('legal_trilateral')}
              >
                <span className="sc-contract-option-icon">
                  <i className="fa-solid fa-users"></i>
                </span>
                <span className="sc-contract-option-text">
                  {t('studentsContract.modal.legalTrilateral')}
                </span>
                <span className="sc-contract-option-arrow">
                  <i className="fa-solid fa-chevron-right"></i>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {viewId !== null && <StudentContractView contractId={viewId} onClose={() => setViewId(null)} />}
      {contractSms.modal}
    </div>
  );
};

export default StudentsContract;
