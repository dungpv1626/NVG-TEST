/**
 * Tab Phương án kiến trúc và tab Phiên bản bản vẽ (TK-03, TK-05).
 *
 * MỘT thành phần dùng cho cả hai tab, khác nhau ở danh sách bộ môn được lọc: tab Phương án
 * chỉ hiện `phuong_an`, tab Phiên bản hiện ba bộ môn kỹ thuật. Cơ chế phiên bản, phát hành
 * và vòng góp ý giống hệt nhau — viết hai lần thì lần sửa tiếp theo chỉ sửa được một bên.
 *
 * Ba điều chi phối màn hình này:
 *  1. **Bản mới là NHÁP.** Bản đang hiệu lực chỉ đổi khi bấm Phát hành, vì phát hành kéo
 *     theo thông báo cho 5 bộ phận (TK-05).
 *  2. **Đã phát hành thì không sửa.** Chỉnh sửa lặng lẽ sau khi công trường đã nhận là đúng
 *     cái sai mà cơ chế phiên bản sinh ra để chặn.
 *  3. **Góp ý của khách là dữ liệu, không phải ghi chú.** Nó là căn cứ chuyển bước (TK-03).
 */

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import {
  BUTTONS,
  DESIGN_DISCIPLINE_LABELS,
  DESIGN_REVIEW_DECISION_LABELS,
  DESIGN_REVIEWER_TYPE_LABELS,
  formatDateTime,
  type DesignDiscipline,
  type DesignReviewDecision,
  type DesignReviewerType,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import {
  useCreateDesignVersion,
  useDesignReviews,
  useDesignVersions,
  usePublishDesignVersion,
  useRecordDesignReview,
  type DesignVersionRecord,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';

export function VersionPanel({
  projectId,
  companyId,
  disciplines,
  readOnly,
  emptyMessage,
}: {
  projectId: string;
  companyId: string;
  disciplines: readonly DesignDiscipline[];
  readOnly: boolean;
  emptyMessage: string;
}) {
  const { data: allVersions } = useDesignVersions(projectId);
  const createVersion = useCreateDesignVersion();
  const publishVersion = usePublishDesignVersion();

  const versions = (allVersions ?? []).filter((v) =>
    disciplines.includes(v.discipline as DesignDiscipline),
  );
  const { data: reviewsByVersion } = useDesignReviews(versions.map((v) => v.id));

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    discipline: disciplines[0]!,
    title: '',
    fileName: '',
    changeReason: '',
    notes: '',
  });

  const hasPrevious = (discipline: DesignDiscipline) =>
    versions.some((v) => v.discipline === discipline);

  async function addVersion(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!form.title.trim()) {
      setError('Vui lòng nhập tên phiên bản.');
      return;
    }
    if (!form.fileName.trim()) {
      setError('Vui lòng nhập tên tệp bản vẽ.');
      return;
    }
    if (hasPrevious(form.discipline) && !form.changeReason.trim()) {
      setError('Vui lòng nêu nguyên nhân điều chỉnh so với bản trước.');
      return;
    }

    try {
      await createVersion.mutateAsync({
        projectId,
        companyId,
        discipline: form.discipline,
        title: form.title.trim(),
        // ⏳ Tải tệp thật lên Supabase Storage làm ở bước hoàn thiện kho hồ sơ; ở đây ghi
        // nhận đường dẫn để cơ chế phiên bản và thông báo chạy đúng từ bây giờ.
        fileUrl: `thiet-ke/${projectId}/${Date.now()}-${form.fileName.trim()}`,
        fileName: form.fileName.trim(),
        changeReason: form.changeReason.trim() || null,
        notes: form.notes.trim() || null,
      });
      setForm({ discipline: disciplines[0]!, title: '', fileName: '', changeReason: '', notes: '' });
      setAdding(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function publish(versionId: string) {
    setError(null);
    setNotice(null);
    try {
      const notified = await publishVersion.mutateAsync({ versionId });
      // Con số này là bằng chứng việc phát hành đã tới được các bộ phận (TK-05) — hữu ích
      // hơn hẳn một chữ "Đã lưu".
      setNotice(`Đã phát hành và thông báo cho ${notified} người liên quan.`);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {!readOnly &&
        (adding ? (
          <form
            onSubmit={addVersion}
            noValidate
            className="rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <p className="mb-4 font-medium">Thêm phiên bản mới</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {disciplines.length > 1 && (
                <Field label="Bộ môn" required>
                  <select
                    value={form.discipline}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, discipline: e.target.value as DesignDiscipline }))
                    }
                    className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
                  >
                    {disciplines.map((d) => (
                      <option key={d} value={d}>
                        {DESIGN_DISCIPLINE_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Tên phiên bản" required>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Mặt bằng tầng 1–3, phương án B"
                />
              </Field>

              <Field label="Tên tệp bản vẽ" required className="sm:col-span-2">
                <Input
                  value={form.fileName}
                  onChange={(e) => setForm((f) => ({ ...f, fileName: e.target.value }))}
                  placeholder="MB-TANG-1-3-PA-B.pdf"
                />
              </Field>

              {hasPrevious(form.discipline) && (
                <Field
                  label="Nguyên nhân điều chỉnh"
                  required
                  className="sm:col-span-2"
                  hint="Vì sao phải ra bản mới — bắt buộc từ phiên bản thứ hai trở đi (NEN-05)."
                >
                  <textarea
                    value={form.changeReason}
                    onChange={(e) => setForm((f) => ({ ...f, changeReason: e.target.value }))}
                    rows={2}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                  />
                </Field>
              )}

              <Field label="Ghi chú" className="sm:col-span-2">
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </Field>
            </div>

            <div className="mt-4 flex gap-2">
              <Button type="submit" variant="primary" disabled={createVersion.isPending}>
                {createVersion.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                {BUTTONS.cancel}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Thêm phiên bản
          </Button>
        ))}

      {versions.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <ul className="space-y-3">
          {versions.map((version) => (
            <VersionCard
              key={version.id}
              version={version}
              reviews={reviewsByVersion?.[version.id] ?? []}
              readOnly={readOnly}
              onPublish={() => void publish(version.id)}
              publishing={publishVersion.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function VersionCard({
  version,
  reviews,
  readOnly,
  onPublish,
  publishing,
}: {
  version: DesignVersionRecord;
  reviews: { id: string; reviewer_type: DesignReviewerType; decision: DesignReviewDecision; reviewer_name: string | null; comments: string; reviewed_at: string; recorder: { full_name: string } | null }[];
  readOnly: boolean;
  onPublish: () => void;
  publishing: boolean;
}) {
  const recordReview = useRecordDesignReview();
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [review, setReview] = useState({
    reviewerType: 'khach_hang' as DesignReviewerType,
    decision: 'gop_y' as DesignReviewDecision,
    reviewerName: '',
    comments: '',
  });

  const published = version.published_at !== null;

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    setReviewError(null);
    if (!review.comments.trim()) {
      setReviewError('Vui lòng ghi nội dung góp ý.');
      return;
    }
    if (review.reviewerType === 'khach_hang' && !review.reviewerName.trim()) {
      setReviewError('Vui lòng ghi tên người góp ý phía khách hàng.');
      return;
    }
    try {
      await recordReview.mutateAsync({
        versionId: version.id,
        reviewerType: review.reviewerType,
        decision: review.decision,
        comments: review.comments.trim(),
        reviewerName: review.reviewerName.trim() || undefined,
      });
      setReview((r) => ({ ...r, comments: '', reviewerName: '' }));
      setReviewing(false);
    } catch (e) {
      setReviewError(toUserMessage(e, 'create'));
    }
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {DESIGN_DISCIPLINE_LABELS[version.discipline]} — phiên bản {version.version}
        </span>
        {version.is_current_version && published && (
          <StatusLozenge status="completed" />
        )}
        {!published && <StatusLozenge status="draft" />}
        {version.customer_approved_at && (
          <span className="inline-flex items-center gap-1 text-status-completed">
            <CheckCircle2 className="size-4" />
            Khách hàng đã duyệt
          </span>
        )}
      </div>

      <p className="mt-1">{version.title}</p>
      {version.change_reason && (
        <p className="mt-1 text-fg-subtle">Nguyên nhân điều chỉnh: {version.change_reason}</p>
      )}
      <p className="mt-1 text-fg-subtle">
        {published
          ? `Phát hành ${formatDateTime(version.published_at!)}${
              version.publisher ? ` — ${version.publisher.full_name}` : ''
            }`
          : 'Bản nháp, chưa phát hành. Bản đang dùng ngoài công trường chưa đổi.'}
      </p>

      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!published && (
            <Button variant="primary" onClick={onPublish} disabled={publishing}>
              <Send className="mr-1 size-4" />
              Phát hành và thông báo
            </Button>
          )}
          {published && !reviewing && (
            <Button variant="secondary" onClick={() => setReviewing(true)}>
              Ghi nhận góp ý
            </Button>
          )}
        </div>
      )}

      {reviewing && (
        <form onSubmit={submitReview} noValidate className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Người góp ý">
              <select
                value={review.reviewerType}
                onChange={(e) =>
                  setReview((r) => ({ ...r, reviewerType: e.target.value as DesignReviewerType }))
                }
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                {(Object.keys(DESIGN_REVIEWER_TYPE_LABELS) as DesignReviewerType[]).map((t) => (
                  <option key={t} value={t}>
                    {DESIGN_REVIEWER_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Kết luận">
              <select
                value={review.decision}
                onChange={(e) =>
                  setReview((r) => ({ ...r, decision: e.target.value as DesignReviewDecision }))
                }
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                {(Object.keys(DESIGN_REVIEW_DECISION_LABELS) as DesignReviewDecision[]).map((d) => (
                  <option key={d} value={d}>
                    {DESIGN_REVIEW_DECISION_LABELS[d]}
                  </option>
                ))}
              </select>
            </Field>

            {review.reviewerType === 'khach_hang' && (
              <Field label="Tên người góp ý" required className="sm:col-span-2">
                <Input
                  value={review.reviewerName}
                  onChange={(e) => setReview((r) => ({ ...r, reviewerName: e.target.value }))}
                  placeholder="Chủ nhà Nguyễn Văn A"
                />
              </Field>
            )}

            <Field label="Nội dung" required className="sm:col-span-2">
              <textarea
                value={review.comments}
                onChange={(e) => setReview((r) => ({ ...r, comments: e.target.value }))}
                rows={3}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              />
            </Field>
          </div>

          {reviewError && (
            <p role="alert" className="text-status-overdue">
              {reviewError}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={recordReview.isPending}>
              {BUTTONS.save}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setReviewing(false)}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </form>
      )}

      {reviews.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {reviews.map((r) => (
            <li key={r.id} className="border-l-2 border-border pl-3">
              <p className="font-medium">
                {DESIGN_REVIEW_DECISION_LABELS[r.decision]}
                <span className="ml-2 font-normal text-fg-subtle">
                  {r.reviewer_name ?? DESIGN_REVIEWER_TYPE_LABELS[r.reviewer_type]} —{' '}
                  {formatDateTime(r.reviewed_at)}
                </span>
              </p>
              <p className="whitespace-pre-wrap">{r.comments}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
