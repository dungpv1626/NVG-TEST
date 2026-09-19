/**
 * Đầu bài giả lập của riêng NHÁNH AI, và bản đã lược danh tính của chúng.
 *
 * Vì sao không dùng lại `program-corpus.ts`: bộ đó là giàn giáo kiểm thử của BỘ GIẢI và sẽ bị
 * xoá cùng bộ giải (T15, 09/09/2026). Hai chục dòng dữ liệu trùng lặp là giá phải trả cho
 * việc kiểm thử nhánh AI không chết theo — rẻ hơn hẳn việc gỡ rối vào đúng hôm dọn.
 *
 * Dữ liệu GIẢ LẬP, không lấy từ hồ sơ khách (CLAUDE.md 8.5 T8).
 */

import type { AiBriefDigest, DesignBrief } from '@nvg/shared/design';
import { anonymiseForAi } from '../brief/anonymise';

const BASE = {
  schema_version: '1.2.0',
  project_id: '11111111-1111-4111-8111-111111111111',
  locality: 'hung_yen',
} as const;

/** Nhà phố 5×18, 3 tầng — lô hẹp và sâu, ca thường gặp nhất của NVO. */
export const TOWNHOUSE: DesignBrief = {
  ...BASE,
  building_type: 'nha_pho',
  site: { width_m: 5, depth_m: 18 },
  floors: 3,
  family: [
    { role: 'vo_chong', count: 2 },
    { role: 'con', count: 2 },
  ],
  required_spaces: [
    { type: 'living' },
    { type: 'kitchen' },
    { type: 'dining' },
    { type: 'wc' },
    { type: 'garage' },
  ],
} as DesignBrief;

/** Biệt thự 15×20, 2 tầng — lô rộng, ba thế hệ; đầu bài lớn mới lộ ra cái vô lý về diện tích. */
export const VILLA: DesignBrief = {
  ...BASE,
  building_type: 'biet_thu',
  site: { width_m: 15, depth_m: 20, setback_required_m: { front: 4 } },
  floors: 2,
  family: [
    { role: 'ong_ba', count: 2 },
    { role: 'vo_chong', count: 2, ensuite: true },
    { role: 'con', count: 2 },
  ],
  required_spaces: [
    { type: 'living' },
    { type: 'kitchen' },
    { type: 'dining' },
    { type: 'wc' },
    { type: 'garage' },
    { type: 'altar_room' },
  ],
} as DesignBrief;

export function digestOf(brief: DesignBrief): AiBriefDigest {
  return anonymiseForAi({ brief });
}
