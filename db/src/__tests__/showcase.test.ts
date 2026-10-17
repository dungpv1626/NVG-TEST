/**
 * Thư viện công trình mẫu + link gửi khách (Đợt 1 — 1H; migration 0178, 0179).
 *
 * Quy tắc chủ dự án chốt phải đứng:
 *  - Cả công ty xem được (kể cả Thi công, Kế toán); chỉ Thiết kế, TGĐ, Ban Giám đốc thêm / sửa.
 *  - Xoá: Thiết kế chỉ đề nghị, Giám đốc đồng ý mới xoá; Giám đốc tự xoá được.
 *  - Link gửi khách bắt buộc thời hạn; thu hồi được; trang công khai chỉ trả mẫu trong link, link
 *    hết hạn / thu hồi thì không trả gì; trình duyệt không gọi thẳng hàm công khai được.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/showcase.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('Thư viện công trình mẫu (0179)', () => {
  let thietKe: SupabaseClient;
  let tgd: SupabaseClient;
  let kd: SupabaseClient;
  let thiCong: SupabaseClient;
  let nvoId: string;
  let itemId: string;
  let otherItemId: string;

  beforeAll(async () => {
    [thietKe, tgd, kd, thiCong] = await Promise.all([
      signInAs(ACCOUNTS.thietKeNvo),
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.congTruongNvc),
    ]);
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const [c] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
      nvoId = c!.id;
    } finally {
      await sql.end();
    }
  });

  it('Thiết kế thêm mẫu; Kinh doanh không thêm được; mọi người trong công ty đều xem được', async () => {
    const add = await thietKe
      .from('showcase_items')
      .insert({
        company_id: nvoId,
        title: `${TEST_PREFIX} Nhà phố 3 tầng hiện đại`,
        kind: 'nha_pho',
        floors: 3,
        frontage: 5,
        depth: 18,
        location_area: 'Thái Bình',
        deleted_at: new Date().toISOString(),
      })
      .select('id, deleted_at')
      .single();
    expect(add.error).toBeNull();
    expect(add.data!.deleted_at).toBeNull();
    itemId = add.data!.id;

    const other = await thietKe
      .from('showcase_items')
      .insert({ company_id: nvoId, title: `${TEST_PREFIX} Biệt thự`, kind: 'biet_thu' })
      .select('id')
      .single();
    otherItemId = other.data!.id;

    const byKd = await kd
      .from('showcase_items')
      .insert({ company_id: nvoId, title: `${TEST_PREFIX} Của Kinh doanh`, kind: 'khac' })
      .select('id');
    expect(byKd.error).not.toBeNull();

    for (const viewer of [kd, thiCong]) {
      // Cùng cách nhúng ảnh như `use-showcase.ts`: hai khoá ngoại nối hai bảng, đổi tên khoá
      // là trang thư viện hỏng — lỗi này đã lọt qua lần đầu vì phép thử không nhúng.
      const { data, error } = await viewer
        .from('showcase_items')
        .select('id, media:showcase_media!showcase_media_item_id_fkey(id)')
        .eq('id', itemId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    }
    const edit = await kd
      .from('showcase_items')
      .update({ title: 'Sửa lén' })
      .eq('id', itemId)
      .select('id');
    expect(edit.data ?? []).toEqual([]);
  });

  it('Thiết kế chỉ đề nghị xoá; Giám đốc đồng ý thì mẫu rời thư viện', async () => {
    const { data: outcome, error } = await thietKe.rpc('request_showcase_deletion', {
      p_item_id: otherItemId,
      p_reason: 'Ảnh cũ, không còn đúng hiện trạng',
    });
    expect(error).toBeNull();
    expect(outcome).toBe('requested');
    const still = await kd.from('showcase_items').select('id').eq('id', otherItemId);
    expect(still.data).toHaveLength(1);

    const { data: inbox } = await tgd.rpc('my_pending_approvals');
    const item = (inbox as { id: string; entity_id: string; subject: string }[]).find(
      (a) => a.entity_id === otherItemId,
    );
    expect(item?.subject).toBe('showcase_delete');
    const ok = await tgd.rpc('decide_approval', {
      p_approval_id: item!.id,
      p_decision: 'approved',
    });
    expect(ok.error).toBeNull();
    const gone = await kd.from('showcase_items').select('id').eq('id', otherItemId);
    expect(gone.data).toEqual([]);
  });

  it('link gửi khách: bắt buộc thời hạn; trang công khai chỉ trả mẫu trong link; thu hồi là hết', async () => {
    const noExpiry = await kd
      .from('showcase_shares')
      .insert({ item_ids: [itemId] })
      .select('id');
    expect(noExpiry.error).not.toBeNull();

    const share = await kd
      .from('showcase_shares')
      .insert({
        item_ids: [itemId],
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        title: `${TEST_PREFIX} Gửi anh Hùng`,
        token: 'tu-dat-ma',
      })
      .select('id, token')
      .single();
    expect(share.error).toBeNull();
    expect(share.data!.token).toMatch(/^[0-9a-f]{36}$/);

    // Trình duyệt không gọi thẳng hàm công khai được — chỉ Worker (khoá service).
    const direct = await kd.rpc('showcase_public', { p_token: share.data!.token });
    expect(direct.error).not.toBeNull();

    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const [open] = await sql<{ r: { status: string; items: { id: string; title: string }[] } }[]>`
        SELECT public.showcase_public(${share.data!.token}) AS r`;
      expect(open!.r.status).toBe('ok');
      expect(open!.r.items.map((i) => i.id)).toEqual([itemId]);
      expect(JSON.stringify(open!.r)).not.toMatch(/design_project|construction_site|price/);

      const revoke = await kd
        .from('showcase_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', share.data!.id)
        .select('id');
      expect(revoke.error).toBeNull();
      const [closed] = await sql<{ r: { status: string } }[]>`
        SELECT public.showcase_public(${share.data!.token}) AS r`;
      expect(closed!.r.status).toBe('expired');

      const [views] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM showcase_share_views WHERE share_id = ${share.data!.id}`;
      expect(views!.n).toBe(1);
    } finally {
      await sql.end();
    }
  });
});
