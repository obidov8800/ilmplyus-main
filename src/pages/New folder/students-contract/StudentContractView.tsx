import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API } from '@/api/api';
import { isSmsContractType, smsPermissionFor } from '@/api/contractSms';
import { useContractSms } from '@/hooks/useContractSms';
import { usePermission } from '@/hooks/usePermission';
import { notifyError } from '@/utils/notify';
import { printPreschoolContract } from '@/utils/preschoolContractPrint';
import {
  buildTemplateData,
  printFromDocxTemplate,
  type ContractStatusBlockData,
} from '@/utils/contractPdf';
import '@/pages/preschool-contracts/preschoolContract.css';

import adultTemplate from '@/assets/documents/01. ILM Шартнома умумий (ўқувчи).docx?url';
import minorTemplate from '@/assets/documents/02_ILM_Шартнома_икки_томонлама_вакил+ўқувчи.docx?url';
import legalBilateralTemplate from '@/assets/documents/03_ILM_Шартнома_икки_томонлама_юридик_шахс+ўқувчи.docx?url';
import legalTrilateralTemplate from '@/assets/documents/04_ILM_Шартнома_уч_томонлама_юридик_шахс+вакил+ўқувчи.docx?url';

/*
 * O'quvchi (kurs) shartnomasini ko'rish oynasi — maktabga tayyorlov shartnomasi oynasi bilan bir xil dizayn
 * (`psc-*`). Ma'lumot `GET /student-contracts/{id}` dan, ko'rsatiladigan qiymatlar PDF bilan bir xil manbadan
 * (`buildTemplateData`). Tugmalar: PDF yuklash (fayl), Chop etish (PDF ko'ruvchi), SMS, Batafsil (bekor qilish /
 * tugatish sahifasi), Yopish. Admin va User ilovalarida bir xil fayl.
 */

const DASH = '—';

const TEMPLATE: Record<string, string> = {
  adult: adultTemplate,
  minor: minorTemplate,
  legal_bilateral: legalBilateralTemplate,
  legal_trilateral: legalTrilateralTemplate,
};

const STATUS_KEY: Record<string, string> = {
  active: 'studentsContract.status.active',
  completed: 'studentsContract.status.completed',
  in_progress: 'studentsContract.status.inProgress',
  cancelled: 'studentsContract.status.cancelled',
  expired: 'studentsContract.status.expired',
};

const TYPE_KEY: Record<string, string> = {
  adult: 'studentsContract.modal.adult',
  minor: 'studentsContract.modal.minor',
  legal_bilateral: 'studentsContract.modal.legalBilateral',
  legal_trilateral: 'studentsContract.modal.legalTrilateral',
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Qabul qiluvchi telefon — backend qoidasi bilan bir xil: voyaga yetmagan → vakil, voyaga yetgan → o'quvchi. */
export const smsPhoneOf = (c: any): string => {
  const studentPhone = c?.contract_students?.[0]?.phone || '';
  const repPhone = c?.representative?.phone || c?.contract_representatives?.[0]?.phone || '';
  return c?.contract_type === 'minor' || c?.contract_type === 'preschool' ? repPhone || studentPhone : studentPhone;
};

/**
 * Ro'yxat qatoridan to'g'ridan-to'g'ri «PDF yuklash» / «Chop etish» — shartnoma to'liq ma'lumoti
 * `GET /student-contracts/{id}` dan olinadi (ko'rish oynasidagi bilan bir xil hujjat).
 */
export async function makeStudentContractDocument(contractId: number, mode: 'pdf' | 'print'): Promise<void> {
  const response = await API.get(`/student-contracts/${contractId}`).then((r) => r.data);
  const contract = response?.contract || response?.data || response;
  const computed = response?.computed;
  const type: string = contract?.contract_type || 'adult';
  // Maktabga tayyorlov — o'z hujjati (Parvoz filiali ma'lumoti + tasdiqlash kartalari), docx shablon emas.
  if (type === 'preschool') {
    await printPreschoolContract(contract, { mode });
    return;
  }
  const status: ContractStatusBlockData | undefined =
    computed?.show_card && computed.card
      ? {
          orgName: contract?.branch?.legal_name || contract?.branch?.name_uz || DASH,
          orgDirector: contract?.branch?.director_name || DASH,
          date: computed.card.date,
          studentName: computed.card.name,
          studentPhone: computed.card.phone,
          studentOrg: computed.card.org,
          studentStatus: computed.card.status,
          studentStatusText: computed.card.status_text,
        }
      : undefined;
  await printFromDocxTemplate(
    TEMPLATE[type] ?? adultTemplate,
    buildTemplateData(contract),
    contract.contract_number || String(contractId),
    mode,
    status,
    true,
  );
}

interface Props {
  contractId: number;
  onClose: () => void;
}

export default function StudentContractView({ contractId, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['student-contract-view', contractId],
    queryFn: () => API.get(`/student-contracts/${contractId}`).then((r) => r.data),
    staleTime: 60 * 1000,
  });
  const contract = response?.contract || response?.data || response;
  const computed = response?.computed;

  const type: string = contract?.contract_type || 'adult';
  const canSms = usePermission(smsPermissionFor(type));
  const contractSms = useContractSms(() => {
    queryClient.invalidateQueries({ queryKey: ['student-contracts'] });
    queryClient.invalidateQueries({ queryKey: ['student-contract-view', contractId] });
  });

  const statusBlock = (): ContractStatusBlockData | undefined =>
    computed?.show_card && computed.card
      ? {
          orgName: contract?.branch?.legal_name || contract?.branch?.name_uz || DASH,
          orgDirector: contract?.branch?.director_name || DASH,
          date: computed.card.date,
          studentName: computed.card.name,
          studentPhone: computed.card.phone,
          studentOrg: computed.card.org,
          studentStatus: computed.card.status,
          studentStatusText: computed.card.status_text,
        }
      : undefined;

  const makeDocument = async (mode: 'pdf' | 'print') => {
    if (!contract) return;
    setBusy(mode);
    try {
      if (type === 'preschool') {
        await printPreschoolContract(contract, { mode });
        return;
      }
      await printFromDocxTemplate(
        TEMPLATE[type] ?? adultTemplate,
        buildTemplateData(contract),
        contract.contract_number || String(contractId),
        mode,
        statusBlock(),
        true,
      );
    } catch {
      notifyError(t(mode === 'pdf' ? 'studentsContract.view.pdfError' : 'studentsContract.view.printError'));
    } finally {
      setBusy(null);
    }
  };

  const row = (label: string, value: string | number | null | undefined) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd>{value === null || value === undefined || value === '' ? DASH : value}</dd>
    </div>
  );

  const d = contract ? buildTemplateData(contract) : null;
  const money = (v?: string) => (v && v !== DASH ? `${v} ${t('studentsContract.view.currency')}` : null);
  const isLegal = type === 'legal_bilateral' || type === 'legal_trilateral';
  const hasRep = type === 'minor' || type === 'legal_trilateral';
  const phone = contract ? smsPhoneOf(contract) : '';

  return (
    <div className="psc-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="psc-modal" role="dialog" aria-modal="true" aria-label={t('studentsContract.view.title')}>
        <h3 className="psc-modal__title">
          {t('studentsContract.view.title')} {contract?.contract_number ?? ''}
        </h3>

        {isLoading ? (
          <p>{t('studentsContract.loading')}</p>
        ) : isError || !contract || !d ? (
          <p>{t('studentsContract.view.loadError')}</p>
        ) : (
          <>
            <dl className="psc-view-grid">
              {row(t('studentsContract.view.number'), contract.contract_number)}
              {row(t('studentsContract.table.status'), t(STATUS_KEY[contract.status] ?? 'studentsContract.status.inProgress'))}
              {row(t('studentsContract.view.type'), TYPE_KEY[type] ? t(TYPE_KEY[type]) : type)}
              {row(t('studentsContract.table.branch'), contract.branch?.name_uz || contract.branch?.city)}
              {row(t('studentsContract.view.city'), d.city)}
              {row(t('studentsContract.view.language'), contract.language)}
              {row(t('studentsContract.view.contractDate'), d.contract_date)}
              {row(t('studentsContract.view.period'), [d.contract_start_date, d.contract_expiry_date].filter((x) => x && x !== DASH).join(' — '))}
            </dl>

            {isLegal && (
              <>
                <h4 className="psc-view-section">{t('studentsContract.view.organization')}</h4>
                <dl className="psc-view-grid">
                  {row(t('studentsContract.view.orgName'), d.company_name)}
                  {row(t('studentsContract.view.director'), d.company_director_name)}
                </dl>
              </>
            )}

            {hasRep && (
              <>
                <h4 className="psc-view-section">{t('studentsContract.view.representative')}</h4>
                <dl className="psc-view-grid">
                  {row(t('studentsContract.view.fullName'), d.representative_full_name)}
                  {row(t('studentsContract.view.phone'), d.representative_phone)}
                  {row(t('studentsContract.view.jshshir'), d.representative_jshshr)}
                  {row(t('studentsContract.view.passport'), d.representative_passport_full)}
                  {row(t('studentsContract.view.address'), d.representative_residental_address)}
                </dl>
              </>
            )}

            {(d.students?.length ? d.students : [null]).map((s, i) => (
              <div key={i}>
                <h4 className="psc-view-section">{t('studentsContract.view.student')}</h4>
                <dl className="psc-view-grid">
                  {row(t('studentsContract.view.fullName'), s?.s_full_name || d.student_full_name)}
                  {row(t('studentsContract.view.birthDate'), s?.s_birth_date || d.student_birth_date)}
                  {i === 0 && row(t('studentsContract.view.phone'), d.phone)}
                  {i === 0 && row(t('studentsContract.view.jshshir'), d.jshshir)}
                  {i === 0 && !isLegal && row(t('studentsContract.view.passport'), d.passport_full)}
                  {i === 0 && row(t('studentsContract.view.address'), d.residential_address)}
                  {row(t('studentsContract.table.direction'), s?.s_course_name || d.course_name)}
                  {row(t('studentsContract.view.level'), s?.s_level_name || d.level_name)}
                  {i === 0 && row(t('studentsContract.table.group'), d.group_name)}
                  {i === 0 && row(t('studentsContract.view.lessonTime'), d.lesson_time)}
                  {row(t('studentsContract.view.monthlyPrice'), money(s?.s_monthly_price || d.monthly_price))}
                  {row(t('studentsContract.view.totalPrice'), money(s?.s_total_price || d.total_price))}
                </dl>
              </div>
            ))}
          </>
        )}

        <div className="psc-actions">
          <button type="button" className="psc-btn" onClick={() => makeDocument('pdf')} disabled={!contract || busy !== null}>
            <i className={busy === 'pdf' ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} /> {t('studentsContract.view.pdf')}
          </button>
          <button type="button" className="psc-btn" onClick={() => makeDocument('print')} disabled={!contract || busy !== null}>
            <i className={busy === 'print' ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-print'} /> {t('studentsContract.view.print')}
          </button>
          {contract && isSmsContractType(type) && canSms && (
            <button
              type="button"
              className="psc-btn"
              title={t('contractSms.action')}
              disabled={contractSms.sendingId === contract.id}
              onClick={() =>
                contractSms.ask({ id: contract.id, number: contract.contract_number, phone, confirmed: contract.status === 'active' })
              }
            >
              <i className={contractSms.sendingId === contract.id ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-paper-plane'} />{' '}
              {t('studentsContract.view.sms')}
            </button>
          )}
          <button type="button" className="psc-btn" onClick={() => navigate(`/students-contract/${contractId}`)}>
            {t('studentsContract.view.details')}
          </button>
          <button type="button" className="psc-btn psc-btn--cancel" onClick={onClose}>
            {t('studentsContract.view.close')}
          </button>
        </div>
        {contractSms.modal}
      </div>
    </div>
  );
}
