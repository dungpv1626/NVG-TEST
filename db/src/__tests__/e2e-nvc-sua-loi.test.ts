/**
 * Lỗi tìm thấy khi chạy thử trọn luồng NVC trên trình duyệt (30/10/2026, migration 0251).
 *
 * Hàng rào phải đứng:
 *  - `site_cost_lines` (hàm DEFINER chọn nguồn ngân sách khi chọn thầu phụ) KHÔNG trả dòng «Lợi nhuận
 *    mục tiêu» cho chỉ huy trưởng — trước đó lộ số lợi nhuận (Mẫu D) và cho chọn lợi nhuận làm nguồn chi.
 *  - Biên bản nghiệm thu đã ký hai bên không hủy được (BSD 3.5); chưa ký thì vẫn hủy được.
 *  - Thông báo «hợp đồng đã ký» tới người không xem phân hệ Hợp đồng không mang giá trị và không dẫn
 *    sang trang Hợp đồng; người xem được thì số in kiểu Việt Nam.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/e2e-nvc-sua-loi.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  hasCredentials,
  signAcceptanceWithPaper,
  signInAs,
  TEST_PREFIX,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

describeDb('Sửa lỗi chạy thử NVC (0251)', () => {
  const stamp = String(Date.now());
  let cht: SupabaseClient;
  let siteId = '';
  let companyId = '';
  const notificationIds: string[] = [];

  beforeAll(async () => {
    cht = await signInAs(ACCOUNTS.chiHuyTruongNvc);
    await withSql(async (sql) => {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      companyId = nvc!.id;
      const [u] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
      const [s] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id)
        VALUES (${companyId}, ${'NVC-CT-0251-' + stamp}, ${TEST_PREFIX + ' 0251 ' + stamp},
                'dang_thi_cong', current_date + 90, ${u!.id})
        RETURNING id`;
      siteId = s!.id;
      await sql`
        INSERT INTO project_budgets (company_id, construction_site_id, cost_group, cost_code, name, budgeted_amount)
        VALUES (${companyId}, ${siteId}, 'nhan_cong', 'NHAN_CONG', 'Nhân công', 500000000),
               (${companyId}, ${siteId}, 'loi_nhuan', 'LOI_NHUAN', 'Lợi nhuận mục tiêu', 900000000)`;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      if (notificationIds.length)
        await sql`DELETE FROM notifications WHERE id = ANY(${notificationIds})`;
    });
  });

  it('chỉ huy trưởng chọn nguồn ngân sách: không thấy dòng lợi nhuận', async () => {
    const { data, error } = await cht.rpc('site_cost_lines', { p_site_id: siteId });
    expect(error).toBeNull();
    const codes = ((data ?? []) as { cost_code: string }[]).map((r) => r.cost_code);
    expect(codes).toContain('NHAN_CONG');
    expect(codes).not.toContain('LOI_NHUAN');
  });

  it('biên bản nghiệm thu đã ký hai bên không hủy được; chưa ký thì hủy được', async () => {
    const make = async (label: string) => {
      const { data, error } = await cht.rpc('record_acceptance', {
        p_site_id: siteId,
        p_acceptance_type: 'noi_bo',
        p_stage_name: `${TEST_PREFIX} 0251 ${label}`,
      });
      expect(error).toBeNull();
      return data as string;
    };
    const signedId = await make('đã ký');
    const signed = await signAcceptanceWithPaper(cht, siteId, signedId);
    expect(signed.error).toBeNull();

    const blocked = await cht.rpc('cancel_acceptance', {
      p_acceptance_id: signedId,
      p_reason: 'Thử hủy biên bản đã ký',
    });
    expect(blocked.error?.message).toMatch(/đã ký hai bên/);

    const draftId = await make('chưa ký');
    const ok = await cht.rpc('cancel_acceptance', {
      p_acceptance_id: draftId,
      p_reason: 'Lập nhầm',
    });
    expect(ok.error).toBeNull();
  });

  it('thông báo hợp đồng đã ký: Thi công không thấy giá trị, Kinh doanh thấy số kiểu Việt Nam', async () => {
    await withSql(async (sql) => {
      const [c] = await sql<{ id: string; code: string }[]>`
        SELECT id, code FROM contracts WHERE company_id = ${companyId} AND deleted_at IS NULL LIMIT 1`;
      const users = await sql<{ id: string; email: string }[]>`
        SELECT id, email FROM users WHERE email IN (${ACCOUNTS.congTruongNvc}, ${ACCOUNTS.kinhDoanhNvc})`;
      for (const u of users) {
        const [n] = await sql<{ id: string }[]>`
          SELECT public.create_notification(
            ${u.id}::uuid, ${companyId}::uuid, 'contract_signed',
            ${'Hợp đồng ' + c!.code + ' đã được ký, giá trị 7,300,000,000 đồng.'},
            'contracts', ${c!.id}::uuid, ${'/hd/hop-dong/' + c!.id}) AS id`;
        notificationIds.push(n!.id);
      }
      const rows = await sql<{ email: string; message: string; action_url: string }[]>`
        SELECT u.email, n.message, n.action_url FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE n.id = ANY(${notificationIds})`;
      const tc = rows.find((r) => r.email === ACCOUNTS.congTruongNvc)!;
      const kd = rows.find((r) => r.email === ACCOUNTS.kinhDoanhNvc)!;
      expect(tc.message).not.toMatch(/\d{3}[.,]\d{3}/);
      expect(tc.action_url).toBe('/tc/cong-trinh');
      expect(kd.message).toContain('7.300.000.000');
      expect(kd.action_url).toMatch(/^\/hd\/hop-dong\//);
    });
  });
});
