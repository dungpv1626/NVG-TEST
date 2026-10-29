/**
 * Gửi email cho khách qua Worker (`POST /share/email`, 0239). Worker kiểm quyền bằng phiên người gọi (báo giá
 * đọc được, đã duyệt, người gọi được gửi), gọi Resend kèm tệp PDF, ghi lịch sử `outbound_shares` và đánh dấu
 * báo giá «đã gửi khách» bằng chính hàm `send_quote_to_customer` (cơ hội tự sang Đàm phán — 0162).
 *
 * Chưa có khoá Resend hoặc `EMAIL_FAKE=1` thì Worker chỉ GIẢ LẬP: không thư nào đi, kết quả mang `fake: true`.
 */

import { supabase } from './supabase';

const BASE = (import.meta.env.VITE_DESIGN_API_URL ?? '').replace(/\/+$/, '');

/** Trần tệp đính kèm phía trình duyệt — Worker chặn lại cùng mức. */
export const EMAIL_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

export interface SendEmailInput {
  entityType: 'quotes';
  entityId: string;
  to: string;
  subject: string;
  body: string;
  attachment: { name: string; bytes: Uint8Array } | null;
}

export interface SendEmailResult {
  fake: boolean;
  sent_at: string;
  /** Báo giá vừa được đánh dấu «đã gửi khách» ở lần này (false = đã đánh dấu từ trước). */
  marked_sent: boolean;
  /** Đánh dấu không được (thư vẫn đã đi / đã giả lập) — câu báo cho người dùng. */
  mark_error: string | null;
}

export class ShareApiError extends Error {}

/** Uint8Array → base64, chia khúc để không tràn ngăn xếp với tệp vài MB. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ShareApiError('Phiên đăng nhập đã hết. Đăng nhập lại để gửi email.');
  if (input.attachment && input.attachment.bytes.length > EMAIL_ATTACHMENT_MAX_BYTES) {
    throw new ShareApiError('Tệp đính kèm lớn hơn 8 MB nên không gửi qua email được.');
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/share/email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: input.entityType,
        entity_id: input.entityId,
        to: input.to,
        subject: input.subject,
        body: input.body,
        attachment: input.attachment
          ? { name: input.attachment.name, content_base64: toBase64(input.attachment.bytes) }
          : null,
      }),
    });
  } catch {
    throw new ShareApiError(
      'Không kết nối được máy chủ gửi email. Tải PDF về và gửi bằng email của mình trong lúc chờ.',
    );
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & SendEmailResult;
  if (!res.ok) throw new ShareApiError(json.error ?? 'Máy chủ không gửi được email.');
  return json;
}
