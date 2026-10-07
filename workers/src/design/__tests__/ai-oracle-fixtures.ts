/**
 * Oracle — mặt bằng THẬT đã thi công, mã hoá tay thành cây chia ô (T116, handoff v6 B0).
 *
 * Hồ sơ MR Dương (Thành phố Thái Bình, NVO 08/2026): nhà ống 16,43 × 5 m, 5 tầng, thang U bao thang máy ở cuối nhà,
 * mặt tiền phía trục 4. Nguồn: `KT01-05 - MẶT BẰNG CÔNG NĂNG.dxf`; toạ độ tường lấy từ lớp `NV-Tuong` / `NV-Thay`, quy
 * về trục 1 / trục A rồi đổi sang hệ cây (cm, y = 0 ở mặt tiền): y = (15.770 − x mm) / 10, x = y mm / 10. Ảnh 5 tờ
 * và công cụ trích ở `.sao-luu/t116-oracle/`. Tầng 4 giống tầng 3. Ban công / bồn cây hai đầu ngoài khối: bỏ.
 */
import type { AiPlanTree, AiSpaceProgram } from '@nvg/shared/design';
import { programOf } from './ai-tree-fixtures';

type S = AiSpaceProgram['spaces'][number];
const sp = (id: string, type: string, target: number, ensuite: string | null = null): S => ({
  id,
  type,
  level: 3,
  target_area_m2: target,
  ensuite_of: ensuite,
  why: null,
});
const sp1 = (id: string, type: string, level: number, target: number): S => ({
  id,
  type,
  level,
  target_area_m2: target,
  ensuite_of: null,
  why: null,
});

export const MR_DUONG_BUILDABLE = { x0: 0, y0: 0, x1: 478, y1: 1610 };

/** Đầu bài tối thiểu để suy loại nhà: nhà phố, khối 5 × 16,4 m, hai bên giáp nhà. */
export const MR_DUONG_DIGEST = {
  building_type: 'nha_pho',
  site: { width_m: 5, depth_m: 16.43, adjacent: { left: 'nha_hang_xom', right: 'nha_hang_xom' } },
};

export const MR_DUONG_T3_PROGRAM = programOf([
  sp('master_bedroom_1', 'master_bedroom', 16),
  sp('closet_1', 'closet', 1.8, 'master_bedroom_1'),
  sp('wc_2', 'wc', 3.1, 'master_bedroom_1'),
  sp('circulation_2', 'circulation', 3),
  sp('bedroom_1', 'bedroom', 9.8),
  sp('bedroom_2', 'bedroom', 9.8),
  sp('circulation_1', 'circulation', 8.6),
  sp('circulation_3', 'circulation', 1.7),
  sp('wc_1', 'wc', 3.6),
  sp('circulation_4', 'circulation', 4.3),
  sp('stair_1', 'stair', 10.2),
]);

export const MR_DUONG_T3: AiPlanTree = {
  variant_label: 'MR Dương tầng 3',
  rationale: 'Oracle.',
  also: [],
  no_window: [],
  footprint: [0, 0, 478, 1610],
  nodes: [
    { id: 'root', cut: 'y', at: 520, a: 'f', b: 'r' },
    { id: 'f', cut: 'x', at: 156, a: 'fb', b: 'master_bedroom_1' },
    { id: 'fb', cut: 'y', at: 122, a: 'closet_1', b: 'fb2' },
    { id: 'fb2', cut: 'y', at: 327, a: 'wc_2', b: 'circulation_2' },
    { id: 'r', cut: 'y', at: 1227, a: 'm', b: 'core' },
    { id: 'm', cut: 'x', at: 122, a: 'circulation_1', b: 'mu' },
    { id: 'mu', cut: 'y', at: 800, a: 'bedroom_2', b: 'mu2' },
    { id: 'mu2', cut: 'y', at: 1075, a: 'bedroom_1', b: 'mu3' },
    { id: 'mu3', cut: 'x', at: 238, a: 'circulation_3', b: 'wc_1' },
    { id: 'core', cut: 'x', at: 211, a: 'circulation_4', b: 'stair_1' },
  ],
  doors: [
    { a: 'circulation_2', b: 'circulation_1', kind: 'opening' },
    { a: 'circulation_2', b: 'master_bedroom_1', kind: 'single' },
    { a: 'circulation_2', b: 'wc_2', kind: 'single' },
    { a: 'master_bedroom_1', b: 'closet_1', kind: 'single' },
    { a: 'bedroom_2', b: 'circulation_1', kind: 'single' },
    { a: 'bedroom_1', b: 'circulation_1', kind: 'single' },
    { a: 'circulation_3', b: 'circulation_1', kind: 'opening' },
    { a: 'wc_1', b: 'circulation_3', kind: 'single' },
    { a: 'circulation_1', b: 'circulation_4', kind: 'opening' },
    { a: 'circulation_4', b: 'stair_1', kind: 'opening' },
  ],
  stair: { room: 'stair_1', up: '+y' },
};

/** Tầng 1 (để xe / kinh doanh, WC + thang cuối nhà), tầng 2 (không gian mở), tầng 5 (khách + bếp ăn). */
export const MR_DUONG_OTHERS: [number, AiPlanTree, S[]][] = [
  [
    1,
    {
      variant_label: 'MR Dương tầng 1',
      rationale: 'Oracle.',
      also: [],
      no_window: [],
      footprint: [0, 0, 478, 1610],
      nodes: [
        { id: 'root', cut: 'y', at: 1227, a: 'garage_1', b: 'core' },
        { id: 'core', cut: 'x', at: 195, a: 'circulation_11', b: 'c2' },
        { id: 'c2', cut: 'y', at: 1502, a: 'stair_11', b: 'wc_11' },
      ],
      doors: [
        { a: 'garage_1', b: 'outside', kind: 'garage' },
        { a: 'garage_1', b: 'circulation_11', kind: 'opening' },
        { a: 'circulation_11', b: 'stair_11', kind: 'opening' },
        { a: 'wc_11', b: 'circulation_11', kind: 'single' },
      ],
      stair: { room: 'stair_11', up: '+y' },
    },
    [
      sp1('garage_1', 'garage', 1, 55),
      sp1('circulation_11', 'circulation', 1, 7),
      sp1('stair_11', 'stair', 1, 7.8),
      sp1('wc_11', 'wc', 1, 2.9),
    ],
  ],
  [
    2,
    {
      variant_label: 'MR Dương tầng 2',
      rationale: 'Oracle.',
      also: [],
      no_window: [],
      footprint: [0, 0, 478, 1610],
      nodes: [
        { id: 'root', cut: 'y', at: 1227, a: 'living_2', b: 'core' },
        { id: 'core', cut: 'x', at: 211, a: 'circulation_21', b: 'stair_21' },
      ],
      doors: [
        { a: 'living_2', b: 'circulation_21', kind: 'opening' },
        { a: 'circulation_21', b: 'stair_21', kind: 'opening' },
      ],
      stair: { room: 'stair_21', up: '+y' },
    },
    [
      sp1('living_2', 'living', 2, 55),
      sp1('circulation_21', 'circulation', 2, 7),
      sp1('stair_21', 'stair', 2, 10),
    ],
  ],
  [
    5,
    {
      variant_label: 'MR Dương tầng 5',
      rationale: 'Oracle.',
      also: [{ room: 'living_5', with: ['kitchen_5', 'dining_5'] }],
      no_window: [],
      footprint: [0, 0, 478, 1610],
      nodes: [
        { id: 'root', cut: 'y', at: 100, a: 'balcony_5', b: 'r' },
        { id: 'r', cut: 'y', at: 1075, a: 'living_5', b: 'core' },
        { id: 'core', cut: 'x', at: 205, a: 'circulation_51', b: 'c2' },
        { id: 'c2', cut: 'y', at: 1227, a: 'wc_51', b: 'stair_51' },
      ],
      doors: [
        { a: 'living_5', b: 'balcony_5', kind: 'sliding' },
        { a: 'living_5', b: 'circulation_51', kind: 'double' },
        { a: 'circulation_51', b: 'stair_51', kind: 'opening' },
        { a: 'wc_51', b: 'circulation_51', kind: 'single' },
      ],
      stair: { room: 'stair_51', up: '+y' },
    },
    [
      sp1('balcony_5', 'balcony', 5, 4.7),
      sp1('living_5', 'living', 5, 25),
      sp1('kitchen_5', 'kitchen', 5, 10),
      sp1('dining_5', 'dining', 5, 10),
      sp1('circulation_51', 'circulation', 5, 10),
      sp1('wc_51', 'wc', 5, 4.2),
      sp1('stair_51', 'stair', 5, 7),
    ],
  ],
];
