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
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { SxNav } from './sx-nav';

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

  const [isFormOpen, setFormOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem(1)]);
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    setCustomerId('');
    setSiteId('');
    setSiteAddress('');
    setItems([emptyItem(Date.now())]);
    setFormError(null);
  }

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
      const id = await create.mutateAsync({
        companyId: scope.companyId,
        customerId,
        constructionSiteId: siteId || null,
        siteAddress: siteAddress.trim() || null,
        startDate: String(form.get('start_date') ?? ''),
        expectedEndDate: String(form.get('expected_end_date') ?? '') || null,
        depositAmount: Number(form.get('deposit_amount') ?? 0),
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
      <SxNav />
      <PageHeader
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

      {!canEdit && (
        <BlockedNotice
          title="Chỉ xem được hợp đồng thuê giàn giáo"
          detail="Lập và thu hồi hợp đồng thuê là việc của bộ phận Kho (NVS). Liên hệ Quản trị hệ thống nếu vai trò hiện tại cần quyền này."
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
            <Field label="Khách thuê" required className="lg:col-span-2">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
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
              <DateInput name="start_date" required />
            </Field>
            <Field label="Ngày dự kiến trả">
              <DateInput name="expected_end_date" />
            </Field>

            <Field
              label="Công trình nhận"
              hint="Để trống nếu khách thuê dùng ở nơi NVG không theo dõi."
            >
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
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
              <MoneyInput name="deposit_amount" />
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
                    className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
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
              className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
            />
          </Field>

          <Button type="submit" variant="primary" disabled={create.isPending}>
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
