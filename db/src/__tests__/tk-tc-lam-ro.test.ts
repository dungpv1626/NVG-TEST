/**
 * Luồng phòng Thiết kế ↔ công trường (migration 0154).
 *
 *  1. RFI (TK-08 / TC-15): công trường gửi đúng công trình được giao (Mẫu E); bên được hỏi đọc và
 *     trả lời dù không xem được Module TC; câu trả lời chỉ ghi qua `answer_rfi`; RFI hiện ở màn
 *     Theo dõi đề nghị với hạn và người giữ, thúc được.
 *  2. Bản vẽ điều chỉnh sau bàn giao: chỉ khi gắn yêu cầu thay đổi đã chấp thuận; phát hành thì
 *     yêu cầu thành «đã thực hiện» và người ở công trình nhận thông báo.
 *  3. Công trường đọc bản vẽ thiết kế đã phát hành qua `site_design_drawings` (Mẫu E).
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tk-tc-lam-ro.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  companyId: string;
  siteA: string; // gắn hồ sơ thiết kế, CHT được giao
  siteB: string; // không gắn, CHT không được giao
  designId: string;
  thietKeId: string;
  chiHuyId: string;
  extraRoleId: string; // dòng user_companies tạm cho thietke.nvo ở NVC
}

interface TrackerRow {
  entity_type: string;
  entity_id: string;
  stage: string;
  is_closed: boolean;
  holder_kind: string | null;
  holder_ids: string[];
  due_at: string | null;
}

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Hồ sơ thiết kế NVC, hai công trình NVC. Dựng bối cảnh, vượt RLS. Bản vẽ v1 phát hành qua đúng hàm, ở beforeAll. */
async function seedFixture(): Promise<Fixture> {
  return withSql(async (sql) => {
    const stamp = String(Date.now());
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const [tk] = await sql<
      { id: string }[]
    >`SELECT id FROM users WHERE email = ${ACCOUNTS.thietKeNvo}`;
    const [cht] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
    // Tài khoản thiết kế mẫu chỉ ở NVO — cho thêm vai trò TKE ở NVC trong lúc thử, gỡ ở afterAll.
    const [extra] = await sql<{ id: string }[]>`
      INSERT INTO user_companies (user_id, company_id, role_id, is_primary)
      SELECT ${tk!.id}, ${nvc!.id}, r.id, false FROM roles r WHERE r.code = 'TKE'
      RETURNING id`;
    const [design] = await sql<{ id: string }[]>`
      INSERT INTO design_projects (company_id, code, name, stage, responsible_user_id)
      VALUES (${nvc!.id}, ${'NVC-TK-RFI-' + stamp}, ${TEST_PREFIX + ' Hồ sơ RFI ' + stamp},
              'ho_so_ky_thuat', ${tk!.id})
      RETURNING id`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date, design_project_id)
      VALUES
        (${nvc!.id}, ${'NVC-CT-RFI-A-' + stamp}, ${TEST_PREFIX + ' Công trình RFI A ' + stamp}, current_date + 90, ${design!.id}),
        (${nvc!.id}, ${'NVC-CT-RFI-B-' + stamp}, ${TEST_PREFIX + ' Công trình RFI B ' + stamp}, current_date + 90, NULL)
      RETURNING id`;
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      VALUES (${cht!.id}, ${sites[0]!.id})`;
    return {
      companyId: nvc!.id,
      siteA: sites[0]!.id,
      siteB: sites[1]!.id,
      designId: design!.id,
      thietKeId: tk!.id,
      chiHuyId: cht!.id,
      extraRoleId: extra!.id,
    };
  });
}

function dueIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function trackerRow(client: SupabaseClient, id: string): Promise<TrackerRow | undefined> {
  const { data, error } = await client.rpc('site_request_tracker');
  if (error) throw new Error(error.message);
  return (data as TrackerRow[]).find((r) => r.entity_id === id);
}

describeDb('Yêu cầu làm rõ và bản vẽ điều chỉnh sau bàn giao (0154)', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let thietKe: SupabaseClient;
  let rfiId: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    chiHuy = await signInAs(ACCOUNTS.chiHuyTruongNvc);
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    // Bản kiến trúc v1: lập và phát hành bằng tài khoản Thiết kế — `published_at` chỉ đặt được qua
    // `publish_design_version` (cột trạng thái có guard, 0028).
    const { data: doc, error: docError } = await thietKe
      .from('documents')
      .insert({
        company_id: fixture.companyId,
        title: `${TEST_PREFIX} Bản vẽ kiến trúc`,
        category: 'ban_ve_kien_truc',
        related_entity_type: 'design_projects',
        related_entity_id: fixture.designId,
      })
      .select('id')
      .single();
    if (docError) throw new Error(docError.message);
    const docId = (doc as { id: string }).id;
    const { data: dvId } = await thietKe.rpc('publish_document_version', {
      p_document_id: docId,
      p_file_url: 'thiet-ke/kt-v1.pdf',
      p_file_name: 'KT-V1.pdf',
    });
    const { data: v1, error: v1Error } = await thietKe
      .from('design_versions')
      .insert({
        design_project_id: fixture.designId,
        company_id: fixture.companyId,
        discipline: 'kien_truc',
        title: `${TEST_PREFIX} Kiến trúc v1`,
        document_id: docId,
        document_version_id: dvId,
      })
      .select('id')
      .single();
    if (v1Error) throw new Error(v1Error.message);
    const pub = await thietKe.rpc('publish_design_version', {
      p_version_id: (v1 as { id: string }).id,
    });
    if (pub.error) throw new Error(pub.error.message);
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM user_companies WHERE id = ${fixture.extraRoleId}`;
      await sql`DELETE FROM user_site_assignments WHERE construction_site_id IN (${fixture.siteA}, ${fixture.siteB})`;
    });
  });

  it('CHT gửi RFI cho công trình được giao: mã do CSDL cấp, người giữ là người chịu trách nhiệm hồ sơ', async () => {
    const { data, error } = await chiHuy
      .from('rfis')
      .insert({
        construction_site_id: fixture.siteA,
        title: 'Cao độ dầm D3 trục 2',
        question: 'Bản vẽ kết cấu ghi 3,30 m, kiến trúc ghi 3,25 m. Thi công theo số nào?',
        route: 'thiet_ke',
        due_date: dueIn(2),
        status: 'da_tra_loi', // bị bỏ qua — gửi lúc nào cũng là «chờ trả lời»
        answer: 'tự trả lời',
      })
      .select('id, code, status, answer, design_project_id')
      .single();
    expect(error).toBeNull();
    const row = data as {
      id: string;
      code: string;
      status: string;
      answer: string | null;
      design_project_id: string;
    };
    expect(row.code).toMatch(/^NVC-RFI-\d{4}-\d{4}$/);
    expect(row.status).toBe('cho_tra_loi');
    expect(row.answer).toBeNull();
    expect(row.design_project_id).toBe(fixture.designId);
    rfiId = row.id;

    const tracked = await trackerRow(chiHuy, rfiId);
    expect(tracked).toMatchObject({
      entity_type: 'rfis',
      holder_kind: 'answerer',
      is_closed: false,
    });
    expect(tracked!.holder_ids).toEqual([fixture.thietKeId]);
    expect(tracked!.due_at).not.toBeNull();
  });

  it('CHT KHÔNG gửi được RFI cho công trình không được giao (Mẫu E)', async () => {
    const { error } = await chiHuy.from('rfis').insert({
      construction_site_id: fixture.siteB,
      title: 'Không được giao',
      question: 'x',
      route: 'du_an',
      due_date: dueIn(1),
    });
    expect(error).not.toBeNull();
  });

  it('tuyến Thiết kế mà công trình không gắn hồ sơ thiết kế thì bị từ chối bằng câu tiếng Việt', async () => {
    const vanPhong = await signInAs(ACCOUNTS.congTruongNvc);
    const { error } = await vanPhong.from('rfis').insert({
      construction_site_id: fixture.siteB,
      title: 'Hỏi thiết kế',
      question: 'x',
      route: 'thiet_ke',
      due_date: dueIn(1),
    });
    expect(error?.message).toMatch(/không gắn hồ sơ thiết kế/);
  });

  it('bên Thiết kế đọc được RFI dù không xem được Module TC; không sửa thẳng được câu trả lời', async () => {
    const { data } = await thietKe.from('rfis').select('id').eq('id', rfiId);
    expect(data).toHaveLength(1);
    // Không có quyền UPDATE trên bảng — câu trả lời chỉ qua answer_rfi.
    const { error } = await thietKe.from('rfis').update({ answer: 'sửa thẳng' }).eq('id', rfiId);
    expect(error).not.toBeNull();
  });

  it('CHT không trả lời thay bên Thiết kế; Thiết kế trả lời thì đóng RFI, không trả lời lần hai', async () => {
    const denied = await chiHuy.rpc('answer_rfi', { p_rfi_id: rfiId, p_answer: 'tự quyết' });
    expect(denied.error?.message).toMatch(/không trả lời được/);

    const ok = await thietKe.rpc('answer_rfi', {
      p_rfi_id: rfiId,
      p_answer: 'Theo kết cấu: 3,30 m.',
    });
    expect(ok.error).toBeNull();
    const again = await thietKe.rpc('answer_rfi', { p_rfi_id: rfiId, p_answer: 'lần hai' });
    expect(again.error?.message).toMatch(/đã được trả lời/);

    const tracked = await trackerRow(chiHuy, rfiId);
    expect(tracked).toMatchObject({ stage: 'da_tra_loi', is_closed: true, holder_kind: null });

    const notices = await withSql(
      (sql) => sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications
         WHERE user_id = ${fixture.chiHuyId} AND type = 'rfi_answered' AND related_entity_id = ${rfiId}`,
    );
    expect(notices[0]!.n).toBe(1);
  });

  it('công trường thúc RFI đang chờ: ghi lịch sử, báo đúng người giữ', async () => {
    const { data } = await chiHuy
      .from('rfis')
      .insert({
        construction_site_id: fixture.siteA,
        title: 'Vị trí hộp kỹ thuật tầng 2',
        question: 'Hộp kỹ thuật đụng dầm, dời sang trái được không?',
        route: 'thiet_ke',
        due_date: dueIn(1),
      })
      .select('id')
      .single();
    const id = (data as { id: string }).id;
    const nudged = await chiHuy.rpc('nudge_request', { p_entity_type: 'rfis', p_entity_id: id });
    expect(nudged.error).toBeNull();
    const { data: history } = await chiHuy
      .from('request_reminders')
      .select('id')
      .eq('entity_id', id);
    expect(history).toHaveLength(1);
  });

  it('công trường đọc bản vẽ thiết kế đã phát hành của công trình mình (Mẫu E), không đọc công trình khác', async () => {
    const mine = await chiHuy.rpc('site_design_drawings', { p_site_id: fixture.siteA });
    expect(mine.error).toBeNull();
    expect(mine.data as { discipline: string; is_current: boolean }[]).toEqual([
      expect.objectContaining({ discipline: 'kien_truc', is_current: true, version: 1 }),
    ]);
    const other = await chiHuy.rpc('site_design_drawings', { p_site_id: fixture.siteB });
    expect(other.data).toEqual([]);
  });

  describe('bản vẽ điều chỉnh sau bàn giao', () => {
    let approvedCr: string;
    let pendingCr: string;

    beforeAll(async () => {
      await withSql(async (sql) => {
        await sql`UPDATE design_projects SET handed_over_at = now(), stage = 'ban_giao' WHERE id = ${fixture.designId}`;
        const [a] = await sql<{ id: string }[]>`
          INSERT INTO change_requests (company_id, design_project_id, title, origin, content, reason, status)
          VALUES (${fixture.companyId}, ${fixture.designId}, ${TEST_PREFIX + ' Đổi cao độ dầm'},
                  'cong_truong', 'Nâng dầm D3', 'Xung đột kết cấu', 'chap_thuan')
          RETURNING id`;
        const [b] = await sql<{ id: string }[]>`
          INSERT INTO change_requests (company_id, design_project_id, title, origin, content, reason, status)
          VALUES (${fixture.companyId}, ${fixture.designId}, ${TEST_PREFIX + ' Chưa duyệt'},
                  'cong_truong', 'x', 'y', 'dang_danh_gia')
          RETURNING id`;
        approvedCr = a!.id;
        pendingCr = b!.id;
      });
    });

    async function draftRevision(changeRequestId: string | null) {
      const { data: doc } = await thietKe
        .from('documents')
        .select('id')
        .eq('related_entity_id', fixture.designId)
        .eq('category', 'ban_ve_kien_truc')
        .single();
      const docId = (doc as { id: string }).id;
      const { data: dvId, error: dvError } = await thietKe.rpc('publish_document_version', {
        p_document_id: docId,
        p_file_url: `thiet-ke/kt-${Date.now()}.pdf`,
        p_file_name: 'KT-DIEU-CHINH.pdf',
        p_change_reason: 'Điều chỉnh tại công trường',
      });
      expect(dvError).toBeNull();
      return thietKe
        .from('design_versions')
        .insert({
          design_project_id: fixture.designId,
          company_id: fixture.companyId,
          discipline: 'kien_truc',
          title: `${TEST_PREFIX} Kiến trúc điều chỉnh`,
          document_id: docId,
          document_version_id: dvId,
          change_reason: 'Nâng dầm D3',
          change_request_id: changeRequestId,
        })
        .select('id')
        .single();
    }

    it('không gắn yêu cầu thay đổi, hoặc yêu cầu chưa chấp thuận: KHÔNG lập được bản điều chỉnh', async () => {
      expect((await draftRevision(null)).error).not.toBeNull();
      expect((await draftRevision(pendingCr)).error).not.toBeNull();
    });

    it('gắn yêu cầu đã chấp thuận: phát hành được, yêu cầu thành «đã thực hiện», CHT nhận thông báo', async () => {
      const { data, error } = await draftRevision(approvedCr);
      expect(error).toBeNull();
      const versionId = (data as { id: string }).id;

      const published = await thietKe.rpc('publish_design_version', { p_version_id: versionId });
      expect(published.error).toBeNull();

      const [cr] = await withSql(
        (sql) =>
          sql<{ status: string }[]>`SELECT status FROM change_requests WHERE id = ${approvedCr}`,
      );
      expect(cr!.status).toBe('da_thuc_hien');

      const notices = await withSql(
        (sql) => sql<{ action_url: string }[]>`
          SELECT action_url FROM notifications
           WHERE user_id = ${fixture.chiHuyId} AND type = 'design_version_published'
             AND related_entity_id = ${fixture.siteA}`,
      );
      expect(notices.map((n) => n.action_url)).toContain(
        `/tc/cong-trinh/${fixture.siteA}?tab=ho-so`,
      );

      // Công trường thấy bản mới đang hiệu lực, bản cũ hết hiệu lực.
      const drawings = await chiHuy.rpc('site_design_drawings', { p_site_id: fixture.siteA });
      const rows = drawings.data as { version: number; is_current: boolean }[];
      expect(rows.find((r) => r.version === 1)!.is_current).toBe(false);
      expect(rows.find((r) => r.version === 2)!.is_current).toBe(true);
    });
  });
});
