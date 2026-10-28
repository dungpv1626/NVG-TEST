/**
 * Bộ biểu mẫu hồ sơ dự thầu tự điền (0236 — phần còn lại của câu 19, anh Dũng 27/10/2026).
 *
 * Mẫu Word sinh từ bộ dự thảo NVC-DT-01 của NVG bằng `db/seed-assets/bid-templates/convert_bid.py`:
 *  - `ho_so_du_thau` (NVC-DT-01A): danh mục kiểm tra + Mẫu 01 → 10, lập TRƯỚC khi nộp thầu;
 *  - `thuong_thao` (NVC-DT-01B): Mẫu 11 Biên bản thương thảo hợp đồng, lập SAU khi trúng thầu.
 *
 * Tệp này giữ phần THUẦN: danh mục chỗ trống, bảng lặp, cách dựng giá trị điền. Ba nguyên tắc như mẫu hợp đồng
 * (`hd-template.ts`):
 *  - KHÔNG bịa số. Chưa có dữ liệu → `null`, bộ điền in dải chấm và giao diện liệt kê ô thiếu (CLAUDE.md 5.2).
 *    Giá dự thầu chỉ lấy từ bản dự toán ĐÃ PHÊ DUYỆT; chưa duyệt thì để trống.
 *  - Máy không quyết giá, không ký, không nộp (PRD 2.3). Giảm giá, thuế suất, thời gian thực hiện, hiệu lực hồ sơ
 *    là của người lập; máy chỉ làm phép tính trên số người ấy nhập (giảm % → số tiền, giá sau giảm, bằng chữ).
 *  - Phần kỹ thuật (biện pháp thi công, tiến độ, an toàn, chất lượng, vật liệu) KHÔNG soạn — danh mục kiểm tra ghi
 *    là việc của người viết.
 */

import { formatCurrency, formatDate, groupThousands, toMoney, type MoneyValue } from './format';
import { moneyToVietnameseWords } from './hd-template';

export type BidFormKind = 'ho_so_du_thau' | 'thuong_thao';

export const BID_FORM_KIND_LABELS: Readonly<Record<BidFormKind, string>> = {
  ho_so_du_thau: 'Hồ sơ dự thầu',
  thuong_thao: 'Biên bản thương thảo hợp đồng',
};

/** Nơi lấy giá trị của một chỗ trống — để người lập biết thiếu thì sửa ở đâu. */
export type BidFormFieldSource = 'phap_nhan' | 'goi_thau' | 'gia' | 'lap';

export const BID_FORM_SOURCE_LABELS: Readonly<Record<BidFormFieldSource, string>> = {
  gia: 'Giá dự thầu (tab Dự toán và ô giá ở cột trái)',
  goi_thau: 'Thông tin gói thầu (cột trái)',
  lap: 'Ngày, nơi lập và cam kết (cột trái)',
  phap_nhan: 'Thông tin pháp nhân — Ban Giám đốc / Quản trị sửa ở màn hình Mẫu hợp đồng',
};

export interface BidFormField {
  key: string;
  label: string;
  source: BidFormFieldSource;
}

export const BID_FORM_FIELDS: readonly BidFormField[] = [
  { key: 'nvg_ten', label: 'Tên pháp nhân', source: 'phap_nhan' },
  { key: 'nvg_ma_so_thue', label: 'Mã số thuế', source: 'phap_nhan' },
  { key: 'nvg_dia_chi', label: 'Địa chỉ pháp nhân', source: 'phap_nhan' },
  { key: 'nvg_dai_dien', label: 'Người đại diện theo pháp luật', source: 'phap_nhan' },
  { key: 'nvg_chuc_vu', label: 'Chức vụ người đại diện', source: 'phap_nhan' },
  { key: 'ten_goi_thau', label: 'Tên gói thầu', source: 'goi_thau' },
  { key: 'ten_du_an', label: 'Tên dự án', source: 'goi_thau' },
  { key: 'ben_moi_thau', label: 'Bên mời thầu', source: 'goi_thau' },
  { key: 'noi_lap', label: 'Nơi lập', source: 'lap' },
  { key: 'ngay_lap_ngay', label: 'Ngày lập', source: 'lap' },
  { key: 'ngay_lap_thang', label: 'Ngày lập', source: 'lap' },
  { key: 'ngay_lap_nam', label: 'Ngày lập', source: 'lap' },
  { key: 'thoi_gian_thuc_hien', label: 'Thời gian thực hiện hợp đồng (ngày)', source: 'lap' },
  { key: 'hieu_luc_hsdt', label: 'Hiệu lực của hồ sơ dự thầu (ngày)', source: 'lap' },
  { key: 'gia_du_thau', label: 'Tổng giá dự thầu', source: 'gia' },
  { key: 'gia_du_thau_bang_chu', label: 'Tổng giá dự thầu', source: 'gia' },
  { key: 'gia_du_thau_so', label: 'Tổng giá dự thầu', source: 'gia' },
  { key: 'thue_gtgt_gom', label: 'Giá đã / chưa gồm thuế GTGT', source: 'gia' },
  { key: 'gia_truoc_thue_so', label: 'Giá trước thuế (cần thuế suất GTGT)', source: 'gia' },
  { key: 'tien_thue_so', label: 'Tiền thuế GTGT (cần thuế suất GTGT)', source: 'gia' },
  { key: 'giam_gia_ty_le', label: 'Giảm giá', source: 'gia' },
  { key: 'giam_gia_so_tien', label: 'Giảm giá', source: 'gia' },
  { key: 'giam_gia_so_tien_so', label: 'Giảm giá', source: 'gia' },
  { key: 'giam_a_ty_le', label: 'Giảm giá theo tỷ lệ (Mẫu 02, phương án A)', source: 'gia' },
  { key: 'giam_b_so_tien', label: 'Giảm giá theo số tiền (Mẫu 02, phương án B)', source: 'gia' },
  { key: 'pa_giam_a', label: 'Ô chọn phương án giảm giá A', source: 'gia' },
  { key: 'pa_giam_b', label: 'Ô chọn phương án giảm giá B', source: 'gia' },
  { key: 'gia_sau_giam', label: 'Giá dự thầu sau giảm giá', source: 'gia' },
  { key: 'gia_sau_giam_bang_chu', label: 'Giá dự thầu sau giảm giá', source: 'gia' },
  { key: 'gia_sau_giam_so', label: 'Giá dự thầu sau giảm giá', source: 'gia' },
  { key: 'gia_theo_hsdt', label: 'Giá theo hồ sơ dự thầu', source: 'gia' },
];

const FIELD_BY_KEY = new Map(BID_FORM_FIELDS.map((f) => [f.key, f]));

export interface BidFormLoopColumn {
  key: string;
  label: string;
}

export interface BidFormLoop {
  label: string;
  /** Mẫu chứa bảng — để giao diện ghi «Mẫu 06». */
  form: string;
  columns: readonly BidFormLoopColumn[];
  /** Dòng gợi ý của mẫu (vị trí nhân sự, hạng mục giá) — khớp manifest do convert_bid.py ghi (có phép thử canh). */
  defaultRows: readonly Record<string, string>[];
}

export const BID_FORM_LOOPS: Readonly<Record<string, BidFormLoop>> = {
  hop_dong_tuong_tu: {
    label: 'Bảng kê hợp đồng tương tự',
    form: 'Mẫu 06',
    columns: [
      { key: 'ten', label: 'Tên hợp đồng, công trình, địa điểm' },
      { key: 'chu_dau_tu', label: 'Chủ đầu tư / bên giao thầu' },
      { key: 'gia_tri', label: 'Giá trị hợp đồng (tỷ đồng)' },
      { key: 'phan_thuc_hien', label: 'Phần NVC thực hiện' },
      { key: 'thoi_gian', label: 'Thời gian thực hiện' },
      { key: 'tai_lieu', label: 'Tài liệu chứng minh' },
    ],
    defaultRows: [{ tai_lieu: 'HĐ, BB nghiệm thu, thanh lý' }],
  },
  nhan_su: {
    label: 'Bảng kê nhân sự chủ chốt',
    form: 'Mẫu 07',
    columns: [
      { key: 'vi_tri', label: 'Vị trí' },
      { key: 'ho_ten', label: 'Họ tên' },
      { key: 'kinh_nghiem', label: 'Năm kinh nghiệm' },
      { key: 'chung_chi', label: 'Chứng chỉ hành nghề (số, hạng, hiệu lực)' },
      { key: 'hdld', label: 'HĐLĐ / BHXH tại NVC' },
    ],
    defaultRows: [
      { vi_tri: 'Chỉ huy trưởng' },
      { vi_tri: 'Cán bộ kỹ thuật kết cấu' },
      { vi_tri: 'Cán bộ kỹ thuật cơ điện' },
      { vi_tri: 'Cán bộ an toàn' },
      { vi_tri: 'Cán bộ QA/QC' },
    ],
  },
  thiet_bi: {
    label: 'Bảng kê thiết bị thi công chủ yếu',
    form: 'Mẫu 09',
    columns: [
      { key: 'ten', label: 'Tên thiết bị, công suất' },
      { key: 'so_luong', label: 'Số lượng' },
      { key: 'nam_sx', label: 'Năm sản xuất' },
      { key: 'so_huu', label: 'Sở hữu / đi thuê (tên bên cho thuê)' },
      { key: 'kiem_dinh', label: 'Kiểm định còn hiệu lực đến' },
      { key: 'ghi_chu', label: 'Ghi chú' },
    ],
    defaultRows: [],
  },
  tong_hop_gia: {
    label: 'Bảng tổng hợp giá dự thầu theo hạng mục',
    form: 'Mẫu 10',
    columns: [
      { key: 'hang_muc', label: 'Hạng mục' },
      { key: 'gia_tri', label: 'Giá trị (đồng)' },
      { key: 'ghi_chu', label: 'Ghi chú' },
    ],
    defaultRows: [
      { hang_muc: 'Phần chuẩn bị, lán trại, biện pháp' },
      { hang_muc: 'Phần móng, nền' },
      { hang_muc: 'Phần kết cấu (BTCT/thép)' },
      { hang_muc: 'Phần mái, bao che' },
      { hang_muc: 'Phần hoàn thiện' },
      { hang_muc: 'Phần cơ điện' },
      { hang_muc: 'Phần PCCC' },
      { hang_muc: 'Hạ tầng ngoài nhà' },
    ],
  },
};

/** Chỗ trống tự do của bộ mẫu (dải chấm đánh số — `free_fields` của mẫu). */
const FREE_TAG = /^(?:[oc]_\d+)$/;

/** Chỗ trống của mẫu mà danh mục không biết — mẫu như vậy không được nạp (phép thử canh). */
export function unknownBidFormTags(tags: Readonly<Record<string, unknown>>): string[] {
  const unknown: string[] = [];
  for (const [key, inner] of Object.entries(tags)) {
    if (FREE_TAG.test(key) || FIELD_BY_KEY.has(key)) continue;
    const loop = BID_FORM_LOOPS[key];
    if (!loop) {
      unknown.push(key);
      continue;
    }
    const cols = new Set(['stt', ...loop.columns.map((c) => c.key)]);
    for (const col of Object.keys((inner ?? {}) as object)) {
      if (!cols.has(col)) unknown.push(`${key}.${col}`);
    }
  }
  return unknown;
}

// ---------------------------------------------------------------------------------------------
// Dữ liệu điền
// ---------------------------------------------------------------------------------------------

export type BidFormRow = Record<string, string | null>;
export type BidFormValue = string | null | boolean | BidFormRow[];

/** Những gì người lập nhập ở cột trái — lưu dần theo gói thầu (`bid_form_inputs`) và kèm từng bản đã lưu. */
export interface BidFormInputs {
  ten_goi_thau?: string;
  ten_du_an?: string;
  ben_moi_thau?: string;
  noi_lap?: string;
  /** yyyy-mm-dd */
  ngay_lap?: string;
  thoi_gian_thuc_hien?: string;
  hieu_luc_hsdt?: string;
  /** Giá dự thầu đã duyệt đã / chưa gồm thuế GTGT — người lập chọn, máy không đoán. */
  vat_mode?: '' | 'gom' | 'chua';
  /** Thuế suất GTGT, % — chỉ để tách «trước thuế / tiền thuế» khi giá đã gồm thuế. */
  vat_rate?: string;
  /** '' = chưa khai (in dải chấm) · khong = không giảm giá · ty_le · so_tien */
  giam_mode?: '' | 'khong' | 'ty_le' | 'so_tien';
  giam_gia?: string;
  /** Các bảng kê — mỗi dòng một đối tượng cột → chữ. */
  tables?: Record<string, Record<string, string>[]>;
  /** Chỗ trống tự do của mẫu (dải chấm đánh số) — khoá `<mẫu>:o_N`, như `contract_document_inputs`. */
  free?: Record<string, string>;
}

export interface BidFormCompany {
  legal_name: string | null;
  tax_code: string | null;
  address: string | null;
  legal_representative: string | null;
  representative_title: string | null;
}

export interface BidFormSource {
  company: BidFormCompany;
  bid: {
    name: string;
    /** Tên cơ hội kinh doanh gắn gói thầu — gợi ý cho «dự án», người lập sửa được. */
    project_name: string | null;
    /** Khách hàng của gói thầu (chủ đầu tư / bên mời thầu). */
    inviter: string | null;
  };
  /** Giá dự thầu của bản dự toán HIỆN HÀNH ĐÃ PHÊ DUYỆT; `null` khi chưa có bản duyệt. */
  approvedBidPrice: MoneyValue | null;
  /** Mẫu 11: giá ghi trong hồ sơ dự thầu đã lưu (sau giảm giá nếu có). */
  priceInBid?: MoneyValue | null;
}

const blank = (s: string | number | null | undefined): string | null => {
  const t = s === null || s === undefined ? '' : String(s).trim();
  return t ? t : null;
};

/** «2,5» / «2.5» → 2.5; không phải số trong khoảng (0, 100] → null. */
export function parsePercent(s: string | null | undefined): number | null {
  const t = blank(s)?.replace('%', '').trim().replace(',', '.');
  if (!t || !/^\d+(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 100 ? n : null;
}

/** «50.000.000», «50000000 đồng» → 50000000n; có chữ khác chữ số / dấu chấm → null. */
export function parseMoneyInput(s: string | null | undefined): bigint | null {
  const t = blank(s)?.replace(/đồng/u, '').replace(/\s/g, '');
  if (!t || !/^\d[\d.]*$/.test(t)) return null;
  return BigInt(t.replace(/\./g, ''));
}

/** Thuế suất: 0 tới 100, cho phép «0». */
function parseRate(s: string | null | undefined): number | null {
  const t = blank(s)?.replace('%', '').trim().replace(',', '.');
  if (!t || !/^\d+(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

const pctText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const moneyNoUnit = (v: bigint) => groupThousands(v.toString());
const words = (v: bigint) => moneyToVietnameseWords(v);

/** Giá trị hợp đồng → «tỷ đồng» hai chữ số thập phân, dấu phẩy (Mẫu 06). */
export function toBillionText(value: MoneyValue | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(toMoney(value)) / 1e9;
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);
}

function dateParts(iso: string | null | undefined): { d: string; m: string; y: string } | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? { y: m[1]!, m: m[2]!, d: m[3]! } : null;
}

/** Kết quả tính giá — giao diện hiện lại để người lập soát. */
export interface BidPriceSummary {
  price: bigint | null;
  discount: bigint | null;
  discountPercent: number | null;
  afterDiscount: bigint | null;
  beforeVat: bigint | null;
  vat: bigint | null;
  /** Lý do không tính được — câu cho người dùng. */
  problems: string[];
}

export function bidPriceSummary(
  approvedBidPrice: MoneyValue | null,
  inputs: BidFormInputs,
): BidPriceSummary {
  const out: BidPriceSummary = {
    price: approvedBidPrice === null || approvedBidPrice === '' ? null : toMoney(approvedBidPrice),
    discount: null,
    discountPercent: null,
    afterDiscount: null,
    beforeVat: null,
    vat: null,
    problems: [],
  };
  if (out.price === null) {
    out.problems.push('Chưa có giá dự thầu đã phê duyệt — các ô giá in dải chấm.');
    return out;
  }
  const price = out.price;
  if (inputs.giam_mode === 'khong') {
    out.discount = 0n;
    out.discountPercent = 0;
    out.afterDiscount = price;
  } else if (inputs.giam_mode === 'ty_le') {
    const p = parsePercent(inputs.giam_gia);
    if (p === null) {
      if (blank(inputs.giam_gia))
        out.problems.push('Tỷ lệ giảm giá phải là số lớn hơn 0, tối đa 100.');
    } else {
      // Làm tròn nửa lên tới đồng, bằng bigint (tỷ lệ tới hai chữ số thập phân).
      const basis = BigInt(Math.round(p * 100));
      out.discount = (price * basis * 2n + 10_000n) / 20_000n;
      out.discountPercent = p;
    }
  } else if (inputs.giam_mode === 'so_tien') {
    const a = parseMoneyInput(inputs.giam_gia);
    if (a === null) {
      if (blank(inputs.giam_gia)) out.problems.push('Số tiền giảm giá chỉ gồm chữ số.');
    } else if (a > price) {
      out.problems.push('Số tiền giảm giá lớn hơn giá dự thầu.');
    } else {
      out.discount = a;
      out.discountPercent = price > 0n ? Number((a * 10_000n) / price) / 100 : null;
    }
  }
  if (out.discount !== null) out.afterDiscount = price - out.discount;

  if (inputs.vat_mode === 'gom') {
    const rate = parseRate(inputs.vat_rate);
    if (rate !== null) {
      const denominator = 10_000n + BigInt(Math.round(rate * 100));
      out.beforeVat = (price * 10_000n * 2n + denominator) / (2n * denominator);
      out.vat = price - out.beforeVat;
    } else if (blank(inputs.vat_rate)) {
      out.problems.push('Thuế suất GTGT phải là số từ 0 tới 100.');
    }
  } else if (inputs.vat_mode === 'chua') {
    out.beforeVat = price;
  }
  return out;
}

/**
 * Hồ sơ + ô người lập nhập → giá trị cho từng chỗ trống của mẫu. Ô không có dữ liệu là `null` (bộ điền in dải chấm).
 */
export function buildBidFormData(
  src: BidFormSource,
  inputs: BidFormInputs,
): Record<string, BidFormValue> {
  const c = src.company;
  const date = dateParts(inputs.ngay_lap);
  const s = bidPriceSummary(src.approvedBidPrice, inputs);
  const data: Record<string, BidFormValue> = {
    nvg_ten: blank(c.legal_name),
    nvg_ma_so_thue: blank(c.tax_code),
    nvg_dia_chi: blank(c.address),
    nvg_dai_dien: blank(c.legal_representative),
    nvg_chuc_vu: blank(c.representative_title),
    ten_goi_thau: blank(inputs.ten_goi_thau) ?? blank(src.bid.name),
    ten_du_an: blank(inputs.ten_du_an) ?? blank(src.bid.project_name),
    ben_moi_thau: blank(inputs.ben_moi_thau) ?? blank(src.bid.inviter),
    noi_lap: blank(inputs.noi_lap),
    ngay_lap_ngay: date?.d ?? null,
    ngay_lap_thang: date?.m ?? null,
    ngay_lap_nam: date?.y ?? null,
    thoi_gian_thuc_hien: blank(inputs.thoi_gian_thuc_hien),
    hieu_luc_hsdt: blank(inputs.hieu_luc_hsdt),
    gia_du_thau: s.price !== null ? formatCurrency(s.price) : null,
    gia_du_thau_bang_chu: s.price !== null ? words(s.price) : null,
    gia_du_thau_so: s.price !== null ? moneyNoUnit(s.price) : null,
    thue_gtgt_gom:
      inputs.vat_mode === 'gom' ? 'đã bao gồm' : inputs.vat_mode === 'chua' ? 'chưa bao gồm' : null,
    gia_truoc_thue_so: s.beforeVat !== null ? moneyNoUnit(s.beforeVat) : null,
    tien_thue_so: s.vat !== null ? moneyNoUnit(s.vat) : null,
    giam_gia_ty_le: s.discountPercent !== null ? pctText(s.discountPercent) : null,
    giam_gia_so_tien: s.discount !== null ? formatCurrency(s.discount) : null,
    giam_gia_so_tien_so: s.discount !== null ? moneyNoUnit(s.discount) : null,
    giam_a_ty_le:
      inputs.giam_mode === 'ty_le' && s.discountPercent !== null
        ? pctText(s.discountPercent)
        : null,
    giam_b_so_tien:
      inputs.giam_mode === 'so_tien' && s.discount !== null ? formatCurrency(s.discount) : null,
    pa_giam_a: inputs.giam_mode === 'ty_le' ? '☒' : '☐',
    pa_giam_b: inputs.giam_mode === 'so_tien' ? '☒' : '☐',
    gia_sau_giam: s.afterDiscount !== null ? formatCurrency(s.afterDiscount) : null,
    gia_sau_giam_bang_chu: s.afterDiscount !== null ? words(s.afterDiscount) : null,
    gia_sau_giam_so: s.afterDiscount !== null ? moneyNoUnit(s.afterDiscount) : null,
    gia_theo_hsdt:
      src.priceInBid !== undefined && src.priceInBid !== null && src.priceInBid !== ''
        ? formatCurrency(toMoney(src.priceInBid))
        : s.price !== null
          ? formatCurrency(s.price)
          : null,
  };
  for (const [name, loop] of Object.entries(BID_FORM_LOOPS)) {
    const given = inputs.tables?.[name] ?? loop.defaultRows.map((r) => ({ ...r }));
    // Bảng chưa có dòng nào → hai dòng trống in dải chấm (như bản giấy), không in bảng chỉ có tiêu đề.
    const rows = given.length > 0 ? given : [{}, {}];
    data[name] = rows.map((r: Record<string, string>, i) => {
      const row: BidFormRow = { stt: String(i + 1) };
      for (const col of loop.columns) {
        let v = blank(r[col.key]);
        // Cột tiền của Mẫu 10: người lập gõ số trơn → in có dấu chấm hàng nghìn.
        if (v && name === 'tong_hop_gia' && col.key === 'gia_tri') {
          const m = parseMoneyInput(v);
          if (m !== null) v = moneyNoUnit(m);
        }
        row[col.key] = v;
      }
      return row;
    });
  }
  return data;
}

/** Bảng kê bắt đầu từ dòng gợi ý của mẫu (lần đầu soạn). */
export function defaultBidFormTables(): Record<string, Record<string, string>[]> {
  return Object.fromEntries(
    Object.entries(BID_FORM_LOOPS).map(([k, l]) => [k, l.defaultRows.map((r) => ({ ...r }))]),
  );
}

/**
 * Mẫu 10: tổng các hạng mục đã điền lệch giá trước thuế (hoặc tổng giá khi chưa tách thuế) → câu cảnh báo. Không tự
 * sửa số nào — giá từng hạng mục là của người lập.
 */
export function priceTableMismatch(
  approvedBidPrice: MoneyValue | null,
  inputs: BidFormInputs,
): string | null {
  const rows = inputs.tables?.tong_hop_gia ?? [];
  const values = rows.map((r) => parseMoneyInput(r.gia_tri)).filter((v): v is bigint => v !== null);
  if (values.length === 0) return null;
  const s = bidPriceSummary(approvedBidPrice, inputs);
  const target = s.beforeVat ?? s.price;
  if (target === null) return null;
  const sum = values.reduce((a, b) => a + b, 0n);
  if (sum === target) return null;
  const what = s.beforeVat !== null ? 'giá trước thuế' : 'tổng giá dự thầu';
  return `Cộng các hạng mục Mẫu 10 là ${formatCurrency(sum)}, lệch ${what} ${formatCurrency(target)}.`;
}

export interface BidFormMissing {
  label: string;
  source: BidFormFieldSource | 'bang_ke';
}

/** Chỗ trống mẫu CÓ dùng mà chưa có giá trị → nhãn (gộp nhãn trùng: ngày / tháng / năm là một «Ngày lập»). */
export function missingBidFormFields(
  tags: Readonly<Record<string, unknown>>,
  data: Readonly<Record<string, BidFormValue>>,
): BidFormMissing[] {
  const out: BidFormMissing[] = [];
  const seen = new Set<string>();
  const push = (m: BidFormMissing) => {
    if (seen.has(m.label)) return;
    seen.add(m.label);
    out.push(m);
  };
  for (const key of Object.keys(tags)) {
    const field = FIELD_BY_KEY.get(key);
    if (field) {
      // Ô đánh dấu phương án luôn có giá trị (☐ / ☒) — không phải ô thiếu.
      if (data[key] === null || data[key] === undefined) {
        push({ label: field.label, source: field.source });
      }
      continue;
    }
    const loop = BID_FORM_LOOPS[key];
    if (loop) {
      const rows = (data[key] ?? []) as BidFormRow[];
      // Cột mẫu in sẵn (vị trí, hạng mục) không tính — bảng «trống» là chưa có dòng nào người lập điền.
      const preset = new Set(loop.defaultRows.flatMap((r) => Object.keys(r)));
      const empty = rows.every((r) => loop.columns.every((c) => preset.has(c.key) || !r[c.key]));
      if (empty)
        push({ label: `${loop.label} (${loop.form}) — chưa có dòng nào điền`, source: 'bang_ke' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Dòng điền sẵn từ hồ sơ có trên hệ thống
// ---------------------------------------------------------------------------------------------

export interface BidExperienceSource {
  title: string;
  contract_number: string | null;
  customer_name: string | null;
  value: MoneyValue | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  has_signed_scan: boolean;
  has_liquidation: boolean;
}

/** Hợp đồng đã ký / đã quyết toán → một dòng Mẫu 06. «Phần NVC thực hiện» để người lập ghi. */
export function experienceRow(c: BidExperienceSource): Record<string, string> {
  const docs = [
    `Hợp đồng${c.contract_number ? ` số ${c.contract_number}` : ''}${c.has_signed_scan ? ' (bản đã ký lưu trên hệ thống)' : ''}`,
  ];
  if (c.has_liquidation) docs.push('biên bản thanh lý');
  const row: Record<string, string> = {
    ten: [c.title, c.location].filter(Boolean).join(', '),
    tai_lieu: docs.join(', '),
  };
  if (c.customer_name) row.chu_dau_tu = c.customer_name;
  const value = toBillionText(c.value);
  if (value) row.gia_tri = value;
  if (c.start_date && c.end_date)
    row.thoi_gian = `${formatDate(c.start_date)} – ${formatDate(c.end_date)}`;
  return row;
}

export interface BidPersonSource {
  full_name: string;
  certificate: string | null;
  certificate_no: string | null;
  certificate_expiry: string | null;
}

/** Người trong Nhân sự (có chứng chỉ hành nghề) → điền họ tên + chứng chỉ vào dòng vị trí đã có. */
export function personnelPatch(p: BidPersonSource): Record<string, string> {
  const cert = [
    p.certificate,
    p.certificate_no ? `số ${p.certificate_no}` : null,
    p.certificate_expiry ? `hiệu lực đến ${formatDate(p.certificate_expiry)}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return cert ? { ho_ten: p.full_name, chung_chi: cert } : { ho_ten: p.full_name };
}

export interface BidEquipmentSource {
  title: string;
  document_number: string | null;
  expiry_date: string | null;
}

/** Giấy tờ thiết bị trong kho hồ sơ năng lực → một dòng Mẫu 09 (số lượng, năm sản xuất, sở hữu để người lập ghi). */
export function equipmentRow(d: BidEquipmentSource): Record<string, string> {
  const row: Record<string, string> = { ten: d.title };
  if (d.expiry_date) row.kiem_dinh = formatDate(d.expiry_date);
  if (d.document_number) row.ghi_chu = `Giấy tờ số ${d.document_number}`;
  return row;
}
