/**
 * Công nợ phải thu – phải trả — KT-04, và là nguồn của phần "đã thu" ở HD-03.
 *
 * Hai chiều nợ nằm trên CÙNG một màn hình, đổi bằng hai tab: cấu trúc, cách tính tuổi nợ và
 * thao tác đối chiếu giống hệt nhau. Hai màn hình riêng chỉ nhân đôi chỗ phải sửa.
 *
 * Bảng tuổi nợ đặt ở đầu trang chứ không cuối: câu hỏi đầu tiên khi mở màn hình này luôn là
 * "có khoản nào quá hạn lâu không", không phải "khoản thứ 37 là của ai".
 *
 * Ghi nhận thu tiền đi qua hàm CSDL — đó là cửa duy nhất làm đổi `contracts.collected_amount`,
 * nên con số "đã thu" trên màn hình Hợp đồng luôn truy ngược được tới từng chứng từ.
 */

import { useState } from 'react';
import {
  PARTY_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  RECEIVABLE_DIRECTION_LABELS,
  formatCurrency,
  formatDate,
  receivableAging,
  receivableDisplayStatus,
  toMoney,
} from '@nvg/shared';
import type { PaymentMethod, ReceivableDirection } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { BlockedNotice } from '@/components/ui/states';
import { useContracts } from '@/hooks/use-contracts';
import {
  useAgingBuckets,
  useCreateReceivable,
  useReceivables,
  useRecordSettlement,
} from '@/hooks/use-accounting';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { cn } from '@/lib/utils';
import { KtNav } from './kt-nav';

const SELECT_CLASS = 'h-9 w-full rounded-sm border border-border-strong bg-surface px-3';

interface ReceivableRow extends EntityRow {
  partyLabel: string;
  amount: string;
  remaining: bigint;
}

export function ReceivablePage() {
  const canEdit = useCan('KT', 'edit');
  const scope = useCompanyScope();
  const [direction, setDirection] = useState<ReceivableDirection>('phai_thu');
  const [isFormOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [settleFor, setSettleFor] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useReceivables(direction);
  const { data: agingBuckets } = useAgingBuckets();
  const { data: contracts } = useContracts();
  const create = useCreateReceivable();
  const settle = useRecordSettlement();

  const aging = receivableAging(
    (data ?? []).map((r) => ({
      amount: r.amount,
      settledAmount: r.settled_amount,
      dueDate: r.due_date,
    })),
    agingBuckets ?? [],
  );

  const rows: ReceivableRow[] = (data ?? []).map((r) => ({
    id: r.id,
    code: r.code ?? r.invoice_number ?? '—',
    title: r.description ?? 'Khoản công nợ',
    responsiblePerson: r.customer?.name ?? r.supplier?.name ?? r.party_name ?? null,
    status: receivableDisplayStatus(r.amount, r.settled_amount, r.due_date),
    deadline: r.due_date,
    companyId: r.company_id,
    createdAt: r.invoice_date,
    partyLabel: PARTY_TYPE_LABELS[r.party_type],
    amount: r.amount,
    remaining: toMoney(r.amount) - toMoney(r.settled_amount),
  }));

  async function submitNew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!scope.companyId || scope.isAggregate) return;
    try {
      await create.mutateAsync({
        companyId: scope.companyId,
        direction,
        partyType: direction === 'phai_thu' ? 'khach_hang' : 'nha_cung_cap',
        contractId: String(values.get('contract_id') ?? '') || null,
        partyName: String(values.get('party_name') ?? ''),
        invoiceNumber: String(values.get('invoice_number') ?? ''),
        invoiceDate: String(values.get('invoice_date') ?? '') || null,
        description: String(values.get('description') ?? ''),
        amount: amount || '0',
        dueDate: String(values.get('due_date') ?? '') || null,
      });
      form.reset();
      setAmount('');
      setFormOpen(false);
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  async function submitSettlement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!settleFor) return;
    try {
      await settle.mutateAsync({
        receivableId: settleFor,
        settledDate: String(values.get('settled_date') ?? ''),
        amount: settleAmount || '0',
        method: (values.get('method') as PaymentMethod) || null,
        reference: String(values.get('reference') ?? ''),
      });
      form.reset();
      setSettleAmount('');
      setSettleFor(null);
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <KtNav />
      <PageHeader
        title="Công nợ"
        description="Theo dõi theo khách hàng, nhà cung cấp, hợp đồng và hạn thanh toán."
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Công nợ' }]}
        actions={
          canEdit && !scope.isAggregate ? (
            <Button variant="primary" onClick={() => setFormOpen((open) => !open)}>
              {isFormOpen ? 'Đóng biểu mẫu' : 'Lập khoản công nợ'}
            </Button>
          ) : undefined
        }
      />

      {pageError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {pageError}
        </p>
      )}

      {/* Hai chiều công nợ — dùng nút chọn thay vì hai mục menu riêng. */}
      <div className="mb-4 flex gap-1" role="tablist" aria-label="Chiều công nợ">
        {(['phai_thu', 'phai_tra'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={direction === value}
            onClick={() => setDirection(value)}
            className={cn(
              'rounded-sm px-3 py-1.5',
              direction === value
                ? 'bg-brand text-white font-semibold'
                : 'bg-surface-sunken text-fg-subtle hover:text-fg',
            )}
          >
            {RECEIVABLE_DIRECTION_LABELS[value]}
          </button>
        ))}
      </div>

      {/*
        Bảng tuổi nợ — KT-04 "số ngày quá hạn … hỗ trợ đối chiếu định kỳ".

        Số cột đến từ CẤU HÌNH (`aging_buckets`), không cố định trong mã: NVG chưa ban hành mốc
        chính thức, và khi ban hành thì sửa mốc phải là một thao tác trong Quản trị hệ thống.
      */}
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {aging.rows.map((row) => (
          <div key={row.code} className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-fg-muted">{row.label}</p>
            <p className="tabular-nums font-semibold">{formatCurrency(row.total)}</p>
            <p className="text-fg-subtle">
              {row.entries === 0 ? 'Không có khoản nào' : `${row.entries} khoản`}
            </p>
          </div>
        ))}
      </div>

      {isFormOpen && (
        <form
          onSubmit={(e) => void submitNew(e)}
          className="mb-4 grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Diễn giải" required className="lg:col-span-3">
            <Input
              name="description"
              required
              maxLength={200}
              placeholder="Ví dụ: Đợt 2 — sau nghiệm thu phần thô"
            />
          </Field>
          <Field
            label="Hợp đồng"
            hint="Chọn hợp đồng thì mỗi lần thu sẽ cộng vào phần 'đã thu' của chính hợp đồng đó."
          >
            <select name="contract_id" className={SELECT_CLASS}>
              <option value="">Không gắn hợp đồng</option>
              {(contracts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tên đối tác" hint="Dùng khi đối tác chưa có hồ sơ trong danh mục.">
            <Input name="party_name" maxLength={200} />
          </Field>
          <Field label="Số tiền (đồng)" required>
            <MoneyInput value={amount} onChange={setAmount} required />
          </Field>
          <Field label="Số hóa đơn">
            <Input name="invoice_number" maxLength={64} />
          </Field>
          <Field label="Ngày hóa đơn">
            <DateInput name="invoice_date" />
          </Field>
          <Field label="Hạn thanh toán" required>
            <DateInput name="due_date" required />
          </Field>
          <div className="lg:col-span-3">
            <Button type="submit" variant="primary" disabled={create.isPending}>
              Lưu khoản công nợ
            </Button>
          </div>
        </form>
      )}

      {settleFor && (
        <form
          onSubmit={(e) => void submitSettlement(e)}
          className="mb-4 grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-4"
        >
          <Field label={direction === 'phai_thu' ? 'Ngày thu' : 'Ngày trả'} required>
            <DateInput name="settled_date" required />
          </Field>
          <Field label="Số tiền (đồng)" required>
            <MoneyInput value={settleAmount} onChange={setSettleAmount} required />
          </Field>
          <Field label="Hình thức">
            <select name="method" defaultValue="chuyen_khoan" className={SELECT_CLASS}>
              <option value="chuyen_khoan">{PAYMENT_METHOD_LABELS.chuyen_khoan}</option>
              <option value="tien_mat">{PAYMENT_METHOD_LABELS.tien_mat}</option>
            </select>
          </Field>
          <Field label="Số chứng từ">
            <Input name="reference" maxLength={64} />
          </Field>
          <div className="flex gap-2 sm:col-span-4">
            <Button type="submit" variant="primary" disabled={settle.isPending}>
              Ghi nhận
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSettleFor(null)}>
              Đóng
            </Button>
          </div>
        </form>
      )}

      {scope.isAggregate && (
        <BlockedNotice
          title="Đang xem gộp Toàn NVG"
          detail="Danh sách bên dưới gộp cả ba pháp nhân và có cột Pháp nhân để đọc đúng số. Chọn một pháp nhân cụ thể ở thanh bên nếu cần lập khoản công nợ mới."
        />
      )}

      <EntityTable<ReceivableRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/kt/cong-no?khoan=${row.id}`}
        searchPlaceholder="Tìm theo đối tác, số hóa đơn hoặc diễn giải…"
        emptyMessage={
          direction === 'phai_thu'
            ? 'Chưa có khoản phải thu nào. Lập khoản phải thu theo từng đợt thanh toán của hợp đồng để hệ thống nhắc trước hạn.'
            : 'Chưa có khoản phải trả nào. Khoản phải trả thường lập từ hóa đơn của nhà cung cấp sau khi hàng đã nhận đủ.'
        }
        columns={[
          { key: 'party', header: 'Đối tượng', render: (r) => r.partyLabel },
          {
            key: 'amount',
            header: 'Giá trị',
            numeric: true,
            render: (r) => formatCurrency(r.amount),
          },
          {
            key: 'remaining',
            header: direction === 'phai_thu' ? 'Còn phải thu' : 'Còn phải trả',
            numeric: true,
            render: (r) =>
              r.remaining > 0n ? (
                <span className="font-semibold">{formatCurrency(r.remaining)}</span>
              ) : (
                <span className="text-fg-subtle">Đã tất toán</span>
              ),
          },
          {
            key: 'action',
            header: 'Thao tác',
            render: (r) =>
              canEdit && r.remaining > 0n ? (
                <Button variant="subtle" onClick={() => setSettleFor(r.id)}>
                  {direction === 'phai_thu' ? 'Ghi nhận thu' : 'Ghi nhận trả'}
                </Button>
              ) : (
                <span className="text-fg-subtle">—</span>
              ),
          },
        ]}
      />

      <p className="mt-3 text-fg-muted">
        Ngày đến hạn hôm nay vẫn tính là chưa quá hạn: bên trả còn cả ngày để chuyển tiền. Số
        &quot;đã thu&quot; của hợp đồng chỉ đổi qua chứng từ ghi ở đây, không sửa tay được. Các mốc
        chia nhóm quá hạn (30 / 60 / 90 ngày) là giá trị khởi tạo, Quản trị hệ thống sửa lại được
        khi Nhà Việt Group ban hành quy chế công nợ chính thức.
      </p>
    </>
  );
}
