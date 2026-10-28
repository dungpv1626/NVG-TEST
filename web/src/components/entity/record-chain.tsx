/**
 * Dải «Chuỗi hồ sơ» — Cơ hội → Gói thầu / Thiết kế → Hợp đồng → Công trình, mỗi mắt xích là một
 * liên kết tới hồ sơ đó kèm giai đoạn hiện tại.
 *
 * Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 3–4): từ một hồ sơ không thấy được hồ sơ trước và sau
 * nó ở module khác, nên trạng thái lệch nhau mà không ai nhận ra. CSDL (`record_chain`, 0159) chỉ
 * trả hồ sơ người dùng được xem; chuỗi chỉ có một mắt xích (chính hồ sơ này) thì không vẽ.
 */

import { Link } from 'react-router-dom';
import {
  BIDDING_STAGE_META,
  CONTRACT_STAGE_META,
  DESIGN_STAGE_META,
  OPPORTUNITY_STAGE_META,
  SITE_STAGE_META,
} from '@nvg/shared';
import { useRecordChain, type ChainKind, type ChainRecord } from '@/hooks/use-record-chain';
import { cn } from '@/lib/utils';
import { DetailAside } from './detail-aside';

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
    // v2: thẻ «Chuỗi hồ sơ» dọc, mỗi hồ sơ một chấm trên đường nối; sang cột phải trang chi tiết.
    <DetailAside place="chain">
      <nav aria-label="Chuỗi hồ sơ" className="mb-4 rounded-card bg-surface p-4 lg:mb-5 2xl:mb-0">
        <h2 className="mb-2 text-xs font-semibold text-ink-subtle">Chuỗi hồ sơ</h2>
        {/* Ở cột phải (2xl) xếp dọc trên một đường nối; nằm trong cột chính thì xếp ngang cho gọn. */}
        <ol
          className={cn(
            'relative flex flex-wrap gap-x-6 gap-y-2',
            '2xl:block 2xl:space-y-2 2xl:before:absolute 2xl:before:top-2 2xl:before:bottom-2',
            '2xl:before:left-[5px] 2xl:before:w-px 2xl:before:bg-border',
          )}
        >
          {chain.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="relative flex gap-3">
              <span
                aria-hidden
                className={cn(
                  'relative mt-1.5 size-[11px] shrink-0 rounded-full border-2',
                  r.kind === kind && r.id === id
                    ? 'border-shell bg-shell'
                    : 'border-brand bg-surface',
                )}
              />
              <ChainLink record={r} current={r.kind === kind && r.id === id} />
            </li>
          ))}
        </ol>
      </nav>
    </DetailAside>
  );
}

function ChainLink({ record, current }: { record: ChainRecord; current: boolean }) {
  const meta = KIND[record.kind];
  const stage = meta.stages[record.stage]?.label ?? record.stage;
  const body = (
    <>
      <span className="block text-xs text-ink-subtle">
        {meta.label} · <span className="font-mono">{record.code}</span>
      </span>
      <span className="block text-xs">{current ? `${stage} — đang xem` : stage}</span>
    </>
  );
  if (current) {
    return (
      <span aria-current="page" className="block min-w-0 font-semibold">
        {body}
      </span>
    );
  }
  return (
    <Link
      to={`${meta.route}/${record.id}`}
      title={record.title}
      className="block min-w-0 rounded-sm text-brand hover:underline"
    >
      {body}
    </Link>
  );
}
