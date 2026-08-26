/**
 * Thông báo ràng buộc biểu mẫu bằng TIẾNG VIỆT, thay câu mặc định của trình duyệt.
 *
 * Vì sao cần: `required`, `min`, `maxlength`, `pattern`… đều khiến trình duyệt tự hiện một câu
 * giải thích, và câu đó dịch theo NGÔN NGỮ CỦA TRÌNH DUYỆT chứ không theo `lang` của trang.
 * Chrome cài tiếng Anh — rất phổ biến trên máy văn phòng ở Việt Nam — hiện "Please fill out
 * this field." giữa một màn hình tiếng Việt.
 *
 * Đây không phải lỗi hình thức. Nhân sự NVG có người không đọc được tiếng Anh, và câu này hiện
 * lên đúng lúc họ đang BỊ CHẶN không nộp được biểu mẫu: không hiểu mình sai gì, cũng không đọc
 * được hướng dẫn sửa (PRD 6, CGD 4.1).
 *
 * Chữ này không nằm trong mã nguồn nên `grep` không ra và đọc code không thấy — chỉ lộ ra khi
 * đổi ngôn ngữ trình duyệt sang tiếng Anh rồi mở màn hình.
 */

/** Ô nhập có tham gia kiểm tra ràng buộc của biểu mẫu. */
export type ValidatableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function hasMinMax(el: ValidatableElement): el is HTMLInputElement {
  return el instanceof HTMLInputElement;
}

/**
 * Câu tiếng Việt cho lỗi ràng buộc đang có của một ô, hoặc `''` khi ô hợp lệ.
 *
 * Theo mẫu lỗi chuẩn: [việc gì không thực hiện được] + [cần làm gì] (CGD 5.5), và KHÔNG dùng
 * đại từ nhân xưng (CGD 4.2).
 *
 * Gọi sau khi đã xoá `customValidity` cũ, nếu không `customError` của lượt trước vẫn còn và
 * mọi ô đều báo sai mãi mãi.
 */
export function vietnameseValidationMessage(el: ValidatableElement): string {
  const v = el.validity;

  if (v.valueMissing) {
    return el instanceof HTMLSelectElement ? 'Vui lòng chọn một mục.' : 'Vui lòng điền vào ô này.';
  }

  if (v.typeMismatch) {
    if (el instanceof HTMLInputElement && el.type === 'email') {
      return 'Địa chỉ email chưa đúng định dạng (phải có dấu @).';
    }
    if (el instanceof HTMLInputElement && el.type === 'url') {
      return 'Địa chỉ liên kết chưa đúng định dạng.';
    }
    return 'Nội dung chưa đúng định dạng yêu cầu.';
  }

  if (!(el instanceof HTMLSelectElement)) {
    if (v.tooShort) return `Nội dung cần ít nhất ${el.minLength} ký tự.`;
    if (v.tooLong) return `Nội dung không được quá ${el.maxLength} ký tự.`;
  }

  if (hasMinMax(el)) {
    if (v.rangeUnderflow) return `Giá trị không được nhỏ hơn ${el.min}.`;
    if (v.rangeOverflow) return `Giá trị không được lớn hơn ${el.max}.`;
    // `step` mặc định của ô số là 1, nên lỗi này gần như luôn là "nhập số lẻ vào ô số nguyên".
    if (v.stepMismatch) return 'Giá trị chưa đúng bước nhảy cho phép.';
  }

  if (v.patternMismatch) return 'Nội dung chưa đúng định dạng yêu cầu.';
  // Ô số nhận được thứ không đọc ra số — ví dụ dán chữ vào ô `type="number"`.
  if (v.badInput) return 'Giá trị nhập vào không đọc được. Kiểm tra lại rồi thử lại.';

  return '';
}

/**
 * Đặt lại lời thoại cho một ô: ưu tiên câu riêng của màn hình, nếu không thì dịch câu của
 * trình duyệt.
 *
 * @param custom Câu lỗi riêng do component quyết định (ô ngày gõ dở, ô tiền bỏ trống…).
 *   Chuỗi rỗng nghĩa là không có lỗi riêng, để phần ràng buộc HTML tự quyết.
 */
export function applyVietnameseValidity(el: ValidatableElement, custom = ''): void {
  // Xoá trước rồi mới đọc: `setCustomValidity` bật cờ `customError`, nên không xoá thì lượt sau
  // đọc được chính lỗi mình vừa đặt và ô không bao giờ trở lại hợp lệ.
  el.setCustomValidity('');
  el.setCustomValidity(custom || vietnameseValidationMessage(el));
}

/**
 * Thuộc tính mang câu lỗi riêng của màn hình, đặt trên chính phần tử.
 *
 * Đi qua DOM chứ không qua prop vì chốt bên dưới nghe ở tầng `document`: nó không thấy được
 * cây React, chỉ thấy phần tử.
 */
export const VALIDATION_MESSAGE_ATTR = 'data-vn-validation';

/**
 * Chốt cuối: dịch lời thoại ràng buộc cho MỌI ô nhập trong ứng dụng, kể cả `<textarea>` và
 * `<select>` viết thô trong trang và những ô sẽ thêm sau này.
 *
 * Nghe ở giai đoạn CAPTURE trên `document` vì sự kiện `invalid` KHÔNG nổi bọt — nghe kiểu
 * thường ở tầng trên sẽ không bao giờ nhận được.
 *
 * Không thay thế phần xử lý trong `Input`: `Input` phải đặt câu lỗi NGAY, không đợi sự kiện,
 * cho những trường hợp ràng buộc HTML thấy hợp lệ mà màn hình thì không — ô ngày gõ dở `15/1`
 * không vi phạm `required` nào nên trình duyệt không hề phát sinh `invalid`.
 *
 * @returns hàm gỡ chốt (dùng trong test).
 */
export function installVietnameseValidation(root: Document = document): () => void {
  function handleInvalid(event: Event) {
    const el = event.target;
    if (
      !(el instanceof HTMLInputElement) &&
      !(el instanceof HTMLTextAreaElement) &&
      !(el instanceof HTMLSelectElement)
    ) {
      return;
    }
    applyVietnameseValidity(el, el.getAttribute(VALIDATION_MESSAGE_ATTR) ?? '');
  }
  root.addEventListener('invalid', handleInvalid, true);
  return () => root.removeEventListener('invalid', handleInvalid, true);
}
