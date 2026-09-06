/**
 * Lớp 3a — bộ sinh ý đồ bố cục tất định.
 *
 * Bốn câu hỏi bộ kiểm thử này phải trả lời:
 *   1. Nó có sinh toạ độ hay kích thước không? (Không được — nguyên tắc bất biến 2.)
 *   2. Mọi không gian của chương trình có xuất hiện ĐÚNG MỘT LẦN trong cây không?
 *   3. Phòng cần sáng có rơi vào dải chạm mặt thoáng không, và dải giữa có được mở giếng trời?
 *   4. Lõi thang có nằm cùng một ĐƯỜNG ĐI trong cây ở mọi tầng không?
 *
 * Câu thứ tư là câu dễ hỏng nhất và khó đoán nhất: lệch đường đi thì hai lõi không thể trùng
 * khít, bộ giải báo `stair_alignment` mâu thuẫn, và tập ràng buộc trả về không chỉ được về
 * nguyên nhân thật.
 */

import { describe, expect, it } from 'vitest';
import type { SpaceProgram } from '@nvg/shared/design';
import { buildLayoutIntent, floorTree, LAYOUT_VARIANTS, type LayoutNode } from '../layout/intent';
import { spaceLabels } from '../layout/labels';
import { parseSiteContext, siteFaces } from '../layout/site-context';
import { testVocabularyYaml } from './program-fixtures';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';

const REF = `sha256:${'a'.repeat(64)}`;

type Space = SpaceProgram['spaces'][number];

function space(id: string, type: string, floor: number, extra: Partial<Space> = {}): Space {
  return {
    id,
    type,
    floor,
    min_area_m2: 6,
    target_area_m2: 12,
    max_area_m2: 30,
    ...extra,
  } as Space;
}

/** Đường đi tới từng lá, theo quy ước `a`/`b` của cây chia không gian. */
function leafPaths(node: LayoutNode, path = ''): Array<[string, string]> {
  if ('room' in node) return [[node.room, path]];
  if ('void' in node) return [[`void:${node.void}`, path]];
  return [...leafPaths(node.a, `${path}a`), ...leafPaths(node.b, `${path}b`)];
}

const townhouse = (): SpaceProgram =>
  ({
    schema_version: '1.0.0',
    brief_ref: REF,
    spaces: [
      space('stair_1', 'stair', 1),
      space('circulation_1', 'circulation', 1),
      space('living_1', 'living', 1, { needs_daylight: true, priority: 1 }),
      space('kitchen_1', 'kitchen', 1, { needs_daylight: true, priority: 3 }),
      space('wc_1', 'wc', 1, { priority: 5 }),
      space('stair_2', 'stair', 2),
      space('circulation_2', 'circulation', 2),
      space('bedroom_1', 'bedroom', 2, { needs_daylight: true, priority: 2 }),
      space('wc_2', 'wc', 2, { priority: 5 }),
      space('circulation_3', 'circulation', 3),
      space('master_bedroom_1', 'master_bedroom', 3, { needs_daylight: true, priority: 1 }),
    ],
    adjacency: [],
  }) as SpaceProgram;

describe('Lớp 3a — ý đồ bố cục', () => {
  it('không sinh một toạ độ hay kích thước nào', () => {
    // Nguyên tắc bất biến số 2 (CLAUDE.md 8.2) áp dụng cho mọi thứ đứng ở vị trí này, kể cả
    // khi chỗ đó đang là mã nguồn tất định thay vì mô hình ngôn ngữ.
    const json = JSON.stringify(buildLayoutIntent({ program: townhouse(), programRef: REF }));
    for (const forbidden of ['x_m', 'y_m', 'polygon', 'area_m2', 'width_m', 'depth_m']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('mỗi không gian của chương trình xuất hiện đúng một lần', () => {
    const program = townhouse();
    const intent = buildLayoutIntent({ program, programRef: REF }) as never as {
      floors: Array<{ level: number; wings: Array<{ tree: LayoutNode }> }>;
    };
    const placed = intent.floors.flatMap((f) =>
      leafPaths(f.wings[0]!.tree)
        .map(([id]) => id)
        .filter((id) => !id.startsWith('void:')),
    );
    expect([...placed].sort()).toEqual(program.spaces.map((s) => s.id).sort());
  });

  it('phòng cần sáng nằm ở dải mặt tiền hoặc dải trong cùng', () => {
    // Hai dải đó là hai dải duy nhất chạm mặt thoáng. Phòng cần sáng rơi vào dải giữa thì bộ
    // giải sẽ chặn — và chặn ở đó là quá muộn, phương án phải sinh lại từ đầu.
    const program = townhouse();
    const tree = floorTree(
      program.spaces.filter((s) => s.floor === 1),
      LAYOUT_VARIANTS[0]!,
      ['front', 'back'],
    )!;
    const paths = new Map(leafPaths(tree));
    // Dải mặt tiền là nhánh `a` của gốc; dải trong cùng là lá `b` sâu nhất của chồng dải.
    expect(paths.get('living_1')).toBe('a');
    expect(paths.get('kitchen_1')!.endsWith('b')).toBe(true);
  });

  it('phòng phục vụ không chiếm dải mặt tiền', () => {
    /*
     * Dải mặt tiền dùng chung một đường cắt ở mọi tầng, nên diện tích của nó bằng nhau giữa
     * các tầng. Đặt khu vệ sinh trần 8 m² lên đó là ép phòng khách 22 m² của tầng dưới xuống
     * 8 m² — và cái hiện ra là vô nghiệm, kèm tập ràng buộc trỏ vào chỗ khó hiểu nhất.
     */
    const spaces = [
      space('stair_9', 'stair', 9),
      space('circulation_9', 'circulation', 9),
      space('wc_9', 'wc', 9),
    ];
    const tree = floorTree(spaces, LAYOUT_VARIANTS[0]!, ['front', 'back'])!;
    const paths = new Map(leafPaths(tree));
    expect(paths.get('wc_9')).not.toBe('a');
    expect([...paths.keys()].some((k) => k.startsWith('void:'))).toBe(true);
  });

  it('thang đi cùng khu vệ sinh trong một dải, thang ở phía hành lang (V-11)', () => {
    const program = townhouse();
    const tree = floorTree(
      program.spaces.filter((s) => s.floor === 1),
      LAYOUT_VARIANTS[0]!,
      ['front', 'back'],
    )!;
    const paths = new Map(leafPaths(tree));
    const stairPath = paths.get('stair_1')!;
    const wcPath = paths.get('wc_1')!;
    // Cùng một nút cha (chỉ khác nhánh cuối) — tức là cạnh nhau trong cùng một dải.
    expect(stairPath.slice(0, -1)).toBe(wcPath.slice(0, -1));
    // Hành lang bên trái → thang ở nhánh `a` (bên trái, kề hành lang), vệ sinh ở `b`.
    expect(stairPath.endsWith('a')).toBe(true);
    expect(wcPath.endsWith('b')).toBe(true);

    const mirrored = floorTree(
      program.spaces.filter((s) => s.floor === 1),
      LAYOUT_VARIANTS[1]!,
      ['front', 'back'],
    )!;
    const mirroredPaths = new Map(leafPaths(mirrored));
    expect(mirroredPaths.get('stair_1')!.endsWith('b')).toBe(true);
  });

  it('lõi thang nằm cùng một đường đi ở mọi tầng có thang', () => {
    const program = townhouse();
    const intent = buildLayoutIntent({ program, programRef: REF }) as never as {
      floors: Array<{ level: number; wings: Array<{ tree: LayoutNode }> }>;
    };
    const stairPaths = intent.floors
      .map((f) => new Map(leafPaths(f.wings[0]!.tree)))
      .map((paths) => [...paths.entries()].find(([id]) => id.startsWith('stair_'))?.[1])
      .filter((p): p is string => p !== undefined);
    expect(stairPaths).toHaveLength(2);
    expect(new Set(stairPaths).size).toBe(1);
  });

  it('tầng chỉ có thang và hành lang vẫn giữ đúng đường đi của lõi', () => {
    // `chain` đặt phần tử đầu vào nhánh `a`, nên một chồng dải chỉ có mỗi thang sẽ đẩy thang
    // lên một bậc trong cây. Thêm khoảng thông tầng phía sau giữ nguyên đường đi.
    const tree = floorTree(
      [space('stair_5', 'stair', 5), space('circulation_5', 'circulation', 5)],
      LAYOUT_VARIANTS[0]!,
      ['front', 'back'],
    )!;
    const paths = new Map(leafPaths(tree));
    expect(paths.get('stair_5')).toBe('bba');
  });

  it('mặt trước bị bịt thì dải mặt tiền được mở giếng trời', () => {
    const tree = floorTree(
      townhouse().spaces.filter((s) => s.floor === 1),
      LAYOUT_VARIANTS[0]!,
      ['back'],
    )!;
    const paths = new Map(leafPaths(tree));
    expect(paths.get('living_1')).toBe('aa');
    expect(paths.get('void:lightwell')).toBe('ab');
  });

  it('giếng trời đứng về phía đối diện hành lang, ở cả ba phương án', () => {
    // Bài canh cho lỗi làm phương án B vô nghiệm ở MỌI lần sinh (06/09/2026): giếng trời
    // luôn bị đẩy xuống cuối dải, tức luôn nằm bên phải phòng. Với hành lang bên phải nó
    // chắn ngay giữa phòng và hành lang, mà bề rộng tối thiểu của nó lấy theo
    // `corridor_min_width` nên bộ giải không bóp về không được — mọi phòng cần sáng mất lối
    // vào cùng lúc.
    //
    // Đo bằng ĐƯỜNG ĐI trong cây chứ không bằng toạ độ: `a` là bên trái của một lát cắt V.
    for (const variant of LAYOUT_VARIANTS) {
      const tree = floorTree(
        // Một tầng có phòng cần sáng nằm giữa nhà: mặt sau bị bịt nên dải trong cùng cũng
        // không chạm mặt thoáng, và giếng trời chắc chắn được mở.
        [
          space('circulation_9', 'circulation', 9),
          space('living_9', 'living', 9, { needs_daylight: true, priority: 1 }),
          space('bedroom_9', 'bedroom', 9, { needs_daylight: true, priority: 2 }),
        ],
        variant,
        ['front'],
      )!;
      const paths = new Map(leafPaths(tree));
      const lightwell = paths.get('void:lightwell');
      expect(lightwell, `phương án ${variant.id} phải mở giếng trời`).toBeDefined();

      // Bước cuối của đường đi là bên nào của lát cắt V trong cùng — giếng trời phải đứng
      // ngược phía hành lang.
      const side = lightwell!.slice(-1);
      expect(side, `giếng trời của phương án ${variant.id} đứng sai phía`).toBe(
        variant.spine === 'left' ? 'b' : 'a',
      );
    }
  });

  it('ba phương án khác nhau về CẤU TRÚC, không phải khác vài con số', () => {
    const program = townhouse();
    const shapes = LAYOUT_VARIANTS.map((variant) =>
      JSON.stringify(
        leafPaths(
          floorTree(
            program.spaces.filter((s) => s.floor === 1),
            variant,
            ['front', 'back'],
          )!,
        ),
      ),
    );
    expect(new Set(shapes).size).toBe(LAYOUT_VARIANTS.length);
  });

  it('tầng không có không gian nào thì không sinh cây', () => {
    expect(floorTree([], LAYOUT_VARIANTS[0]!, ['front', 'back'])).toBeNull();
  });
});

describe('Hiện trạng bốn phía → mặt thoáng', () => {
  const table = parseSiteContext(`
version: '1.0.0'
open_faces:
  nha_hang_xom: false
  hem_2m: true
  duong_lon: true
default_open: false
always_open: [front]
`);

  it('nhà kẹp giữa hai hàng xóm chỉ còn mặt trước và mặt sau nếu mặt sau trống', () => {
    const faces = siteFaces(
      { adjacent: { left: 'nha_hang_xom', right: 'nha_hang_xom', back: 'hem_2m' } },
      table,
    );
    expect(faces.open).toEqual(['front', 'back']);
  });

  it('lô góc có ba mặt thoáng — không có gì trong mã được phép giả định là hai', () => {
    const faces = siteFaces(
      { adjacent: { left: 'duong_lon', right: 'nha_hang_xom', back: 'nha_hang_xom' } },
      table,
    );
    expect(faces.open).toEqual(['front', 'left']);
  });

  it('chưa khai hiện trạng thì coi như bị che, trừ mặt tiếp đường', () => {
    // Đoán về phía CHẶT hơn: đoán thoáng mà thực tế bị che thì bản vẽ ra có phòng ngủ không
    // cửa sổ, và không có gì báo.
    expect(siteFaces(undefined, table).open).toEqual(['front']);
  });

  it('mặt vào được luôn là mặt thoáng', () => {
    const faces = siteFaces(
      { access_sides: ['front', 'back'], adjacent: { back: 'nha_hang_xom' } },
      table,
    );
    expect(faces.access).toEqual(['front', 'back']);
    expect(faces.open).toContain('back');
  });
});

describe('Nhãn không gian', () => {
  it('chỉ đánh số khi có nhiều hơn một phòng cùng loại', () => {
    const labels = spaceLabels(townhouse(), {
      stair: 'Thang bộ',
      circulation: 'Giao thông',
      living: 'Phòng khách',
      kitchen: 'Bếp',
      wc: 'Khu vệ sinh',
      bedroom: 'Phòng ngủ',
      master_bedroom: 'Phòng ngủ chính',
    });
    expect(labels.living_1).toBe('Phòng khách');
    expect(labels.master_bedroom_1).toBe('Phòng ngủ chính');
    expect(labels.wc_1).toBe('Khu vệ sinh 1');
    expect(labels.wc_2).toBe('Khu vệ sinh 2');
  });

  it('thiếu nhãn thì rơi về mã không gian, không rơi về chuỗi rỗng', () => {
    const labels = spaceLabels(townhouse(), {});
    expect(labels.living_1).toBe('living');
  });
});

describe('Vị trí bắt buộc — vị từ `requires_face`', () => {
  const withGarageAndBalcony = (): SpaceProgram =>
    ({
      schema_version: '1.0.0',
      brief_ref: REF,
      spaces: [
        space('stair_1', 'stair', 1),
        space('circulation_1', 'circulation', 1),
        space('living_1', 'living', 1, { needs_daylight: true, priority: 1 }),
        space('garage_1', 'garage', 1, { priority: 4 }),
        space('kitchen_1', 'kitchen', 1, { needs_daylight: true, priority: 3 }),
        space('circulation_2', 'circulation', 2),
        space('bedroom_1', 'bedroom', 2, { needs_daylight: true, priority: 2 }),
        space('balcony_1', 'balcony', 2, { needs_daylight: true, priority: 4 }),
      ],
      adjacency: [],
    }) as SpaceProgram;

  const faceOf = (type: string) =>
    type === 'garage' ? ('access' as const) : type === 'balcony' ? ('open' as const) : null;

  const floors = (faces?: typeof faceOf) => {
    const intent = buildLayoutIntent({
      program: withGarageAndBalcony(),
      programRef: REF,
      openFaces: ['front', 'back'],
      accessFaces: ['front'],
      faceOf: faces,
    }) as never as { floors: Array<{ level: number; wings: Array<{ tree: LayoutNode }> }> };
    return new Map(intent.floors.map((f) => [f.level, f.wings[0]!.tree]));
  };

  /**
   * Lá CHẮC CHẮN chạm một mặt của hình bao, suy từ cấu trúc cây — cùng phép suy với
   * `touches_root_face` phía Container: chạm mặt trước khi và chỉ khi mọi lát cắt NGANG trên
   * đường đi đều rẽ nhánh `a`; chạm mặt trái khi mọi lát cắt DỌC đều rẽ nhánh `a`.
   */
  const touches = (tree: LayoutNode, ref: string, face: 'front' | 'left'): boolean => {
    const path = leafPaths(tree).find(([leaf]) => leaf === ref)?.[1];
    if (path === undefined) return false;
    const axis = face === 'front' ? 'H' : 'V';
    let node = tree;
    for (const branch of path) {
      if (!('split' in node)) return false;
      if (node.split === axis && branch === 'b') return false;
      node = branch === 'a' ? node.a : node.b;
    }
    return true;
  };
  const touchesFront = (tree: LayoutNode, ref: string) => touches(tree, ref, 'front');

  it('chỗ để xe ra mặt tiền, không nằm sau phòng khách', () => {
    /*
     * Trước 06/09/2026 dải mặt tiền luôn nhận phòng đứng đầu bảng xếp hạng theo nhu cầu chiếu
     * sáng, tức luôn là phòng khách — và chỗ để xe rơi vào chồng dải phía sau. Bố cục đó hợp
     * lệ theo mọi quy tắc đang có (chỗ để xe vẫn giáp hành lang) nhưng ô tô phải đi xuyên
     * phòng khách mới vào được.
     */
    expect(touchesFront(floors(faceOf).get(1)!, 'garage_1')).toBe(true);
    expect(touchesFront(floors(faceOf).get(1)!, 'living_1')).toBe(false);
  });

  it('không có gói quy tắc thì giữ nguyên cách xếp cũ, không đoán bù', () => {
    // `NO_RULES` là trạng thái thật của mọi lớp gọi chưa có gói quy tắc trong tay.
    expect(touchesFront(floors().get(1)!, 'living_1')).toBe(true);
  });

  it('ban công ra mặt thoáng và vẫn kề hành lang', () => {
    const tree = floors(faceOf).get(2)!;
    expect(touchesFront(tree, 'balcony_1')).toBe(true);
    expect(touchesFront(tree, 'bedroom_1')).toBe(true);

    // Và cùng phía với hành lang — phương án mặc định có hành lang bên TRÁI. Đó là điều kiện
    // để ban công chung một đoạn biên với khối giao thông; đặt về phía kia thì nó không kề
    // không gian giao thông nào, và `every_room_requires_access` — mức chặn phát hành — kết
    // luận vô nghiệm.
    expect(touches(tree, 'balcony_1', 'left')).toBe(true);
    expect(touches(tree, 'circulation_2', 'left')).toBe(true);
    expect(touches(tree, 'bedroom_1', 'left')).toBe(false);
  });

  it('mặt vào được chỉ có nghĩa ở tầng trệt', () => {
    // Tầng hai không có mặt nào ô tô vào được, nên quy tắc không được đẩy phòng nào ra đó.
    const tree = floors(faceOf).get(2)!;
    expect(leafPaths(tree).some(([leaf]) => leaf === 'garage_1')).toBe(false);
  });
});

describe('Nhóm mã phòng', () => {
  it('nhóm `habitable` khai thành viên tường minh, không phủ mọi loại phòng', () => {
    /*
     * Nhóm phủ hết thì quy tắc "tỉ lệ dài trên rộng không quá 2,5" đè lên cả hành lang — mà
     * hành lang dài và hẹp là đúng bản chất của nó. Cảnh báo sai loại đó làm kiến trúc sư
     * quen bỏ qua danh sách vi phạm.
     */
    const groups = roomGroups(parseVocabulary(testVocabularyYaml()));
    expect(groups.habitable).toContain('bedroom');
    expect(groups.habitable).not.toContain('circulation');
    expect(groups.habitable).not.toContain('wc');
    expect(groups.all).toBeUndefined();
  });
});
