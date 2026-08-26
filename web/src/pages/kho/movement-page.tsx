/**
 * Phiếu kho — nhập, xuất, điều chuyển (KHO-03, KHO-04, KHO-05).
 *
 * Một màn hình cho cả ba loại phiếu chứ không ba màn hình: người ở kho làm cùng một việc —
 * chọn kho, chọn hàng, ghi số lượng — chỉ khác ở vài trường và ở chiều tăng giảm. Ba màn hình
 * riêng là ba chỗ để phần chọn hàng lệch nhau về sau.
 *
 * Mã chống ghi trùng (KHO-09) sinh MỘT lần khi mở biểu mẫu, không sinh lúc bấm gửi: mất sóng
 * giữa chừng rồi bấm lại phải là cùng một mã, nếu không lần gửi lại tạo phiếu thứ hai và tồn
 * kho cộng đôi.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StockIssueReason, StockMovementType } from '@nvg/shared';
import {
  STOCK_ISSUE_REASON_LABELS,
  STOCK_MOVEMENT_TYPE_LABELS,
  formatDate,
  formatNumber,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { BlockedNotice, EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useConstructionSites } from '@/hooks/use-construction-sites';
import {
  newClientMovementId,
  useIssueStock,
  useMaterials,
  useReceiveStock,
  useStockMovements,
  useTransferStock,
  useWarehouses,
  type MovementLineInput,
} from '@/hooks/use-warehouse';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { KhoNav } from './kho-nav';

const EM_DASH = '—';

interface DraftLine {
  key: number;
  materialId: string;
  quantity: string;
  unitCost: string;
  note: string;
}

function emptyLine(key: number): DraftLine {
  return { key, materialId: '', quantity: '', unitCost: '', note: '' };
}

export function StockMovementPage() {
  const canEdit = useCan('KHO', 'edit');
  const [params] = useSearchParams();

  const [type, setType] = useState<StockMovementType>(
    (params.get('loai') as StockMovementType) ?? 'nhap',
  );
  const [isFormOpen, setFormOpen] = useState(Boolean(params.get('loai')));
  const [warehouseId, setWarehouseId] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [issueReason, setIssueReason] = useState<StockIssueReason>('cong_trinh');
  const [siteId, setSiteId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { ...emptyLine(1), materialId: params.get('vat-tu') ?? '' },
  ]);
  const [clientId, setClientId] = useState(newClientMovementId);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: warehouses } = useWarehouses();
  const { data: materials } = useMaterials();
  const { data: sites } = useConstructionSites();
  const { data: movements, isLoading, error } = useStockMovements();

  const receive = useReceiveStock();
  const issue = useIssueStock();
  const transfer = useTransferStock();
  const isPending = receive.isPending || issue.isPending || transfer.isPending;

  const materialById = useMemo(() => new Map((materials ?? []).map((m) => [m.id, m])), [materials]);

  function resetForm() {
    setLines([emptyLine(Date.now())]);
    setFormError(null);
    // Mã mới cho LẦN LẬP PHIẾU TIẾP THEO — phiếu vừa gửi đã dùng mã cũ xong.
    setClientId(newClientMovementId());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const items: MovementLineInput[] = lines
      .filter((l) => l.materialId && Number(l.quantity) > 0)
      .map((l) => ({
        material_id: l.materialId,
        quantity: Number(l.quantity),
        unit_cost: l.unitCost ? Number(l.unitCost) : 0,
        condition_note: l.note.trim() || null,
      }));

    if (items.length === 0) {
      setFormError('Chưa có mặt hàng nào có số lượng lớn hơn 0.');
      return;
    }

    try {
      if (type === 'nhap') {
        await receive.mutateAsync({ warehouseId, items, clientGeneratedId: clientId });
      } else if (type === 'xuat') {
        await issue.mutateAsync({
          warehouseId,
          items,
          issueReason,
          constructionSiteId: siteId || null,
          clientGeneratedId: clientId,
        });
      } else {
        await transfer.mutateAsync({
          fromWarehouseId: warehouseId,
          toWarehouseId: targetWarehouseId,
          items,
          clientGeneratedId: clientId,
        });
      }
      resetForm();
      setFormOpen(false);
    } catch (e) {
      setFormError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <KhoNav />
      <PageHeader
        title="Phiếu kho"
        breadcrumbs={[{ label: 'Kho' }, { label: 'Phiếu kho' }]}
        actions={
          canEdit ? (
            <Button variant="primary" onClick={() => setFormOpen((open) => !open)}>
              {isFormOpen ? 'Đóng biểu mẫu' : 'Lập phiếu'}
            </Button>
          ) : undefined
        }
      />

      {!canEdit && (
        <BlockedNotice
          title="Chỉ xem được phiếu kho"
          detail="Lập phiếu nhập, xuất và điều chuyển là việc của bộ phận Kho. Vai trò hiện tại xem được lịch sử phiếu."
        />
      )}

      {isFormOpen && canEdit && (
        <form
          onSubmit={(e) => void submit(e)}
          className="mb-4 space-y-4 rounded-lg border border-border bg-surface p-4"
        >
          {formError && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Loại phiếu" required>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as StockMovementType)}
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
              >
                <option value="nhap">{STOCK_MOVEMENT_TYPE_LABELS.nhap}</option>
                <option value="xuat">{STOCK_MOVEMENT_TYPE_LABELS.xuat}</option>
                <option value="dieu_chuyen">{STOCK_MOVEMENT_TYPE_LABELS.dieu_chuyen}</option>
              </select>
            </Field>

            <Field label={type === 'dieu_chuyen' ? 'Kho xuất' : 'Kho'} required>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                required
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
              >
                <option value="">Chọn kho</option>
                {(warehouses ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>

            {type === 'dieu_chuyen' && (
              <Field label="Kho nhận" required>
                <select
                  value={targetWarehouseId}
                  onChange={(e) => setTargetWarehouseId(e.target.value)}
                  required
                  className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                >
                  <option value="">Chọn kho nhận</option>
                  {(warehouses ?? [])
                    .filter((w) => w.id !== warehouseId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}

            {type === 'xuat' && (
              <>
                <Field label="Lý do xuất" required>
                  <select
                    value={issueReason}
                    onChange={(e) => setIssueReason(e.target.value as StockIssueReason)}
                    className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                  >
                    {Object.entries(STOCK_ISSUE_REASON_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Công trình nhận"
                  required={issueReason === 'cong_trinh'}
                  hint="Chi phí vật tư gắn vào mã công trình ngay khi xuất."
                >
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    required={issueReason === 'cong_trinh'}
                    className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                  >
                    <option value="">Chọn công trình</option>
                    {(sites ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>

          <div className="space-y-3">
            <p className="font-medium">Mặt hàng</p>
            {lines.map((line, index) => (
              <div key={line.key} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={`Vật tư ${index + 1}`} className="lg:col-span-2">
                  <select
                    value={line.materialId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, materialId: e.target.value } : l,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                  >
                    <option value="">Chọn vật tư</option>
                    {(materials ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} — {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={`Số lượng${line.materialId ? ` (${materialById.get(line.materialId)?.unit ?? ''})` : ''}`}
                >
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, quantity: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </Field>
                {type === 'nhap' ? (
                  <Field label="Đơn giá nhập (đồng)">
                    <MoneyInput
                      value={line.unitCost}
                      onChange={(v) =>
                        setLines((prev) =>
                          prev.map((l) => (l.key === line.key ? { ...l, unitCost: v } : l)),
                        )
                      }
                    />
                  </Field>
                ) : (
                  <Field label="Ghi chú">
                    <Input
                      value={line.note}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, note: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </Field>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((prev) => [...prev, emptyLine(Date.now())])}
            >
              Thêm dòng
            </Button>
          </div>

          <Button type="submit" variant="primary" disabled={isPending}>
            Lưu phiếu
          </Button>
        </form>
      )}

      {isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} />
      ) : (movements ?? []).length === 0 ? (
        <EmptyState message="Chưa có phiếu kho nào. Mọi thay đổi tồn kho đều bắt đầu từ một phiếu ở đây." />
      ) : (
        <ul className="space-y-2">
          {(movements ?? []).map((m) => (
            <li key={m.id} className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {STOCK_MOVEMENT_TYPE_LABELS[m.movement_type]} · {m.code ?? EM_DASH}
                </p>
                <p className="text-fg-muted">{formatDate(m.movement_date)}</p>
              </div>
              <p className="text-fg-muted">
                {m.warehouse?.name ?? EM_DASH}
                {m.target ? ` → ${m.target.name}` : ''}
                {m.issue_reason ? ` · ${STOCK_ISSUE_REASON_LABELS[m.issue_reason]}` : ''}
                {m.performer ? ` · ${m.performer.full_name}` : ''}
              </p>
              <ul className="mt-1 text-fg-muted">
                {m.items.map((item) => (
                  <li key={item.id}>
                    {item.material?.name ?? EM_DASH}:{' '}
                    <span className="tabular-nums">{formatNumber(Number(item.quantity))}</span>{' '}
                    {item.material?.unit}
                    {item.condition_note ? ` — ${item.condition_note}` : ''}
                  </li>
                ))}
              </ul>
              {m.notes && <p className="mt-1 text-xs text-fg-subtle">{m.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
