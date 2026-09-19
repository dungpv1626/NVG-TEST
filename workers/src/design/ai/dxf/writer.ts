/**
 * Bộ ghi DXF tối giản — ASCII, phiên bản R12 (AC1009), không thư viện.
 *
 * Vì sao R12: đây là phiên bản mọi phần mềm CAD còn đọc được (AutoCAD, BricsCAD, LibreCAD, ezdxf)
 * và là phiên bản duy nhất KHÔNG đòi bảng handle, CLASSES, OBJECTS. Một mặt bằng sơ đồ chỉ cần năm
 * loại thực thể — LINE, ARC, CIRCLE, POLYLINE, TEXT — và R12 có đủ.
 *
 * Nhánh AI viết DXF bằng TypeScript trong Worker (Haan chốt Q-45a, 15/09/2026): bộ xuất Python sẵn có
 * nằm trong Container của bộ giải nội bộ, thứ sẽ bị xoá (8.5b), và nhánh AI không được phụ thuộc nó.
 *
 * ⚠️ Chữ: R12 lưu theo bảng mã ANSI, nên mọi ký tự ngoài ASCII ghi dạng `\U+XXXX` — cách AutoCAD và
 * ezdxf cùng hiểu. Ghi thẳng UTF-8 thì tên phòng tiếng Việt thành chữ rác trên máy đặt bảng mã khác.
 * Tên phòng do mô hình sinh là nội dung không tin được: xuống dòng và mã điều khiển bị lược, vì một
 * dòng mới giữa cặp mã nhóm DXF là chèn được thực thể lạ vào tệp.
 */

export interface DxfLayer {
  name: string;
  /** Màu ACI, 1–255. */
  color: number;
}

export type DxfLinetype = 'CONTINUOUS' | 'DASHED';

type Pt = readonly [number, number];

type Entity =
  | { kind: 'line'; layer: string; a: Pt; b: Pt; linetype: DxfLinetype }
  | { kind: 'polyline'; layer: string; points: readonly Pt[]; closed: boolean }
  | { kind: 'arc'; layer: string; centre: Pt; r: number; start: number; end: number }
  | { kind: 'circle'; layer: string; centre: Pt; r: number }
  | { kind: 'text'; layer: string; at: Pt; height: number; rotation: number; text: string };

/** Nét đứt tính theo mm mô hình ở tỷ lệ 1:100 — 5 mm giấy nét, 2,5 mm giấy hở. */
const DASH_MM = 500;
const GAP_MM = 250;

export class DxfDocument {
  private readonly layers = new Map<string, DxfLayer>();
  private readonly entities: Entity[] = [];

  addLayer(layer: DxfLayer): void {
    if (!this.layers.has(layer.name)) this.layers.set(layer.name, layer);
  }

  line(layer: string, a: Pt, b: Pt, linetype: DxfLinetype = 'CONTINUOUS'): void {
    if (a[0] === b[0] && a[1] === b[1]) return;
    this.entities.push({ kind: 'line', layer, a, b, linetype });
  }

  polyline(layer: string, points: readonly Pt[], closed: boolean): void {
    if (points.length < 2) return;
    this.entities.push({ kind: 'polyline', layer, points, closed });
  }

  /** Cung NGƯỢC chiều kim đồng hồ từ `start` tới `end`, độ. */
  arc(layer: string, centre: Pt, r: number, start: number, end: number): void {
    if (!(r > 0)) return;
    this.entities.push({ kind: 'arc', layer, centre, r, start, end });
  }

  circle(layer: string, centre: Pt, r: number): void {
    if (!(r > 0)) return;
    this.entities.push({ kind: 'circle', layer, centre, r });
  }

  /** Chữ căn GIỮA theo cả hai chiều quanh `at`; `rotation` độ, ngược chiều kim đồng hồ. */
  text(layer: string, at: Pt, height: number, text: string, rotation = 0): void {
    const clean = sanitiseText(text);
    if (!clean || !(height > 0)) return;
    this.entities.push({ kind: 'text', layer, at, height, rotation, text: clean });
  }

  get size(): number {
    return this.entities.length;
  }

  toString(): string {
    const out: string[] = [];
    const g = (code: number, value: string | number) => {
      out.push(String(code), typeof value === 'number' ? fmt(value) : value);
    };
    const extents = this.extents();

    g(0, 'SECTION');
    g(2, 'HEADER');
    g(9, '$ACADVER');
    g(1, 'AC1009');
    g(9, '$DWGCODEPAGE');
    g(3, 'ANSI_1252');
    g(9, '$INSBASE');
    g(10, 0);
    g(20, 0);
    g(30, 0);
    g(9, '$EXTMIN');
    g(10, extents.x0);
    g(20, extents.y0);
    g(30, 0);
    g(9, '$EXTMAX');
    g(10, extents.x1);
    g(20, extents.y1);
    g(30, 0);
    g(9, '$LTSCALE');
    g(40, 1);
    g(0, 'ENDSEC');

    g(0, 'SECTION');
    g(2, 'TABLES');
    g(0, 'TABLE');
    g(2, 'LTYPE');
    g(70, 2);
    g(0, 'LTYPE');
    g(2, 'CONTINUOUS');
    g(70, 0);
    g(3, 'Solid line');
    g(72, 65);
    g(73, 0);
    g(40, 0);
    g(0, 'LTYPE');
    g(2, 'DASHED');
    g(70, 0);
    g(3, 'Dashed __ __ __');
    g(72, 65);
    g(73, 2);
    g(40, DASH_MM + GAP_MM);
    g(49, DASH_MM);
    g(49, -GAP_MM);
    g(0, 'ENDTAB');
    g(0, 'TABLE');
    g(2, 'LAYER');
    g(70, this.layers.size + 1);
    for (const layer of [{ name: '0', color: 7 }, ...this.layers.values()]) {
      g(0, 'LAYER');
      g(2, layer.name);
      g(70, 0);
      g(62, layer.color);
      g(6, 'CONTINUOUS');
    }
    g(0, 'ENDTAB');
    g(0, 'TABLE');
    g(2, 'STYLE');
    g(70, 1);
    g(0, 'STYLE');
    g(2, 'STANDARD');
    g(70, 0);
    g(40, 0);
    g(41, 1);
    g(50, 0);
    g(71, 0);
    g(42, 250);
    // Phông TrueType có đủ dấu tiếng Việt; `txt.shx` mặc định của R12 không có.
    g(3, 'arial.ttf');
    g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    g(0, 'SECTION');
    g(2, 'ENTITIES');
    for (const e of this.entities) {
      switch (e.kind) {
        case 'line':
          g(0, 'LINE');
          g(8, e.layer);
          if (e.linetype !== 'CONTINUOUS') g(6, e.linetype);
          g(10, e.a[0]);
          g(20, e.a[1]);
          g(30, 0);
          g(11, e.b[0]);
          g(21, e.b[1]);
          g(31, 0);
          break;
        case 'polyline':
          g(0, 'POLYLINE');
          g(8, e.layer);
          g(66, 1);
          g(10, 0);
          g(20, 0);
          g(30, 0);
          g(70, e.closed ? 1 : 0);
          for (const point of e.points) {
            g(0, 'VERTEX');
            g(8, e.layer);
            g(10, point[0]);
            g(20, point[1]);
            g(30, 0);
          }
          g(0, 'SEQEND');
          g(8, e.layer);
          break;
        case 'arc':
          g(0, 'ARC');
          g(8, e.layer);
          g(10, e.centre[0]);
          g(20, e.centre[1]);
          g(30, 0);
          g(40, e.r);
          g(50, e.start);
          g(51, e.end);
          break;
        case 'circle':
          g(0, 'CIRCLE');
          g(8, e.layer);
          g(10, e.centre[0]);
          g(20, e.centre[1]);
          g(30, 0);
          g(40, e.r);
          break;
        case 'text':
          g(0, 'TEXT');
          g(8, e.layer);
          g(10, e.at[0]);
          g(20, e.at[1]);
          g(30, 0);
          g(40, e.height);
          g(1, e.text);
          if (e.rotation) g(50, e.rotation);
          g(7, 'STANDARD');
          g(72, 1);
          g(11, e.at[0]);
          g(21, e.at[1]);
          g(31, 0);
          g(73, 2);
          break;
      }
    }
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return `${out.join('\r\n')}\r\n`;
  }

  private extents(): { x0: number; y0: number; x1: number; y1: number } {
    const xs: number[] = [];
    const ys: number[] = [];
    const add = (p: Pt, pad = 0) => {
      xs.push(p[0] - pad, p[0] + pad);
      ys.push(p[1] - pad, p[1] + pad);
    };
    for (const e of this.entities) {
      if (e.kind === 'line') (add(e.a), add(e.b));
      else if (e.kind === 'polyline') e.points.forEach((p) => add(p));
      else if (e.kind === 'text') add(e.at, e.height);
      else add(e.centre, e.r);
    }
    if (!xs.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
}

/** Số trong tệp DXF: ba chữ số thập phân (một phần nghìn mm), không mũ khoa học, không `-0`. */
function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/**
 * Chữ an toàn cho một giá trị mã nhóm 1: bỏ mã điều khiển (xuống dòng mở đường chèn thực thể), thoát
 * ngoài ASCII thành `\U+XXXX`, và bỏ `\` đứng một mình để không thành mã định dạng MTEXT.
 */
export function sanitiseText(text: string): string {
  let out = '';
  for (const char of text.replace(/[ -]/g, ' ').trim()) {
    const code = char.codePointAt(0)!;
    if (char === '\\') out += '/';
    else if (code < 128) out += char;
    else if (code <= 0xffff) out += `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}
