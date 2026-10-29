/**
 * Đề xuất phát sinh từ công trường chờ văn phòng (T1, migration 0241) — đầu tab «Phát sinh» của hợp đồng.
 *
 * Chỉ huy trưởng lập đề xuất ở công trình (không có giá). Người chịu trách nhiệm hợp đồng «Lập phát
 * sinh» → một phát sinh hợp đồng ở bước «Đề xuất» (luồng có sẵn: báo giá → phê duyệt → khách xác nhận
 * → phụ lục 0229), hoặc «Không lập» kèm lý do. Công trường thấy ngay bước mới, không thấy giá.
 */

import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { SITE_CHANGE_CAUSE_LABELS, formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useConvertSiteChangeProposal,
  useRejectSiteChangeProposal,
  useSiteChangeProposals,
  type SiteChangeProposal,
} from '@/hooks/use-site-changes';
import { PhotoStrip } from '../tc/site-photo-picker';

/** Chi tiết đề xuất gốc — dùng trong khối chờ xử lý và trên thẻ phát sinh đã lập từ nó. */
export function SiteChangeSummary({ proposal: p }: { proposal: SiteChangeProposal }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="text-fg-subtle">
        {p.code} · {SITE_CHANGE_CAUSE_LABELS[p.cause]} · {p.creator?.full_name ?? '—'} ·{' '}
        {formatDateTime(p.created_at)}
      </p>
      <p className="whitespace-pre-wrap text-fg">{p.description}</p>
      {(p.location || p.measurements) && (
        <p className="text-fg-subtle">
          {[p.location && `Vị trí: ${p.location}`, p.measurements && `Số đo: ${p.measurements}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {(p.estimated_quantity != null || p.schedule_impact_days != null) && (
        <p className="text-fg-subtle">
          {[
            p.estimated_quantity != null &&
              `Khối lượng ước tính: ${Number(p.estimated_quantity).toLocaleString('vi-VN')} ${p.quantity_unit ?? ''}`,
            p.schedule_impact_days != null && `Ảnh hưởng tiến độ: ${p.schedule_impact_days} ngày`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {p.is_emergency && (
        <p className="flex gap-2 text-status-overdue">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Khẩn cấp — đã làm trước.{' '}
            {p.emergency_authorized_by
              ? `Người cho phép: ${p.authorizer?.full_name ?? '—'}`
              : `Chờ ${p.requested_to?.full_name ?? 'người có thẩm quyền'} xác nhận đã cho phép.`}
          </span>
        </p>
      )}
      <PhotoStrip paths={p.photo_paths} />
    </div>
  );
}

export function SiteChangeInbox({
  contractId,
  readOnly,
}: {
  contractId: string;
  readOnly: boolean;
}) {
  const { data } = useSiteChangeProposals({ contractId });
  const pending = (data ?? []).filter((p) => p.status === 'da_gui');
  if (pending.length === 0) return null;
  return (
    <section className="space-y-3 rounded-card border border-status-pending bg-status-pending-bg p-4">
      <h3 className="font-semibold">Đề xuất phát sinh từ công trường ({pending.length})</h3>
      <ul className="space-y-3">
        {pending.map((p) => (
          <InboxItem key={p.id} proposal={p} readOnly={readOnly} />
        ))}
      </ul>
    </section>
  );
}

function InboxItem({ proposal, readOnly }: { proposal: SiteChangeProposal; readOnly: boolean }) {
  const promptDialog = usePromptDialog();
  const convert = useConvertSiteChangeProposal();
  const reject = useRejectSiteChangeProposal();
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  async function onConvert() {
    const title = await promptDialog.ask({
      title: 'Lập phát sinh từ đề xuất này?',
      label: 'Tiêu đề phát sinh',
      confirmLabel: 'Lập phát sinh',
      required: false,
    });
    if (title === null) return;
    void run(() => convert.mutateAsync({ proposalId: proposal.id, title: title.trim() || null }));
  }

  async function onReject() {
    const reason = await promptDialog.ask({
      title: 'Không lập phát sinh?',
      label: 'Lý do',
      confirmLabel: 'Không lập phát sinh',
      danger: true,
    });
    if (reason === null) return;
    void run(() => reject.mutateAsync({ proposalId: proposal.id, reason: reason.trim() }));
  }

  return (
    <li className="rounded-sm bg-surface p-3">
      {promptDialog.dialog}
      <SiteChangeSummary proposal={proposal} />
      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void onConvert()} disabled={convert.isPending}>
            Lập phát sinh
          </Button>
          <button type="button" className="text-brand underline" onClick={() => void onReject()}>
            Không lập phát sinh
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}
    </li>
  );
}
