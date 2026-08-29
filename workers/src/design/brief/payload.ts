/**
 * Dựng payload artifact `design_brief` từ cột `structured` của bảng `design_briefs`.
 *
 * Nguồn: `doc/design/03-data-contracts.md` mục 3.1.
 *
 * Tách khỏi tuyến HTTP để phần quyết định kiểm thử được mà không cần mạng, cơ sở dữ liệu
 * hay Workflow — cùng cách `digitise-steps.ts` tách khỏi `digitise.ts`.
 *
 * ## Điểm quan trọng nhất của tệp này
 *
 * Nó **TÍNH LẠI** `completeness_score` và `missing_fields`, bỏ hẳn con số máy khách gửi lên.
 *
 * Trình duyệt cũng tính điểm — cùng bộ quy tắc, cùng tệp cấu hình — nhưng đó là để hiển thị
 * ngay khi người dùng gõ. Con số đi vào artifact quyết định Lớp 2 có được chạy hay không,
 * mà artifact thì bất biến: một lần ghi sai là sai vĩnh viễn. Tin con số của trình duyệt
 * nghĩa là bất kỳ ai gọi được endpoint cũng vượt được cổng chặn bằng một dòng JSON.
 */

import {
  BRIEF_FORM,
  BRIEF_SCHEMA_VERSION,
  designBriefDraftSchema,
  designBriefSchema,
  fieldByPath,
  scoreBrief,
  checkBriefConsistency,
  type BriefIssue,
} from '@nvg/shared/design';

export interface BriefPayloadInput {
  /** Nội dung cột `design_briefs.structured`. */
  structured: unknown;
  /** `design_projects.id` — hợp đồng đòi UUID, không phải mã hiển thị. */
  projectId: string;
  /** `design_projects.code`, ví dụ `NVO-TK-2026-0001`. Chỉ để đọc. */
  projectCode: string;
}

export interface BriefPayloadResult {
  /** Payload đã sẵn sàng cho `ArtifactRepository.write` — CHƯA kiểm theo hợp đồng đầy đủ. */
  payload: Record<string, unknown>;
  completenessScore: number;
  missingFields: string[];
  issues: BriefIssue[];
}

/** Lỗi dữ liệu đầu bài — không đáng thử lại, người dùng phải sửa. */
export class BriefPayloadError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'BriefPayloadError';
  }
}

export function buildBriefPayload(input: BriefPayloadInput): BriefPayloadResult {
  const parsed = designBriefDraftSchema.safeParse(input.structured);
  if (!parsed.success) {
    // Khoá lạ hoặc kiểu sai trong `structured`. Nêu tên trường để người dùng biết sửa ở đâu.
    const where = parsed.error.issues
      .map((issue) => issue.path.join('.'))
      .filter(Boolean)
      .join(', ');
    throw new BriefPayloadError(
      `Đầu bài có dữ liệu không hợp lệ${where ? ` ở: ${where}` : ''}. Mở lại tab Đầu bài và lưu lại.`,
    );
  }

  const draft = parsed.data;
  const score = scoreBrief(draft, BRIEF_FORM);
  const issues = checkBriefConsistency(draft, BRIEF_FORM);

  const payload = {
    ...draft,
    // Ba trường dưới đây Worker cấp, KHÔNG lấy từ máy khách: hai cái đầu là khoá ngoại và
    // mã hồ sơ (đọc từ CSDL), cái thứ ba là hình dạng hợp đồng đang dùng.
    schema_version: BRIEF_SCHEMA_VERSION,
    project_id: input.projectId,
    project_code: input.projectCode,
    completeness_score: score.score,
    missing_fields: score.missingFields,
  };

  // Kiểm theo hợp đồng ĐẦY ĐỦ ngay tại đây, dù `ArtifactRepository.write` cũng kiểm.
  //
  // Không phải để chặn hai lần, mà để câu thông báo tới người dùng là tiếng Việt nghiệp vụ.
  // Lỗi của lớp hợp đồng nói "locality — Required" — đúng với người viết mã, vô nghĩa với
  // kiến trúc sư đang ngồi trước màn hình (CGD 5.5: nêu việc gì không làm được và cần làm gì,
  // không hiện mã lỗi).
  const complete = designBriefSchema.safeParse(payload);
  if (!complete.success) {
    const labels = [
      ...new Set(
        complete.error.issues.map((issue) => {
          const path = issue.path.join('.');
          return fieldByPath(BRIEF_FORM, path)?.label ?? path;
        }),
      ),
    ];
    throw new BriefPayloadError(
      `Chưa đủ thông tin bắt buộc để chốt đầu bài. Còn thiếu: ${labels.join(', ')}. Bổ sung rồi xác nhận lại.`,
    );
  }

  return {
    payload,
    completenessScore: score.score,
    missingFields: score.missingFields,
    issues,
  };
}
