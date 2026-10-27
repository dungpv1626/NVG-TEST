/**
 * Nhập đầu mối từ bảng tính (Excel / CSV) — phần thuần: nhận ra cột theo tiêu đề, kiểm từng dòng.
 *
 * Kiểm đúng như biểu mẫu «Tạo đầu mối» (và ràng buộc của bảng `leads`): có tên; có điện thoại HOẶC email; nguồn là một
 * nguồn trong danh mục — chữ nguồn lạ thì vào «Khác» và giữ nguyên chữ ở «Chi tiết nguồn», không đoán sang nguồn khác.
 * Loại công trình chỉ nhận đúng tên trong danh mục; lạ thì bỏ trống và ghi vào ghi chú. Trùng số trong cùng tệp báo ở
 * dòng sau; trùng với hồ sơ đã có do màn hình tra (`contact_duplicates`), không ở đây.
 */

import { CUSTOMER_SOURCES, OPPORTUNITY_PROJECT_TYPES } from './crm';

export const LEAD_IMPORT_FIELDS = [
  'fullName',
  'phone',
  'email',
  'area',
  'source',
  'projectType',
  'need',
  'notes',
] as const;

export type LeadImportField = (typeof LEAD_IMPORT_FIELDS)[number];

export const LEAD_IMPORT_FIELD_LABELS: Readonly<Record<LeadImportField, string>> = {
  fullName: 'Tên người liên hệ',
  phone: 'Điện thoại',
  email: 'Email',
  area: 'Khu vực',
  source: 'Nguồn',
  projectType: 'Loại công trình',
  need: 'Nhu cầu',
  notes: 'Ghi chú',
};

/** Tiêu đề cột thường gặp (đã bỏ dấu, viết thường) → trường. */
const HEADER_HINTS: Readonly<Record<LeadImportField, readonly string[]>> = {
  fullName: [
    'ho ten',
    'ho va ten',
    'ten khach',
    'ten khach hang',
    'khach hang',
    'ten',
    'nguoi lien he',
    'name',
  ],
  phone: ['dien thoai', 'so dien thoai', 'sdt', 'so dt', 'phone', 'di dong', 'zalo'],
  email: ['email', 'e-mail', 'thu dien tu'],
  area: ['khu vuc', 'dia chi', 'tinh', 'tinh thanh', 'dia ban', 'address'],
  source: ['nguon', 'kenh', 'nguon khach', 'source'],
  projectType: ['loai cong trinh', 'loai hinh', 'loai nha', 'hang muc'],
  need: ['nhu cau', 'yeu cau', 'mo ta nhu cau'],
  notes: ['ghi chu', 'note', 'notes'],
};

export function foldVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9@.-]+/g, ' ')
    .trim();
}

export type LeadColumnMap = Partial<Record<LeadImportField, number>>;

/** Đoán cột theo tiêu đề: khớp nguyên cụm trước, rồi «tiêu đề bắt đầu bằng gợi ý». Một cột chỉ cho một trường. */
export function guessLeadColumns(header: readonly string[]): LeadColumnMap {
  const folded = header.map((h) => foldVietnamese(h ?? ''));
  const map: LeadColumnMap = {};
  const used = new Set<number>();
  for (const pass of ['exact', 'prefix'] as const) {
    for (const field of LEAD_IMPORT_FIELDS) {
      if (map[field] !== undefined) continue;
      const i = folded.findIndex(
        (h, idx) =>
          !used.has(idx) &&
          h !== '' &&
          HEADER_HINTS[field].some((hint) => (pass === 'exact' ? h === hint : h.startsWith(hint))),
      );
      if (i >= 0) {
        map[field] = i;
        used.add(i);
      }
    }
  }
  return map;
}

export interface LeadImportRow {
  /** Số dòng trong tệp (dòng tiêu đề là 1). */
  line: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  area: string | null;
  source: string;
  sourceDetail: string | null;
  projectType: string | null;
  need: string | null;
  notes: string | null;
  /** Lý do dòng không nhập được — rỗng là nhập được. */
  errors: string[];
  /** Điều cần biết nhưng vẫn nhập được (nguồn lạ, trùng số trong tệp…). */
  warnings: string[];
}

const cell = (row: readonly string[], i: number | undefined): string =>
  i === undefined ? '' : String(row[i] ?? '').trim();

function matchFrom<T extends string>(list: readonly T[], value: string): T | undefined {
  const f = foldVietnamese(value);
  return list.find((x) => foldVietnamese(x) === f);
}

/**
 * Dựng các dòng nhập từ bảng (dòng 0 là tiêu đề). `defaultSource` dùng khi tệp không có cột nguồn hoặc ô nguồn trống
 * (vd cả tệp là danh sách Marketing thu từ Facebook) — phải là một nguồn trong danh mục.
 */
export function buildLeadImportRows(
  table: readonly (readonly string[])[],
  map: LeadColumnMap,
  defaultSource: string | null,
): LeadImportRow[] {
  const rows: LeadImportRow[] = [];
  const seenPhones = new Map<string, number>();
  table.slice(1).forEach((raw, idx) => {
    const line = idx + 2;
    if (raw.every((c) => String(c ?? '').trim() === '')) return;
    const errors: string[] = [];
    const warnings: string[] = [];
    const notes: string[] = [];

    const fullName = cell(raw, map.fullName);
    let phoneRaw = cell(raw, map.phone);
    let digits = phoneRaw.replace(/\D/g, '');
    // Excel lưu số điện thoại dạng SỐ thì rơi số 0 đầu (0912… → 912…): thêm lại và nói ra.
    if (/^[3-9]\d{8}$/.test(digits) && /^\d+$/.test(phoneRaw)) {
      digits = `0${digits}`;
      phoneRaw = digits;
      warnings.push('Số điện thoại mất số 0 đầu (Excel lưu dạng số) — đã thêm lại số 0.');
    }
    const email = cell(raw, map.email) || null;
    if (!fullName) errors.push('Thiếu tên người liên hệ.');
    if (!digits && !email) errors.push('Thiếu cả điện thoại lẫn email — không chăm sóc được.');
    if (digits && digits.length < 8)
      warnings.push('Số điện thoại ngắn bất thường — kiểm lại sau khi nhập.');
    if (digits) {
      const first = seenPhones.get(digits);
      if (first !== undefined) warnings.push(`Trùng số điện thoại với dòng ${first} trong tệp.`);
      else seenPhones.set(digits, line);
    }

    const sourceText = cell(raw, map.source);
    let source: string | null = null;
    let sourceDetail: string | null = null;
    if (sourceText) {
      const known = matchFrom(CUSTOMER_SOURCES, sourceText);
      if (known) source = known;
      else {
        source = 'Khác';
        sourceDetail = sourceText;
        warnings.push(`Nguồn «${sourceText}» không có trong danh mục — ghi là «Khác».`);
      }
    } else if (defaultSource) {
      source = defaultSource;
    }
    if (!source) errors.push('Thiếu nguồn — chọn «Nguồn mặc định» cho các dòng để trống.');

    const typeText = cell(raw, map.projectType);
    let projectType: string | null = null;
    if (typeText) {
      const known = matchFrom(OPPORTUNITY_PROJECT_TYPES, typeText);
      if (known) projectType = known;
      else {
        notes.push(`Loại công trình trong tệp: ${typeText}`);
        warnings.push(
          `Loại công trình «${typeText}» không có trong danh mục — để trống, ghi vào ghi chú.`,
        );
      }
    }
    const fileNotes = cell(raw, map.notes);
    if (fileNotes) notes.unshift(fileNotes);

    rows.push({
      line,
      fullName,
      phone: phoneRaw || null,
      email,
      area: cell(raw, map.area) || null,
      source: source ?? '',
      sourceDetail,
      projectType,
      need: cell(raw, map.need) || null,
      notes: notes.length ? notes.join('\n') : null,
      errors,
      warnings,
    });
  });
  return rows;
}
