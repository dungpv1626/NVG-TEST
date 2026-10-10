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
 * ── Chi tiết như hồ sơ thật (T147, 10/10/2026) ─────────────────────────────────────────
 * Đối chiếu tờ KT07-08 của M5, tờ vẽ có thêm: dải dầm + phào ở mỗi sàn, tường chắn mái có phào
 * đỉnh, chân nhà và mảng ốp mang ký hiệu vật liệu, cửa vẽ đủ khung–cánh–kính xiên–tay nắm, lan can
 * trụ–nan, bậc tam cấp; và lớp chú thích: lưới trục (suy từ tường của mặt bằng), đường cốt chấm
 * gạch với ký hiệu cao độ HAI bên, ba hàng kích thước mỗi bên, chuỗi lỗ mở và chuỗi bậu/cửa trong
 * hình, ghi chú dẫn. Số cấu tạo đọc từ `kb/facade_detail.yaml`; chi tiết ở `elevation-parts.ts`.
 *
 * Vật liệu: T59 ghi vật liệu chỉ bằng chữ. T147 (Haan chọn) tô như bản vẽ thật — sơn tối tô xám,
 * đá/gạch/gỗ/ngói bằng nét ký hiệu — và vẫn ghi tên vật liệu bằng ghi chú dẫn. Tờ vẫn đen trắng.
 *
 * ── Thứ tự chồng lớp ───────────────────────────────────────────────────────────────────
 * đường cốt đất → mảng tô thân nhà → chân nhà → khối nhà → dải sàn → lỗ mở → phào bo cửa → phào sàn
 * → mảng trang trí → lan can → tường chắn mái, mái → bậc → cổng, rào → [chú thích: trục, đường cốt,
 * kích thước, ghi chú]. Lỗ mở che màu giấy (`CLS.mask`) nên đè được mảng tô; phào sàn vẽ SAU lỗ mở
 * để mép sàn đè lên chân cửa ban công như nhìn thật; lam đè lên cửa sổ là đúng hình thật.
 * Cổng và rào vẽ NÉT ĐỨT, không tô — chúng đứng trước nhà: tô đặc thì che mất tầng 1, còn nét liền
 * thì đọc thành một vạch ngang cắt qua cửa chính (thấy trên lượt chạy thật đầu tiên, 19/09/2026).
 *
 * Ảnh neo (`renderElevationAnchor`) KHÔNG mang lớp chú thích: nó rời hệ thống tới mô hình ảnh, và
 * mô hình ảnh không viết chữ (T59 Đợt E) — trục, số đo, ghi chú chỉ làm nhiễu.
 */

import type { AiFacadeConcept, AiFloorPlan } from '@nvg/shared/design';
import type { FacadeDetail } from '../../kb/facade-detail';
import type { FacadeVocabulary } from '../../kb/facade-vocabulary';
import { anchorPaper, anchorSvg } from './anchor';
import { bubbleBandMm, deriveAxes, renderAxisBubble } from './axes';
import { chainBandMm, chainRows, inFieldChain } from './dims';
import {
  cornice,
  doorShape,
  doorSurround,
  elementMaterial,
  elementShape,
  entryStepsShape,
  floorBand,
  garageShape,
  lookOf,
  materialFor,
  parapetShape,
  penFor,
  railingShape,
  surface,
  windowShape,
  type DoorLeaves,
  type FacadeMaterial,
  type Opening,
  type Pen,
} from './elevation-parts';
import { bboxOfPoints, type Pt, type Rect } from './geometry';
import { dedupeNotes, notesBandMm, renderLeaders, splitSides, type LeaderNote } from './leaders';
import { DrawNotes, type DrawNote } from './notes';
import {
  renderFooter,
  renderFrame,
  renderSheetTitle,
  renderTitleBlock,
  svgDocument,
} from './sheet';
import { mainDoorOf } from '../facade/frame';
import { CLS, polylinePath, tag, textEl } from './svg';
import type { Orientation, SheetStyle } from './style';
import { chooseLayout, paperFor, type DrawInsets, type Paper } from './units';

export type { DoorLeaves } from './elevation-parts';

export interface ElevationOptions {
  style: SheetStyle;
  /** Chi tiết cấu tạo — `kb/facade_detail.yaml` (T147). */
  detail: FacadeDetail;
  /** Danh mục mặt đứng — nhãn vật liệu, màu, lan can cho ghi chú dẫn. */
  vocab: FacadeVocabulary;
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
  /**
   * Mặt bằng mà ý tưởng dựng trên (`concept.plan_ref`) — nguồn của lưới trục và bậc tam cấp. Vắng
   * (mặt bằng đã xoá, phép thử cũ) thì tờ không có trục, không có bậc; không lỗi.
   */
  plan?: AiFloorPlan | null;
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
/** Đường cốt đất chạy quá khối nhà mỗi bên, phần của bề rộng hình. */
const GROUND_OVERRUN_SHARE = 0.04;
/** Số hàng kích thước mỗi bên: chi tiết, tầng, tổng — như hồ sơ M5. */
const HEIGHT_ROWS = 3;
/** Hai hàng kích thước dưới chân: trục (hoặc lỗ mở tầng 1 khi không có trục), tổng. */
const WIDTH_ROWS = 2;

type Level = AiFacadeConcept['elevation']['levels'][number];

export function renderElevationSheet(
  concept: AiFacadeConcept,
  options: ElevationOptions,
): ElevationSheetResult {
  const { style } = options;
  const notes = new DrawNotes();
  const bbox = elevationBounds(concept, options);
  const insets = annotationInsets(concept, options, bbox);

  const { orientation, scale, area, fits } = chooseLayout(bbox, style, insets);
  if (!fits) {
    notes.add(
      'scale_overflow',
      `Mặt đứng rộng hoặc cao hơn khổ giấy A3 ở mọi tỷ lệ đã khai — đã vẽ ở tỷ lệ 1:${scale} và hình có thể chạm mép khung.`,
    );
  }
  const paper = paperFor(bbox, area, scale);

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

/** Bối cảnh chung của một lượt vẽ — tính một lần, các bước vẽ và chú thích cùng đọc. */
interface Ctx {
  concept: AiFacadeConcept;
  options: ElevationOptions;
  detail: FacadeDetail;
  levels: Level[];
  first: Level;
  top: Level;
  roofZ: number;
  levelZ: Map<number, number>;
  flatRoof: boolean;
  parapet: number;
  /** Khung bao khối nhà (không kể phào đua), cm. */
  xMin: number;
  xMax: number;
}

function contextOf(concept: AiFacadeConcept, options: ElevationOptions): Ctx {
  const levels = [...concept.elevation.levels].sort((a, b) => a.level - b.level);
  const first = levels[0];
  if (!first) throw new ElevationSheetError('Mặt đứng không có tầng nào.');
  const top = levels[levels.length - 1] ?? first;
  const outline = concept.elevation.roof_outline ?? [];
  return {
    concept,
    options,
    detail: options.detail,
    levels,
    first,
    top,
    roofZ: top.z + top.h,
    levelZ: new Map(levels.map((l) => [l.level, l.z])),
    flatRoof: outline.length < 2,
    parapet: concept.elevation.parapet ?? 0,
    xMin: Math.min(...levels.map((l) => l.x0)),
    xMax: Math.max(...levels.map((l) => l.x1)),
  };
}

/** Phào mặc định ở cao độ `z` bị THAY khi mô hình đã đặt phào riêng chạm dải ấy. */
function modelCorniceAt(ctx: Ctx, z: number): boolean {
  const h = ctx.detail.floorBand.corniceHCm;
  return (ctx.concept.elevation.elements ?? []).some((e) => {
    const [, z0 = 0, , z1 = 0] = e.rect;
    return e.kind === 'cornice' && z1 >= z - h && z0 <= z + h * 2;
  });
}

/** Cao độ các sàn có dải dầm + phào: mọi sàn trên tầng 1, và sàn mái. */
function slabLevels(ctx: Ctx): Array<{ z: number; x0: number; x1: number; cornice: boolean }> {
  if (!ctx.detail.floorBand.enabled) return [];
  const out: Array<{ z: number; x0: number; x1: number; cornice: boolean }> = [];
  for (let i = 1; i < ctx.levels.length; i += 1) {
    const below = ctx.levels[i - 1]!;
    const level = ctx.levels[i]!;
    out.push({
      z: level.z,
      x0: below.x0,
      x1: below.x1,
      cornice: !modelCorniceAt(ctx, level.z),
    });
  }
  // Sàn mái: mái dốc thì mép mái đua đã là đường ngang ấy — không thêm phào.
  out.push({
    z: ctx.roofZ,
    x0: ctx.top.x0,
    x1: ctx.top.x1,
    cornice: ctx.flatRoof && !modelCorniceAt(ctx, ctx.roofZ),
  });
  return out;
}

/** Cao độ đáy của lỗ mở trong hệ cao độ chung. */
function baseOf(ctx: Ctx, o: Opening): number {
  return (ctx.levelZ.get(o.level) ?? 0) + o.sill;
}

/**
 * Phần HÌNH của mặt đứng — không khung, không khung tên. Tờ SVG, ảnh neo và tệp DXF cùng gọi hàm
 * này với ba bộ đổi toạ độ khác nhau: một nguồn hình học (CLAUDE.md 8.2 điểm 5). `annotate = false`
 * bỏ lớp chú thích (ảnh neo).
 */
export function renderElevationBody(
  concept: AiFacadeConcept,
  paper: Paper,
  options: ElevationOptions,
  annotate = true,
): string {
  const ctx = contextOf(concept, options);
  const { detail, vocab } = options;
  const elevation = concept.elevation;
  const pen = penFor(paper);
  const bbox = elevationBounds(concept, options);
  const parts: string[] = [];

  // Đường cốt đất — chạy quá khối nhà hai bên, như hồ sơ giấy.
  const groundOverrun = (bbox.x1 - bbox.x0) * GROUND_OVERRUN_SHARE;
  parts.push(
    pen.path(
      [
        [bbox.x0 - groundOverrun, elevation.ground_z],
        [bbox.x1 + groundOverrun, elevation.ground_z],
      ],
      CLS.ground,
    ),
  );

  // Thân nhà sơn tối thì tô cả mảng tường; lỗ mở che lại bằng màu giấy.
  const bodyLook = lookOf(materialFor(concept, ['body']), detail, vocab);
  if (bodyLook.grey) {
    for (const level of ctx.levels) {
      parts.push(
        surface(rectPoly(level.x0, level.z, level.x1, level.z + level.h), bodyLook, pen, detail),
      );
    }
  }

  // Chân nhà: cốt đất → ±0.000, ký hiệu theo vật liệu phần đế.
  const plinthLook = lookOf(materialFor(concept, detail.plinth.materialFrom), detail, vocab);
  parts.push(
    surface(rectPoly(ctx.first.x0, elevation.ground_z, ctx.first.x1, 0), plinthLook, pen, detail),
  );

  // Khối nhà: phần đế rồi từng tầng.
  parts.push(pen.rect(ctx.first.x0, elevation.ground_z, ctx.first.x1, 0, CLS.elevationOutline));
  for (const level of ctx.levels) {
    parts.push(pen.rect(level.x0, level.z, level.x1, level.z + level.h, CLS.elevationOutline));
  }

  // Dải dầm dưới mỗi sàn (phào vẽ sau lỗ mở).
  const trimLook = lookOf(materialFor(concept, ['trim']), detail, vocab);
  const slabs = slabLevels(ctx);
  const tops = concept.openings_front.map((o) => ({
    x: o.x,
    w: o.w,
    base: baseOf(ctx, o),
    top: baseOf(ctx, o) + o.h,
  }));
  for (const slab of slabs) {
    parts.push(floorBand(slab.z, slab.x0, slab.x1, tops, false, trimLook, pen, detail));
  }

  // Lỗ mở — KHOÁ, chép từ mặt bằng.
  const mainDoor = mainDoorOf(concept.openings_front);
  const doorLook = (zone: string) => {
    const m = materialFor(concept, [zone]);
    return m && detail.door.solidMaterials.includes(m.material)
      ? lookOf({ material: m.material, colour: m.colour }, detail, vocab)
      : null;
  };
  for (const opening of concept.openings_front) {
    const base = baseOf(ctx, opening);
    if (opening.kind === 'window') parts.push(windowShape(opening, base, pen, detail));
    else if (opening.kind === 'garage') {
      parts.push(garageShape(opening, base, options.openingStyles?.garage ?? null, pen, detail));
    } else {
      const isMain = opening === mainDoor;
      const leaves =
        opening.kind !== 'door'
          ? null
          : isMain
            ? (options.openingStyles?.main ?? null)
            : (options.openingStyles?.side ?? null);
      parts.push(
        doorShape(opening, base, leaves, doorLook(isMain ? 'main_door' : 'side_door'), pen, detail),
      );
      if (isMain && detail.door.surroundMainDoor) {
        parts.push(doorSurround(opening, base, pen, detail));
      }
    }
  }

  // Phào sàn — đè lên chân cửa ban công như nhìn thật.
  for (const slab of slabs) {
    if (!slab.cornice) continue;
    const fb = detail.floorBand;
    parts.push(
      cornice(
        slab.z,
        slab.z + fb.corniceHCm,
        slab.x0,
        slab.x1,
        fb.corniceProjectionCm,
        trimLook,
        pen,
        detail,
      ),
    );
  }

  // Mảng trang trí — vẽ thành chi tiết theo loại.
  for (const element of elevation.elements ?? []) {
    parts.push(
      elementShape(element, lookOf(elementMaterial(concept, element), detail, vocab), pen, detail),
    );
  }

  // Lan can ban công.
  for (const balcony of concept.balconies ?? []) {
    const z = ctx.levelZ.get(balcony.level) ?? 0;
    parts.push(railingShape(balcony, z, options.railingHeightCm, pen, detail));
  }

  // Mái: tường chắn mái (mái bằng) và/hoặc đường bao mái dốc có ký hiệu ngói.
  const parapetZ0 = ctx.roofZ + (slabs.at(-1)?.cornice ? detail.floorBand.corniceHCm : 0);
  if (ctx.parapet > 0 && ctx.roofZ + ctx.parapet > parapetZ0) {
    const look = lookOf(materialFor(concept, detail.parapet.materialFrom), detail, vocab);
    parts.push(
      parapetShape(ctx.top.x0, ctx.top.x1, parapetZ0, ctx.roofZ + ctx.parapet, look, pen, detail),
    );
  }
  const outline = (elevation.roof_outline ?? []).map(([x = 0, z = 0]) => [x, z] as Pt);
  if (outline.length >= 3) {
    const roofLook = lookOf(
      { material: concept.roof.material, colour: concept.roof.colour },
      detail,
      vocab,
    );
    parts.push(surface(outline, roofLook, pen, detail));
  }
  if (outline.length >= 2) parts.push(pen.path(outline, CLS.elevationOutline, true));

  // Bậc tam cấp ngoài cửa chính — chỉ khi mặt bằng có (T70).
  for (const step of options.plan?.levels.find((l) => l.level === ctx.first.level)?.entry_steps ??
    []) {
    parts.push(entryStepsShape(step, elevation.ground_z, pen));
  }

  // Cổng và tường rào — đứng trước nhà, vẽ nét không tô.
  parts.push(...gateAndFence(concept, ctx.first, pen.rect));

  if (annotate) parts.push(annotations(ctx, paper, bbox));
  return parts.join('');
}

const rectPoly = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

// ── Chú thích ──────────────────────────────────────────────────────────────────────────

/** Đỉnh hình: đỉnh tường chắn mái hoặc nóc mái. */
function topZ(ctx: Ctx, bbox: Rect): number {
  return Math.max(ctx.roofZ + ctx.parapet, bbox.y1);
}

/** Ba hàng kích thước đứng: chi tiết (dải, phào, tường chắn), tầng, tổng. */
function heightRows(ctx: Ctx, bbox: Rect): number[][] {
  const g = ctx.concept.elevation.ground_z;
  const fb = ctx.detail.floorBand;
  const top = topZ(ctx, bbox);
  const fine: number[] = [g, 0];
  for (const slab of slabLevels(ctx)) {
    fine.push(slab.z - fb.bandCm, slab.z);
    if (slab.cornice) fine.push(slab.z + fb.corniceHCm);
  }
  if (!fb.enabled) fine.push(...ctx.levels.map((l) => l.z), ctx.roofZ);
  if (ctx.parapet > 0) fine.push(ctx.roofZ + ctx.parapet - ctx.detail.parapet.copingHCm);
  fine.push(top);
  return [stations(fine), stations([g, ...ctx.levels.map((l) => l.z), ctx.roofZ, top]), [g, top]];
}

/** Ghi chú dẫn — sinh tất định từ kb và vật liệu đã chọn. */
function leaderNotes(ctx: Ctx): LeaderNote[] {
  const { concept, detail, options } = ctx;
  const vocab = options.vocab;
  const fb = detail.floorBand;
  // «màu trắng kem»; nhãn đã mở đầu bằng «màu» («Màu tự nhiên của vật liệu») thì không thêm lần nữa.
  const colour = (code: string) => {
    const label = (vocab.colours[code]?.label_vi ?? code).toLocaleLowerCase('vi-VN');
    return label.startsWith('màu ') ? label : `màu ${label}`;
  };
  const materialText = (m: Pick<FacadeMaterial, 'material' | 'colour'>) =>
    `${vocab.materials[m.material]?.label_vi ?? vocab.roofMaterials[m.material]?.label_vi ?? m.material} ${colour(m.colour)}`;
  const notes: LeaderNote[] = [];

  // Phào sàn, mang màu của vùng `trim` nếu có.
  const firstCornice = slabLevels(ctx).find((s) => s.cornice);
  if (firstCornice) {
    const trim = materialFor(concept, ['trim']);
    notes.push({
      text: trim ? `${fb.corniceNote} ${colour(trim.colour)}` : fb.corniceNote,
      anchor: [firstCornice.x1 + fb.corniceProjectionCm / 2, firstCornice.z + fb.corniceHCm / 2],
    });
  }
  // Tường chắn mái và phào đỉnh.
  if (ctx.parapet > 0) {
    const top = ctx.roofZ + ctx.parapet;
    notes.push({
      text: detail.parapet.copingNote,
      anchor: [ctx.top.x1, top - detail.parapet.copingHCm / 2],
    });
    const m = materialFor(concept, detail.parapet.materialFrom);
    if (m)
      notes.push({
        text: materialText(m),
        anchor: [ctx.top.x0 + (ctx.top.x1 - ctx.top.x0) * 0.1, ctx.roofZ + ctx.parapet / 2],
      });
  }
  // Thân nhà: chỉ vào khoảng tường trống rộng nhất của tầng cao nhất còn tường trống.
  const body = materialFor(concept, ['body']);
  if (body) {
    const spot = wallSpot(ctx);
    if (spot) notes.push({ text: materialText(body), anchor: spot });
  }
  // Phần đế.
  const base = materialFor(concept, detail.plinth.materialFrom);
  if (base) {
    notes.push({
      text: materialText(base),
      anchor: [ctx.first.x0 + (ctx.first.x1 - ctx.first.x0) * 0.1, concept.elevation.ground_z / 2],
    });
  }
  // Phào bo cửa chính.
  const main = mainDoorOf(concept.openings_front);
  if (main && detail.door.surroundMainDoor) {
    notes.push({
      text: detail.door.surroundNote,
      anchor: [main.x + main.w + detail.door.surroundCm / 2, baseOf(ctx, main) + main.h / 2],
    });
  }
  // Mảng trang trí.
  for (const element of concept.elevation.elements ?? []) {
    const [x0 = 0, z0 = 0, x1 = 0, z1 = 0] = element.rect;
    const label = vocab.elements[element.kind] ?? element.kind;
    const anchor: Pt = [(x0 + x1) / 2, (z0 + z1) / 2];
    if (element.kind === 'reveal') {
      notes.push({ text: detail.elements.reveal.note, anchor });
      continue;
    }
    const ref = element.material_ref;
    const m = ref !== null && ref !== undefined ? concept.materials[ref] : undefined;
    notes.push({ text: m ? `${label}: ${materialText(m)}` : label, anchor });
  }
  // Lan can — một ghi chú mỗi kiểu.
  for (const balcony of concept.balconies ?? []) {
    const z = ctx.levelZ.get(balcony.level) ?? 0;
    const label = balcony.railing ? vocab.railings[balcony.railing]?.label_vi : undefined;
    notes.push({
      text: label ?? 'Lan can',
      anchor: [balcony.x0 + (balcony.x1 - balcony.x0) * 0.2, z + options.railingHeightCm / 2],
    });
  }
  // Mái dốc.
  const outline = concept.elevation.roof_outline ?? [];
  if (outline.length >= 3) {
    const xs = outline.map((p) => p[0] ?? 0);
    const zs = outline.map((p) => p[1] ?? 0);
    notes.push({
      text: materialText({ material: concept.roof.material, colour: concept.roof.colour }),
      anchor: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2],
    });
  }
  return dedupeNotes(notes);
}

/** Một điểm trên mảng tường trống: khe rộng nhất giữa các lỗ mở, tầng cao nhất có khe đủ rộng. */
function wallSpot(ctx: Ctx): Pt | null {
  for (const level of [...ctx.levels].reverse()) {
    // Khe phải đủ rộng để nét dẫn chỉ rõ vào tường chứ không vào mép cửa.
    const minGap = (level.x1 - level.x0) / 12;
    const holes = [
      ...ctx.concept.openings_front
        .filter((o) => o.level === level.level)
        .map((o) => [o.x, o.x + o.w]),
      ...(ctx.concept.elevation.elements ?? [])
        .filter((e) => (e.rect[1] ?? 0) < level.z + level.h && (e.rect[3] ?? 0) > level.z)
        .map((e) => [e.rect[0] ?? 0, e.rect[2] ?? 0]),
    ].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
    let best: [number, number] | null = null;
    let from = level.x0;
    for (const [a = 0, b = 0] of [...holes, [level.x1, level.x1]]) {
      if (a - from > (best ? best[1] - best[0] : minGap)) best = [from, a];
      from = Math.max(from, b);
    }
    if (best) return [(best[0] + best[1]) / 2, level.z + level.h * 0.55];
  }
  return null;
}

/** Bề rộng ký hiệu cao độ (tam giác, vạch, «+10.800»), mm giấy. */
function levelMarkWidthMm(style: SheetStyle): number {
  return style.dim.first_offset_mm + style.text_mm.dim * 5;
}

/** Dải chú thích quanh hình, mm giấy — để `chooseLayout` chừa đúng chỗ. */
function annotationInsets(
  concept: AiFacadeConcept,
  options: ElevationOptions,
  bbox: Rect,
): DrawInsets {
  const ctx = contextOf(concept, options);
  const { style, detail } = options;
  const sides = splitSides(leaderNotes(ctx), bbox);
  const rows = chainBandMm(HEIGHT_ROWS, style);
  const mark = levelMarkWidthMm(style);
  const hasAxes = axesOf(ctx).length >= 2;
  return {
    left: notesBandMm(sides.left.length, detail) + rows + mark,
    right: notesBandMm(sides.right.length, detail) + rows + mark,
    bottom:
      chainBandMm(WIDTH_ROWS, style) + style.text_mm.dim + (hasAxes ? bubbleBandMm(detail) : 0),
  };
}

function axesOf(ctx: Ctx): Array<{ label: string; at: number }> {
  const plan = ctx.options.plan;
  if (!plan) return [];
  return deriveAxes(plan, ctx.detail).x.filter((a) => a.at >= ctx.xMin - 1 && a.at <= ctx.xMax + 1);
}

function annotations(ctx: Ctx, paper: Paper, bbox: Rect): string {
  const { concept, options, detail } = ctx;
  const { style } = options;
  const out: string[] = [];
  const ground = concept.elevation.ground_z;
  const top = topZ(ctx, bbox);
  const notes = leaderNotes(ctx);
  const sides = splitSides(notes, bbox);
  const leftBand = notesBandMm(sides.left.length, detail);
  const rightBand = notesBandMm(sides.right.length, detail);
  const rows = chainBandMm(HEIGHT_ROWS, style);

  // Đường cốt chấm gạch kéo ngang tờ, ký hiệu cao độ hai bên.
  const leftMarkX = paper.x(bbox.x0) - leftBand - rows;
  const rightMarkX = paper.x(bbox.x1) + rightBand + rows;
  const marks = [...new Set([ground, ...ctx.levels.map((l) => l.z), ctx.roofZ, top])];
  const levelLines = marks.map((z) => {
    const y = paper.y(z);
    return polylinePath(
      [
        [leftMarkX - levelMarkWidthMm(style) + style.dim.first_offset_mm / 2, y],
        [rightMarkX + levelMarkWidthMm(style) - style.dim.first_offset_mm / 2, y],
      ],
      false,
    );
  });
  out.push(tag('path', { class: CLS.levelLine, d: levelLines.join(' ') }));
  for (const z of marks) {
    out.push(levelMark(z, leftMarkX, 'left', paper, style));
    out.push(levelMark(z, rightMarkX, 'right', paper, style));
  }

  // Lưới trục: nét chấm gạch từ trên đỉnh xuống bóng tròn dưới chân.
  const axes = axesOf(ctx);
  const widthRowsBand = chainBandMm(WIDTH_ROWS, style);
  if (axes.length >= 2) {
    const bubbleY =
      paper.y(ground) +
      widthRowsBand +
      style.text_mm.dim +
      detail.annotation.bubbleGap +
      detail.annotation.bubbleD / 2;
    const lines = axes.map((a) =>
      polylinePath(
        [
          [paper.x(a.at), paper.y(top) - detail.annotation.axisOverrun],
          [paper.x(a.at), bubbleY - detail.annotation.bubbleD / 2],
        ],
        false,
      ),
    );
    out.push(tag('path', { class: CLS.axis, d: lines.join(' ') }));
    for (const a of axes) out.push(renderAxisBubble(paper.x(a.at), bubbleY, a.label, detail));
  }

  // Kích thước đứng hai bên, ba hàng — chừa cột ghi chú giữa hình và hàng đầu.
  const hRows = heightRows(ctx, bbox);
  out.push(chainRows(hRows, 'y', bbox, paper, style, { extraOffsetMm: leftBand }));
  out.push(chainRows(hRows, 'y', bbox, paper, style, { side: 'high', extraOffsetMm: rightBand }));

  // Kích thước ngang dưới chân: trục (hoặc lỗ mở tầng 1), tổng.
  const firstRow =
    axes.length >= 2
      ? stations([ctx.xMin, ...axes.map((a) => a.at), ctx.xMax])
      : stations([
          ctx.first.x0,
          ctx.first.x1,
          ...concept.openings_front
            .filter((o) => o.level === ctx.first.level)
            .flatMap((o) => [o.x, o.x + o.w]),
        ]);
  out.push(chainRows([firstRow, [ctx.xMin, ctx.xMax]], 'x', { ...bbox, y0: ground }, paper, style));

  // Trong hình: chuỗi lỗ mở từng tầng, chuỗi bậu/cửa ở cửa sổ đầu tiên mỗi tầng.
  const fb = detail.floorBand;
  for (const [index, level] of ctx.levels.entries()) {
    const own = concept.openings_front.filter((o) => o.level === level.level);
    if (own.length === 0) continue;
    const stops = stations([level.x0, level.x1, ...own.flatMap((o) => [o.x, o.x + o.w])]);
    // Tầng có ban công: chuỗi đặt TRÊN đỉnh lỗ mở (M5 tầng 2: +2.823 trên sàn) — đặt thấp thì số
    // đè lên nan lan can. Tầng khác: thấp, dưới bậu cửa sổ (M5 tầng 1: +548).
    const balcony = (concept.balconies ?? []).some((b) => b.level === level.level);
    const head = Math.max(...own.map((o) => o.sill + o.h));
    const chainZ = balcony
      ? level.z + Math.min(head + detail.annotation.openingChainZCm / 3, level.h - fb.bandCm)
      : level.z + detail.annotation.openingChainZCm;
    out.push(inFieldChain(stops, 'x', chainZ, paper, style, -1));
    const window = own.filter((o) => o.kind === 'window').sort((a, b) => a.x - b.x)[0];
    if (window) {
      const next = ctx.levels[index + 1]?.z ?? ctx.roofZ;
      const ceiling = fb.enabled ? next - fb.bandCm : next;
      const base = baseOf(ctx, window);
      out.push(
        inFieldChain(
          stations([level.z, base, base + window.h, ceiling]),
          'y',
          window.x,
          paper,
          style,
          -1,
          -detail.annotation.windowChainOffset,
        ),
      );
    }
  }

  // Ghi chú dẫn, hai cột.
  const yRange: [number, number] = [paper.y(top), paper.y(ground)];
  out.push(renderLeaders(sides.left, 'left', paper.x(bbox.x0), yRange, paper, style, detail));
  out.push(renderLeaders(sides.right, 'right', paper.x(bbox.x1), yRange, paper, style, detail));
  return out.join('');
}

export interface ElevationAnchorResult {
  svg: string;
  widthPx: number;
  heightPx: number;
  scale: number;
}

/**
 * Ảnh neo mặt đứng — phần hình, KHÔNG khung tên (cùng lý do với ảnh neo mặt bằng, T57) và không lớp
 * chú thích (T147): bảo đảm bằng cấu trúc, hàm này không gọi `renderTitleBlock` và gọi thân hình
 * với `annotate = false`. Đầu vào của ảnh có vật liệu (Đợt E) và ảnh neo của bước Phối cảnh (T16).
 */
export function renderElevationAnchor(
  concept: AiFacadeConcept,
  options: ElevationOptions,
): ElevationAnchorResult {
  // Không đọc mặt bằng: máy chủ dựng LẠI ảnh neo để đối chiếu cỡ khung với tệp trình duyệt gửi lên
  // (`facade-routes.ts`, `perspective-routes.ts`) — một nơi có mặt bằng, một nơi không thì hai
  // khung lệch nhau và lượt ảnh bị từ chối. Bậc tam cấp là chi tiết nhỏ, ảnh neo bỏ được.
  const own: ElevationOptions = { ...options, plan: null };
  const bbox = elevationBounds(concept, own);
  const { scale } = chooseLayout(bbox, options.style);
  const anchor = anchorPaper(bbox, scale, options.style);
  return {
    svg: anchorSvg(anchor, options.style, renderElevationBody(concept, anchor.paper, own, false)),
    widthPx: anchor.frame.widthPx,
    heightPx: anchor.frame.heightPx,
    scale,
  };
}

/**
 * Khung bao mặt đứng, cm: khối nhà, phào đua, mái, mảng trang trí, bậc, và cốt đất. Lấy dư còn hơn
 * thiếu — thiếu vài centimet thì đỉnh mái chạm khung mà không có lỗi nào nổ ra.
 */
export function elevationBounds(concept: AiFacadeConcept, options: ElevationOptions): Rect {
  const e = concept.elevation;
  const fb = options.detail.floorBand;
  const projection = Math.max(
    fb.enabled ? fb.corniceProjectionCm : 0,
    (e.parapet ?? 0) > 0 ? options.detail.parapet.copingProjectionCm : 0,
  );
  const points: Pt[] = [];
  for (const level of e.levels) {
    points.push([level.x0 - projection, level.z], [level.x1 + projection, level.z + level.h]);
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
  const first = [...e.levels].sort((a, b) => a.level - b.level)[0];
  for (const step of options.plan?.levels.find((l) => l.level === first?.level)?.entry_steps ??
    []) {
    points.push([step.rect[0] ?? 0, e.ground_z], [step.rect[2] ?? 0, 0]);
  }
  points.push([points[0]?.[0] ?? 0, e.ground_z]);
  return bboxOfPoints(points);
}

/** Cao độ ghi bằng mét, ba chữ số thập phân, dấu chấm — đúng cách hồ sơ NVG ghi: ±0.000, +3.600. */
export function levelLabel(zCm: number): string {
  const metres = Math.abs(zCm) / 100;
  if (Math.round(zCm) === 0) return '±0.000';
  return `${zCm > 0 ? '+' : '-'}${metres.toFixed(3)}`;
}

/**
 * Ký hiệu cao độ ở toạ độ giấy `x` (mép trong của ký hiệu): vạch ngang đi RA XA hình, tam giác đỉnh
 * chạm vạch, số cao độ trên vạch. Bên trái là ảnh gương của bên phải — hồ sơ M5 đặt cả hai bên.
 */
function levelMark(
  z: number,
  x: number,
  side: 'left' | 'right',
  paper: Paper,
  style: SheetStyle,
): string {
  const py = paper.y(z);
  const s = side === 'right' ? 1 : -1;
  const gap = style.dim.first_offset_mm / 2;
  const t = style.dim.tick_mm;
  const x0 = x + s * gap;
  const tick = polylinePath(
    [
      [x0, py],
      [x0 + s * t * 5, py],
    ],
    false,
  );
  const triangle = polylinePath(
    [
      [x0 + s * t, py],
      [x0 + s * t * 0.4, py - t],
      [x0 + s * t * 1.6, py - t],
    ],
    true,
  );
  return [
    tag('path', { class: CLS.levelMark, d: `${tick} ${triangle}` }),
    textEl(levelLabel(z), {
      x: side === 'right' ? x0 + t * 2 : x0 - t * 5,
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

/** Kiểu cửa để xe theo danh mục — quyết định nét bên trong ô cửa. */
export type GarageStyle = 'cuon' | 'xep' | 'mo_quay' | 'truot';

export interface OpeningStyles {
  main: DoorLeaves | null;
  side: DoorLeaves | null;
  garage: string | null;
}

/**
 * Cổng và tường rào ở mép cốt đất, trải theo bề rộng khối nhà tầng 1. Cổng canh giữa cửa để xe
 * (không có thì cửa đi rộng nhất tầng 1, không có nữa thì giữa nhà) — cổng mở cho lối vào thật.
 */
function gateAndFence(
  concept: AiFacadeConcept,
  first: AiFacadeConcept['elevation']['levels'][number],
  rect: Pen['rect'],
): string[] {
  const out: string[] = [];
  const ground = concept.elevation.ground_z;
  const gate = concept.gate;
  /**
   * Lối vào trên mặt tiền tầng dưới cùng: cửa chính và cửa để xe.
   *
   * Hàng rào KHÔNG được cắt ngang bất kỳ cái nào (T64, 20/09/2026). Trước đó bộ vẽ chỉ chừa chỗ
   * cho CỔNG, nên nhà có cả cửa chính lẫn cửa để xe thì cổng đứng trước một cái và rào bịt kín cái
   * còn lại — hai tờ vẽ của cùng một ngôi nhà nói ngược nhau, và Haan bắt được trên ảnh phối cảnh.
   */
  const entrances = concept.openings_front
    .filter((o) => o.level === first.level && (o.kind === 'door' || o.kind === 'garage'))
    .map((o) => [o.x, o.x + o.w] as [number, number]);

  let gateSpan: [number, number] | null = null;
  if (gate && gate.type !== 'none' && gate.w && gate.h) {
    const ground1 = concept.openings_front.filter((o) => o.level === first.level);
    const anchor =
      ground1.find((o) => o.kind === 'garage' || o.kind === 'gate') ??
      [...ground1].filter((o) => o.kind === 'door').sort((a, b) => b.w - a.w)[0];
    const centre = anchor ? anchor.x + anchor.w / 2 : (first.x0 + first.x1) / 2;
    // Cổng phải phủ HẾT lối vào nó đứng trước — cổng hẹp hơn cửa để xe thì xe không lọt. Phép kiểm
    // đã bắt chỗ này, nhưng bộ vẽ vẫn nới cho khớp: toạ độ là việc của chương trình (T15).
    const width = Math.max(gate.w, anchor ? anchor.w : 0);
    const x0 = Math.max(first.x0, Math.min(centre - width / 2, first.x1 - width));
    gateSpan = [x0, Math.min(first.x1, x0 + width)];
    out.push(rect(gateSpan[0], ground, gateSpan[1], ground + gate.h, CLS.frontFence));
  }
  const fence = concept.fence;
  if (fence && fence.h > 0) {
    // Trừ dần: bắt đầu bằng cả bề ngang, khoét chỗ của cổng rồi khoét chỗ của từng lối vào còn lại.
    let runs: Array<[number, number]> = [[first.x0, first.x1]];
    for (const [ha, hb] of [...(gateSpan ? [gateSpan] : []), ...entrances]) {
      runs = runs.flatMap(([a, b]) =>
        hb <= a || ha >= b
          ? [[a, b] as [number, number]]
          : ([
              ...(ha > a ? [[a, ha] as [number, number]] : []),
              ...(hb < b ? [[hb, b] as [number, number]] : []),
            ] as Array<[number, number]>),
      );
    }
    for (const [a, b] of runs) {
      if (b - a > 1) out.push(rect(a, ground, b, ground + fence.h, CLS.frontFence));
    }
  }
  return out;
}
