/**
 * Tạo tài khoản người dùng (NEN-02) — quy tắc dùng chung giữa biểu mẫu (`web/`) và endpoint
 * `POST /admin/users` (`workers/`). Hai bên kiểm cùng một lược đồ: giao diện báo lỗi ngay
 * dưới ô, Worker không tin dữ liệu trình duyệt gửi lên.
 */

import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự.`)
    .optional()
    .transform((v) => (v ? v : null));

export const newAccountSchema = z.object({
  fullName: z.string().trim().min(1, 'Chưa nhập họ tên.').max(128, 'Tối đa 128 ký tự.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Chưa nhập email.')
    .email('Email chưa đúng định dạng, ví dụ ten@nhavietgroup.vn.'),
  phone: optionalText(20),
  jobTitle: optionalText(128),
  department: optionalText(128),
  companyId: z.string().min(1, 'Chưa chọn pháp nhân.'),
  roleId: z.string().min(1, 'Chưa chọn vai trò.'),
});

export type NewAccountInput = z.input<typeof newAccountSchema>;
export type NewAccount = z.output<typeof newAccountSchema>;

export interface CreatedAccount {
  userId: string;
  email: string;
  /** Hiện MỘT lần cho Quản trị viên, không lưu ở đâu cả. */
  temporaryPassword: string;
}

/** Bỏ các ký tự dễ đọc nhầm khi chép tay hoặc đọc qua điện thoại: 0/O, 1/l/I. */
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWER + UPPER + DIGITS;

export const TEMPORARY_PASSWORD_LENGTH = 12;

/**
 * Mật khẩu tạm, ngẫu nhiên bằng `crypto.getRandomValues` (có cả ở trình duyệt lẫn Workers).
 * Luôn có đủ chữ thường, chữ hoa, chữ số — để không vấp quy tắc mật khẩu nếu Supabase Auth
 * được cấu hình chặt hơn.
 */
export function generateTemporaryPassword(
  random: (n: number) => Uint32Array = (n) => crypto.getRandomValues(new Uint32Array(n)),
): string {
  const values = random(TEMPORARY_PASSWORD_LENGTH + 1);
  const pick = (set: string, i: number) => set[values[i]! % set.length]!;
  const chars = [pick(LOWER, 0), pick(UPPER, 1), pick(DIGITS, 2)];
  for (let i = 3; i < TEMPORARY_PASSWORD_LENGTH; i++) chars.push(pick(ALL, i));
  // Đảo chỗ ba ký tự bắt buộc để chúng không luôn đứng đầu.
  const shift = values[TEMPORARY_PASSWORD_LENGTH]! % TEMPORARY_PASSWORD_LENGTH;
  return chars.slice(shift).concat(chars.slice(0, shift)).join('');
}
