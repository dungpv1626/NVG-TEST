/**
 * Gói C (0256, 30/10/2026) — bốn đề xuất anh Dũng đồng ý sau lượt chạy thử NVS.
 *
 * Hàng rào phải đứng:
 *  1. (Câu 14) Báo giá thuê lập TRONG cơ hội NVS: Kinh doanh NVS chịu trách nhiệm cơ hội lập / gửi duyệt /
 *     ghi gửi khách; khách lấy từ cơ hội; chỉ khi cơ hội ở Báo giá / Đàm phán; Xưởng không gửi thay; gửi
 *     khách xong cơ hội sang Đàm phán; hợp đồng cho thuê soạn từ cơ hội lấy giá trị báo giá thuê.
 *  2. (Câu 15) Hợp đồng cho thuê: tiền thuê thực tế từ biên bản thu hồi ĐÃ KÝ; không quyết toán khi còn đơn
 *     chưa tất toán; quyết toán ghi `settled_value`, giữ `value`; vượt ngưỡng thì báo một lần mỗi bậc.
 *  3. (Câu 17) Ngày trả thực tế / ngày điều chuyển (lúc ký) không sau hôm nay.
 *  4. (Câu 5) Bàn giao thiết kế cần đầu bài đã xác nhận và khảo sát hoặc lý do bỏ qua.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/goi-c-nghiep-vu.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sql } from 'postgres';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Chạy câu lệnh trong một giao dịch mang danh tính người dùng (auth.uid()) — trigger thấy có người thao tác. */
async function asUser<T>(email: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return withSql(async (sql) => {
    const [u] = await sql<
      { auth_user_id: string }[]
    >`SELECT auth_user_id FROM users WHERE email = ${email}`;
    return (await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claim.sub', ${u!.auth_user_id}, true)`;
      return fn(tx as unknown as Sql);
    })) as T;
  });
}

describeDb('Gói C (0256)', () => {
  const stamp = String(Date.now());
  let kdNvs: SupabaseClient;
  let sx: SupabaseClient;
  let tk: SupabaseClient;
  let nvs = '';
  let nvo = '';
  let mat = '';
  let customer = '';
  let otherCustomer = '';
  let kdUser = '';
  const opps: string[] = [];
  const quoteIds: string[] = [];
  const contractIds: string[] = [];
  const agreementIds: string[] = [];
  const designIds: string[] = [];
  const paramIds: string[] = [];

  beforeAll(async () => {
    [kdNvs, sx, tk] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvs),
      signInAs(ACCOUNTS.xuongNvs),
      signInAs(ACCOUNTS.thietKeNvo),
    ]);
    await withSql(async (sql) => {
      nvs = (await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVS'`)[0]!.id;
      nvo = (await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`)[0]!.id;
      kdUser = (
        await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvs}`
      )[0]!.id;
      mat = (
        await sql<{ id: string }[]>`
        INSERT INTO materials (code, group_code, name, unit, is_scaffolding)
        VALUES (${'GIANGIAO-0256-' + stamp}, 'GIANGIAO', ${TEST_PREFIX + ' Giáo 0256 ' + stamp}, 'bộ', true)
        RETURNING id`
      )[0]!.id;
      paramIds.push(
        (
          await sql<{ id: string }[]>`
          INSERT INTO system_parameters (param_key, scope_type, scope_id, value, unit, label)
          VALUES ('sx.rental_daily_rate', 'product', ${mat}, '3000'::jsonb, 'đồng/ngày', ${TEST_PREFIX + ' bảng giá 0256'})
          RETURNING id`
        )[0]!.id,
      );
      customer = (
        await sql<{ id: string }[]>`
        INSERT INTO customers (name, phone) VALUES (${TEST_PREFIX + ' Khách 0256 ' + stamp}, ${'06' + stamp.slice(-8)})
        RETURNING id`
      )[0]!.id;
      otherCustomer = (
        await sql<{ id: string }[]>`
        INSERT INTO customers (name, phone) VALUES (${TEST_PREFIX + ' Khách khác 0256 ' + stamp}, ${'05' + stamp.slice(-8)})
        RETURNING id`
      )[0]!.id;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      const none = ['00000000-0000-0000-0000-000000000000'];
      const q = quoteIds.length ? quoteIds : none;
      const k = contractIds.length ? contractIds : none;
      const a = agreementIds.length ? agreementIds : none;
      const d = designIds.length ? designIds : none;
      const o = opps.length ? opps : none;
      await sql`DELETE FROM outbound_shares WHERE entity_id IN ${sql(q)}`.catch(() => undefined);
      await sql`DELETE FROM approvals WHERE entity_id IN ${sql(q)}`;
      await sql`DELETE FROM notifications WHERE related_entity_id IN ${sql([...q, ...k, ...a, ...d, ...o])}`;
      await sql`DELETE FROM rental_transfers WHERE from_agreement_id IN ${sql(a)}`;
      await sql`DELETE FROM receivables_payables WHERE rental_agreement_id IN ${sql(a)}`;
      await sql`DELETE FROM rental_returns WHERE rental_agreement_id IN ${sql(a)}`;
      await sql`DELETE FROM rental_agreements WHERE id IN ${sql(a)}`;
      await sql`DELETE FROM contract_rental_overrun_notices WHERE contract_id IN ${sql(k)}`;
      await sql`DELETE FROM contracts WHERE id IN ${sql(k)}`.catch(() => undefined);
      await sql`DELETE FROM rental_quotes WHERE id IN ${sql(q)}`;
      await sql`DELETE FROM design_briefs WHERE design_project_id IN ${sql(d)}`.catch(
        () => undefined,
      );
      await sql`DELETE FROM design_projects WHERE id IN ${sql(d)}`.catch(() => undefined);
      await sql`DELETE FROM opportunities WHERE id IN ${sql(o)}`.catch(() => undefined);
      if (paramIds.length) await sql`DELETE FROM system_parameters WHERE id IN ${sql(paramIds)}`;
    });
  });

  async function newOpportunity(stage: string): Promise<string> {
    const id = await withSql(
      async (sql) =>
        (
          await sql<{ id: string }[]>`
          INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
          VALUES (${nvs}, ${'NVS-CH-0256-' + opps.length + '-' + stamp}, ${customer},
                  ${TEST_PREFIX + ' Cơ hội thuê giàn giáo ' + stamp}, ${kdUser}, ${stage})
          RETURNING id`
        )[0]!.id,
    );
    opps.push(id);
    return id;
  }

  describe('1. Báo giá thuê trong cơ hội NVS', () => {
    it('Kinh doanh NVS lập, gửi duyệt, ghi gửi khách → cơ hội sang Đàm phán; hợp đồng lấy giá trị', async () => {
      const opp = await newOpportunity('bao_gia');

      // Kinh doanh không sửa SX: không lập báo giá thuê ngoài cơ hội.
      const loose = await kdNvs
        .from('rental_quotes')
        .insert({ company_id: nvs, customer_id: customer })
        .select('id');
      expect(loose.error, 'báo giá thuê không gắn cơ hội vẫn là việc của Xưởng').not.toBeNull();

      const { data, error } = await kdNvs
        .from('rental_quotes')
        .insert({
          company_id: nvs,
          customer_id: otherCustomer,
          opportunity_id: opp,
          needed_date: '2026-11-01',
          expected_end_date: '2026-11-10',
        })
        .select('id, customer_id')
        .single();
      expect(error).toBeNull();
      const q = data as { id: string; customer_id: string };
      quoteIds.push(q.id);
      expect(q.customer_id, 'khách lấy từ cơ hội, không chọn tay').toBe(customer);

      // Kinh doanh đọc được danh mục giàn giáo để chọn mã.
      const { data: mats } = await kdNvs.from('materials').select('id').eq('id', mat);
      expect(mats).toHaveLength(1);

      expect(
        (
          await kdNvs.from('rental_quote_items').insert({
            rental_quote_id: q.id,
            material_id: mat,
            kind: 'thue',
            quantity: 10,
            unit_price: 3000,
          })
        ).error,
      ).toBeNull();

      // Xưởng không gửi thay báo giá của cơ hội.
      const bySx = await sx.rpc('submit_rental_quote', { p_quote_id: q.id });
      expect(bySx.error?.code).toBe('42501');

      const { data: result, error: subErr } = await kdNvs.rpc('submit_rental_quote', {
        p_quote_id: q.id,
      });
      expect(subErr).toBeNull();
      expect(result).toBe('da_duyet');

      // Xưởng vẫn xem được.
      const { data: seen } = await sx.from('rental_quotes').select('id').eq('id', q.id);
      expect(seen).toHaveLength(1);

      // Ghi gửi khách tay bị chặn; qua hàm thì được, kèm kênh.
      const direct = await kdNvs
        .from('rental_quotes')
        .update({ sent_to_customer_at: new Date().toISOString() })
        .eq('id', q.id)
        .select('id');
      expect((direct.data ?? []).length === 0 || direct.error !== null).toBe(true);
      const { error: sendErr } = await kdNvs.rpc('send_rental_quote_to_customer', {
        p_quote_id: q.id,
        p_channel: 'tan_tay',
      });
      expect(sendErr).toBeNull();
      const [row] = await withSql(
        (sql) => sql<{ stage: string; ch: string }[]>`
          SELECT o.stage::text AS stage, rq.sent_channel AS ch
            FROM rental_quotes rq JOIN opportunities o ON o.id = rq.opportunity_id
           WHERE rq.id = ${q.id}`,
      );
      expect(row!.ch).toBe('tan_tay');
      expect(row!.stage, 'báo giá thuê đã duyệt gửi khách → Đàm phán').toBe('dam_phan');

      // Hợp đồng cho thuê từ cơ hội: giá trị = báo giá thuê (3.000 × 10 × 10 ngày).
      const { data: contractId, error: kErr } = await kdNvs.rpc('create_contract_from_source', {
        p_source_type: 'opportunities',
        p_source_id: opp,
        p_type: 'cho_thue',
      });
      expect(kErr).toBeNull();
      contractIds.push(contractId as string);
      const [k] = await withSql(
        (sql) =>
          sql<
            { value: string }[]
          >`SELECT value::text FROM contracts WHERE id = ${contractId as string}`,
      );
      expect(k!.value).toBe('300000');

      // Thông báo duyệt / từ chối dẫn về tab Báo giá của cơ hội.
      const [n] = await withSql(
        (sql) => sql<{ action_url: string }[]>`
          INSERT INTO notifications (user_id, company_id, type, message, related_entity_type, related_entity_id, action_url)
          VALUES (${kdUser}, ${nvs}, 'rental_quote_approved', ${TEST_PREFIX + ' 0256'}, 'rental_quotes', ${q.id},
                  ${'/sx/bao-gia-thue?bao-gia=' + q.id})
          RETURNING action_url`,
      );
      expect(n!.action_url).toBe(`/crm/co-hoi/${opp}?tab=bao-gia`);
    });

    it('chưa tới bước Báo giá thì không lập được báo giá thuê', async () => {
      const opp = await newOpportunity('khao_sat');
      const { error } = await kdNvs
        .from('rental_quotes')
        .insert({ company_id: nvs, customer_id: customer, opportunity_id: opp })
        .select('id');
      expect(error?.message).toContain('chưa sang bước Báo giá');
    });
  });

  describe('2. Hợp đồng cho thuê: thực tế, quyết toán', () => {
    it('tiền thuê thực tế từ biên bản đã ký; chặn quyết toán khi còn đơn mở; báo vượt một lần mỗi bậc', async () => {
      const ids = await withSql(async (sql) => {
        const [k] = await sql<{ id: string }[]>`
          INSERT INTO contracts (company_id, code, title, type, stage, customer_id, value, responsible_user_id)
          VALUES (${nvs}, ${'NVS-HD-0256-' + stamp}, ${TEST_PREFIX + ' HĐ cho thuê 0256'}, 'cho_thue', 'da_ky',
                  ${customer}, 1000000, ${kdUser})
          RETURNING id`;
        const [a] = await sql<{ id: string }[]>`
          INSERT INTO rental_agreements (company_id, code, customer_id, start_date, contract_id)
          VALUES (${nvs}, ${'NVS-HDT-0256-' + stamp}, ${customer}, current_date - 20, ${k!.id})
          RETURNING id`;
        const [p] = await sql<{ id: string }[]>`
          INSERT INTO system_parameters (param_key, scope_type, scope_id, value, unit, label)
          VALUES ('sx.rental_contract_overrun_percent', 'company', ${nvs}, '20'::jsonb, '%', ${TEST_PREFIX + ' ngưỡng 0256'})
          RETURNING id`;
        return { k: k!.id, a: a!.id, p: p!.id };
      });
      contractIds.push(ids.k);
      agreementIds.push(ids.a);
      paramIds.push(ids.p);

      // Biên bản chưa ký không tính; ký xong mới tính.
      await withSql(async (sql) => {
        const [r] = await sql<{ id: string }[]>`
          INSERT INTO rental_returns (company_id, rental_agreement_id, code, return_date, revenue, compensation)
          VALUES (${nvs}, ${ids.a}, ${'NVS-BBTH-0256-' + stamp}, current_date - 1, 1100000, 200000)
          RETURNING id`;
        const [before] = await sql<{ actual_total: string }[]>`
          SELECT (SELECT rent + compensation FROM _contract_rental_totals(${ids.k}))::text AS actual_total`;
        expect(before!.actual_total).toBe('0');
        await sql`UPDATE rental_returns SET signed_at = now(), customer_representative = 'Khách 0256',
                         paper_scan_path = ${ids.a + '/0256.pdf'} WHERE id = ${r!.id}`;
      });

      const { data: act } = await kdNvs.rpc('contract_rental_actuals', { p_contract_id: ids.k });
      const a0 = (
        act as { signed_value: number; actual_total: number; open_agreements: number }[]
      )[0]!;
      expect(Number(a0.signed_value)).toBe(1_000_000);
      expect(Number(a0.actual_total)).toBe(1_300_000);
      expect(a0.open_agreements).toBe(1);

      // Vượt 30 % > ngưỡng 20 % → bậc 1, báo người chịu trách nhiệm một lần.
      const notices = await withSql(
        (sql) => sql<{ type: string }[]>`
          SELECT type FROM notifications WHERE related_entity_id = ${ids.k} AND type = 'rental_contract_overrun'`,
      );
      expect(notices).toHaveLength(1);

      // Quyết toán khi đơn chưa tất toán → chặn.
      await expect(
        asUser(
          ACCOUNTS.tgd,
          (tx) => tx`UPDATE contracts SET stage = 'hoan_thanh' WHERE id = ${ids.k}`,
        ),
      ).rejects.toThrow(/chưa tất toán/);

      // Tất toán đơn → quyết toán được, ghi giá trị quyết toán, giữ giá trị ký.
      await withSql(
        (sql) => sql`UPDATE rental_agreements SET settled_at = now() WHERE id = ${ids.a}`,
      );
      await asUser(
        ACCOUNTS.tgd,
        (tx) => tx`UPDATE contracts SET stage = 'hoan_thanh' WHERE id = ${ids.k}`,
      );
      const [after] = await withSql(
        (sql) => sql<{ value: string; settled_value: string }[]>`
          SELECT value::text, settled_value::text FROM contracts WHERE id = ${ids.k}`,
      );
      expect(after!.value).toBe('1000000');
      expect(after!.settled_value).toBe('1300000');
    });
  });

  describe('3. Ngày trả thực tế không sau hôm nay', () => {
    it('biên bản thu hồi / điều chuyển ngày tương lai bị chặn; hôm nay thì được', async () => {
      const a = await withSql(
        async (sql) =>
          (
            await sql<{ id: string }[]>`
            INSERT INTO rental_agreements (company_id, code, customer_id, start_date, expected_end_date)
            VALUES (${nvs}, ${'NVS-HDT-0256B-' + stamp}, ${customer}, current_date - 5, current_date + 30)
            RETURNING id`
          )[0]!.id,
      );
      agreementIds.push(a);
      await expect(
        asUser(
          ACCOUNTS.xuongNvs,
          (tx) => tx`
          INSERT INTO rental_returns (company_id, rental_agreement_id, code, return_date)
          VALUES (${nvs}, ${a}, ${'NVS-BBTH-0256F-' + stamp},
                  ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 2))`,
        ),
      ).rejects.toThrow(/sau hôm nay/);
      await asUser(
        ACCOUNTS.xuongNvs,
        (tx) => tx`
        INSERT INTO rental_returns (company_id, rental_agreement_id, code, return_date)
        VALUES (${nvs}, ${a}, ${'NVS-BBTH-0256T-' + stamp}, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`,
      );

      const t = await withSql(
        async (sql) =>
          (
            await sql<{ id: string }[]>`
            INSERT INTO rental_transfers (company_id, code, from_agreement_id, transfer_date, to_site_label)
            VALUES (${nvs}, ${'NVS-DCGG-0256-' + stamp}, ${a}, current_date + 3, ${TEST_PREFIX + ' công trình nhận'})
            RETURNING id`
          )[0]!.id,
      );
      await expect(
        asUser(
          ACCOUNTS.xuongNvs,
          (tx) => tx`UPDATE rental_transfers SET status = 'da_ky' WHERE id = ${t}`,
        ),
      ).rejects.toThrow(/Ngày điều chuyển/);
    });
  });

  describe('4. Bàn giao thiết kế: đầu bài, khảo sát', () => {
    it('chặn khi đầu bài chưa xác nhận; chưa khảo sát phải ghi lý do', async () => {
      const d = await withSql(
        async (sql) =>
          (
            await sql<{ id: string }[]>`
            INSERT INTO design_projects (company_id, code, name, stage)
            VALUES (${nvo}, ${'NVO-TK-0256-' + stamp}, ${TEST_PREFIX + ' Thiết kế 0256'}, 'du_toan')
            RETURNING id`
          )[0]!.id,
      );
      designIds.push(d);

      const codes = async () => {
        const { data, error } = await tk.rpc('check_design_sync', { p_design_project_id: d });
        expect(error).toBeNull();
        return (data as { code: string; blocking: boolean }[]).filter((f) =>
          ['dau_bai_chua_xac_nhan', 'chua_khao_sat', 'bo_qua_khao_sat'].includes(f.code),
        );
      };
      expect(await codes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'dau_bai_chua_xac_nhan', blocking: true }),
          expect.objectContaining({ code: 'chua_khao_sat', blocking: true }),
        ]),
      );

      // Kinh doanh không ghi được lý do; lý do rỗng bị từ chối.
      expect(
        (await kdNvs.rpc('waive_design_survey', { p_design_project_id: d, p_reason: 'x' })).error,
      ).not.toBeNull();
      expect(
        (await tk.rpc('waive_design_survey', { p_design_project_id: d, p_reason: ' ' })).error,
      ).not.toBeNull();
      expect(
        (
          await tk.rpc('waive_design_survey', {
            p_design_project_id: d,
            p_reason: 'Khách gửi sẵn bản đo hiện trạng',
          })
        ).error,
      ).toBeNull();
      const afterWaive = await codes();
      expect(afterWaive.find((f) => f.code === 'chua_khao_sat')).toBeUndefined();
      expect(afterWaive.find((f) => f.code === 'bo_qua_khao_sat')?.blocking).toBe(false);

      // Lưới an toàn trên bảng: đặt handed_over_at khi đầu bài chưa xác nhận → chặn.
      await expect(
        asUser(
          ACCOUNTS.thietKeNvo,
          (tx) => tx`UPDATE design_projects SET handed_over_at = now() WHERE id = ${d}`,
        ),
      ).rejects.toThrow(/Đầu bài/);

      await withSql(
        (sql) => sql`
        INSERT INTO design_briefs (company_id, design_project_id, design_task, confirmed_at)
        VALUES (${nvo}, ${d}, ${TEST_PREFIX + ' đầu bài'}, now())`,
      );
      expect((await codes()).filter((f) => f.blocking)).toEqual([]);
      await asUser(
        ACCOUNTS.thietKeNvo,
        (tx) => tx`UPDATE design_projects SET handed_over_at = now() WHERE id = ${d}`,
      );
      // Đã bàn giao: không còn dòng đầu bài / khảo sát nào.
      expect(await codes()).toEqual([]);
    });
  });
});
