/**
 * Chứng từ đính kèm đề nghị thanh toán (0228).
 *
 * Hàng rào phải đứng:
 *  - Người sửa được đề nghị (còn Nháp) tải chứng từ lên; người không xem được đề nghị không thấy dòng, không tải được tệp.
 *  - Gửi duyệt rồi thì bộ chứng từ khoá: không thêm, không gỡ — người duyệt duyệt đúng bộ lúc gửi.
 *  - Đã duyệt / đã chi: Kế toán chỉ thêm được chứng từ CHI (ủy nhiệm chi, phiếu chi).
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/kt-chung-tu-de-nghi.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF\n');

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

describeDb('Chứng từ đề nghị thanh toán (0228)', () => {
  let ketoan: SupabaseClient;
  let kd: SupabaseClient;
  let requestId = '';

  beforeAll(async () => {
    [ketoan, kd] = await Promise.all([signInAs(ACCOUNTS.ketoan), signInAs(ACCOUNTS.kinhDoanhNvc)]);
    requestId = await withSql(async (sql) => {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [kt] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.ketoan}`;
      const [pr] = await sql<{ id: string }[]>`
        INSERT INTO payment_requests (company_id, code, title, stage, amount, due_date, requested_by)
        VALUES (${nvc!.id}, ${'NVC-DNTT-CT-' + Date.now()}, ${TEST_PREFIX + ' Chứng từ đề nghị'}, 'nhap',
                12000000, current_date + 5, ${kt!.id})
        RETURNING id`;
      return pr!.id;
    });
  });

  afterAll(async () => {
    await withSql((sql) => sql`DELETE FROM payment_requests WHERE id = ${requestId}`);
  });

  async function attach(client: SupabaseClient, kind: string) {
    const path = `${requestId}/${Date.now()}-${kind}.pdf`;
    const up = await client.storage
      .from('payment-files')
      .upload(path, new Blob([PDF], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      });
    const row = await client
      .from('payment_request_files')
      .insert({
        payment_request_id: requestId,
        storage_path: path,
        kind,
        file_name: `${kind}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: PDF.length,
      })
      .select('id, company_id')
      .single();
    return { path, up, row };
  }

  async function setStage(stage: string) {
    await withSql(
      (sql) =>
        sql`UPDATE payment_requests SET stage = ${stage}::payment_request_stage WHERE id = ${requestId}`,
    );
  }

  it('còn Nháp: người lập tải hóa đơn lên; người không xem được đề nghị không thấy dòng, không tải được tệp', async () => {
    const { path, up, row } = await attach(ketoan, 'hoa_don');
    expect(up.error).toBeNull();
    expect(row.error).toBeNull();
    expect(row.data!.company_id).not.toBeNull();

    const { data } = await kd.from('payment_request_files').select('id').eq('id', row.data!.id);
    expect(data ?? []).toEqual([]);
    expect((await kd.storage.from('payment-files').download(path)).data).toBeNull();
    expect((await ketoan.storage.from('payment-files').download(path)).error).toBeNull();
  });

  it('đã gửi duyệt: không thêm, không gỡ chứng từ', async () => {
    await setStage('cho_ke_toan');
    const { row } = await attach(ketoan, 'hoa_don');
    expect(row.error).not.toBeNull();
    const removed = await ketoan
      .from('payment_request_files')
      .delete()
      .eq('payment_request_id', requestId)
      .select('id');
    expect(removed.data ?? []).toEqual([]);
  });

  it('đã chi: Kế toán chỉ thêm được chứng từ chi', async () => {
    await setStage('da_chi');
    const chi = await attach(ketoan, 'chi');
    expect(chi.up.error).toBeNull();
    expect(chi.row.error).toBeNull();
    const hoaDon = await attach(ketoan, 'hoa_don');
    expect(hoaDon.row.error?.message).toMatch(/bộ chứng từ đã khoá/);
  });
});
