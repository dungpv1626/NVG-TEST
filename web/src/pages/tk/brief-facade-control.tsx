/**
 * Ô «Yêu cầu mặt đứng» của biểu mẫu đầu bài (T114) — tách khỏi `brief-field.tsx` để nạp lười.
 */

import {
  briefFacadeFromFacadeBrief,
  facadeBriefFromBrief,
  type BriefFacade,
} from '@nvg/shared/design';
import { Skeleton } from '@/components/ui/states';
import { useFacadeVocabulary } from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { FacadeBriefFields } from './ai/ai-facade-brief-form';

/**
 * Phần yêu cầu mặt đứng của đầu bài (T114) — cùng bộ ô với bước Mặt đứng của AI Design.
 *
 * Danh sách chọn là danh mục `kb/facade_vocabulary.yaml` do Worker phát; tải hỏng thì nói ra,
 * không vẽ một phiếu rỗng trông như đã tải xong. Ô phong cách bỏ đi vì đầu bài có câu riêng.
 */
export function FacadeControl({
  value,
  onChange,
  briefStyle = null,
}: {
  value: BriefFacade | null | undefined;
  onChange: (value: unknown) => void;
  /** Phong cách đầu bài đã chọn — ô chọn lọc theo phong cách này (T175). */
  briefStyle?: string | null;
}) {
  const vocab = useFacadeVocabulary();
  if (vocab.isLoading) return <Skeleton className="h-40 w-full" />;
  if (vocab.error || !vocab.data) {
    return (
      <p className="text-status-overdue">
        Không tải được danh mục vật liệu và màu mặt đứng. {toUserMessage(vocab.error)}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <FacadeBriefFields
        draft={facadeBriefFromBrief(value ?? undefined, null)}
        onChange={(next) => onChange(briefFacadeFromFacadeBrief(next))}
        vocab={vocab.data}
        plan={null}
        withStyle={false}
        briefStyle={briefStyle}
      />
    </div>
  );
}
