/**
 * Nhãn + ô nhập của một trường biểu mẫu.
 *
 * Bọc ô nhập BÊN TRONG `<label>` để trình đọc màn hình tự liên kết nhãn với ô nhập mà không
 * cần `id`/`htmlFor` — quên cặp id ở một chỗ là ô đó mất tên trong cây trợ năng
 * (Content Guidelines 6.8).
 *
 * ⚠️ Cách bọc đó chỉ đúng khi bên trong có ĐÚNG MỘT ô nhập. Trình duyệt chuyển mọi cú bấm
 * rơi vào khoảng trống của `<label>` — kể cả chữ nhãn, dòng chú thích, và phần trống cuối
 * hàng — sang phần tử nhập ĐẦU TIÊN bên trong. Với một ô chữ thì đó là hành vi mong muốn
 * (bấm vào nhãn là con trỏ nhảy vào ô). Với một HÀNG nút chọn thì nó là lỗi: bấm vào chỗ
 * trống cạnh hàng nút lại BẤM hộ nút đầu tiên, tức là bật/tắt một lựa chọn người dùng không
 * hề chạm tới. Lỗi này im lặng — không có gì báo, chỉ là lựa chọn tự biến mất.
 *
 * Nên nhóm nhiều ô dùng `group` — khi đó nhãn không còn là `<label>` mà là `<fieldset>` +
 * `<legend>`, đúng phần tử HTML dành cho "một nhãn chung cho nhiều ô", và không có hành vi
 * chuyển cú bấm nào cả.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Field({
  label,
  required,
  optional,
  group,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  /**
   * Ghi thêm «(tùy chọn)» sau nhãn — dùng cho trường để trống vẫn chạy tiếp được.
   *
   * Loại trừ nhau với `required` về mặt nghĩa, nhưng KHÔNG chặn ở kiểu: hai cờ này đến từ
   * hai nguồn khác nhau (một do màn hình đặt, một do cấu hình biểu mẫu) và chặn nhau bằng
   * kiểu sẽ làm hỏng bản dựng ở chỗ chẳng liên quan.
   */
  optional?: boolean;
  /**
   * Bên trong là NHIỀU ô nhập (hàng nút chọn, hai ô khoảng giá, bốn cạnh khoảng lùi…).
   *
   * Xem chú thích đầu tệp: thiếu cờ này thì bấm vào khoảng trống quanh nhóm sẽ bấm hộ ô đầu
   * tiên.
   */
  group?: boolean;
  /**
   * Giải thích ngắn — dùng khi quy tắc nghiệp vụ không hiển nhiên.
   *
   * Đặt DƯỚI ô nhập, không phải dưới nhãn: nếu nằm trên, trường có chú thích sẽ đẩy ô nhập
   * của nó xuống thấp hơn các trường cùng hàng và cả hàng trông lệch nhau.
   */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const head = (
    <>
      {label}
      {required && <span className="ml-0.5 text-status-overdue">*</span>}
      {optional && <span className="ml-1 font-normal text-fg-subtle">(tùy chọn)</span>}
    </>
  );

  if (group) {
    // `min-w-0` cần cho fieldset: mặc định nó có `min-width: min-content`, nên một hàng nút
    // dài sẽ đẩy fieldset rộng ra khỏi cột thay vì xuống dòng.
    return (
      <fieldset className={cn('block min-w-0 space-y-1.5', className)}>
        <legend className="block font-medium">{head}</legend>
        {children}
        {/* `<span className="block">` chứ không phải `<p>`: chú thích có khi mang cả một nút
            trợ giúp dựng bằng `<div>`, và `<div>` trong `<p>` là HTML không hợp lệ. */}
        {hint && <span className="block text-xs font-normal text-fg-subtle">{hint}</span>}
      </fieldset>
    );
  }

  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="block font-medium">{head}</span>
      {children}
      {hint && <span className="block text-xs font-normal text-fg-subtle">{hint}</span>}
    </label>
  );
}
