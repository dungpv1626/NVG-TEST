/**
 * Bộ biểu mẫu hồ sơ dự thầu tự điền (migration 0236).
 *
 * Hàng rào phải đứng:
 *  1. Mẫu hồ sơ dự thầu nằm ở `contract_templates` nhưng ĐỌC theo phân hệ DA: Đấu thầu đọc được dòng và tệp mẫu;
 *     Thi công (không HD, không DA) không thấy.
 *  2. Văn bản đã điền: Đấu thầu lập được bản 1; bản 2 thiếu lý do bị chặn; số bản tự đánh; bất biến.
 *  3. Người không xem được gói thầu (Thi công, Kinh doanh) không đọc được văn bản lẫn tệp.
 *  4. Tệp phải nằm trong thư mục của chính gói thầu, đúng tiền tố loại văn bản.
 *  5. Gói đã nộp thì không lập hồ sơ dự thầu mới; biên bản thương thảo chỉ khi đã trúng thầu.
 *  6. Nháp ô đang điền lưu theo gói thầu, cùng quyền.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/da-ho-so-du-thau.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BUCKET = 'bid-documents';

async function sqlRun<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const file = () => new Blob([new Uint8Array([80, 75, 3, 4])], { type: DOCX });

async function upload(client: SupabaseClient, path: string) {
  return client.storage.from(BUCKET).upload(path, file(), { contentType: DOCX });
}

describeDb('Hồ sơ dự thầu soạn từ mẫu (0236)', () => {
  let da: SupabaseClient;
  let kd: SupabaseClient;
  let thiCong: SupabaseClient;
  let nvc: string;
  let bidId: string;
  let otherBidId: string;
  let templateId: string;
  let templatePath: string;
  let firstPath: string;

  beforeAll(async () => {
    [da, kd, thiCong] = await Promise.all([
      signInAs(ACCOUNTS.dauThauNvc),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.congTruongNvc),
    ]);
    nvc = (await da.from('companies').select('id').eq('code', 'NVC').single()).data!.id;
    const me = (await da.rpc('auth_user_id')).data as string;
    const make = async (suffix: string) => {
      const bid = await da
        .from('bidding_projects')
        .insert({
          company_id: nvc,
          code: `NVC-GT-DT01-${suffix}-${Math.floor(Math.random() * 900000 + 100000)}`,
          name: `${TEST_PREFIX} Gói thầu hồ sơ dự thầu từ mẫu ${suffix}`,
          responsible_user_id: me,
        })
        .select('id')
        .single();
      if (bid.error) throw new Error(bid.error.message);
      return bid.data.id as string;
    };
    bidId = await make('A');
    otherBidId = await make('B');
    // Mẫu do seed nạp (convert_bid.py); phép thử không tự tải mẫu lên — quyền tải mẫu là của 0171.
    const tpl = await sqlRun(
      (sql) => sql<{ id: string; storage_path: string }[]>`
        SELECT id, storage_path FROM contract_templates
         WHERE company_id = ${nvc} AND document_kind = 'ho_so_du_thau' AND is_active
         ORDER BY created_at DESC LIMIT 1`,
    );
    if (!tpl[0]) throw new Error('Chưa có mẫu hồ sơ dự thầu — chạy `npm run db:seed` trước.');
    templateId = tpl[0].id;
    templatePath = tpl[0].storage_path;
  });

  afterAll(async () => {
    await sqlRun(async (sql) => {
      await sql`DELETE FROM notifications WHERE related_entity_id IN ${sql([bidId, otherBidId])}`;
      await sql`DELETE FROM bidding_projects WHERE id IN ${sql([bidId, otherBidId])}`;
    });
  });

  describe('mẫu', () => {
    it('Đấu thầu đọc được dòng mẫu và tải được tệp mẫu', async () => {
      const { data } = await da.from('contract_templates').select('id').eq('id', templateId);
      expect(data).toHaveLength(1);
      const dl = await da.storage.from('contract-templates').download(templatePath);
      expect(dl.error).toBeNull();
    });

    it('Thi công không thấy mẫu, không tải được tệp mẫu', async () => {
      const { data } = await thiCong.from('contract_templates').select('id').eq('id', templateId);
      expect(data).toEqual([]);
      const dl = await thiCong.storage.from('contract-templates').download(templatePath);
      expect(dl.error).not.toBeNull();
    });
  });

  describe('văn bản đã điền', () => {
    it('Đấu thầu lập được bản 1 — số bản do máy đánh, người lập do máy ghi', async () => {
      firstPath = `${bidId}/ho-so-du-thau-${crypto.randomUUID()}.docx`;
      expect((await upload(da, firstPath)).error).toBeNull();
      const { data, error } = await da
        .from('bid_form_documents')
        .insert({
          bidding_project_id: bidId,
          company_id: nvc,
          kind: 'ho_so_du_thau',
          template_id: templateId,
          storage_path: firstPath,
          file_name: 'ho-so.docx',
          filled_values: { ten_goi_thau: 'Thử' },
          missing_fields: ['Tổng giá dự thầu'],
          version: 99,
        })
        .select('version, created_by')
        .single();
      expect(error).toBeNull();
      expect(data!.version).toBe(1);
      expect(data!.created_by).toBeTruthy();
    });

    it('bản 2 thiếu lý do bị chặn; có lý do thì thành bản 2', async () => {
      const path = `${bidId}/ho-so-du-thau-${crypto.randomUUID()}.docx`;
      expect((await upload(da, path)).error).toBeNull();
      const row = {
        bidding_project_id: bidId,
        company_id: nvc,
        kind: 'ho_so_du_thau',
        template_id: templateId,
        storage_path: path,
        file_name: 'ho-so-2.docx',
      };
      const bad = await da.from('bid_form_documents').insert(row);
      expect(bad.error?.message).toMatch(/nguyên nhân/);
      const ok = await da
        .from('bid_form_documents')
        .insert({ ...row, change_reason: 'Bổ sung giảm giá' })
        .select('version')
        .single();
      expect(ok.error).toBeNull();
      expect(ok.data!.version).toBe(2);
    });

    it('văn bản đã lưu không sửa, không xoá được', async () => {
      await da
        .from('bid_form_documents')
        .update({ file_name: 'sua.docx' })
        .eq('bidding_project_id', bidId);
      await da.from('bid_form_documents').delete().eq('bidding_project_id', bidId);
      const rows = await sqlRun(
        (sql) => sql<{ file_name: string }[]>`
          SELECT file_name FROM bid_form_documents WHERE bidding_project_id = ${bidId} ORDER BY version`,
      );
      expect(rows.map((r) => r.file_name)).toEqual(['ho-so.docx', 'ho-so-2.docx']);
    });

    it('Thi công và Kinh doanh không đọc được văn bản lẫn tệp, không lập được', async () => {
      for (const client of [thiCong, kd]) {
        const { data } = await client
          .from('bid_form_documents')
          .select('id')
          .eq('bidding_project_id', bidId);
        expect(data).toEqual([]);
        expect((await client.storage.from(BUCKET).download(firstPath)).error).not.toBeNull();
        const path = `${bidId}/ho-so-du-thau-${crypto.randomUUID()}.docx`;
        expect((await upload(client, path)).error).not.toBeNull();
      }
      expect((await da.storage.from(BUCKET).download(firstPath)).error).toBeNull();
    });

    it('tệp sai thư mục / sai tiền tố bị chặn; dòng trỏ vào thư mục gói khác bị chặn', async () => {
      // Không có thư mục gói thầu.
      expect((await upload(da, `ho-so-du-thau-${crypto.randomUUID()}.docx`)).error).not.toBeNull();
      // Thư mục đúng mà tên không mang loại văn bản.
      expect((await upload(da, `${bidId}/${crypto.randomUUID()}.docx`)).error).not.toBeNull();
      // Tệp của gói B gắn vào dòng của gói A.
      const otherPath = `${otherBidId}/ho-so-du-thau-${crypto.randomUUID()}.docx`;
      expect((await upload(da, otherPath)).error).toBeNull();
      const { error } = await da.from('bid_form_documents').insert({
        bidding_project_id: bidId,
        company_id: nvc,
        kind: 'ho_so_du_thau',
        template_id: templateId,
        storage_path: otherPath,
        file_name: 'lac.docx',
        change_reason: 'Thử',
      });
      expect(error).not.toBeNull();
    });

    it('biên bản thương thảo chỉ lập khi đã trúng thầu', async () => {
      const path = `${bidId}/thuong-thao-${crypto.randomUUID()}.docx`;
      expect((await upload(da, path)).error).not.toBeNull();
      const { error } = await da.from('bid_form_documents').insert({
        bidding_project_id: bidId,
        company_id: nvc,
        kind: 'thuong_thao',
        storage_path: path,
        file_name: 'tt.docx',
      });
      expect(error).not.toBeNull();
    });
  });

  describe('nháp ô đang điền', () => {
    it('Đấu thầu lưu dần theo gói thầu; Thi công không đọc, không ghi', async () => {
      const values = { ten_du_an: 'Nhà xưởng thử', tables: { thiet_bi: [{ ten: 'Cẩu 25 tấn' }] } };
      const up = await da
        .from('bid_form_inputs')
        .upsert(
          { bidding_project_id: bidId, company_id: nvc, kind: 'ho_so_du_thau', values },
          { onConflict: 'bidding_project_id,kind' },
        );
      expect(up.error).toBeNull();
      const again = await da.from('bid_form_inputs').upsert(
        {
          bidding_project_id: bidId,
          company_id: nvc,
          kind: 'ho_so_du_thau',
          values: { ...values, noi_lap: 'Hưng Yên' },
        },
        { onConflict: 'bidding_project_id,kind' },
      );
      expect(again.error).toBeNull();
      const { data } = await da
        .from('bid_form_inputs')
        .select('values')
        .eq('bidding_project_id', bidId)
        .single();
      expect((data!.values as { noi_lap: string }).noi_lap).toBe('Hưng Yên');

      const seen = await thiCong
        .from('bid_form_inputs')
        .select('values')
        .eq('bidding_project_id', bidId);
      expect(seen.data).toEqual([]);
      const write = await thiCong.from('bid_form_inputs').insert({
        bidding_project_id: otherBidId,
        company_id: nvc,
        kind: 'ho_so_du_thau',
        values: {},
      });
      expect(write.error).not.toBeNull();
    });
  });

  describe('sau khi nộp thầu', () => {
    beforeAll(async () => {
      await sqlRun(
        (sql) =>
          sql`UPDATE bidding_projects SET submitted_at = now(), stage = 'nop_thau' WHERE id = ${bidId}`,
      );
    });

    it('không lập hồ sơ dự thầu mới — kể cả khi tệp đã lên kho từ trước', async () => {
      expect(
        (await upload(da, `${bidId}/ho-so-du-thau-${crypto.randomUUID()}.docx`)).error,
      ).not.toBeNull();
      // Tệp có sẵn (đặt bằng quyền máy chủ) vẫn không thành văn bản: trigger chặn theo bước của gói.
      const path = `${bidId}/ho-so-du-thau-${crypto.randomUUID()}.docx`;
      await sqlRun(
        (sql) => sql`INSERT INTO storage.objects (bucket_id, name) VALUES (${BUCKET}, ${path})`,
      );
      const { error } = await da.from('bid_form_documents').insert({
        bidding_project_id: bidId,
        company_id: nvc,
        kind: 'ho_so_du_thau',
        template_id: templateId,
        storage_path: path,
        file_name: 'sau-nop.docx',
        change_reason: 'Thử sau khi nộp',
      });
      expect(error).not.toBeNull();
      // Bản đã lưu vẫn đọc được: bộ đã nộp phải còn nguyên.
      const { data } = await da
        .from('bid_form_documents')
        .select('version')
        .eq('bidding_project_id', bidId);
      expect(data).toHaveLength(2);
    });

    it('nháp hồ sơ dự thầu cũng khoá', async () => {
      await da
        .from('bid_form_inputs')
        .update({ values: { noi_lap: 'Sau nộp' } })
        .eq('bidding_project_id', bidId)
        .eq('kind', 'ho_so_du_thau');
      const rows = await sqlRun(
        (sql) => sql<{ values: { noi_lap: string } }[]>`
          SELECT "values" FROM bid_form_inputs WHERE bidding_project_id = ${bidId} AND kind = 'ho_so_du_thau'`,
      );
      expect(rows[0]!.values.noi_lap).toBe('Hưng Yên');
    });

    it('trúng thầu thì lập được biên bản thương thảo', async () => {
      await sqlRun(
        (sql) => sql`UPDATE bidding_projects SET stage = 'trung_thau' WHERE id = ${bidId}`,
      );
      const path = `${bidId}/thuong-thao-${crypto.randomUUID()}.docx`;
      expect((await upload(da, path)).error).toBeNull();
      const { data, error } = await da
        .from('bid_form_documents')
        .insert({
          bidding_project_id: bidId,
          company_id: nvc,
          kind: 'thuong_thao',
          storage_path: path,
          file_name: 'tt.docx',
        })
        .select('version')
        .single();
      expect(error).toBeNull();
      expect(data!.version).toBe(1);
    });
  });
});
