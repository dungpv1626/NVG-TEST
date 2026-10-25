/**
 * «Nhận soạn thay» hợp đồng cho Ban Giám đốc (migration 0223, anh Dũng 25/10/2026).
 *
 * Hàng rào phải đứng:
 *  - Ban Giám đốc KHÔNG sửa được hợp đồng người khác đang soạn khi chưa nhận soạn thay (giữ tách người thực hiện /
 *    người phê duyệt).
 *  - Nhận soạn thay: chỉ Ban Giám đốc, chỉ khi Nháp; người chịu trách nhiệm đổi sang người nhận, nhật ký + người soạn
 *    trước được báo; từ đó sửa được ĐÚNG hợp đồng ấy (thông tin, điều khoản).
 *  - Kiểm soát nội bộ, Kinh doanh không nhận soạn thay được.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/hd-nhan-soan-thay.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('Nhận soạn thay hợp đồng (0223)', () => {
  let draftId: string;
  let otherDraftId: string;
  let signedId: string;
  let kdId: string;
  let tgdId: string;
  let tgd: SupabaseClient;
  let kd: SupabaseClient;
  let ksnb: SupabaseClient;

  beforeAll(async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [kdRow] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      const [tgdRow] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.tgd}`;
      kdId = kdRow!.id;
      tgdId = tgdRow!.id;
      const rows = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, responsible_user_id)
        VALUES
          (${nvc!.id}, ${'NVC-HD-NST-A-' + stamp}, ${TEST_PREFIX + ' Nhận soạn thay A ' + stamp},
           'thi_cong', 'nhap', 900000000, ${kdId}),
          (${nvc!.id}, ${'NVC-HD-NST-B-' + stamp}, ${TEST_PREFIX + ' Nhận soạn thay B ' + stamp},
           'thi_cong', 'nhap', 900000000, ${kdId}),
          (${nvc!.id}, ${'NVC-HD-NST-C-' + stamp}, ${TEST_PREFIX + ' Nhận soạn thay C ' + stamp},
           'thi_cong', 'da_ky', 900000000, ${kdId})
        RETURNING id`;
      [draftId, otherDraftId, signedId] = rows.map((r) => r.id) as [string, string, string];
    } finally {
      await sql.end();
    }
    [tgd, kd, ksnb] = await Promise.all([
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.ksnb),
    ]);
  });

  async function rename(client: SupabaseClient, id: string, title: string) {
    return client.from('contracts').update({ notes: title }).eq('id', id).select('id');
  }

  it('chưa nhận soạn thay: Ban Giám đốc không sửa được hợp đồng Kinh doanh đang soạn', async () => {
    const res = await rename(tgd, draftId, 'TGĐ sửa trộm');
    expect(res.data ?? []).toHaveLength(0);
    const can = await tgd.rpc('rls_contract_writable', { p_contract_id: draftId });
    expect(can.data).toBe(false);
  });

  it('Kinh doanh và Kiểm soát nội bộ không nhận soạn thay được', async () => {
    expect(
      (await kd.rpc('take_over_contract', { p_contract_id: otherDraftId })).error?.message,
    ).toMatch(/Ban Giám đốc/);
    expect(
      (await ksnb.rpc('take_over_contract', { p_contract_id: otherDraftId })).error,
    ).not.toBeNull();
  });

  it('hợp đồng đã ký không nhận soạn thay được', async () => {
    expect(
      (await tgd.rpc('take_over_contract', { p_contract_id: signedId })).error?.message,
    ).toMatch(/Nháp/);
  });

  it('nhận soạn thay: đổi người chịu trách nhiệm, báo người soạn trước, sửa được đúng hợp đồng ấy', async () => {
    const res = await tgd.rpc('take_over_contract', {
      p_contract_id: draftId,
      p_reason: 'Kinh doanh nghỉ phép',
    });
    expect(res.error).toBeNull();

    const { data: row } = await tgd
      .from('contracts')
      .select('responsible_user_id')
      .eq('id', draftId)
      .single();
    expect(row!.responsible_user_id).toBe(tgdId);

    const { data: notes } = await kd
      .from('notifications')
      .select('message')
      .eq('related_entity_id', draftId)
      .eq('type', 'contract_taken_over');
    expect(notes?.[0]?.message).toMatch(/Kinh doanh nghỉ phép/);

    expect((await rename(tgd, draftId, 'TGĐ soạn tiếp')).data).toHaveLength(1);
    // Hợp đồng KHÁC vẫn không sửa được — nhận soạn thay không mở quyền sửa chung.
    expect((await rename(tgd, otherDraftId, 'TGĐ sửa trộm')).data ?? []).toHaveLength(0);
    // Người soạn trước không còn sửa được.
    expect((await rename(kd, draftId, 'KD sửa sau khi bị nhận')).data ?? []).toHaveLength(0);
  });
});
