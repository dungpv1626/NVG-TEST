/**
 * Tồn tại cần khắc phục (T2, migration 0241) — tab «Tồn tại» của công trình và khối ghi tồn tại khi
 * lập biên bản nghiệm thu.
 *
 * Mỗi tồn tại một dòng: hạng mục, mô tả, ảnh trước, người xử lý (tổ đội của công trình hoặc người Thi
 * công), hạn. Đóng phải có ảnh sau sửa — CSDL chặn; máy ghi người + giờ đóng; đã đóng thì không sửa.
 * Anh Dũng chốt: tồn tại chưa đóng CHỈ CẢNH BÁO, không chặn bàn giao.
 */

import { useState, type FormEvent } from 'react';
import {
  formatDate,
  formatDateTime,
  siteIssueDisplayStatus,
  SITE_ISSUE_STATUS_META,
  toNvgDateInput,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { FIELD_BOX, TEXTAREA_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useSubcontractors } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCloseSiteIssue,
  useCreateSiteIssues,
  useSiteIssues,
  type NewSiteIssue,
  type SiteIssue,
} from '@/hooks/use-site-changes';
import { uploadConstructionPhotos } from '@/hooks/use-site-photos';
import { cn } from '@/lib/utils';
import { PhotoStrip, SitePhotoPicker } from './site-photo-picker';
import { useCommanderCandidates } from './site-prep-card';

/** Một dòng tồn tại đang nhập (chưa lưu). Người xử lý mã hoá «t:<tổ đội>» hoặc «u:<người>». */
export interface IssueDraft {
  key: string;
  workItem: string;
  description: string;
  assignee: string;
  dueDate: string;
  files: File[];
}

export function emptyIssueDraft(workItem = ''): IssueDraft {
  return {
    key: crypto.randomUUID(),
    workItem,
    description: '',
    assignee: '',
    dueDate: '',
    files: [],
  };
}

/** Tải ảnh rồi dựng các dòng ghi — dòng trống mô tả bị bỏ qua. */
export async function issueRowsFromDrafts(
  drafts: IssueDraft[],
  base: { siteId: string; companyId: string; acceptanceRecordId?: string | null },
): Promise<NewSiteIssue[]> {
  const rows: NewSiteIssue[] = [];
  for (const d of drafts) {
    if (!d.description.trim()) continue;
    const photos =
      d.files.length > 0 ? await uploadConstructionPhotos(base.siteId, 'ton-tai', d.files) : [];
    rows.push({
      construction_site_id: base.siteId,
      company_id: base.companyId,
      acceptance_record_id: base.acceptanceRecordId ?? null,
      work_item: d.workItem.trim() || null,
      description: d.description.trim(),
      before_photo_paths: photos,
      subcontractor_id: d.assignee.startsWith('t:') ? d.assignee.slice(2) : null,
      assigned_user_id: d.assignee.startsWith('u:') ? d.assignee.slice(2) : null,
      due_date: d.dueDate || null,
      client_created_at: new Date().toISOString(),
      client_generated_id: crypto.randomUUID(),
    });
  }
  return rows;
}

function AssigneeSelect({
  siteId,
  companyId,
  value,
  onChange,
}: {
  siteId: string;
  companyId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: crews } = useSubcontractors(siteId);
  const { data: people } = useCommanderCandidates(companyId);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD_BOX, 'w-full')}
    >
      <option value="">Chưa giao</option>
      {(crews ?? []).length > 0 && (
        <optgroup label="Tổ đội của công trình">
          {(crews ?? []).map((c) => (
            <option key={c.id} value={`t:${c.id}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Người Thi công">
        {(people ?? []).map((u) => (
          <option key={u.id} value={`u:${u.id}`}>
            {u.full_name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/** Các dòng tồn tại đang nhập — dùng trong biểu mẫu nghiệm thu và tab «Tồn tại». */
export function IssueDraftRows({
  siteId,
  companyId,
  drafts,
  onChange,
  disabled,
  defaultWorkItem = '',
}: {
  siteId: string;
  companyId: string;
  drafts: IssueDraft[];
  onChange: (drafts: IssueDraft[]) => void;
  disabled?: boolean;
  defaultWorkItem?: string;
}) {
  const patch = (key: string, change: Partial<IssueDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...change } : d)));
  return (
    <div className="space-y-3">
      {drafts.map((d, i) => (
        <fieldset key={d.key} className="space-y-3 rounded-sm border border-border p-3">
          <legend className="px-1 text-sm font-medium">Tồn tại {i + 1}</legend>
          <Field label="Mô tả tồn tại" required>
            <textarea
              value={d.description}
              onChange={(e) => patch(d.key, { description: e.target.value })}
              rows={2}
              placeholder="Trát nứt chân tường trục 3"
              className={TEXTAREA_BOX}
              disabled={disabled}
            />
          </Field>
          <SitePhotoPicker
            files={d.files}
            onChange={(files) => patch(d.key, { files })}
            disabled={disabled}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Hạng mục" optional>
              <Input
                value={d.workItem}
                onChange={(e) => patch(d.key, { workItem: e.target.value })}
                disabled={disabled}
              />
            </Field>
            <Field label="Người xử lý" optional>
              <AssigneeSelect
                siteId={siteId}
                companyId={companyId}
                value={d.assignee}
                onChange={(assignee) => patch(d.key, { assignee })}
              />
            </Field>
            <Field label="Hạn khắc phục" optional>
              <DateInput value={d.dueDate} onChange={(dueDate) => patch(d.key, { dueDate })} />
            </Field>
          </div>
          <button
            type="button"
            className="text-sm text-brand underline"
            onClick={() => onChange(drafts.filter((x) => x.key !== d.key))}
            disabled={disabled}
          >
            Bỏ dòng này
          </button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...drafts, emptyIssueDraft(defaultWorkItem)])}
        disabled={disabled}
      >
        Thêm tồn tại
      </Button>
    </div>
  );
}

function IssueCard({ issue, readOnly }: { issue: SiteIssue; readOnly: boolean }) {
  const close = useCloseSiteIssue();
  const [closing, setClosing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = toNvgDateInput(new Date());
  const status = siteIssueDisplayStatus(issue.status, issue.due_date, today);

  async function onClose() {
    setError(null);
    if (files.length === 0) {
      setError('Chụp ít nhất một ảnh sau khi khắc phục để đóng tồn tại.');
      return;
    }
    setBusy(true);
    try {
      const paths = await uploadConstructionPhotos(issue.construction_site_id, 'ton-tai', files);
      await close.mutateAsync({ id: issue.id, afterPhotoPaths: paths, note: note.trim() || null });
      setClosing(false);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    } finally {
      setBusy(false);
    }
  }

  const who = issue.subcontractor?.name ?? issue.assignee?.full_name ?? null;

  return (
    <li className="space-y-2 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-fg-subtle">
            {issue.code}
            {issue.work_item && ` · ${issue.work_item}`}
          </p>
          <p className="whitespace-pre-wrap">{issue.description}</p>
        </div>
        <StatusLozenge status={status} />
      </div>
      <p className="text-sm text-fg-subtle">
        {SITE_ISSUE_STATUS_META[issue.status].label}
        {' · '}
        {who ? `Người xử lý: ${who}` : 'Chưa giao người xử lý'}
        {issue.due_date && ` · hạn ${formatDate(issue.due_date)}`}
      </p>
      <PhotoStrip paths={issue.before_photo_paths} />
      {issue.status === 'da_dong' && (
        <>
          <p className="text-sm text-status-completed">
            Đã khắc phục — {issue.closer?.full_name ?? '—'}
            {issue.closed_at && ` · ${formatDateTime(issue.closed_at)}`}
            {issue.close_note && `. ${issue.close_note}`}
          </p>
          <PhotoStrip paths={issue.after_photo_paths} />
        </>
      )}
      {issue.status === 'dang_mo' && !readOnly && !closing && (
        <Button variant="secondary" onClick={() => setClosing(true)}>
          Đóng tồn tại
        </Button>
      )}
      {closing && (
        <div className="space-y-3 rounded-sm border border-border p-3">
          <p className="text-sm">Chụp ảnh sau khi khắc phục — bắt buộc để đóng.</p>
          <SitePhotoPicker files={files} onChange={setFiles} disabled={busy} />
          <Field label="Ghi chú" optional>
            <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void onClose()} disabled={busy}>
              {busy ? 'Đang lưu…' : 'Xác nhận đã khắc phục'}
            </Button>
            <Button variant="secondary" onClick={() => setClosing(false)} disabled={busy}>
              Hủy
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
    </li>
  );
}

/** Tồn tại của MỘT biên bản nghiệm thu — hiện ngay dưới biên bản. */
export function AcceptanceIssues({
  siteId,
  acceptanceId,
  readOnly,
}: {
  siteId: string;
  acceptanceId: string;
  readOnly: boolean;
}) {
  const { data } = useSiteIssues(siteId);
  const rows = (data ?? []).filter((i) => i.acceptance_record_id === acceptanceId);
  if (rows.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2 border-t border-border pt-3" aria-label="Tồn tại của biên bản">
      {rows.map((i) => (
        <IssueCard key={i.id} issue={i} readOnly={readOnly} />
      ))}
    </ul>
  );
}

export function SiteIssuePanel({
  siteId,
  companyId,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data, isLoading } = useSiteIssues(siteId);
  const create = useCreateSiteIssues();
  const [drafts, setDrafts] = useState<IssueDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!drafts.some((d) => d.description.trim())) {
      setError('Vui lòng mô tả ít nhất một tồn tại.');
      return;
    }
    setBusy(true);
    try {
      await create.mutateAsync(await issueRowsFromDrafts(drafts, { siteId, companyId }));
      setDrafts([]);
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    } finally {
      setBusy(false);
    }
  }

  const all = data ?? [];
  const open = all.filter((i) => i.status === 'dang_mo');
  const closed = all.filter((i) => i.status === 'da_dong');

  return (
    <div className="space-y-4">
      {!readOnly && drafts.length === 0 && (
        <Button variant="primary" size="lg" onClick={() => setDrafts([emptyIssueDraft()])}>
          Ghi tồn tại
        </Button>
      )}
      {drafts.length > 0 && (
        <form onSubmit={save} noValidate className="space-y-3 rounded-card bg-surface p-4">
          <IssueDraftRows
            siteId={siteId}
            companyId={companyId}
            drafts={drafts}
            onChange={setDrafts}
            disabled={busy}
          />
          {error && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu tồn tại'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => setDrafts([])}
              disabled={busy}
            >
              Hủy
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : open.length === 0 ? (
        <EmptyState message="Không còn tồn tại nào đang mở. Ghi tồn tại khi nghiệm thu hoặc khi phát hiện lỗi cần khắc phục — mỗi tồn tại có người xử lý và hạn." />
      ) : (
        <ul className="space-y-3">
          {open.map((i) => (
            <IssueCard key={i.id} issue={i} readOnly={readOnly} />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <div>
          <Button variant="link" size="sm" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? 'Ẩn tồn tại đã khắc phục' : `Xem ${closed.length} tồn tại đã khắc phục`}
          </Button>
          {showClosed && (
            <ul className="mt-2 space-y-3">
              {closed.map((i) => (
                <IssueCard key={i.id} issue={i} readOnly />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
