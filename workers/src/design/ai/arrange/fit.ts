/**
 * Độ khớp Ý ĐỊNH của một tầng đã qua cổng — đo trên phòng LỌT LÒNG thật (T43).
 *
 * Ba phần, trọng số ở `kb/plan_quality.yaml` mục `intent_fit`:
 *  · vùng — phòng nằm đúng vùng mô hình khai: 1; lệch một ô: 0,5; xa hơn: 0. Đo sau khi chiếu lên lưới
 *    hiệu dụng — lô một cột không có trái/phải để lệch;
 *  · quan hệ — `adjacent` chung vách; `near` chung vách hoặc tâm gần; `far` không chung vách và tâm xa;
 *  · mặt đường — phòng muốn ra mặt đường có cạnh ở mặt trước hình bao.
 *
 * Phần nào không có gì để đo (không quan hệ nào, không phòng nào đòi mặt đường) thì tính đủ — thiếu
 * yêu cầu không phải là trượt yêu cầu.
 */

import type { AiPlanRoomsLevel } from '@nvg/shared/design';
import { toRect, type Rect } from '../draw/geometry';
import type { IntentFitWeights } from '../plan-quality';
import { projectedDistance, zoneOfRect } from './grid';
import type { LevelIntent } from './intent';

/** Hai phòng lọt lòng coi là chung vách khi khe giữa không quá bức dày nhất và đoạn chung đủ dài. */
const WALL_GAP_CM = 25;
const SHARED_MIN_CM = 60;

export interface IntentFit {
  zone: number;
  relationship: number;
  street: number;
  total: number;
}

export function intentFit(
  level: AiPlanRoomsLevel,
  footprint: Rect,
  intent: LevelIntent,
  weights: IntentFitWeights,
): IntentFit {
  const rects = new Map(level.rooms.map((room) => [room.id, toRect(room.rect)]));

  const zoned = intent.leaves.filter((leaf) => !leaf.ensuiteOf && rects.has(leaf.id));
  const zone = zoned.length
    ? zoned.reduce((sum, leaf) => {
        const d = projectedDistance(
          footprint,
          zoneOfRect(footprint, rects.get(leaf.id)!),
          leaf.zone,
        );
        return sum + (d === 0 ? 1 : d === 1 ? 0.5 : 0);
      }, 0) / zoned.length
    : 1;

  const relations = intent.relations.filter((rel) => rects.has(rel.a) && rects.has(rel.b));
  const relationship = relations.length
    ? relations.reduce((sum, rel) => {
        const a = rects.get(rel.a)!;
        const b = rects.get(rel.b)!;
        const touching = adjacent(a, b);
        const distance = centreDistance(a, b) / 100;
        if (rel.kind === 'adjacent') return sum + (touching ? 1 : 0);
        if (rel.kind === 'near') return sum + (touching || distance <= weights.nearM ? 1 : 0);
        return sum + (!touching && distance >= weights.farM ? 1 : touching ? 0 : 0.5);
      }, 0) / relations.length
    : 1;

  const streetLeaves = zoned.filter((leaf) => leaf.street);
  const street = streetLeaves.length
    ? streetLeaves.filter((leaf) => rects.get(leaf.id)!.y0 - footprint.y0 <= WALL_GAP_CM).length /
      streetLeaves.length
    : 1;

  const sum = weights.zone + weights.relationship + weights.street;
  const total =
    sum > 0
      ? (weights.zone * zone + weights.relationship * relationship + weights.street * street) / sum
      : 1;
  return { zone, relationship, street, total };
}

function adjacent(a: Rect, b: Rect): boolean {
  const gapX = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
  const gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return (
    (gapX >= 0 && gapX <= WALL_GAP_CM && overlapY >= SHARED_MIN_CM) ||
    (gapY >= 0 && gapY <= WALL_GAP_CM && overlapX >= SHARED_MIN_CM)
  );
}

function centreDistance(a: Rect, b: Rect): number {
  return Math.hypot((a.x0 + a.x1 - b.x0 - b.x1) / 2, (a.y0 + a.y1 - b.y0 - b.y1) / 2);
}
