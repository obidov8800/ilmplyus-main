// src/pages/login/index.tsx
import LogoTop from "../../assets/images/talim tizimi white.svg";
import whiteLogoBig from "../../assets/images/whiteLogoBig.png";
import Logo from "../../assets/images/logo.svg";
import IlmPlyusText from "../../assets/images/IlmPlyusText.svg";
import ptl1 from "../../assets/images/ptl1.png";
import ptl2 from "../../assets/images/ptl2.png";
import ptr1 from "../../assets/images/ptr1.png";
import ptr2 from "../../assets/images/ptr2.png";
import ptc1 from "../../assets/images/ptc1.png";
import ptc2 from "../../assets/images/ptc2.png";
import phoneLogo from "../../assets/images/phone-logo.png";
import { Link } from "react-router-dom";
import LanguageSelect from "../../components/LanguageSelect/LanguageSelect";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { COMPACT_VIEWPORT_QUERY } from '@/utils/compactViewport';
import {
  Modal,
  Button,
  Text,
  TextInput,
  Group,
  Stack,
  Paper,
} from "@mantine/core";
import { useState, useEffect, useRef } from "react";
import "./loginPage.css";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { API } from "../../api/api";
import useAuthStore from "../../store/useAuthStore";
import type { User } from "../../types/user.types";
import FaqContent from "../faq/FaqContent";
import ResetPasswordModal from "@/components/PasswordKit/ResetPasswordModal";

interface ApiErrorShape {
  message?: string;
  errors?: Record<string, string[]>;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

const LoginPage = () => {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(180);
  const [opened, { close }] = useDisclosure(false);
  const isMobile = useMediaQuery(COMPACT_VIEWPORT_QUERY);
  const [code, setCode] = useState("");
  const [resetOpened, resetHandlers] = useDisclosure(false);
  const [faqOpened, faqHandlers] = useDisclosure(false);
  const [showPassword, setShowPassword] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  // Xodimlar user endpointidan, o'qituvchilar employee endpointidan kiradi.
  const [loginMode, setLoginMode] = useState<'user' | 'employee' | null>(null);
  const loginInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loginMode) loginInputRef.current?.focus();
  }, [loginMode]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!loginMode || !login || !password || loginMutation.isPending) return;

    loginMutation.mutate({
      username: login,
      password,
    });
  };

  const handleResetOpen = () => {
    resetHandlers.open();
  };

  useEffect(() => {
    if (!opened) return;

    const interval = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [opened]);

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const { setToken, setUser, setPermissions } = useAuthStore();

  /**
   * `/login` va `/set-password` (parolni tiklashdan keyin) ikkalasi ham
   * `{token, user}` qaytaradi — tizimga kiritish bir xil, shu sabab umumiy
   * joydan chaqiriladi.
   */
  const completeLogin = (data: { token: string; user: User }) => {
    setToken(data.token, 360);
    setUser(data.user);

    const permissions =
      data.user.roles
        ?.flatMap((role) => role.permissions || [])
        ?.map((p) => p.name) || [];

    setPermissions(permissions);

    const roles = data.user.roles?.map((r) => {
      const roleName = typeof r === 'string' ? r : r.name;
      return roleName.toLowerCase();
    }) || [];
    const isStudent = roles.some(
      (r: string) => r.includes('student') || r.includes('talaba'),
    );
    window.location.href = isStudent ? '/student-exams' : '/';
  };

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      if (!loginMode) throw new Error('Login turini tanlang.');
      if (loginMode === 'user') {
        const { data } = await API.post<LoginResponse>("/login", payload, { silentError: true });
        return { kind: 'user' as const, data };
      }
      const { data } = await API.post<{
        token: string;
        employee: User;
        permissions: string[];
      }>("/employee/login", payload, { silentError: true });
      return { kind: 'employee' as const, data };
    },
    onSuccess: (result) => {
      if (result.kind === 'user') {
        completeLogin(result.data);
        return;
      }
      const employee = { ...result.data.employee, account_type: 'employee' as const };
      setToken(result.data.token, 360);
      setUser(employee);
      setPermissions(result.data.permissions ?? []);
      // `/teachers` marshruti bu ilovada YO'Q (404 sahifasi chiqardi) — bosh sahifaga: u ruxsatga qarab birinchi mos
      // sahifaga yo'naltiradi (`utils/homeRoute.ts`).
      window.location.href = '/';
    },
    onError: (error) => {
      const res = (error as { response?: { data?: ApiErrorShape } }).response;
      const validationMessage = res?.data?.errors
        ? Object.values(res.data.errors).flat()[0]
        : undefined;
      notifications.show({
        id: "login-failed",
        title: t("login.errorGeneral"),
        message: validationMessage || res?.data?.message || t("login.errorGeneral"),
        color: "red",
        autoClose: 5000,
      });
    },
  });

  return (
    <section className="login">
      <Modal
        opened={opened}
        onClose={close}
        centered
        withinPortal
        fullScreen={isMobile}
        zIndex={99999}
        withCloseButton={false}
        overlayProps={{
          blur: 6,
          backgroundOpacity: 0.6,
        }}
      >
        <Paper
          radius="lg"
          p="xl"
          maw={520}
          mx="auto"
          my="auto"
          shadow="lg"
          bg="white"
        >
          <Stack gap="md">
            <Text fw={700} size="xl" ta="center" c="brand.6">
              {t("login.auth")}
            </Text>

            <Text size="sm" ta="center" c="dimmed">
              {t("login.authText")}
            </Text>

            <Group grow align="flex-end">
              <TextInput
                value={code}
                onChange={(e) =>
                  setCode(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="XXXXXX"
                size="md"
                radius="md"
                styles={{
                  input: {
                    textAlign: "center",
                    letterSpacing: 4,
                    fontSize: 18,
                  },
                }}
              />

              <Text fw={500}>
                {minutes}:{remainingSeconds.toString().padStart(2, "0")}
              </Text>
            </Group>

            <Group grow mt="md">
              <Button variant="fill" bg="red" radius="xl" onClick={close}>
                {t("login.logout")}
              </Button>

              <Button radius="xl">{t("login.login")}</Button>
            </Group>
          </Stack>
        </Paper>
      </Modal>

      <ResetPasswordModal
        opened={resetOpened}
        onClose={resetHandlers.close}
        onLoggedIn={(data) => completeLogin({ token: data.token, user: data.user as User })}
      />

      <Modal
        opened={faqOpened}
        onClose={faqHandlers.close}
        centered
        withinPortal
        fullScreen={isMobile}
        zIndex={99999}
        size="lg"
        title={t("login.faq")}
        overlayProps={{
          blur: 6,
          backgroundOpacity: 0.6,
        }}
      >
        <FaqContent compact />
      </Modal>

      <div className="login-left">
        <img src={LogoTop} className="main-logo" alt="*" />
        <img src={whiteLogoBig} className="white-logo-big" alt="*" />

        <div className="login-left-center">
          <img src={Logo} className="logo" alt="*" />
          <img src={IlmPlyusText} alt="*" />
          <h1>{t("login.system")}</h1>
        </div>

        <div className="login-left-bottom">
          <h1>{t("login.systemSupport")}</h1>
          <div
            className="login-support"
            style={{ display: "flex", gap: 200, alignItems: "center" }}
          >
            <a target="_blank" href="tel:+998742002020">
              <i className="fa-solid fa-phone" />
              74 200 20 20
            </a>
            <Link target="_blank" to="https://web.telegram.org/">
              <i className="fa-brands fa-telegram"></i>{" "}
              {t("login.telegramGroup")}
            </Link>
            <Link target="_blank" to="https://www.youtube.com/">
              <i className="fa-brands fa-youtube"></i> {t("login.instruction")}
            </Link>
            <Link
              to=""
              onClick={(e) => {
                e.preventDefault();
                faqHandlers.open();
              }}
            >
              <i className="fa-regular fa-circle-question"></i> {t("login.faq")}
            </Link>
          </div>
        </div>
      </div>

      <div className="login-right">
        <LanguageSelect variant="login" />
        <img src={phoneLogo} alt="*" className="phone-logo" />
        <div className="login-right-content">
          <h1>{t("login.authorization")}</h1>
      <form onSubmit={handleSubmit}>
            <div className={`login-mode-options${loginMode ? ' is-selected' : ''}`} role="group" aria-label={t('login.loginAs')}>
              <button type="button" className={loginMode === 'user' ? 'active' : ''} aria-pressed={loginMode === 'user'} onClick={() => setLoginMode('user')}>
                {t('login.employeeLogin')}
              </button>
              <button type="button" className={loginMode === 'employee' ? 'active' : ''} aria-pressed={loginMode === 'employee'} onClick={() => setLoginMode('employee')}>
                {t('login.teacherLogin')}
              </button>
            </div>
            <div className={`login-fields-shell${loginMode ? ' is-open' : ''}`} aria-hidden={!loginMode}>
              <div className="login-fields">
            {loginMode && <>
            <input
              ref={loginInputRef}
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder={t("login.loginPlaceHolder")}
            />

            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceHolder")}
              />

              <button
                type="button"
                className="password-eye"
                onClick={() => setShowPassword((v) => !v)}
              >
                <i
                  className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}
                />
              </button>
            </div>

            <Link
              to=""
              onClick={(e) => {
                e.preventDefault();
                handleResetOpen();
              }}
            >
              {t("login.resetPassword")}
            </Link>

            <button
              type="submit"
              className="login-btn"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? t("login.loading") : t("login.login")}
            </button>
            </>}
              </div>
            </div>
          </form>
        </div>

        {/* Ikonka-only havolalar + mualliflik matni endi BITTA guruh — shu
            guruhning o'zi pastga yopishadi (`margin-top: auto`,
            `.login-bottom-group`), ikonkalar esa matndan aniq 20px yuqorida
            turadi (`gap: 20px`). Ilgari ikonkalar formadan keyin, alohida
            joylashgan edi — bo'sh joy formaga tegishli bo'lib, ikonkalar
            "Kirish" tugmasiga yopishib, matndan uzoqlashib qolardi. */}
        <div className="login-bottom-group">
          <div
            className="login-support login-support-phone"
            style={{ display: "flex", gap: 20, alignItems: "center" }}
          >
            <a target="_blank" href="tel:+998742002020">
              <i className="fa-solid fa-phone" />
            </a>
            <Link target="_blank" to="https://web.telegram.org/">
              <i className="fa-brands fa-telegram"></i>
            </Link>
            <Link target="_blank" to="https://www.youtube.com/">
              <i className="fa-brands fa-youtube"></i>
            </Link>
            <Link
              to=""
              onClick={(e) => {
                e.preventDefault();
                faqHandlers.open();
              }}
            >
              <i className="fa-regular fa-circle-question"></i>
            </Link>
          </div>
          <h4>
            © 2026 ILM PLYUS {t("login.system")}. <br />{" "}
            <span>{t("login.rightReserved")}</span>
          </h4>
        </div>
        <img src={ptl1} className="ptl1" />
        <img src={ptl2} className="ptl2" />
        <img src={ptc1} className="ptc1" />
        <img src={ptc2} className="ptc2" />
        <img src={ptr1} className="ptr1" />
        <img src={ptr2} className="ptr2" />
      </div>
    </section>
  );
};

export default LoginPage;
