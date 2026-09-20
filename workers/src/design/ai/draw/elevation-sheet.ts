/**
 * Tờ MẶT ĐỨNG mặt tiền của nhánh AI (T59) — SVG vector tất định, cùng bộ vẽ với tờ mặt bằng.
 *
 * «AI thiết kế, chương trình cầm bút» (T15) áp nguyên: artifact `ai_facade_concept` là dữ liệu,
 * mọi nét trên giấy do hàm này đặt. Cùng artifact thì cùng chuỗi SVG.
 *
 * ── Hệ toạ độ ──────────────────────────────────────────────────────────────────────────
 * Mặt đứng là hệ hai chiều `x` (dọc mặt tiền, cùng gốc với mặt bằng) × `z` (cao độ, ±0.000 = sàn
 * tầng 1). Bộ đổi toạ độ `Paper` vốn lật trục thứ hai cho mặt bằng — ở đây đúng là thứ cần: `z`
 * tăng thì lên phía trên tờ giấy. Nên `paper.p([x, z])` dùng thẳng, không cần bộ đổi riêng.
 *
 * ── Thứ tự chồng lớp ───────────────────────────────────────────────────────────────────
 * đường cốt đất → khối nhà → vạch sàn → lỗ mở → mảng trang trí → lan can → mái → cổng, rào →
 * ký hiệu cao độ → chuỗi kích thước. Mảng trang trí tô nền nhạt nên phải vẽ SAU lỗ mở: chỉ ô văng
 * và lam được phép đè lên cửa (`ai/facade/check.ts`), và lam đè lên cửa sổ là đúng hình thật.
 * Cổng và rào vẽ NÉT ĐỨT, không tô — chúng đứng trước nhà: tô đặc thì che mất tầng 1, còn nét liền
 * thì đọc thành một vạch ngang cắt qua cửa chính (thấy trên lượt chạy thật đầu tiên, 19/09/2026).
 *
 * Vật liệu và màu KHÔNG vẽ lên tờ này: tờ là bản vẽ đơn sắc đo được, còn vật liệu ghi bằng chữ ở
 * dải ghi chú và bảng ý tưởng trên màn hình. Ảnh có vật liệu là việc của mô hình ảnh (Đợt E).
 */

import type { AiFacadeConcept } from '@nvg/shared/design';
import { chain } from './dims';
import { bboxOfPoints, type Pt, type Rect } from './geometry';
import { DrawNotes, type DrawNote } from './notes';
import {
  renderFooter,
  renderFrame,
  renderSheetTitle,
  renderTitleBlock,
  svgDocument,
} from './sheet';
import { mainDoorOf } from '../facade/frame';
import { anchorPaper, anchorSvg } from './anchor';
import { CLS, polylinePath, tag, textEl } from './svg';
import type { Orientation, SheetStyle } from './style';
import { chooseLayout, mmPerCm, paperFor, type Paper } from './units';

export interface ElevationOptions {
  style: SheetStyle;
  /** Chiều cao lan can, cm — `kb/construction_norms.yaml` mục `outdoor`. */
  railingHeightCm: number;
  /**
   * Bảng vật liệu — nhãn đã ghép từ danh mục ở nơi gọi. Tờ SVG in thành ô khung tên (dải ghi chú
   * dưới hình chỉ đủ hai dòng, một dòng vật liệu dài tràn sang cột khung tên); DXF in thành dòng.
   */
  legend?: ReadonlyArray<{ label: string; value: string }>;
  /**
   * Kiểu chia cánh cửa đi và kiểu cửa để xe, đã tra danh mục ở nơi gọi (`openings_style` của ý tưởng).
   * Vắng thì theo quy tắc bề rộng.
   */
  openingStyles?: OpeningStyles;
}

export interface ElevationSheetResult {
  svg: string;
  scale: number;
  orientation: Orientation;
  notes: DrawNote[];
}

export class ElevationSheetError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'ElevationSheetError';
  }
}

export const ELEVATION_TITLE = 'Mặt đứng mặt tiền';
const ELEVATION_CATEGORY = 'Kiến trúc — mặt đứng ý tưởng';

/** Hai trạm kích thước sát nhau hơn mức này thì gộp — chuỗi không đọc nổi, cm. */
const MIN_STATION_GAP_CM = 5;

// Ký hiệu trên tờ, không phải cấu tạo: chỉ quyết định nét vẽ trông thế nào.
/** Cửa sổ từ bề rộng này vẽ hai cánh (một đố đứng giữa), cm. */
const WINDOW_TWO_LEAF_CM = 100;
/** Cửa đi từ bề rộng này vẽ hai cánh, cm. */
const DOOR_TWO_LEAF_CM = 120;
/** Đố ngang cửa sổ đặt ở phần tư dưới — ô cố định bên dưới, cánh mở bên trên. */
const WINDOW_TRANSOM_SHARE = 0.25;
/** Số khoang nan của cửa cuốn — cố định để tờ nào cũng đọc ra cùng một ký hiệu. */
const SHUTTER_BAYS = 6;
/** Đường cốt đất chạy quá khối nhà mỗi bên, phần của bề rộng hình. */
const GROUND_OVERRUN_SHARE = 0.04;

type Opening = AiFacadeConcept['openings_front'][number];

export function renderElevationSheet(
  concept: AiFacadeConcept,
  options: ElevationOptions,
): ElevationSheetResult {
  const { style } = options;
  const notes = new DrawNotes();
  const bbox = elevationBounds(concept, options);

  // Hai lượt chọn tỷ lệ: ký hiệu cao độ đứng BÊN PHẢI hình, bề rộng của nó tính bằng mm giấy, nên
  // đổi ra cm phải biết tỷ lệ trước. Lượt hai lấy tỷ lệ của lượt một để chừa chỗ.
  const first = chooseLayout(bbox, style);
  const widened = { ...bbox, x1: bbox.x1 + levelMarkWidthMm(style) / mmPerCm(first.scale) };
  const { orientation, scale, area, fits } = chooseLayout(widened, style);
  if (!fits) {
    notes.add(
      'scale_overflow',
      `Mặt đứng rộng hoặc cao hơn khổ giấy A3 ở mọi tỷ lệ đã khai — đã vẽ ở tỷ lệ 1:${scale} và hình có thể chạm mép khung.`,
    );
  }
  const paper = paperFor(widened, area, scale);

  const body = [
    renderFrame(area),
    renderTitleBlock(area, style, {
      levelName: ELEVATION_TITLE,
      scale,
      category: ELEVATION_CATEGORY,
      extra: options.legend ?? [],
    }),
    renderSheetTitle(area, style, 'Mặt tiền', 'Mặt đứng'),
    renderFooter(area, style, []),
    renderElevationBody(concept, paper, options),
  ].join('');

  return { svg: svgDocument(style, orientation, body), scale, orientation, notes: notes.list() };
}

/**
 * Phần HÌNH của mặt đứng — không khung, không khung tên. Tờ SVG, ảnh neo và tệp DXF cùng gọi hàm
 * này với ba bộ đổi toạ độ khác nhau: một nguồn hình học (CLAUDE.md 8.2 điểm 5).
 */
export function renderElevationBody(
  concept: AiFacadeConcept,
  paper: Paper,
  options: ElevationOptions,
): string {
  const { style } = options;
  const elevation = concept.elevation;
  const levels = [...elevation.levels].sort((a, b) => a.level - b.level);
  const first = levels[0];
  if (!first) throw new ElevationSheetError('Mặt đứng không có tầng nào.');
  const top = levels[levels.length - 1] ?? first;
  const roofZ = top.z + top.h;
  const bbox = elevationBounds(concept, options);
  const levelZ = new Map(levels.map((l) => [l.level, l.z]));

  const rect = (x0: number, z0: number, x1: number, z1: number, cls: string): string => {
    const [ax, ay] = paper.p([Math.min(x0, x1), Math.max(z0, z1)]);
    return tag('rect', {
      x: ax,
      y: ay,
      width: paper.len(Math.abs(x1 - x0)),
      height: paper.len(Math.abs(z1 - z0)),
      class: cls,
    });
  };
  const path = (points: Pt[], cls: string, close = false): string =>
    tag('path', {
      class: cls,
      d: polylinePath(
        points.map((p) => paper.p(p)),
        close,
      ),
    });

  const parts: string[] = [];

  // Đường cốt đất — chạy quá khối nhà hai bên, như hồ sơ giấy.
  const groundOverrun = (bbox.x1 - bbox.x0) * GROUND_OVERRUN_SHARE;
  parts.push(
    path(
      [
        [bbox.x0 - groundOverrun, elevation.ground_z],
        [bbox.x1 + groundOverrun, elevation.ground_z],
      ],
      CLS.ground,
    ),
  );

  // Khối nhà: phần đế từ cốt đất lên ±0.000, rồi từng tầng.
  parts.push(rect(first.x0, elevation.ground_z, first.x1, 0, CLS.elevationOutline));
  for (const level of levels) {
    parts.push(rect(level.x0, level.z, level.x1, level.z + level.h, CLS.elevationOutline));
  }
  for (const level of levels.slice(1)) {
    parts.push(
      path(
        [
          [level.x0, level.z],
          [level.x1, level.z],
        ],
        CLS.floorLine,
      ),
    );
  }

  // Lỗ mở — KHOÁ, chép từ mặt bằng.
  const mainDoor = mainDoorOf(concept.openings_front);
  for (const opening of concept.openings_front) {
    const base = (levelZ.get(opening.level) ?? 0) + opening.sill;
    const leaves =
      opening.kind !== 'door'
        ? null
        : opening === mainDoor
          ? (options.openingStyles?.main ?? null)
          : (options.openingStyles?.side ?? null);
    parts.push(
      ...openingShape(opening, base, rect, path, leaves, options.openingStyles?.garage ?? null),
    );
  }

  // Mảng trang trí.
  for (const element of elevation.elements ?? []) {
    const [x0 = 0, z0 = 0, x1 = 0, z1 = 0] = element.rect;
    parts.push(rect(x0, z0, x1, z1, CLS.element));
  }

  // Lan can ban công: khung + tay vịn giữa. Kiểu lan can ghi bằng chữ, không vẽ hoa văn.
  for (const balcony of concept.balconies ?? []) {
    const z = levelZ.get(balcony.level) ?? 0;
    const h = options.railingHeightCm;
    parts.push(rect(balcony.x0, z, balcony.x1, z + h, CLS.railing));
    parts.push(
      path(
        [
          [balcony.x0, z + h / 2],
          [balcony.x1, z + h / 2],
        ],
        CLS.railing,
      ),
    );
  }

  // Mái: tường chắn mái (mái bằng) và/hoặc đường bao mái dốc.
  const parapet = elevation.parapet ?? 0;
  if (parapet > 0) parts.push(rect(top.x0, roofZ, top.x1, roofZ + parapet, CLS.elevationOutline));
  const outline = (elevation.roof_outline ?? []).map(([x = 0, z = 0]) => [x, z] as Pt);
  if (outline.length >= 2) parts.push(path(outline, CLS.elevationOutline, true));

  // Cổng và tường rào — đứng trước nhà, vẽ nét không tô.
  parts.push(...gateAndFence(concept, first, rect));

  // Ký hiệu cao độ bên phải hình.
  const marks = [...new Set([elevation.ground_z, ...levels.map((l) => l.z), roofZ, bbox.y1])];
  parts.push(...marks.map((z) => levelMark(z, bbox.x1, paper, style)));

  // Chuỗi kích thước: dọc bên trái theo cao độ, ngang dưới chân theo lỗ mở tầng 1.
  parts.push(chain(stations(marks), 'y', bbox, paper, style));
  const groundOpenings = concept.openings_front.filter((o) => o.level === first.level);
  parts.push(
    chain(
      stations([first.x0, first.x1, ...groundOpenings.flatMap((o) => [o.x, o.x + o.w])]),
      'x',
      bbox,
      paper,
      style,
    ),
  );

  return parts.join('');
}

export interface ElevationAnchorResult {
  svg: string;
  widthPx: number;
  heightPx: number;
  scale: number;
}

/**
 * Ảnh neo mặt đứng — phần hình, KHÔNG khung tên (cùng lý do với ảnh neo mặt bằng, T57): bảo đảm
 * bằng cấu trúc, hàm này không gọi `renderTitleBlock`. Đầu vào của ảnh có vật liệu (Đợt E) và về
 * sau là ảnh neo của bước Phối cảnh (T16).
 */
export function renderElevationAnchor(
  concept: AiFacadeConcept,
  options: ElevationOptions,
): ElevationAnchorResult {
  const base = elevationBounds(concept, options);
  const first = chooseLayout(base, options.style);
  // Chừa chỗ ký hiệu cao độ bên phải, như tờ A3.
  const bbox = { ...base, x1: base.x1 + levelMarkWidthMm(options.style) / mmPerCm(first.scale) };
  const { scale } = chooseLayout(bbox, options.style);
  const anchor = anchorPaper(bbox, scale, options.style);
  return {
    svg: anchorSvg(anchor, options.style, renderElevationBody(concept, anchor.paper, options)),
    widthPx: anchor.frame.widthPx,
    heightPx: anchor.frame.heightPx,
    scale,
  };
}

/**
 * Khung bao mặt đứng, cm: khối nhà, mái, mảng trang trí, và cốt đất. Lấy dư còn hơn thiếu — thiếu
 * vài centimet thì đỉnh mái chạm khung mà không có lỗi nào nổ ra.
 */
export function elevationBounds(concept: AiFacadeConcept, options: ElevationOptions): Rect {
  const e = concept.elevation;
  const points: Pt[] = [];
  for (const level of e.levels) {
    points.push([level.x0, level.z], [level.x1, level.z + level.h]);
  }
  const top = [...e.levels].sort((a, b) => a.level - b.level).at(-1);
  if (top) points.push([top.x0, top.z + top.h + (e.parapet ?? 0)]);
  for (const [x = 0, z = 0] of e.roof_outline ?? []) points.push([x, z]);
  for (const element of e.elements ?? []) {
    const [x0 = 0, z0 = 0, x1 = 0, z1 = 0] = element.rect;
    points.push([x0, z0], [x1, z1]);
  }
  for (const balcony of concept.balconies ?? []) {
    const z = e.levels.find((l) => l.level === balcony.level)?.z ?? 0;
    points.push([balcony.x0, z + options.railingHeightCm]);
  }
  points.push([points[0]?.[0] ?? 0, e.ground_z]);
  return bboxOfPoints(points);
}

/** Bề rộng dành cho ký hiệu cao độ bên phải hình, mm giấy — tam giác, gạch ngang và «+10.800». */
function levelMarkWidthMm(style: SheetStyle): number {
  return style.dim.first_offset_mm + style.text_mm.dim * 5;
}

/** Cao độ ghi bằng mét, ba chữ số thập phân, dấu chấm — đúng cách hồ sơ NVG ghi: ±0.000, +3.600. */
export function levelLabel(zCm: number): string {
  const metres = Math.abs(zCm) / 100;
  if (Math.round(zCm) === 0) return '±0.000';
  return `${zCm > 0 ? '+' : '-'}${metres.toFixed(3)}`;
}

function levelMark(z: number, x: number, paper: Paper, style: SheetStyle): string {
  const [px, py] = paper.p([x, z]);
  const gap = style.dim.first_offset_mm / 2;
  const t = style.dim.tick_mm;
  const x0 = px + gap;
  const tick = polylinePath(
    [
      [x0, py],
      [x0 + t * 5, py],
    ],
    false,
  );
  // Tam giác đỉnh chạm vạch cao độ — ký hiệu cao độ của bản vẽ xây dựng.
  const triangle = polylinePath(
    [
      [x0 + t, py],
      [x0 + t * 0.4, py - t],
      [x0 + t * 1.6, py - t],
    ],
    true,
  );
  return [
    tag('path', { class: CLS.levelMark, d: `${tick} ${triangle}` }),
    textEl(levelLabel(z), {
      x: x0 + t * 2,
      y: py - t - style.text_mm.dim * 0.6,
      class: CLS.textLevelMark,
    }),
  ].join('');
}

/** Trạm kích thước đã sắp, bỏ trùng, gộp trạm sát nhau. */
function stations(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || value - last > MIN_STATION_GAP_CM) out.push(value);
  }
  // Mép cuối phải là mép hình, kể cả khi một trạm sát nó vừa bị gộp mất — cùng lý do với
  // `dims.ts`. Thiếu dòng này thì cửa để xe cách mép phải 3 cm làm chuỗi tổng in ra 3.970 mm
  // trên một mặt tiền rộng 4.000 mm, và không chỗ nào báo sai.
  const max = sorted[sorted.length - 1];
  if (out.length > 0 && max !== undefined) out[out.length - 1] = max;
  return out;
}

type RectFn = (x0: number, z0: number, x1: number, z1: number, cls: string) => string;
type PathFn = (points: Pt[], cls: string, close?: boolean) => string;

/** Kiểu chia cánh của cửa đi: số cánh, xếp nhiều cánh hẹp, hoặc lùa (hai cánh chồng mép). */
export type DoorLeaves = number | 'folding' | 'sliding';
/** Kiểu cửa để xe theo danh mục — quyết định nét bên trong ô cửa. */
export type GarageStyle = 'cuon' | 'xep' | 'mo_quay' | 'truot';

export interface OpeningStyles {
  main: DoorLeaves | null;
  side: DoorLeaves | null;
  garage: string | null;
}

/** Số cánh của cửa xếp trên tờ vẽ — ký hiệu, không phải số cánh thật. */
const FOLDING_PANELS = 6;
/** Cửa lùa: hai cánh chồng mép, nét chia đặt lệch khỏi giữa để đọc ra là chồng chứ không phải khe. */
const SLIDING_SPLIT_SHARE = 0.55;

/**
 * Một lỗ mở: khung, rồi nét đặc trưng — đố cửa sổ, chia cánh cửa đi, nan cửa để xe.
 *
 * Kiểu cửa lấy từ phiếu yêu cầu (`openings_style`, T59 Đợt F2); chưa chọn thì theo quy tắc bề rộng như
 * trước: cửa đi từ `DOOR_TWO_LEAF_CM` vẽ hai cánh, cửa để xe vẽ nan cửa cuốn.
 */
function openingShape(
  opening: Opening,
  base: number,
  rect: RectFn,
  path: PathFn,
  leaves: DoorLeaves | null,
  garage: string | null,
): string[] {
  const { x, w, h } = opening;
  const out = [rect(x, base, x + w, base + h, CLS.opening)];
  const vertical = (at: number, cls: string) =>
    path(
      [
        [at, base],
        [at, base + h],
      ],
      cls,
    );
  const horizontal = (z: number, cls: string) =>
    path(
      [
        [x, z],
        [x + w, z],
      ],
      cls,
    );

  if (opening.kind === 'window') {
    // Cửa sổ rộng hai cánh: một đố đứng giữa. Hẹp thì một cánh.
    if (w >= WINDOW_TWO_LEAF_CM) out.push(vertical(x + w / 2, CLS.window));
    out.push(horizontal(base + h * WINDOW_TRANSOM_SHARE, CLS.window));
  } else if (opening.kind === 'garage') {
    if (garage === 'xep') {
      for (let i = 1; i < FOLDING_PANELS; i += 1) {
        out.push(vertical(x + (w * i) / FOLDING_PANELS, CLS.doorLeaf));
      }
    } else if (garage === 'mo_quay' || garage === 'truot') {
      out.push(vertical(x + w / 2, CLS.doorLeaf));
    } else {
      // Cửa cuốn (mặc định): nan ngang đều, số nan cố định để tờ nào cũng đọc ra cùng một ký hiệu.
      for (let i = 1; i < SHUTTER_BAYS; i += 1) {
        out.push(horizontal(base + (h * i) / SHUTTER_BAYS, CLS.doorLeaf));
      }
    }
  } else if (opening.kind === 'door') {
    const style: DoorLeaves = leaves ?? (w >= DOOR_TWO_LEAF_CM ? 2 : 1);
    if (style === 'sliding') {
      out.push(vertical(x + w * SLIDING_SPLIT_SHARE, CLS.doorLeaf));
    } else {
      const panels = style === 'folding' ? FOLDING_PANELS : style;
      for (let i = 1; i < panels; i += 1) {
        out.push(vertical(x + (w * i) / panels, CLS.doorLeaf));
      }
    }
  }
  return out;
}

/**
 * Cổng và tường rào ở mép cốt đất, trải theo bề rộng khối nhà tầng 1. Cổng canh giữa cửa để xe
 * (không có thì cửa đi rộng nhất tầng 1, không có nữa thì giữa nhà) — cổng mở cho lối vào thật.
 */
function gateAndFence(
  concept: AiFacadeConcept,
  first: AiFacadeConcept['elevation']['levels'][number],
  rect: RectFn,
): string[] {
  const out: string[] = [];
  const ground = concept.elevation.ground_z;
  const gate = concept.gate;
  let gateSpan: [number, number] | null = null;
  if (gate && gate.type !== 'none' && gate.w && gate.h) {
    const ground1 = concept.openings_front.filter((o) => o.level === first.level);
    const anchor =
      ground1.find((o) => o.kind === 'garage' || o.kind === 'gate') ??
      [...ground1].filter((o) => o.kind === 'door').sort((a, b) => b.w - a.w)[0];
    const centre = anchor ? anchor.x + anchor.w / 2 : (first.x0 + first.x1) / 2;
    // Chạm mép khối nhà thì dời vào trong, giữ đủ bề rộng cổng mô hình khai.
    const x0 = Math.max(first.x0, Math.min(centre - gate.w / 2, first.x1 - gate.w));
    gateSpan = [x0, Math.min(first.x1, x0 + gate.w)];
    out.push(rect(gateSpan[0], ground, gateSpan[1], ground + gate.h, CLS.frontFence));
  }
  const fence = concept.fence;
  if (fence && fence.h > 0) {
    const runs: Array<[number, number]> = gateSpan
      ? [
          [first.x0, gateSpan[0]],
          [gateSpan[1], first.x1],
        ]
      : [[first.x0, first.x1]];
    for (const [a, b] of runs) {
      if (b - a > 1) out.push(rect(a, ground, b, ground + fence.h, CLS.frontFence));
    }
  }
  return out;
}
