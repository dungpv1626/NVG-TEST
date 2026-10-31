/**
 * Trang KHÁCH xem «Bộ ý tưởng» AI Design — không đăng nhập (B5, migration 0259). Gắn dưới `/public/concept`.
 *
 *   GET /public/concept/:token             — tiêu đề trung tính + danh sách ảnh (khoá ảnh, nhãn), ghi một lượt xem
 *                                            (`?xem-truoc=1`: không ghi — nút «Xem như khách»)
 *   GET /public/concept/:token/image/:key  — byte của MỘT ảnh trong bộ, không ghi lượt xem
 *
 * Một cửa như trang mẫu công trình (0179): hàm CSDL `design_concept_public` (chỉ service_role) kiểm link đã được kiến
 * trúc sư duyệt, còn hạn, chưa thu hồi, và trả các mã artifact CHỤP LÚC DUYỆT. Mọi ảnh dựng lại danh sách từ chính các
 * mã đó rồi mới tìm khoá — khoá lạ hay ảnh vẽ SAU lúc duyệt không lọt ra. Mã hồ sơ, mã artifact, địa chỉ trong kho không
 * bao giờ rời Worker.
 *
 * Trả gì: ảnh mặt đứng do mô hình ảnh vẽ, các góc phối cảnh (mặt tiền ngày / tối đứng đầu), ảnh nội thất từng phòng, và
 * «đi xem nhà theo tầng» (`concept-tour.ts`, 31/10/2026): mỗi tầng một câu tóm tắt tất định + sơ đồ công năng dạng CẤU
 * TRÚC (tỉ lệ tương đối, không số đo) để trang khách vẽ và bấm khối ra ảnh phòng — sơ đồ chỉ có khi mọi tầng vừa lô
 * (khách không cần thấy «phần gạch đỏ vượt khỏi lô»). KHÔNG trả tờ mặt đứng SVG (có kích thước, trục), DXF, bảng diện
 * tích, giá, tên khách. Tiêu đề dựng từ đầu bài đã lược danh tính: loại nhà, khổ lô, số tầng.
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
import { conceptZoningTable } from '../kb/concept-zoning-data';
import { createRenderStore, RenderStoreError } from '../render-store';
import { zoningOfDigest } from './concept-routes';
import {
  buildConceptTour,
  orderPerspectives,
  type ConceptTour,
  type TourRoomShot,
} from './concept-tour';
import type { ConceptZoning } from './concept-zoning';
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

interface Source {
  uri: string;
  mime: string;
}

interface PackageImage {
  key: string;
  group: 'mat-dung' | 'phoi-canh' | 'phong';
  label: string;
  /** Phối cảnh đứng đầu phần «Bên ngoài». */
  hero?: boolean;
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
): Promise<{ title: string; images: PackageImage[]; tour: ConceptTour | null }> {
  const projectId = share.project_id!;
  const approvedAt = Date.parse(share.approved_at!);
  const before = (createdAt: string) => Date.parse(createdAt) <= approvedAt;
  const repo = new ArtifactRepository(env);
  const images: PackageImage[] = [];

  const brief = share.brief_artifact_id ? await repo.get(share.brief_artifact_id, projectId) : null;
  const table = conceptZoningTable();
  let title = 'Phương án ý tưởng nhà ở';
  let digest: AiBriefDigest | null = null;
  let zoning: ConceptZoning | null = null;
  if (brief && brief.kind === 'design_brief') {
    // Đầu bài đã lược danh tính (cùng đường các tuyến AI dùng). Khoá service đọc thay phiên người dùng — không có ai
    // đăng nhập; link đã duyệt là căn cứ quyền.
    digest = anonymiseForAi(
      await aiDigestInputs(
        serviceDb(env) as unknown as UserDb,
        projectId,
        brief.payload as DesignBrief,
      ),
    );
    title = conceptTitle(digest);
    zoning = zoningOfDigest(digest);
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
        source: { uri: payload.uri, mime: payload.mime },
      });
      break;
    }
  }

  if (share.image_set_artifact_id) {
    const set = await repo.get(share.image_set_artifact_id, projectId);
    if (set && set.kind === 'ai_image_set') {
      const views = aiPrompts().perspective.views;
      for (const image of orderPerspectives(
        (set.payload as AiImageSet).images,
        table.tour?.heroViews ?? [],
        Object.keys(views),
      )) {
        images.push({
          key: `pc-${image.view}`,
          group: 'phoi-canh',
          label: views[image.view]?.labelVi ?? 'Phối cảnh',
          hero: image.hero,
          source: { uri: image.uri, mime: image.mime },
        });
      }
    }
  }

  if (share.brief_artifact_id) {
    const labels = roomLabels();
    const seen = new Set<string>();
    const shots: TourRoomShot[] = [];
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
      const key = `phong-${artifact.id.replace(/^sha256:/, '')}`;
      shots.push({ imageKey: key, roomKey: payload.room.key, type: payload.room.type });
      images.push({
        key,
        group: 'phong',
        label: labels[payload.room.type] ?? 'Nội thất',
        source: { uri: payload.uri, mime: payload.mime },
      });
    }
    if (digest) {
      const tour = buildConceptTour({ digest, zoning, table, labels, rooms: shots });
      for (const image of images) {
        if (image.group === 'phong') image.label = tour.labels[image.key] ?? image.label;
      }
      return { title, images, tour };
    }
  }
  return { title, images, tour: null };
}

function refusal(status: ShareRow['status']) {
  return status === 'expired' ? 410 : 404;
}

conceptPublicApp.get('/:token', async (c) => {
  const token = c.req.param('token');
  if (!validToken(token)) return c.json({ status: 'not_found' }, 404);
  let share: ShareRow;
  try {
    // «Xem như khách» của trang nội bộ (`?xem-truoc=1`) không tính lượt xem — số đếm chỉ để biết khách đã mở chưa.
    share = await readShare(c.env, token, c.req.query('xem-truoc') !== '1');
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
    images: pack.images.map((i) => ({
      key: i.key,
      group: i.group,
      label: i.label,
      ...(i.hero ? { hero: true } : {}),
    })),
    tour: pack.tour
      ? {
          diagrams: pack.tour.diagrams,
          palette: pack.tour.palette,
          floors: pack.tour.floors,
          others: pack.tour.others,
        }
      : null,
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
