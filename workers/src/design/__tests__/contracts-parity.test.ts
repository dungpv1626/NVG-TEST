/**
 * Hai hợp đồng của nhánh AI phải KHỚP NHAU ở phần trùng.
 *
 * `ai-plan-rooms` là thứ mô hình khai; `ai-floor-plan` là artifact. Chúng tồn tại riêng vì lỗ mở
 * neo khác nhau — cạnh phòng so với đoạn tường — nhưng phần còn lại (phòng, ô thang, ô trống, hình
 * bao, mã phòng, mã phần tử) nói về CÙNG một thứ. Hai bản của cùng một thứ là hai bản sẽ lệch, và
 * lệch ở đây có một hậu quả cụ thể và đắt: mô hình khai đúng theo hợp đồng của nó, rồi `repo.write`
 * từ chối artifact — tức hỏng ở bước CUỐI, sau khi đã trả tiền cho một hoặc hai lượt gọi.
 *
 * Đã xảy ra đúng kiểu này một lần với một tệp dữ liệu khác: ngày 11/09/2026, hợp đồng khai
 * `strategy` tối đa 200 ký tự trong khi ba ý đồ bố cục thật dài 241–301, nên MỌI lượt ghi đều hỏng.
 * Phép thử này là hàng rào cho cùng lớp lỗi, ở chỗ nó có thể lặp lại.
 *
 * Phép thử so CẤU TRÚC, không so `description`: chữ dặn mô hình thì khác nhau là đúng (hợp đồng
 * của mô hình nói về cạnh phòng, hợp đồng artifact nói về tim tường), còn kiểu dữ liệu, enum và
 * giới hạn thì phải giống.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (p: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8'));

const rooms = read('contracts/ai-plan-rooms.schema.json') as Schema;
const artifact = read('contracts/ai-floor-plan.schema.json') as Schema;
const tree = read('contracts/ai-plan-tree.schema.json') as Schema;

interface Schema {
  $defs: Record<string, Record<string, unknown>>;
  properties: Record<string, Record<string, unknown>>;
  required: string[];
}

/** Bỏ mọi khoá chỉ dành cho người đọc — thứ còn lại là ràng buộc thật sự cưỡng chế. */
const PROSE = new Set(['description', '$comment', 'title', 'examples', 'default']);

function structure(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(structure);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (PROSE.has(key)) continue;
    out[key] = structure(value);
  }
  return out;
}

describe('`ai-plan-rooms` và `ai-floor-plan` khớp nhau ở phần trùng', () => {
  it('`space_id`, `elem_id`, `point`, `rect` giống nhau đến từng ràng buộc', () => {
    for (const name of ['space_id', 'elem_id', 'point', 'rect']) {
      expect(structure(rooms.$defs[name]), name).toEqual(structure(artifact.$defs[name]));
    }
  });

  it('`cm` giống nhau từ T37 — cả hai hợp đồng nay do CHƯƠNG TRÌNH điền', () => {
    // Trước 13/09/2026 hợp đồng phòng buộc số NGUYÊN vì mô hình khai nó. Nay chương trình điền nó
    // từ cây chia, và mặt trong phòng cách tim vách 11 cm đúng 5,5 cm — nên hai bên cùng lưới nửa
    // centimet. Còn số nguyên thì chuyển sang hợp đồng mô hình thật sự nhận (`ai-plan-tree`).
    expect(structure(rooms.$defs.cm)).toEqual(structure(artifact.$defs.cm));
    expect(tree.$defs.cm!.type).toBe('integer');
  });

  it('ô thang và ô trống giống nhau đến từng ràng buộc', () => {
    const level = artifact.$defs.level as { properties: Record<string, { items?: unknown }> };
    expect(structure(rooms.$defs.stair)).toEqual(structure(level.properties.stairs!.items));
    expect(structure(rooms.$defs.void_space)).toEqual(structure(level.properties.voids!.items));
  });

  it('phòng giống nhau ở mọi trường CHUNG, kể cả `also`', () => {
    const level = artifact.$defs.level as {
      properties: { rooms: { items: { properties: Record<string, unknown>; required: string[] } } };
    };
    const theirs = level.properties.rooms.items;
    const ours = rooms.$defs.room as { properties: Record<string, unknown>; required: string[] };

    expect([...ours.required].sort()).toEqual([...theirs.required].sort());
    for (const field of ['id', 'type', 'rect', 'area_m2', 'also', 'label']) {
      expect(structure(ours.properties[field]), field).toEqual(structure(theirs.properties[field]));
    }
  });

  it('`variant_label` và `rationale` cùng trần độ dài', () => {
    for (const field of ['variant_label', 'rationale']) {
      expect(structure(rooms.properties[field]), field).toEqual(
        structure(artifact.properties[field]),
      );
    }
  });

  it('số tầng và số phòng mỗi tầng cùng giới hạn', () => {
    const level = artifact.$defs.level as {
      properties: { rooms: { minItems: number; maxItems: number } };
    };
    const ourLevel = rooms.$defs.level as {
      properties: { rooms: { minItems: number; maxItems: number } };
    };
    expect(ourLevel.properties.rooms.minItems).toBe(level.properties.rooms.minItems);
    expect(ourLevel.properties.rooms.maxItems).toBe(level.properties.rooms.maxItems);
    expect(rooms.properties.levels!.maxItems).toBe(artifact.properties.levels!.maxItems);
  });

  it('hợp đồng của mô hình KHÔNG có tường, hợp đồng artifact thì CÓ', () => {
    // Cùng một phép thử nói hai điều: T23 đã cắt đúng chỗ, và artifact vẫn tự mô tả đủ để vẽ và để
    // xuất DXF mà không phải dựng lại tường từ phòng ở mỗi lần đọc.
    const ourLevel = rooms.$defs.level as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const theirLevel = artifact.$defs.level as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(ourLevel.properties.walls).toBeUndefined();
    expect(ourLevel.required).not.toContain('walls');
    expect(theirLevel.properties.walls).toBeDefined();
    expect(theirLevel.required).toContain('walls');
  });
});

describe('`ai-plan-tree` và cây lưu trong artifact khớp nhau', () => {
  // Cây mô hình khai được lưu NGUYÊN VĂN trong `levels[].tree` của artifact (T37). Hai bản lệch
  // nhau thì artifact từ chối đúng cây vừa qua cổng — hỏng ở bước ghi, sau khi đã trả tiền mọi tầng.
  const stored = artifact.$defs.tree as unknown as Schema;

  /** Bỏ thêm `$ref` tới mã phần tử: hai tệp đặt tên `$defs` khác nhau cho cùng một kiểu chuỗi. */
  const shape = (node: unknown): unknown =>
    JSON.parse(
      JSON.stringify(structure(node)).replace(/"\$ref":"#\/\$defs\/(tree_id|id)"/g, '"$ref":"ID"'),
    );

  it('mã phần tử cùng ràng buộc', () => {
    expect(structure(tree.$defs.id)).toEqual(structure(artifact.$defs.tree_id));
  });

  it('mọi trường của tầng trừ `variant_label`, `rationale` có mặt ở cả hai, cùng bắt buộc', () => {
    const ours = Object.keys(tree.properties).filter(
      (k) => k !== 'variant_label' && k !== 'rationale',
    );
    expect(Object.keys(stored.properties).sort()).toEqual([...ours].sort());
    expect([...stored.required].sort()).toEqual(
      tree.required.filter((k) => ours.includes(k)).sort(),
    );
  });

  it('nút cắt, phòng ghép, cửa, thang, no_window giống nhau đến từng ràng buộc', () => {
    const inline = (name: string) => shape(tree.$defs[name]);
    const storedProps = stored.properties as Record<string, { items?: unknown }>;
    expect(shape(storedProps.nodes!.items)).toEqual(inline('node'));
    expect(shape(storedProps.also!.items)).toEqual(inline('merge'));
    expect(shape(storedProps.doors!.items)).toEqual(inline('door'));
    expect(shape(storedProps.stair)).toEqual(shape(tree.properties.stair));
    for (const field of ['nodes', 'also', 'doors', 'no_window']) {
      const a = structure(tree.properties[field]) as { minItems?: number; maxItems?: number };
      const b = structure(storedProps[field]) as { minItems?: number; maxItems?: number };
      expect([b.minItems, b.maxItems], field).toEqual([a.minItems, a.maxItems]);
    }
  });
});
