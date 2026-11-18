import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API } from '../../api/api.ts';
import { fetchAllPages } from '../../api/fetchAllPages.ts';
import { useOptions, optionLabel, type Option as LookupOption } from '../../api/options.ts';
import FilterBar, { type FilterBarField } from '../../components/FilterBar';
import { countFilterBarValues } from '../../components/FilterBar/filterBar.utils';
import FilterButton from '../../components/FilterButton';
import { Pagination } from '../../components/Pagination';
import useAuthStore from '../../store/useAuthStore.ts';
import { formatDateTime } from '../../utils/date.ts';
import { getLocalized } from '../../utils/getLocalized.ts';
import { sortByNewest } from '../../utils/sortByNewest.ts';
import type {
  Test,
  Question,
  Option,
  CreateTestPayload,
  CreateQuestionPayload,
  QuestionsPaginatedResponse,
  StudentResult,
  DifficultyLevel,
  QuestionType,
} from '../../types/studentsTest.types.ts';
import './studentsTest.css';
import { WriteGuard } from '@/components/Protected';

type TestFilterKey = 'branch' | 'course' | 'level';

const EMPTY_TEST_FILTERS: Record<TestFilterKey, string> = { branch: '', course: '', level: '' };

const TestPage = () => {
  const { t, i18n } = useTranslation();
  const permissions = useAuthStore((state) => state.permissions);
  const can = (p: string) => permissions.includes(p);
  const [view, setView] = useState<'list' | 'create' | 'results' | 'questions'>('list');
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Record<TestFilterKey, string>>(EMPTY_TEST_FILTERS);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const queryClient = useQueryClient();

  // Ilgari faqat bitta server sahifasi olinib, filtr/qidiruv o'sha sahifada
  // ishlardi — boshqa sahifadagi test topilmasdi va "Jami" server jami bilan
  // mos kelmasdi. Endi barcha testlar bir marta olinadi.
  const { data: allTests = [] } = useQuery<Test[]>({
    queryKey: ['tests', 'all'],
    queryFn: () => fetchAllPages<Test>('/tests'),
  });

  const filteredTests = useMemo(() => {
    let result = allTests;

    const branchId = filters.branch ? Number(filters.branch) : null;
    const courseId = filters.course ? Number(filters.course) : null;
    const levelId = filters.level ? Number(filters.level) : null;

    if (branchId) {
      result = result.filter((t) => (t.branch?.id ?? t.branch_id) === branchId);
    }
    if (courseId) {
      result = result.filter((t) => (t.course?.id ?? t.course_id) === courseId);
    }
    if (levelId) {
      result = result.filter((t) => (t.level?.id ?? t.level_id) === levelId);
    }

    if (search.trim()) {
      const lowerSearch = search.toLowerCase();
      result = result.filter((test) => {
        const testName = (test.name || '').toLowerCase();
        const courseName = (getLocalized(test.course, 'name', i18n.language) || '').toLowerCase();
        const branchName = (getLocalized(test.branch, 'name', i18n.language) || '').toLowerCase();

        return (
          testName.includes(lowerSearch) ||
          courseName.includes(lowerSearch) ||
          branchName.includes(lowerSearch)
        );
      });
    }

    return sortByNewest(result);
  }, [allTests, search, filters, i18n.language]);

  const testsTotal = filteredTests.length;
  const testsLastPage = Math.max(1, Math.ceil(testsTotal / perPage));
  const testsPage = Math.min(page, testsLastPage);
  const pagedTests = filteredTests.slice((testsPage - 1) * perPage, testsPage * perPage);
  const testsFrom = testsTotal === 0 ? 0 : (testsPage - 1) * perPage + 1;
  const testsTo = Math.min(testsPage * perPage, testsTotal);

  // Filtrdagi kurslar ham tanlangan filialga bog'liq — filial tanlanmaguncha so'rov ketmaydi.
  const { data: courses } = useOptions(
    'courses',
    { branch_id: filters.branch || undefined },
    { enabled: !!filters.branch },
  );
  const { data: branches } = useOptions('branches');

  const filterLevels = useMemo(() => {
    if (!filters.course || !courses) return [];
    return courses.find((c) => c.id === Number(filters.course))?.levels || [];
  }, [filters.course, courses]);

  const filterFields: FilterBarField<TestFilterKey>[] = [
    {
      key: 'branch',
      label: t('studentsTest.branch'),
      placeholder: t('studentsTest.selectBranch'),
      options: (branches ?? []).map((b) => ({ value: b.id, label: b.label })),
    },
    {
      key: 'course',
      label: t('studentsTest.course'),
      placeholder: t('studentsTest.selectCourse'),
      // Kurs ro'yxati filialga bog'liq — filial tanlanmaguncha tanlab bo'lmaydi.
      disabled: !filters.branch,
      options: (courses ?? []).map((c) => ({ value: c.id, label: c.label })),
    },
    {
      key: 'level',
      label: t('studentsTest.level'),
      placeholder: t('studentsTest.selectLevel'),
      // Daraja ro'yxati kursga bog'liq — kurs tanlanmaguncha tanlab bo'lmaydi.
      disabled: !filters.course,
      options: filterLevels.map((l) => ({ value: l.id, label: optionLabel(l, i18n.language) })),
    },
  ];

  // Yuqoridagi tanlov almashsa, unga bog'liq quyi tanlovlar tozalanadi.
  const handleFilterChange = (next: Record<TestFilterKey, string>) => {
    setPage(1);
    if (next.branch !== filters.branch) {
      setFilters({ ...next, course: '', level: '' });
      return;
    }
    setFilters(next.course !== filters.course ? { ...next, level: '' } : next);
  };

  const activeFilterCount = countFilterBarValues(filters);

  const createTestMutation = useMutation({
    mutationFn: (payload: CreateTestPayload) => API.post('/tests', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tests'] });
      setView('list');
    },
  });

  const updateTestMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateTestPayload> }) =>
      API.put(`/tests/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tests'] });
      setView('list');
    },
  });

  const deleteTestMutation = useMutation({
    mutationFn: (id: number) => API.delete(`/tests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tests'] });
    },
  });
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void deleteTestMutation;

  const renderContent = () => {
    switch (view) {
      case 'create':
        return (
          <TestForm
            onCancel={() => setView('list')}
            saving={createTestMutation.isPending || updateTestMutation.isPending}
            onSubmit={(data) => {
              if (selectedTest) {
                updateTestMutation.mutate({
                  id: selectedTest.id,
                  payload: data,
                });
              } else {
                createTestMutation.mutate(data);
              }
            }}
            initialData={selectedTest}
            branches={branches || []}
          />
        );
      case 'results':
        return <ResultsView test={selectedTest!} onBack={() => setView('list')} />;
      case 'questions':
        return <QuestionManager test={selectedTest!} onBack={() => setView('list')} />;
      default:
        return (
          <div className="table-card">
            {filterOpen && (
              <FilterBar
                fields={filterFields}
                values={filters}
                onChange={handleFilterChange}
                onReset={() => setFilters(EMPTY_TEST_FILTERS)}
                onClose={() => setFilterOpen(false)}
                ariaLabel={t('studentsTest.sort')}
              />
            )}
            {filteredTests.length > 0 ? (
              <div className="responsive-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{t('studentsTest.testName')}</th>
                    <th>{t('studentsTest.course')}</th>
                    <th>{t('studentsTest.level')}</th>
                    <th>{t('studentsTest.testDate')}</th>
                    <th>{t('studentsTest.timeLimit')}</th>
                    <th>{t('studentsTest.passPercentage') || "O'tish foizi"}</th>
                    <th>Savollar soni</th>
                    <th>{t('studentsTest.branch')}</th>
                    <th>{t('studentsTest.status')}</th>
                    <th>{t('studentsTest.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTests.map((test) => (
                    <tr key={test.id}>
                      <td>{test.id}</td>
                      <td>{test.name}</td>
                      <td>
                        {test.course
                          ? getLocalized(test.course, 'name', i18n.language)
                          : t('studentsTest.unknown')}
                      </td>
                      <td>
                        {test.level
                          ? getLocalized(test.level, 'name', i18n.language)
                          : t('studentsTest.unknown')}
                      </td>
                      <td>{test.created_at.slice(0, 10)}</td>
                      <td>
                        {test.time_limit} {t('studentsTest.minutes')}
                      </td>
                      <td>{test.pass_percentage}%</td>
                      <td>{test.questions_count || 0}</td>
                      <td>
                        {test.branch
                          ? getLocalized(test.branch, 'name', i18n.language)
                          : t('studentsTest.unknown')}
                      </td>
                      <td>
                        <span className={`status-badge status-${test.status}`}>
                          {test.status === 'active'
                            ? t('studentsTest.active')
                            : t('studentsTest.inactive')}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          {can('questions.view') && (
                            <button
                              className="row-action row-action--secondary"
                              onClick={() => {
                                setSelectedTest(test);
                                setView('questions');
                              }}
                            >
                              <i
                                className="fa-solid fa-file-lines"
                                style={{ fontSize: 20 }}
                              ></i>
                            </button>
                          )}
                          {can('tests.view') && (
                            <button
                              className="row-action row-action--view"
                              onClick={() => {
                                setSelectedTest(test);
                                setView('results');
                              }}
                            >
                              <i
                                className="fa-solid fa-eye"
                                style={{ fontSize: 20 }}
                              ></i>
                            </button>
                          )}
                          {can('tests.edit') && (
                            <button
                              className="row-action row-action--edit"
                              onClick={() => {
                                setSelectedTest(test);
                                setView('create');
                              }}
                            >
                              <i
                                className="fa-solid fa-pen"
                                style={{ fontSize: 20 }}
                              ></i>
                            </button>
                          )}
                          {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                          {can('tests.delete') && (
                            <button
                              className="row-action row-action--delete"
                              onClick={() => deleteTestMutation.mutate(test.id)}
                            >
                              <i
                                className="fa-solid fa-trash"
                                style={{ fontSize: 20 }}
                              ></i>
                            </button>
                          )}
                          */}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="empty-state">{t('studentsTest.noDataFound')}</div>
            )}

            {/* Telefon ko'rinishi — jadval o'rniga karta ro'yxati (≤768px) */}
            {filteredTests.length > 0 && (
              <div className="responsive-cards">
                {pagedTests.map((test) => (
                  <div key={test.id} className="data-card">
                    <div className="data-card__head">
                      <span className="data-card__title">{test.name}</span>
                      <span className={`status-badge status-${test.status}`}>
                        {test.status === 'active'
                          ? t('studentsTest.active')
                          : t('studentsTest.inactive')}
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">ID</span>
                      <span className="data-card__value">{test.id}</span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('studentsTest.course')}</span>
                      <span className="data-card__value">
                        {test.course
                          ? getLocalized(test.course, 'name', i18n.language)
                          : t('studentsTest.unknown')}
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('studentsTest.level')}</span>
                      <span className="data-card__value">
                        {test.level
                          ? getLocalized(test.level, 'name', i18n.language)
                          : t('studentsTest.unknown')}
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('studentsTest.testDate')}</span>
                      <span className="data-card__value">{test.created_at.slice(0, 10)}</span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('studentsTest.timeLimit')}</span>
                      <span className="data-card__value">
                        {test.time_limit} {t('studentsTest.minutes')}
                      </span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">
                        {t('studentsTest.passPercentage') || "O'tish foizi"}
                      </span>
                      <span className="data-card__value">{test.pass_percentage}%</span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">Savollar soni</span>
                      <span className="data-card__value">{test.questions_count || 0}</span>
                    </div>
                    <div className="data-card__row">
                      <span className="data-card__label">{t('studentsTest.branch')}</span>
                      <span className="data-card__value">
                        {test.branch
                          ? getLocalized(test.branch, 'name', i18n.language)
                          : t('studentsTest.unknown')}
                      </span>
                    </div>
                    <div className="data-card__actions">
                      {can('questions.view') && (
                        <button
                          className="row-action row-action--secondary"
                          onClick={() => {
                            setSelectedTest(test);
                            setView('questions');
                          }}
                        >
                          <i className="fa-solid fa-file-lines" style={{ fontSize: 20 }}></i>
                        </button>
                      )}
                      {can('tests.view') && (
                        <button
                          className="row-action row-action--view"
                          onClick={() => {
                            setSelectedTest(test);
                            setView('results');
                          }}
                        >
                          <i className="fa-solid fa-eye" style={{ fontSize: 20 }}></i>
                        </button>
                      )}
                      {can('tests.edit') && (
                        <button
                          className="row-action row-action--edit"
                          onClick={() => {
                            setSelectedTest(test);
                            setView('create');
                          }}
                        >
                          <i className="fa-solid fa-pen" style={{ fontSize: 20 }}></i>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {testsTotal > 0 && (
              <Pagination
                currentPage={testsPage}
                lastPage={testsLastPage}
                total={testsTotal}
                from={testsFrom}
                to={testsTo}
                onPageChange={setPage}
                pageSize={perPage}
                onPageSizeChange={(size) => {
                  setPerPage(size);
                  setPage(1);
                }}
              />
            )}
          </div>
        );
    }
  };

  return (
    <div className="students-test-container container">
      <div className="students-test-header">
        {/* "list" ko'rinishida sarlavha yo'q — header'da allaqachon "Test"
            ko'rsatilgan, shu yerda takrorlamaymiz. Boshqa ko'rinishlar
            (yaratish/savollar/natijalar) o'z kontekstini bildirishi uchun
            sarlavhasini saqlab qoladi. */}
        {view !== 'list' && (
          <h1>
            {view === 'create'
              ? t('studentsTest.createTest')
              : view === 'questions'
                ? t('studentsTest.questionManagement')
                : t('studentsTest.testResults')}
          </h1>
        )}
        {view === 'list' && (
          <div className="header-actions">
            <div className="search-input-wrapper">
              <i className="fa fa-search search-icon"></i>
              <input
                type="text"
                placeholder={t('studentsTest.searchData')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <FilterButton
              onClick={() => setFilterOpen((v) => !v)}
              active={filterOpen || activeFilterCount > 0}
              expanded={filterOpen}
              count={activeFilterCount}
              label={t('studentsTest.sort')}
            />
            {can('tests.create') && (
              <WriteGuard>
                <button
                  className="btn-primary btn-accent"
                  onClick={() => {
                    setSelectedTest(null);
                    setView('create');
                  }}
                >
                  {t('studentsTest.createTest')}
                </button>
              </WriteGuard>
            )}
          </div>
        )}
      </div>
      {renderContent()}
    </div>
  );
};

interface TestFormProps {
  onCancel: () => void;
  onSubmit: (data: CreateTestPayload) => void;
  saving: boolean;
  initialData: Test | null;
  branches: LookupOption[];
}

const TestForm = ({ onCancel, onSubmit, saving, initialData, branches }: TestFormProps) => {
  const { t, i18n } = useTranslation();
  const [formData, setFormData] = useState<CreateTestPayload>(
    initialData
      ? {
          name: initialData.name,
          course_id: initialData.course_id,
          level_id: initialData.level_id,
          branch_id: initialData.branch_id,
          questions_count: initialData.questions_count,
          pass_percentage: initialData.pass_percentage,
          time_limit: initialData.time_limit,
          status: initialData.status,
        }
      : {
          name: '',
          course_id: 0,
          level_id: 0,
          branch_id: 0,
          questions_count: 5,
          pass_percentage: 60,
          time_limit: 30,
          status: 'active',
        },
  );

  // Filtrlash serverda: /options/courses?branch_id=...
  // Filial tanlanmaguncha so'rov yubormaymiz — aks holda hamma kurs bekorga yuklanadi.
  const { data: courses = [] } = useOptions(
    'courses',
    { branch_id: formData.branch_id || undefined },
    { enabled: !!formData.branch_id },
  );

  // Darajalar kurs ichida `levels[]` bo'lib keladi
  const courseLevels = useMemo(() => {
    return courses.find((c) => c.id === formData.course_id)?.levels || [];
  }, [courses, formData.course_id]);

  return (
    <div className="form-container">
      <div className="form-card">
        <div className="form-header">{t('studentsTest.testNameCap')}</div>
        <div className="form-body">
          <div className="form-grid">
            <div className="form-group">
              <label>
                {t('studentsTest.testName')} <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                className="form-control"
                placeholder={t('studentsTest.enterName')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            {/* Tartib bog'lanish zanjiri bo'yicha: Filial → Kurs → Daraja */}
            <div className="form-group">
              <label>
                {t('studentsTest.branch')} <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                className="form-control"
                value={formData.branch_id}
                onChange={(e) =>
                  // Filial almashsa, boshqa filialning kursi/darajasi qolib ketmasin
                  setFormData({
                    ...formData,
                    branch_id: Number(e.target.value),
                    course_id: 0,
                    level_id: 0,
                  })
                }
              >
                <option value={0}>{t('studentsTest.selectBranch')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>
                {t('studentsTest.course')} <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                className="form-control"
                value={formData.course_id}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    course_id: Number(e.target.value),
                    level_id: 0,
                  })
                }
                disabled={!formData.branch_id}
              >
                <option value={0}>{t('studentsTest.selectCourse')}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>
                {t('studentsTest.level')} <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                className="form-control"
                value={formData.level_id}
                onChange={(e) => setFormData({ ...formData, level_id: Number(e.target.value) })}
                disabled={!formData.course_id}
              >
                <option value={0}>{t('studentsTest.selectLevel')}</option>
                {courseLevels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {optionLabel(l, i18n.language)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>
                {t('studentsTest.questionsCount')} <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                className="form-control"
                placeholder={t('studentsTest.enterQuestionsCount')}
                type="number"
                value={formData.questions_count || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    questions_count: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>
                {t('studentsTest.timeLimit')} <span style={{ color: 'red' }}>*</span>
              </label>
              <div className="input-with-suffix">
                <input
                  className="form-control"
                  type="number"
                  value={formData.time_limit || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      time_limit: Number(e.target.value),
                    })
                  }
                />
                <span className="input-suffix">{t('studentsTest.minutes')}</span>
              </div>
            </div>
            <div className="form-group">
              <label>
                {t('studentsTest.passingPercentage')} <span style={{ color: 'red' }}>*</span>
              </label>
              <div className="input-with-suffix">
                <input
                  className="form-control"
                  style={formData.pass_percentage > 100 ? { borderColor: 'red' } : {}}
                  type="number"
                  placeholder={t('studentsTest.enterPercentage')}
                  value={formData.pass_percentage || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      pass_percentage: Number(e.target.value),
                    })
                  }
                />
                <span className="input-suffix">%</span>
              </div>
            </div>
            <div className="form-group">
              <label>
                {t('studentsTest.status')} <span style={{ color: 'red' }}>*</span>
              </label>
              <div className="toggle-group">
                <div
                  className={`toggle-item ${formData.status === 'active' ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, status: 'active' })}
                >
                  {t('studentsTest.activeCap')}
                </div>
                <div
                  className={`toggle-item ${formData.status === 'inactive' ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, status: 'inactive' })}
                >
                  {t('studentsTest.inactiveCap')}
                </div>
              </div>
            </div>
          </div>
          <div className="form-footer" style={{ justifyContent: 'center', gap: '16px' }}>
            <button
              className="btn-secondary"
              disabled={saving}
              onClick={() => {
                if (formData.pass_percentage <= 100) {
                  onSubmit(formData);
                }
              }}
              style={{
                borderRadius: '20px',
                minWidth: '140px',
                padding: '10px 24px',
              }}
            >
              {t('studentsTest.save')}
            </button>

            <button
              className="btn-outline"
              onClick={onCancel}
              style={{
                borderRadius: '20px',
                minWidth: '140px',
                padding: '10px 24px',
              }}
            >
              {t('studentsTest.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const QuestionManager = ({ test, onBack }: { test: Test; onBack: () => void }) => {
  const { t } = useTranslation();
  const permissions = useAuthStore((state) => state.permissions);
  const can = (p: string) => permissions.includes(p);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);

  const [questionData, setQuestionData] = useState<CreateQuestionPayload>({
    question_text: '',
    question_type: 'single_choice',
    difficulty_level: 'medium',
    course_id: test.course_id,
    level_id: test.level_id,
    test_id: test.id,
    is_active: true,
    options: [
      { option_text: '', is_correct: false, order: 1 },
      { option_text: '', is_correct: false, order: 2 },
      { option_text: '', is_correct: false, order: 3 },
      { option_text: '', is_correct: false, order: 4 },
    ],
    correct_text_answer: '',
  });

  const { data: questionsData } = useQuery<QuestionsPaginatedResponse>({
    queryKey: ['questions', test.id],
    queryFn: () => API.get('/questions', { params: { test_id: test.id } }).then((res) => res.data),
    enabled: !!test.id,
  });

  const filteredQuestions = useMemo(() => {
    if (!questionsData?.data) return [];
    return questionsData.data.filter((q) => q.test_id === undefined || q.test_id === test.id);
  }, [questionsData, test.id]);

  const createQuestionMutation = useMutation({
    mutationFn: (payload: CreateQuestionPayload) => API.post('/questions', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      resetForm();
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: number) => API.delete(`/questions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });
  // Delete tugmasi izohga olingan; tugma qaytarilganda quyidagi qatorni o'chirish kerak
  void deleteQuestionMutation;

  const updateQuestionMutation = useMutation({
    mutationFn: (payload: { id: number; data: CreateQuestionPayload }) =>
      API.put(`/questions/${payload.id}`, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      resetForm();
    },
  });

  const resetForm = () => {
    setEditingQuestionId(null);
    setQuestionData({
      question_text: '',
      question_type: 'single_choice',
      difficulty_level: 'medium',
      course_id: test.course_id,
      level_id: test.level_id,
      test_id: test.id,
      is_active: true,
      options: [
        { option_text: '', is_correct: false, order: 1 },
        { option_text: '', is_correct: false, order: 2 },
        { option_text: '', is_correct: false, order: 3 },
        { option_text: '', is_correct: false, order: 4 },
      ],
      correct_text_answer: '',
    });
  };

  const handleQuestionTypeChange = (type: QuestionType) => {
    const base = { ...questionData, question_type: type };
    if (type === 'text_answer') {
      base.options = [];
      base.correct_text_answer = '';
    } else if (type === 'true_false') {
      base.options = [
        { option_text: 'Ha', is_correct: true, order: 1 },
        { option_text: "Yo'q", is_correct: false, order: 2 },
      ];
    } else {
      if (questionData.options.length < 2) {
        base.options = [
          { option_text: '', is_correct: false, order: 1 },
          { option_text: '', is_correct: false, order: 2 },
          { option_text: '', is_correct: false, order: 3 },
          { option_text: '', is_correct: false, order: 4 },
        ];
      }
    }
    setQuestionData(base);
  };

  const handleEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id);
    setQuestionData({
      question_text: q.question_text,
      question_type: q.question_type,
      difficulty_level: q.difficulty_level,
      course_id: q.course_id,
      level_id: q.level_id,
      test_id: q.test_id ?? test.id,
      is_active: q.is_active,
      options: q.options ? q.options.map((o: Option) => ({ ...o })) : [],
      correct_text_answer: q.correct_text_answer || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addOption = () => {
    const newOrder = questionData.options.length + 1;
    setQuestionData({
      ...questionData,
      options: [...questionData.options, { option_text: '', is_correct: false, order: newOrder }],
    });
  };

  const handleOptionCorrectToggle = (index: number) => {
    const newOptions = [...questionData.options];
    if (
      questionData.question_type === 'single_choice' ||
      questionData.question_type === 'true_false'
    ) {
      newOptions.forEach((o, i) => (o.is_correct = i === index));
    } else {
      newOptions[index].is_correct = !newOptions[index].is_correct;
    }
    setQuestionData({ ...questionData, options: newOptions });
  };

  const downloadTemplate = () => {
    const headers = [
      'question_text',
      'question_type',
      'difficulty_level',
      'option_1',
      'option_2',
      'option_3',
      'option_4',
      'correct_options',
      'correct_text_answer',
    ];
    const exampleRows = [
      [
        'HTML nima?',
        'single_choice',
        'easy',
        'Belgilash tili',
        'Dasturlash tili',
        "Ma'lumotlar bazasi",
        'Tarmoq protokoli',
        '1',
        '',
      ],
      [
        'Qaysi texnologiyalar frontend hisoblanadi?',
        'multiple_choice',
        'medium',
        'HTML',
        'CSS',
        'JavaScript',
        'Python',
        '1;2;3',
        '',
      ],
      [
        'React faqat frontend uchun ishlatiladi',
        'true_false',
        'easy',
        'Ha',
        "Yo'q",
        '',
        '',
        '1',
        '',
      ],
      ["O'zbekiston poytaxti qayer?", 'text_answer', 'easy', '', '', '', '', '', 'Toshkent'],
    ];
    const csvContent =
      '\uFEFF' +
      headers.join(',') +
      '\n' +
      exampleRows.map((row) => row.join(',')).join('\n') +
      '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Excel Import Handler ── */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);

    try {
      const text = await file.text();
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        setImportError(t('studentsTest.templateMismatch'));
        return;
      }

      const header = lines[0].split(',').map((h) => h.trim().replace(/^\uFEFF/, ''));
      const requiredCols = ['question_text', 'question_type', 'difficulty_level'];
      const hasRequired = requiredCols.every((c) => header.includes(c));
      if (!hasRequired) {
        setImportError(t('studentsTest.templateMismatch'));
        return;
      }

      const colIdx = (name: string) => header.indexOf(name);
      let failCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        const qText = cols[colIdx('question_text')] || '';
        const qType = (cols[colIdx('question_type')] || 'single_choice') as QuestionType;
        const qDiff = (cols[colIdx('difficulty_level')] || 'medium') as DifficultyLevel;

        if (!qText) {
          failCount++;
          continue;
        }

        const validTypes: QuestionType[] = [
          'single_choice',
          'multiple_choice',
          'text_answer',
          'true_false',
        ];
        const validDiffs: DifficultyLevel[] = ['easy', 'medium', 'hard'];
        if (!validTypes.includes(qType) || !validDiffs.includes(qDiff)) {
          failCount++;
          continue;
        }

        const payload: CreateQuestionPayload = {
          question_text: qText,
          question_type: qType,
          difficulty_level: qDiff,
          course_id: test.course_id,
          level_id: test.level_id,
          test_id: test.id,
          is_active: true,
          options: [],
        };

        if (qType === 'text_answer') {
          payload.correct_text_answer = cols[colIdx('correct_text_answer')] || '';
        } else {
          const opts: string[] = [];
          for (let oi = 1; oi <= 4; oi++) {
            const val = cols[colIdx(`option_${oi}`)] || '';
            if (val) opts.push(val);
          }
          const correctStr = cols[colIdx('correct_options')] || '1';
          const correctNums = correctStr.split(';').map((n) => parseInt(n.trim()));

          payload.options = opts.map((ot, idx) => ({
            option_text: ot,
            is_correct: correctNums.includes(idx + 1),
            order: idx + 1,
          }));
        }

        try {
          await API.post('/questions', payload);
        } catch {
          failCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['questions'] });
      if (failCount > 0) {
        setImportError(`${t('studentsTest.importFail')} (${failCount})`);
      }
    } catch {
      setImportError(t('studentsTest.templateMismatch'));
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Render ── */
  return (
    <div>
      <div className="form-card">
        <div className="form-header">{t('studentsTest.questionsCap')}</div>
        <div className="form-body">
          {/* Row 1: Question text, Difficulty, Question type */}
          <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <div className="form-group">
              <label>
                {t('studentsTest.questionText')} <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                className="form-control"
                placeholder={t('studentsTest.enterName')}
                value={questionData.question_text}
                onChange={(e) =>
                  setQuestionData({
                    ...questionData,
                    question_text: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>
                {t('studentsTest.difficultyLevel')} <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                className="form-control"
                value={questionData.difficulty_level}
                onChange={(e) =>
                  setQuestionData({
                    ...questionData,
                    difficulty_level: e.target.value as DifficultyLevel,
                  })
                }
              >
                <option value="easy">{t('studentsTest.easy')}</option>
                <option value="medium">{t('studentsTest.medium')}</option>
                <option value="hard">{t('studentsTest.hard')}</option>
              </select>
            </div>
            <div className="form-group">
              <label>
                {t('studentsTest.questionType')} <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                className="form-control"
                value={questionData.question_type}
                onChange={(e) => handleQuestionTypeChange(e.target.value as QuestionType)}
              >
                <option value="single_choice">{t('studentsTest.singleChoice')}</option>
                <option value="multiple_choice">{t('studentsTest.multipleChoice')}</option>
                <option value="text_answer">{t('studentsTest.textAnswer')}</option>
                <option value="true_false">{t('studentsTest.trueFalse')}</option>
              </select>
            </div>
          </div>

          {/* Dynamic answer inputs based on question type */}
          {questionData.question_type === 'text_answer' ? (
            <div style={{ marginBottom: '24px' }}>
              <div className="form-group">
                <label>{t('studentsTest.correctAnswer')}</label>
                <input
                  className="form-control"
                  placeholder={t('studentsTest.enterName')}
                  value={questionData.correct_text_answer || ''}
                  onChange={(e) =>
                    setQuestionData({
                      ...questionData,
                      correct_text_answer: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          ) : (
            <>
              <div className="form-grid mb-16">
                {questionData.options.map((option, index) => (
                  <div key={index} className="form-group" style={{ position: 'relative' }}>
                    <label>{t('studentsTest.option')}</label>
                    {questionData.question_type !== 'true_false' && index >= 3 && (
                      <button
                        onClick={() => {
                          const newOptions = questionData.options.filter((_, i) => i !== index);
                          setQuestionData({
                            ...questionData,
                            options: newOptions,
                          });
                        }}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '0px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#ff4d4f',
                          fontSize: '13px',
                          lineHeight: 1,
                          padding: '2px 4px',
                        }}
                        title="O'chirish"
                      >
                        <i className="fa fa-times"></i>
                      </button>
                    )}
                    <div className="question-option">
                      <div
                        className={`option-checkbox ${option.is_correct ? 'checked' : ''}`}
                        onClick={() => handleOptionCorrectToggle(index)}
                      >
                        {option.is_correct && (
                          <i className="fa fa-check" style={{ fontSize: '14px' }}></i>
                        )}
                      </div>
                      <input
                        className="form-control"
                        style={{ border: 'none', padding: 0, outline: 'none' }}
                        placeholder={t('studentsTest.enterName')}
                        value={option.option_text}
                        readOnly={questionData.question_type === 'true_false'}
                        onChange={(e) => {
                          const newOptions = [...questionData.options];
                          newOptions[index].option_text = e.target.value;
                          setQuestionData({
                            ...questionData,
                            options: newOptions,
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: '24px' }}>
                <button
                  className="btn-primary"
                  style={{
                    backgroundColor:
                      questionData.question_type === 'true_false' ? '#ccc' : '#FE9100',
                    cursor: questionData.question_type === 'true_false' ? 'not-allowed' : 'pointer',
                    opacity: questionData.question_type === 'true_false' ? 0.6 : 1,
                  }}
                  disabled={questionData.question_type === 'true_false'}
                  onClick={addOption}
                >
                  {t('studentsTest.addOption')}
                </button>
              </div>
            </>
          )}

          <div className="form-footer" style={{ justifyContent: 'center', gap: '12px' }}>
            {(editingQuestionId ? can('questions.edit') : can('questions.create')) && (
              <button
                className="btn-secondary"
                style={{
                  borderRadius: '20px',
                  minWidth: '140px',
                  padding: '10px 24px',
                }}
                disabled={createQuestionMutation.isPending || updateQuestionMutation.isPending}
                onClick={() => {
                  if (editingQuestionId) {
                    updateQuestionMutation.mutate({
                      id: editingQuestionId,
                      data: questionData,
                    });
                  } else {
                    createQuestionMutation.mutate(questionData);
                  }
                }}
              >
                {editingQuestionId ? t('studentsTest.edit') : t('studentsTest.save')}
              </button>
            )}
            {editingQuestionId && (
              <button
                className="btn-outline"
                style={{
                  borderRadius: '20px',
                  minWidth: '140px',
                  padding: '10px 24px',
                }}
                onClick={resetForm}
              >
                {t('studentsTest.cancel')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Questions Table */}
      <div className="table-card" style={{ marginTop: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontFamily: 'noto-b', margin: 0 }}>
            {t('studentsTest.questions')}
          </h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-outline" onClick={downloadTemplate}>
              <i className="fa-solid fa-download" style={{ marginRight: '6px' }}></i>
              {t('studentsTest.downloadTemplate')}
            </button>
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              {t('studentsTest.import')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </div>

        {importError && (
          <div
            style={{
              padding: '8px 20px',
              color: '#ff0000',
              fontFamily: 'noto-m',
              fontSize: '14px',
            }}
          >
            ⚠ {importError}
          </div>
        )}

        {filteredQuestions.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('studentsTest.questionCap')}</th>
                <th>{t('studentsTest.levelCap')}</th>
                <th>{t('studentsTest.questionTypeCap')}</th>
                <th>{t('studentsTest.optionsCountCap')}</th>
                <th>{t('studentsTest.actionsCap')}</th>
              </tr>
            </thead>
            <tbody>
              {sortByNewest(filteredQuestions)
                .map((q) => (
                  <React.Fragment key={q.id}>
                    <tr>
                      <td>{q.id}</td>
                      <td>{q.question_text}</td>
                      <td>
                        {q.difficulty_level === 'medium'
                          ? t('studentsTest.medium')
                          : q.difficulty_level === 'easy'
                            ? t('studentsTest.easy')
                            : t('studentsTest.hard')}
                      </td>
                      <td>
                        {q.question_type === 'single_choice'
                          ? t('studentsTest.singleChoice')
                          : q.question_type === 'multiple_choice'
                            ? t('studentsTest.multipleChoice')
                            : q.question_type === 'true_false'
                              ? t('studentsTest.trueFalse')
                              : t('studentsTest.textAnswer')}
                      </td>
                      <td>{q.question_type === 'text_answer' ? 1 : q.options.length}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="row-action row-action--view"
                            onClick={() =>
                              setExpandedQuestionId(expandedQuestionId === q.id ? null : q.id)
                            }
                          >
                            <i
                              className="fa-solid fa-eye"
                              style={{ fontSize: 18 }}
                            ></i>
                          </button>
                          {can('questions.edit') && (
                            <button className="row-action row-action--edit" onClick={() => handleEditQuestion(q)}>
                              <i
                                className="fa-solid fa-pen"
                                style={{ fontSize: 18 }}
                              ></i>
                            </button>
                          )}
                          {/* Delete tugmasi vaqtincha yopilgan, kerak bo'lganda izohdan chiqariladi
                          {can('questions.delete') && (
                            <button
                              className="row-action row-action--delete"
                              onClick={() => deleteQuestionMutation.mutate(q.id)}
                            >
                              <i
                                className="fa-solid fa-trash"
                                style={{ fontSize: 18 }}
                              ></i>
                            </button>
                          )}
                          */}
                        </div>
                      </td>
                    </tr>
                    {expandedQuestionId === q.id && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div
                            style={{
                              padding: '16px 24px',
                              background: '#f0f7ff',
                              borderLeft: '4px solid #228BE6',
                            }}
                          >
                            {q.question_type === 'text_answer' ? (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                }}
                              >
                                <span
                                  style={{
                                    fontFamily: 'noto-m',
                                    color: '#495057',
                                  }}
                                >
                                  {t('studentsTest.correctAnswer')}:
                                </span>
                                <span
                                  style={{
                                    color: '#1BB200',
                                    fontFamily: 'noto-b',
                                  }}
                                >
                                  {q.correct_text_answer}
                                </span>
                              </div>
                            ) : (
                              <ul
                                style={{
                                  margin: 0,
                                  padding: 0,
                                  listStyle: 'none',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px',
                                }}
                              >
                                {q.options.map((opt: Option, idx: number) => (
                                  <li
                                    key={idx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      background: opt.is_correct ? '#e6f9ec' : '#fff',
                                      border: `1px solid ${opt.is_correct ? '#1BB200' : '#dee2e6'}`,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '50%',
                                        background: opt.is_correct ? '#1BB200' : '#dee2e6',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                      }}
                                    >
                                      {opt.is_correct && (
                                        <i
                                          className="fa fa-check"
                                          style={{
                                            color: '#fff',
                                            fontSize: '11px',
                                          }}
                                        ></i>
                                      )}
                                    </span>
                                    <span
                                      style={{
                                        color: opt.is_correct ? '#1BB200' : '#495057',
                                        fontFamily: opt.is_correct ? 'noto-b' : 'noto-m',
                                      }}
                                    >
                                      {opt.option_text}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">{t('studentsTest.noDataFound')}</div>
        )}
      </div>

      {/* Back button */}
      <div style={{ marginTop: '24px' }}>
        <button className="btn-outline" onClick={onBack}>
          <i className="fa fa-chevron-left" style={{ marginRight: '8px' }}></i>
          {t('studentsTest.back')}
        </button>
      </div>
    </div>
  );
};

const ResultsView = ({ test, onBack }: { test: Test; onBack: () => void }) => {
  const { t, i18n } = useTranslation();
  // `/tests/{id}/results` va `/tests/{id}/stats` backendda hali yo'q — 404
  // qaytaradi. `retry: false` — konsolda 3 marta emas, 1 marta 404 chiqadi;
  // UI esa quyida nol/bo'sh ko'rinishga tushadi.
  const { data: resultsData } = useQuery<StudentResult[]>({
    queryKey: ['test-results', test.id],
    queryFn: () => API.get(`/tests/${test.id}/results`).then((res) => res.data),
    retry: false,
  });

  const { data: stats } = useQuery({
    queryKey: ['test-stats', test.id],
    queryFn: () => API.get(`/tests/${test.id}/stats`).then((res) => res.data),
    retry: false,
  });

  return (
    <div className="results-container container">
      <div className="flex-between mb-24">
        <button className="btn-outline" onClick={onBack}>
          <i className="fa fa-chevron-left" style={{ marginRight: '8px' }}></i>
          {t('studentsTest.back')}
        </button>
        <div className="flex-end">
          <button className="btn-secondary">{t('studentsTest.downloadPdf')}</button>
          <button className="btn-primary">{t('studentsTest.nextStage')}</button>
        </div>
      </div>

      <div className="form-card">
        <div className="section-title">
          <div className="section-icon">
            <i className="fa fa-info-circle"></i>
          </div>
          {t('studentsTest.testInfoCap')}
        </div>
        <div className="form-body flex-wrap">
          {[
            { label: t('studentsTest.testName'), value: test.name },
            {
              label: t('studentsTest.course'),
              value: test.course
                ? getLocalized(test.course, 'name', i18n.language)
                : t('studentsTest.unknown'),
            },
            {
              label: t('studentsTest.level'),
              value: test.level
                ? getLocalized(test.level, 'name', i18n.language)
                : t('studentsTest.unknown'),
            },
            {
              label: t('studentsTest.branch'),
              value: test.branch
                ? getLocalized(test.branch, 'name', i18n.language)
                : t('studentsTest.unknown'),
            },
            {
              label: t('studentsTest.questionsCount'),
              value: test.questions_count,
            },
            {
              label: t('studentsTest.timeLimit'),
              value: `${test.time_limit} ${t('studentsTest.minutes')}`,
            },
          ].map((item, index) => (
            <div key={index} className="info-item">
              <div className="info-label">{item.label}</div>
              <div className="info-value">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="results-summary-inner">
          <div className="summary-card summary-card--total">
            <div className="summary-value">{stats?.total_students || 0}</div>
            <div className="summary-label">{t('studentsTest.totalStudents')}</div>
          </div>
          <div className="summary-card summary-card--submitted">
            <div className="summary-value">{stats?.submitted_count || 0}</div>
            <div className="summary-label">{t('studentsTest.submitted')}</div>
          </div>
          <div className="summary-card summary-card--passed">
            <div className="summary-value">{stats?.passed_count || 0}</div>
            <div className="summary-label">{t('studentsTest.passed')}</div>
          </div>
          <div className="summary-card summary-card--failed">
            <div className="summary-value">{stats?.failed_count || 0}</div>
            <div className="summary-label">{t('studentsTest.failed')}</div>
          </div>
          <div className="summary-card summary-card--missed">
            <div className="summary-value">{stats?.not_submitted_count || 0}</div>
            <div className="summary-label">{t('studentsTest.notSubmitted')}</div>
          </div>
        </div>
      </div>

      <div className="form-card">
        <div className="section-title">
          <div className="section-icon">
            <i className="fa fa-info-circle"></i>
          </div>
          {t('studentsTest.studentsResultCap')}
        </div>
        <div className="form-body p-0">
          <div className="p-16-24">
            <div className="search-input-wrapper w-240">
              <i className="fa fa-search search-icon"></i>
              <input type="text" placeholder={t('studentsTest.searchByFullName')} />
            </div>
          </div>
          {resultsData && resultsData.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t('studentsTest.fullName')}</th>
                  <th>{t('studentsTest.correctAnswers')}</th>
                  <th>{t('studentsTest.score')}</th>
                  <th>{t('studentsTest.resultStatus')}</th>
                  <th>{t('studentsTest.dateTime')}</th>
                </tr>
              </thead>
              <tbody>
                {resultsData.map((res, index) => (
                  <tr key={index}>
                    <td>{res.id}</td>
                    <td style={{ fontWeight: '600' }}>{res.fish}</td>
                    <td>{res.correct_answers}</td>
                    <td style={{ fontWeight: '600' }}>{res.percentage}</td>
                    <td style={{ fontWeight: '600' }}>{res.status}</td>
                    <td>{formatDateTime(res.date_time, res.date_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">{t('studentsTest.noDataFound')}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestPage;
