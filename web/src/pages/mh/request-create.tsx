/**
 * Lập Đề nghị mua (MH-01) — mẫu bố cục Biểu mẫu một trang (Webapp Flow 4.4).
 *
 * Đủ ít trường để không cần wizard. Biểu mẫu bám đúng danh sách PRD MH-01 liệt kê: tên hàng,
 * quy cách, số lượng, thời điểm cần, địa điểm giao, mã công trình, người đề nghị.
 *
 * Người đề nghị KHÔNG có ô nhập: CSDL đóng dấu từ phiên đăng nhập. Một ô chọn người ở đây
 * chỉ tạo ra khả năng ghi tên đồng nghiệp lên hồ sơ của mình.
 *
 * Chọn công trình thì mã chi phí thành bắt buộc, và chỉ chọn được trong bộ ngân sách của
 * chính công trình đó — KT-05: chi phí gắn vào mã công trình ngay khi phát sinh.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PURCHASE_URGENCY_LABELS } from '@nvg/shared';
import type { PurchaseUrgency } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BlockedNotice } from '@/components/ui/states';
import { useConstructionSites } from '@/hooks/use-construction-sites';
import { useCreatePurchaseRequest, useSiteCostCodes } from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';

export function PurchaseRequestCreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const canCreate = useCan('MH', 'create');
  const scope = useCompanyScope();
  const create = useCreatePurchaseRequest();

  const [siteId, setSiteId] = useState<string>(params.get('cong-trinh') ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: sites } = useConstructionSites();
  const { data: costCodes } = useSiteCostCodes(siteId || undefined);

  if (!canCreate) {
    return (
      <BlockedNotice
        title="Chưa được cấp quyền lập đề nghị mua"
        detail="Lập đề nghị mua là việc của Phòng Mua hàng và Ban công trường. Liên hệ Quản trị hệ thống nếu vai trò hiện tại cần quyền này."
      />
    );
  }

  if (scope.isAggregate || !scope.companyId) {
    return (
      <BlockedNotice
        title="Chọn pháp nhân trước khi lập đề nghị"
        detail="Đề nghị mua thuộc về một pháp nhân cụ thể vì chi phí của nó vào P&L của đúng công ty đó. Chọn NVC, NVO hoặc NVS ở thanh bên."
      />
    );
  }

  const companyId = scope.companyId;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);

    try {
      const id = await create.mutateAsync({
        companyId,
        title: String(form.get('title') ?? ''),
        constructionSiteId: siteId || null,
        costCode: String(form.get('cost_code') ?? '') || null,
        urgency: (form.get('urgency') as PurchaseUrgency) ?? 'thuong',
        neededDate: String(form.get('needed_date') ?? '') || null,
        deliveryLocation: String(form.get('delivery_location') ?? ''),
        notes: String(form.get('notes') ?? ''),
      });
      // Lưu xong đi thẳng vào Chi tiết hồ sơ vừa tạo (Webapp Flow 4.4) — mặt hàng nhập tiếp
      // ở đó, vì danh sách mặt hàng là bảng con chứ không phải trường của biểu mẫu này.
      void navigate(`/mh/de-nghi-mua/${id}`);
    } catch (e) {
      setFormError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <PageHeader
        title="Lập đề nghị mua"
        breadcrumbs={[
          { label: 'Mua hàng – Vật tư' },
          { label: 'Đề nghị mua', to: '/mh/de-nghi-mua' },
          { label: 'Lập đề nghị mua' },
        ]}
      />

      <form
        onSubmit={(e) => void submit(e)}
        className="max-w-3xl space-y-4 rounded-lg border border-border bg-surface p-4"
      >
        {formError && (
          <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
            {formError}
          </p>
        )}

        <Field label="Nội dung đề nghị" required hint="Ví dụ: Thép hình cho phần khung tầng 2.">
          <Input name="title" required maxLength={200} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Công trình"
            hint="Để trống nếu mua cho văn phòng — khi đó đề nghị không gắn vào ngân sách công trình nào."
          >
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
            >
              <option value="">Không gắn công trình</option>
              {(sites ?? []).map((site) => (
                <option key={site.id} value={site.id}>
                  {site.code} — {site.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Mã chi phí trong ngân sách"
            required={Boolean(siteId)}
            hint={
              siteId
                ? 'Chi phí của đề nghị này sẽ cộng vào đúng dòng ngân sách đã chọn, ngay khi đơn hàng được lập.'
                : 'Chỉ chọn được sau khi chọn công trình.'
            }
          >
            <select
              name="cost_code"
              required={Boolean(siteId)}
              disabled={!siteId}
              className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3 disabled:bg-surface-sunken disabled:opacity-60"
            >
              <option value="">Chọn mã chi phí</option>
              {(costCodes ?? []).map((line) => (
                <option key={line.cost_code} value={line.cost_code}>
                  {line.cost_code} — {line.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Thời điểm cần hàng" required>
            <DateInput name="needed_date" required />
          </Field>

          <Field label="Mức cần">
            <select
              name="urgency"
              defaultValue="thuong"
              className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
            >
              <option value="thuong">{PURCHASE_URGENCY_LABELS.thuong}</option>
              <option value="gap">{PURCHASE_URGENCY_LABELS.gap}</option>
            </select>
          </Field>

          <Field label="Địa điểm giao" className="sm:col-span-2">
            <Input name="delivery_location" maxLength={200} />
          </Field>
        </div>

        <Field label="Ghi chú">
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
          />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            Lưu và nhập mặt hàng
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void navigate('/mh/de-nghi-mua')}
          >
            Hủy
          </Button>
        </div>
      </form>
    </>
  );
}
