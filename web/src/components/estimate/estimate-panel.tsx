/**
 * Tab Dự toán — dùng CHUNG cho gói thầu (DA-05 → DA-07) và dự án thiết kế NVO (TK-07).
 *
 * Hai điều chi phối toàn bộ màn hình này:
 *
 *  1. **Giá vốn không tự hiện ra.** Người dùng phải bấm "Xem cấu thành giá vốn" thì hệ thống
 *     mới gọi hàm CSDL — và mỗi lượt gọi là một dòng nhật ký (PRD NEN-07). Nạp sẵn cùng trang
 *     sẽ làm nhật ký đầy những lượt "xem" mà không ai thực sự nhìn.
 *  2. **Sửa giá sau khi duyệt = lập phiên bản mới.** DA-07 yêu cầu giữ TOÀN BỘ các phiên bản
 *     dự toán; vì vậy bản đã trình duyệt chuyển sang chỉ xem, không sửa tại chỗ.
 */

import { useState } from 'react';
import { Eye } from 'lucide-react';
import {
  BUTTONS,
  COST_GROUPS,
  COST_GROUP_LABELS,
  formatCurrency,
  formatDateTime,
  formatNumber,
  type CostGroup,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import {
  useCostBreakdown,
  useCreateEstimate,
  useEstimateItems,
  useEstimates,
  useRequestEstimateApproval,
  useSaveCosts,
  useSaveEstimateItems,
  useUpdateEstimate,
  type CostBreakdown,
  type EstimateItemInput,
  type EstimateParent,
} from '@/hooks/use-estimates';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const EMPTY_ROW: EstimateItemInput = {
  cost_group: 'vat_tu',
  description: '',
  unit: '',
  quantity: 0,
  unit_price: 0,
};

export function EstimatePanel({
  parent,
  companyId,
  companyCode,
  readOnly,
}: {
  parent: EstimateParent;
  companyId: string;
  companyCode: string;
  readOnly: boolean;
}) {
  const { profile } = useAuth();
  const { data: estimates } = useEstimates(parent);
  const createEstimate = useCreateEstimate();
  const updateEstimate = useUpdateEstimate();
  const saveCosts = useSaveCosts();
  const saveItems = useSaveEstimateItems();
  const requestApproval = useRequestEstimateApproval();

  const current = (estimates ?? []).find((e) => e.is_current_version) ?? null;
  const editable = !readOnly && current?.status === 'draft';

  const [showCosts, setShowCosts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bidPrice, setBidPrice] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<EstimateItemInput[] | null>(null);

  const { data: costs, isFetching: loadingCosts } = useCostBreakdown(current?.id, showCosts);
  const { data: items } = useEstimateItems(current?.id, showCosts);

  const rows = draftItems ?? (items ?? []).map(toInput);
  const directTotal = rows.reduce((sum, r) => sum + r.quantity * r.unit_price, 0);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  async function newVersion() {
    await run(async () => {
      const { data: code, error: codeError } = await supabase.rpc('next_record_code', {
        p_company_code: companyCode,
        p_record_type: 'DT',
      });
      if (codeError) throw codeError;
      await createEstimate.mutateAsync({
        parent,
        companyId,
        code,
        preparedBy: profile?.id ?? null,
      });
      setDraftItems(null);
      setBidPrice(null);
    });
  }

  if (!current) {
    return (
      <EmptyState
        message="Chưa có bản dự toán nào. Lập bản đầu tiên sau khi bóc tách xong khối lượng."
        action={
          readOnly ? undefined : (
            <Button variant="secondary" onClick={() => void newVersion()}>
              Lập dự toán
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-fg-subtle">{current.code}</span>
              <span className="font-semibold">Phiên bản {current.version}</span>
              <StatusLozenge status={current.status} />
            </div>
            <p className="mt-1 text-fg-subtle">
              Người lập {current.prepared?.full_name ?? 'Không rõ'} ·{' '}
              {formatDateTime(current.created_at)}
              {current.approved_at && ` · Duyệt lúc ${formatDateTime(current.approved_at)}`}
            </p>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              {current.status === 'draft' ? (
                <Button
                  variant="primary"
                  disabled={requestApproval.isPending}
                  onClick={() =>
                    void run(() => requestApproval.mutateAsync({ estimateId: current.id }))
                  }
                >
                  {BUTTONS.submitForApproval}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void newVersion()}>
                  Lập phiên bản mới
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Giá dự thầu" hint="Con số gửi cho chủ đầu tư. Đơn vị đồng.">
            {editable ? (
              <MoneyInput
                value={bidPrice ?? (current.bid_price != null ? String(current.bid_price) : '')}
                onChange={setBidPrice}
                onBlur={() =>
                  bidPrice !== null &&
                  void run(() =>
                    updateEstimate.mutateAsync({
                      id: current.id,
                      changes: { bid_price: bidPrice || null },
                    }),
                  )
                }
              />
            ) : (
              <p className="font-semibold tabular-nums">
                {current.bid_price != null ? formatCurrency(current.bid_price) : '—'}
              </p>
            )}
          </Field>

          <Field label="Căn cứ lập giá" hint="Người duyệt đọc phần này trước khi quyết định.">
            {editable ? (
              <Input
                defaultValue={current.basis_notes ?? ''}
                onBlur={(e) =>
                  void run(() =>
                    updateEstimate.mutateAsync({
                      id: current.id,
                      changes: { basis_notes: e.target.value.trim() || null },
                    }),
                  )
                }
              />
            ) : (
              <p>{current.basis_notes ?? '—'}</p>
            )}
          </Field>
        </div>
      </div>

      {/* Cấu thành giá vốn — Mẫu D. Không hiện cho tới khi người dùng chủ động mở. */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
        {!showCosts ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Cấu thành giá vốn</p>
              <p className="text-fg-subtle">
                Dữ liệu nhạy cảm. Mỗi lượt xem được ghi vào nhật ký truy cập theo quy định nội bộ.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setShowCosts(true)}>
              <Eye className="size-4" />
              Xem cấu thành giá vốn
            </Button>
          </div>
        ) : loadingCosts ? (
          <p className="text-fg-subtle">Đang tải…</p>
        ) : (
          <>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
              <CostField label="Chi phí trực tiếp" value={costs?.direct_cost} />
              <CostField label="Chi phí chung" value={costs?.overhead_cost} />
              <CostField label="Dự phòng rủi ro" value={costs?.contingency_cost} />
              <CostField label="Chi phí tài chính" value={costs?.finance_cost} />
              <CostField label="Thuế" value={costs?.tax_amount} />
              <CostField label="Lợi nhuận dự kiến" value={costs?.profit_amount} />
            </div>

            {editable && (
              <CostForm
                initial={costs}
                pending={saveCosts.isPending}
                onSave={(values) =>
                  void run(() => saveCosts.mutateAsync({ estimateId: current.id, costs: values }))
                }
              />
            )}

            <div className="mt-6">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Dòng chi tiết</p>
                <p className="text-fg-subtle">
                  Chi phí trực tiếp theo các dòng: {formatCurrency(directTotal)}
                </p>
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border text-fg-subtle">
                      <th className="px-3 py-2 font-medium">Nhóm chi phí</th>
                      <th className="px-3 py-2 font-medium">Nội dung</th>
                      <th className="px-3 py-2 font-medium">Đơn vị</th>
                      <th className="px-3 py-2 text-right font-medium">Khối lượng</th>
                      <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
                      <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-fg-subtle">
                          Chưa có dòng chi tiết nào.
                        </td>
                      </tr>
                    )}
                    {rows.map((row, index) => (
                      <ItemRow
                        key={index}
                        row={row}
                        editable={editable}
                        onChange={(next) =>
                          setDraftItems(rows.map((r, i) => (i === index ? next : r)))
                        }
                        onRemove={() => setDraftItems(rows.filter((_, i) => i !== index))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {editable && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setDraftItems([...rows, { ...EMPTY_ROW }])}
                  >
                    Thêm dòng
                  </Button>
                  <Button
                    variant="primary"
                    disabled={draftItems === null || saveItems.isPending}
                    onClick={() =>
                      void run(async () => {
                        await saveItems.mutateAsync({ estimateId: current.id, items: rows });
                        setDraftItems(null);
                      })
                    }
                  >
                    {saveItems.isPending ? 'Đang lưu…' : 'Lưu bảng chi tiết'}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {(estimates ?? []).length > 1 && (
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <p className="mb-2 font-medium">Các phiên bản trước</p>
          <ul className="space-y-1">
            {(estimates ?? [])
              .filter((e) => !e.is_current_version)
              .map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 text-fg-subtle">
                  <span className="font-medium text-fg">Phiên bản {e.version}</span>
                  <StatusLozenge status={e.status} />
                  <span>{e.bid_price != null ? formatCurrency(e.bid_price) : '—'}</span>
                  <span className="text-xs">{formatDateTime(e.created_at)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CostField({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">
        {value != null ? formatCurrency(value as string) : '—'}
      </dd>
    </div>
  );
}

function ItemRow({
  row,
  editable,
  onChange,
  onRemove,
}: {
  row: EstimateItemInput;
  editable: boolean;
  onChange: (next: EstimateItemInput) => void;
  onRemove: () => void;
}) {
  if (!editable) {
    return (
      <tr className="border-b border-border last:border-b-0">
        <td className="px-3 py-2">{COST_GROUP_LABELS[row.cost_group]}</td>
        <td className="px-3 py-2">{row.description}</td>
        <td className="px-3 py-2">{row.unit ?? '—'}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.quantity)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.unit_price)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatCurrency(row.quantity * row.unit_price)}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-2">
        <select
          value={row.cost_group}
          onChange={(e) => onChange({ ...row, cost_group: e.target.value as CostGroup })}
          aria-label="Nhóm chi phí"
          className="h-10 w-full rounded-sm border border-border bg-surface px-2 sm:h-8"
        >
          {COST_GROUPS.map((g) => (
            <option key={g} value={g}>
              {COST_GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <Input
          value={row.description}
          aria-label="Nội dung"
          onChange={(e) => onChange({ ...row, description: e.target.value })}
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={row.unit ?? ''}
          aria-label="Đơn vị"
          onChange={(e) => onChange({ ...row, unit: e.target.value })}
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={String(row.quantity)}
          aria-label="Khối lượng"
          inputMode="decimal"
          className="text-right"
          onChange={(e) => onChange({ ...row, quantity: Number(e.target.value) || 0 })}
        />
      </td>
      <td className="px-3 py-2">
        <MoneyInput
          value={String(row.unit_price)}
          aria-label="Đơn giá"
          onChange={(v) => onChange({ ...row, unit_price: Number(v) || 0 })}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="tabular-nums">{formatCurrency(row.quantity * row.unit_price)}</span>
          <Button variant="subtle" size="sm" onClick={onRemove} aria-label="Xóa dòng">
            Xóa
          </Button>
        </div>
      </td>
    </tr>
  );
}

function CostForm({
  initial,
  pending,
  onSave,
}: {
  initial: CostBreakdown | null | undefined;
  pending: boolean;
  onSave: (values: {
    directCost: string;
    overheadCost: string;
    contingencyCost: string;
    financeCost: string;
    taxAmount: string;
    profitAmount: string;
    profitMarginPercent: string;
  }) => void;
}) {
  const asText = (key: keyof CostBreakdown) => (initial?.[key] != null ? String(initial[key]) : '');
  const [values, setValues] = useState({
    directCost: asText('direct_cost'),
    overheadCost: asText('overhead_cost'),
    contingencyCost: asText('contingency_cost'),
    financeCost: asText('finance_cost'),
    taxAmount: asText('tax_amount'),
    profitAmount: asText('profit_amount'),
    profitMarginPercent: asText('profit_margin_percent'),
  });

  // `money` phân biệt ô TIỀN với ô PHẦN TRĂM: chỉ ô tiền mới nhóm dấu chấm hàng nghìn. Gắn
  // nhầm vào tỷ lệ thì `12.5` thành `125` — sai mười lần biên lợi nhuận.
  const FIELDS: { key: keyof typeof values; label: string; money: boolean }[] = [
    { key: 'overheadCost', label: 'Chi phí chung', money: true },
    { key: 'contingencyCost', label: 'Dự phòng rủi ro', money: true },
    { key: 'financeCost', label: 'Chi phí tài chính', money: true },
    { key: 'taxAmount', label: 'Thuế', money: true },
    { key: 'profitAmount', label: 'Lợi nhuận dự kiến', money: true },
    { key: 'profitMarginPercent', label: 'Tỷ lệ lợi nhuận (%)', money: false },
  ];

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-3 font-medium">Cập nhật cấu thành giá</p>
      <p className="mb-3 text-fg-subtle">
        Chi phí trực tiếp tính tự động từ bảng chi tiết bên dưới, không nhập tay.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.money ? (
              <MoneyInput
                value={values[f.key]}
                onChange={(v) => setValues({ ...values, [f.key]: v })}
              />
            ) : (
              <Input
                value={values[f.key]}
                inputMode="decimal"
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
      <Button
        variant="secondary"
        className="mt-3"
        disabled={pending}
        onClick={() => onSave({ ...values, directCost: asText('direct_cost') })}
      >
        {pending ? 'Đang lưu…' : BUTTONS.save}
      </Button>
    </div>
  );
}

function toInput(item: {
  cost_group: CostGroup;
  description: string;
  unit: string | null;
  quantity: string;
  unit_price: unknown;
}): EstimateItemInput {
  return {
    cost_group: item.cost_group,
    description: item.description,
    unit: item.unit,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
  };
}
