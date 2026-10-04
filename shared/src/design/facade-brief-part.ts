/**
 * Phần MẶT ĐỨNG của đầu bài (`DesignBrief.facade`, T114) ↔ phiếu mặt đứng `AiFacadeBrief` (T59).
 *
 * Từ T114 yêu cầu mặt đứng nằm trong đầu bài — một nguồn dữ liệu, gia chủ trả lời cùng lúc với
 * phần còn lại. Nhưng mọi chỗ dùng phía sau (ghép ý tưởng, kiểm danh mục, lời dẫn mô hình, biểu
 * mẫu) đều đã viết trên hình dạng ĐỦ KHOÁ của phiếu cũ. Hai hàm ở đây đổi qua lại, để những chỗ
 * ấy không phải biết dữ liệu đến từ đâu.
 *
 * Hai khác biệt của phần trong đầu bài so với phiếu:
 *  · mọi khoá đều có thể thiếu (đầu bài lưu dần, và đầu bài cũ không có phần này) — thiếu
 *    nghĩa là «để AI đề xuất», đúng như `null` của phiếu;
 *  · không có `style`: đầu bài đã có câu `style` ở cấp trên. Một câu hỏi, một chỗ ghi.
 */

import type { AiFacadeBrief } from './ai-facade-brief.generated';
import type { DesignBrief } from './design-brief.generated';

export type BriefFacade = NonNullable<DesignBrief['facade']>;

/** Phiên bản hợp đồng `ai-facade-brief` mà hai hàm dưới dựng ra. */
export const FACADE_BRIEF_SCHEMA_VERSION = '1.0.0';

/** Phiếu trống: mọi mục «để AI đề xuất». */
export function emptyFacadeBrief(savedAt = new Date(0).toISOString()): AiFacadeBrief {
  const finish = () => ({ material: null, colour: null });
  const door = () => ({ material: null, colour: null, type: null, h_cm: null });
  return {
    saved_at: savedAt,
    schema_version: FACADE_BRIEF_SCHEMA_VERSION,
    plan_ref: null,
    style: null,
    ground_raise_cm: null,
    roof: { type: null, material: null, colour: null, pitch_deg: null, parapet_cm: null },
    palette: { primary: null, secondary: null, accent: null },
    surfaces: { body: finish(), base: finish(), accent: finish(), trim: finish() },
    main_door: door(),
    side_door: door(),
    window: { material: null, colour: null, glass: null },
    garage_door: { type: null, material: null, colour: null },
    balcony: { railing: null, colour: null, material: null, h_cm: null },
    gate: { wanted: null, type: null, material: null, colour: null, h_cm: null },
    fence: { type: null, material: null, colour: null, h_cm: null },
    decorations: [],
    notes: null,
  };
}

/**
 * Phần mặt đứng của đầu bài → phiếu đủ khoá. `style` lấy từ câu phong cách của đầu bài.
 * Khoá thiếu ở bất cứ cấp nào thành `null` (để AI đề xuất), không bao giờ thành một giá trị
 * mặc định — «chưa trả lời» khác «trả lời là X» (T65).
 */
export function facadeBriefFromBrief(
  part: DesignBrief['facade'] | undefined,
  style: DesignBrief['style'] | undefined,
  savedAt?: string,
): AiFacadeBrief {
  const out = emptyFacadeBrief(savedAt);
  out.style = style ?? null;
  if (!part) return out;
  const merge = <T extends object>(into: T, from: Partial<T> | null | undefined): T => {
    if (!from) return into;
    const next = { ...into };
    for (const [key, value] of Object.entries(from)) {
      if (value !== undefined) (next as Record<string, unknown>)[key] = value;
    }
    return next;
  };
  if (part.ground_raise_cm !== undefined) out.ground_raise_cm = part.ground_raise_cm;
  out.roof = merge(out.roof, part.roof);
  out.palette = merge(out.palette, part.palette);
  out.surfaces = {
    body: merge(out.surfaces.body, part.surfaces?.body),
    base: merge(out.surfaces.base, part.surfaces?.base),
    accent: merge(out.surfaces.accent, part.surfaces?.accent),
    trim: merge(out.surfaces.trim, part.surfaces?.trim),
  };
  out.main_door = merge(out.main_door, part.main_door);
  out.side_door = merge(out.side_door, part.side_door);
  out.window = merge(out.window, part.window);
  out.garage_door = merge(out.garage_door, part.garage_door);
  out.balcony = merge(out.balcony, part.balcony);
  out.gate = merge(out.gate, part.gate);
  out.fence = merge(out.fence, part.fence);
  if (part.decorations) out.decorations = [...part.decorations];
  if (part.notes !== undefined) out.notes = part.notes;
  return out;
}

/** Phiếu đủ khoá → phần mặt đứng để ghi vào đầu bài (bỏ khoá máy chủ và `style`). */
export function briefFacadeFromFacadeBrief(brief: AiFacadeBrief): BriefFacade {
  const {
    schema_version: _version,
    saved_at: _savedAt,
    plan_ref: _planRef,
    style: _style,
    ...rest
  } = brief;
  return structuredClone(rest);
}

/** Số mục kỹ sư / gia chủ đã chốt trong phần mặt đứng — để màn hình nói «đã chọn N mục». */
export function countFacadeAnswers(part: DesignBrief['facade'] | undefined): number {
  if (!part) return 0;
  let n = 0;
  const walk = (value: unknown): void => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value)) n += value.length;
    else if (typeof value === 'object') Object.values(value).forEach(walk);
    else n += 1;
  };
  walk(part);
  return n;
}
