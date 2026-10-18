/**
 * Ảnh / tài liệu đính kèm biên bản khảo sát Kinh doanh (0180).
 *
 * Hàng rào phải đứng:
 *  - Người phụ trách cơ hội tải lên được; Thi công cùng pháp nhân và Kinh doanh pháp nhân khác
 *    không thấy dòng, không tải được tệp (ảnh nhà khách là dữ liệu khách hàng).
 *  - Kho chỉ nhận loại tệp đã khai — không nhận tệp chạy được.
 *  - Báo cáo đã gửi duyệt thì không thêm / gỡ đính kèm nữa: Ban Giám đốc duyệt đúng bộ đang thấy.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/survey-attachments.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

describeDb('Đính kèm biên bản khảo sát (0180)', () => {
  let kd: SupabaseClient;
  let kdNvo: SupabaseClient;
  let thiCong: SupabaseClient;
  let surveyId: string;
  let attachmentId: string;
  let attachmentPath: string;

  beforeAll(async () => {
    [kd, kdNvo, thiCong] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.congTruongNvc),
    ]);
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    let opportunityId: string;
    try {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [owner] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      const [customer] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name) VALUES (${'KH-A' + stamp}, ${TEST_PREFIX + ' Khách đính kèm ' + stamp})
        RETURNING id`;
      const [opp] = await sql<{ id: string }[]>`
        INSERT INTO opportunities
          (company_id, code, customer_id, name, stage, classification, project_type, owner_id)
        VALUES (${nvc!.id}, ${'NVC-CH-A' + stamp}, ${customer!.id},
                ${TEST_PREFIX + ' Cơ hội đính kèm ' + stamp}, 'khao_sat', 'M2',
                'Nhà xưởng công nghiệp', ${owner!.id})
        RETURNING id`;
      opportunityId = opp!.id;
    } finally {
      await sql.end();
    }
    const { data, error } = await kd
      .from('site_surveys')
      .insert({ opportunity_id: opportunityId })
      .select('id')
      .single();
    expect(error).toBeNull();
    surveyId = data!.id;
  });

  it('người phụ trách tải ảnh lên; Thi công và pháp nhân khác không thấy dòng, không tải được tệp', async () => {
    attachmentPath = `${surveyId}/${Date.now()}.png`;
    const up = await kd.storage
      .from('survey-files')
      .upload(attachmentPath, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' });
    expect(up.error).toBeNull();
    const row = await kd
      .from('site_survey_attachments')
      .insert({
        survey_id: surveyId,
        storage_path: attachmentPath,
        kind: 'anh',
        file_name: 'mat-bang.png',
        mime_type: 'image/png',
        size_bytes: PNG.length,
      })
      .select('id, company_id')
      .single();
    expect(row.error).toBeNull();
    expect(row.data!.company_id).not.toBeNull();
    attachmentId = row.data!.id;

    for (const outsider of [thiCong, kdNvo]) {
      const { data } = await outsider
        .from('site_survey_attachments')
        .select('id')
        .eq('id', attachmentId);
      expect(data ?? []).toEqual([]);
      const file = await outsider.storage.from('survey-files').download(attachmentPath);
      expect(file.data).toBeNull();
    }

    const own = await kd.storage.from('survey-files').download(attachmentPath);
    expect(own.error).toBeNull();
  });

  it('kho không nhận tệp chạy được', async () => {
    const exe = await kd.storage
      .from('survey-files')
      .upload(`${surveyId}/${Date.now()}.exe`, new Blob([PNG]), {
        contentType: 'application/x-msdownload',
      });
    expect(exe.error).not.toBeNull();
  });

  it('báo cáo đã gửi duyệt thì không thêm, không gỡ đính kèm', async () => {
    expect((await kd.rpc('start_site_survey', { p_survey_id: surveyId })).error).toBeNull();
    expect((await kd.rpc('finish_site_survey', { p_survey_id: surveyId })).error).toBeNull();
    await kd.from('site_surveys').update({ needs: 'Nhà xưởng 1.500 m²' }).eq('id', surveyId);
    expect((await kd.rpc('submit_survey_report', { p_survey_id: surveyId })).error).toBeNull();

    const add = await kd.storage
      .from('survey-files')
      .upload(`${surveyId}/${Date.now()}-sau.png`, new Blob([PNG], { type: 'image/png' }), {
        contentType: 'image/png',
      });
    expect(add.error).not.toBeNull();

    const del = await kd
      .from('site_survey_attachments')
      .delete()
      .eq('id', attachmentId)
      .select('id');
    expect(del.data ?? []).toEqual([]);
    const still = await kd.from('site_survey_attachments').select('id').eq('id', attachmentId);
    expect(still.data).toHaveLength(1);
  });
});
