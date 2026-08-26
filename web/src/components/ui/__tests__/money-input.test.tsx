/**
 * `MoneyInput` — ô nhập tiền có dấu chấm phân cách hàng nghìn.
 *
 * Đáng canh vì sai ở đây sai lặng lẽ: giá trị tiền của NVG dài 9–12 chữ số, `1000000` và
 * `10000000` nhìn gần như nhau ở cỡ chữ 14px, mà lệch một chữ số là lệch mười lần số tiền trên
 * một báo giá. Đọc lại không bắt được; chỉ dấu phân cách mới bắt được.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MoneyInput } from '../money-input';
import { Field } from '../field';
import { renderWithApp } from '@/test/render';

/** Bọc trong state để ô hoạt động đúng như ở trang thật (ô này luôn được điều khiển). */
function MoneyField({
  label = 'Giá trị dự kiến',
  initial = '',
  onValue,
  ...props
}: { label?: string; initial?: string; onValue?: (v: string) => void } & Omit<
  React.ComponentProps<typeof MoneyInput>,
  'value' | 'onChange'
>) {
  const [value, setValue] = useState(initial);
  return (
    <Field label={label}>
      <MoneyInput
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
      />
    </Field>
  );
}

const field = () => screen.getByRole('textbox', { name: /giá trị dự kiến/i }) as HTMLInputElement;

describe('MoneyInput — hiển thị', () => {
  it('nhóm hàng nghìn ngay khi gõ', async () => {
    const user = userEvent.setup();
    renderWithApp(<MoneyField />);
    await user.type(field(), '1000000');
    expect(field()).toHaveValue('1.000.000');
  });

  it('hiện đúng giá trị đã lưu, không bắt người dùng tự đếm chữ số', () => {
    renderWithApp(<MoneyField initial="8500000000" />);
    expect(field()).toHaveValue('8.500.000.000');
  });

  it('số ngắn hơn một nghìn thì không có dấu chấm nào', async () => {
    const user = userEvent.setup();
    renderWithApp(<MoneyField />);
    await user.type(field(), '500');
    expect(field()).toHaveValue('500');
  });
});

describe('MoneyInput — giá trị gửi đi', () => {
  it('trả về CHUỖI CHỮ SỐ THÔ, không kèm dấu chấm', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithApp(<MoneyField onValue={onValue} />);
    await user.type(field(), '1000000');
    // Cột `bigint` không nhận `1.000.000`; gửi nguyên chuỗi hiển thị là lỗi ghi dữ liệu.
    expect(onValue).toHaveBeenLastCalledWith('1000000');
  });

  it('nộp lên biểu mẫu bằng chuỗi thô', async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<MoneyField name="estimated_value" />);
    await user.type(field(), '2400000000');
    expect(container.querySelector('input[name="estimated_value"]')).toHaveValue('2400000000');
  });

  it('gõ chữ hay dấu chấm tay đều bị bỏ, chỉ còn chữ số', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithApp(<MoneyField onValue={onValue} />);
    await user.type(field(), '1.2a3');
    expect(onValue).toHaveBeenLastCalledWith('123');
  });
});

describe('MoneyInput — số âm', () => {
  it('mặc định KHÔNG nhận dấu trừ', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithApp(<MoneyField onValue={onValue} />);
    await user.type(field(), '-500000');
    // Một dấu trừ gõ nhầm biến khoản thu thành khoản chi mà biểu mẫu vẫn nhận.
    expect(onValue).toHaveBeenLastCalledWith('500000');
  });

  it('bật `allowNegative` thì nhận, và vẫn nhóm hàng nghìn', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithApp(<MoneyField label="Thay đổi giá trị hợp đồng" allowNegative onValue={onValue} />);
    const input = screen.getByRole('textbox', { name: /thay đổi giá trị hợp đồng/i });
    await user.type(input, '-500000');
    expect(input).toHaveValue('-500.000');
    expect(onValue).toHaveBeenLastCalledWith('-500000');
  });
});

describe('MoneyInput — vị trí con trỏ', () => {
  it('gõ thêm chữ số ở giữa thì con trỏ ở lại chỗ đang gõ, không nhảy về cuối', async () => {
    const user = userEvent.setup();
    renderWithApp(<MoneyField initial="1000000" />);
    const input = field();
    expect(input).toHaveValue('1.000.000');

    // Chèn `5` ngay sau chữ số đầu: `1|.000.000` → `15.000.000`.
    await user.click(input);
    input.setSelectionRange(1, 1);
    await user.keyboard('5');

    expect(input).toHaveValue('15.000.000');
    // Không neo con trỏ thì nó bị hất về vị trí 10 và phải xoá hết gõ lại.
    expect(input.selectionStart).toBe(2);
  });
});

describe('MoneyInput — lưu khi rời ô', () => {
  it('báo chuỗi thô khi rời ô, cho màn hình Giá dự thầu ghi xuống', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    renderWithApp(
      <>
        <MoneyField onBlur={onBlur} />
        <button type="button">Chỗ khác</button>
      </>,
    );
    await user.type(field(), '4500000000');
    await user.click(screen.getByRole('button', { name: 'Chỗ khác' }));
    expect(onBlur).toHaveBeenCalledWith('4500000000');
  });
});

/**
 * Chế độ KHÔNG điều khiển — ô đọc lại bằng `FormData`: đơn giá báo giá nhà cung cấp, đơn giá
 * ước tính của đề nghị mua, chi phí bồi thường giàn giáo.
 *
 * Cùng ba cái bẫy đã gặp ở ô ngày: `defaultValue` về muộn, `form.reset()`, và giá trị nộp lên
 * phải là chuỗi thô. Chúng dùng chung `useMaskedText` nên bộ test này cũng canh cho ô ngày.
 */
describe('MoneyInput — chế độ không điều khiển', () => {
  it('nộp lên chuỗi thô dù màn hình hiện dấu chấm', async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(
      <Field label="Đơn giá ước tính">
        <MoneyInput name="estimated_unit_price" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /đơn giá ước tính/i });
    await user.type(input, '1250000');

    expect(input).toHaveValue('1.250.000');
    // Cột `bigint` từ chối `1.250.000`.
    expect(container.querySelector('input[name="estimated_unit_price"]')).toHaveValue('1250000');
  });

  it('form.reset() đưa ô về mặc định để phiếu sau không mang số của phiếu trước', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <form>
        <Field label="Chi phí bồi thường">
          <MoneyInput name="amount" defaultValue="0" />
        </Field>
        <button type="reset">Đặt lại</button>
      </form>,
    );
    const input = screen.getByRole('textbox', { name: /chi phí bồi thường/i });
    await user.clear(input);
    await user.type(input, '5000000');
    expect(input).toHaveValue('5.000.000');

    await user.click(screen.getByRole('button', { name: 'Đặt lại' }));
    expect(input).toHaveValue('0');
  });

  it('dữ liệu về sau lượt vẽ đầu vẫn hiện ra', async () => {
    const user = userEvent.setup();
    function LateData() {
      const [amount, setAmount] = useState<string | undefined>(undefined);
      return (
        <>
          <button type="button" onClick={() => setAmount('7500000')}>
            Nạp xong dữ liệu
          </button>
          <Field label="Đơn giá">
            <MoneyInput name="price" defaultValue={amount ?? ''} />
          </Field>
        </>
      );
    }
    renderWithApp(<LateData />);
    const input = screen.getByRole('textbox', { name: /đơn giá/i });
    expect(input).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Nạp xong dữ liệu' }));
    expect(input).toHaveValue('7.500.000');
  });
});

describe('MoneyInput — ô bắt buộc', () => {
  it('để trống thì không nộp được, và báo BẰNG TIẾNG VIỆT', () => {
    renderWithApp(
      <Field label="Đơn giá">
        <MoneyInput name="price" required />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /đơn giá/i }) as HTMLInputElement;
    expect(input.checkValidity()).toBe(false);
    // Câu mặc định của trình duyệt dịch theo ngôn ngữ TRÌNH DUYỆT, không theo trang.
    expect(input.validationMessage).toBe('Vui lòng nhập số tiền.');
  });

  it('nhập rồi thì hết chặn — thông báo cũ không dính lại', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Đơn giá">
        <MoneyInput name="price" required />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /đơn giá/i }) as HTMLInputElement;
    await user.type(input, '1000000');
    expect(input.checkValidity()).toBe(true);
    expect(input.validationMessage).toBe('');
  });
});

describe('MoneyInput — dấu trừ gõ dở', () => {
  it('dấu trừ ở lại trong ô để gõ tiếp, nhưng KHÔNG được gửi đi một mình', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithApp(<MoneyField label="Thay đổi giá trị hợp đồng" allowNegative onValue={onValue} />);
    const input = screen.getByRole('textbox', { name: /thay đổi giá trị hợp đồng/i });
    await user.type(input, '-');

    expect(input).toHaveValue('-');
    // `'-'` đi thẳng xuống cột `bigint` thì Postgres từ chối bằng một lỗi kỹ thuật.
    expect(onValue).toHaveBeenLastCalledWith('');
  });
});
