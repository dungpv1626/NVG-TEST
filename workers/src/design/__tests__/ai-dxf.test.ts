/**
 * Bộ xuất DXF của nhánh AI (Q-45a, 15/09/2026) — tệp R12 ASCII dựng từ chính phần hình của tờ mặt bằng.
 *
 * KHÔNG chạm mạng. Tệp còn được đọc lại bằng ezdxf trong ảnh Docker của Container lúc phát triển —
 * phép thử ở đây canh hình dạng tệp và hình học, không thay được một phần mềm CAD thật.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderPlanSheet } from '../ai/draw/plan-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import { DXF_ROLES, LayerExportError, parseLayerExport } from '../ai/dxf/layers';
import { renderPlanDxf } from '../ai/dxf/plan-dxf';
import { DxfDocument, sanitiseText } from '../ai/dxf/writer';
import { parseVocabulary } from '../kb/vocabulary';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');

const style = parseSheetStyle(read('kb/sheet_style.yaml'));
const layers = parseLayerExport(read('kb/layer_mapping.yaml'));
const labels = Object.fromEntries(
  parseVocabulary(read('kb/room_vocabulary.yaml')).types.map((t) => [t.code, t.vi]),
);

interface Entity {
  type: string;
  codes: Map<number, string[]>;
}

/** Đọc lại phần ENTITIES thành danh sách thực thể, mỗi thực thể một bảng mã nhóm → giá trị. */
function entities(dxf: string): Entity[] {
  const lines = dxf.split('\r\n');
  const start = lines.findIndex((line, i) => line === 'ENTITIES' && lines[i - 1] === '2');
  const out: Entity[] = [];
  let current: Entity | null = null;
  for (let i = start + 1; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]);
    const value = lines[i + 1]!;
    if (code === 0) {
      if (value === 'ENDSEC') break;
      current = { type: value, codes: new Map() };
      out.push(current);
    } else if (current) {
      current.codes.set(code, [...(current.codes.get(code) ?? []), value]);
    }
  }
  return out;
}

const n = (e: Entity, code: number) => Number(e.codes.get(code)?.[0]);
const layerOf = (e: Entity) => e.codes.get(8)?.[0];

describe('bộ ghi DXF', () => {
  it('chữ ngoài ASCII ghi dạng \\U+XXXX; xuống dòng và mã điều khiển bị lược', () => {
    expect(sanitiseText('Phòng ngủ')).toBe('Ph\\U+00F2ng ng\\U+1EE7');
    expect(sanitiseText('a\r\n0\r\nLINE')).toBe('a  0  LINE');
    expect(sanitiseText('x\\P')).toBe('x/P');
  });

  it('tệp rỗng vẫn đủ bốn phần và kết thúc bằng EOF', () => {
    const dxf = new DxfDocument().toString();
    expect(dxf.startsWith('0\r\nSECTION\r\n2\r\nHEADER')).toBe(true);
    expect(dxf).toContain('AC1009');
    expect(dxf.endsWith('0\r\nEOF\r\n')).toBe(true);
  });
});

describe('lớp CAD đọc từ kb/layer_mapping.yaml', () => {
  it('đủ mọi vai trò bộ xuất dùng; tên lớp lấy từ tệp, không từ mã', () => {
    for (const role of DXF_ROLES) expect(layers[role].layer.length).toBeGreaterThan(0);
    expect(layers.wall.layer).toBe('NV-Tuong');
  });

  it('thiếu vai trò thì từ chối nạp', () => {
    expect(() => parseLayerExport('export:\n  wall: { layer: X, color: 7 }\n')).toThrow(
      LayerExportError,
    );
  });
});

describe('mặt bằng AI → DXF', () => {
  const dxf = renderPlanDxf(VILLA_PLAN, { style, labels, layers }).dxf;
  const all = entities(dxf);

  it('không một số nào là NaN hay vô cực', () => {
    expect(dxf).not.toMatch(/NaN|Infinity/);
  });

  it('mọi lớp dùng tới đều khai trong bảng LAYER', () => {
    const declared = new Set(
      [...dxf.matchAll(/\r\n0\r\nLAYER\r\n2\r\n([^\r]+)/g)].map((m) => m[1]),
    );
    for (const entity of all) expect(declared, layerOf(entity)).toContain(layerOf(entity));
  });

  it('mỗi cung cửa của tờ SVG thành đúng một ARC trên lớp cửa', () => {
    const svgArcs = VILLA_PLAN.levels
      .map((level) => renderPlanSheet(VILLA_PLAN, level.level, { style, labels }).svg)
      .reduce((sum, svg) => sum + (svg.match(/ A /g) ?? []).length, 0);
    const arcs = all.filter((e) => e.type === 'ARC');
    expect(svgArcs).toBeGreaterThan(0);
    expect(arcs.length).toBe(svgArcs);
    for (const arc of arcs) expect(layerOf(arc)).toBe(layers.door.layer);
  });

  it('tâm cung cửa trùng BẢN LỀ — đầu nét cánh cửa; lật nhầm chiều quét thì tâm rơi sang phía đối xứng', () => {
    const leafEnds = all
      .filter((e) => e.type === 'LINE' && layerOf(e) === layers.door.layer)
      .flatMap((e) => [
        [n(e, 10), n(e, 20)],
        [n(e, 11), n(e, 21)],
      ]);
    for (const arc of all.filter((e) => e.type === 'ARC')) {
      const [cx, cy] = [n(arc, 10), n(arc, 20)];
      const r = n(arc, 40);
      const hinge = leafEnds.some(([x, y]) => Math.hypot(x! - cx, y! - cy) < 1);
      expect(hinge, `cung tâm (${cx}, ${cy})`).toBe(true);
      // Và một đầu cung là mũi cánh: cách bản lề đúng một bán kính, cũng là đầu nét cánh.
      const tips = [n(arc, 50), n(arc, 51)].map((deg) => [
        cx + r * Math.cos((deg * Math.PI) / 180),
        cy + r * Math.sin((deg * Math.PI) / 180),
      ]);
      expect(
        tips.some(([tx, ty]) => leafEnds.some(([x, y]) => Math.hypot(x! - tx!, y! - ty!) < 1)),
      ).toBe(true);
    }
  });

  it('mỗi phòng có một đường bao TIM khép kín trên lớp ranh phòng, diện tích đúng chữ nhật', () => {
    const outlines = all.filter(
      (e) => e.type === 'POLYLINE' && layerOf(e) === layers.room_boundary.layer,
    );
    const rooms = VILLA_PLAN.levels.flatMap((level) => level.rooms);
    expect(outlines).toHaveLength(rooms.length);
  });

  it('tên phòng và câu cảnh báo nhánh AI có trong tệp — mã chèn, không tắt được', () => {
    const texts = all.filter((e) => e.type === 'TEXT').map((e) => e.codes.get(1)![0]!);
    expect(texts).toContain(sanitiseText('Đề xuất AI — bản phác, không dùng để thi công'));
    expect(texts.some((t) => t.startsWith(sanitiseText('Mặt bằng công năng')))).toBe(true);
  });

  it('các tầng đặt cạnh nhau, không chồng lên nhau', () => {
    const plan = renderPlanDxf(TOWNHOUSE_PLAN, { style, labels, layers }).dxf;
    // Mỗi phòng một đường bao bốn đỉnh, theo thứ tự tầng: tầng sau nằm hẳn bên phải tầng trước.
    const xs = [...plan.matchAll(/\r\n0\r\nVERTEX\r\n8\r\n([^\r]+)\r\n10\r\n([^\r]+)/g)]
      .filter((m) => m[1] === layers.room_boundary.layer)
      .map((m) => Number(m[2]));
    let from = 0;
    let previousMax = -Infinity;
    for (const level of TOWNHOUSE_PLAN.levels) {
      const own = xs.slice(from, from + level.rooms.length * 4);
      expect(Math.min(...own), level.name).toBeGreaterThan(previousMax);
      previousMax = Math.max(...own);
      from += level.rooms.length * 4;
    }
  });
});
