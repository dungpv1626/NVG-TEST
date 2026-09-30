/**
 * Chuỗi tài chính theo ngày cho biểu đồ (migration 0140, `finance_daily`).
 *
 * Canh: chỉ vai trò xem tài chính gọi được (vai trò khác bị TỪ CHỐI, không nhận rỗng); doanh thu
 * rơi vào NGÀY NGHIỆP VỤ (`accepted_date`), không phải ngày nhập; biên bản xoá mềm và nghiệm thu
 * nội bộ không phải doanh thu.
 *
 * Dữ liệu thử đặt ở năm 2090 để không lẫn với dữ liệu khác trên cùng CSDL.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/bc-series.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Row {
  day: string;
  company_id: string;
  revenue_accepted: number;
  collected: number;
  paid_out: number;
}

describeDb('Chuỗi tài chính theo ngày (0140)', () => {
  let nvcId: string;
  let tgd: SupabaseClient;

  beforeAll(async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      nvcId = nvc!.id;
      const [site] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, planned_end_date)
        VALUES (${nvcId}, ${'NVC-CT-BC-' + stamp}, ${TEST_PREFIX + ' Công trình chuỗi tài chính ' + stamp}, '2091-01-01')
        RETURNING id`;
      await sql`
        INSERT INTO acceptance_records
          (company_id, construction_site_id, acceptance_type, stage_name, status, value, accepted_date, deleted_at)
        VALUES
          (${nvcId}, ${site!.id}, 'khach_hang', ${TEST_PREFIX + ' Đợt 1'}, 'da_nghiem_thu', 100000000, '2090-03-15', NULL),
          (${nvcId}, ${site!.id}, 'khach_hang', ${TEST_PREFIX + ' Đợt 1b'}, 'da_nghiem_thu', 20000000, '2090-03-15', NULL),
          (${nvcId}, ${site!.id}, 'khach_hang', ${TEST_PREFIX + ' Đã xoá'}, 'da_nghiem_thu', 999000000, '2090-03-15', now()),
          (${nvcId}, ${site!.id}, 'noi_bo', ${TEST_PREFIX + ' Nội bộ'}, 'da_nghiem_thu', 50000000, '2090-03-16', NULL),
          (${nvcId}, ${site!.id}, 'khach_hang', ${TEST_PREFIX + ' Đợt 2'}, 'da_nghiem_thu', 300000000, '2090-04-02', NULL)`;
    } finally {
      await sql.end();
    }
    tgd = await signInAs(ACCOUNTS.tgd);
  });

  async function series(client: SupabaseClient, from: string, to: string) {
    return client.rpc('finance_daily', { p_from: from, p_to: to, p_company_id: nvcId });
  }

  it('doanh thu gộp theo ngày nghiệm thu; bỏ biên bản xoá mềm và nghiệm thu nội bộ', async () => {
    const { data, error } = await series(tgd, '2090-01-01', '2090-12-31');
    expect(error).toBeNull();
    const rows = (data as Row[]).map((r) => [r.day, Number(r.revenue_accepted)]);
    expect(rows).toEqual([
      ['2090-03-15', 120_000_000],
      ['2090-04-02', 300_000_000],
    ]);
  });

  it('chỉ trả ngày trong khoảng yêu cầu', async () => {
    const { data } = await series(tgd, '2090-04-01', '2090-04-30');
    expect((data as Row[]).map((r) => r.day)).toEqual(['2090-04-02']);
  });

  it('Kế toán xem được; Chỉ huy trưởng và Kinh doanh bị từ chối, không nhận danh sách rỗng', async () => {
    const ketoan = await signInAs(ACCOUNTS.ketoan);
    expect((await series(ketoan, '2090-01-01', '2090-12-31')).error).toBeNull();
    for (const email of [ACCOUNTS.chiHuyTruongNvc, ACCOUNTS.kinhDoanhNvc]) {
      const client = await signInAs(email);
      const { data, error } = await series(client, '2090-01-01', '2090-12-31');
      expect(data).toBeNull();
      expect(error!.message).toContain('Không xem được số liệu tài chính');
    }
  });

  it('khoảng thời gian ngược bị từ chối', async () => {
    const { error } = await series(tgd, '2090-12-31', '2090-01-01');
    expect(error!.message).toContain('không hợp lệ');
  });
});
