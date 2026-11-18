import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { API } from "../../api/api";
import "./contracts.css";
import { useTranslation } from "react-i18next";
import { getLocalized } from "../../utils/getLocalized";
import ContractsCreate from "./ContractsCreate";
import { Protected } from "@/components/Protected";
import { Pagination } from "@/components/Pagination";
import { useOptions } from "@/api/options";
import { usePermission } from "@/hooks/usePermission";
import FilterBar, { type FilterBarField } from "@/components/FilterBar";
import { countFilterBarValues } from "@/components/FilterBar/filterBar.utils";
import FilterButton from "@/components/FilterButton";
import SortableTh from "@/components/SortableTh";
import { useTableSort } from "@/hooks/useTableSort";
import { formatDate as formatDisplayDate } from "@/utils/date";
import { printFromDocxTemplate } from "@/utils/contractPdf";
import { buildEmployeeContractData } from "@/utils/employeeContractPdf";
import employmentTemplate from "@/assets/documents/ILM_PLYUS_Mehnat_shartnomasi_TEMPLATE.docx?url";

interface Employee {
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
  photo_url?: string;
  branch_id?: number;
}

interface Department {
  id: number;
  name_uz: string | null;
  name_ru: string | null;
  name_en: string | null;
  code?: string;
}

interface BranchRekvizit {
  id: number;
  name_uz?: string | null;
  legal_name?: string | null;
  city?: string | null;
  address_uz?: string | null;
  legal_address_uz?: string | null;
  inn?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  mfo?: string | null;
  director_name?: string | null;
}

interface Contract {
  id: number;
  employee_id: number;
  branch_id?: number | null;
  contract_number: number;
  contract_date: string;
  contract_start_date: string;
  contract_end_date: string;
  status: string;
  base_salary: string;
  employee: Employee;
  department: Department;
  position_id: number;
  position?: {
    id: number;
    name_uz: string | null;
    name_ru: string | null;
    name_en: string | null;
  };
  contract_type: string;
  contract_duration_months?: string | null;
  monthly_salary_type?: string | null;
  /** Yangi backend maydoni: staff_schedule | percent | academic_hours */
  salary_type?: string | null;
  work_start_date?: string | null;
  vacation_type: string;
  vacation_days?: number | string | null;
  working_hours_monthly: string;
  hourly_rate: string;
  total_monthly_salary: string;
  salary_start_date: string;
  salary_end_date: string;
  signed_by: string;
  language: string;
  probation_period: string | null;
  probation_end_date: string | null;
  /** Word shablonidagi NTM rekvizitlari (STIR, MFO, bank, H/R, rahbar) uchun. */
  branch?: BranchRekvizit;
}

/** Jadvalda ham, saralashda ham bir xil ism ko'rinishi uchun. */
function employeeName(emp?: Partial<Employee>): string {
  return (
    emp?.full_name ||
    `${emp?.last_name || ""} ${emp?.first_name || ""} ${emp?.middle_name || ""}`.trim() ||
    ""
  );
}

const Contracts: React.FC = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editContract, setEditContract] = useState<{
    employeeId: number;
    contractId: number;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // Shartnoma sahifasidan «Qayta shartnoma» / «Qo'shimcha shartnoma» bosilganda shu yerda forma ochiladi.
  const location = useLocation();
  const [createFor, setCreateFor] = useState<{
    employeeId: number;
    fromContractId: number;
    mode: "renew" | "additional";
  } | null>(
    () =>
      (location.state as { newContractFor?: { employeeId: number; fromContractId: number; mode: "renew" | "additional" } } | null)
        ?.newContractFor ?? null,
  );
  useEffect(() => {
    if ((location.state as { newContractFor?: unknown } | null)?.newContractFor) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busyDoc, setBusyDoc] = useState<{
    contractId: number;
    mode: "pdf" | "print";
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ departmentId: "", status: "", branchId: "" });

  const {
    data: contracts,
    isLoading,
    isError,
  } = useQuery<Contract[]>({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data } = await API.get("/contracts");
      return data;
    },
  });

  /**
   * `GET /contracts` shartnoma bilan `branch` relation'ini qaytarmaydi, shuning
   * uchun Word shablonidagi NTM rekvizitlari (nom, manzil, STIR, MFO, bank, H/R,
   * telefon, rahbar) bo'sh ("—") chiqardi. Rekvizitlar bor to'liq ro'yxat shu
   * yerdan olinib, PDF/print vaqtida `branch_id` bo'yicha biriktiriladi.
   * `/branches` faqat `branches.view` bo'lsa so'raladi; bo'lmasa — `/options/branches` (nom va shahar; bank
   * rekvizitlari hujjatda «—» bo'lib qoladi — ular `/options` ga backend topshirig'i bilan qo'shiladi).
   */
  const canViewBranches = usePermission("branches.view");
  const { data: fullBranches } = useQuery<BranchRekvizit[]>({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await API.get("/branches");
      return Array.isArray(data) ? data : data?.data || [];
    },
    enabled: canViewBranches,
    staleTime: 5 * 60 * 1000,
  });
  const { data: branchOptions = [] } = useOptions("branches", undefined, { enabled: !canViewBranches });
  const branches = useMemo<BranchRekvizit[] | undefined>(
    () =>
      canViewBranches
        ? fullBranches
        : branchOptions.map((o) => ({ id: o.id, name_uz: o.label, city: o.city }) as BranchRekvizit),
    [canViewBranches, fullBranches, branchOptions],
  );

  const { data: departmentOptions = [] } = useOptions("departments");
  const { data: positionOptions = [] } = useOptions("positions");

  /** Shartnoma filiali (`contract.branch`) — xodimning asosiy filiali (`employee.branch`) emas. */
  const contractBranchName = (c: Contract): string => {
    const id = c.branch_id ?? c.branch?.id ?? c.employee?.branch_id;
    const full = branches?.find((b) => b.id === Number(id));
    return (
      (c.branch ? getLocalized(c.branch, "name", i18n.language) : "") ||
      (full ? getLocalized(full, "name", i18n.language) || full.name_uz || "" : "") ||
      "-"
    );
  };

  const filterFields: FilterBarField<"departmentId" | "status" | "branchId">[] = [
    {
      key: "branchId",
      label: t("contracts.filterBranch", "Filial"),
      placeholder: t("contracts.filterBranch", "Filial"),
      options: (branches ?? []).map((b) => ({ value: b.id, label: b.name_uz ?? String(b.id) })),
    },
    {
      key: "departmentId",
      label: t("contracts.table.department"),
      placeholder: t("contracts.table.department"),
      options: departmentOptions.map((d) => ({ value: d.id, label: d.label })),
    },
    {
      key: "status",
      label: t("contracts.table.status"),
      placeholder: t("contracts.table.status"),
      options: [
        { value: "active", label: t("contracts.status.active") },
        { value: "inactive", label: t("contracts.status.inactive") },
      ],
    },
  ];

  const filterValues = { departmentId: filters.departmentId, status: filters.status, branchId: filters.branchId };
  const activeFilterCount = countFilterBarValues(filterValues);

  const handleFiltersChange = (next: typeof filterValues) => {
    setFilters(next);
    setCurrentPage(1);
  };

  const handleFiltersReset = () => {
    setFilters({ departmentId: "", status: "", branchId: "" });
    setCurrentPage(1);
  };

  // Eng oxirgi qo'shilgan shartnoma jadval boshida turishi kerak. `created_at`
  // bu yerda ishonchli emas — default tartib id bo'yicha kamayish tartibida.
  const sort = useTableSort<Contract>(contracts, undefined, (a, b) => b.id - a.id);

  const processedData = useMemo(() => {
    let rows = sort.rows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((c) => {
        const emp = c.employee || {};
        return employeeName(emp).toLowerCase().includes(q) || (emp.phone || "").includes(q);
      });
    }
    if (filters.departmentId) {
      rows = rows.filter((c) => String(c.department?.id) === filters.departmentId);
    }
    if (filters.branchId) {
      rows = rows.filter(
        (c) => String(c.branch_id ?? c.employee?.branch_id) === filters.branchId,
      );
    }
    if (filters.status) {
      const isActive = filters.status === "active";
      rows = rows.filter((c) => (c.status === "active") === isActive);
    }
    return rows;
  }, [sort.rows, search, filters]);

  const totalPages = Math.ceil(processedData.length / pageSize);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, currentPage, pageSize]);

  const deleteMutation = useMutation({
    mutationFn: async ({
      employeeId,
      contractId,
    }: {
      employeeId: number;
      contractId: number;
    }) => {
      await API.delete(`/employees/${employeeId}/contracts/${contractId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  const handleDelete = (employeeId: number, contractId: number) => {
    if (window.confirm(t("contracts.deleteConfirm"))) {
      deleteMutation.mutate({ employeeId, contractId });
    }
  };
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void handleDelete;

  /**
   * Mehnat shartnomasini Word shabloni asosida PDF/chop etishga uzatadi.
   * Jadvaldagi shartnoma obyekti to'liq ishlatiladi — alohida so'rov yuborilmaydi
   * (backendda GET /contracts/{id} yo'q).
   *
   * O'quvchi shartnomalari bilan bir xil `printFromDocxTemplate` chaqiriladi,
   * shuning uchun PDF/print parametrlari aynan bir xil bo'ladi.
   */
  const handleGenerate = async (contract: Contract, mode: "pdf" | "print") => {
    setBusyDoc({ contractId: contract.id, mode });
    try {
      // Shartnoma filiali; rekvizitlar (STIR, MFO, bank…) to'liq ro'yxatdan — `contract.branch` da faqat nom keladi.
      const branchId = contract.branch_id ?? contract.branch?.id ?? contract.employee?.branch_id;
      const full = branches?.find((b) => b.id === Number(branchId));
      const branch = full ? { ...(contract.branch ?? {}), ...full } : contract.branch;
      // `GET /contracts` javobida `position` munosabati kelmaydi (faqat `position_id`) — hujjatdagi lavozim
      // «—» bo'lib qolardi. Nomi lavozimlar ro'yxatidan olinadi.
      const position =
        contract.position ??
        (contract.position_id
          ? (() => {
              const o = positionOptions.find((p) => p.id === Number(contract.position_id));
              return o ? { id: o.id, name_uz: o.label, name_ru: o.label, name_en: o.label } : undefined;
            })()
          : undefined);
      await printFromDocxTemplate(
        employmentTemplate,
        buildEmployeeContractData({ ...contract, branch, position }),
        String(contract.contract_number ?? contract.id),
        mode,
      );
    } catch (err) {
      console.error(`${mode} xatosi:`, err);
      alert(t(mode === "pdf" ? "contracts.pdfError" : "contracts.printError"));
    } finally {
      setBusyDoc(null);
    }
  };

  const formatDate = (dateStr: string) => formatDisplayDate(dateStr, "-");

  if (createFor) {
    return (
      <ContractsCreate
        employeeId={createFor.employeeId}
        sourceContractId={createFor.fromContractId}
        mode={createFor.mode}
        onCancel={() => setCreateFor(null)}
        onSuccess={() => setCreateFor(null)}
      />
    );
  }

  if (isCreating) {
    return (
      <ContractsCreate
        onCancel={() => setIsCreating(false)}
        onSuccess={() => setIsCreating(false)}
      />
    );
  }

  if (editContract) {
    return (
      <ContractsCreate
        employeeId={editContract.employeeId}
        contractId={editContract.contractId}
        onCancel={() => setEditContract(null)}
        onSuccess={() => setEditContract(null)}
      />
    );
  }

  return (
    <div className="contracts-container container">
      <div className="contracts-top__actions">
        <div className="contracts-search">
          <i className="fas fa-magnifying-glass"></i>
          <input
            type="search"
            placeholder={t("contracts.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <FilterButton
          onClick={() => setFilterOpen((v) => !v)}
          active={filterOpen || activeFilterCount > 0}
          expanded={filterOpen}
          count={activeFilterCount}
        />

        <Protected permission="employee_contracts.create">
          <button className="btn-accent" onClick={() => setIsCreating(true)}>
            {t("contracts.newContract")}
          </button>
        </Protected>
      </div>

      <div className="table-card">
        {filterOpen && (
          <FilterBar
            fields={filterFields}
            values={filterValues}
            onChange={handleFiltersChange}
            onReset={handleFiltersReset}
            onClose={() => setFilterOpen(false)}
          />
        )}

        <div className="responsive-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh sortKey="id" sort={sort}>
                {t("contracts.table.id")}
              </SortableTh>
              <th>{t("contracts.table.fullName")}</th>
              <th>{t("contracts.table.phone")}</th>
              <th>{t("contracts.table.department")}</th>
              <th>{t("contracts.filterBranch", "Filial")}</th>
              <th>{t("contracts.table.status")}</th>
              <th>{t("contracts.table.startDate")}</th>
              <th>{t("contracts.table.endDate")}</th>
              <th>{t("contracts.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} align="center">
                  {t("contracts.loading")}
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={8} align="center">
                  {t("contracts.error")}
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={8} align="center">
                  {t("contracts.noData")}
                </td>
              </tr>
            ) : (
              paginatedData?.map((contract) => {
                const emp = contract.employee || {};
                return (
                  <tr key={contract.id}>
                    <td>{contract.id}</td>
                    <td>{employeeName(emp) || (contract.employee ? "-" : t("contracts.employeeDeleted"))}</td>
                    <td>{emp.phone || "-"}</td>
                    <td>
                      {getLocalized(contract.department, "name", i18n.language)}
                    </td>
                    <td>{contractBranchName(contract)}</td>
                    <td>
                      <span className={`badge ${contract.status}`}>
                        {contract.status === "active"
                          ? t("contracts.status.active")
                          : t("contracts.status.inactive")}
                      </span>
                    </td>
                    <td>{formatDate(contract.contract_start_date)}</td>
                    <td>{formatDate(contract.contract_end_date)}</td>
                    <td>
                      <div className={contract.employee ? "row-actions" : "row-actions is-orphan"} title={contract.employee ? undefined : t("contracts.employeeDeleted")}>
                        <Protected permission="employee_contracts.show">
                          <div
                            className="row-action row-action--view"
                            onClick={() => navigate(`/contracts/${contract.id}`)}
                            title={t("contracts.actions.view")}
                          >
                            <i className="fas fa-eye"></i>
                          </div>
                        </Protected>
                        <Protected permission="employee_contracts.edit">
                          <div
                            className="row-action row-action--edit"
                            onClick={() =>
                              setEditContract({
                                employeeId: (contract.employee_id ?? emp.id),
                                contractId: contract.id,
                              })
                            }
                            title={t("contracts.actions.edit")}
                          >
                            <i className="fas fa-pen"></i>
                          </div>
                        </Protected>
                        <Protected permission="payroll_distributions.create">
                          <div
                            className="row-action row-action--pay"
                            onClick={() =>
                              navigate(`/payroll/distributions/${(contract.employee_id ?? emp.id)}`, {
                                state: {
                                  fullName:
                                    emp.full_name ||
                                    `${emp.last_name || ""} ${emp.first_name || ""} ${emp.middle_name || ""}`.trim(),
                                  department: contract.department,
                                  position: contract.position,
                                  branch: contract.branch,
                                  branchId: contract.branch_id ?? contract.branch?.id,
                                  salaryType: contract.salary_type ?? contract.monthly_salary_type,
                                  // `oklad` ataylab uzatilmaydi: bu yerdagi
                                  // `base_salary` — asosiy maosh, shartnoma okladi emas.
                                  // Taqsimlash sahifasi uni backend `contract_salary`
                                  // dan oladi.
                                },
                              })
                            }
                            title={t("contracts.actions.salary")}
                          >
                            <i className="fas fa-coins"></i>
                          </div>
                        </Protected>
                        <div
                          className="row-action row-action--print"
                          onClick={() => !busyDoc && handleGenerate(contract, "pdf")}
                          title={t("contracts.actions.pdf")}
                          style={{
                            pointerEvents: busyDoc ? "none" : "auto",
                            opacity: busyDoc ? 0.5 : 1,
                          }}
                        >
                          <i
                            className={
                              busyDoc?.contractId === contract.id && busyDoc.mode === "pdf"
                                ? "fas fa-spinner fa-spin"
                                : "fas fa-file-pdf"
                            }
                          ></i>
                        </div>
                        <div
                          className="row-action row-action--print"
                          onClick={() => !busyDoc && handleGenerate(contract, "print")}
                          title={t("contracts.actions.print")}
                          style={{
                            pointerEvents: busyDoc ? "none" : "auto",
                            opacity: busyDoc ? 0.5 : 1,
                          }}
                        >
                          <i
                            className={
                              busyDoc?.contractId === contract.id && busyDoc.mode === "print"
                                ? "fas fa-spinner fa-spin"
                                : "fas fa-print"
                            }
                          ></i>
                        </div>
                        {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                        <Protected permission="employee_contracts.delete">
                          <div
                            className="row-action row-action--delete"
                            onClick={() => handleDelete((contract.employee_id ?? emp.id), contract.id)}
                            title={t("contracts.actions.delete")}
                            style={{
                              pointerEvents: deleteMutation.isPending ? "none" : "auto",
                              opacity: deleteMutation.isPending ? 0.5 : 1,
                            }}
                          >
                            <i className="fas fa-trash"></i>
                          </div>
                        </Protected>
                        */}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
        <div className="responsive-cards">
          {isLoading ? (
            <div className="data-card" style={{ textAlign: "center" }}>
              {t("contracts.loading")}
            </div>
          ) : isError ? (
            <div className="data-card" style={{ textAlign: "center" }}>
              {t("contracts.error")}
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="data-card" style={{ textAlign: "center" }}>
              {t("contracts.noData")}
            </div>
          ) : (
            paginatedData.map((contract) => {
              const emp = contract.employee || ({} as Employee);
              return (
                <div key={contract.id} className="data-card">
                  <div className="data-card__head">
                    <span className="data-card__title">
                      {employeeName(emp) || (contract.employee ? "-" : t("contracts.employeeDeleted"))}
                    </span>
                  </div>
                  <div className={contract.employee ? "data-card__actions" : "data-card__actions is-orphan"}>
                      <Protected permission="employee_contracts.show">
                        <div
                          className="row-action row-action--view"
                          onClick={() => navigate(`/contracts/${contract.id}`)}
                          title={t("contracts.actions.view")}
                        >
                          <i className="fas fa-eye"></i>
                        </div>
                      </Protected>
                      <Protected permission="employee_contracts.edit">
                        <div
                          className="row-action row-action--edit"
                          onClick={() =>
                            setEditContract({
                              employeeId: (contract.employee_id ?? emp.id),
                              contractId: contract.id,
                            })
                          }
                          title={t("contracts.actions.edit")}
                        >
                          <i className="fas fa-pen"></i>
                        </div>
                      </Protected>
                      <Protected permission="payroll_distributions.create">
                        <div
                          className="row-action row-action--pay"
                          onClick={() =>
                            navigate(`/payroll/distributions/${(contract.employee_id ?? emp.id)}`, {
                              state: {
                                fullName:
                                  emp.full_name ||
                                  `${emp.last_name || ""} ${emp.first_name || ""} ${emp.middle_name || ""}`.trim(),
                                department: contract.department,
                                position: contract.position,
                                branch: contract.branch,
                                salaryType:
                                  contract.salary_type ?? contract.monthly_salary_type,
                              },
                            })
                          }
                          title={t("contracts.actions.salary")}
                        >
                          <i className="fas fa-coins"></i>
                        </div>
                      </Protected>
                      <div
                        className="row-action row-action--print"
                        onClick={() => !busyDoc && handleGenerate(contract, "pdf")}
                        title={t("contracts.actions.pdf")}
                        style={{
                          pointerEvents: busyDoc ? "none" : "auto",
                          opacity: busyDoc ? 0.5 : 1,
                        }}
                      >
                        <i
                          className={
                            busyDoc?.contractId === contract.id && busyDoc.mode === "pdf"
                              ? "fas fa-spinner fa-spin"
                              : "fas fa-file-pdf"
                          }
                        ></i>
                      </div>
                      <div
                        className="row-action row-action--print"
                        onClick={() => !busyDoc && handleGenerate(contract, "print")}
                        title={t("contracts.actions.print")}
                        style={{
                          pointerEvents: busyDoc ? "none" : "auto",
                          opacity: busyDoc ? 0.5 : 1,
                        }}
                      >
                        <i
                          className={
                            busyDoc?.contractId === contract.id && busyDoc.mode === "print"
                              ? "fas fa-spinner fa-spin"
                              : "fas fa-print"
                          }
                        ></i>
                      </div>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">{t("contracts.table.id")}</span>
                    <span className="data-card__value">{contract.id}</span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">
                      {t("contracts.table.phone")}
                    </span>
                    <span className="data-card__value">{emp.phone || "-"}</span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">
                      {t("contracts.table.department")}
                    </span>
                    <span className="data-card__value">
                      {getLocalized(contract.department, "name", i18n.language)}
                    </span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">
                      {t("contracts.table.status")}
                    </span>
                    <span className="data-card__value">
                      <span className={`badge ${contract.status}`}>
                        {contract.status === "active"
                          ? t("contracts.status.active")
                          : t("contracts.status.inactive")}
                      </span>
                    </span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">
                      {t("contracts.table.startDate")}
                    </span>
                    <span className="data-card__value">
                      {formatDate(contract.contract_start_date)}
                    </span>
                  </div>
                  <div className="data-card__row">
                    <span className="data-card__label">
                      {t("contracts.table.endDate")}
                    </span>
                    <span className="data-card__value">
                      {formatDate(contract.contract_end_date)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!isLoading && processedData.length > 0 && (
          <Pagination
            currentPage={currentPage}
            lastPage={totalPages}
            total={processedData.length}
            from={(currentPage - 1) * pageSize + 1}
            to={Math.min(currentPage * pageSize, processedData.length)}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Contracts;
