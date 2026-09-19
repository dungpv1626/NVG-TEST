/**
 * Dải "Dự án gần đây" cuối trang (bản mẫu §5.5e).
 *
 * Ô ảnh phối cảnh bên trái là placeholder CÓ CHỦ ĐÍCH theo bản mẫu §3 — hệ thống chưa gắn ảnh
 * đại diện cho dự án thiết kế. Vẽ một khung rỗng có nhãn còn hơn lấy tạm một ảnh phối cảnh
 * của phương án nào đó: ảnh phối cảnh mang nhãn "chưa phải phương án thi công", đặt nó làm
 * ảnh nhận diện dự án là bóc nhãn đó ra khỏi ngữ cảnh.
 */

import { ArrowRight, Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DESIGN_STAGE_META, designDisplayStatus, formatDeadline } from '@nvg/shared';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { CardGridSkeleton } from '@/components/ui/states';
import { useDesignProjects, type DesignProjectRecord } from '@/hooks/use-design-projects';
import { Chip, NotYet, Panel } from '../tk-ui';

export function RecentProjects({ currentId }: { currentId: string }): React.ReactElement {
  const projects = useDesignProjects();
  const others = (projects.data ?? []).filter((p) => p.id !== currentId).slice(0, 3);

  return (
    <Panel
      title="Dự án gần đây"
      aside={
        <Link to="/tk/du-an" className="text-xs text-tk-acc underline-offset-2 hover:underline">
          Xem tất cả
        </Link>
      }
    >
      {projects.isLoading ? (
        <CardGridSkeleton count={3} />
      ) : others.length === 0 ? (
        <p className="text-xs">
          <NotYet>Chưa có dự án thiết kế nào khác.</NotYet>
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {others.map((p) => (
            <li key={p.id}>
              <RecentCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentCard({ project }: { project: DesignProjectRecord }): React.ReactElement {
  const status = designDisplayStatus(project.stage, project.handover_deadline);
  const countdown = project.handover_deadline ? formatDeadline(project.handover_deadline) : '';

  return (
    <Link
      to={`/tk/du-an/${project.id}`}
      className="flex gap-3 rounded-lg border border-tk-line bg-tk-card p-3 transition-[transform,background-color,border-color] duration-(--motion-base) ease-(--ease-out) hover:-translate-y-[3px] hover:border-tk-line2 hover:bg-tk-hover"
    >
      <span
        aria-hidden
        className="grid h-[78px] w-[92px] shrink-0 place-items-center rounded-sm bg-tk-deep text-tk-t3"
      >
        <ImageIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-tk-tx">{project.name}</span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-tk-t3" />
        </span>
        <span className="mt-0.5 block font-mono text-xs text-tk-t3">{project.code}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusLozenge status={status} />
          {countdown && <Chip tone={status === 'overdue' ? 'am' : 'mute'}>{countdown}</Chip>}
        </span>
        <span className="mt-2 block text-xs text-tk-t2">
          {DESIGN_STAGE_META[project.stage].label}
        </span>
      </span>
    </Link>
  );
}
