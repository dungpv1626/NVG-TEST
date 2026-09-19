/**
 * Tiến độ một lượt chạy nền của nhánh AI.
 *
 * Vì sao hiện TỪNG BƯỚC chứ không một thanh chờ: một lượt xếp mặt bằng mất 2–9 phút và tiêu
 * tiền thật. Một vòng xoay không nói được lượt gọi nào đang chạy, phương án nào đã xong, và
 * phương án nào vừa hỏng — nên người dùng chỉ còn cách bấm lại, mà bấm lại là mua thêm một
 * loạt lượt gọi.
 *
 * Dòng hỏng hiện NGUYÊN câu lỗi của bước đó. Gộp về một câu «có lỗi xảy ra» thì người vận hành
 * không biết là hết hạn mức, rớt mạng, hay mô hình trả về cấu trúc sai — ba chuyện xử lý khác nhau.
 */

import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AiRunStep, AiRunView } from '@/hooks/use-ai-design';
import { Chip, Panel } from '../tk-ui';

const STATUS_LABEL: Record<AiRunStep['status'], string> = {
  pending: 'Chờ',
  running: 'Đang chạy',
  done: 'Xong',
  failed: 'Hỏng',
};

/** Thời gian một bước đã chạy, làm tròn tới giây — con số người dùng dùng để đoán còn bao lâu. */
function elapsed(step: AiRunStep): string | null {
  if (!step.startedAt) return null;
  const from = new Date(step.startedAt).getTime();
  const to = step.endedAt ? new Date(step.endedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (!Number.isFinite(seconds)) return null;
  return seconds >= 60
    ? `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`
    : `${seconds} giây`;
}

export function AiRunProgress({
  run,
  onRetry,
  retryDisabled,
}: {
  run: AiRunView;
  onRetry?: () => void;
  retryDisabled?: boolean;
}): React.ReactElement {
  const steps = run.progress?.steps ?? [];
  const done = run.progress?.done ?? steps.filter((s) => s.status === 'done').length;
  const total = run.progress?.total ?? steps.length;
  const finished = run.status === 'done' || run.status === 'failed';

  return (
    <Panel
      title="Tiến độ"
      aside={
        run.status === 'failed' ? (
          <Chip tone="rd">Hỏng</Chip>
        ) : run.status === 'done' ? (
          <Chip tone="gr">Xong</Chip>
        ) : (
          <Chip tone="bl">{total ? `${done}/${total} bước` : 'Đang chạy'}</Chip>
        )
      }
    >
      {steps.length === 0 ? (
        <p className="text-fg-subtle" aria-live="polite">
          Đã nhận việc, đang chờ luồng chạy nền nhận lượt này.
        </p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step) => {
            const time = elapsed(step);
            return (
              <li key={step.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">
                  {step.status === 'done' ? (
                    <Check className="size-4 text-status-done" aria-hidden />
                  ) : step.status === 'failed' ? (
                    <AlertTriangle className="size-4 text-status-overdue" aria-hidden />
                  ) : step.status === 'running' ? (
                    <Loader2 className="size-4 animate-spin text-status-progress" aria-hidden />
                  ) : (
                    <span className="block size-4 rounded-full border border-tk-line" aria-hidden />
                  )}
                </span>
                <span>
                  {/* Trạng thái luôn kèm CHỮ, không chỉ hình và màu (CGD 6.8). */}
                  {step.label}
                  <span className="text-fg-subtle">
                    {' — '}
                    {STATUS_LABEL[step.status]}
                    {time ? ` · ${time}` : ''}
                  </span>
                  {step.error && <span className="block text-status-overdue">{step.error}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {run.status === 'failed' && run.error && (
        <p className="mt-3 text-status-overdue">{run.error}</p>
      )}
      {finished && onRetry && (
        <div className="mt-3">
          <Button variant="secondary" onClick={onRetry} disabled={retryDisabled}>
            Chạy lại
          </Button>
        </div>
      )}
    </Panel>
  );
}
