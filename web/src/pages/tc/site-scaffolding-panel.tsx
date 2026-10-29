/**
 * Tab «Giàn giáo» của công trình — chỉ huy trưởng đề nghị thuê giàn giáo nội bộ của Nhà Việt Steel
 * (G5, migration 0245; QĐ-6; phiếu Ban Giám đốc, mảng giàn giáo bước 11).
 *
 * Bố cục di động trước (AFD 4.8): chọn mã từ danh sách thay gõ tay, số lượng, ngày cần, ngày trả.
 * Gửi đi là xong phần công trường — Xưởng NVS chuẩn bị, Ban Giám đốc NVS duyệt, Xưởng xuất hàng; trạng
 * thái từng bước hiện ngay ở danh sách bên dưới (người gửi biết đề nghị đang ở đâu — AFD 4.7).
 *
 * Giá nội bộ và chi phí: chi phí thuê vào ngân sách công trình khi biên bản thu hồi được ký; ai thấy
 * chi phí thì xem ở tab Ngân sách như mọi mã chi phí khác (Mẫu D) — tab này không hiện tiền.
 */

import { useMemo, useState } from 'react';
import { formatDate, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  INTERNAL_REQUEST_STATUS_LABELS,
  useCloseInternalRental,
  useInternalRentalRequests,
  useRequestInternalRental,
} from '@/hooks/use-sx-rental';
import { useMaterials } from '@/hooks/use-warehouse';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { useAuth } from '@/lib/auth';

interface Line {
  key: number;
  materialId: string;
  quantity: string;
}

const selectClass = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export function SiteScaffoldingPanel({ siteId, readOnly }: { siteId: string; readOnly: boolean }) {
  const { data: requests } = useInternalRentalRequests({ siteId });
  const { data: materials } = useMaterials();
  const scaffolding = useMemo(() => (materials ?? []).filter((m) => m.is_scaffolding), [materials]);
  const request = useRequestInternalRental();
  const cancel = useCloseInternalRental();
  const prompt = usePromptDialog();
  const { profile } = useAuth();

  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ key: 1, materialId: '', quantity: '' }]);
  const [needed, setNeeded] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    const items = lines
      .filter((l) => l.materialId && Number(l.quantity) > 0)
      .map((l) => ({ material_id: l.materialId, quantity: Number(l.quantity) }));
    if (items.length === 0) return setError('Chọn ít nhất một loại giàn giáo và số lượng.');
    if (!needed) return setError('Nhập ngày cần giàn giáo tại công trình.');
    try {
      await request.mutateAsync({
        siteId,
        neededDate: needed,
        expectedReturnDate: returnDate || null,
        notes,
        items,
      });
      setOpen(false);
      setSent(true);
      setLines([{ key: Date.now(), materialId: '', quantity: '' }]);
      setNeeded('');
      setReturnDate('');
      setNotes('');
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="space-y-4">
      {prompt.dialog}
      {sent && (
        <p
          role="status"
          className="rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed"
        >
          Đã gửi đề nghị cho Nhà Việt Steel. Trạng thái cập nhật ở danh sách bên dưới.
        </p>
      )}
      {!readOnly && !open && (
        <Button
          variant="primary"
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => setOpen(true)}
        >
          Đề nghị thuê giàn giáo nội bộ
        </Button>
      )}

      {open && (
        <div className="space-y-3 rounded-card bg-surface p-4">
          {error && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-[1fr_6.5rem] gap-2">
              <Field label={`Loại giàn giáo ${i + 1}`}>
                <select
                  value={l.materialId}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((x) => (x.key === l.key ? { ...x, materialId: e.target.value } : x)),
                    )
                  }
                  className={selectClass}
                >
                  <option value="">Chọn mã</option>
                  {scaffolding.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} — {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Số lượng">
                <Input
                  inputMode="decimal"
                  value={l.quantity}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((x) =>
                        x.key === l.key
                          ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, '') }
                          : x,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setLines((p) => [...p, { key: Date.now(), materialId: '', quantity: '' }])
            }
          >
            Thêm loại giàn giáo
          </Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngày cần tại công trình" required>
              <DateInput value={needed} onChange={setNeeded} />
            </Field>
            <Field label="Ngày dự kiến trả">
              <DateInput value={returnDate} onChange={setReturnDate} min={needed || undefined} />
            </Field>
          </div>
          <Field label="Ghi chú cho Nhà Việt Steel">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vị trí lắp, giờ nhận hàng"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="lg"
              disabled={request.isPending}
              onClick={() => void submit()}
            >
              Gửi đề nghị
            </Button>
            <Button variant="subtle" size="lg" onClick={() => setOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      )}

      {(requests ?? []).length === 0 ? (
        <EmptyState message="Công trình chưa đề nghị thuê giàn giáo nội bộ lần nào." />
      ) : (
        <ul className="divide-y divide-border rounded-card bg-surface">
          {(requests ?? []).map((r) => (
            <li key={r.id} className="space-y-1 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{r.code}</p>
                <span className="text-sm font-medium">
                  {INTERNAL_REQUEST_STATUS_LABELS[r.status]}
                </span>
              </div>
              <p className="text-sm">
                {r.items
                  .map(
                    (i) =>
                      `${i.material?.code ?? ''} × ${formatNumber(i.quantity)} ${i.material?.unit ?? ''}`,
                  )
                  .join(' · ')}
              </p>
              <p className="text-sm text-fg-subtle">
                Cần ngày {formatDate(r.needed_date)}
                {r.expected_return_date ? ` · trả ${formatDate(r.expected_return_date)}` : ''}
                {r.rental_agreement_code ? ` · đơn thuê ${r.rental_agreement_code}` : ''}
              </p>
              {r.decision_note && <p className="text-sm">Ý kiến: {r.decision_note}</p>}
              {!readOnly && r.status === 'cho_nvs' && r.requested_by === profile?.id && (
                <Button
                  variant="subtle"
                  onClick={() =>
                    void (async () => {
                      const reason = await prompt.ask({
                        title: 'Huỷ đề nghị thuê giàn giáo?',
                        label: 'Lý do huỷ',
                        confirmLabel: 'Huỷ đề nghị',
                      });
                      if (reason) {
                        try {
                          await cancel.mutateAsync({ id: r.id, reason });
                        } catch (e) {
                          setError(toUserMessage(e, 'edit'));
                        }
                      }
                    })()
                  }
                >
                  Huỷ đề nghị
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
