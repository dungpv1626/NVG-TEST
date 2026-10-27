/**
 * «Biên bản thanh lý» trên tab Tổng quan của hợp đồng đã ký / đã quyết toán (0229): bản đã soạn gần nhất và lối mở bộ
 * soạn. Người chịu trách nhiệm hoặc Ban Giám đốc soạn được (cùng quyền tải bản đã ký); người khác chỉ xem bản đã lưu.
 * Mẫu thanh lý của NVG viết cho hợp đồng NVG NHẬN việc (NVG là bên nhận thầu / bên bán) — hợp đồng NVG đi thuê, đi mua
 * thì nói rõ là soạn trong Word, không in sai vai hai bên.
 */

import { useState } from 'react';
import { formatDateTime, isPayableContract } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { useAnnexDocuments } from '@/hooks/use-contract-annex';
import type { ContractDetailRecord } from '@/hooks/use-contracts';
import { AnnexComposer } from './annex-composer';

export function LiquidationCard({
  contract,
  canManage,
}: {
  contract: ContractDetailRecord;
  canManage: boolean;
}) {
  const docs = useAnnexDocuments(contract.id);
  const [open, setOpen] = useState(false);
  const versions = (docs.data ?? []).filter((d) => d.kind === 'thanh_ly');
  const latest = versions[0] ?? null;
  const payable = isPayableContract(contract.type);

  if (!canManage && !latest) return null;

  return (
    <section aria-labelledby="bien-ban-thanh-ly" className="mb-4 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="bien-ban-thanh-ly" className="font-semibold">
            Biên bản thanh lý
          </h3>
          <p className="text-sm text-fg-subtle">
            {latest
              ? `Bản ${latest.version} · ${latest.creator?.full_name ?? 'Hệ thống'} · ${formatDateTime(latest.created_at)}`
              : payable
                ? 'Mẫu thanh lý hiện viết cho hợp đồng NVG nhận việc — hợp đồng NVG đi thuê / đi mua soạn trong Word.'
                : 'Chưa soạn. Máy điền sẵn hai bên, số và ngày ký hợp đồng; phần kết quả, giá trị quyết toán điền theo từng Điều.'}
          </p>
        </div>
        {(latest || (canManage && !payable)) && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {canManage && !payable
              ? latest
                ? 'Sửa biên bản thanh lý'
                : 'Soạn biên bản thanh lý'
              : 'Xem biên bản thanh lý'}
          </Button>
        )}
      </div>
      {open && (
        <AnnexComposer
          contract={contract}
          kind="thanh_ly"
          editable={canManage && !payable}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
