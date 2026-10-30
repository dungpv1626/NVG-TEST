/**
 * Trang xem mẫu công trình CÔNG KHAI (Đợt 1 — 1H) — tuyến đầu tiên của hệ thống mở ra ngoài.
 *
 *   GET /public/showcase/:token
 *
 * Không có phiên đăng nhập, nên tuyến này dùng khoá service — và vì thế chỉ đi qua MỘT cửa:
 * hàm CSDL `showcase_public` (0179) kiểm link còn hạn / chưa thu hồi, trả đúng các mẫu trong link
 * với các cột trưng bày (không giá, không danh tính chủ nhà), và ghi một lượt xem. Ảnh trả về bằng
 * đường dẫn ký 1 giờ. Mã link sai dạng thì từ chối ngay, không chạm CSDL.
 */

import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { DesignEnv } from './design/env';
import { conceptPublicApp } from './design/ai/concept-public';

interface PublicMedia {
  id: string;
  path: string;
  kind: string;
  caption: string | null;
}

interface PublicItem {
  id: string;
  cover_media_id: string | null;
  media: PublicMedia[];
  [key: string]: unknown;
}

export const publicApp = new Hono<{ Bindings: DesignEnv }>();

publicApp.get('/showcase/:token', async (c) => {
  const token = c.req.param('token');
  if (!/^[0-9a-f]{36}$/.test(token)) {
    return c.json({ status: 'not_found' }, 404);
  }
  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc('showcase_public', { p_token: token });
  if (error) return c.json({ status: 'error' }, 500);

  const body = data as { status: string; items?: PublicItem[] } & Record<string, unknown>;
  if (body.status !== 'ok') {
    return c.json({ status: body.status }, body.status === 'expired' ? 410 : 404);
  }

  const items = body.items ?? [];
  const paths = items.flatMap((i) => i.media.map((m) => m.path));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await db.storage.from('showcase').createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  c.header('Cache-Control', 'no-store');
  return c.json({
    ...body,
    items: items.map((i) => ({
      ...i,
      // Đường dẫn trong kho không gửi ra ngoài — chỉ đường dẫn ký.
      media: i.media.map((m) => ({
        id: m.id,
        kind: m.kind,
        caption: m.caption,
        url: signed.get(m.path) ?? null,
      })),
    })),
  });
});

/**
 * Bản hợp đồng đã ký gửi khách (0189):
 *
 *   GET /public/signed/:token
 *
 * Cùng một cửa như trang mẫu: hàm `contract_scan_public` kiểm link còn hạn / chưa thu hồi, chỉ trả
 * tên, số, ngày ký và tệp (không giá trị, không điều khoản), ghi một lượt xem. Tệp trả về bằng
 * đường dẫn ký 1 giờ — đường dẫn trong kho không ra ngoài.
 */
publicApp.get('/signed/:token', async (c) => {
  const token = c.req.param('token');
  if (!/^[0-9a-f]{36}$/.test(token)) {
    return c.json({ status: 'not_found' }, 404);
  }
  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc('contract_scan_public', { p_token: token });
  if (error) return c.json({ status: 'error' }, 500);

  const { path, ...body } = data as { status: string; path?: string } & Record<string, unknown>;
  if (body.status !== 'ok' || !path) {
    return c.json(
      { status: body.status === 'ok' ? 'not_found' : body.status },
      body.status === 'expired' ? 410 : 404,
    );
  }
  const { data: signed } = await db.storage
    .from('contract-documents')
    .createSignedUrl(path, 3600, { download: false });

  c.header('Cache-Control', 'no-store');
  return c.json({ ...body, url: signed?.signedUrl ?? null });
});

/** Bộ ý tưởng AI Design gửi khách (B5, 0259) — `GET /public/concept/:token`, xem `design/ai/concept-public.ts`. */
publicApp.route('/concept', conceptPublicApp);
