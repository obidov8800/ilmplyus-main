import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { API } from "@/api/api";
import { useOptions, toSelectData } from "@/api/options";
import type { District, SaveDistrictPayload } from "@/types/district.types";
import DistrictModal from "./DistrictModal";
import { Protected } from "@/components/Protected";
import { getLocalized } from "@/utils/getLocalized";
import { sortByNewest } from "@/utils/sortByNewest";
import {
  useCreateMutation,
  useUpdateMutation,
  useDeleteMutation,
} from "@/hooks/useMutations";

export default function Districts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [search, setSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState<District | null>(null);

  const { data, isLoading } = useQuery<District[] | { data: District[] }>({
    queryKey: ["districts"],
    queryFn: () => API.get("/districts").then((r) => r.data),
  });

  const districts = Array.isArray(data) ? data : data?.data || [];

  const { data: regions } = useOptions("regions");

  const createMutation = useCreateMutation<
    District,
    Error,
    SaveDistrictPayload
  >(
    (payload) => API.post("/districts", payload).then((r) => r.data),
    [["districts"]],
  );

  const updateMutation = useUpdateMutation<
    District,
    Error,
    SaveDistrictPayload
  >(
    (payload) =>
      API.put(`/districts/${editingDistrict?.id}`, payload).then((r) => r.data),
    [["districts"]],
  );

  const deleteMutation = useDeleteMutation(
    (id) => API.delete(`/districts/${id}`).then((r) => r.data),
    [["districts"]],
  );

  const filteredDistricts = useMemo(() => {
    let result = districts;
    if (search) {
      result = result.filter((d) =>
        getLocalized(d, 'name', lang).toLowerCase().includes(search.toLowerCase()),
      );
    }
    if (selectedRegion) {
      result = result.filter((d) => String(d.region_id) === selectedRegion);
    }
    return sortByNewest(result);
  }, [districts, search, selectedRegion, lang]);

  const handleOpenEdit = (district: District) => {
    setEditingDistrict(district);
    setOpened(true);
  };

  const handleOpenCreate = () => {
    setEditingDistrict(null);
    setOpened(true);
  };

  const handleSave = (payload: SaveDistrictPayload) => {
    if (editingDistrict) {
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

  return (
    <section className="districts container page-root">
      <div className="page-toolbar">
        <div className="page-toolbar__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            placeholder={t("registration.inputPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="page-toolbar__select"
          value={selectedRegion ?? ""}
          onChange={(e) => setSelectedRegion(e.target.value || null)}
          aria-label={t("header.regions")}
        >
          <option value="">{t("registrationModal.placeholders.regionId")}</option>
          {toSelectData(regions).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Protected permission="districts.create">
          <button type="button" className="btn-accent" onClick={handleOpenCreate}>
            {t("registrationModal.add")}
          </button>
        </Protected>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t("header.districts")}</th>
              <th>{t("header.regions")}</th>
              <th>{t("dashboard.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr className="table-empty-row">
                <td colSpan={4}>{t("dashboard.loading")}...</td>
              </tr>
            ) : filteredDistricts.length === 0 ? (
              <tr className="table-empty-row">
                <td colSpan={4}>{t("dashboard.notFound")}</td>
              </tr>
            ) : (
              filteredDistricts.map((d) => (
                <tr key={d.id}>
                  <td>#{d.id}</td>
                  <td>{getLocalized(d, "name", lang)}</td>
                  <td>{d.region ? getLocalized(d.region, "name", lang) : "—"}</td>
                  <td>
                    <div className="row-actions">
                      <Protected permission="districts.edit">
                        <button
                          type="button"
                          className="row-action row-action--edit"
                          onClick={() => handleOpenEdit(d)}
                          aria-label={t("registrationModal.edit")}
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                      </Protected>
                      {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                      <Protected permission="districts.delete">
                        <button
                          type="button"
                          className="row-action row-action--delete"
                          onClick={() => handleDelete(d.id)}
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

      <DistrictModal
        opened={opened}
        onClose={() => setOpened(false)}
        onSave={handleSave}
        district={editingDistrict}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </section>
  );
}
