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

describeDb('Hợp đồng gửi phê duyệt kèm văn bản (0176)', () => {
  let kd: SupabaseClient;
  let tgd: SupabaseClient;
  let nvcId: string;
  let contractId: string;

  beforeAll(async () => {
    [kd, tgd] = await Promise.all([signInAs(ACCOUNTS.kinhDoanhNvc), signInAs(ACCOUNTS.tgd)]);
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      nvcId = nvc!.id;
      const [owner] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      // Hình thức giá riêng của phép thử: mẫu và hợp đồng khớp nhau, không đụng mẫu thật trên máy.
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, price_form, responsible_user_id)
        VALUES (${nvcId}, ${'NVC-HD-VB-' + stamp}, ${TEST_PREFIX + ' Kèm văn bản ' + stamp},
                'thi_cong', 'nhap', 2000000000, 'theo_ket_qua_dau_ra', ${owner!.id})
        RETURNING id`;
      contractId = c!.id;
      for (const t of ['pham_vi', 'gia_tri', 'tien_do_thanh_toan']) {
        await sql`INSERT INTO contract_terms (company_id, contract_id, term_type, description)
                  VALUES (${nvcId}, ${contractId}, ${t}::contract_term_type, ${TEST_PREFIX + ' ' + t})`;
      }
    } finally {
      await sql.end();
    }
    const path = `${nvcId}/${crypto.randomUUID()}.docx`;
    await uploadTo(tgd, 'contract-templates', path);
    const tpl = await tgd.from('contract_templates').insert({
      company_id: nvcId,
      title: `${TEST_PREFIX} Mẫu theo kết quả đầu ra`,
      contract_type: 'thi_cong',
      price_form: 'theo_ket_qua_dau_ra',
      storage_path: path,
      file_name: 'mau.docx',
      tags: {},
    });
    expect(tpl.error).toBeNull();
  });

  async function saveDoc(reason: string | null = null) {
    const path = `${contractId}/${crypto.randomUUID()}.docx`;
    await uploadTo(kd, 'contract-documents', path);
    return kd
      .from('contract_documents')
      .insert({
        contract_id: contractId,
        storage_path: path,
        file_name: 'hop-dong.docx',
        filled_values: {},
        change_reason: reason,
      })
      .select('id, version')
      .single();
  }

  it('có mẫu thì chưa lập văn bản không gửi được; điều kiện hiện trước khi bấm', async () => {
    const { data: ready } = await kd.rpc('stage_readiness', {
      p_entity_type: 'contract',
      p_id: contractId,
    });
    const doc = (ready as { requirement: string; met: boolean }[]).find(
      (r) => r.requirement === 'document_ready',
    );
    expect(doc).toMatchObject({ met: false });
    const blocked = await kd.rpc('submit_contract_approval', { p_contract_id: contractId });
    expect(blocked.error?.message).toMatch(/Lập văn bản/);
  });

  it('lập văn bản rồi gửi: ghi bản đang gửi, khoá lập bản mới; duyệt thì thành bản đã duyệt', async () => {
    const first = await saveDoc();
    expect(first.error).toBeNull();
    const sent = await kd.rpc('submit_contract_approval', { p_contract_id: contractId });
    expect(sent.error).toBeNull();

    const { data: c1 } = await kd
      .from('contracts')
      .select('stage, submitted_document_id, approved_document_id')
      .eq('id', contractId)
      .single();
    expect(c1).toMatchObject({
      stage: 'cho_duyet',
      submitted_document_id: first.data!.id,
      approved_document_id: null,
    });

    const locked = await saveDoc('Sửa giá');
    expect(locked.error?.message).toMatch(/chờ duyệt/);

    // Không tự khai được bản đã duyệt.
    await kd
      .from('contracts')
      .update({ approved_document_id: first.data!.id })
      .eq('id', contractId);

    await tgd.rpc('decide_approval', {
      p_approval_id: sent.data as string,
      p_decision: 'approved',
    });
    const { data: c2 } = await kd
      .from('contracts')
      .select('stage, approved_document_id')
      .eq('id', contractId)
      .single();
    expect(c2).toMatchObject({ stage: 'da_duyet', approved_document_id: first.data!.id });
  });
});

describeDb('Bộ mẫu hợp đồng ba pháp nhân và loại hợp đồng mới (0185)', () => {
  it('seed nạp bộ mẫu cho từng pháp nhân, có cây chỗ trống và các đợt gợi ý', async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const rows = await sql<{ code: string; n: number }[]>`
        SELECT c.code, count(*)::int AS n FROM contract_templates t
        JOIN companies c ON c.id = t.company_id
        WHERE t.is_active AND t.notes LIKE 'Bộ mẫu dự thảo NVG%'
        GROUP BY c.code ORDER BY c.code`;
      expect(Object.fromEntries(rows.map((r) => [r.code, r.n]))).toEqual({
        NVC: 8,
        NVO: 7,
        NVS: 6,
      });
      const [nvo] = await sql<{ tags: Record<string, unknown>; payment_milestones: unknown[] }[]>`
        SELECT tags, payment_milestones FROM contract_templates
        WHERE is_active AND title LIKE 'NVO-HĐ-02%'`;
      expect(nvo!.tags).toHaveProperty('nvg_ten');
      expect(nvo!.tags).toHaveProperty('dot_thanh_toan');
      expect(nvo!.payment_milestones.length).toBeGreaterThan(3);
    } finally {
      await sql.end();
    }
  });

  it('hợp đồng mua vật tư / thuê thiết bị / cho thuê không mở công trình', async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    const stamp = String(Date.now());
    const created: string[] = [];
    try {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      for (const type of ['mua_vat_tu', 'thue_thiet_bi', 'cho_thue', 'thi_cong']) {
        const [c] = await sql<{ id: string }[]>`
          INSERT INTO contracts (company_id, code, title, type, stage, value)
          VALUES (${nvc!.id}, ${`NVC-HD-LOAI-${type}-${stamp}`}, ${`${TEST_PREFIX} ${type} ${stamp}`},
                  ${type}::contract_type, 'da_ky', 100000000)
          RETURNING id`;
        created.push(c!.id);
        const insert = sql`
          INSERT INTO construction_sites (company_id, code, name, contract_id)
          VALUES (${nvc!.id}, ${`NVC-CT-LOAI-${type}-${stamp}`}, ${`${TEST_PREFIX} ${type}`}, ${c!.id})`;
        if (type === 'thi_cong') await expect(insert).resolves.toBeDefined();
        else await expect(insert).rejects.toThrow(/không mở/);
      }
    } finally {
      await sql`DELETE FROM construction_sites WHERE contract_id = ANY(${created})`;
      await sql`DELETE FROM contracts WHERE id = ANY(${created})`;
      await sql.end();
    }
  });
});

describeDb('Nội dung riêng của văn bản hợp đồng (0186)', () => {
  it('người soạn lưu được; pháp nhân do CSDL đặt; người pháp nhân khác không đọc, không ghi', async () => {
    const fx = await seedFixture();
    const [kd, kdNvo] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
    ]);
    const save = (client: SupabaseClient, values: Record<string, string>) =>
      client
        .from('contract_document_inputs')
        .upsert(
          { contract_id: fx.draftId, company_id: fx.nvoId, values },
          { onConflict: 'contract_id' },
        )
        .select('company_id, values')
        .maybeSingle();

    const first = await save(kd, { so_hop_dong: '01/2026', 'tpl:o_1': 'Hà Nội' });
    expect(first.error).toBeNull();
    // Gửi nhầm pháp nhân NVO — CSDL đặt lại theo hợp đồng NVC.
    expect(first.data!.company_id).toBe(fx.nvcId);
    expect((await save(kd, { 'tpl:o_1': 'Hưng Yên' })).data!.values).toEqual({
      'tpl:o_1': 'Hưng Yên',
    });

    const { data: seen } = await kdNvo
      .from('contract_document_inputs')
      .select('values')
      .eq('contract_id', fx.draftId);
    expect(seen ?? []).toEqual([]);
    expect((await save(kdNvo, { 'tpl:o_1': 'chen' })).error).not.toBeNull();
  });

  it('hợp đồng đã quyết toán thì không ghi nội dung văn bản nữa', async () => {
    const fx = await seedFixture();
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      await sql`UPDATE contracts SET stage = 'hoan_thanh' WHERE id = ${fx.signedId}`;
    } finally {
      await sql.end();
    }
    const { error } = await kd
      .from('contract_document_inputs')
      .insert({ contract_id: fx.signedId, company_id: fx.nvcId, values: {} });
    expect(error).not.toBeNull();
  });
});
