/**
 * Gom đề nghị mua — Đợt 4, 4A (mẫu Danh sách, AFD 4.2).
 *
 * Mỗi dòng là MỘT loại vật tư (cùng pháp nhân + mã + đơn vị) đang chờ Mua hàng, gộp từ mọi công
 * trình / xưởng: tổng số lượng, ngày cần sớm nhất, các nguồn. Xếp theo ngày cần (CSDL xếp —
 * `mh_purchase_pool`, 0200). Phạm vi do RLS quyết: chỉ huy trưởng chỉ thấy công trình được giao.
 *
 * Đơn hàng vẫn MỘT đề nghị MỘT đơn — mỗi đề nghị gắn ngân sách và địa điểm giao riêng (KT-05). Thứ
 * gộp là việc hỏi giá: «Hỏi giá chung» tạo báo giá nháp của một nhà cung cấp trên mọi đề nghị nguồn,
 * «Nhập giá chung» ghi một đơn giá vào tất cả. Máy KHÔNG chọn nhà cung cấp — người chọn ở từng đề
 * nghị, trong bảng so giá.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PURCHASE_REQUEST_STAGE_META, formatDate, formatDeadline, formatNumber } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useSuppliers } from '@/hooks/use-purchasing';
import {
  usePurchasePool,
  useRequestGroupQuotation,
  useSetGroupQuotationPrice,
  type PoolGroup,
} from '@/hooks/use-purchase-pool';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { MhNav } from './mh-nav';

export function PurchasePoolPage() {
  const { data, isLoading, error, refetch } = usePurchasePool();
  const canWork = useCan('MH', 'edit');
  const [onlyMulti, setOnlyMulti] = useState(false);
  const scope = useCompanyScope();

  // Bộ chọn pháp nhân là bộ lọc HIỂN THỊ (RLS đã giới hạn phạm vi); «Toàn NVG» thì giữ cả.
  const inScope = (data ?? []).filter(
    (g) => scope.isAggregate || !scope.companyId || g.company_id === scope.companyId,
  );
  const groups = inScope.filter((g) => !onlyMulti || g.request_count > 1);
  const multi = inScope.filter((g) => g.request_count > 1).length;

  return (
    <>
      <MhNav />
      <PageHeader
        title="Gom đề nghị mua"
        breadcrumbs={[{ label: 'Mua hàng – Vật tư' }, { label: 'Gom đề nghị mua' }]}
        description="Đề nghị đang chờ Mua hàng từ mọi công trình và xưởng, gộp theo vật tư, xếp theo ngày cần."
      />

      <label className="mb-4 flex min-h-10 items-center gap-2">
        <input
          type="checkbox"
          checked={onlyMulti}
          onChange={(e) => setOnlyMulti(e.target.checked)}
          className="size-4"
        />
        <span>Chỉ vật tư cần ở nhiều đề nghị{multi > 0 ? ` (${multi})` : ''}</span>
      </label>

      {isLoading ? (
        <CardGridSkeleton count={4} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState message="Không có đề nghị nào đang chờ Mua hàng. Đề nghị đã gửi phê duyệt hoặc đã duyệt mà chưa đặt hàng sẽ hiện ở đây." />
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <PoolGroupCard key={g.group_key} group={g} canWork={canWork} />
          ))}
        </ul>
      )}
    </>
  );
}

function PoolGroupCard({ group, canWork }: { group: PoolGroup; canWork: boolean }) {
  const [open, setOpen] = useState(false);
  const deadline = group.earliest_needed ? formatDeadline(group.earliest_needed) : '';
  const late = deadline.startsWith('Quá hạn');

  return (
    <li className="rounded-card bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="mt-1 size-4 shrink-0 text-fg-subtle" aria-hidden />
        ) : (
          <ChevronRight className="mt-1 size-4 shrink-0 text-fg-subtle" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {group.name}
            {group.specification ? ` — ${group.specification}` : ''}
          </span>
          <span className="block text-xs text-fg-subtle">
            {group.item_code ? `Mã ${group.item_code}` : 'Chưa có mã vật tư'} · Pháp nhân{' '}
            {group.company_code} · {group.request_count} đề nghị
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums">
            {formatNumber(Number(group.total_quantity))} {group.unit}
          </span>
          {group.earliest_needed && (
            <span
              className={`block text-xs ${late ? 'font-semibold text-status-overdue' : 'text-fg-subtle'}`}
            >
              Cần {formatDate(group.earliest_needed)} · {deadline}
            </span>
          )}
          {group.has_urgent && (
            <span className="block text-xs font-semibold text-status-overdue">
              Có đề nghị cần gấp
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <ul className="space-y-2">
            {group.sources.map((s) => (
              <li
                key={s.item_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-surface-sunken px-3 py-2"
              >
                <span className="min-w-0">
                  <Link
                    to={`/mh/de-nghi-mua/${s.request_id}?tab=bao-gia`}
                    className="font-medium text-brand hover:underline"
                  >
                    {s.request_code ?? 'Đề nghị mua'}
                  </Link>
                  <span className="block text-xs text-fg-subtle">
                    {s.site_code ? `${s.site_code} — ${s.site_name}` : 'Không gắn công trình'}
                    {s.requester_name ? ` · ${s.requester_name}` : ''}
                    {s.needed_date ? ` · cần ${formatDate(s.needed_date)}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">
                    {formatNumber(Number(s.quantity))} {group.unit}
                  </span>
                  <StatusLozenge status={PURCHASE_REQUEST_STAGE_META[s.stage].statusGroup} />
                </span>
              </li>
            ))}
          </ul>
          {canWork && <GroupQuoteActions group={group} />}
        </div>
      )}
    </li>
  );
}

function GroupQuoteActions({ group }: { group: PoolGroup }) {
  const { data: suppliers } = useSuppliers();
  const ask = useRequestGroupQuotation();
  const price = useSetGroupQuotationPrice();
  const [supplierId, setSupplierId] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [days, setDays] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const itemIds = group.sources.map((s) => s.item_id);

  async function run(action: () => Promise<string>) {
    setMessage(null);
    try {
      setMessage({ ok: true, text: await action() });
    } catch (e) {
      setMessage({ ok: false, text: toUserMessage(e, 'edit') });
    }
  }

  return (
    <div className="space-y-3 rounded-sm border border-border p-3">
      <p className="text-xs text-fg-subtle">
        Hỏi giá một lần cho cả {group.request_count} đề nghị. Mỗi đề nghị vẫn chọn nhà cung cấp và
        lập đơn hàng riêng (ngân sách và địa điểm giao của từng công trình).
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Nhà cung cấp" className="lg:col-span-2">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-10 w-full rounded-sm border border-border-strong bg-surface px-3"
          >
            <option value="">Chọn nhà cung cấp</option>
            {(suppliers ?? [])
              .filter((s) => s.supplier_class !== 'ngung_giao_dich')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={`Đơn giá (đồng / ${group.unit})`}>
          <MoneyInput value={unitPrice} onChange={setUnitPrice} />
        </Field>
        <Field label="Thời hạn giao (ngày)">
          <Input
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!supplierId || ask.isPending}
          onClick={() =>
            void run(async () => {
              const n = await ask.mutateAsync({ itemIds, supplierId });
              return n > 0
                ? `Đã tạo ${n} báo giá chờ nhà cung cấp trả lời.`
                : 'Các đề nghị này đã có báo giá của nhà cung cấp này.';
            })
          }
        >
          Hỏi giá chung
        </Button>
        <Button
          disabled={!supplierId || !unitPrice || price.isPending}
          onClick={() =>
            void run(async () => {
              const n = await price.mutateAsync({
                itemIds,
                supplierId,
                unitPrice,
                deliveryDays: days ? Number(days) : null,
              });
              return `Đã ghi đơn giá cho ${n} dòng hàng. Mở từng đề nghị để so giá và chọn nhà cung cấp.`;
            })
          }
        >
          Nhập giá chung
        </Button>
      </div>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={
            message.ok
              ? 'rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed'
              : 'rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue'
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
