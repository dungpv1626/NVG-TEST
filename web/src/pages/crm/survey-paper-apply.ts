/**
 * Nối máy đọc phiếu giấy với biểu mẫu biên bản khảo sát (`survey-panel.tsx`): khoá ô của máy đọc
 * (`surveyPaperFields` — sáu ô báo cáo + `site.<khoá>`) ↔ trường của biểu mẫu.
 */

import { PAPER_SITE_PREFIX } from '@nvg/shared';
import type { PaperApplyEntry } from './survey-paper-read-panel';

export interface SurveyReportForm {
  needs: string;
  decisionMaker: string;
  budgetNote: string;
  scheduleNote: string;
  commercialTerms: string;
  notes: string;
  siteDetails: Record<string, string>;
}

/** Sáu ô báo cáo: khoá CSDL (máy đọc phiếu dùng) ↔ trường của biểu mẫu. */
const REPORT_FORM_FIELDS = {
  needs: 'needs',
  decision_maker: 'decisionMaker',
  budget_note: 'budgetNote',
  schedule_note: 'scheduleNote',
  commercial_terms: 'commercialTerms',
  notes: 'notes',
} as const satisfies Record<string, Exclude<keyof SurveyReportForm, 'siteDetails'>>;

/** Nội dung hiện có của từng ô theo khoá của máy đọc phiếu. */
export function paperCurrentValues(form: SurveyReportForm): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(REPORT_FORM_FIELDS)) out[key] = form[field];
  for (const [key, value] of Object.entries(form.siteDetails))
    out[`${PAPER_SITE_PREFIX}${key}`] = value;
  return out;
}

/** Đặt chữ máy đọc vào biểu mẫu — chỉ các ô người dùng đã chọn; khoá lạ bỏ qua. Không lưu. */
export function applyPaperEntries<F extends SurveyReportForm>(
  form: F,
  entries: readonly PaperApplyEntry[],
): F {
  const next: F = { ...form, siteDetails: { ...form.siteDetails } };
  for (const { key, value } of entries) {
    if (key.startsWith(PAPER_SITE_PREFIX)) {
      next.siteDetails[key.slice(PAPER_SITE_PREFIX.length)] = value;
    } else if (Object.hasOwn(REPORT_FORM_FIELDS, key)) {
      next[REPORT_FORM_FIELDS[key as keyof typeof REPORT_FORM_FIELDS]] = value;
    }
  }
  return next;
}
