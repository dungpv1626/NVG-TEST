/**
 * Theo dõi TRỰC TIẾP một lượt gọi mô hình đang chạy — hỏi máy chủ mỗi 2 giây, có nút «Dừng».
 *
 * Haan (13/09/2026): «cập nhật realtime lượng token tiêu thụ 2 s / 1 lần để tôi theo dõi» và
 * «thêm nút stop để tôi stop nếu token vượt xa quá».
 *
 * ⚠️ Nói thật về con số: nhà cung cấp KHÔNG báo số token giữa chừng, và OpenAI giấu hẳn phần
 * nghĩ. Trong lúc chạy chỉ biết thời gian đã chờ và số KÝ TỰ trả lời đã về (đổi ra token là ước
 * tính). Số token và tiền CHÍNH XÁC hiện ngay khi từng lượt xong.
 */

import { useEffect, useState } from 'react';
import { formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import {
  useAiRun,
  useCancelAiRun,
  useDownloadAiCallPrompt,
  type AiCallUsage,
  type ReasoningEffort,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip, Panel } from '../tk-ui';
import { effortLabel } from './ai-model-picker';
import { AiUsageLine, costSentence, formatUsd } from './ai-usage';

/** Phần theo dõi máy chủ ghi — khớp `LiveProgram` ở `workers/src/design/ai/routes.ts`. */
export interface LiveProgram {
  model: string;
  route: string;
  effort: ReasoningEffort | null;
  startedAt: string;
  elapsedMs: number;
  current: {
    round: number;
    phase: 'thinking' | 'writing';
    outputChars: number;
    thinkingChars?: number | null;
    startedAt: string;
  } | null;
  rounds: LiveRound[];
}

export interface LiveRound {
  round: number;
  outcome: 'accepted' | 'rejected';
  issues: string[];
  usage?: AiCallUsage;
}

/** Ký tự → token, CHỈ để ước tính khi đang chạy. JSON tiếng Việt rơi vào khoảng 3–4 ký tự/token. */
const CHARS_PER_TOKEN = 3.5;

function seconds(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} phút ${s} giây` : `${s} giây`;
}

/** Đồng hồ chạy ở trình duyệt giữa hai lần hỏi máy chủ — để số giây không nhảy cóc 2 giây một. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function AiLiveCall({
  runId,
  waiting,
}: {
  runId: string;
  /** Lời gọi chính còn đang chờ ở trình duyệt. */
  waiting: boolean;
}): React.ReactElement {
  const run = useAiRun(runId, 2000);
  const cancel = useCancelAiRun();
  const live = (run.data?.progress?.partial as { live?: LiveProgram } | undefined)?.live ?? null;
  const running = waiting && run.data?.status !== 'done' && run.data?.status !== 'failed';
  const now = useNow(running);

  const elapsed = live ? now - Date.parse(live.startedAt) : 0;
  const finished = live?.rounds ?? [];
  const exactIn = finished.reduce((a, r) => a + (r.usage?.inputTokens ?? 0), 0);
  const exactOut = finished.reduce((a, r) => a + (r.usage?.outputTokens ?? 0), 0);
  const cost = finished.reduce((a, r) => a + (r.usage?.costUsd ?? 0), 0);
  const listCost = finished.reduce((a, r) => a + (r.usage?.listCostUsd ?? 0), 0);
  const billed = finished.some((r) => r.usage?.billed !== false);
  const stopping = cancel.isPending || (cancel.data?.stopped ?? false);

  return (
    <Panel
      title="Theo dõi lượt gọi AI"
      aside={
        running ? (
          <Chip tone="bl">Đang chạy · cập nhật mỗi 2 giây</Chip>
        ) : run.data?.status === 'failed' ? (
          <Chip tone="rd">Đã dừng</Chip>
        ) : (
          <Chip tone="gr">Xong</Chip>
        )
      }
    >
      {!live ? (
        <p className="text-fg-subtle" aria-live="polite">
          {running ? 'Đang mở lượt gọi…' : 'Không có số liệu theo dõi cho lượt này.'}
        </p>
      ) : (
        <div className="space-y-3" aria-live="polite">
          <p>
            <b>{live.model}</b> · mức suy nghĩ {effortLabel(live.effort)} · đã chờ{' '}
            <b>{seconds(running ? elapsed : live.elapsedMs)}</b>
          </p>

          {live.current && running && (
            <div className="rounded border border-border bg-surface-sunken p-3">
              <p className="font-medium">
                Lượt {live.current.round}
                {live.current.round > 1 ? ' (lượt sửa)' : ''} ·{' '}
                {seconds(now - Date.parse(live.current.startedAt))}
              </p>
              {live.current.phase === 'thinking' ? (
                <p className="text-fg-subtle">
                  Mô hình đang suy nghĩ
                  {live.current.thinkingChars
                    ? ` — đã nhận ${formatNumber(live.current.thinkingChars, 0)} ký tự tóm tắt suy nghĩ ≈ ${formatNumber(Math.round(live.current.thinkingChars / CHARS_PER_TOKEN), 0)} token (ước tính)`
                    : ' — chưa có chữ trả lời nào về'}
                  . Nhà cung cấp không báo số token giữa chừng; số chính xác hiện khi lượt này xong.
                </p>
              ) : (
                <p>
                  Đang viết câu trả lời: đã nhận {formatNumber(live.current.outputChars, 0)} ký tự ≈{' '}
                  <b>{formatNumber(Math.round(live.current.outputChars / CHARS_PER_TOKEN), 0)}</b>{' '}
                  token (ước tính, chưa gồm phần nghĩ).
                </p>
              )}
            </div>
          )}

          {finished.map((round) => (
            <div key={round.round} className="rounded border border-border p-3">
              <p className="font-medium">
                Lượt {round.round} —{' '}
                {round.outcome === 'accepted' ? (
                  <span className="text-status-completed">qua bộ kiểm</span>
                ) : (
                  <span className="text-status-overdue">bị bộ kiểm bác</span>
                )}
              </p>
              {round.usage && (
                <AiUsageLine usage={round.usage} className="text-xs text-fg-subtle" />
              )}
              {round.issues.length > 0 && (
                <>
                  <p className="mt-1 text-xs font-medium">Lý do bị bác ({round.issues.length}):</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {round.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}

          {finished.length > 0 && (
            <p className="text-xs text-fg-subtle">
              Cộng các lượt đã xong: {formatNumber(exactIn, 0)} token vào ·{' '}
              {formatNumber(exactOut, 0)} token ra · chi phí {costSentence(cost, listCost, billed)}
            </p>
          )}
        </div>
      )}

      {running && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void cancel.mutateAsync({ runId }).catch(() => undefined)}
            disabled={stopping}
          >
            {stopping ? 'Đang dừng…' : 'Dừng lượt gọi'}
          </Button>
          <p className="text-xs text-fg-subtle">
            Dừng thì huỷ lời gọi tới nhà cung cấp trong khoảng 2 giây. Phần token đã sinh trước lúc
            dừng vẫn có thể bị tính tiền.
          </p>
        </div>
      )}
      {cancel.isError && <p className="mt-2 text-status-overdue">{toUserMessage(cancel.error)}</p>}
      {run.data?.status === 'failed' && run.data.error && !running && (
        <p className="mt-2 text-fg-subtle">{run.data.error}</p>
      )}
    </Panel>
  );
}

// ── Bước xếp mặt bằng: nhiều lượt gọi song song trong một lượt chạy nền (13/09/2026) ─────────

/** Khớp `LivePlan` ở `workers/src/design/ai/live-plan.ts`. */
export interface LivePlan {
  model: string;
  route: string;
  effort: ReasoningEffort | null;
  startedAt: string;
  active: {
    key: string;
    label: string;
    startedAt: string;
    phase: 'thinking' | 'writing';
    outputChars: number;
    thinkingChars: number | null;
  }[];
  done: {
    key: string;
    label: string;
    callId: string | null;
    status: 'ok' | 'rejected' | 'failed';
    errorCode: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number;
    costUsd: number | null;
  }[];
}

const DONE_LABEL: Record<LivePlan['done'][number]['status'], string> = {
  ok: 'trả về đúng hợp đồng',
  rejected: 'trả về sai hợp đồng',
  failed: 'lỗi khi gọi',
};

export function AiPlanLive({
  projectId,
  run,
}: {
  projectId: string;
  run: { id: string; status: string; progress?: { partial?: Record<string, unknown> } | null };
}): React.ReactElement | null {
  const cancel = useCancelAiRun();
  const download = useDownloadAiCallPrompt();
  const live = (run.progress?.partial?.live as LivePlan | undefined) ?? null;
  const running = run.status === 'queued' || run.status === 'running';
  const now = useNow(running);
  if (!live && !running) return null;

  const done = live?.done ?? [];
  const totalIn = done.reduce((a, d) => a + (d.inputTokens ?? 0), 0);
  const totalOut = done.reduce((a, d) => a + (d.outputTokens ?? 0), 0);
  const known = done.filter((d) => d.costUsd !== null);
  const totalCost = known.reduce((a, d) => a + (d.costUsd ?? 0), 0);
  const stopping = cancel.isPending || (cancel.data?.stopped ?? false);
  const endedAt = running ? now : Date.parse(live?.startedAt ?? '') + 0;

  return (
    <Panel
      title="Theo dõi lượt gọi AI"
      aside={
        running ? (
          <Chip tone="bl">Đang chạy · cập nhật mỗi 2 giây</Chip>
        ) : run.status === 'failed' ? (
          <Chip tone="rd">Đã dừng</Chip>
        ) : (
          <Chip tone="gr">Xong</Chip>
        )
      }
    >
      {!live ? (
        <p className="text-fg-subtle" aria-live="polite">
          Đang chờ luồng chạy nền nhận việc…
        </p>
      ) : (
        <div className="space-y-3" aria-live="polite">
          <p>
            <b>{live.model}</b> · mức suy nghĩ {effortLabel(live.effort)}
            {running && (
              <>
                {' '}
                · đã chạy <b>{seconds(endedAt - Date.parse(live.startedAt))}</b>
              </>
            )}
          </p>

          {running &&
            live.active.map((call) => (
              <div key={call.key} className="rounded border border-border bg-surface-sunken p-3">
                <p className="font-medium">
                  {call.label} · {seconds(now - Date.parse(call.startedAt))}
                </p>
                {call.phase === 'thinking' ? (
                  <p className="text-fg-subtle">
                    Mô hình đang suy nghĩ
                    {call.thinkingChars
                      ? ` — đã nhận ${formatNumber(call.thinkingChars, 0)} ký tự tóm tắt suy nghĩ ≈ ${formatNumber(Math.round(call.thinkingChars / CHARS_PER_TOKEN), 0)} token (ước tính; phần nghĩ thật dài hơn bản tóm tắt)`
                      : ' — chưa có chữ nào về'}
                    . Số token chính xác hiện khi lượt này xong.
                  </p>
                ) : (
                  <p>
                    Đang viết câu trả lời: đã nhận {formatNumber(call.outputChars, 0)} ký tự ≈{' '}
                    <b>{formatNumber(Math.round(call.outputChars / CHARS_PER_TOKEN), 0)}</b> token
                    (ước tính, chưa gồm phần nghĩ).
                  </p>
                )}
              </div>
            ))}

          {done.length > 0 && (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-sunken text-left">
                    <th className="px-3 py-2 font-medium">Lượt</th>
                    <th className="px-3 py-2 text-right font-medium">Token vào</th>
                    <th className="px-3 py-2 text-right font-medium">Token ra</th>
                    <th className="px-3 py-2 text-right font-medium">Thời gian</th>
                    <th className="px-3 py-2 text-right font-medium">Chi phí</th>
                    <th className="px-3 py-2 font-medium">Kết quả</th>
                    <th className="px-3 py-2 font-medium">Prompt</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((d) => (
                    <tr
                      key={`${d.key}-${d.callId ?? ''}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2">{d.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.inputTokens === null ? '—' : formatNumber(d.inputTokens, 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.outputTokens === null ? '—' : formatNumber(d.outputTokens, 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{seconds(d.latencyMs)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.costUsd === null ? 'Chưa có giá' : formatUsd(d.costUsd)}
                      </td>
                      <td className="px-3 py-2">
                        {d.errorCode === 'cancelled' ? 'đã dừng' : DONE_LABEL[d.status]}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {d.callId ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => download.mutate({ projectId, callId: d.callId! })}
                            disabled={download.isPending && download.variables?.callId === d.callId}
                            aria-label={`Xuất prompt của lượt ${d.label} ra tệp chữ`}
                          >
                            Xuất prompt
                          </Button>
                        ) : (
                          <span className="text-xs text-fg-subtle">Không lưu</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {done.length > 0 && (
            <p className="text-xs text-fg-subtle">
              Cộng các lượt đã xong: {formatNumber(totalIn, 0)} token vào ·{' '}
              {formatNumber(totalOut, 0)} token ra · chi phí ≈ {formatUsd(totalCost)}
              {known.length < done.length
                ? ` · ${done.length - known.length} lượt chưa có giá, chưa cộng`
                : ''}
              . Kiểm tầng và vẽ không gọi mô hình, không tốn token.
            </p>
          )}
        </div>
      )}

      {running && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void cancel.mutateAsync({ runId: run.id }).catch(() => undefined)}
            disabled={stopping}
          >
            {stopping ? 'Đang dừng…' : 'Dừng lượt chạy'}
          </Button>
          <p className="text-xs text-fg-subtle">
            Dừng thì huỷ mọi lời gọi đang chạy trong khoảng 2 giây và không mở lượt gọi mới. Phần
            token đã sinh trước lúc dừng vẫn có thể bị tính tiền.
          </p>
        </div>
      )}
      {cancel.isError && <p className="mt-2 text-status-overdue">{toUserMessage(cancel.error)}</p>}
      {download.isError && (
        <p className="mt-2 text-status-overdue">
          Chưa xuất được prompt. {toUserMessage(download.error)}
        </p>
      )}
    </Panel>
  );
}
