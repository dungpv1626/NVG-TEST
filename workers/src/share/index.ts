/**
 * Gửi hồ sơ cho khách do HỆ THỐNG gửi (0239). Hiện có một tuyến:
 *
 *   POST /share/email — gửi báo giá ĐÃ DUYỆT kèm PDF qua Resend.
 *
 * Thứ tự, mọi bước kiểm quyền chạy DƯỚI PHIÊN NGƯỜI GỌI (RLS quyết, không viết lại điều kiện — CLAUDE.md 3.4):
 *   1. Đọc báo giá qua RLS → không thấy = không gửi.
 *   2. Báo giá phải đã duyệt, là bản đang hiệu lực; người gọi phải được gửi báo giá này
 *      (`rls_outbound_share_writable`, cùng hàm chính sách lịch sử gửi dùng).
 *   3. Gửi thư (Resend) — hoặc GIẢ LẬP khi chưa có khoá / `EMAIL_FAKE=1`: không có thư nào đi.
 *   4. Ghi `outbound_shares` bằng service_role (trình duyệt không tự khai được «đã gửi email»); không lưu thân thư.
 *   5. Chưa đánh dấu gửi khách thì gọi `send_quote_to_customer` dưới phiên người gọi — cùng đường nút «Gửi cho
 *      khách hàng», nên cơ hội tự sang Đàm phán (0162).
 *
 * Khoá `RESEND_API_KEY`, địa chỉ `EMAIL_FROM` chỉ ở `workers/.dev.vars` / Workers Secrets; không in ra log.
 */

import { Hono, type Context } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { DesignEnv } from '../design/env';
import { emailFakeMode, maskEmail, parseEmailRequest, resendPayload, type EmailEnv } from './email';

export type ShareEnv = DesignEnv & EmailEnv;

export const shareApp = new Hono<{ Bindings: ShareEnv }>();

function bearer(c: Context<{ Bindings: ShareEnv }>): string | null {
  const header = c.req.header('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Phiên người gọi: khoá service chỉ làm `apikey`, vai trò thật do JWT quyết → RLS áp đủ. */
function asUser(env: ShareEnv, token: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function service(env: ShareEnv) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

shareApp.post('/email', async (c) => {
  const token = bearer(c);
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const parsed = parseEmailRequest(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const req = parsed.value;

  const db = asUser(c.env, token);
  const { data: quote, error } = await db
    .from('quotes')
    .select('id, code, status, is_current_version, sent_to_customer_at, company_id')
    .eq('id', req.entity_id)
    .maybeSingle();
  if (error || !quote)
    return c.json({ error: 'Không tìm thấy báo giá, hoặc không có quyền xem.' }, 404);
  if (quote.status !== 'completed') {
    return c.json(
      { error: 'Báo giá chưa được phê duyệt nội bộ nên chưa gửi khách được. Gửi phê duyệt trước.' },
      409,
    );
  }
  if (!quote.is_current_version) {
    return c.json(
      { error: 'Đây không phải phiên bản đang hiệu lực. Gửi phiên bản mới nhất.' },
      409,
    );
  }
  const [writable, actor] = await Promise.all([
    db.rpc('rls_outbound_share_writable', { p_type: 'quotes', p_id: quote.id }),
    db.rpc('auth_user_id'),
  ]);
  if (writable.data !== true || !actor.data) {
    return c.json(
      {
        error:
          'Chỉ người chịu trách nhiệm cơ hội hoặc Ban Giám đốc gửi được báo giá này cho khách. Liên hệ người chịu trách nhiệm cơ hội.',
      },
      403,
    );
  }
  const actorId = actor.data as string;
  const { data: me } = await db.from('users').select('email').eq('id', actorId).maybeSingle();

  const fake = emailFakeMode(c.env);
  let externalId: string | null = null;
  if (fake) {
    console.log('[email giả lập — không gửi thật]', {
      quote: quote.code,
      to: maskEmail(req.to),
      attachment: req.attachment?.name ?? null,
    });
  } else {
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY!.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          resendPayload(
            { EMAIL_FROM: c.env.EMAIL_FROM!.trim() },
            req,
            (me?.email as string) ?? null,
          ),
        ),
      });
    } catch {
      return c.json({ error: 'Không kết nối được máy chủ email. Thử lại sau ít phút.' }, 502);
    }
    const out = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      console.error('[email] Resend từ chối', res.status, out.message ?? '');
      return c.json(
        {
          error:
            'Máy chủ email từ chối gửi thư. Kiểm tra địa chỉ người nhận; nếu vẫn lỗi, Quản trị kiểm cấu hình email (tên miền gửi).',
        },
        502,
      );
    }
    externalId = out.id ?? null;
  }

  const sentAt = new Date().toISOString();
  const log = await service(c.env)
    .from('outbound_shares')
    .insert({
      entity_type: 'quotes',
      entity_id: quote.id,
      channel: 'email',
      via: 'he_thong',
      recipient: req.to,
      file_name: req.attachment?.name ?? null,
      simulated: fake,
      external_id: externalId,
      created_by: actorId,
    });
  if (log.error) console.error('[email] không ghi được lịch sử gửi', log.error.message);

  let markedSent = false;
  let markError: string | null = null;
  if (!quote.sent_to_customer_at) {
    const mark = await db.rpc('send_quote_to_customer', { p_quote_id: quote.id });
    if (mark.error) markError = mark.error.message;
    else markedSent = true;
  }

  return c.json({ fake, sent_at: sentAt, marked_sent: markedSent, mark_error: markError });
});
