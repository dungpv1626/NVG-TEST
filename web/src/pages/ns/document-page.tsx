/**
 * Giấy tờ có thời hạn (NS-10, liên kết NEN-04) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * Sắp xếp theo HẠN GẦN NHẤT lên đầu, không theo tên: danh sách này tồn tại để người ta biết
 * hôm nay phải đi đòi giấy nào, chứ không để tra cứu.
 *
 * Bốn mốc nhắc 90/60/30/7 ngày là của NS-10; hệ thống tự gửi thông báo ở từng mốc và không
 * lặp lại cùng một mốc (Content Guidelines 3.4). Màn hình này hiện lại đúng cách phân loại đó
 * để người đọc và thông báo nói cùng một ngôn ngữ.
 */

import { useState } from 'react';
import {
  HR_DOCUMENT_TYPES,
  HR_DOCUMENT_TYPE_LABELS,
  documentReminderStage,
  formatDate,
} from '@nvg/shared';
import type { HrDocumentType } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useCreateHrDocument, useEmployees, useHrDocuments } from '@/hooks/use-hr';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { cn } from '@/lib/utils';
import { NsNav } from './ns-nav';

/**
 * Nhãn cảnh báo hạn giấy tờ.
 *
 * ⚠️ CỐ Ý KHÔNG dùng `StatusLozenge` ở đây. Lozenge mang nhãn chuẩn của 5 nhóm trạng thái HỒ
 * SƠ (CGD 5.1) — "Chờ duyệt", "Hoàn thành". Một chứng chỉ còn 20 ngày thì không "chờ duyệt"
 * ai cả, và đặt nhãn đó cạnh chữ "Còn dưới 30 ngày" tạo ra một câu vô nghĩa mà người đọc
 * phải tự đoán. Đây là CẢNH BÁO, không phải trạng thái hồ sơ.
 *
 * Vẫn giữ đúng hai hàng rào của hệ thống màu: không sinh màu mới (dùng lại đúng ba màu trạng
 * thái), và không bao giờ chỉ dùng màu — chữ tự nói đủ nghĩa kể cả khi bỏ hết màu đi (CGD 6.8).
 */
export function reminderLabel(stage: number | null): { label: string; tone: string } {
  if (stage === null) return { label: 'Còn hạn', tone: 'text-status-completed' };
  if (stage === 0) return { label: 'Đã hết hạn', tone: 'text-status-overdue' };
  return { label: `Còn dưới ${stage} ngày`, tone: 'text-status-pending' };
}

export function ReminderTag({ stage }: { stage: number | null }) {
  const { label, tone } = reminderLabel(stage);
  return <span className={cn('font-medium', tone)}>{label}</span>;
}

export function HrDocumentPage() {
  const scope = useCompanyScope();
  const canEdit = useCan('NS', 'edit');

  const { data, isLoading, error, refetch } = useHrDocuments();
  const { data: employees } = useEmployees();
  const create = useCreateHrDocument();

  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<HrDocumentType>('chung_chi_an_toan');
  const [title, setTitle] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);

  async function addDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    if (!scope.companyId || scope.isAggregate) {
      setPageError('Chọn một pháp nhân cụ thể ở thanh bên trước khi thêm giấy tờ.');
      return;
    }
    try {
      await create.mutateAsync({
        companyId: scope.companyId,
        employeeId,
        type,
        title,
        expiryDate: expiryDate || null,
      });
      setTitle('');
      setExpiryDate('');
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <NsNav />
      <PageHeader
        title="Giấy tờ có thời hạn"
        description="Hệ thống nhắc trước 90, 60, 30 và 7 ngày cho từng loại giấy tờ."
        breadcrumbs={[{ label: 'Hành chính – Nhân sự' }, { label: 'Giấy tờ' }]}
      />

      {pageError && <ErrorState message={pageError} />}

      {canEdit && (
        <form
          onSubmit={addDocument}
          className="mb-6 grid gap-4 rounded border border-border bg-bg-subtle p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Nhân sự" required>
            <select
              className="h-9 w-full rounded border border-border bg-bg px-2"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              <option value="">Chọn nhân sự</option>
              {(employees ?? [])
                .filter((e) => e.status !== 'da_nghi')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Loại giấy tờ" required>
            <select
              className="h-9 w-full rounded border border-border bg-bg px-2"
              value={type}
              onChange={(e) => setType(e.target.value as HrDocumentType)}
            >
              {HR_DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {HR_DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tên giấy tờ" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>

          <Field label="Ngày hết hạn" hint="Để trống nếu giấy tờ không có hạn.">
            <DateInput value={expiryDate} onChange={setExpiryDate} />
          </Field>

          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              Thêm giấy tờ
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} onRetry={() => void refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="Chưa theo dõi giấy tờ nào. Thêm chứng chỉ, giấy phép và bảo hiểm để hệ thống nhắc trước khi hết hạn." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border text-left text-fg-subtle">
                <th className="px-3 py-2">Giấy tờ</th>
                <th className="px-3 py-2">Của ai</th>
                <th className="px-3 py-2">Ngày hết hạn</th>
                <th className="px-3 py-2">Tình trạng</th>
                <th className="px-3 py-2">Nơi lưu bản gốc</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((d) => {
                return (
                  <tr key={d.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{d.title}</div>
                      <div className="text-fg-subtle">{HR_DOCUMENT_TYPE_LABELS[d.type]}</div>
                    </td>
                    <td className="px-3 py-2">
                      {d.employee?.full_name ?? d.worker?.full_name ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      {d.expiry_date ? formatDate(d.expiry_date) : 'Không có hạn'}
                    </td>
                    <td className="px-3 py-2">
                      <ReminderTag stage={documentReminderStage(d.expiry_date)} />
                    </td>
                    <td className="px-3 py-2 text-fg-subtle">{d.original_location ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
