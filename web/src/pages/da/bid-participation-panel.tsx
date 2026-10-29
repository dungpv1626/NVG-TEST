/**
 * «Đánh giá và quyết định tham gia» — G6 (0247, kế hoạch A10).
 *
 * Người chịu trách nhiệm gói thầu ghi hình thức lựa chọn nhà thầu, loại công trình và đánh giá sáu
 * tiêu chí Ban Giám đốc dùng để quyết định (phiếu khảo sát Ban Giám đốc, dòng 739), rồi gửi phê
 * duyệt. Ban Giám đốc duyệt trong Hộp thư Phê duyệt; từ chối = «Không tham gia» kèm lý do.
 *
 * Chọn hình thức đánh giá: mỗi tiêu chí MỘT mức trong ba («Thuận lợi / Cần lưu ý / Rủi ro cao») cộng
 * ghi chú, ghi chú bắt buộc khi khác «Thuận lợi». Không chấm điểm số: điểm 1–10 không ai hiệu chỉnh
 * và dễ đọc như phép tính tự động; ba mức đủ để Ban Giám đốc thấy ngay chỗ rủi ro, lý do ghi bằng lời.
 */

import { useEffect, useState } from 'react';
import {
  BID_ASSESSMENT_CRITERIA,
  BID_ASSESSMENT_RATING_LABELS,
  BID_ASSESSMENT_RATINGS,
  BID_PARTICIPATION_STATUS_LABELS,
  BID_RECOMMENDATION_LABELS,
  BID_RECOMMENDATIONS,
  BID_WORK_TYPE_LABELS,
  BID_WORK_TYPES,
  bidAssessmentMissing,
  formatDateTime,
  PROCUREMENT_FORM_LABELS,
  PROCUREMENT_FORMS,
  type BidAssessment,
  type BidAssessmentCriterion,
  type BidAssessmentRating,
  type BidWorkType,
  type ProcurementForm,
} from '@nvg/shared';
import { WaitingOn } from '@/components/entity/waiting-on';
import { Button } from '@/components/ui/button';
import { useSaveBidAssessment, useSubmitBidParticipation } from '@/hooks/use-bid-participation';
import type { BiddingProjectDetailRecord } from '@/hooks/use-bidding-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { cn } from '@/lib/utils';

const RATING_TONE: Record<BidAssessmentRating, string> = {
  thuan_loi: 'bg-status-completed-bg text-status-completed',
  can_luu_y: 'bg-status-pending-bg text-status-pending',
  rui_ro_cao: 'bg-status-overdue-bg text-status-overdue',
};

const SELECT_CLASS =
  'h-11 w-full rounded-field border border-border-strong bg-surface px-3 sm:h-9 disabled:opacity-60';

export function BidParticipationPanel({
  project,
  canEdit,
}: {
  project: BiddingProjectDetailRecord;
  /** Người chịu trách nhiệm (hoặc lãnh đạo) có quyền sửa DA — CSDL vẫn kiểm lại. */
  canEdit: boolean;
}) {
  const status = project.participation_status;
  const terminal = ['trung_thau', 'truot_thau', 'khong_tham_gia'].includes(project.stage);
  const editable = canEdit && status === 'chua_danh_gia' && !terminal;
  // Gói lập trước bước này: chỉ còn phân loại để sửa, không có đánh giá.
  const classifyOnly = canEdit && status === 'truoc_quy_dinh' && !terminal;

  const save = useSaveBidAssessment();
  const submit = useSubmitBidParticipation();
  const [draft, setDraft] = useState<BidAssessment>(project.participation_assessment ?? {});
  const [form, setForm] = useState<ProcurementForm | ''>(project.procurement_form ?? '');
  const [workType, setWorkType] = useState<BidWorkType | ''>(project.work_type ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(project.participation_assessment ?? {});
    setForm(project.procurement_form ?? '');
    setWorkType(project.work_type ?? '');
  }, [project.participation_assessment, project.procurement_form, project.work_type]);

  const missing = [
    ...(!form ? ['Hình thức lựa chọn nhà thầu'] : []),
    ...(!workType ? ['Loại công trình'] : []),
    ...bidAssessmentMissing(draft),
  ];

  function setCriterion(
    key: BidAssessmentCriterion,
    patch: { rating?: BidAssessmentRating; note?: string },
  ) {
    setSaved(false);
    setDraft((d) => ({
      ...d,
      criteria: { ...d.criteria, [key]: { ...d.criteria?.[key], ...patch } },
    }));
  }

  async function persist(): Promise<boolean> {
    setError(null);
    try {
      await save.mutateAsync({
        id: project.id,
        changes: {
          procurement_form: form || null,
          work_type: workType || null,
          ...(classifyOnly ? {} : { participation_assessment: draft }),
        },
      });
      setSaved(true);
      return true;
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
      return false;
    }
  }

  async function send() {
    if (!(await persist())) return;
    try {
      await submit.mutateAsync({ projectId: project.id });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  const statusTone =
    status === 'da_duyet'
      ? 'text-status-completed'
      : status === 'cho_duyet'
        ? 'text-status-pending'
        : status === 'khong_tham_gia'
          ? 'text-status-overdue'
          : 'text-fg-subtle';

  return (
    <section aria-labelledby="bid-participation-title" className="rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="bid-participation-title" className="text-md font-semibold">
          Đánh giá và quyết định tham gia
        </h2>
        <p className={cn('text-sm font-semibold', statusTone)}>
          {BID_PARTICIPATION_STATUS_LABELS[status]}
        </p>
      </div>

      {status === 'cho_duyet' && project.participation_approval_id && (
        <WaitingOn approvalId={project.participation_approval_id} canNudge={canEdit} />
      )}
      {(status === 'da_duyet' || status === 'khong_tham_gia') && (
        <p className="mt-1 text-sm text-fg-subtle">
          {project.participation_decided_at && formatDateTime(project.participation_decided_at)}
          {project.participation_decision_note && ` — ${project.participation_decision_note}`}
        </p>
      )}
      {status === 'truoc_quy_dinh' && (
        <p className="mt-1 text-sm text-fg-subtle">
          Gói thầu đã lập dự toán trước khi có bước quyết định tham gia nên không đòi bước này.
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="block font-medium">Hình thức lựa chọn nhà thầu</span>
          <select
            value={form}
            disabled={!editable && !classifyOnly}
            onChange={(e) => {
              setSaved(false);
              setForm(e.target.value as ProcurementForm | '');
            }}
            className={SELECT_CLASS}
          >
            <option value="">Chưa chọn</option>
            {PROCUREMENT_FORMS.map((f) => (
              <option key={f} value={f}>
                {PROCUREMENT_FORM_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="block font-medium">Loại công trình</span>
          <select
            value={workType}
            disabled={!editable && !classifyOnly}
            onChange={(e) => {
              setSaved(false);
              setWorkType(e.target.value as BidWorkType | '');
            }}
            className={SELECT_CLASS}
          >
            <option value="">Chưa chọn</option>
            {BID_WORK_TYPES.map((t) => (
              <option key={t} value={t}>
                {BID_WORK_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {status !== 'truoc_quy_dinh' && (
        <div className="mt-4 space-y-3">
          {BID_ASSESSMENT_CRITERIA.map((c) => {
            const entry = draft.criteria?.[c.key];
            return (
              <fieldset key={c.key} className="rounded-field border border-border p-3">
                <legend className="px-1 font-medium">{c.label}</legend>
                <p className="text-xs text-fg-subtle">{c.hint}</p>
                {editable ? (
                  <>
                    <div
                      className="mt-2 flex flex-wrap gap-1.5"
                      role="radiogroup"
                      aria-label={c.label}
                    >
                      {BID_ASSESSMENT_RATINGS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={entry?.rating === r}
                          onClick={() => setCriterion(c.key, { rating: r })}
                          className={cn(
                            'min-h-10 rounded-sm border px-3 py-1.5 text-xs font-semibold sm:min-h-0',
                            entry?.rating === r
                              ? cn('border-transparent', RATING_TONE[r])
                              : 'border-border text-fg-subtle hover:text-fg',
                          )}
                        >
                          {BID_ASSESSMENT_RATING_LABELS[r]}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={entry?.note ?? ''}
                      onChange={(e) => setCriterion(c.key, { note: e.target.value })}
                      rows={2}
                      maxLength={1000}
                      aria-label={`Ghi chú — ${c.label}`}
                      placeholder={
                        entry?.rating && entry.rating !== 'thuan_loi'
                          ? 'Ghi rõ vì sao (bắt buộc)'
                          : 'Ghi chú (tùy chọn)'
                      }
                      className="mt-2 w-full rounded-field border border-border-strong bg-surface px-3 py-2"
                    />
                  </>
                ) : (
                  <p className="mt-2">
                    {entry?.rating ? (
                      <span
                        className={cn(
                          'mr-2 rounded-sm px-2 py-0.5 text-xs font-semibold',
                          RATING_TONE[entry.rating],
                        )}
                      >
                        {BID_ASSESSMENT_RATING_LABELS[entry.rating]}
                      </span>
                    ) : (
                      <span className="mr-2 text-fg-subtle">Chưa đánh giá</span>
                    )}
                    {entry?.note}
                  </p>
                )}
              </fieldset>
            );
          })}

          <fieldset className="rounded-field border border-border p-3">
            <legend className="px-1 font-medium">Đề xuất của người chịu trách nhiệm</legend>
            {editable ? (
              <>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Đề xuất">
                  {BID_RECOMMENDATIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={draft.recommendation === r}
                      onClick={() => {
                        setSaved(false);
                        setDraft((d) => ({ ...d, recommendation: r }));
                      }}
                      className={cn(
                        'min-h-10 rounded-sm border px-3 py-1.5 text-xs font-semibold sm:min-h-0',
                        draft.recommendation === r
                          ? 'border-transparent bg-brand-mint text-brand-mint-ink'
                          : 'border-border text-fg-subtle hover:text-fg',
                      )}
                    >
                      {BID_RECOMMENDATION_LABELS[r]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={draft.summary ?? ''}
                  onChange={(e) => {
                    setSaved(false);
                    setDraft((d) => ({ ...d, summary: e.target.value }));
                  }}
                  rows={3}
                  maxLength={2000}
                  aria-label="Tóm tắt cho Ban Giám đốc"
                  placeholder="Tóm tắt cho Ban Giám đốc (tùy chọn): vì sao nên / không nên tham gia, điều kiện kèm theo."
                  className="mt-2 w-full rounded-field border border-border-strong bg-surface px-3 py-2"
                />
              </>
            ) : (
              <p>
                {draft.recommendation ? (
                  <span className="font-semibold">
                    {BID_RECOMMENDATION_LABELS[draft.recommendation]}.
                  </span>
                ) : (
                  <span className="text-fg-subtle">Chưa có đề xuất.</span>
                )}{' '}
                {draft.summary}
              </p>
            )}
          </fieldset>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}

      {(editable || classifyOnly) && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <Button
                variant="primary"
                disabled={missing.length > 0 || submit.isPending || save.isPending}
                onClick={() => void send()}
              >
                Gửi Ban Giám đốc quyết định
              </Button>
            )}
            <Button variant="secondary" disabled={save.isPending} onClick={() => void persist()}>
              {save.isPending ? 'Đang lưu…' : 'Lưu nháp'}
            </Button>
            {saved && <span className="text-sm text-fg-subtle">Đã lưu.</span>}
          </div>
          {editable && missing.length > 0 && (
            <p className="text-sm text-fg-subtle">Còn thiếu: {missing.join('; ')}.</p>
          )}
        </div>
      )}
    </section>
  );
}
