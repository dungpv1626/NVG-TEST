/**
 * So phương án mặt bằng CẠNH NHAU (Đợt 5B, vấn đề 7: «so sánh được phương án»).
 *
 * Mỗi cột một phương án: tờ vector của cùng một tầng (qua `<img>`, xem ghi chú `ai-plan-step.tsx`),
 * điểm và ngưỡng, ba lý do trừ điểm lớn nhất, và hai lối: mở chi tiết / dùng để dựng mặt đứng. Chỉ đọc
 * artifact đã có — không gọi mô hình nào.
 */

import { formatDateTime, formatNumber } from '@nvg/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/states';
import {
  useAiPlanReview,
  useAiPlanSheet,
  type AiPlanReview,
  type AiRulePackChoice,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip } from '../tk-ui';
import { roomName, topDeductions } from './plan-deductions';

/** Điểm phần trăm và đạt ngưỡng — cùng cách tính với chip đầu tờ vẽ. */
export function scoreSummary(review: AiPlanReview): {
  percent: number | null;
  threshold: number | null;
  passed: boolean | null;
} {
  const percent =
    review.score && review.score.scoredWeight > 0
      ? (review.score.points / review.score.scoredWeight) * 100
      : null;
  const threshold = review.acceptPercent ?? null;
  const passed = percent !== null && threshold !== null ? percent >= threshold : null;
  return { percent, threshold, passed };
}

export function ScoreChip({ review }: { review: AiPlanReview }): React.ReactElement | null {
  const { percent, threshold, passed } = scoreSummary(review);
  if (percent === null) return <Chip tone="mute">Chưa có điểm</Chip>;
  return (
    <Chip tone={passed === false ? 'am' : passed ? 'gr' : 'mute'}>
      Điểm {formatNumber(percent, 1)}%
      {threshold !== null &&
        (passed
          ? ` · Đạt ngưỡng ${formatNumber(threshold)}`
          : ` · Dưới ngưỡng ${formatNumber(threshold)}`)}
    </Chip>
  );
}

/** Ba lý do trừ điểm lớn nhất — dùng ở cả tờ chi tiết lẫn cột so sánh. */
export function DeductionList({ review }: { review: AiPlanReview }): React.ReactElement {
  if (!review.score) {
    return (
      <p className="text-fg-subtle">
        Phương án xếp trước khi có thước chấm — không có điểm để nêu lý do trừ.
      </p>
    );
  }
  const items = topDeductions(review.score, 3);
  if (items.length === 0) {
    return <p className="text-fg-subtle">Không tiêu chí nào bị trừ điểm.</p>;
  }
  return (
    <ol className="space-y-1.5">
      {items.map((item, index) => (
        <li key={item.code} className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-tk-chip-mute text-xs font-semibold text-tk-t2"
          >
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{item.label}</span>{' '}
            <span className="whitespace-nowrap text-status-pending">
              −{formatNumber(item.lost, 1)} điểm
            </span>
            {item.refs.length > 0 && (
              <span className="block text-fg-subtle">
                Chỗ bị trừ: {item.refs.map((r) => roomName(r, review.roomLabels)).join(', ')}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AiPlanCompare({
  projectId,
  entries,
  names,
  packs,
  planHeadArtifactId,
  readOnly,
  choosing,
  onOpen,
  onChoose,
  levelCount,
}: {
  projectId: string;
  /** Số tầng (không tính mái) để chọn — lấy theo phương án đang mở. */
  levelCount: number;
  entries: Array<{ artifactId: string; createdAt: string }>;
  names: Map<string, string>;
  packs: AiRulePackChoice;
  planHeadArtifactId: string | null;
  readOnly: boolean;
  choosing: boolean;
  onOpen: (artifactId: string) => void;
  onChoose: (artifactId: string) => void;
}): React.ReactElement {
  const [level, setLevel] = useState('1');
  return (
    <section className="space-y-3" aria-label="So sánh phương án">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-fg-subtle">
          {entries.length} phương án đặt cạnh nhau, cùng một tầng. Chọn tầng để so.
        </p>
        <SegmentedControl
          options={Array.from({ length: Math.max(1, levelCount) }, (_, i) => String(i + 1))}
          value={level}
          onChange={setLevel}
          getLabel={(value) => `Tầng ${value}`}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <CompareCard
            key={entry.artifactId}
            projectId={projectId}
            artifactId={entry.artifactId}
            createdAt={entry.createdAt}
            name={names.get(entry.artifactId) ?? 'Phương án'}
            packs={packs}
            level={Number(level)}
            isHead={entry.artifactId === planHeadArtifactId}
            readOnly={readOnly}
            choosing={choosing}
            onOpen={() => onOpen(entry.artifactId)}
            onChoose={() => onChoose(entry.artifactId)}
          />
        ))}
      </div>
    </section>
  );
}

function CompareCard({
  projectId,
  artifactId,
  createdAt,
  name,
  packs,
  level,
  isHead,
  readOnly,
  choosing,
  onOpen,
  onChoose,
}: {
  projectId: string;
  artifactId: string;
  createdAt: string;
  name: string;
  packs: AiRulePackChoice;
  level: number;
  isHead: boolean;
  readOnly: boolean;
  choosing: boolean;
  onOpen: () => void;
  onChoose: () => void;
}): React.ReactElement {
  const review = useAiPlanReview(projectId, artifactId, packs);
  const levels = review.data?.levels.filter((l) => !l.roof) ?? [];
  // Phương án ít tầng hơn thì hiện tầng cao nhất nó có, và nói ra.
  const shown = levels.some((l) => l.level === level)
    ? level
    : (levels[levels.length - 1]?.level ?? 1);
  const sheet = useAiPlanSheet(projectId, artifactId, shown);
  const levelName = levels.find((l) => l.level === shown)?.name ?? `Tầng ${shown}`;
  const area = review.data?.levels
    .filter((l) => !l.roof)
    .reduce((sum, l) => sum + (l.roomList ?? []).reduce((s, r) => s + r.area_m2, 0), 0);

  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-tk-line bg-tk-panel">
      <header className="flex flex-wrap items-center gap-2 border-b border-tk-line p-3">
        <h3 className="mr-auto font-semibold">{name}</h3>
        {isHead && <Chip tone="gr">Dùng cho mặt đứng</Chip>}
        {review.data && <ScoreChip review={review.data} />}
      </header>
      <div className="p-3">
        {sheet.loading && <Skeleton className="aspect-[4/3] w-full" />}
        {sheet.error && <p className="text-status-overdue">{sheet.error}</p>}
        {sheet.url && (
          <button
            type="button"
            onClick={onOpen}
            className="block w-full cursor-zoom-in"
            aria-label={`Mở ${name}`}
          >
            <img
              src={sheet.url}
              alt={`Tờ mặt bằng ${levelName} của ${name}`}
              className="aspect-[4/3] w-full rounded-md border border-tk-line bg-white object-contain"
            />
          </button>
        )}
        <p className="mt-1 text-xs text-tk-t3">
          {levelName}
          {shown !== level && ` — phương án không có tầng ${level}`} · {formatDateTime(createdAt)}
        </p>
      </div>
      <div className="flex-1 space-y-2 px-3 pb-3">
        {review.isLoading && <Skeleton className="h-20 w-full" />}
        {review.isError && <p className="text-status-overdue">{toUserMessage(review.error)}</p>}
        {review.data && (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-fg-subtle">Số tầng</dt>
              <dd>{levels.length}</dd>
              <dt className="text-fg-subtle">Số phòng</dt>
              <dd>{levels.reduce((sum, l) => sum + l.rooms, 0)}</dd>
              <dt className="text-fg-subtle">Tổng diện tích phòng</dt>
              <dd>{area ? `${formatNumber(area, 1)} m²` : 'Chưa đủ dữ liệu'}</dd>
              <dt className="text-fg-subtle">Lỗi chặn</dt>
              <dd>
                {review.data.blocking.length === 0 ? 'Không có' : review.data.blocking.length}
              </dd>
            </dl>
            <p className="pt-1 font-medium">Ba lý do trừ điểm lớn nhất</p>
            <DeductionList review={review.data} />
          </>
        )}
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-tk-line p-3">
        <Button variant="secondary" onClick={onOpen}>
          Xem chi tiết
        </Button>
        {!readOnly && !isHead && (
          <Button variant="secondary" onClick={onChoose} disabled={choosing}>
            Dùng để dựng mặt đứng
          </Button>
        )}
      </footer>
    </article>
  );
}
