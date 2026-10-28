/**
 * Điền sẵn đầu bài từ khảo sát (anh Dũng 27/10/2026: «sau một biên bản khảo sát AI sẽ đọc và hệ thống sẽ điền,
 * đưa ra những phần nào còn thiếu thì điền — tự điền từ đầu cũng là một lựa chọn»).
 *
 * Hai nửa dùng chung cho Worker và giao diện:
 *  - `prefillQuestions` — những câu máy được phép đề xuất, kèm mã lựa chọn, để dựng lời dẫn cho mô hình.
 *  - `normalizePrefill` — kiểm từng đề xuất của mô hình theo ĐÚNG cấu hình biểu mẫu: câu có thật, đúng mã lựa
 *    chọn, số trong khoảng, rồi đổi sang đúng kiểu lưu (số theo `value_scale`, có / không thành boolean). Đề xuất
 *    sai bị loại kèm lý do, không sửa đoán.
 *
 * Chỉ các ô đơn (chọn, chọn nhiều, số, có / không, chữ). Ô bảng (gia đình, không gian, đa giác, bốn mặt, ngân
 * sách, mặt đứng) để người khai: đề xuất sai một dòng trong bảng khó thấy hơn nhiều so với một ô đơn.
 * Kết quả là ĐỀ XUẤT — kiến trúc sư chọn câu nào dùng (PRD 2.3).
 */

import type { BriefFormConfig, BriefFormField } from './brief-form';
import { storedNumber, valueAtPath, isAnswered } from './brief-form';
import type { AiBriefPrefillSuggestion } from './ai-brief-prefill.generated';

export const PREFILL_CONTROLS = [
  'choice',
  'select',
  'multi',
  'number',
  'tristate',
  'text',
  'textarea',
] as const;

export interface PrefillQuestion {
  path: string;
  label: string;
  control: (typeof PREFILL_CONTROLS)[number];
  unit?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}

/**
 * Câu là DANH TÍNH (tên người quyết định) — không điền sẵn: tài liệu gửi mô hình đã lược tên, và test case thật
 * 27/10/2026 cho thấy mô hình lấy luôn chỗ đã lược («anh [đã lược]») làm câu trả lời.
 */
const IDENTITY_PATHS = new Set(['decision_maker.name']);

/** Dấu thay chỗ danh tính đã lược — trùng `REDACTED` của `workers/src/design/brief/anonymise.ts`. */
const REDACTED_MARK = '[đã lược]';

function eligible(field: BriefFormField): boolean {
  return (
    (PREFILL_CONTROLS as readonly string[]).includes(field.control) &&
    !field.path.startsWith('legacy.') &&
    !field.path.startsWith('custom.') &&
    !IDENTITY_PATHS.has(field.path)
  );
}

/**
 * Gọt ký tự thừa hai đầu giá trị: test case thật 27/10/2026, Gemini trả mọi ô số / có-không dạng «: 3,» «: true,» (mảnh
 * JSON lọt vào chuỗi) nên 13 câu đúng bị loại. Chỉ gọt dấu câu ở HAI ĐẦU — «khoảng 5» hay «5-6» vẫn bị loại như cũ.
 */
function trimValue(value: string): string {
  return value.replace(/^[\s:;,"'`]+|[\s:;,"'`]+$/g, '');
}

/** Câu máy được đề xuất — mọi câu đơn của biểu mẫu, không lọc theo loại hình (khảo sát có thể nói loại hình). */
export function prefillQuestions(config: BriefFormConfig): PrefillQuestion[] {
  const out: PrefillQuestion[] = [];
  for (const section of config.sections) {
    for (const field of section.fields) {
      if (!eligible(field)) continue;
      out.push({
        path: field.path,
        label: field.label,
        control: field.control as PrefillQuestion['control'],
        unit: field.unit,
        min: field.min,
        max: field.max,
        options: field.options
          ?.filter((o) => !o.retired)
          .map((o) => ({ value: String(o.value), label: o.label })),
      });
    }
  }
  return out;
}

export interface PrefillAccepted {
  path: string;
  label: string;
  sectionId: string;
  sectionTitle: string;
  /** Giá trị đúng kiểu LƯU vào đầu bài. */
  value: unknown;
  /** Giá trị để HIỆN: nhãn lựa chọn, số kèm đơn vị. */
  display: string;
  quote: string;
}

export interface PrefillRejected {
  path: string;
  value: string;
  reason: string;
}

function locate(config: BriefFormConfig, path: string) {
  for (const section of config.sections) {
    const field = section.fields.find((f) => f.path === path);
    if (field) return { field, section };
  }
  return null;
}

/** Đọc số kiểu Việt («5,5») lẫn kiểu máy («5.5»); không đọc «5-6» hay «khoảng 5». */
function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(text)) return null;
  return Number(text.replace(',', '.'));
}

export function normalizePrefill(
  config: BriefFormConfig,
  suggestions: readonly AiBriefPrefillSuggestion[],
): { accepted: PrefillAccepted[]; rejected: PrefillRejected[] } {
  const accepted: PrefillAccepted[] = [];
  const rejected: PrefillRejected[] = [];
  const seen = new Set<string>();

  for (const s of suggestions) {
    const reject = (reason: string) => rejected.push({ path: s.path, value: s.value, reason });
    const hit = locate(config, s.path);
    if (!hit || !eligible(hit.field)) {
      reject('Không có câu này trong đầu bài, hoặc câu này không điền sẵn được.');
      continue;
    }
    if (seen.has(s.path)) {
      reject('Trùng câu đã đề xuất.');
      continue;
    }
    const { field, section } = hit;
    const raw = trimValue(s.value);
    if (raw.includes(REDACTED_MARK)) {
      reject('Giá trị là chỗ danh tính đã lược — không điền sẵn.');
      continue;
    }
    if (!raw) {
      reject('Giá trị rỗng.');
      continue;
    }
    const options = (field.options ?? []).filter((o) => !o.retired);
    const labelOf = (v: string) => options.find((o) => String(o.value) === v)?.label;
    let value: unknown;
    let display: string;

    switch (field.control) {
      case 'choice':
      case 'select': {
        const label = labelOf(raw);
        if (!label) {
          reject('Không phải mã lựa chọn của câu này.');
          continue;
        }
        value = raw;
        display = label;
        break;
      }
      case 'multi': {
        const codes = [
          ...new Set(
            raw
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
          ),
        ];
        const unknown = codes.filter((c) => !labelOf(c));
        if (codes.length === 0 || unknown.length > 0) {
          reject('Có mã không thuộc lựa chọn của câu này.');
          continue;
        }
        value = codes;
        display = codes.map((c) => labelOf(c)!).join(', ');
        break;
      }
      case 'tristate': {
        if (raw !== 'true' && raw !== 'false') {
          reject('Câu có / không chỉ nhận true hoặc false.');
          continue;
        }
        value = raw === 'true';
        display = labelOf(raw) ?? (raw === 'true' ? 'Có' : 'Không');
        break;
      }
      case 'number': {
        const typed = parseNumber(raw);
        if (typed === null) {
          reject('Không phải một con số.');
          continue;
        }
        if (
          (field.min !== undefined && typed < field.min) ||
          (field.max !== undefined && typed > field.max)
        ) {
          reject('Số nằm ngoài khoảng của câu này.');
          continue;
        }
        value = storedNumber(field, typed);
        display = `${String(typed).replace('.', ',')}${field.unit ? ` ${field.unit}` : ''}`;
        break;
      }
      default: {
        value = raw;
        display = raw;
      }
    }

    seen.add(s.path);
    accepted.push({
      path: s.path,
      label: field.label,
      sectionId: section.id,
      sectionTitle: section.title,
      value,
      display,
      quote: s.quote.trim(),
    });
  }
  return { accepted, rejected };
}

/** Câu đề xuất đã có câu trả lời trong bản nháp — giao diện không chọn sẵn, không đè. */
export function prefillConflicts(
  draft: unknown,
  accepted: readonly PrefillAccepted[],
): Set<string> {
  return new Set(accepted.filter((a) => isAnswered(valueAtPath(draft, a.path))).map((a) => a.path));
}
