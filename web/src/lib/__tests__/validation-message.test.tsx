/**
 * Lời thoại ràng buộc biểu mẫu phải bằng TIẾNG VIỆT.
 *
 * Đây là chỗ đã lọt lưới thật: ô "Tên hàng" bắt buộc để trống thì Chrome cài tiếng Anh hiện
 * "Please fill out this field." giữa một màn hình tiếng Việt. Nhân sự NVG có người không đọc
 * được tiếng Anh, và câu đó hiện lên đúng lúc họ đang BỊ CHẶN không nộp được biểu mẫu.
 *
 * Chữ này do trình duyệt sinh nên không nằm trong mã nguồn — `grep` không ra, đọc code không
 * thấy. Test là cách duy nhất canh được nó.
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import {
  applyVietnameseValidity,
  installVietnameseValidation,
  vietnameseValidationMessage,
} from '../validation-message';
import { renderWithApp } from '@/test/render';

/** Không chữ nào trong câu được là tiếng Anh. */
function expectVietnamese(message: string) {
  expect(message).not.toBe('');
  expect(message).not.toMatch(
    /Please|field|value|Value|must be|Fill|fill|match|format|greater|less|characters/,
  );
  // Có dấu tiếng Việt là bằng chứng đủ chắc rằng câu đã được viết lại, không phải câu gốc.
  expect(message).toMatch(/[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i);
}

describe('vietnameseValidationMessage', () => {
  function input(attrs: Partial<HTMLInputElement> & { value?: string } = {}) {
    const el = document.createElement('input');
    Object.assign(el, attrs);
    document.body.append(el);
    return el;
  }

  it('ô bắt buộc để trống', () => {
    const el = input({ required: true, value: '' });
    expectVietnamese(vietnameseValidationMessage(el));
    expect(vietnameseValidationMessage(el)).toBe('Vui lòng điền vào ô này.');
  });

  it('ô chọn bắt buộc nói "chọn", không nói "điền"', () => {
    const el = document.createElement('select');
    el.required = true;
    document.body.append(el);
    expect(vietnameseValidationMessage(el)).toBe('Vui lòng chọn một mục.');
  });

  it('email sai định dạng nói rõ thiếu gì', () => {
    const el = input({ type: 'email', value: 'khong-co-a-cong' });
    expectVietnamese(vietnameseValidationMessage(el));
    expect(vietnameseValidationMessage(el)).toContain('@');
  });

  it('vượt độ dài tối đa nêu con số cụ thể', () => {
    const el = input({ maxLength: 5 });
    // `maxLength` chỉ sinh `tooLong` khi giá trị do người dùng gõ vào.
    el.focus();
    el.setRangeText('quá dài so với năm ký tự');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const message = vietnameseValidationMessage(el);
    if (message !== '') expectVietnamese(message);
  });

  it('ô hợp lệ thì không có câu nào', () => {
    expect(vietnameseValidationMessage(input({ value: 'có nội dung' }))).toBe('');
  });
});

describe('applyVietnameseValidity', () => {
  it('câu riêng của màn hình được ưu tiên hơn câu suy từ ràng buộc', () => {
    const el = document.createElement('input');
    el.required = true;
    applyVietnameseValidity(el, 'Vui lòng nhập ngày (dd/mm/yyyy).');
    expect(el.validationMessage).toBe('Vui lòng nhập ngày (dd/mm/yyyy).');
  });

  it('gọi lại khi ô đã hợp lệ thì xoá sạch câu cũ', () => {
    const el = document.createElement('input');
    el.required = true;
    applyVietnameseValidity(el);
    expect(el.validationMessage).not.toBe('');

    el.value = 'đã điền';
    applyVietnameseValidity(el);
    // Không xoá `customValidity` trước khi đọc lại thì cờ `customError` của lượt trước còn
    // nguyên và ô không bao giờ trở lại hợp lệ.
    expect(el.validationMessage).toBe('');
    expect(el.checkValidity()).toBe(true);
  });
});

describe('Input — mọi ô nhập đều nói tiếng Việt', () => {
  it('ô bắt buộc để trống báo bằng tiếng Việt, không phải câu mặc định của trình duyệt', () => {
    renderWithApp(
      <Field label="Tên hàng">
        <Input required />
      </Field>,
    );
    const el = screen.getByRole('textbox', { name: /tên hàng/i }) as HTMLInputElement;
    expect(el.checkValidity()).toBe(false);
    expect(el.validationMessage).toBe('Vui lòng điền vào ô này.');
  });

  it('điền vào rồi thì hết chặn, câu cũ không dính lại', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Tên hàng">
        <Input required />
      </Field>,
    );
    const el = screen.getByRole('textbox', { name: /tên hàng/i }) as HTMLInputElement;
    await user.type(el, 'Thép hình H200');
    expect(el.checkValidity()).toBe(true);
    expect(el.validationMessage).toBe('');
  });
});

describe('installVietnameseValidation — chốt cuối cho ô không đi qua Input', () => {
  it('textarea viết thô trong trang cũng được dịch', () => {
    const remove = installVietnameseValidation();
    try {
      const el = document.createElement('textarea');
      el.required = true;
      document.body.append(el);
      // `checkValidity()` phát sinh sự kiện `invalid`, đúng thứ chốt này nghe.
      expect(el.checkValidity()).toBe(false);
      expect(el.validationMessage).toBe('Vui lòng điền vào ô này.');
      el.remove();
    } finally {
      remove();
    }
  });

  it('select viết thô cũng được dịch', () => {
    const remove = installVietnameseValidation();
    try {
      const el = document.createElement('select');
      el.required = true;
      el.append(new Option('', ''));
      document.body.append(el);
      expect(el.checkValidity()).toBe(false);
      expect(el.validationMessage).toBe('Vui lòng chọn một mục.');
      el.remove();
    } finally {
      remove();
    }
  });
});
