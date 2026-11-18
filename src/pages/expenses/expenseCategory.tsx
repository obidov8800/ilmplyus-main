import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API } from '../../api/api';
import { useOptions, type Option } from '../../api/options';
import './users.css';
import './expenses.css';
import '../finance/finance.css';
import { useTranslation } from 'react-i18next';
import TableSkeleton from '../../components/TableSkeleton';
import EmptyState from '../../components/EmptyState';
import { getLocalized } from '../../utils/getLocalized';
import { jamgarmaLabelWithBranch } from '../../utils/jamgarmaLabel';
import MultiPicker from '@/components/MultiPicker';
import { Protected } from '../../components/Protected';
import SortableTh from '@/components/SortableTh';
import { useTableSort } from '@/hooks/useTableSort';

interface Jamgarma {
  id: number;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
  status: string;
}

interface ExpenseCategory {
  id: number;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
  created_at: string;
  updated_at: string;
  jamgarmas?: Jamgarma[];
}

interface FormData {
  name: string;
  jamgarma_ids: number[];
  created_at: string;
  updated_at: string;
}

const emptyForm: FormData = { name: '', jamgarma_ids: [], created_at: '', updated_at: '' };

const formatDateTime = (iso: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toLocalDateTimeInput = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toApiDateTime = (dt: string) => {
  if (!dt) return undefined;
  const base = dt.replace('T', ' ');
  return base.length === 16 ? base + ':00' : base;
};

const ExpensesCategory = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | 'all' | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [editingItem, setEditingItem] = useState<ExpenseCategory | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const { data: jamgarmas } = useOptions('jamgarmas');
  const { data: branches } = useOptions('branches');

  const { data: categories, isLoading } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const { data } = await API.get('/expense-categories');
      return data.data ?? data;
    },
  });


  const createMutation = useMutation({
    mutationFn: async () =>
      API.post('/expense-categories', {
        name_uz: formData.name,
        jamgarma_ids: formData.jamgarma_ids,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const payload: any = {
        name_uz: formData.name,
        jamgarma_ids: formData.jamgarma_ids,
      };
      if (formData.created_at) payload.created_at = toApiDateTime(formData.created_at);
      if (formData.updated_at) payload.updated_at = toApiDateTime(formData.updated_at);
      return API.put(`/expense-categories/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => API.delete(`/expense-categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    },
  });

  const resetForm = () => {
    setShowAddModal(false);
    setEditingItem(null);
    setFormData(emptyForm);
  };

  const openEditModal = (item: ExpenseCategory) => {
    setEditingItem(item);
    setFormData({
      name: item.name_uz,
      jamgarma_ids: item.jamgarmas?.map((j) => j.id) ?? [],
      created_at: toLocalDateTimeInput(item.created_at),
      updated_at: toLocalDateTimeInput(item.updated_at),
    });
    setShowAddModal(true);
  };

  const confirmDelete = () => {
    if (deleteTarget === 'all') {
      selected.forEach((id) => deleteMutation.mutate(id));
      setSelected([]);
    }
    if (typeof deleteTarget === 'number') {
      deleteMutation.mutate(deleteTarget);
      setSelected((p) => p.filter((x) => x !== deleteTarget));
    }
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const toggleAll = (checked: boolean) =>
    setSelected(checked ? categories?.map((c) => c.id) || [] : []);

  const toggleOne = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // `jamgarmas` — /options/jamgarmas dan (`label`), `item.jamgarmas` — kategoriya
  // javobidan (`name_uz`) keladi, ikkalasi ham shu yerdan o'tadi.
  const getJamgarmaName = (j: Jamgarma | Option) =>
    ('label' in j && j.label) || getLocalized(j, 'name', i18n.language) || '-';

  // Bir xil nomli jamg'arma har filialda bor — forma ro'yxatida filial nomi bilan ajratiladi.
  const jamgarmaOptionLabel = (j: Option) => jamgarmaLabelWithBranch(getJamgarmaName(j), j.branch_id, branches);

  const sort = useTableSort(categories);

  return (
    <section className="users container">
      <h1 className="main-title">{t('expenses.expenseCategory')}</h1>

      {showAddModal && (
        <div className="modal-overlay">
          <div className="expenses-subcategory">
            <h1>{editingItem ? t('expenses.editCategory') : t('expenses.expenseCategory')}</h1>

            <form
              className="subcategory-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (editingItem) {
                  updateMutation.mutate({ id: editingItem.id });
                } else {
                  createMutation.mutate();
                }
              }}
            >
              <div className="subcategory-form-group">
                <label>{t('expenses.fund')}</label>
                <MultiPicker
                  options={(jamgarmas ?? []).map((j) => ({ value: j.id, label: jamgarmaOptionLabel(j) }))}
                  value={formData.jamgarma_ids}
                  onChange={(ids) => setFormData((prev) => ({ ...prev, jamgarma_ids: ids }))}
                  placeholder={t('expenses.chooseFund')}
                />
              </div>

              <div className="subcategory-form-group">
                <label>{t('expenses.expenseCategoryName')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              {editingItem && (
                <>
                  <div className="subcategory-form-group">
                    <label>{t('expenses.createdAt')}</label>
                    <input
                      type="datetime-local"
                      value={formData.created_at}
                      onChange={(e) => setFormData({ ...formData, created_at: e.target.value })}
                    />
                  </div>
                  <div className="subcategory-form-group">
                    <label>{t('expenses.updatedAt')}</label>
                    <input
                      type="datetime-local"
                      value={formData.updated_at}
                      onChange={(e) => setFormData({ ...formData, updated_at: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button
                  className="primary"
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? t('expenses.saving')
                    : t('expenses.save')}
                </button>
                <button type="button" className="cancel" onClick={resetForm}>
                  {t('expenses.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal small">
            <h3>{t('expenses.confirmDelete')}</h3>
            <div className="modal-actions">
              <button className="danger" onClick={confirmDelete}>
                {t('expenses.delete')}
              </button>
              <button className="cancel" onClick={() => setShowDeleteModal(false)}>
                {t('expenses.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="users-filters">
        <Protected permission="expense_categories.create">
          <button className="btn-accent" onClick={() => setShowAddModal(true)}>
            {t('expenses.addBtn')}
          </button>
        </Protected>
        <Protected permission="expense_categories.delete">
          <button
            className="delete-all"
            disabled={!selected.length}
            onClick={() => {
              setDeleteTarget('all');
              setShowDeleteModal(true);
            }}
          >
            {t('expenses.delete')}
          </button>
        </Protected>
      </div>

      <div className="table-card">
        <div className="responsive-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={
                    selected.length === (categories?.length || 0) && (categories?.length || 0) > 0
                  }
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <SortableTh sortKey="id" sort={sort}>
                ID
              </SortableTh>
              <th>{t('expenses.categoryName')}</th>
              <th>{t('expenses.fund')}</th>
              <th>{t('expenses.createdAt')}</th>
              <th>{t('expenses.updatedAt')}</th>
              <th>{t('expenses.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <TableSkeleton rowCount={8} columnCount={7} />
            ) : categories?.length ? (
              sort.rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleOne(item.id)}
                      />
                    </td>
                    <td>{item.id}</td>
                    <td>{getLocalized(item, 'name', i18n.language)}</td>
                    <td>
                      {item.jamgarmas && item.jamgarmas.length > 0
                        ? item.jamgarmas.map((j) => getJamgarmaName(j)).join(', ')
                        : '-'}
                    </td>
                    <td>{formatDateTime(item.created_at)}</td>
                    <td>{formatDateTime(item.updated_at)}</td>
                    <td>
                      <div className="row-actions">
                        <Protected permission="expense_categories.edit">
                          <button className="row-action row-action--edit" onClick={() => openEditModal(item)}>
                            <i className="fa-solid fa-pen"></i>
                          </button>
                        </Protected>
                        {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                        <Protected permission="expense_categories.delete">
                          <button
                            className="row-action row-action--delete"
                            onClick={() => {
                              setDeleteTarget(item.id);
                              setShowDeleteModal(true);
                            }}
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </Protected>
                        */}
                      </div>
                    </td>
                  </tr>
                ))
            ) : (
              <EmptyState colSpan={7} message={t('expenses.categoryNotFound')} />
            )}
          </tbody>
        </table>
        </div>

        {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
        <div className="responsive-cards">
          {isLoading ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              ...
            </div>
          ) : !categories?.length ? (
            <div className="data-card" style={{ textAlign: 'center' }}>
              {t('expenses.categoryNotFound')}
            </div>
          ) : (
            sort.rows.map((item) => (
              <div key={item.id} className="data-card">
                <div className="data-card__head">
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={() => toggleOne(item.id)}
                    />
                    <span className="data-card__title">
                      {getLocalized(item, 'name', i18n.language)}
                    </span>
                  </label>
                  <Protected permission="expense_categories.edit">
                    <button
                      className="row-action row-action--edit"
                      onClick={() => openEditModal(item)}
                    >
                      <i className="fa-solid fa-pen"></i>
                    </button>
                  </Protected>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">ID</span>
                  <span className="data-card__value">{item.id}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('expenses.fund')}</span>
                  <span className="data-card__value">
                    {item.jamgarmas && item.jamgarmas.length > 0
                      ? item.jamgarmas.map((j) => getJamgarmaName(j)).join(', ')
                      : '-'}
                  </span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('expenses.createdAt')}</span>
                  <span className="data-card__value">{formatDateTime(item.created_at)}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">{t('expenses.updatedAt')}</span>
                  <span className="data-card__value">{formatDateTime(item.updated_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default ExpensesCategory;
