/**
 * Chi phí TỐI ĐA của MỘT lời gọi mô hình chữ, và giới hạn token ra cho vừa mức chi phí của lượt (T176).
 *
 * Sự cố 28/10/2026 (hồ sơ NVO-TK-2026-9272, tuyến `ai_text_anthropic`, Claude Opus 5.5): MỘT lời gọi chạy
 * 20 phút, tiêu hết 128.000 token ra (toàn bộ là suy nghĩ), 2,59 USD — trong khi mức của lượt là 0,8 USD. Mức
 * T164 chỉ xét TRƯỚC lời gọi sửa, ước bằng trung bình các lời gọi trước: lời gọi đầu không bị chặn, và một
 * lời gọi đang chạy thì không cắt được. Cách chặn đúng là trước MỖI lời gọi tính số tiền tệ nhất nó có thể
 * tiêu (token vào ước × giá vào + giới hạn token ra × giá ra) và hạ giới hạn token ra của chính lời gọi ấy.
 *
 * Một hàm cho cả Worker (chặn thật, `workers/src/design/ai/cost-cap.ts`) lẫn màn hình (hộp hỏi trước khi chạy,
 * «tối đa ≈ X USD mỗi lời gọi») để hai nơi không tính lệch nhau. Hàm thuần, không đọc cấu hình.
 */

/** Giá niêm yết của tuyến, USD mỗi triệu token. */
export interface CallPrices {
  inputPer1mUsd: number;
  outputPer1mUsd: number;
}

/** Tiền (giá niêm yết) của một lời gọi với số token cho trước. */
export function callCostUsd(inputTokens: number, outputTokens: number, prices: CallPrices): number {
  return (inputTokens * prices.inputPer1mUsd + outputTokens * prices.outputPer1mUsd) / 1_000_000;
}

/**
 * Token vào ƯỚC theo số ký tự — không phải số đo. Chữ Việt có dấu lẫn JSON tách token dày hơn tiếng Anh;
 * hệ số khai ở `config/models.yaml` `billing.call_cap.chars_per_token`, đặt thấp để ước CAO hơn thật
 * (an toàn cho mức chi phí).
 */
export function estimateInputTokens(chars: number, charsPerToken: number): number {
  if (!(charsPerToken > 0)) return 0;
  return Math.ceil(Math.max(0, chars) / charsPerToken);
}

export interface CallBudgetInput {
  /** Mức chi phí của lượt, USD. `null` = không giới hạn. */
  capUsd: number | null;
  /** Tiền các lời gọi ĐÃ xong của lượt (giá niêm yết). */
  spentUsd: number;
  /** Token vào ước của lời gọi sắp gửi. */
  inputTokens: number;
  /** Giới hạn token ra hiệu lực của tuyến. `null` = tuyến không đặt (không biết trần trên). */
  routeOutputTokens: number | null;
  /** `null` = tuyến chưa khai giá — không bảo đảm được mức, giữ cách cũ (T164 `unpriced`). */
  prices: CallPrices | null;
  /** Dưới số này mô hình không kịp trả lời — không gọi (`billing.call_cap.min_output_tokens`). */
  minOutputTokens: number;
}

export type CallBudget =
  /** Gọi; `outputTokens` = giới hạn token ra cho lời gọi này (`null` = theo tuyến, không biết trần). */
  | {
      kind: 'go';
      outputTokens: number | null;
      /** `true` = đã hạ dưới giới hạn của tuyến để vừa phần còn lại của mức. */
      lowered: boolean;
      /** Tiền tối đa lời gọi có thể tiêu với giới hạn trên; `null` = không tính được. */
      maxCallUsd: number | null;
    }
  /** Không gọi: phần còn lại của mức không đủ cho `minOutputTokens` token ra. */
  | { kind: 'stop'; outputTokens: number; maxCallUsd: number; minCallUsd: number };

/**
 * Quyết định cho MỘT lời gọi sắp gửi.
 *
 * `spent + maxCall > cap` thì hạ giới hạn token ra xuống `floor((cap − spent − tiền vào) / giá ra)`; giới hạn
 * sau khi hạ dưới `minOutputTokens` thì dừng trước khi gọi. Mức trống hoặc tuyến chưa có giá: gọi theo tuyến.
 */
export function callBudget(input: CallBudgetInput): CallBudget {
  const { capUsd, spentUsd, inputTokens, routeOutputTokens, prices, minOutputTokens } = input;
  if (!prices) {
    return { kind: 'go', outputTokens: routeOutputTokens, lowered: false, maxCallUsd: null };
  }
  const full =
    routeOutputTokens === null ? null : callCostUsd(inputTokens, routeOutputTokens, prices);
  if (capUsd === null) {
    return { kind: 'go', outputTokens: routeOutputTokens, lowered: false, maxCallUsd: full };
  }
  if (full !== null && spentUsd + full <= capUsd) {
    return { kind: 'go', outputTokens: routeOutputTokens, lowered: false, maxCallUsd: full };
  }
  const inputUsd = callCostUsd(inputTokens, 0, prices);
  const room = capUsd - spentUsd - inputUsd;
  const allowed =
    prices.outputPer1mUsd > 0
      ? Math.max(0, Math.floor((room * 1_000_000) / prices.outputPer1mUsd))
      : (routeOutputTokens ?? 0);
  const capped = routeOutputTokens === null ? allowed : Math.min(routeOutputTokens, allowed);
  const maxCallUsd = callCostUsd(inputTokens, capped, prices);
  if (capped < minOutputTokens) {
    return {
      kind: 'stop',
      outputTokens: capped,
      maxCallUsd,
      minCallUsd: callCostUsd(inputTokens, minOutputTokens, prices),
    };
  }
  return { kind: 'go', outputTokens: capped, lowered: true, maxCallUsd };
}
