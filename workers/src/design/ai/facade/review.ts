/**
 * KỸ SƯ CHẤM LẠI bản mặt đứng, đè lên điểm máy trên đúng bảng tiêu chí ấy (T63, 20/09/2026).
 *
 * Haan chọn «Máy chấm + kỹ sư chấm lại». Bộ này là nửa sau: máy đưa ra một con số đo được, người
 * có quyền nói nó sai và nói sai ở tiêu chí nào. Bốn ranh giới:
 *
 * 1. **Không chấm là KHÔNG PHẢI chấm 0.** Tiêu chí kỹ sư bỏ qua giữ nguyên điểm máy. Vì vậy hợp
 *    đồng chỉ chở những tiêu chí đã chấm, và một bảng chấm rỗng bằng đúng «đồng ý với máy».
 * 2. **Kỹ sư chấm được chỗ máy BỎ TRỐNG.** Tiêu chí máy thiếu đầu vào (`score: null`, trọng số vẫn
 *    còn) mà người chấm được thì phần trọng số ấy quay lại mẫu số — đó là giá trị lớn nhất của việc
 *    chấm tay, không phải chuyện sửa vài con số máy đã có.
 * 3. **Tiêu chí KHÔNG ÁP DỤNG có trọng số 0**, nên chấm tay lên nó không dịch chuyển con số nào.
 *    Màn hình vì thế không được mời kỹ sư chấm những tiêu chí ấy: một ô nhập không có tác dụng là
 *    một lời nói dối im lặng. Ở đây vẫn nhận, để phía gọi tự quyết cách hiện.
 * 4. **Không phải phê duyệt.** Con số này không mở khoá gì — kết quả AI vẫn là nháp cho tới khi
 *    duyệt qua đúng luồng (PRD 2.3).
 */

import type { AiFacadeReview } from '@nvg/shared/design';
import type { FacadeQuality } from './quality';
import { rollUp, type FacadeCriterionScore, type FacadeScore } from './score';

/** Bản hợp đồng `ai-facade-review` mà máy chủ đang ghi. */
export const FACADE_REVIEW_SCHEMA_VERSION = '1.0.0';

export interface ReviewedFacadeScore extends FacadeScore {
  /** Mã tiêu chí kỹ sư đã chấm — kể cả khi chấm trùng điểm máy. */
  reviewed: string[];
  /** Mã tiêu chí kỹ sư chấm KHÁC máy. Đây mới là chỗ đáng đọc. */
  changed: string[];
  /** Thước lúc chấm tay có đúng thước đang dùng không. Lệch thì hai thang điểm không so được. */
  staleRuler: boolean;
}

export function applyFacadeReview(
  score: FacadeScore,
  review: AiFacadeReview,
  quality: FacadeQuality,
): ReviewedFacadeScore {
  const byCode = new Map(review.criteria.map((row) => [row.code, row]));
  const reviewed: string[] = [];
  const changed: string[] = [];

  const criteria: FacadeCriterionScore[] = score.criteria.map((c) => {
    const row = byCode.get(c.code);
    if (!row) return c;
    reviewed.push(c.code);
    if (row.score !== c.score) changed.push(c.code);
    return {
      ...c,
      score: row.score,
      // Kỹ sư chấm được thì không còn «chưa chấm được» nữa; lý do của máy thay bằng lời của người.
      why: row.score === null ? (row.note ?? c.why) : null,
      giaiThich: row.note ?? c.giaiThich,
    };
  });

  return {
    ...score,
    ...rollUp(criteria, quality.groups),
    criteria,
    reviewed,
    changed,
    staleRuler: review.score_version !== quality.scoreVersion,
  };
}
