/**
 * Tuyến «Bộ ý tưởng cho khách» (doc/design/KE_HOACH_BO_Y_TUONG_KHACH.md) — phần TẤT ĐỊNH, không gọi mô hình.
 *
 * `GET /concept/:projectId/zoning`: sơ đồ công năng từng tầng + báo «đầu bài có vừa lô không» (B1 + B2), dựng từ đầu bài
 * ĐÃ XÁC NHẬN mới nhất dưới phiên người gọi (RLS của chính họ, như `/plan/:projectId/preflight`). Trả JSON kèm chuỗi
 * SVG; `?format=svg` trả thẳng tệp SVG (để tải về / đưa vào Bộ kết quả). Chưa có đầu bài đã xác nhận thì trả rỗng.
 * Không ghi artifact nào: sơ đồ dựng lại mỗi lần từ đầu bài, cùng đầu bài thì cùng chuỗi.
 */

import { Hono } from 'hono';
import type { AiBriefDigest, DesignBrief } from '@nvg/shared/design';
import { ArtifactRepository } from '../artifacts';
import {
  aiDigestInputs,
  asUser,
  denyUnlessReadable,
  projectScope,
  PROJECT_NOT_VISIBLE,
} from '../auth-scope';
import { anonymiseForAi } from '../brief/anonymise';
import type { DesignEnv } from '../env';
import { conceptZoningTable } from '../kb/concept-zoning-data';
import { conceptZoning, type ConceptZoning } from './concept-zoning';
import { conceptZoningSvg } from './concept-zoning-svg';
import { sheetStyle } from './draw/style-data';
import { planContext } from './plan';
import { preflightContextInput } from './plan-preflight';

export const conceptApp = new Hono<{ Bindings: DesignEnv }>();

function bearer(header: string | undefined): string | null {
  return header?.replace(/^Bearer\s+/i, '') || null;
}

/** Sơ đồ công năng của một đầu bài — cùng ngữ cảnh kiểm trước lượt «Xếp mặt bằng» dùng. */
export function zoningOfDigest(digest: AiBriefDigest): ConceptZoning & { svg: string } {
  const input = preflightContextInput(digest);
  const table = conceptZoningTable();
  const zoning = conceptZoning({
    table,
    knowledge: planContext(input).knowledge,
    construction: input.construction,
    digest,
    labels: input.labels,
    ...(input.areaNorms ? { areaNorms: input.areaNorms } : {}),
  });
  return { ...zoning, svg: conceptZoningSvg(zoning, table, sheetStyle().font_family) };
}

conceptApp.get('/:projectId/zoning', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);
  const brief = await new ArtifactRepository(c.env).head(projectId, 'kien_truc', 'design_brief');
  const asSvg = c.req.query('format') === 'svg';
  if (!brief) {
    if (asSvg) return c.json({ error: 'Chưa có đầu bài đã xác nhận.' }, 404);
    return c.json({ briefArtifactId: null, zoning: null });
  }
  const digest = anonymiseForAi(await aiDigestInputs(db, projectId, brief.payload as DesignBrief));
  const { svg, ...zoning } = zoningOfDigest(digest);
  if (asSvg) {
    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, no-store',
    });
  }
  return c.json({ briefArtifactId: brief.id, zoning, svg });
});
