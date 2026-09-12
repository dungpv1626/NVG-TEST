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

import type { AiFloorPlan, AiFloorPlanLevel, AiPlanRooms } from '@nvg/shared/design';
import { toRect, type Pt, type Rect } from '../ai/draw/geometry';
import { leftNormalPointsInward } from '../ai/plan-geometry';
import { prepareWalls } from '../ai/draw/walls';

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

/**
 * Mặt của bốn cạnh hình bao, cùng thứ tự với `TOWNHOUSE_OUTLINE`: mặt tiền thoáng, hai bên là
 * tường chung với nhà hàng xóm, mặt sau giáp nhà phía sau.
 *
 * Đây là điều fixture đã NÓI trong phần mô tả từ đầu («hai bên là tường chung nên KHÔNG có cửa
 * sổ bên hông») nhưng dữ liệu thì chưa mang được — hợp đồng gộp tường ranh và tường giáp ngoài
 * trời vào cùng loại `e`. Nhờ trường này, một cửa sổ đặt trên cạnh 1 hoặc 3 không còn được tính
 * là mặt thoáng, và cảnh báo «phòng ngủ không có cửa sổ» nổ ra đúng lúc.
 */
const TOWNHOUSE_FACES: NonNullable<AiFloorPlanLevel['outline_faces']> = [
  'open',
  'boundary',
  'boundary',
  'boundary',
];

/** Tường bao chung của mọi tầng nhà phố: hai bên là tường chung với nhà hàng xóm. */
const townhouseShell = (): Wall[] => [ext('wl', 11, 0, 11, 1500), ext('wr', 389, 0, 389, 1500)];

const townhouseLevel1: AiFloorPlanLevel = {
  level: 1,
  name: 'Tầng 1',
  h: 360,
  outline: TOWNHOUSE_OUTLINE,
  outline_faces: TOWNHOUSE_FACES,
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
};

const townhouseLevel2: AiFloorPlanLevel = {
  level: 2,
  name: 'Tầng 2',
  h: 360,
  outline: TOWNHOUSE_OUTLINE,
  outline_faces: TOWNHOUSE_FACES,
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
  outline_faces: TOWNHOUSE_FACES,
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
    // at = 275 chứ không phải 250: lỗ cửa phải nằm TRONG cạnh sau của `laundry_3` (x 283–378).
    // Ở 250 nó trải từ x 261 tới 351, tức vắt qua cả cạnh sau của ô thang và khe vách giữa hai
    // phòng — một cái cửa như vậy không mở vào đâu cả. Trước T23 nó vẫn hợp lệ vì `wt` là MỘT
    // đoạn tường dài suốt nhà; nay lỗ mở neo vào cạnh phòng nên chỗ sơ suất ấy hiện ra.
    door('d7', 'wt', 275, 90, 'single', 'b', 'r'),
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
  // NGUYÊN VĂN ý đồ bố cục ở `kb/ai_design_prompts.yaml` — đúng thứ Worker chép vào.
  // Fixture trước dùng một câu tiếng Việt tự viết dài 80 ký tự, nên nó không bao giờ
  // chạm được trần `maxLength` mà bản thật vượt qua (11/09/2026).
  strategy:
    'Push the stair core to the BACK of the plan and put the light well or courtyard in the ' +
    'middle, so the deepest rooms open onto it. Keep the front of each level clear for the ' +
    'largest habitable room. Circulation runs along one side wall rather than through rooms.',
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

/** Lô biệt thự bốn mặt thoáng — đúng thứ `rationale` của fixture này nói. */
const VILLA_FACES: NonNullable<AiFloorPlanLevel['outline_faces']> = [
  'open',
  'open',
  'open',
  'open',
];

const villaLevel1: AiFloorPlanLevel = {
  level: 1,
  name: 'Tầng 1',
  h: 360,
  outline: VILLA_OUTLINE,
  outline_faces: VILLA_FACES,
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
    // at = 512: cửa chính rộng 165 phải nằm TRONG cạnh trước của sảnh (x 489–700, dài 211), và
    // 512 đặt nó đúng giữa cạnh ấy. Ở 550 nó trải tới x 715, tức 15 cm lòi sang khe vách và chỗ
    // để xe — cửa chính của cả ngôi nhà, và không gì bắt được trước T23.
    door('d_main', 'wf', 512, 165, 'double', 'a', 'l'),
    door('d_gate', 'wf', 750, 200, 'garage', null, null),
    door('d1', 'pv1', 300, 90, 'single', 'a', 'r'),
    door('d2', 'pv1', 800, 90, 'single', 'a', 'r'),
    door('d3', 'ph2', 200, 90),
    door('d4', 'ph3', 60, 140, 'opening', null, null),
    door('d5', 'pv2', 600, 70),
    door('d6', 'pv2', 200, 250, 'opening', null, null),
    // at = 740: ô thông nằm trong phần vách `pv2` thật sự chung giữa sảnh và bếp (y 744–900). Ở
    // 800 nó trải tới y 931, tức vắt qua cả cạnh phải của ô thang — cùng chỗ sơ suất với `d7` của
    // nhà phố tầng 3.
    door('d7', 'pv2', 740, 120, 'opening', null, null),
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
  outline_faces: VILLA_FACES,
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
    // at = 240: cửa sổ nằm trong cạnh trước của `bedroom_4` (x 711–978). Ở 120 nó trải từ x 598
    // tới 748, vắt qua cạnh trước của sảnh, khe vách, rồi mới tới phòng ngủ — một ô cửa sổ như vậy
    // không thuộc phòng nào.
    win('s5', 'wf', 240, 150),
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
  // NGUYÊN VĂN ý đồ bố cục ở `kb/ai_design_prompts.yaml` — đúng thứ Worker chép vào.
  // Fixture trước dùng một câu tiếng Việt tự viết dài 80 ký tự, nên nó không bao giờ
  // chạm được trần `maxLength` mà bản thật vượt qua (11/09/2026).
  strategy:
    'Put the stair core in the MIDDLE of the plan, against one side wall, and organise each ' +
    'level around it: arrival and living towards the street, service and wet rooms towards ' +
    'the back. On a deep plot place the light well immediately behind the stair so the core ' +
    'and the well share one shaft of daylight.',
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

// ---------------------------------------------------------------------------
// Phần MÔ HÌNH KHAI (T23) — suy từ chính hai artifact trên
// ---------------------------------------------------------------------------

/**
 * Đưa một artifact `ai_floor_plan` về dạng mô hình khai (`ai-plan-rooms`): bỏ tường, và neo lại
 * lỗ mở từ ĐOẠN TƯỜNG sang CẠNH PHÒNG.
 *
 * Vì sao suy chứ không viết tay bản thứ hai: hai fixture viết tay cho CÙNG một ngôi nhà là hai
 * bản sẽ lệch nhau, và lệch ở đây nghĩa là phép thử của đường T23 chạy trên một ngôi nhà khác với
 * phép thử của bộ vẽ. Suy ra thì chỉ có một nguồn.
 *
 * Và nó là phép thử RÒNG THEO VÒNG: hàm này là nghịch đảo của `ai/plan-geometry.ts`, nên
 * artifact → đề xuất → artifact phải cho lại một ngôi nhà tương đương. Một phép neo sai chiều ở
 * bên nào cũng làm vòng ấy hở ra.
 */
export function roomsProposalOf(plan: AiFloorPlan): AiPlanRooms {
  return {
    variant_label: plan.variant_label,
    rationale: plan.rationale,
    levels: plan.levels.map((level) => {
      const walls = prepareWalls(level.walls);
      const byId = new Map(walls.map((wall) => [wall.id, wall]));
      const rooms = level.rooms.map((room) => ({ id: room.id, rect: toRect(room.rect) }));

      /** Cạnh phòng mà điểm giữa một lỗ mở nằm trên, kèm `at` đo từ đầu cạnh. */
      const onEdge = (wallId: string, at: number, w: number) => {
        const wall = byId.get(wallId);
        if (!wall) return null;
        const middle = at + w / 2;
        const centre: Pt = [wall.a[0] + wall.u[0] * middle, wall.a[1] + wall.u[1] * middle];
        for (const { id, rect } of rooms) {
          for (const edge of ['front', 'back', 'left', 'right'] as const) {
            const span = EDGES[edge](rect);
            const across =
              (centre[0] - span.from[0]) * -span.unit[1] +
              (centre[1] - span.from[1]) * span.unit[0];
            if (Math.abs(Math.abs(across) - wall.t / 2) > 2) continue;
            const along =
              (centre[0] - span.from[0]) * span.unit[0] + (centre[1] - span.from[1]) * span.unit[1];
            if (along < w / 2 - 2 || along > span.length - w / 2 + 2) continue;
            const reversed = wall.u[0] * span.unit[0] + wall.u[1] * span.unit[1] < 0;
            return { room: id, edge, at: Math.round(along - w / 2), reversed };
          }
        }
        return null;
      };

      return {
        level: level.level,
        name: level.name,
        h: level.h,
        outline: level.outline,
        rooms: level.rooms,
        doors: (level.doors ?? []).flatMap((door) => {
          const placed = onEdge(door.wall, door.at, door.w);
          if (!placed) return [];
          // Dùng CHUNG `leftNormalPointsInward` với `ai/plan-geometry.ts`, không chép lại hằng số:
          // hai bản của cùng một phép suy thì sai giống nhau sẽ TRIỆT TIÊU nhau trong phép thử
          // vòng, và phép thử xanh trong khi đường chạy thật sai (đã xảy ra, 12/09/2026).
          const leftIsInside = leftNormalPointsInward(placed.edge);
          const left = placed.reversed ? door.side !== 'l' : door.side === 'l';
          return [
            {
              id: door.id,
              room: placed.room,
              edge: placed.edge,
              at: placed.at,
              w: door.w,
              kind: door.kind,
              hinge: door.hinge
                ? (door.hinge === 'a') !== placed.reversed
                  ? ('near' as const)
                  : ('far' as const)
                : null,
              swing: door.side
                ? left === leftIsInside
                  ? ('in' as const)
                  : ('out' as const)
                : null,
            },
          ];
        }),
        windows: (level.windows ?? []).flatMap((window) => {
          const placed = onEdge(window.wall, window.at, window.w);
          if (!placed) return [];
          return [
            {
              id: window.id,
              room: placed.room,
              edge: placed.edge,
              at: placed.at,
              w: window.w,
              ...(window.sill === undefined ? {} : { sill: window.sill }),
              ...(window.h === undefined ? {} : { h: window.h }),
            },
          ];
        }),
        stairs: level.stairs ?? [],
        voids: level.voids ?? [],
      };
    }),
  };
}

/** Bốn cạnh của một chữ nhật, theo đúng quy ước `at` của hợp đồng `ai-plan-rooms`. */
const EDGES = {
  front: (r: Rect) => ({ from: [r.x0, r.y0] as Pt, unit: [1, 0] as Pt, length: r.x1 - r.x0 }),
  back: (r: Rect) => ({ from: [r.x0, r.y1] as Pt, unit: [1, 0] as Pt, length: r.x1 - r.x0 }),
  left: (r: Rect) => ({ from: [r.x0, r.y0] as Pt, unit: [0, 1] as Pt, length: r.y1 - r.y0 }),
  right: (r: Rect) => ({ from: [r.x1, r.y0] as Pt, unit: [0, 1] as Pt, length: r.y1 - r.y0 }),
};

export const TOWNHOUSE_ROOMS = roomsProposalOf(TOWNHOUSE_PLAN);
export const VILLA_ROOMS = roomsProposalOf(VILLA_PLAN);
