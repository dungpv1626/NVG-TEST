/**
 * Lý do một lượt xếp mặt bằng HỎNG, đọc được cho người thiết kế (lượt chạy thật 23/10/2026, hồ sơ
 * NVO-TK-2026-THU5).
 *
 * Trước đây màn hình chỉ có «Chưa xếp được mặt bằng» và số tiền; câu lỗi nằm trong báo cáo `.md`, và
 * câu ấy là của LƯỢT CUỐI — ở lượt ef5fbffc là «Sai cấu trúc ở rooms: Array must contain at least 1
 * element(s)», trong khi bốn lượt trước hỏng vì phòng không có lối vào, phòng làm việc thiếu diện tích,
 * thang không chạm hành lang. Ở đây:
 *
 *  · Lấy lượt hỏng NHẸ NHẤT (`main`, Worker chọn bằng đúng phép so của vòng lặp); lượt chạy cũ chưa có
 *    trường ấy thì dùng lượt cuối, và nếu lượt cuối là câu trả lời không dùng được thì nói thẳng ra.
 *  · Đổi mã phòng («living_1») sang tên phòng của danh mục, số thập phân sang dấu phẩy (CGD 4.3) — câu
 *    do bộ xếp viết vẫn mang dấu chấm, và bộ xếp nằm ngoài phần giao diện.
 *  · Gợi ý sửa đầu bài theo NHÓM mã lỗi — chỉ là gợi ý chỗ cần xem, không tự sửa gì (PRD 2.3).
 */

/** Một tầng bị bác, đúng hình dạng Worker ghi (`LevelRejection`). */
export interface FailedReason {
  level: number;
  messages: string[];
  firstMessages?: string[];
  retry?: 'revise' | 'resample' | 'none' | 'unchanged' | 'stuck';
  attempts?: number;
  notes?: string[];
  codes?: string[];
}

export interface FailedVariant {
  variantId: string;
  error: string;
  reasons?: FailedReason[];
  /** Lượt hỏng nhẹ nhất khi nó không phải lượt cuối. Vắng ở lượt chạy trước 23/10/2026. */
  main?: { round: number; levels: Array<Pick<FailedReason, 'level' | 'messages' | 'codes'>> };
  /** Lượt dừng vì chạm mức chi phí (T164) — Worker ghi `workers/src/design/ai/cost-cap.ts::CostCapStop`. */
  costCap?: { capUsd: number; spentUsd: number; reason?: 'over' | 'unpriced' };
  /** Dừng gọi lại vì cùng một lỗi chính lặp lại (T174) — Worker ghi `workflows/plan-main-rejection.ts::EarlyStop`. */
  earlyStop?: { reason: 'same_main_issue'; rounds: number; level: number; message: string };
}

export interface FailureView {
  variantId: string;
  /** Vòng của lý do chính; `null` = lượt cuối. */
  round: number | null;
  /** Số lượt đã gọi mô hình. */
  attempts: number | null;
  /** Theo tầng: «Tầng 1», «Cả nhà». */
  groups: Array<{ title: string; messages: string[] }>;
  /** Lượt cuối là câu trả lời không dùng được (sai cấu trúc) — chỉ có khi không có `main`. */
  lastUnusable: boolean;
  hints: string[];
  /** Câu «đã dừng vì chạm mức chi phí» (T164); `null` khi lượt dừng vì lý do khác. */
  costStop: string | null;
  /** Câu «đã dừng gọi lại vì cùng một lỗi chính» (T174); `null` khi lượt dừng vì lý do khác. */
  earlyStop: string | null;
}

const ANSWER_UNUSABLE = 'answer_unusable';

/** Gợi ý theo nhóm mã. Thứ tự = thứ tự hiện. */
const HINTS: ReadonlyArray<{ test: RegExp; text: string }> = [
  {
    test: /entrance|door_outside|door_no_outside|vehicle_door|entry_room/,
    text: 'Lối vào: xem lại «Lối vào chính đặt ở mặt nào», «Lối xe vào» và «Hiện trạng bốn phía» — mặt mang cửa chính phải giáp đường hoặc hẻm, không giáp nhà hàng xóm.',
  },
  {
    test: /area|program_brief|feasib|plate|min_dimension|aspect/,
    text: 'Diện tích: diện tích tối thiểu khai ở «Không gian bắt buộc có» có thể quá chật so với sàn xây được — giảm mức tối thiểu, bớt phòng ở tầng chật, hoặc dời phòng lên tầng khác.',
  },
  {
    test: /access|corridor|stair|route|reach|stranded|no_door|band_no_access|walk/,
    text: 'Lối đi: lô hẹp mà nhiều phòng mỗi tầng thì khó chừa hành lang nối thang tới từng phòng — bớt phòng ở tầng chật hoặc tăng số tầng, rồi chạy lại.',
  },
  {
    test: /^answer_unusable$/,
    text: 'Câu trả lời của mô hình: lượt cuối mô hình trả câu trả lời không dùng được — chạy lại, hoặc chọn model khác.',
  },
];

const ROOM_ID = /"([a-z][a-z_]*?)_(\d+)"/g;

/** Câu của bộ xếp → câu đọc được: tên phòng thay mã, dấu phẩy thập phân. */
export function readableMessage(message: string, roomLabels: Record<string, string>): string {
  return message
    .replace(ROOM_ID, (whole, type: string, n: string) => {
      const label = roomLabels[type];
      return label ? `«${label} ${n}»` : whole;
    })
    .replace(/(\d)\.(\d)/g, '$1,$2');
}

/** USD kiểu Việt Nam, khớp câu Worker viết (`formatUsdVi`): dấu phẩy, hai chữ số — ba khi dưới 0,1. */
function usdVi(value: number): string {
  const digits = value > 0 && value < 0.1 ? 3 : 2;
  return `${value.toFixed(digits).replace('.', ',')} USD`;
}

/** Câu dừng vì mức chi phí — dựng từ số, không đọc lại `error`, để lượt cũ / lượt khác không lẫn vào. */
export function costStopMessage(cap: NonNullable<FailedVariant['costCap']>): string {
  return cap.reason === 'unpriced'
    ? `Đã dừng vì không tính được chi phí lời gọi trước của mô hình này, trong khi lượt có mức chi phí ${usdVi(cap.capUsd)} (đã tiêu ${usdVi(cap.spentUsd)}).`
    : `Đã dừng vì chạm mức chi phí ${usdVi(cap.capUsd)} (đã tiêu ${usdVi(cap.spentUsd)}).`;
}

function hintsFor(codes: readonly string[]): string[] {
  const out: string[] = [];
  for (const hint of HINTS) if (codes.some((code) => hint.test.test(code))) out.push(hint.text);
  return out;
}

function levelTitle(level: number): string {
  return level === 0 ? 'Cả nhà' : `Tầng ${level}`;
}

export function failureViews(
  failed: readonly FailedVariant[],
  roomLabels: Record<string, string>,
): FailureView[] {
  return failed.map((item) => {
    const reasons = item.reasons ?? [];
    const attempts = reasons.reduce<number | null>(
      (max, r) => (r.attempts ? Math.max(max ?? 0, r.attempts) : max),
      null,
    );
    const lastCodes = reasons.flatMap((r) => r.codes ?? []);
    const source = item.main?.levels ?? reasons;
    const groups = source
      .filter((r) => r.messages.length > 0)
      .map((r) => ({
        title: levelTitle(r.level),
        messages: r.messages.map((m) => readableMessage(m, roomLabels)),
      }));
    const lastUnusable = !item.main && lastCodes.includes(ANSWER_UNUSABLE);
    // Lượt cũ: lượt cuối không dùng được mà lượt đầu nói được chỗ hỏng → đưa lượt đầu lên cùng.
    const earlier = lastUnusable
      ? reasons
          .filter((r) => (r.firstMessages?.length ?? 0) > 0)
          .map((r) => ({
            title: `${levelTitle(r.level)} — lượt đầu`,
            messages: r.firstMessages!.map((m) => readableMessage(m, roomLabels)),
          }))
      : [];
    const codes = [...(item.main?.levels ?? []).flatMap((r) => r.codes ?? []), ...lastCodes];
    return {
      variantId: item.variantId,
      round: item.main?.round ?? null,
      attempts,
      groups: [...earlier, ...groups],
      lastUnusable,
      hints: groups.length === 0 && !earlier.length ? [] : hintsFor(codes),
      costStop: item.costCap ? costStopMessage(item.costCap) : null,
      earlyStop: item.earlyStop ? readableMessage(item.earlyStop.message, roomLabels) : null,
    };
  });
}
