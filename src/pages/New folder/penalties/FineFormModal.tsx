import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { useOptions } from '@/api/options';
import DateInput, { type DateInputChangeEvent } from '@/components/DateInput';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatMoney } from '../payroll-sheets/helpers';
import { useSaveFine } from './api';
import type { EmployeeFine, FineType } from './types';

interface Props {
  /** `null` — yangi jarima, aks holda tahrirlash. */
  fine: EmployeeFine | null;
  fineTypes: FineType[];
  onClose: () => void;
}

/**
 * «Jarimaga tortish» / tahrirlash formasi.
 * Summa bo'sh qoldirilsa backend tanlangan turdagi standart summani qo'yadi.
 */
const FineFormModal = ({ fine, fineTypes, onClose }: Props) => {
  const { t } = useTranslation();
  const { data: employees = [] } = useOptions('employees');
  const { data: branchOptions = [] } = useOptions('branches');
  const save = useSaveFine();

  const [employeeId, setEmployeeId] = useState(fine ? String(fine.employee_id) : '');
  const [fineTypeId, setFineTypeId] = useState(fine ? String(fine.fine_type_id) : '');
  const [date, setDate] = useState(fine?.date ?? '');
  const [amount, setAmount] = useState(fine ? String(fine.amount) : '');
  const [note, setNote] = useState(fine?.note ?? '');
  const [showErrors, setShowErrors] = useState(false);
  const [branchId, setBranchId] = useState(
    fine && (fine as { branch_id?: number }).branch_id ? String((fine as { branch_id?: number }).branch_id) : '',
  );

  // Xodim bir nechta filialda ishlasa (shartnoma filiali) — jarima qaysi filial vedomostiga tushishi tanlanadi.
  const employeeBranchIds =
    employees.find((emp) => String(emp.id) === employeeId)?.contract_branch_ids ?? [];
  const needsBranch = employeeBranchIds.length > 1;

  const selectedType = fineTypes.find((ft) => String(ft.id) === fineTypeId);
  const invalid = !employeeId || !fineTypeId || !date || (needsBranch && !branchId);

  const submit = () => {
    if (invalid) {
      setShowErrors(true);
      return;
    }
    save.mutate(
      {
        id: fine?.id ?? null,
        form: {
          employee_id: employeeId,
          fine_type_id: fineTypeId,
          date,
          amount,
          note,
          branch_id: needsBranch ? branchId : undefined,
        },
      },
      {
        onSuccess: () => {
          notifications.show({
            title: t('penalties.savedTitle'),
            message: fine ? t('penalties.updated') : t('penalties.created'),
            color: 'green',
          });
          onClose();
        },
        onError: (error) => {
          notifications.show({
            title: t('penalties.errorTitle'),
            message: getApiErrorMessage(error, t('penalties.saveError')),
            color: 'red',
          });
        },
      },
    );
  };

  return (
    <div className="pen-overlay" onClick={onClose}>
      <div
        className="pen-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pen-modal-head">
          <h2>{fine ? t('penalties.form.editTitle') : t('penalties.form.title')}</h2>
          <button
            className="pen-modal-close"
            type="button"
            onClick={onClose}
            aria-label={t('modalPattern.close')}
          >
            ×
          </button>
        </div>

        <div className="pen-modal-body">
          <div className="pen-form">
            <div className="pen-field">
              <label htmlFor="pf-employee">{t('penalties.form.employee')}</label>
              <select
                id="pf-employee"
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setBranchId('');
                }}
                className={showErrors && !employeeId ? 'pen-invalid' : ''}
              >
                <option value="">{t('penalties.form.choose')}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.label}
                  </option>
                ))}
              </select>
            </div>

            {needsBranch && (
              <div className="pen-field">
                <label htmlFor="pf-branch">{t('penalties.form.branch', 'Filial')}</label>
                <select
                  id="pf-branch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className={showErrors && !branchId ? 'pen-invalid' : ''}
                >
                  <option value="">{t('penalties.form.choose')}</option>
                  {employeeBranchIds.map((id) => (
                    <option key={id} value={id}>
                      {branchOptions.find((b) => b.id === Number(id))?.label ?? `#${id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="pen-field">
              <label htmlFor="pf-type">{t('penalties.form.fineType')}</label>
              <select
                id="pf-type"
                value={fineTypeId}
                onChange={(e) => {
                  const value = e.target.value;
                  setFineTypeId(value);
                  // Tur tanlanganda summa maydoni shu turdagi standart summa
                  // bilan avtomatik to'ldiriladi — kerak bo'lsa qo'lda o'zgartiriladi.
                  const type = fineTypes.find((ft) => String(ft.id) === value);
                  setAmount(type ? String(type.amount) : '');
                }}
                className={showErrors && !fineTypeId ? 'pen-invalid' : ''}
              >
                <option value="">{t('penalties.form.choose')}</option>
                {fineTypes.map((ft) => (
                  <option key={ft.id} value={ft.id}>
                    {ft.name} — {formatMoney(ft.amount)}
                  </option>
                ))}
              </select>
            </div>

            <div className="pen-field">
              <label htmlFor="pf-date">{t('penalties.form.date')}</label>
              <DateInput
                id="pf-date"
                value={date}
                onChange={(e: DateInputChangeEvent) => setDate(e.target.value)}
                className={showErrors && !date ? 'pen-invalid' : ''}
                aria-label={t('penalties.form.date')}
              />
            </div>

            <div className="pen-field">
              <label htmlFor="pf-amount">{t('penalties.form.amount')}</label>
              <input
                id="pf-amount"
                type="number"
                min="0"
                value={amount}
                placeholder={
                  selectedType
                    ? formatMoney(selectedType.amount)
                    : t('penalties.form.amountPlaceholder')
                }
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="pen-hint">{t('penalties.form.amountHint')}</span>
            </div>

            <div className="pen-field pen-field--wide">
              <label htmlFor="pf-note">{t('penalties.form.note')}</label>
              <textarea
                id="pf-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="pen-modal-foot">
          <button
            className="pen-btn pen-btn--primary"
            type="button"
            onClick={submit}
            disabled={save.isPending}
          >
            {t('penalties.form.save')}
          </button>
          <button className="pen-btn pen-btn--ghost" type="button" onClick={onClose}>
            {t('penalties.form.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FineFormModal;
