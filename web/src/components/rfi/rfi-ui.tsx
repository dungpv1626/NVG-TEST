/**
 * Yêu cầu làm rõ (RFI) — TK-08 / TC-15. Một bộ thành phần cho cả hai phía:
 *  · công trường (tab «Yêu cầu làm rõ» của công trình): gửi, xem câu trả lời, ghi lời chủ đầu tư;
 *  · văn phòng (tab cùng tên của hồ sơ thiết kế, trang `/lam-ro/:id`): đọc và trả lời.
 *
 * Khảo sát Phòng Thiết kế: «chờ công trường cung cấp đầy đủ ảnh, kích thước thực tế… chưa có một đầu
 * mối và thời hạn phản hồi thống nhất». Nên biểu mẫu đòi hạn trả lời và mời kèm ảnh, kích thước đo.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  RFI_ROUTE_LABEL,
  RFI_ROUTES,
  formatDate,
  formatDateTime,
  rfiDisplayStatus,
  toNvgDateInput,
  type RfiRoute,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { FIELD_BOX, TEXTAREA_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useAnswerRfi,
  useCreateRfi,
  useSiteDesignDrawings,
  type RfiRecord,
} from '@/hooks/use-rfis';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { PhotoStrip, SitePhotoPicker } from '@/pages/tc/site-photo-picker';

/** Giao diện chỉ ẩn ô trả lời cho đỡ bấm vào lỗi; CSDL (`answer_rfi`) mới là nơi quyết. */
export function useCanAnswerRfi(route: RfiRoute): boolean {
  const tk = useCan('TK', 'edit');
  const da = useCan('DA', 'edit');
  const tc = useCan('TC', 'edit');
  return route === 'thiet_ke' ? tk : route === 'du_an' ? da : tc;
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-fg-subtle">{label}:</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}

/** Một RFI đầy đủ: câu hỏi, ảnh, kích thước, bản vẽ, câu trả lời (hoặc ô trả lời). */
export function RfiCard({
  rfi,
  showSite = false,
  linkTitle = true,
}: {
  rfi: RfiRecord;
  showSite?: boolean;
  /** Tiêu đề dẫn sang trang riêng `/lam-ro/:id` — tắt khi đang ở chính trang đó. */
  linkTitle?: boolean;
}) {
  const canAnswer = useCanAnswerRfi(rfi.route);
  return (
    <li className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {linkTitle ? (
            <Link
              to={`/lam-ro/${rfi.id}`}
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              {rfi.code}
            </Link>
          ) : (
            <span className="font-mono text-sm text-fg-subtle">{rfi.code}</span>
          )}
          <p className="font-medium text-fg">{rfi.title}</p>
          {showSite && rfi.site && (
            <p className="text-sm text-fg-subtle">
              {rfi.site.code} — {rfi.site.name}
            </p>
          )}
        </div>
        <StatusLozenge status={rfiDisplayStatus(rfi.status, rfi.due_date)} />
      </div>

      <p className="whitespace-pre-wrap text-fg">{rfi.question}</p>

      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        <Line label="Gửi tới">{RFI_ROUTE_LABEL[rfi.route]}</Line>
        <Line label="Hạn trả lời">{formatDate(rfi.due_date)}</Line>
        {rfi.location && <Line label="Vị trí, hạng mục">{rfi.location}</Line>}
        {rfi.measurements && <Line label="Kích thước đo được">{rfi.measurements}</Line>}
        {rfi.drawing && (
          <Line label="Bản vẽ">
            {rfi.drawing.title} — bản {rfi.drawing.version}
          </Line>
        )}
        <Line label="Người gửi">
          {rfi.requester?.full_name ?? 'Công trường'} · {formatDateTime(rfi.created_at)}
        </Line>
      </dl>

      {rfi.photo_urls && rfi.photo_urls.length > 0 && <PhotoStrip paths={rfi.photo_urls} />}

      {rfi.status === 'da_tra_loi' ? (
        <div className="rounded-sm border border-status-completed/30 bg-status-completed-bg p-3">
          <p className="text-sm font-medium text-status-completed">
            Trả lời
            {rfi.answerer_name
              ? ` — ${rfi.answerer_name} (chủ đầu tư, ghi bởi ${rfi.answerer?.full_name ?? 'công trường'})`
              : rfi.answerer
                ? ` — ${rfi.answerer.full_name}`
                : ''}
            {rfi.answered_at && ` · ${formatDateTime(rfi.answered_at)}`}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-fg">{rfi.answer}</p>
        </div>
      ) : (
        canAnswer && <RfiAnswerForm rfi={rfi} />
      )}
    </li>
  );
}

function RfiAnswerForm({ rfi }: { rfi: RfiRecord }) {
  const answer = useAnswerRfi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const external = rfi.route === 'chu_dau_tu';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!text.trim()) return setError('Vui lòng ghi nội dung trả lời.');
    if (external && !name.trim())
      return setError('Vui lòng ghi tên người trả lời phía chủ đầu tư.');
    try {
      await answer.mutateAsync({
        id: rfi.id,
        answer: text.trim(),
        answererName: external ? name.trim() : undefined,
      });
    } catch (err) {
      setError(toUserMessage(err, 'edit'));
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {external ? 'Ghi trả lời của chủ đầu tư' : 'Trả lời'}
      </Button>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-3 border-t border-border pt-3">
      {external && (
        <Field label="Người trả lời phía chủ đầu tư" required>
          <Input className="h-10 max-w-md" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      <Field
        label="Nội dung trả lời"
        required
        hint="Ghi rõ phương án xử lý; cần bản vẽ điều chỉnh thì lập yêu cầu thay đổi ở hồ sơ thiết kế."
      >
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={cn(TEXTAREA_BOX, 'max-w-2xl')}
        />
      </Field>
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={answer.isPending}>
          {answer.isPending ? 'Đang gửi…' : 'Gửi trả lời'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

export function RfiList({
  rfis,
  isLoading,
  error,
  emptyMessage,
  showSite = false,
}: {
  rfis: RfiRecord[] | undefined;
  isLoading: boolean;
  error: Error | null;
  emptyMessage: string;
  showSite?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!rfis || rfis.length === 0) return <EmptyState message={emptyMessage} />;
  return (
    <ul className="space-y-3">
      {rfis.map((rfi) => (
        <RfiCard key={rfi.id} rfi={rfi} showSite={showSite} />
      ))}
    </ul>
  );
}

/** Biểu mẫu gửi RFI từ công trường. Nút chụp ảnh luôn hiện, không nằm sau menu (AFD 4.8). */
export function RfiCreateForm({
  siteId,
  hasDesignProject,
  onDone,
}: {
  siteId: string;
  /** Công trình gắn hồ sơ thiết kế trên hệ thống — mới gửi được tới Phòng Thiết kế. */
  hasDesignProject: boolean;
  onDone: (code: string) => void;
}) {
  const create = useCreateRfi();
  const drawings = useSiteDesignDrawings(hasDesignProject ? siteId : undefined);
  const current = (drawings.data ?? []).filter((d) => d.is_current);
  const routes = RFI_ROUTES.filter((r) => r !== 'thiet_ke' || hasDesignProject);
  const [form, setForm] = useState({
    title: '',
    question: '',
    location: '',
    measurements: '',
    route: routes[0]!,
    dueDate: '',
    designVersionId: '',
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const today = toNvgDateInput(new Date());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError('Vui lòng nhập tiêu đề.');
    if (!form.question.trim()) return setError('Vui lòng ghi nội dung cần làm rõ.');
    if (!form.dueDate) return setError('Vui lòng chọn hạn trả lời.');
    try {
      const created = await create.mutateAsync({
        siteId,
        title: form.title.trim(),
        question: form.question.trim(),
        location: form.location.trim() || null,
        measurements: form.measurements.trim() || null,
        route: form.route,
        dueDate: form.dueDate,
        designVersionId:
          form.route === 'thiet_ke' && form.designVersionId ? form.designVersionId : null,
        photos,
      });
      onDone(created.code);
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <p className="font-medium">Gửi yêu cầu làm rõ</p>
      <Field label="Gửi tới" required>
        <SegmentedControl
          options={routes}
          value={form.route}
          onChange={(route) => setForm((f) => ({ ...f, route }))}
          getLabel={(r) => RFI_ROUTE_LABEL[r]}
        />
      </Field>
      {!hasDesignProject && (
        <p className="text-sm text-fg-subtle">
          Công trình này không gắn hồ sơ thiết kế trên hệ thống, nên chưa gửi thẳng tới Phòng Thiết
          kế được.
        </p>
      )}
      {form.route === 'chu_dau_tu' && (
        <p className="text-sm text-fg-subtle">
          Chủ đầu tư không dùng hệ thống: người được phân công công trình chuyển câu hỏi và ghi lại
          câu trả lời ở đây.
        </p>
      )}
      <Field label="Tiêu đề" required>
        <Input
          className="h-10 max-w-xl"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Cao độ dầm D3 trục 2"
        />
      </Field>
      <Field
        label="Nội dung cần làm rõ"
        required
        hint="Chỗ bản vẽ và thực tế khác nhau, hoặc chỗ chưa rõ — càng cụ thể càng trả lời nhanh."
      >
        <textarea
          rows={4}
          value={form.question}
          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
          className={cn(TEXTAREA_BOX, 'max-w-2xl')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vị trí, hạng mục" optional>
          <Input
            className="h-10"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="Tầng 2, trục 2–3"
          />
        </Field>
        <Field label="Kích thước đo được" optional>
          <Input
            className="h-10"
            value={form.measurements}
            onChange={(e) => setForm((f) => ({ ...f, measurements: e.target.value }))}
            placeholder="Thông thủy 3,18 m"
          />
        </Field>
        {form.route === 'thiet_ke' && current.length > 0 && (
          <Field label="Bản vẽ liên quan" optional>
            <select
              value={form.designVersionId}
              onChange={(e) => setForm((f) => ({ ...f, designVersionId: e.target.value }))}
              className={cn(FIELD_BOX, 'w-full')}
            >
              <option value="">— Không chọn —</option>
              {current.map((d) => (
                <option key={d.version_id} value={d.version_id}>
                  {d.discipline_label} — {d.title} (bản {d.version})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Hạn trả lời" required>
          <DateInput
            value={form.dueDate}
            min={today}
            onChange={(dueDate) => setForm((f) => ({ ...f, dueDate }))}
          />
        </Field>
      </div>
      <Field label="Ảnh hiện trường" optional>
        <SitePhotoPicker files={photos} onChange={setPhotos} disabled={create.isPending} />
      </Field>
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={create.isPending}>
        {create.isPending ? 'Đang gửi…' : 'Gửi yêu cầu'}
      </Button>
    </form>
  );
}
