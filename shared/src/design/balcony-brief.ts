/**
 * Ban công trong đầu bài, đọc về MỘT hình dạng (T91, Haan 27/09/2026).
 *
 * Phiếu mới hỏi hai danh sách mặt — bắt buộc có ban công / có thể có — và độ đua ra ngoài ranh của TỪNG
 * mặt. Đầu bài lưu trước T91 chỉ có `sides` (được hiểu là bắt buộc, như T65 vẫn hiểu) cùng một câu
 * «có đua / không» và một con số chung. Artifact đầu bài là bất biến, nên mọi nơi đọc ban công đi qua
 * hàm này thay vì đọc thẳng trường: một chỗ quy đổi, không có hai cách hiểu.
 */

export const BALCONY_SIDES = ['front', 'back', 'left', 'right'] as const;
export type BalconySide = (typeof BALCONY_SIDES)[number];

/** Những trường ban công mà cả đầu bài lẫn bản rút gọn gửi mô hình đều mang. */
export interface BalconyFields {
  required_sides?: readonly string[] | null;
  optional_sides?: readonly string[] | null;
  projection_by_side?: Partial<Record<string, number | null>> | null;
  /** Cũ (trước T91). */
  sides?: readonly string[] | null;
  /** Cũ (trước T91). */
  projection_over_boundary?: boolean | null;
  /** Cũ (trước T91). */
  projection_m?: number | null;
}

export interface BalconySideView {
  /** Mặt bắt buộc có ban công. */
  required: BalconySide[];
  /** Mặt có thể có ban công — không trùng `required`. */
  optional: BalconySide[];
  /**
   * Độ đua ra ngoài ranh từng mặt, mét: số > 0 = đua; 0 = không đua (ban công trong sàn);
   * `null` = chưa trả lời. Chỉ có mặt cho mặt nằm trong `required` hoặc `optional`.
   */
  projection: Partial<Record<BalconySide, number | null>>;
  /** Đầu bài đọc từ các trường cũ (trước T91). */
  legacy: boolean;
}

function sidesOf(values: readonly string[] | null | undefined): BalconySide[] {
  return [...new Set((values ?? []).filter((v): v is BalconySide => isSide(v)))];
}

function isSide(value: string): value is BalconySide {
  return (BALCONY_SIDES as readonly string[]).includes(value);
}

export function balconySides(b: BalconyFields | null | undefined): BalconySideView {
  if (!b) return { required: [], optional: [], projection: {}, legacy: false };
  const legacy =
    b.required_sides == null && b.optional_sides == null && b.projection_by_side == null;
  const required = legacy ? sidesOf(b.sides) : sidesOf(b.required_sides);
  const optional = legacy
    ? []
    : sidesOf(b.optional_sides).filter((side) => !required.includes(side));

  const projection: Partial<Record<BalconySide, number | null>> = {};
  const withBalcony = [...required, ...optional];
  if (legacy) {
    // Cũ: một câu «có đua» + một con số chung cho mọi mặt đã khai (không khai mặt nào thì mặt tiền).
    const m = typeof b.projection_m === 'number' ? b.projection_m : null;
    const targets = withBalcony.length ? withBalcony : (['front'] as BalconySide[]);
    for (const side of targets) {
      projection[side] =
        b.projection_over_boundary === true ? m : b.projection_over_boundary === false ? 0 : null;
    }
  } else {
    for (const side of withBalcony) {
      const value = b.projection_by_side?.[side];
      projection[side] = typeof value === 'number' ? value : null;
    }
  }
  return { required, optional, projection, legacy };
}

/**
 * Loại hiện trạng mỗi phía (`site.adjacent`) khi ban công đua sang: đất người khác thì CHẶN, khoảng
 * công cộng thì chỉ CẢNH BÁO (Haan 27/09/2026 — «đất trống» coi là đất người khác, ao hồ là công).
 * Giá trị lạ / chưa khai thì `null`: không đoán.
 */
export function projectionOver(adjacent: string | null | undefined): 'private' | 'public' | null {
  if (!adjacent) return null;
  if (adjacent === 'nha_hang_xom' || adjacent === 'dat_trong') return 'private';
  if (adjacent === 'duong_lon' || adjacent.startsWith('hem_') || adjacent === 'ao_ho') {
    return 'public';
  }
  return null;
}
