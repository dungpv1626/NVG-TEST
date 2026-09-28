/**
 * Ý định CẢ NHÀ viết tay (T45) — ghép từ danh mục phòng mẫu và ý định từng tầng mẫu đã có, để phép thử
 * luồng một-lượt-cả-nhà dùng lại đúng những bố cục đã chứng minh xếp được.
 *
 * T48 (16/09/2026): bản phác lưới của từng ý định RẢI Ô từ chính mặt bằng mà ý định cũ (theo vùng) xếp
 * ra — tâm mỗi ô một mét rơi vào lá nào của cây chia thì ghi mã lá ấy. Nhờ vậy dữ liệu mẫu đúng hợp đồng
 * hiện hành, và «phác → xếp» đi lại được bố cục đã chứng minh qua cổng. Bản vùng giữ ở `*_ZONED` cho phép
 * thử đường cũ (phát lại lượt đo trước T48).
 */

import type { AiHouseIntent, AiPlanIntent, AiSpaceProgram } from '@nvg/shared/design';
import type { HouseIntent } from '../ai/house';
import { TOWNHOUSE_INTENTS, VILLA_INTENTS } from './ai-intent-fixtures';
import { TOWNHOUSE_PROGRAM, VILLA_PROGRAM } from './ai-tree-fixtures';

export function houseOf(program: AiSpaceProgram, intents: readonly AiPlanIntent[]): HouseIntent {
  const declared = new Map(
    intents.flatMap((intent) => intent.rooms).map((room) => [room.id, room]),
  );
  return {
    variant_label: intents[0]?.variant_label ?? 'Phương án mẫu',
    rationale: intents[0]?.rationale ?? '',
    assumptions: [],
    rooms: program.spaces.map((space) => ({
      id: space.id,
      type: space.type,
      level: space.level,
      target_area_m2: space.target_area_m2,
      ensuite_of: space.ensuite_of ?? null,
      zone: declared.get(space.id)?.zone ?? 'center',
      street_facing: declared.get(space.id)?.street_facing ?? false,
    })),
    relationships: intents.flatMap((intent) => intent.relationships),
    entry_room: intents[0]?.entry_room ?? null,
    garage_room: intents.find((intent) => intent.garage_room)?.garage_room ?? null,
  };
}

export const VILLA_ZONED: HouseIntent = houseOf(VILLA_PROGRAM, VILLA_INTENTS);

// T74 (25/09/2026): ô thang chỉ mở cửa sang giao thông, khu chung, sân thượng, thang máy. Bản phác cũ
// để WC tầng 1 (cột trái, sau ô thang) và ban công tầng 2 (cột trái, cạnh ô thang) chỉ vào được từ ô
// thang — nay bị bác. WC tầng 1 dời sang giáp phòng khách, ô thang lấp cột trái; ban công tầng 2 lên
// mặt trước, giáp phòng ngủ chính.
export const VILLA_SKETCHES: AiHouseIntent['sketches'] = [
  {
    level: 1,
    rows: [
      'garage_1 garage_1 garage_1 garage_1 garage_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1 circulation_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1 living_1 living_1 living_1 living_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1 living_1 living_1 living_1 living_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1 living_1 living_1 living_1 living_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1 living_1 living_1 living_1 living_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1 living_1 living_1 living_1 living_1 wc_1 wc_1 wc_1 wc_1 wc_1 wc_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 wc_1 wc_1 wc_1 wc_1 wc_1 wc_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 wc_1 wc_1 wc_1 wc_1 wc_1 wc_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1',
      'stair_1 stair_1 stair_1 stair_1 stair_1 living_1 living_1 living_1 living_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1 kitchen_1',
    ],
  },
  {
    level: 2,
    rows: [
      'balcony_1 balcony_1 balcony_1 balcony_1 circulation_2 circulation_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2',
      'balcony_1 balcony_1 balcony_1 balcony_1 circulation_2 circulation_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1 circulation_2 circulation_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1 circulation_2 circulation_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1 circulation_2 circulation_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1 circulation_2 circulation_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1 circulation_2 circulation_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2 bedroom_2',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 wc_2 wc_2 wc_2 wc_2 wc_2 wc_2 wc_2 wc_2 wc_2',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 wc_2 wc_2 wc_2 wc_2 wc_2 wc_2 wc_2 wc_2 wc_2',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'stair_2 stair_2 stair_2 stair_2 circulation_2 circulation_2 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
    ],
  },
];

export const VILLA_HOUSE: AiHouseIntent = sketched(VILLA_ZONED, VILLA_SKETCHES);

/**
 * Lỗi HÌNH HỌC chắc chắn: tầng 1 biệt thự khai phòng khách 110 m² và bếp 100 m², đúng mức tối thiểu đầu bài
 * (`crammedBrief`), các phòng khác thu nhỏ để tổng danh mục vẫn dưới sàn xây được 240 m² — bộ kiểm danh
 * mục cho qua, nhưng hai phòng lớn cộng tường không vừa khối nhà, không cách chia nào ra phòng dùng được.
 *
 * Trước đây ca này là «ô thang 2 m²»; từ T48 bộ xếp tự nâng ô thang lên mức hai vế dựng được nên ca ấy
 * xếp được.
 */
const CRAMMED_TARGETS: Record<string, number> = {
  living_1: 110,
  kitchen_1: 100,
  garage_1: 8,
  circulation_1: 4,
  bedroom_1: 8,
  stair_1: 4,
  wc_1: 2,
  dining_1: 2,
};

export const VILLA_CRAMMED: AiHouseIntent = {
  ...VILLA_HOUSE,
  rooms: VILLA_HOUSE.rooms.map((room) =>
    CRAMMED_TARGETS[room.id] ? { ...room, target_area_m2: CRAMMED_TARGETS[room.id]! } : room,
  ),
};

/** Đầu bài của `VILLA_CRAMMED`: phòng khách ≥ 110 m², bếp ≥ 100 m², cùng ở tầng 1. */
export function crammedBrief<T extends { required_spaces?: { type: string }[] | null }>(
  brief: T,
): T {
  return {
    ...brief,
    required_spaces: (brief.required_spaces ?? []).map((row) =>
      row.type === 'living'
        ? { ...row, floor: 1, area_m2: 110 }
        : row.type === 'kitchen'
          ? { ...row, floor: 1, area_m2: 100 }
          : row,
    ),
  };
}

export const TOWNHOUSE_ZONED: HouseIntent = houseOf(TOWNHOUSE_PROGRAM, TOWNHOUSE_INTENTS);

export const TOWNHOUSE_SKETCHES: AiHouseIntent['sketches'] = [
  {
    level: 1,
    rows: [
      'garage_1 garage_1 garage_1 garage_1 garage_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1',
      'garage_1 garage_1 garage_1 garage_1 garage_1',
      'living_1 living_1 living_1 living_1 living_1',
      'living_1 living_1 living_1 living_1 living_1',
      'living_1 living_1 living_1 living_1 living_1',
      'living_1 living_1 living_1 living_1 living_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1 wc_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1 wc_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1 wc_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1 wc_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1 wc_1',
      'light_well_1 stair_1 stair_1 stair_1 stair_1',
      'light_well_1 stair_1 stair_1 stair_1 stair_1',
      'light_well_1 stair_1 stair_1 stair_1 stair_1',
      'light_well_1 stair_1 stair_1 stair_1 stair_1',
      'light_well_1 stair_1 stair_1 stair_1 stair_1',
    ],
  },
  {
    level: 2,
    rows: [
      'bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'bedroom_1 bedroom_1 bedroom_1 bedroom_1 bedroom_1',
      'wc_2 wc_2 wc_2 circulation_1 circulation_1',
      'bedroom_2 bedroom_2 bedroom_2 circulation_1 circulation_1',
      'bedroom_2 bedroom_2 bedroom_2 circulation_1 circulation_1',
      'bedroom_2 bedroom_2 bedroom_2 circulation_1 circulation_1',
      'bedroom_2 bedroom_2 bedroom_2 circulation_1 circulation_1',
      'bedroom_2 bedroom_2 bedroom_2 circulation_1 circulation_1',
      'bedroom_2 bedroom_2 bedroom_2 circulation_1 circulation_1',
      'bedroom_2 bedroom_2 bedroom_2 circulation_1 circulation_1',
      'light_well_2 stair_2 stair_2 stair_2 stair_2',
      'light_well_2 stair_2 stair_2 stair_2 stair_2',
      'light_well_2 stair_2 stair_2 stair_2 stair_2',
      'light_well_2 stair_2 stair_2 stair_2 stair_2',
      'light_well_2 stair_2 stair_2 stair_2 stair_2',
    ],
  },
  {
    level: 3,
    rows: [
      'bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'bedroom_3 bedroom_3 bedroom_3 bedroom_3 bedroom_3',
      'study_1 study_1 study_1 circulation_2 circulation_2',
      'study_1 study_1 study_1 circulation_2 circulation_2',
      'study_1 study_1 study_1 circulation_2 circulation_2',
      'study_1 study_1 study_1 circulation_2 circulation_2',
      'study_1 study_1 study_1 circulation_2 circulation_2',
      'study_1 study_1 study_1 circulation_2 circulation_2',
      'wc_3 wc_3 wc_3 circulation_2 circulation_2',
      'wc_3 wc_3 wc_3 circulation_2 circulation_2',
      'light_well_3 stair_3 stair_3 stair_3 stair_3',
      'light_well_3 stair_3 stair_3 stair_3 stair_3',
      'light_well_3 stair_3 stair_3 stair_3 stair_3',
      'light_well_3 stair_3 stair_3 stair_3 stair_3',
      'light_well_3 stair_3 stair_3 stair_3 stair_3',
    ],
  },
];

export const TOWNHOUSE_HOUSE: AiHouseIntent = sketched(TOWNHOUSE_ZONED, TOWNHOUSE_SKETCHES);

/** Ý định vùng + bản phác → ý định đúng hợp đồng hiện hành: bỏ vùng, thêm bản phác. */
export function sketched(house: HouseIntent, sketches: AiHouseIntent['sketches']): AiHouseIntent {
  return {
    ...house,
    rooms: house.rooms.map(({ zone: _zone, street_facing: _street, ...room }) => room),
    sketches,
  };
}

/**
 * Nhà ống 4 × 15 m, hai tầng, vợ chồng + một con, một ô tô — từng là ví dụ mẫu trong lời dẫn
 * (`kb/ai_design_prompts.yaml` ≤ 4.0.0). T46 bỏ nó khỏi lời dẫn; giữ ở đây làm ca kiểm bộ xếp nhà ống.
 */
export const TUBE_ZONED: HouseIntent = {
  variant_label: 'Để xe trước, thang giữa nhà dọc tường, giếng trời sau',
  rationale:
    'Vào nhà qua chỗ để xe; khách ngay sau, bếp ăn giữa nhà, thang dồn về sau cạnh giếng trời. Tầng 2 phòng ngủ chính ra mặt đường, phòng con phía sau, hành lang dọc thang.',
  assumptions: [],
  rooms: [
    {
      id: 'garage_1',
      type: 'garage',
      level: 1,
      target_area_m2: 12,
      ensuite_of: null,
      zone: 'front',
      street_facing: true,
    },
    {
      id: 'living_1',
      type: 'living',
      level: 1,
      target_area_m2: 11,
      ensuite_of: null,
      zone: 'front',
      street_facing: false,
    },
    {
      id: 'kitchen_1',
      type: 'kitchen',
      level: 1,
      target_area_m2: 8,
      ensuite_of: null,
      zone: 'center',
      street_facing: false,
    },
    {
      id: 'dining_1',
      type: 'dining',
      level: 1,
      target_area_m2: 4,
      ensuite_of: null,
      zone: 'center',
      street_facing: false,
    },
    {
      id: 'wc_1',
      type: 'wc',
      level: 1,
      target_area_m2: 3,
      ensuite_of: null,
      zone: 'center',
      street_facing: false,
    },
    {
      id: 'stair_1',
      type: 'stair',
      level: 1,
      target_area_m2: 9,
      ensuite_of: null,
      zone: 'back',
      street_facing: false,
    },
    {
      id: 'light_well_1',
      type: 'light_well',
      level: 1,
      target_area_m2: 4,
      ensuite_of: null,
      zone: 'back',
      street_facing: false,
    },
    {
      id: 'master_1',
      type: 'master_bedroom',
      level: 2,
      target_area_m2: 14,
      ensuite_of: null,
      zone: 'front',
      street_facing: true,
    },
    {
      id: 'wc_2',
      type: 'wc',
      level: 2,
      target_area_m2: 3,
      ensuite_of: 'master_1',
      zone: 'front',
      street_facing: false,
    },
    {
      id: 'bed_1',
      type: 'bedroom',
      level: 2,
      target_area_m2: 12,
      ensuite_of: null,
      zone: 'center',
      street_facing: false,
    },
    {
      id: 'hall_2',
      type: 'circulation',
      level: 2,
      target_area_m2: 6,
      ensuite_of: null,
      zone: 'center',
      street_facing: false,
    },
    {
      id: 'stair_2',
      type: 'stair',
      level: 2,
      target_area_m2: 9,
      ensuite_of: null,
      zone: 'back',
      street_facing: false,
    },
    {
      id: 'light_well_2',
      type: 'light_well',
      level: 2,
      target_area_m2: 4,
      ensuite_of: null,
      zone: 'back',
      street_facing: false,
    },
  ],
  relationships: [
    { a: 'kitchen_1', b: 'dining_1', kind: 'open' },
    { a: 'garage_1', b: 'living_1', kind: 'adjacent' },
    { a: 'living_1', b: 'kitchen_1', kind: 'adjacent' },
    { a: 'stair_1', b: 'kitchen_1', kind: 'adjacent' },
    { a: 'hall_2', b: 'stair_2', kind: 'adjacent' },
    { a: 'hall_2', b: 'master_1', kind: 'adjacent' },
    { a: 'hall_2', b: 'bed_1', kind: 'adjacent' },
  ],
  entry_room: 'garage_1',
  garage_room: 'garage_1',
};

export const TUBE_SKETCHES: AiHouseIntent['sketches'] = [
  {
    level: 1,
    rows: [
      'garage_1 garage_1 garage_1 garage_1',
      'garage_1 garage_1 garage_1 garage_1',
      'garage_1 garage_1 garage_1 garage_1',
      'garage_1 garage_1 garage_1 garage_1',
      'living_1 living_1 living_1 living_1',
      'living_1 living_1 living_1 living_1',
      'living_1 living_1 living_1 living_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1',
      'kitchen_1 kitchen_1 kitchen_1 wc_1',
      'light_well_1 stair_1 stair_1 stair_1',
      'light_well_1 stair_1 stair_1 stair_1',
      'light_well_1 stair_1 stair_1 stair_1',
      'light_well_1 stair_1 stair_1 stair_1',
    ],
  },
  {
    level: 2,
    rows: [
      'wc_2 wc_2 wc_2 wc_2',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1',
      'master_bedroom_1 master_bedroom_1 master_bedroom_1 master_bedroom_1',
      'bedroom_1 bedroom_1 bedroom_1 circulation_1',
      'bedroom_1 bedroom_1 bedroom_1 circulation_1',
      'bedroom_1 bedroom_1 bedroom_1 circulation_1',
      'bedroom_1 bedroom_1 bedroom_1 circulation_1',
      'bedroom_1 bedroom_1 bedroom_1 circulation_1',
      'bedroom_1 bedroom_1 bedroom_1 circulation_1',
      'light_well_2 stair_2 stair_2 stair_2',
      'light_well_2 stair_2 stair_2 stair_2',
      'light_well_2 stair_2 stair_2 stair_2',
      'light_well_2 stair_2 stair_2 stair_2',
    ],
  },
];

export const TUBE_HOUSE: AiHouseIntent = sketched(TUBE_ZONED, TUBE_SKETCHES);
