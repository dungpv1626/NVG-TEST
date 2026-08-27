/**
 * Lệnh sản xuất (SX-01) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * ⚠️ PRD ghi thẳng "cần xác nhận thêm" — Xưởng sản xuất giàn giáo NVS chưa có khảo sát trực
 * tiếp (PRD Mục 10, CLAUDE.md 5.6). Màn hình này CỐ Ý dừng ở mức khung tối thiểu: tên sản
 * phẩm, số lượng, trạng thái. KHÔNG có định mức tiêu hao chuẩn, kế hoạch sản xuất theo tổ hay
 * công thức giá thành — những thứ đó cần dữ liệu khảo sát mới định nghĩa đúng được.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCTION_ORDER_STATUS_META, productionOrderDisplayStatus } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BlockedNotice } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCreateProductionOrder, useProductionOrders } from '@/hooks/use-sx';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { SxNav } from './sx-nav';

interface OrderRow extends EntityRow {
  statusLabel: string;
  quantityLabel: string;
}

export function ProductionOrderListPage() {
  const navigate = useNavigate();
  const canEdit = useCan('SX', 'edit');
  const scope = useCompanyScope();

  const { data, isLoading, error, refetch } = useProductionOrders();
  const create = useCreateProductionOrder();

  const [isFormOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const rows: OrderRow[] = (data ?? []).map((o) => ({
    id: o.id,
    code: o.code,
    title: o.product,
    responsiblePerson: null,
    status: productionOrderDisplayStatus(o.status),
    deadline: o.planned_end_date,
    companyId: o.company_id,
    createdAt: o.created_at,
    statusLabel: PRODUCTION_ORDER_STATUS_META[o.status].label,
    quantityLabel: `${o.quantity}${o.unit ? ` ${o.unit}` : ''}`,
  }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (scope.isAggregate || !scope.companyId || !scope.companyCode) {
      setFormError('Chọn pháp nhân (NVS) trước khi lập lệnh sản xuất.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get('quantity') ?? 0);
    if (quantity <= 0) {
      setFormError('Số lượng phải lớn hơn 0.');
      return;
    }

    try {
      // Mã hồ sơ do CSDL cấp — hai người tạo cùng lúc không thể nhận trùng mã.
      const { data: code, error: codeError } = await supabase.rpc('next_record_code', {
        p_company_code: scope.companyCode,
        p_record_type: 'LSX',
      });
      if (codeError) throw codeError;

      const order = await create.mutateAsync({
        companyId: scope.companyId,
        code,
        product: String(form.get('product') ?? ''),
        unit: String(form.get('unit') ?? ''),
        quantity,
        plannedStartDate: String(form.get('planned_start_date') ?? '') || null,
        plannedEndDate: String(form.get('planned_end_date') ?? '') || null,
        notes: String(form.get('notes') ?? ''),
      });
      setFormOpen(false);
      setFormError(null);
      void navigate(`/sx/lenh-san-xuat/${order.id}`);
    } catch (e) {
      setFormError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <SxNav />
      <PageHeader
        title="Lệnh sản xuất"
        breadcrumbs={[{ label: 'Sản xuất & Cho thuê' }, { label: 'Lệnh sản xuất' }]}
        actions={
          canEdit ? (
            <Button variant="primary" onClick={() => setFormOpen((open) => !open)}>
              {isFormOpen ? 'Đóng biểu mẫu' : 'Lập lệnh sản xuất'}
            </Button>
          ) : undefined
        }
      />

      {!canEdit && (
        <BlockedNotice
          title="Chỉ xem được lệnh sản xuất"
          detail="Lập lệnh sản xuất là việc của Xưởng NVS. Liên hệ Quản trị hệ thống nếu vai trò hiện tại cần quyền này."
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
            <Field label="Sản phẩm" required className="lg:col-span-2">
              <Input name="product" required maxLength={200} />
            </Field>
            <Field label="Số lượng" required>
              <Input name="quantity" type="number" min="0" step="0.001" required />
            </Field>
            <Field label="Đơn vị tính">
              <Input name="unit" maxLength={32} placeholder="bộ" />
            </Field>
            <Field label="Ngày dự kiến bắt đầu">
              <DateInput name="planned_start_date" />
            </Field>
            <Field label="Ngày dự kiến hoàn thành">
              <DateInput name="planned_end_date" />
            </Field>
          </div>

          <Field label="Ghi chú">
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
            />
          </Field>

          <Button type="submit" variant="primary" disabled={create.isPending}>
            Lưu lệnh sản xuất
          </Button>
        </form>
      )}

      <EntityTable<OrderRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/sx/lenh-san-xuat/${row.id}`}
        searchPlaceholder="Tìm theo mã hoặc tên sản phẩm…"
        emptyMessage="Chưa có lệnh sản xuất nào. Bấm 'Lập lệnh sản xuất' để bắt đầu."
        columns={[
          { key: 'status_label', header: 'Trạng thái lệnh', render: (r) => r.statusLabel },
          { key: 'quantity', header: 'Số lượng', numeric: true, render: (r) => r.quantityLabel },
        ]}
      />
    </>
  );
}
