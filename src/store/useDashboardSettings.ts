import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '@/store/useAuthStore';
import {
  fetchDashboardSettings,
  saveDashboardSettings,
  DEFAULT_GOALS,
  type DashboardSettings,
  type DashboardGoals,
} from '@/pages/dashboard/dashboard.service';

export type MainTab = 'umumiy' | 'sotuv' | 'oquvchi' | 'oqituvchi' | 'moliya';
export type FeaturePermission = 'ip_telephone.view' | 'ip_telephone.listen_recordings';

export const ALL_TABS: MainTab[] = ['umumiy', 'sotuv', 'oquvchi', 'oqituvchi', 'moliya'];
export const ALL_FEATURES: FeaturePermission[] = [
  'ip_telephone.view',
  'ip_telephone.listen_recordings',
];

export const DASHBOARD_SETTINGS_KEY = ['dashboard-settings'] as const;

const EMPTY: DashboardSettings = { tabNames: {}, roleVisibility: {}, features: [], widgetVisibility: {} };

function useDashboardSettings() {
  const queryClient = useQueryClient();
  // `SipProvider` butun ilovani o'rab turadi va bu hookni LOGIN sahifasida ham
  // chaqiradi — avtorizatsiyasiz `/dashboard-settings` so'rovi ketib 401 qaytardi
  // (va qayta urinishlar bilan: yangi kirgan foydalanuvchini kechikkan 401 orqali
  // chiqarib yuborishi mumkin edi). Endi so'rov faqat kirgandan keyin ketadi.
  const isAuth = useAuthStore((s) => s.isAuth);

  const {
    data = EMPTY,
    isPending,
    isError,
  } = useQuery({
    queryKey: DASHBOARD_SETTINGS_KEY,
    queryFn: fetchDashboardSettings,
    // Sozlamalar kamdan-kam o'zgaradi: tinmasdan (har 30 soniyada) so'ralmaydi — sahifa ochilganda va oynaga
    // qaytganda (5 daqiqadan eski bo'lsa) yangilanadi; saqlaganda esa darhol yangilanadi (`saveSettings`).
    staleTime: 5 * 60 * 1000,
    enabled: isAuth,
  });

  /**
   * Sozlamalar hali kelmagan (yoki so'rov xato bergan) holat. Bunda hech qanday
   * tab ochilmaydi — aks holda ruxsatsiz foydalanuvchi sahifani yangilaganda
   * panel bir zumga ko'rinib, keyin yo'qoladi.
   */
  const settingsReady = !isPending && !isError;

  const { mutate: saveSettings, isPending: isSaving } = useMutation({
    mutationFn: saveDashboardSettings,
    onSuccess: (_result, variables) => {
      queryClient.setQueryData(DASHBOARD_SETTINGS_KEY, variables);
    },
  });

  const tabNames = data.tabNames as Partial<Record<MainTab, string>>;
  const roleVisibility = data.roleVisibility as Record<string, string[]>;
  const features = (data.features ?? []) as string[];
  const pagePermissions = (data.pagePermissions ?? {}) as Record<string, string[]>;
  const widgetVisibility = (data.widgetVisibility ?? {}) as Record<string, string[]>;
  // Maqsadlar — saqlangan qiymat bilan standartni birlashtiramiz (kalit yo'q
  // bo'lsa yoki 0/manfiy bo'lsa — standart).
  const savedGoals = (data.goals ?? {}) as Partial<DashboardGoals>;
  const goals: DashboardGoals = {
    shartnoma: savedGoals.shartnoma && savedGoals.shartnoma > 0 ? savedGoals.shartnoma : DEFAULT_GOALS.shartnoma,
    tushum_mln: savedGoals.tushum_mln && savedGoals.tushum_mln > 0 ? savedGoals.tushum_mln : DEFAULT_GOALS.tushum_mln,
    retention: savedGoals.retention && savedGoals.retention > 0 ? savedGoals.retention : DEFAULT_GOALS.retention,
  };

  const getVisibleTabs = (roleName: string): MainTab[] => {
    if (roleName === 'admin') return ALL_TABS;
    if (!settingsReady) return [];
    const saved = roleVisibility[roleName];
    if (!saved) return ALL_TABS;
    return saved.filter((k): k is MainTab => ALL_TABS.includes(k as MainTab));
  };

  const hasFeature = (feature: string): boolean => {
    return features.includes(feature);
  };

  const hasPagePermission = (roleName: string, permission: string): boolean => {
    const list = pagePermissions[roleName];

    if (!list) return false;

    return list.includes(permission);
  };

  return {
    tabNames,
    roleVisibility,
    widgetVisibility,
    features,
    pagePermissions,
    goals,
    settingsReady,
    getVisibleTabs,
    hasFeature,
    hasPagePermission,
    saveSettings,
    isSaving,
  };
}

export default useDashboardSettings;
