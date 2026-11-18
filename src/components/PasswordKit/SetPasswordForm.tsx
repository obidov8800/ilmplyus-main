import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PwdInput, PwdStrength, PwdSubmit } from './PasswordKit';
import type { SetPasswordErrors, SetPasswordPayload } from './useSetPassword';

interface Props {
  /** Berilsa (havola orqali kelganda) — login qulflanadi; berilmasa kiritiladi. */
  username?: string;
  /** SMS havolasidan olingan vaqtinchalik parol — maydon oldindan to'ldiriladi (tahrirlash mumkin). */
  initialTemp?: string;
  loading: boolean;
  errors: SetPasswordErrors;
  /** Foydalanuvchi yozishni boshlaganda — server xatolarini tozalash uchun. */
  onEdit: () => void;
  onSubmit: (payload: SetPasswordPayload) => void;
  /** «Saqlash» tugmasi ostida (SMS taymeri / qayta yuborish). */
  footer?: ReactNode;
  /** true — «Saqlash» o'chiq (masalan SMS kodi vaqti tugagan: avval qayta yuborish kerak). */
  blocked?: boolean;
}

/**
 * Yangi parol o'rnatish formasi (login · vaqtinchalik parol · yangi parol · takror).
 * Parolni tiklash oynasining 2-bosqichi va `/set-password` havola sahifasida AYNAN BIR XIL.
 */
export default function SetPasswordForm({
  username: lockedUsername,
  initialTemp = '',
  loading,
  errors,
  onEdit,
  onSubmit,
  footer,
  blocked = false,
}: Props) {
  const { t } = useTranslation();
  const locked = !!lockedUsername;
  const [username, setUsername] = useState(lockedUsername ?? '');
  const [temp, setTemp] = useState(initialTemp);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm.length > 0 && next !== confirm;
  const matches = confirm.length > 0 && next === confirm;
  const canSubmit = username.trim() !== '' && temp.trim() !== '' && next.length >= 6 && next === confirm;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || blocked || loading) return;
    onSubmit({
      username: username.trim(),
      temporary_password: temp,
      new_password: next,
      new_password_confirmation: confirm,
    });
  };

  return (
    <form className="pwd-form" onSubmit={handleSubmit} noValidate>
      <PwdInput
        icon="fa-user"
        locked={locked}
        value={username}
        placeholder={t('pwd.login')}
        autoComplete="username"
        autoFocus={!locked}
        data-autofocus={locked ? undefined : true}
        error={errors.username}
        onChange={(e) => {
          setUsername(e.target.value);
          onEdit();
        }}
      />
      <PwdInput
        icon="fa-message"
        secret
        value={temp}
        placeholder={t('pwd.tempPassword')}
        autoComplete="one-time-code"
        autoFocus={locked && !initialTemp}
        data-autofocus={locked && !initialTemp ? true : undefined}
        error={errors.temporary_password}
        onChange={(e) => {
          setTemp(e.target.value);
          onEdit();
        }}
      />
      <PwdInput
        icon="fa-lock"
        secret
        value={next}
        placeholder={t('pwd.newPassword')}
        autoComplete="new-password"
        autoFocus={locked && !!initialTemp}
        data-autofocus={locked && !!initialTemp ? true : undefined}
        error={errors.new_password}
        below={<PwdStrength value={next} />}
        onChange={(e) => {
          setNext(e.target.value);
          onEdit();
        }}
      />
      <PwdInput
        icon="fa-lock"
        secret
        value={confirm}
        placeholder={t('pwd.confirm')}
        autoComplete="new-password"
        valid={matches}
        error={mismatch ? t('pwd.mismatch') : undefined}
        onChange={(e) => setConfirm(e.target.value)}
      />

      {errors.general && (
        <p className="pwd-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" /> {errors.general}
        </p>
      )}

      <PwdSubmit loading={loading} disabled={!canSubmit || blocked}>
        {t('pwd.save')}
      </PwdSubmit>

      {footer}
    </form>
  );
}
