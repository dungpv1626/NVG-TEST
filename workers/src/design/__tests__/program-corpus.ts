/**
 * Bộ đầu bài đại diện để đo chất lượng chương trình không gian.
 *
 * Vì sao là một BỘ chứ không phải một ca: cái sai Haan bắt được ngày 07/09/2026 (bếp 6 m²
 * trong biệt thự) chỉ lộ ra ở đầu bài LỚN. Sửa cho nó hết sai mà không đo lại nhà phố hẹp thì
 * rất dễ đổi một cái vô lý này lấy một cái vô lý khác — nhà phố 4 m mà phòng khách 40 m².
 *
 * Bảy ca dưới đây trải theo hai trục quyết định mọi thứ: BỀ RỘNG lô (4 → 20 m) và TỔNG SÀN
 * (~120 → ~600 m²). Đầu bài dùng dữ liệu GIẢ LẬP, không lấy từ hồ sơ khách (CLAUDE.md 8.5 T8).
 */

import type { DesignBrief } from '@nvg/shared/design';

const BASE = {
  schema_version: '1.2.0',
  project_id: '11111111-1111-4111-8111-111111111111',
  locality: 'hung_yen',
} as const;

export interface CorpusCase {
  name: string;
  brief: DesignBrief;
}

export const CORPUS: CorpusCase[] = [
  {
    name: 'Nhà phố 4×16, 3 tầng — lô hẹp nhất còn làm được',
    brief: {
      ...BASE,
      building_type: 'nha_pho',
      site: { width_m: 4, depth_m: 16 },
      floors: 3,
      family: [
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 1 },
      ],
      required_spaces: [{ type: 'kitchen' }, { type: 'dining' }],
    } as DesignBrief,
  },
  {
    name: 'Nhà phố 5×18, 3 tầng — cỡ phổ biến nhất của NVO',
    brief: {
      ...BASE,
      building_type: 'nha_pho',
      site: { width_m: 5, depth_m: 18 },
      floors: 3,
      family: [
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 2 },
      ],
      required_spaces: [{ type: 'kitchen' }, { type: 'dining' }, { type: 'garage' }],
    } as DesignBrief,
  },
  {
    name: 'Nhà phố 7×20, 4 tầng — lô rộng, nhiều tầng',
    brief: {
      ...BASE,
      building_type: 'nha_pho',
      site: { width_m: 7, depth_m: 20 },
      floors: 4,
      family: [
        { role: 'ong_ba', count: 2 },
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 3 },
      ],
      required_spaces: [
        { type: 'kitchen' },
        { type: 'dining' },
        { type: 'garage' },
        { type: 'altar_room' },
        { type: 'study' },
      ],
    } as DesignBrief,
  },
  {
    name: 'Biệt thự 15×20, 2 tầng, 3 thế hệ — ca Haan báo lỗi',
    brief: {
      ...BASE,
      building_type: 'biet_thu',
      site: { width_m: 15, depth_m: 20, setback_required_m: { front: 4 } },
      floors: 2,
      family: [
        { role: 'ong_ba', count: 2 },
        { role: 'vo_chong', count: 2, ensuite: true },
        { role: 'con', count: 2 },
        { role: 'nguoi_giup_viec', count: 1 },
        { role: 'khach', count: 1 },
      ],
      required_spaces: [
        { type: 'garage' },
        { type: 'dining' },
        { type: 'kitchen' },
        { type: 'wc' },
        { type: 'storage' },
        { type: 'laundry' },
        { type: 'study' },
        { type: 'altar_room' },
        { type: 'balcony' },
        { type: 'courtyard' },
      ],
    } as DesignBrief,
  },
  {
    name: 'Biệt thự 12×18, 3 tầng — gia đình nhỏ, lô vừa',
    brief: {
      ...BASE,
      building_type: 'biet_thu',
      site: { width_m: 12, depth_m: 18, setback_required_m: { front: 3 } },
      floors: 3,
      family: [
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 1 },
      ],
      required_spaces: [{ type: 'kitchen' }, { type: 'dining' }, { type: 'garage' }],
    } as DesignBrief,
  },
  {
    name: 'Nhà vườn 20×30, 1 tầng — sàn rất rộng, một tầng',
    brief: {
      ...BASE,
      building_type: 'nha_vuon',
      site: { width_m: 20, depth_m: 30 },
      floors: 1,
      family: [
        { role: 'ong_ba', count: 2 },
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 2 },
      ],
      required_spaces: [
        { type: 'kitchen' },
        { type: 'dining' },
        { type: 'garage' },
        { type: 'terrace' },
      ],
    } as DesignBrief,
  },
  {
    name: 'Nhà phố 3,5×12, 2 tầng — lô nhỏ nhất, gia đình hai người',
    brief: {
      ...BASE,
      building_type: 'nha_pho',
      site: { width_m: 3.5, depth_m: 12 },
      floors: 2,
      family: [{ role: 'vo_chong', count: 2 }],
      required_spaces: [{ type: 'kitchen' }],
    } as DesignBrief,
  },
  {
    name: 'Nhà phố 6×18, 5 tầng — nhiều tầng hơn nhu cầu',
    brief: {
      ...BASE,
      building_type: 'nha_pho',
      site: { width_m: 6, depth_m: 18 },
      floors: 5,
      family: [
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 1 },
      ],
      required_spaces: [{ type: 'kitchen' }, { type: 'garage' }],
    } as DesignBrief,
  },
  {
    name: 'Biệt thự 25×40, 2 tầng — lô rất rộng, gia đình đông',
    brief: {
      ...BASE,
      building_type: 'biet_thu',
      site: { width_m: 25, depth_m: 40, setback_required_m: { front: 6, back: 3 } },
      floors: 2,
      family: [
        { role: 'ong_ba', count: 2 },
        { role: 'vo_chong', count: 2, ensuite: true },
        { role: 'con', count: 4 },
        { role: 'nguoi_giup_viec', count: 2 },
        { role: 'khach', count: 2 },
      ],
      required_spaces: [
        { type: 'kitchen' },
        { type: 'dining' },
        { type: 'garage' },
        { type: 'altar_room' },
        { type: 'study' },
        { type: 'laundry' },
        { type: 'courtyard' },
        { type: 'terrace' },
      ],
    } as DesignBrief,
  },
  {
    name: 'Nhà vườn 18×25, 2 tầng — nhiều phòng, sàn rộng',
    brief: {
      ...BASE,
      building_type: 'nha_vuon',
      site: { width_m: 18, depth_m: 25, setback_required_m: { front: 5 } },
      floors: 2,
      family: [
        { role: 'ong_ba', count: 2 },
        { role: 'vo_chong', count: 2, ensuite: true },
        { role: 'con', count: 3 },
        { role: 'khach', count: 2 },
      ],
      required_spaces: [
        { type: 'kitchen' },
        { type: 'dining' },
        { type: 'garage' },
        { type: 'altar_room' },
        { type: 'study' },
        { type: 'laundry' },
        { type: 'terrace' },
      ],
    } as DesignBrief,
  },
];
