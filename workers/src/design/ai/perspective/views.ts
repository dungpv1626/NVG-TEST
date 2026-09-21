/**
 * Bộ ảnh phối cảnh gồm những góc nào, và mỗi góc cầm ảnh nào làm tham chiếu (T67).
 *
 * ── Thứ tự KHÔNG tuỳ ý ────────────────────────────────────────────────────────────────────
 * `front_day` phải xong trước, vì bốn góc còn lại cầm chính tấm ấy làm gốc màu và vật liệu. Đó
 * là cách duy nhất đã có bằng chứng để giữ năm tấm cùng một ngôi nhà (T21 → T57). Hỏng `front_day`
 * thì cả bộ hỏng, và lượt chạy phải dừng chứ không được vẽ tiếp bốn tấm của bốn ngôi nhà khác.
 *
 * ── Ảnh neo nào cho góc nào ───────────────────────────────────────────────────────────────
 * Tờ mặt đứng là hình chiếu phẳng, không có chiều sâu. Đủ cho ba góc nhìn thẳng; KHÔNG đủ cho
 * `oblique` và `aerial`, nơi mô hình phải biết nhà sâu bao nhiêu, mái hình gì và gara nằm đâu so
 * với sân. Hai góc ấy đòi thêm tờ MẶT BẰNG MÁI. Chưa có tờ ấy thì chúng không chạy — và lý do ghi
 * thẳng vào `missing[]`, không lặng lẽ vẽ ra một tấm đoán mò.
 *
 * Tệp thuần: không `fetch`, không kho, không CSDL.
 */

import type { AiFacadeConcept, AiImageSetView } from '@nvg/shared/design';

/** Loại ảnh neo vector mà trình duyệt rasterise và gửi lên. */
export type AnchorKind = 'elevation' | 'roof_plan';

/** Một thứ gửi kèm lời gọi: một tờ neo, hoặc một tấm đã vẽ ở bước trước. */
export type ViewSource = { anchor: AnchorKind } | { image: AiImageSetView };

export interface ViewStep {
  view: AiImageSetView;
  /** Ảnh gửi kèm, ĐÚNG thứ tự gửi — `source_refs` của hợp đồng ghi lại đúng thứ tự này. */
  sources: ViewSource[];
}

export interface SkippedView {
  view: AiImageSetView;
  /** Tiếng Việt, đọc được cho người dùng — đi thẳng vào `missing[].reason`. */
  reason: string;
}

export interface PerspectivePlan {
  steps: ViewStep[];
  skipped: SkippedView[];
}

/**
 * Ảnh NEO của cả bộ — góc mà bốn góc còn lại dựng theo.
 *
 * Khai ở đây, một chỗ: `assemble.ts` dùng nó để đặt cờ `anchor`, tuyến vẽ lại dùng nó để từ chối,
 * và hai bản của cùng một hằng là hai cơ hội để chúng lệch nhau.
 */
export const SET_ANCHOR_VIEW: AiImageSetView = 'front_day';

/**
 * Vì sao góc này KHÔNG vẽ lại lẻ được — `null` nghĩa là vẽ lại được.
 *
 * Bốn góc còn lại dựng ảnh→ảnh TỪ CHÍNH tấm ban ngày. Thay nó mà giữ bốn tấm kia là để lại một bộ
 * năm ảnh của HAI ngôi nhà — đúng thứ cả bước này sinh ra để tránh.
 */
export function redrawAloneRefusal(view: AiImageSetView): string | null {
  return view === SET_ANCHOR_VIEW
    ? 'Ảnh mặt tiền ban ngày là tấm gốc của cả bộ — bốn góc còn lại dựng theo nó. Muốn đổi tấm này thì dựng lại cả bộ.'
    : null;
}

const NEEDS_ROOF_PLAN =
  'Chưa dựng được tờ mặt bằng mái để làm ảnh neo, nên góc này sẽ phải đoán chiều sâu nhà và hình mái. Không vẽ.';

/**
 * Ảnh cận cảnh chụp gì — CHƯƠNG TRÌNH chọn, không hỏi mô hình (T67, Haan chốt).
 *
 * Có ban công trên mặt tiền thì chụp ban công, không thì chụp cổng và cửa chính. Câu trả lời đã
 * nằm sẵn trong ý tưởng mặt đứng; hỏi mô hình là trả tiền để nó đoán lại thứ ta đã biết, và thêm
 * một cách sai mới.
 */
export function closeUpView(concept: AiFacadeConcept): AiImageSetView {
  return (concept.balconies ?? []).length > 0 ? 'balcony_close' : 'gate_close';
}

/**
 * Năm góc theo đúng thứ tự chạy, cùng danh sách góc phải bỏ và lý do.
 *
 * `anchors` là những tờ neo TRÌNH DUYỆT ĐÃ GỬI LÊN cho lượt này — không phải những tờ máy chủ
 * dựng được. Hai thứ ấy khác nhau: máy chủ dựng được tờ mặt bằng mái mà trình duyệt không
 * rasterise nổi (canvas hỏng, hết bộ nhớ) thì góc ấy vẫn phải bỏ.
 */
export function perspectivePlan(
  concept: AiFacadeConcept,
  anchors: readonly AnchorKind[],
): PerspectivePlan {
  const has = new Set(anchors);
  const steps: ViewStep[] = [];
  const skipped: SkippedView[] = [];

  // Ảnh neo của cả bộ. Không có tờ mặt đứng thì không có bộ nào — lớp gọi chặn trước khi tới đây.
  steps.push({ view: SET_ANCHOR_VIEW, sources: [{ anchor: 'elevation' }] });

  // Ban đêm: chỉ đổi ánh sáng. CỐ Ý không gửi kèm tờ mặt đứng — tấm ban ngày đã mang đủ hình học,
  // và thêm một bản vẽ nét vào lượt này chỉ kéo mô hình về phía vẽ lại nét thay vì đổi đèn.
  steps.push({ view: 'front_night', sources: [{ image: SET_ANCHOR_VIEW }] });

  // Cận cảnh: cũng chỉ cần tấm ban ngày, vì nó cắt ra từ chính mặt tiền ấy.
  steps.push({ view: closeUpView(concept), sources: [{ image: SET_ANCHOR_VIEW }] });

  for (const view of ['oblique', 'aerial'] as const) {
    if (has.has('roof_plan')) {
      // Thứ tự: hình học trước, màu sau. Tờ mái nói nhà sâu bao nhiêu và mái hình gì; tấm ban ngày
      // nói nhà làm bằng gì.
      steps.push({ view, sources: [{ anchor: 'roof_plan' }, { image: SET_ANCHOR_VIEW }] });
    } else {
      skipped.push({ view, reason: NEEDS_ROOF_PLAN });
    }
  }

  return { steps, skipped };
}
