/**
 * Nhật ký lượt gọi AI — bảng `design_ai_call` (migration 0121).
 *
 * Vì sao có: Haan trả tiền API cho ba nhà cung cấp; không có bảng này thì chi phí là con số
 * chỉ hiện trên hoá đơn cuối tháng, không đối chiếu được với dự án nào, model nào, bước nào.
 * Mỗi lượt gọi — kể cả lượt hỏng hay bị bác — là một dòng.
 *
 * Ghi bằng client `service_role` của `ArtifactRepository`: trình duyệt không được tự ghi dòng
 * chi phí (bảng không có policy INSERT cho `authenticated`). Ghi hỏng thì chỉ log, không làm
 * hỏng lượt gọi — nhật ký không được đứng trước nghiệp vụ.
 */

import { LlmCallFailed } from '../llm/gemini';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataClass } from '@nvg/shared/design';
import type { RoutePricing } from '../llm/router';
import type { TokenUsage } from '../llm/text-client';

export interface AiCallScope {
  tenantId: string;
  companyId: string;
  projectId: string;
  discipline: 'kien_truc' | 'ket_cau' | 'dien_nuoc';
  actorId: string | null;
}

export interface AiCallMeta {
  route: string;
  /** Việc gì: `program`, `plan`, `plan_repair`, `image:exterior`… — để cộng theo việc. */
  purpose: string;
  dataClass: DataClass;
  promptVersion?: string;
}

export interface AiCallOutcome {
  provider: string;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  imageCount?: number;
  status: 'ok' | 'rejected' | 'failed';
  errorCode?: string;
  artifactId?: string | null;
}

/** Chi phí từ giá niêm yết (dữ liệu trong `config/models.yaml`); thiếu giá thì `null`. */
export function costUsd(
  pricing: RoutePricing | undefined,
  usage: TokenUsage,
  imageCount = 0,
): number | null {
  if (!pricing) return null;
  let total = 0;
  let known = false;
  if (pricing.image_usd !== undefined && imageCount > 0) {
    total += pricing.image_usd * imageCount;
    known = true;
  }
  if (pricing.input_per_1m_usd !== undefined && usage.inputTokens !== null) {
    total += (usage.inputTokens / 1_000_000) * pricing.input_per_1m_usd;
    known = true;
  }
  if (pricing.output_per_1m_usd !== undefined && usage.outputTokens !== null) {
    total += (usage.outputTokens / 1_000_000) * pricing.output_per_1m_usd;
    known = true;
  }
  return known ? Math.round(total * 1_000_000) / 1_000_000 : null;
}

export async function recordAiCall(
  db: SupabaseClient,
  scope: AiCallScope,
  meta: AiCallMeta,
  outcome: AiCallOutcome,
  pricing: RoutePricing | undefined,
): Promise<void> {
  const { error } = await db.from('design_ai_call').insert({
    tenant_id: scope.tenantId,
    company_id: scope.companyId,
    project_id: scope.projectId,
    discipline: scope.discipline,
    route: meta.route,
    provider: outcome.provider,
    model: outcome.model,
    purpose: meta.purpose,
    data_class: meta.dataClass,
    prompt_version: meta.promptVersion ?? null,
    input_tokens: outcome.usage.inputTokens,
    output_tokens: outcome.usage.outputTokens,
    image_count: outcome.imageCount ?? 0,
    latency_ms: Math.max(0, Math.round(outcome.latencyMs)),
    status: outcome.status,
    error_code: outcome.errorCode ?? null,
    cost_usd: costUsd(pricing, outcome.usage, outcome.imageCount ?? 0),
    artifact_id: outcome.artifactId ?? null,
    created_by: scope.actorId,
  });
  if (error) console.error('design_ai_call: không ghi được nhật ký lượt gọi', error);
}

/**
 * Chạy một lời gọi AI và ghi nhật ký dù thành công hay hỏng.
 *
 * `fn` trả về kết quả của client (có `provider`, `model`, `usage`, `latencyMs`). Lỗi được ném
 * lại nguyên vẹn sau khi ghi một dòng `failed` — lớp gọi vẫn phân loại lỗi như trước.
 */
export async function withAiCall<
  T extends { provider: string; model: string; usage: TokenUsage; latencyMs: number },
>(
  db: SupabaseClient,
  scope: AiCallScope,
  meta: AiCallMeta,
  /** Nhà cung cấp/mô hình/giá của tuyến — từ `router.publicRoutes()`, để dòng hỏng vẫn cộng được theo model. */
  route: { provider: string; model: string; pricing?: RoutePricing },
  fn: () => Promise<T>,
  imageCount = 0,
): Promise<T> {
  const started = Date.now();
  const pricing = route.pricing;
  try {
    const out = await fn();
    await recordAiCall(db, scope, meta, { ...out, imageCount, status: 'ok' }, pricing);
    return out;
  } catch (error) {
    await recordAiCall(
      db,
      scope,
      meta,
      {
        provider: route.provider,
        model: route.model,
        // Số token lấy từ chính LỖI khi nó mang theo. Nhà cung cấp tính tiền phần token đã sinh
        // dù kết quả không dùng được, nên bỏ trống ở đây là ghi một lượt đắt thành lượt 0 đồng.
        usage: (error instanceof LlmCallFailed && error.usage) || {
          inputTokens: null,
          outputTokens: null,
        },
        latencyMs: Date.now() - started,
        imageCount,
        status: 'failed',
        errorCode: error instanceof Error ? error.name : 'Error',
      },
      pricing,
    );
    throw error;
  }
}
