/**
 * Bảng đơn giá & định mức dùng chung (DA-05) — Webapp Flow 7 liệt kê đây là màn hình riêng
 * của Module DA, dùng chung cho Thiết kế (TK-07) và Cung ứng (MH-05).
 *
 * ⚠️ Toàn bộ bảng này là GIÁ VỐN. Vai trò không được xem giá vốn nhận danh sách rỗng — nên
 * trạng thái rỗng phải nói rõ vì sao, thay vì để người dùng tưởng hệ thống chưa có dữ liệu.
 */

import { useState, type FormEvent } from 'react';
import {
  BUTTONS,
  COST_GROUPS,
  COST_GROUP_LABELS,
  UNIT_PRICE_SOURCES,
  UNIT_PRICE_SOURCE_LABELS,
  formatCurrency,
  formatDate,
  type CostGroup,
  type UnitPriceSource,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCreateUnitPrice,
  useLogSensitiveView,
  useUnitPrices,
  type UnitPriceRecord,
} from '@/hooks/use-unit-prices';
import { useCan } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { DaNav } from './da-nav';

interface UnitPriceRow extends EntityRow {
  record: UnitPriceRecord;
}

export function UnitPriceListPage() {
  const canCreate = useCan('DA', 'create');
  const companyId = useCompanyStore((s) => s.selectedCompanyId);
  const { data, isLoading, error, refetch } = useUnitPrices();
  const createPrice = useCreateUnitPrice();

  // Một lượt mở màn hình = một dòng nhật ký truy cập dữ liệu nhạy cảm (PRD NEN-07).
  useLogSensitiveView('unit_prices', !isLoading && (data ?? []).length > 0);

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    itemCode: '',
    name: '',
    unit: '',
    costGroup: 'vat_tu' as CostGroup,
    price: '',
    source: 'bao_gia_ncc' as UnitPriceSource,
    supplierName: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
  });

  const rows: UnitPriceRow[] = (data ?? []).map((p) => ({
    id: p.id,
    code: p.item_code,
    title: p.name,
    responsiblePerson: p.supplier_name,
    status: 'in_progress',
    deadline: null,
    companyId: p.company_id,
    record: p,
  }));

  async function addPrice(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.itemCode.trim() || !form.name.trim() || !form.unit.trim() || !form.price.trim()) {
      setFormError('Vui lòng nhập mã, tên, đơn vị tính và đơn giá.');
      return;
    }
    if (!companyId) {
      setFormError('Chưa chọn pháp nhân. Chọn pháp nhân ở thanh bên trước khi thêm đơn giá.');
      return;
    }
    try {
      await createPrice.mutateAsync({
        companyId,
        itemCode: form.itemCode.trim(),
        name: form.name.trim(),
        unit: form.unit.trim(),
        costGroup: form.costGroup,
        price: form.price,
        source: form.source,
        supplierName: form.supplierName.trim() || null,
        effectiveDate: form.effectiveDate,
        notes: null,
      });
      setForm({ ...form, itemCode: '', name: '', unit: '', price: '', supplierName: '' });
      setShowForm(false);
    } catch (err) {
      setFormError(toUserMessage(err, 'create'));
    }
  }

  return (
    <>
      <DaNav />
      <PageHeader
        title="Đơn giá & định mức"
        description="Dùng chung cho Đấu thầu, Thiết kế và Mua hàng. Đây là dữ liệu giá vốn — mọi lượt xem được ghi nhật ký."
        breadcrumbs={[{ label: 'Dự án – Đấu thầu' }, { label: 'Đơn giá & định mức' }]}
        actions={
          canCreate ? (
            <Button variant={showForm ? 'subtle' : 'primary'} onClick={() => setShowForm(!showForm)}>
              {showForm ? BUTTONS.cancel : 'Thêm đơn giá'}
            </Button>
          ) : undefined
        }
      />

      {showForm && (
        <form
          onSubmit={addPrice}
          className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Mã vật tư / công việc" required>
              <Input
                value={form.itemCode}
                onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
              />
            </Field>
            <Field label="Tên" required className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Đơn vị" required>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Field>
            <Field label="Nhóm chi phí">
              <select
                value={form.costGroup}
                onChange={(e) => setForm({ ...form, costGroup: e.target.value as CostGroup })}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                {COST_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {COST_GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Đơn giá" required hint="Đơn vị đồng.">
              <Input
                value={form.price}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d]/g, '') })}
              />
            </Field>
            <Field label="Nguồn">
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as UnitPriceSource })}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                {UNIT_PRICE_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {UNIT_PRICE_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày hiệu lực">
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </Field>
            <Field label="Nhà cung cấp" className="sm:col-span-2">
              <Input
                value={form.supplierName}
                onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
              />
            </Field>
          </div>

          {formError && (
            <p role="alert" className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" className="mt-3" disabled={createPrice.isPending}>
            {createPrice.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
        </form>
      )}

      <EntityTable<UnitPriceRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        // Đơn giá không có màn hình Chi tiết riêng — giữ người dùng ở lại danh sách.
        detailPath={() => '/da/don-gia'}
        searchPlaceholder="Tìm theo mã, tên hoặc nhà cung cấp…"
        emptyMessage="Chưa có đơn giá nào hiển thị. Đây là dữ liệu giá vốn: nếu vai trò hiện tại không được xem giá vốn thì danh sách luôn rỗng — liên hệ Phòng Dự án – Đấu thầu khi cần số liệu."
        columns={[
          {
            key: 'group',
            header: 'Nhóm chi phí',
            render: (r) => COST_GROUP_LABELS[r.record.cost_group],
          },
          { key: 'unit', header: 'Đơn vị', render: (r) => r.record.unit },
          {
            key: 'price',
            header: 'Đơn giá',
            numeric: true,
            render: (r) => formatCurrency(r.record.price),
          },
          {
            key: 'source',
            header: 'Nguồn',
            render: (r) => UNIT_PRICE_SOURCE_LABELS[r.record.source],
          },
          {
            key: 'date',
            header: 'Ngày hiệu lực',
            render: (r) => formatDate(r.record.effective_date),
          },
        ]}
      />
    </>
  );
}
