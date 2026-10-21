/**
 * Gợi ý điều khoản hợp đồng từ báo giá và báo cáo khảo sát của cơ hội nguồn.
 *
 * Kinh doanh trước đây gõ lại tay nhóm «Phạm vi công việc» và «Giá trị» dù cả hai đã nằm trong
 * báo giá đã gửi khách và báo cáo khảo sát Ban Giám đốc đã duyệt (anh Dũng chạy thử 21/10/2026).
 * Đây chỉ là NHÁP mở sẵn trong ô nhập — người soạn đọc, sửa rồi mới lưu.
 *
 * Cố ý KHÔNG gợi ý «Tiến độ thanh toán»: tỷ lệ chia đợt là quyết định của từng pháp nhân, chưa
 * có cấu hình (anh Dũng chọn để trống) — máy không bịa số (CLAUDE.md 5.2).
 */

import { formatCurrency, formatDate } from './format';

export interface TermSuggestQuote {
  code: string;
  version: number;
  total_value: string | number | null;
  discount_amount: string | number | null;
  discount_reason: string | null;
  notes: string | null;
  sent_to_customer_at: string | null;
}

export interface TermSuggestSurvey {
  surveyed_at: string | null;
  needs: string | null;
  schedule_note: string | null;
}

export interface TermSuggestion {
  description: string;
  amount: string | null;
  notes: string | null;
  /** Câu nói nguồn của gợi ý, hiện cho người soạn. */
  source: string;
}

function quoteName(q: TermSuggestQuote): string {
  return `báo giá ${q.code} (phiên bản ${q.version}${q.sent_to_customer_at ? `, gửi khách ${formatDate(q.sent_to_customer_at)}` : ''})`;
}

export function suggestContractTerms(
  quote: TermSuggestQuote | null,
  survey: TermSuggestSurvey | null,
): { pham_vi: TermSuggestion | null; gia_tri: TermSuggestion | null } {
  const sources: string[] = [];
  if (quote) sources.push(quoteName(quote));
  if (survey) sources.push(`báo cáo khảo sát ${formatDate(survey.surveyed_at)}`);

  const scopeParts: string[] = [];
  if (quote?.notes?.trim()) scopeParts.push(quote.notes.trim());
  if (survey?.needs?.trim()) scopeParts.push(`Yêu cầu của khách hàng: ${survey.needs.trim()}`);
  const pham_vi: TermSuggestion | null =
    scopeParts.length > 0
      ? {
          description: scopeParts.join('\n'),
          amount: null,
          notes: survey?.schedule_note?.trim()
            ? `Tiến độ khách mong muốn: ${survey.schedule_note.trim()}`
            : null,
          source: `Lấy từ ${sources.join(' và ')}`,
        }
      : null;

  let gia_tri: TermSuggestion | null = null;
  if (quote && quote.total_value != null && BigInt(quote.total_value) > 0n) {
    const value = BigInt(quote.total_value);
    const discount = quote.discount_amount != null ? BigInt(quote.discount_amount) : 0n;
    gia_tri = {
      description: `Giá trị hợp đồng theo ${quoteName(quote)}: ${formatCurrency(value)}.`,
      amount: value.toString(),
      notes:
        discount > 0n
          ? `Báo giá có giảm ${formatCurrency(discount)}${quote.discount_reason ? ` — ${quote.discount_reason}` : ''}.`
          : null,
      source: `Lấy từ ${quoteName(quote)}`,
    };
  }

  return { pham_vi, gia_tri };
}
