import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_FIELD_KEYS,
  buildAnnexData,
  buildTemplateData,
  missingTemplateFields,
  moneyToVietnameseWords,
  numberToVietnameseWords,
  splitVat,
  unknownTemplateTags,
  type TemplateSource,
  missingTemplateFieldsBySource,
  withoutHonorific,
} from '../hd-template';

describe('đọc số thành chữ', () => {
  it.each([
    [0n, 'Không'],
    [5n, 'Năm'],
    [10n, 'Mười'],
    [15n, 'Mười lăm'],
    [21n, 'Hai mươi mốt'],
    [25n, 'Hai mươi lăm'],
    [105n, 'Một trăm linh năm'],
    [110n, 'Một trăm mười'],
    [1_000n, 'Một nghìn'],
    [1_005n, 'Một nghìn không trăm linh năm'],
    [1_250_005_000n, 'Một tỷ hai trăm năm mươi triệu không trăm linh năm nghìn'],
    [2_000_000_000n, 'Hai tỷ'],
    [1_500_000_000_000n, 'Một nghìn năm trăm tỷ'],
    [1_000_500_000_000n, 'Một nghìn tỷ năm trăm triệu'],
    [300_000_000n, 'Ba trăm triệu'],
    [
      999_999_999n,
      'Chín trăm chín mươi chín triệu chín trăm chín mươi chín nghìn chín trăm chín mươi chín',
    ],
  ])('%s → %s', (n, words) => {
    expect(numberToVietnameseWords(n)).toBe(words);
  });

  it('số tiền kèm «đồng», nhận chuỗi từ CSDL', () => {
    expect(moneyToVietnameseWords('1250000000')).toBe('Một tỷ hai trăm năm mươi triệu đồng');
  });
});

describe('tách thuế GTGT', () => {
  it('hai phần cộng lại đúng tổng, làm tròn tới đồng', () => {
    const r = splitVat('1100000000', '10');
    expect(r).toEqual({ beforeVat: 1_000_000_000n, vat: 100_000_000n });
    const odd = splitVat(1_000_000_001n, '8')!;
    expect(odd.beforeVat + odd.vat).toBe(1_000_000_001n);
    expect(odd.beforeVat).toBe(925_925_927n);
  });
  it('thuế suất dạng số (PostgREST trả cột numeric là số) vẫn điền được', () => {
    const d = buildTemplateData(source({ vat_rate: 8 }));
    expect(d.thue_suat).toBe('8%');
    expect(d.gia_tri_truoc_thue).toBe('1.018.518.519 đồng');
  });

  it('chưa khai thuế suất thì không tách — không bịa', () => {
    expect(splitVat('1000', null)).toBeNull();
    expect(splitVat('1000', '')).toBeNull();
  });
});

const source = (over: Partial<TemplateSource['contract']> = {}): TemplateSource => ({
  contract: {
    code: 'HD-2026-0001',
    contract_number: null,
    title: 'Thi công nhà xưởng',
    type: 'thi_cong',
    price_form: 'tron_goi',
    value: '1100000000',
    vat_rate: '10',
    signed_date: '2026-10-05',
    start_date: null,
    end_date: null,
    project_location: 'KCN Tân Uyên',
    ...over,
  },
  company: {
    legal_name: 'Công ty Cổ phần Nhà Việt Cons',
    tax_code: '0312345678',
    address: 'TP. Hồ Chí Minh',
    phone: null,
    email: null,
    legal_representative: 'Nguyễn Văn A',
    representative_title: 'Giám đốc',
    bank_account_number: null,
    bank_name: null,
  },
  partner: {
    name: 'Công ty TNHH Khách',
    tax_code: null,
    address: 'Bình Dương',
    phone: '0901234567',
    email: null,
    representative_name: 'Trần Thị B',
    representative_title: null,
  },
  partner_name: null,
  terms: [
    {
      term_type: 'tien_do_thanh_toan',
      description: 'Đợt 2',
      amount: '700000000',
      percent_value: '70',
      due_date: null,
      position: '2',
    },
    {
      term_type: 'tien_do_thanh_toan',
      description: 'Đợt 1',
      amount: '300000000',
      percent_value: '30',
      due_date: '2026-11-01',
      position: '1',
    },
    {
      term_type: 'pham_vi',
      description: 'Thi công phần thô',
      amount: null,
      percent_value: null,
      due_date: null,
      position: '0',
    },
  ],
  today: '2026-10-16',
});

describe('dữ liệu điền mẫu', () => {
  it('điền giá trị, bằng chữ, tách thuế, ngày ký tách ngày / tháng / năm', () => {
    const d = buildTemplateData(source());
    expect(d.gia_tri).toBe('1.100.000.000 đồng');
    expect(d.gia_tri_bang_chu).toBe('Một tỷ một trăm triệu đồng');
    expect(d.gia_tri_truoc_thue).toBe('1.000.000.000 đồng');
    expect(d.tien_thue).toBe('100.000.000 đồng');
    expect(d.thue_suat).toBe('10%');
    expect(d.ngay_ky).toBe('05/10/2026');
    expect([d.ngay_ky_ngay, d.ngay_ky_thang, d.ngay_ky_nam]).toEqual(['05', '10', '2026']);
    expect(d.hinh_thuc_gia).toBe('Trọn gói');
  });

  it('NVG nhận thầu là bên B; NVG đi thuê (khoán) là bên A', () => {
    const recv = buildTemplateData(source());
    expect(recv.ben_b_ten).toBe('Công ty Cổ phần Nhà Việt Cons');
    expect(recv.ben_a_ten).toBe('Công ty TNHH Khách');
    const pay = buildTemplateData(source({ type: 'khoan_thau_phu' }));
    expect(pay.ben_a_ten).toBe('Công ty Cổ phần Nhà Việt Cons');
    expect(pay.ben_b_dai_dien).toBe('Trần Thị B');
  });

  it('đợt thanh toán theo đúng thứ tự, đánh số lại từ 1', () => {
    const rows = buildTemplateData(source()).dot_thanh_toan as { stt: string; noi_dung: string }[];
    expect(rows.map((r) => [r.stt, r.noi_dung])).toEqual([
      ['1', 'Đợt 1'],
      ['2', 'Đợt 2'],
    ]);
  });

  it('ô chưa có dữ liệu là null — không bịa — và được liệt kê khi mẫu dùng tới', () => {
    const d = buildTemplateData(source({ vat_rate: null }));
    expect(d.so_hop_dong).toBeNull();
    expect(d.tien_thue).toBeNull();
    expect(d.nvg_so_tai_khoan).toBeNull();
    const missing = missingTemplateFields(
      {
        so_hop_dong: {},
        tien_thue: {},
        ten_hop_dong: {},
        nvg_so_tai_khoan: {},
        dot_thanh_toan: { stt: {}, han: {} },
        bao_hanh: { noi_dung: {} },
      },
      d,
    );
    expect(missing).toEqual([
      'Số hợp đồng',
      'Tiền thuế GTGT',
      'Số tài khoản (pháp nhân NVG)',
      'Bảo hành — chưa có dòng nào',
    ]);
  });

  it('báo chỗ trống lạ, kể cả cột lạ trong bảng lặp', () => {
    expect(
      unknownTemplateTags({ ten_hop_dong: {}, ten_khach: {}, dot_thanh_toan: { so_tienn: {} } }),
    ).toEqual(['ten_khach', 'dot_thanh_toan.so_tienn']);
  });

  it('họ tên bỏ danh xưng cho mẫu in sẵn «Ông/Bà» — không ra «Ông/Bà Ông …»', () => {
    expect(withoutHonorific('Ông Nguyễn Văn Thử')).toBe('Nguyễn Văn Thử');
    expect(withoutHonorific('anh Trần Văn Hùng')).toBe('Trần Văn Hùng');
    expect(withoutHonorific('Ông/Bà Lê C')).toBe('Lê C');
    expect(withoutHonorific('Công ty TNHH Khách')).toBe('Công ty TNHH Khách');
    expect(withoutHonorific('Bàng Văn D')).toBe('Bàng Văn D');
    expect(withoutHonorific(null)).toBeNull();
    expect(buildTemplateData(source()).doi_tac_ho_ten).toBe('Công ty TNHH Khách');
  });

  it('mọi khoá dữ liệu đều có trong danh mục, và ngược lại', () => {
    const keys = Object.keys(buildTemplateData(source()));
    expect(new Set(keys)).toEqual(TEMPLATE_FIELD_KEYS);
  });
});

describe('missingTemplateFieldsBySource — ô thiếu chia theo nơi sửa', () => {
  const tags = {
    so_hop_dong: {},
    ben_a_dai_dien: {},
    ben_a_so_tai_khoan: {},
    ben_b_dia_chi: {},
    dot_thanh_toan: { ty_le: {} },
  };
  const data = {
    so_hop_dong: null,
    ben_a_dai_dien: null,
    ben_a_so_tai_khoan: null,
    ben_b_dia_chi: null,
    dot_thanh_toan: [],
  };

  it('hợp đồng thi công: NVG là bên B, khách là bên A', () => {
    const groups = Object.fromEntries(
      missingTemplateFieldsBySource(tags, data, 'thi_cong').map((g) => [g.source, g.labels]),
    );
    expect(groups.ky).toEqual(['Số hợp đồng']);
    expect(groups.khach_hang).toEqual(['Người đại diện (bên A)']);
    expect(groups.dien_tay).toEqual(['Số tài khoản (bên A)']);
    expect(groups.phap_nhan).toEqual(['Địa chỉ (bên B)']);
    expect(groups.dieu_khoan).toEqual(['Tiến độ thanh toán — chưa có dòng nào']);
  });

  it('khoán thầu phụ: NVG là bên A', () => {
    const groups = Object.fromEntries(
      missingTemplateFieldsBySource(tags, data, 'khoan_thau_phu').map((g) => [g.source, g.labels]),
    );
    expect(groups.phap_nhan).toEqual(['Người đại diện (bên A)', 'Số tài khoản (bên A)']);
    expect(groups.khach_hang).toEqual(['Địa chỉ (bên B)']);
  });
});

describe('văn bản kèm theo — phụ lục / biên bản thanh lý (0229)', () => {
  it('giữ số và ngày ký HỢP ĐỒNG gốc; ngày ký là của chính văn bản, chưa biết thì để trống', () => {
    const src = source({ contract_number: '05/2026/HĐTC' });
    const blankDate = buildAnnexData(src, {
      documentNumber: null,
      annexNumber: '2',
      signedDate: null,
    });
    expect(blankDate.so_hop_dong).toBe('05/2026/HĐTC');
    expect(blankDate.ngay_ky_hd).toBe('05/10/2026');
    expect(blankDate.so_phu_luc).toBe('2');
    expect(blankDate.so_van_ban).toBeNull();
    expect(blankDate.ngay_ky_ngay).toBeNull();
    expect(blankDate.ngay_ky_nam).toBeNull();
    expect(blankDate.nvg_ten).toBe(buildTemplateData(src).nvg_ten);

    const dated = buildAnnexData(src, {
      documentNumber: '12/PL-NVC',
      annexNumber: null,
      signedDate: '2026-11-20',
    });
    expect(dated.so_van_ban).toBe('12/PL-NVC');
    expect([dated.ngay_ky_ngay, dated.ngay_ky_thang, dated.ngay_ky_nam]).toEqual([
      '20',
      '11',
      '2026',
    ]);
    expect(dated.ngay_ky_hd).toBe('05/10/2026');
  });

  it('ba chỗ trống mới nằm trong danh mục — mẫu dùng chúng không bị coi là chỗ trống lạ', () => {
    for (const k of ['so_van_ban', 'so_phu_luc', 'ngay_ky_hd'])
      expect(TEMPLATE_FIELD_KEYS.has(k)).toBe(true);
  });
});
