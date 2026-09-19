/**
 * Khoảng lùi và mật độ THỰC SỰ áp dụng — một phép tính, ba nơi dùng.
 *
 * Hai giới hạn này đến từ HAI nguồn: gói quy tắc (mức chung của loại hình, QCVN 01:2021/BXD)
 * và đầu bài (chỉ giới đã cắm, giấy phép quy hoạch của chính thửa đó). Câu hỏi duy nhất là
 * trộn chúng thế nào — và cho tới 07/09/2026 mỗi lớp trả lời một kiểu:
 *
 *  · Lớp 2 (`program/engine.ts`) lấy đầu bài GHI ĐÈ gói quy tắc: `brief ?? pack`.
 *  · Bộ giải (`compute/…/solver/model.py::setbacks_m`, `max_density`) lấy mức CHẶT hơn:
 *    `max(pack, brief)` cho khoảng lùi, `min(pack, brief)` cho mật độ.
 *
 * Hệ quả: đầu bài khai khoảng lùi trước 1 m ở nơi gói quy tắc đòi 3 m thì Lớp 2 soạn chương
 * trình trên một mặt sàn sâu hơn 2 m so với phần bộ giải cho phép xây. Không lỗi, không cảnh
 * báo — chỉ là một chương trình không gian mà bộ giải không thể thực hiện, và cái hiện ra là
 * phương án vô nghiệm hoặc các phòng bị bóp lại mà không ai biết vì sao.
 *
 * Tệp này chốt theo **bộ giải**, vì đó là lớp CƯỠNG CHẾ: lớp soạn đề mà rộng tay hơn lớp thi
 * hành thì phần chênh luôn biến thành thất bại ở cuối. Chọn ngược lại — nới bộ giải theo đầu
 * bài — là để một ô nhập của người dùng nới quy chuẩn quốc gia.
 *
 * Đây KHÔNG phải đánh giá vị từ hình học (CLAUDE.md 8.7): nó chỉ đọc hai con số đã khai sẵn
 * trong rule pack và so với hai con số của đầu bài. Vị từ hình học vẫn chỉ có một bản cài đặt,
 * ở Container.
 */

import type { DesignBrief } from '@nvg/shared/design';
import type { RulePack } from '../rules/rule-pack';

export const SIDES = ['front', 'back', 'left', 'right'] as const;
export type Side = (typeof SIDES)[number];

/**
 * Trộn khoảng lùi của gói quy tắc với khoảng lùi khai trong đầu bài — lấy mức CHẶT hơn.
 *
 * Tách riêng khỏi `effectiveSetbacks` vì Lớp 3a không cầm `RulePack` mà cầm `RuleCatalogue`
 * (gói đã lọc sẵn theo loại hình). Hai lối vào, một phép trộn.
 */
export function strictestSetbacks(
  packSetbacks: Readonly<Record<string, number>>,
  brief: DesignBrief,
): Record<Side, number> {
  const declared = brief.site.setback_required_m ?? {};
  const out = {} as Record<Side, number>;
  for (const side of SIDES) out[side] = Math.max(packSetbacks[side] ?? 0, declared[side] ?? 0);
  return out;
}

/** Khoảng lùi từng cạnh, mét — mức CHẶT hơn giữa gói quy tắc và đầu bài. */
export function effectiveSetbacks(brief: DesignBrief, rules: RulePack): Record<Side, number> {
  return strictestSetbacks(rules.setbacks(brief.building_type), brief);
}

/**
 * Mật độ xây dựng trần (0..1) — mức CHẶT hơn giữa gói quy tắc và đầu bài.
 *
 * `null` nghĩa là KHÔNG BIẾT, không phải "không giới hạn": nơi gọi phải tự quyết nói gì với
 * người dùng. Trả về 1.0 ở đây là biến "chưa có chỉ tiêu quy hoạch" thành "được phủ kín lô".
 */
export function effectiveMaxDensity(brief: DesignBrief, rules: RulePack): number | null {
  const pack = rules.maxDensity(brief.building_type);
  const declared = brief.site.max_density ?? null;
  if (pack === null || pack === undefined) return declared;
  if (declared === null) return pack;
  return Math.min(pack, declared);
}
