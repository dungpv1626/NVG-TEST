/**
 * Hàng rào "không ghi hồ sơ vào mã tổng hợp NVG" — migration `0108`.
 *
 * "NVG" là mã TỔNG HỢP toàn tập đoàn, không phải pháp nhân giao dịch (Backend Schema 2.2).
 * Trước 0108 không có gì cưỡng chế điều đó: khóa ngoại `company_id → companies(id)` coi NVG
 * là một dòng hợp lệ như ba pháp nhân kia. Người ở chế độ gộp (Tổng Giám đốc, Giám đốc Tài
 * chính, Quản trị hệ thống) bấm "Tạo" ở màn hình nào cũng ghi được hồ sơ mang mã đó, và hồ sơ
 * ấy rơi ra ngoài P&L của cả ba công ty — khuất khỏi mọi màn hình đã lọc theo pháp nhân,
 * trong khi báo cáo gộp vẫn cộng vào.
 *
 * Ba điều phải đúng:
 *  1. Ghi vào NVG bị từ chối, kể cả khi đi bằng kết nối `postgres` (vượt RLS).
 *  2. Ghi vào pháp nhân giao dịch thật vẫn chạy — hàng rào không chặn nhầm việc bình thường.
 *  3. MỌI bảng có `company_id` đều được gắn, trừ `user_companies`. Đây là phần dễ mục nhất:
 *     bảng thứ 68 do một migration sau tạo ra, người viết nó không có lý do gì để nhớ 0108.
 *
 * Chạy trên CSDL DEV thật, cần đã chạy `npm run db:seed`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasCredentials, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

/** Bảng phân quyền, KHÔNG phải bảng giao dịch — ba tài khoản cấp tập đoàn gán vào NVG ở đây. */
const EXEMPT = 'user_companies';

describeDb('Hàng rào pháp nhân giao dịch (migration 0108)', () => {
  let sql: Awaited<ReturnType<typeof connect>>['sql'];

  async function connect() {
    const { createConnection } = await import('../client');
    return createConnection();
  }

  beforeAll(async () => {
    ({ sql } = await connect());
  });

  afterAll(async () => {
    await sql?.end();
  });

  it('ghi hồ sơ vào mã tổng hợp NVG bị từ chối', async () => {
    const [nvg] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVG'`;
    const stamp = String(Date.now());

    await expect(
      sql`
        INSERT INTO bidding_projects (company_id, code, name)
        VALUES (${nvg!.id}, ${'T0108-' + stamp}, ${TEST_PREFIX + ' Gói thầu sai pháp nhân ' + stamp})
      `,
    ).rejects.toThrow(/mã tổng hợp toàn tập đoàn/);
  });

  /**
   * 47 trong 67 bảng đã có `freeze_record_identity('code','company_id')` cấm đổi pháp nhân của
   * một hồ sơ đã tạo, bất kể đổi sang đâu. Trigger đó tên bắt đầu bằng tên bảng nên xếp trước
   * `trg_transactional_company` theo thứ tự chữ cái, và trigger BEFORE chạy theo đúng thứ tự
   * đó — nên trên nhóm bảng này nó mới là bên trả lời, còn hàng rào 0108 không bao giờ tới lượt.
   *
   * Kết quả với người dùng vẫn đúng (lệnh bị từ chối, câu tiếng Việt nói rõ phải làm gì), nên
   * KHÔNG đổi thứ tự hay gỡ cái nào. Test này ghim lại chính điều đó: nếu ngày nào
   * `freeze_record_identity` bị gỡ khỏi `bidding_projects`, test không đỏ — nó sẽ rơi xuống
   * đúng hàng rào 0108, và câu dưới đây bắt cả hai câu chặn.
   */
  it('chuyển một hồ sơ đã có sang NVG bị từ chối — bảng có khoá bất biến', async () => {
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const [nvg] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVG'`;
    const stamp = String(Date.now());

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO bidding_projects (company_id, code, name)
      VALUES (${nvc!.id}, ${'T0108U-' + stamp}, ${TEST_PREFIX + ' Gói thầu đổi pháp nhân ' + stamp})
      RETURNING id
    `;

    try {
      await expect(
        sql`UPDATE bidding_projects SET company_id = ${nvg!.id} WHERE id = ${row!.id}`,
      ).rejects.toThrow(/mã tổng hợp toàn tập đoàn|Không đổi được pháp nhân/);
    } finally {
      await sql`DELETE FROM bidding_projects WHERE id = ${row!.id}`;
    }
  });

  /**
   * 20 bảng còn lại KHÔNG có `freeze_record_identity` trên `company_id` — trong đó có
   * `unit_prices`, `documents`, `labor_workers`, `recruitment_positions`. Ở nhóm này hàng rào
   * 0108 là thứ DUY NHẤT chặn đường UPDATE, nên phải kiểm trực tiếp trên một bảng thuộc nhóm
   * đó; kiểm trên `bidding_projects` không nói lên điều gì về nhánh này.
   */
  it('chuyển một hồ sơ đã có sang NVG bị từ chối — bảng KHÔNG có khoá bất biến', async () => {
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const [nvg] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVG'`;
    const stamp = String(Date.now());

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO unit_prices (company_id, item_code, name, unit, cost_group, price, source, effective_date)
      VALUES (${nvc!.id}, ${'T0108DG-' + stamp}, ${TEST_PREFIX + ' Đơn giá đổi pháp nhân ' + stamp},
              'm2', 'vat_tu', ${100_000}, 'dinh_muc_noi_bo', CURRENT_DATE)
      RETURNING id
    `;

    try {
      await expect(
        sql`UPDATE unit_prices SET company_id = ${nvg!.id} WHERE id = ${row!.id}`,
      ).rejects.toThrow(/mã tổng hợp toàn tập đoàn/);
    } finally {
      await sql`DELETE FROM unit_prices WHERE id = ${row!.id}`;
    }
  });

  it('ghi vào pháp nhân giao dịch thật vẫn chạy bình thường', async () => {
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const stamp = String(Date.now());

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO bidding_projects (company_id, code, name)
      VALUES (${nvc!.id}, ${'T0108OK-' + stamp}, ${TEST_PREFIX + ' Gói thầu đúng pháp nhân ' + stamp})
      RETURNING id
    `;
    expect(row?.id).toBeTruthy();
    await sql`DELETE FROM bidding_projects WHERE id = ${row!.id}`;
  });

  it('`company_id` rỗng vẫn hợp lệ — đó là cách nói "áp cho toàn hệ thống"', async () => {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM aging_buckets WHERE company_id IS NULL
    `;
    // Mốc công nợ chung được seed với `company_id` rỗng; hàng rào không được đụng tới nó.
    expect(row!.n).toBeGreaterThan(0);
  });

  it('mọi bảng có `company_id` đều được gắn hàng rào, trừ bảng phân quyền', async () => {
    const missing = await sql<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'company_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND c.relname <> ${EXEMPT}
        AND NOT EXISTS (
          SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = c.oid AND t.tgname = 'trg_transactional_company')
      ORDER BY c.relname
    `;

    expect(missing.map((r) => r.relname)).toEqual([]);
  });

  it('bảng phân quyền KHÔNG bị gắn — ba tài khoản cấp tập đoàn gán vào NVG ở đó', async () => {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_trigger
      WHERE tgrelid = ${EXEMPT}::regclass AND tgname = 'trg_transactional_company'
    `;
    expect(row!.n).toBe(0);

    const [assigned] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM user_companies uc
      JOIN companies c ON c.id = uc.company_id
      WHERE c.code = 'NVG'
    `;
    expect(assigned!.n).toBeGreaterThan(0);
  });

  it('bảng mới có `company_id` tự được gắn hàng rào', async () => {
    // Đây là điều mà event trigger `trg_attach_transactional_company_guard` bảo đảm: không ai
    // phải nhớ tới migration 0108 khi thêm bảng thứ 68.
    await sql`CREATE TABLE IF NOT EXISTS public._t0108_probe (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid REFERENCES companies(id)
    )`;
    try {
      const [row] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_trigger
        WHERE tgrelid = 'public._t0108_probe'::regclass
          AND tgname = 'trg_transactional_company'
      `;
      expect(row!.n).toBe(1);
    } finally {
      await sql`DROP TABLE IF EXISTS public._t0108_probe`;
    }
  });
});
