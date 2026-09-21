/**
 * Số token và chi phí của lượt gọi AI — hiện NGAY chỗ bấm, và gom thành nhật ký theo hồ sơ.
 *
 * Haan (13/09/2026): «tính toán lượng token tiêu thụ, chi phí cho mỗi lần gọi, hiển thị trực
 * tiếp lên màn hình để kỹ sư nắm bắt được». Trước đó con số chỉ nằm trong bảng `design_ai_call`
 * và nhật ký máy chủ — tức là chỉ hiện trên hoá đơn cuối tháng.
 *
 * Ba cách nói sai phải tránh, và cả ba đều là «hiện số 0» ở chỗ không phải 0 (CLAUDE.md 5.2):
 *
 *  · **Tuyến chưa có giá niêm yết** → nói «chưa có giá», không hiện 0 USD.
 *  · **Nhà cung cấp không trả số token** → nói «không trả về», không hiện 0 token.
 *  · **Khoá gói miễn phí** → tiền thật đúng là 0, NHƯNG vẫn hiện giá nếu trả phí: đó là con số
 *    kỹ sư cần để biết hôm chuyển sang khoá trả phí thì bước này tốn bao nhiêu.
 *
 * Giá là GIÁ NIÊM YẾT trong `config/models.yaml`, chưa gồm thuế — nói rõ ngay cạnh con số.
 */

import { useState } from 'react';
import { formatDateTime, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import {
  AI_CALL_LOG_LIMIT,
  useAiCallLog,
  useAiCallPrompts,
  useAiModels,
  useDownloadAiCallPrompt,
  type AiCallLogRow,
  type AiCallUsage,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Panel } from '../tk-ui';

/** USD với độ chính xác đủ đọc: lượt gọi rẻ tính bằng phần nghìn cent. */
export function formatUsd(value: number): string {
  if (value === 0) return '0 USD';
  const digits = value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return `${formatNumber(value, digits)} USD`;
}

function tokens(value: number | null): string {
  return value === null ? 'không trả về' : formatNumber(value, 0);
}

function seconds(ms: number): string {
  return `${formatNumber(ms / 1000, 1)} giây`;
}

const PURPOSE_LABEL: Record<string, string> = {
  program: 'Chương trình không gian (AI)',
  program_intent: 'Đề xuất ưu tiên diện tích',
  plan_house: 'Mặt bằng — AI khai cả nhà',
  plan_house_revise: 'Mặt bằng — AI sửa ý định cả nhà',
  plan_house_edit: 'Mặt bằng — sửa theo yêu cầu kỹ sư',
  facade: 'Mặt đứng — AI đề xuất ý tưởng',
  facade_revise: 'Mặt đứng — AI sửa ý tưởng',
  facade_image: 'Mặt đứng — ảnh có vật liệu (ảnh)',
  // Luồng mỗi-tầng-một-lượt — thay ngày 15/09/2026 (T45); dòng nhật ký cũ vẫn là tiền đã trả.
  plan_level: 'Mặt bằng — xếp một tầng (luồng cũ)',
  plan_level_resample: 'Mặt bằng — xếp lại một tầng (luồng cũ)',
  // T57: tính theo TẤM, không theo token — `AiUsageLine` đã biết nói «n ảnh» thay cho số token.
  plan_sheet_image: 'Mặt bằng — tờ có nội thất (ảnh)',
  site_boundary: 'Đọc ảnh trích lục / sổ đỏ',
  // Luồng mặt bằng CŨ (cả nhà một lượt, có lượt vá) — gỡ ngày 13/09/2026 (T37–T39), nhưng dòng
  // nhật ký của nó vẫn còn và vẫn là tiền đã trả.
  plan: 'Mặt bằng — cả nhà một lượt (luồng cũ)',
  plan_repair: 'Mặt bằng — lượt vá (luồng cũ)',
};

export function purposeLabel(purpose: string): string {
  if (PURPOSE_LABEL[purpose]) return PURPOSE_LABEL[purpose]!;
  if (purpose.startsWith('render:')) return 'Phối cảnh từ ảnh khối';
  if (purpose.startsWith('image:')) return 'Ảnh minh hoạ';
  return purpose;
}

const STATUS_LABEL: Record<AiCallUsage['status'], string> = {
  ok: 'Dùng được',
  rejected: 'Bị bác khi kiểm',
  failed: 'Lỗi khi gọi',
};

/** Câu chi phí của một hay nhiều lượt — dùng chung cho dòng dưới nút và dòng tổng nhật ký. */
export function costSentence(cost: number | null, list: number | null, billed: boolean): string {
  if (!billed) {
    return list === null
      ? '0 USD (gói miễn phí)'
      : `0 USD (gói miễn phí) — theo giá trả phí ≈ ${formatUsd(list)}`;
  }
  return cost === null ? 'chưa có giá niêm yết cho model này' : `≈ ${formatUsd(cost)}`;
}

/**
 * Một dòng dưới nút vừa bấm. Nhiều lượt (lượt đầu + lượt sửa) thì cộng lại và nói số lượt.
 */
export function AiUsageLine({
  usage,
  className,
}: {
  usage: AiCallUsage | AiCallUsage[] | null | undefined;
  className?: string;
}): React.ReactElement | null {
  const list = Array.isArray(usage) ? usage : usage ? [usage] : [];
  if (list.length === 0) return null;

  const sum = (pick: (u: AiCallUsage) => number | null): number | null =>
    list.some((u) => pick(u) === null) ? null : list.reduce((a, u) => a + (pick(u) ?? 0), 0);
  const inputTokens = sum((u) => u.inputTokens);
  const outputTokens = sum((u) => u.outputTokens);
  const images = list.reduce((a, u) => a + u.imageCount, 0);
  const billed = list.some((u) => u.billed);
  const cost = sum((u) => u.costUsd);
  const listCost = sum((u) => u.listCostUsd);
  const models = [...new Set(list.map((u) => u.model))].join(', ');
  const latency = list.reduce((a, u) => a + u.latencyMs, 0);
  const tokenless = images > 0 && inputTokens === null && outputTokens === null;

  return (
    <p className={className ?? 'mt-2 text-xs text-fg-subtle'} data-testid="ai-usage">
      <span className="font-medium text-fg">
        {list.length > 1 ? `${list.length} lượt gọi` : 'Lượt gọi AI'}
      </span>
      {' · '}
      {models}
      {tokenless ? (
        <>
          {' · '}
          {formatNumber(images, 0)} ảnh
        </>
      ) : (
        <>
          {' · '}
          {tokens(inputTokens)} token vào · {tokens(outputTokens)} token ra
          {images > 0 ? ` · ${formatNumber(images, 0)} ảnh` : ''}
        </>
      )}
      {' · '}
      {seconds(latency)}
      {' · Chi phí '}
      <span className="font-medium text-fg">{costSentence(cost, listCost, billed)}</span>
      {billed && cost !== null ? ' (giá niêm yết, chưa gồm thuế)' : ''}
    </p>
  );
}

function rowCost(
  row: AiCallLogRow,
  free: Set<string>,
): { cost: number | null; list: number | null; billed: boolean } {
  const list = row.cost_usd === null ? null : Number(row.cost_usd);
  const billed = !free.has(row.provider);
  return { list, billed, cost: billed ? list : 0 };
}

/** Dòng nhật ký → lượt gọi nhìn từ màn hình, để dùng chung `AiUsageLine`. */
export function usageFromRow(row: AiCallLogRow, free: Set<string>): AiCallUsage {
  const c = rowCost(row, free);
  return {
    route: row.route,
    purpose: row.purpose,
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    imageCount: row.image_count,
    latencyMs: row.latency_ms,
    status: row.status,
    billed: c.billed,
    costUsd: c.cost,
    listCostUsd: c.list,
  };
}

/**
 * Số token và chi phí của MỘT lượt chạy nền (xếp mặt bằng), cộng từ nhật ký trong khoảng thời
 * gian của lượt chạy. Lượt chạy ghi từng dòng khi từng tầng xong, nên đang chạy thì hỏi lại để
 * con số tăng theo tiến độ.
 */
export function AiRunUsage({
  projectId,
  purposePrefix,
  startedAt,
  endedAt,
}: {
  projectId: string;
  purposePrefix: string;
  startedAt: string;
  /** Rỗng khi lượt chạy chưa xong. */
  endedAt: string | null;
}): React.ReactElement | null {
  // Trần RIÊNG, cao hơn trần của nhật ký: dòng này cộng tiền của MỘT lượt chạy, mà một lượt xếp
  // mặt bằng ba phương án nhà năm tầng đã quá 25 lượt gọi. Cắt ở 25 thì con số tiền thiếu mà không
  // có gì báo — đúng loại sai lặng lẽ mà một dòng tổng không được phép mắc.
  const log = useAiCallLog(projectId, { live: endedAt === null, limit: 200 });
  const models = useAiModels();
  const free = new Set(models.data?.freeProviders ?? []);
  const from = Date.parse(startedAt);
  // Dòng cuối có thể ghi sau mốc cập nhật trạng thái vài giây.
  const to = endedAt ? Date.parse(endedAt) + 60_000 : Number.POSITIVE_INFINITY;
  const rows = (log.data ?? []).filter((r) => {
    const t = Date.parse(r.created_at);
    return r.purpose.startsWith(purposePrefix) && t >= from && t <= to;
  });
  if (rows.length === 0) return null;
  return <AiUsageLine usage={rows.map((r) => usageFromRow(r, free))} />;
}

/**
 * Nhật ký mọi lượt gọi AI của hồ sơ, mới nhất trên cùng, kèm dòng tổng.
 *
 * Đọc thẳng `design_ai_call` qua RLS; danh sách nhà cung cấp miễn phí lấy từ danh mục model
 * (máy chủ đọc `config/models.yaml`) để tính tiền thật của từng dòng.
 */
export function AiCallLedger({ projectId }: { projectId: string }): React.ReactElement {
  const log = useAiCallLog(projectId);
  const prompts = useAiCallPrompts(projectId);
  const download = useDownloadAiCallPrompt();
  const models = useAiModels();
  const free = new Set(models.data?.freeProviders ?? []);

  return (
    <Panel title="Nhật ký gọi AI của hồ sơ">
      {log.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : log.isError ? (
        <p className="text-status-overdue">
          Chưa đọc được nhật ký gọi AI. {toUserMessage(log.error)}
        </p>
      ) : !log.data?.length ? (
        <p className="text-fg-subtle">
          Hồ sơ này chưa có lượt gọi AI nào. Mỗi lần bấm một nút dùng AI, lượt gọi và chi phí sẽ
          hiện ở đây.
        </p>
      ) : (
        <LedgerTable
          rows={log.data}
          free={free}
          prompts={prompts.data ?? null}
          onExport={(callId) => download.mutate({ projectId, callId })}
          exporting={download.isPending ? (download.variables?.callId ?? null) : null}
        />
      )}
      {download.isError && (
        <p className="mt-2 text-status-overdue">
          Chưa xuất được prompt. {toUserMessage(download.error)}
        </p>
      )}
    </Panel>
  );
}

function LedgerTable({
  rows,
  free,
  prompts,
  onExport,
  exporting,
}: {
  rows: AiCallLogRow[];
  free: Set<string>;
  /** Mã lượt gọi có bản ghi nguyên văn; `null` khi chưa đọc được danh sách. */
  prompts: Set<string> | null;
  onExport: (callId: string) => void;
  exporting: string | null;
}): React.ReactElement {
  // Mặc định hiện 12 dòng, mở ra xem hết số đã nạp (Haan, 20/09/2026). Nhật ký nằm cuối một trang
  // vốn đã dài; 12 dòng đủ thấy lượt vừa chạy mà không đẩy mọi thứ khác ra khỏi tầm mắt.
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LEDGER_PREVIEW);
  const costs = rows.map((r) => rowCost(r, free));
  const totalIn = rows.reduce((a, r) => a + (r.input_tokens ?? 0), 0);
  const totalOut = rows.reduce((a, r) => a + (r.output_tokens ?? 0), 0);
  const totalCost = costs.reduce((a, c) => a + (c.cost ?? 0), 0);
  const totalList = costs.reduce((a, c) => a + (c.list ?? 0), 0);
  const unpriced = costs.filter((c) => c.billed && c.cost === null).length;
  const unknownTokens = (r: AiCallLogRow) =>
    r.input_tokens === null && r.output_tokens === null && r.image_count === 0;

  return (
    <>
      <p className="text-fg-subtle">
        {formatNumber(rows.length, 0)} lượt gần nhất · {formatNumber(totalIn, 0)} token vào ·{' '}
        {formatNumber(totalOut, 0)} token ra · Tiền thật{' '}
        <span className="font-medium text-fg">≈ {formatUsd(totalCost)}</span> · Theo giá niêm yết ≈{' '}
        {formatUsd(totalList)}
        {unpriced > 0 ? ` · ${formatNumber(unpriced, 0)} lượt chưa tính được tiền, chưa cộng` : ''}.
      </p>
      <p className="mt-1 text-xs text-fg-subtle">
        Giá niêm yết của nhà cung cấp, chưa gồm thuế. Lượt bị bác hay lỗi giữa chừng vẫn bị tính
        tiền phần đã sinh. Bảng chỉ nạp {formatNumber(AI_CALL_LOG_LIMIT, 0)} lượt gần nhất — dòng cũ
        hơn vẫn còn đủ trong cơ sở dữ liệu, không bị xoá.
      </p>
      <div className="mt-3 overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-sunken text-left">
              <th className="px-3 py-2 font-medium">Thời điểm</th>
              <th className="px-3 py-2 font-medium">Việc</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 text-right font-medium">Token vào</th>
              <th className="px-3 py-2 text-right font-medium">Token ra</th>
              <th className="px-3 py-2 text-right font-medium">Thời gian</th>
              <th className="px-3 py-2 text-right font-medium">Chi phí</th>
              <th className="px-3 py-2 font-medium">Kết quả</th>
              <th className="px-3 py-2 font-medium">Prompt</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => {
              const c = costs[i]!;
              return (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                  <td className="px-3 py-2">{purposeLabel(row.purpose)}</td>
                  <td className="px-3 py-2">{row.model}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.input_tokens === null ? '—' : formatNumber(row.input_tokens, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.output_tokens === null
                      ? row.image_count > 0
                        ? `${formatNumber(row.image_count, 0)} ảnh`
                        : '—'
                      : formatNumber(row.output_tokens, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{seconds(row.latency_ms)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {!c.billed
                      ? c.list === null
                        ? '0 USD'
                        : `0 USD (≈ ${formatUsd(c.list)} nếu trả phí)`
                      : c.cost === null
                        ? // Không có số token thì vấn đề không nằm ở bảng giá: lượt hỏng trước
                          // ngày lỗi mang số đo theo (11/09/2026) không để lại gì để tính.
                          unknownTokens(row)
                          ? 'Không rõ số token'
                          : 'Chưa có giá'
                        : formatUsd(c.cost)}
                  </td>
                  <td className="px-3 py-2">{STATUS_LABEL[row.status] ?? row.status}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {prompts?.has(row.id) ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onExport(row.id)}
                        disabled={exporting === row.id}
                        aria-label={`Xuất prompt của lượt ${formatDateTime(row.created_at)} ra tệp chữ`}
                      >
                        {exporting === row.id ? 'Đang xuất…' : 'Xuất prompt'}
                      </Button>
                    ) : (
                      <span className="text-xs text-fg-subtle">Không lưu</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > LEDGER_PREVIEW && (
        <Button variant="secondary" className="mt-3" onClick={() => setAll((v) => !v)}>
          {all
            ? `Thu gọn còn ${formatNumber(LEDGER_PREVIEW, 0)} lượt`
            : `Xem tất cả ${formatNumber(rows.length, 0)} lượt`}
        </Button>
      )}
    </>
  );
}

/** Số dòng hiện sẵn trước khi bấm mở rộng. */
const LEDGER_PREVIEW = 12;
