/**
 * Cổng chặn Lớp 2: đầu bài chưa đủ thông tin thì không sinh chương trình không gian.
 *
 * Nguồn: `doc/design/03-data-contracts.md` mục 3.1 — "`completeness_score < 0.7` thì Layer 2
 * **không được chạy** — trả về yêu cầu bổ sung thông tin. Ngưỡng để trong config, không
 * hard-code."
 *
 * Ngưỡng đọc từ `design_setting.brief_completeness_min` theo từng tenant. Điểm đọc từ
 * **artifact**, không từ cột trong bảng: cột là bản trích của payload do trình duyệt ghi,
 * còn artifact mang con số Worker tự tính lại (`brief/payload.ts`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BRIEF_FORM, checkBriefConsistency, type DesignBriefDraft } from '@nvg/shared/design';

/** Dùng khi tenant chưa cấu hình ngưỡng — bằng đúng giá trị seed của migration 0095. */
const FALLBACK_KEY = 'brief_completeness_min';

export interface GateResult {
  allowed: boolean;
  score: number;
  threshold: number;
  missingFields: string[];
  /** Câu giải thích cho người dùng khi bị chặn. Rỗng khi qua cổng. */
  message: string;
}

/**
 * Đọc ngưỡng của tenant.
 *
 * Thiếu cấu hình thì **không mặc định về một con số viết cứng**: trả `null` để lớp gọi quyết
 * định. Đặt một con số dự phòng ở đây là mở lại đúng cái cửa mà "ngưỡng để trong config" đóng
 * — cấu hình bị xoá nhầm sẽ không ai biết, hệ thống cứ chạy theo số trong mã.
 */
export async function readCompletenessThreshold(
  db: SupabaseClient,
  tenantId: string,
): Promise<number | null> {
  const { data, error } = await db
    .from('design_setting')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', FALLBACK_KEY)
    .maybeSingle();
  if (error || !data) return null;
  const value = Number(data.value);
  return Number.isFinite(value) ? value : null;
}

/**
 * Xét một đầu bài đã đúc artifact có đủ điều kiện chạy Lớp 2 không.
 *
 * Hàm thuần — ngưỡng và payload do lớp gọi đưa vào, để kiểm thử được mà không cần CSDL.
 */
export function gateLayer2(briefPayload: unknown, threshold: number | null): GateResult {
  const brief = (briefPayload ?? {}) as { completeness_score?: number; missing_fields?: string[] };
  const score = typeof brief.completeness_score === 'number' ? brief.completeness_score : 0;
  const missingFields = brief.missing_fields ?? [];

  if (threshold === null) {
    return {
      allowed: false,
      score,
      threshold: Number.NaN,
      missingFields,
      message:
        'Chưa cấu hình mức đầy đủ tối thiểu của đầu bài. Quản trị hệ thống bổ sung cấu hình trước khi dựng phương án tự động.',
    };
  }

  // Đủ điểm chưa đủ: đầu bài tự nói ngược chính nó thì mọi bước sau đều xây trên một bên của
  // mâu thuẫn mà không ai chọn (13/09/2026 — ví dụ phòng ông bà khép kín ở tầng 1 theo gia đình
  // nhưng ở tầng 2 theo danh sách phòng). Chỉ chặn mức NGHIÊM TRỌNG; cảnh báo vẫn cho chạy.
  const serious = checkBriefConsistency(briefPayload as DesignBriefDraft, BRIEF_FORM).filter(
    (issue) => issue.severity === 'nghiem_trong',
  );
  if (serious.length) {
    return {
      allowed: false,
      score,
      threshold,
      missingFields,
      message: `Đầu bài còn ${serious.length} mâu thuẫn nghiêm trọng, chưa dựng được phương án tự động: ${serious.map((i) => i.message).join(' ')}`,
    };
  }

  if (score >= threshold) {
    return { allowed: true, score, threshold, missingFields, message: '' };
  }

  const percent = (n: number) => `${Math.round(n * 100)}%`;
  const list = missingFields.length ? ` Còn thiếu: ${missingFields.join(', ')}.` : '';
  return {
    allowed: false,
    score,
    threshold,
    missingFields,
    message: `Đầu bài mới đạt ${percent(score)}, cần từ ${percent(threshold)} mới dựng được phương án tự động.${list}`,
  };
}
