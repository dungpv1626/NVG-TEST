/**
 * Tab «Lịch sử» của hồ sơ thiết kế — toàn bộ diễn biến, mới nhất lên đầu (08/10/2026).
 *
 * Trước đó tab chỉ có ba mốc giờ (tạo, cập nhật, bàn giao): mẫu Chi tiết 360° bắt buộc có tab Lịch
 * sử (AFD 4.3), mà một tab không kể được ai làm gì lúc nào thì không có giá trị truy vết. Dùng lại
 * đúng phép dựng `recentActivity` của khối «Hoạt động gần đây», bỏ giới hạn số dòng, cộng góp ý /
 * duyệt của khách, yêu cầu làm rõ và các mốc của hồ sơ.
 */

import { DESIGN_REVIEW_DECISION_LABELS, formatDateTime } from '@nvg/shared';
import { Skeleton } from '@/components/ui/states';
import {
  useChangeRequests,
  useDesignBriefs,
  useDesignReviews,
  useDesignVersions,
  type DesignProjectDetailRecord,
} from '@/hooks/use-design-projects';
import { useRfis } from '@/hooks/use-rfis';
import { cn } from '@/lib/utils';
import { recentActivity, type ActivityItem } from './activity';

const DOT: Record<ActivityItem['tone'], string> = {
  brief: 'bg-tk-bl-fg',
  version: 'bg-tk-acc',
  change: 'bg-tk-am-fg',
  review: 'bg-tk-pu-fg',
  rfi: 'bg-tk-gr-fg',
  milestone: 'bg-tk-t3',
};

export function HistoryTimeline({ project }: { project: DesignProjectDetailRecord }) {
  const briefs = useDesignBriefs(project.id);
  const versions = useDesignVersions(project.id);
  const changes = useChangeRequests(project.id);
  const reviews = useDesignReviews((versions.data ?? []).map((v) => v.id));
  const rfis = useRfis({ designProjectId: project.id });

  if (briefs.isLoading || versions.isLoading || changes.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const titleOf = new Map((versions.data ?? []).map((v) => [v.id, v.title]));
  const items = recentActivity(
    {
      briefs: briefs.data ?? [],
      versions: versions.data ?? [],
      changes: changes.data ?? [],
      reviews: Object.entries(reviews.data ?? {}).flatMap(([versionId, list]) =>
        list.map((r) => ({
          id: r.id,
          decisionLabel: DESIGN_REVIEW_DECISION_LABELS[r.decision],
          versionTitle: titleOf.get(versionId) ?? 'bản vẽ',
          reviewer: r.reviewer_name ?? r.recorder?.full_name ?? null,
          reviewed_at: r.reviewed_at,
        })),
      ),
      rfis: (rfis.data ?? []).map((q) => ({
        id: q.id,
        code: q.code,
        title: q.title,
        created_at: q.created_at,
        requester: q.requester?.full_name ?? null,
        answered_at: q.answered_at,
        answerer: q.answerer_name ?? q.answerer?.full_name ?? null,
      })),
      milestones: [
        { id: 'tao', text: 'Lập hồ sơ thiết kế', at: project.created_at },
        ...(project.handed_over_at
          ? [{ id: 'ban-giao', text: 'Bàn giao hồ sơ thi công', at: project.handed_over_at }]
          : []),
      ],
    },
    formatDateTime,
    Number.POSITIVE_INFINITY,
  );

  return (
    <section aria-labelledby="dien-bien" className="mt-6">
      <h3 id="dien-bien" className="font-medium">
        Diễn biến hồ sơ
      </h3>
      <ul className="mt-3 grid gap-3 border-l border-border pl-4">
        {items.map((item) => (
          <li key={item.id} className="relative">
            <span
              aria-hidden
              className={cn('absolute top-1.5 -left-[21px] size-2 rounded-full', DOT[item.tone])}
            />
            <span className="block text-fg">{item.text}</span>
            <span className="block text-sm text-fg-subtle">{item.meta}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
