/**
 * Pháp nhân đang chọn — Webapp Flow Mục 2.2.
 *
 * Dùng Zustand vì đây là trạng thái RIÊNG CỦA GIAO DIỆN, không phải dữ liệu máy chủ
 * (Tech Stack 2.3: TanStack Query cho dữ liệu máy chủ, Zustand cho trạng thái UI).
 *
 * Quy tắc từ Webapp Flow 2.2:
 *  - Chuyển pháp nhân KHÔNG tải lại toàn trang — chỉ làm mới nội dung, giữ nguyên
 *    module đang xem.
 *  - Tên pháp nhân đang chọn LUÔN hiển thị cố định, tránh nhầm dữ liệu giữa các công ty
 *    (Webapp Flow 6.2).
 *  - Chỉ Ban Giám đốc và Back Office thấy lựa chọn "Toàn NVG".
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CompanyState {
  /** `id` của pháp nhân đang chọn; `null` khi chưa khôi phục xong hồ sơ người dùng. */
  selectedCompanyId: string | null;
  setSelectedCompany: (companyId: string) => void;
  reset: () => void;
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
      selectedCompanyId: null,
      setSelectedCompany: (companyId) => set({ selectedCompanyId: companyId }),
      reset: () => set({ selectedCompanyId: null }),
    }),
    {
      name: 'nvg.selected-company',
      // Chỉ lưu id; tên và quyền luôn lấy lại từ hồ sơ để không dùng dữ liệu cũ
      // sau khi quản trị viên đổi phân quyền.
      partialize: (s) => ({ selectedCompanyId: s.selectedCompanyId }),
    },
  ),
);
