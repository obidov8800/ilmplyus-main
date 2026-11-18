/**
 * Backend xato javobidan foydalanuvchiga ko'rsatiladigan matnni ajratib oladi.
 *
 * Laravel odatda ikki ko'rinishda qaytaradi:
 *   422 -> { message, errors: { field: ["matn", ...] } }
 *   4xx/5xx -> { message }
 *
 * Maydon xatolari bo'lsa — birinchisi olinadi (notification bitta qatorli).
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: unknown } })?.response;
  const data = response?.data as
    | { message?: unknown; errors?: Record<string, unknown> }
    | undefined;

  if (!data) return fallback;

  const firstFieldError = data.errors && Object.values(data.errors)[0];
  if (Array.isArray(firstFieldError) && typeof firstFieldError[0] === 'string') {
    return firstFieldError[0];
  }
  if (typeof firstFieldError === 'string') return firstFieldError;

  if (typeof data.message === 'string' && data.message.trim()) return data.message;

  return fallback;
}

/**
 * 422 javobidagi BITTA maydonning xabari (`errors.<field>[0]`), yo'q bo'lsa `undefined`.
 * Maydon tagida ko'rsatish uchun (masalan guruhda `teacher_id` / `room_id`).
 */
export function getFieldError(error: unknown, field: string): string | undefined {
  const errors = (error as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data
    ?.errors;
  const value = errors?.[field];
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return typeof value === 'string' ? value : undefined;
}
