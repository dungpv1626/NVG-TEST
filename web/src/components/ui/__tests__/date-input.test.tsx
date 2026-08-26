/**
 * `DateInput` — ô nhập ngày thay cho `<input type="date">` gốc của trình duyệt.
 *
 * Cần canh vì đây là lỗi im lặng: `<input type="date">` hiện theo ngôn ngữ của TRÌNH DUYỆT chứ
 * không theo `lang` của trang, nên trên máy cài tiếng Anh nó ra `mm/dd/yyyy`. Người dùng gõ
 * đúng thói quen Việt Nam thì được một ngày khác hẳn, và không có gì trên màn hình báo sai.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { DateInput } from '../date-input';
import { Field } from '../field';
import { renderWithApp } from '@/test/render';

describe('DateInput — định dạng hiển thị', () => {
  it('nói rõ thứ tự ngày/tháng ngay trong ô, không để người dùng đoán', async () => {
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput />
      </Field>,
    );
    expect(await screen.findByPlaceholderText('dd/mm/yyyy')).toBeInTheDocument();
  });

  it('hiện ngày đã lưu theo dd/mm/yyyy chứ không phải chuỗi ISO', () => {
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput value="2026-08-26" />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: /hạn nộp thầu/i })).toHaveValue('26/08/2026');
  });
});

describe('DateInput — nhập liệu', () => {
  it('gõ 8 chữ số thì tự chèn dấu gạch chéo', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /hạn nộp thầu/i });
    await user.type(input, '26082026');
    expect(input).toHaveValue('26/08/2026');
  });

  it('trả ra ISO cho phần còn lại của hệ thống, đọc NGÀY trước THÁNG sau', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput onChange={onChange} />
      </Field>,
    );
    await user.type(screen.getByRole('textbox', { name: /hạn nộp thầu/i }), '03042026');
    // 03/04 là mùng 3 tháng 4 — không phải mùng 4 tháng 3.
    expect(onChange).toHaveBeenLastCalledWith('2026-04-03');
  });

  it('ngày không có thật thì báo ngay tại ô, không đẩy xuống cho CSDL từ chối', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput onChange={onChange} />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /hạn nộp thầu/i });
    await user.type(input, '31022026');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/chưa đúng định dạng/i)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('quá cận trên thì nói rõ mốc, bằng chữ chứ không chỉ đổi màu viền', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Ngày xảy ra">
        <DateInput max="2026-08-26" />
      </Field>,
    );
    await user.type(screen.getByRole('textbox', { name: /ngày xảy ra/i }), '27082026');
    expect(screen.getByText('Ngày không được sau 26/08/2026.')).toBeInTheDocument();
  });

  it('ngày sai thì trình duyệt chặn nộp NGAY TRÊN Ô ĐANG HIỆN, không phải một ô vô hình', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /hạn nộp thầu/i }) as HTMLInputElement;
    await user.type(input, '31022026');
    // Người dùng phải được đưa tới đúng ô cần sửa, kèm câu chữ giống hệt dòng dưới ô.
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toBe('Ngày chưa đúng định dạng (dd/mm/yyyy).');
  });

  it('sửa lại cho đúng thì hết chặn — thông báo cũ không dính lại', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /hạn nộp thầu/i }) as HTMLInputElement;
    await user.type(input, '31022026');
    await user.clear(input);
    await user.type(input, '28022026');
    expect(input.checkValidity()).toBe(true);
    expect(input.validationMessage).toBe('');
  });

  it('bắt buộc nhập thì để trống là không nộp được, và báo BẰNG TIẾNG VIỆT', () => {
    renderWithApp(
      <Field label="Thời điểm cần hàng">
        <DateInput name="needed_date" required />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /thời điểm cần hàng/i }) as HTMLInputElement;
    expect(input.checkValidity()).toBe(false);
    // Câu mặc định của trình duyệt dịch theo ngôn ngữ TRÌNH DUYỆT — máy cài tiếng Anh sẽ hiện
    // "Please fill out this field." giữa màn hình tiếng Việt (Content Guidelines 4.1).
    expect(input.validationMessage).toBe('Vui lòng nhập ngày (dd/mm/yyyy).');
  });

  it('nộp lên biểu mẫu bằng ISO, không phải chuỗi người dùng nhìn thấy', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      expect(new FormData(e.currentTarget).get('needed_date')).toBe('2026-08-26');
    });
    renderWithApp(
      <form onSubmit={onSubmit}>
        <Field label="Thời điểm cần hàng">
          <DateInput name="needed_date" />
        </Field>
        <button type="submit">Lưu</button>
      </form>,
    );
    await user.type(screen.getByRole('textbox', { name: /thời điểm cần hàng/i }), '26082026');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(onSubmit).toHaveBeenCalled();
  });
});

/**
 * Ô KHÔNG điều khiển phải hành xử như `<input type="date">` mà nó thay thế.
 *
 * Đây là chỗ dễ mất dữ liệu nhất: `<input type="date">` nhận `defaultValue` đến muộn và bị
 * `form.reset()` xoá — cả hai đều miễn phí. Ô này giữ chữ trong state React nên phải tự làm.
 */
describe('DateInput — chế độ không điều khiển', () => {
  function LateData() {
    const [due, setDue] = useState<string | undefined>(undefined);
    return (
      <>
        <button type="button" onClick={() => setDue('2026-08-26')}>
          Nạp xong dữ liệu
        </button>
        <Field label="Hạn hoàn thành">
          <DateInput defaultValue={due ?? ''} />
        </Field>
      </>
    );
  }

  it('dữ liệu về sau lượt vẽ đầu vẫn hiện ra', async () => {
    const user = userEvent.setup();
    renderWithApp(<LateData />);
    const input = screen.getByRole('textbox', { name: /hạn hoàn thành/i });
    expect(input).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Nạp xong dữ liệu' }));
    // Không có bước này thì ô khoá cứng ở rỗng — và màn hình lưu-khi-rời-ô sẽ ghi đè
    // hạn hoàn thành đã lưu thành rỗng chỉ vì người dùng bấm vào rồi bấm ra.
    expect(input).toHaveValue('26/08/2026');
  });

  it('bấm vào rồi bấm ra KHÔNG xoá mất ngày đã lưu', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    function Panel() {
      const [due, setDue] = useState<string | undefined>(undefined);
      return (
        <>
          <button type="button" onClick={() => setDue('2026-08-26')}>
            Nạp xong dữ liệu
          </button>
          <Field label="Hạn hoàn thành">
            <DateInput defaultValue={due ?? ''} onBlur={onBlur} />
          </Field>
          <button type="button">Chỗ khác</button>
        </>
      );
    }
    renderWithApp(<Panel />);
    await user.click(screen.getByRole('button', { name: 'Nạp xong dữ liệu' }));
    await user.click(screen.getByRole('textbox', { name: /hạn hoàn thành/i }));
    await user.click(screen.getByRole('button', { name: 'Chỗ khác' }));

    expect(onBlur).toHaveBeenCalledWith('2026-08-26');
    expect(onBlur).not.toHaveBeenCalledWith('');
  });

  it('form.reset() đưa ô về mặc định để phiếu sau không mang ngày của phiếu trước', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <form>
        <Field label="Ngày nhận">
          <DateInput name="delivered_date" defaultValue="2026-08-26" />
        </Field>
        <button type="reset">Đặt lại</button>
      </form>,
    );
    const input = screen.getByRole('textbox', { name: /ngày nhận/i });
    await user.clear(input);
    await user.type(input, '20082026');
    expect(input).toHaveValue('20/08/2026');

    await user.click(screen.getByRole('button', { name: 'Đặt lại' }));
    expect(input).toHaveValue('26/08/2026');
  });
});

describe('DateInput — vị trí con trỏ', () => {
  it('sửa chữ số ở giữa thì con trỏ ở lại chỗ đang sửa, không nhảy về cuối', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput defaultValue="2026-08-26" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /hạn nộp thầu/i }) as HTMLInputElement;

    // Xoá một chữ số ở giữa: bôi đen `0` của `26/[0]8/2026` rồi xoá. Các chữ số phía sau dồn
    // lên nên cả chuỗi được dựng lại — đây chính là lúc trình duyệt đánh mất vị trí con trỏ.
    await user.click(input);
    input.setSelectionRange(3, 4);
    await user.keyboard('{Backspace}');

    expect(input).toHaveValue('26/82/026');
    // Con trỏ phải ở lại chỗ vừa xoá để gõ tiếp, không bị hất về cuối chuỗi (vị trí 9).
    expect(input.selectionStart).toBe(2);
  });
});

/**
 * Bảng lịch là LỰA CHỌN THÊM, không thay thế việc gõ tay.
 *
 * Gõ tay nhanh hơn khi đã biết ngày; lịch cần khi phải nhìn thứ trong tuần hoặc đếm lùi từ một
 * mốc. Bỏ một trong hai là bắt một nhóm người dùng làm việc theo cách bất tiện với họ.
 */
describe('DateInput — bảng lịch tiếng Việt', () => {
  async function openCalendar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Chọn ngày trên lịch' }));
    return screen.getByRole('dialog', { name: 'Chọn ngày' });
  }

  it('mọi chữ trên lịch đều là tiếng Việt', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput value="2026-09-15" onChange={() => {}} />
      </Field>,
    );
    const panel = await openCalendar(user);

    // Lịch gốc của trình duyệt hiện "September 2026" và "Su Mo Tu…" trên máy cài tiếng Anh —
    // nhân sự không đọc được tiếng Anh thì bảng đó là không dùng được, không phải chỉ khó nhìn.
    expect(within(panel).getByText('Tháng 9 năm 2026')).toBeInTheDocument();
    for (const label of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) {
      expect(within(panel).getByText(label)).toBeInTheDocument();
    }
    expect(panel.textContent).not.toMatch(
      /January|February|March|April|May|June|July|August|September|October|November|December|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today|Close/,
    );
  });

  it('tuần bắt đầu từ THỨ HAI theo lịch Việt Nam, không phải Chủ nhật', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput value="2026-09-15" onChange={() => {}} />
      </Field>,
    );
    const panel = await openCalendar(user);
    const headers = within(panel)
      .getAllByText(/^(T[2-7]|CN)$/)
      .map((el) => el.textContent);
    expect(headers).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
  });

  it('bấm một ngày thì ô chữ hiện dd/mm/yyyy và giá trị ra vẫn là ISO', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput value="2026-09-15" onChange={onChange} />
      </Field>,
    );
    const panel = await openCalendar(user);
    await user.click(within(panel).getByRole('button', { name: '20/09/2026' }));

    expect(onChange).toHaveBeenLastCalledWith('2026-09-20');
    expect(screen.getByRole('textbox', { name: /hạn nộp thầu/i })).toHaveValue('20/09/2026');
  });

  it('cận trên khoá ngay trên lịch, không để chọn xong mới báo', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Ngày xảy ra">
        <DateInput value="2026-09-15" max="2026-09-18" onChange={() => {}} />
      </Field>,
    );
    const panel = await openCalendar(user);
    expect(within(panel).getByRole('button', { name: '18/09/2026' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: '19/09/2026' })).toBeDisabled();
  });

  it('đổi tháng bằng nút, nhãn tháng đổi theo', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput value="2026-09-15" onChange={() => {}} />
      </Field>,
    );
    const panel = await openCalendar(user);
    await user.click(within(panel).getByRole('button', { name: 'Tháng trước' }));
    expect(within(panel).getByText('Tháng 8 năm 2026')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Tháng sau' }));
    await user.click(within(panel).getByRole('button', { name: 'Tháng sau' }));
    expect(within(panel).getByText('Tháng 10 năm 2026')).toBeInTheDocument();
  });

  it('phím Esc đóng lịch — bàn phím ngoài cắm vào máy tính bảng vẫn dùng được', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput value="2026-09-15" onChange={() => {}} />
      </Field>,
    );
    await openCalendar(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Chọn ngày' })).not.toBeInTheDocument();
  });

  it('ô bị khoá thì không có lối nào mở lịch', () => {
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput disabled />
      </Field>,
    );
    expect(screen.queryByRole('button', { name: 'Chọn ngày trên lịch' })).not.toBeInTheDocument();
  });
});

describe('DateInput — lưu khi rời ô', () => {
  it('gõ dở nửa chừng rồi bấm ra chỗ khác KHÔNG xoá ngày đã lưu', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    renderWithApp(
      <>
        <Field label="Hạn hoàn thành">
          <DateInput defaultValue="2026-01-10" onBlur={onBlur} />
        </Field>
        <button type="button">Chỗ khác</button>
      </>,
    );
    const input = screen.getByRole('textbox', { name: /hạn hoàn thành/i });
    await user.clear(input);
    await user.type(input, '151');
    await user.click(screen.getByRole('button', { name: 'Chỗ khác' }));

    // Chuỗi dở quy ra ISO là rỗng, mà rỗng ở màn hình đó nghĩa là `null`.
    expect(onBlur).not.toHaveBeenCalled();
  });

  it('xoá sạch ô thì VẪN báo — đó là cố ý bỏ ngày, không phải gõ dở', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    renderWithApp(
      <>
        <Field label="Hạn hoàn thành">
          <DateInput defaultValue="2026-01-10" onBlur={onBlur} />
        </Field>
        <button type="button">Chỗ khác</button>
      </>,
    );
    await user.clear(screen.getByRole('textbox', { name: /hạn hoàn thành/i }));
    await user.click(screen.getByRole('button', { name: 'Chỗ khác' }));

    expect(onBlur).toHaveBeenCalledWith('');
  });

  it('chọn ngày trên lịch cũng ghi xuống — ô chữ không hề nhận focus nên không tự có blur', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    renderWithApp(
      <Field label="Ngày giao cam kết">
        <DateInput defaultValue="2026-09-01" onBlur={onBlur} />
      </Field>,
    );
    await user.click(screen.getByRole('button', { name: 'Chọn ngày trên lịch' }));
    const panel = screen.getByRole('dialog', { name: 'Chọn ngày' });
    await user.click(within(panel).getByRole('button', { name: '15/09/2026' }));

    expect(onBlur).toHaveBeenCalledWith('2026-09-15');
  });
});

describe('DateInput — cách gõ quen thuộc của người Việt', () => {
  it('gõ 1/1/2026 ra đúng mùng 1 tháng 1, không phải 11/20/26', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput onChange={onChange} />
      </Field>,
    );
    await user.type(screen.getByRole('textbox', { name: /hạn nộp thầu/i }), '1/1/2026');

    expect(screen.getByRole('textbox', { name: /hạn nộp thầu/i })).toHaveValue('01/01/2026');
    expect(onChange).toHaveBeenLastCalledWith('2026-01-01');
  });

  it('bôi đen một đoạn rồi gõ đè cho ra đúng đoạn đó, không xô lệch cả chuỗi', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <Field label="Hạn nộp thầu">
        <DateInput defaultValue="2026-08-26" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /hạn nộp thầu/i }) as HTMLInputElement;
    // Đổi tháng: bôi đen `08` của `26/[08]/2026` rồi gõ `9`.
    await user.click(input);
    input.setSelectionRange(3, 5);
    await user.keyboard('9');

    expect(input).toHaveValue('26/09/2026');
  });
});

/**
 * 21 biểu mẫu trong hệ thống đặt `noValidate` để tự kiểm và hiện lỗi ngay trong màn hình thay
 * vì dùng bong bóng của trình duyệt. `noValidate` tắt luôn `setCustomValidity`, nên nếu không
 * chặn riêng thì ngày gõ dở được nộp lên và lưu thành `null` — ô trông như đã điền, CSDL thì
 * trống, không một lời cảnh báo.
 */
describe('DateInput — biểu mẫu tắt kiểm tra của trình duyệt', () => {
  it('ngày gõ dở KHÔNG nộp được, kể cả khi biểu mẫu đặt noValidate', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithApp(
      <form onSubmit={onSubmit} noValidate>
        <Field label="Hạn nộp thầu">
          <DateInput defaultValue="" />
        </Field>
        <button type="submit">Lưu</button>
      </form>,
    );
    await user.type(screen.getByRole('textbox', { name: /hạn nộp thầu/i }), '030');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('gõ xong ngày hợp lệ thì nộp được bình thường', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithApp(
      <form onSubmit={onSubmit} noValidate>
        <Field label="Hạn nộp thầu">
          <DateInput defaultValue="" />
        </Field>
        <button type="submit">Lưu</button>
      </form>,
    );
    await user.type(screen.getByRole('textbox', { name: /hạn nộp thầu/i }), '03042026');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSubmit).toHaveBeenCalled();
  });
});
