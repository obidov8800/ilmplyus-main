import type { InputHTMLAttributes } from 'react';
import { PHONE_MAX_LENGTH, PHONE_PLACEHOLDER, formatPhone } from '@/utils/phone';

type PhoneInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: string | null | undefined;
  /** Har doim `+998XXXXXXXXX` ko'rinishidagi qiymat qaytadi. */
  onChange: (value: string) => void;
};

/**
 * `+998` prefiksi doimo ko'rinib turadigan telefon input.
 * Prefiksni o'chirib bo'lmaydi, undan keyin faqat 9 ta raqam kiritiladi.
 */
export default function PhoneInput({ value, onChange, ...rest }: PhoneInputProps) {
  return (
    <input
      {...rest}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      maxLength={PHONE_MAX_LENGTH}
      placeholder={rest.placeholder ?? PHONE_PLACEHOLDER}
      value={formatPhone(value)}
      onChange={(e) => onChange(formatPhone(e.target.value))}
    />
  );
}
