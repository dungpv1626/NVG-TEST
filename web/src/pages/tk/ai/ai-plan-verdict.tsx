/**
 * Kết luận về một phương án mặt bằng BẰNG LỜI (anh Dũng 25/10/2026: «70,2 % — dưới sàn nhóm…» khó hiểu, không chỉ
 * ra lỗi ở đâu). Thay cho chip điểm + «Ba lý do trừ điểm lớn nhất»: một câu «Đạt» / «Chưa đạt — N việc nên sửa»,
 * rồi từng việc kèm phòng bị ảnh hưởng và nút «Nhờ AI sửa» điền sẵn ô «Yêu cầu sửa».
 *
 * Đọc thẳng thước chấm ĐÃ LƯU trong phương án (`topDeductions`) và quy tắc ngưỡng của `scoreSummary` (gồm sàn
 * nhóm T96) — không chấm lại, không thêm luật. «Nhờ AI sửa» chỉ điền chữ; người dùng vẫn bấm «Sửa lại» (tốn tiền)
 * mới gọi mô hình.
 */

import { formatNumber } from '@nvg/shared';
import { CheckCircle2, AlertTriangle, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AiPlanReview } from '@/hooks/use-ai-design';
import { Panel } from '../tk-ui';
import { scoreSummary } from './ai-plan-compare';
import { roomName, topDeductions, type PlanDeduction } from './plan-deductions';

/** Số việc nêu tối đa — đủ để thấy chỗ hỏng chính, không thành bảng điểm dài. */
const MAX_ITEMS = 5;

export function planVerdict(review: AiPlanReview): {
  passed: boolean | null;
  items: PlanDeduction[];
} {
  const { passed } = scoreSummary(review);
  return { passed, items: topDeductions(review.score, MAX_ITEMS) };
}

/** Tiêu chí «phòng không có mặt thoáng» của nhóm Mặt thoáng (`kb/plan_quality.yaml`). */
const DARK_ROOM_CODES = new Set(['D1', 'D2']);

/**
 * Phòng tối mà phương án không có giếng trời / sân trong: gợi ý thêm vào đầu bài (lượt thật 9272, 29/10/2026 — biệt thự
 * 15 × 20 m chỉ hai mặt thoáng, ba phòng không cửa sổ). Đầu bài 9272 có «chỗ phơi ngoài trời» nên sân trong được PHÉP mà không
 * BẮT, và mô hình đã bỏ qua; chỉ dòng «Không gian gia chủ yêu cầu» buộc được (T96), nên người khai đầu bài quyết. `roomTypes` = loại phòng CÓ trong phương án
 * (`roomList` từng tầng). Trả danh sách phòng tối; rỗng = không gợi ý.
 */
export function lightWellAdvice(
  items: readonly PlanDeduction[],
  roomTypes: readonly string[],
): string[] {
  if (roomTypes.some((type) => type === 'light_well' || type === 'courtyard')) return [];
  return [
    ...new Set(items.filter((item) => DARK_ROOM_CODES.has(item.code)).flatMap((item) => item.refs)),
  ];
}

/** Câu yêu cầu sửa điền sẵn cho một việc — người dùng sửa lại trước khi gửi. */
export function fixRequest(item: PlanDeduction, labels: Record<string, string>): string {
  const rooms = item.refs.map((id) => roomName(id, labels)).join(', ');
  return `Cải thiện «${item.label}»${rooms ? ` ở: ${rooms}` : ''}.`;
}

export function PlanVerdict({
  review,
  onAskFix,
  canFix,
}: {
  review: AiPlanReview;
  onAskFix: (text: string) => void;
  /** Hồ sơ sửa được và phương án có cây chia (T53) — không thì ẩn nút «Nhờ AI sửa». */
  canFix: boolean;
}): React.ReactElement {
  const { percent, threshold, weakGroups } = scoreSummary(review);
  const { passed, items } = planVerdict(review);
  const darkRooms = lightWellAdvice(
    items,
    review.levels.flatMap((level) => (level.roomList ?? []).map((room) => room.type)),
  );

  if (!review.score) {
    return (
      <Panel title="Đánh giá">
        <p className="text-fg-subtle">
          Phương án xếp trước khi có thước chấm — không có điểm để đánh giá.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Đánh giá">
      <p
        className={
          passed
            ? 'flex items-center gap-2 text-lg font-semibold text-status-completed'
            : 'flex items-center gap-2 text-lg font-semibold text-status-pending'
        }
      >
        {passed ? (
          <CheckCircle2 className="size-5" aria-hidden />
        ) : (
          <AlertTriangle className="size-5" aria-hidden />
        )}
        {passed === true
          ? items.length > 0
            ? `Đạt — còn ${items.length} chỗ có thể tốt hơn`
            : 'Đạt'
          : passed === false
            ? `Chưa đạt — ${items.length} việc nên sửa`
            : // Không có ngưỡng nhận (cấu hình bỏ trống) — không phán «đạt / chưa đạt».
              `${items.length} chỗ có thể tốt hơn`}
      </p>
      <p className="mt-1 text-sm text-ink-subtle">
        {percent !== null && `Điểm ${formatNumber(percent, 1)} %`}
        {threshold !== null && ` · ngưỡng nhận ${formatNumber(threshold)} %`}
        {weakGroups.length > 0 && ` · nhóm ${weakGroups.join(', ')} dưới mức sàn`}
      </p>
      {items.length > 0 && (
        <ol className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={item.code} className="rounded-field bg-surface-sunken px-3 py-2">
              <p className="font-medium">
                {index + 1}. {item.label}{' '}
                <span className="text-sm font-normal text-ink-subtle">
                  · mất {formatNumber(item.lost, 1)} điểm
                </span>
              </p>
              {item.refs.length > 0 && (
                <p className="text-sm text-ink-subtle">
                  Chỗ bị ảnh hưởng:{' '}
                  {item.refs.map((id) => roomName(id, review.roomLabels)).join(', ')}
                </p>
              )}
              {/* Câu giải thích của thước (`giai_thich`) là ghi chú cho người phát triển (mã nhóm, mã lượt đo) — không
                  bày cho kiến trúc sư. */}
              {canFix && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-1.5"
                  onClick={() => onAskFix(fixRequest(item, review.roomLabels))}
                >
                  <Wand2 className="size-4" aria-hidden /> Nhờ AI sửa
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      {darkRooms.length > 0 && (
        <p className="mt-3 rounded-field border border-status-pending/40 px-3 py-2 text-sm">
          {darkRooms.map((id) => roomName(id, review.roomLabels)).join(', ')} không có cửa sổ ra mặt
          thoáng, và phương án không có giếng trời hay sân trong. Muốn các phòng này sáng thì ghi
          «Giếng trời» ở mục «Không gian gia chủ yêu cầu» của đầu bài rồi xếp lại — có ở đó thì AI
          buộc phải xếp.
        </p>
      )}
      {canFix && items.length > 0 && (
        <p className="mt-2 text-xs text-ink-subtle">
          «Nhờ AI sửa» chỉ điền sẵn câu vào ô «Yêu cầu sửa» bên dưới — xem lại rồi bấm «Sửa lại» mới
          gọi AI (tốn tiền).
        </p>
      )}
    </Panel>
  );
}
