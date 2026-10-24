/**
 * Thân tuyến `POST /design/ai/plan/replay` (T170) — tách khỏi `routes.ts` để kiểm thử được mà không nạp
 * các tệp YAML nhúng của bản dựng Worker. `routes.ts` nối hàng rào thật (`preparePlanStart`) và lệnh mở
 * lượt thật (`launchPlanRun`) vào đây.
 *
 * Tuyến CHỈ có khi `AI_REPLAY` đúng là `'1'` (máy phát triển); vắng / giá trị khác thì 404 như một đường
 * không tồn tại. Hàng rào riêng của nó: đầu bài của hồ sơ phải TRÙNG đầu bài của lượt ghi theo nghĩa
 * (`replay-digest.ts`) — phát lại một câu trả lời lên một đầu bài khác là bịa phương án.
 */

import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { DesignEnv } from '../env';
import type { ReplaySource } from '../llm/replay';
import { digestDifferences } from './replay-digest';

/** Lỗi của một hàng rào tuyến — thân JSON và mã HTTP. */
export type RouteError = { error: { body: Record<string, unknown>; status: ContentfulStatusCode } };

/** Số câu trả lời đã ghi tối đa một lượt phát lại nhận — bằng số vòng của một lượt thật (1 + 4 lượt sửa). */
export const REPLAY_OUTPUTS_MAX = 5;

export const REPLAY_DIGEST_MISMATCH =
  'Đầu bài của hồ sơ khác đầu bài của lượt ghi — không phát lại được.';

export interface ReplayRouteDeps {
  /** Hàng rào chung của lượt mặt bằng (quyền, đầu bài đã xác nhận, không lượt nào đang chạy) + digest. */
  prepare(projectId: string): Promise<RouteError | { ok: { digest: unknown } }>;
  /** Mở lượt chạy MỘT phương án, không trần chi phí, mang `replay` trong params. */
  launch(
    replay: ReplaySource,
    textRoute: string,
  ): Promise<{ runId: string; variants: { id: string; label: string }[] }>;
}

export async function handlePlanReplay(
  env: Pick<DesignEnv, 'AI_REPLAY'>,
  token: string | null,
  raw: unknown,
  deps: ReplayRouteDeps,
): Promise<{ body: Record<string, unknown>; status: ContentfulStatusCode }> {
  if (env.AI_REPLAY !== '1') return { body: { error: 'Không tìm thấy.' }, status: 404 };
  if (!token) return { body: { error: 'Chưa đăng nhập.' }, status: 401 };

  const body = (raw && typeof raw === 'object' ? raw : {}) as {
    projectId?: unknown;
    replayOf?: unknown;
    digest?: unknown;
    outputs?: unknown;
    textRoute?: unknown;
  };
  const bad = (error: string) => ({ body: { error }, status: 400 as const });
  if (typeof body.projectId !== 'string' || !body.projectId) return bad('Thiếu mã hồ sơ thiết kế.');
  if (typeof body.replayOf !== 'string' || !/^[0-9a-f]{8}$/.test(body.replayOf)) {
    return bad('Mã lượt ghi phải là 8 ký tự hex.');
  }
  if (!body.digest || typeof body.digest !== 'object') return bad('Thiếu đầu bài của lượt ghi.');
  if (
    !Array.isArray(body.outputs) ||
    body.outputs.length < 1 ||
    body.outputs.length > REPLAY_OUTPUTS_MAX
  ) {
    return bad(`Cần từ 1 tới ${REPLAY_OUTPUTS_MAX} câu trả lời đã ghi, theo thứ tự vòng.`);
  }
  if (typeof body.textRoute !== 'string' || !body.textRoute || body.textRoute.length > 64) {
    return bad('Thiếu tuyến model của lượt ghi.');
  }

  const prepared = await deps.prepare(body.projectId);
  if ('error' in prepared) return prepared.error;

  const differences = digestDifferences(body.digest, prepared.ok.digest);
  if (differences.length) {
    return { body: { error: REPLAY_DIGEST_MISMATCH, differences }, status: 409 };
  }

  const launched = await deps.launch(
    { of: body.replayOf, outputs: body.outputs as unknown[] },
    body.textRoute,
  );
  return { body: { ...launched, replayOf: body.replayOf }, status: 202 };
}
