/**
 * Bộ chọn pháp nhân phải liệt kê đủ phạm vi XEM ĐƯỢC, không chỉ các dòng được GÁN.
 *
 * Lỗi đã xảy ra thật: Giám đốc Tài chính và Quản trị hệ thống chỉ có một dòng `user_companies`
 * trỏ vào NVG, nên bộ chọn rơi vào nhánh "một pháp nhân duy nhất" và hiện ra chữ tĩnh không
 * bấm được — họ kẹt vĩnh viễn ở chế độ gộp, trong khi Bảng điều khiển vẫn bảo "chọn một pháp
 * nhân để xem riêng". Cùng lớp lỗi với việc lọc `company_id = <id của NVG>` (Backend Schema 2.2).
 */

import { describe, expect, it } from 'vitest';
import { buildScopeCompanies, type CompanyCatalogRow, type CompanyRow } from '../auth';

const CATALOG: CompanyCatalogRow[] = [
  { id: 'nvg', code: 'NVG', short_name: 'Toàn NVG', display_order: 0 },
  { id: 'nvc', code: 'NVC', short_name: 'Nhà Việt Cons', display_order: 1 },
  { id: 'nvs', code: 'NVS', short_name: 'Nhà Việt Steel', display_order: 2 },
  { id: 'nvo', code: 'NVO', short_name: 'Nhà Việt One', display_order: 3 },
];

function row(
  company: CompanyCatalogRow,
  role: string,
  label: string,
  seesAll: boolean,
): CompanyRow {
  return {
    is_primary: true,
    companies: company,
    roles: { code: role, label, sees_all_companies: seesAll, default_route: null },
  };
}

describe('Danh sách pháp nhân chọn được', () => {
  it('vai trò cấp tập đoàn chỉ gán vào NVG vẫn chọn được cả ba pháp nhân giao dịch', () => {
    const options = buildScopeCompanies(
      [row(CATALOG[0]!, 'CFO', 'Giám đốc Tài chính', true)],
      CATALOG,
    );

    expect(options.map((o) => o.companyCode)).toEqual(['NVG', 'NVC', 'NVS', 'NVO']);
    // Nhiều hơn một mục là điều kiện để bộ chọn dựng ra dropdown thay vì chữ tĩnh.
    expect(options.length).toBeGreaterThan(1);
  });

  it('pháp nhân thêm vào mang nhãn của chính vai trò đã mở phạm vi', () => {
    const options = buildScopeCompanies(
      [row(CATALOG[0]!, 'CFO', 'Giám đốc Tài chính', true)],
      CATALOG,
    );

    expect(options.find((o) => o.companyCode === 'NVS')).toMatchObject({
      roleLabels: ['Giám đốc Tài chính'],
      viaSeesAll: true,
    });
    expect(options.find((o) => o.companyCode === 'NVG')?.viaSeesAll).toBe(false);
  });

  it('vai trò thường KHÔNG được nới phạm vi — danh mục không tải nên không có gì để thêm', () => {
    const options = buildScopeCompanies([row(CATALOG[1]!, 'KD', 'Kinh doanh', false)], null);

    expect(options.map((o) => o.companyCode)).toEqual(['NVC']);
  });

  it('người được gán trực tiếp nhiều pháp nhân giữ nguyên thứ tự danh mục', () => {
    const options = buildScopeCompanies(
      [
        row(CATALOG[3]!, 'KT', 'Kế toán', false),
        row(CATALOG[1]!, 'KT', 'Kế toán', false),
        row(CATALOG[2]!, 'KT', 'Kế toán', false),
      ],
      null,
    );

    expect(options.map((o) => o.companyCode)).toEqual(['NVC', 'NVS', 'NVO']);
  });

  it('giữ nhiều vai trò ở cùng một pháp nhân thì gộp thành một mục', () => {
    const options = buildScopeCompanies(
      [
        row(CATALOG[2]!, 'SX', 'Xưởng sản xuất – Cho thuê', false),
        row(CATALOG[2]!, 'KHO', 'Kho', false),
      ],
      null,
    );

    expect(options).toHaveLength(1);
    expect(options[0]!.roleLabels).toEqual(['Xưởng sản xuất – Cho thuê', 'Kho']);
  });
});
