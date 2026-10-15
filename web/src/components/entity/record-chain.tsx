/**
 * Dải «Chuỗi hồ sơ» — Cơ hội → Gói thầu / Thiết kế → Hợp đồng → Công trình, mỗi mắt xích là một
 * liên kết tới hồ sơ đó kèm giai đoạn hiện tại.
 *
 * Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 3–4): từ một hồ sơ không thấy được hồ sơ trước và sau
 * nó ở module khác, nên trạng thái lệch nhau mà không ai nhận ra. CSDL (`record_chain`, 0159) chỉ
 * trả hồ sơ người dùng được xem; chuỗi chỉ có một mắt xích (chính hồ sơ này) thì không vẽ.
 */

import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import {
  BIDDING_STAGE_META,
  CONTRACT_STAGE_META,
  DESIGN_STAGE_META,
  OPPORTUNITY_STAGE_META,
  SITE_STAGE_META,
} from '@nvg/shared';
import { useRecordChain, type ChainKind, type ChainRecord } from '@/hooks/use-record-chain';
import { cn } from '@/lib/utils';

const KIND: Record<
  ChainKind,
  { label: string; route: string; stages: Record<string, { label: string }> }
> = {
  opportunity: { label: 'Cơ hội', route: '/crm/co-hoi', stages: OPPORTUNITY_STAGE_META },
  bidding: { label: 'Gói thầu', route: '/da/goi-thau', stages: BIDDING_STAGE_META },
  design: { label: 'Thiết kế', route: '/tk/du-an', stages: DESIGN_STAGE_META },
  contract: { label: 'Hợp đồng', route: '/hd/hop-dong', stages: CONTRACT_STAGE_META },
  site: { label: 'Công trình', route: '/tc/cong-trinh', stages: SITE_STAGE_META },
};

export function RecordChain({ kind, id }: { kind: ChainKind; id: string }) {
  const { data } = useRecordChain(kind, id);
  const chain = data ?? [];
  if (chain.length < 2) return null;

  return (
    <nav aria-label="Chuỗi hồ sơ" className="mb-4 lg:mb-6">
      <ol className="flex flex-wrap items-stretch gap-1.5 text-sm">
        {chain.map((r, i) => (
          <Fragment key={`${r.kind}-${r.id}`}>
            {i > 0 && (
              <li aria-hidden className="flex items-center text-fg-subtle">
                <ChevronRight className="size-4" />
              </li>
            )}
            <li>
              <ChainLink record={r} current={r.kind === kind && r.id === id} />
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

function ChainLink({ record, current }: { record: ChainRecord; current: boolean }) {
  const meta = KIND[record.kind];
  const stage = meta.stages[record.stage]?.label ?? record.stage;
  const body = (
    <>
      <span className="block text-xs text-fg-subtle">{meta.label}</span>
      <span className="block font-mono text-xs">{record.code}</span>
      <span className="block text-xs">{stage}</span>
    </>
  );
  const box = 'block rounded-sm border px-2.5 py-1.5';
  if (current) {
    return (
      <span aria-current="page" className={cn(box, 'border-brand bg-brand-subtle')}>
        {body}
      </span>
    );
  }
  return (
    <Link
      to={`${meta.route}/${record.id}`}
      title={record.title}
      className={cn(box, 'border-border bg-surface hover:bg-surface-hover')}
    >
      {body}
    </Link>
  );
}
