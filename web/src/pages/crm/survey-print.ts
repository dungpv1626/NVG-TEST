/**
 * In biên bản khảo sát Kinh doanh và phiếu khảo sát TRỐNG để điền tay (chủ dự án 18/10/2026).
 *
 * Dùng chung cửa sổ in `openPrintReport` (người dùng chọn «Lưu dưới dạng PDF») như biên bản
 * khảo sát của Thiết kế — không nhúng thư viện PDF vì font thiếu dấu tiếng Việt (CLAUDE.md 4.1).
 *
 * Phiếu trống có ĐÚNG sáu mục của báo cáo (`SURVEY_REPORT_FIELDS`), cùng thứ tự với sáu ô trên
 * màn hình: về văn phòng chụp phiếu tải lên (loại «Phiếu khảo sát giấy») rồi gõ lại từng ô theo
 * thứ tự, không phải dò. Mọi chữ động đi qua `escapeHtml`.
 */

import {
  formatDateTime,
  SURVEY_ATTACHMENT_KIND_LABELS,
  SURVEY_REPORT_FIELDS,
  SURVEY_REPORT_STATUS_META,
} from '@nvg/shared';
import type { SiteSurveyRecord } from '@/hooks/use-site-surveys';
import { isPreviewableImage, type SurveyAttachment } from '@/hooks/use-survey-attachments';
import { escapeHtml, openPrintReport } from '@/lib/print-report';

export interface SurveyPrintInfo {
  code: string;
  name: string;
  customerName: string | null;
  contactPerson: string | null;
  phone: string | null;
  companyName: string | null;
}

/** Gợi ý in mờ dưới tên mục — giống chữ gợi ý trong ô nhập trên màn hình. */
const FIELD_HINTS: Record<string, string> = {
  needs: 'Loại công trình, quy mô, công năng khách hàng cần',
  decision_maker: 'Người thật sự chốt, không phải người liên hệ — họ tên và vai trò',
  budget_note: 'Khoảng ngân sách khách nêu',
  schedule_note: 'Thời điểm khởi công, thời hạn bàn giao',
  commercial_terms: 'Đợt thanh toán, bảo lãnh, bảo hành',
  notes: 'Hiện trạng mặt bằng, rủi ro nhận thấy, điểm cần lưu ý khi báo giá',
};

/** Số dòng kẻ để viết tay cho từng mục — mục hiện trạng cần nhiều chỗ nhất. */
const FIELD_LINES: Record<string, number> = {
  needs: 5,
  decision_maker: 2,
  budget_note: 2,
  schedule_note: 2,
  commercial_terms: 3,
  notes: 6,
};

const FORM_STYLE = `<style>
  .field { margin: 0 0 14px; break-inside: avoid; }
  .field h2 { margin: 0; }
  .hint { color: #44546F; font-size: 11px; margin: 2px 0 4px; }
  .line { border-bottom: 1px solid #8A9097; height: 26px; }
  .head td { height: 28px; }
  .head td.k { width: 22%; color: #44546F; }
  .sketch { border: 1px solid #8A9097; height: 260px; margin-top: 4px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; text-align: center; }
  .sign p { margin: 0 0 64px; font-weight: 600; }
  .files { margin: 0; padding-left: 18px; }
</style>`;

function value(v: string | null | undefined): string {
  return v ? escapeHtml(v) : '';
}

function headTable(info: SurveyPrintInfo | null, rows: [string, string][]): string {
  const base: [string, string][] = [
    ['Cơ hội', info ? `${value(info.code)} — ${value(info.name)}` : ''],
    ['Khách hàng', value(info?.customerName)],
    [
      'Người liên hệ / điện thoại',
      [value(info?.contactPerson), value(info?.phone)].filter(Boolean).join(' · '),
    ],
    ['Địa chỉ công trình', ''],
  ];
  return `<table class="head">${[...base, ...rows]
    .map(([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td>${v}</td></tr>`)
    .join('')}</table>`;
}

/** Phiếu khảo sát trống — in ra mang theo khi không tiện dùng điện thoại. */
export function printBlankSurveyForm(info: SurveyPrintInfo | null): void {
  const fields = SURVEY_REPORT_FIELDS.map(
    (f) => `<div class="field">
      <h2>${escapeHtml(f.label)}</h2>
      <p class="hint">${escapeHtml(FIELD_HINTS[f.key] ?? '')}</p>
      ${'<div class="line"></div>'.repeat(FIELD_LINES[f.key] ?? 3)}
    </div>`,
  ).join('');

  const body = `${FORM_STYLE}
    ${headTable(info, [
      ['Người khảo sát', ''],
      ['Bắt đầu lúc', '……… giờ ……… ngày ……… / ……… / …………'],
      ['Kết thúc lúc', '……… giờ ……… ngày ……… / ……… / …………'],
    ])}
    ${fields}
    <div class="field">
      <h2>Sơ đồ hiện trạng</h2>
      <p class="hint">Vẽ phác mặt bằng, hướng, lối vào, kích thước đo được</p>
      <div class="sketch"></div>
    </div>
    <div class="sign">
      <div><p>Người khảo sát</p><span class="hint">(ký, ghi rõ họ tên)</span></div>
      <div><p>Đại diện khách hàng</p><span class="hint">(ký, ghi rõ họ tên — nếu có)</span></div>
    </div>
    <p class="hint">Về văn phòng: chụp phiếu này tải lên biên bản khảo sát (loại «Phiếu khảo sát giấy»)
      rồi gõ sáu mục vào hệ thống theo đúng thứ tự trên.</p>`;

  const title = info?.companyName ? `Phiếu khảo sát — ${info.companyName}` : 'Phiếu khảo sát';
  openPrintReport(title, body);
}

/** Biên bản đã điền: sáu mục, giờ máy ghi, trạng thái duyệt, ảnh và danh sách tệp kèm. */
export function printSurveyReport(
  survey: SiteSurveyRecord,
  info: SurveyPrintInfo | null,
  attachments: SurveyAttachment[],
): void {
  const images = attachments.filter((a) => a.url && isPreviewableImage(a.mime_type));
  const others = attachments.filter((a) => !images.includes(a));
  const missing = attachments.filter((a) => !a.url).length;

  const fields = SURVEY_REPORT_FIELDS.map((f) => {
    const v = survey[f.key as keyof SiteSurveyRecord] as string | null;
    return `<div class="block"><strong>${escapeHtml(f.label)}</strong><p>${
      v ? escapeHtml(v) : '<span class="muted">Chưa ghi</span>'
    }</p></div>`;
  }).join('');

  const when = (iso: string | null) => (iso ? escapeHtml(formatDateTime(iso)) : '');
  const status = SURVEY_REPORT_STATUS_META[survey.report_status]?.label ?? '';

  const body = `${FORM_STYLE}
    ${headTable(info, [
      ['Người khảo sát', value(survey.surveyor?.full_name)],
      ['Lịch hẹn', when(survey.scheduled_at)],
      [
        'Bắt đầu / kết thúc',
        [when(survey.started_at), when(survey.finished_at)].filter(Boolean).join(' → ') ||
          when(survey.surveyed_at),
      ],
      [
        'Báo cáo',
        `${escapeHtml(status)}${survey.report_decided_at ? ` — ${when(survey.report_decided_at)}` : ''}`,
      ],
    ])}
    ${fields}
    ${
      images.length
        ? `<h2>Ảnh (${images.length})</h2><div class="photos">${images
            .map(
              (a) =>
                `<figure><img src="${escapeHtml(a.url!)}" alt="" /><figcaption>${escapeHtml(
                  SURVEY_ATTACHMENT_KIND_LABELS[a.kind],
                )}${a.caption ? ` — ${escapeHtml(a.caption)}` : ''}</figcaption></figure>`,
            )
            .join('')}</div>`
        : ''
    }
    ${
      others.length
        ? `<h2>Tệp đính kèm khác (${others.length})</h2><ul class="files">${others
            .map(
              (a) =>
                `<li>${escapeHtml(a.file_name)} — ${escapeHtml(SURVEY_ATTACHMENT_KIND_LABELS[a.kind])}${
                  a.caption ? ` — ${escapeHtml(a.caption)}` : ''
                }</li>`,
            )
            .join('')}</ul>`
        : ''
    }
    ${missing ? `<p class="muted">${missing} tệp không lấy được đường dẫn — không có trong bản in.</p>` : ''}`;

  openPrintReport(`Biên bản khảo sát${info ? ` — ${info.code}` : ''}`, body);
}
