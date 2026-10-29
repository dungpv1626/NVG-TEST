/**
 * Ý kiến gói thầu của một phòng — `/y-kien-goi-thau` (danh sách) và `/y-kien-goi-thau/:id` (một yêu
 * cầu), nơi thông báo «cần ý kiến» dẫn tới (G6, 0247).
 *
 * Không bọc `ModuleGuard`: Cung ứng, Thi công, Kế toán không xem được Module DA. Trang chỉ có tóm tắt
 * gói thầu theo hồ sơ mời thầu (qua `bid_reviews()` của CSDL) — không giá dự thầu, không dự toán.
 * Ai đọc / trả lời được là do CSDL quyết (người của đúng phòng được hỏi, hoặc người xem gói thầu).
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BID_REVIEW_DEPARTMENT_LABELS,
  BID_REVIEW_FIELDS,
  BID_REVIEW_RECOMMENDATION_LABELS,
  BID_REVIEW_RECOMMENDATIONS,
  BID_WORK_TYPE_LABELS,
  BIDDING_STAGE_META,
  formatCurrency,
  formatDate,
  formatWaiting,
  PROCUREMENT_FORM_LABELS,
  type BiddingStage,
  type BidReviewFieldKey,
  type BidReviewRecommendation,
} from '@nvg/shared';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  BID_REVIEW_FILE_ACCEPT,
  useBidReviews,
  useSubmitBidReview,
  useUploadBidReviewFiles,
  type BidReviewRow,
} from '@/hooks/use-bid-participation';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { ReviewFiles } from './bid-reviews-panel';

const EM_DASH = '—';

export function BidReviewListPage() {
  const { data, isLoading, error } = useBidReviews();
  return (
    <>
      <PageHeader
        title="Ý kiến gói thầu"
        description="Yêu cầu ý kiến của Phòng Dự án – Đấu thầu gửi tới phòng mình. Yêu cầu đang chờ đứng trên."
        breadcrumbs={[{ label: 'Ý kiến gói thầu' }]}
      />
      {isLoading ? (
        <CardGridSkeleton count={3} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="Chưa có yêu cầu ý kiến gói thầu nào gửi tới phòng mình. Yêu cầu mới sẽ có thông báo." />
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((r) => (
            <li key={r.id} className="rounded-card bg-surface p-4">
              <Link
                to={`/y-kien-goi-thau/${r.id}`}
                className="font-semibold text-brand hover:underline"
              >
                {r.bid_code} — {r.bid_name}
              </Link>
              <p className="text-sm text-fg-subtle">
                Phòng {BID_REVIEW_DEPARTMENT_LABELS[r.department]} ·{' '}
                {r.status === 'cho_y_kien'
                  ? `Đang chờ ý kiến · ${formatWaiting(r.requested_at)}`
                  : 'Đã góp ý'}
                {r.submission_deadline && ` · Hạn nộp thầu ${formatDate(r.submission_deadline)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function BidReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useBidReviews({ reviewId: id });
  const canViewDa = useCan('DA', 'view');

  if (isLoading) return <CardGridSkeleton count={2} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  const row = data?.[0];
  if (!row) {
    return (
      <RecordNotFound
        entity="yêu cầu ý kiến"
        listPath="/y-kien-goi-thau"
        listLabel="Về danh sách ý kiến gói thầu"
      />
    );
  }

  const stageLabel = BIDDING_STAGE_META[row.bid_stage as BiddingStage]?.label ?? row.bid_stage;

  return (
    <>
      <PageHeader
        title={`${row.bid_code} — ${row.bid_name}`}
        description={`Ý kiến của phòng ${BID_REVIEW_DEPARTMENT_LABELS[row.department]}`}
        breadcrumbs={[
          { label: 'Ý kiến gói thầu', to: '/y-kien-goi-thau' },
          { label: row.bid_code },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="bid-summary-title" className="rounded-card bg-surface p-4">
          <h2 id="bid-summary-title" className="mb-2 text-md font-semibold">
            Tóm tắt gói thầu
          </h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Item label="Pháp nhân" value={row.company_code} />
            <Item label="Bước hiện tại" value={stageLabel} />
            <Item label="Chủ đầu tư" value={row.customer_name ?? EM_DASH} />
            <Item label="Người chịu trách nhiệm" value={row.responsible_name ?? EM_DASH} />
            <Item
              label="Hình thức lựa chọn nhà thầu"
              value={row.procurement_form ? PROCUREMENT_FORM_LABELS[row.procurement_form] : EM_DASH}
            />
            <Item
              label="Loại công trình"
              value={row.work_type ? BID_WORK_TYPE_LABELS[row.work_type] : EM_DASH}
            />
            <Item
              label="Giá trị gói thầu theo hồ sơ mời thầu"
              value={row.estimated_value != null ? formatCurrency(row.estimated_value) : EM_DASH}
            />
            <Item
              label="Hạn nộp thầu"
              value={row.submission_deadline ? formatDate(row.submission_deadline) : EM_DASH}
            />
            <div className="sm:col-span-2">
              <Item label="Địa điểm công trình" value={row.site_address ?? EM_DASH} />
            </div>
            <div className="sm:col-span-2">
              <Item
                label="Hiện trạng, biện pháp và rủi ro (khảo sát)"
                value={row.survey_notes ?? EM_DASH}
              />
            </div>
          </dl>
          <p className="mt-3 text-sm text-fg-subtle">
            {row.requested_by_name ?? 'Phòng Dự án – Đấu thầu'} xin ý kiến ·{' '}
            {formatWaiting(row.requested_at)}
            {row.request_note && `: ${row.request_note}`}
          </p>
          {canViewDa && (
            <Link
              to={`/da/goi-thau/${row.bidding_project_id}?tab=tong-quan`}
              className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
            >
              Mở gói thầu
            </Link>
          )}
        </section>

        <ReviewForm key={row.id} row={row} />
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function ReviewForm({ row }: { row: BidReviewRow }) {
  const submit = useSubmitBidReview();
  const upload = useUploadBidReviewFiles();
  const fields = BID_REVIEW_FIELDS[row.department];
  const [recommendation, setRecommendation] = useState<BidReviewRecommendation | null>(
    row.recommendation,
  );
  const [values, setValues] = useState<Record<BidReviewFieldKey, string>>(
    () =>
      Object.fromEntries(fields.map((f) => [f.key, row[f.key] ?? ''])) as Record<
        BidReviewFieldKey,
        string
      >,
  );
  const [summary, setSummary] = useState(row.summary ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMessage(null), [row.id]);

  const missing = [
    ...(!recommendation ? ['kết luận của phòng'] : []),
    ...fields.filter((f) => !values[f.key]?.trim()).map((f) => f.label.toLowerCase()),
  ];

  async function send() {
    setMessage(null);
    setFailed(false);
    try {
      await submit.mutateAsync({
        reviewId: row.id,
        recommendation: recommendation!,
        summary: summary.trim() || null,
        ...Object.fromEntries(fields.map((f) => [f.key, values[f.key].trim() || null])),
      });
      setMessage('Đã gửi ý kiến. Người xin ý kiến đã được báo.');
    } catch (e) {
      setFailed(true);
      setMessage(toUserMessage(e, 'edit'));
    }
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setMessage(null);
    setFailed(false);
    try {
      const r = await upload.mutateAsync({ reviewId: row.id, files });
      setMessage(
        r.skipped.length > 0
          ? `Đã tải ${r.uploaded} tệp. Bỏ qua tệp lớn hơn 25 MB: ${r.skipped.join(', ')}.`
          : `Đã tải ${r.uploaded} tệp.`,
      );
    } catch (err) {
      setFailed(true);
      setMessage(toUserMessage(err, 'edit'));
    }
  }

  if (!row.can_respond) {
    return (
      <section className="rounded-card bg-surface p-4">
        <h2 className="mb-2 text-md font-semibold">
          Ý kiến của phòng {BID_REVIEW_DEPARTMENT_LABELS[row.department]}
        </h2>
        {row.recommendation ? (
          <>
            <p className="font-semibold">{BID_REVIEW_RECOMMENDATION_LABELS[row.recommendation]}</p>
            <dl className="mt-1 space-y-1.5">
              {fields.map((f) => (
                <Item key={f.key} label={f.label} value={row[f.key] ?? EM_DASH} />
              ))}
              {row.summary && <Item label="Ghi chú" value={row.summary} />}
            </dl>
          </>
        ) : (
          <p className="text-fg-subtle">Phòng chưa góp ý.</p>
        )}
        <p className="mt-3 text-sm text-fg-subtle">
          Chỉ người của phòng được hỏi trả lời được, và chỉ khi gói thầu chưa có kết quả.
        </p>
        {row.file_count > 0 && <ReviewFiles reviewId={row.id} />}
      </section>
    );
  }

  return (
    <section aria-labelledby="review-form-title" className="rounded-card bg-surface p-4">
      <h2 id="review-form-title" className="mb-3 text-md font-semibold">
        Ý kiến của phòng {BID_REVIEW_DEPARTMENT_LABELS[row.department]}
      </h2>
      <div className="space-y-3">
        {fields.map((f) => (
          <label key={f.key} className="block space-y-1.5">
            <span className="block font-medium">{f.label}</span>
            <textarea
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              rows={4}
              maxLength={4000}
              placeholder={f.placeholder}
              className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
            />
          </label>
        ))}

        {row.department === 'MH' && (
          <div className="space-y-1.5">
            <span className="block font-medium">Báo giá nhà cung cấp đính kèm (tùy chọn)</span>
            {/* Ô chọn tệp gốc ẩn đi: trình duyệt tự ghi «No file chosen» theo ngôn ngữ máy (CLAUDE.md 4.1). */}
            <Button
              variant="secondary"
              size="sm"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? 'Đang tải lên…' : 'Chọn tệp báo giá'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={BID_REVIEW_FILE_ACCEPT}
              onChange={(e) => void onFiles(e)}
              className="hidden"
            />
            <ReviewFiles reviewId={row.id} />
          </div>
        )}

        <fieldset className="space-y-1.5">
          <legend className="font-medium">Kết luận của phòng</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kết luận">
            {BID_REVIEW_RECOMMENDATIONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={recommendation === r}
                onClick={() => setRecommendation(r)}
                className={cn(
                  'min-h-10 rounded-sm border px-3 py-1.5 text-xs font-semibold sm:min-h-0',
                  recommendation === r
                    ? 'border-transparent bg-brand-mint text-brand-mint-ink'
                    : 'border-border text-fg-subtle hover:text-fg',
                )}
              >
                {BID_REVIEW_RECOMMENDATION_LABELS[r]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1.5">
          <span className="block font-medium">Ghi chú thêm (tùy chọn)</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Điều kiện kèm theo, việc cần chuẩn bị."
            className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
          />
        </label>

        <div className="space-y-1.5">
          <Button
            variant="primary"
            disabled={missing.length > 0 || submit.isPending}
            onClick={() => void send()}
          >
            {row.status === 'da_gop_y' ? 'Cập nhật ý kiến' : 'Gửi ý kiến'}
          </Button>
          {missing.length > 0 && (
            <p className="text-sm text-fg-subtle">Còn thiếu: {missing.join(', ')}.</p>
          )}
          {message && (
            <p
              role={failed ? 'alert' : 'status'}
              className={cn('text-sm', failed ? 'text-status-overdue' : 'text-fg-subtle')}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
