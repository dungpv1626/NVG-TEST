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

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';

/** Khóa cache theo bảng + pháp nhân, để đổi pháp nhân là tải lại đúng phạm vi. */
export function entityKey(table: string, companyId: string | null, extra?: unknown) {
  return extra !== undefined ? [table, companyId, extra] : [table, companyId];
}

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
  orderBy?: { column: string; ascending?: boolean };
  queryOptions?: Omit<UseQueryOptions<T[], Error>, 'queryKey' | 'queryFn'>;
}

export function useEntityList<T>({
  table,
  select = '*',
  scopedByCompany = true,
  excludeDeleted = true,
  orderBy,
  queryOptions,
}: EntityListOptions<T>) {
  const companyId = useCompanyStore((s) => s.selectedCompanyId);

  return useQuery<T[], Error>({
    queryKey: entityKey(table, scopedByCompany ? companyId : null, { select, orderBy }),
    queryFn: async () => {
      let q = supabase.from(table).select(select);
      if (scopedByCompany && companyId) q = q.eq('company_id', companyId);
      if (excludeDeleted) q = q.is('deleted_at', null);
      if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? false });

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as T[];
    },
    // Chờ khôi phục xong pháp nhân đang chọn để không tải nhầm phạm vi rồi tải lại.
    enabled: scopedByCompany ? companyId !== null : true,
    ...queryOptions,
  });
}

export function useEntityDetail<T>({
  table,
  id,
  select = '*',
}: {
  table: string;
  id: string | undefined;
  select?: string;
}) {
  return useQuery<T | null, Error>({
    queryKey: [table, 'detail', id, select],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select(select).eq('id', id!).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as T | null;
    },
    enabled: Boolean(id),
  });
}

/**
 * Tạo bản ghi mới.
 *
 * Tự gắn `company_id` của pháp nhân đang chọn cho bảng giao dịch (NEN-01) — quên gắn
 * thì RLS sẽ chặn, nhưng để component tự nhớ ở 20 chỗ là công thức để sót.
 */
export function useCreateEntity<TInput extends Record<string, unknown>, TResult>({
  table,
  scopedByCompany = true,
}: {
  table: string;
  scopedByCompany?: boolean;
}) {
  const companyId = useCompanyStore((s) => s.selectedCompanyId);
  const queryClient = useQueryClient();

  return useMutation<TResult, Error, TInput>({
    mutationFn: async (input) => {
      const payload =
        scopedByCompany && companyId ? { ...input, company_id: companyId } : { ...input };

      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw new Error(error.message);
      return data as TResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [table] });
    },
  });
}

export function useUpdateEntity<TResult>({ table }: { table: string }) {
  const queryClient = useQueryClient();

  // `changes` để kiểu rộng thay vì generic: supabase-js chưa có kiểu sinh từ schema nên
  // generic bị suy luận thành RejectExcessProperties và không khớp.
  return useMutation<TResult, Error, { id: string; changes: Record<string, unknown> }>({
    mutationFn: async ({ id, changes }) => {
      const { data, error } = await supabase
        .from(table)
        .update({ ...changes })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as TResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [table] });
    },
  });
}
