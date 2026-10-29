/**
 * Mẫu Word báo giá NVG tự tải lên (migration 0240).
 *
 * Hàng rào phải đứng:
 *  - Tải mẫu báo giá theo đúng quyền mẫu hợp đồng (`auth_can_manage_contract_templates`): Kinh doanh không, Tổng
 *    Giám đốc được.
 *  - Mẫu người tải lên thay mẫu DEMO (seed, `created_by` rỗng) cho báo giá chưa gửi.
 *  - Báo giá đã gửi khách giữ mẫu lúc gửi — tải mẫu mới / ngừng dùng mẫu cũ không hồi tố.
 *  - Trình duyệt không tự đặt `quotes.template_id`.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/bao-gia-mau-tai-len.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

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

describeDb('mẫu báo giá tải lên (0240)', () => {
  let kd: SupabaseClient;
  let tgd: SupabaseClient;
  let nvcId: string;
  let demoId: string | null;
  let oppId: string;
  let customerId: string;
  let sentQuoteId: string;
  let draftQuoteId: string;
  const created: string[] = [];

  const pick = async (quoteId: string) =>
    (await kd.rpc('quote_template_for', { p_quote_id: quoteId })).data as string | null;

  async function uploadTemplate(title: string) {
    const { data, error } = await tgd
      .from('contract_templates')
      .insert({
        company_id: nvcId,
        title: `${TEST_PREFIX} ${title}`,
        contract_type: null,
        document_kind: 'bao_gia',
        storage_path: `${nvcId}/${crypto.randomUUID()}.docx`,
        file_name: 'mau.docx',
        tags: { so_bao_gia: {} },
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    created.push(data!.id as string);
    return data!.id as string;
  }

  beforeAll(async () => {
    [kd, tgd] = await Promise.all([signInAs(ACCOUNTS.kinhDoanhNvc), signInAs(ACCOUNTS.tgd)]);
    await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      nvcId = nvc!.id;
      const [demo] = await sql<{ id: string }[]>`
        SELECT id FROM contract_templates
         WHERE company_id = ${nvcId} AND document_kind = 'bao_gia' AND is_active AND created_by IS NULL
         ORDER BY created_at DESC LIMIT 1`;
      demoId = demo?.id ?? null;
      const [kdUser] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      const [cu] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name) VALUES (${'KH-BGMAU-' + stamp}, ${TEST_PREFIX + ' Khách mẫu ' + stamp})
        RETURNING id`;
      customerId = cu!.id;
      const [o] = await sql<{ id: string }[]>`
        INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
        VALUES (${nvcId}, ${'NVC-CH-BGMAU-' + stamp}, ${cu!.id}, ${TEST_PREFIX + ' Cơ hội mẫu ' + stamp},
                ${kdUser!.id}, 'bao_gia')
        RETURNING id`;
      oppId = o!.id;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      if (oppId) {
        await sql`DELETE FROM quotes WHERE opportunity_id = ${oppId}`;
        await sql`DELETE FROM opportunities WHERE id = ${oppId}`;
      }
      if (customerId) await sql`DELETE FROM customers WHERE id = ${customerId}`;
      if (created.length)
        await sql`DELETE FROM contract_templates WHERE id = ANY(${created}::uuid[])`;
    });
  });

  it('Kinh doanh không tải được mẫu báo giá; Tổng Giám đốc tải được', async () => {
    const denied = await kd.from('contract_templates').insert({
      company_id: nvcId,
      title: `${TEST_PREFIX} lén`,
      document_kind: 'bao_gia',
      storage_path: `${nvcId}/x.docx`,
      file_name: 'x.docx',
    });
    expect(denied.error).not.toBeNull();
    // Khoá báo giá: tải xong mẫu A thì báo giá gửi khách lúc này dùng A.
    const a = await uploadTemplate('Mẫu A');
    await withSql(async (sql) => {
      const [q] = await sql<{ id: string }[]>`
        INSERT INTO quotes (company_id, code, opportunity_id, total_value)
        VALUES (${nvcId}, ${'NVC-BG-MAU1-' + Date.now()}, ${oppId}, 100000000) RETURNING id`;
      sentQuoteId = q!.id;
      await sql`UPDATE quotes SET status = 'completed' WHERE id = ${sentQuoteId}`;
      await sql`UPDATE quotes SET sent_to_customer_at = now() WHERE id = ${sentQuoteId}`;
      const [t] = await sql<{ template_id: string }[]>`
        SELECT template_id FROM quotes WHERE id = ${sentQuoteId}`;
      expect(t!.template_id).toBe(a);
    });
    expect(await pick(sentQuoteId)).toBe(a);
  });

  it('mẫu mới thay mẫu cũ cho báo giá chưa gửi; báo giá đã gửi giữ mẫu lúc gửi', async () => {
    const b = await uploadTemplate('Mẫu B');
    const [q] = await withSql(
      (sql) => sql<{ id: string }[]>`
        INSERT INTO quotes (company_id, code, opportunity_id, total_value)
        VALUES (${nvcId}, ${'NVC-BG-MAU2-' + Date.now()}, ${oppId}, 90000000) RETURNING id`,
    );
    draftQuoteId = q!.id;
    expect(await pick(draftQuoteId)).toBe(b);
    expect(await pick(sentQuoteId)).toBe(created[0]);

    // Ngừng dùng cả hai mẫu tải lên → báo giá chưa gửi quay về mẫu DEMO; báo giá đã gửi vẫn mẫu A.
    for (const id of created) {
      const off = await tgd.from('contract_templates').update({ is_active: false }).eq('id', id);
      expect(off.error).toBeNull();
    }
    expect(await pick(draftQuoteId)).toBe(demoId);
    expect(await pick(sentQuoteId)).toBe(created[0]);
  });

  it('trình duyệt không tự đặt mẫu cho báo giá', async () => {
    await kd.from('quotes').update({ template_id: created[1] }).eq('id', draftQuoteId);
    const [row] = await withSql(
      (sql) => sql<{ template_id: string | null }[]>`
        SELECT template_id FROM quotes WHERE id = ${draftQuoteId}`,
    );
    expect(row!.template_id).toBeNull();
  });
});
