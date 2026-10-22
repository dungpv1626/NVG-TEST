/**
 * Đợt 5 — 5A: khảo sát thiết kế ghi âm + vòng ý kiến khách (migration 0205).
 *
 * Canh:
 *  1. Giờ bắt đầu / kết thúc khảo sát do MÁY ghi — không nhập, không sửa tay (trigger
 *     `design_surveys_clock_guard`); bấm «Bắt đầu» hai lần không ra hai biên bản.
 *  2. Người không được sửa hồ sơ thiết kế (Kinh doanh chỉ xem TK) không bắt đầu / kết thúc được.
 *  3. Ghi âm nằm ở thư mục của đúng dự án + biên bản; Kinh doanh không tải lên; không ai xoá.
 *  4. Vòng ý kiến khách tự đánh số theo (dự án, bộ môn); góp ý nội bộ không có số vòng; số vòng
 *     không sửa được; ghi âm của dự án khác bị từ chối.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/dot5-tk-feedback.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const BUCKET = 'design-audio';
const AUDIO = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);

async function sqlRun<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function upload(client: SupabaseClient, path: string) {
  return client.storage
    .from(BUCKET)
    .upload(path, new Blob([AUDIO], { type: 'audio/webm' }), { contentType: 'audio/webm' });
}

describeDb('5A — khảo sát thiết kế ghi âm + vòng ý kiến khách (0205)', () => {
  let thietKe: SupabaseClient;
  let kinhDoanh: SupabaseClient;
  let companyId: string;
  let projectId: string;
  let otherProjectId: string;
  let versionId: string;
  let version2Id: string;

  beforeAll(async () => {
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const me = (await thietKe.rpc('auth_user_id')).data as string;
    const company = await thietKe.from('companies').select('id').eq('code', 'NVO').single();
    companyId = company.data!.id;

    const mk = async (label: string) => {
      const r = await thietKe
        .from('design_projects')
        .insert({
          company_id: companyId,
          code: `NVO-TK-2091-${Math.floor(Math.random() * 90000 + 10000)}`,
          name: `${TEST_PREFIX} 5A ${label}`,
          stage: 'phuong_an',
          responsible_user_id: me,
        })
        .select('id')
        .single();
      if (r.error) throw new Error(r.error.message);
      return r.data.id as string;
    };
    projectId = await mk('vòng ý kiến');
    otherProjectId = await mk('dự án khác');

    // Hai phiên bản phương án đã phát hành (phát hành qua hàm cần tài liệu — ở đây đặt thẳng).
    const rows = await sqlRun(
      (sql) => sql<{ id: string }[]>`
        INSERT INTO design_versions
          (company_id, design_project_id, discipline, title, published_at, change_reason)
        VALUES (${companyId}, ${projectId}, 'phuong_an', ${TEST_PREFIX + ' PA 1'}, now(), NULL),
               (${companyId}, ${projectId}, 'phuong_an', ${TEST_PREFIX + ' PA 2'}, now(), 'Theo ý kiến vòng 1')
        RETURNING id`,
    );
    versionId = rows[0]!.id;
    version2Id = rows[1]!.id;
    // Trigger đánh số phiên bản xoá mốc phát hành lúc chèn — đặt lại sau.
    await sqlRun(
      (sql) =>
        sql`UPDATE design_versions SET published_at = now() WHERE id IN (${versionId}, ${version2Id})`,
    );
  });

  it('Bắt đầu khảo sát: máy ghi giờ + người đi đo; bấm lại không ra biên bản thứ hai', async () => {
    const first = await thietKe.rpc('start_design_survey', { p_project_id: projectId });
    expect(first.error).toBeNull();
    const again = await thietKe.rpc('start_design_survey', { p_project_id: projectId });
    expect(again.data).toBe(first.data);

    const row = await thietKe
      .from('design_surveys')
      .select('started_at, finished_at, surveyed_by, surveyed_at')
      .eq('id', first.data as string)
      .single();
    expect(row.data!.started_at).not.toBeNull();
    expect(row.data!.finished_at).toBeNull();
    expect(row.data!.surveyed_by).toBe((await thietKe.rpc('auth_user_id')).data);

    const done = await thietKe.rpc('finish_design_survey', { p_survey_id: first.data as string });
    expect(done.error).toBeNull();
    expect(done.data).not.toBeNull();
  });

  it('giờ khảo sát KHÔNG nhập / sửa tay được', async () => {
    const ins = await thietKe.from('design_surveys').insert({
      company_id: companyId,
      design_project_id: projectId,
      started_at: '2090-01-01T01:00:00Z',
      notes: `${TEST_PREFIX} giờ tay`,
    });
    expect(ins.error?.message ?? '').toContain('máy ghi');

    const id = (await thietKe.rpc('start_design_survey', { p_project_id: projectId }))
      .data as string;
    const upd = await thietKe
      .from('design_surveys')
      .update({ finished_at: '2090-01-01T03:00:00Z' })
      .eq('id', id)
      .select('id');
    expect(upd.error?.message ?? '').toContain('máy ghi');
    const moved = await thietKe
      .from('design_surveys')
      .update({ surveyed_at: '2090-01-01T03:00:00Z' })
      .eq('id', id)
      .select('id');
    expect(moved.error?.message ?? '').toContain('máy ghi');
    await thietKe.rpc('finish_design_survey', { p_survey_id: id });
  });

  it('Kinh doanh (chỉ xem TK) KHÔNG bắt đầu / kết thúc khảo sát được', async () => {
    const r = await kinhDoanh.rpc('start_design_survey', { p_project_id: projectId });
    expect(r.error).toBeTruthy();
    const id = (await thietKe.rpc('start_design_survey', { p_project_id: projectId }))
      .data as string;
    const f = await kinhDoanh.rpc('finish_design_survey', { p_survey_id: id });
    expect(f.error).toBeTruthy();
    await thietKe.rpc('finish_design_survey', { p_survey_id: id });
  });

  it('ghi âm: đúng thư mục dự án + biên bản; Kinh doanh không tải lên; không ai xoá', async () => {
    const surveyId = (await thietKe.rpc('start_design_survey', { p_project_id: projectId }))
      .data as string;
    const path = `${projectId}/khao-sat/${surveyId}/${crypto.randomUUID()}.webm`;
    expect((await upload(thietKe, path)).error).toBeNull();
    const rec = await thietKe
      .from('design_survey_recordings')
      .insert({
        design_survey_id: surveyId,
        design_project_id: projectId,
        company_id: companyId,
        storage_path: path,
        duration_seconds: 12,
      })
      .select('id, transcript_status')
      .single();
    expect(rec.error).toBeNull();
    expect(rec.data!.transcript_status).toBe('chua');

    const tx = await thietKe
      .from('design_survey_recordings')
      .update({ transcript: 'Chủ nhà muốn phòng thờ tầng trên cùng.', transcript_status: 'xong' })
      .eq('id', rec.data!.id)
      .select('transcript')
      .single();
    expect(tx.data!.transcript).toContain('phòng thờ');

    const wrong = await thietKe.from('design_survey_recordings').insert({
      design_survey_id: surveyId,
      design_project_id: projectId,
      company_id: companyId,
      storage_path: `${otherProjectId}/khao-sat/${surveyId}/x.webm`,
    });
    expect(wrong.error?.message ?? '').toContain('không thuộc');

    expect(
      (await upload(kinhDoanh, `${projectId}/khao-sat/${surveyId}/${crypto.randomUUID()}.webm`))
        .error,
    ).toBeTruthy();
    const kdRec = await kinhDoanh.from('design_survey_recordings').insert({
      design_survey_id: surveyId,
      design_project_id: projectId,
      company_id: companyId,
      storage_path: path,
    });
    expect(kdRec.error).toBeTruthy();

    await thietKe.storage.from(BUCKET).remove([path]);
    expect((await thietKe.storage.from(BUCKET).createSignedUrl(path, 60)).error).toBeNull();
    const del = await thietKe.from('design_survey_recordings').delete().eq('id', rec.data!.id);
    const still = await thietKe
      .from('design_survey_recordings')
      .select('id')
      .eq('id', rec.data!.id);
    expect(del.error !== null || still.data!.length === 1).toBe(true);
    expect(still.data!.length).toBe(1);
    await thietKe.rpc('finish_design_survey', { p_survey_id: surveyId });
  });

  it('vòng ý kiến khách tự đánh số theo dự án + bộ môn; nội bộ không có số vòng', async () => {
    const voice = `${projectId}/y-kien/${crypto.randomUUID()}.webm`;
    expect((await upload(thietKe, voice)).error).toBeNull();

    const r1 = await thietKe.rpc('record_design_feedback', {
      p_version_id: versionId,
      p_decision: 'yeu_cau_sua',
      p_comments: 'Đổi cầu thang ra sau nhà.',
      p_reviewer_name: 'Chủ nhà thử',
      p_voice_path: voice,
      p_voice_transcript: 'Anh muốn đổi cầu thang ra phía sau.',
    });
    expect(r1.error).toBeNull();
    expect((r1.data as { round_no: number }[])[0]!.round_no).toBe(1);

    const internal = await thietKe.rpc('record_design_review', {
      p_version_id: versionId,
      p_reviewer_type: 'noi_bo',
      p_decision: 'gop_y',
      p_comments: 'Kiểm lại cao độ sàn.',
    });
    expect(internal.error).toBeNull();

    const r2 = await thietKe.rpc('record_design_feedback', {
      p_version_id: version2Id,
      p_decision: 'gop_y',
      p_comments: 'Được, thêm cửa sổ phòng ngủ.',
      p_reviewer_name: 'Chủ nhà thử',
    });
    expect((r2.data as { round_no: number }[])[0]!.round_no).toBe(2);

    const rows = await thietKe
      .from('design_reviews')
      .select('round_no, reviewer_type, voice_path, voice_transcript')
      .in('design_version_id', [versionId, version2Id])
      .order('reviewed_at');
    expect(rows.data!.map((r) => [r.reviewer_type, r.round_no])).toEqual([
      ['khach_hang', 1],
      ['noi_bo', null],
      ['khach_hang', 2],
    ]);
    expect(rows.data![0]!.voice_path).toBe(voice);
    expect(rows.data![0]!.voice_transcript).toContain('cầu thang');
  });

  it('ghi âm của dự án khác bị từ chối; số vòng không sửa được; Kinh doanh không ghi ý kiến', async () => {
    const r = await thietKe.rpc('record_design_feedback', {
      p_version_id: versionId,
      p_decision: 'gop_y',
      p_comments: 'x',
      p_reviewer_name: 'Chủ nhà thử',
      p_voice_path: `${otherProjectId}/y-kien/x.webm`,
    });
    expect(r.error?.message ?? '').toContain('không thuộc');

    const kd = await kinhDoanh.rpc('record_design_feedback', {
      p_version_id: versionId,
      p_decision: 'gop_y',
      p_comments: 'Kinh doanh ghi hộ',
      p_reviewer_name: 'Chủ nhà thử',
    });
    expect(kd.error).toBeTruthy();

    const err = await sqlRun(async (sql) => {
      try {
        await sql`UPDATE design_reviews SET round_no = 9
                  WHERE design_version_id = ${versionId} AND reviewer_type = 'khach_hang'`;
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(err ?? '').toContain('không sửa');
  });
});
