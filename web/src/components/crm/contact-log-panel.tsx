/**
 * Nhật ký chăm sóc (Đợt 1 — 1B) — dùng chung cho đầu mối, cơ hội và khách hàng.
 *
 * Mỗi lần gọi / Zalo / gặp ghi MỘT dòng, kèm bước tiếp theo và ngày hẹn — CSDL bắt buộc
 * (migration 0172). Vướng mắc số 1 của Kinh doanh là «thông tin chỉ nằm trong Zalo rồi trôi
 * mất»: ở đây chỉ giữ KẾT QUẢ và VIỆC TIẾP THEO, không chép tin nhắn (không thay Zalo).
 */

import { useState, type FormEvent } from 'react';
import {
  CONTACT_CHANNELS,
  CONTACT_CHANNEL_LABELS,
  formatDate,
  formatDateTime,
  fromNvgInput,
  toNvgDateInput,
  type ContactChannel,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useAddContactLog,
  useContactLogs,
  type ContactLogRecord,
  type ContactSubject,
} from '@/hooks/use-leads';
import { cn } from '@/lib/utils';

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const QUICK_DATES = [
  { label: 'Ngày mai', days: 1 },
  { label: '3 ngày nữa', days: 3 },
  { label: '1 tuần nữa', days: 7 },
] as const;

export function ContactLogPanel({
  subject,
  canWrite,
  emptyHint,
}: {
  subject: ContactSubject;
  /** Người phụ trách / lãnh đạo — trùng điều kiện của policy `contact_logs_insert`. */
  canWrite: boolean;
  emptyHint?: string;
}) {
  const logs = useContactLogs(subject);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section aria-label="Các lần liên hệ" className="order-2 lg:order-1">
        {logs.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : logs.error ? (
          <ErrorState message={toUserMessage(logs.error)} />
        ) : (logs.data ?? []).length === 0 ? (
          <EmptyState
            message={
              emptyHint ??
              'Chưa ghi lần liên hệ nào. Ghi ngay sau mỗi cuộc gọi hay buổi gặp để đồng nghiệp biết khách đang ở đâu.'
            }
          />
        ) : (
          <ol className="space-y-3">
            {logs.data!.map((log) => (
              <LogItem key={log.id} log={log} />
            ))}
          </ol>
        )}
      </section>

      {canWrite && (
        <div className="order-1 lg:order-2">
          <NewLogForm subject={subject} />
        </div>
      )}
    </div>
  );
}

function LogItem({ log }: { log: ContactLogRecord }) {
  return (
    <li className="rounded-card bg-surface p-3">
      <p className="text-xs text-fg-subtle">
        {formatDateTime(log.contacted_at)} · {CONTACT_CHANNEL_LABELS[log.channel]} ·{' '}
        {log.author?.full_name ?? 'Không rõ'}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{log.content}</p>
      {log.result && (
        <p className="mt-1 whitespace-pre-wrap text-fg-subtle">
          <span className="font-medium text-fg">Kết quả: </span>
          {log.result}
        </p>
      )}
      <p className="mt-2 text-xs">
        {log.closes_followup ? (
          <span className="text-fg-subtle">Kết thúc theo dõi</span>
        ) : (
          <>
            <span className="font-medium">Bước tiếp: </span>
            {log.next_action} — hẹn {formatDate(log.next_action_at)}
          </>
        )}
      </p>
    </li>
  );
}

function NewLogForm({ subject }: { subject: ContactSubject }) {
  const add = useAddContactLog(subject);
  const today = toNvgDateInput(new Date());
  const empty = {
    channel: 'goi_dien' as ContactChannel,
    date: today,
    content: '',
    result: '',
    nextAction: '',
    nextActionAt: addDays(today, 3),
    closes: false,
  };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.content.trim()) return setError('Nhập nội dung đã trao đổi trước khi lưu.');
    if (!form.date) return setError('Chọn ngày liên hệ.');
    if (!form.closes && (!form.nextAction.trim() || !form.nextActionAt)) {
      return setError(
        'Ghi bước tiếp theo và ngày hẹn — hoặc đánh dấu «Kết thúc theo dõi» nếu không cần liên hệ lại.',
      );
    }
    try {
      await add.mutateAsync({
        channel: form.channel,
        // Hôm nay thì lấy đúng giờ hiện tại; ghi bù ngày trước thì đặt giữa trưa ngày đó.
        contactedAt:
          form.date === today ? new Date().toISOString() : fromNvgInput(`${form.date}T12:00`)!,
        content: form.content.trim(),
        result: form.result.trim() || null,
        nextAction: form.nextAction.trim() || null,
        nextActionAt: form.nextActionAt || null,
        closesFollowup: form.closes,
      });
      setForm({ ...empty, channel: form.channel });
      setSaved(true);
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-3 rounded-card bg-surface p-4"
      aria-label="Ghi lần liên hệ"
    >
      <p className="font-semibold">Ghi lần liên hệ</p>

      <Field label="Kênh" group>
        <div className="flex flex-wrap gap-1">
          {CONTACT_CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={form.channel === c}
              onClick={() => set('channel', c)}
              className={cn(
                'min-h-10 rounded-sm border px-3 sm:min-h-8',
                form.channel === c
                  ? 'border-brand bg-brand-subtle font-semibold text-brand-forest'
                  : 'border-border hover:bg-surface-hover',
              )}
            >
              {CONTACT_CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Ngày liên hệ" required>
        <DateInput value={form.date} max={today} onChange={(v) => set('date', v)} />
      </Field>

      <Field label="Đã trao đổi gì" required>
        <textarea
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          rows={3}
          placeholder="Khách hỏi gì, mình báo gì"
          className="w-full rounded-field border border-border-strong bg-surface px-3 py-2 placeholder:text-fg-subtle"
        />
      </Field>

      <Field label="Kết quả" optional>
        <Input
          value={form.result}
          onChange={(e) => set('result', e.target.value)}
          placeholder="Ví dụ: khách hẹn tuần sau gửi bản vẽ"
        />
      </Field>

      <label className="flex min-h-10 items-center gap-2">
        <input
          type="checkbox"
          checked={form.closes}
          onChange={(e) => set('closes', e.target.checked)}
          className="size-4"
        />
        <span>Kết thúc theo dõi — không cần liên hệ lại</span>
      </label>

      {!form.closes && (
        <>
          <Field label="Bước tiếp theo" required>
            <Input
              value={form.nextAction}
              onChange={(e) => set('nextAction', e.target.value)}
              placeholder="Ví dụ: gọi lại hỏi ngày khảo sát"
            />
          </Field>
          <Field label="Hẹn ngày" required group>
            <div className="space-y-2">
              <DateInput
                value={form.nextActionAt}
                min={form.date || today}
                onChange={(v) => set('nextActionAt', v)}
              />
              <div className="flex flex-wrap gap-1">
                {QUICK_DATES.map((q) => (
                  <button
                    key={q.days}
                    type="button"
                    onClick={() => set('nextActionAt', addDays(today, q.days))}
                    className="min-h-10 rounded-sm border border-border px-2 text-xs hover:bg-surface-hover sm:min-h-8"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </Field>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-status-completed">
          Đã ghi. Bước tiếp theo hiện ở danh sách và «Việc cần làm».
        </p>
      )}

      <Button type="submit" variant="secondary" disabled={add.isPending} className="w-full">
        {add.isPending ? 'Đang lưu…' : 'Ghi lần liên hệ'}
      </Button>
    </form>
  );
}
