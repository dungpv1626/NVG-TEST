/**
 * Phạm vi pháp nhân của một truy vấn — Webapp Flow Mục 2.2.
 *
 * "NVG" KHÔNG phải pháp nhân giao dịch: nó là mã tổng hợp toàn tập đoàn (Backend Schema 2.2).
 * Bảng giao dịch không bao giờ có dòng nào mang `company_id` của NVG, nên lọc thẳng
 * `company_id = <id của NVG>` cho ra danh sách RỖNG ở mọi màn hình.
 *
 * Đây là lỗi thật đã có trong bản dựng trước: Giám đốc Tài chính và Quản trị viên chỉ được
 * gán vào NVG nên mở màn hình nào cũng trắng, trong khi phân quyền hoàn toàn đúng — RLS vẫn
 * cho họ đọc dữ liệu cả ba pháp nhân. Nhìn như hệ thống chưa có dữ liệu chứ không như lỗi.
 *
 * Cách xử lý theo đúng Webapp Flow 2.2: chọn "Toàn NVG" thì BỎ điều kiện lọc, để RLS quyết
 * định phạm vi. Ai xem được cả ba pháp nhân sẽ thấy cả ba; ai không thì vẫn chỉ thấy phần
 * của mình — không có đường nào lách qua vì hàng rào nằm trong CSDL, không nằm ở đây.
 */

import { useMemo } from 'react';
import { COMPANIES, type CompanyCode } from '@nvg/shared';
import { useAuth } from './auth';
import { useCompanyStore } from './company-store';

export interface CompanyScope {
  /** `id` pháp nhân đang chọn. `null` khi chưa khôi phục xong hồ sơ người dùng. */
  companyId: string | null;
  /** Mã pháp nhân đang chọn, để hiển thị và để đặt mã hồ sơ mới. */
  companyCode: CompanyCode | null;
  /** Đang xem "Toàn NVG" — màn hình gộp dữ liệu nhiều pháp nhân. */
  isAggregate: boolean;
  /** Đã sẵn sàng truy vấn chưa (dùng cho `enabled` của TanStack Query). */
  isReady: boolean;
}

export function useCompanyScope(): CompanyScope {
  const { profile } = useAuth();
  const companyId = useCompanyStore((s) => s.selectedCompanyId);

  return useMemo(() => {
    const assignment = profile?.assignments.find((a) => a.companyId === companyId);
    const code = assignment?.companyCode ?? null;
    // Không suy ra từ mã cứng 'NVG' mà từ thuộc tính `isTransactional` — thêm pháp nhân mới
    // trong tương lai (PRD Mục 6, "hỗ trợ thêm công ty thành viên mới") không phải sửa ở đây.
    const isAggregate = code !== null && !COMPANIES[code].isTransactional;

    return {
      companyId,
      companyCode: code,
      isAggregate,
      isReady: companyId !== null,
    };
  }, [profile, companyId]);
}

/**
 * Áp phạm vi pháp nhân vào một truy vấn PostgREST.
 *
 * ⚠️ Đây là bộ lọc HIỂN THỊ, không phải hàng rào bảo mật — hàng rào thật là RLS. Bỏ điều
 * kiện này đi (chế độ gộp) không mở thêm quyền cho ai.
 */
export function withCompanyScope<Q>(query: Q, scope: CompanyScope): Q {
  if (scope.isAggregate || scope.companyId === null) return query;
  // Tham số kiểu để TRỐNG, không ràng buộc `Q extends { eq(...) }`: kiểu mà PostgREST sinh
  // ra cho một câu `select` nhiều bảng liên kết sâu tới mức trình biên dịch bỏ cuộc khi phải
  // đối chiếu với ràng buộc ("Type instantiation is excessively deep"). Đổi lại phải ép kiểu
  // một lần ở đây — rẻ hơn nhiều so với việc mọi hook tự viết lại điều kiện lọc.
  return (query as { eq(column: string, value: string): Q }).eq('company_id', scope.companyId);
}
