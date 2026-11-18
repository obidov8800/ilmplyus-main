import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { API } from "@/api/api";
import { fetchAllPages } from "@/api/fetchAllPages";
import type { User, SaveUserPayload } from "@/types/user.types";
import UserModal from "./UserModal";
import { Protected } from "@/components/Protected";
import { Pagination as AppPagination } from "@/components/Pagination";
import SortableTh from "@/components/SortableTh";
import { useTableSort } from "@/hooks/useTableSort";
import {
  useCreateMutation,
  useUpdateMutation,
  useDeleteMutation,
} from "@/hooks/useMutations";

export default function Users() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Ilgari faqat bitta server sahifasi olinib, qidiruv o'sha 15 qatorda ishlardi
  // (2-sahifadagi foydalanuvchi topilmasdi). Endi butun ro'yxat bir marta
  // olinadi — qidiruv va sahifalash klient tomonda.
  const { data: allUsers = [], isLoading } = useQuery<User[]>({
    queryKey: ["users", "all"],
    queryFn: () => fetchAllPages<User>("/users"),
  });

  const createMutation = useCreateMutation<User, Error, SaveUserPayload>(
    (payload) => API.post("/users", payload).then((r) => r.data),
    [["users"]],
  );

  const updateMutation = useUpdateMutation<User, Error, SaveUserPayload>(
    (payload) =>
      API.put(`/users/${editingUser?.id}`, payload).then((r) => r.data),
    [["users"]],
  );

  const deleteMutation = useDeleteMutation(
    (id) => API.delete(`/users/${id}`).then((r) => r.data),
    [["users"]],
  );

  const matchedUsers = useMemo(() => {
    const q = search.toLowerCase();
    return allUsers.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
    );
  }, [allUsers, search]);

  // Default — eng oxirgi qo'shilgan foydalanuvchi tepada; ID ustuni bosilsa asc/desc.
  const sort = useTableSort(matchedUsers);
  const sortedUsers = sort.rows;

  const total = sortedUsers.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, lastPage);
  const filteredUsers = sortedUsers.slice((safePage - 1) * perPage, safePage * perPage);
  const from = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const to = Math.min(safePage * perPage, total);

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setOpened(true);
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setOpened(true);
  };

  const handleSave = (payload: SaveUserPayload) => {
    if (editingUser) {
      updateMutation.mutate(payload, {
        onSuccess: () => setOpened(false),
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => setOpened(false),
      });
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm(t("lid.modals.confirmDelete"))) {
      deleteMutation.mutate(id);
    }
  };
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void handleDelete;

  const roleName = (u: User): string => {
    const role = typeof u.role === "object" ? u.role?.name : u.role;
    return role ?? "";
  };

  return (
    <section className="users container page-root">
      <div className="page-toolbar">
        <div className="page-toolbar__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            placeholder={t("registration.inputPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Protected permission="users.create">
          <button type="button" className="btn-accent" onClick={handleOpenCreate}>
            {t("registrationModal.add")}
          </button>
        </Protected>
      </div>

      <div className="table-card responsive-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh sortKey="id" sort={sort}>
                ID
              </SortableTh>
              <th>{t("attendance.table.fullName")}</th>
              <th>{t("login.loginPlaceHolder")}</th>
              <th>{t("tasks.role")}</th>
              <th>{t("dashboard.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr className="table-empty-row">
                <td colSpan={5}>{t("dashboard.loading")}...</td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr className="table-empty-row">
                <td colSpan={5}>{t("dashboard.notFound")}</td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>#{u.id}</td>
                  <td>
                    <div className="cell-stack">
                      <span className="cell-stack__title">{u.full_name}</span>
                      {u.phone && <span className="cell-stack__sub">{u.phone}</span>}
                    </div>
                  </td>
                  <td>{u.username}</td>
                  <td>
                    {roleName(u) ? (
                      <span className="badge badge-info">{roleName(u)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Protected permission="users.edit">
                        <button
                          type="button"
                          className="row-action row-action--edit"
                          onClick={() => handleOpenEdit(u)}
                          aria-label={t("registrationModal.edit")}
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                      </Protected>
                      {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                      <Protected permission="users.delete">
                        <button
                          type="button"
                          className="row-action row-action--delete"
                          onClick={() => handleDelete(u.id)}
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </Protected>
                      */}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
      <div className="responsive-cards">
        {isLoading ? (
          <div className="data-card" style={{ textAlign: "center" }}>
            {t("dashboard.loading")}...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="data-card" style={{ textAlign: "center" }}>
            {t("dashboard.notFound")}
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className="data-card">
              <div className="data-card__head">
                <span className="data-card__title">{u.full_name}</span>
                <Protected permission="users.edit">
                  <button
                    type="button"
                    className="row-action row-action--edit"
                    onClick={() => handleOpenEdit(u)}
                    aria-label={t("registrationModal.edit")}
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                </Protected>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">ID</span>
                <span className="data-card__value">#{u.id}</span>
              </div>
              <div className="data-card__row">
                <span className="data-card__label">{t("login.loginPlaceHolder")}</span>
                <span className="data-card__value">{u.username}</span>
              </div>
              {u.phone && (
                <div className="data-card__row">
                  <span className="data-card__label">
                    {t("registrationModal.fields.phone")}
                  </span>
                  <span className="data-card__value">{u.phone}</span>
                </div>
              )}
              <div className="data-card__row">
                <span className="data-card__label">{t("tasks.role")}</span>
                <span className="data-card__value">
                  {roleName(u) ? <span className="badge badge-info">{roleName(u)}</span> : "—"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {total > 0 && (
        <AppPagination
          currentPage={safePage}
          lastPage={lastPage}
          total={total}
          from={from}
          to={to}
          onPageChange={setPage}
          pageSize={perPage}
          onPageSizeChange={(size) => {
            setPerPage(size);
            setPage(1);
          }}
        />
      )}

      <UserModal
        opened={opened}
        onClose={() => setOpened(false)}
        onSave={handleSave}
        user={editingUser}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </section>
  );
}
