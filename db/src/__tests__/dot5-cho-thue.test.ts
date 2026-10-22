/**
 * Đợt 5 — 5D: NVS cho thuê (migration 0209).
 *
 * Canh:
 *  1. Nhắc hết hạn thuê: đơn quá ngày trả dự kiến luôn báo một lần; số ngày nhắc trước TRỐNG thì
 *     đơn còn hạn không báo; đổi ngày trả thì nhắc lại.
 *  2. Phiếu giao khách ký nhận: Xưởng ký một lần, chữ ký phải ở thư mục của đúng đơn; cột ký không
 *     sửa tay; Kế toán (chỉ xem) không tải chữ ký lên.
 *  3. Tồn kho cho thuê: chỉ người xem được hợp đồng thuê mới đọc được.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/dot5-cho-thue.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function sqlRun<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const isoDate = (offset: number) => {
  const d = new Date(Date.now() + 7 * 3600_000);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

describeDb('5D — cho thuê: nhắc hạn, phiếu giao ký nhận, tồn kho (0209)', () => {
  let sx: SupabaseClient;
  let kd: SupabaseClient;
  let nvs: string;
  let overdue: string;
  let soon: string;
  let creator: string;

  beforeAll(async () => {
    sx = await signInAs(ACCOUNTS.xuongNvs);
    kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    creator = (await sx.rpc('auth_user_id')).data as string;
    await sqlRun(async (sql) => {
      const [c] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVS'`;
      nvs = c!.id;
      const [cust] = await sql<{ id: string }[]>`
        INSERT INTO customers (name, phone) VALUES (${TEST_PREFIX + ' Khách thuê 5D'}, ${'09' + String(Date.now()).slice(-8)})
        RETURNING id`;
      const rows = await sql<{ id: string }[]>`
        INSERT INTO rental_agreements (company_id, code, customer_id, start_date, expected_end_date, status, created_by)
        VALUES (${nvs}, ${'NVS-TH-THU5-A-' + Date.now()}, ${cust!.id}, ${isoDate(-30)}, ${isoDate(-2)}, 'dang_thue', ${creator}),
               (${nvs}, ${'NVS-TH-THU5-B-' + Date.now()}, ${cust!.id}, ${isoDate(-10)}, ${isoDate(5)}, 'dang_thue', ${creator})
        RETURNING id`;
      overdue = rows[0]!.id;
      soon = rows[1]!.id;
    });
  });

  afterAll(async () => {
    await sqlRun(async (sql) => {
      await sql`DELETE FROM notifications WHERE related_entity_id IN (${overdue}, ${soon})`;
      await sql`UPDATE system_parameters SET value = NULL
                WHERE param_key = 'sx.rental_remind_days' AND scope_type = 'global'`;
    });
  });

  const count = (id: string) =>
    sqlRun(
      async (sql) =>
        (
          await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications
            WHERE related_entity_id = ${id} AND type = 'rental_expiry' AND user_id = ${creator}`
        )[0]!.n,
    );

  it('quá ngày trả luôn báo một lần; số ngày nhắc trống thì đơn còn hạn không báo; đổi ngày trả thì nhắc lại', async () => {
    await sqlRun((sql) => sql`SELECT scan_rental_expiry_reminders()`);
    await sqlRun((sql) => sql`SELECT scan_rental_expiry_reminders()`);
    expect(await count(overdue)).toBe(1);
    expect(await count(soon)).toBe(0);

    await sqlRun(
      (sql) => sql`UPDATE system_parameters SET value = '7'::jsonb
                   WHERE param_key = 'sx.rental_remind_days' AND scope_type = 'global'`,
    );
    await sqlRun((sql) => sql`SELECT scan_rental_expiry_reminders()`);
    expect(await count(soon)).toBe(1);

    await sqlRun(
      (sql) =>
        sql`UPDATE rental_agreements SET expected_end_date = ${isoDate(-1)} WHERE id = ${overdue}`,
    );
    await sqlRun((sql) => sql`SELECT scan_rental_expiry_reminders()`);
    expect(await count(overdue)).toBe(2);

    const browser = await sx.rpc('scan_rental_expiry_reminders');
    expect(browser.error).toBeTruthy();
  });

  it('phiếu giao: Xưởng ký một lần, chữ ký đúng thư mục; không sửa tay; Kinh doanh NVC không tải lên', async () => {
    const up = async (client: SupabaseClient, path: string) =>
      client.storage
        .from('rental-delivery-docs')
        .upload(path, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' });

    expect((await up(kd, `${soon}/khach/${crypto.randomUUID()}.png`)).error).toBeTruthy();

    const cust = `${soon}/khach/${crypto.randomUUID()}.png`;
    const nvg = `${soon}/nvg/${crypto.randomUUID()}.png`;
    expect((await up(sx, cust)).error).toBeNull();
    expect((await up(sx, nvg)).error).toBeNull();

    const wrong = await sx.rpc('sign_rental_delivery', {
      p_rental_agreement_id: soon,
      p_customer_representative: 'Anh Thử',
      p_customer_signature_path: `${overdue}/x.png`,
      p_nvg_signature_path: nvg,
    });
    expect(wrong.error?.message ?? '').toContain('chưa tải lên');

    const ok = await sx.rpc('sign_rental_delivery', {
      p_rental_agreement_id: soon,
      p_customer_representative: 'Anh Thử',
      p_customer_signature_path: cust,
      p_nvg_signature_path: nvg,
    });
    expect(ok.error).toBeNull();
    const again = await sx.rpc('sign_rental_delivery', {
      p_rental_agreement_id: soon,
      p_customer_representative: 'Ký lại',
      p_customer_signature_path: cust,
      p_nvg_signature_path: nvg,
    });
    expect(again.error?.message ?? '').toContain('đã ký');

    const hand = await sqlRun(async (sql) => {
      try {
        await sql`UPDATE rental_agreements SET delivery_customer_representative = 'Sửa tay' WHERE id = ${soon}`;
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(hand ?? '').toContain('không sửa tay');
  });

  it('tồn kho cho thuê: Xưởng NVS đọc được, Kinh doanh NVC không', async () => {
    const mine = await sx.rpc('rental_available_stock', { p_company_id: nvs });
    expect(mine.error).toBeNull();
    expect((mine.data as unknown[]).length).toBeGreaterThan(0);
    const other = await kd.rpc('rental_available_stock', { p_company_id: nvs });
    expect((other.data ?? []) as unknown[]).toHaveLength(0);
  });
});
