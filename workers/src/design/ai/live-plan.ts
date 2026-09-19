/**
 * Bảng theo dõi TRỰC TIẾP của bước xếp mặt bằng — một lượt chạy nền, nhiều lượt gọi song song.
 *
 * Haan (13/09/2026): «claude chưa chọn mức độ suy nghĩ, lượng token tiêu thụ realtime, thời gian
 * chạy, xuất prompt, nút pause». Bước chương trình không gian đã có những thứ ấy
 * (`ai/routes.ts` `LiveProgram`); bước mặt bằng chạy trong Workflow và gọi NHIỀU tầng cùng lúc,
 * nên cần một bảng giữ mọi lượt đang bay và mọi lượt đã xong.
 *
 * MỘT người ghi: bảng sống trong instance Workflow, và chỉ vòng lặp 2 giây của instance ấy ghi nó
 * xuống CSDL (`writeRunPartial`). Các tầng song song chỉ sửa đối tượng trong bộ nhớ — không có
 * hai lượt ghi chen nhau vào cùng một cột.
 *
 * ⚠️ Số liệu giữa chừng là KÝ TỰ, không phải token: nhà cung cấp chỉ báo số token khi lượt gọi
 * xong. Màn hình đổi ký tự ra token có ghi rõ «ước tính» (CLAUDE.md 5.2).
 */

import { costUsd, type AiCallOutcome } from './call-log';
import type { RoutePricing } from '../llm/router';
import type { CallProgress, ReasoningEffort } from '../llm/text-client';

export interface LiveCall {
  /** Mã bước Workflow — `plan:AI-A:L2:resample`. */
  key: string;
  label: string;
  startedAt: string;
  phase: CallProgress['phase'];
  outputChars: number;
  /** `null` khi nhà cung cấp không gửi tóm tắt suy nghĩ (OpenAI). */
  thinkingChars: number | null;
}

export interface LiveDone {
  key: string;
  label: string;
  /** Mã dòng nhật ký — màn hình dùng để xuất prompt. `null` khi ghi nhật ký hỏng. */
  callId: string | null;
  status: AiCallOutcome['status'];
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  /** Tiền thật; `null` khi tuyến chưa có giá. Khoá gói miễn phí thì 0. */
  costUsd: number | null;
}

export interface LivePlan {
  model: string;
  route: string;
  effort: ReasoningEffort | null;
  startedAt: string;
  active: LiveCall[];
  done: LiveDone[];
}

export class LivePlanBoard {
  private readonly controller = new AbortController();
  private readonly active = new Map<string, LiveCall>();
  private readonly done: LiveDone[] = [];
  private readonly startedAt = new Date().toISOString();

  constructor(
    private readonly meta: { model: string; route: string; effort: ReasoningEffort | null },
    private readonly pricing: RoutePricing | undefined,
    private readonly billed: boolean,
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  cancel(): void {
    this.controller.abort();
  }

  begin(key: string, label: string): void {
    this.active.set(key, {
      key,
      label,
      startedAt: new Date().toISOString(),
      phase: 'thinking',
      outputChars: 0,
      thinkingChars: null,
    });
  }

  progress(key: string, progress: CallProgress): void {
    const call = this.active.get(key);
    if (!call) return;
    call.phase = progress.phase;
    call.outputChars = progress.outputChars;
    if (progress.thinkingChars !== undefined) call.thinkingChars = progress.thinkingChars;
  }

  finish(key: string, logged: AiCallOutcome & { callId: string | null }): void {
    const call = this.active.get(key);
    this.active.delete(key);
    const list = costUsd(this.pricing, logged.usage);
    this.done.push({
      key,
      label: call?.label ?? key,
      callId: logged.callId,
      status: logged.status,
      errorCode: logged.errorCode ?? null,
      inputTokens: logged.usage.inputTokens,
      outputTokens: logged.usage.outputTokens,
      latencyMs: Math.max(0, Math.round(logged.latencyMs)),
      costUsd: this.billed ? list : 0,
    });
  }

  /** Lượt gọi rời bảng mà không ghi được nhật ký (ném trước khi gọi) — bỏ khỏi danh sách đang bay. */
  drop(key: string): void {
    this.active.delete(key);
  }

  snapshot(): LivePlan {
    return {
      ...this.meta,
      startedAt: this.startedAt,
      active: [...this.active.values()].map((call) => ({ ...call })),
      done: this.done.map((item) => ({ ...item })),
    };
  }
}
