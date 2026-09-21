/**
 * Cửa vào của bước Phối cảnh (T67) cho phần còn lại của Worker — bọc mỏng quanh bộ vẽ thuần, để
 * tuyến không phải tự đi lấy quy ước trình bày, danh mục mặt đứng và nhóm phòng ngoài trời.
 *
 * Cùng vai trò với `ai/facade/index.ts`, và cùng một ràng buộc: **một hàm cho cả hai nơi gọi**.
 * Tuyến phát tờ neo ra và tuyến nhận tờ neo về phải dựng lại ĐÚNG một hình, nếu không phép đối
 * chiếu cỡ khung chỉ bắt được chính nó.
 */

import type { AiFacadeConcept, AiFloorPlan, DesignBrief } from '@nvg/shared/design';
import { siteGeometry } from '@nvg/shared/design';
import { facadeVocabulary } from '../../kb/facade-vocabulary-data';
import { roomGroups } from '../../kb/vocabulary';
import { roomVocabulary } from '../../kb/vocabulary-data';
import type { Pt } from '../draw/geometry';
import { renderRoofPlanAnchor, type RoofPlanAnchorResult } from '../draw/roof-plan';
import { sheetStyle } from '../draw/style-data';

/**
 * Ranh thửa đổi sang cm, cùng gốc toạ độ với mặt bằng (góc trước-trái thửa).
 *
 * MỘT hàm cho mọi nơi gọi, cùng lý do như `roofPlanAnchor`: tuyến phát tờ neo và tuyến nhận tờ
 * neo về phải dựng ĐÚNG một hình, nếu không phép đối chiếu cỡ khung bác luôn tờ hợp lệ.
 *
 * Đầu bài chưa khai bề rộng hoặc chiều sâu thửa thì trả `null` — tờ vẽ khi ấy không có ranh, chứ
 * không có một ranh đoán (CLAUDE.md 5.2).
 */
export function lotBoundaryCm(brief: DesignBrief | null): Pt[] | null {
  const site = brief?.site;
  if (!site || typeof site.width_m !== 'number' || typeof site.depth_m !== 'number') return null;
  const boundary = siteGeometry(site).boundary;
  return boundary.length >= 3 ? boundary.map(([x, y]) => [x * 100, y * 100] as Pt) : null;
}

/** Tờ mặt bằng mái — ảnh neo của hai góc `oblique` và `aerial`. */
export function roofPlanAnchor(
  plan: AiFloorPlan,
  concept: AiFacadeConcept,
  brief: DesignBrief | null,
): RoofPlanAnchorResult {
  return renderRoofPlanAnchor(plan, concept, {
    style: sheetStyle(),
    vocab: facadeVocabulary(),
    outdoor: new Set(roomGroups(roomVocabulary().vocabulary).outdoor ?? []),
    lotBoundary: lotBoundaryCm(brief),
  });
}
