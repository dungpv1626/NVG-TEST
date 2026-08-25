/**
 * Hook truy vấn dữ liệu dùng chung cho mọi module.
 *
 * Tech Stack Mục 3.2 — quy tắc chọn lớp: thao tác chỉ đọc/ghi một hoặc vài bảng và quyền
 * diễn đạt được bằng RLS thì gọi THẲNG Supabase từ Frontend, KHÔNG viết API riêng.
 * Chỉ tạo endpoint trên Cloudflare Workers khi cần gọi dịch vụ ngoài, ghi nhiều bảng phải
 * toàn vẹn cùng lúc, hoặc quy tắc nghiệp vụ vượt khả năng của RLS.
 *
 * TanStack Query lo cache, làm mới, trạng thái đang tải/lỗi (Tech Stack 2.3).
 *
 * ⚠️ Lọc theo `company_id` ở đây là để HIỂN THỊ đúng pháp nhân đang chọn, KHÔNG phải hàng
 * rào bảo mật — hàng rào thật là RLS. Người dùng đổi tham số trong trình duyệt vẫn không
 * đọc được dữ liệu của pháp nhân họ không thuộc.
 */
import { type UseQueryOptions } from '@tanstack/react-query';
/** Khóa cache theo bảng + pháp nhân, để đổi pháp nhân là tải lại đúng phạm vi. */
export declare function entityKey(table: string, companyId: string | null, extra?: unknown): ({} | null)[];
export interface EntityListOptions<T> {
    /** Tên bảng trong CSDL (số nhiều, snake_case). */
    table: string;
    /** Danh sách cột PostgREST, gồm cả bảng liên kết. Mặc định `*`. */
    select?: string;
    /**
     * `true` (mặc định) lọc theo pháp nhân đang chọn. Đặt `false` cho bảng DÙNG CHUNG
     * không có cột `company_id` (`customers`, `suppliers`, `users`) — Backend Schema 2.2.
     */
    scopedByCompany?: boolean;
    /** Bỏ qua dòng đã xóa mềm. Mặc định `true`. */
    excludeDeleted?: boolean;
    orderBy?: {
        column: string;
        ascending?: boolean;
    };
    queryOptions?: Omit<UseQueryOptions<T[], Error>, 'queryKey' | 'queryFn'>;
}
export declare function useEntityList<T>({ table, select, scopedByCompany, excludeDeleted, orderBy, queryOptions, }: EntityListOptions<T>): import("@tanstack/react-query").UseQueryResult<T[], Error>;
export declare function useEntityDetail<T>({ table, id, select, }: {
    table: string;
    id: string | undefined;
    select?: string;
}): import("@tanstack/react-query").UseQueryResult<T | null, Error>;
/**
 * Tạo bản ghi mới.
 *
 * Tự gắn `company_id` của pháp nhân đang chọn cho bảng giao dịch (NEN-01) — quên gắn
 * thì RLS sẽ chặn, nhưng để component tự nhớ ở 20 chỗ là công thức để sót.
 */
export declare function useCreateEntity<TInput extends Record<string, unknown>, TResult>({ table, scopedByCompany, }: {
    table: string;
    scopedByCompany?: boolean;
}): import("@tanstack/react-query").UseMutationResult<TResult, Error, TInput, unknown>;
export declare function useUpdateEntity<TResult>({ table }: {
    table: string;
}): import("@tanstack/react-query").UseMutationResult<TResult, Error, {
    id: string;
    changes: Record<string, unknown>;
}, unknown>;
//# sourceMappingURL=use-entity.d.ts.map