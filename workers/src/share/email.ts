/**
 * Phần thuần của «Gửi email» (0239): kiểm yêu cầu, chọn chế độ giả lập, dựng thân gọi Resend. Tách khỏi tuyến
 * để có phép thử không cần CSDL hay mạng.
 */

import { isEmailAddress } from '@nvg/shared';

/** Trần tệp đính kèm (byte, trước base64) — khớp `EMAIL_ATTACHMENT_MAX_BYTES` của giao diện. */
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

export interface EmailEnv {
  /** Khoá API Resend — chỉ trong `workers/.dev.vars` / Workers Secrets, không commit, không in ra. */
  RESEND_API_KEY?: string;
  /** Địa chỉ gửi đã xác minh trên Resend, vd «Nhà Việt Group <baogia@nhavietgroup.vn>». */
  EMAIL_FROM?: string;
  /** `1` = luôn giả lập, kể cả khi đã có khoá. */
  EMAIL_FAKE?: string;
}

/** Giả lập khi bật `EMAIL_FAKE=1` hoặc thiếu khoá / địa chỉ gửi — không bao giờ gửi thật nửa vời. */
export function emailFakeMode(env: EmailEnv): boolean {
  return env.EMAIL_FAKE === '1' || !env.RESEND_API_KEY?.trim() || !env.EMAIL_FROM?.trim();
}

export interface EmailRequest {
  entity_type: 'quotes';
  entity_id: string;
  to: string;
  subject: string;
  body: string;
  attachment: { name: string; content_base64: string } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Số byte thật của một chuỗi base64 (không giải mã). */
export function base64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

/** Kiểm thân yêu cầu; trả lời câu lỗi tiếng Việt hoặc yêu cầu đã chuẩn hoá. */
export function parseEmailRequest(
  raw: unknown,
): { ok: true; value: EmailRequest } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (b.entity_type !== 'quotes') return { ok: false, error: 'Chỉ gửi email được cho báo giá.' };
  if (typeof b.entity_id !== 'string' || !UUID.test(b.entity_id))
    return { ok: false, error: 'Thiếu báo giá cần gửi.' };
  const to = typeof b.to === 'string' ? b.to.trim() : '';
  if (!isEmailAddress(to) || to.length > 255)
    return { ok: false, error: 'Địa chỉ email người nhận chưa đúng dạng. Kiểm tra lại rồi gửi.' };
  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  if (!subject || subject.length > 300)
    return { ok: false, error: 'Vui lòng nhập tiêu đề thư (tối đa 300 ký tự).' };
  const body = typeof b.body === 'string' ? b.body.trim() : '';
  if (!body || body.length > 20000)
    return { ok: false, error: 'Vui lòng nhập nội dung thư (tối đa 20.000 ký tự).' };
  let attachment: EmailRequest['attachment'] = null;
  if (b.attachment) {
    const a = b.attachment as Record<string, unknown>;
    const name = typeof a.name === 'string' ? a.name.trim() : '';
    const content = typeof a.content_base64 === 'string' ? a.content_base64 : '';
    if (
      !name ||
      name.length > 255 ||
      !/\.(pdf|docx)$/i.test(name) ||
      !/^[A-Za-z0-9+/=\s]+$/.test(content)
    )
      return {
        ok: false,
        error: 'Tệp đính kèm không hợp lệ — chỉ gửi kèm tệp PDF hoặc Word báo giá.',
      };
    if (base64Bytes(content) > ATTACHMENT_MAX_BYTES)
      return { ok: false, error: 'Tệp đính kèm lớn hơn 8 MB nên không gửi qua email được.' };
    attachment = { name, content_base64: content.replace(/\s/g, '') };
  }
  return {
    ok: true,
    value: { entity_type: 'quotes', entity_id: b.entity_id, to, subject, body, attachment },
  };
}

/** Thân lời gọi `POST https://api.resend.com/emails`. Trả lời thư về email người gửi (nhân viên). */
export function resendPayload(
  env: Required<Pick<EmailEnv, 'EMAIL_FROM'>>,
  req: EmailRequest,
  replyTo: string | null,
): Record<string, unknown> {
  return {
    from: env.EMAIL_FROM,
    to: [req.to],
    subject: req.subject,
    text: req.body,
    ...(replyTo && isEmailAddress(replyTo) ? { reply_to: replyTo } : {}),
    ...(req.attachment
      ? { attachments: [{ filename: req.attachment.name, content: req.attachment.content_base64 }] }
      : {}),
  };
}

/** Che địa chỉ khi ghi log máy chủ: «k***@example.com». */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}
