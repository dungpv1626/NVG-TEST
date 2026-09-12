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

  it('`cm` khác nhau CÓ CHỦ ĐÍCH, và khác đúng một chỗ', () => {
    // Hợp đồng của mô hình buộc số NGUYÊN; artifact cho lưới nửa centimet vì tim một bức vách dày
    // 11 cm giữa hai phòng có mặt trong ở toạ độ nguyên thì rơi vào x,5. Đây là chỗ DUY NHẤT hai
    // bên được phép khác, và phép thử ghim nó lại để nó không âm thầm thành ba chỗ.
    expect(rooms.$defs.cm!.type).toBe('integer');
    expect(artifact.$defs.cm!.type).toBe('number');
    expect(artifact.$defs.cm!.multipleOf).toBe(0.5);
    expect(rooms.$defs.cm!.multipleOf).toBeUndefined();
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
