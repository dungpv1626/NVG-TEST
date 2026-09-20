/**
 * ẢNH NEO — tờ mặt bằng rút gọn, dựng riêng để GỬI CHO MÔ HÌNH ẢNH (T57, 19/09/2026).
 *
 * ── Vì sao có tệp này, thay vì gửi thẳng tờ A3 ──────────────────────────────────────────
 * Hai lý do, và cả hai đều là ràng buộc chứ không phải sở thích.
 *
 *  1. **Hạng dữ liệu.** `config/models.yaml` xếp «mặt bằng kích thước thật, bản vẽ kỹ thuật» là
 *     hạng 2 — hạng mà hai tuyến ảnh nhận được — nhưng xếp «tên chủ đầu tư, mã hồ sơ, khung tên»
 *     là hạng 1, và `llm/router.ts` chặn hạng 1 trước khi ra mạng. Tờ A3 có khung tên. Tờ này
 *     thì không, và không phải vì có một cờ nào tắt nó đi: hàm dưới đây KHÔNG GỌI
 *     `renderTitleBlock`, nên không có đường nào để khung tên lọt vào.
 *  2. **Khung ảnh.** `llm/openai.ts` không gửi tham số `size`, nên mô hình trả ảnh theo khung
 *     của nó. Tờ A3 tỷ lệ 1,41:1 không khớp khung nào của mô hình, và chỗ lệch bị cắt hoặc bị
 *     bóp. Tờ này đệm sẵn về một trong ba khung chuẩn, bằng nền trắng, không bóp hình.
 *
 * ── Không viết lại một nét nào ────────────────────────────────────────────────────────
 * Thân hình lấy nguyên `renderPlanBody` — đúng hàm mà tờ A3 và bộ xuất DXF đang dùng. Ba nơi,
 * một nguồn hình học (CLAUDE.md 8.2 điểm 5). Khác biệt duy nhất là bộ đổi toạ độ, cùng cách
 * `dxf/plan-dxf.ts` dựng `modelPaper()`.
 */

import type { AiFloorPlan } from '@nvg/shared/design';
import { DrawNotes, type DrawNote } from './notes';
import { PlanSheetError, levelBounds, renderPlanBody, type PlanSheetOptions } from './plan-sheet';
import type { Rect } from './geometry';
import { el, num, sheetCss, tag } from './svg';
import type { SheetStyle } from './style';
import { chooseLayout, mmPerCm, type Paper } from './units';

/**
 * Ba khung ảnh chuẩn, tính bằng điểm ảnh.
 *
 * Lấy đúng ba khung mà cả OpenAI lẫn Google đều nhận: vuông, ngang 3:2, dọc 2:3. Ảnh neo được
 * đệm về khung GẦN NHẤT với hình chứ không co hình cho vừa khung — một mặt bằng bị bóp ngang là
 * một mặt bằng mô hình sẽ vẽ lại theo tỷ lệ sai.
 */
export const ANCHOR_FRAMES = [
  { widthPx: 1024, heightPx: 1024 },
  { widthPx: 1536, heightPx: 1024 },
  { widthPx: 1024, heightPx: 1536 },
] as const;

export interface PlanAnchorResult {
  svg: string;
  /** Cỡ ảnh khai trong thẻ `<svg>`, đơn vị điểm ảnh — trình duyệt lấy đúng số này làm cỡ canvas. */
  widthPx: number;
  heightPx: number;
  /** Tỷ lệ đã dùng: 60 nghĩa là 1:60. Lời dẫn ghi con số này vào khung tên mà mô hình sẽ vẽ. */
  scale: number;
  notes: DrawNote[];
}

/**
 * Khoảng hở giữa dải chuỗi kích thước và mép ảnh, mm giấy.
 *
 * Không phải trang trí. Đo trên ảnh neo dựng thật (biệt thự 10,2 × 14,2 m, 1:60): lề bằng ĐÚNG bề
 * dày dải chuỗi đặt con số tổng nằm sát mép tới mức chỉ cần làm tròn lệch một điểm ảnh là mất chữ
 * số đầu. Và mất một chữ số ở đây hỏng im lặng — tấm ảnh vẫn ra, mô hình vẫn chép, chỉ là chép
 * một con số sai lên tờ đưa khách.
 */
const EDGE_CLEAR_MM = 6;

/**
 * Lề trắng quanh hình, mm giấy.
 *
 * Bằng bề dày dải chuỗi kích thước của tờ A3 (`dim.first_offset_mm + row_gap_mm + text_mm.dim +
 * text_gap_mm`) cộng khoảng hở trên, vì chính chuỗi kích thước là thứ chìa ra ngoài hình bao và sẽ
 * bị cắt nếu lề hẹp hơn. Đặt đều bốn cạnh chứ không chỉ hai cạnh có chuỗi: viền trắng đều làm mô
 * hình ảnh dễ giữ đúng khung hơn, và phần thừa chỉ là vài chục điểm ảnh.
 */
function anchorPadMm(style: SheetStyle): number {
  const { dim, text_mm } = style;
  return dim.first_offset_mm + dim.row_gap_mm + text_mm.dim + dim.text_gap_mm + EDGE_CLEAR_MM;
}

/**
 * Khung có tỷ lệ cạnh gần với hình nhất — so bằng tỷ số, không so diện tích.
 *
 * ⚠️ Nhà càng dài càng lấp ít khung, và ba khung trên không chữa được điều đó. Đo trên fixture nhà
 * phố 4,2 × 15,2 m (tỷ lệ 1:3,6): hình chỉ chiếm khoảng 40 % số điểm ảnh, phần còn lại là nền
 * trắng — và xoay ngang cũng ra đúng chừng ấy, vì không khung nào của nhà cung cấp gần 1:3,6. Đây
 * là hình dạng bài toán, không phải lỗi. Nếu tấm ảnh nhà ống ra thưa nét thì đây là chỗ nhìn
 * trước, và cách chữa nằm ở việc khai `size` cho nhà cung cấp chứ không ở hàm này.
 */
function frameFor(contentW: number, contentH: number): (typeof ANCHOR_FRAMES)[number] {
  const want = contentW / contentH;
  let best: (typeof ANCHOR_FRAMES)[number] = ANCHOR_FRAMES[0];
  let bestGap = Infinity;
  for (const frame of ANCHOR_FRAMES) {
    const gap = Math.abs(Math.log(frame.widthPx / frame.heightPx) - Math.log(want));
    if (gap < bestGap) {
      bestGap = gap;
      best = frame;
    }
  }
  return best;
}

export interface AnchorPaper {
  paper: Paper;
  /** Hộp nhìn của ảnh neo, mm giấy. */
  viewW: number;
  viewH: number;
  frame: (typeof ANCHOR_FRAMES)[number];
}

/**
 * Bộ đổi toạ độ của một ảnh neo: hình ở tỷ lệ `scale`, đệm lề đều bốn cạnh, căn giữa khung ảnh chuẩn
 * gần nhất. Dùng chung cho ảnh neo mặt bằng và mặt đứng (T59) — hai ảnh neo, một cách đệm khung.
 */
export function anchorPaper(bbox: Rect, scale: number, style: SheetStyle): AnchorPaper {
  const k = mmPerCm(scale);
  const drawnW = (bbox.x1 - bbox.x0) * k;
  const drawnH = (bbox.y1 - bbox.y0) * k;
  const pad = anchorPadMm(style);
  const frame = frameFor(drawnW + 2 * pad, drawnH + 2 * pad);

  // Số điểm ảnh trên mỗi mm giấy: chiều nào chật hơn thì chiều ấy quyết định. Nhờ vậy lề thật
  // luôn RỘNG HƠN HOẶC BẰNG `pad` ở cả bốn cạnh, không cần kiểm lại.
  const pxPerMm = Math.min(frame.widthPx / (drawnW + 2 * pad), frame.heightPx / (drawnH + 2 * pad));
  const viewW = frame.widthPx / pxPerMm;
  const viewH = frame.heightPx / pxPerMm;

  // Hình đặt GIỮA khung theo cả hai chiều; trục y lật, đúng quy ước mọi mô-đun vẽ đang dùng.
  const left = (viewW - drawnW) / 2;
  const bottom = (viewH + drawnH) / 2;
  const x = (cmX: number): number => left + (cmX - bbox.x0) * k;
  const y = (cmY: number): number => bottom - (cmY - bbox.y0) * k;
  const paper: Paper = {
    scale,
    k,
    x,
    y,
    p: (point) => [x(point[0]), y(point[1])],
    len: (cm) => cm * k,
    u: (unit) => [unit[0], -unit[1]],
  };
  return { paper, viewW, viewH, frame };
}

/**
 * Vỏ SVG của một ảnh neo: cỡ điểm ảnh trần, nền trắng tuyệt đối, rồi thân hình.
 */
export function anchorSvg(anchor: AnchorPaper, style: SheetStyle, body: string): string {
  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${num(anchor.viewW)} ${num(anchor.viewH)}`,
      // Số TRẦN, không hậu tố — khác `svgDocument` vốn khai `mm`. Ảnh neo đi vào `<img>` rồi lên
      // canvas, mà canvas cần cỡ điểm ảnh nội tại; khai `mm` thì mỗi trình duyệt quy đổi một kiểu
      // và tấm PNG ra không đúng khung chuẩn nữa.
      width: num(anchor.frame.widthPx),
      height: num(anchor.frame.heightPx),
    },
    [
      el('style', {}, sheetCss(style)),
      // Trắng TUYỆT ĐỐI, không lấy `style.colour.paper`: quy ước trình bày cho phép giấy ngả kem,
      // và mô hình ảnh sẽ chép lại đúng cái nền ngà ấy ra tờ trình khách.
      tag('rect', { x: 0, y: 0, width: anchor.viewW, height: anchor.viewH, fill: '#ffffff' }),
      body,
    ],
  );
}

export function renderPlanAnchor(
  plan: AiFloorPlan,
  levelNumber: number,
  options: PlanSheetOptions,
): PlanAnchorResult {
  const level = plan.levels.find((item) => item.level === levelNumber);
  if (!level) {
    throw new PlanSheetError(`Phương án này không có tầng ${levelNumber}.`);
  }

  const notes = new DrawNotes();
  const bbox = levelBounds(level);
  // Lấy lại ĐÚNG tỷ lệ của tờ A3, dù ảnh neo không dùng khổ giấy ấy. Tỷ lệ quyết định cỡ chữ so
  // với hình, nên giữ nguyên thì ảnh neo có cùng độ đặc/thưa với tờ kiến trúc sư đang xem —
  // và con số «1:60» gửi trong lời dẫn khớp với thứ mô hình nhìn thấy.
  const { scale } = chooseLayout(bbox, options.style);
  const { paper, viewW, viewH, frame } = anchorPaper(bbox, scale, options.style);

  const svg = anchorSvg(
    { paper, viewW, viewH, frame },
    options.style,
    renderPlanBody(plan, level, paper, options, notes),
  );

  return {
    svg,
    widthPx: frame.widthPx,
    heightPx: frame.heightPx,
    scale,
    notes: notes.list(),
  };
}
