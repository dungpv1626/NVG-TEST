/**
 * Máy đọc phiếu khảo sát giấy — phần THUẦN của tuyến `POST /ai/survey-paper-read` (tuyến ở `index.ts`).
 *
 * Ảnh tới đây ĐÃ được trình duyệt tô trắng khung thông tin khách (tên, điện thoại, địa chỉ, chữ ký —
 * `web/src/pages/crm/paper-redact.ts`). Hàng rào thứ hai ở đây: lời dẫn dặn không chép danh tính, và mọi
 * giá trị trả về đi qua `scrubIdentity` với danh tính khách của cơ hội trước khi rời Worker (CLAUDE.md 5.1).
 * Mô hình chỉ trả NHÁP theo hợp đồng `contracts/ai-survey-paper-read.schema.json`; khoá lạ bị loại.
 */

import { surveyPaperFields, type PaperField, type PaperReadItem } from '@nvg/shared';
import type { AiSurveyPaperRead } from '@nvg/shared/design';
import { scrubIdentity } from '../design/brief/anonymise';

/** Giới hạn ảnh: 1–4 trang JPEG, mỗi trang ≤ 1,5 MB, cả lượt ≤ 4 MB (đo trên dữ liệu sau giải base64). */
export const PAPER_MAX_PAGES = 4;
export const PAPER_MAX_PAGE_BYTES = 1_500_000;
export const PAPER_MAX_TOTAL_BYTES = 4_000_000;

export interface PaperPage {
  mime_type: 'image/jpeg';
  data: string;
}

/** Kiểm ảnh gửi lên. Trả câu lỗi tiếng Việt, hoặc danh sách trang hợp lệ. */
export function parsePaperPages(raw: unknown): { pages: PaperPage[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Chưa có ảnh trang phiếu nào.' };
  if (raw.length > PAPER_MAX_PAGES)
    return { error: `Mỗi lượt đọc tối đa ${PAPER_MAX_PAGES} trang phiếu.` };
  const pages: PaperPage[] = [];
  let total = 0;
  for (const p of raw as { mime_type?: unknown; data?: unknown }[]) {
    if (p?.mime_type !== 'image/jpeg' || typeof p.data !== 'string')
      return { error: 'Ảnh trang phiếu phải là JPEG.' };
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p.data)) return { error: 'Ảnh trang phiếu không đọc được.' };
    const bytes = Math.floor((p.data.length * 3) / 4);
    if (bytes > PAPER_MAX_PAGE_BYTES)
      return { error: 'Ảnh một trang quá lớn — quét lại hoặc thử lại.' };
    total += bytes;
    pages.push({ mime_type: 'image/jpeg', data: p.data });
  }
  if (total > PAPER_MAX_TOTAL_BYTES) return { error: 'Các ảnh trang phiếu quá lớn cho một lượt.' };
  return { pages };
}

/**
 * Danh tính khách của cơ hội: tên khách, tên gọi, người liên hệ, người đại diện, điện thoại, email,
 * địa chỉ, mã số thuế. Tên gọi (chữ cuối) chỉ bị cắt khi đứng sau danh xưng («anh Phát»), xem
 * `scrubIdentity`.
 */
export function paperIdentities(
  customer: {
    name?: string | null;
    contact_person?: string | null;
    representative_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    tax_code?: string | null;
  } | null,
): string[] {
  if (!customer) return [];
  const out: string[] = [];
  const person = (raw: string | null | undefined) => {
    const name = (raw ?? '')
      .replace(/\(.*?\)/g, ' ')
      .replace(/^(ông|bà|anh|chị|cô|chú|bác|em)\s+/i, '')
      .trim();
    if (!name) return;
    out.push(name);
    const given = name.split(/\s+/).pop();
    if (given && given !== name) out.push(given);
  };
  person(customer.name);
  person(customer.contact_person);
  person(customer.representative_name);
  for (const v of [customer.phone, customer.email, customer.address, customer.tax_code]) {
    const t = (v ?? '').trim();
    if (t) out.push(t);
  }
  // Điện thoại lưu có dấu cách («0988 100 606») — thêm bản chỉ chữ số.
  const digits = (customer.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 8) out.push(digits);
  return out;
}

export function paperPrompt(fields: readonly PaperField[]): string {
  return [
    'Bạn giúp nhân viên kinh doanh một công ty xây dựng ở Việt Nam chép lại PHIẾU KHẢO SÁT viết tay.',
    'Ảnh là các trang của phiếu in sẵn; mỗi mục có tiêu đề in đậm và chỗ viết tay bên dưới hoặc bên phải.',
    'Khung đầu trang đã được tô trắng — đó là chỗ thông tin khách, cố ý không gửi.',
    'Với từng mục dưới đây: chép chữ viết tay của mục đó vào `value`, gần nguyên văn, tiếng Việt có dấu.',
    'Mục để trống, gạch bỏ hoặc không thấy trên ảnh thì KHÔNG trả mục đó. Không đoán, không thêm ý.',
    'Đọc được nhưng không chắc chữ nào thì vẫn trả, đặt `confidence` = "khong_ro"; đọc rõ thì "ro".',
    'KHÔNG chép họ tên người, số điện thoại, email, địa chỉ nhà riêng — bỏ phần đó khỏi giá trị.',
    'Mục «Người quyết định»: chỉ ghi vai trò (ví dụ «Giám đốc công ty»), không ghi họ tên.',
    'Số tiền, kích thước, ngày tháng chép đúng như viết.',
    '',
    'Các mục (khoá | tên mục in trên phiếu | gợi ý):',
    ...fields.map((f) => `- ${f.key} | ${f.label}${f.hint ? ` | ${f.hint}` : ''}`),
  ].join('\n');
}

/** Lược đồ trả về cho Gemini (`responseSchema`) — cùng hình với hợp đồng `ai-survey-paper-read`. */
export const PAPER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fields: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          key: { type: 'STRING' },
          value: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['ro', 'khong_ro'] },
        },
        required: ['key', 'value', 'confidence'],
      },
    },
  },
  required: ['fields'],
};

/**
 * Kiểm lời đáp: khoá phải có trong danh mục của pháp nhân, giá trị không rỗng, mỗi khoá một lần
 * (lần đầu thắng), danh tính khách bị lược. Trả kèm thứ tự in của phiếu.
 */
export function normalizePaperRead(
  fields: readonly PaperField[],
  raw: AiSurveyPaperRead,
  identities: readonly string[],
): { accepted: PaperReadItem[]; rejected: { key: string; reason: string }[] } {
  const byKey = new Map(fields.map((f, i) => [f.key, { f, i }]));
  const got = new Map<string, PaperReadItem>();
  const rejected: { key: string; reason: string }[] = [];
  for (const item of raw.fields) {
    const known = byKey.get(item.key);
    if (!known) {
      rejected.push({ key: item.key, reason: 'không phải ô của phiếu này' });
      continue;
    }
    const value = scrubIdentity(item.value.trim(), identities).trim();
    if (!value || /^(\[đã lược\][\s,.;:-]*)+$/u.test(value)) continue;
    if (got.has(item.key)) continue;
    got.set(item.key, {
      key: item.key,
      label: known.f.label,
      group: known.f.group,
      value,
      confidence: item.confidence,
    });
  }
  const accepted = [...got.values()].sort((a, b) => byKey.get(a.key)!.i - byKey.get(b.key)!.i);
  return { accepted, rejected };
}

/** Nháp MẪU cho chế độ giả lập — mọi giá trị ghi rõ «[Giả lập]», không lấy gì từ ảnh. */
export function fakePaperRead(companyCode: string | null | undefined): AiSurveyPaperRead {
  const fields = surveyPaperFields(companyCode);
  const sample: Record<string, string> = {
    needs: '[Giả lập] Xây nhà xưởng khung thép khoảng 1.500 m², có văn phòng 2 tầng.',
    decision_maker: '[Giả lập] Giám đốc công ty.',
    budget_note: '[Giả lập] Khoảng 6 tỷ đồng.',
    schedule_note: '[Giả lập] Muốn khởi công tháng 12, xong trước Tết.',
    notes: '[Giả lập] Đất đã san lấp, đường vào hẹp, xe container khó quay đầu.',
  };
  const out: AiSurveyPaperRead['fields'] = fields
    .filter((f) => sample[f.key])
    .map((f) => ({ key: f.key, value: sample[f.key]!, confidence: 'ro' }));
  const firstSite = fields.find((f) => f.group === 'site');
  if (firstSite)
    out.push({
      key: firstSite.key,
      value: '[Giả lập] Chữ khó đọc — kiểm lại với phiếu.',
      confidence: 'khong_ro',
    });
  return { fields: out };
}
