/**
 * Hộp duyệt «Quyết định tham gia gói thầu» (G6, 0247): hình thức, loại công trình, sáu tiêu chí của
 * người chịu trách nhiệm và ý kiến Cung ứng / Thi công / Kế toán — đủ để Ban Giám đốc quyết định
 * không cần mở gói thầu. Từ chối = «Không tham gia», lý do bắt buộc.
 */

import {
  BID_ASSESSMENT_CRITERIA,
  BID_ASSESSMENT_RATING_LABELS,
  BID_RECOMMENDATION_LABELS,
  BID_WORK_TYPE_LABELS,
  PROCUREMENT_FORM_LABELS,
} from '@nvg/shared';
import { useBiddingProject } from '@/hooks/use-bidding-projects';
import { BidReviewsList } from '@/pages/da/bid-reviews-panel';

export function BidParticipationPreview({ projectId }: { projectId: string }) {
  const { data, isLoading } = useBiddingProject(projectId);
  if (isLoading) return <div className="h-24 animate-pulse rounded-sm bg-surface-sunken" />;
  if (!data) {
    return <p className="text-fg-subtle">Không tải được gói thầu. Mở hồ sơ đầy đủ để xem.</p>;
  }
  const a = data.participation_assessment ?? {};
  return (
    <div className="space-y-3">
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-fg-subtle">Hình thức lựa chọn nhà thầu</dt>
          <dd>{data.procurement_form ? PROCUREMENT_FORM_LABELS[data.procurement_form] : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Loại công trình</dt>
          <dd>{data.work_type ? BID_WORK_TYPE_LABELS[data.work_type] : '—'}</dd>
        </div>
      </div>
      <div className="rounded-sm bg-surface-sunken px-3 py-2">
        <dt className="text-xs text-fg-subtle">Đánh giá của người chịu trách nhiệm</dt>
        <dd>
          <ul className="mt-1 space-y-1">
            {BID_ASSESSMENT_CRITERIA.map((c) => {
              const e = a.criteria?.[c.key];
              return (
                <li key={c.key}>
                  <span className="font-medium">{c.label}:</span>{' '}
                  <span className={e?.rating === 'rui_ro_cao' ? 'font-semibold' : undefined}>
                    {e?.rating ? BID_ASSESSMENT_RATING_LABELS[e.rating] : 'Chưa đánh giá'}
                  </span>
                  {e?.note && <span className="text-fg-subtle"> — {e.note}</span>}
                </li>
              );
            })}
          </ul>
          <p className="mt-2">
            <span className="font-semibold">
              {a.recommendation ? BID_RECOMMENDATION_LABELS[a.recommendation] : 'Chưa có đề xuất'}.
            </span>{' '}
            {a.summary}
          </p>
        </dd>
      </div>
      <div>
        <dt className="mb-1 text-xs text-fg-subtle">Ý kiến các phòng</dt>
        <dd>
          <BidReviewsList projectId={projectId} showMissing={false} />
        </dd>
      </div>
    </div>
  );
}
