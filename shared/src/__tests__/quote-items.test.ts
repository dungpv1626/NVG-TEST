import { describe, expect, it } from 'vitest';
import {
  buildQuoteDocumentData,
  QUOTE_LOOP_COLUMNS,
  QUOTE_TEMPLATE_FIELDS,
  unknownQuoteTemplateTags,
  computeQuoteTotals,
  formatQuantity,
  lineAmount,
  parseQuantity,
  quantityToDb,
  vatNote,
} from '../quote-items';
import {
  DEFAULT_QUOTE_MESSAGE_TEMPLATES,
  fillMessageTemplate,
  isEmailAddress,
  MESSAGE_BLANK,
  unknownMessagePlaceholders,
} from '../quote-message';

describe('parseQuantity', () => {
  it('đọc khối lượng kiểu Việt Nam và dạng CSDL', () => {
    expect(parseQuantity('12,5')).toBe(125000n);
    expect(parseQuantity('1.250,75')).toBe(12507500n);
    expect(parseQuantity('1.250')).toBe(12500000n);
    expect(parseQuantity('3')).toBe(30000n);
    expect(parseQuantity('12.5000')).toBe(125000n);
    expect(parseQuantity(1.234)).toBe(12340n);
    expect(parseQuantity(250)).toBe(2500000n);
  });
  it('từ chối số âm, chữ, quá 4 chữ số thập phân', () => {
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('1,23456')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });
  it('trả lại chuỗi CSDL và hiển thị', () => {
    expect(quantityToDb(125000n)).toBe('12.5');
    expect(quantityToDb(30000n)).toBe('3');
    expect(formatQuantity('1250.75')).toBe('1.250,75');
  });
});

describe('lineAmount — khớp round() của CSDL', () => {
  it('làm tròn nửa lên tới đồng', () => {
    expect(lineAmount(parseQuantity('12,5')!, 1_000_000)).toBe(12_500_000n);
    expect(lineAmount(parseQuantity('0,3333')!, 100)).toBe(33n);
    expect(lineAmount(parseQuantity('0,0005')!, 1_000)).toBe(1n); // 0,5 → 1
    expect(lineAmount(parseQuantity('0,0004')!, 1_000)).toBe(0n);
  });
});

describe('computeQuoteTotals — gương của quote_totals (0239)', () => {
  it('không thuế: tổng = hạng mục − giảm giá', () => {
    expect(
      computeQuoteTotals({
        subtotal: 100_000_000,
        discount: 5_000_000,
        vatRate: null,
        vatIncluded: null,
      }),
    ).toEqual({
      subtotal: 100_000_000n,
      discount: 5_000_000n,
      net: 95_000_000n,
      vat: null,
      total: 95_000_000n,
    });
  });
  it('chưa gồm thuế: cộng thuế', () => {
    const t = computeQuoteTotals({
      subtotal: 100_000_000,
      discount: 5_000_000,
      vatRate: '10',
      vatIncluded: false,
    });
    expect(t.vat).toBe(9_500_000n);
    expect(t.total).toBe(104_500_000n);
  });
  it('đã gồm thuế: tách thuế, tổng không đổi', () => {
    const t = computeQuoteTotals({
      subtotal: 1_000_005,
      discount: 0,
      vatRate: 8,
      vatIncluded: true,
    });
    expect(t.vat).toBe(74_074n);
    expect(t.total).toBe(1_000_005n);
  });
});

describe('buildQuoteDocumentData', () => {
  const base = {
    quote: {
      code: 'NVC-BG-2026-0001',
      version: 2,
      status: 'completed',
      created_at: '2026-10-29T03:00:00Z',
      valid_until: '2026-11-30',
      notes: 'Phạm vi: phần thô',
      total_value: 104_500_000,
      discount_amount: 5_000_000,
      vat_rate: 10,
      vat_included: false,
      line_items_based: true,
    },
    items: [
      {
        position: 1,
        description: 'Đào móng',
        unit: 'm3',
        quantity: 100,
        unit_price: 600_000,
        amount: 60_000_000,
      },
      {
        position: 2,
        description: 'Bê tông',
        unit: 'm3',
        quantity: 12.5,
        unit_price: 3_200_000,
        amount: 40_000_000,
      },
    ],
    company: null,
    customer: { name: 'Ông Trần Văn Phát', address: null, phone: '0912345678', email: null },
    opportunityName: 'Nhà xưởng Phát',
    preparedBy: { full_name: 'Nguyễn Văn A', phone: null },
  };
  it('điền bảng hạng mục, tổng, bằng chữ; ô thiếu để null', () => {
    const d = buildQuoteDocumentData(base);
    expect(d.hang_muc).toHaveLength(2);
    expect(d.hang_muc[1]).toMatchObject({ stt: '2', khoi_luong: '12,5', thanh_tien: '40.000.000' });
    expect(d.tong_hang_muc).toBe('100.000.000 đồng');
    expect(d.tien_thue).toBe('9.500.000 đồng');
    expect(d.tong_cong).toBe('104.500.000 đồng');
    expect(d.tong_cong_bang_chu).toBe('Một trăm linh bốn triệu năm trăm nghìn đồng');
    expect(d.hieu_luc).toBe('30/11/2026');
    expect(d.khach_ten).toBe('Trần Văn Phát');
    expect(d.nvg_ten).toBeNull();
  });
  it('báo giá cũ không hạng mục: một dòng «Giá trị theo báo giá», tổng đã lưu, không dải chấm', () => {
    const d = buildQuoteDocumentData({
      ...base,
      quote: { ...base.quote, line_items_based: false, vat_rate: null, discount_amount: null },
      items: [],
    });
    expect(d.hang_muc).toEqual([
      expect.objectContaining({ noi_dung: 'Giá trị theo báo giá', thanh_tien: '104.500.000' }),
    ]);
    expect(d.tong_hang_muc).toBe('104.500.000 đồng');
    expect(d.tien_thue).toBe('Không ghi');
    expect(d.tong_cong).toBe('104.500.000 đồng');
    expect(d.ghi_chu_thue).toBe(vatNote(null, null));
  });
  it('câu chữ sửa trên văn bản thay câu mặc định; ô rỗng quay về mặc định', () => {
    const d = buildQuoteDocumentData({
      ...base,
      texts: { dieu_khoan_thanh_toan: 'Tạm ứng 30%', nguoi_ky: 'Bùi Văn Thi', gioi_thieu: '  ' },
    });
    expect(d.dieu_khoan_thanh_toan).toBe('Tạm ứng 30%');
    expect(d.nguoi_ky).toBe('Bùi Văn Thi');
    expect(d.gioi_thieu).toContain('trân trọng gửi báo giá');
    expect(d.dieu_kien).toBe('Phạm vi: phần thô');
  });
});

describe('lời nhắn', () => {
  it('điền mẫu, tên khách thiếu thì «Quý khách», ô khác thiếu thì dải chấm', () => {
    const r = fillMessageTemplate(DEFAULT_QUOTE_MESSAGE_TEMPLATES.zalo.body, {
      ma_bao_gia: 'NVC-BG-1',
      gia_tri: '1.000 đồng',
      phap_nhan: 'Nhà Việt Cons',
      nguoi_gui: 'Nguyễn Văn A',
    });
    expect(r.text).toContain('Kính gửi Quý khách,');
    expect(r.text).toContain('NVC-BG-1');
    expect(r.text).toContain(MESSAGE_BLANK);
    expect(r.missing.sort()).toEqual(['hieu_luc', 'sdt_nguoi_gui']);
    expect(r.text).not.toMatch(/\{[a-z_]+\}/);
  });
  it('mẫu mặc định không có chỗ trống lạ', () => {
    for (const t of Object.values(DEFAULT_QUOTE_MESSAGE_TEMPLATES)) {
      expect(unknownMessagePlaceholders(t.body + (t.subject ?? ''))).toEqual([]);
    }
    expect(unknownMessagePlaceholders('{ten_khach} {gia_tien}')).toEqual(['gia_tien']);
  });
  it('kiểm email thô', () => {
    expect(isEmailAddress('a.b@nhavietgroup.vn')).toBe(true);
    expect(isEmailAddress('khong-phai-email')).toBe(false);
  });
});

describe('chỗ trống mẫu Word báo giá', () => {
  const sample = buildQuoteDocumentData({
    quote: {
      code: 'X',
      version: 1,
      status: 'draft',
      created_at: '2026-10-29',
      valid_until: null,
      notes: null,
      total_value: 1,
      discount_amount: null,
      vat_rate: null,
      vat_included: null,
      line_items_based: true,
    },
    items: [{ position: 1, description: 'a', unit: null, quantity: 1, unit_price: 1, amount: 1 }],
    company: null,
    customer: null,
    opportunityName: null,
    preparedBy: null,
  });
  it('danh mục chỗ trống khớp đúng bộ dữ liệu điền (hai chiều)', () => {
    expect(new Set(QUOTE_TEMPLATE_FIELDS.map((f) => f.key))).toEqual(new Set(Object.keys(sample)));
    expect(new Set(QUOTE_LOOP_COLUMNS.map(([k]) => k))).toEqual(
      new Set(Object.keys(sample.hang_muc[0]!)),
    );
  });
  it('báo chỗ trống lạ, cột lạ, bảng lặp sai chỗ', () => {
    expect(
      unknownQuoteTemplateTags({ so_bao_gia: {}, hang_muc: { stt: {}, thanh_tien: {} } }),
    ).toEqual([]);
    expect(
      unknownQuoteTemplateTags({ ben_a_ten: {}, hang_muc: { gia: {} }, tong_cong: { x: {} } }),
    ).toEqual(['ben_a_ten', 'hang_muc.gia', 'tong_cong.x']);
  });
});
