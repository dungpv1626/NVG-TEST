/**
 * Panel điểm mặt đứng — «giống cách NVG vẽ đến đâu» (T63, 20/09/2026).
 *
 * Haan: «cần cải tiến để bản vẽ mặt đứng đạt được tối thiểu 80% so với bản vẽ từ hồ sơ thật của
 * NVG», và chọn cách chấm «Máy chấm + kỹ sư chấm lại». Con số ở đây là phép đo của câu ấy, và màn
 * hình phải nói ra năm điều cùng lúc — bỏ điều nào thì con số đọc thành thứ nó không phải:
 *
 *  · **Mẫu số là phần CHẤM ĐƯỢC**, không phải 100. «72 trên 90» khác hẳn «72/100».
 *  · **n của từng tiêu chí**, kèm nhãn [ĐO] / [CHUNG]. Sáu ngôi nhà không phải một chuẩn nghề.
 *  · **Ai quyết**: tiêu chí `doAi: false` đến từ mặt bằng, phiếu yêu cầu hoặc quy ước cấu tạo —
 *    mô hình có gọi lại bao nhiêu lượt cũng không sửa được, và người đọc phải biết điều đó trước
 *    khi bấm «Dựng lại».
 *  · **Tiêu chí chưa chấm được kèm LÝ DO**, không hiện 0 (CLAUDE.md 5.2).
 *  · **Máy chấm và người chấm là HAI con số**, hiện cạnh nhau, không trộn. Người đè lên máy thì
 *    phải thấy được đè ở tiêu chí nào — một bảng điểm đã sửa mà trông y như điểm máy là chỗ không
 *    ai kiểm lại được nữa.
 *
 * Điểm KHÔNG gác cổng: dưới ngưỡng vẫn lưu, vẫn tải được tờ vẽ và DXF. Và chấm lại KHÔNG phải phê
 * duyệt — kết quả AI vẫn là nháp tới khi duyệt qua đúng luồng (PRD 2.3).
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatDateTime, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useSaveFacadeReview,
  type AiFacadeReviewView,
  type AiFacadeScore,
} from '@/hooks/use-ai-design';
import { Chip, Panel } from '../tk-ui';

/** Điểm kỹ sư cho một tiêu chí. `''` = để nguyên điểm máy — KHÔNG phải chấm 0. */
const CHOICES = [
  { value: '', label: 'Theo máy' },
  { value: '1', label: 'Đạt' },
  { value: '0.5', label: 'Đạt một phần' },
  { value: '0', label: 'Chưa đạt' },
  { value: 'null', label: 'Không chấm được' },
] as const;

type Draft = Record<string, { score: string; note: string }>;

function draftOf(review: AiFacadeReviewView | null | undefined): Draft {
  const out: Draft = {};
  for (const row of review?.criteria ?? []) {
    out[row.code] = {
      score: row.score === null ? 'null' : String(row.score),
      note: row.note ?? '',
    };
  }
  return out;
}

export function FacadeScorePanel({
  score,
  review,
  projectId,
  artifactId,
  readOnly,
}: {
  score: AiFacadeScore;
  review: AiFacadeReviewView | null | undefined;
  projectId: string;
  artifactId: string;
  readOnly: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(review));
  const [note, setNote] = useState(review?.note ?? '');
  const save = useSaveFacadeReview();

  // Bản chấm đến sau (hoặc đổi khi mở bản mặt đứng khác) thì bảng nhập phải theo. Lấy `artifactId`
  // vào phụ thuộc: cùng một panel dùng lại cho bản vẽ khác là bảng cũ đứng lại trên màn hình.
  useEffect(() => {
    setDraft(draftOf(review));
    setNote(review?.note ?? '');
    setEditing(false);
  }, [review, artifactId]);

  // Bảng điểm đang hiện: của kỹ sư nếu đã chấm, của máy nếu chưa.
  const shown = review?.score ?? score;
  const reached =
    shown.percent !== null && shown.acceptPercent !== null && shown.percent >= shown.acceptPercent;
  const changed = useMemo(() => new Set(review?.score.changed ?? []), [review]);
  const reviewed = useMemo(() => new Set(review?.score.reviewed ?? []), [review]);

  const submit = (): void => {
    const criteria = Object.entries(draft)
      .filter(([, row]) => row.score !== '')
      .map(([code, row]) => ({
        code,
        score: row.score === 'null' ? null : Number(row.score),
        note: row.note.trim() || null,
      }));
    save.mutate(
      { projectId, artifactId, review: { criteria, note: note.trim() || null } },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <Panel
      title="Giống cách NVG vẽ đến đâu"
      aside={
        shown.percent === null ? (
          <Chip tone="mute">Chưa chấm được</Chip>
        ) : (
          <Chip tone={reached ? 'gr' : 'am'}>
            {shown.percent}%{shown.acceptPercent !== null && ` · ngưỡng ${shown.acceptPercent}%`}
          </Chip>
        )
      }
    >
      <p>
        <b>
          {formatNumber(shown.points, 1)} trên {formatNumber(shown.scoredWeight, 1)} phần trọng số
          chấm được
        </b>{' '}
        — không phải «{formatNumber(shown.points, 1)}/100». Phần chưa chấm được không bị tính là 0.
      </p>
      <p className="mt-2 text-fg-subtle">
        Thước đo dựng từ {shown.coSoDuLieu}. Đây là THÓI QUEN VẼ đo được của phòng thiết kế, không
        phải chuẩn nghề — điểm thấp không chặn gì, nó chỉ chỉ chỗ lệch.
      </p>

      {review && (
        <p className="mt-2">
          <b>Kỹ sư đã chấm lại</b> {formatDateTime(review.reviewedAt)}
          {review.machinePercent !== null && ` · máy chấm ${review.machinePercent}%`}
          {changed.size > 0
            ? ` · sửa ${changed.size} tiêu chí: ${[...changed].join(', ')}`
            : ' · giữ nguyên mọi tiêu chí của máy'}
          . Đây là nhận xét chuyên môn, không phải phê duyệt.
        </p>
      )}
      {review?.score.staleRuler && (
        <p className="mt-1 text-tk-am-fg">
          Bảng chấm này dựng trên bản thước cũ, không đem so thẳng với điểm máy hiện tại được — chấm
          lại để hai con số nói về cùng một cái thước.
        </p>
      )}
      {review?.note && <p className="mt-1 whitespace-pre-line">«{review.note}»</p>}

      <ul className="mt-3 flex flex-wrap gap-2">
        {shown.groups.map((group) => (
          <li
            key={group.code}
            className="rounded-md border border-tk-line bg-tk-card px-3 py-2 text-left"
          >
            <span className="block font-medium">{group.vi}</span>
            <span className="block text-xs text-tk-t3">
              {group.scoredWeight > 0
                ? `${formatNumber(group.points, 1)} / ${formatNumber(group.scoredWeight, 1)}`
                : 'chưa chấm được'}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 text-xs font-semibold text-tk-acc"
        >
          {open ? 'Thu gọn từng tiêu chí' : 'Xem từng tiêu chí'}
          <ChevronDown className={cn('size-4', open && 'rotate-180')} aria-hidden />
        </button>
        {!readOnly && !editing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(true);
              setEditing(true);
            }}
          >
            {review ? 'Chấm lại' : 'Kỹ sư chấm lại'}
          </Button>
        )}
      </div>

      {open && (
        <ul className="mt-3 space-y-2">
          {shown.criteria.map((c) => {
            const machine = score.criteria.find((m) => m.code === c.code);
            const row = draft[c.code] ?? { score: '', note: '' };
            return (
              <li key={c.code} className="rounded-md border border-tk-line bg-tk-card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {c.code}. {c.vi}
                  </span>
                  <span className="text-xs text-tk-t3">
                    {c.label} · n = {c.n}
                    {!c.doAi && ' · chương trình quyết'}
                    {reviewed.has(c.code) && ' · kỹ sư chấm'}
                  </span>
                </div>
                {c.score === null ? (
                  <p className="mt-1 text-fg-subtle">Chưa chấm được — {c.why}</p>
                ) : (
                  <p className="mt-1 text-fg-subtle">
                    {c.score >= 1 ? 'Đạt' : c.score > 0 ? 'Đạt một phần' : 'Chưa đạt'} ·{' '}
                    {formatNumber(c.weight * c.score, 1)} / {formatNumber(c.weight, 1)} điểm
                    {c.value !== null && ` · đo được ${formatNumber(c.value, 1)}`}
                  </p>
                )}
                {/* Chấm khác máy thì phải đọc được CẢ HAI: một bảng điểm đã sửa mà giấu số cũ là
                    chỗ không ai kiểm lại được nữa. */}
                {changed.has(c.code) && machine && (
                  <p className="mt-1 text-xs text-tk-t3">
                    Máy chấm:{' '}
                    {machine.score === null
                      ? 'chưa chấm được'
                      : machine.score >= 1
                        ? 'Đạt'
                        : machine.score > 0
                          ? 'Đạt một phần'
                          : 'Chưa đạt'}
                  </p>
                )}
                {c.giaiThich && <p className="mt-1 text-xs text-tk-t3">{c.giaiThich}</p>}

                {editing &&
                  (c.weight > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr]">
                      <label className="flex items-center gap-2">
                        <span className="text-fg-subtle">Kỹ sư chấm</span>
                        <select
                          className="min-h-10 rounded border border-border bg-surface px-2"
                          value={row.score}
                          onChange={(event) =>
                            setDraft((d) => ({
                              ...d,
                              [c.code]: { ...row, score: event.target.value },
                            }))
                          }
                        >
                          {CHOICES.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                              {choice.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.score !== '' && (
                        <label className="flex items-center gap-2">
                          <span className="sr-only">Lý do chấm khác máy — {c.code}</span>
                          <input
                            className="min-h-10 w-full rounded border border-border bg-surface px-2"
                            placeholder="Vì sao chấm như vậy"
                            maxLength={300}
                            value={row.note}
                            onChange={(event) =>
                              setDraft((d) => ({
                                ...d,
                                [c.code]: { ...row, note: event.target.value },
                              }))
                            }
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    /* Trọng số 0 = tiêu chí không áp dụng cho ngôi nhà này. Mời chấm một ô không
                       dịch chuyển con số nào là một lời nói dối im lặng. */
                    <p className="mt-2 text-xs text-tk-t3">
                      Tiêu chí này không áp dụng cho ngôi nhà này, nên không có phần trọng số nào để
                      chấm.
                    </p>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="block text-fg-subtle">Nhận xét chung</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded border border-border bg-surface p-2"
              maxLength={1500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {save.isError && <p className="text-status-overdue">{toUserMessage(save.error)}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Đang lưu' : 'Lưu bảng chấm'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(draftOf(review));
                setNote(review?.note ?? '');
                setEditing(false);
              }}
              disabled={save.isPending}
            >
              Huỷ
            </Button>
          </div>
          <p className="text-xs text-tk-t3">
            Tiêu chí để «Theo máy» thì giữ nguyên điểm máy — không phải chấm 0. Lưu xong là một bản
            chấm mới; bản cũ vẫn còn trong hồ sơ.
          </p>
        </div>
      )}
    </Panel>
  );
}
