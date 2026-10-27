import { describe, expect, it } from 'vitest';
import { buildLeadImportRows, guessLeadColumns } from '../lead-import';

const HEADER = [
  'STT',
  'Họ và tên',
  'SĐT',
  'Email',
  'Khu vực',
  'Nguồn khách',
  'Loại công trình',
  'Ghi chú',
];

describe('Nhập đầu mối từ bảng tính', () => {
  it('nhận ra cột theo tiêu đề tiếng Việt có dấu / không dấu', () => {
    expect(guessLeadColumns(HEADER)).toEqual({
      fullName: 1,
      phone: 2,
      email: 3,
      area: 4,
      source: 5,
      projectType: 6,
      notes: 7,
    });
    expect(guessLeadColumns(['ten khach hang', 'so dien thoai'])).toEqual({
      fullName: 0,
      phone: 1,
    });
  });

  it('kiểm như biểu mẫu: tên, cách liên lạc, nguồn; nguồn / loại lạ không bị đoán', () => {
    const map = guessLeadColumns(HEADER);
    const rows = buildLeadImportRows(
      [
        HEADER,
        ['1', 'Nguyễn Văn An', '0912 345 678', '', 'Hưng Yên', 'facebook', 'Nhà phố', ''],
        ['2', 'Trần Bình', '912345679', '', '', 'Hội chợ', 'Nhà kho', 'Gọi sau 17 giờ'],
        ['3', '', '0912000000', '', '', '', '', ''],
        ['4', 'Lê Cường', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['6', 'Phạm Dũng', '0912-345-678', '', '', '', '', ''],
      ],
      map,
      'Zalo',
    );
    expect(rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 7]);

    const [an, binh, noName, noContact, dup] = rows;
    expect(an).toMatchObject({ source: 'Facebook', projectType: 'Nhà phố', errors: [] });

    // Số rơi số 0 đầu được thêm lại; nguồn lạ → «Khác» + chi tiết; loại lạ → ghi chú.
    expect(binh!.phone).toBe('0912345679');
    expect(binh).toMatchObject({ source: 'Khác', sourceDetail: 'Hội chợ', projectType: null });
    expect(binh!.notes).toBe('Gọi sau 17 giờ\nLoại công trình trong tệp: Nhà kho');
    expect(binh!.errors).toEqual([]);
    expect(binh!.warnings.length).toBe(3);

    expect(noName!.errors).toEqual(['Thiếu tên người liên hệ.']);
    expect(noName!.source).toBe('Zalo');
    expect(noContact!.errors[0]).toMatch(/Thiếu cả điện thoại lẫn email/);
    expect(dup!.warnings).toContain('Trùng số điện thoại với dòng 2 trong tệp.');
  });

  it('không có cột nguồn và không chọn nguồn mặc định thì dòng không nhập được', () => {
    const rows = buildLeadImportRows(
      [
        ['Tên', 'Điện thoại'],
        ['An', '0912345678'],
      ],
      { fullName: 0, phone: 1 },
      null,
    );
    expect(rows[0]!.errors).toEqual(['Thiếu nguồn — chọn «Nguồn mặc định» cho các dòng để trống.']);
  });
});
