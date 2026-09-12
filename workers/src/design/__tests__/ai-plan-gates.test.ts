/**
 * Năm cổng dữ liệu G1–G5 và hai trường mới của Đợt C — mỗi phép thử dựng đúng MỘT chỗ hỏng.
 *
 * Vì sao tách khỏi `ai-plan-check.test.ts`: tệp kia chứng minh 21 phép kiểm cũ, và nó đã chứng
 * minh điều quan trọng nhất về năm cổng này — **hai fixture viết tay đi qua sạch**, tức năm cổng
 * không bắt oan một mặt bằng đúng nào. Tệp này chứng minh chiều còn lại: mỗi cổng thật sự bắt
 * được thứ nó được dựng ra để bắt. Cả bốn chỗ hỏng dưới đây TRƯỚC 12/09/2026 đều ĐẠT.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFloorPlan, AiFloorPlanLevel, AiSpaceProgram } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { checkPlan, type PlanCheckInput } from '../ai/plan-check';
import { outlineFaces, faceAtPoint } from '../ai/outline-faces';
import { levelFromRooms } from '../ai/plan-geometry';
import { prepareWalls } from '../ai/draw/walls';
import { toRect, type Pt } from '../ai/draw/geometry';
import { parseConstructionNorms } from '../kb/construction';
import { parseRuleMessages } from '../ai/plan-messages';
import { reviewPlanRooms } from '../ai/rule-warnings';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { parseSiteContext, siteFaces } from '../kb/site-context';
import { roomsProposalOf, TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const vocabulary = parseVocabulary(read('../../../../kb/room_vocabulary.yaml'));
const groups = roomGroups(vocabulary);
const labels = Object.fromEntries(vocabulary.types.map((type) => [type.code, type.vi]));
const doorExemptTypes = new Set(groups.no_door_required ?? []);
const verticalTypes = new Set(groups.circulation ?? []);
const messages = parseRuleMessages(read('../../../../rules/messages.vi.yaml'));

function programOf(plan: AiFloorPlan, extra: AiSpaceProgram['spaces'] = []): AiSpaceProgram {
  return {
    schema_version: '1.0.0',
    brief_ref: `sha256:${'4'.repeat(64)}`,
    spaces: [
      ...plan.levels.flatMap((level) =>
        level.rooms.map((room) => ({
          id: room.id,
          type: room.type,
          level: level.level,
          target_area_m2: room.area_m2,
          ensuite_of: null,
          why: null,
        })),
      ),
      ...extra,
    ],
    rationale: 'Chương trình dựng từ chính mặt bằng fixture.',
    assumptions: [],
    generator: {
      kind: 'ai',
      provider: 'fixture',
      model: 'viet-tay',
      route: 'fixture',
      prompt_version: '0.0.0',
    },
  } as AiSpaceProgram;
}

const check = (plan: AiFloorPlan, overrides: Partial<PlanCheckInput> = {}) =>
  checkPlan({ plan, program: programOf(plan), doorExemptTypes, verticalTypes, ...overrides });

const codesOf = (plan: AiFloorPlan, overrides: Partial<PlanCheckInput> = {}) =>
  check(plan, overrides).blocking.map((issue) => issue.code);

/** Đổi tầng 1, giữ nguyên phần còn lại. */
function withLevel1(plan: AiFloorPlan, change: (level: AiFloorPlanLevel) => AiFloorPlanLevel) {
  const [first, ...rest] = plan.levels;
  return { ...plan, levels: [change(first!), ...rest] };
}

describe('G1 — mặt sàn phải lấp kín', () => {
  it('lỗ 30 m² giữa nhà bị bắt, và câu báo nói đúng chỗ', () => {
    // Bỏ phòng khách (3,56 × 4,00 m ≈ 14 m²) và bếp (3,56 × 3,50 ≈ 12 m²) khỏi CẢ mặt bằng lẫn
    // chương trình: không còn `room_missing` để dựa vào, nên nếu G1 không bắt thì 26 m² giữa nhà
    // biến mất không dấu vết. Đây đúng là ca mà trước 12/09/2026 đi qua sạch.
    const holed = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      rooms: level.rooms.filter((room) => room.id !== 'living_1' && room.id !== 'kitchen_1'),
      doors: (level.doors ?? []).filter((door) => door.id !== 'd1' && door.id !== 'd2'),
    }));
    const program = programOf(holed);
    const issue = checkPlan({
      plan: holed,
      program,
      doorExemptTypes,
      verticalTypes,
    }).blocking.find((i) => i.code === 'floor_not_covered');

    expect(issue).toBeDefined();
    // Con số phải ĐỌC ĐƯỢC: tổng lỗ, diện tích hình bao, và toạ độ khoảng lớn nhất — thiếu chúng
    // thì lượt sửa không biết vá chỗ nào.
    // 27,0 m² chưa xếp phòng trong hình bao 60,0 m², khoảng lớn nhất 19,6 m² — con số phải ĐỌC
    // ĐƯỢC và phải chỉ ra TOẠ ĐỘ, vì đây là câu đi vào lời dẫn của lượt sửa. «Còn trống nhiều»
    // thì mô hình không biết vá chỗ nào.
    expect(issue?.message).toContain('27.0 m²');
    expect(issue?.message).toContain('hình bao 60.0 m²');
    expect(issue?.message).toContain('19.6 m² tại x 22–272, y 382–1165 cm');
  });

  it('khe tường KHÔNG bị coi là lỗ', () => {
    // Phần chưa phủ của fixture nhà phố là 10,4 trong 60 m², toàn bộ là bề dày tường: `rect` của
    // phòng là kích thước lọt lòng. Một phép so hai con số tổng sẽ bắt oan mọi mặt bằng đúng.
    expect(codesOf(TOWNHOUSE_PLAN)).not.toContain('floor_not_covered');
    expect(codesOf(VILLA_PLAN)).not.toContain('floor_not_covered');
  });
});

describe('G2 — không phần tử nào chồng lên nhau', () => {
  it('ô thang đặt trùng lên phòng ngủ bị bắt', () => {
    const onBedroom: AiFloorPlan = {
      ...TOWNHOUSE_PLAN,
      levels: TOWNHOUSE_PLAN.levels.map((level) =>
        level.level === 2
          ? { ...level, stairs: [{ ...level.stairs![0]!, rect: [22, 563, 272, 763] }] }
          : level,
      ),
    };
    expect(codesOf(onBedroom)).toContain('stair_overlaps_room');
  });

  it('ô thang trùng khít phòng thang thì KHÔNG phải lỗi', () => {
    // Hợp đồng diễn đạt «đây là chỗ đặt thang» bằng đúng cách ấy: một phòng loại `stair` trong
    // `rooms[]` và một ô trong `stairs[]` cùng chữ nhật. Thiếu ngoại lệ này thì G2 bắt oan mọi
    // mặt bằng có thang — tức mọi mặt bằng.
    expect(codesOf(TOWNHOUSE_PLAN)).not.toContain('stair_overlaps_room');
    expect(codesOf(VILLA_PLAN)).not.toContain('stair_overlaps_room');
  });

  it('ô trống đặt trùng lên phòng trong nhà bị bắt, trùng lên thang thì không', () => {
    const onWc = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      voids: [{ id: 'v_bad', kind: 'void' as const, rect: [283, 1165, 378, 1365] }],
    }));
    expect(codesOf(onWc)).toContain('void_overlaps_room');

    const onStair = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      voids: [{ id: 'v_ok', kind: 'void' as const, rect: [22, 1165, 272, 1365] }],
    }));
    expect(codesOf(onStair)).not.toContain('void_overlaps_room');
  });
});

describe('G3 — mọi phòng phải đi tới được từ cửa ngoài nhà', () => {
  it('cụm phòng nối nhau nhưng không nối ra ngoài bị bắt', () => {
    // Đây là chỗ hở mà phép kiểm cũ không thấy: bỏ cửa `d1` thì phòng khách vẫn CÓ cửa (sang
    // bếp), bếp vẫn có cửa, thang vẫn có cửa — cả cụm hợp lệ theo từng phòng một, mà không có
    // đường nào từ ngoài vào.
    const cut = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).filter((door) => door.id !== 'd1'),
    }));
    const result = check(cut);
    expect(result.blocking.map((i) => i.code)).not.toContain('room_without_door');
    const unreachable = result.blocking
      .filter((i) => i.code === 'room_unreachable')
      .map((i) => i.ref);
    expect(unreachable).toContain('living_1');
    expect(unreachable).toContain('kitchen_1');
    // Hệ quả lan LÊN qua ô thang: cả ba tầng trên cũng đứt.
    expect(unreachable).toContain('master_2');
    expect(unreachable).toContain('altar_3');
    // Chỗ để xe vẫn tới được — nó là phòng có cửa ra đường.
    expect(unreachable).not.toContain('garage_1');
  });

  it('mặt bằng không có cửa nào ra ngoài thì báo THIẾU LỐI VÀO, không báo từng phòng', () => {
    const sealed = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).filter((door) => door.id !== 'd_gate'),
    }));
    const codes = check(sealed).blocking.map((i) => i.code);
    expect(codes).toContain('no_entrance');
    // Một câu nói đúng nguyên nhân, không phải hai mươi câu nói hậu quả.
    expect(codes).not.toContain('room_unreachable');
  });

  it('đi xuyên phòng KHÔNG phải lỗi của cổng này', () => {
    // WC khép kín trong phòng ngủ chỉ vào được qua phòng ngủ, và đó là thiết kế bình thường —
    // `ensuite_of` của chương trình không gian nói rõ như vậy. Chất lượng đường đi là tiêu chí
    // C1/C3 của bộ chấm, không phải cổng dữ liệu.
    expect(codesOf(VILLA_PLAN)).not.toContain('room_unreachable');
  });
});

describe('G4 — ô thang và ô trống phải có hình học dùng được', () => {
  it('ô thang rỗng hoặc lấn ra ngoài hình bao bị bắt, không hỏng im lặng', () => {
    const empty = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      stairs: [{ ...level.stairs![0]!, rect: [22, 1165, 22, 1365] }],
    }));
    expect(codesOf(empty)).toContain('stair_rect_empty');

    const outside = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      stairs: [{ ...level.stairs![0]!, rect: [22, 1165, 272, 1560] }],
    }));
    expect(codesOf(outside)).toContain('stair_outside_outline');
  });

  it('ô trống rỗng bị bắt', () => {
    const empty = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      voids: [{ id: 'v0', kind: 'light_well' as const, rect: [100, 1400, 100, 1450] }],
    }));
    expect(codesOf(empty)).toContain('void_rect_empty');
  });
});

describe('G5 — hai phòng trên một tầng không được cùng tên', () => {
  it('trùng nhãn tường minh bị bắt', () => {
    // Đúng ca của hồ sơ P1: hai phòng cùng tên «P NGỦ 3» trên một tầng, và đúng cặp ấy mang hai
    // nhãn diện tích sai 30%.
    const twins: AiFloorPlan = {
      ...TOWNHOUSE_PLAN,
      levels: TOWNHOUSE_PLAN.levels.map((level) =>
        level.level === 2
          ? {
              ...level,
              rooms: level.rooms.map((room) =>
                room.id === 'master_2' || room.id === 'bedroom_2'
                  ? { ...room, label: 'P NGỦ 3' }
                  : room,
              ),
            }
          : level,
      ),
    };
    const issue = check(twins).blocking.find((i) => i.code === 'room_name_duplicate');
    expect(issue?.message).toContain('P NGỦ 3');
  });

  it('nhãn RỖNG không tính là trùng — đánh số là việc của bộ vẽ', () => {
    // Biệt thự tầng 2 có bốn phòng ngủ, cả bốn `label: null`. Coi chúng là trùng tên thì cổng này
    // chặn mọi mặt bằng có hai phòng cùng loại, tức gần như mọi mặt bằng.
    expect(codesOf(VILLA_PLAN)).not.toContain('room_name_duplicate');
  });
});

describe('phòng ghép — `also`', () => {
  const merged = (also: string[]): AiFloorPlan =>
    withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      rooms: level.rooms.map((room) => (room.id === 'kitchen_1' ? { ...room, also } : room)),
    }));

  /** Chương trình có thêm phòng ăn mà mặt bằng KHÔNG xếp riêng — nó ghép vào bếp. */
  const withDining = (plan: AiFloorPlan) =>
    programOf(plan, [
      { id: 'dining_1', type: 'dining', level: 1, target_area_m2: 12, ensuite_of: null, why: null },
    ]);

  it('mã ghép tính là ĐÃ XẾP, nên không còn `room_missing`', () => {
    const plan = merged(['dining_1']);
    const result = checkPlan({
      plan,
      program: withDining(plan),
      doorExemptTypes,
      verticalTypes,
    });
    expect(result.blocking).toEqual([]);
  });

  it('không khai `also` thì phòng ăn vẫn bị báo thiếu — cổng không tự nới', () => {
    const plan = TOWNHOUSE_PLAN;
    const codes = checkPlan({
      plan,
      program: withDining(plan),
      doorExemptTypes,
      verticalTypes,
    }).blocking.map((i) => i.code);
    expect(codes).toContain('room_missing');
  });

  it('mã ghép không có trong chương trình, hoặc trùng một phòng khác, đều bị bắt', () => {
    const unknown = merged(['khong_co_ma_nay']);
    expect(
      checkPlan({
        plan: unknown,
        program: programOf(unknown),
        doorExemptTypes,
        verticalTypes,
      }).blocking.map((i) => i.code),
    ).toContain('room_unknown');

    const clash = merged(['living_1']);
    expect(codesOf(clash)).toContain('room_duplicate');

    const self = merged(['kitchen_1']);
    expect(codesOf(self)).toContain('room_merge_self');
  });
});

describe('chiều mở cánh cửa — đo TUYỆT ĐỐI, không đo theo vòng', () => {
  const norms = parseConstructionNorms(read('../../../../kb/construction_norms.yaml'));
  const outdoorTypes = new Set(groups.outdoor ?? []);

  /**
   * Phía tường mà cánh cửa nằm về, tính đúng cách `draw/openings.ts` tính: `side: 'l'` là phía
   * pháp tuyến TRÁI của tường (`n = [−uy, ux]`), `'r'` là phía kia.
   *
   * Trả về một điểm THĂM DÒ ngay sau mặt tường ấy, không phải mũi cánh. Mũi cánh dài bằng bề rộng
   * lỗ cửa nên nó xuyên qua cả phòng khi phòng nông hơn cửa rộng — ban công sâu 159 cm với cửa
   * trượt 180 cm là ca thật trong fixture — và `sliding` thì `draw/openings.ts` còn không vẽ cánh
   * quay nào. Điều cần đo là CHIỀU, và điểm thăm dò đo đúng chiều cho mọi loại cửa.
   */
  const swingProbe = (level: ReturnType<typeof levelFromRooms>['level'], id: string): Pt | null => {
    const door = (level.doors ?? []).find((entry) => entry.id === id);
    if (!door?.side) return null;
    const wall = prepareWalls(level.walls).find((entry) => entry.id === door.wall);
    if (!wall) return null;
    const middle = door.at + door.w / 2;
    const sign = door.side === 'l' ? 1 : -1;
    const reach = wall.t / 2 + 1;
    return [
      wall.a[0] + wall.u[0] * middle + wall.n[0] * sign * reach,
      wall.a[1] + wall.u[1] * middle + wall.n[1] * sign * reach,
    ];
  };

  it('`swing: in` đặt cánh về phía TRONG phòng đã khai, `out` về phía ngoài', () => {
    // Phép thử VÒNG (artifact → đề xuất → artifact) KHÔNG thay được phép thử này, và đó là bài học
    // ngày 12/09/2026: phép suy chiều từng được chép hai bản, cả hai sai cùng kiểu (đảo cực). Hai
    // bản sai giống nhau triệt tiêu nhau trong vòng, nên vòng xanh, ảnh chụp vàng không đổi, mà
    // đường chạy thật thì mọi cánh cửa được vẽ sang mặt tường bên kia — `swing` đến từ mô hình nên
    // không có gì triệt tiêu. Chỉ một phép đo TUYỆT ĐỐI mới thấy.
    let checked = 0;
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const source of roomsProposalOf(plan).levels) {
        const { level } = levelFromRooms(source, norms, outdoorTypes);
        for (const door of source.doors ?? []) {
          if (!door.swing) continue;
          const probe = swingProbe(level, door.id);
          if (!probe) continue;
          const rect = toRect(level.rooms.find((room) => room.id === door.room)!.rect);
          const inside =
            probe[0] > rect.x0 && probe[0] < rect.x1 && probe[1] > rect.y0 && probe[1] < rect.y1;
          expect(
            inside,
            `${door.id} khai swing=${door.swing} trên cạnh ${door.edge} của "${door.room}", điểm thăm dò ${probe.join(',')}`,
          ).toBe(door.swing === 'in');
          checked += 1;
        }
      }
    }
    // Không có cửa nào thì phép thử trên xanh một cách vô nghĩa.
    expect(checked).toBeGreaterThan(10);
  });
});

describe('hai phòng phải chừa chỗ cho bức vách giữa chúng', () => {
  const norms = parseConstructionNorms(read('../../../../kb/construction_norms.yaml'));
  const outdoorTypes = new Set(groups.outdoor ?? []);

  it('hai chữ nhật CHẠM nhau bị bắt — trước đó nó hỏng im lặng', () => {
    // Kích thước phòng là LỌT LÒNG, nên hai phòng chạm nhau làm bộ suy tường dựng một bức tim nằm
    // đúng trên đường chạm: thân tường ăn 5,5 cm vào mỗi phòng. Không cổng nào thấy —
    // `room_overlap` đòi chồng hơn 100 cm², `floor_not_covered` không thấy lỗ nào — nên phòng VẼ RA
    // nhỏ hơn chính `area_m2` nó khai.
    const source = structuredClone(roomsProposalOf(TOWNHOUSE_PLAN).levels[0]!);
    const living = source.rooms.find((room) => room.id === 'living_1')!;
    living.rect = [living.rect[0]!, 382, living.rect[2]!, living.rect[3]!];

    const codes = levelFromRooms(source, norms, outdoorTypes).issues.map((issue) => issue.code);
    expect(codes).toContain('rooms_touch_no_wall');
  });

  it('khe đúng bề dày vách thì KHÔNG bị bắt — cả hai fixture đi qua sạch', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const source of roomsProposalOf(plan).levels) {
        expect(levelFromRooms(source, norms, outdoorTypes).issues).toEqual([]);
      }
    }
  });
});

describe('hai lỗ mở chồng nhau trên cùng một bức vách', () => {
  const norms = parseConstructionNorms(read('../../../../kb/construction_norms.yaml'));
  const outdoorTypes = new Set(groups.outdoor ?? []);

  it('khai từ HAI PHÍA của cùng một vách vẫn bị bắt', () => {
    // Một bức vách chung có HAI cạnh phòng nằm trên nó, nên hai lỗ khai từ hai phía có hai khoá
    // `room:edge` khác nhau. Phép bắt chồng theo cạnh phòng không bao giờ so chúng với nhau; phép
    // bắt theo ĐOẠN TƯỜNG thì thấy.
    const source = structuredClone(roomsProposalOf(TOWNHOUSE_PLAN).levels[0]!);
    source.doors = [
      ...(source.doors ?? []).filter((door) => door.id !== 'd1'),
      {
        id: 'dx',
        room: 'garage_1',
        edge: 'back',
        at: 100,
        w: 100,
        kind: 'single',
        hinge: 'near',
        swing: 'in',
      },
      {
        id: 'dy',
        room: 'living_1',
        edge: 'front',
        at: 100,
        w: 100,
        kind: 'single',
        hinge: 'near',
        swing: 'in',
      },
    ];

    const result = levelFromRooms(source, norms, outdoorTypes);
    expect(result.issues.map((issue) => issue.code)).toContain('opening_overlap');
    // Và chỉ MỘT lỗ được đặt: vẽ hai bộ má cửa đè lên nhau là tờ vẽ nói có hai cửa ở một chỗ.
    expect((result.level.doors ?? []).filter((door) => door.wall).length).toBe(
      (source.doors ?? []).length - 1,
    );
  });

  it('cửa và CỬA SỔ chồng nhau trên một tường cũng bị bắt', () => {
    const source = structuredClone(roomsProposalOf(TOWNHOUSE_PLAN).levels[0]!);
    const door = (source.doors ?? []).find((entry) => entry.id === 'd5')!;
    source.windows = [
      { id: 'sz', room: door.room, edge: door.edge, at: door.at + 10, w: 60, sill: 90, h: 160 },
    ];
    expect(levelFromRooms(source, norms, outdoorTypes).issues.map((i) => i.code)).toContain(
      'opening_overlap',
    );
  });
});

describe('thuộc tính mặt của cạnh hình bao', () => {
  const siteContext = parseSiteContext(read('../../../../kb/site_context.yaml'));

  it('bốn cạnh của một hình bao chữ nhật được xếp đúng về bốn mặt thửa', () => {
    // Nhà phố kẹp giữa hai nhà: hai bên là ranh, mặt tiền thoáng. `always_open: [front]` của
    // `kb/site_context.yaml` lo mặt tiền, `nha_hang_xom` lo hai bên.
    const faces = outlineFaces(
      [
        [0, 0],
        [400, 0],
        [400, 1500],
        [0, 1500],
      ],
      siteFaces(
        { adjacent: { left: 'nha_hang_xom', right: 'nha_hang_xom', back: 'nha_hang_xom' } },
        siteContext,
      ).open,
    );
    expect(faces).toEqual(['open', 'boundary', 'boundary', 'boundary']);
  });

  it('chiều quay ngược lại cho CÙNG kết quả — pháp tuyến ngoài không phụ thuộc thứ tự đỉnh', () => {
    const open = siteFaces(
      { adjacent: { left: 'nha_hang_xom', right: 'dat_trong', back: 'dat_trong' } },
      siteContext,
    ).open;
    const clockwise = outlineFaces(
      [
        [0, 0],
        [0, 1500],
        [400, 1500],
        [400, 0],
      ],
      open,
    );
    // Cùng bốn cạnh, kể từ cạnh trái: trái · sau · phải · trước. Khai cả ba mặt thay vì để trống:
    // `default_open: false` của `kb/site_context.yaml` coi mặt CHƯA KHAI là bị che, nên một phép
    // thử để trống sẽ đo lẫn hai điều và không nói được điều nào.
    expect(clockwise).toEqual(['boundary', 'open', 'open', 'open']);
  });

  it('cạnh vát trả `unknown`, không xếp bừa về một mặt', () => {
    const faces = outlineFaces(
      [
        [0, 0],
        [400, 0],
        [300, 1500],
        [0, 1500],
      ],
      ['front'],
    );
    expect(faces[1]).toBe('unknown');
  });

  it('tường quanh giếng trời giữa nhà KHÔNG bị gán mặt nào', () => {
    // Nếu `faceAtPoint` trả về «cạnh gần nhất» thay vì `null`, một cửa sổ giếng trời hợp lệ sẽ bị
    // đọc thành cửa sổ trên tường ranh, và cảnh báo thiếu sáng nổ ra oan.
    const outline = TOWNHOUSE_PLAN.levels[0]!.outline.map(([x, y]) => [x, y] as [number, number]);
    const faces = TOWNHOUSE_PLAN.levels[0]!.outline_faces!;
    expect(faceAtPoint([200, 1376], outline, faces, 13)).toBeNull();
    // Còn tim tường ranh bên trái (x = 11) thì nằm trên cạnh ấy.
    expect(faceAtPoint([11, 700], outline, faces, 13)).toBe('boundary');
  });
});

describe('cửa sổ trên tường ranh không còn được tính là mặt thoáng', () => {
  const daylightPack = new RulePack(
    parseRuleFile(
      [
        '- id: bedroom_requires_daylight',
        '  applies_to: [nha_pho]',
        '  scope: floor',
        '  predicate: requires_daylight',
        '  target: bedroom',
        '  severity: warning',
        "  source: 'thói quen thiết kế NVG'",
      ].join('\n'),
      'phep-thu',
    ),
    false,
  );

  const review = (plan: AiFloorPlan) =>
    reviewPlanRooms({
      levels: plan.levels,
      buildingType: 'nha_pho',
      rules: daylightPack,
      labels,
      groups,
      messages,
    });

  /** Thêm một cửa sổ lên tường ranh bên trái của phòng ngủ tầng 2. */
  const windowOnBoundary = (faces: AiFloorPlanLevel['outline_faces']): AiFloorPlan => ({
    ...TOWNHOUSE_PLAN,
    levels: TOWNHOUSE_PLAN.levels.map((level) =>
      level.level === 2
        ? {
            ...level,
            outline_faces: faces,
            windows: [{ id: 'sx', wall: 'wl', at: 450, w: 120, sill: 90, h: 160 }],
          }
        : level,
    ),
  });

  it('cửa sổ trên cạnh `boundary` KHÔNG cứu được phòng ngủ khỏi cảnh báo thiếu sáng', () => {
    const warnings = review(windowOnBoundary(['open', 'boundary', 'boundary', 'boundary']));
    const ids = warnings.warnings.map((w) => `${w.ruleId}:${w.spaceId}`);
    expect(ids).toContain('bedroom_requires_daylight:bedroom_2');
  });

  it('cùng một cửa sổ, cạnh đó là `open` thì phòng ngủ có sáng', () => {
    const warnings = review(windowOnBoundary(['open', 'open', 'open', 'open']));
    const ids = warnings.warnings.map((w) => `${w.ruleId}:${w.spaceId}`);
    expect(ids).not.toContain('bedroom_requires_daylight:bedroom_2');
  });
});
