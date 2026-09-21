/**
 * Tham số hệ thống (NEN-12) — mẫu bố cục Danh sách, sửa tại chỗ.
 *
 * PRD NEN-12: "Bảng tham số hệ thống do quản trị viên cấu hình, không hard-code trong mã
 * nguồn… Mọi thay đổi phải lưu lịch sử (giá trị cũ, giá trị mới, ngày áp dụng, người duyệt)
 * và KHÔNG được làm thay đổi hồi tố các chứng từ đã phát hành."
 *
 * Ba điều màn hình này phải làm đúng, mỗi điều đều có lý do đã trả giá:
 *
 * 1. **Rỗng hiện là "Chưa cấu hình", không hiện 0.** Năm tham số đang cố ý để rỗng
 *    (`sla_definitions` ở màn hình riêng, `internal_rental_price`, `compensation_price_table`,
 *    `defect_rate_threshold`, `min_samples_for_metric`). Điền mặc định là biến ô trống nhìn
 *    thấy được thành con số sai trông như đã duyệt. Ở màn hình CẤU HÌNH thì chữ đúng là
 *    "Chưa cấu hình" — `EMPTY_STATES.notEnoughData` dành cho ô CHỈ SỐ trên báo cáo, nơi câu
 *    hỏi là "đã đủ mẫu để tính chưa", không phải "đã ai đặt giá trị chưa".
 *
 * 2. **Xóa giá trị phải làm được.** Đặt lại về rỗng là thao tác hợp lệ, không phải lỗi: khi
 *    NVG rút lại một quyết định thì tham số phải quay về trạng thái chưa có, chứ không mắc
 *    kẹt ở con số cũ.
 *
 * 3. **Không tự ghi lịch sử.** Trigger trong CSDL ghi `system_parameter_history`. Màn hình
 *    ghi thêm một lần nữa thì mỗi lần sửa ra hai dòng lịch sử.
 *
 * Giá trị là `jsonb` vì các tham số không cùng hình dạng: `hours_per_workday` là một số,
 * `compensation_price_table` là cả một bảng giá. Ô nhập vì vậy nhận JSON, và nói rõ dạng
 * đang chờ ngay tại chỗ.
 */

import { useState, type FormEvent } from 'react';
import { BUTTONS, formatDate, formatDateTime, formatNumber } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useParameterHistory,
  useSaveSystemParameter,
  useSystemParameters,
  type SystemParameterRecord,
} from '@/hooks/use-admin';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { NenNav } from './nen-nav';

/** Chữ dùng khi một tham số chưa có giá trị. Xem lý do ở đầu tệp. */
const CHUA_CAU_HINH = 'Chưa cấu hình';

/**
 * Hiển thị giá trị `jsonb` gọn trên một dòng bảng.
 *
 * Số đi qua `formatNumber` chứ không qua `String()`: tiếng Việt dùng dấu PHẨY thập phân
 * (CGD 4.3). `String(0.9)` cho ra "0.9" — đúng cú pháp JavaScript, sai chuẩn nội dung.
 */
function describeValue(value: unknown, unit: string | null): string {
  if (value === null || value === undefined) return CHUA_CAU_HINH;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    const text = typeof value === 'number' ? formatNumber(value) : String(value);
    return unit ? `${text} ${unit}` : text;
  }
  // Bảng giá, danh sách ngưỡng: nói số mục thay vì đổ cả JSON vào ô hẹp.
  if (Array.isArray(value)) return `Danh sách ${value.length} mục`;
  return `Bảng ${Object.keys(value as Record<string, unknown>).length} mục`;
}

/** Chuỗi người dùng gõ → giá trị `jsonb`. Rỗng nghĩa là trả tham số về chưa cấu hình. */
function parseValue(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      message:
        'Giá trị chưa đúng định dạng. Số thì gõ thẳng (ví dụ 8). Chữ thì đặt trong dấu nháy kép (ví dụ "cao"). Bảng giá thì dán nguyên khối JSON.',
    };
  }
}

export function ParameterPage() {
  const canEdit = useCan('NEN', 'edit');
  const { data, isLoading, error, refetch } = useSystemParameters();
  const savePara = useSaveSystemParameter();

  const [editing, setEditing] = useState<SystemParameterRecord | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [rawValue, setRawValue] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const history = useParameterHistory(historyFor);

  function startEdit(p: SystemParameterRecord) {
    setEditing(p);
    setFormError(null);
    setRawValue(p.value === null || p.value === undefined ? '' : JSON.stringify(p.value));
    setEffectiveFrom(p.effective_from);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);

    const parsed = parseValue(rawValue);
    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }
    try {
      await savePara.mutateAsync({
        id: editing.id,
        value: parsed.value,
        effectiveFrom,
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
        title="Tham số hệ thống"
        description="Giá trị vận hành do Nhà Việt Group quyết định. Đổi tham số không làm thay đổi chứng từ đã phát hành — chứng từ giữ giá trị đã áp dụng tại thời điểm lập."
        breadcrumbs={[{ label: 'Quản trị hệ thống' }, { label: 'Tham số hệ thống' }]}
      />

      {isLoading && <TableSkeleton />}
      {error && <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <EmptyState message="Chưa có tham số nào. Bộ nạp dữ liệu tạo sẵn danh sách tham số của NEN-12." />
      )}

      {!isLoading && !error && (data ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-subtle">
                <th className="p-3 font-medium">Tham số</th>
                <th className="p-3 font-medium">Giá trị hiện hành</th>
                <th className="p-3 font-medium">Áp dụng từ</th>
                <th className="p-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => {
                const chuaCauHinh = p.value === null || p.value === undefined;
                return (
                  <tr key={p.id} className="border-b border-border last:border-b-0 align-top">
                    <td className="p-3">
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-fg-subtle">{p.param_key}</div>
                      {p.description && <p className="mt-1 text-fg-subtle">{p.description}</p>}
                    </td>
                    <td className={cn('p-3', chuaCauHinh && 'text-fg-subtle')}>
                      {describeValue(p.value, p.unit)}
                    </td>
                    <td className="p-3">{formatDate(p.effective_from)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {canEdit && (
                          <Button variant="secondary" size="sm" onClick={() => startEdit(p)}>
                            {BUTTONS.edit}
                          </Button>
                        )}
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => setHistoryFor(historyFor === p.id ? null : p.id)}
                        >
                          {historyFor === p.id ? 'Ẩn lịch sử' : 'Lịch sử'}
                        </Button>
                      </div>

                      {historyFor === p.id && (
                        <div className="mt-2 rounded-sm bg-sunken p-2">
                          {history.isLoading && <p className="text-fg-subtle">Đang tải…</p>}
                          {!history.isLoading && (history.data ?? []).length === 0 && (
                            <p className="text-fg-subtle">Chưa có lần đổi nào được ghi nhận.</p>
                          )}
                          <ul className="space-y-1">
                            {(history.data ?? []).map((h) => (
                              <li key={h.id} className="text-xs">
                                {formatDateTime(h.changed_at)} ·{' '}
                                {h.changed_by_user?.full_name ?? 'Không rõ người đổi'} ·{' '}
                                {describeValue(h.old_value, p.unit)} →{' '}
                                {describeValue(h.new_value, p.unit)}
                              </li>
                            ))}
                          </ul>
                        </div>
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
          <h2 className="font-semibold">{editing.label}</h2>
          <p className="mt-1 text-fg-subtle">
            {editing.description ?? 'Không có mô tả cho tham số này.'}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="Giá trị"
              hint={
                editing.unit
                  ? `Đơn vị ${editing.unit}. Để trống nghĩa là trả tham số về "${CHUA_CAU_HINH}".`
                  : `Để trống nghĩa là trả tham số về "${CHUA_CAU_HINH}".`
              }
            >
              <textarea
                value={rawValue}
                onChange={(e) => setRawValue(e.target.value)}
                rows={rawValue.length > 60 ? 6 : 2}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle"
              />
            </Field>
            <Field label="Áp dụng từ" hint="Không hồi tố: chứng từ đã phát hành giữ giá trị cũ.">
              <DateInput value={effectiveFrom} onChange={setEffectiveFrom} />
            </Field>
          </div>

          {formError && (
            <p
              role="alert"
              className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={savePara.isPending}>
              {savePara.isPending ? 'Đang lưu…' : BUTTONS.save}
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
