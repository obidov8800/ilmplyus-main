import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API } from '@/api/api';
import type { Region, SaveRegionPayload } from '@/types/region.types';
import RegionModal from './RegionModal';
import { Protected } from '@/components/Protected';
import { getLocalized } from '@/utils/getLocalized';
import { useCreateMutation, useUpdateMutation, useDeleteMutation } from '@/hooks/useMutations';
import { useTableSort } from '@/hooks/useTableSort';
import SortableTh from '@/components/SortableTh';

export default function Regions() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);

  const { data, isLoading } = useQuery<Region[] | { data: Region[] }>({
    queryKey: ['regions'],
    queryFn: () => API.get('/regions').then((r) => r.data),
  });

  const regions = Array.isArray(data) ? data : data?.data || [];

  const createMutation = useCreateMutation<Region, Error, SaveRegionPayload>(
    (payload) => API.post('/regions', payload).then((r) => r.data),
    [['regions']],
  );

  const updateMutation = useUpdateMutation<Region, Error, SaveRegionPayload>(
    (payload) => API.put(`/regions/${editingRegion?.id}`, payload).then((r) => r.data),
    [['regions']],
  );

  const deleteMutation = useDeleteMutation(
    (id) => API.delete(`/regions/${id}`).then((r) => r.data),
    [['regions']],
  );

  const matchedRegions = useMemo(() => {
    return regions.filter((r) =>
      getLocalized(r, 'name', lang).toLowerCase().includes(search.toLowerCase()),
    );
  }, [regions, search, lang]);

  // Default — eng oxirgi qo'shilgani tepada; ID ustuni bosilsa asc/desc.
  const sort = useTableSort(matchedRegions);
  const filteredRegions = sort.rows;

  const handleOpenEdit = (region: Region) => {
    setEditingRegion(region);
    setOpened(true);
  };

  const handleOpenCreate = () => {
    setEditingRegion(null);
    setOpened(true);
  };

  const handleSave = (payload: SaveRegionPayload) => {
    if (editingRegion) {
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
    if (window.confirm(t('lid.modals.confirmDelete'))) {
      deleteMutation.mutate(id);
    }
  };
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void handleDelete;

  return (
    <section className="regions container page-root">
      <div className="page-toolbar">
        <div className="page-toolbar__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            placeholder={t('registration.inputPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Protected permission="regions.create">
          <button type="button" className="btn-accent" onClick={handleOpenCreate}>
            {t('registrationModal.add')}
          </button>
        </Protected>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh sortKey="id" sort={sort}>
                ID
              </SortableTh>
              <th>{t('header.regions')}</th>
              <th>{t('dashboard.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr className="table-empty-row">
                <td colSpan={3}>{t('dashboard.loading')}...</td>
              </tr>
            ) : filteredRegions.length === 0 ? (
              <tr className="table-empty-row">
                <td colSpan={3}>{t('dashboard.notFound')}</td>
              </tr>
            ) : (
              filteredRegions.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{getLocalized(r, 'name', lang)}</td>
                  <td>
                    <div className="row-actions">
                      <Protected permission="regions.edit">
                        <button
                          type="button"
                          className="row-action row-action--edit"
                          onClick={() => handleOpenEdit(r)}
                          aria-label={t('registrationModal.edit')}
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                      </Protected>
                      {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                      <Protected permission="regions.delete">
                        <button
                          type="button"
                          className="row-action row-action--delete"
                          onClick={() => handleDelete(r.id)}
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

      <RegionModal
        opened={opened}
        onClose={() => setOpened(false)}
        onSave={handleSave}
        region={editingRegion}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </section>
  );
}
