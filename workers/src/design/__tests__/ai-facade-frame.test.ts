/**
 * Khung mặt đứng suy từ mặt bằng (T59) — phần dữ liệu KHOÁ mà mô hình không được sửa.
 *
 * Phép thử chạy trên hai mặt bằng viết tay của bộ vẽ, nên mọi con số dưới đây truy được bằng mắt
 * về `ai-plan-fixtures.ts`. Điều cần canh nhất: lỗ mở trên mặt đứng là ĐÚNG những lỗ mở nhìn
 * thấy từ đường — không sót cửa ra ban công, không lẫn cửa sổ giếng trời sau nhà.
 */

import { describe, expect, it } from 'vitest';
import { parseConstructionNorms } from '../kb/construction';
import { parseFacadeVocabulary } from '../kb/facade-vocabulary';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { emptyFacadeBrief } from '../ai/facade/brief';
import { facadeFrame, FacadeFrameError, mainDoorOf } from '../ai/facade/frame';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';
import { read } from './ai-real-context';

const norms = parseConstructionNorms(read('kb/construction_norms.yaml'));
const outdoor = new Set(roomGroups(parseVocabulary(read('kb/room_vocabulary.yaml'))).outdoor ?? []);

describe('Khung mặt đứng — nhà phố 4 × 15 m, 3 tầng', () => {
  const frame = facadeFrame(TOWNHOUSE_PLAN, norms, outdoor);

  it('mặt tiền tầng 1 chỉ có cửa cuốn thì KHÔNG có cửa chính — cửa ra ban công là cửa phụ', () => {
    // Lấy «cửa đi thấp nhất» làm cửa chính thì chiều cao, vật liệu và kiểu chia cánh của cửa chính
    // trong phiếu rơi lên cửa ban công tầng 2.
    expect(mainDoorOf(frame.openings)).toBeNull();
  });

  it('chiều cao cửa của phiếu bị kẹp vào chiều cao tầng, không xuyên sàn tầng trên', () => {
    const tall = facadeFrame(TOWNHOUSE_PLAN, norms, outdoor, {
      ...emptyFacadeBrief(),
      side_door: { material: null, colour: null, type: null, h_cm: 600 },
    });
    const doors = tall.openings.filter((o) => o.kind === 'door');
    expect(doors.length).toBeGreaterThan(0);
    for (const door of doors) {
      const level = tall.levels.find((l) => l.level === door.level)!;
      expect(door.sill + door.h).toBeLessThanOrEqual(level.h);
    }
  });

  it('cao độ từng tầng cộng dồn từ chiều cao tầng của mặt bằng, ±0.000 là sàn tầng 1', () => {
    expect(frame.levels.map(({ level, z, h }) => [level, z, h])).toEqual([
      [1, 0, 360],
      [2, 360, 360],
      [3, 720, 390],
    ]);
    expect(frame.roofZ).toBe(1110);
    // Cốt vỉa hè và tường chắn mái lấy từ kb, không phải từ mã nguồn.
    expect(frame.groundZ).toBe(-Math.round(norms.facade!.ground_floor_raise_m * 100));
    expect(frame.parapetDefault).toBe(Math.round(norms.facade!.parapet_height_m * 100));
    expect([frame.x0, frame.x1, frame.width]).toEqual([0, 400, 400]);
  });

  it('lấy đúng lỗ mở nhìn thấy từ đường — gồm cửa sau ban công, bỏ giếng trời sau nhà', () => {
    expect(frame.openings.map(({ level, kind, x, w, sill }) => [level, kind, x, w, sill])).toEqual([
      // Tầng 1: cửa để xe trên tường mặt tiền. Cửa và cửa sổ trên tường giếng trời `wy` KHÔNG vào.
      [1, 'garage', 50, 300, 0],
      // Tầng 2, 3: tường lùi sau ban công — cửa sổ và cửa trượt ra ban công.
      [2, 'window', 40, 80, 90],
      [2, 'door', 150, 180, 0],
      [3, 'window', 40, 80, 90],
      [3, 'door', 150, 180, 0],
    ]);
  });

  it('chiều cao cửa lấy theo quy cách của loại cửa (T40)', () => {
    const entrance = Math.round(norms.openings.entrance!.height_m! * 100);
    expect(frame.openings.filter((o) => o.kind !== 'window').map((o) => o.h)).toEqual([
      entrance,
      entrance,
      entrance,
    ]);
  });

  it('ban công lấy từ lan can mặt trước; lan can sau của sân thượng không vào', () => {
    expect(frame.balconies).toEqual([
      { level: 2, x0: 0, x1: 400, depth: 0, railing: null },
      { level: 3, x0: 0, x1: 400, depth: 0, railing: null },
    ]);
  });

  it('nhà sát ranh mặt tiền thì không có sân trước — không vẽ cổng và rào', () => {
    expect(frame.frontYard).toBe(false);
  });
});

describe('Khung mặt đứng — biệt thự 10 × 14 m', () => {
  const frame = facadeFrame(VILLA_PLAN, norms, outdoor);

  it('tầng 1 có cửa chính, cửa để xe và cửa sổ mặt tiền; tường hông không vào', () => {
    expect(
      frame.openings.filter((o) => o.level === 1).map(({ kind, x, w }) => [kind, x, w]),
    ).toEqual([
      ['window', 100, 150],
      ['door', 512, 165],
      ['garage', 750, 200],
    ]);
  });

  it('tầng 2: cửa ra ban công lùi sau lan can, cửa sổ phòng ngủ trên tường mặt tiền', () => {
    expect(
      frame.openings.filter((o) => o.level === 2).map(({ kind, x, w }) => [kind, x, w]),
    ).toEqual([
      ['door', 150, 180],
      ['window', 718, 150],
    ]);
    expect(frame.balconies).toEqual([{ level: 2, x0: 0, x1: 489, depth: 0, railing: null }]);
  });

  it('khối lùi khỏi ranh mặt tiền thì có sân trước', () => {
    const setback = {
      ...VILLA_PLAN,
      levels: VILLA_PLAN.levels.map((level) => ({
        ...level,
        outline: level.outline.map(([x, y]) => [x, (y ?? 0) + 300]),
        walls: level.walls.map((w) => ({
          ...w,
          a: [w.a[0], (w.a[1] ?? 0) + 300],
          b: [w.b[0], (w.b[1] ?? 0) + 300],
        })),
        rooms: level.rooms.map((r) => ({
          ...r,
          rect: [r.rect[0], (r.rect[1] ?? 0) + 300, r.rect[2], (r.rect[3] ?? 0) + 300],
        })),
      })),
    } as typeof VILLA_PLAN;
    const moved = facadeFrame(setback, norms, outdoor);
    expect(moved.frontYard).toBe(true);
    // Dời cả nhà vào sâu không đổi gì trên mặt đứng.
    expect(moved.openings).toEqual(frame.openings);
  });
});

describe('Thiếu dữ liệu', () => {
  it('kb thiếu mục facade thì báo rõ, không tự đặt số', () => {
    const { facade: _omit, ...rest } = norms;
    expect(() => facadeFrame(TOWNHOUSE_PLAN, rest, outdoor)).toThrow(FacadeFrameError);
  });
});

describe('Danh mục mặt đứng (kb/facade_vocabulary.yaml)', () => {
  const vocab = parseFacadeVocabulary(read('kb/facade_vocabulary.yaml'));

  it('mọi màu có mã hex, mọi mã có nhãn tiếng Việt và cụm tiếng Anh', () => {
    expect(Object.keys(vocab.colours).length).toBeGreaterThan(5);
    for (const group of [vocab.roofMaterials, vocab.materials, vocab.colours, vocab.railings]) {
      for (const entry of Object.values(group)) {
        expect(entry.label_vi).toMatch(/\S/);
        expect(entry.prompt_en).toMatch(/^[\x20-\x7E]+$/);
      }
    }
  });

  it('nhãn có đủ cho mọi mã mà hợp đồng khai sẵn — đọc thẳng từ hợp đồng, không chép danh sách', () => {
    const concept = JSON.parse(read('contracts/ai-facade-concept.schema.json'));
    const props = concept.properties;
    const enumOf = (node: { enum?: string[] }) => [...(node.enum ?? [])].sort();
    expect(Object.keys(vocab.roofTypes).sort()).toEqual(enumOf(props.roof.properties.type));
    expect(Object.keys(vocab.zones).sort()).toEqual(enumOf(props.materials.items.properties.where));
    expect(Object.keys(vocab.elements).sort()).toEqual(
      enumOf(props.elevation.properties.elements.items.properties.kind),
    );
    expect(Object.keys(vocab.gateTypes).sort()).toEqual(
      enumOf(props.gate.properties.type).filter((code: string) => code !== 'none'),
    );
  });
});
