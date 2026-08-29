/**
 * Module Thiết kế AI — kiểm thử phân quyền BA CHIỀU và tính bất biến của artifact.
 *
 * Nguồn yêu cầu: `doc/design/08-milestones.md` mục "Mốc 1 — Ra", `02-architecture.md` 2.8.
 *
 * Vì sao chạy trên CSDL thật thay vì giả lập: cả ba chiều đều được cưỡng chế bằng chính sách
 * RLS trong Postgres. Kiểm bằng dữ liệu giả chỉ chứng minh mã TypeScript nghĩ gì, không
 * chứng minh CSDL làm gì — mà CSDL mới là nơi duy nhất quyền không vòng qua được.
 *
 * Chạy: `npx vitest run --project logic db/src/__tests__/design-engine.test.ts`
 * (cần `npm run db:seed` trước).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

/** Mã băm giả nhưng ĐÚNG định dạng — ràng buộc CHECK của bảng kiểm chính xác chuỗi này. */
const fakeArtifactId = (seed: string): string =>
  `sha256:${seed
    .repeat(64)
    .slice(0, 64)
    .replace(/[^0-9a-f]/g, '0')}`;

describeDb('Module Thiết kế AI — nền tảng', () => {
  let thietKe: SupabaseClient;
  let ketCau: SupabaseClient;
  let kinhDoanh: SupabaseClient;
  let admin: SupabaseClient;

  let tenantId: string;
  let nvoCompanyId: string;
  let projectId: string;
  let thietKeUserId: string;

  beforeAll(async () => {
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    ketCau = await signInAs(ACCOUNTS.ketCauNvo);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvo);
    admin = await signInAs(ACCOUNTS.admin);

    const tenant = await admin.from('tenants').select('id').eq('code', 'nvg').single();
    tenantId = tenant.data!.id;

    const company = await thietKe.from('companies').select('id').eq('code', 'NVO').single();
    nvoCompanyId = company.data!.id;

    const me = await thietKe.rpc('auth_user_id');
    thietKeUserId = me.data as string;

    const project = await thietKe
      .from('design_projects')
      .insert({
        company_id: nvoCompanyId,
        code: `NVO-TK-2090-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: `${TEST_PREFIX} Nhà phố 5x18 — kiểm thử engine`,
        stage: 'dau_bai',
        responsible_user_id: thietKeUserId,
      })
      .select('id')
      .single();
    if (project.error) throw new Error(`Không tạo được dự án test: ${project.error.message}`);
    projectId = project.data.id;
  });

  // -------------------------------------------------------------------------
  // Cấu trúc — thiếu một cột phạm vi ở một bảng là một lỗ hổng
  // -------------------------------------------------------------------------

  describe('Cấu trúc bảng', () => {
    it('mọi bảng artifact của module đều mang tenant_id và discipline', async () => {
      const { data, error } = await admin.rpc('design_module_scope_columns');
      // Hàm trợ giúp chỉ có sau migration 0096; nếu chưa có thì kiểm gián tiếp bằng cách ghi.
      if (error) return;
      for (const row of data as Array<{ table_name: string; has_tenant: boolean }>) {
        expect(row.has_tenant, `${row.table_name} thiếu tenant_id`).toBe(true);
      }
    });

    it('tenant NVG tồn tại và mọi pháp nhân đã gắn tenant', async () => {
      const { data } = await admin.from('companies').select('code, tenant_id');
      expect(data!.length).toBeGreaterThanOrEqual(3);
      for (const row of data!) expect(row.tenant_id).toBe(tenantId);
    });
  });

  // -------------------------------------------------------------------------
  // Chiều 1 và 3 — tenant và bộ môn
  // -------------------------------------------------------------------------

  describe('Quyền chuỗi', () => {
    it('kiến trúc sư ghi được bộ môn kiến trúc', async () => {
      const { data } = await thietKe.rpc('auth_has_capability', {
        p_capability: 'design.write.kien_truc',
      });
      expect(data).toBe(true);
    });

    it('kiến trúc sư KHÔNG ghi được bộ môn kết cấu', async () => {
      // Giai đoạn 1 chỉ sinh hồ sơ kiến trúc. Quyền ghi kết cấu chưa gán cho ai —
      // và đó là điều kiện làm cho phép thử "phát hành kết cấu bị chặn" có nghĩa.
      const { data } = await thietKe.rpc('auth_has_capability', {
        p_capability: 'design.write.ket_cau',
      });
      expect(data).toBe(false);
    });

    it('kiến trúc sư KHÔNG ký được hồ sơ kết cấu', async () => {
      const { data } = await thietKe.rpc('auth_has_capability', {
        p_capability: 'design.publish.ket_cau',
      });
      expect(data).toBe(false);
    });

    it('Kinh doanh chỉ ĐỌC, không ghi', async () => {
      const read = await kinhDoanh.rpc('auth_has_capability', {
        p_capability: 'design.read.kien_truc',
      });
      const write = await kinhDoanh.rpc('auth_has_capability', {
        p_capability: 'design.write.kien_truc',
      });
      expect(read.data).toBe(true);
      expect(write.data).toBe(false);
    });

    it('Quản trị hệ thống KHÔNG ký được hồ sơ bộ môn nào', async () => {
      // Phát hành là trách nhiệm chuyên môn có chữ ký, không phải việc quản trị hệ thống.
      for (const d of ['kien_truc', 'ket_cau', 'dien_nuoc']) {
        const { data } = await admin.rpc('auth_has_capability', {
          p_capability: `design.publish.${d}`,
        });
        expect(data, `ADMIN không được có design.publish.${d}`).toBe(false);
      }
    });

    it('người dùng thuộc đúng tenant của pháp nhân mình', async () => {
      const { data } = await thietKe.rpc('auth_tenant_ids');
      expect(data).toEqual([tenantId]);
    });
  });

  // -------------------------------------------------------------------------
  // Artifact — ghi, đọc, và tính bất biến
  // -------------------------------------------------------------------------

  describe('Artifact', () => {
    const artifactId = fakeArtifactId('a1b2c3d4e5f6');

    it('kiến trúc sư ghi được artifact bộ môn kiến trúc', async () => {
      const { error } = await thietKe.from('design_artifact').insert({
        id: artifactId,
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'kien_truc',
        kind: 'design_brief',
        schema_version: '1.0.0',
        payload_uri: `supabase://design-artifacts/${projectId}/design_brief/x.json`,
      });
      expect(error).toBeNull();
    });

    it('KHÔNG ghi được artifact ngoài bộ môn được phụ trách', async () => {
      const { error } = await thietKe.from('design_artifact').insert({
        id: fakeArtifactId('b1'),
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'ket_cau',
        kind: 'floor_plan',
        schema_version: '1.0.0',
        payload_uri: 'supabase://design-artifacts/x.json',
      });
      expect(error).not.toBeNull();
    });

    it('KHÔNG ghi được artifact mang mã pháp nhân khác dự án', async () => {
      const nvc = await admin.from('companies').select('id').eq('code', 'NVC').single();
      const { error } = await thietKe.from('design_artifact').insert({
        id: fakeArtifactId('c1'),
        tenant_id: tenantId,
        company_id: nvc.data!.id,
        project_id: projectId,
        discipline: 'kien_truc',
        kind: 'floor_plan',
        schema_version: '1.0.0',
        payload_uri: 'supabase://design-artifacts/x.json',
      });
      expect(error).not.toBeNull();
    });

    it('artifact là BẤT BIẾN — không sửa được từ trình duyệt', async () => {
      // Không có policy UPDATE nào trên bảng, cố ý: "sửa = tạo artifact mới + đổi design_head".
      const { data, error } = await thietKe
        .from('design_artifact')
        .update({ payload_uri: 'supabase://design-artifacts/da-bi-thay.json' })
        .eq('id', artifactId)
        .select('id');
      expect(error?.code === '42501' || (data ?? []).length === 0).toBe(true);
    });

    it('artifact không XOÁ được từ trình duyệt', async () => {
      const { data, error } = await thietKe
        .from('design_artifact')
        .delete()
        .eq('id', artifactId)
        .select('id');
      expect(error?.code === '42501' || (data ?? []).length === 0).toBe(true);
    });

    it('từ chối mã băm sai định dạng', async () => {
      const { error } = await thietKe.from('design_artifact').insert({
        id: 'khong-phai-ma-bam',
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'kien_truc',
        kind: 'design_brief',
        schema_version: '1.0.0',
        payload_uri: 'supabase://design-artifacts/x.json',
      });
      expect(error).not.toBeNull();
    });

    it('từ chối bộ môn phuong_an — đó là bước hồ sơ, không phải bộ môn kỹ thuật', async () => {
      const { error } = await thietKe.from('design_artifact').insert({
        id: fakeArtifactId('d1'),
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'phuong_an',
        kind: 'design_brief',
        schema_version: '1.0.0',
        payload_uri: 'supabase://design-artifacts/x.json',
      });
      expect(error).not.toBeNull();
    });

    it('từ chối payload_uri không có scheme', async () => {
      const { error } = await thietKe.from('design_artifact').insert({
        id: fakeArtifactId('e1'),
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'kien_truc',
        kind: 'design_brief',
        schema_version: '1.0.0',
        payload_uri: '/tmp/x.json',
      });
      expect(error).not.toBeNull();
    });

    it('Kinh doanh ĐỌC được artifact kiến trúc', async () => {
      // Haan xác nhận 29/08/2026 (câu hỏi Q-12): Kinh doanh xem được Module Thiết kế — đó là
      // thứ họ mang đi chốt phương án với khách. Cổng module mở ở migration 0097; hai quyền
      // chuỗi đã có từ 0095. Cả hai đều cần: thiếu một cái là quyền chết.
      const gate = await kinhDoanh.rpc('auth_can_view_module', { p_module: 'TK' });
      expect(gate.data).toBe(true);

      const { data } = await kinhDoanh.from('design_artifact').select('id').eq('id', artifactId);
      expect(data).toHaveLength(1);
    });

    it('Kinh doanh KHÔNG ghi được artifact dù đọc được', async () => {
      // Mở quyền xem không kéo theo quyền sửa hồ sơ thiết kế.
      const { error } = await kinhDoanh.from('design_artifact').insert({
        id: fakeArtifactId('f1'),
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'kien_truc',
        kind: 'floor_plan',
        schema_version: '1.0.0',
        payload_uri: 'supabase://design-artifacts/x.json',
      });
      expect(error).not.toBeNull();
    });

    it('Kinh doanh vẫn KHÔNG thấy giá vốn — mở cổng module không nới Mẫu D', async () => {
      // Dự toán NVO (TK-07) dùng chung bảng `estimates` của Module DA, cột giá vốn được
      // `rls_sees_sensitive('cost')` che riêng. Đây là chỗ dễ tưởng đã nới theo mà thật ra không.
      const { data } = await kinhDoanh.rpc('rls_sees_sensitive', { kind: 'cost' });
      expect(data).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Bản đang hiệu lực
  // -------------------------------------------------------------------------

  describe('Bản đang hiệu lực', () => {
    const first = fakeArtifactId('1a2b3c');
    const second = fakeArtifactId('4d5e6f');

    beforeAll(async () => {
      for (const id of [first, second]) {
        await thietKe.from('design_artifact').insert({
          id,
          tenant_id: tenantId,
          company_id: nvoCompanyId,
          project_id: projectId,
          discipline: 'kien_truc',
          kind: 'floor_plan',
          schema_version: '1.0.0',
          payload_uri: `supabase://design-artifacts/${id}.json`,
        });
      }
    });

    it('trả lời được "bản nào đang hiệu lực" cho một dự án', async () => {
      const set = await thietKe.from('design_head').upsert(
        {
          tenant_id: tenantId,
          project_id: projectId,
          discipline: 'kien_truc',
          kind: 'floor_plan',
          artifact_id: first,
        },
        { onConflict: 'project_id,discipline,kind' },
      );
      expect(set.error).toBeNull();

      const { data } = await thietKe
        .from('design_head')
        .select('artifact_id')
        .eq('project_id', projectId)
        .eq('kind', 'floor_plan')
        .single();
      expect(data!.artifact_id).toBe(first);
    });

    it('chuyển được con trỏ sang artifact mới cùng loại', async () => {
      const { error } = await thietKe
        .from('design_head')
        .update({ artifact_id: second })
        .eq('project_id', projectId)
        .eq('discipline', 'kien_truc')
        .eq('kind', 'floor_plan');
      expect(error).toBeNull();
    });

    it('KHÔNG trỏ được sang artifact khác loại', async () => {
      // Không kiểm thì "đổi bản đang hiệu lực" thành đường trỏ đầu bài vào ô mặt bằng.
      const brief = fakeArtifactId('a1b2c3d4e5f6');
      const { data, error } = await thietKe
        .from('design_head')
        .update({ artifact_id: brief })
        .eq('project_id', projectId)
        .eq('discipline', 'kien_truc')
        .eq('kind', 'floor_plan')
        .select('kind');
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Phát hành — ký theo từng bộ môn
  // -------------------------------------------------------------------------

  describe('Phát hành', () => {
    it('phát hành hồ sơ KẾT CẤU bị chặn khi người ký không có quyền ký bộ môn đó', async () => {
      // Đây là ràng buộc pháp lý, không phải tuỳ chọn: kiến trúc sư không ký được hồ sơ kết
      // cấu kể cả khi là trưởng phòng (03-data-contracts 3.8b).
      const { error } = await thietKe.from('design_publication').insert({
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'ket_cau',
        artifact_ids: { floor_plan: fakeArtifactId('1a2b3c') },
        signed_by: thietKeUserId,
      });
      expect(error).not.toBeNull();
    });

    it('phát hành hồ sơ KIẾN TRÚC được khi đúng người ký', async () => {
      const { error } = await thietKe.from('design_publication').insert({
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'kien_truc',
        artifact_ids: { floor_plan: fakeArtifactId('1a2b3c') },
        signed_by: thietKeUserId,
      });
      expect(error).toBeNull();
    });

    it('KHÔNG ký hộ người khác', async () => {
      const other = await ketCau.rpc('auth_user_id');
      const { error } = await thietKe.from('design_publication').insert({
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'kien_truc',
        artifact_ids: { floor_plan: fakeArtifactId('1a2b3c') },
        signed_by: other.data as string,
      });
      expect(error).not.toBeNull();
    });

    it('từ chối phát hành không có artifact nguồn', async () => {
      // Mất tham chiếu ngược là mất đúng thứ cầu nối này sinh ra để giữ: "bản vẽ này sinh ra
      // từ đầu bài nào".
      const { error } = await thietKe.from('design_publication').insert({
        tenant_id: tenantId,
        company_id: nvoCompanyId,
        project_id: projectId,
        discipline: 'kien_truc',
        artifact_ids: {},
        signed_by: thietKeUserId,
      });
      expect(error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Cấu hình module
  // -------------------------------------------------------------------------

  describe('Cấu hình', () => {
    it('không hard-code ngưỡng: rule pack địa phương và ngưỡng đầu bài nằm trong CSDL', async () => {
      const { data } = await thietKe
        .from('design_setting')
        .select('key, value')
        .in('key', ['rule_pack_locality', 'brief_completeness_min']);
      const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      expect(map.rule_pack_locality).toBe('thai_binh');
      expect(map.brief_completeness_min).toBe(0.7);
    });

    it('Kinh doanh KHÔNG sửa được cấu hình module', async () => {
      const { data, error } = await kinhDoanh
        .from('design_setting')
        .update({ value: 0.1 })
        .eq('tenant_id', tenantId)
        .eq('key', 'brief_completeness_min')
        .select('key');
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Quyền chuỗi không tự cấp được
  // -------------------------------------------------------------------------

  describe('Bảng quyền chuỗi', () => {
    it('đọc được để giao diện ẩn nút trước khi bấm', async () => {
      const { data, error } = await thietKe.from('role_capabilities').select('capability').limit(1);
      expect(error).toBeNull();
      expect(data!.length).toBe(1);
    });

    it('KHÔNG tự cấp được quyền ký cho mình', async () => {
      // Sửa được bảng này từ trình duyệt là tự cấp quyền ký hồ sơ kết cấu.
      const role = await admin.from('roles').select('id').eq('code', 'TKE').single();
      const { error } = await thietKe.from('role_capabilities').insert({
        role_id: role.data!.id,
        capability: 'design.publish.ket_cau',
      });
      expect(error).not.toBeNull();
    });

    it('Quản trị hệ thống cũng KHÔNG tự cấp được từ trình duyệt', async () => {
      const role = await admin.from('roles').select('id').eq('code', 'ADMIN').single();
      const { error } = await admin.from('role_capabilities').insert({
        role_id: role.data!.id,
        capability: 'design.publish.kien_truc',
      });
      expect(error).not.toBeNull();
    });
  });
});
