/**
 * Điền sẵn đầu bài thiết kế từ khảo sát — phần THUẦN của tuyến `POST /ai/brief-prefill` (tuyến ở `index.ts`).
 *
 * Nguồn (anh Dũng chọn 27/10/2026): khảo sát thiết kế của hồ sơ (số đo, bốn ô ghi chú, lời chủ nhà đã chép chữ),
 * các ô chữ cũ của đầu bài, và báo cáo khảo sát CRM ĐÃ DUYỆT của cơ hội gắn với hồ sơ. Mọi đoạn chữ đi qua
 * `scrubIdentity` với tên / điện thoại / địa chỉ khách trước khi rời Worker (hạng 2, T12). Không gửi người quyết
 * định, ngân sách, điều khoản thương mại của báo cáo CRM — đầu bài không điền sẵn mấy câu đó.
 *
 * Mô hình chỉ trả ĐỀ XUẤT theo hợp đồng `contracts/ai-brief-prefill.schema.json`; `normalizePrefill` kiểm từng câu.
 * Tuyến không ghi gì vào đầu bài.
 */

import {
  prefillQuestions,
  type AiBriefPrefillSuggestion,
  type BriefFormConfig,
} from '@nvg/shared/design';
import { scrubIdentity } from '../design/brief/anonymise';

export interface PrefillSources {
  designSurvey: {
    land_width: number | string | null;
    land_depth: number | string | null;
    land_area: number | string | null;
    orientation: string | null;
    measurement_notes: string | null;
    surrounding_notes: string | null;
    usage_notes: string | null;
    notes: string | null;
  } | null;
  transcripts: string[];
  legacy: Record<string, string | null> | null;
  crm: {
    needs: string | null;
    notes: string | null;
    details: { label: string; value: string }[];
  } | null;
}

const LEGACY_LABELS: Record<string, string> = {
  design_task: 'Nhiệm vụ thiết kế',
  functional_needs: 'Ghi chú về công năng',
  style_note: 'Ghi chú về phong cách',
  site_condition: 'Ghi chú về hiện trạng',
};

/**
 * Danh tính cần lược: họ tên đầy đủ, điện thoại, địa chỉ — CỘNG tên gọi (chữ cuối của họ tên). Lời chủ nhà nói «anh Mẫu»,
 * không đọc cả họ tên, nên chỉ lược họ tên đầy đủ là để tên lọt sang mô hình (thấy khi dựng dữ liệu thử 27/10/2026).
 * `scrubIdentity` chỉ xoá từ đơn khi nó đứng sau danh xưng, nên «Mẫu» trong «mẫu nhà» không bị cắt.
 */
export function customerIdentities(
  customer:
    { name?: string | null; phone?: string | null; address?: string | null } | null | undefined,
): (string | null | undefined)[] {
  const name = (customer?.name ?? '').replace(/\(.*?\)/g, ' ').trim();
  const given = name.split(/\s+/).pop();
  return [name || null, given && given !== name ? given : null, customer?.phone, customer?.address];
}

/** Tài liệu khảo sát đã lược danh tính, chia mục. Rỗng = không có gì để đọc. */
export function prefillDocument(
  sources: PrefillSources,
  identities: readonly (string | null | undefined)[],
): string {
  const clean = (text: string | null | undefined) => {
    const t = (text ?? '').trim();
    return t ? scrubIdentity(t, identities) : null;
  };
  const parts: string[] = [];
  const s = sources.designSurvey;
  if (s) {
    const lines = [
      s.land_width ? `Chiều rộng lô đo được: ${s.land_width} m` : null,
      s.land_depth ? `Chiều sâu lô đo được: ${s.land_depth} m` : null,
      s.land_area ? `Diện tích lô: ${s.land_area} m²` : null,
      s.orientation ? `Hướng: ${clean(s.orientation)}` : null,
      clean(s.measurement_notes) && `Ghi chú đo đạc: ${clean(s.measurement_notes)}`,
      clean(s.surrounding_notes) && `Xung quanh: ${clean(s.surrounding_notes)}`,
      clean(s.usage_notes) && `Nhu cầu sử dụng: ${clean(s.usage_notes)}`,
      clean(s.notes) && `Ghi chú khác: ${clean(s.notes)}`,
    ].filter(Boolean);
    if (lines.length) parts.push(`## Biên bản khảo sát thiết kế\n${lines.join('\n')}`);
  }
  const talk = sources.transcripts.map(clean).filter(Boolean);
  if (talk.length)
    parts.push(
      `## Lời chủ nhà (chép từ ghi âm)\n${talk.map((t, i) => `Đoạn ${i + 1}: ${t}`).join('\n')}`,
    );
  if (sources.legacy) {
    const lines = Object.entries(LEGACY_LABELS)
      .map(([key, label]) => {
        const v = clean(sources.legacy?.[key]);
        return v ? `${label}: ${v}` : null;
      })
      .filter(Boolean);
    if (lines.length) parts.push(`## Ghi chú đã có trong đầu bài\n${lines.join('\n')}`);
  }
  const crm = sources.crm;
  if (crm) {
    const lines = [
      clean(crm.needs) && `Nhu cầu: ${clean(crm.needs)}`,
      clean(crm.notes) && `Ghi chú: ${clean(crm.notes)}`,
      ...crm.details.map((d) => `${d.label}: ${clean(d.value)}`),
    ].filter(Boolean);
    if (lines.length)
      parts.push(`## Báo cáo khảo sát của Kinh doanh (đã duyệt)\n${lines.join('\n')}`);
  }
  return parts.join('\n\n');
}

/** Lời dẫn: danh mục câu hỏi (mã + nhãn + kiểu + lựa chọn) rồi tài liệu. */
export function prefillPrompt(config: BriefFormConfig, document: string): string {
  const questions = prefillQuestions(config).map((q) => {
    const kind = {
      choice: 'chọn một',
      select: 'chọn một',
      multi: 'chọn nhiều (mã cách nhau dấu phẩy)',
      number: `số${q.unit ? ` (${q.unit})` : ''}${q.min !== undefined ? `, từ ${q.min}` : ''}${q.max !== undefined ? ` tới ${q.max}` : ''}`,
      tristate: 'true / false',
      text: 'chữ',
      textarea: 'chữ',
    }[q.control];
    const opts = q.options?.length
      ? ` — lựa chọn: ${q.options.map((o) => `${o.value}=${o.label}`).join('; ')}`
      : '';
    return `- ${q.path} | ${q.label} | ${kind}${opts}`;
  });
  return [
    'Bạn giúp kiến trúc sư một công ty thiết kế – xây dựng nhà ở Việt Nam điền sẵn đầu bài thiết kế từ tài liệu khảo sát.',
    'Chỉ đề xuất câu có CĂN CỨ rõ trong tài liệu; kèm câu gốc (chép nguyên văn, ngắn) ở `quote`.',
    'Không suy đoán: tài liệu không nói thì KHÔNG đề xuất câu đó. Không nhắc tới không có nghĩa là «không».',
    'Ô chọn phải dùng đúng MÃ trong danh sách lựa chọn. Ô số ghi số theo đơn vị của câu, dấu chấm thập phân.',
    '`value` chỉ chứa đúng giá trị: số thì chỉ chữ số (ví dụ 8 hoặc 0.85 không kèm dấu hai chấm, dấu phẩy, đơn vị); có / không thì đúng true hoặc false.',
    'Chỗ ghi [đã lược] là thông tin đã che — không dùng làm giá trị.',
    'Mặt trước / sau / trái / phải tính khi đứng ngoài đường nhìn vào nhà.',
    '',
    'Danh mục câu hỏi (mã | nhãn | kiểu):',
    ...questions,
    '',
    'Tài liệu khảo sát:',
    document,
  ].join('\n');
}

/** Lược đồ trả về cho Gemini (`responseSchema`) — cùng hình với hợp đồng `ai-brief-prefill`. */
export const PREFILL_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING' },
          value: { type: 'STRING' },
          quote: { type: 'STRING' },
        },
        required: ['path', 'value', 'quote'],
      },
    },
  },
  required: ['suggestions'],
};

/**
 * Đề xuất MẪU cho chế độ giả lập — chỉ dựng từ số đo thật của biên bản (không bịa), cộng một câu ghi rõ
 * «[Giả lập]» để chạy thử đường hiện và áp.
 */
export function fakePrefill(sources: PrefillSources): AiBriefPrefillSuggestion[] {
  const out: AiBriefPrefillSuggestion[] = [];
  const s = sources.designSurvey;
  if (s?.land_width)
    out.push({
      path: 'site.width_m',
      value: String(s.land_width),
      quote: `[Giả lập] Chiều rộng lô đo được: ${s.land_width} m`,
    });
  if (s?.land_depth)
    out.push({
      path: 'site.depth_m',
      value: String(s.land_depth),
      quote: `[Giả lập] Chiều sâu lô đo được: ${s.land_depth} m`,
    });
  if (s?.land_area)
    out.push({
      path: 'site.area_m2',
      value: String(s.land_area),
      quote: `[Giả lập] Diện tích lô: ${s.land_area} m²`,
    });
  out.push({
    path: 'style',
    value: 'hien_dai',
    quote: '[Giả lập] Gia đình thích phong cách hiện đại.',
  });
  return out;
}
