/**
 * Xác nhận đầu bài (T114: tách khỏi `index.ts`). Xem `confirmBrief`.
 */

import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ArtifactRepository } from '../artifacts';
import { denyUnlessWritable, type UserDb } from '../auth-scope';
import type { DesignEnv } from '../env';
import { readEffectiveBriefForm } from './form-config';
import { briefConfirmBlock, readCompletenessThreshold } from './gate';
import { buildBriefPayload } from './payload';

export type ConfirmBriefResult =
  | {
      ok: true;
      artifactId: string;
      completenessScore: number;
      missingFields: string[];
      issues: ReturnType<typeof buildBriefPayload>['issues'];
    }
  | { ok: false; error: string; status: ContentfulStatusCode };

/**
 * Xác nhận một phiên bản đầu bài — đúc artifact `design_brief` bất biến, đặt head, ghi dấu xác nhận.
 *
 * Tách khỏi route `POST /design/brief/confirm` (T114) vì có nơi gọi thứ hai: bước Mặt đứng của AI
 * Design lưu phần yêu cầu mặt đứng thành phiên bản đầu bài mới rồi xác nhận luôn (Haan 03/10/2026).
 * Hai nơi một hàm: xác nhận là việc bất biến, hai bản chép của nó sẽ lệch nhau.
 *
 * Đọc mọi thứ qua `db` của người bấm (RLS); chỉ lệnh ghi artifact dùng `service_role`.
 */
export async function confirmBrief(
  env: DesignEnv,
  db: UserDb,
  briefId: string,
): Promise<ConfirmBriefResult> {
  // Đọc qua RLS: người không được xem đầu bài thì cũng không đúc được artifact từ nó. Không
  // chép lại điều kiện quyền ở tầng Worker — bản trong CSDL mới là bản không vòng qua được.
  const brief = await db
    .from('design_briefs')
    .select(
      'id, company_id, design_project_id, structured, confirmed_at, is_current_version, ' +
        'project:design_projects!design_briefs_design_project_id_design_projects_id_fk(code, company_id)',
    )
    .eq('id', briefId)
    .is('deleted_at', null)
    .maybeSingle();

  if (brief.error) return { ok: false, error: 'Không đọc được đầu bài cần xác nhận.', status: 500 };
  if (!brief.data) {
    return {
      ok: false,
      error:
        'Không tìm thấy đầu bài, hoặc tài khoản không được sửa hồ sơ thiết kế này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được việc này.',
      status: 404,
    };
  }
  // Quan hệ lồng làm suy kiểu của thư viện khách rối; khai tường minh hình dạng đã chọn.
  const row = brief.data as unknown as {
    company_id: string;
    design_project_id: string;
    structured: unknown;
    confirmed_at: string | null;
    is_current_version: boolean;
    project: { code: string; company_id: string };
  };

  if (!row.is_current_version) {
    return { ok: false, error: 'Chỉ xác nhận được đầu bài đang hiệu lực.', status: 409 };
  }
  if (row.confirmed_at) {
    return { ok: false, error: 'Đầu bài này đã được xác nhận.', status: 409 };
  }

  // Tenant suy từ pháp nhân, không bắt trình duyệt gửi: phạm vi tenant của một người ĐÃ được
  // xác định bởi các pháp nhân họ được gán (CLAUDE.md 8.8 điểm 4).
  const company = await db.from('companies').select('tenant_id').eq('id', row.company_id).single();
  if (company.error)
    return { ok: false, error: 'Không xác định được phạm vi dữ liệu của hồ sơ.', status: 500 };

  // Kiểm quyền GHI trước khi đúc: artifact và `design_head` ghi bằng `service_role`, còn
  // lệnh UPDATE `design_briefs` ở dưới mới đi qua RLS. Không kiểm ở đây thì người chỉ xem
  // được vẫn đổi head xong rồi mới bị chặn ở bước cuối — head trỏ vào bản chưa ai ký nhận.
  const denied = await denyUnlessWritable(
    db,
    company.data.tenant_id as string,
    row.design_project_id,
  );
  if (denied) return { ok: false, error: denied.error, status: denied.status };

  const actor = await db.rpc('auth_user_id');

  // Cấu hình biểu mẫu HIỆU LỰC của tenant — trọng số và câu hỏi tự thêm của quản trị viên.
  // Chấm điểm theo bản gốc trong khi người dùng điền bản đã sửa là hai con số khác nhau về
  // cùng một đầu bài, mà con số đi vào artifact thì bất biến.
  const form = await readEffectiveBriefForm(db, company.data.tenant_id as string);

  const built = buildBriefPayload({
    structured: row.structured,
    projectId: row.design_project_id,
    projectCode: row.project.code,
    config: form.config,
  });

  // Cổng đầy đủ + mâu thuẫn nghiêm trọng đặt cả ở đây, không chỉ ở nút trên màn hình (T164):
  // đầu bài đã xác nhận thì bất biến, xác nhận một bản chưa dựng nổi mặt bằng là khoá lỗi lại.
  const blocked = briefConfirmBlock(
    built.payload,
    await readCompletenessThreshold(db, company.data.tenant_id as string),
  );
  if (blocked) return { ok: false, error: blocked, status: 422 };

  // Đúc artifact TRƯỚC khi đánh dấu xác nhận: hợp đồng thiếu trường bắt buộc thì dừng ở đây
  // với câu đọc được, và đầu bài vẫn ở trạng thái sửa được.
  const repo = new ArtifactRepository(env);
  const artifact = await repo.write({
    scope: {
      tenantId: company.data.tenant_id as string,
      companyId: row.company_id,
      projectId: row.design_project_id,
      discipline: 'kien_truc',
      actorId: (actor.data as string | null) ?? null,
    },
    kind: 'design_brief',
    payload: built.payload,
    step: 'layer1_brief',
    params: {
      form_config_version: form.config.version,
      // Đúc bằng bản gốc dù tenant có lớp phủ: ghi lại để về sau tra ra được, thay vì đoán.
      form_overlay: form.overlayApplied ? 'applied' : form.fellBack ? 'fallback' : 'none',
    },
    setHead: true,
  });

  // Một lệnh ghi duy nhất: điểm đã tính lại, dấu xác nhận và mã artifact cùng lúc. Tách ra
  // thì có ngày lệnh thứ hai hỏng và đầu bài mang dấu xác nhận với điểm cũ — mà lúc đó
  // trigger đóng băng đã có hiệu lực, không sửa lại được nữa.
  const saved = await db
    .from('design_briefs')
    .update({
      structured: built.payload,
      confirmed_at: new Date().toISOString(),
      confirmed_by: (actor.data as string | null) ?? null,
      artifact_id: artifact.id,
    })
    .eq('id', briefId)
    .select('id')
    .single();
  if (saved.error) {
    // Nguyên văn PostgREST là tiếng Anh và có thể mang tên trigger — chỉ ghi log (CGD 5.5).
    console.error('brief/confirm: không ghi được dấu xác nhận', saved.error);
    return {
      ok: false,
      error:
        'Đã đúc đầu bài nhưng không ghi được dấu xác nhận. Tải lại trang rồi thử lại; nếu vẫn lỗi, báo Quản trị hệ thống.',
      status: 500,
    };
  }

  return {
    ok: true,
    artifactId: artifact.id,
    completenessScore: built.completenessScore,
    missingFields: built.missingFields,
    issues: built.issues,
  };
}
