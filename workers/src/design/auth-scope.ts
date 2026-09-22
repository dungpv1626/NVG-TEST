/**
 * Phạm vi và quyền cho các tuyến "thay mặt người dùng" — dùng chung cho cả bộ giải nội bộ
 * lẫn nhánh AI.
 *
 * Tách khỏi `design/index.ts` ngày 09/09/2026. Lý do: nhánh AI có bộ tuyến riêng
 * (`ai/routes.ts`) và phải sống được sau khi bộ giải bị xoá (T15). Để mấy hàm này ở `index.ts`
 * thì `ai/routes.ts` phải import cả tệp đang kéo theo bộ giải, Container, Workflow và toàn bộ
 * tuyến của Lớp 3–5 — tức là nhánh AI phụ thuộc đúng thứ nó phải độc lập.
 *
 * Ở đây KHÔNG có logic nghiệp vụ: chỉ mở phiên đúng người, hỏi CSDL phạm vi và quyền, và
 * chuẩn bị dữ liệu vào cho bước ẩn danh. Mọi câu trả lời về quyền đến từ CSDL, không viết lại
 * điều kiện ở tầng Worker (CLAUDE.md 3.4).
 */

import type { DesignBrief } from '@nvg/shared/design';
import type { AnonymiseInput } from './brief/anonymise';
import { readEffectiveBriefForm } from './brief/form-config';
import { roomVocabulary } from './kb/vocabulary-data';
import type { DesignEnv } from './env';

/** Phiên Supabase chạy dưới quyền người gọi — kiểu dùng lại ở mọi hàm bên dưới. */
export type UserDb = Awaited<ReturnType<typeof asUser>>;

export interface ProjectScope {
  companyId: string;
  tenantId: string;
  actorId: string | null;
}

/**
 * Client Supabase chạy dưới PHIÊN CỦA NGƯỜI GỌI.
 *
 * Khoá `service_role` chỉ đóng vai `apikey`; vai trò thật do JWT trong `Authorization` quyết
 * định, nên RLS vẫn áp dụng đầy đủ. Đây là điều phân biệt các tuyến "thay mặt người dùng" với
 * tuyến chạy nền (Workflow) vốn cố ý vượt RLS.
 */
export async function asUser(env: DesignEnv, token: string) {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Nhãn tiếng Việt của mã phòng, gửi kèm kết quả.
 *
 * Vì sao gửi từ máy chủ chứ không khai lại ở `web/`: từ vựng phòng là MỘT tệp dữ liệu
 * (`kb/room_vocabulary.yaml`). Khai bảng nhãn thứ hai trong trình duyệt thì thêm một loại
 * phòng phải sửa hai chỗ, và chỗ quên sửa hiện ra mã máy (`altar_room`) giữa màn hình tiếng
 * Việt — đúng thứ CLAUDE.md 4.1 cấm.
 */
export function roomLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const type of roomVocabulary().vocabulary.types) out[type.code] = type.vi;
  return out;
}

/**
 * Đọc dự án dưới phiên người gọi và suy phạm vi dữ liệu từ đó.
 *
 * Đi qua RLS thay vì kiểm quyền lại ở tầng Worker: người không xem được hồ sơ thiết kế thì
 * cũng không lập được chương trình không gian cho nó, và chỉ có MỘT bản quy tắc quyền —
 * bản trong CSDL (CLAUDE.md 3.4).
 */
export async function projectScope(db: UserDb, projectId: string): Promise<ProjectScope | null> {
  const project = await db
    .from('design_projects')
    .select('id, company_id')
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();
  if (project.error || !project.data) return null;

  const companyId = project.data.company_id as string;
  const company = await db.from('companies').select('tenant_id').eq('id', companyId).single();
  if (company.error) return null;

  const actor = await db.rpc('auth_user_id');
  return {
    companyId,
    tenantId: company.data.tenant_id as string,
    actorId: (actor.data as string | null) ?? null,
  };
}

export const DESIGN_WRITE_DENIED =
  'Không đủ quyền sửa hồ sơ kiến trúc của dự án này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được việc này.';

/**
 * Hỏi CSDL "người này có được GHI bộ môn này của dự án này không" — trước mọi lệnh ghi
 * artifact hay đổi `design_head`.
 *
 * Vì sao phải hỏi riêng: `ArtifactRepository` ghi bằng `service_role` (vượt RLS), còn
 * `projectScope` chỉ chứng minh người gọi ĐỌC được dự án. Thiếu bước này, một tài khoản chỉ
 * xem (Kinh doanh, Ban Giám đốc) vẫn đổi được bản "đang hiệu lực" của đầu bài hay phương án —
 * lỗi bắt khi rà soát 08/09/2026. Hỏi đúng hàm mà policy INSERT của `design_artifact` dùng
 * (`rls_design_writable`, migration 0096) để chỉ có MỘT bản quy tắc quyền (CLAUDE.md 3.4).
 *
 * Trả `null` khi được ghi; ngược lại trả câu tiếng Việt kèm mã HTTP để route trả thẳng.
 */
export async function denyUnlessWritable(
  db: UserDb,
  tenantId: string,
  projectId: string,
  discipline: 'kien_truc' | 'ket_cau' | 'dien_nuoc' = 'kien_truc',
): Promise<{ error: string; status: 403 | 500 } | null> {
  const allowed = await db.rpc('rls_design_writable', {
    p_tenant_id: tenantId,
    p_project_id: projectId,
    p_discipline: discipline,
  });
  if (allowed.error) return { error: 'Không kiểm tra được quyền sửa hồ sơ.', status: 500 };
  if (allowed.data !== true) return { error: DESIGN_WRITE_DENIED, status: 403 };
  return null;
}

/**
 * Hỏi CSDL "người này có được ĐỌC bộ môn này của dự án này không" — trước mọi lệnh đọc
 * artifact bằng `ArtifactRepository`.
 *
 * Vì sao phải hỏi riêng, dù đã có `projectScope`. `projectScope` chỉ chứng minh người gọi
 * SELECT được dòng `design_projects` — tức `rls_company_access` cộng `auth_can_view_module('TK')`.
 * Nó KHÔNG kiểm ba chiều còn lại mà module thiết kế đòi (CLAUDE.md 8.8 mục 3): phạm vi tenant,
 * phạm vi bộ môn của dự án, và năng lực `design.read.<discipline>`. Trong khi đó
 * `ArtifactRepository` đọc bằng `service_role`, tức VƯỢT RLS.
 *
 * Thiếu bước này, một tài khoản xem được dự án nhưng không có quyền đọc bộ môn kiến trúc vẫn
 * nhận đủ nội dung artifact kiến trúc qua endpoint. Bắt khi rà soát 09/09/2026 trên
 * `GET /design/ai/state/:projectId`.
 *
 * Trả `null` khi được đọc; ngược lại trả câu tiếng Việt kèm mã HTTP để route trả thẳng. Dùng
 * đúng hàm mà policy SELECT của `design_artifact` dùng, để chỉ có MỘT bản quy tắc quyền.
 */
export async function denyUnlessReadable(
  db: UserDb,
  tenantId: string,
  projectId: string,
  discipline: 'kien_truc' | 'ket_cau' | 'dien_nuoc' = 'kien_truc',
): Promise<{ error: string; status: 404 | 500 } | null> {
  const allowed = await db.rpc('rls_design_readable', {
    p_tenant_id: tenantId,
    p_project_id: projectId,
    p_discipline: discipline,
  });
  if (allowed.error) return { error: 'Không kiểm tra được quyền xem hồ sơ.', status: 500 };
  // Trả 404 chứ không 403: người không được xem bộ môn này thì không nên biết hồ sơ có tồn tại
  // hay không, và câu chữ trùng với trường hợp không thấy dự án.
  if (allowed.data !== true) return { error: PROJECT_NOT_VISIBLE, status: 404 };
  return null;
}

export const PROJECT_NOT_VISIBLE =
  'Không tìm thấy hồ sơ thiết kế, hoặc tài khoản không được xem hồ sơ này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế xem được.';

/** Gom chữ tự do, khảo sát và danh tính cần lược — đọc qua RLS của chính người gọi. */
export async function aiDigestInputs(
  db: UserDb,
  projectId: string,
  brief: DesignBrief,
): Promise<AnonymiseInput> {
  const row = await db
    .from('design_briefs')
    .select(
      'design_task, functional_needs, style_note, site_condition, legal_documents, site_source_survey_id',
    )
    .eq('design_project_id', projectId)
    .eq('is_current_version', true)
    .is('deleted_at', null)
    .maybeSingle();
  const freeText = (row.data ?? null) as AnonymiseInput['freeText'] & {
    site_source_survey_id?: string | null;
  };
  let survey: AnonymiseInput['survey'] = null;
  if (freeText?.site_source_survey_id) {
    const s = await db
      .from('design_surveys')
      .select(
        'land_width, land_depth, land_area, orientation, measurement_notes, surrounding_notes, usage_notes, notes',
      )
      .eq('id', freeText.site_source_survey_id)
      .maybeSingle();
    survey = (s.data ?? null) as AnonymiseInput['survey'];
  }
  const project = await db
    .from('design_projects')
    .select('customer:customers(name, phone, address)')
    .eq('id', projectId)
    .maybeSingle();
  const customer = (
    project.data as { customer?: { name?: string; phone?: string; address?: string } | null } | null
  )?.customer;
  // Cấu hình biểu mẫu hiệu lực — chỉ để đọc nhãn câu hỏi quản trị viên tự thêm. Đọc ở ĐÂY chứ
  // không ở từng tuyến AI: sáu tuyến cùng gọi hàm này, và một bản sao ở mỗi tuyến là sáu chỗ
  // quên như nhau.
  const form = await readEffectiveBriefForm(db);
  return {
    brief,
    freeText,
    survey,
    identities: [customer?.name, customer?.phone, customer?.address],
    formConfig: form.config,
  };
}
