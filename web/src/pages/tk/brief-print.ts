/**
 * Xuất bản Đầu bài thiết kế ra PDF (TK-10).
 *
 * Đối xứng với «Xuất PDF» của biên bản khảo sát, và dùng CHUNG `openPrintReport`
 * (`web/src/lib/print-report.ts`) — không thêm thư viện dựng PDF: font mặc định của jsPDF và
 * tương tự không có glyph tiếng Việt có dấu, phải tự nhúng font mới hiện đúng, đúng loại rủi
 * ro CLAUDE.md 4.1 cảnh báo (chữ do một tầng khác sinh ra, đọc mã nguồn không thấy sai).
 *
 * ⚠️ Đây là cửa sổ IN của trình duyệt, người dùng chọn đích «Lưu dưới dạng PDF» — không phải
 * một tệp `.pdf` tự tải xuống. Cùng cơ chế hai màn hình báo cáo của Module BC đang dùng.
 *
 * ── Vì sao in cả câu CHƯA trả lời ────────────────────────────────────────────────────────
 * Câu trống in dấu `—` chứ không bỏ dòng. Bỏ dòng thì người cầm bản in không phân biệt được
 * "không hỏi" với "quên hỏi" — mà bản in này tồn tại chính để mang đi hỏi tiếp cho đủ.
 *
 * Cũng vì thế nó in kèm mức độ đầy đủ, danh sách còn thiếu và chỗ chưa nhất quán: bản in mà
 * thiếu ba phần đó chỉ là ảnh chụp màn hình, không dùng được ở buổi làm việc với khách.
 */

import { formatDateTime, formatNumber } from '@nvg/shared';
import {
  BRIEF_FORM,
  valueAtPath,
  visibleFields,
  type BriefFormField,
  type DesignBriefDraft,
  type checkBriefConsistency,
  type scoreBrief,
} from '@nvg/shared/design';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { describeField, familyRows } from './brief-describe';

const EM_DASH = '—';

export interface BriefPrintInput {
  projectName: string;
  projectCode: string;
  /** Bản nháp đang xem — cùng dữ liệu màn hình đang hiện. */
  draft: DesignBriefDraft;
  /** Năm ô chữ tự do, khoá theo đường dẫn `legacy.*`. */
  legacy: Record<string, string | null>;
  version: number;
  confirmedAt: string | null;
  score: ReturnType<typeof scoreBrief>;
  issues: ReturnType<typeof checkBriefConsistency>;
  threshold: number | null;
}

function row(label: string, value: string | null): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${value ? escapeHtml(value) : EM_DASH}</td></tr>`;
}

/**
 * Bảng không gian in thành bảng THẬT, không dồn về một dòng chữ.
 *
 * Trên màn hình nó là bảng bốn cột; ép nó thành `Phòng khách · Tầng 1 · 24 m²; Bếp · …` là
 * bắt người đọc tự tách lại, và đó đúng là thứ họ cầm ra công trường để đối chiếu.
 */
function spacesTable(draft: DesignBriefDraft, floors: number): string {
  const items = draft.required_spaces ?? [];
  if (items.length === 0) return `<p class="muted">Chưa khai không gian nào.</p>`;

  const field = BRIEF_FORM.sections
    .flatMap((section) => section.fields)
    .find((f) => f.path === 'required_spaces');
  const labelOf = (type: string) =>
    field?.options?.find((option) => option.value === type)?.label ?? type;

  const head = ['Không gian', floors > 1 ? 'Tầng' : null, 'Diện tích (m²)', 'Tiện ích bổ sung']
    .filter(Boolean)
    .map((h) => `<th>${escapeHtml(String(h))}</th>`)
    .join('');

  const body = items
    .map((item) => {
      const name =
        item.ensuite == null
          ? labelOf(item.type)
          : `${labelOf(item.type)} · ${item.ensuite ? 'khép kín' : 'riêng'}`;
      const cells = [
        escapeHtml(name),
        floors > 1 ? (item.floor ? `Tầng ${item.floor}` : EM_DASH) : null,
        item.area_m2 != null ? formatNumber(item.area_m2) : EM_DASH,
        item.amenities ? escapeHtml(item.amenities) : EM_DASH,
      ].filter((cell) => cell !== null);
      return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .join('');

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Thành viên gia đình in thành BẢNG.
 *
 * Trước 07/09/2026 phần này là một dòng chữ dài nối bằng `·` và `|`:
 * «Ông bà: 2 người · 1 phòng ngủ · Tầng 1 · khép kín · Kho riêng | Vợ chồng: 2 người · …».
 * Trên màn hình nó nằm gọn một dòng và còn đọc được; ép cả năm nhóm vào một ô của bản in thì
 * người đọc phải tự tách lại năm lần, đúng lúc họ đang ngồi đối chiếu với khách.
 *
 * Cùng lý lẽ với bảng không gian: dữ liệu có cấu trúc thì in ra cấu trúc.
 */
function familyTable(draft: DesignBriefDraft, field: BriefFormField): string {
  const rows = familyRows(draft.family, field);
  if (rows.length === 0) return `<p class="muted">Chưa khai thành viên nào.</p>`;

  // Cột «Tầng» chỉ có nghĩa khi nhà nhiều hơn một tầng — cùng quy ước với bảng không gian và
  // với chính biểu mẫu.
  const multi = (draft.floors ?? 1) > 1;
  const head = [
    'Thành viên',
    'Số người',
    'Phòng ngủ',
    'Loại phòng',
    multi ? 'Tầng' : null,
    'Nhu cầu riêng',
  ]
    .filter(Boolean)
    .map((h) => `<th>${escapeHtml(String(h))}</th>`)
    .join('');

  const body = rows
    .map((row) => {
      const cells = [
        escapeHtml(row.role),
        String(row.count),
        row.bedrooms ? escapeHtml(row.bedrooms) : EM_DASH,
        // Nhóm không sinh phòng ngủ nào thì «Riêng»/«Khép kín» vô nghĩa — để trống còn hơn
        // in một lời khẳng định không có đối tượng.
        row.bedrooms ? escapeHtml(row.bedroomKind) : EM_DASH,
        multi ? (row.floor ? escapeHtml(row.floor) : EM_DASH) : null,
        row.needs.length ? escapeHtml(row.needs.join(', ')) : EM_DASH,
      ].filter((cell) => cell !== null);
      return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .join('');

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function printBrief(input: BriefPrintInput): void {
  const { draft, legacy, score, issues } = input;
  const shown = visibleFields(BRIEF_FORM, draft);
  const floors = draft.floors ?? 1;

  const valueOf = (field: BriefFormField): string | null =>
    field.path.startsWith('legacy.')
      ? (legacy[field.path.slice('legacy.'.length)] ?? null)
      : describeField(field, valueAtPath(draft, field.path), draft.family);

  // Từng bước một mục, ĐÚNG thứ tự trên màn hình — người đọc bản in và người điền biểu mẫu
  // phải đi qua cùng một trình tự thì mới đối chiếu được với nhau.
  const sections = BRIEF_FORM.sections
    .map((section) => {
      const fields = shown.filter((v) => v.section.id === section.id).map((v) => v.field);
      if (fields.length === 0) return '';
      // Hai trường có cấu trúc riêng — in thành BẢNG, không ép vào một ô của bảng dữ kiện.
      const asTable: Record<string, (field: BriefFormField) => string> = {
        required_spaces: () => spacesTable(draft, floors),
        family: (field) => familyTable(draft, field),
      };
      const plain = fields.filter((f) => !asTable[f.path]);
      const tables = fields.filter((f) => asTable[f.path]);
      const rows = plain.map((f) => row(f.label, valueOf(f))).join('');
      // Tiêu đề riêng cho bảng chỉ khi mục còn nội dung khác — mục chỉ có đúng một bảng thì
      // tiêu đề đó lặp lại y hệt tên mục ngay phía trên.
      const needsHeading = plain.length > 0 || tables.length > 1;
      const extra = tables
        .map(
          (f) => `${needsHeading ? `<h3>${escapeHtml(f.label)}</h3>` : ''}${asTable[f.path]!(f)}`,
        )
        .join('');
      const facts = rows ? `<table class="facts"><tbody>${rows}</tbody></table>` : '';
      return `<h2>${escapeHtml(section.title)}</h2>${facts}${extra}`;
    })
    .join('');

  const percent = Math.round(score.score * 100);
  const enough = input.threshold !== null && score.score >= input.threshold;
  const missing = score.missing.length
    ? `<ul>${score.missing
        .map(
          (item) =>
            `<li>${escapeHtml(item.label)}${item.optional ? ' (tùy chọn)' : ''} — ${escapeHtml(item.sectionTitle)}</li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">Không thiếu mục nào.</p>';
  const inconsistent = issues.length
    ? `<ul>${issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join('')}</ul>`
    : '<p class="muted">Không có chỗ nào chưa nhất quán.</p>';

  const status = input.confirmedAt
    ? `Đã xác nhận ${formatDateTime(input.confirmedAt)}`
    : 'Bản nháp — chưa xác nhận';

  const body = `
<table class="facts"><tbody>
${row('Dự án', input.projectName)}
${row('Mã dự án', input.projectCode)}
${row('Phiên bản đầu bài', `Bản ${input.version}`)}
${row('Trạng thái', status)}
</tbody></table>
${sections}
<h2>Mức độ đầy đủ</h2>
<p>${percent}% — ${
    input.threshold === null
      ? 'chưa cấu hình mức đầy đủ tối thiểu'
      : enough
        ? 'đã đủ thông tin để dựng phương án tự động'
        : `chưa đủ để dựng phương án tự động, cần từ ${Math.round(input.threshold * 100)}%`
  }</p>
<h3>Còn thiếu (${score.missing.length})</h3>
${missing}
<h3>Chỗ chưa nhất quán (${issues.length})</h3>
${inconsistent}
`;

  openPrintReport(`Đầu bài thiết kế — ${input.projectName}`, body);
}
