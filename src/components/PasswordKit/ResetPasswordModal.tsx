import { useEffect, useId, useState } from 'react';
import { Modal } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API } from '@/api/api';
import PhoneInput from '@/components/PhoneInput';
import { PwdCard, PwdField, PwdResend, PwdSubmit } from './PasswordKit';
import { getFieldError, getGeneralError } from './passwordUtils';
import SetPasswordForm from './SetPasswordForm';
import { useSetPassword, type SetPasswordResponse } from './useSetPassword';
import { useSmsTimer } from './useSmsTimer';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Parol o'rnatilgach `{token, user}` bilan chaqiriladi — tizimga kirishni sahifa o'zi bajaradi. */
  onLoggedIn: (data: SetPasswordResponse) => void;
  /** Havola sahifasidan qayta yuborishda — login oldindan ma'lum (2-bosqichda qulflanadi). */
  username?: string;
}

/**
 * Parolni tiklash — ixcham 2 bosqichli oyna: (1) telefon → SMS, (2) SMS'dagi login va
 * vaqtinchalik parol bilan yangi parol. SMS kodi 3 daqiqa amal qiladi: sanoq tugagach yoki
 * kod o'tmay qolsa «Qayta yuborish» chiqadi. Ko'rinish `/set-password` sahifasi bilan bir xil karta.
 */
export default function ResetPasswordModal({ opened, onClose, onLoggedIn, username }: Props) {
  const { t } = useTranslation();
  const uid = useId();

  const [step, setStep] = useState<'phone' | 'password'>('phone');
  const [phone, setPhone] = useState('+998');
  const [phoneError, setPhoneError] = useState('');
  const [resendError, setResendError] = useState('');
  /** Har yangi SMS'da forma tozalanadi (eski vaqtinchalik parol qolib ketmasin). */
  const [formKey, setFormKey] = useState(0);

  const timer = useSmsTimer();
  const setPassword = useSetPassword(onLoggedIn);

  // Server «parol noto'g'ri / muddati o'tgan» desa — kutmasdan qayta yuborish chiqadi.
  const tempError = setPassword.errors.temporary_password;
  const { expire } = timer;
  useEffect(() => {
    if (tempError) expire();
  }, [tempError, expire]);

  const forgot = useMutation({
    mutationFn: async (value: string) => {
      // Backend yetkazilish vaqtini bermaydi — 3 daqiqa SMS so'rovi ketgan paytdan hisoblanadi.
      const startedAt = Date.now();
      await API.post<{ message: string }>('/forgot-password', { phone: value }, { silentError: true });
      return { startedAt };
    },
    onSuccess: ({ startedAt }) => {
      setPhoneError('');
      setResendError('');
      setPassword.clearErrors();
      setFormKey((k) => k + 1);
      timer.start(startedAt);
      setStep('password');
    },
    onError: (err) => {
      const message = getFieldError(err, 'phone') || getGeneralError(err, t('pwd.error'));
      if (step === 'phone') setPhoneError(message);
      else setResendError(message);
    },
  });

  const handleClose = () => {
    onClose();
    setStep('phone');
    setPhone('+998');
    setPhoneError('');
    setResendError('');
    timer.reset();
    setPassword.clearErrors();
  };

  const phoneValid = phone.length >= 13;

  const submitPhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneValid || forgot.isPending) return;
    setPhoneError('');
    forgot.mutate(phone);
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      centered
      withinPortal
      zIndex={99999}
      size={380}
      padding={0}
      radius="lg"
      withCloseButton={false}
      classNames={{ content: 'pwd-modal-content', body: 'pwd-modal-body' }}
      overlayProps={{ blur: 6, backgroundOpacity: 0.6 }}
    >
      {step === 'phone' ? (
        <PwdCard icon="fa-mobile-screen-button" title={t('pwd.resetTitle')} onClose={handleClose}>
          <form className="pwd-form" onSubmit={submitPhone} noValidate>
            <PwdField icon="fa-phone" error={phoneError}>
              <PhoneInput
                id={`${uid}-phone`}
                className="pwd-input"
                value={phone}
                data-autofocus
                aria-invalid={!!phoneError}
                onChange={(v) => {
                  setPhone(v);
                  setPhoneError('');
                }}
              />
            </PwdField>
            <PwdSubmit loading={forgot.isPending} disabled={!phoneValid} icon="fa-paper-plane">
              {t('pwd.sendSms')}
            </PwdSubmit>
          </form>
        </PwdCard>
      ) : (
        <PwdCard
          icon="fa-key"
          title={t('pwd.newTitle')}
          badge={t('pwd.smsSent')}
          onBack={() => {
            setStep('phone');
            setPassword.clearErrors();
          }}
          onClose={handleClose}
        >
          <SetPasswordForm
            key={formKey}
            username={username}
            loading={setPassword.loading}
            errors={setPassword.errors}
            onEdit={setPassword.clearErrors}
            onSubmit={setPassword.submit}
            blocked={timer.timedOut}
            footer={
              <PwdResend
                left={timer.left}
                expired={timer.expired}
                loading={forgot.isPending}
                error={resendError}
                onResend={() => forgot.mutate(phone)}
              />
            }
          />
        </PwdCard>
      )}
    </Modal>
  );
}
