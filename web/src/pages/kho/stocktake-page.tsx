/**
 * Kiểm kê (KHO-07).
 *
 * Bốn bước bám đúng câu chữ PRD: tạm dừng nhập–xuất → đối chiếu thực tế với sổ kho → xác
 * định nguyên nhân chênh lệch → lập biên bản và TRÌNH PHÊ DUYỆT TRƯỚC KHI điều chỉnh.
 *
 * Màn hình nói rõ sổ kho CHƯA đổi khi biên bản đang chờ duyệt. Đây là chỗ dễ hiểu nhầm nhất:
 * người vừa đếm xong sẽ tưởng con số mình đếm đã thành số chính thức, rồi đi báo cáo bằng
 * con số đó.
 */

import { useMemo, useState } from 'react';
import type { StocktakeStatus } from '@nvg/shared';
import { formatDateTime, formatNumber, stocktakeStatusMeta, summarizeStocktake } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  useCancelStocktake,
  useCloseStocktake,
  useSaveStocktakeCount,
  useStartStocktake,
  useStocktakeItems,
  useStocktakes,
  useSubmitStocktake,
  useWarehouses,
} from '@/hooks/use-warehouse';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { KhoNav } from './kho-nav';

const EM_DASH = '—';

function StocktakeDetail({
  stocktakeId,
  status,
  onError,
}: {
  stocktakeId: string;
  status: StocktakeStatus;
  onError: (message: string | null) => void;
}) {
  const canEdit = useCan('KHO', 'edit');
  const { data, isLoading } = useStocktakeItems(stocktakeId);
  const saveCount = useSaveStocktakeCount();
  const submit = useSubmitStocktake();
  const close = useCloseStocktake();
  const [counts, setCounts] = useState<Record<string, string>>({});

  const items = data ?? [];
  const isCounting = status === 'dang_kiem';

  const merged = useMemo(
    () =>
      items.map((item) => {
        const raw = counts[item.material_id] ?? item.counted_quantity ?? '';
        return { item, raw, counted: raw === '' ? null : Number(raw) };
      }),
    [items, counts],
  );

  const summary = summarizeStocktake(
    merged.map((m) => ({
      materialId: m.item.material_id,
      bookQuantity: m.item.book_quantity,
      countedQuantity: m.counted,
    })),
  );

  if (isLoading) return <TableSkeleton rows={4} columns={4} />;
  if (items.length === 0) {
    return (
      <EmptyState message="Kho này chưa có dòng tồn nào tại lúc mở đợt kiểm kê, nên không có gì để đối chiếu." />
    );
  }

  async function save() {
    onError(null);
    try {
      await saveCount.mutateAsync({
        stocktakeId,
        items: merged.map((m) => ({
          material_id: m.item.material_id,
          counted_quantity: m.counted,
        })),
      });
    } catch (e) {
      onError(toUserMessage(e, 'edit'));
    }
  }

  /**
   * Đóng đợt khi số đếm khớp sổ.
   *
   * Lưu số đếm trước rồi mới đóng: nếu không, những ô vừa gõ mà chưa lưu sẽ mất, và biên bản
   * kiểm kê ghi lại một đợt "khớp sổ" mà không có số đếm nào làm bằng chứng.
   */
  async function closeMatching() {
    onError(null);
    try {
      await saveCount.mutateAsync({
        stocktakeId,
        items: merged.map((m) => ({
          material_id: m.item.material_id,
          counted_quantity: m.counted,
        })),
      });
      await close.mutateAsync({ stocktakeId });
    } catch (e) {
      onError(toUserMessage(e, 'edit'));
    }
  }

  async function requestApproval() {
    const reason = window.prompt(
      'Nguyên nhân chênh lệch (hao hụt bốc xếp, thất thoát, đếm sót lần trước…):',
    );
    if (reason === null || reason.trim() === '') return;
    onError(null);
    try {
      await saveCount.mutateAsync({
        stocktakeId,
        items: merged.map((m) => ({
          material_id: m.item.material_id,
          counted_quantity: m.counted,
        })),
      });
      await submit.mutateAsync({ stocktakeId, varianceReason: reason.trim() });
    } catch (e) {
      onError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-fg-muted">
        Đã đếm {summary.countedLines}/{summary.totalLines} vật tư · {summary.varianceLines} dòng
        lệch
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead className="border-b border-border text-fg-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                Vật tư
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Sổ kho
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Đếm thực tế
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Chênh lệch
              </th>
            </tr>
          </thead>
          <tbody>
            {merged.map(({ item, raw, counted }) => {
              const variance = counted === null ? null : counted - Number(item.book_quantity);
              return (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">
                    {item.material?.name ?? EM_DASH}
                    <span className="block font-mono text-xs text-fg-subtle">
                      {item.material?.code}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatNumber(Number(item.book_quantity))} {item.material?.unit}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {isCounting && canEdit ? (
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={raw}
                        aria-label={`Số đếm thực tế của ${item.material?.name ?? 'vật tư'}`}
                        className="h-9 w-28 rounded-sm border border-border-strong bg-surface px-2 text-right"
                        onChange={(e) =>
                          setCounts((prev) => ({ ...prev, [item.material_id]: e.target.value }))
                        }
                      />
                    ) : (
                      <span className="tabular-nums">
                        {item.counted_quantity === null
                          ? 'Chưa đếm'
                          : formatNumber(Number(item.counted_quantity))}
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      variance !== null && variance !== 0 ? 'font-semibold text-status-overdue' : ''
                    }`}
                  >
                    {variance === null
                      ? EM_DASH
                      : `${variance > 0 ? '+' : ''}${formatNumber(variance)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isCounting && canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={saveCount.isPending} onClick={() => void save()}>
            Lưu số đếm
          </Button>
          {/* Hai lối ra loại trừ nhau, và điều kiện nằm ở chính số liệu: có lệch thì phải qua
              phê duyệt, khớp sổ thì đóng thẳng. Hiện đúng một nút để không ai phải chọn. */}
          {summary.varianceLines > 0 ? (
            <Button
              variant="primary"
              disabled={submit.isPending || !summary.isComplete}
              onClick={() => void requestApproval()}
            >
              Lập biên bản và gửi phê duyệt
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={close.isPending || saveCount.isPending || !summary.isComplete}
              onClick={() => void closeMatching()}
            >
              Đóng đợt kiểm kê
            </Button>
          )}
        </div>
      )}

      {isCounting && summary.isComplete && summary.varianceLines === 0 && (
        <p className="text-fg-muted">
          Đếm khớp sổ kho ở mọi vật tư — không có gì để điều chỉnh. Đóng đợt kiểm kê để mở lại nhập
          xuất; sổ kho giữ nguyên.
        </p>
      )}

      {status === 'khop_so' && (
        <p className="rounded-lg border border-border bg-surface-sunken px-4 py-3">
          Đợt kiểm kê đã đóng, số đếm khớp sổ ở mọi vật tư. <strong>Sổ kho giữ nguyên</strong> và
          kho đã mở lại nhập xuất.
        </p>
      )}

      {status === 'cho_duyet' && (
        <p className="rounded-lg border border-border bg-surface-sunken px-4 py-3">
          Biên bản đang chờ phê duyệt. <strong>Sổ kho chưa đổi</strong> — con số chính thức vẫn là
          số ở cột "Sổ kho" cho tới khi biên bản được duyệt.
        </p>
      )}
    </div>
  );
}

export function StocktakePage() {
  const canEdit = useCan('KHO', 'edit');
  const { data: warehouses } = useWarehouses();
  const { data, isLoading, error } = useStocktakes();
  const start = useStartStocktake();
  const cancel = useCancelStocktake();

  const [warehouseId, setWarehouseId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  async function startStocktake() {
    if (!warehouseId) {
      setPageError('Chọn kho cần kiểm kê trước.');
      return;
    }
    setPageError(null);
    try {
      const id = await start.mutateAsync({ warehouseId });
      setOpenId(id);
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  async function cancelStocktake(id: string) {
    const reason = window.prompt('Lý do hủy đợt kiểm kê:');
    if (reason === null || reason.trim() === '') return;
    setPageError(null);
    try {
      await cancel.mutateAsync({ stocktakeId: id, reason: reason.trim() });
    } catch (e) {
      setPageError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <>
      <KhoNav />
      <PageHeader
        title="Kiểm kê"
        breadcrumbs={[{ label: 'Kho' }, { label: 'Kiểm kê' }]}
        description="Trong lúc kiểm kê, kho tạm dừng nhập xuất. Sổ kho chỉ đổi sau khi biên bản chênh lệch được phê duyệt."
      />

      {pageError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {pageError}
        </p>
      )}

      {canEdit && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Kho cần kiểm kê" className="min-w-64">
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
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
          <Button
            variant="primary"
            disabled={start.isPending}
            onClick={() => void startStocktake()}
          >
            Mở đợt kiểm kê
          </Button>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="Chưa có đợt kiểm kê nào. Mở đợt kiểm kê khi cần đối chiếu số thực tế với sổ kho." />
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((st) => {
            const meta = stocktakeStatusMeta(st.status);
            const isOpen = openId === st.id;
            return (
              <li key={st.id} className="rounded-lg border border-border bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {st.code ?? EM_DASH} · {st.warehouse?.name ?? EM_DASH}
                    </p>
                    <p className="text-fg-muted">
                      Mở lúc {formatDateTime(st.started_at)}
                      {st.performer ? ` · ${st.performer.full_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusLozenge status={meta.statusGroup} />
                    <span className="text-fg-muted">{meta.label}</span>
                    <Button variant="secondary" onClick={() => setOpenId(isOpen ? null : st.id)}>
                      {isOpen ? 'Thu gọn' : 'Mở'}
                    </Button>
                    {canEdit && st.status !== 'da_dieu_chinh' && st.status !== 'huy' && (
                      <Button variant="subtle" onClick={() => void cancelStocktake(st.id)}>
                        Hủy đợt
                      </Button>
                    )}
                  </div>
                </div>

                {st.variance_reason && (
                  <p className="mt-1 text-fg-muted">Nguyên nhân: {st.variance_reason}</p>
                )}
                {st.closed_reason && (
                  <p className="mt-1 text-fg-muted">Lý do hủy: {st.closed_reason}</p>
                )}

                {isOpen && (
                  <div className="mt-3 border-t border-border pt-3">
                    <StocktakeDetail
                      stocktakeId={st.id}
                      status={st.status}
                      onError={setPageError}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
