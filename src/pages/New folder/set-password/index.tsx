import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LogoTop from '../../assets/images/talim tizimi white.svg';
import useAuthStore from '../../store/useAuthStore';
import type { User } from '../../types/user.types';
import { PwdCard, PwdResend } from '@/components/PasswordKit/PasswordKit';
import ResetPasswordModal from '@/components/PasswordKit/ResetPasswordModal';
import SetPasswordForm from '@/components/PasswordKit/SetPasswordForm';
import { clearHash, readSmsCodeFromHash } from '@/components/PasswordKit/passwordUtils';
import { useSetPassword, type SetPasswordResponse } from '@/components/PasswordKit/useSetPassword';
import { useSmsTimer } from '@/components/PasswordKit/useSmsTimer';

/**
 * Yangi xodimga / parolni tiklashda SMS orqali yuborilgan havola
 * (`/set-password?username=…#p=KOD`): vaqtinchalik parol havoladan avtomatik olinadi.
 * Karta «Parolni tiklash» oynasi bilan bir xil.
 */
const SetPasswordPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const username = searchParams.get('username') || '';
  const { setToken, setUser, setPermissions } = useAuthStore();

  // Kod bir marta o'qiladi va manzildan olib tashlanadi (tarixda/yangilashda qolmasin).
  const [smsCode] = useState(readSmsCodeFromHash);
  useEffect(() => {
    clearHash();
  }, []);

  const [resendOpen, setResendOpen] = useState(false);

  const onLoggedIn = (data: SetPasswordResponse) => {
    const user = data.user as User;
    setToken(data.token, 360);
    setUser(user);
    const permissions = user.roles?.flatMap((role) => role.permissions || [])?.map((p) => p.name) || [];
    setPermissions(permissions);
    window.location.href = '/';
  };

  const { submit, loading, errors, clearErrors } = useSetPassword(onLoggedIn);

  // Havolaning yuborilgan vaqti noma'lum — kod noto'g'ri/eskirgan bo'lsa server aytadi, shunda «Qayta yuborish» chiqadi.
  const timer = useSmsTimer();
  const tempError = errors.temporary_password;
  const { expire } = timer;
  useEffect(() => {
    if (tempError) expire();
  }, [tempError, expire]);

  return (
    <main className="pwd-page">
      <img src={LogoTop} className="pwd-page__logo" alt="ILM PLYUS" />
      <PwdCard title={t('pwd.newTitle')}>
        <SetPasswordForm
          username={username}
          initialTemp={smsCode}
          loading={loading}
          errors={errors}
          onEdit={clearErrors}
          onSubmit={submit}
          footer={
            <PwdResend left={0} expired={timer.expired} onResend={() => setResendOpen(true)} />
          }
        />
      </PwdCard>

      <ResetPasswordModal
        opened={resendOpen}
        onClose={() => setResendOpen(false)}
        onLoggedIn={onLoggedIn}
        username={username}
      />
    </main>
  );
};

export default SetPasswordPage;
