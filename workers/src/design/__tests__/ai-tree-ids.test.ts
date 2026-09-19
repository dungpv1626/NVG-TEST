/**
 * Mã trong cây chia: viết hoa, dấu chấm, gạch nối không được làm hỏng cả tầng (13/09/2026).
 */

import { describe, expect, it } from 'vitest';
import { aiPlanIntentSchema, aiPlanTreeSchema } from '@nvg/shared/design';
import {
  clampText,
  normaliseHouseIds,
  normaliseIntentIds,
  normaliseProgramIds,
  normaliseTreeIds,
} from '../ai/tree/ids';

/** Đúng hình lượt hỏng thật: mã nút phân cấp `root.a`, `root.a.b`. */
function hierarchical() {
  return {
    variant_label: null,
    rationale: 'Thử.',
    footprint: [0, 0, 400, 1500],
    nodes: [
      { id: 'root', cut: 'y', at: 390, a: 'garage_1', b: 'root.b' },
      { id: 'root.b', cut: 'y', at: 800, a: 'living_1', b: 'root.b.b' },
      { id: 'root.b.b', cut: 'x', at: 160, a: 'WC_1', b: 'stair-1' },
    ],
    also: [],
    doors: [
      { a: 'garage_1', b: 'outside', kind: 'garage' },
      { a: 'living_1', b: 'WC_1', kind: 'single' },
    ],
    stair: { room: 'stair-1', up: '-y' },
    no_window: ['WC_1'],
  };
}

describe('normaliseTreeIds', () => {
  it('đổi mã sai luật về mã hợp lệ, KHỚP ở mọi chỗ tham chiếu, và cây qua hợp đồng', () => {
    const before = hierarchical();
    expect(aiPlanTreeSchema.safeParse(before).success).toBe(false);

    const { json, renamed } = normaliseTreeIds(before);
    const tree = aiPlanTreeSchema.parse(json);
    expect(tree.nodes.map((n) => n.id)).toEqual(['root', 'root_b', 'root_b_b']);
    expect(tree.nodes[0]!.b).toBe('root_b');
    expect(tree.nodes[2]).toMatchObject({ a: 'wc_1', b: 'stair_1' });
    expect(tree.doors[1]).toMatchObject({ b: 'wc_1' });
    expect(tree.stair?.room).toBe('stair_1');
    expect(tree.no_window).toEqual(['wc_1']);
    expect(renamed).toContainEqual(['root.b', 'root_b']);
    // Không sửa bản gốc.
    expect(before.nodes[1]!.id).toBe('root.b');
  });

  it('hai mã khác nhau chuẩn hoá ra cùng một mã thì KHÔNG đổi — để bộ kiểm bác và nói ra', () => {
    const tree = hierarchical();
    tree.nodes[2]!.a = 'n.1';
    tree.nodes[2]!.b = 'n_1';
    const { json } = normaliseTreeIds(tree);
    const nodes = (json as ReturnType<typeof hierarchical>).nodes;
    expect(nodes[2]!.a).toBe('n.1');
    expect(nodes[2]!.b).toBe('n_1');
  });

  it('cây đã hợp lệ thì trả nguyên — cùng cây, cùng mã băm', () => {
    const valid = { nodes: [{ id: 'root', cut: 'x', at: 100, a: 'a_1', b: 'b_1' }], doors: [] };
    expect(normaliseTreeIds(valid).json).toBe(valid);
  });
});

describe('normaliseIntentIds (T43)', () => {
  it('đổi mã sai luật ở phòng, quan hệ, cửa chính, chỗ để xe — khớp nhau, ý định qua hợp đồng', () => {
    const before = {
      variant_label: null,
      rationale: 'Thử.',
      rooms: [
        { id: 'Garage-1', zone: 'front', street_facing: true },
        { id: 'living.1', zone: 'center', street_facing: false },
      ],
      relationships: [{ a: 'Garage-1', b: 'living.1', kind: 'adjacent' }],
      entry_room: 'living.1',
      garage_room: 'Garage-1',
    };
    expect(aiPlanIntentSchema.safeParse(before).success).toBe(false);
    const intent = aiPlanIntentSchema.parse(normaliseIntentIds(before).json);
    expect(intent.rooms.map((r) => r.id)).toEqual(['garage_1', 'living_1']);
    expect(intent.relationships[0]).toMatchObject({ a: 'garage_1', b: 'living_1' });
    expect(intent.entry_room).toBe('living_1');
    expect(intent.garage_room).toBe('garage_1');
    expect(before.rooms[0]!.id).toBe('Garage-1');
  });

  it('ý định đã hợp lệ thì trả nguyên — cùng đối tượng', () => {
    const valid = { rooms: [{ id: 'wc_1' }], relationships: [], entry_room: null };
    expect(normaliseIntentIds(valid).json).toBe(valid);
  });
});

describe('mã đề xuất chương trình không gian và chữ quá trần (lượt thật 13/09/2026 22:14, 22:21)', () => {
  it('mã phòng sai khuôn được chuẩn hoá, `ensuite_of` đổi theo', () => {
    const { json } = normaliseProgramIds({
      spaces: [
        { id: 'Bedroom-1', type: 'bedroom', ensuite_of: null },
        { id: 'WC Bedroom-1', type: 'wc', ensuite_of: 'Bedroom-1' },
        { id: 'phòng_khách', type: 'living', ensuite_of: null },
      ],
    });
    const spaces = (json as { spaces: { id: string; ensuite_of: string | null }[] }).spaces;
    expect(spaces.map((s) => s.id)).toEqual(['bedroom_1', 'wc_bedroom_1', 'phong_khach']);
    expect(spaces[1]!.ensuite_of).toBe('bedroom_1');
  });

  it('chữ tự do quá trần bị cắt ở ranh giới từ, không bác', () => {
    const long = 'Lõi thang giữa nhà '.repeat(30);
    const { json, clamped } = clampText(
      { rationale: long, variant_label: 'ngắn' },
      {
        rationale: 300,
        variant_label: 120,
      },
    );
    const out = json as { rationale: string; variant_label: string };
    expect(clamped).toEqual(['rationale']);
    expect(out.rationale.length).toBeLessThanOrEqual(300);
    expect(out.rationale.endsWith('…')).toBe(true);
    expect(out.variant_label).toBe('ngắn');
  });
});

describe('normaliseHouseIds — ô bản phác đổi theo mã phòng (T48)', () => {
  it('mã phòng viết hoa/gạch ngang được chuẩn hoá thì ô bản phác trỏ mã ấy đổi theo', () => {
    const { json, renamed } = normaliseHouseIds({
      rooms: [
        { id: 'Living-1', ensuite_of: null },
        { id: 'wc1', ensuite_of: null },
      ],
      relationships: [{ a: 'Living-1', b: 'wc1', kind: 'adjacent' }],
      sketches: [{ level: 1, rows: ['Living-1 Living-1 wc1', 'Living-1  Living-1 .'] }],
      entry_room: 'Living-1',
      garage_room: null,
    });
    expect(renamed).toEqual([['Living-1', 'living_1']]);
    const out = json as { sketches: { rows: string[] }[]; entry_room: string };
    expect(out.sketches[0]!.rows).toEqual(['living_1 living_1 wc1', 'living_1 living_1 .']);
    expect(out.entry_room).toBe('living_1');
  });
});
