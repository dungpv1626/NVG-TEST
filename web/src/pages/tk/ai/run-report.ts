/**
 * Báo cáo một lượt chạy AI dạng Markdown — cho người phát triển tải về và soát (Haan, 07/10/2026).
 *
 * Trước đó mọi thứ này bày thẳng trên màn hình: danh sách bước, câu lỗi tiếng Anh của bộ xếp, bảng
 * theo dõi lượt gọi, lý do từng tầng. Với người thiết kế chúng không có nghĩa; với người phát triển
 * thì bày trên màn hình lại không đủ (không có nguyên văn lời gọi, không sao chép gọn được). Nên màn
 * hình chỉ còn số tiền, còn toàn bộ quá trình đi vào một tệp `.md`.
 *
 * Hàm thuần: không hook, không mạng, không ngày giờ hiện tại — mọi thứ nơi gọi đưa vào.
 */

import type { AiCallLogRow, AiRunView } from '@/hooks/use-ai-design';

export interface RunReportInput {
  title: string;
  projectId: string;
  run: AiRunView;
  /** Lượt gọi của lượt chạy, cũ trước. */
  calls: AiCallLogRow[];
  /** Nguyên văn lời gọi theo `id` lượt gọi; `null` = không có bản ghi. */
  prompts: Map<string, string | null>;
  /** Tổng chi phí đã tính sẵn (tiền thật, theo gói), hoặc `null` khi có lượt chưa có giá. */
  totalUsd: number | null;
  /** Phần riêng của từng bước (lý do phương án hỏng, ý tưởng bị bác…), đã là Markdown. */
  extra?: string;
}

const STEP_STATUS: Record<string, string> = {
  pending: 'Chờ',
  running: 'Đang chạy',
  done: 'Xong',
  failed: 'Hỏng',
};

const RUN_STATUS: Record<string, string> = {
  queued: 'Đang chờ',
  running: 'Đang chạy',
  done: 'Xong',
  failed: 'Hỏng',
};

const CALL_STATUS: Record<AiCallLogRow['status'], string> = {
  ok: 'Dùng được',
  rejected: 'Bị bác khi kiểm',
  failed: 'Lỗi khi gọi',
};

/** Ô bảng Markdown: dấu `|` và xuống dòng làm vỡ bảng. */
function cell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ');
}

/** Rào mã đủ dài để nội dung có sẵn ``` không đóng nhầm khối. */
function fence(text: string, lang = ''): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${lang}\n${text}\n${ticks}`;
}

function usd(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(value < 0.01 ? 4 : 3)} USD`;
}

function elapsed(from?: string | null, to?: string | null): string {
  if (!from) return '';
  const a = Date.parse(from);
  const b = to ? Date.parse(to) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return `${Math.max(0, Math.round((b - a) / 1000))} giây`;
}

export function buildRunReport(input: RunReportInput): string {
  const { run, calls } = input;
  const out: string[] = [];

  out.push(`# ${input.title}`, '');
  out.push(`- Hồ sơ: \`${input.projectId}\``);
  out.push(`- Lượt chạy: \`${run.id}\` · bước \`${run.stage}\``);
  out.push(`- Trạng thái: ${RUN_STATUS[run.status] ?? run.status}`);
  out.push(`- Bắt đầu: ${run.createdAt} · cập nhật: ${run.updatedAt}`);
  out.push(`- Số lượt gọi mô hình: ${calls.length}`);
  out.push(`- Chi phí: ${usd(input.totalUsd)}`, '');

  if (run.error) out.push('## Lỗi của lượt chạy', '', fence(run.error), '');

  const steps = run.progress?.steps ?? [];
  if (steps.length > 0) {
    out.push(
      '## Các bước',
      '',
      '| # | Bước | Trạng thái | Thời gian | Lỗi |',
      '|---|---|---|---|---|',
    );
    steps.forEach((step, i) => {
      out.push(
        `| ${i + 1} | ${cell(step.label)} | ${STEP_STATUS[step.status] ?? step.status} | ${elapsed(step.startedAt, step.endedAt)} | ${cell(step.error)} |`,
      );
    });
    out.push('');
  }

  if (input.extra?.trim()) out.push(input.extra.trim(), '');

  if (calls.length > 0) {
    out.push(
      '## Lượt gọi mô hình',
      '',
      '| # | Lúc | Mục đích | Model | Token vào | Token ra | Ảnh | Thời gian | Trạng thái | Mã lỗi | Chi phí niêm yết |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
    );
    calls.forEach((c, i) => {
      out.push(
        `| ${i + 1} | ${c.created_at} | ${cell(c.purpose)} | ${cell(`${c.provider} · ${c.model}`)} | ${c.input_tokens ?? '—'} | ${c.output_tokens ?? '—'} | ${c.image_count} | ${(c.latency_ms / 1000).toFixed(1)} giây | ${CALL_STATUS[c.status]} | ${cell(c.error_code)} | ${usd(c.cost_usd === null ? null : Number(c.cost_usd))} |`,
      );
    });
    out.push('');

    out.push('## Nguyên văn lời gọi', '');
    calls.forEach((c, i) => {
      out.push(`### Lượt ${i + 1} — ${c.purpose} · ${c.model} · \`${c.id}\``, '');
      const prompt = input.prompts.get(c.id);
      out.push(prompt ? fence(prompt) : '_Không có bản ghi lời gọi._', '');
    });
  }

  if (run.result !== null && run.result !== undefined) {
    out.push(
      '## Kết quả thô của lượt chạy',
      '',
      fence(JSON.stringify(run.result, null, 2), 'json'),
      '',
    );
  }

  return out.join('\n');
}

/** Tên tệp: `bao-cao-<bước>-<mã lượt chạy 8 ký tự>.md`. */
export function reportFileName(run: AiRunView): string {
  return `bao-cao-${run.stage}-${run.id.slice(0, 8)}.md`;
}
