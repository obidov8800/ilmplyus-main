import { API } from './api';

/*
 * Shartnoma tasdiqlash havolasi SMS'ini qayta yuborish (`POST /student-contracts/{id}/send-sms`).
 * Backend qabul qiluvchini o'zi tanlaydi: voyaga yetmagan va maktabga tayyorlov shartnomasida — (birinchi) vakil telefoni,
 * voyaga yetganda — o'quvchi telefoni. Tashkilot shartnomalariga SMS yuborilmaydi.
 * Ruxsat: `student_contracts.edit` (maktabga tayyorlov uchun — `preschool_contracts.edit`).
 */

export interface ContractSmsResult {
  message?: string;
  phone?: string;
}

/** Tasdiqlash SMS'i yuboriladigan shartnoma turlari (backend `SMS_TYPES`). */
export const SMS_CONTRACT_TYPES = ['adult', 'minor', 'preschool'] as const;

export const isSmsContractType = (type?: string | null): boolean =>
  SMS_CONTRACT_TYPES.includes((type ?? '') as (typeof SMS_CONTRACT_TYPES)[number]);

/** Qabul qiluvchi ruxsat nomi: maktabga tayyorlov — o'z ruxsati, qolganlari — `student_contracts.edit`. */
export const smsPermissionFor = (type?: string | null): string =>
  type === 'preschool' ? 'preschool_contracts.edit' : 'student_contracts.edit';

export const sendContractSms = (id: number) =>
  API.post<ContractSmsResult>(`/student-contracts/${id}/send-sms`).then((r) => r.data);
