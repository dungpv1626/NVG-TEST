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
  aiFacadeBriefSchema,
  aiFacadeConceptSchema,
  aiFacadeImageSchema,
  aiFacadeReviewSchema,
  aiFloorPlanProposalSchema,
  aiFloorPlanSchema,
  aiImageSetSchema,
  aiPlanSheetImageSchema,
  aiSpaceProgramSchema,
  designBriefSchema,
  type ArtifactKind,
} from '@nvg/shared/design';

/** Schema tương ứng với từng loại artifact — dùng khi ghi và khi đọc lại từ kho. */
export const ARTIFACT_SCHEMAS = {
  design_brief: designBriefSchema,
  ai_space_program: aiSpaceProgramSchema,
  ai_floor_plan: aiFloorPlanSchema,
  ai_facade_concept: aiFacadeConceptSchema,
  ai_facade_brief: aiFacadeBriefSchema,
  ai_facade_image: aiFacadeImageSchema,
  ai_facade_review: aiFacadeReviewSchema,
  ai_image_set: aiImageSetSchema,
  ai_plan_sheet_image: aiPlanSheetImageSchema,
  // Loại cũ của nhánh AI (T14, mô hình tự viết chuỗi SVG). Đường mã sinh ra nó đã gỡ ngày
  // 09/09/2026 cùng T15; giữ lược đồ ở đây để artifact ĐÃ ĐÚC còn đọc lại được — artifact là
  // bất biến, thứ đã ghi thì không được biến thành không đọc nổi.
  ai_plan_proposal: aiFloorPlanProposalSchema,
} as const satisfies Record<ArtifactKind, z.ZodTypeAny>;

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
