/**
 * Phụ lục hợp đồng / biên bản thanh lý soạn từ mẫu (0229).
 *
 * Hàng rào phải đứng:
 *  - Phụ lục soạn được khi phát sinh còn «Đề xuất», bởi người sửa được hợp đồng; gửi duyệt rồi thì khoá.
 *  - Biên bản thanh lý chỉ lập cho hợp đồng đã ký.
 *  - Mẫu phải đúng loại văn bản và đúng pháp nhân; bản thứ hai phải ghi lý do.
 *  - Người không xem được hợp đồng (Thi công) không đọc được văn bản.
 *  - Bộ mẫu seed có đủ phụ lục (3 mẫu) và thanh lý cho cả ba pháp nhân.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/hd-phu-luc-thanh-ly.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

const DOCX = new TextEncoder().encode('PK-test');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

describeDb('Phụ lục / biên bản thanh lý từ mẫu (0229)', () => {
  let kd: SupabaseClient;
  let tc: SupabaseClient;
  let signedId = '';
  let draftId = '';
  let amendmentId = '';
  let annexTemplate = '';
  let liquidationTemplate = '';
  let contractTemplate = '';

  beforeAll(async () => {
    [kd, tc] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.congTruongNvc),
    ]);
    await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [owner] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      const contracts = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date, responsible_user_id)
        VALUES
          (${nvc!.id}, ${'NVC-HD-PL-A-' + stamp}, ${TEST_PREFIX + ' Phụ lục đã ký ' + stamp}, 'thi_cong', 'da_ky',
           1000000000, current_date - 30, ${owner!.id}),
          (${nvc!.id}, ${'NVC-HD-PL-B-' + stamp}, ${TEST_PREFIX + ' Phụ lục nháp ' + stamp}, 'thi_cong', 'nhap',
           1000000000, NULL, ${owner!.id})
        RETURNING id`;
      signedId = contracts[0]!.id;
      draftId = contracts[1]!.id;
      const [a] = await sql<{ id: string }[]>`
        INSERT INTO contract_amendments (company_id, contract_id, title, content, reason, value_change, requested_by)
        VALUES (${nvc!.id}, ${signedId}, ${TEST_PREFIX + ' Phát sinh móng'}, 'Thêm 20 m3 bê tông móng',
                'Địa chất khác khảo sát', 60000000, ${owner!.id})
        RETURNING id`;
      amendmentId = a!.id;
      const pick = async (kind: string) => {
        const [t] = await sql<{ id: string }[]>`
          SELECT id FROM contract_templates
           WHERE company_id = ${nvc!.id} AND document_kind = ${kind} AND is_active
           ORDER BY title LIMIT 1`;
        return t!.id;
      };
      annexTemplate = await pick('phu_luc');
      liquidationTemplate = await pick('thanh_ly');
      contractTemplate = await pick('hop_dong');
    });
  });

  afterAll(async () => {
    await withSql((sql) => sql`DELETE FROM contracts WHERE id IN (${signedId}, ${draftId})`);
  });

  async function save(
    contractId: string,
    kind: 'phu_luc' | 'thanh_ly',
    templateId: string,
    changeReason: string | null = null,
  ) {
    const prefix = kind === 'phu_luc' ? 'phu-luc' : 'thanh-ly';
    const path = `${contractId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.docx`;
    const up = await kd.storage
      .from('contract-documents')
      .upload(path, new Blob([DOCX], { type: DOCX_MIME }), { contentType: DOCX_MIME });
    return kd
      .from('contract_annex_documents')
      .insert({
        contract_id: contractId,
        company_id: '00000000-0000-0000-0000-000000000000',
        kind,
        amendment_id: kind === 'phu_luc' ? amendmentId : null,
        template_id: templateId,
        storage_path: path,
        file_name: `${prefix}.docx`,
        change_reason: changeReason,
      })
      .select('id, version, company_id')
      .single()
      .then((r) => ({ ...r, uploadError: up.error }));
  }

  it('bộ mẫu seed có 3 mẫu phụ lục và 1 mẫu thanh lý cho mỗi pháp nhân', async () => {
    const rows = await withSql(
      (sql) => sql<{ code: string; document_kind: string; n: number }[]>`
        SELECT c.code, t.document_kind, count(*)::int AS n FROM contract_templates t
          JOIN companies c ON c.id = t.company_id
         WHERE t.is_active AND t.document_kind <> 'hop_dong'
         GROUP BY 1, 2 ORDER BY 1, 2`,
    );
    for (const code of ['NVC', 'NVO', 'NVS']) {
      expect(rows.find((r) => r.code === code && r.document_kind === 'phu_luc')?.n).toBe(3);
      expect(rows.find((r) => r.code === code && r.document_kind === 'thanh_ly')?.n).toBe(1);
    }
  });

  it('phụ lục còn Đề xuất: người chịu trách nhiệm lưu được; bản 2 phải có lý do; Thi công không đọc được', async () => {
    const first = await save(signedId, 'phu_luc', annexTemplate);
    expect(first.uploadError).toBeNull();
    expect(first.error).toBeNull();
    expect(first.data!.version).toBe(1);
    expect(first.data!.company_id).not.toBe('00000000-0000-0000-0000-000000000000');

    const noReason = await save(signedId, 'phu_luc', annexTemplate);
    expect(noReason.error?.message).toMatch(/nguyên nhân lập lại/);
    const second = await save(
      signedId,
      'phu_luc',
      annexTemplate,
      'Sửa khối lượng theo biên bản hiện trường',
    );
    expect(second.data!.version).toBe(2);

    const { data } = await tc
      .from('contract_annex_documents')
      .select('id')
      .eq('contract_id', signedId);
    expect(data ?? []).toEqual([]);
  });

  it('mẫu sai loại văn bản bị từ chối', async () => {
    const wrong = await save(signedId, 'phu_luc', contractTemplate, 'thử mẫu hợp đồng');
    expect(wrong.error?.message).toMatch(/không phải mẫu phụ lục/);
  });

  it('phụ lục đã gửi phê duyệt thì khoá văn bản', async () => {
    await withSql(
      (sql) => sql`UPDATE contract_amendments SET stage = 'cho_duyet' WHERE id = ${amendmentId}`,
    );
    const locked = await save(signedId, 'phu_luc', annexTemplate, 'sau khi gửi duyệt');
    expect(locked.error?.message).toMatch(/đã gửi phê duyệt/);
  });

  it('thanh lý: lập được cho hợp đồng đã ký, không lập cho hợp đồng nháp', async () => {
    const ok = await save(signedId, 'thanh_ly', liquidationTemplate);
    expect(ok.error).toBeNull();
    expect(ok.data!.version).toBe(1);
    const draft = await save(draftId, 'thanh_ly', liquidationTemplate);
    expect(draft.error?.message).toMatch(/hợp đồng đã ký/);
  });
});
