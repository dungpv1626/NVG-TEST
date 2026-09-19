/**
 * Cây chia viết tay — hai ngôi nhà, mọi tầng (T37).
 *
 * Đây là thứ mô hình SẼ trả về ở luồng mới: mỗi tầng một cây. Không có một toạ độ phòng nào ở
 * đây — chỉ nhát cắt, cửa nối phòng nào với phòng nào, và thang. Mọi con số còn lại là việc của
 * `ai/tree/`, và phép thử đòi các cây này đi qua trọn cổng kiểm không một lỗi nào.
 *
 * ⚠️ Cũng như `ai-plan-fixtures.ts`, đây là ca thử CHƯƠNG TRÌNH, không phải mặt bằng hay: phòng
 * ngủ 3 của biệt thự phải đi xuyên phòng ngủ 2, nhà phố có phòng không cửa sổ. Bộ chấm trừ điểm
 * những chỗ ấy là đúng; cổng thì không được chặn.
 *
 * Toạ độ: cm, gốc góc trước-trái lô đất, `x` dọc mặt tiền, `y` vào sâu.
 */

import type { AiPlanTree, AiSpaceProgram } from '@nvg/shared/design';

type Space = AiSpaceProgram['spaces'][number];

const space = (
  id: string,
  type: string,
  level: number,
  target: number,
  ensuite: string | null = null,
): Space => ({ id, type, level, target_area_m2: target, ensuite_of: ensuite, why: null });

export function programOf(spaces: Space[]): AiSpaceProgram {
  return {
    schema_version: '1.0.0',
    brief_ref: `sha256:${'7'.repeat(64)}`,
    spaces,
    rationale: 'Chương trình dựng cho fixture cây chia.',
    assumptions: [],
    generator: {
      kind: 'ai',
      provider: 'fixture',
      model: 'hand',
      route: 'fixture',
      prompt_version: '0.0.0',
    },
  };
}

const empty = (): Pick<AiPlanTree, 'also' | 'no_window' | 'variant_label' | 'rationale'> => ({
  also: [],
  no_window: [],
  variant_label: null,
  rationale: 'Fixture.',
});

// ── Nhà phố 4 × 15 m, 3 tầng, hai bên giáp nhà hàng xóm, giếng trời sau nhà ──────────────────

export const TOWNHOUSE_BUILDABLE = { x0: 0, y0: 0, x1: 400, y1: 1500 };

export const TOWNHOUSE_PROGRAM = programOf([
  space('garage_1', 'garage', 1, 11),
  space('living_1', 'living', 1, 12),
  space('kitchen_1', 'kitchen', 1, 8),
  space('dining_1', 'dining', 1, 4),
  space('wc_1', 'wc', 1, 3),
  space('stair_1', 'stair', 1, 9),
  space('light_well_1', 'light_well', 1, 4),
  space('bedroom_1', 'bedroom', 2, 14),
  space('bedroom_2', 'bedroom', 2, 15),
  space('circulation_1', 'circulation', 2, 6),
  space('wc_2', 'wc', 2, 3, 'bedroom_2'),
  space('stair_2', 'stair', 2, 9),
  space('light_well_2', 'light_well', 2, 4),
  space('bedroom_3', 'bedroom', 3, 14),
  space('study_1', 'study', 3, 13),
  space('circulation_2', 'circulation', 3, 8),
  space('wc_3', 'wc', 3, 3),
  space('stair_3', 'stair', 3, 9),
  space('light_well_3', 'light_well', 3, 4),
]);

export const TOWNHOUSE_TREES: AiPlanTree[] = [
  {
    ...empty(),
    variant_label: 'Lõi thang sau nhà, giếng trời cuối lô',
    footprint: [0, 0, 400, 1500],
    nodes: [
      { id: 'root', cut: 'y', at: 390, a: 'garage_1', b: 'n1' },
      { id: 'n1', cut: 'y', at: 800, a: 'living_1', b: 'n2' },
      { id: 'n2', cut: 'y', at: 1160, a: 'kitchen_1', b: 'n3' },
      { id: 'n3', cut: 'y', at: 1380, a: 'n4', b: 'light_well_1' },
      { id: 'n4', cut: 'x', at: 160, a: 'wc_1', b: 'stair_1' },
    ],
    also: [{ room: 'kitchen_1', with: ['dining_1'] }],
    doors: [
      { a: 'garage_1', b: 'outside', kind: 'garage' },
      { a: 'garage_1', b: 'living_1', kind: 'single' },
      { a: 'living_1', b: 'kitchen_1', kind: 'opening' },
      { a: 'kitchen_1', b: 'stair_1', kind: 'opening' },
      { a: 'kitchen_1', b: 'wc_1', kind: 'single' },
    ],
    stair: { room: 'stair_1', up: '-y' },
  },
  {
    ...empty(),
    footprint: [0, 0, 400, 1500],
    nodes: [
      { id: 'root', cut: 'y', at: 440, a: 'bedroom_1', b: 'n1' },
      { id: 'n1', cut: 'y', at: 1160, a: 'n2', b: 'n3' },
      { id: 'n2', cut: 'x', at: 260, a: 'bedroom_2', b: 'circulation_1' },
      { id: 'n3', cut: 'y', at: 1380, a: 'n4', b: 'light_well_2' },
      { id: 'n4', cut: 'x', at: 160, a: 'wc_2', b: 'stair_2' },
    ],
    doors: [
      { a: 'bedroom_1', b: 'circulation_1', kind: 'single' },
      { a: 'bedroom_2', b: 'circulation_1', kind: 'single' },
      { a: 'circulation_1', b: 'stair_2', kind: 'opening' },
      { a: 'bedroom_2', b: 'wc_2', kind: 'single' },
    ],
    stair: { room: 'stair_2', up: '-y' },
  },
  {
    ...empty(),
    footprint: [0, 0, 400, 1500],
    nodes: [
      { id: 'root', cut: 'y', at: 440, a: 'bedroom_3', b: 'n1' },
      { id: 'n1', cut: 'y', at: 1160, a: 'n2', b: 'n3' },
      { id: 'n2', cut: 'x', at: 260, a: 'study_1', b: 'circulation_2' },
      { id: 'n3', cut: 'y', at: 1380, a: 'n4', b: 'light_well_3' },
      { id: 'n4', cut: 'x', at: 160, a: 'wc_3', b: 'stair_3' },
    ],
    doors: [
      { a: 'bedroom_3', b: 'circulation_2', kind: 'single' },
      { a: 'study_1', b: 'circulation_2', kind: 'single' },
      { a: 'circulation_2', b: 'stair_3', kind: 'opening' },
      { a: 'study_1', b: 'wc_3', kind: 'single' },
    ],
    stair: null,
  },
];

// ── Biệt thự 15 × 20 m, lùi trước 4 m, 2 tầng, sân bên phía trước-phải (nhà chữ L) ───────────

export const VILLA_BUILDABLE = { x0: 0, y0: 400, x1: 1500, y1: 2000 };

export const VILLA_PROGRAM = programOf([
  space('garage_1', 'garage', 1, 26),
  space('circulation_1', 'circulation', 1, 16),
  space('bedroom_1', 'bedroom', 1, 21),
  space('stair_1', 'stair', 1, 18),
  space('wc_1', 'wc', 1, 15),
  space('living_1', 'living', 1, 40),
  space('dining_1', 'dining', 1, 15),
  space('kitchen_1', 'kitchen', 1, 45),
  space('circulation_2', 'circulation', 2, 20),
  space('master_bedroom_1', 'master_bedroom', 2, 20),
  space('balcony_1', 'balcony', 2, 20),
  space('stair_2', 'stair', 2, 18),
  space('wc_2', 'wc', 2, 15, 'bedroom_2'),
  space('bedroom_2', 'bedroom', 2, 50),
  space('bedroom_3', 'bedroom', 2, 45),
]);

export const VILLA_TREES: AiPlanTree[] = [
  {
    ...empty(),
    variant_label: 'Sảnh giữa, sân bên phía trước',
    footprint: [0, 400, 1500, 1950],
    nodes: [
      { id: 'root', cut: 'y', at: 1000, a: 'n1', b: 'n2' },
      { id: 'n1', cut: 'x', at: 1200, a: 'n3', b: 'unbuilt_1' },
      { id: 'n3', cut: 'x', at: 500, a: 'garage_1', b: 'n4' },
      { id: 'n4', cut: 'x', at: 800, a: 'circulation_1', b: 'bedroom_1' },
      { id: 'n2', cut: 'x', at: 400, a: 'n5', b: 'n6' },
      { id: 'n5', cut: 'y', at: 1500, a: 'stair_1', b: 'wc_1' },
      { id: 'n6', cut: 'x', at: 1000, a: 'living_1', b: 'kitchen_1' },
    ],
    also: [{ room: 'living_1', with: ['dining_1'] }],
    doors: [
      { a: 'garage_1', b: 'outside', kind: 'garage' },
      { a: 'circulation_1', b: 'outside', kind: 'double' },
      { a: 'circulation_1', b: 'garage_1', kind: 'single' },
      { a: 'circulation_1', b: 'bedroom_1', kind: 'single' },
      { a: 'circulation_1', b: 'living_1', kind: 'opening' },
      { a: 'living_1', b: 'kitchen_1', kind: 'opening' },
      { a: 'living_1', b: 'stair_1', kind: 'opening' },
      { a: 'living_1', b: 'wc_1', kind: 'single' },
    ],
    stair: { room: 'stair_1', up: '+y' },
  },
  {
    ...empty(),
    footprint: [0, 400, 1500, 1950],
    nodes: [
      { id: 'root', cut: 'y', at: 1000, a: 'n1', b: 'n2' },
      { id: 'n1', cut: 'x', at: 1200, a: 'n3', b: 'unbuilt_1' },
      { id: 'n3', cut: 'x', at: 400, a: 'circulation_2', b: 'n4' },
      { id: 'n4', cut: 'x', at: 800, a: 'master_bedroom_1', b: 'balcony_1' },
      { id: 'n2', cut: 'x', at: 400, a: 'n5', b: 'n6' },
      { id: 'n5', cut: 'y', at: 1500, a: 'stair_2', b: 'wc_2' },
      { id: 'n6', cut: 'x', at: 1000, a: 'bedroom_2', b: 'bedroom_3' },
    ],
    doors: [
      { a: 'circulation_2', b: 'stair_2', kind: 'opening' },
      { a: 'circulation_2', b: 'master_bedroom_1', kind: 'single' },
      { a: 'master_bedroom_1', b: 'balcony_1', kind: 'sliding' },
      { a: 'stair_2', b: 'bedroom_2', kind: 'single' },
      { a: 'bedroom_2', b: 'wc_2', kind: 'single' },
      { a: 'bedroom_2', b: 'bedroom_3', kind: 'single' },
    ],
    stair: null,
  },
];

// ── Lượt chạy THẬT 13/09/2026 (V-26) — biệt thự 15 × 20 m, gpt-5 mức Thấp, tầng 1 ──────────────
//
// Hai cây nguyên văn mô hình trả về, đọc lại từ trạng thái Workflow cục bộ. Không sửa một ký tự:
// giá trị của ca thử nằm đúng ở chỗ nó là lỗi thật, không phải lỗi dựng tay.
//
//  · lượt 1 — cây hợp lý, CHỈ quên cửa cho `storage_1` (kho giáp thang, WC và phòng giúp việc).
//    Cổng cũ bác cả phương án. Chương trình phải tự mở cửa kho → thang và cho qua.
//  · lượt lấy mẫu lại — hai cửa nối hai phòng không chung vách; bỏ đi thì `bedroom_2` (phòng giúp
//    việc) chỉ còn giáp kho, WC chung và tủ đồ + WC khép kín của ông bà. Không có lối đi nào tử tế
//    → vẫn phải bị bác, và câu lỗi phải nói phòng ấy đang giáp những phòng nào.

export const REAL_0913_BUILDABLE = { x0: 200, y0: 300, x1: 1500, y1: 2000 };

export const REAL_0913_PROGRAM = programOf([
  space('living_1', 'living', 1, 55),
  space('dining_1', 'dining', 1, 20),
  space('kitchen_1', 'kitchen', 1, 16),
  space('garage_1', 'garage', 1, 28),
  space('wc_1', 'wc', 1, 3.5),
  space('storage_1', 'storage', 1, 3),
  space('bedroom_1', 'bedroom', 1, 25),
  space('wc_2', 'wc', 1, 3.5, 'bedroom_1'),
  space('closet_1', 'closet', 1, 2, 'bedroom_1'),
  space('bedroom_2', 'bedroom', 1, 15),
  space('stair_1', 'stair', 1, 12),
  space('circulation_1', 'circulation', 1, 8),
]);

export const REAL_0913_FIRST: AiPlanTree = {
  variant_label:
    'Thang giữa áp tường phải, khách-mặt tiền, bếp-ăn giữa nhà, phòng ông bà cuối vườn',
  rationale:
    'Đặt lõi thang giữa áp tường phải (giáp nhà hàng xóm) để giải phóng các mặt thoáng trước-trái-sau cho không gian ở.',
  footprint: [200, 300, 1500, 2000],
  nodes: [
    { id: 'root', cut: 'y', at: 1000, a: 'n_front', b: 'n_back' },
    { id: 'n_front', cut: 'x', at: 1100, a: 'living_1', b: 'garage_1' },
    { id: 'n_back', cut: 'x', at: 1100, a: 'n_left_back_all', b: 'n_right_service_all' },
    { id: 'n_left_back_all', cut: 'x', at: 950, a: 'n_left_functional', b: 'circulation_1' },
    { id: 'n_left_functional', cut: 'y', at: 1550, a: 'kitchen_1', b: 'n_suite_zone' },
    { id: 'n_suite_zone', cut: 'x', at: 350, a: 'n_ensuite_band', b: 'bedroom_1' },
    { id: 'n_ensuite_band', cut: 'y', at: 1800, a: 'wc_2', b: 'closet_1' },
    { id: 'n_right_service_all', cut: 'y', at: 1300, a: 'stair_1', b: 'n_service_tail' },
    { id: 'n_service_tail', cut: 'y', at: 1550, a: 'n_mid_service', b: 'bedroom_2' },
    { id: 'n_mid_service', cut: 'x', at: 1375, a: 'wc_1', b: 'storage_1' },
  ],
  also: [{ room: 'kitchen_1', with: ['dining_1'] }],
  doors: [
    { a: 'garage_1', b: 'outside', kind: 'garage' },
    { a: 'living_1', b: 'outside', kind: 'double' },
    { a: 'living_1', b: 'circulation_1', kind: 'opening' },
    { a: 'garage_1', b: 'stair_1', kind: 'single' },
    { a: 'circulation_1', b: 'stair_1', kind: 'single' },
    { a: 'circulation_1', b: 'kitchen_1', kind: 'opening' },
    { a: 'circulation_1', b: 'wc_1', kind: 'single' },
    { a: 'circulation_1', b: 'bedroom_1', kind: 'single' },
    { a: 'circulation_1', b: 'bedroom_2', kind: 'single' },
    { a: 'bedroom_1', b: 'wc_2', kind: 'single' },
    { a: 'bedroom_1', b: 'closet_1', kind: 'single' },
  ],
  stair: { room: 'stair_1', up: '+y' },
  no_window: [],
};

export const REAL_0913_RESAMPLED: AiPlanTree = {
  variant_label: 'Thang giữa áp tường phải, khách ra trước, bếp–ăn giữa nhà, ngủ sau',
  rationale:
    'Đặt lõi thang giữa nhà tựa tường phải để gom giao thông; trước là khách thoáng nhìn sân, giữa là bếp–ăn liên thông, sau là khối ngủ yên tĩnh.',
  footprint: [200, 300, 1500, 2000],
  nodes: [
    { id: 'root', cut: 'y', at: 900, a: 'n1', b: 'n2' },
    { id: 'n1', cut: 'x', at: 1140, a: 'living_1', b: 'garage_1' },
    { id: 'n2', cut: 'y', at: 1520, a: 'n3', b: 'n4' },
    { id: 'n3', cut: 'x', at: 1140, a: 'n6', b: 'n5' },
    { id: 'n6', cut: 'x', at: 1000, a: 'kitchen_1', b: 'circulation_1' },
    { id: 'n5', cut: 'y', at: 1230, a: 'stair_1', b: 'n9' },
    { id: 'n9', cut: 'y', at: 1350, a: 'unbuilt_1', b: 'n10' },
    { id: 'n10', cut: 'x', at: 1340, a: 'wc_1', b: 'storage_1' },
    { id: 'n4', cut: 'x', at: 1140, a: 'n7', b: 'bedroom_2' },
    { id: 'n7', cut: 'x', at: 940, a: 'bedroom_1', b: 'n8' },
    { id: 'n8', cut: 'y', at: 1760, a: 'closet_1', b: 'wc_2' },
  ],
  also: [{ room: 'kitchen_1', with: ['dining_1'] }],
  doors: [
    { a: 'living_1', b: 'outside', kind: 'double' },
    { a: 'garage_1', b: 'outside', kind: 'garage' },
    { a: 'living_1', b: 'kitchen_1', kind: 'opening' },
    { a: 'living_1', b: 'circulation_1', kind: 'opening' },
    { a: 'circulation_1', b: 'stair_1', kind: 'opening' },
    { a: 'circulation_1', b: 'wc_1', kind: 'single' },
    { a: 'circulation_1', b: 'storage_1', kind: 'single' },
    { a: 'circulation_1', b: 'bedroom_2', kind: 'single' },
    { a: 'kitchen_1', b: 'bedroom_1', kind: 'single' },
    { a: 'bedroom_1', b: 'wc_2', kind: 'single' },
    { a: 'bedroom_1', b: 'closet_1', kind: 'single' },
    { a: 'garage_1', b: 'stair_1', kind: 'single' },
  ],
  stair: { room: 'stair_1', up: '+y' },
  no_window: ['storage_1'],
};

// ── Hai lượt thật 13/09/2026 (V-27): cây ĐÃ QUA CỔNG CŨ nhưng vào phòng phải đi xuyên phòng khác ──
//
// Chép nguyên `levels[].tree` của hai artifact `ai_floor_plan` — `2958f661…` (Claude Sonnet 5) và
// `db9e45a4…` (gpt-5) — cùng chương trình `bd6c6e10…`. Sonnet: kho qua WC, phòng thờ qua phòng làm
// việc, giặt phơi và WC qua phòng ngủ 4. gpt-5: giặt phơi qua WC, phòng ngủ 4 qua phòng ngủ 5, phòng
// làm việc qua phòng ngủ chính. Cổng mới phải bác hoặc chuyển lối vào — không bao giờ cho qua im lặng.

export const REAL_0913B_PROGRAM = programOf([
  space('living_1', 'living', 1, 55),
  space('dining_1', 'dining', 1, 24),
  space('kitchen_1', 'kitchen', 1, 18),
  space('bedroom_1', 'bedroom', 1, 28),
  space('wc_1', 'wc', 1, 4, 'bedroom_1'),
  space('bedroom_2', 'bedroom', 1, 15),
  space('garage_1', 'garage', 1, 24),
  space('storage_1', 'storage', 1, 4),
  space('wc_2', 'wc', 1, 4),
  space('stair_1', 'stair', 1, 16),
  space('circulation_1', 'circulation', 1, 10),
  space('master_bedroom_1', 'master_bedroom', 2, 36),
  space('wc_3', 'wc', 2, 5, 'master_bedroom_1'),
  space('balcony_1', 'balcony', 2, 6, 'master_bedroom_1'),
  space('bedroom_3', 'bedroom', 2, 22),
  space('balcony_2', 'balcony', 2, 4, 'bedroom_3'),
  space('bedroom_4', 'bedroom', 2, 22),
  space('balcony_3', 'balcony', 2, 4, 'bedroom_4'),
  space('bedroom_5', 'bedroom', 2, 15),
  space('wc_4', 'wc', 2, 5),
  space('laundry_1', 'laundry', 2, 8),
  space('altar_room_1', 'altar_room', 2, 14),
  space('study_1', 'study', 2, 15),
  space('stair_2', 'stair', 2, 16),
  space('circulation_2', 'circulation', 2, 10),
]);

export const REAL_0913B_SONNET: AiPlanTree[] = [
  {
    variant_label: 'Thang giữa nhà sát vách phải, giếng trời sau thang',
    rationale: 'Cây lưu trong artifact — rationale gốc đã gộp vào artifact.',
    also: [
      {
        room: 'kitchen_1',
        with: ['dining_1'],
      },
    ],
    doors: [
      {
        a: 'garage_1',
        b: 'outside',
        kind: 'garage',
      },
      {
        a: 'garage_1',
        b: 'living_1',
        kind: 'single',
      },
      {
        a: 'living_1',
        b: 'outside',
        kind: 'double',
      },
      {
        a: 'living_1',
        b: 'kitchen_1',
        kind: 'opening',
      },
      {
        a: 'kitchen_1',
        b: 'bedroom_2',
        kind: 'single',
      },
      {
        a: 'kitchen_1',
        b: 'bedroom_1',
        kind: 'single',
      },
      {
        a: 'bedroom_1',
        b: 'wc_1',
        kind: 'single',
      },
      {
        a: 'kitchen_1',
        b: 'stair_1',
        kind: 'opening',
      },
      {
        a: 'stair_1',
        b: 'circulation_1',
        kind: 'opening',
      },
      {
        a: 'circulation_1',
        b: 'wc_2',
        kind: 'single',
      },
      {
        a: 'wc_2',
        b: 'storage_1',
        kind: 'single',
      },
    ],
    footprint: [200, 300, 1500, 2000],
    no_window: ['wc_1', 'wc_2', 'storage_1', 'stair_1'],
    nodes: [
      {
        a: 'n2',
        at: 900,
        b: 'n3',
        cut: 'y',
        id: 'n1',
      },
      {
        a: 'garage_1',
        at: 600,
        b: 'living_1',
        cut: 'x',
        id: 'n2',
      },
      {
        a: 'n4',
        at: 1000,
        b: 'n7',
        cut: 'x',
        id: 'n3',
      },
      {
        a: 'kitchen_1',
        at: 1350,
        b: 'n5',
        cut: 'y',
        id: 'n4',
      },
      {
        a: 'bedroom_2',
        at: 500,
        b: 'n6',
        cut: 'x',
        id: 'n5',
      },
      {
        a: 'bedroom_1',
        at: 850,
        b: 'wc_1',
        cut: 'x',
        id: 'n6',
      },
      {
        a: 'stair_1',
        at: 1220,
        b: 'n8',
        cut: 'y',
        id: 'n7',
      },
      {
        a: 'circulation_1',
        at: 1420,
        b: 'n9',
        cut: 'y',
        id: 'n8',
      },
      {
        a: 'void_1',
        at: 1250,
        b: 'n10',
        cut: 'x',
        id: 'n9',
      },
      {
        a: 'wc_2',
        at: 1700,
        b: 'storage_1',
        cut: 'y',
        id: 'n10',
      },
    ],
    stair: {
      room: 'stair_1',
      up: '+x',
    },
  },
  {
    variant_label: null,
    rationale: 'Cây lưu trong artifact — rationale gốc đã gộp vào artifact.',
    also: [],
    doors: [
      {
        a: 'master_bedroom_1',
        b: 'balcony_1',
        kind: 'sliding',
      },
      {
        a: 'master_bedroom_1',
        b: 'wc_3',
        kind: 'single',
      },
      {
        a: 'master_bedroom_1',
        b: 'circulation_2',
        kind: 'single',
      },
      {
        a: 'study_1',
        b: 'circulation_2',
        kind: 'single',
      },
      {
        a: 'circulation_2',
        b: 'stair_2',
        kind: 'opening',
      },
      {
        a: 'study_1',
        b: 'altar_room_1',
        kind: 'single',
      },
      {
        a: 'circulation_2',
        b: 'bedroom_5',
        kind: 'single',
      },
      {
        a: 'bedroom_3',
        b: 'balcony_2',
        kind: 'sliding',
      },
      {
        a: 'bedroom_3',
        b: 'stair_2',
        kind: 'single',
      },
      {
        a: 'stair_2',
        b: 'bedroom_4',
        kind: 'single',
      },
      {
        a: 'bedroom_4',
        b: 'wc_4',
        kind: 'single',
      },
      {
        a: 'bedroom_4',
        b: 'laundry_1',
        kind: 'single',
      },
      {
        a: 'bedroom_4',
        b: 'balcony_3',
        kind: 'sliding',
      },
    ],
    footprint: [200, 300, 1500, 2000],
    no_window: ['wc_3', 'wc_4', 'circulation_2', 'stair_2'],
    nodes: [
      {
        a: 'nl1',
        at: 1000,
        b: 'nr1',
        cut: 'x',
        id: 'root',
      },
      {
        a: 'nl_top',
        at: 900,
        b: 'nl_bottom',
        cut: 'y',
        id: 'nl1',
      },
      {
        a: 'balcony_1',
        at: 350,
        b: 'nl_master',
        cut: 'x',
        id: 'nl_top',
      },
      {
        a: 'master_bedroom_1',
        at: 900,
        b: 'wc_3',
        cut: 'x',
        id: 'nl_master',
      },
      {
        a: 'nl_lbtop',
        at: 1300,
        b: 'nl_lbbottom',
        cut: 'y',
        id: 'nl_bottom',
      },
      {
        a: 'study_1',
        at: 600,
        b: 'circulation_2',
        cut: 'x',
        id: 'nl_lbtop',
      },
      {
        a: 'altar_room_1',
        at: 600,
        b: 'bedroom_5',
        cut: 'x',
        id: 'nl_lbbottom',
      },
      {
        a: 'nr_top',
        at: 900,
        b: 'nr_rest',
        cut: 'y',
        id: 'nr1',
      },
      {
        a: 'balcony_2',
        at: 450,
        b: 'bedroom_3',
        cut: 'y',
        id: 'nr_top',
      },
      {
        a: 'stair_2',
        at: 1220,
        b: 'nr_bottom',
        cut: 'y',
        id: 'nr_rest',
      },
      {
        a: 'nr_main',
        at: 1900,
        b: 'balcony_3',
        cut: 'y',
        id: 'nr_bottom',
      },
      {
        a: 'bedroom_4',
        at: 1300,
        b: 'nr_side',
        cut: 'x',
        id: 'nr_main',
      },
      {
        a: 'wc_4',
        at: 1500,
        b: 'laundry_1',
        cut: 'y',
        id: 'nr_side',
      },
    ],
    stair: null,
  },
];

export const REAL_0913B_GPT5: AiPlanTree[] = [
  {
    variant_label: 'Thang sát tường phải, khách trước, bếp-ăn giữa, ngủ ông bà sau vườn',
    rationale: 'Cây lưu trong artifact — rationale gốc đã gộp vào artifact.',
    also: [
      {
        room: 'dining_1',
        with: ['kitchen_1'],
      },
    ],
    doors: [
      {
        a: 'circulation_1',
        b: 'outside',
        kind: 'double',
      },
      {
        a: 'garage_1',
        b: 'outside',
        kind: 'garage',
      },
      {
        a: 'garage_1',
        b: 'living_1',
        kind: 'single',
      },
      {
        a: 'garage_1',
        b: 'storage_1',
        kind: 'single',
      },
      {
        a: 'circulation_1',
        b: 'living_1',
        kind: 'opening',
      },
      {
        a: 'living_1',
        b: 'dining_1',
        kind: 'opening',
      },
      {
        a: 'circulation_1',
        b: 'dining_1',
        kind: 'single',
      },
      {
        a: 'stair_1',
        b: 'circulation_1',
        kind: 'single',
      },
      {
        a: 'stair_1',
        b: 'wc_2',
        kind: 'single',
      },
      {
        a: 'stair_1',
        b: 'bedroom_2',
        kind: 'single',
      },
      {
        a: 'dining_1',
        b: 'bedroom_1',
        kind: 'single',
      },
      {
        a: 'dining_1',
        b: 'outside',
        kind: 'sliding',
      },
    ],
    footprint: [200, 300, 1500, 2000],
    no_window: ['storage_1'],
    nodes: [
      {
        a: 'n1',
        at: 1160,
        b: 'n5',
        cut: 'x',
        id: 'root',
      },
      {
        a: 'n2',
        at: 600,
        b: 'n4',
        cut: 'x',
        id: 'n1',
      },
      {
        a: 'garage_1',
        at: 1000,
        b: 'n3',
        cut: 'y',
        id: 'n2',
      },
      {
        a: 'storage_1',
        at: 1160,
        b: 'n10',
        cut: 'y',
        id: 'n3',
      },
      {
        a: 'wc_1',
        at: 1320,
        b: 'bedroom_1',
        cut: 'y',
        id: 'n10',
      },
      {
        a: 'living_1',
        at: 1300,
        b: 'dining_1',
        cut: 'y',
        id: 'n4',
      },
      {
        a: 'circulation_1',
        at: 800,
        b: 'n6',
        cut: 'y',
        id: 'n5',
      },
      {
        a: 'stair_1',
        at: 1400,
        b: 'n7',
        cut: 'y',
        id: 'n6',
      },
      {
        a: 'wc_2',
        at: 1520,
        b: 'bedroom_2',
        cut: 'y',
        id: 'n7',
      },
    ],
    stair: {
      room: 'stair_1',
      up: '+y',
    },
  },
  {
    variant_label: null,
    rationale: 'Cây lưu trong artifact — rationale gốc đã gộp vào artifact.',
    also: [],
    doors: [
      {
        a: 'stair_2',
        b: 'circulation_2',
        kind: 'opening',
      },
      {
        a: 'stair_2',
        b: 'altar_room_1',
        kind: 'single',
      },
      {
        a: 'circulation_2',
        b: 'bedroom_3',
        kind: 'single',
      },
      {
        a: 'circulation_2',
        b: 'master_bedroom_1',
        kind: 'single',
      },
      {
        a: 'wc_4',
        b: 'stair_2',
        kind: 'single',
      },
      {
        a: 'laundry_1',
        b: 'wc_4',
        kind: 'single',
      },
      {
        a: 'bedroom_5',
        b: 'circulation_2',
        kind: 'single',
      },
      {
        a: 'bedroom_4',
        b: 'bedroom_5',
        kind: 'single',
      },
      {
        a: 'study_1',
        b: 'master_bedroom_1',
        kind: 'single',
      },
    ],
    footprint: [200, 300, 1500, 2000],
    no_window: [],
    nodes: [
      {
        a: 'na',
        at: 800,
        b: 'ny2',
        cut: 'y',
        id: 'root',
      },
      {
        a: 'na_left',
        at: 1160,
        b: 'altar_room_1',
        cut: 'x',
        id: 'na',
      },
      {
        a: 'balcony_2',
        at: 420,
        b: 'bedroom_3',
        cut: 'y',
        id: 'na_left',
      },
      {
        a: 'nmidleft',
        at: 1160,
        b: 'nright',
        cut: 'x',
        id: 'ny2',
      },
      {
        a: 'nllong',
        at: 900,
        b: 'circulation_2',
        cut: 'x',
        id: 'nmidleft',
      },
      {
        a: 'nb_left',
        at: 1400,
        b: 'nc_left',
        cut: 'y',
        id: 'nllong',
      },
      {
        a: 'nb_left_strip',
        at: 600,
        b: 'master_bedroom_1',
        cut: 'x',
        id: 'nb_left',
      },
      {
        a: 'study_1',
        at: 1000,
        b: 'nb_strip2',
        cut: 'y',
        id: 'nb_left_strip',
      },
      {
        a: 'balcony_1',
        at: 1160,
        b: 'wc_3',
        cut: 'y',
        id: 'nb_strip2',
      },
      {
        a: 'nc_ll',
        at: 600,
        b: 'bedroom_5',
        cut: 'x',
        id: 'nc_left',
      },
      {
        a: 'bedroom_4',
        at: 1900,
        b: 'balcony_3',
        cut: 'y',
        id: 'nc_ll',
      },
      {
        a: 'stair_2',
        at: 1400,
        b: 'nservice',
        cut: 'y',
        id: 'nright',
      },
      {
        a: 'wc_4',
        at: 1560,
        b: 'laundry_1',
        cut: 'y',
        id: 'nservice',
      },
    ],
    stair: null,
  },
];
