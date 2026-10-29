/**
 * «Ý kiến các phòng» trên gói thầu — G6 (0247). Phiếu khảo sát Ban Giám đốc dòng 743: Cung ứng lấy
 * báo giá nhà cung cấp, Thi công góp ý biện pháp và năng lực, Kế toán – Tài chính đánh giá dòng tiền,
 * bảo lãnh, điều kiện thanh toán.
 *
 * `BidReviewsList` chỉ đọc — dùng cả ở trang gói thầu lẫn trong Hộp thư Phê duyệt (duyệt tham gia,
 * duyệt giá dự toán). `BidReviewsPanel` thêm phần «Xin ý kiến» cho người chịu trách nhiệm.
 */

import { useState } from 'react';
import {
  BID_REVIEW_DEPARTMENT_LABELS,
  BID_REVIEW_DEPARTMENTS,
  BID_REVIEW_FIELDS,
  BID_REVIEW_RECOMMENDATION_LABELS,
  formatDateTime,
  formatWaiting,
  type BidReviewDepartment,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import {
  bidReviewFileUrl,
  useBidReviewFiles,
  useBidReviews,
  useRequestBidReviews,
  type BidReviewRow,
} from '@/hooks/use-bid-participation';
import { toUserMessage } from '@/hooks/use-error-message';

export function BidReviewsList({
  projectId,
  showMissing = true,
}: {
  projectId: string;
  /** Hiện cả phòng chưa được xin ý kiến (trang gói thầu); hộp duyệt chỉ hiện phòng đã có. */
  showMissing?: boolean;
}) {
  const { data, isLoading, error } = useBidReviews({ projectId });
  if (isLoading) return <div className="h-16 animate-pulse rounded-sm bg-surface-sunken" />;
  if (error) return <p className="text-fg-subtle">Không tải được ý kiến các phòng.</p>;
  const rows = data ?? [];
  if (!showMissing && rows.length === 0) {
    return <p className="text-fg-subtle">Chưa xin ý kiến Cung ứng, Thi công, Kế toán.</p>;
  }
  return (
    <ul className="space-y-3">
      {BID_REVIEW_DEPARTMENTS.map((d) => {
        const row = rows.find((r) => r.department === d);
        if (!row) {
          return showMissing ? (
            <li key={d} className="rounded-field border border-border p-3">
              <p className="font-medium">{BID_REVIEW_DEPARTMENT_LABELS[d]}</p>
              <p className="text-sm text-fg-subtle">Chưa xin ý kiến.</p>
            </li>
          ) : null;
        }
        return <ReviewItem key={d} row={row} />;
      })}
    </ul>
  );
}

function ReviewItem({ row }: { row: BidReviewRow }) {
  return (
    <li className="rounded-field border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{BID_REVIEW_DEPARTMENT_LABELS[row.department]}</p>
        {row.status === 'cho_y_kien' ? (
          <p className="text-sm text-status-pending">
            Đang chờ: phòng {BID_REVIEW_DEPARTMENT_LABELS[row.department]} ·{' '}
            {formatWaiting(row.requested_at)}
          </p>
        ) : (
          <p className="text-sm text-fg-subtle">
            {row.responded_by_name ?? 'Không rõ'}
            {row.responded_at && ` · ${formatDateTime(row.responded_at)}`}
          </p>
        )}
      </div>
      {row.request_note && (
        <p className="mt-1 text-xs text-fg-subtle">Nội dung xin ý kiến: {row.request_note}</p>
      )}
      {row.recommendation && (
        <>
          <p className="mt-2 font-semibold">
            {BID_REVIEW_RECOMMENDATION_LABELS[row.recommendation]}
            {row.status === 'cho_y_kien' && (
              <span className="font-normal text-fg-subtle"> (ý kiến trước, đang xin lại)</span>
            )}
          </p>
          <dl className="mt-1 space-y-1.5">
            {BID_REVIEW_FIELDS[row.department].map((f) =>
              row[f.key] ? (
                <div key={f.key}>
                  <dt className="text-xs text-fg-subtle">{f.label}</dt>
                  <dd className="whitespace-pre-wrap">{row[f.key]}</dd>
                </div>
              ) : null,
            )}
            {row.summary && (
              <div>
                <dt className="text-xs text-fg-subtle">Ghi chú</dt>
                <dd className="whitespace-pre-wrap">{row.summary}</dd>
              </div>
            )}
          </dl>
        </>
      )}
      {row.file_count > 0 && <ReviewFiles reviewId={row.id} />}
    </li>
  );
}

export function ReviewFiles({ reviewId }: { reviewId: string }) {
  const { data } = useBidReviewFiles(reviewId);
  const [error, setError] = useState<string | null>(null);
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-xs text-fg-subtle">Tệp đính kèm</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {data.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className="text-sm font-medium text-brand hover:underline"
              onClick={async () => {
                setError(null);
                try {
                  window.open(await bidReviewFileUrl(f.file_path), '_blank', 'noopener');
                } catch (e) {
                  setError(toUserMessage(e));
                }
              }}
            >
              {f.file_name}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-status-overdue">{error}</p>}
    </div>
  );
}

export function BidReviewsPanel({
  projectId,
  canRequest,
}: {
  projectId: string;
  /** Người chịu trách nhiệm gói thầu (CSDL kiểm lại) và gói chưa kết thúc. */
  canRequest: boolean;
}) {
  const request = useRequestBidReviews();
  const [picked, setPicked] = useState<BidReviewDepartment[]>([]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    setMessage(null);
    try {
      const n = await request.mutateAsync({
        projectId,
        departments: picked,
        note: note.trim() || null,
      });
      setPicked([]);
      setNote('');
      setMessage(`Đã gửi yêu cầu ý kiến tới ${n} phòng.`);
    } catch (e) {
      setMessage(toUserMessage(e, 'edit'));
    }
  }

  return (
    <section aria-labelledby="bid-reviews-title" className="rounded-card bg-surface p-4">
      <h2 id="bid-reviews-title" className="text-md font-semibold">
        Ý kiến các phòng
      </h2>
      <p className="mb-3 text-sm text-fg-subtle">
        Cung ứng báo giá nhà cung cấp, Thi công góp ý biện pháp và năng lực, Kế toán – Tài chính
        đánh giá dòng tiền, bảo lãnh, điều kiện thanh toán. Ban Giám đốc đọc các ý kiến này khi
        quyết định tham gia và khi duyệt giá.
      </p>
      <BidReviewsList projectId={projectId} />

      {canRequest && (
        <fieldset className="mt-4 space-y-2 rounded-field border border-border p-3">
          <legend className="px-1 font-medium">Xin ý kiến</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {BID_REVIEW_DEPARTMENTS.map((d) => (
              <label key={d} className="flex min-h-10 items-center gap-2 sm:min-h-0">
                <input
                  type="checkbox"
                  checked={picked.includes(d)}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, d] : p.filter((x) => x !== d)))
                  }
                />
                {BID_REVIEW_DEPARTMENT_LABELS[d]}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            aria-label="Nội dung cần ý kiến"
            placeholder="Nội dung cần ý kiến, hạn mong muốn (tùy chọn)"
            className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={picked.length === 0 || request.isPending}
              onClick={() => void send()}
            >
              Xin ý kiến
            </Button>
            {picked.length === 0 && (
              <span className="text-sm text-fg-subtle">Chọn ít nhất một phòng.</span>
            )}
            {message && (
              <span role="status" className="text-sm text-fg-subtle">
                {message}
              </span>
            )}
          </div>
        </fieldset>
      )}
    </section>
  );
}
