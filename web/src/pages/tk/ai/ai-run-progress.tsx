/**
 * Một lượt chạy nền của nhánh AI, nhìn từ màn hình: ĐANG CHẠY / XONG / CHƯA ĐƯỢC, số tiền đã tiêu,
 * và ba nút — «Dừng lượt chạy» khi đang chạy, «Chạy lại» khi hỏng, «Tải báo cáo (.md)».
 *
 * Haan 07/10/2026: danh sách bước, câu lỗi của bộ xếp, bảng theo dõi lượt gọi, lời gọi, lý do từng
 * tầng «hiển thị lên cũng không có nhiều ý nghĩa» với người thiết kế — chỉ cần số tiền. Người phát
 * triển cần chúng thì tải báo cáo Markdown (`run-report.ts`): đủ bước, lỗi, mọi lượt gọi kèm nguyên
 * văn lời gọi, kết quả thô của lượt chạy.
 *
 * Đang chạy vẫn hiện «n/m bước» bên cạnh trạng thái: một lượt xếp mặt bằng mất vài phút, và một
 * vòng xoay không kèm con số làm người dùng tưởng treo rồi bấm lại — tức mua thêm lượt gọi.
 */

import { useState } from 'react';
import { AlertTriangle, Check, FileDown, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchAiCallPrompt,
  useAiModels,
  useCancelAiRun,
  type AiRunView,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { cn } from '@/lib/utils';
import { formatUsd, useRunCalls } from './ai-usage';
import { buildRunReport, reportFileName } from './run-report';
import { estimateLiveCost, type LiveProgress } from './live-cost';

export function AiRunProgress({
  projectId,
  run,
  purposePrefix,
  reportTitle,
  reportExtra,
  onRetry,
  retryDisabled,
  runningLabel = 'Đang chạy',
  doneLabel = 'Đã xong',
  failedLabel = 'Chưa hoàn tất',
  readOnly = false,
}: {
  projectId: string;
  run: AiRunView;
  /** Mục đích các lượt gọi của bước này trong nhật ký (`plan_house`, `facade`, `perspective_`). */
  purposePrefix: string;
  reportTitle: string;
  /** Phần riêng của bước cho báo cáo, đã là Markdown. */
  reportExtra?: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
  runningLabel?: string;
  doneLabel?: string;
  failedLabel?: string;
  /** Hồ sơ chỉ xem: không Dừng, không Chạy lại — báo cáo vẫn tải được. */
  readOnly?: boolean;
}): React.ReactElement {
  const steps = run.progress?.steps ?? [];
  const done = run.progress?.done ?? steps.filter((s) => s.status === 'done').length;
  const total = run.progress?.total ?? steps.length;
  const running = run.status === 'queued' || run.status === 'running';
  const failed = run.status === 'failed';
  const calls = useRunCalls(
    projectId,
    purposePrefix,
    run.createdAt,
    running ? null : run.updatedAt,
  );
  const cancel = useCancelAiRun();
  const models = useAiModels();
  // Đang chạy: ước tính từ dữ liệu trực tiếp của Worker (cập nhật mỗi lần hỏi tiến độ, ~2 giây).
  const live = (run.progress?.partial?.live ?? null) as (LiveProgress & { route?: string }) | null;
  const routeOption = live?.route
    ? [...(models.data?.text ?? []), ...(models.data?.image ?? [])].find(
        (o) => o.route === live.route,
      )
    : undefined;
  const liveCost = running ? estimateLiveCost(live, routeOption) : null;
  // Không bao giờ hiện thấp hơn số tiền thật đã ghi nhật ký.
  const runningCost = liveCost === null ? calls.cost : Math.max(liveCost, calls.cost ?? 0);
  const stopping = cancel.isPending || (cancel.data?.stopped ?? false);
  const [exporting, setExporting] = useState(false);
  // Hỏng ở phía NHÀ CUNG CẤP (hết tín dụng, sai khoá, rớt mạng): không lượt gọi nào trả được kết quả.
  // Câu lỗi ấy là việc người dùng phải làm, nên hiện ra — khác lỗi của bộ xếp, chỉ nằm trong báo cáo.
  const providerFailure =
    failed &&
    run.error !== null &&
    calls.rows.length > 0 &&
    calls.rows.every((call) => call.status === 'failed');
  const providerMessage = providerFailure ? run.error!.replace(/^[A-Za-z]+Error:\s*/, '') : null;
  const [exportError, setExportError] = useState<string | null>(null);

  const exportReport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const prompts = new Map<string, string | null>();
      // Tuần tự: một lượt chạy có thể tới vài chục lượt gọi, bắn song song cùng lúc là dồn Worker.
      for (const call of calls.rows)
        prompts.set(call.id, await fetchAiCallPrompt(projectId, call.id));
      const text = buildRunReport({
        title: reportTitle,
        projectId,
        run,
        calls: calls.rows,
        prompts,
        totalUsd: calls.cost,
        extra: reportExtra,
      });
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = reportFileName(run);
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(toUserMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section
      aria-label="Tiến độ"
      className={cn(
        'rounded-lg border p-3',
        failed ? 'border-tk-rd-line bg-tk-rd-bg' : 'border-tk-line bg-tk-panel',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">
          {failed ? (
            <AlertTriangle className="size-4 text-status-overdue" aria-hidden />
          ) : run.status === 'done' ? (
            <Check className="size-4 text-status-completed" aria-hidden />
          ) : (
            <Loader2 className="size-4 animate-spin text-status-progress" aria-hidden />
          )}
        </span>
        {/* Trạng thái luôn kèm CHỮ, không chỉ hình và màu (CGD 6.8). */}
        <span className="min-w-0 flex-1 font-medium" aria-live="polite">
          {failed ? failedLabel : run.status === 'done' ? doneLabel : runningLabel}
          {running && total > 0 && (
            <span className="font-normal text-fg-subtle"> · {`${done}/${total} bước`}</span>
          )}
        </span>
      </div>
      {providerMessage && <p className="mt-1 pl-6 text-status-overdue">{providerMessage}</p>}
      <p className="mt-1 pl-6 text-xs text-fg-subtle">
        Chi phí:{' '}
        <span className="font-medium text-fg">
          {running
            ? runningCost === null || (liveCost === null && calls.rows.length === 0)
              ? 'đang tính'
              : `≈ ${formatUsd(runningCost)}`
            : calls.rows.length === 0
              ? 'chưa có lượt gọi nào'
              : calls.cost === null
                ? 'có lượt chưa có giá'
                : `≈ ${formatUsd(calls.cost)}`}
        </span>
        {running && liveCost !== null && <span> · ước tính khi đang chạy</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
        {running && !readOnly && (
          <Button
            variant="secondary"
            onClick={() => void cancel.mutateAsync({ runId: run.id }).catch(() => undefined)}
            disabled={stopping}
          >
            <Square className="size-4" aria-hidden />
            {stopping ? 'Đang dừng…' : 'Dừng lượt chạy'}
          </Button>
        )}
        {failed && onRetry && (
          <Button variant="secondary" onClick={onRetry} disabled={retryDisabled}>
            Chạy lại
          </Button>
        )}
        <Button variant="subtle" onClick={() => void exportReport()} disabled={exporting}>
          <FileDown className="size-4" aria-hidden />
          {exporting ? 'Đang tạo báo cáo…' : 'Tải báo cáo (.md)'}
        </Button>
      </div>
      {cancel.isError && (
        <p className="mt-2 pl-6 text-status-overdue">{toUserMessage(cancel.error)}</p>
      )}
      {exportError && (
        <p className="mt-2 pl-6 text-status-overdue">Chưa tạo được báo cáo. {exportError}</p>
      )}
    </section>
  );
}
