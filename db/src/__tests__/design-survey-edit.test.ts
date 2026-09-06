/**
 * Sửa và gỡ biên bản khảo sát hiện trạng (TK-02, migration 0120).
 *
 * Bốn điều canh:
 *  1. Người đi đo sửa được nội dung biên bản của mình.
 *  2. Sửa KHÔNG đụng `surveyed_at` — mốc đi đo không dời vì gõ lại. Đây là chỗ dễ hỏng nhất:
 *     một lần lỡ tay đưa `surveyed_at` vào câu UPDATE là mọi biên bản cũ đổi ngày khảo sát
 *     mà không có gì báo.
 *  3. Gỡ đi qua hàm `hide_design_survey`; UPDATE thẳng đặt `deleted_at` KHÔNG chạy được vì
 *     PostgREST đọc lại dòng sau khi sửa mà policy SELECT đã loại dòng đã xoá. Nếu một ngày
 *     nào đó UPDATE thẳng chạy được thì bài này đỏ, và đó là tín hiệu đúng: nghĩa là policy
 *     SELECT đã đổi và hàm không còn cần thiết.
 *  4. Người không được sửa hồ sơ thiết kế thì hàm cũng từ chối — không được nới lỏng hơn
 *     policy UPDATE của bảng.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('Biên bản khảo sát — sửa và gỡ', () => {
  let thietKe: SupabaseClient;
  let kinhDoanh: SupabaseClient;
  let nvoCompanyId: string;
  let projectId: string;

  beforeAll(async () => {
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvo);

    const company = await thietKe.from('companies').select('id').eq('code', 'NVO').single();
    nvoCompanyId = company.data!.id;
    const me = await thietKe.rpc('auth_user_id');

    const project = await thietKe
      .from('design_projects')
      .insert({
        company_id: nvoCompanyId,
        code: `NVO-TK-2090-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: `${TEST_PREFIX} Sửa biên bản khảo sát`,
        stage: 'dau_bai',
        responsible_user_id: me.data as string,
      })
      .select('id')
      .single();
    if (project.error) throw new Error(project.error.message);
    projectId = project.data.id;
  });

  async function newSurvey(): Promise<string> {
    const me = await thietKe.rpc('auth_user_id');
    const survey = await thietKe
      .from('design_surveys')
      .insert({
        company_id: nvoCompanyId,
        design_project_id: projectId,
        surveyed_by: me.data as string,
        surveyed_at: '2090-01-15T02:00:00.000Z',
        land_width: 15,
        land_depth: 20,
        land_area: 300,
        notes: `${TEST_PREFIX} biên bản`,
      })
      .select('id')
      .single();
    if (survey.error) throw new Error(survey.error.message);
    return survey.data.id;
  }

  it('sửa được nội dung, và mốc đi đo giữ nguyên', async () => {
    const id = await newSurvey();

    const edited = await thietKe
      .from('design_surveys')
      .update({ orientation: 'Nam', measurement_notes: 'cốt nền cao hơn mặt đường 20 cm' })
      .eq('id', id)
      .select('id, orientation, measurement_notes, surveyed_at')
      .single();

    expect(edited.error).toBeNull();
    expect(edited.data!.orientation).toBe('Nam');
    expect(new Date(edited.data!.surveyed_at as string).toISOString()).toBe(
      '2090-01-15T02:00:00.000Z',
    );
  });

  it('gỡ phải đi qua hàm — UPDATE thẳng đặt deleted_at không chạy được', async () => {
    const id = await newSurvey();

    const direct = await thietKe
      .from('design_surveys')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    expect(direct.error).not.toBeNull();

    // Dòng vẫn còn nguyên: câu trên không âm thầm ghi được một nửa.
    const stillThere = await thietKe.from('design_surveys').select('id').eq('id', id);
    expect(stillThere.data ?? []).toHaveLength(1);

    const removed = await thietKe.rpc('hide_design_survey', { p_survey_id: id });
    expect(removed.error).toBeNull();

    const gone = await thietKe.from('design_surveys').select('id').eq('id', id);
    expect(gone.data ?? []).toHaveLength(0);

    // Gỡ lần hai phải nói rõ là đã gỡ rồi, không im lặng coi như thành công.
    const again = await thietKe.rpc('hide_design_survey', { p_survey_id: id });
    expect(again.error).not.toBeNull();
  });

  it('vai trò không sửa được hồ sơ thiết kế thì cũng không gỡ được', async () => {
    const id = await newSurvey();

    const denied = await kinhDoanh.rpc('hide_design_survey', { p_survey_id: id });
    expect(denied.error).not.toBeNull();

    const stillThere = await thietKe.from('design_surveys').select('id').eq('id', id);
    expect(stillThere.data ?? []).toHaveLength(1);

    await thietKe.rpc('hide_design_survey', { p_survey_id: id });
  });

  it('không xoá cứng được từ trình duyệt', async () => {
    const id = await newSurvey();

    const hard = await thietKe.from('design_surveys').delete().eq('id', id).select('id');
    expect(hard.error?.code === '42501' || (hard.data ?? []).length === 0).toBe(true);

    await thietKe.rpc('hide_design_survey', { p_survey_id: id });
  });
});
