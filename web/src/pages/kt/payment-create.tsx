/**
 * Lập Đề nghị chi (KT-01) — mẫu bố cục Biểu mẫu một trang (Webapp Flow 4.4).
 *
 * Đủ ít trường để không cần wizard. Phần phân bổ chi phí (KT-05) KHÔNG nằm ở đây mà là một
 * bảng con trong Chi tiết hồ sơ — một khoản chi có thể chia cho nhiều công trình, và một
 * bảng nhiều dòng nhét vào biểu mẫu tạo sẽ làm màn hình đầu tiên dài gấp đôi.
 *
 * Người đề nghị KHÔNG có ô nhập: CSDL đóng dấu từ phiên đăng nhập. Một ô chọn người ở đây
 * chỉ tạo ra khả năng ghi tên đồng nghiệp lên hồ sơ của mình.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PAYMENT_REQUEST_TYPE_LABELS, PAYMENT_REQUEST_TYPES } from '@nvg/shared';
import type { PaymentRequestType } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { BlockedNotice } from '@/components/ui/states';
import { useActiveUsers } from '@/hooks/use-active-users';
import { useCreatePaymentRequest } from '@/hooks/use-accounting';
import { useSuppliers } from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';

const SELECT_CLASS = 'h-9 w-full rounded-sm border border-border-strong bg-surface px-3';

export function PaymentRequestCreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const canCreate = useCan('KT', 'create');
  const scope = useCompanyScope();
  const create = useCreatePaymentRequest();

  const [requestType, setRequestType] = useState<PaymentRequestType>(
    (params.get('loai') as PaymentRequestType) ?? 'thanh_toan',
  );
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: suppliers } = useSuppliers();
  const { data: users } = useActiveUsers();

  if (!canCreate) {
    return (
      <BlockedNotice
        title="Chưa được cấp quyền lập đề nghị chi"
        detail="Lập đề nghị chi là việc của Kế toán – Tài chính, Ban công trường và Phòng Mua hàng. Liên hệ Quản trị hệ thống nếu vai trò hiện tại cần quyền này."
      />
    );
  }

  if (scope.isAggregate || !scope.companyId) {
    return (
      <BlockedNotice
        title="Chọn pháp nhân trước khi lập đề nghị"
        detail="Khoản chi thuộc về một pháp nhân cụ thể vì nó vào P&L của đúng công ty đó. Chọn NVC, NVO hoặc NVS ở bộ chọn pháp nhân góc trên bên trái."
      />
    );
  }

  const companyId = scope.companyId;
  const isAdvance = requestType === 'tam_ung';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);

    try {
      const id = await create.mutateAsync({
        companyId,
        requestType,
        title: String(form.get('title') ?? ''),
        amount: amount || '0',
        department: String(form.get('department') ?? ''),
        originModule: String(form.get('origin_module') ?? 'KT'),
        supplierId: isAdvance ? null : String(form.get('supplier_id') ?? ''),
        payeeName: isAdvance ? null : String(form.get('payee_name') ?? ''),
        advanceUserId: isAdvance ? String(form.get('advance_user_id') ?? '') : null,
        advanceDueDate: isAdvance ? String(form.get('advance_due_date') ?? '') : null,
        dueDate: String(form.get('due_date') ?? ''),
        notes: String(form.get('notes') ?? ''),
      });
      // Lưu xong đi thẳng vào Chi tiết hồ sơ vừa tạo (Webapp Flow 4.4) — phân bổ chi phí
      // nhập tiếp ở đó vì nó là bảng con chứ không phải một trường của biểu mẫu này.
      void navigate(`/kt/de-nghi-thanh-toan/${id}`);
    } catch (e) {
      setFormError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <PageHeader
        title="Lập đề nghị chi"
        breadcrumbs={[
          { label: 'Kế toán – Tài chính' },
          { label: 'Đề nghị chi', to: '/kt/de-nghi-thanh-toan' },
          { label: 'Lập đề nghị chi' },
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Loại đề nghị"
            required
            hint="Hoàn ứng chọn khoản tạm ứng cần quyết toán ở màn hình chi tiết."
          >
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as PaymentRequestType)}
              className={SELECT_CLASS}
            >
              {PAYMENT_REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PAYMENT_REQUEST_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Bộ phận phát sinh"
            required
            hint="Quyết định ai là người xác nhận ở bước đầu của luồng duyệt."
          >
            <select name="origin_module" defaultValue="TC" className={SELECT_CLASS}>
              <option value="TC">Công trường (Thi công)</option>
              <option value="MH">Mua hàng – Vật tư</option>
              <option value="KHO">Kho</option>
              <option value="KT">Văn phòng (Kế toán – Tài chính)</option>
            </select>
          </Field>
        </div>

        <Field
          label="Nội dung đề nghị"
          required
          hint="Ví dụ: Thanh toán đợt 1 tiền thép hình cho Nhà cung cấp A."
        >
          <Input name="title" required maxLength={200} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Số tiền (đồng)" required hint="Phải bằng tổng các dòng phân bổ chi phí.">
            <MoneyInput value={amount} onChange={setAmount} required />
          </Field>

          <Field label="Đề nghị thanh toán trước ngày" required>
            <DateInput name="due_date" required />
          </Field>

          {isAdvance ? (
            <>
              <Field label="Người nhận tạm ứng" required>
                <select name="advance_user_id" required className={SELECT_CLASS}>
                  <option value="">Chọn người nhận</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Hạn hoàn ứng"
                required
                hint="Quá hạn mà chưa hoàn thì lần ứng sau phải nêu lý do."
              >
                <DateInput name="advance_due_date" required />
              </Field>
            </>
          ) : (
            <>
              <Field label="Nhà cung cấp" hint="Để trống nếu bên nhận chưa có trong danh mục.">
                <select name="supplier_id" className={SELECT_CLASS}>
                  <option value="">Không chọn từ danh mục</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tên bên nhận" hint="Dùng khi bên nhận là tổ đội khoán hoặc cá nhân.">
                <Input name="payee_name" maxLength={200} />
              </Field>
            </>
          )}

          <Field label="Bộ phận đề nghị" className="sm:col-span-2">
            <Input
              name="department"
              maxLength={120}
              placeholder="Ví dụ: Ban chỉ huy công trình A"
            />
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
            Lưu và phân bổ chi phí
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void navigate('/kt/de-nghi-thanh-toan')}
          >
            Hủy
          </Button>
        </div>
      </form>
    </>
  );
}
