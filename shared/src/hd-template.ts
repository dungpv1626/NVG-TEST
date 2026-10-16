/**
 * Mẫu hợp đồng Word (GĐ4 đợt cải tiến UX — vấn đề 5 của chủ dự án).
 *
 * Người soạn mẫu gõ chỗ trống dạng `{ten_cho_trong}` vào tệp `.docx`; hệ thống điền từ hồ sơ
 * hợp đồng, pháp nhân, đối tác và điều khoản. Tệp này giữ phần THUẦN của việc đó — danh mục chỗ
 * trống và cách tính giá trị — để giao diện, phép thử và trang hướng dẫn soạn mẫu đọc cùng một
 * nguồn. Phần mở / ghi tệp Word nằm ở `web/src/lib/docx-template.ts`.
 *
 * Ba nguyên tắc:
 *  - KHÔNG bịa số. Ô chưa có dữ liệu để `null` — bộ điền in dải chấm để điền tay và giao diện
 *    liệt kê ô thiếu trước khi tải (CLAUDE.md 5.2 «không hiển thị số ước lượng»).
 *  - Tất định. Cùng hồ sơ cho cùng văn bản; giá trị bằng chữ, tách thuế tính bằng `bigint`.
 *  - Chỉ điền, không soạn. Câu chữ pháp lý là của mẫu do NVG soạn (PRD 2.3).
 */

import { formatCurrency, formatDate, toMoney, type MoneyValue } from './format';
import {
  CONTRACT_PRICE_FORM_LABELS,
  CONTRACT_TYPE_LABELS,
  isPayableContract,
  type ContractPriceForm,
  type ContractTermType,
  type ContractType,
} from './hd';

// ---------------------------------------------------------------------------------------------
// Đọc số tiền thành chữ
// ---------------------------------------------------------------------------------------------

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'] as const;

/** Đọc một nhóm ba chữ số. `full` = không phải nhóm đứng đầu → đọc cả «không trăm», «linh». */
function readGroup(n: number, full: boolean): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const units = n % 10;
  const words: string[] = [];

  if (hundreds > 0 || full) words.push(`${DIGITS[hundreds]} trăm`);

  if (tens === 0) {
    if (units > 0 && (hundreds > 0 || full)) words.push('linh');
  } else if (tens === 1) {
    words.push('mười');
  } else {
    words.push(`${DIGITS[tens]} mươi`);
  }

  if (units > 0) {
    if (units === 1 && tens >= 2) words.push('mốt');
    else if (units === 5 && tens >= 1) words.push('lăm');
    else words.push(DIGITS[units]!);
  }
  return words.join(' ');
}

const GROUP_UNITS = ['', 'nghìn', 'triệu'] as const;

/** Đọc phần dưới một tỷ. `full` = đã có chữ đứng trước → nhóm đầu cũng đọc «không trăm». */
function readBelowBillion(n: number, full: boolean): string {
  const groups = [n % 1000, Math.floor(n / 1000) % 1000, Math.floor(n / 1_000_000)];
  const parts: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const g = groups[i]!;
    if (g === 0) continue;
    parts.push([readGroup(g, full || parts.length > 0), GROUP_UNITS[i]].filter(Boolean).join(' '));
  }
  return parts.join(' ');
}

/**
 * Số nguyên không âm → chữ tiếng Việt, viết hoa chữ đầu, KHÔNG kèm «đồng». Chia theo khối tỷ
 * (đọc phần trên tỷ như một số riêng rồi thêm «tỷ») — 1.500.000.000.000 là «một nghìn năm trăm
 * tỷ», không phải «một nghìn tỷ năm trăm tỷ».
 *
 * @example numberToVietnameseWords(1_250_005_000n) // "Một tỷ hai trăm năm mươi triệu không trăm linh năm nghìn"
 */
export function numberToVietnameseWords(value: bigint): string {
  if (value < 0n) return `Âm ${lowerFirst(numberToVietnameseWords(-value))}`;
  if (value === 0n) return 'Không';
  return upperFirst(readWords(value, false));
}

function readWords(value: bigint, full: boolean): string {
  const BILLION = 1_000_000_000n;
  const high = value / BILLION;
  const low = Number(value % BILLION);
  if (high === 0n) return readBelowBillion(low, full);
  const head = `${readWords(high, full)} tỷ`;
  return low === 0 ? head : `${head} ${readBelowBillion(low, true)}`;
}

/** Số tiền → «Một trăm triệu đồng». */
export function moneyToVietnameseWords(value: MoneyValue | bigint): string {
  return `${numberToVietnameseWords(toMoney(value))} đồng`;
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---------------------------------------------------------------------------------------------
// Tách thuế giá trị gia tăng
// ---------------------------------------------------------------------------------------------

/**
 * Giá trị hợp đồng ĐÃ GỒM thuế → (trước thuế, tiền thuế). Thuế suất dạng chuỗi CSDL ('10',
 * '8', '5.00'). Làm tròn tới đồng; tiền thuế = tổng − trước thuế để hai số cộng lại đúng tổng.
 */
export function splitVat(
  totalInclVat: MoneyValue | bigint,
  vatRate: string | number | null | undefined,
): { beforeVat: bigint; vat: bigint } | null {
  if (vatRate === null || vatRate === undefined || vatRate === '') return null;
  const rate = Number(vatRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;
  const total = toMoney(totalInclVat);
  // Thuế suất tới hai chữ số thập phân → nhân 100 cho thành số nguyên.
  const basis = BigInt(Math.round(rate * 100));
  const denominator = 10_000n + basis;
  // Làm tròn nửa lên: (total * 10000 * 2 + denominator) / (2 * denominator).
  const beforeVat = (total * 10_000n * 2n + denominator) / (2n * denominator);
  return { beforeVat, vat: total - beforeVat };
}

// ---------------------------------------------------------------------------------------------
// Danh mục chỗ trống
// ---------------------------------------------------------------------------------------------

export type TemplateFieldGroup =
  'hop_dong' | 'gia_tri' | 'nvg' | 'doi_tac' | 'ben_a' | 'ben_b' | 'dieu_khoan';

export const TEMPLATE_FIELD_GROUP_LABELS: Readonly<Record<TemplateFieldGroup, string>> = {
  hop_dong: 'Hợp đồng',
  gia_tri: 'Giá trị',
  nvg: 'Pháp nhân NVG ký hợp đồng',
  doi_tac: 'Đối tác (khách hàng / bên được thuê)',
  ben_a: 'Bên A — bên giao thầu / bên mua',
  ben_b: 'Bên B — bên nhận thầu / bên bán',
  dieu_khoan: 'Điều khoản (bảng lặp)',
};

export interface TemplateField {
  readonly key: string;
  readonly label: string;
  readonly group: TemplateFieldGroup;
  /** `loop` = bảng lặp `{#key}…{/key}`, mỗi dòng có các ô ở `TEMPLATE_LOOP_COLUMNS`. */
  readonly kind: 'text' | 'loop';
}

const PARTY_FIELDS = [
  ['ten', 'Tên'],
  ['ma_so_thue', 'Mã số thuế'],
  ['dia_chi', 'Địa chỉ'],
  ['dien_thoai', 'Điện thoại'],
  ['email', 'Email'],
  ['dai_dien', 'Người đại diện'],
  ['chuc_vu', 'Chức vụ người đại diện'],
  ['so_tai_khoan', 'Số tài khoản'],
  ['ngan_hang', 'Ngân hàng'],
] as const;

type PartyKey = (typeof PARTY_FIELDS)[number][0];

/** Ô trong mỗi dòng của bảng lặp điều khoản. */
export const TEMPLATE_LOOP_COLUMNS = [
  ['stt', 'Số thứ tự (1, 2, 3…)'],
  ['noi_dung', 'Nội dung điều khoản'],
  ['ty_le', 'Tỷ lệ (ví dụ 30%)'],
  ['so_tien', 'Số tiền (ví dụ 300.000.000 đồng)'],
  ['so_tien_bang_chu', 'Số tiền bằng chữ'],
  ['han', 'Hạn (dd/mm/yyyy)'],
] as const;

/** Bảng lặp ↔ nhóm điều khoản của hợp đồng (HD-02). */
export const TEMPLATE_LOOPS: Readonly<Record<string, { term: ContractTermType; label: string }>> = {
  pham_vi: { term: 'pham_vi', label: 'Phạm vi công việc' },
  dot_thanh_toan: { term: 'tien_do_thanh_toan', label: 'Các đợt thanh toán' },
  tam_ung: { term: 'tam_ung', label: 'Tạm ứng' },
  bao_lanh: { term: 'bao_lanh', label: 'Bảo lãnh' },
  phat: { term: 'phat', label: 'Phạt vi phạm' },
  bao_hanh: { term: 'bao_hanh', label: 'Bảo hành' },
  quyet_toan: { term: 'quyet_toan', label: 'Điều kiện quyết toán' },
};

export const TEMPLATE_FIELDS: readonly TemplateField[] = [
  { key: 'so_hop_dong', label: 'Số hợp đồng', group: 'hop_dong', kind: 'text' },
  { key: 'ma_hop_dong', label: 'Mã hồ sơ nội bộ', group: 'hop_dong', kind: 'text' },
  { key: 'ten_hop_dong', label: 'Tên hợp đồng', group: 'hop_dong', kind: 'text' },
  { key: 'loai_hop_dong', label: 'Loại hợp đồng', group: 'hop_dong', kind: 'text' },
  { key: 'hinh_thuc_gia', label: 'Hình thức giá', group: 'hop_dong', kind: 'text' },
  { key: 'dia_diem', label: 'Địa điểm thực hiện', group: 'hop_dong', kind: 'text' },
  { key: 'ngay_ky', label: 'Ngày ký (dd/mm/yyyy)', group: 'hop_dong', kind: 'text' },
  { key: 'ngay_ky_ngay', label: 'Ngày ký — ngày', group: 'hop_dong', kind: 'text' },
  { key: 'ngay_ky_thang', label: 'Ngày ký — tháng', group: 'hop_dong', kind: 'text' },
  { key: 'ngay_ky_nam', label: 'Ngày ký — năm', group: 'hop_dong', kind: 'text' },
  { key: 'ngay_bat_dau', label: 'Ngày bắt đầu', group: 'hop_dong', kind: 'text' },
  { key: 'ngay_ket_thuc', label: 'Ngày kết thúc', group: 'hop_dong', kind: 'text' },
  { key: 'ngay_lap', label: 'Ngày lập văn bản', group: 'hop_dong', kind: 'text' },

  { key: 'gia_tri', label: 'Giá trị hợp đồng (đã gồm thuế)', group: 'gia_tri', kind: 'text' },
  { key: 'gia_tri_bang_chu', label: 'Giá trị bằng chữ', group: 'gia_tri', kind: 'text' },
  { key: 'thue_suat', label: 'Thuế suất GTGT', group: 'gia_tri', kind: 'text' },
  { key: 'gia_tri_truoc_thue', label: 'Giá trị trước thuế', group: 'gia_tri', kind: 'text' },
  { key: 'tien_thue', label: 'Tiền thuế GTGT', group: 'gia_tri', kind: 'text' },

  ...(['nvg', 'doi_tac', 'ben_a', 'ben_b'] as const).flatMap((group) =>
    PARTY_FIELDS.map(([k, label]) => ({
      key: `${group}_${k}`,
      label,
      group,
      kind: 'text' as const,
    })),
  ),

  ...Object.entries(TEMPLATE_LOOPS).map(([key, { label }]) => ({
    key,
    label,
    group: 'dieu_khoan' as const,
    kind: 'loop' as const,
  })),
];

export const TEMPLATE_FIELD_KEYS: ReadonlySet<string> = new Set(TEMPLATE_FIELDS.map((f) => f.key));
const LOOP_COLUMN_KEYS: ReadonlySet<string> = new Set(TEMPLATE_LOOP_COLUMNS.map(([k]) => k));

/**
 * Chỗ trống nào trong mẫu hệ thống không biết. `tags` là cây tag của bộ điền: tag thường →
 * `{}`, bảng lặp → `{ cột: {} }`. Trả về tên đọc được (`dot_thanh_toan.so_tienn`).
 */
export function unknownTemplateTags(tags: Readonly<Record<string, unknown>>): string[] {
  const unknown: string[] = [];
  for (const [key, inner] of Object.entries(tags)) {
    const field = TEMPLATE_FIELDS.find((f) => f.key === key);
    if (!field) {
      unknown.push(key);
      continue;
    }
    if (field.kind === 'loop' && inner && typeof inner === 'object') {
      for (const col of Object.keys(inner)) {
        if (!LOOP_COLUMN_KEYS.has(col)) unknown.push(`${key}.${col}`);
      }
    }
  }
  return unknown;
}

// ---------------------------------------------------------------------------------------------
// Dữ liệu điền
// ---------------------------------------------------------------------------------------------

export interface TemplateParty {
  ten: string | null;
  ma_so_thue: string | null;
  dia_chi: string | null;
  dien_thoai: string | null;
  email: string | null;
  dai_dien: string | null;
  chuc_vu: string | null;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
}

export interface TemplateSource {
  contract: {
    code: string;
    contract_number: string | null;
    title: string;
    type: ContractType;
    price_form: ContractPriceForm | null;
    value: MoneyValue | null;
    /** PostgREST trả `numeric` dạng số; biểu mẫu gửi chuỗi — nhận cả hai. */
    vat_rate: string | number | null;
    signed_date: string | null;
    start_date: string | null;
    end_date: string | null;
    project_location: string | null;
  };
  company: {
    legal_name: string;
    tax_code: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    legal_representative: string | null;
    representative_title: string | null;
    bank_account_number: string | null;
    bank_name: string | null;
  };
  /** Khách hàng trong danh mục; `null` thì dùng `partner_name`. */
  partner: {
    name: string;
    tax_code: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    representative_name: string | null;
    representative_title: string | null;
  } | null;
  partner_name: string | null;
  terms: readonly {
    term_type: ContractTermType;
    description: string;
    amount: MoneyValue | null;
    percent_value: string | null;
    due_date: string | null;
    position: string;
  }[];
  /** Ngày lập văn bản, `yyyy-mm-dd`. */
  today: string;
}

export interface TemplateLoopRow {
  stt: string;
  noi_dung: string;
  ty_le: string | null;
  so_tien: string | null;
  so_tien_bang_chu: string | null;
  han: string | null;
}

export type TemplateValue = string | null | TemplateLoopRow[];

/** Chuỗi rỗng / khoảng trắng → `null`. Nhận cả số: PostgREST trả cột `numeric` dạng số. */
const blank = (s: string | number | null | undefined): string | null => {
  const t = s === null || s === undefined ? '' : String(s).trim();
  return t ? t : null;
};

function money(value: MoneyValue | bigint | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return formatCurrency(toMoney(value));
}

function percent(value: string | number | null): string | null {
  const v = blank(value);
  if (!v) return null;
  return v.endsWith('%') ? v : `${v.replace('.', ',')}%`;
}

/** Số trong `yyyy-mm-dd` — tách thẳng chuỗi, không qua `Date` để khỏi lệch múi giờ. */
function dateParts(iso: string | null): { d: string; m: string; y: string } | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? { y: m[1]!, m: m[2]!, d: m[3]! } : null;
}

/**
 * Hồ sơ → giá trị cho từng chỗ trống. Ô không có dữ liệu là `null`, bảng lặp không có dòng là
 * mảng rỗng — `missingTemplateFields` dựa vào đó để báo.
 */
export function buildTemplateData(src: TemplateSource): Record<string, TemplateValue> {
  const c = src.contract;
  const data: Record<string, TemplateValue> = {};

  data.so_hop_dong = blank(c.contract_number);
  data.ma_hop_dong = c.code;
  data.ten_hop_dong = c.title;
  data.loai_hop_dong = CONTRACT_TYPE_LABELS[c.type];
  data.hinh_thuc_gia = c.price_form ? CONTRACT_PRICE_FORM_LABELS[c.price_form] : null;
  data.dia_diem = blank(c.project_location);
  data.ngay_ky = c.signed_date ? formatDate(c.signed_date) : null;
  const signed = dateParts(c.signed_date);
  data.ngay_ky_ngay = signed?.d ?? null;
  data.ngay_ky_thang = signed?.m ?? null;
  data.ngay_ky_nam = signed?.y ?? null;
  data.ngay_bat_dau = c.start_date ? formatDate(c.start_date) : null;
  data.ngay_ket_thuc = c.end_date ? formatDate(c.end_date) : null;
  data.ngay_lap = formatDate(src.today);

  const hasValue = c.value !== null && c.value !== undefined && c.value !== '';
  data.gia_tri = hasValue ? money(c.value) : null;
  data.gia_tri_bang_chu = hasValue ? moneyToVietnameseWords(c.value!) : null;
  const vat = hasValue ? splitVat(c.value!, c.vat_rate) : null;
  data.thue_suat = vat ? percent(c.vat_rate) : null;
  data.gia_tri_truoc_thue = vat ? money(vat.beforeVat) : null;
  data.tien_thue = vat ? money(vat.vat) : null;

  const nvg: TemplateParty = {
    ten: src.company.legal_name,
    ma_so_thue: blank(src.company.tax_code),
    dia_chi: blank(src.company.address),
    dien_thoai: blank(src.company.phone),
    email: blank(src.company.email),
    dai_dien: blank(src.company.legal_representative),
    chuc_vu: blank(src.company.representative_title),
    so_tai_khoan: blank(src.company.bank_account_number),
    ngan_hang: blank(src.company.bank_name),
  };
  const p = src.partner;
  const partner: TemplateParty = {
    ten: p ? p.name : blank(src.partner_name),
    ma_so_thue: blank(p?.tax_code),
    dia_chi: blank(p?.address),
    dien_thoai: blank(p?.phone),
    email: blank(p?.email),
    dai_dien: blank(p?.representative_name),
    chuc_vu: blank(p?.representative_title),
    // Tài khoản của đối tác không lưu trên hệ thống (CLAUDE.md 5.2) — mẫu để trống điền tay.
    so_tai_khoan: null,
    ngan_hang: null,
  };
  // NVG nhận việc (thiết kế, thi công, bán) → NVG là bên B; NVG đi thuê (khoán / thầu phụ) →
  // NVG là bên A. Mẫu viết theo «bên A / bên B» thì đổi loại hợp đồng không phải sửa mẫu.
  const [benA, benB] = isPayableContract(c.type) ? [nvg, partner] : [partner, nvg];
  for (const [k] of PARTY_FIELDS) {
    const key: PartyKey = k;
    data[`nvg_${key}`] = nvg[key];
    data[`doi_tac_${key}`] = partner[key];
    data[`ben_a_${key}`] = benA[key];
    data[`ben_b_${key}`] = benB[key];
  }

  for (const [loop, { term }] of Object.entries(TEMPLATE_LOOPS)) {
    data[loop] = src.terms
      .filter((t) => t.term_type === term)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((t, i) => {
        const hasAmount = t.amount !== null && t.amount !== undefined && t.amount !== '';
        return {
          stt: String(i + 1),
          noi_dung: t.description,
          ty_le: percent(t.percent_value),
          so_tien: hasAmount ? money(t.amount) : null,
          so_tien_bang_chu: hasAmount ? moneyToVietnameseWords(t.amount!) : null,
          han: t.due_date ? formatDate(t.due_date) : null,
        };
      });
  }

  return data;
}

/** Tên ngắn của bên — ghi kèm ô thiếu để biết thiếu của ai. */
const PARTY_SHORT: Partial<Record<TemplateFieldGroup, string>> = {
  nvg: 'pháp nhân NVG',
  doi_tac: 'đối tác',
  ben_a: 'bên A',
  ben_b: 'bên B',
};

/**
 * Chỗ trống mẫu CÓ dùng mà hồ sơ chưa có dữ liệu → nhãn đọc được, để giao diện báo trước khi
 * tải. Ô trong bảng lặp chỉ báo khi MỌI dòng đều thiếu ô đó (thiếu một dòng là chuyện của điều
 * khoản ấy, không phải của mẫu).
 */
export function missingTemplateFields(
  tags: Readonly<Record<string, unknown>>,
  data: Readonly<Record<string, TemplateValue>>,
): string[] {
  const missing: string[] = [];
  for (const [key, inner] of Object.entries(tags)) {
    const field = TEMPLATE_FIELDS.find((f) => f.key === key);
    if (!field) continue;
    const value = data[key];
    if (field.kind === 'loop') {
      const rows = Array.isArray(value) ? value : [];
      if (rows.length === 0) {
        missing.push(`${field.label} — chưa có điều khoản nào`);
        continue;
      }
      for (const col of Object.keys((inner as Record<string, unknown>) ?? {})) {
        const colKey = col as keyof TemplateLoopRow;
        if (rows.every((r) => r[colKey] === null || r[colKey] === undefined)) {
          const colLabel = TEMPLATE_LOOP_COLUMNS.find(([k]) => k === col)?.[1] ?? col;
          missing.push(`${field.label} — ${colLabel.toLowerCase()}`);
        }
      }
    } else if (value === null || value === undefined) {
      const party = PARTY_SHORT[field.group];
      missing.push(party ? `${field.label} (${party})` : field.label);
    }
  }
  return missing;
}

/** Dải chấm in vào chỗ trống chưa có dữ liệu — để điền tay trên bản in. */
export const TEMPLATE_BLANK = '……………………';
