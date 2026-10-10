/**
 * Chuỗi kích thước — SUY từ toạ độ tường, không hỏi mô hình.
 *
 * Đây là quyết định T15 ở dạng cụ thể nhất: mô hình khai tường, chương trình đo. Bắt mô hình
 * khai lại chuỗi kích thước thì vừa tốn thêm ~30% token vừa mở ra một cách sai mới — một chuỗi
 * cộng không ra tổng là bản vẽ không kiến trúc sư nào tin, và đó đúng là kiểu sai mà mô hình
 * ngôn ngữ mắc nhiều nhất. Đo từ chính hình đã vẽ thì tổng LUÔN bằng tổng các đoạn.
 *
 * Hai chuỗi, đúng như hồ sơ giấy: một hàng ngang dưới mặt trước, một hàng dọc bên trái. Mỗi
 * hàng có chuỗi chi tiết (giữa các trục tường bao) và chuỗi tổng bên dưới. Nhà hình chữ nhật
 * không có tường bao trung gian thì chuỗi chi tiết trùng chuỗi tổng — khi ấy chỉ in một hàng.
 *
 * ⚠️ Số ghi bằng MI-LI-MÉT, theo thói quen bản vẽ xây dựng Việt Nam ("3600" chứ không phải
 * "3,6 m"). Hình học nội bộ tính bằng cm; đổi ở đây, một chỗ.
 */

import { type Rect } from './geometry';
import { CLS, num, polylinePath, tag, textEl } from './svg';
import type { SheetStyle } from './style';
import type { Paper } from './units';
import type { WallGeom } from './walls';

/** Hai trục tường cách nhau dưới mức này thì gộp làm một — chuỗi kích thước không đọc nổi. */
const MIN_STATION_GAP_CM = 5;

/** Bề rộng ước của một chữ số trên cỡ chữ — để biết đoạn nào quá ngắn cho số của nó. */
const SHORT_TEXT_SHARE = 0.6;

/** Sai lệch cho phép khi hỏi "bức tường này có nằm dọc trục không", cm. */
const AXIS_TOLERANCE_CM = 1;

export function renderDimensions(
  walls: readonly WallGeom[],
  bbox: Rect,
  paper: Paper,
  style: SheetStyle,
  /**
   * Tim trục (cm) theo hai phương — có thì chuỗi thành BA hàng như hồ sơ thật: chi tiết, trục, tổng
   * (T147). Vắng (ảnh neo) thì hai hàng như trước.
   */
  axes?: { x: readonly number[]; y: readonly number[] },
): string {
  const parts: string[] = [];

  // Trục ngang: các bức tường bao chạy DỌC (x không đổi) cắt mặt trước ở đâu.
  const xStations = stations(
    walls.filter((wall) => Math.abs(wall.a[0] - wall.b[0]) <= AXIS_TOLERANCE_CM),
    (wall) => (wall.a[0] + wall.b[0]) / 2,
    bbox.x0,
    bbox.x1,
  );
  // Trục dọc: các bức tường bao chạy NGANG (y không đổi).
  const yStations = stations(
    walls.filter((wall) => Math.abs(wall.a[1] - wall.b[1]) <= AXIS_TOLERANCE_CM),
    (wall) => (wall.a[1] + wall.b[1]) / 2,
    bbox.y0,
    bbox.y1,
  );

  const withAxes = (detail: number[], at: readonly number[], min: number, max: number) => {
    const inside = at.filter((v) => v > min + AXIS_TOLERANCE_CM && v < max - AXIS_TOLERANCE_CM);
    return [detail, [min, ...inside, max], [min, max]];
  };
  if (axes && axes.x.length >= 2) {
    parts.push(chainRows(withAxes(xStations, axes.x, bbox.x0, bbox.x1), 'x', bbox, paper, style));
  } else {
    parts.push(chain(xStations, 'x', bbox, paper, style));
  }
  if (axes && axes.y.length >= 2) {
    parts.push(chainRows(withAxes(yStations, axes.y, bbox.y0, bbox.y1), 'y', bbox, paper, style));
  } else {
    parts.push(chain(yStations, 'y', bbox, paper, style));
  }
  return parts.join('');
}

/** Trục tường đã sắp, đã gộp trục sát nhau, và luôn có hai mép hình bao. */
function stations(
  walls: readonly WallGeom[],
  coordinate: (wall: WallGeom) => number,
  min: number,
  max: number,
): number[] {
  // Mọi bức tường CẮT NGANG trục đều là một trạm, không riêng tường bao. Bản trước chỉ lấy
  // tường bao nên chuỗi chi tiết của một ngôi nhà chỉ còn «220 · 9780 · 220» — nghĩa là nó chỉ
  // nói bề dày hai bức tường ngoài, còn ngôi nhà bên trong thì không đo gì. Lan can vẫn đứng
  // ngoài: nó không phải trục để bắt kích thước.
  const raw = [min, max, ...walls.filter((w) => w.kind !== 'r').map(coordinate)]
    .filter((value) => value >= min - AXIS_TOLERANCE_CM && value <= max + AXIS_TOLERANCE_CM)
    .sort((a, b) => a - b);

  const out: number[] = [];
  for (const value of raw) {
    const clamped = Math.max(min, Math.min(max, value));
    const previous = out[out.length - 1];
    if (previous === undefined || clamped - previous > MIN_STATION_GAP_CM) out.push(clamped);
  }
  // Mép cuối phải là mép hình bao, kể cả khi có một trục tường sát nó vừa bị gộp mất.
  if (out.length > 0) out[out.length - 1] = max;
  return out;
}

/**
 * Một hàng chuỗi kích thước: chuỗi chi tiết ở gần hình, chuỗi tổng ở xa hơn.
 *
 * Hàng ngang nằm DƯỚI mặt trước (cạnh `y` nhỏ nhất — sau khi lật trục, đó là mép dưới tờ
 * giấy); hàng dọc nằm BÊN TRÁI. Cả hai là quy ước đọc bản vẽ, không phải lựa chọn thẩm mỹ:
 * người đọc tìm kích thước tổng ở ngoài cùng.
 */
export function chain(
  values: readonly number[],
  axis: 'x' | 'y',
  bbox: Rect,
  paper: Paper,
  style: SheetStyle,
): string {
  if (values.length < 2) return '';
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  return chainRows(
    values.length > 2 ? [values, [first, last]] : [values],
    axis,
    bbox,
    paper,
    style,
  );
}

export interface ChainOptions {
  /**
   * Phía đặt chuỗi. `low` = dưới hình (hàng ngang) / trái hình (hàng dọc) — mặc định, như mọi tờ
   * trước T147. `high` = trên / phải: tờ mặt đứng ghi kích thước cả hai bên như hồ sơ M5.
   */
  side?: 'low' | 'high';
  /** Khoảng hở thêm giữa mép hình và hàng thứ nhất, mm giấy — chỗ cho cột ghi chú dẫn. */
  extraOffsetMm?: number;
}

/**
 * Nhiều hàng chuỗi, hàng 0 gần hình nhất. Đường gióng chỉ vẽ ở hàng NGOÀI CÙNG và chạy từ mép
 * hình ra — vẽ ở mọi hàng thì rối mà không thêm thông tin. Hàng ít hơn hai trạm thì bỏ, nhưng vẫn
 * giữ chỗ để hàng sau không trượt vào trong.
 */
export function chainRows(
  rowsIn: ReadonlyArray<readonly number[]>,
  axis: 'x' | 'y',
  bbox: Rect,
  paper: Paper,
  style: SheetStyle,
  options: ChainOptions = {},
): string {
  const rows = rowsIn.map((stops, row) => ({ stops, row })).filter((r) => r.stops.length >= 2);
  if (rows.length === 0) return '';

  const lines: string[] = [];
  const ticks: string[] = [];
  const texts: string[] = [];

  const high = options.side === 'high';
  // Toạ độ giấy của mép hình mà đường gióng xuất phát, và chiều đi ra xa hình.
  const edgePaper =
    axis === 'x' ? paper.y(high ? bbox.y1 : bbox.y0) : paper.x(high ? bbox.x1 : bbox.x0);
  // Giấy y hướng xuống: hàng ngang phía dưới đi +1, phía trên đi −1; hàng dọc trái −1, phải +1.
  const direction = axis === 'x' ? (high ? -1 : 1) : high ? 1 : -1;
  const rowAt = (index: number): number =>
    edgePaper +
    direction *
      ((options.extraOffsetMm ?? 0) + style.dim.first_offset_mm + index * style.dim.row_gap_mm);
  const outer = Math.max(...rows.map((r) => r.row));

  const paperOf = (value: number): number => (axis === 'x' ? paper.x(value) : paper.y(value));

  for (const { stops, row } of rows) {
    const at = rowAt(row);
    lines.push(
      polylinePath(
        pointsOn(axis, at, [paperOf(stops[0] ?? 0), paperOf(stops[stops.length - 1] ?? 0)]),
        false,
      ),
    );

    for (const stop of stops) {
      const position = paperOf(stop);
      ticks.push(tickMark(axis, at, position, style));
      if (row === outer) {
        const to = at + direction * style.dim.ext_overshoot_mm;
        lines.push(polylinePath(pointsOn(axis, edgePaper, [position, position], to), false));
      }
    }
    texts.push(...rowTexts(stops, axis, at, -direction, paperOf, style));
  }

  return [
    tag('path', { class: CLS.dimLine, d: lines.join(' ') }),
    tag('path', { class: CLS.dimTick, d: ticks.join(' ') }),
    ...texts,
  ].join('');
}

/**
 * Một chuỗi ĐẶT TRONG HÌNH ở toạ độ thật `crossAt` (cm) — chuỗi lỗ mở từng tầng, chuỗi bậu/cửa sổ
 * của hồ sơ M5. Không đường gióng: gạch chéo nằm ngay trên mép vật được đo. Chữ ở phía `textSide`
 * (giấy: −1 = trên / trái, 1 = dưới / phải).
 */
export function inFieldChain(
  stopsIn: readonly number[],
  axis: 'x' | 'y',
  crossAt: number,
  paper: Paper,
  style: SheetStyle,
  textSide: -1 | 1 = -1,
  crossOffsetMm = 0,
): string {
  const stops = [...stopsIn].sort((a, b) => a - b);
  if (stops.length < 2) return '';
  const at = (axis === 'x' ? paper.y(crossAt) : paper.x(crossAt)) + crossOffsetMm;
  const paperOf = (value: number): number => (axis === 'x' ? paper.x(value) : paper.y(value));
  const line = polylinePath(
    pointsOn(axis, at, [paperOf(stops[0] ?? 0), paperOf(stops[stops.length - 1] ?? 0)]),
    false,
  );
  const ticks = stops.map((stop) => tickMark(axis, at, paperOf(stop), style));
  return [
    tag('path', { class: CLS.dimLine, d: line }),
    tag('path', { class: CLS.dimTick, d: ticks.join(' ') }),
    ...rowTexts(stops, axis, at, textSide, paperOf, style),
  ].join('');
}

/** Chữ số mm giữa từng cặp trạm liền nhau của một hàng. */
function rowTexts(
  stops: readonly number[],
  axis: 'x' | 'y',
  at: number,
  side: number,
  paperOf: (value: number) => number,
  style: SheetStyle,
): string[] {
  const texts: string[] = [];
  // Chữ của hai đoạn ngắn liền nhau («400 / 100» của dải dầm + phào) đè lên nhau. Như người vẽ CAD:
  // chữ nào sẽ chồng lên chữ vừa đặt thì đưa sang PHÍA BÊN KIA đường kích thước; bên kia cũng chồng
  // thì giữ chỗ cũ (hiếm — ba đoạn cực ngắn liền nhau).
  const placed: Record<'near' | 'far', Array<[number, number]>> = { near: [], far: [] };
  const overlaps = (list: Array<[number, number]>, span: [number, number]) =>
    list.some(([a, b]) => span[0] < b && span[1] > a);
  for (let i = 0; i + 1 < stops.length; i += 1) {
    const from = stops[i] ?? 0;
    const to = stops[i + 1] ?? 0;
    const millimetres = Math.round((to - from) * 10);
    if (millimetres <= 0) continue;
    const mid = paperOf((from + to) / 2);
    const half = (String(millimetres).length * style.text_mm.dim * SHORT_TEXT_SHARE) / 2;
    const span: [number, number] = [mid - half, mid + half];
    const flip = overlaps(placed.near, span) && !overlaps(placed.far, span);
    placed[flip ? 'far' : 'near'].push(span);
    const textAt = flip
      ? at - side * (style.dim.text_gap_mm + style.text_mm.dim * 0.6)
      : at + side * style.dim.text_gap_mm;
    const x = axis === 'x' ? mid : textAt;
    const y = axis === 'x' ? textAt : mid;
    texts.push(
      textEl(String(millimetres), {
        x,
        y,
        class: CLS.textDim,
        // Hàng dọc: chữ quay đứng để đọc từ mép phải tờ giấy — quy ước của bản vẽ kỹ thuật.
        transform: axis === 'y' ? `rotate(-90 ${num(x)} ${num(y)})` : null,
      }),
    );
  }
  return texts;
}

/** Bề dày dải `rows` hàng kích thước (kể cả chữ của hàng ngoài cùng), mm giấy. */
export function chainBandMm(rows: number, style: SheetStyle): number {
  if (rows <= 0) return 0;
  return (
    style.dim.first_offset_mm +
    (rows - 1) * style.dim.row_gap_mm +
    style.dim.ext_overshoot_mm +
    style.dim.text_gap_mm
  );
}

/**
 * Hai điểm của một đoạn thẳng cùng phương trục, đổi sang toạ độ giấy.
 *
 * `axis === 'x'` nghĩa là chuỗi chạy ngang: `cross` là toạ độ y giấy, `values` là hai toạ độ
 * x giấy. `crossEnd` khác `cross` khi vẽ đường gióng (đoạn vuông góc với chuỗi).
 */
function pointsOn(
  axis: 'x' | 'y',
  cross: number,
  values: [number, number],
  crossEnd = cross,
): Array<[number, number]> {
  return axis === 'x'
    ? [
        [values[0], cross],
        [values[1], crossEnd],
      ]
    : [
        [cross, values[0]],
        [crossEnd, values[1]],
      ];
}

/** Gạch chéo 45° ở đầu mút mỗi đoạn — ký hiệu chuẩn của bản vẽ xây dựng, không dùng mũi tên. */
function tickMark(axis: 'x' | 'y', cross: number, position: number, style: SheetStyle): string {
  const t = style.dim.tick_mm;
  const [x, y] = axis === 'x' ? [position, cross] : [cross, position];
  return polylinePath(
    [
      [x - t, y - t],
      [x + t, y + t],
    ],
    false,
  );
}
