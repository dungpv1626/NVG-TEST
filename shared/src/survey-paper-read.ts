/**
 * Máy đọc phiếu khảo sát giấy (anh Dũng 28/10/2026) — danh mục ô dùng chung Worker và giao diện.
 *
 * Sáu ô báo cáo (`SURVEY_REPORT_FIELDS`) cộng nhóm «Thông tin hiện trường» riêng của pháp nhân
 * (`SURVEY_SITE_FORMS`), CÙNG THỨ TỰ với phiếu in và màn hình. Ô phiếu riêng mang tiền tố `site.`
 * để khoá không bao giờ đụng nhau. Worker chỉ nhận khoá có trong danh mục này; giao diện dùng nó
 * để biết ô nào đang có nội dung (không đè) và áp vào biểu mẫu biên bản.
 */

import { SURVEY_REPORT_FIELDS } from './crm';
import { surveySiteForm } from './survey-forms';

/** Gợi ý của sáu ô — in mờ dưới tên mục trên phiếu giấy, và nói cho máy biết ô đó chứa gì. */
export const SURVEY_REPORT_FIELD_HINTS: Readonly<Record<string, string>> = {
  needs: 'Loại công trình, quy mô, công năng khách hàng cần',
  decision_maker: 'Người thật sự chốt, không phải người liên hệ — họ tên và vai trò',
  budget_note: 'Khoảng ngân sách khách nêu',
  schedule_note: 'Thời điểm khởi công, thời hạn bàn giao',
  commercial_terms: 'Đợt thanh toán, bảo lãnh, bảo hành',
  notes: 'Hiện trạng mặt bằng, rủi ro nhận thấy, điểm cần lưu ý khi báo giá',
};

export const PAPER_SITE_PREFIX = 'site.';

export interface PaperField {
  key: string;
  label: string;
  hint?: string;
  group: 'report' | 'site';
}

/** Mọi ô máy được đọc trên phiếu của một pháp nhân, theo thứ tự in. */
export function surveyPaperFields(companyCode: string | null | undefined): PaperField[] {
  const report: PaperField[] = SURVEY_REPORT_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    hint: SURVEY_REPORT_FIELD_HINTS[f.key],
    group: 'report',
  }));
  const site: PaperField[] = (surveySiteForm(companyCode)?.fields ?? []).map((f) => ({
    key: `${PAPER_SITE_PREFIX}${f.key}`,
    label: f.label,
    hint: f.hint,
    group: 'site',
  }));
  return [...report, ...site];
}

/** Một ô máy đọc được, đã kiểm khoá và đã lược danh tính. */
export interface PaperReadItem {
  key: string;
  label: string;
  group: 'report' | 'site';
  value: string;
  confidence: 'ro' | 'khong_ro';
}

/**
 * Ô chọn sẵn: chỉ ô biên bản còn TRỐNG. Ô đã có nội dung không chọn sẵn — người dùng phải tự
 * chọn nếu muốn thay, máy không đè lặng lẽ.
 */
export function paperInitialSelection(
  items: readonly PaperReadItem[],
  current: Readonly<Record<string, string | null | undefined>>,
): Set<string> {
  return new Set(items.filter((i) => !(current[i.key] ?? '').trim()).map((i) => i.key));
}
