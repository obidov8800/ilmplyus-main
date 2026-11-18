import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API } from "../../api/api";
import { useTranslation } from "react-i18next";
import { getLocalized } from "../../utils/getLocalized";
import { Protected } from "../../components/Protected";
import "./contracts.css";
import DateInput from '@/components/DateInput';
import { formatDate as formatDisplayDate } from '@/utils/date';
import { useOptions } from '@/api/options';

const findLabel = (options: { id: number; label: string }[] | undefined, id: number): string =>
  options?.find((o) => o.id === id)?.label ?? '';
import { groupDigits } from '@/utils/formatNumber';

/** Backend `salary_type` qiymatlari -> sahifa etiketlari kaliti (shtat / foiz / soat). */
const salaryTypeFromApi = (v: string | null | undefined): string => {
  switch (v) {
    case 'staff_schedule':
      return 'shtat';
    case 'percent':
      return 'foiz';
    case 'academic_hours':
    case 'hourly':
      return 'soat';
    default:
      return v || '';
  }
};

/** Holat amali -> backend manzili (`/employees/{id}/contracts/{id}/<shu>`). */
const ACTION_ENDPOINT: Record<string, string> = {
  terminate: 'terminate',
  cancel: 'set-inactive',
  activate: 'set-active',
};

interface Contract {
  id: number;
  employee_id: number;
  contract_number: number;
  contract_date: string;
  contract_start_date: string;
  contract_end_date: string;
  status: string;
  base_salary: string;
  employee: {
    id: number;
    first_name: string;
    last_name: string;
    middle_name: string;
    full_name: string;
    phone: string;
    birth_date: string;
    pinfl: string;
    citizenship: string;
    passport_series: string;
    passport_number: string;
    passport_given_date: string;
    passport_given_by: string;
    address_registration: string;
    address_living: string;
    branch_id?: number | null;
  };
  department: { id: number; name_uz: string | null; name_ru: string | null; name_en: string | null };
  position_id: number;
  position?: { id: number; name_uz: string | null; name_ru: string | null; name_en: string | null };
  contract_type: string;
  contract_duration_months: string | null;
  monthly_salary_type: string | null;
  salary_percent: string | number | null;
  /** Backenddagi haqiqiy nomlar (yuqoridagi ikkitasi eski, sahifa avval faqat shularni o'qirdi). */
  salary_type?: string | null;
  percent_rate?: string | number | null;
  contract_term_type?: string | null;
  contract_term_label?: string | null;
  term_text?: string | null;
  citizenship?: string | null;
  work_start_date: string | null;
  vacation_type: string;
  working_hours_monthly: string;
  hourly_rate: string;
  total_monthly_salary: string;
  salary_start_date: string;
  salary_end_date: string;
  signed_by: string;
  language: string;
  probation_period: string | null;
  probation_end_date: string | null;
  branch_id?: number | null;
  branch?: { id: number; name_uz?: string | null; name_ru?: string | null; name_en?: string | null; label?: string } | null;
  additional_tasks?: { task_id?: number; salary?: number | string; comment?: string; task?: { name_uz?: string | null; name_ru?: string | null; name_en?: string | null } | null }[] | null;
}

type PendingAction = "terminate" | "cancel" | "activate" | null;

const ContractDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionDate, setActionDate] = useState("");

  const statusLabel: Record<string, string> = {
    active: t("contracts.status.active"),
    inactive: t("contracts.status.inactive"),
    terminated: t("contracts.status.terminated"),
    cancelled: t("contracts.status.cancelled"),
  };

  // Map the stored option codes back to their human-readable labels (reusing
  // the create-form option translations) for display on the detail page.
  const contractTypeLabels: Record<string, string> = {
    asosiy: t("contractsCreate.contractTypeOptions.asosiy"),
    orindoshlik: t("contractsCreate.contractTypeOptions.orindoshlik"),
    boshqa: t("contractsCreate.contractTypeOptions.boshqa"),
  };
  const conclusionTermLabels: Record<string, string> = {
    nomuayyan: t("contractsCreate.conclusionTermOptions.nomuayyan"),
    muayyan3: t("contractsCreate.conclusionTermOptions.muayyan3"),
    vaqtinchalik: t("contractsCreate.conclusionTermOptions.vaqtinchalik"),
    mavsumiy: t("contractsCreate.conclusionTermOptions.mavsumiy"),
  };
  const salaryTypeLabels: Record<string, string> = {
    shtat: t("contractsCreate.salaryTypeOptions.shtat"),
    foiz: t("contractsCreate.salaryTypeOptions.foiz"),
    soat: t("contractsCreate.salaryTypeOptions.soat"),
  };
  const vacationTypeLabels: Record<string, string> = {
    beriladi: t("contractsCreate.vacationOptions.given"),
    berilmaydi: t("contractsCreate.vacationOptions.notGiven"),
  };

  const actionLabels: Record<NonNullable<PendingAction>, string> = {
    terminate: t("contracts.detail.terminateDateLabel"),
    cancel: t("contracts.detail.cancelDateLabel"),
    activate: t("contracts.detail.activateDateLabel"),
  };

  // Backendda `GET /contracts/{id}` yo'q — hammasini olib (kesh `["contracts"]` ro'yxat bilan umumiy), id bo'yicha topamiz.
  const { data: allContracts, isLoading } = useQuery<Contract[]>({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data } = await API.get("/contracts");
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
  });
  const contract = allContracts?.find((c) => String(c.id) === id);

  const { data: positionOptions } = useOptions("positions");
  const { data: branchOptions } = useOptions("branches");

  const mutate = (endpoint: string, date: string) =>
    API.patch(`/employees/${(contract!.employee_id ?? contract!.employee?.id)}/contracts/${contract!.id}/${endpoint}`, { date });

  const actionMutation = useMutation({
    mutationFn: ({ action, date }: { action: string; date: string }) =>
      mutate(action, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      navigate("/contracts");
    },
  });

  const confirmAction = () => {
    if (!actionDate || !pendingAction) return;
    actionMutation.mutate({ action: ACTION_ENDPOINT[pendingAction], date: actionDate });
  };

  if (!isLoading && !contract) {
    return (
      <div className="contracts-container container" style={{ paddingTop: 80 }}>
        <p>{t("contracts.detail.notFound")}</p>
        <button className="btn btn-cancel" onClick={() => navigate("/contracts")}>
          <i className="fas fa-arrow-left"></i> {t("contracts.detail.back")}
        </button>
      </div>
    );
  }
  if (isLoading || !contract) {
    return <div className="contracts-container container" style={{ paddingTop: 80 }}>{t("contracts.detail.loading")}</div>;
  }

  const formatDate = (s: string | null | undefined) => formatDisplayDate(s, "-");
  const emp = contract.employee ?? ({} as Contract["employee"]);
  const status = contract.status;

  const salaryKey = salaryTypeFromApi(contract.salary_type ?? contract.monthly_salary_type);
  const salaryPercent = contract.percent_rate ?? contract.salary_percent;
  const termText =
    contract.term_text ||
    contract.contract_term_label ||
    (contract.contract_duration_months
      ? conclusionTermLabels[contract.contract_duration_months] || contract.contract_duration_months
      : "");
  const branchName =
    (contract.branch ? getLocalized(contract.branch, "name", i18n.language) || contract.branch.label : "") ||
    findLabel(branchOptions, contract.branch_id ?? emp.branch_id ?? 0) ||
    "-";
  const ownerId = contract.employee_id ?? emp.id;
  const otherContracts = (allContracts ?? [])
    .filter((c) => (c.employee_id ?? c.employee?.id) === ownerId && c.id !== contract.id)
    .sort((a, b) => b.id - a.id);
  const canRenew = status !== "cancelled";
  const positionName = contract.position
    ? getLocalized(contract.position, "name", i18n.language)
    : contract.position_id
      ? findLabel(positionOptions, contract.position_id)
      : "-";

  return (
    <div className="contracts-container container">
      <div className="page-header">
        <h1>
          <div className="page-header__icon">
            <i className="fas fa-file-contract"></i>
          </div>
          {t("contracts.detail.titlePrefix")}{contract.contract_number}
        </h1>
        <button className="btn btn-cancel" onClick={() => navigate("/contracts")}>
          <i className="fas fa-arrow-left"></i> {t("contracts.detail.back")}
        </button>
      </div>

      <Protected permission="employee_contracts.create">
        <div className="detail-actions detail-actions--top">
          {canRenew && (
            <button
              className="btn btn-save"
              onClick={() => navigate("/contracts", { state: { newContractFor: { employeeId: ownerId, fromContractId: contract.id, mode: "renew" } } })}
            >
              <i className="fas fa-rotate"></i> {t("contracts.detail.renewAction")}
            </button>
          )}
          <button
            className="btn btn-save"
            onClick={() => navigate("/contracts", { state: { newContractFor: { employeeId: ownerId, fromContractId: contract.id, mode: "additional" } } })}
          >
            <i className="fas fa-plus"></i> {t("contracts.detail.addAction")}
          </button>
        </div>
      </Protected>

      {(status === "active" || (status !== "terminated" && status !== "cancelled")) && (
        <div className="detail-actions detail-actions--top">
          {status === "active" && (
            <>
              <Protected permission="employee_contracts.set_inactive">
                <button className="btn btn-detail-cancel" onClick={() => { setPendingAction("cancel"); setActionDate(""); }}>
                  <i className="fas fa-times-circle"></i> {t("contracts.detail.cancelAction")}
                </button>
              </Protected>
              <Protected permission="employee_contracts.terminate">
                <button className="btn btn-detail-terminate" onClick={() => { setPendingAction("terminate"); setActionDate(""); }}>
                  <i className="fas fa-ban"></i> {t("contracts.detail.terminateAction")}
                </button>
              </Protected>
            </>
          )}
          {status !== "active" && (
            <button className="btn btn-detail-activate" onClick={() => { setPendingAction("activate"); setActionDate(""); }}>
              <i className="fas fa-check-circle"></i> {t("contracts.detail.activateAction")}
            </button>
          )}
        </div>
      )}

      {pendingAction && (
        <div className="detail-date-picker">
          <label className="detail-date-label">
            <i className="fas fa-calendar-alt"></i> {actionLabels[pendingAction]}
          </label>
          <div className="detail-date-row">
            <DateInput
              className="detail-date-input"
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
            />
            <button className="btn btn-save" onClick={confirmAction} disabled={!actionDate || actionMutation.isPending}>
              {t("contracts.detail.confirm")}
            </button>
            <button className="btn btn-cancel" onClick={() => { setPendingAction(null); setActionDate(""); }}>
              {t("contracts.detail.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="contracts-form">
        <div className="detail-section">
          <h2 className="detail-section-title">
            <i className="fas fa-user"></i> {t("contracts.detail.sections.personal")}
          </h2>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.fullName")}</span>
              <span className="detail-value">{emp.full_name || `${emp.last_name} ${emp.first_name} ${emp.middle_name}`}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.pinfl")}</span>
              <span className="detail-value">{emp.pinfl || "-"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.birthDate")}</span>
              <span className="detail-value">{formatDate(emp.birth_date)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.phone")}</span>
              <span className="detail-value">{emp.phone}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.citizenship")}</span>
              <span className="detail-value">{contract.citizenship || emp.citizenship || "-"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.language")}</span>
              <span className="detail-value">{contract.language || t("contracts.detail.values.naLanguage")}</span>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h2 className="detail-section-title">
            <i className="fas fa-id-card"></i> {t("contracts.detail.sections.passport")}
          </h2>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.passportSeries")}</span>
              <span className="detail-value">{emp.passport_series} {emp.passport_number}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.passportGivenDate")}</span>
              <span className="detail-value">{formatDate(emp.passport_given_date)}</span>
            </div>
            <div className="detail-item" style={{ gridColumn: "span 2" }}>
              <span className="detail-label">{t("contracts.detail.fields.passportGivenBy")}</span>
              <span className="detail-value">{emp.passport_given_by}</span>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h2 className="detail-section-title">
            <i className="fas fa-briefcase"></i> {t("contracts.detail.sections.workplace")}
          </h2>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.contractNumber")}</span>
              <span className="detail-value">{contract.contract_number}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.branch")}</span>
              <span className="detail-value">{branchName}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.contractDate")}</span>
              <span className="detail-value">{formatDate(contract.contract_date)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.department")}</span>
              <span className="detail-value">{getLocalized(contract.department, "name", i18n.language)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.position")}</span>
              <span className="detail-value">{positionName !== "-" ? positionName : t("contracts.detail.values.defaultPosition")}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.status")}</span>
              <span className={`badge ${status}`}>{statusLabel[status] ?? status}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.workStartDate")}</span>
              <span className="detail-value">{formatDate(contract.work_start_date)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.startDate")}</span>
              <span className="detail-value">{formatDate(contract.contract_start_date)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.endDate")}</span>
              <span className="detail-value">{formatDate(contract.contract_end_date)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.contractType")}</span>
              <span className="detail-value">{contractTypeLabels[contract.contract_type] || contract.contract_type}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.contractDuration")}</span>
              <span className="detail-value">{termText || "—"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.salaryType")}</span>
              <span className="detail-value">{salaryKey ? (salaryTypeLabels[salaryKey] || salaryKey) : "—"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.probation")}</span>
              <span className="detail-value">{contract.probation_period || t("contracts.detail.values.noProbation")}</span>
            </div>
            {contract.probation_end_date && (
              <div className="detail-item">
                <span className="detail-label">{t("contracts.detail.fields.probationEnd")}</span>
                <span className="detail-value">{formatDate(contract.probation_end_date)}</span>
              </div>
            )}
            {contract.signed_by && (
              <div className="detail-item">
                <span className="detail-label">{t("contracts.detail.fields.signedBy")}</span>
                <span className="detail-value">{contract.signed_by}</span>
              </div>
            )}
          </div>
        </div>

        <div className="detail-section">
          <h2 className="detail-section-title">
            <i className="fas fa-money-bill-wave"></i> {t("contracts.detail.sections.salary")}
          </h2>
          <div className="detail-grid">
            {/* "foiz" turida asosiy maosh / ish soati / soatlik maosh yo'q —
                ularning o'rniga foiz stavkasi ko'rsatiladi. */}
            {salaryKey === "foiz" ? (
              <div className="detail-item">
                <span className="detail-label">{t("contracts.detail.fields.salaryPercent")}</span>
                <span className="detail-value">
                  {salaryPercent !== null && salaryPercent !== undefined
                    ? `${salaryPercent}%`
                    : "—"}
                </span>
              </div>
            ) : (
              <>
                <div className="detail-item">
                  <span className="detail-label">{t("contracts.detail.fields.baseSalary")}</span>
                  <span className="detail-value">{groupDigits(contract.base_salary)} UZS</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{t("contracts.detail.fields.workingHours")}</span>
                  <span className="detail-value">{contract.working_hours_monthly} {t("contracts.detail.values.hours")}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{t("contracts.detail.fields.hourlyRate")}</span>
                  <span className="detail-value">{groupDigits(contract.hourly_rate)} UZS</span>
                </div>
              </>
            )}
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.totalSalary")}</span>
              <span className="detail-value" style={{ fontWeight: "bold", color: "#fe9100" }}>
                {groupDigits(contract.total_monthly_salary)} UZS
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.salaryPeriod")}</span>
              <span className="detail-value">{formatDate(contract.salary_start_date)} — {formatDate(contract.salary_end_date)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t("contracts.detail.fields.vacationType")}</span>
              <span className="detail-value">{contract.vacation_type ? (vacationTypeLabels[contract.vacation_type] || contract.vacation_type) : t("contracts.detail.values.noVacation")}</span>
            </div>
            {contract.additional_tasks && contract.additional_tasks.length > 0 && (
              <div className="detail-item" style={{ gridColumn: "span 2" }}>
                <span className="detail-label">{t("contracts.detail.fields.additionalTasks")}</span>
                <span className="detail-value">
                  {contract.additional_tasks
                    .map((x) => `${(x.task && getLocalized(x.task, "name", i18n.language)) || `#${x.task_id}`}${x.salary ? ` — ${groupDigits(x.salary)} UZS` : ""}${x.comment ? ` (${x.comment})` : ""}`)
                    .join("; ")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="detail-section">
          <h2 className="detail-section-title">
            <i className="fas fa-map-marker-alt"></i> {t("contracts.detail.sections.address")}
          </h2>
          <div className="detail-grid">
            <div className="detail-item" style={{ gridColumn: "span 2" }}>
              <span className="detail-label">{t("contracts.detail.fields.addressRegistration")}</span>
              <span className="detail-value">{emp.address_registration}</span>
            </div>
            <div className="detail-item" style={{ gridColumn: "span 2" }}>
              <span className="detail-label">{t("contracts.detail.fields.addressLiving")}</span>
              <span className="detail-value">{emp.address_living}</span>
            </div>
          </div>
        </div>

        {otherContracts.length > 0 && (
          <div className="detail-section">
            <h2 className="detail-section-title">
              <i className="fas fa-folder-open"></i> {t("contracts.detail.otherContracts")}
            </h2>
            <div className="detail-grid">
              {otherContracts.map((c) => {
                const br = c.branch
                  ? getLocalized(c.branch, "name", i18n.language) || c.branch.label
                  : findLabel(branchOptions, c.branch_id ?? c.employee?.branch_id ?? 0);
                const dep = c.department ? getLocalized(c.department, "name", i18n.language) : "";
                return (
                  <div
                    key={c.id}
                    className="detail-item"
                    style={{ gridColumn: "span 2", cursor: "pointer" }}
                    onClick={() => navigate(`/contracts/${c.id}`)}
                  >
                    <span className="detail-label">
                      #{c.contract_number} · {statusLabel[c.status] ?? c.status}
                    </span>
                    <span className="detail-value">
                      {[br, dep, formatDate(c.contract_start_date) + " — " + formatDate(c.contract_end_date)].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractDetailPage;
