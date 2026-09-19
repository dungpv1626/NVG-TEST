/**
 * Ghép một tờ mặt bằng hoàn chỉnh cho MỘT tầng.
 *
 * Hàm THUẦN: nhận dữ liệu mặt bằng + quy ước trình bày + bảng nhãn phòng, trả chuỗi SVG. Không
 * đọc tệp, không đọc CSDL, không gọi mạng — nhờ vậy snapshot vàng trong `ai-draw.test.ts` mới
 * là bằng chứng có ý nghĩa, và một lần đổi cỡ chữ trong `kb/sheet_style.yaml` hiện ra thành
 * đúng một khác biệt đọc được trong snapshot.
 *
 * Thứ tự chồng lớp có chủ đích: ô thông tầng → tường → lỗ mở → thang → chữ trong phòng →
 * chuỗi kích thước → mũi tên bắc. Vẽ chữ trước tường thì tường tô đặc sẽ đè mất tên phòng.
 */

import type { AiFloorPlan, AiFloorPlanLevel } from '@nvg/shared/design';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { bboxOfPoints, toPt, toRect, type Pt, type Rect } from './geometry';
import { DrawNotes, type DrawNote } from './notes';
import { doorSwingZones, renderOpenings } from './openings';
import { renderRoomLabels } from './rooms';
import { renderDimensions } from './dims';
import {
  renderFooter,
  renderFrame,
  renderSheetTitle,
  renderTitleBlock,
  svgDocument,
} from './sheet';
import { renderStairs, stairTreadZones } from './stairs';
import { renderNorthArrow } from './symbols';
import { CLS, polylinePath, tag } from './svg';
import type { Orientation, SheetStyle } from './style';
import { chooseLayout, paperFor, type Paper } from './units';
import { prepareWalls, renderWalls } from './walls';

export class PlanSheetError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'PlanSheetError';
  }
}

export interface PlanSheetOptions {
  style: SheetStyle;
  /** Nhãn tiếng Việt của mã phòng — `roomLabels()` từ `kb/room_vocabulary.yaml`. */
  labels: Record<string, string>;
}

export interface PlanSheetResult {
  svg: string;
  /** Tỷ lệ đã dùng: 100 nghĩa là 1:100. */
  scale: number;
  /** Hướng đặt giấy đã chọn — tờ dọc hay tờ ngang. */
  orientation: Orientation;
  /** Những chỗ bộ vẽ đã tự xử lý — màn hình phải nói ra. */
  notes: DrawNote[];
}

/** Ghi chú in ở dải tiêu đề: gộp làm MỘT dòng, vì dải chỉ đủ chỗ cho hai dòng. */
function sheetNotes(plan: AiFloorPlan, level: AiFloorPlanLevel): string[] {
  const parts: string[] = [];
  if (plan.generator.walls_derived) parts.push(AI_DISCLAIMERS.wallsDerived);
  if (level.rooms.some((room) => (room.parts ?? []).length > 1)) {
    parts.push(AI_DISCLAIMERS.openSpaceParts);
  }
  return parts.length ? [parts.join(' · ')] : [];
}

export function renderPlanSheet(
  plan: AiFloorPlan,
  levelNumber: number,
  options: PlanSheetOptions,
): PlanSheetResult {
  const level = plan.levels.find((item) => item.level === levelNumber);
  if (!level) {
    throw new PlanSheetError(`Phương án này không có tầng ${levelNumber}.`);
  }

  const { style } = options;
  const notes = new DrawNotes();
  const bbox = levelBounds(level);
  const { orientation, scale, area, fits } = chooseLayout(bbox, style);
  if (!fits) {
    notes.add(
      'scale_overflow',
      `Tầng "${level.name}" rộng hơn khổ giấy A3 ở mọi tỷ lệ và hướng giấy đã khai — đã vẽ ở tỷ lệ 1:${scale} và hình có thể chạm mép khung.`,
    );
  }
  const paper = paperFor(bbox, area, scale);

  const body = [
    renderFrame(area),
    renderTitleBlock(area, style, { levelName: level.name, scale }),
    renderSheetTitle(area, style, level.name),
    // MỘT dòng ghi chú: dải tiêu đề chỉ đủ chỗ cho hai dòng trước khi chạm tên tờ vẽ (đo trên lượt
    // fd3b0b86 — dòng thứ ba đè lên «Mặt bằng công năng — Tầng 1»).
    renderFooter(area, style, sheetNotes(plan, level)),
    renderPlanBody(plan, level, paper, options, notes),
    // Mũi tên bắc nằm TRONG vùng hình, không sát khung: chữ «B» in phía ngoài vòng tròn, nên
    // đặt đúng mép thì nó tràn qua nét khung hoặc qua cột khung tên. Chừa thêm một cỡ chữ.
    renderNorthArrow(
      plan.north_deg ?? 0,
      [
        area.plan.x1 - style.symbol.north_r_mm - style.text_mm.north,
        area.plan.y0 + style.symbol.north_r_mm + style.text_mm.north,
      ],
      paper,
      style,
    ),
  ].join('');

  return { svg: svgDocument(style, orientation, body), scale, orientation, notes: notes.list() };
}

/**
 * Phần HÌNH của một tầng — ô thông tầng, tường, lỗ mở, thang, chữ trong phòng, chuỗi kích thước —
 * không khung, không khung tên, không mũi tên bắc.
 *
 * Tờ SVG và bộ xuất DXF (`ai/dxf/`) cùng gọi hàm này với hai bộ đổi toạ độ khác nhau, nên tệp CAD mang
 * đúng tường đã cắt lỗ, đúng ký hiệu cửa, đúng chỗ đặt chữ mà kiến trúc sư đã xem trên màn hình — một
 * nguồn hình học (CLAUDE.md 8.2 điểm 5).
 */
export function renderPlanBody(
  plan: AiFloorPlan,
  level: AiFloorPlanLevel,
  paper: Paper,
  options: PlanSheetOptions,
  notes: DrawNotes,
): string {
  const { style, labels } = options;
  const walls = prepareWalls(level.walls);
  const bbox = levelBounds(level);
  const openings = renderOpenings(level, walls, paper, notes);
  const ownStairs = level.stairs ?? [];
  const arriving = ownStairs.length === 0 ? stairsArrivingAt(plan, level) : [];
  const stairs = ownStairs.length ? ownStairs : arriving;
  return [
    renderVoids(level.voids ?? [], paper),
    renderWalls(walls, openings.holes, paper),
    openings.svg,
    renderStairs(stairs, paper, style, ownStairs.length === 0),
    renderRoomLabels(level.rooms, paper, style, labels, notes, [
      ...doorSwingZones(level, walls),
      ...stairTreadZones(stairs),
    ]),
    renderDimensions(walls, bbox, paper, style),
  ].join('');
}

/**
 * Thang của tầng NGAY DƯỚI mà ô thang đứng trong khối xây của tầng này — vẽ lại ở tầng trên cùng.
 *
 * Cổng liên tầng đã bảo đảm ô thang các tầng chồng khít (`stair_not_aligned`), nên chép nguyên hình
 * thang tầng dưới là đúng chỗ. Ô thang không nằm trong hình bao tầng này thì không vẽ.
 */
function stairsArrivingAt(
  plan: AiFloorPlan,
  level: AiFloorPlanLevel,
): NonNullable<AiFloorPlanLevel['stairs']> {
  const below = plan.levels.find((item) => item.level === level.level - 1);
  if (!below?.stairs?.length) return [];
  const bounds = bboxOfPoints(level.outline.map(toPt));
  return below.stairs.filter((stair) => {
    const rect = toRect(stair.rect);
    return (
      rect.x0 >= bounds.x0 && rect.x1 <= bounds.x1 && rect.y0 >= bounds.y0 && rect.y1 <= bounds.y1
    );
  });
}

/**
 * Hình bao để căn giấy: hình bao khối xây, cộng thêm mọi thứ có thể chìa ra ngoài nó.
 *
 * Lấy dư còn hơn thiếu — tường khai theo TIM nên nửa bề dày nằm ngoài đường bao, và mô hình
 * thỉnh thoảng khai ban công vượt ra ngoài `outline`. Thiếu vài centimet ở đây thì tờ vẽ mất
 * một mảng tường ngoài rìa mà không có lỗi nào nổ ra.
 */
export function levelBounds(level: AiFloorPlanLevel): Rect {
  const points: Pt[] = [];
  for (const point of level.outline) points.push(toPt(point));
  for (const wall of level.walls) {
    points.push(toPt(wall.a), toPt(wall.b));
  }
  for (const room of level.rooms) {
    const rect = toRect(room.rect);
    points.push([rect.x0, rect.y0], [rect.x1, rect.y1]);
  }
  const bbox = bboxOfPoints(points);
  const margin = Math.max(0, ...level.walls.map((wall) => wall.t)) / 2;
  return {
    x0: bbox.x0 - margin,
    y0: bbox.y0 - margin,
    x1: bbox.x1 + margin,
    y1: bbox.y1 + margin,
  };
}

/** Ô thông tầng, giếng trời, sân trong: nền nhạt + hai đường chéo — quy ước đọc là "không sàn". */
function renderVoids(voids: NonNullable<AiFloorPlanLevel['voids']>, paper: Paper): string {
  const parts: string[] = [];
  for (const item of voids) {
    const rect = toRect(item.rect);
    const [x0, y0] = paper.p([rect.x0, rect.y0]);
    const [x1, y1] = paper.p([rect.x1, rect.y1]);
    parts.push(
      tag('rect', {
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
        class: CLS.void,
      }),
    );
    parts.push(
      tag('path', {
        class: CLS.void,
        d: [
          polylinePath(
            [
              [x0, y0],
              [x1, y1],
            ],
            false,
          ),
          polylinePath(
            [
              [x0, y1],
              [x1, y0],
            ],
            false,
          ),
        ].join(' '),
        fill: 'none',
      }),
    );
  }
  return parts.join('');
}
