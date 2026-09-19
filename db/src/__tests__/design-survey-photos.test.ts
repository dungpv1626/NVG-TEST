/**
 * Ảnh hiện trạng đính kèm biên bản khảo sát — RLS trên bảng VÀ trên bucket (migration 0118).
 *
 * Bốn điều canh:
 *  1. Kiến trúc sư NVO ghi được ảnh cho biên bản của dự án mình sửa được; dòng phải nằm đúng
 *     thư mục dự án — sai thư mục là bị từ chối dù mọi cột khác đúng.
 *  2. Người không có quyền sửa TK không ghi được, kể cả vào bucket.
 *  3. Tệp trong bucket đi theo cùng hàm quyền với bảng: đúng thư mục dự án thì tải được,
 *     thư mục lạ thì không — và sai định dạng thư mục KHÔNG gây lỗi mà chỉ bị từ chối.
 *  4. Không xoá cứng được từ trình duyệt (chỉ có xoá mềm).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const BUCKET = 'design-site-photos';

/** PNG 1×1 hợp lệ — bucket chỉ nhận ảnh/video, không nhận tệp chữ. */
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

describeDb('Ảnh hiện trạng khảo sát — RLS bảng và bucket', () => {
  let thietKe: SupabaseClient;
  let kinhDoanh: SupabaseClient;
  let admin: SupabaseClient;
  let nvoCompanyId: string;
  let projectId: string;
  let surveyId: string;
  const uploadedPaths: string[] = [];

  beforeAll(async () => {
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvo);
    admin = await signInAs(ACCOUNTS.admin);

    const company = await thietKe.from('companies').select('id').eq('code', 'NVO').single();
    nvoCompanyId = company.data!.id;
    const me = await thietKe.rpc('auth_user_id');

    const project = await thietKe
      .from('design_projects')
      .insert({
        company_id: nvoCompanyId,
        code: `NVO-TK-2090-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: `${TEST_PREFIX} Ảnh khảo sát`,
        stage: 'dau_bai',
        responsible_user_id: me.data as string,
      })
      .select('id')
      .single();
    if (project.error) throw new Error(project.error.message);
    projectId = project.data.id;

    const survey = await thietKe
      .from('design_surveys')
      .insert({ company_id: nvoCompanyId, design_project_id: projectId, notes: 'kiểm thử' })
      .select('id')
      .single();
    if (survey.error) throw new Error(survey.error.message);
    surveyId = survey.data.id;
  });

  afterAll(async () => {
    if (uploadedPaths.length) await admin.storage.from(BUCKET).remove(uploadedPaths);
  });

  function row(path: string) {
    return {
      company_id: nvoCompanyId,
      design_project_id: projectId,
      design_survey_id: surveyId,
      storage_path: path,
      file_name: 'mat-tien.png',
      mime_type: 'image/png',
      size_bytes: PNG_1PX.length,
    };
  }

  it('kiến trúc sư ghi được ảnh đúng thư mục dự án; sai thư mục thì không', async () => {
    const ok = await thietKe
      .from('design_survey_photos')
      .insert(row(`${projectId}/${surveyId}/a.png`))
      .select('id')
      .single();
    expect(ok.error).toBeNull();

    const wrongFolder = await thietKe
      .from('design_survey_photos')
      .insert(row(`00000000-0000-4000-8000-000000000000/${surveyId}/b.png`));
    expect(wrongFolder.error).not.toBeNull();
  });

  it('người không sửa được TK không ghi được dòng lẫn tệp', async () => {
    const insert = await kinhDoanh
      .from('design_survey_photos')
      .insert(row(`${projectId}/${surveyId}/c.png`));
    expect(insert.error).not.toBeNull();

    const upload = await kinhDoanh.storage
      .from(BUCKET)
      .upload(`${projectId}/${surveyId}/kd.png`, PNG_1PX, { contentType: 'image/png' });
    expect(upload.error).not.toBeNull();
  });

  it('tệp: đúng thư mục dự án thì tải được và đọc lại được; thư mục lạ thì không', async () => {
    const path = `${projectId}/${surveyId}/tk.png`;
    const upload = await thietKe.storage
      .from(BUCKET)
      .upload(path, PNG_1PX, { contentType: 'image/png' });
    expect(upload.error, upload.error?.message).toBeNull();
    uploadedPaths.push(path);

    const signed = await thietKe.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toContain(BUCKET);

    // Thư mục đầu không phải UUID: `try_uuid` trả NULL, policy từ chối — không nổ lỗi 500.
    const odd = await thietKe.storage
      .from(BUCKET)
      .upload(`khong-phai-uuid/${surveyId}/x.png`, PNG_1PX, { contentType: 'image/png' });
    expect(odd.error).not.toBeNull();

    const foreign = await thietKe.storage
      .from(BUCKET)
      .upload(`00000000-0000-4000-8000-000000000000/${surveyId}/y.png`, PNG_1PX, {
        contentType: 'image/png',
      });
    expect(foreign.error).not.toBeNull();
  });

  it('chỉ xoá MỀM được; xoá cứng từ trình duyệt không có tác dụng', async () => {
    const created = await thietKe
      .from('design_survey_photos')
      .insert(row(`${projectId}/${surveyId}/d.png`))
      .select('id')
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id as string;

    const hardDelete = await thietKe
      .from('design_survey_photos')
      .delete()
      .eq('id', id)
      .select('id');
    expect(hardDelete.error?.code === '42501' || (hardDelete.data ?? []).length === 0).toBe(true);

    // Xoá mềm đi qua hàm (migration 0119): UPDATE thẳng bị chính policy SELECT chặn vì
    // PostgREST đọc lại dòng sau khi sửa. Người không sửa được dự án thì hàm cũng từ chối.
    const denied = await kinhDoanh.rpc('hide_design_survey_photo', { p_photo_id: id });
    expect(denied.error).not.toBeNull();

    const soft = await thietKe.rpc('hide_design_survey_photo', { p_photo_id: id });
    expect(soft.error).toBeNull();

    const visible = await thietKe.from('design_survey_photos').select('id').eq('id', id);
    expect(visible.data ?? []).toHaveLength(0);
  });
});
