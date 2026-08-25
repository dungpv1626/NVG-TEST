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
interface CompanyState {
    /** `id` của pháp nhân đang chọn; `null` khi chưa khôi phục xong hồ sơ người dùng. */
    selectedCompanyId: string | null;
    setSelectedCompany: (companyId: string) => void;
    reset: () => void;
}
export declare const useCompanyStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<CompanyState>, "setState" | "persist"> & {
    setState(partial: CompanyState | Partial<CompanyState> | ((state: CompanyState) => CompanyState | Partial<CompanyState>), replace?: false | undefined): unknown;
    setState(state: CompanyState | ((state: CompanyState) => CompanyState), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<CompanyState, {
            selectedCompanyId: string | null;
        }, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: CompanyState) => void) => () => void;
        onFinishHydration: (fn: (state: CompanyState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<CompanyState, {
            selectedCompanyId: string | null;
        }, unknown>>;
    };
}>;
export {};
//# sourceMappingURL=company-store.d.ts.map