/**
 * Khung «Ảnh mặt bằng có nội thất» — MỘT khung cho cả hai nguồn (Haan, 07/10/2026).
 *
 * Trước đó có hai khung riêng làm cùng một việc (vẽ mặt bằng có đồ đạc): một ở cột phải dưới tờ
 * vector (T57), một ở cột trái cho bản vẽ kỹ sư tải lên (T114 Đợt 4). Khác nhau chỉ ở ĐẦU VÀO, nên
 * gộp lại và cho chọn nguồn:
 *
 *  · «Từ phương án AI»: chính tờ mặt bằng vector của phương án đang xem (`PlanSheetImagePanel`).
 *  · «Từ bản vẽ kỹ sư»: bản vẽ thô kỹ sư tải lên — không cần có phương án AI (`AiUploadPanel`).
 *
 * Chưa có phương án AI thì khung vẫn hiện, mở sẵn nguồn bản vẽ kỹ sư.
 */

import { useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { AiPlanReview } from '@/hooks/use-ai-design';
import { Panel } from '../tk-ui';
import { PlanSheetImagePanel } from './ai-plan-sheet-image';
import { AiUploadPanel } from './ai-upload-panel';

type Source = 'ai' | 'upload';

const SOURCES: readonly Source[] = ['ai', 'upload'];

export function PlanImagePanel({
  projectId,
  review,
  level,
  readOnly,
  disabled,
}: {
  projectId: string;
  /** Phương án đang xem; `null` khi chưa có phương án AI nào. */
  review: AiPlanReview | null;
  level: number;
  readOnly: boolean;
  disabled: boolean;
}): React.ReactElement {
  const [picked, setPicked] = useState<Source>('ai');
  const source: Source = review ? picked : 'upload';

  return (
    <Panel title="Ảnh mặt bằng có nội thất">
      <div className="mb-4">
        <p className="mb-1 text-xs font-medium text-fg-subtle">Vẽ từ</p>
        <SegmentedControl
          options={SOURCES}
          value={source}
          onChange={setPicked}
          getLabel={(option) =>
            option === 'ai' ? 'Mặt bằng của phương án AI' : 'Bản vẽ kỹ sư tải lên'
          }
          disabled={!review}
        />
      </div>
      {source === 'ai' && review ? (
        <PlanSheetImagePanel
          review={review}
          level={level}
          projectId={projectId}
          readOnly={readOnly}
          disabled={disabled}
          bare
        />
      ) : (
        <AiUploadPanel
          projectId={projectId}
          drawing="plan"
          readOnly={readOnly}
          disabled={disabled}
          bare
        />
      )}
    </Panel>
  );
}
