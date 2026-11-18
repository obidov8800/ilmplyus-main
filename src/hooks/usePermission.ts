import useAuthStore from "../store/useAuthStore";
import { isDeleteBlocked } from "../utils/deletePolicy";

export const usePermission = (permissionName: string): boolean => {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);

  if (!permissionName) return true;
  // Staff ilovasida o'chirish yo'q — admin rolida ham (`utils/deletePolicy`).
  if (isDeleteBlocked(permissionName)) return false;
  if (user?.role === "admin") return true;

  return permissions.includes(permissionName);
};
