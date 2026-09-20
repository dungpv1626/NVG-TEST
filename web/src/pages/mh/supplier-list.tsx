/**
 * Danh mục Nhà cung cấp (MH-03) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * KHÔNG lọc theo pháp nhân: đây là bảng dùng chung của cả ba công ty. Lọc ở đây sẽ khiến
 * cùng một nhà cung cấp bị nhập ba lần với ba mã khác nhau, và lịch sử giá MH-05 vỡ làm ba.
 *
 * Cột trạng thái dùng nhóm chuẩn: nhà cung cấp chính và dự phòng đều là "Đang xử lý" (đang
 * giao dịch), đã ngừng giao dịch là "Hoàn thành" (hồ sơ đã đóng). Không tạo màu thứ bảy.
 */

import { useState } from 'react';
import type { StatusGroup, SupplierClass } from '@nvg/shared';
import { SUPPLIER_CLASS_LABELS, SUPPLIER_CRITERIA } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useSaveSupplier, useSuppliers, type SupplierRecord } from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { MhNav } from './mh-nav';

const CLASS_STATUS: Record<SupplierClass, StatusGroup> = {
  chinh: 'in_progress',
  du_phong: 'in_progress',
  ngung_giao_dich: 'completed',
};

interface SupplierRow extends EntityRow {
  classLabel: string;
  category: string | null;
  contact: string | null;
  ratedCount: number;
}

function ratedCount(supplier: SupplierRecord): number {
  return SUPPLIER_CRITERIA.filter((c) => supplier[c.column as keyof SupplierRecord] != null).length;
}

export function SupplierListPage() {
  const canEdit = useCan('MH', 'edit');
  const { data, isLoading, error, refetch } = useSuppliers();
  const save = useSaveSupplier();
  const [isFormOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const rows: SupplierRow[] = (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    title: s.name,
    responsiblePerson: s.contact_person,
    status: CLASS_STATUS[s.supplier_class],
    deadline: null,
    createdAt: s.created_at,
    classLabel: SUPPLIER_CLASS_LABELS[s.supplier_class],
    category: s.category,
    contact: s.phone,
    ratedCount: ratedCount(s),
  }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    try {
      await save.mutateAsync({
        values: {
          code: String(form.get('code') ?? '').trim(),
          name: String(form.get('name') ?? '').trim(),
          category: String(form.get('category') ?? '').trim() || null,
          supplier_class: (form.get('supplier_class') as SupplierClass) ?? 'du_phong',
          tax_code: String(form.get('tax_code') ?? '').trim() || null,
          contact_person: String(form.get('contact_person') ?? '').trim() || null,
          phone: String(form.get('phone') ?? '').trim() || null,
          email: String(form.get('email') ?? '').trim() || null,
        },
      });
      setFormOpen(false);
    } catch (e) {
      setFormError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <MhNav />
      <PageHeader
        title="Nhà cung cấp"
        breadcrumbs={[{ label: 'Mua hàng – Vật tư' }, { label: 'Nhà cung cấp' }]}
        description="Danh mục dùng chung cho cả ba pháp nhân — một nhà cung cấp chỉ có một mã."
        actions={
          canEdit ? (
            <Button variant="primary" onClick={() => setFormOpen((open) => !open)}>
              {isFormOpen ? 'Đóng biểu mẫu' : 'Thêm nhà cung cấp'}
            </Button>
          ) : undefined
        }
      />

      {isFormOpen && (
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Mã nhà cung cấp" required>
              <Input name="code" required maxLength={40} placeholder="NCC-THEP-001" />
            </Field>
            <Field label="Tên nhà cung cấp" required className="lg:col-span-2">
              <Input name="name" required />
            </Field>
            <Field label="Nhóm hàng cung cấp" hint="Thép, bê tông, cốp pha, thiết bị điện…">
              <Input name="category" maxLength={128} />
            </Field>
            <Field label="Phân loại">
              <select
                name="supplier_class"
                defaultValue="du_phong"
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
              >
                <option value="chinh">{SUPPLIER_CLASS_LABELS.chinh}</option>
                <option value="du_phong">{SUPPLIER_CLASS_LABELS.du_phong}</option>
              </select>
            </Field>
            <Field label="Mã số thuế">
              <Input name="tax_code" maxLength={20} />
            </Field>
            <Field label="Người liên hệ">
              <Input name="contact_person" maxLength={128} />
            </Field>
            <Field label="Điện thoại">
              <Input name="phone" maxLength={20} />
            </Field>
            <Field label="Thư điện tử">
              <Input name="email" type="email" maxLength={255} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              Lưu
            </Button>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
          </div>
          <p className="text-xs text-fg-subtle">
            Ngừng giao dịch với một nhà cung cấp phải nêu lý do — sửa ở hồ sơ nhà cung cấp sau khi
            đã tạo.
          </p>
        </form>
      )}

      <EntityTable<SupplierRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/mh/nha-cung-cap/${row.id}`}
        showStatusFilter={false}
        // Bảng dùng chung giữa các pháp nhân — không có `company_id`, nên cột
        // "Pháp nhân" sẽ rỗng ở mọi dòng nếu để nó được chèn (Backend Schema 2.2).
        sharedAcrossCompanies
        searchPlaceholder="Tìm theo mã, tên nhà cung cấp hoặc người liên hệ…"
        emptyMessage="Chưa có nhà cung cấp nào trong danh mục. Thêm nhà cung cấp để bắt đầu hỏi báo giá và theo dõi lịch sử giao dịch."
        columns={[
          { key: 'class', header: 'Phân loại', render: (r) => r.classLabel },
          {
            key: 'category',
            header: 'Nhóm hàng',
            render: (r) => r.category ?? <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'contact',
            header: 'Điện thoại',
            render: (r) => r.contact ?? <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'rated',
            header: 'Tiêu chí đã chấm',
            numeric: true,
            render: (r) =>
              r.ratedCount > 0 ? (
                `${r.ratedCount}/${SUPPLIER_CRITERIA.length}`
              ) : (
                <span className="text-fg-subtle">Chưa đánh giá</span>
              ),
          },
        ]}
      />
    </>
  );
}
