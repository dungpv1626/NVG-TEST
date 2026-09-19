/**
 * Ô «Yêu cầu sửa» trên một phương án mặt bằng đã lưu (T53, 16/09/2026).
 *
 * Haan: luồng tự động chỉ cần đạt ngưỡng 65 điểm, rồi «có một ô chat để kĩ sư đưa vào yêu cầu của họ
 * sau khi review bản vẽ … ấn sửa lại». AI dịch câu yêu cầu thành thao tác (dời cửa, bỏ vách, đổi chỗ,
 * đổi diện tích…), chương trình áp lên chính bản vẽ này và chấm lại. Ba điều màn hình phải nói ra:
 *
 *  · **Bản gốc không đổi.** Bản sửa là phương án MỚI trong danh sách — artifact bất biến.
 *  · **Mỗi lần sửa là lượt gọi tính tiền.** Không hứa con số, chỉ nói đúng số lượt tối đa.
 *  · **Phần AI không làm được** hiện nguyên văn — im lặng thì kỹ sư tưởng yêu cầu đã được làm hết.
 */

import { formatNumber } from '@nvg/shared';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { AiPlanReview } from '@/hooks/use-ai-design';
import { Chip, Panel } from '../tk-ui';

/** Ghi chú lượt sửa trong kết quả lượt chạy — mã do Worker đặt (`applyEditStep`). */
export interface PlanEditNote {
  code: string;
  message: string;
}

export function PlanEditPanel({
  review,
  level,
  readOnly,
  disabled,
  pending,
  error,
  notes,
  onSubmit,
}: {
  review: AiPlanReview;
  level: number;
  readOnly: boolean;
  /** Đang có lượt chạy, hoặc chưa chọn model. */
  disabled: boolean;
  pending: boolean;
  error: string | null;
  /** Ghi chú của lượt sửa vừa đúc ra CHÍNH phương án này; rỗng khi không phải. */
  notes: readonly PlanEditNote[];
  onSubmit: (instruction: string) => void;
}): React.ReactElement {
  const [text, setText] = useState('');
  const percent =
    review.score && review.score.scoredWeight > 0
      ? (review.score.points / review.score.scoredWeight) * 100
      : null;
  const threshold = review.acceptPercent ?? null;
  const passed = percent !== null && threshold !== null ? percent >= threshold : null;
  const rooms = review.levels.find((item) => item.level === level)?.roomList ?? [];
  const edit = review.generator.edit ?? null;
  const applied = notes.filter((note) => note.code === 'edit_applied');
  const explanation = notes.find((note) => note.code === 'edit_explanation');
  const unsupported = notes.filter((note) => note.code === 'edit_unsupported');

  return (
    <Panel
      title="Yêu cầu sửa"
      aside={
        passed === null ? undefined : (
          <Chip tone={passed ? 'gr' : 'am'}>
            {passed
              ? `Đạt ngưỡng ${formatNumber(threshold!)}`
              : `Dưới ngưỡng ${formatNumber(threshold!)}`}
          </Chip>
        )
      }
    >
      {percent !== null && threshold !== null && (
        <p className="text-fg-subtle">
          Điểm phương án {formatNumber(percent, 1)}% trên phần chấm được.{' '}
          {passed
            ? 'Luồng tự động dừng ở đây; chỗ còn chưa hợp lý sửa bằng ô dưới.'
            : 'Luồng tự động đã dùng hết lượt sửa mà chưa đạt ngưỡng — nên sửa tiếp bằng ô dưới hoặc xếp lại.'}
        </p>
      )}

      {edit && (
        <p className="mt-2">
          Bản sửa theo yêu cầu: <q>{edit.instruction}</q>
        </p>
      )}
      {explanation && <p className="mt-2">{explanation.message}</p>}
      {applied.length > 0 && (
        <ul className="mt-2 space-y-1">
          {applied.map((note) => (
            <li key={note.message} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-completed" aria-hidden />
              {note.message}
            </li>
          ))}
        </ul>
      )}
      {unsupported.length > 0 && (
        <ul className="mt-2 space-y-1">
          {unsupported.map((note) => (
            <li key={note.message} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-pending" aria-hidden />
              Chưa làm: {note.message}
            </li>
          ))}
        </ul>
      )}

      {readOnly ? null : review.editable === false ? (
        <p className="mt-3 text-fg-subtle">
          Phương án này tạo trước khi lưu cây chia nên không sửa trực tiếp được. Xếp lại mặt bằng
          rồi sửa trên phương án mới.
        </p>
      ) : (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim().length >= 3) onSubmit(text.trim());
          }}
        >
          <Field
            label="Nội dung cần sửa"
            hint="Gọi phòng theo tên và diện tích trên tờ vẽ, hoặc theo mã bên dưới. Mỗi ý một câu."
          >
            <textarea
              id="plan-edit-request"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Ví dụ: cửa phòng ngủ 26 m² tầng 1 chuyển về cuối vách hành lang; bỏ vách giữa phòng khách và chỗ để xe."
              className="w-full rounded-sm border border-border bg-surface px-3 py-2"
            />
          </Field>
          {rooms.length > 0 && (
            <p className="text-fg-subtle">
              Mã phòng tầng {level}:{' '}
              {rooms
                .map(
                  (room) =>
                    `${room.id} (${review.roomLabels[room.type] ?? room.type} ${formatNumber(room.area_m2, 1)} m²)`,
                )
                .join(' · ')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="secondary"
              disabled={disabled || pending || text.trim().length < 3}
            >
              {pending ? 'Đang gửi…' : 'Sửa lại'}
            </Button>
            <span className="text-fg-subtle">
              Một lượt gọi mô hình tính tiền, thêm tối đa ba lượt nếu thao tác không áp được. Bản
              sửa thành phương án mới; phương án đang xem giữ nguyên.
            </span>
          </div>
          {error && <p className="text-status-overdue">{error}</p>}
        </form>
      )}
    </Panel>
  );
}
