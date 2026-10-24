/**
 * Client «phát lại» — CHỈ cho máy phát triển (cờ `AI_REPLAY=1`, T170).
 *
 * Trả lại câu trả lời THÔ đã ghi của một lượt thật (`ai_calls/<id>.json` → `output`), theo đúng thứ tự
 * lời gọi, thay cho nhà cung cấp. Không chạm mạng, không tính tiền: token = 0, không có giá, nhà cung cấp
 * `replay`, model `replay:<mã lượt>` — nhật ký `design_ai_call` và `generator` của artifact tự nói ra
 * phương án này là phát lại.
 *
 * Câu trả lời đi qua ĐÚNG đường của câu trả lời thật (kiểm hợp đồng, `tidyHouse`, bộ xếp, cổng, chấm điểm):
 * client không được tự chuẩn hoá gì.
 *
 * Workflow chạy lại `run()` từ đầu khi tiếp tục và lấy kết quả bước đã xong từ bộ nhớ đệm, nên bộ đếm
 * của client KHÔNG được sống qua các bước: Workflow dựng một client cho từng vòng với `start = vòng − 1`
 * (`replayClientForRound`), câu trả lời vòng n luôn là phần tử n − 1 dù instance chạy lại bao lần.
 */

import type { DataClass } from '@nvg/shared/design';
import { LlmCallFailed } from './gemini';
import type { StructuredCallOptions, StructuredCallResult, TextModelClient } from './text-client';

/** Nhà cung cấp ghi vào nhật ký và `generator.provider` của artifact. */
export const REPLAY_PROVIDER = 'replay';

/** Model ghi vào nhật ký — `replay:<mã lượt>`. */
export function replayModel(of: string): string {
  return `${REPLAY_PROVIDER}:${of}`;
}

/** Lượt phát lại mang trong params của Workflow. */
export interface ReplaySource {
  /** Mã lượt ghi (8 ký tự hex đầu của mã lượt thật). */
  of: string;
  /** Câu trả lời thô của mô hình theo thứ tự lời gọi — vòng 1, vòng 2… */
  outputs: unknown[];
}

export class ReplayTextClient implements TextModelClient {
  private next: number;

  constructor(
    private readonly source: ReplaySource,
    start = 0,
  ) {
    this.next = start;
  }

  complete(
    _routeName: string,
    _dataClass: DataClass,
    options: StructuredCallOptions,
  ): Promise<StructuredCallResult> {
    if (options.signal?.aborted) return Promise.reject(new LlmCallFailed('Đã dừng.', false));
    const index = this.next;
    if (index >= this.source.outputs.length) {
      const message = `Hết câu trả lời đã ghi của lượt ${this.source.of} — phát lại dừng, không gọi mô hình.`;
      return Promise.reject(
        new LlmCallFailed(message, false, undefined, message, { inputTokens: 0, outputTokens: 0 }),
      );
    }
    this.next += 1;
    return Promise.resolve({
      // Bản sao sâu: nơi gọi có thể sửa đối tượng, câu đã ghi phải giữ nguyên cho lượt sau.
      json: structuredClone(this.source.outputs[index]),
      provider: REPLAY_PROVIDER,
      model: replayModel(this.source.of),
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
    });
  }
}

/** Client của vòng `round` (đếm từ 1) — không giữ trạng thái qua các bước Workflow. */
export function replayClientForRound(source: ReplaySource, round: number): ReplayTextClient {
  return new ReplayTextClient(source, Math.max(0, round - 1));
}
