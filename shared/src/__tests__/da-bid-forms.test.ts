/**
 * Dựng dữ liệu điền bộ biểu mẫu hồ sơ dự thầu (0236): không bịa số, phép tính giảm giá / tách thuế bằng bigint,
 * bảng kê từ hồ sơ có thật, danh sách ô thiếu.
 */

import { describe, expect, it } from 'vitest';
import {
  BID_FORM_LOOPS,
  bidPriceSummary,
  buildBidFormData,
  experienceRow,
  missingBidFormFields,
  parseMoneyInput,
  parsePercent,
  personnelPatch,
  priceTableMismatch,
  unknownBidFormTags,
  type BidFormRow,
  type BidFormSource,
} from '../index';

const source = (price: string | null): BidFormSource => ({
  company: {
    legal_name: 'CÔNG TY THỬ NVC',
    tax_code: '1001004344',
    address: 'Hưng Yên',
    legal_representative: 'Bùi Văn Thi',
    representative_title: 'Giám đốc',
  },
  bid: { name: 'Gói thầu nhà xưởng A', project_name: 'Nhà máy B', inviter: 'Công ty C' },
  approvedBidPrice: price,
});

describe('buildBidFormData', () => {
  it('chưa có giá đã duyệt → mọi ô giá để trống, không điền 0', () => {
    const d = buildBidFormData(source(null), {
      giam_mode: 'khong',
      vat_mode: 'gom',
      vat_rate: '8',
    });
    for (const k of [
      'gia_du_thau',
      'gia_du_thau_bang_chu',
      'gia_sau_giam',
      'gia_truoc_thue_so',
      'tien_thue_so',
    ]) {
      expect(d[k]).toBeNull();
    }
    expect(bidPriceSummary(null, {}).problems[0]).toMatch(/Chưa có giá dự thầu đã phê duyệt/);
  });

  it('pháp nhân + gói thầu lấy từ hồ sơ; người lập ghi đè được', () => {
    const d = buildBidFormData(source('1000000000'), { ten_du_an: 'Dự án ghi tay' });
    expect(d.nvg_ten).toBe('CÔNG TY THỬ NVC');
    expect(d.nvg_dai_dien).toBe('Bùi Văn Thi');
    expect(d.ten_goi_thau).toBe('Gói thầu nhà xưởng A');
    expect(d.ten_du_an).toBe('Dự án ghi tay');
    expect(d.ben_moi_thau).toBe('Công ty C');
    expect(d.gia_du_thau).toBe('1.000.000.000 đồng');
    expect(d.gia_du_thau_bang_chu).toBe('Một tỷ đồng');
    expect(d.gia_du_thau_so).toBe('1.000.000.000');
    // Chưa khai thì in dải chấm, không tự chọn «đã bao gồm».
    expect(d.thue_gtgt_gom).toBeNull();
    expect(d.ngay_lap_ngay).toBeNull();
  });

  it('giảm theo tỷ lệ: số tiền làm tròn tới đồng, phương án A được đánh dấu', () => {
    const d = buildBidFormData(source('1234567891'), { giam_mode: 'ty_le', giam_gia: '2,5' });
    expect(d.giam_gia_so_tien).toBe('30.864.197 đồng');
    expect(d.gia_sau_giam).toBe('1.203.703.694 đồng');
    expect(d.giam_a_ty_le).toBe('2,5');
    expect(d.giam_b_so_tien).toBeNull();
    expect([d.pa_giam_a, d.pa_giam_b]).toEqual(['☒', '☐']);
  });

  it('giảm một số tiền: tỷ lệ suy ra, phương án B; lớn hơn giá thì báo, không tính', () => {
    const d = buildBidFormData(source('2000000000'), {
      giam_mode: 'so_tien',
      giam_gia: '50.000.000',
    });
    expect(d.giam_gia_ty_le).toBe('2,5');
    expect(d.giam_b_so_tien).toBe('50.000.000 đồng');
    expect(d.gia_sau_giam_so).toBe('1.950.000.000');
    const s = bidPriceSummary('100', { giam_mode: 'so_tien', giam_gia: '200' });
    expect(s.afterDiscount).toBeNull();
    expect(s.problems.join(' ')).toMatch(/lớn hơn giá dự thầu/);
  });

  it('tách thuế chỉ khi người lập chọn «đã gồm» và ghi thuế suất', () => {
    const d = buildBidFormData(source('1080000000'), { vat_mode: 'gom', vat_rate: '8' });
    expect(d.thue_gtgt_gom).toBe('đã bao gồm');
    expect(d.gia_truoc_thue_so).toBe('1.000.000.000');
    expect(d.tien_thue_so).toBe('80.000.000');
    const chua = buildBidFormData(source('1080000000'), { vat_mode: 'chua' });
    expect(chua.gia_truoc_thue_so).toBe('1.080.000.000');
    expect(chua.tien_thue_so).toBeNull();
  });

  it('ngày lập tách ngày / tháng / năm, không qua múi giờ', () => {
    const d = buildBidFormData(source(null), { ngay_lap: '2026-10-28' });
    expect([d.ngay_lap_ngay, d.ngay_lap_thang, d.ngay_lap_nam]).toEqual(['28', '10', '2026']);
  });

  it('bảng kê: lần đầu là dòng gợi ý của mẫu; bảng rỗng in hai dòng trống; cột tiền Mẫu 10 có dấu chấm', () => {
    const d = buildBidFormData(source(null), {
      tables: { thiet_bi: [], tong_hop_gia: [{ hang_muc: 'Móng', gia_tri: '125000000' }] },
    });
    expect((d.nhan_su as BidFormRow[]).map((r) => r.vi_tri)).toEqual(
      BID_FORM_LOOPS.nhan_su!.defaultRows.map((r) => r.vi_tri),
    );
    expect(d.thiet_bi).toHaveLength(2);
    expect((d.thiet_bi as BidFormRow[])[0]).toMatchObject({ stt: '1', ten: null });
    expect((d.tong_hop_gia as BidFormRow[])[0]).toMatchObject({ stt: '1', gia_tri: '125.000.000' });
  });
});

describe('ô thiếu và chỗ trống lạ', () => {
  it('liệt kê ô mẫu dùng mà chưa có giá trị, gộp ngày / tháng / năm; bảng chỉ có dòng gợi ý là chưa điền', () => {
    const d = buildBidFormData(source(null), {});
    const tags = {
      nvg_ten: {},
      ngay_lap_ngay: {},
      ngay_lap_thang: {},
      gia_du_thau: {},
      nhan_su: {},
      pa_giam_a: {},
    };
    const labels = missingBidFormFields(tags, d).map((m) => m.label);
    expect(labels).toContain('Ngày lập');
    expect(labels.filter((l) => l === 'Ngày lập')).toHaveLength(1);
    expect(labels).toContain('Tổng giá dự thầu');
    expect(labels.some((l) => l.startsWith('Bảng kê nhân sự chủ chốt'))).toBe(true);
    expect(labels).not.toContain('Tên pháp nhân');
    expect(labels.some((l) => l.includes('phương án'))).toBe(false);
  });

  it('chỗ trống không có trong danh mục bị báo', () => {
    expect(
      unknownBidFormTags({ o_3: {}, nvg_ten: {}, la_lung: {}, nhan_su: { ho_ten: {}, luong: {} } }),
    ).toEqual(['la_lung', 'nhan_su.luong']);
  });

  it('Mẫu 10 lệch giá trước thuế thì cảnh báo, khớp thì im', () => {
    const inputs = {
      vat_mode: 'gom' as const,
      vat_rate: '10',
      tables: { tong_hop_gia: [{ gia_tri: '600.000.000' }, { gia_tri: '400.000.000' }] },
    };
    expect(priceTableMismatch('1100000000', inputs)).toBeNull();
    expect(priceTableMismatch('1200000000', inputs)).toMatch(/lệch giá trước thuế/);
  });
});

describe('dòng điền sẵn từ hồ sơ', () => {
  it('hợp đồng → Mẫu 06: tỷ đồng, thời gian, tài liệu có thật; «Phần NVC thực hiện» để người lập ghi', () => {
    const row = experienceRow({
      title: 'Nhà xưởng X',
      contract_number: '12/2025/HĐ',
      customer_name: 'Công ty Y',
      value: 12_345_000_000,
      start_date: '2025-01-05',
      end_date: '2025-09-30',
      location: 'Hưng Yên',
      has_signed_scan: true,
      has_liquidation: false,
    });
    expect(row).toEqual({
      ten: 'Nhà xưởng X, Hưng Yên',
      chu_dau_tu: 'Công ty Y',
      gia_tri: '12,35',
      thoi_gian: '05/01/2025 – 30/09/2025',
      tai_lieu: 'Hợp đồng số 12/2025/HĐ (bản đã ký lưu trên hệ thống)',
    });
    expect(row.phan_thuc_hien).toBeUndefined();
  });

  it('người có chứng chỉ → họ tên + chứng chỉ, không đoán năm kinh nghiệm', () => {
    expect(
      personnelPatch({
        full_name: 'Nguyễn Văn K',
        certificate: 'Chứng chỉ hành nghề giám sát hạng II',
        certificate_no: 'HN-123',
        certificate_expiry: '2028-03-01',
      }),
    ).toEqual({
      ho_ten: 'Nguyễn Văn K',
      chung_chi: 'Chứng chỉ hành nghề giám sát hạng II, số HN-123, hiệu lực đến 01/03/2028',
    });
  });

  it('đọc số người lập gõ', () => {
    expect(parsePercent('2,5')).toBe(2.5);
    expect(parsePercent('0')).toBeNull();
    expect(parsePercent('120')).toBeNull();
    expect(parseMoneyInput('50.000.000 đồng')).toBe(50_000_000n);
    expect(parseMoneyInput('năm mươi')).toBeNull();
  });
});
