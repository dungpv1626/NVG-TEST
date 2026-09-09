/**
 * Đổi từ hình học THẬT (cm) sang toạ độ GIẤY (mm), và chọn tỷ lệ.
 *
 * Một chỗ duy nhất biết cả hai hệ toạ độ. Mọi mô-đun vẽ nhận `Paper` rồi gọi `x/y/len`, nên
 * không nơi nào phải nhớ hệ số 10 hay nhớ rằng trục y bị lật.
 *
 * ── Vì sao lật trục y ──────────────────────────────────────────────────────────────────
 * Hợp đồng đo `y` VÀO SÂU tính từ mặt tiền; trục y của SVG hướng XUỐNG. Không lật thì mặt
 * tiền nằm ở mép trên tờ giấy và bản vẽ đọc ngược với thói quen (đường ở dưới, nhà lùi vào
 * phía trên). Lật ở đây, một lần, thay vì để từng mô-đun tự đổi dấu.
 */

import type { Pt, Rect } from './geometry';
import type { Orientation, SheetStyle } from './style';

/** mm giấy trên mỗi cm thật, ở tỷ lệ 1:`scale`. Ở 1:100 là 0,1. */
export function mmPerCm(scale: number): number {
  return 10 / scale;
}

export interface Paper {
  /** Tỷ lệ đang dùng: 100 nghĩa là 1:100. */
  scale: number;
  /** mm giấy trên mỗi cm thật. */
  k: number;
  x(cmX: number): number;
  y(cmY: number): number;
  /** Một điểm thật → điểm giấy. */
  p(point: Pt): [number, number];
  /** Chiều dài thật (cm) → chiều dài giấy (mm). */
  len(cm: number): number;
  /** Véc-tơ ĐƠN VỊ trong hệ thật → véc-tơ đơn vị trong hệ giấy (chỉ lật y, không đổi độ dài). */
  u(unit: Pt): Pt;
}

/** Vùng vẽ hình trên giấy, tính bằng mm, đã trừ lề, dải tiêu đề và chỗ cho chuỗi kích thước. */
export interface DrawArea {
  /** Khung bản vẽ (mm giấy) — nét khung chạy đúng trên đường này. */
  frame: Rect;
  /** Dải tiêu đề, nằm trong khung, sát mép dưới. */
  strip: Rect;
  /** Phần còn lại để đặt hình và chuỗi kích thước. */
  content: Rect;
  /** Phần dành riêng cho HÌNH — `content` đã trừ chỗ chuỗi kích thước ở trái và dưới. */
  plan: Rect;
}

/** Khoảng hở tối thiểu giữa hình và khung ở hai cạnh KHÔNG có chuỗi kích thước, mm giấy. */
const FREE_EDGE_PAD_MM = 12;

/** Khổ giấy theo hướng đặt: ngang thì cạnh dài nằm ngang. */
export function paperSize(
  style: SheetStyle,
  orientation: Orientation,
): { width: number; height: number } {
  return orientation === 'landscape'
    ? { width: style.paper.long_mm, height: style.paper.short_mm }
    : { width: style.paper.short_mm, height: style.paper.long_mm };
}

export function drawArea(style: SheetStyle, orientation: Orientation): DrawArea {
  const size = paperSize(style, orientation);
  const frame: Rect = {
    x0: style.margin_mm.left,
    y0: style.margin_mm.top,
    x1: size.width - style.margin_mm.right,
    y1: size.height - style.margin_mm.bottom,
  };
  const strip: Rect = {
    x0: frame.x0,
    y0: frame.y1 - style.title_strip.h_mm,
    x1: frame.x1,
    y1: frame.y1,
  };
  const content: Rect = { x0: frame.x0, y0: frame.y0, x1: frame.x1, y1: strip.y0 };

  // Chuỗi kích thước chạy dọc cạnh TRÁI và cạnh DƯỚI (mặt trước) — hai cạnh ấy phải chừa đủ
  // cho hai hàng chuỗi cộng chữ số, hai cạnh kia chỉ cần một khoảng hở cho dễ nhìn.
  const dimBand =
    style.dim.first_offset_mm + style.dim.row_gap_mm + style.text_mm.dim + style.dim.text_gap_mm;
  const plan: Rect = {
    x0: content.x0 + dimBand,
    y0: content.y0 + FREE_EDGE_PAD_MM,
    x1: content.x1 - FREE_EDGE_PAD_MM,
    y1: content.y1 - dimBand,
  };
  return { frame, strip, content, plan };
}

/**
 * Chọn hướng giấy và tỷ lệ: hình LỚN NHẤT còn lọt vùng vẽ.
 *
 * Duyệt tỷ lệ trước, hướng giấy sau — vẽ ở 1:50 trên tờ dọc bao giờ cũng hơn 1:100 trên tờ
 * ngang, vì tỷ lệ quyết định chữ trong phòng có đọc được không, còn hướng giấy thì không.
 * Cùng một tỷ lệ mà cả hai hướng đều vừa thì lấy hướng đứng trước trong `style.orientations`.
 *
 * Không có cặp nào vừa thì trả tỷ lệ CUỐI kèm `fits: false` — bộ vẽ vẫn ra tờ (thu nhỏ hơn
 * chuẩn còn hơn cắt mất một góc nhà) và ghi một dòng ghi chú để màn hình nói ra. Ném ở đây thì
 * một lô đất rộng bất thường sẽ thành lỗi máy chủ, trong khi thứ người dùng cần là tờ vẽ.
 */
export interface SheetLayout {
  orientation: Orientation;
  scale: number;
  area: DrawArea;
  fits: boolean;
}

export function chooseLayout(bbox: Rect, style: SheetStyle): SheetLayout {
  const w = bbox.x1 - bbox.x0;
  const h = bbox.y1 - bbox.y0;

  for (const scale of style.scales) {
    const k = mmPerCm(scale);
    for (const orientation of style.orientations) {
      const area = drawArea(style, orientation);
      const availW = area.plan.x1 - area.plan.x0;
      const availH = area.plan.y1 - area.plan.y0;
      if (w * k <= availW && h * k <= availH) return { orientation, scale, area, fits: true };
    }
  }

  const orientation = style.orientations[0] ?? 'landscape';
  return {
    orientation,
    scale: style.scales[style.scales.length - 1] ?? 100,
    area: drawArea(style, orientation),
    fits: false,
  };
}

/** Bộ đổi toạ độ: hình được căn GIỮA vùng vẽ theo cả hai chiều. */
export function paperFor(bbox: Rect, area: DrawArea, scale: number): Paper {
  const k = mmPerCm(scale);
  const availW = area.plan.x1 - area.plan.x0;
  const availH = area.plan.y1 - area.plan.y0;
  const drawnW = (bbox.x1 - bbox.x0) * k;
  const drawnH = (bbox.y1 - bbox.y0) * k;
  const left = area.plan.x0 + (availW - drawnW) / 2;
  // Mép DƯỚI của hình trên giấy: `y` thật tăng thì `y` giấy giảm.
  const bottom = area.plan.y0 + (availH + drawnH) / 2;

  const x = (cmX: number): number => left + (cmX - bbox.x0) * k;
  const y = (cmY: number): number => bottom - (cmY - bbox.y0) * k;
  return {
    scale,
    k,
    x,
    y,
    p: (point) => [x(point[0]), y(point[1])],
    len: (cm) => cm * k,
    u: (unit) => [unit[0], -unit[1]],
  };
}
