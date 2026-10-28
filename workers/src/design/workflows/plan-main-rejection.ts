/**
 * Lý do CHÍNH của một phương án mặt bằng không xếp được (lượt chạy thật 23/10/2026, hồ sơ
 * NVO-TK-2026-THU5).
 *
 * `AiPlanRejected` mang lỗi của lượt CUỐI. Lượt cuối thường không phải lượt nói được nhiều nhất: ở lượt
 * ef5fbffc, bốn vòng đầu hỏng vì phòng không có lối vào, phòng làm việc thiếu diện tích, thang không
 * chạm hành lang — vòng thứ năm mô hình trả câu trả lời rỗng, và màn hình chỉ còn «Sai cấu trúc ở
 * rooms: Array must contain at least 1 element(s)». Vòng lặp vốn đã giữ lượt hỏng nhẹ nhất để gửi lại
 * mô hình (`revisionBase`, T73 i); ở đây chỉ mang lượt ấy ra kết quả cho người đọc.
 */

import { AiPlanRejected, revisionBase, type LevelRejection } from '../ai/plan';
import type { AiPrompts } from '../ai/prompts';
import type { CostCapStop } from '../ai/cost-cap';

/** Lượt hỏng nhẹ nhất của một phương án, khi nó KHÔNG phải lượt cuối. */
export interface MainRejection {
  /** Vòng thứ mấy (1 = lượt đầu). */
  round: number;
  levels: LevelRejection[];
}

/** `AiPlanRejected` kèm lượt hỏng nhẹ nhất — `instanceof AiPlanRejected` vẫn đúng ở mọi chỗ cũ. */
export class AiPlanRejectedWithMain extends AiPlanRejected {
  constructor(
    levels: LevelRejection[],
    readonly main: MainRejection | null,
    /** Lượt dừng vì chạm mức chi phí (T164) — `null` khi dừng vì lý do khác. */
    readonly costCap: CostCapStop | null = null,
    /** Lượt dừng vì cùng một lỗi chính lặp lại (T174) — `null` khi dừng vì lý do khác. */
    readonly earlyStop: EarlyStop | null = null,
  ) {
    super(levels);
  }
}

/** Dừng gọi mô hình sửa vì cùng một lỗi chính lặp lại `rounds` lượt liền (T174, `sameMainProblem`). */
export interface EarlyStop {
  reason: 'same_main_issue';
  rounds: number;
  /** Tầng của lỗi chính; `0` = cả nhà. */
  level: number;
  /** Câu tiếng Việt cho màn hình — mã phòng vẫn là mã, giao diện tự đổi sang tên phòng (`readableMessage`). */
  message: string;
}

/** Câu dừng sớm: nói số lượt, lỗi chính, và việc người dùng làm được — không gọi thêm vì gọi thêm vẫn tính tiền. */
export function earlyStopOf(
  rounds: number,
  rejections: readonly LevelRejection[],
): EarlyStop | null {
  const main = rejections.find((rejection) => rejection.messages.length > 0);
  if (!main) return null;
  const where = main.level === 0 ? 'cả nhà' : `tầng ${main.level}`;
  return {
    reason: 'same_main_issue',
    rounds,
    level: main.level,
    message: `Đã dừng gọi lại mô hình: ${rounds} lượt liền hỏng cùng một lỗi chính ở ${where} — ${main.messages[0]} Gọi thêm khó gỡ được mà vẫn tốn tiền; xem lại đầu bài ở chỗ này rồi chạy lại.`,
  };
}

/**
 * Lượt hỏng nhẹ nhất cũ hơn nhẹ hơn hẳn lượt cuối thì trả nó; lượt cuối đã là lượt nhẹ nhất (hoặc
 * không có lượt nào để so) thì `null` — màn hình dùng lỗi của lượt cuối như trước.
 *
 * So bằng đúng phép so của vòng lặp (`revisionBase`) — không tự đặt thước thứ hai.
 */
export function mainRejection<
  T extends { rejections: readonly LevelRejection[]; hints: readonly string[] },
>(
  bestFailed: T | null,
  bestFailedRound: number,
  last: T,
  prompts: AiPrompts,
): MainRejection | null {
  if (!bestFailed || bestFailed === last || bestFailedRound < 1) return null;
  if (revisionBase(bestFailed, last, prompts).best !== bestFailed) return null;
  return {
    round: bestFailedRound,
    levels: bestFailed.rejections.map((rejection) => ({
      level: rejection.level,
      messages: [...rejection.messages],
      ...(rejection.codes ? { codes: [...rejection.codes] } : {}),
    })),
  };
}

/** Một dòng cho bước «Xếp lại» hỏng: lỗi đầu tiên + số lỗi còn lại. */
export function roundSummary(rejections: readonly LevelRejection[]): string | null {
  const all = rejections.flatMap((rejection) => rejection.messages);
  if (all.length === 0) return null;
  return all.length > 1 ? `${all[0]} (và ${all.length - 1} lỗi khác)` : all[0]!;
}
