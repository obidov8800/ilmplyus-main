import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API } from '@/api/api';
import { getFieldError, getGeneralError } from './passwordUtils';

export interface SetPasswordPayload {
  username: string;
  temporary_password: string;
  new_password: string;
  new_password_confirmation: string;
}

export interface SetPasswordResponse {
  message: string;
  token: string;
  user: unknown;
}

export interface SetPasswordErrors {
  username?: string;
  temporary_password?: string;
  new_password?: string;
  general?: string;
}

/**
 * `POST /set-password` — vaqtinchalik parol (SMS) bilan yangi parol o'rnatish.
 * Parolni tiklash oynasi ham, yangi xodimga yuborilgan havola sahifasi ham shu hookni ishlatadi.
 */
export function useSetPassword(onSuccess: (data: SetPasswordResponse) => void) {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<SetPasswordErrors>({});

  const mutation = useMutation({
    mutationFn: async (payload: SetPasswordPayload) => {
      const { data } = await API.post<SetPasswordResponse>('/set-password', payload, {
        silentError: true, // xato maydon ostida ko'rsatiladi — umumiy toast takrorlanmasin
      });
      return data;
    },
    onSuccess,
    onError: (err) => {
      const next: SetPasswordErrors = {
        username: getFieldError(err, 'username'),
        temporary_password: getFieldError(err, 'temporary_password'),
        new_password: getFieldError(err, 'new_password'),
      };
      // Maydonga tegishli xato bo'lmasa (tarmoq, 429 ...) — umumiy xato qatori.
      if (!next.username && !next.temporary_password && !next.new_password) {
        next.general = getGeneralError(err, t('pwd.error'));
      }
      setErrors(next);
    },
  });

  return {
    errors,
    clearErrors: () => setErrors({}),
    loading: mutation.isPending,
    submit: (payload: SetPasswordPayload) => {
      setErrors({});
      mutation.mutate(payload);
    },
  };
}
