/**
 * Chuyển lỗi kỹ thuật của Supabase/Postgres sang ngôn ngữ nghiệp vụ.
 *
 * Content Guidelines 4.6: "KHÔNG hiển thị mã lỗi kỹ thuật (mã HTTP, stack trace) cho người
 * dùng thường — chỉ ghi vào nhật ký hệ thống; người dùng chỉ thấy thông báo bằng ngôn ngữ
 * nghiệp vụ."
 *
 * Cấu trúc chuẩn: [việc gì không thực hiện được] + [vì sao / cần làm gì].
 */
/** Hành động đang thực hiện — quyết định cách diễn đạt lỗi thiếu quyền. */
export type ActionContext = 'view' | 'create' | 'edit' | 'delete' | 'approve';
export declare function toUserMessage(error: unknown, action?: ActionContext): string;
//# sourceMappingURL=use-error-message.d.ts.map