/**
 * Hai mặt bằng VIẾT TAY để thử bộ vẽ — không lượt gọi mô hình nào.
 *
 * Vì sao viết tay: Đợt 2 phải trả lời một câu hỏi duy nhất — «tờ vẽ này có dùng được không» —
 * và câu trả lời không được phụ thuộc vào việc mô hình hôm ấy khai tường khéo hay vụng. Dữ
 * liệu ở đây đúng theo hợp đồng và hợp lý về cấu tạo, nên mọi chỗ tờ vẽ trông sai đều là lỗi
 * của bộ vẽ. Khi mô hình vào cuộc (Đợt 3), hai fixture này vẫn là mốc so.
 *
 * ── Quy ước toạ độ (hợp đồng `ai-floor-plan`) ─────────────────────────────────────────
 * Xăng-ti-mét NGUYÊN. Gốc ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.
 * Tường khai theo TIM; `rect` của phòng là kích thước LỌT LÒNG (mặt trong tới mặt trong).
 * Nên tường bao dày 22 nằm trên biên lô có tim ở 11, và mặt trong ở 22.
 *
 * Hai hồ sơ mô phỏng đúng hai kiểu nhà NVG làm nhiều nhất:
 *  · `TOWNHOUSE_PLAN` — nhà phố 4 × 15 m, 3 tầng, hai bên là tường chung nên KHÔNG có cửa sổ
 *    bên hông; lấy sáng bằng giếng trời sau nhà. Đây là ca khó của bộ vẽ: hình rất dài, tỷ lệ
 *    1:100 vừa khít, và chuỗi kích thước dọc có nhiều đoạn.
 *  · `VILLA_PLAN` — biệt thự 10 × 14 m, 2 tầng, hành lang giữa. Ca này nhiều phòng nhỏ và có
 *    ban công lẫn sân thượng, tức là có cả tường bao lẫn lan can trên cùng một tầng.
 */

import type { AiFloorPlan, AiFloorPlanLevel } from '@nvg/shared/design';

type Wall = AiFloorPlanLevel['walls'][number];
type Room = AiFloorPlanLevel['rooms'][number];
type Door = NonNullable<AiFloorPlanLevel['doors']>[number];
type Window = NonNullable<AiFloorPlanLevel['windows']>[number];

/** Tường bao — dày 22 cm, mặc định của NVG (`kb/construction_norms.yaml`). */
const ext = (id: string, ax: number, ay: number, bx: number, by: number, t = 22): Wall => ({
  id,
  a: [ax, ay],
  b: [bx, by],
  t,
  k: 'e',
});

/** Vách ngăn trong nhà — dày 11 cm. */
const part = (id: string, ax: number, ay: number, bx: number, by: number, t = 11): Wall => ({
  id,
  a: [ax, ay],
  b: [bx, by],
  t,
  k: 'p',
});

/** Lan can ban công, sân thượng — dày 11 cm, không phải tường. */
const rail = (id: string, ax: number, ay: number, bx: number, by: number, t = 11): Wall => ({
  id,
  a: [ax, ay],
  b: [bx, by],
  t,
  k: 'r',
});

/**
 * Phòng. Diện tích tính TỪ chữ nhật, làm tròn một chữ số — đúng cách mô hình được yêu cầu
 * khai, và nhờ vậy fixture không tự mâu thuẫn với chính bộ kiểm.
 */
const room = (
  id: string,
  type: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  label: string | null = null,
): Room => ({
  id,
  type,
  rect: [x0, y0, x1, y1],
  area_m2: Math.round(((x1 - x0) * (y1 - y0)) / 100) / 100,
  label,
});

const door = (
  id: string,
  wall: string,
  at: number,
  w: number,
  kind: Door['kind'] = 'single',
  hinge: Door['hinge'] = 'a',
  side: Door['side'] = 'l',
): Door => ({ id, wall, at, w, hinge, side, kind });

const win = (id: string, wall: string, at: number, w: number, sill = 90, h = 160): Window => ({
  id,
  wall,
  at,
  w,
  sill,
  h,
});

// ---------------------------------------------------------------------------
// Nhà phố 4 × 15 m, 3 tầng
// ---------------------------------------------------------------------------

const TOWNHOUSE_OUTLINE: AiFloorPlanLevel['outline'] = [
  [0, 0],
  [400, 0],
  [400, 1500],
  [0, 1500],
];

/** Tường bao chung của mọi tầng nhà phố: hai bên là tường chung với nhà hàng xóm. */
const townhouseShell = (): Wall[] => [ext('wl', 11, 0, 11, 1500), ext('wr', 389, 0, 389, 1500)];

const townhouseLevel1: AiFloorPlanLevel = {
  level: 1,
  name: 'Tầng 1',
  h: 360,
  outline: TOWNHOUSE_OUTLINE,
  walls: [
    ...townhouseShell(),
    ext('wf', 0, 11, 400, 11),
    ext('wb', 0, 1489, 400, 1489),
    // Tường ngăn giếng trời sau nhà — giáp ngoài trời nên là tường bao, có cửa sổ.
    ext('wy', 11, 1376, 389, 1376),
    part('p1', 11, 387.5, 389, 387.5),
    part('p2', 11, 798.5, 389, 798.5),
    part('p3', 11, 1159.5, 389, 1159.5),
    part('p4', 277.5, 1154, 277.5, 1365),
  ],
  rooms: [
    room('garage_1', 'garage', 22, 22, 378, 382),
    room('living_1', 'living', 22, 393, 378, 793),
    room('kitchen_1', 'kitchen', 22, 804, 378, 1154),
    room('stair_1', 'stair', 22, 1165, 272, 1365),
    room('wc_1', 'wc', 283, 1165, 378, 1365),
    room('light_well_1', 'light_well', 22, 1387, 378, 1478, 'Giếng trời'),
  ],
  doors: [
    door('d_gate', 'wf', 50, 300, 'garage', null, null),
    door('d1', 'p1', 150, 100),
    door('d2', 'p2', 150, 100),
    door('d3', 'p3', 30, 120, 'opening', null, null),
    door('d4', 'p4', 60, 70, 'single', 'a', 'r'),
    door('d5', 'wy', 100, 90, 'single', 'b', 'r'),
  ],
  windows: [win('s1', 'wy', 290, 60, 180, 60)],
  stairs: [{ id: 'st1', rect: [22, 1165, 272, 1365], up: '-y', flights: 2, treads: 18 }],
  voids: [],
  // Chỉ tầng này có `sheet_prompt` — CỐ Ý. Trường là tuỳ chọn, nên fixture phải mang cả hai
  // trạng thái để phép thử đường vẽ ảnh chạm được nhánh «tầng không có mô tả».
  sheet_prompt:
    'A narrow tube house ground floor, 4 m wide and 15 m deep, drawn as a top-down architectural ' +
    'plan. From the street at the bottom: a motorbike garage with two scooters, then a living ' +
    'room with a sofa facing a wall-mounted TV, then an open kitchen with a counter and a dining ' +
    'table for four. Behind the kitchen the staircase runs up along the left wall, with a small ' +
    'toilet beside it on the right. At the very back a light well with a floor drain brings ' +
    'daylight into the middle of the house. The entrance is at the bottom of the sheet.',
};

const townhouseLevel2: AiFloorPlanLevel = {
  level: 2,
  name: 'Tầng 2',
  h: 360,
  outline: TOWNHOUSE_OUTLINE,
  walls: [
    ext('wl', 11, 141, 11, 1500),
    ext('wr', 389, 141, 389, 1500),
    ext('wb', 0, 1489, 400, 1489),
    ext('wf', 0, 141, 400, 141),
    ext('wy', 11, 1376, 389, 1376),
    rail('r_front', 0, 5.5, 400, 5.5),
    rail('r_left', 5.5, 0, 5.5, 141),
    rail('r_right', 394.5, 0, 394.5, 141),
    part('p1', 11, 557.5, 389, 557.5),
    part('p2', 11, 918.5, 389, 918.5),
    part('p3', 205.5, 918.5, 205.5, 1159.5),
    part('p4', 11, 1159.5, 389, 1159.5),
    part('p5', 277.5, 1154, 277.5, 1376),
  ],
  rooms: [
    room('balcony_2', 'balcony', 11, 11, 389, 130),
    room('master_2', 'master_bedroom', 22, 152, 378, 552),
    room('bedroom_2', 'bedroom', 22, 563, 378, 913),
    room('wc_2', 'wc', 22, 924, 200, 1154),
    room('hall_2', 'circulation', 211, 924, 378, 1154),
    room('stair_2', 'stair', 22, 1165, 272, 1365),
    room('store_2', 'storage', 283, 1165, 378, 1365),
  ],
  doors: [
    door('d1', 'wf', 150, 180, 'sliding', null, 'l'),
    door('d2', 'p1', 150, 90),
    door('d3', 'p2', 250, 90),
    door('d4', 'p3', 60, 70, 'single', 'a', 'r'),
    door('d5', 'p4', 30, 120, 'opening', null, null),
    door('d6', 'p4', 290, 70),
  ],
  windows: [win('s1', 'wf', 40, 80), win('s2', 'wy', 100, 120)],
  stairs: [{ id: 'st2', rect: [22, 1165, 272, 1365], up: '-y', flights: 2, treads: 18 }],
  voids: [{ id: 'v1', kind: 'light_well', rect: [22, 1387, 378, 1478] }],
};

const townhouseLevel3: AiFloorPlanLevel = {
  level: 3,
  name: 'Tầng 3',
  h: 390,
  outline: TOWNHOUSE_OUTLINE,
  walls: [
    ext('wl', 11, 141, 11, 1500),
    ext('wr', 389, 141, 389, 1500),
    ext('wf', 0, 141, 400, 141),
    ext('wt', 11, 1376, 389, 1376),
    rail('r_front', 0, 5.5, 400, 5.5),
    rail('r_left', 5.5, 0, 5.5, 141),
    rail('r_right', 394.5, 0, 394.5, 141),
    rail('r_back', 0, 1494.5, 400, 1494.5),
    part('p1', 11, 507.5, 389, 507.5),
    part('p2', 11, 868.5, 389, 868.5),
    part('p3', 205.5, 868.5, 205.5, 1159.5),
    part('p4', 11, 1159.5, 389, 1159.5),
    part('p5', 277.5, 1154, 277.5, 1376),
  ],
  rooms: [
    room('balcony_3', 'balcony', 11, 11, 389, 130),
    room('altar_3', 'altar_room', 22, 152, 378, 502),
    room('bedroom_3', 'bedroom', 22, 513, 378, 863),
    room('wc_3', 'wc', 22, 874, 200, 1154),
    room('hall_3', 'circulation', 211, 874, 378, 1154),
    room('stair_3', 'stair', 22, 1165, 272, 1365),
    room('laundry_3', 'laundry', 283, 1165, 378, 1365),
    room('terrace_3', 'terrace', 22, 1387, 378, 1489, 'Sân thượng'),
  ],
  doors: [
    door('d1', 'wf', 150, 180, 'sliding', null, 'l'),
    door('d2', 'p1', 150, 90),
    door('d3', 'p2', 250, 90),
    door('d4', 'p3', 60, 70, 'single', 'a', 'r'),
    door('d5', 'p4', 30, 120, 'opening', null, null),
    door('d6', 'p4', 290, 70),
    door('d7', 'wt', 250, 90, 'single', 'b', 'r'),
  ],
  windows: [win('s1', 'wf', 40, 80), win('s2', 'wt', 100, 120)],
  stairs: [{ id: 'st3', rect: [22, 1165, 272, 1365], up: '-y', flights: 2, treads: 18 }],
  voids: [],
};

export const TOWNHOUSE_PLAN: AiFloorPlan = {
  schema_version: '1.0.0',
  program_ref: `sha256:${'1'.repeat(64)}`,
  variant_id: 'AI-A',
  variant_label: 'Thang cuối nhà, giếng trời sau bếp',
  strategy: 'Dồn giao thông về cuối nhà, chừa giếng trời lấy sáng cho bếp và khu vệ sinh.',
  north_deg: 0,
  levels: [townhouseLevel1, townhouseLevel2, townhouseLevel3],
  rationale:
    'Nhà phố hai bên là tường chung nên toàn bộ ánh sáng tự nhiên đến từ mặt tiền và giếng trời sau nhà. Thang đặt cuối nhà để giếng trời đứng ngay sau bếp, vừa lấy sáng vừa thoát nhiệt bếp.',
  generator: {
    kind: 'ai',
    provider: 'fixture',
    model: 'viet-tay',
    route: 'fixture',
    prompt_version: '0.0.0',
    repaired: false,
    walls_derived: false,
  },
};

// ---------------------------------------------------------------------------
// Biệt thự 10 × 14 m, 2 tầng
// ---------------------------------------------------------------------------

const VILLA_OUTLINE: AiFloorPlanLevel['outline'] = [
  [0, 0],
  [1000, 0],
  [1000, 1400],
  [0, 1400],
];

const villaLevel1: AiFloorPlanLevel = {
  level: 1,
  name: 'Tầng 1',
  h: 360,
  outline: VILLA_OUTLINE,
  walls: [
    ext('wf', 0, 11, 1000, 11),
    ext('wb', 0, 1389, 1000, 1389),
    ext('wl', 11, 0, 11, 1400),
    ext('wr', 989, 0, 989, 1400),
    // Hai trục vách dọc chạy suốt cả hai tầng — nhờ vậy lõi thang chồng khít và tường tầng
    // trên có chỗ đứng chân. Đây là quy ước cấu tạo, không phải lựa chọn bố cục.
    part('pv1', 483.5, 11, 483.5, 1389),
    part('pv2', 705.5, 11, 705.5, 1389),
    part('ph1', 11, 697.5, 483.5, 697.5),
    part('ph2', 11, 1108.5, 483.5, 1108.5),
    part('ph3', 483.5, 905.5, 705.5, 905.5),
    part('ph4', 705.5, 477.5, 989, 477.5),
    part('ph5', 705.5, 738.5, 989, 738.5),
  ],
  rooms: [
    room('living_1', 'living', 22, 22, 478, 692),
    room('dining_1', 'dining', 22, 703, 478, 1103),
    room('bedroom_1', 'bedroom', 22, 1114, 478, 1378),
    room('hall_1', 'circulation', 489, 22, 700, 900),
    room('stair_1', 'stair', 489, 911, 700, 1378),
    room('garage_1', 'garage', 711, 22, 978, 472),
    room('wc_1', 'wc', 711, 483, 978, 733),
    room('kitchen_1', 'kitchen', 711, 744, 978, 1378),
  ],
  doors: [
    door('d_main', 'wf', 550, 165, 'double', 'a', 'l'),
    door('d_gate', 'wf', 750, 200, 'garage', null, null),
    door('d1', 'pv1', 300, 90, 'single', 'a', 'r'),
    door('d2', 'pv1', 800, 90, 'single', 'a', 'r'),
    door('d3', 'ph2', 200, 90),
    door('d4', 'ph3', 60, 140, 'opening', null, null),
    door('d5', 'pv2', 600, 70),
    door('d6', 'pv2', 200, 250, 'opening', null, null),
    door('d7', 'pv2', 800, 120, 'opening', null, null),
  ],
  windows: [
    win('s1', 'wl', 200, 150),
    win('s2', 'wl', 800, 150),
    win('s3', 'wl', 1200, 150),
    win('s4', 'wf', 100, 150),
    win('s5', 'wr', 200, 150),
    win('s6', 'wr', 550, 120),
    win('s7', 'wr', 900, 150),
    win('s8', 'wb', 200, 150),
    win('s9', 'wb', 800, 150),
  ],
  stairs: [{ id: 'st1', rect: [489, 911, 700, 1378], up: '+y', flights: 2, treads: 20 }],
  voids: [],
};

const villaLevel2: AiFloorPlanLevel = {
  level: 2,
  name: 'Tầng 2',
  h: 360,
  outline: VILLA_OUTLINE,
  walls: [
    ext('wf', 478, 11, 1000, 11),
    ext('wb', 0, 1389, 1000, 1389),
    ext('wl', 11, 0, 11, 1400),
    ext('wr', 989, 0, 989, 1400),
    ext('wbal', 0, 181, 489, 181),
    ext('wter', 705.5, 1100, 989, 1100, 22),
    rail('r_front', 0, 5.5, 489, 5.5),
    part('pv1', 483.5, 11, 483.5, 1389),
    part('pv2', 705.5, 11, 705.5, 1400),
    part('ph1', 11, 697.5, 483.5, 697.5),
    part('ph2', 11, 1108.5, 483.5, 1108.5),
    part('ph3', 483.5, 905.5, 705.5, 905.5),
    part('ph4', 705.5, 477.5, 989, 477.5),
    part('ph5', 705.5, 738.5, 989, 738.5),
  ],
  rooms: [
    room('balcony_2', 'balcony', 22, 11, 478, 170),
    room('master_2', 'master_bedroom', 22, 192, 478, 692),
    room('bedroom_2', 'bedroom', 22, 703, 478, 1103),
    room('bedroom_3', 'bedroom', 22, 1114, 478, 1378),
    room('hall_2', 'circulation', 489, 22, 700, 900),
    room('stair_2', 'stair', 489, 911, 700, 1378),
    room('bedroom_4', 'bedroom', 711, 22, 978, 472),
    room('wc_2', 'wc', 711, 483, 978, 733),
    room('study_2', 'study', 711, 744, 978, 1089),
    room('terrace_2', 'terrace', 711, 1111, 978, 1378, 'Sân thượng sau'),
  ],
  doors: [
    door('d1', 'wbal', 150, 180, 'sliding', null, 'r'),
    door('d2', 'pv1', 300, 90, 'single', 'a', 'r'),
    door('d3', 'pv1', 800, 90, 'single', 'a', 'r'),
    door('d4', 'ph2', 200, 90),
    door('d5', 'ph3', 60, 140, 'opening', null, null),
    door('d6', 'pv2', 200, 90),
    door('d7', 'ph4', 100, 70, 'single', 'a', 'r'),
    door('d8', 'ph5', 100, 90),
    door('d9', 'wter', 120, 90, 'single', 'b', 'r'),
  ],
  windows: [
    win('s1', 'wl', 300, 150),
    win('s2', 'wl', 800, 150),
    win('s3', 'wl', 1200, 150),
    win('s4', 'wb', 150, 150),
    win('s5', 'wf', 120, 150),
    win('s6', 'wr', 200, 150),
    win('s7', 'wr', 550, 120),
    win('s8', 'wr', 850, 150),
  ],
  stairs: [{ id: 'st2', rect: [489, 911, 700, 1378], up: '+y', flights: 2, treads: 20 }],
  voids: [],
};

export const VILLA_PLAN: AiFloorPlan = {
  schema_version: '1.0.0',
  program_ref: `sha256:${'2'.repeat(64)}`,
  variant_id: 'AI-B',
  variant_label: 'Hành lang giữa, thang giữa nhà',
  strategy: 'Hành lang giữa chia hai dãy phòng, thang đặt giữa để mọi phòng cách thang dưới 8 m.',
  north_deg: 30,
  levels: [villaLevel1, villaLevel2],
  rationale:
    'Lô đất bốn mặt thoáng nên bố cục lấy hành lang giữa, hai dãy phòng đều có cửa sổ ra ngoài. Thang đặt giữa nhà để quãng đi từ phòng xa nhất tới thang không quá 8 m.',
  generator: {
    kind: 'ai',
    provider: 'fixture',
    model: 'viet-tay',
    route: 'fixture',
    prompt_version: '0.0.0',
    repaired: false,
    walls_derived: false,
  },
};
