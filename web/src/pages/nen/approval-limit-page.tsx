/**
 * Hạn mức phê duyệt (NEN-02) — dữ liệu cấu hình quyền lực nhất hệ thống.
 *
 * PRD NEN-02: "Hạn mức phải cấu hình được, KHÔNG hard-code — ví dụ mức tạm thời 10 triệu /
 * 50 triệu đồng sẽ được NVG điều chỉnh khi có cơ chế chính thức." Mức đang chạy chính là mức
 * tạm đó (câu hỏi #5 của `BUILD_PLAN.md`), nên màn hình phải nói thẳng ra — người quản trị
 * cần biết mình đang sửa một giả định, không phải một quy chế đã ban hành.
 *
 * ## Rỗng KHÔNG phải là không
 *
 * `max_amount` rỗng nghĩa là KHÔNG giới hạn (Tổng Giám đốc), hoặc nghiệp vụ không gắn tiền
 * (nghỉ phép). Hiện `0` ở đó sẽ đọc thành "không duyệt được đồng nào" — ngược hẳn nghĩa thật.
 *
 * ## Vì sao không thêm/xóa dòng ở đây
 *
 * Một dòng hạn mức là một mắt xích trong chuỗi duyệt (`step`). Thêm hay bỏ mắt xích là đổi
 * quy trình phê duyệt, không phải đổi một con số — việc đó đi cùng quyết định nghiệp vụ và
 * migration, không nên làm bằng một cú bấm. Ở đây sửa mức tiền và bật/tắt dòng đã có.
 */

import { useState, type FormEvent } from 'react';
import {
  APPROVAL_SUBJECT_LABELS,
  BUTTONS,
  formatCurrency,
  type ApprovalSubject,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useApprovalLimits,
  useSaveApprovalLimit,
  type ApprovalLimitRecord,
} from '@/hooks/use-admin';
import { useCompanyLookup } from '@/hooks/use-companies';
import { useManagesApprovalRules } from '@/components/layout/module-nav';
import { NenNav } from './nen-nav';

function subjectLabel(subject: string): string {
  return APPROVAL_SUBJECT_LABELS[subject as ApprovalSubject] ?? subject;
}

export function ApprovalLimitPage() {
  // Cùng nhóm với chính sách CSDL (0141): Quản trị viên và Tổng Giám đốc.
  const canEdit = useManagesApprovalRules();
  const { data, isLoading, error, refetch } = useApprovalLimits();
  const lookupCompany = useCompanyLookup();
  const saveLimit = useSaveApprovalLimit();

  const [editing, setEditing] = useState<ApprovalLimitRecord | null>(null);
  const [amount, setAmount] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function startEdit(limit: ApprovalLimitRecord) {
    setEditing(limit);
    setFormError(null);
    setUnlimited(limit.max_amount === null);
    setAmount(limit.max_amount === null ? '' : String(limit.max_amount));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    if (!unlimited && amount.trim() === '') {
      setFormError('Vui lòng nhập hạn mức, hoặc chọn «Không giới hạn».');
      return;
    }
    try {
      await saveLimit.mutateAsync({
        id: editing.id,
        maxAmount: unlimited ? null : amount,
        isActive: editing.is_active,
      });
      setEditing(null);
    } catch (err) {
      setFormError(toUserMessage(err, 'edit'));
    }
  }

  return (
    <>
      <NenNav />
      <PageHeader
        title="Hạn mức phê duyệt"
        description="Ai được duyệt loại nghiệp vụ nào, tới mức tiền nào. Mức đang chạy là mức tạm của tài liệu, chờ Nhà Việt Group ban hành quy chế chính thức."
        breadcrumbs={[{ label: 'Quản trị hệ thống' }, { label: 'Hạn mức phê duyệt' }]}
      />

      {isLoading && <TableSkeleton columns={6} />}
      {error && <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <EmptyState message="Chưa có hạn mức nào. Bộ nạp dữ liệu tạo sẵn ma trận hạn mức theo vai trò và loại nghiệp vụ." />
      )}

      {!isLoading && !error && (data ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-subtle">
                <th className="p-3 font-medium">Loại nghiệp vụ</th>
                <th className="p-3 font-medium">Vai trò</th>
                <th className="p-3 font-medium">Bước duyệt</th>
                <th className="p-3 text-right font-medium">Hạn mức</th>
                <th className="p-3 font-medium">Pháp nhân</th>
                <th className="p-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((l) => {
                const company = lookupCompany(l.company_id);
                return (
                  <tr key={l.id} className="border-b border-border last:border-b-0">
                    <td className="p-3">{subjectLabel(l.subject)}</td>
                    <td className="p-3">{l.role?.label ?? l.role_id}</td>
                    <td className="p-3">Bước {l.step}</td>
                    <td className="p-3 text-right">
                      {l.max_amount === null ? (
                        <span className="text-fg-subtle">Không giới hạn</span>
                      ) : (
                        formatCurrency(l.max_amount)
                      )}
                    </td>
                    <td className="p-3">
                      {company ? (
                        company.short_name
                      ) : (
                        <span className="text-fg-subtle">Mọi pháp nhân</span>
                      )}
                    </td>
                    <td className="p-3">
                      {!l.is_active && <span className="mr-2 text-fg-subtle">Đã tắt</span>}
                      {canEdit && (
                        <Button variant="secondary" size="sm" onClick={() => startEdit(l)}>
                          {BUTTONS.edit}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <form
          onSubmit={submit}
          className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <h2 className="font-semibold">
            {subjectLabel(editing.subject)} · {editing.role?.label ?? ''} · bước {editing.step}
          </h2>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Hạn mức" hint="Đơn vị đồng.">
              <MoneyInput value={amount} disabled={unlimited} onChange={setAmount} />
            </Field>
            <Field
              label="Không giới hạn"
              group
              hint="Dùng cho cấp duyệt không có trần, ví dụ Tổng Giám đốc."
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={(e) => setUnlimited(e.target.checked)}
                  className="size-4"
                />
                <span>Vai trò này duyệt mọi giá trị</span>
              </label>
            </Field>
          </div>

          <Field
            label="Trạng thái dòng"
            group
            hint="Tắt một dòng là bỏ vai trò đó khỏi chuỗi duyệt; hồ sơ đang chờ vẫn giữ nguyên bước hiện tại."
            className="mt-3"
          >
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                className="size-4"
              />
              <span>Đang áp dụng</span>
            </label>
          </Field>

          {formError && (
            <p
              role="alert"
              className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={saveLimit.isPending}>
              {saveLimit.isPending ? 'Đang lưu…' : BUTTONS.save}
            </Button>
            <Button type="button" variant="subtle" onClick={() => setEditing(null)}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
