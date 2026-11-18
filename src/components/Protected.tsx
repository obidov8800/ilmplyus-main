import React, { Children, cloneElement, isValidElement } from "react";
import { usePermission } from "../hooks/usePermission";
import { isDeleteBlocked } from "../utils/deletePolicy";
import { useWorkHoursStatus } from "../contexts/workHoursContext";

interface ProtectedProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  scopePermissions?: string[];
}

/** Ma'lumotni faqat ko'rsatadigan ruxsat amallari — ish vaqtidan tashqarida ham ochiq qoladi. */
const READ_ACTION = /^(view|show|print|access|export|download)/;

const FALLBACK_MESSAGE = "Hozircha ma’lumotlarni faqat ko‘rishingiz mumkin.";

const isWritePermission = (permission: string): boolean => {
  const action = permission.split(".").pop() ?? "";
  return !READ_ACTION.test(action);
};

/**
 * Ish vaqtidan tashqarida ichidagi yozuvchi boshqaruvlarni o'chiradi.
 *
 * Tugma/maydon (`button`, `input`, `select`, `textarea`) `disabled` bo'ladi; `onClick`/`to`/`href` bor
 * elementlarning bosilishi to'xtatiladi. Boshqaruv boshqa komponent ichida bo'lsa (`<MyButton />`) uni bu
 * yerdan ko'rib bo'lmaydi — shuning uchun hammasi `.work-hours-locked` o'ramiga olinadi: u maketga ta'sir qilmaydi
 * (`display: contents`), lekin ichidagi hamma narsaga sichqoncha bosishini o'chiradi. Yozuvchi so'rovni esa
 * baribir axios (`api/api.ts`) va backend to'xtatadi.
 */
function disableControls(children: React.ReactNode, message: string): React.ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const props = child.props as Record<string, unknown>;
    const type = child.type;
    const isNative = typeof type === "string";
    const nested = props.children as React.ReactNode;
    const isField = isNative && ["button", "input", "select", "textarea"].includes(type);
    const clickable = (isNative && typeof props.onClick === "function") || props.to != null || props.href != null;
    const nextProps: Record<string, unknown> = {};

    if (isField) nextProps.disabled = true;
    if (clickable) {
      if (!isNative && typeof props.onClick === "function") nextProps.disabled = true;
      nextProps.onClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
      };
      nextProps.onKeyDown = (event: React.KeyboardEvent) => {
        event.preventDefault();
        event.stopPropagation();
      };
      nextProps["aria-disabled"] = true;
    }
    if (isField || clickable) {
      nextProps.title = message;
      nextProps.className = `${String(props.className ?? "")} work-hours-write-disabled`.trim();
    }

    return nested
      ? cloneElement(child, nextProps, disableControls(nested, message))
      : cloneElement(child, nextProps);
  });
}

/**
 * Ruxsatni o'zi tekshirmaydigan (u `usePermission`/`can()` bilan oldinroq tekshirilgan) yozuvchi tugmalar uchun:
 * ish vaqtidan tashqarida ichidagi boshqaruvlarni xuddi `Protected` kabi o'chiradi. Bir nechta ruxsatdan biri
 * yetarli bo'lgan tugmalar (masalan «Transfer amalga oshirish») va to'liq sahifali yaratish oynalari shu bilan
 * o'raladi — aks holda ular ish vaqtidan tashqarida ham bosilaverardi.
 */
export const WriteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const workHours = useWorkHoursStatus();
  if (workHours?.can_write !== false) return <>{children}</>;
  return (
    <span className="work-hours-locked">
      {disableControls(children, workHours.message || FALLBACK_MESSAGE)}
    </span>
  );
};

/**
 * Component that renders children only if the user has the required permission.
 * Useful for action-level protection like hiding buttons.
 *
 * Ish vaqtidan tashqarida (`/me/work-hours` → `can_write: false`) yozuvchi ruxsatlar (`*.create`, `*.delete`,
 * `*.approve`...) ostidagi tugmalar ko'rinadi, lekin o'chirilgan — `*.view` kabi o'qish ruxsatlari esa ishlayveradi.
 */
export const Protected: React.FC<ProtectedProps> = ({
  permission,
  children,
  fallback = null,
  scopePermissions,
}) => {
  const hasGlobalPermission = usePermission(permission);
  const workHours = useWorkHoursStatus();

  // Staff ilovasida «O'chirish» tugmasi yo'q (faqat Admin panelda). Tekshiruv ruxsatdan oldin turadi —
  // shuning uchun adminda ham chiqmaydi (`utils/deletePolicy`). Tahrirlash esa ruxsat bo'yicha ishlaydi.
  if (isDeleteBlocked(permission)) return <>{fallback}</>;

  const allowed = scopePermissions ? scopePermissions.includes(permission) : hasGlobalPermission;
  if (!allowed) return <>{fallback}</>;

  if (workHours?.can_write === false && isWritePermission(permission)) {
    return <WriteGuard>{children}</WriteGuard>;
  }

  return <>{children}</>;
};
