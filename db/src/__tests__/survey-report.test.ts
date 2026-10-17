/**
 * Khảo sát → ghi âm → báo cáo → Ban Giám đốc duyệt (Đợt 1 — 1D; migration 0174, 0175).
 *
 * Hàng rào phải đứng:
 *  - Máy ghi giờ bắt đầu / kết thúc; người dùng không tự đặt trạng thái báo cáo hay giờ.
 *  - Ghi âm: người phụ trách ghi được, người khác (pháp nhân khác, phân hệ khác) không đọc được.
 *  - Gửi báo cáo cần đã khảo sát + có nhu cầu; đang chờ / đã duyệt thì khoá sửa.
 *  - Chưa duyệt thì KHÔNG sang Báo giá; Kinh doanh không tự duyệt; trả về phải có ý kiến;
 *    duyệt xong thì cơ hội tự sang Báo giá.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/survey-report.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('Báo cáo khảo sát — Ban Giám đốc duyệt (0175)', () => {
  let kd: SupabaseClient;
  let kdNvo: SupabaseClient;
  let tgd: SupabaseClient;
  let thiCong: SupabaseClient;
  let opportunityId: string;
  let surveyId: string;

  beforeAll(async () => {
    [kd, kdNvo, tgd, thiCong] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.congTruongNvc),
    ]);
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [owner] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      const [customer] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name) VALUES (${'KH-T' + stamp}, ${TEST_PREFIX + ' Khách khảo sát ' + stamp})
        RETURNING id`;
      const [opp] = await sql<{ id: string }[]>`
        INSERT INTO opportunities
          (company_id, code, customer_id, name, stage, classification, project_type, owner_id)
        VALUES (${nvc!.id}, ${'NVC-CH-T' + stamp}, ${customer!.id},
                ${TEST_PREFIX + ' Cơ hội khảo sát ' + stamp}, 'khao_sat', 'M2',
                'Nhà xưởng công nghiệp', ${owner!.id})
        RETURNING id`;
      opportunityId = opp!.id;
    } finally {
      await sql.end();
    }
    const { data, error } = await kd
      .from('site_surveys')
      .insert({
        opportunity_id: opportunityId,
        report_status: 'da_duyet',
        started_at: new Date().toISOString(),
      })
      .select('id, report_status, started_at')
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ report_status: 'nhap', started_at: null });
    surveyId = data!.id;
  });

  it('máy ghi giờ: kết thúc trước khi bắt đầu bị chặn; kết thúc ghi luôn thời điểm khảo sát', async () => {
    const early = await kd.rpc('finish_site_survey', { p_survey_id: surveyId });
    expect(early.error).not.toBeNull();
    const other = await kdNvo.rpc('start_site_survey', { p_survey_id: surveyId });
    expect(other.error).not.toBeNull();

    const start = await kd.rpc('start_site_survey', { p_survey_id: surveyId });
    expect(start.error).toBeNull();
    const finish = await kd.rpc('finish_site_survey', { p_survey_id: surveyId });
    expect(finish.error).toBeNull();

    const { data } = await kd
      .from('site_surveys')
      .select('started_at, finished_at, surveyed_at')
      .eq('id', surveyId)
      .single();
    expect(data!.started_at).not.toBeNull();
    expect(data!.surveyed_at).toBe(data!.finished_at);

    // Giờ khảo sát không sửa tay được nữa; trạng thái báo cáo cũng không tự đặt được.
    await kd
      .from('site_surveys')
      .update({ surveyed_at: '2020-01-01T00:00:00Z', report_status: 'da_duyet' })
      .eq('id', surveyId);
    const { data: after } = await kd
      .from('site_surveys')
      .select('surveyed_at, report_status')
      .eq('id', surveyId)
      .single();
    expect(after!.surveyed_at).toBe(data!.surveyed_at);
    expect(after!.report_status).toBe('nhap');
  });

  it('ghi âm: người phụ trách ghi được; pháp nhân khác và Thi công không đọc được', async () => {
    const path = `${surveyId}/${Date.now()}.webm`;
    const up = await kd.storage
      .from('survey-audio')
      .upload(path, new Blob([new Uint8Array([26, 69, 223, 163])], { type: 'audio/webm' }), {
        contentType: 'audio/webm',
      });
    expect(up.error).toBeNull();
    const row = await kd
      .from('site_survey_recordings')
      .insert({
        survey_id: surveyId,
        storage_path: path,
        mime_type: 'audio/webm',
        duration_seconds: 42,
      })
      .select('id, company_id, transcript_status')
      .single();
    expect(row.error).toBeNull();
    expect(row.data!.transcript_status).toBe('chua');

    const otherUp = await kdNvo.storage
      .from('survey-audio')
      .upload(
        `${surveyId}/la-${Date.now()}.webm`,
        new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
        {
          contentType: 'audio/webm',
        },
      );
    expect(otherUp.error).not.toBeNull();

    for (const outsider of [kdNvo, thiCong]) {
      const rows = await outsider
        .from('site_survey_recordings')
        .select('id')
        .eq('survey_id', surveyId);
      expect(rows.data ?? []).toEqual([]);
      const file = await outsider.storage.from('survey-audio').download(path);
      expect(file.error).not.toBeNull();
    }

    // Sửa phần chép chữ được; đổi đường dẫn tệp thì bị bỏ qua.
    await kd
      .from('site_survey_recordings')
      .update({
        transcript: 'Khách cần nhà xưởng 2.000 m²',
        transcript_status: 'xong',
        storage_path: 'khac/x.webm',
      })
      .eq('id', row.data!.id);
    const { data: rec } = await kd
      .from('site_survey_recordings')
      .select('transcript, storage_path')
      .eq('id', row.data!.id)
      .single();
    expect(rec).toMatchObject({ transcript: 'Khách cần nhà xưởng 2.000 m²', storage_path: path });
  });

  it('gửi báo cáo: thiếu nhu cầu bị chặn; gửi xong thì khoá sửa và chưa sang Báo giá được', async () => {
    const empty = await kd.rpc('submit_survey_report', { p_survey_id: surveyId });
    expect(empty.error?.message).toMatch(/Nhu cầu/);

    await kd
      .from('site_surveys')
      .update({ needs: 'Nhà xưởng khung thép 2.000 m², KCN Phố Nối', budget_note: 'Khoảng 8 tỷ' })
      .eq('id', surveyId);
    const sent = await kd.rpc('submit_survey_report', { p_survey_id: surveyId });
    expect(sent.error).toBeNull();

    const locked = await kd
      .from('site_surveys')
      .update({ needs: 'Sửa lén' })
      .eq('id', surveyId)
      .select('id');
    expect(locked.error).not.toBeNull();
    const rec = await kd
      .from('site_survey_recordings')
      .insert({
        survey_id: surveyId,
        storage_path: `${surveyId}/them.webm`,
        mime_type: 'audio/webm',
      })
      .select('id');
    expect(rec.error).not.toBeNull();

    const move = await kd.rpc('move_opportunity_stage', {
      p_opportunity_id: opportunityId,
      p_to_stage: 'bao_gia',
    });
    expect(move.error).not.toBeNull();

    // Lối «bỏ qua khảo sát, ghi lý do» không vượt được Ban Giám đốc khi đã khảo sát thật.
    await kd.rpc('waive_opportunity_survey', {
      p_opportunity_id: opportunityId,
      p_reason: 'Khách gấp, báo giá luôn',
    });
    const bypass = await kd.rpc('move_opportunity_stage', {
      p_opportunity_id: opportunityId,
      p_to_stage: 'bao_gia',
    });
    expect(bypass.error).not.toBeNull();
  });

  it('Kinh doanh không duyệt được; TGĐ trả về phải có ý kiến; trả về thì sửa và gửi lại được', async () => {
    const mine = await kd.rpc('my_pending_approvals');
    expect((mine.data ?? []).some((a: { entity_id: string }) => a.entity_id === surveyId)).toBe(
      false,
    );

    const { data: inbox } = await tgd.rpc('my_pending_approvals');
    const item = (inbox ?? []).find((a: { entity_id: string }) => a.entity_id === surveyId) as
      { id: string; parent_id: string; subject: string } | undefined;
    expect(item).toMatchObject({ subject: 'survey_report', parent_id: opportunityId });

    const noNote = await tgd.rpc('decide_approval', {
      p_approval_id: item!.id,
      p_decision: 'rejected',
    });
    expect(noNote.error).not.toBeNull();
    const back = await tgd.rpc('decide_approval', {
      p_approval_id: item!.id,
      p_decision: 'rejected',
      p_note: 'Thiếu thông tin người quyết định và tiến độ',
    });
    expect(back.error).toBeNull();

    const { data: returned } = await kd
      .from('site_surveys')
      .select('report_status, report_feedback')
      .eq('id', surveyId)
      .single();
    expect(returned).toMatchObject({
      report_status: 'tra_ve',
      report_feedback: 'Thiếu thông tin người quyết định và tiến độ',
    });

    const fix = await kd
      .from('site_surveys')
      .update({ decision_maker: 'Giám đốc Trần Văn Hùng', schedule_note: 'Khởi công quý 1' })
      .eq('id', surveyId)
      .select('id');
    expect(fix.error).toBeNull();
    const resend = await kd.rpc('submit_survey_report', { p_survey_id: surveyId });
    expect(resend.error).toBeNull();
  });

  it('TGĐ duyệt: báo cáo đã duyệt, cơ hội tự sang Báo giá', async () => {
    const { data: inbox } = await tgd.rpc('my_pending_approvals');
    const item = (inbox ?? []).find((a: { entity_id: string }) => a.entity_id === surveyId) as
      { id: string } | undefined;
    const ok = await tgd.rpc('decide_approval', {
      p_approval_id: item!.id,
      p_decision: 'approved',
    });
    expect(ok.error).toBeNull();

    const { data: survey } = await kd
      .from('site_surveys')
      .select('report_status, report_feedback')
      .eq('id', surveyId)
      .single();
    expect(survey).toMatchObject({ report_status: 'da_duyet', report_feedback: null });
    const { data: opp } = await kd
      .from('opportunities')
      .select('stage')
      .eq('id', opportunityId)
      .single();
    expect(opp!.stage).toBe('bao_gia');
  });
});
