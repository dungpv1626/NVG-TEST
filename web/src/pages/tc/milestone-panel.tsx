/**
 * Tab «Mốc thi công» của Chi tiết Công trình (Đợt 2 — 2A, migration 0182).
 *
 * Quy chuẩn Nhà Việt One: «Chuẩn bị → Kiểm tra → Thi công → Nghiệm thu → Chuyển bước»; «không che
 * khuất công việc chưa nghiệm thu». Mỗi lúc chỉ MỘT mốc đang làm — nút chính duy nhất của tab là
 * «Nghiệm thu mốc» của mốc đó. Mốc sau hiện xám, không bấm được: mốc trước chưa đạt thì chưa mở.
 *
 * Lớp 3 (phụ trách kỹ thuật kiểm) chỉ hiện nút cho Trưởng phòng Thi công / Ban Giám đốc, và không
 * cho người đã lập biên bản mốc — cùng điều kiện CSDL chặn.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Circle, Clock, ShieldCheck } from 'lucide-react';
import {
  SITE_MILESTONE_EVENT_LABELS,
  SITE_MILESTONE_STATUS_LABELS,
  formatDate,
  formatDateTime,
  milestoneDisplayStatus,
  toNvgDateInput,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useAcceptanceChecklists } from '@/hooks/use-acceptance-checklists';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useApplyMilestoneTemplate,
  useCanReviewMilestones,
  useMilestoneTemplates,
  useRecordMilestoneAcceptance,
  useReviewMilestone,
  useSetMilestonePlan,
  useSiteMilestones,
  type SiteMilestone,
} from '@/hooks/use-site-milestones';
import { uploadConstructionPhotos } from '@/hooks/use-site-photos';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
  AcceptanceChecklistField,
  missingAnswers,
  type ChecklistAnswers,
} from './acceptance-checklist-field';
import { ChecklistResults } from './acceptance-panel';

function MilestoneIcon({ status }: { status: SiteMilestone['status'] }) {
  if (status === 'dat') return <CheckCircle2 className="size-5 text-status-completed" />;
  if (status === 'cho_ky_thuat') return <ShieldCheck className="size-5 text-status-pending" />;
  if (status === 'dang_lam') return <Clock className="size-5 text-status-progress" />;
  return <Circle className="size-5 text-fg-subtle" />;
}

/** Biểu mẫu nghiệm thu mốc đang làm: chấm từng mục + ảnh, tồn tại nếu có mục Không đạt. */
function MilestoneAcceptanceForm({
  siteId,
  milestone,
  onDone,
  onCancel,
}: {
  siteId: string;
  milestone: SiteMilestone;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { data: checklists } = useAcceptanceChecklists();
  const record = useRecordMilestoneAcceptance(siteId);
  const checklist = (checklists ?? []).find((c) => c.id === milestone.acceptance_checklist_id);
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  const [acceptedDate, setAcceptedDate] = useState(toNvgDateInput(new Date()));
  const [issues, setIssues] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!checklist) {
    return <p className="text-fg-subtle">Đang tải danh mục kiểm tra của mốc…</p>;
  }
  const hasFail = Object.values(answers).some((a) => a.result === 'khong_dat');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!checklist) return;
    setError(null);
    const missing = missingAnswers(checklist.items, answers);
    if (missing.length > 0) {
      setError(`Chưa chấm đủ, hoặc thiếu ảnh bắt buộc: ${missing.join('; ')}.`);
      return;
    }
    if (hasFail && !issues.trim()) {
      setError('Có mục Không đạt — ghi rõ tồn tại cần khắc phục.');
      return;
    }
    setSaving(true);
    try {
      // Ảnh tải TRƯỚC, biên bản ghi SAU — biên bản đã ký không trỏ vào ảnh chưa có.
      const results = [];
      for (const item of checklist.items) {
        const a = answers[item.key]!;
        const photoPaths =
          a.files.length > 0 ? await uploadConstructionPhotos(siteId, 'nghiem-thu', a.files) : [];
        results.push({
          key: item.key,
          result: a.result!,
          note: a.note.trim() || null,
          photo_paths: photoPaths,
        });
      }
      const outcome = await record.mutateAsync({
        milestoneId: milestone.id,
        results,
        acceptedDate: acceptedDate || null,
        outstandingIssues: issues.trim() || null,
      });
      onDone(
        outcome === 'dat'
          ? `Mốc «${milestone.label}» đạt — đã mở mốc sau.`
          : outcome === 'cho_ky_thuat'
            ? `Đã lập biên bản mốc «${milestone.label}» — chờ phụ trách kỹ thuật kiểm.`
            : `Đã lập biên bản có mục Không đạt — khắc phục xong thì nghiệm thu lại mốc «${milestone.label}».`,
      );
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 space-y-3 border-t border-border pt-3">
      <p className="text-sm text-fg-subtle">
        Danh mục: {checklist.name}. Mục «Cần ảnh» là phần sẽ bị che khuất — chụp trước khi làm tiếp.
      </p>
      <AcceptanceChecklistField
        items={checklist.items}
        answers={answers}
        onChange={setAnswers}
        disabled={saving}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ngày nghiệm thu">
          <DateInput value={acceptedDate} onChange={setAcceptedDate} disabled={saving} />
        </Field>
        <Field
          label="Tồn tại cần khắc phục"
          required={hasFail}
          hint={hasFail ? 'Bắt buộc khi có mục Không đạt.' : undefined}
        >
          <textarea
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
            rows={2}
            disabled={saving}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2"
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Đang lưu…' : 'Ký biên bản mốc'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}

export function MilestonePanel({
  siteId,
  companyId,
  stage,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  stage: string;
  readOnly: boolean;
}) {
  const { profile } = useAuth();
  const promptDialog = usePromptDialog();
  const { data: milestones, isLoading } = useSiteMilestones(siteId);
  const { data: canReview = false } = useCanReviewMilestones(companyId);
  const empty = !isLoading && (milestones ?? []).length === 0;
  const { data: templates } = useMilestoneTemplates(companyId, empty && canReview && !readOnly);
  const apply = useApplyMilestoneTemplate(siteId);
  const review = useReviewMilestone(siteId);
  const setPlan = useSetMilestonePlan(siteId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  // Ký xong biểu mẫu ở cuối trang — đưa câu báo kết quả vào tầm mắt (điện thoại).
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [notice]);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, done?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  async function sendBack(m: SiteMilestone) {
    const note = await promptDialog.ask({
      title: `Trả lại mốc «${m.label}»?`,
      label: 'Chỗ chưa đạt, cần khắc phục gì',
      confirmLabel: 'Trả lại',
      danger: true,
    });
    if (note === null) return;
    void run(
      () => review.mutateAsync({ milestoneId: m.id, approve: false, note }),
      `Đã trả lại mốc «${m.label}» cho chỉ huy trưởng.`,
    );
  }

  if (isLoading) return <p className="text-fg-subtle">Đang tải mốc thi công…</p>;

  if (empty) {
    const chosen = templateId || templates?.find((t) => t.is_default)?.id || templates?.[0]?.id;
    return (
      <EmptyState
        message="Công trình chưa có mốc thi công. Áp bộ mốc để chia quá trình thi công thành từng mốc nghiệm thu trước khi che khuất."
        action={
          canReview && !readOnly && (templates ?? []).length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <select
                value={chosen ?? ''}
                onChange={(e) => setTemplateId(e.target.value)}
                aria-label="Bộ mốc"
                className="h-10 rounded-sm border border-border bg-surface px-3"
              >
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.steps.length} mốc)
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={!chosen || apply.isPending}
                onClick={() => chosen && void run(() => apply.mutateAsync(chosen))}
              >
                Áp bộ mốc
              </Button>
              {error && (
                <p role="alert" className="w-full text-status-overdue">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-fg-subtle">
              Trưởng phòng Thi công hoặc Ban Giám đốc áp bộ mốc cho công trình.
            </p>
          )
        }
      />
    );
  }

  const list = milestones ?? [];
  const passed = list.filter((m) => m.status === 'dat').length;
  const canAccept = !readOnly && stage === 'dang_thi_cong';

  return (
    <div className="space-y-4">
      {promptDialog.dialog}
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-medium">
          Đã đạt {passed}/{list.length} mốc
        </p>
        <div
          className="h-2 w-48 overflow-hidden rounded-full bg-surface-sunken"
          aria-label={`Đã đạt ${passed} trên ${list.length} mốc`}
        >
          <div
            className="h-full rounded-full bg-status-completed"
            style={{ width: `${Math.round((passed / list.length) * 100)}%` }}
          />
        </div>
        {stage === 'chuan_bi' && (
          <p className="text-sm text-fg-subtle">
            Nghiệm thu mốc mở khi công trình bắt đầu thi công.
          </p>
        )}
      </div>

      {notice && (
        <p
          ref={noticeRef}
          role="status"
          className="rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed"
        >
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      <ol className="space-y-3">
        {list.map((m) => {
          const display = milestoneDisplayStatus(m.status, m.planned_end_date);
          const isOpen = openId === m.id;
          const mine = profile?.id != null && m.submitted_by === profile.id;
          return (
            <li
              key={m.id}
              className={cn(
                'rounded-lg border bg-surface p-4',
                m.status === 'dang_lam' || m.status === 'cho_ky_thuat'
                  ? 'border-border-strong shadow-card'
                  : 'border-border',
                m.status === 'cho_lam' && 'opacity-70',
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <MilestoneIcon status={m.status} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    Mốc {m.position}. {m.label}
                  </p>
                  <p className="mt-0.5 text-sm text-fg-subtle">
                    {SITE_MILESTONE_STATUS_LABELS[m.status]}
                    {m.requires_technical_check &&
                      (m.status === 'cho_lam' || m.status === 'dang_lam') &&
                      ' · Cần phụ trách kỹ thuật kiểm'}
                    {m.passed_at && ` · Đạt ngày ${formatDate(m.passed_at)}`}
                    {m.acceptance?.code && ` · Biên bản ${m.acceptance.code}`}
                  </p>
                </div>
                {/* Mốc chưa tới không phải «Nháp» — chữ «Chưa tới» ở dòng dưới đã đủ. */}
                {m.status !== 'cho_lam' && <StatusLozenge status={display} />}
              </div>

              {(m.status === 'dang_lam' || m.status === 'cho_lam') && (
                <div className="mt-3 max-w-xs">
                  <Field label="Dự kiến xong">
                    {readOnly ? (
                      <p>{m.planned_end_date ? formatDate(m.planned_end_date) : 'Chưa đặt'}</p>
                    ) : (
                      <DateInput
                        defaultValue={m.planned_end_date ?? ''}
                        // Gõ dở ra chuỗi rỗng — chỉ lưu ngày đã đủ; xoá hẳn thì lưu lúc rời ô.
                        onChange={(iso) => {
                          if (iso.length !== 10 || iso === m.planned_end_date) return;
                          void run(() =>
                            setPlan.mutateAsync({ milestoneId: m.id, plannedEndDate: iso }),
                          );
                        }}
                        onBlur={(iso) => {
                          if (iso !== '' || !m.planned_end_date) return;
                          void run(() =>
                            setPlan.mutateAsync({ milestoneId: m.id, plannedEndDate: null }),
                          );
                        }}
                      />
                    )}
                  </Field>
                </div>
              )}

              {m.status === 'dang_lam' && m.technical_note && (
                <p className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
                  Bị trả lại: {m.technical_note}
                </p>
              )}

              {m.status === 'dang_lam' && canAccept && !isOpen && (
                <Button className="mt-3" variant="primary" onClick={() => setOpenId(m.id)}>
                  Nghiệm thu mốc
                </Button>
              )}
              {m.status === 'dang_lam' && isOpen && (
                <MilestoneAcceptanceForm
                  siteId={siteId}
                  milestone={m}
                  onCancel={() => setOpenId(null)}
                  onDone={(message) => {
                    setOpenId(null);
                    setNotice(message);
                  }}
                />
              )}

              {m.status === 'cho_ky_thuat' && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm">
                    Nghiệm thu nội bộ đạt
                    {m.submitted_at && ` lúc ${formatDateTime(m.submitted_at)}`} — đang chờ phụ
                    trách kỹ thuật kiểm (lớp 3) trước khi sang mốc sau.
                  </p>
                  {m.acceptance_record_id && (
                    <ChecklistResults acceptanceId={m.acceptance_record_id} />
                  )}
                  {canReview && !mine && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        disabled={review.isPending}
                        onClick={() =>
                          void run(
                            () =>
                              review.mutateAsync({ milestoneId: m.id, approve: true, note: null }),
                            `Mốc «${m.label}» đạt — đã mở mốc sau.`,
                          )
                        }
                      >
                        Xác nhận đạt
                      </Button>
                      <Button variant="secondary" onClick={() => void sendBack(m)}>
                        Trả lại
                      </Button>
                    </div>
                  )}
                  {canReview && mine && (
                    <p className="text-sm text-fg-subtle">
                      Biên bản do chính mình lập — cần một phụ trách kỹ thuật khác kiểm.
                    </p>
                  )}
                </div>
              )}

              {m.events.length > 1 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-fg-subtle">Lịch sử mốc</summary>
                  <ol className="mt-2 space-y-1">
                    {m.events.map((ev) => (
                      <li key={ev.id}>
                        {formatDateTime(ev.created_at)} —{' '}
                        {SITE_MILESTONE_EVENT_LABELS[ev.event] ?? ev.event}
                        {ev.actor && ` · ${ev.actor.full_name}`}
                        {ev.note && <span className="text-fg-subtle"> · {ev.note}</span>}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
