/**
 * Báo giá có bảng hạng mục (migration 0239) — phần tính toán thuần, dùng chung cho biểu mẫu lập báo giá,
 * văn bản Word, bản PDF và phép thử.
 *
 * Tổng tiền là của CSDL: `quotes.total_value` do trigger `quotes_sync_totals` tính từ hạng mục bằng hàm
 * `quote_totals`. Các hàm ở đây là GƯƠNG của phép tính đó để biểu mẫu hiện số trước khi lưu — có phép thử
 * đối chiếu từng ca với SQL. Mọi phép tính tiền bằng `bigint`, làm tròn nửa lên tới đồng.
 */

import { formatCurrency, formatDate, formatNumber, toMoney, type MoneyValue } from './format';
import { moneyToVietnameseWords, withoutHonorific } from './hd-template';

/** Số chữ số thập phân của khối lượng — khớp cột `quote_items.quantity numeric(18, 4)`. */
export const QUANTITY_SCALE = 4;
const SCALE = 10n ** BigInt(QUANTITY_SCALE);

/**
 * Khối lượng người dùng gõ («12,5», «1.250,75», «3») → số nguyên đã nhân 10⁴, hoặc `null` khi không đọc
 * được / âm / quá 4 chữ số thập phân. Dấu phẩy là dấu thập phân; dấu chấm là dấu nhóm nghìn (CGD 4.3).
 * Chuỗi CSDL («12.5000») cũng đọc được: một dấu chấm, không có dấu phẩy, sau dấu chấm không đúng 3 chữ số
 * thì coi là dấu thập phân.
 */
export function parseQuantity(raw: string | number | null | undefined): bigint | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/\s/g, '');
  if (s === '') return null;
  if (typeof raw === 'number') {
    // PostgREST trả `numeric` dạng SỐ — dấu chấm luôn là dấu thập phân.
    if (!Number.isFinite(raw) || /e/i.test(s)) return null;
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d+$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // «12.5000» từ CSDL — giữ dấu chấm thập phân.
  } else {
    s = s.replace(/\./g, '');
  }
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const frac = (m[2] ?? '').replace(/0+$/, '');
  if (frac.length > QUANTITY_SCALE) return null;
  return BigInt(m[1]!) * SCALE + BigInt(frac.padEnd(QUANTITY_SCALE, '0') || '0');
}

/** Khối lượng đã nhân 10⁴ → chuỗi gửi CSDL («12.5»). */
export function quantityToDb(scaled: bigint): string {
  const int = scaled / SCALE;
  const frac = (scaled % SCALE).toString().padStart(QUANTITY_SCALE, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : `${int}`;
}

/** Khối lượng hiển thị kiểu Việt Nam: «1.250,75». */
export function formatQuantity(raw: string | number | null | undefined): string {
  const scaled = parseQuantity(raw);
  if (scaled === null) return '';
  return formatNumber(quantityToDb(scaled), QUANTITY_SCALE);
}

/** Thành tiền một hạng mục = khối lượng × đơn giá, làm tròn nửa lên tới đồng (như `round()` của CSDL). */
export function lineAmount(quantityScaled: bigint, unitPrice: MoneyValue): bigint {
  const product = quantityScaled * toMoney(unitPrice);
  return (product * 2n + SCALE) / (2n * SCALE);
}

export interface QuoteTotalsInput {
  subtotal: MoneyValue;
  discount: MoneyValue | null | undefined;
  /** Thuế suất (%), rỗng = không ghi thuế. */
  vatRate: string | number | null | undefined;
  /** true = đơn giá đã gồm thuế; false = chưa gồm, cộng thêm. */
  vatIncluded: boolean | null | undefined;
}

export interface QuoteTotals {
  subtotal: bigint;
  discount: bigint;
  /** Sau giảm giá. */
  net: bigint;
  /** Rỗng khi không ghi thuế suất. */
  vat: bigint | null;
  /** Số khách trả — `quotes.total_value`. */
  total: bigint;
}

/** Gương của hàm CSDL `quote_totals` (0239). */
export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  const subtotal = toMoney(input.subtotal);
  const discount = toMoney(input.discount ?? 0);
  const net = subtotal - discount;
  const rate =
    input.vatRate === null || input.vatRate === undefined || input.vatRate === ''
      ? null
      : Number(input.vatRate);
  if (rate === null || !Number.isFinite(rate))
    return { subtotal, discount, net, vat: null, total: net };
  const basis = BigInt(Math.round(rate * 100));
  if (input.vatIncluded) {
    const den = 10_000n + basis;
    const before = (net * 20_000n + den) / (2n * den);
    return { subtotal, discount, net, vat: net - before, total: net };
  }
  const vat = (net * basis * 2n + 10_000n) / 20_000n;
  return { subtotal, discount, net, vat, total: net + vat };
}

/** Thuế suất gợi ý trên biểu mẫu (Luật Thuế GTGT 2024: 0 %, 5 %, 8 % giảm tạm thời, 10 %). */
export const QUOTE_VAT_RATES = ['10', '8', '5', '0'] as const;

/** Một hạng mục như đọc từ CSDL (PostgREST trả `numeric` dạng SỐ, `bigint` dạng số). */
export interface QuoteItemRow {
  position: number;
  description: string;
  unit: string | null;
  quantity: string | number;
  unit_price: MoneyValue;
  amount: MoneyValue;
}

/** Câu nói về thuế in dưới bảng hạng mục. */
export function vatNote(
  vatRate: string | number | null | undefined,
  vatIncluded: boolean | null | undefined,
): string {
  if (vatRate === null || vatRate === undefined || vatRate === '') {
    return 'Báo giá chưa ghi thuế giá trị gia tăng.';
  }
  const pct = `${formatNumber(Number(vatRate), 2)}%`;
  return vatIncluded
    ? `Đơn giá đã bao gồm thuế giá trị gia tăng ${pct}.`
    : `Đơn giá chưa bao gồm thuế giá trị gia tăng; thuế ${pct} cộng thêm vào tổng.`;
}

// ---------------------------------------------------------------------------------------------
// Dữ liệu điền văn bản báo giá (mẫu Word `bao_gia` và bản PDF dựng thẳng)
// ---------------------------------------------------------------------------------------------

/** Ô câu chữ sửa được ngay trên văn bản báo giá — gương của hàm CSDL `quote_text_keys()` (0239). */
export const QUOTE_TEXT_KEYS = [
  'gioi_thieu',
  'dieu_kien',
  'dieu_khoan_thanh_toan',
  'thoi_gian_thuc_hien',
  'ghi_chu_cuoi',
  'nguoi_ky',
  'chuc_vu_ky',
] as const;
export type QuoteTextKey = (typeof QUOTE_TEXT_KEYS)[number];
export type QuoteTexts = Partial<Record<QuoteTextKey, string>>;

export const QUOTE_TEXT_LABELS: Readonly<Record<QuoteTextKey, string>> = {
  gioi_thieu: 'Lời giới thiệu',
  dieu_kien: 'Phạm vi và điều kiện',
  dieu_khoan_thanh_toan: 'Điều kiện thanh toán',
  thoi_gian_thuc_hien: 'Thời gian thực hiện / giao hàng',
  ghi_chu_cuoi: 'Lời kết',
  nguoi_ky: 'Người ký',
  chuc_vu_ky: 'Chức vụ người ký',
};

/** Ô số tiền / bảng — KHÔNG sửa trên văn bản (số đã duyệt). Bản xem trước khoá các ô này. */
export const QUOTE_LOCKED_KEYS = [
  'tong_hang_muc',
  'giam_gia',
  'thue_suat',
  'tien_thue',
  'tong_cong',
  'tong_cong_bang_chu',
] as const;
export const QUOTE_LOCKED_NOTE = 'Số tiền theo báo giá đã duyệt — đổi giá thì lập phiên bản mới.';

export interface QuoteDocumentSource {
  quote: {
    code: string;
    version: number;
    status: string;
    created_at: string;
    valid_until: string | null;
    notes: string | null;
    total_value: MoneyValue | null;
    discount_amount: MoneyValue | null;
    vat_rate: string | number | null;
    vat_included: boolean | null;
    line_items_based: boolean;
  };
  items: QuoteItemRow[];
  company: {
    code?: string | null;
    legal_name: string;
    short_name: string;
    address: string | null;
    tax_code: string | null;
    phone: string | null;
    email: string | null;
    legal_representative: string | null;
    representative_title: string | null;
  } | null;
  customer: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  opportunityName: string | null;
  preparedBy: { full_name: string; phone: string | null } | null;
  /** Câu chữ đã sửa trên văn bản (`quote_texts.texts`). */
  texts?: QuoteTexts | null;
}

/** Câu điều kiện thanh toán mặc định — mẫu DEMO, NVG thay trong mẫu Word hoặc sửa trên văn bản. */
export const QUOTE_PAYMENT_NOTE_DEFAULT =
  'Tiến độ và hình thức thanh toán theo hợp đồng ký kết giữa hai bên. Báo giá này chưa phải hợp đồng.';

export const QUOTE_CLOSING_DEFAULT =
  'Rất mong nhận được sự quan tâm và hợp tác của Quý khách. Trân trọng cảm ơn.';

/** Lời giới thiệu mặc định theo pháp nhân (DEMO — người lập sửa trên văn bản). */
export function defaultQuoteIntro(company: QuoteDocumentSource['company']): string {
  const name = company?.legal_name ?? 'Nhà Việt Group';
  const short = company?.short_name ?? name;
  switch (company?.code) {
    case 'NVO':
      return `${name} trân trọng cảm ơn Quý khách đã tin tưởng lựa chọn dịch vụ thiết kế và thi công nhà ở. Căn cứ khảo sát và nhu cầu của gia đình, ${short} trân trọng gửi báo giá như sau:`;
    case 'NVS':
      return `${name} trân trọng cảm ơn Quý khách đã quan tâm đến sản phẩm và dịch vụ cho thuê giàn giáo, kết cấu thép. Theo yêu cầu của Quý khách, ${short} trân trọng gửi báo giá như sau:`;
    default:
      return `${name} trân trọng cảm ơn Quý khách đã quan tâm và tạo điều kiện khảo sát công trình. Căn cứ yêu cầu và khối lượng đã trao đổi, ${short} trân trọng gửi báo giá như sau:`;
  }
}

/** Giá trị các chỗ trống của văn bản báo giá — kiểu suy từ `buildQuoteDocumentData`. */
export type QuoteDocumentData = ReturnType<typeof buildQuoteDocumentData>;

/** Hồ sơ báo giá → giá trị các chỗ trống. Ô chưa có dữ liệu = `null` (văn bản in dải chấm). */
export function buildQuoteDocumentData(src: QuoteDocumentSource) {
  const q = src.quote;
  const t = src.texts ?? {};
  const text = (k: QuoteTextKey, fallback: string | null) => t[k]?.trim() || fallback;
  const subtotal = src.items.reduce((s, i) => s + toMoney(i.amount), 0n);
  const totals = q.line_items_based
    ? computeQuoteTotals({
        subtotal,
        discount: q.discount_amount,
        vatRate: q.vat_rate,
        vatIncluded: q.vat_included,
      })
    : null;
  const total =
    q.total_value !== null && q.total_value !== undefined ? toMoney(q.total_value) : null;
  const discount = toMoney(q.discount_amount ?? 0);
  const money = (v: bigint | null) => (v === null ? null : formatCurrency(v));
  const c = src.company;
  const noVat = q.vat_rate === null || q.vat_rate === undefined || q.vat_rate === '';
  // Báo giá cũ chưa có bảng hạng mục: in MỘT dòng «Giá trị theo báo giá» với tổng đã lưu, không để bảng rỗng
  // hay dải chấm ở phần tổng.
  const legacy = !q.line_items_based && src.items.length === 0;
  const legacyGross = legacy && total !== null ? total + discount : null;
  return {
    nvg_ten: c?.legal_name ?? null,
    nvg_ten_ngan: c?.short_name ?? null,
    nvg_dia_chi: c?.address ?? null,
    nvg_ma_so_thue: c?.tax_code ?? null,
    nvg_dien_thoai: c?.phone ?? null,
    nvg_email: c?.email ?? null,
    nvg_dai_dien: c?.legal_representative ?? null,
    nvg_chuc_vu: c?.representative_title ?? null,
    so_bao_gia: q.code,
    phien_ban: String(q.version),
    ngay_bao_gia: formatDate(q.created_at) || null,
    khach_ten: withoutHonorific(src.customer?.name ?? null) ?? src.customer?.name ?? null,
    khach_ten_day_du: src.customer?.name ?? null,
    khach_dia_chi: src.customer?.address ?? null,
    khach_dien_thoai: src.customer?.phone ?? null,
    khach_email: src.customer?.email ?? null,
    ten_cong_trinh: src.opportunityName,
    gioi_thieu: text('gioi_thieu', defaultQuoteIntro(c)),
    hang_muc: legacy
      ? legacyGross === null
        ? []
        : [
            {
              stt: '1',
              noi_dung: 'Giá trị theo báo giá',
              don_vi: '',
              khoi_luong: '',
              don_gia: '',
              thanh_tien: formatNumber(String(legacyGross), 0),
            },
          ]
      : src.items.map((i, n) => ({
          stt: String(n + 1),
          noi_dung: i.description,
          don_vi: i.unit ?? '',
          khoi_luong: formatQuantity(i.quantity),
          don_gia: formatNumber(String(toMoney(i.unit_price)), 0),
          thanh_tien: formatNumber(String(toMoney(i.amount)), 0),
        })),
    tong_hang_muc: totals ? money(totals.subtotal) : money(legacyGross),
    giam_gia: discount > 0n ? money(discount) : 'Không',
    thue_suat: noVat ? 'không ghi' : `${formatNumber(Number(q.vat_rate), 2)}%`,
    tien_thue:
      totals?.vat !== null && totals?.vat !== undefined
        ? money(totals.vat)
        : noVat
          ? 'Không ghi'
          : null,
    ghi_chu_thue: vatNote(q.vat_rate, q.vat_included),
    tong_cong: money(total),
    tong_cong_bang_chu: total === null ? null : moneyToVietnameseWords(total),
    dieu_kien: text('dieu_kien', q.notes?.trim() || null),
    hieu_luc: formatDate(q.valid_until) || null,
    dieu_khoan_thanh_toan: text('dieu_khoan_thanh_toan', QUOTE_PAYMENT_NOTE_DEFAULT),
    thoi_gian_thuc_hien: text('thoi_gian_thuc_hien', null),
    ghi_chu_cuoi: text('ghi_chu_cuoi', QUOTE_CLOSING_DEFAULT),
    nguoi_ky: text('nguoi_ky', c?.legal_representative ?? null),
    chuc_vu_ky: text('chuc_vu_ky', c?.representative_title ?? null),
    nguoi_lap: src.preparedBy?.full_name ?? null,
    nguoi_lap_dien_thoai: src.preparedBy?.phone ?? null,
  };
}

/** Chỗ trống mẫu Word báo giá biết — mẫu tự tải lên được kiểm theo danh sách này. */
export const QUOTE_TEMPLATE_FIELDS: readonly { key: string; label: string }[] = [
  { key: 'nvg_ten', label: 'Tên pháp nhân NVG' },
  { key: 'nvg_ten_ngan', label: 'Tên ngắn pháp nhân' },
  { key: 'nvg_dia_chi', label: 'Địa chỉ pháp nhân' },
  { key: 'nvg_ma_so_thue', label: 'Mã số thuế pháp nhân' },
  { key: 'nvg_dien_thoai', label: 'Điện thoại pháp nhân' },
  { key: 'nvg_email', label: 'Email pháp nhân' },
  { key: 'nvg_dai_dien', label: 'Người đại diện' },
  { key: 'nvg_chuc_vu', label: 'Chức vụ người đại diện' },
  { key: 'so_bao_gia', label: 'Mã báo giá' },
  { key: 'phien_ban', label: 'Phiên bản' },
  { key: 'ngay_bao_gia', label: 'Ngày lập báo giá' },
  { key: 'khach_ten', label: 'Tên khách (bỏ danh xưng)' },
  { key: 'khach_ten_day_du', label: 'Tên khách như hồ sơ' },
  { key: 'khach_dia_chi', label: 'Địa chỉ khách' },
  { key: 'khach_dien_thoai', label: 'Điện thoại khách' },
  { key: 'khach_email', label: 'Email khách' },
  { key: 'ten_cong_trinh', label: 'Tên cơ hội / công trình' },
  {
    key: 'hang_muc',
    label: 'Bảng hạng mục (lặp: stt, noi_dung, don_vi, khoi_luong, don_gia, thanh_tien)',
  },
  { key: 'tong_hang_muc', label: 'Tổng các hạng mục' },
  { key: 'giam_gia', label: 'Giảm giá' },
  { key: 'thue_suat', label: 'Thuế suất GTGT' },
  { key: 'tien_thue', label: 'Tiền thuế GTGT' },
  { key: 'ghi_chu_thue', label: 'Câu nói về thuế' },
  { key: 'tong_cong', label: 'Tổng cộng' },
  { key: 'tong_cong_bang_chu', label: 'Tổng cộng bằng chữ' },
  { key: 'dieu_kien', label: 'Phạm vi và điều kiện (Ghi chú)' },
  { key: 'hieu_luc', label: 'Hiệu lực đến' },
  { key: 'dieu_khoan_thanh_toan', label: 'Điều kiện thanh toán' },
  { key: 'gioi_thieu', label: 'Lời giới thiệu (sửa trên văn bản)' },
  { key: 'thoi_gian_thuc_hien', label: 'Thời gian thực hiện / giao hàng (sửa trên văn bản)' },
  { key: 'ghi_chu_cuoi', label: 'Lời kết (sửa trên văn bản)' },
  { key: 'nguoi_ky', label: 'Người ký (mặc định người đại diện)' },
  { key: 'chuc_vu_ky', label: 'Chức vụ người ký' },
  { key: 'nguoi_lap', label: 'Người lập báo giá' },
  { key: 'nguoi_lap_dien_thoai', label: 'Điện thoại người lập' },
];

/** Cột của bảng lặp `{#hang_muc}…{/hang_muc}` — đúng các khoá `buildQuoteDocumentData` đưa vào mỗi dòng. */
export const QUOTE_LOOP_COLUMNS: readonly (readonly [string, string])[] = [
  ['stt', 'Số thứ tự'],
  ['noi_dung', 'Hạng mục'],
  ['don_vi', 'Đơn vị'],
  ['khoi_luong', 'Khối lượng'],
  ['don_gia', 'Đơn giá'],
  ['thanh_tien', 'Thành tiền'],
];

const QUOTE_FIELD_KEYS: ReadonlySet<string> = new Set(QUOTE_TEMPLATE_FIELDS.map((f) => f.key));
const QUOTE_LOOP_KEYS: ReadonlySet<string> = new Set(QUOTE_LOOP_COLUMNS.map(([k]) => k));

/**
 * Chỗ trống lạ trong một mẫu Word BÁO GIÁ (cây chỗ trống như `inspectTemplate` đọc): khoá không có trong
 * `QUOTE_TEMPLATE_FIELDS`, cột lạ trong bảng `hang_muc`, hoặc bảng lặp nào khác `hang_muc`.
 */
export function unknownQuoteTemplateTags(tags: Readonly<Record<string, unknown>>): string[] {
  const unknown: string[] = [];
  for (const [key, inner] of Object.entries(tags)) {
    if (!QUOTE_FIELD_KEYS.has(key)) {
      unknown.push(key);
      continue;
    }
    const cols = inner && typeof inner === 'object' ? Object.keys(inner) : [];
    if (key === 'hang_muc') {
      for (const col of cols) if (!QUOTE_LOOP_KEYS.has(col)) unknown.push(`${key}.${col}`);
    } else {
      // Một ô thường bị dùng như bảng lặp ({#tong_cong}…{/tong_cong}) — bộ điền không lặp được.
      for (const col of cols) unknown.push(`${key}.${col}`);
    }
  }
  return unknown;
}
