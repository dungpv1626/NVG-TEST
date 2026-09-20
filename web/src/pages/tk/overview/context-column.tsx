/**
 * Cột phải của Tổng quan (bản mẫu §5.5d): Hồ sơ liên quan · Nhân sự tham gia · Hoạt động gần
 * đây · Việc cần làm trước hạn.
 *
 * Bốn panel này đều đọc dữ liệu THẬT. Chỗ nào chưa có thì nói ra bằng một câu, không dựng
 * người hay hoạt động giả để lấp chỗ trống.
 */

import { Link } from 'react-router-dom';
import { DESIGN_DISCIPLINE_LABELS, formatDate, formatDateTime } from '@nvg/shared';
import { RelatedGroups, type RelatedGroup } from '@/components/entity/entity-detail';
import { Skeleton } from '@/components/ui/states';
import { useAiDesignState } from '@/hooks/use-ai-design';
import { useContractForSource } from '@/hooks/use-contracts';
import {
  useChangeRequests,
  useDesignBriefs,
  useDesignSync,
  useDesignVersions,
  useDisciplineTasks,
  type DesignProjectDetailRecord,
} from '@/hooks/use-design-projects';
import { cn } from '@/lib/utils';
import { recentActivity } from './activity';
import { GroupLabel, NotYet, Panel } from '../tk-ui';

const DOT: Record<string, string> = {
  brief: 'bg-tk-bl-fg',
  plan: 'bg-tk-pu-solid',
  version: 'bg-tk-acc',
  change: 'bg-tk-am-fg',
};

/** Chữ cái đầu của họ và tên — dùng làm ảnh đại diện khi chưa có ảnh thật. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  const first = parts[0] ?? '';
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase() || '?';
}

export function ContextColumn({
  project,
}: {
  project: DesignProjectDetailRecord;
}): React.ReactElement {
  return (
    <div className="grid content-start gap-3">
      <RelatedPanel project={project} />
      <PeoplePanel project={project} />
      <ActivityPanel project={project} />
      <DuePanel project={project} />
    </div>
  );
}

// ── Hồ sơ liên quan ───────────────────────────────────────────────────────────

function RelatedPanel({ project }: { project: DesignProjectDetailRecord }) {
  const { data: contractId } = useContractForSource('design_projects', project.id);

  const related: RelatedGroup = {
    title: 'Hồ sơ liên quan',
    records: [
      project.opportunity && {
        label: 'Cơ hội kinh doanh',
        value: `${project.opportunity.code} — ${project.opportunity.name}`,
        to: `/crm/co-hoi/${project.opportunity.id}`,
      },
      project.customer && {
        label: 'Khách hàng',
        value: project.customer.name,
        to: `/crm/khach-hang/${project.customer.id}`,
      },
      {
        label: 'Hợp đồng thiết kế',
        value: contractId ? 'Xem hợp đồng' : 'Chưa lập',
        to: contractId ? `/hd/hop-dong/${contractId}` : undefined,
      },
    ].filter((r): r is NonNullable<typeof r> => Boolean(r)),
  };

  return (
    <RelatedGroups
      related={[related]}
      from={{ label: project.name, to: `/tk/du-an/${project.id}` }}
    />
  );
}

// ── Nhân sự tham gia ──────────────────────────────────────────────────────────

function PeoplePanel({ project }: { project: DesignProjectDetailRecord }) {
  const tasks = useDisciplineTasks(project.id);

  const people: { name: string; role: string; tone: string }[] = [];
  if (project.responsible?.full_name) {
    people.push({
      name: project.responsible.full_name,
      role: 'Kiến trúc sư chủ trì',
      tone: 'bg-tk-gr-deep2 text-tk-acc',
    });
  }
  const tones = [
    'bg-tk-bl-tile text-tk-bl-fg',
    'bg-tk-pu-tile text-tk-pu-fg',
    'bg-tk-rd-tile text-tk-rd-fg',
  ];
  for (const [i, task] of (tasks.data ?? []).entries()) {
    const name = task.assignee?.full_name;
    // Người đã có ở trên rồi thì không kể lại — cùng một người phụ trách hai bộ môn là chuyện
    // thường ở một phòng thiết kế mười người.
    if (!name || people.some((p) => p.name === name)) continue;
    people.push({
      name,
      role: DESIGN_DISCIPLINE_LABELS[task.discipline],
      tone: tones[i % tones.length]!,
    });
  }

  return (
    <Panel>
      <GroupLabel>Nhân sự tham gia</GroupLabel>
      {tasks.isLoading ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : people.length === 0 ? (
        <p className="mt-2 text-xs">
          <NotYet>Chưa phân công ai. Đặt người chịu trách nhiệm ở tab Hồ sơ kỹ thuật.</NotYet>
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {people.map((p) => (
            <li key={p.name} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold',
                  p.tone,
                )}
              >
                {initials(p.name)}
              </span>
              <span className="min-w-0 text-xs">
                <span className="block truncate text-tk-tx">{p.name}</span>
                <span className="block truncate text-tk-t3">{p.role}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── Hoạt động gần đây ─────────────────────────────────────────────────────────

function ActivityPanel({ project }: { project: DesignProjectDetailRecord }) {
  const briefs = useDesignBriefs(project.id);
  const versions = useDesignVersions(project.id);
  const changes = useChangeRequests(project.id);
  const ai = useAiDesignState(project.id);

  const loading = briefs.isLoading || versions.isLoading || changes.isLoading;

  const items = recentActivity(
    {
      briefs: briefs.data ?? [],
      aiPlans: ai.data?.plans ?? [],
      versions: versions.data ?? [],
      changes: changes.data ?? [],
    },
    formatDateTime,
  );

  return (
    <Panel>
      <GroupLabel>Hoạt động gần đây</GroupLabel>
      {loading ? (
        <Skeleton className="mt-3 h-20 w-full" />
      ) : items.length === 0 ? (
        <p className="mt-2 text-xs">
          <NotYet>Chưa có hoạt động nào được ghi lại trên hồ sơ này.</NotYet>
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2.5">
              <span
                aria-hidden
                className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOT[item.tone])}
              />
              <span className="min-w-0 text-xs">
                <span className="block leading-relaxed text-tk-tx">{item.text}</span>
                <span className="block text-tk-t3">{item.meta}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── Việc cần làm trước hạn ────────────────────────────────────────────────────

function DuePanel({ project }: { project: DesignProjectDetailRecord }) {
  const findings = useDesignSync(project.id);
  const blocking = (findings.data ?? []).filter((f) => f.blocking);

  // Không hạn và cũng không vướng gì thì panel này không có nội dung — bỏ hẳn còn hơn bày một
  // hộp rỗng ở chỗ trang trọng nhất của cột phải.
  if (!project.handover_deadline && blocking.length === 0) return null;

  return (
    <section className="rounded-lg border border-tk-am-line2 bg-tk-am-bg2 p-4">
      <h3 className="text-xs font-semibold text-tk-am-fg">
        {project.handover_deadline
          ? `Việc cần làm trước ${formatDate(project.handover_deadline)}`
          : 'Việc cần làm'}
      </h3>
      {blocking.length === 0 ? (
        <p className="mt-1.5 text-xs leading-relaxed text-tk-am-fg2">
          Không còn hạng mục nào chặn bàn giao. Chọn phương án trình khách và phát hành bộ bản vẽ.
        </p>
      ) : (
        <ul className="mt-1.5 grid gap-1.5 text-xs leading-relaxed text-tk-am-fg2">
          {blocking.map((f) => (
            <li key={f.code}>{f.message}</li>
          ))}
        </ul>
      )}
      <Link
        to={`/tk/du-an/${project.id}?tab=ho-so-ky-thuat`}
        className="mt-2 inline-flex h-10 items-center text-xs text-tk-am-fg underline-offset-2 hover:underline"
      >
        Mở hồ sơ kỹ thuật
      </Link>
    </section>
  );
}
