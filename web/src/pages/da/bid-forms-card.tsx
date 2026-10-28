/**
 * Khối «Soạn hồ sơ dự thầu từ mẫu» ở tab Hồ sơ thầu của gói thầu (0236). Hai văn bản:
 *  - Hồ sơ dự thầu (Mẫu 01 → 10 + danh mục kiểm tra): lập trước khi nộp; đã nộp thì chỉ xem bản đã lưu.
 *  - Biên bản thương thảo (Mẫu 11): lập sau khi trúng thầu.
 * Nút soạn chỉ hiện cho người lập được (CLAUDE.md 5.4); ai xem được gói thầu cũng mở được bản xem trước.
 */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { BID_FORM_KIND_LABELS, formatDateTime, type BidFormKind } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { useBidFormDocuments } from '@/hooks/use-bid-forms';
import type { BiddingProjectDetailRecord } from '@/hooks/use-bidding-projects';
import { BidFormComposer, bidFormEditable } from './bid-form-composer';

export function BidFormsCard({
  project,
  canEdit,
}: {
  project: BiddingProjectDetailRecord;
  canEdit: boolean;
}) {
  const documents = useBidFormDocuments(project.id);
  const [open, setOpen] = useState<BidFormKind | null>(null);
  const kinds: BidFormKind[] = ['ho_so_du_thau'];
  if (
    project.stage === 'trung_thau' ||
    (documents.data ?? []).some((d) => d.kind === 'thuong_thao')
  )
    kinds.push('thuong_thao');

  return (
    <section className="space-y-3 rounded-card bg-surface p-4">
      <div>
        <h3 className="font-semibold">Soạn hồ sơ dự thầu từ mẫu</h3>
        <p className="text-sm text-fg-subtle">
          Máy điền thông tin pháp nhân, gói thầu, giá dự thầu đã phê duyệt và các bảng kê từ hồ sơ
          có trên hệ thống. Biện pháp thi công, tiến độ, an toàn, chất lượng là phần người viết.
          Người có thẩm quyền ký và nộp — hệ thống không ký, không nộp.
        </p>
      </div>
      <ul className="space-y-2">
        {kinds.map((kind) => {
          const versions = (documents.data ?? []).filter((d) => d.kind === kind);
          const latest = versions[0];
          const editable = bidFormEditable(kind, project, canEdit);
          return (
            <li
              key={kind}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <FileText className="size-5 text-fg-subtle" aria-hidden />
              <div className="min-w-0 flex-1 basis-60">
                <p className="font-medium">{BID_FORM_KIND_LABELS[kind]}</p>
                <p className="text-sm text-fg-subtle">
                  {latest
                    ? `Bản ${latest.version} · ${formatDateTime(latest.created_at)}${
                        latest.creator ? ` · ${latest.creator.full_name}` : ''
                      }`
                    : 'Chưa lưu bản nào'}
                  {kind === 'ho_so_du_thau' && project.submitted_at
                    ? ' · Đã nộp thầu — giữ đúng bộ đã nộp'
                    : ''}
                </p>
              </div>
              {editable ? (
                <Button variant="secondary" onClick={() => setOpen(kind)}>
                  {latest ? 'Soạn tiếp' : 'Soạn từ mẫu'}
                </Button>
              ) : (
                <Button variant="subtle" onClick={() => setOpen(kind)}>
                  Xem bản xem trước
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {open && (
        <BidFormComposer
          project={project}
          kind={open}
          editable={bidFormEditable(open, project, canEdit)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
