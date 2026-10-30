/**
 * Trang KHÁCH xem «Bộ ý tưởng» AI Design — không đăng nhập (B5, migration 0259). Gắn dưới `/public/concept`.
 *
 *   GET /public/concept/:token             — tiêu đề trung tính + danh sách ảnh (khoá ảnh, nhãn), ghi một lượt xem
 *   GET /public/concept/:token/image/:key  — byte của MỘT ảnh trong bộ, không ghi lượt xem
 *
 * Một cửa như trang mẫu công trình (0179): hàm CSDL `design_concept_public` (chỉ service_role) kiểm link đã được kiến
 * trúc sư duyệt, còn hạn, chưa thu hồi, và trả các mã artifact CHỤP LÚC DUYỆT. Mọi ảnh dựng lại danh sách từ chính các
 * mã đó rồi mới tìm khoá — khoá lạ hay ảnh vẽ SAU lúc duyệt không lọt ra. Mã hồ sơ, mã artifact, địa chỉ trong kho không
 * bao giờ rời Worker.
 *
 * Trả gì: ảnh mặt đứng do mô hình ảnh vẽ, các góc phối cảnh, ảnh nội thất từng phòng, sơ đồ công năng (chỉ khi mọi tầng
 * vừa lô — khách không cần thấy «phần gạch đỏ vượt khỏi lô»). KHÔNG trả tờ mặt đứng SVG (có kích thước, trục), DXF,
 * bảng diện tích, giá, tên khách. Tiêu đề dựng từ đầu bài đã lược danh tính: loại nhà, khổ lô, số tầng.
 */

import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import {
  BUILDING_TYPE_LABEL,
  type AiBriefDigest,
  type AiFacadeImage,
  type AiImageSet,
  type AiRoomImage,
  type DesignBrief,
} from '@nvg/shared/design';
import { ArtifactRepository } from '../artifacts';
import { aiDigestInputs, roomLabels, type UserDb } from '../auth-scope';
import { anonymiseForAi } from '../brief/anonymise';
import type { DesignEnv } from '../env';
import { createRenderStore, RenderStoreError } from '../render-store';
import { zoningOfDigest } from './concept-routes';
import { aiPrompts } from './prompts-data';

export const conceptPublicApp = new Hono<{ Bindings: DesignEnv }>();

/** Câu in trên mọi ảnh của trang khách — chữ của trang, không in vào ảnh (T154). */
export const CONCEPT_CAPTION = 'Phương án ý tưởng — chưa phải thiết kế';

interface ShareRow {
  status: 'ok' | 'expired' | 'not_found';
  project_id?: string;
  approved_at?: string;
  expires_at?: string;
  brief_artifact_id?: string | null;
  facade_artifact_id?: string | null;
  image_set_artifact_id?: string | null;
  note?: string | null;
  sender_name?: string | null;
  sender_phone?: string | null;
  company_name?: string | null;
}

type Source = { kind: 'render'; uri: string; mime: string } | { kind: 'svg'; svg: string };

interface PackageImage {
  key: string;
  group: 'mat-dung' | 'phoi-canh' | 'phong' | 'so-do';
  label: string;
  source: Source;
}

function serviceDb(env: DesignEnv) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function validToken(token: string): boolean {
  return /^[0-9a-f]{36}$/.test(token);
}

function vnNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** «Phương án ý tưởng nhà phố 6 × 16 m, 4 tầng» — không tên khách, không địa chỉ. */
export function conceptTitle(digest: Pick<AiBriefDigest, 'building_type' | 'site' | 'floors'>) {
  const kind = (BUILDING_TYPE_LABEL[digest.building_type] ?? 'nhà ở').toLowerCase();
  const size =
    digest.site?.width_m && digest.site?.depth_m
      ? ` ${vnNumber(digest.site.width_m)} × ${vnNumber(digest.site.depth_m)} m`
      : '';
  return `Phương án ý tưởng ${kind}${size}, ${digest.floors} tầng`;
}

async function readShare(env: DesignEnv, token: string, countView: boolean): Promise<ShareRow> {
  const { data, error } = await serviceDb(env).rpc('design_concept_public', {
    p_token: token,
    p_count_view: countView,
  });
  if (error) throw new Error(error.message);
  return data as ShareRow;
}

/** Bộ ảnh của một link — dựng lại mỗi lần từ các mã đã chụp lúc duyệt. */
async function conceptPackage(
  env: DesignEnv,
  share: ShareRow,
): Promise<{ title: string; images: PackageImage[] }> {
  const projectId = share.project_id!;
  const approvedAt = Date.parse(share.approved_at!);
  const before = (createdAt: string) => Date.parse(createdAt) <= approvedAt;
  const repo = new ArtifactRepository(env);
  const images: PackageImage[] = [];

  const brief = share.brief_artifact_id ? await repo.get(share.brief_artifact_id, projectId) : null;
  let title = 'Phương án ý tưởng nhà ở';
  if (brief && brief.kind === 'design_brief') {
    // Đầu bài đã lược danh tính (cùng đường các tuyến AI dùng). Khoá service đọc thay phiên người dùng — không có ai
    // đăng nhập; link đã duyệt là căn cứ quyền.
    const digest = anonymiseForAi(
      await aiDigestInputs(
        serviceDb(env) as unknown as UserDb,
        projectId,
        brief.payload as DesignBrief,
      ),
    );
    title = conceptTitle(digest);
    const zoning = zoningOfDigest(digest);
    if (zoning.floors.every((f) => f.verdict !== 'over')) {
      images.push({
        key: 'so-do',
        group: 'so-do',
        label: 'Sơ đồ công năng từng tầng',
        source: { kind: 'svg', svg: zoning.svg },
      });
    }
  }

  if (share.facade_artifact_id) {
    for (const target of await repo.edgeTargets(share.facade_artifact_id, 'ai_facade_image_draw')) {
      if (target.kind !== 'ai_facade_image' || !before(target.createdAt)) continue;
      const artifact = await repo.get(target.id, projectId);
      if (!artifact) continue;
      const payload = artifact.payload as AiFacadeImage;
      images.push({
        key: 'mat-dung',
        group: 'mat-dung',
        label: 'Mặt đứng mặt tiền',
        source: { kind: 'render', uri: payload.uri, mime: payload.mime },
      });
      break;
    }
  }

  if (share.image_set_artifact_id) {
    const set = await repo.get(share.image_set_artifact_id, projectId);
    if (set && set.kind === 'ai_image_set') {
      const views = aiPrompts().perspective.views;
      for (const image of (set.payload as AiImageSet).images) {
        images.push({
          key: `pc-${image.view}`,
          group: 'phoi-canh',
          label: views[image.view]?.labelVi ?? 'Phối cảnh',
          source: { kind: 'render', uri: image.uri, mime: image.mime },
        });
      }
    }
  }

  if (share.brief_artifact_id) {
    const labels = roomLabels();
    const seen = new Set<string>();
    // Mới nhất trước; mỗi phòng một tấm — tấm kiến trúc sư thấy cuối cùng lúc duyệt.
    for (const target of (
      await repo.edgeTargets(share.brief_artifact_id, 'ai_room_image_draw')
    ).slice(0, 24)) {
      if (target.kind !== 'ai_room_image' || !before(target.createdAt)) continue;
      const artifact = await repo.get(target.id, projectId);
      if (!artifact) continue;
      const payload = artifact.payload as AiRoomImage;
      if (seen.has(payload.room.key)) continue;
      seen.add(payload.room.key);
      images.push({
        key: `phong-${artifact.id.replace(/^sha256:/, '')}`,
        group: 'phong',
        label: labels[payload.room.type] ?? 'Nội thất',
        source: { kind: 'render', uri: payload.uri, mime: payload.mime },
      });
    }
  }
  return { title, images };
}

function refusal(status: ShareRow['status']) {
  return status === 'expired' ? 410 : 404;
}

conceptPublicApp.get('/:token', async (c) => {
  const token = c.req.param('token');
  if (!validToken(token)) return c.json({ status: 'not_found' }, 404);
  let share: ShareRow;
  try {
    share = await readShare(c.env, token, true);
  } catch {
    return c.json({ status: 'error' }, 500);
  }
  c.header('Cache-Control', 'no-store');
  if (share.status !== 'ok') {
    return c.json(
      {
        status: share.status,
        sender_name: share.sender_name ?? null,
        sender_phone: share.sender_phone ?? null,
        company_name: share.company_name ?? null,
      },
      refusal(share.status),
    );
  }
  const pack = await conceptPackage(c.env, share);
  return c.json({
    status: 'ok',
    title: pack.title,
    caption: CONCEPT_CAPTION,
    note: share.note ?? null,
    expires_at: share.expires_at,
    sender_name: share.sender_name ?? null,
    sender_phone: share.sender_phone ?? null,
    company_name: share.company_name ?? null,
    images: pack.images.map((i) => ({ key: i.key, group: i.group, label: i.label })),
  });
});

conceptPublicApp.get('/:token/image/:key', async (c) => {
  const token = c.req.param('token');
  const key = c.req.param('key');
  if (!validToken(token) || !/^[a-z0-9_-]{2,80}$/.test(key)) {
    return c.json({ status: 'not_found' }, 404);
  }
  let share: ShareRow;
  try {
    share = await readShare(c.env, token, false);
  } catch {
    return c.json({ status: 'error' }, 500);
  }
  if (share.status !== 'ok') return c.json({ status: share.status }, refusal(share.status));
  const found = (await conceptPackage(c.env, share)).images.find((i) => i.key === key);
  if (!found) return c.json({ status: 'not_found' }, 404);

  // Không lưu ở bộ nhớ đệm dùng chung: link thu hồi thì ảnh phải tắt theo.
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
  if (found.source.kind === 'svg') {
    return new Response(found.source.svg, {
      headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' },
    });
  }
  try {
    const bytes = (await createRenderStore(c.env).get(found.source.uri)).bytes;
    return new Response(bytes as unknown as BodyInit, {
      headers: { ...headers, 'Content-Type': found.source.mime },
    });
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ status: 'error' }, 502);
    throw error;
  }
});
