/**
 * Tab Nhật ký công trường của Chi tiết Công trình (TC-02, TC-08).
 *
 * Ô nhập nằm NGAY TRÊN CÙNG, mở sẵn, không giấu sau một nút "Thêm": ghi nhật ký là việc lặp
 * lại mỗi ngày của chỉ huy trưởng, và Webapp Flow 6.4 xếp nó vào nhóm tác vụ phải tới được
 * ngay chứ không đi qua menu → danh sách → nút Tạo mới mỗi lần.
 *
 * Nhật ký đã ghi hiện ở chế độ CHỈ ĐỌC: quá 24 giờ hoặc do người khác ghi thì CSDL từ chối
 * sửa (TC-08), nên hiện ô sửa ở đây chỉ dẫn người dùng tới một thông báo lỗi. Cần đính chính
 * thì ghi một mục mới — đúng cách một quyển nhật ký giấy hoạt động.
 */

import { useState, type FormEvent } from 'react';
import { CalendarDays, Users } from 'lucide-react';
import {
  BUTTONS,
  SITE_LOG_TYPES,
  SITE_LOG_TYPE_LABELS,
  formatDate,
  type SiteLogType,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { useCreateSiteLog, useSiteLogs } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';

const TODAY = () => new Date().toISOString().slice(0, 10);

export function SiteLogPanel({
  siteId,
  companyId,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: logs } = useSiteLogs(siteId);
  const createLog = useCreateSiteLog();

  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    logDate: TODAY(),
    logType: 'tien_do' as SiteLogType,
    content: '',
    workforceCount: '',
    weather: '',
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.content.trim()) {
      setError('Vui lòng nhập nội dung nhật ký.');
      return;
    }
    try {
      await createLog.mutateAsync({
        siteId,
        companyId,
        values: {
          log_date: form.logDate,
          log_type: form.logType,
          content: form.content.trim(),
          workforce_count: form.workforceCount ? Number(form.workforceCount) : null,
          weather: form.weather.trim() || null,
        },
      });
      setForm({
        logDate: TODAY(),
        logType: 'tien_do',
        content: '',
        workforceCount: '',
        weather: '',
      });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {!readOnly && (
        <form
          onSubmit={submit}
          noValidate
          className="rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <p className="mb-3 font-medium">Ghi nhật ký hôm nay</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nội dung" required className="sm:col-span-2">
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={3}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                placeholder="Việc đã làm, khối lượng, vướng mắc hoặc sự việc tại hiện trường."
              />
            </Field>

            <Field label="Ngày xảy ra" hint="Ngày việc thật sự xảy ra, không phải ngày nhập.">
              <Input
                type="date"
                value={form.logDate}
                max={TODAY()}
                onChange={(e) => setForm((f) => ({ ...f, logDate: e.target.value }))}
              />
            </Field>

            <Field label="Loại mục">
              <select
                value={form.logType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, logType: e.target.value as SiteLogType }))
                }
                className="h-10 w-full rounded-sm border border-border bg-surface px-3"
              >
                {SITE_LOG_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SITE_LOG_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Quân số có mặt"
              hint="Chấm công khối công trường lấy lại con số này, không nhập lại (NS-04)."
            >
              <Input
                value={form.workforceCount}
                inputMode="numeric"
                onChange={(e) =>
                  setForm((f) => ({ ...f, workforceCount: e.target.value.replace(/[^\d]/g, '') }))
                }
              />
            </Field>

            <Field label="Thời tiết" hint="Căn cứ khi tranh chấp chậm tiến độ do thời tiết.">
              <Input
                value={form.weather}
                onChange={(e) => setForm((f) => ({ ...f, weather: e.target.value }))}
                placeholder="Nắng · Mưa từ 14h · Bão"
              />
            </Field>
          </div>

          <p className="mt-3 text-xs text-fg-subtle">
            Nhật ký đã ghi chỉ sửa được trong 24 giờ và chỉ bởi người đã ghi. Cần đính chính
            sau đó thì ghi thêm một mục mới.
          </p>

          <div className="mt-3">
            <Button type="submit" variant="primary" disabled={createLog.isPending}>
              {BUTTONS.save}
            </Button>
          </div>
        </form>
      )}

      {(logs ?? []).length === 0 ? (
        <EmptyState message="Chưa có mục nhật ký nào. Ghi lại tiến độ, khối lượng và vướng mắc theo từng ngày để truy vết được khi phát sinh tranh chấp." />
      ) : (
        <ol className="space-y-3">
          {(logs ?? []).map((log) => (
            <li key={log.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-4 shrink-0" aria-hidden />
                  {formatDate(log.log_date)}
                </span>
                <span className="font-medium text-fg">{SITE_LOG_TYPE_LABELS[log.log_type]}</span>
                {log.workforce_count != null && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-4 shrink-0" aria-hidden />
                    {log.workforce_count} người
                  </span>
                )}
                {log.weather && <span>{log.weather}</span>}
                <span className="ms-auto">{log.author?.full_name ?? 'Không rõ người ghi'}</span>
              </div>
              <p className="whitespace-pre-wrap">{log.content}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
