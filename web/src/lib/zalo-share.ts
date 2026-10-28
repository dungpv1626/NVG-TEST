/**
 * Gửi cho khách qua Zalo CÁ NHÂN của nhân viên (anh Dũng 28/10/2026, «cách 1») — phần tính toán thuần.
 *
 * Zalo không có API cho tài khoản cá nhân và dự án không tự động hoá Zalo: hệ thống chỉ soạn sẵn lời nhắn,
 * mở đúng cửa sổ chat (`zalo.me/<số>`) hoặc bảng chia sẻ của điện thoại; NGƯỜI DÙNG tự bấm gửi trong Zalo.
 * Vì vậy màn hình chỉ được nói «đã mở Zalo để gửi», không bao giờ «đã gửi».
 */

import { formatDate } from '@nvg/shared';

/**
 * Chuẩn hoá số điện thoại Việt Nam về dạng Zalo nhận: `0` + 9 chữ số (di động / cố định 10 số).
 *
 * Nhận «+84 912 345 678», «84912345678», «0084…», «0912.345.678», và số Excel đã rơi số 0 đầu
 * («912345678»). Không ra được số hợp lệ thì trả `null` — mở `zalo.me` không kèm số còn hơn mở nhầm người.
 */
export function normalizeZaloPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0084')) digits = digits.slice(4);
  else if (digits.startsWith('84') && digits.length === 11) digits = digits.slice(2);
  if (digits.length === 9 && /^[3-9]/.test(digits)) digits = `0${digits}`;
  return /^0[1-9]\d{8}$/.test(digits) ? digits : null;
}

/** Địa chỉ mở cửa sổ chat Zalo với một số; không có số thì trang chính Zalo. */
export function zaloChatUrl(phone: string | null | undefined): string {
  const p = normalizeZaloPhone(phone);
  return p ? `https://zalo.me/${p}` : 'https://zalo.me/';
}

export type ZaloSendMode = 'touch' | 'desktop';

/**
 * Máy cảm ứng (điện thoại, máy tính bảng) có bảng chia sẻ thì đi bảng chia sẻ; còn lại — kể cả Chrome trên
 * Windows có `navigator.share` — đi đường máy tính: chép lời nhắn và mở zalo.me. Cùng cách nhận diện với
 * `share-file.ts`.
 */
export function zaloSendMode(env: { coarsePointer: boolean; hasShare: boolean }): ZaloSendMode {
  return env.coarsePointer && env.hasShare ? 'touch' : 'desktop';
}

export function detectZaloSendMode(): ZaloSendMode {
  const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const hasShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return zaloSendMode({ coarsePointer, hasShare });
}

/**
 * Lời nhắn soạn sẵn: ngắn, lịch sự, không đại từ nhân xưng phía hệ thống. Người gửi sửa được trước khi gửi.
 *
 * «Kính gửi Ông Trần Văn Phát,
 *  Nhà Việt Cons gửi bản hợp đồng đã ký số 12/2026.
 *  Xem tại: https://… (link có hiệu lực tới 05/11/2026).
 *  Trân trọng.»
 */
export function composeZaloMessage(input: {
  recipientName: string | null | undefined;
  companyName: string | null | undefined;
  /** Phần sau «gửi …», vd «bản hợp đồng đã ký số 12/2026». */
  subject: string;
  /** Câu thêm sau dòng chính (giá trị, hiệu lực…). */
  details?: string | null;
  link?: { url: string; expiresAt?: string | null } | null;
  /** Có kèm tệp — nhắc khách mở tệp đính kèm. */
  withFile?: boolean;
}): string {
  const name = input.recipientName?.trim() || 'Quý khách';
  const company = input.companyName?.trim() || 'Nhà Việt Group';
  const lines = [`Kính gửi ${name},`, `${company} gửi ${input.subject.trim()}.`];
  if (input.details?.trim()) lines.push(input.details.trim());
  if (input.link) {
    const until = input.link.expiresAt ? formatDate(input.link.expiresAt) : '';
    lines.push(
      until
        ? `Xem tại: ${input.link.url} (link có hiệu lực tới ${until}).`
        : `Xem tại: ${input.link.url}`,
    );
  }
  if (input.withFile) lines.push('Tệp đính kèm theo tin nhắn này.');
  lines.push('Trân trọng.');
  return lines.join('\n');
}
