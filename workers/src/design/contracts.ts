/**
 * Kiểm tra dữ liệu ở RANH GIỚI.
 *
 * "Cả Worker và Container đều validate ở ranh giới. Không bên nào tin bên kia"
 * (doc/design/03-data-contracts.md). Đây là phía Worker của quy tắc đó.
 *
 * Schema đến từ `@nvg/shared/design`, sinh từ `contracts/*.schema.json`. Không viết lại
 * điều kiện kiểm tra ở đây — viết lại là tạo bản thực thi thứ hai sẽ lệch.
 */

import type { z } from 'zod';
import {
  archModelSchema,
  designBriefSchema,
  floorPlanSchema,
  infeasibilityReportSchema,
  layoutIntentSchema,
  publishRequestSchema,
  renderRequestSchema,
  renderResultSchema,
  schedulesSchema,
  spaceProgramSchema,
  type ArtifactKind,
} from '@nvg/shared/design';

/** Schema tương ứng với từng loại artifact — dùng khi ghi và khi đọc lại từ kho. */
export const ARTIFACT_SCHEMAS = {
  design_brief: designBriefSchema,
  space_program: spaceProgramSchema,
  layout_intent: layoutIntentSchema,
  floor_plan: floorPlanSchema,
  infeasibility_report: infeasibilityReportSchema,
  arch_model: archModelSchema,
  schedules: schedulesSchema,
  render_result: renderResultSchema,
} as const satisfies Record<ArtifactKind, z.ZodTypeAny>;

export const REQUEST_SCHEMAS = {
  render_request: renderRequestSchema,
  publish_request: publishRequestSchema,
} as const;

/**
 * Lỗi hợp đồng dữ liệu — KHÔNG thử lại.
 *
 * Workflow phân biệt hai loại lỗi (02-architecture 2.5): lỗi mạng thì thử lại, lỗi schema
 * thì báo ngay. Gọi lại một mô hình ngôn ngữ đã sinh sai cấu trúc chỉ tốn tiền để nhận lại
 * cùng loại sai — phương án đúng là bỏ và sinh phương án mới.
 */
export class ContractError extends Error {
  readonly retryable = false;

  constructor(
    readonly kind: string,
    readonly issues: z.ZodIssue[],
  ) {
    super(`Dữ liệu không đúng hợp đồng "${kind}": ${describeIssues(issues)}`);
    this.name = 'ContractError';
  }
}

function describeIssues(issues: z.ZodIssue[]): string {
  return issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(gốc)'} — ${i.message}`)
    .join('; ');
}

/** Kiểm tra payload của một artifact. Ném `ContractError` nếu sai. */
export function parseArtifact<K extends ArtifactKind>(
  kind: K,
  payload: unknown,
): z.infer<(typeof ARTIFACT_SCHEMAS)[K]> {
  const schema: z.ZodTypeAny = ARTIFACT_SCHEMAS[kind];
  const result = schema.safeParse(payload);
  if (!result.success) throw new ContractError(kind, result.error.issues);
  return result.data;
}

/** Kiểm tra một yêu cầu gửi tới lớp ngoài (render, phát hành). */
export function parseRequest<K extends keyof typeof REQUEST_SCHEMAS>(
  kind: K,
  payload: unknown,
): z.infer<(typeof REQUEST_SCHEMAS)[K]> {
  const schema: z.ZodTypeAny = REQUEST_SCHEMAS[kind];
  const result = schema.safeParse(payload);
  if (!result.success) throw new ContractError(kind, result.error.issues);
  return result.data;
}
