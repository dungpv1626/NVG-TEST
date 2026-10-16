/**
 * Mẫu hợp đồng Word và văn bản đã điền (migration 0171).
 *
 * Ba hàng rào phải đứng:
 *  - Mẫu: chỉ người có quyền phê duyệt HD / Quản trị tải lên; Kiểm soát nội bộ xem, không ghi;
 *    Thi công không xem Module Hợp đồng nên không thấy mẫu. Tệp của mẫu không đổi được.
 *  - Văn bản: theo đúng quyền của hợp đồng (người chịu trách nhiệm soạn); đánh số phiên bản,
 *    bản sau phải có lý do; bất biến; hợp đồng đã ký thì khoá.
 *  - Tệp trong kho đi theo thư mục đầu — cùng hàm quyền với bảng.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/hd-template.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  hasCredentials,
  PG_INSUFFICIENT_PRIVILEGE,
  signInAs,
  TEST_PREFIX,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface Fixture {
  nvcId: string;
  nvoId: string;
  draftId: string;
  signedId: string;
}

async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const stamp = String(Date.now());
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const [kd] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, stage, value, responsible_user_id)
      VALUES
        (${nvc!.id}, ${'NVC-HD-MAU-A-' + stamp}, ${TEST_PREFIX + ' Văn bản nháp ' + stamp},
         'thi_cong', 'nhap', 1100000000, ${kd!.id}),
        (${nvc!.id}, ${'NVC-HD-MAU-B-' + stamp}, ${TEST_PREFIX + ' Văn bản đã ký ' + stamp},
         'thi_cong', 'da_ky', 1100000000, ${kd!.id})
      RETURNING id`;
    return { nvcId: nvc!.id, nvoId: nvo!.id, draftId: rows[0]!.id, signedId: rows[1]!.id };
  } finally {
    await sql.end();
  }
}

const file = () => new Blob([new Uint8Array([80, 75, 3, 4])], { type: DOCX });

async function uploadTo(client: SupabaseClient, bucket: string, path: string) {
  return client.storage.from(bucket).upload(path, file(), { contentType: DOCX });
}

describeDb('Mẫu hợp đồng và văn bản đã điền (0171)', () => {
  let fx: Fixture;
  let tgd: SupabaseClient;
  let kd: SupabaseClient;
  let kdNvo: SupabaseClient;
  let ksnb: SupabaseClient;
  let thiCong: SupabaseClient;
  let templateId: string;

  beforeAll(async () => {
    fx = await seedFixture();
    [tgd, kd, kdNvo, ksnb, thiCong] = await Promise.all([
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.ksnb),
      signInAs(ACCOUNTS.congTruongNvc),
    ]);
  });

  describe('mẫu', () => {
    it('Ban Giám đốc tải mẫu lên đúng thư mục pháp nhân', async () => {
      const path = `${fx.nvcId}/${crypto.randomUUID()}.docx`;
      expect((await uploadTo(tgd, 'contract-templates', path)).error).toBeNull();
      const { data, error } = await tgd
        .from('contract_templates')
        .insert({
          company_id: fx.nvcId,
          title: `${TEST_PREFIX} Mẫu thi công trọn gói`,
          contract_type: 'thi_cong',
          price_form: 'tron_goi',
          storage_path: path,
          file_name: 'mau.docx',
          tags: { ten_hop_dong: {} },
        })
        .select('id, created_by')
        .single();
      expect(error).toBeNull();
      expect(data!.created_by).toBeTruthy();
      templateId = data!.id as string;
    });

    it('Kinh doanh không tải mẫu lên được — cả tệp lẫn dòng', async () => {
      const path = `${fx.nvcId}/${crypto.randomUUID()}.docx`;
      expect((await uploadTo(kd, 'contract-templates', path)).error).not.toBeNull();
      const { error } = await kd.from('contract_templates').insert({
        company_id: fx.nvcId,
        title: `${TEST_PREFIX} Mẫu của Kinh doanh`,
        contract_type: 'thi_cong',
        storage_path: path,
        file_name: 'mau.docx',
      });
      expect(error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('Kiểm soát nội bộ xem được mẫu, không tạo được', async () => {
      const { data } = await ksnb.from('contract_templates').select('id').eq('id', templateId);
      expect(data).toHaveLength(1);
      const { error } = await ksnb.from('contract_templates').insert({
        company_id: fx.nvcId,
        title: `${TEST_PREFIX} Mẫu của KSNB`,
        contract_type: 'thi_cong',
        storage_path: `${fx.nvcId}/x.docx`,
        file_name: 'x.docx',
      });
      expect(error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('Thi công không xem Module Hợp đồng nên không thấy mẫu', async () => {
      const { data } = await thiCong.from('contract_templates').select('id').eq('id', templateId);
      expect(data).toEqual([]);
    });

    it('đường dẫn tệp phải nằm trong thư mục của chính pháp nhân', async () => {
      const { error } = await tgd.from('contract_templates').insert({
        company_id: fx.nvcId,
        title: `${TEST_PREFIX} Mẫu sai thư mục`,
        contract_type: 'thi_cong',
        storage_path: `${fx.nvoId}/${crypto.randomUUID()}.docx`,
        file_name: 'mau.docx',
      });
      expect(error).not.toBeNull();
    });

    it('không đổi được tệp của mẫu; ngừng dùng thì được', async () => {
      const bad = await tgd
        .from('contract_templates')
        .update({ storage_path: `${fx.nvcId}/khac.docx` })
        .eq('id', templateId)
        .select('id');
      expect(bad.error?.message).toMatch(/Không sửa được tệp/);
      const ok = await tgd
        .from('contract_templates')
        .update({ is_active: false })
        .eq('id', templateId)
        .select('id')
        .single();
      expect(ok.error).toBeNull();
      await tgd.from('contract_templates').update({ is_active: true }).eq('id', templateId);
    });
  });

  describe('văn bản đã điền', () => {
    async function saveDocument(
      client: SupabaseClient,
      contractId: string,
      changeReason: string | null = null,
    ) {
      const path = `${contractId}/${crypto.randomUUID()}.docx`;
      const up = await uploadTo(client, 'contract-documents', path);
      const row = await client
        .from('contract_documents')
        .insert({
          contract_id: contractId,
          // Pháp nhân do CSDL đặt theo hợp đồng — gửi sai cũng không lọt.
          company_id: fx.nvoId,
          template_id: templateId,
          storage_path: path,
          file_name: 'hop-dong.docx',
          filled_values: { ten_hop_dong: 'x' },
          change_reason: changeReason,
        })
        .select('id, version, company_id')
        .single();
      return { up, row, path };
    }

    it('người chịu trách nhiệm lưu bản 1; bản 2 phải có lý do', async () => {
      const first = await saveDocument(kd, fx.draftId);
      expect(first.up.error).toBeNull();
      expect(first.row.error).toBeNull();
      expect(first.row.data).toMatchObject({ version: 1, company_id: fx.nvcId });

      const noReason = await saveDocument(kd, fx.draftId);
      expect(noReason.row.error?.message).toMatch(/nguyên nhân/);

      const second = await saveDocument(kd, fx.draftId, 'Sửa địa điểm thực hiện');
      expect(second.row.error).toBeNull();
      expect(second.row.data!.version).toBe(2);
    });

    it('văn bản bất biến — không sửa, không xoá', async () => {
      const upd = await kd
        .from('contract_documents')
        .update({ file_name: 'khac.docx' })
        .eq('contract_id', fx.draftId)
        .select('id');
      expect(upd.data ?? []).toEqual([]);
      await kd.from('contract_documents').delete().eq('contract_id', fx.draftId);
      const { data } = await kd
        .from('contract_documents')
        .select('id')
        .eq('contract_id', fx.draftId);
      expect(data).toHaveLength(2);
    });

    it('hợp đồng đã ký thì khoá, không lập thêm bản điền', async () => {
      const { row } = await saveDocument(kd, fx.signedId);
      expect(row.error?.message).toMatch(/đã ký/);
    });

    it('Kinh doanh pháp nhân khác không lưu được, Thi công không đọc được', async () => {
      const other = await saveDocument(kdNvo, fx.draftId);
      expect(other.up.error).not.toBeNull();
      expect(other.row.error).not.toBeNull();

      const { data } = await thiCong
        .from('contract_documents')
        .select('id')
        .eq('contract_id', fx.draftId);
      expect(data).toEqual([]);
      const { data: own } = await kd
        .from('contract_documents')
        .select('storage_path')
        .eq('contract_id', fx.draftId)
        .limit(1)
        .single();
      const dl = await thiCong.storage.from('contract-documents').download(own!.storage_path);
      expect(dl.data).toBeNull();
      const ownDl = await ksnb.storage.from('contract-documents').download(own!.storage_path);
      expect(ownDl.error).toBeNull();
    });
  });
});
