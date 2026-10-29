/**
 * G4 (0249): gói bàn giao Dự án / Thiết kế / Kinh doanh → Thi công và điều kiện khởi công.
 *
 * - Điều kiện khởi công: chỉ huy trưởng đánh dấu từng mục kèm căn cứ (ghi chú, đường dẫn, ảnh giấy
 *   tờ) ngay trên điện thoại — nút chụp ảnh không ẩn sau menu (AFD 4.8). Chưa đủ mục bắt buộc thì CSDL
 *   không cho sang «Đang thi công» (`stage_readiness('site')`).
 * - Gói bàn giao: bộ phận giao bấm «Giao», Trưởng phòng Thi công «Đã nhận» hoặc «Báo thiếu» kèm ý
 *   kiến. Thiếu mục bắt buộc chỉ CẢNH BÁO (pháp nhân bật chặn bằng tham số `tc.handover_blocks_start`).
 *   Không có giá trị hợp đồng / dự toán ở đây; tệp mục nhạy cảm chỉ người xem được giá vốn mở được.
 *
 * Nút chỉ hiện khi CSDL trả cờ `can_*` (5.4).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, Circle, FileText, Link2 } from 'lucide-react';
import { formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { TEXTAREA_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  HANDOVER_DEPARTMENT_LABELS,
  openChecklistFile,
  useConfirmStartCondition,
  useGiveHandoverItem,
  useReceiveHandoverItem,
  useSiteChecklist,
  type ChecklistItem,
} from '@/hooks/use-site-handover';
import { cn } from '@/lib/utils';

const HANDOVER_STATUS: Record<string, { label: string; className: string }> = {
  cho_giao: { label: 'Chưa giao', className: 'text-fg-subtle' },
  da_giao: { label: 'Đã giao — chờ Thi công nhận', className: 'text-status-pending' },
  da_nhan: { label: 'Thi công đã nhận', className: 'text-status-completed' },
  thieu: { label: 'Thiếu / chưa đạt', className: 'text-status-overdue' },
};

function Evidence({ item }: { item: ChecklistItem }) {
  const [error, setError] = useState<string | null>(null);
  if (!item.note && !item.link_url && !item.attachment_path) return null;
  return (
    <div className="mt-1 space-y-1 text-sm">
      {item.note && <p className="whitespace-pre-line">{item.note}</p>}
      <div className="flex flex-wrap gap-3">
        {item.link_url && (
          <a
            href={item.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
          >
            <Link2 className="size-4" aria-hidden />
            Mở đường dẫn
          </a>
        )}
        {item.attachment_path && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
            onClick={() => {
              setError(null);
              openChecklistFile(item.attachment_path!).catch((e) => setError(toUserMessage(e)));
            }}
          >
            <FileText className="size-4" aria-hidden />
            Mở tệp đính kèm
          </button>
        )}
        {item.is_sensitive && !item.attachment_path && item.status !== 'cho_giao' && (
          <span className="text-fg-subtle">
            Tệp có đơn giá vốn — chỉ người được xem giá vốn mở được.
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
    </div>
  );
}

/** Ô căn cứ: ghi chú, đường dẫn, ảnh / tệp. Ảnh chụp ngay bằng máy (thuộc tính `capture`). */
function EvidenceForm({
  submitLabel,
  pending,
  error,
  noteLabel,
  requireNote,
  onSubmit,
  onCancel,
}: {
  submitLabel: string;
  pending: boolean;
  error: string | null;
  noteLabel: string;
  requireNote?: boolean;
  onSubmit: (v: { note: string; link: string; file: File | null }) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const ready = requireNote ? note.trim() !== '' : true;
  return (
    <form
      className="mt-2 space-y-2 rounded-card border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit({ note: note.trim(), link: link.trim(), file });
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-fg-subtle">{noteLabel}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={TEXTAREA_BOX}
        />
      </label>
      {!requireNote && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-fg-subtle">Đường dẫn (nếu có)</span>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              inputMode="url"
              placeholder="https://"
            />
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-brand">
            <Camera className="size-5" aria-hidden />
            {file ? file.name : 'Chụp ảnh / chọn tệp'}
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" variant="secondary" disabled={!ready || pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="subtle" onClick={onCancel}>
          Hủy
        </Button>
        {error && (
          <span role="alert" className="text-sm text-status-overdue">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

// --- Điều kiện khởi công ---------------------------------------------------------------------

export function StartConditionsCard({ siteId }: { siteId: string }) {
  const { data, isLoading, error } = useSiteChecklist(siteId, 'khoi_cong');
  const confirm = useConfirmStartCondition();
  const [open, setOpen] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  const items = data ?? [];
  if (items.length === 0) return null;
  const missing = items.filter((i) => i.is_required && i.status !== 'da_dat');

  return (
    <section
      aria-label="Điều kiện khởi công"
      className="mb-4 rounded-card border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">Điều kiện khởi công</h2>
      <p className="mt-0.5 text-sm">
        {missing.length > 0
          ? `Còn ${missing.length} điều kiện bắt buộc chưa xác nhận — chưa bắt đầu thi công được.`
          : 'Đủ điều kiện bắt buộc. Các mục còn lại xác nhận khi có.'}
      </p>
      <ul className="mt-3 divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-2">
            <div className="flex items-start gap-2">
              {item.status === 'da_dat' ? (
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-status-completed"
                  aria-hidden
                />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {item.label}
                  {item.is_required && (
                    <span className="ml-1 text-xs text-fg-subtle">(bắt buộc)</span>
                  )}
                </p>
                {item.description && <p className="text-sm text-fg-subtle">{item.description}</p>}
                <p className="text-sm">
                  {item.status === 'da_dat'
                    ? `Đã xác nhận${item.confirmed_by_name ? ` — ${item.confirmed_by_name}` : ''}${
                        item.confirmed_at ? `, ${formatDateTime(item.confirmed_at)}` : ''
                      }`
                    : 'Chưa xác nhận'}
                </p>
                <Evidence item={item} />
                {item.can_confirm && open !== item.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.status !== 'da_dat' ? (
                      <Button
                        size="lg"
                        variant="secondary"
                        onClick={() => {
                          setFormError(null);
                          setOpen(item.id);
                        }}
                      >
                        Xác nhận kèm căn cứ
                      </Button>
                    ) : (
                      <Button
                        variant="subtle"
                        disabled={confirm.isPending}
                        onClick={() =>
                          confirm.mutate(
                            { siteId, itemId: item.id, done: false },
                            { onError: (e) => setFormError(toUserMessage(e, 'edit')) },
                          )
                        }
                      >
                        Bỏ xác nhận
                      </Button>
                    )}
                  </div>
                )}
                {open === item.id && (
                  <EvidenceForm
                    submitLabel="Xác nhận"
                    noteLabel="Căn cứ: số văn bản, ngày, người cấp"
                    pending={confirm.isPending}
                    error={formError}
                    onCancel={() => setOpen(null)}
                    onSubmit={(v) =>
                      confirm.mutate(
                        { siteId, itemId: item.id, done: true, ...v },
                        {
                          onSuccess: () => setOpen(null),
                          onError: (e) => setFormError(toUserMessage(e, 'edit')),
                        },
                      )
                    }
                  />
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {formError && open === null && (
        <p role="alert" className="mt-2 text-sm text-status-overdue">
          {formError}
        </p>
      )}
    </section>
  );
}

// --- Gói bàn giao ----------------------------------------------------------------------------

export function HandoverChecklist({
  siteId,
  showPageLink = false,
}: {
  siteId: string;
  showPageLink?: boolean;
}) {
  const { data, isLoading, error } = useSiteChecklist(siteId, 'ban_giao');
  const give = useGiveHandoverItem();
  const receive = useReceiveHandoverItem();
  const [open, setOpen] = useState<{ id: string; mode: 'give' | 'issue' } | null>(null);
  const [errorFor, setErrorFor] = useState<{ id: string; msg: string } | null>(null);
  const setFormError = (id: string, msg: string | null) => setErrorFor(msg ? { id, msg } : null);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  const items = data ?? [];
  if (items.length === 0) return null;
  const missing = items.filter((i) => i.is_required && i.status !== 'da_nhan');

  return (
    <section
      aria-label="Bàn giao sang Thi công"
      className="mb-4 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Bàn giao sang Thi công</h2>
        {showPageLink && (
          <Link
            to={`/ban-giao-thi-cong/${siteId}`}
            className="text-sm text-brand underline-offset-4 hover:underline"
          >
            Mở trang bàn giao
          </Link>
        )}
      </div>
      {missing.length > 0 ? (
        <p className="mt-1 inline-flex items-start gap-1 text-sm text-status-pending">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Còn {missing.length} mục bắt buộc Thi công chưa nhận:{' '}
          {missing.map((m) => m.label).join(', ')}.
        </p>
      ) : (
        <p className="mt-1 text-sm">Thi công đã nhận đủ các mục bắt buộc.</p>
      )}
      <ul className="mt-3 divide-y divide-border">
        {items.map((item) => {
          const st = HANDOVER_STATUS[item.status] ?? HANDOVER_STATUS.cho_giao!;
          return (
            <li key={item.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-medium">
                  {item.label}
                  {item.is_required && (
                    <span className="ml-1 text-xs text-fg-subtle">(bắt buộc)</span>
                  )}
                </p>
                <span className={cn('text-sm font-semibold', st.className)}>{st.label}</span>
              </div>
              <p className="text-xs text-fg-subtle">
                Bộ phận giao:{' '}
                {item.giver_department ? HANDOVER_DEPARTMENT_LABELS[item.giver_department] : '—'} ·
                Người nhận: Trưởng phòng Thi công
              </p>
              {item.description && <p className="text-sm text-fg-subtle">{item.description}</p>}
              {item.auto_label && (
                <p className="mt-1 text-sm">
                  <span className="text-fg-subtle">Trên hệ thống: </span>
                  {item.auto_label}
                </p>
              )}
              <Evidence item={item} />
              <p className="mt-1 text-xs text-fg-subtle">
                {item.given_at &&
                  `Giao: ${item.given_by_name ?? 'Không rõ'}, ${formatDateTime(item.given_at)}. `}
                {item.received_at &&
                  `Nhận: ${item.received_by_name ?? 'Không rõ'}, ${formatDateTime(item.received_at)}.`}
              </p>
              {item.status === 'thieu' && item.issue_note && (
                <p className="mt-1 text-sm text-status-overdue">Thi công báo: {item.issue_note}</p>
              )}

              {open?.id !== item.id && (item.can_give || item.can_receive) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.can_give && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setFormError(item.id, null);
                        setOpen({ id: item.id, mode: 'give' });
                      }}
                    >
                      {item.status === 'thieu' ? 'Giao bổ sung' : 'Giao'}
                    </Button>
                  )}
                  {item.can_receive &&
                    item.status !== 'da_nhan' &&
                    (item.status === 'da_giao' || item.auto_available) && (
                      <Button
                        variant="secondary"
                        disabled={receive.isPending}
                        onClick={() =>
                          receive.mutate(
                            { siteId, itemId: item.id, accept: true },
                            { onError: (e) => setFormError(item.id, toUserMessage(e, 'edit')) },
                          )
                        }
                      >
                        Đã nhận
                      </Button>
                    )}
                  {item.can_receive && (
                    <Button
                      variant="subtle"
                      onClick={() => {
                        setFormError(item.id, null);
                        setOpen({ id: item.id, mode: 'issue' });
                      }}
                    >
                      Báo thiếu / chưa đạt
                    </Button>
                  )}
                </div>
              )}
              {open?.id === item.id && open.mode === 'give' && (
                <EvidenceForm
                  submitLabel="Giao mục này"
                  noteLabel="Nội dung đã giao"
                  pending={give.isPending}
                  error={errorFor?.id === item.id ? errorFor.msg : null}
                  onCancel={() => setOpen(null)}
                  onSubmit={(v) =>
                    give.mutate(
                      { siteId, itemId: item.id, ...v },
                      {
                        onSuccess: () => setOpen(null),
                        onError: (e) => setFormError(item.id, toUserMessage(e, 'edit')),
                      },
                    )
                  }
                />
              )}
              {open?.id === item.id && open.mode === 'issue' && (
                <EvidenceForm
                  submitLabel="Gửi cho bộ phận giao"
                  noteLabel="Thiếu gì / chưa đạt ở đâu"
                  requireNote
                  pending={receive.isPending}
                  error={errorFor?.id === item.id ? errorFor.msg : null}
                  onCancel={() => setOpen(null)}
                  onSubmit={(v) =>
                    receive.mutate(
                      { siteId, itemId: item.id, accept: false, note: v.note },
                      {
                        onSuccess: () => setOpen(null),
                        onError: (e) => setFormError(item.id, toUserMessage(e, 'edit')),
                      },
                    )
                  }
                />
              )}
              {open?.id !== item.id && errorFor?.id === item.id && (
                <p role="alert" className="mt-1 text-sm text-status-overdue">
                  {errorFor.msg}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
