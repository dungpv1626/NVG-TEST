/**
 * `ai/tree/` — cây chia một tầng thành một tầng đã qua cổng (T37–T40).
 *
 * Hai điều phép thử này phải chứng minh, theo đúng thứ tự quan trọng:
 *
 *  1. **Cây đúng thì đi qua IM LẶNG** — kể cả qua lưới an toàn (bộ suy tường và cổng kiểm cũ). Nếu
 *     `levelFromRooms` hay `checkPlan` lên tiếng trên một fixture, đó là lỗi của `ai/tree/`, không
 *     phải của mô hình: chồng lấn, sàn trống, phòng chạm nhau không chừa vách đều không diễn đạt
 *     được bằng cây.
 *  2. **Cây sai thì bị bắt, với câu nêu đúng chỗ** — mỗi phép thử phủ định dựng đúng MỘT chỗ hỏng.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFloorPlan, AiPlanTree, AiSpaceProgram } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { toRect, type Rect } from '../ai/draw/geometry';
import { outlineFaces } from '../ai/outline-faces';
import { checkPlan } from '../ai/plan-check';
import { levelFromRooms } from '../ai/plan-geometry';
import { layoutLevel, SNAP_MAX_CM, type LevelAnchors, type LevelLayout } from '../ai/tree';
import { parseConstructionNorms } from '../kb/construction';
import type { Face } from '../kb/site-context';
import { mergeAllowed, parseVocabulary, roomGroups } from '../kb/vocabulary';
import {
  REAL_0913_BUILDABLE,
  REAL_0913_FIRST,
  REAL_0913_PROGRAM,
  REAL_0913_RESAMPLED,
  TOWNHOUSE_BUILDABLE,
  TOWNHOUSE_PROGRAM,
  TOWNHOUSE_TREES,
  VILLA_BUILDABLE,
  VILLA_PROGRAM,
  VILLA_TREES,
} from './ai-tree-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');

const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groupsTable = roomGroups(vocabulary);
const groups = {
  outdoor: new Set(groupsTable.outdoor ?? []),
  vertical: new Set(groupsTable.circulation ?? []),
  noDoorRequired: new Set(groupsTable.no_door_required ?? []),
  habitable: new Set(groupsTable.habitable ?? []),
  doorHosts: groupsTable.door_hosts ?? [],
};
const merges = mergeAllowed(vocabulary);

interface House {
  program: AiSpaceProgram;
  trees: AiPlanTree[];
  buildable: Rect;
  openFaces: Face[];
}

const TOWNHOUSE: House = {
  program: TOWNHOUSE_PROGRAM,
  trees: TOWNHOUSE_TREES,
  buildable: TOWNHOUSE_BUILDABLE,
  openFaces: ['front', 'back'],
};
const VILLA: House = {
  program: VILLA_PROGRAM,
  trees: VILLA_TREES,
  buildable: VILLA_BUILDABLE,
  openFaces: ['front', 'back', 'left', 'right'],
};

function layout(
  house: House,
  index: number,
  anchors: LevelAnchors | null,
  tree: AiPlanTree = house.trees[index]!,
): LevelLayout {
  return layoutLevel({
    tree,
    level: index + 1,
    isTop: index === house.trees.length - 1,
    program: house.program,
    buildableCm: house.buildable,
    construction,
    groups,
    mergeAllowed: merges,
    openFaces: house.openFaces,
    accessFaces: ['front'],
    anchors,
  });
}

/** Mọi tầng theo đúng luồng thật: tầng 1 trước, các tầng trên nhận mốc của tầng 1. */
function layoutHouse(house: House): LevelLayout[] {
  const first = layout(house, 0, null);
  return [first, ...house.trees.slice(1).map((_, i) => layout(house, i + 1, first.anchors))];
}

/** Ghép các tầng thành một artifact đủ để chạy lại cổng LIÊN TẦNG. */
function assembled(house: House, levels: LevelLayout[]): AiFloorPlan {
  return {
    levels: levels.map((result) => {
      const geometry = levelFromRooms(result.level!, construction, groups.outdoor);
      return {
        ...geometry.level,
        outline_faces: outlineFaces(
          geometry.level.outline.map(([x, y]) => [x, y] as [number, number]),
          house.openFaces,
        ),
      };
    }),
  } as unknown as AiFloorPlan;
}

const codes = (result: LevelLayout) => result.issues.map((issue) => issue.code);

describe('cây đúng đi qua trọn cổng kiểm, không một lỗi nào', () => {
  for (const [name, house] of [
    ['nhà phố 3 tầng', TOWNHOUSE],
    ['biệt thự chữ L 2 tầng', VILLA],
  ] as const) {
    it(`${name}: mọi tầng dựng được, lưới an toàn im lặng`, () => {
      const levels = layoutHouse(house);
      for (const result of levels) {
        expect(result.issues, `tầng ${result.level?.level}`).toEqual([]);
        expect(result.level).not.toBeNull();
      }
    });

    it(`${name}: tường suy ra chỉ có 11 hoặc 22 cm — không có bức 16,5`, () => {
      for (const result of layoutHouse(house)) {
        const geometry = levelFromRooms(result.level!, construction, groups.outdoor);
        expect(geometry.issues).toEqual([]);
        const thicknesses = new Set(geometry.level.walls.map((wall) => wall.t));
        expect(
          [...thicknesses].every((t) => t === 11 || t === 22),
          [...thicknesses].join(','),
        ).toBe(true);
      }
    });

    it(`${name}: cả nhà qua cổng LIÊN TẦNG — thang chồng khít, mọi phòng đi tới được`, () => {
      const levels = layoutHouse(house);
      const check = checkPlan({
        plan: assembled(house, levels),
        program: house.program,
        buildable: house.buildable,
        doorExemptTypes: groups.noDoorRequired,
        verticalTypes: groups.vertical,
      });
      expect(check.blocking).toEqual([]);
    });

    it(`${name}: tất định — cùng cây cho cùng tầng, từng byte`, () => {
      expect(JSON.stringify(layoutHouse(house))).toBe(JSON.stringify(layoutHouse(house)));
    });
  }

  it('diện tích mỗi phòng tính từ chính chữ nhật lọt lòng, không lệch một xen-ti-mét vuông nào', () => {
    for (const result of layoutHouse(VILLA)) {
      for (const room of result.level!.rooms) {
        const r = toRect(room.rect);
        expect(room.area_m2, room.id).toBe(Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 100) / 100);
      }
    }
  });

  it('tường bao nằm TRỌN trong khối xây: footprint ở 0 thì mặt trong phòng ở 22', () => {
    const [first] = layoutHouse(TOWNHOUSE);
    const garage = first!.level!.rooms.find((room) => room.id === 'garage_1')!;
    expect(garage.rect).toEqual([22, 22, 378, 384.5]);
  });

  it('nhà chữ L: hình bao 6 góc, ô unbuilt nằm ngoài', () => {
    const [first] = layoutHouse(VILLA);
    expect(first!.level!.outline).toHaveLength(6);
    expect(first!.level!.outline).toContainEqual([1200, 400]);
    expect(first!.level!.outline).toContainEqual([1500, 1000]);
  });

  it('số bậc do chương trình tính từ chiều cao tầng: 3,6 m / 0,17 m = 21 bậc', () => {
    const [first] = layoutHouse(TOWNHOUSE);
    expect(first!.level!.stairs).toEqual([
      expect.objectContaining({ id: 'st1', up: '-y', treads: 21, flights: 2 }),
    ]);
    // Tầng trên cùng không có thang đi lên.
    expect(layoutHouse(TOWNHOUSE)[2]!.level!.stairs).toEqual([]);
  });

  it('cửa phòng ngủ quét VÀO phòng ngủ, không quét ra hành lang', () => {
    const second = layoutHouse(TOWNHOUSE)[1]!;
    const door = second.level!.doors!.find(
      (d) => d.room === 'bedroom_1' || d.room === 'circulation_1',
    )!;
    expect(door.kind).toBe('single');
    expect(door.swing).toBe(door.room === 'bedroom_1' ? 'in' : 'out');
  });

  it('WC dùng quy cách cửa vệ sinh (75 cm), không phải cửa phòng (90 cm)', () => {
    const second = layoutHouse(TOWNHOUSE)[1]!;
    const wcDoor = second.level!.doors!.find((d) => {
      const rect = second.level!.rooms.find((r) => r.id === d.room)!;
      return rect.id === 'bedroom_2' && d.edge === 'back';
    })!;
    expect(wcDoor.w).toBe(75);
  });

  it('cửa sổ: phòng ngủ mặt tiền có cửa sổ; cạnh giáp nhà hàng xóm thì không bao giờ', () => {
    const levels = layoutHouse(TOWNHOUSE);
    const windows = levels.flatMap((result) => result.level!.windows ?? []);
    expect(windows.some((w) => w.room === 'bedroom_1' && w.edge === 'front')).toBe(true);
    expect(windows.filter((w) => w.edge === 'left' || w.edge === 'right')).toEqual([]);
    // Phòng ngủ 2 không có cạnh nào giáp mặt thoáng — không bịa cửa sổ, và NÓI RA.
    expect(levels[1]!.notes.map((note) => note.code)).toContain('window_none');
  });

  it('`no_window` gỡ đúng phòng được từ chối', () => {
    const tree = { ...TOWNHOUSE.trees[1]!, no_window: ['bedroom_1'] };
    const result = layout(TOWNHOUSE, 1, layout(TOWNHOUSE, 0, null).anchors, tree);
    expect((result.level!.windows ?? []).some((w) => w.room === 'bedroom_1')).toBe(false);
  });
});

describe('cây sai bị bắt, câu lỗi nêu đúng chỗ', () => {
  const first = () => layout(TOWNHOUSE, 0, null);
  const withTree = (patch: Partial<AiPlanTree>, index = 0) =>
    layout(TOWNHOUSE, index, index === 0 ? null : first().anchors, {
      ...TOWNHOUSE.trees[index]!,
      ...patch,
    });
  const nodes = (index: number) => TOWNHOUSE.trees[index]!.nodes.map((node) => ({ ...node }));

  it('nhát cắt nằm ngoài ô nó chia', () => {
    const changed = nodes(0);
    changed[2]!.at = 700; // n2 chia ô y 800–1500
    const result = withTree({ nodes: changed });
    expect(codes(result)).toContain('cut_outside_cell');
    expect(result.level).toBeNull();
    expect(result.issues[0]!.message).toContain('"n2"');
  });

  it('nhát cắt chừa một bên hẹp hơn mức tối thiểu', () => {
    const changed = nodes(0);
    changed[4]!.at = 30;
    expect(codes(withTree({ nodes: changed }))).toContain('cut_too_close');
  });

  it('phòng đặt nhầm tầng — câu lỗi nói phòng ấy thuộc tầng nào', () => {
    const changed = nodes(0);
    changed[0]!.a = 'bedroom_1';
    const result = withTree({ nodes: changed });
    expect(codes(result)).toContain('leaf_unknown');
    expect(result.issues[0]!.message).toContain('tầng 2');
  });

  it('một ô xuất hiện hai lần', () => {
    const changed = nodes(0);
    changed[4]!.a = 'stair_1';
    expect(codes(withTree({ nodes: changed }))).toContain('tree_child_reused');
  });

  it('nút mồ côi và cây hai gốc', () => {
    const changed = [
      ...nodes(0),
      { id: 'lost', cut: 'x' as const, at: 200, a: 'unbuilt_1', b: 'void_1' },
    ];
    expect(codes(withTree({ nodes: changed }))).toContain('tree_many_roots');
  });

  it('phòng của chương trình không có ô nào', () => {
    expect(codes(withTree({ also: [] }))).toContain('room_missing_on_level');
  });

  it('hành lang KHÔNG được ghép vào phòng khác — đúng lỗi của lượt chạy 13/09/2026', () => {
    const tree = VILLA.trees[0]!;
    const changed = tree.nodes.map((node) =>
      node.id === 'n4' ? { ...node, a: 'bedroom_1', b: 'unbuilt_2' } : node,
    );
    const result = layout(VILLA, 0, null, {
      ...tree,
      nodes: changed,
      also: [...tree.also, { room: 'bedroom_1', with: ['circulation_1'] }],
      doors: tree.doors.filter((door) => door.a !== 'circulation_1' && door.b !== 'circulation_1'),
    });
    expect(codes(result)).toContain('merge_not_allowed');
  });

  it('cửa giữa hai phòng không chung vách: chương trình bỏ cửa, ghi chú, KHÔNG bác cả tầng', () => {
    const result = withTree({
      doors: [...TOWNHOUSE.trees[0]!.doors, { a: 'garage_1', b: 'wc_1', kind: 'single' }],
    });
    expect(result.issues).toEqual([]);
    expect(result.notes.find((note) => note.code === 'door_dropped')?.message).toContain(
      '"garage_1–wc_1"',
    );
  });

  it('cửa ra ngoài chỉ có thể trên cạnh giáp nhà hàng xóm', () => {
    const result = withTree({
      doors: [
        ...TOWNHOUSE.trees[0]!.doors.filter((door) => door.b !== 'outside'),
        { a: 'living_1', b: 'outside', kind: 'single' },
      ],
    });
    expect(codes(result)).toEqual(expect.arrayContaining(['door_outside_on_boundary']));
  });

  it('phòng không cửa, và cả tầng mất lối vào', () => {
    const result = withTree({
      doors: TOWNHOUSE.trees[0]!.doors.filter((door) => door.b !== 'wc_1' && door.b !== 'outside'),
    });
    expect(codes(result)).toEqual(
      expect.arrayContaining(['room_without_door', 'level_no_entrance']),
    );
  });

  it('phòng khép kín mở ra chỗ khác mà vẫn giáp phòng mẹ: chương trình chuyển cửa vào phòng mẹ', () => {
    const tree = TOWNHOUSE.trees[1]!;
    const result = withTree(
      {
        doors: [
          ...tree.doors.filter((door) => door.b !== 'wc_2'),
          { a: 'wc_2', b: 'stair_2', kind: 'single' },
        ],
      },
      1,
    );
    expect(result.issues).toEqual([]);
    expect(result.notes.map((note) => note.code)).toEqual(
      expect.arrayContaining(['door_dropped', 'door_added']),
    );
    const wcDoors = (result.level!.doors ?? []).filter(
      (door) => door.room === 'wc_2' || door.room === 'bedroom_2',
    );
    expect(wcDoors.length).toBeGreaterThan(0);
  });

  it('phòng khép kín KHÔNG giáp phòng mẹ thì vẫn là lỗi cổng — thêm cửa không sửa được bố cục', () => {
    const tree = TOWNHOUSE.trees[1]!;
    const program = {
      ...TOWNHOUSE.program,
      spaces: TOWNHOUSE.program.spaces.map((space) =>
        space.id === 'wc_2' ? { ...space, ensuite_of: 'bedroom_1' } : space,
      ),
    };
    const result = layout({ ...TOWNHOUSE, program }, 1, first().anchors, tree);
    expect(codes(result)).toContain('ensuite_door_wrong');
  });

  it('tầng giữa không khai thang', () => {
    expect(codes(withTree({ stair: null }, 1))).toContain('stair_missing_on_level');
  });
});

describe('bám mốc tầng dưới', () => {
  const anchors = () => layout(TOWNHOUSE, 0, null).anchors!;
  const shifted = (dy: number) => {
    const tree = TOWNHOUSE.trees[1]!;
    return {
      ...tree,
      nodes: tree.nodes.map((node) => (node.id === 'n1' ? { ...node, at: node.at + dy } : node)),
    };
  };

  it(`lệch ${SNAP_MAX_CM} cm trở xuống: chương trình dời vách cho trùng, và ghi chú lại`, () => {
    const result = layout(TOWNHOUSE, 1, anchors(), shifted(-25));
    expect(result.issues).toEqual([]);
    expect(result.notes.map((note) => note.code)).toContain('anchor_snapped');
    const stair = result.level!.stairs![0]!;
    expect(stair.rect).toEqual(layout(TOWNHOUSE, 0, null).level!.stairs![0]!.rect);
    // Cây lưu lại là cây ĐÃ dời — đúng cây sinh ra hình học.
    expect(result.tree.nodes.find((node) => node.id === 'n1')!.at).toBe(1160);
  });

  it(`lệch quá ${SNAP_MAX_CM} cm: không sửa hộ, là lỗi cổng`, () => {
    const result = layout(TOWNHOUSE, 1, anchors(), shifted(-45));
    expect(codes(result)).toContain('stair_not_at_anchor');
  });
});

describe('lối vào chính và lối xe đúng mặt đầu bài khai (13/09/2026)', () => {
  const withEntrances = (main: Face | null, vehicle: Face | null) =>
    layoutLevel({
      tree: VILLA.trees[0]!,
      level: 1,
      isTop: false,
      program: VILLA.program,
      buildableCm: VILLA.buildable,
      construction,
      groups,
      mergeAllowed: merges,
      openFaces: VILLA.openFaces,
      accessFaces: ['front'],
      anchors: null,
      entrances: { main, vehicle },
    });

  it('khai đúng mặt có thể đặt được thì qua cổng', () => {
    expect(withEntrances('front', 'front').issues).toEqual([]);
  });

  it('lối vào chính ở mặt không có phòng nào chạm tới thì là lỗi cổng', () => {
    // Sảnh (`circulation_1`) chỉ chạm mặt trước; mặt sau là bếp, phòng khách, WC.
    expect(codes(withEntrances('back', null))).toContain('entrance_wrong_side');
  });

  it('lối xe ở mặt chỗ để xe không chạm tới thì là lỗi cổng', () => {
    expect(codes(withEntrances(null, 'right'))).toContain('vehicle_door_wrong_side');
  });
});

describe('lượt chạy thật 13/09/2026 (V-26) — sửa tôpô cửa thay vì bác cả phương án', () => {
  const REAL: House = {
    program: REAL_0913_PROGRAM,
    trees: [REAL_0913_FIRST],
    buildable: REAL_0913_BUILDABLE,
    openFaces: ['front', 'back', 'left'],
  };
  const run = (tree: AiPlanTree) =>
    layoutLevel({
      tree,
      level: 1,
      isTop: false,
      program: REAL.program,
      buildableCm: REAL.buildable,
      construction,
      groups,
      mergeAllowed: merges,
      openFaces: REAL.openFaces,
      accessFaces: ['front', 'left'],
      anchors: null,
      entrances: { main: 'front', vehicle: 'front' },
    });

  it('lượt 1 chỉ quên cửa kho → chương trình mở cửa kho ra thang, tầng qua cổng', () => {
    const result = run(REAL_0913_FIRST);
    expect(result.issues).toEqual([]);
    expect(result.level).not.toBeNull();
    const added = result.notes.filter((note) => note.code === 'door_added');
    expect(added.map((note) => note.message)).toEqual([
      expect.stringContaining('"stair_1–storage_1"'),
    ]);
  });

  it('lượt 1 đi qua cả lưới an toàn cũ — không phòng nào chạm nhau thiếu vách, không lỗi cửa', () => {
    const result = run(REAL_0913_FIRST);
    const geometry = levelFromRooms(result.level!, construction, groups.outdoor);
    expect(geometry.issues).toEqual([]);
  });

  it('lượt lấy mẫu lại: phòng giúp việc chỉ đi được xuyên phòng người khác → vẫn bác, nói rõ giáp gì', () => {
    const result = run(REAL_0913_RESAMPLED);
    expect(result.level).toBeNull();
    const helper = result.issues.find(
      (issue) => issue.code === 'room_without_door' && issue.ref === 'bedroom_2',
    );
    expect(helper?.message).toContain('đang giáp:');
    expect(codes(result)).not.toContain('door_rooms_not_adjacent');
    expect(result.notes.filter((note) => note.code === 'door_dropped')).toHaveLength(2);
  });

  it('không có nhóm `door_hosts` thì không tự nối — hành vi cũ, để tắt được bằng dữ liệu', () => {
    const result = layoutLevel({
      tree: REAL_0913_FIRST,
      level: 1,
      isTop: false,
      program: REAL.program,
      buildableCm: REAL.buildable,
      construction,
      groups: { ...groups, doorHosts: [] },
      mergeAllowed: merges,
      openFaces: REAL.openFaces,
      accessFaces: ['front', 'left'],
      anchors: null,
      entrances: { main: 'front', vehicle: 'front' },
    });
    expect(codes(result)).toContain('room_without_door');
  });
});
