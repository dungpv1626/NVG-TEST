/**
 * Hai hàng rào mà MỌI màn hình dựa vào: quyền theo phân hệ và lọc theo pháp nhân.
 *
 * Bộ kiểm này sinh ra từ một lượt đo đột biến (`scripts/mutation-proof.ts`, 20/09/2026): cài hai
 * lỗi thật vào mã nguồn — «không có quyền thì trả TRUE» và «bỏ hẳn điều kiện lọc company_id» —
 * rồi chạy lại 1.599 bài kiểm. Cả hai đều SỐNG SÓT. Lý do: mọi bài kiểm giao diện thay cả mô-đun
 * `@/lib/auth` bằng bản giả, nên đoạn quyết định thật không bài nào chạy qua.
 *
 * Hậu quả của hai lỗi ấy không giống nhau, nên canh riêng:
 *  · quyền sai → người dùng mở được màn hình của phân hệ không phải việc của mình (RLS vẫn chặn
 *    dữ liệu, nhưng màn hình rỗng đọc thành «chưa có dữ liệu» — xem `module-guard.test.tsx`);
 *  · lọc pháp nhân sai → nhân viên NVO thấy hồ sơ của NVC và NVS trên cùng một danh sách.
 */

import { describe, expect, it } from 'vitest';
import { canDo, type ModulePermission } from '../auth';
import { withCompanyScope, type CompanyScope } from '../company-scope';

const KHO: ModulePermission = {
  moduleCode: 'KHO',
  canView: true,
  canCreate: true,
  canEdit: false,
  canDelete: false,
  canApprove: false,
};

describe('Quyền theo phân hệ', () => {
  it('KHÔNG có dòng quyền cho phân hệ thì từ chối — mặc định là thấy ÍT đi', () => {
    for (const action of ['view', 'create', 'edit', 'delete', 'approve'] as const) {
      expect(canDo([KHO], 'KT', action)).toBe(false);
      expect(canDo([], 'KHO', action)).toBe(false);
      expect(canDo(undefined, 'KHO', action)).toBe(false);
    }
  });

  it('từng hành động đọc đúng cột của nó, không suy từ quyền xem', () => {
    expect(canDo([KHO], 'KHO', 'view')).toBe(true);
    expect(canDo([KHO], 'KHO', 'create')).toBe(true);
    expect(canDo([KHO], 'KHO', 'edit')).toBe(false);
    expect(canDo([KHO], 'KHO', 'delete')).toBe(false);
    expect(canDo([KHO], 'KHO', 'approve')).toBe(false);
  });
});

const BASE: CompanyScope = {
  companyId: 'nvo-id',
  companyCode: 'NVO',
  isAggregate: false,
  isReady: true,
};

/** Câu truy vấn giả: chỉ ghi lại xem `.eq()` có được gọi với cột và giá trị nào. */
function fakeQuery() {
  const calls: Array<[string, string]> = [];
  const query = {
    calls,
    eq(column: string, value: string) {
      calls.push([column, value]);
      return query;
    },
  };
  return query;
}

describe('Lọc theo pháp nhân', () => {
  it('chọn một pháp nhân cụ thể thì câu truy vấn PHẢI mang điều kiện company_id', () => {
    const query = fakeQuery();
    const scope = { ...BASE, companyId: 'nvo-id', companyCode: 'NVO' as const };
    withCompanyScope(query, scope);
    expect(query.calls).toEqual([['company_id', 'nvo-id']]);
  });

  it('chế độ gộp «Toàn NVG» thì BỎ điều kiện lọc, không lọc theo mã của NVG', () => {
    // Lọc `company_id = <id của NVG>` cho ra danh sách rỗng ở mọi màn hình: NVG là mã tổng hợp,
    // không phải pháp nhân giao dịch (Backend Schema 2.2). Chuyện này đã xảy ra thật.
    const query = fakeQuery();
    const scope = { ...BASE, companyId: 'nvg-id', companyCode: 'NVG' as const, isAggregate: true };
    withCompanyScope(query, scope);
    expect(query.calls).toEqual([]);
  });

  it('chưa biết pháp nhân nào thì cũng không tự dựng điều kiện lọc', () => {
    const query = fakeQuery();
    const scope = { ...BASE, companyId: null, companyCode: null, isReady: false };
    withCompanyScope(query, scope);
    expect(query.calls).toEqual([]);
  });
});
