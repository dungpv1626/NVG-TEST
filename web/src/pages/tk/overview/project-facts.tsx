/**
 * Panel Thông tin dự án — sáu ô (bản mẫu §5.5c).
 *
 * Ghi chú vẫn sửa được tại chỗ như trước, chỉ đổi cách bày: bản mẫu để ghi chú thành một ô
 * ngang hàng với năm ô kia, không tách ra thành một khối riêng phía dưới.
 */

import { Link } from 'react-router-dom';
import { DESIGN_STAGE_META, formatDate } from '@nvg/shared';
import type { DesignProjectDetailRecord } from '@/hooks/use-design-projects';
import { Panel } from '../tk-ui';

const EM_DASH = '—';

export function ProjectFacts({
  project,
  readOnly,
  onSaveNotes,
}: {
  project: DesignProjectDetailRecord;
  readOnly: boolean;
  onSaveNotes: (value: string) => void;
}): React.ReactElement {
  const facts: { label: string; value: React.ReactNode; accent?: boolean }[] = [
    { label: 'Bước hiện tại', value: DESIGN_STAGE_META[project.stage].label, accent: true },
    {
      label: 'Khách hàng',
      value: project.customer ? (
        <Link
          to={`/crm/khach-hang/${project.customer.id}`}
          className="text-tk-acc underline-offset-2 hover:underline"
        >
          {project.customer.name}
        </Link>
      ) : (
        EM_DASH
      ),
    },
    {
      label: 'Hạn bàn giao hồ sơ',
      value: project.handover_deadline ? formatDate(project.handover_deadline) : EM_DASH,
    },
    { label: 'Địa điểm khu đất', value: project.site_address ?? EM_DASH },
    { label: 'Nguyên nhân dừng thiết kế', value: project.stopped_reason ?? EM_DASH },
  ];

  return (
    <Panel title="Thông tin dự án">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs tracking-[0.03em] text-tk-t3 uppercase">{fact.label}</dt>
            <dd className={fact.accent ? 'mt-1.5 text-tk-acc' : 'mt-1.5'}>{fact.value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs tracking-[0.03em] text-tk-t3 uppercase">Ghi chú</dt>
          <dd className="mt-1.5">
            {readOnly ? (
              <p className="whitespace-pre-wrap">{project.notes ?? EM_DASH}</p>
            ) : (
              <textarea
                defaultValue={project.notes ?? ''}
                rows={2}
                aria-label="Ghi chú dự án thiết kế"
                className="w-full rounded-sm border border-tk-line2 bg-tk-deep px-2.5 py-2 text-tk-tx"
                onBlur={(e) => onSaveNotes(e.target.value)}
              />
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
