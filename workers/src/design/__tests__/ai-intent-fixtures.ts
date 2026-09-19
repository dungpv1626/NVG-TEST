/**
 * Ý định bố cục viết tay — thứ mô hình SẼ trả về ở luồng T43, cho đúng chương trình không gian của
 * `ai-tree-fixtures.ts`.
 *
 * Không một con số nào ở đây: chỉ vùng, mặt đường, quan hệ, phòng mang cửa chính. Phép thử đòi bộ giải
 * dựng từ chúng những tầng đi qua trọn cổng kiểm của `ai/tree/` — cùng cổng mà cây viết tay đi qua.
 */

import type { AiPlanIntent } from '@nvg/shared/design';

type Room = AiPlanIntent['rooms'][number];
type Rel = AiPlanIntent['relationships'][number];

const room = (id: string, zone: Room['zone'], street = false): Room => ({
  id,
  zone,
  street_facing: street,
});
const rel = (a: string, b: string, kind: Rel['kind']): Rel => ({ a, b, kind });

// ── Nhà phố 4 × 15 m, 3 tầng ──────────────────────────────────────────────────────────────────

export const TOWNHOUSE_INTENTS: AiPlanIntent[] = [
  {
    variant_label: 'Để xe trước, bếp giữa, thang và giếng trời sau',
    rationale: 'Vào nhà qua chỗ để xe; khách ngay sau, bếp ăn giữa nhà, thang và WC dồn về sau.',
    rooms: [
      room('garage_1', 'front', true),
      room('living_1', 'front'),
      room('kitchen_1', 'center'),
      room('dining_1', 'center'),
      room('wc_1', 'center'),
      room('stair_1', 'back'),
      room('light_well_1', 'back'),
    ],
    relationships: [
      rel('kitchen_1', 'dining_1', 'open'),
      rel('living_1', 'kitchen_1', 'adjacent'),
      rel('garage_1', 'living_1', 'adjacent'),
      rel('stair_1', 'kitchen_1', 'adjacent'),
    ],
    entry_room: 'garage_1',
    garage_room: 'garage_1',
  },
  {
    variant_label: null,
    rationale: 'Phòng ngủ lớn ra mặt đường, hành lang một bên dẫn về thang.',
    rooms: [
      room('bedroom_1', 'front', true),
      room('bedroom_2', 'center'),
      room('circulation_1', 'center'),
      room('wc_2', 'center'),
      room('stair_2', 'back'),
      room('light_well_2', 'back'),
    ],
    relationships: [
      rel('circulation_1', 'stair_2', 'adjacent'),
      rel('bedroom_1', 'circulation_1', 'adjacent'),
    ],
    entry_room: null,
    garage_room: null,
  },
  {
    variant_label: null,
    rationale: 'Phòng ngủ ra mặt đường, phòng làm việc giữa nhà.',
    rooms: [
      room('bedroom_3', 'front', true),
      room('study_1', 'center'),
      room('circulation_2', 'center'),
      room('wc_3', 'back'),
      room('stair_3', 'back'),
      room('light_well_3', 'back'),
    ],
    relationships: [rel('circulation_2', 'stair_3', 'adjacent')],
    entry_room: null,
    garage_room: null,
  },
];

// ── Biệt thự 15 × 20 m, 2 tầng ────────────────────────────────────────────────────────────────

export const VILLA_INTENTS: AiPlanIntent[] = [
  {
    variant_label: 'Sảnh giữa mặt tiền, khách và bếp phía sau',
    rationale:
      'Sảnh và để xe ra mặt tiền; phòng ông bà phía trước bên phải; sinh hoạt chung phía sau.',
    rooms: [
      room('garage_1', 'front_left', true),
      room('circulation_1', 'front', true),
      room('bedroom_1', 'front_right'),
      room('stair_1', 'back_left'),
      room('wc_1', 'back_left'),
      room('living_1', 'back'),
      room('dining_1', 'back'),
      room('kitchen_1', 'back_right'),
    ],
    relationships: [
      rel('living_1', 'dining_1', 'open'),
      rel('circulation_1', 'living_1', 'adjacent'),
      rel('kitchen_1', 'dining_1', 'adjacent'),
      rel('stair_1', 'living_1', 'adjacent'),
    ],
    entry_room: 'circulation_1',
    garage_room: 'garage_1',
  },
  {
    variant_label: null,
    rationale: 'Phòng ngủ chính ra mặt tiền có ban công; hai phòng ngủ phía sau.',
    rooms: [
      room('circulation_2', 'center'),
      room('master_bedroom_1', 'front', true),
      room('balcony_1', 'front_right', true),
      room('stair_2', 'back_left'),
      room('wc_2', 'back'),
      room('bedroom_2', 'back'),
      room('bedroom_3', 'back_right'),
    ],
    relationships: [
      rel('master_bedroom_1', 'balcony_1', 'adjacent'),
      rel('circulation_2', 'stair_2', 'adjacent'),
    ],
    entry_room: null,
    garage_room: null,
  },
];
