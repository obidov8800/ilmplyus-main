import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useContractSms } from '@/hooks/useContractSms';
import { usePermission } from '@/hooks/usePermission';
import { useTranslation } from 'react-i18next';
import './preschoolContract.css';
import { printPreschoolContract } from '@/utils/preschoolContractPrint';
import { notifyError } from '@/utils/notify';
import type { PreschoolContract } from '@/types/preschoolContract.types';
import { DASH as dash, branchName, contractRepresentatives, formatContractDate as formatDate, personName } from '@/utils/preschoolContractView';

/*
 * Maktabga tayyorlov shartnomasini ko'rish oynasi. Ro'yxat qatoridagi ma'lumot ko'rsatiladi (qo'shimcha so'rovsiz —
 * `student_contracts.show` ruxsati maktabga tayyorlov foydalanuvchisida bo'lmasligi mumkin).
 * Admin va User ilovalarida bir xil fayl.
 */

interface Props {
  contract: PreschoolContract;
  onClose: () => void;
}

export default function PreschoolContractView({ contract, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const students = contract.contract_students ?? [];
  const reps = contractRepresentatives(contract);
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
  const queryClient = useQueryClient();
  const canSms = usePermission('preschool_contracts.edit');
  const contractSms = useContractSms(() => queryClient.invalidateQueries({ queryKey: ['preschool-contracts'] }));
  // SMS — backend birinchi vakil telefoniga yuboradi.
  const smsPhone = contract.representative?.phone || reps[0]?.phone || '';

  // Shartnoma hujjati — ro'yxat qatoridagi ma'lumotdan: filial rekvizitlari, vakillar, bola va oylik narx shu
  // javobda bor (qo'shimcha so'rov va `student_contracts.show` ruxsati shart emas).
  // «PDF yuklash» — fayl yuklab olinadi; «Chop etish» — PDF ko'ruvchi oynada ochiladi.
  const makeDocument = async (mode: 'pdf' | 'print') => {
    setBusy(mode);
    try {
      await printPreschoolContract(contract, { mode });
    } catch {
      notifyError(t('preschoolContracts.pdfError'));
    } finally {
      setBusy(null);
    }
  };

  const row = (label: string, value: string | number | null | undefined) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd>{value === null || value === undefined || value === '' ? dash : value}</dd>
    </div>
  );

  return (
    <div className="psc-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="psc-modal" role="dialog" aria-modal="true" aria-label={t('preschoolContracts.viewTitle')}>
        <h3 className="psc-modal__title">
          {t('preschoolContracts.viewTitle')} {contract.contract_number}
        </h3>

        <dl className="psc-view-grid">
          {row(t('preschoolContracts.columns.number'), contract.contract_number)}
          {row(
            t('preschoolContracts.columns.status'),
            t(`preschoolContracts.statuses.${contract.status}`, { defaultValue: contract.status }),
          )}
          {row(t('preschoolContracts.columns.branch'), branchName(contract.branch, i18n.language))}
          {row(t('preschoolContracts.form.city'), contract.branch?.city)}
          {row(t('preschoolContracts.columns.year'), contract.academic_year?.name)}
          {row(
            t('preschoolContracts.form.language'),
            contract.language ? t(`preschoolContracts.languages.${contract.language}`, { defaultValue: contract.language }) : null,
          )}
          {row(t('preschoolContracts.form.contractDate'), formatDate(contract.contract_date))}
          {row(t('preschoolContracts.form.endDate'), formatDate(contract.end_date))}
          {row(t('preschoolContracts.form.firstPayment'), formatDate(contract.first_payment_date))}
        </dl>

        {students.map((s, i) => (
          <div key={s.id ?? i}>
            <h4 className="psc-view-section">{t('preschoolContracts.form.sectionStudent')}</h4>
            <dl className="psc-view-grid">
              {row(t('preschoolContracts.columns.student'), personName(s))}
              {row(t('preschoolContracts.form.phone'), s.phone)}
              {row(t('preschoolContracts.form.birthDate'), formatDate(s.birth_date))}
              {row(t('preschoolContracts.form.birthPlace'), s.birth_place)}
              {row(
                t('preschoolContracts.form.gender'),
                s.gender ? t(`preschoolContracts.genders.${s.gender}`, { defaultValue: s.gender }) : null,
              )}
              {row(
                t('preschoolContracts.form.certSeries'),
                [s.birth_cert_series, s.birth_cert_number].filter(Boolean).join(' ') || null,
              )}
              {row(t('preschoolContracts.form.address'), s.residential_address)}
              {row(t('preschoolContracts.form.group'), s.group?.name)}
              {row(t('preschoolContracts.form.studyStart'), formatDate(s.course_start_date))}
              {row(
                t('preschoolContracts.form.monthlyPrice'),
                s.monthly_price != null && s.monthly_price !== ''
                  ? `${Math.round(Number(s.monthly_price)).toLocaleString('ru-RU')} ${t('preschoolContracts.form.currency')}`
                  : null,
              )}
              {row(
                t('preschoolContracts.form.totalPrice'),
                s.total_price != null && s.total_price !== ''
                  ? `${Math.round(Number(s.total_price)).toLocaleString('ru-RU')} ${t('preschoolContracts.form.currency')}`
                  : null,
              )}
            </dl>
          </div>
        ))}

        {reps.map((r, i) => (
          <div key={r.id ?? i}>
            <h4 className="psc-view-section">
              {t('preschoolContracts.form.repNo', { n: i + 1 })}
              {r.representative_type ? ` · ${t(`preschoolContracts.repTypes.${r.representative_type}`, { defaultValue: r.representative_type })}` : ''}
            </h4>
            <dl className="psc-view-grid">
              {row(t('preschoolContracts.columns.representative'), personName(r))}
              {row(t('preschoolContracts.form.phone'), r.phone)}
              {row(t('preschoolContracts.form.jshshir'), r.jshshir)}
              {row(
                t('preschoolContracts.form.passportSeries'),
                [r.passport_series, r.passport_number].filter(Boolean).join(' ') || null,
              )}
              {row(t('preschoolContracts.form.address'), r.residential_address)}
            </dl>
          </div>
        ))}

        <div className="psc-actions">
          <button type="button" className="psc-btn" onClick={() => makeDocument('pdf')} disabled={busy !== null}>
            <i className={busy === 'pdf' ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} /> {t('preschoolContracts.pdf')}
          </button>
          <button type="button" className="psc-btn" onClick={() => makeDocument('print')} disabled={busy !== null}>
            <i className={busy === 'print' ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-print'} /> {t('preschoolContracts.print')}
          </button>
          {canSms && (
            <button
              type="button"
              className="psc-btn"
              title={t('contractSms.action')}
              disabled={contractSms.sendingId === contract.id}
              onClick={() =>
                contractSms.ask({
                  id: contract.id,
                  number: contract.contract_number,
                  phone: smsPhone,
                  confirmed: contract.status === 'active',
                })
              }
            >
              <i className={contractSms.sendingId === contract.id ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-paper-plane'} />{' '}
              {t('preschoolContracts.sms')}
            </button>
          )}
          <button type="button" className="psc-btn psc-btn--cancel" onClick={onClose}>
            {t('preschoolContracts.close')}
          </button>
        </div>
        {contractSms.modal}
      </div>
    </div>
  );
}
