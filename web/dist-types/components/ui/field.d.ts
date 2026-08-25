/**
 * Nhãn + ô nhập của một trường biểu mẫu.
 *
 * Bọc ô nhập BÊN TRONG `<label>` để trình đọc màn hình tự liên kết nhãn với ô nhập mà không
 * cần `id`/`htmlFor` — quên cặp id ở một chỗ là ô đó mất tên trong cây trợ năng
 * (Content Guidelines 6.8).
 */
import type { ReactNode } from 'react';
export declare function Field({ label, required, hint, className, children, }: {
    label: string;
    required?: boolean;
    /**
     * Giải thích ngắn — dùng khi quy tắc nghiệp vụ không hiển nhiên.
     *
     * Đặt DƯỚI ô nhập, không phải dưới nhãn: nếu nằm trên, trường có chú thích sẽ đẩy ô nhập
     * của nó xuống thấp hơn các trường cùng hàng và cả hàng trông lệch nhau.
     */
    hint?: ReactNode;
    className?: string;
    children: ReactNode;
}): import("react").JSX.Element;
//# sourceMappingURL=field.d.ts.map