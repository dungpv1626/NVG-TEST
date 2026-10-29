/**
 * Cho thuê giàn giáo (SX-03) — mẫu bố cục Danh sách (Webapp Flow 4.2), kèm biểu mẫu lập
 * hợp đồng gấp gọn trên cùng màn hình.
 *
 * Không tách "Tạo hợp đồng" thành trang riêng: `create_rental_agreement` xuất giáo và ghi hồ
 * sơ trong CÙNG một giao dịch (không có bước "lưu nháp rồi thêm mặt hàng sau" như MH), nên
 * toàn bộ mặt hàng phải nhập ngay ở đây — giống cách `StockMovementPage` (Module KHO) đã làm
 * cho phiếu kho.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MODULE_EMPTY_STATES,
  formatCurrency,
  rentalAgreementDisplayStatus,
  RENTAL_AGREEMENT_STATUS_META,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { BlockedNotice } from '@/components/ui/states';
import { useConstructionSites } from '@/hooks/use-construction-sites';
import { useEntityList } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import { useMaterials } from '@/hooks/use-warehouse';
import {
  useCreateRentalAgreement,
  useRentalAgreements,
  type RentalItemInput,
} from '@/hooks/use-sx';
import {
  useCreateRentalFromContract,
  useRentalContractsReady,
  useRentalQuotes,
} from '@/hooks/use-sx-rental';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { SxNav } from './sx-nav';
import { APP_HELP } from '@/lib/help-texts';

interface RentalRow extends EntityRow {
  statusLabel: string;
  depositLabel: string;
}

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface DraftItem {
  key: number;
  materialId: string;
  quantity: string;
  dailyRate: string;
}

function emptyItem(key: number): DraftItem {
  return { key, materialId: '', quantity: '', dailyRate: '' };
}

export function RentalAgreementListPage() {
  const navigate = useNavigate();
  const canEdit = useCan('SX', 'edit');
  const scope = useCompanyScope();

  const { data, isLoading, error, refetch } = useRentalAgreements();
  const { data: customers } = useEntityList<CustomerOption>({
    table: 'customers',
    select: 'id, code, name',
    scopedByCompany: false,
    orderBy: { column: 'name', ascending: true },
  });
  const { data: sites } = useConstructionSites();
  const { data: materials } = useMaterials();
  const scaffoldingMaterials = useMemo(
    () => (materials ?? []).filter((m) => m.is_scaffolding),
    [materials],
  );
  const materialById = useMemo(
    () => new Map(scaffoldingMaterials.map((m) => [m.id, m])),
    [scaffoldingMaterials],
  );

  const create = useCreateRentalAgreement();
  const createFromContract = useCreateRentalFromContract();
  const companyId = scope.isAggregate ? null : scope.companyId;
  // G5 (0245): đơn thuê lập từ hợp đồng cho thuê đã ký — khách, ngày, hàng và giá lấy sẵn.
  const { data: readyContracts } = useRentalContractsReady(canEdit ? companyId : null);
  const { data: quotes } = useRentalQuotes(canEdit ? companyId : null);

  const [isFormOpen, setFormOpen] = useState(false);
  const [contractId, setContractId] = useState('');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deposit, setDeposit] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem(1)]);
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    setContractId('');
    setQuoteId(null);
    setStartDate('');
    setEndDate('');
    setDeposit('');
    setCustomerId('');
    setSiteId('');
    setSiteAddress('');
    setItems([emptyItem(Date.now())]);
    setFormError(null);
  }

  /** Chọn hợp đồng: điền khách, ngày; báo giá đã duyệt gần nhất của khách điền dòng hàng + giá. */
  function chooseContract(id: string) {
    setContractId(id);
    const k = readyContracts?.find((c) => c.contract_id === id);
    if (!k) {
      setQuoteId(null);
      return;
    }
    setCustomerId(k.customer_id);
    setStartDate(k.start_date ?? '');
    setEndDate(k.end_date ?? '');
    const q = quotes?.find((x) => x.id === k.quote_id);
    setQuoteId(q?.id ?? null);
    const rentLines = (q?.items ?? []).filter((i) => i.kind === 'thue');
    if (rentLines.length > 0) {
      setItems(
        rentLines.map((i, n) => ({
          key: Date.now() + n,
          materialId: i.material_id,
          quantity: String(i.quantity),
          dailyRate: String(i.unit_price),
        })),
      );
      if (q?.deposit_amount) setDeposit(String(q.deposit_amount));
    }
  }
  const chosenContract = readyContracts?.find((c) => c.contract_id === contractId) ?? null;

  const rows: RentalRow[] = (data ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    title: a.customer?.name ?? a.code,
    responsiblePerson: a.creator?.full_name ?? null,
    status: rentalAgreementDisplayStatus(a.status, a.expected_end_date),
    deadline: a.expected_end_date,
    companyId: a.company_id,
    createdAt: a.created_at,
    statusLabel: RENTAL_AGREEMENT_STATUS_META[a.status].label,
    depositLabel: formatCurrency(a.deposit_amount),
  }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (scope.isAggregate || !scope.companyId) {
      setFormError('Chọn pháp nhân (NVS) trước khi lập hợp đồng thuê.');
      return;
    }
    if (!customerId) {
      setFormError('Chọn khách thuê.');
      return;
    }
    if (!startDate) {
      setFormError('Chọn ngày bắt đầu thuê.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const preparedItems: RentalItemInput[] = items
      .filter((it) => it.materialId && Number(it.quantity) > 0)
      .map((it) => ({
        material_id: it.materialId,
        quantity: Number(it.quantity),
        daily_rate: Number(it.dailyRate) || 0,
      }));

    if (preparedItems.length === 0) {
      setFormError('Chưa có loại giàn giáo nào với số lượng lớn hơn 0.');
      return;
    }

    try {
      const id = contractId
        ? await createFromContract.mutateAsync({
            contractId,
            quoteId,
            startDate,
            expectedEndDate: endDate || null,
            siteAddress: siteAddress.trim() || null,
            depositAmount: Number(deposit || 0),
            notes: String(form.get('notes') ?? ''),
            items: preparedItems,
          })
        : await create.mutateAsync({
            companyId: scope.companyId,
            customerId,
            constructionSiteId: siteId || null,
            siteAddress: siteAddress.trim() || null,
            startDate,
            expectedEndDate: endDate || null,
            depositAmount: Number(deposit || 0),
            notes: String(form.get('notes') ?? ''),
            items: preparedItems,
          });
      resetForm();
      setFormOpen(false);
      // Lưu xong đi thẳng vào Chi tiết hồ sơ vừa tạo (Webapp Flow 4.4).
      void navigate(`/sx/tai-san-cho-thue/${id}`);
    } catch (e) {
      setFormError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <PageHeader
        help={APP_HELP.rentals}
        title="Cho thuê giàn giáo"
        breadcrumbs={[{ label: 'Sản xuất & Cho thuê' }, { label: 'Cho thuê giàn giáo' }]}
        actions={
          canEdit ? (
            <Button variant="primary" onClick={() => setFormOpen((open) => !open)}>
              {isFormOpen ? 'Đóng biểu mẫu' : 'Lập hợp đồng thuê'}
            </Button>
          ) : undefined
        }
      />
      <SxNav />

      {!canEdit && (
        <BlockedNotice
          title="Chỉ xem được hợp đồng thuê giàn giáo"
          detail="Lập và thu hồi hợp đồng thuê là việc của bộ phận Kho (NVS). Liên hệ Quản trị hệ thống nếu vai trò hiện tại cần quyền này."
        />
      )}

      {isFormOpen && canEdit && (
        <form
          onSubmit={(e) => void submit(e)}
          className="mb-4 space-y-4 rounded-card bg-surface p-4"
        >
          {formError && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}

          {(readyContracts ?? []).length > 0 && (
            <Field
              label="Lập từ hợp đồng cho thuê đã ký"
              hint={
                chosenContract
                  ? quoteId
                    ? `Đã lấy khách, ngày và dòng hàng theo báo giá ${chosenContract.quote_code}.`
                    : 'Đã lấy khách và ngày theo hợp đồng. Khách chưa có báo giá đã duyệt — nhập dòng hàng.'
                  : 'Để trống khi khách thuê lẻ, không có hợp đồng.'
              }
            >
              <select
                value={contractId}
                onChange={(e) => chooseContract(e.target.value)}
                className="h-11 w-full rounded-field border border-border-strong bg-surface px-3"
              >
                <option value="">Không theo hợp đồng</option>
                {(readyContracts ?? []).map((c) => (
                  <option key={c.contract_id} value={c.contract_id}>
                    {c.contract_number ?? c.code} — {c.customer_name ?? ''}
                    {c.agreements > 0 ? ` (đã có ${c.agreements} đơn)` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Khách thuê" required className="lg:col-span-2">
              <select
                value={customerId}
                disabled={contractId !== ''}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="h-11 w-full rounded-field border border-border-strong bg-surface px-3"
              >
                <option value="">Chọn khách hàng</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ngày bắt đầu thuê" required>
              <DateInput value={startDate} onChange={setStartDate} required />
            </Field>
            <Field label="Ngày dự kiến trả">
              <DateInput value={endDate} onChange={setEndDate} />
            </Field>

            <Field
              label="Công trình nhận"
              hint="Để trống nếu khách thuê dùng ở nơi NVG không theo dõi."
            >
              <select
                value={siteId}
                disabled={contractId !== ''}
                onChange={(e) => setSiteId(e.target.value)}
                className="h-11 w-full rounded-field border border-border-strong bg-surface px-3"
              >
                <option value="">Không gắn công trình</option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Địa chỉ lắp đặt" className="lg:col-span-2">
              <Input
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                maxLength={255}
              />
            </Field>
            <Field label="Tiền đặt cọc (đồng)">
              <MoneyInput value={deposit} onChange={setDeposit} />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="font-medium">Giàn giáo cho thuê</p>
            {items.map((item, index) => (
              <div key={item.key} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={`Loại giàn giáo ${index + 1}`} className="lg:col-span-2">
                  <select
                    value={item.materialId}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it) =>
                          it.key === item.key ? { ...it, materialId: e.target.value } : it,
                        ),
                      )
                    }
                    className="h-11 w-full rounded-field border border-border-strong bg-surface px-3"
                  >
                    <option value="">Chọn giàn giáo</option>
                    {scaffoldingMaterials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} — {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={`Số lượng${item.materialId ? ` (${materialById.get(item.materialId)?.unit ?? ''})` : ''}`}
                >
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it) =>
                          it.key === item.key ? { ...it, quantity: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Đơn giá thuê / ngày (đồng)">
                  <MoneyInput
                    value={item.dailyRate}
                    onChange={(v) =>
                      setItems((prev) =>
                        prev.map((it) => (it.key === item.key ? { ...it, dailyRate: v } : it)),
                      )
                    }
                  />
                </Field>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setItems((prev) => [...prev, emptyItem(Date.now())])}
            >
              Thêm dòng
            </Button>
          </div>

          <Field label="Ghi chú">
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || createFromContract.isPending}
          >
            Xuất giàn giáo và lập hợp đồng
          </Button>
        </form>
      )}

      <EntityTable<RentalRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/sx/tai-san-cho-thue/${row.id}`}
        searchPlaceholder="Tìm theo mã hợp đồng hoặc tên khách thuê…"
        emptyMessage={`${MODULE_EMPTY_STATES.SX}`}
        columns={[
          { key: 'status_label', header: 'Trạng thái hợp đồng', render: (r) => r.statusLabel },
          { key: 'deposit', header: 'Tiền cọc', numeric: true, render: (r) => r.depositLabel },
        ]}
      />
    </>
  );
}
