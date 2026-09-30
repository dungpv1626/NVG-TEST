/**
 * Hộp hỏi lý do thay `window.prompt`: huỷ trả `null`, trường bắt buộc để trống thì báo tại chỗ
 * và KHÔNG đóng, câu trả lời được cắt khoảng trắng, Enter xác nhận như nút chính.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { usePromptDialog, type PromptOptions } from '../prompt-dialog';

function Harness({ options }: { options: PromptOptions }) {
  const prompt = usePromptDialog();
  const [result, setResult] = useState<string>('chưa hỏi');
  return (
    <>
      {prompt.dialog}
      <button
        type="button"
        onClick={() => void prompt.ask(options).then((v) => setResult(v === null ? 'huỷ' : v))}
      >
        Mở
      </button>
      <output>{result}</output>
    </>
  );
}

const OPTIONS: PromptOptions = {
  title: 'Hủy đề nghị mua?',
  label: 'Lý do hủy',
  confirmLabel: 'Hủy đề nghị',
};

describe('usePromptDialog', () => {
  it('bấm Huỷ trả null và đóng hộp', async () => {
    const user = userEvent.setup();
    render(<Harness options={OPTIONS} />);
    await user.click(screen.getByRole('button', { name: 'Mở' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('output')).toHaveTextContent('huỷ');
  });

  it('để trống trường bắt buộc: báo tại chỗ, hộp vẫn mở', async () => {
    const user = userEvent.setup();
    render(<Harness options={OPTIONS} />);
    await user.click(screen.getByRole('button', { name: 'Mở' }));
    await user.click(screen.getByRole('button', { name: 'Hủy đề nghị' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nhập lý do hủy');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('con trỏ vào ô nhập; Enter xác nhận câu đã cắt khoảng trắng', async () => {
    const user = userEvent.setup();
    render(<Harness options={OPTIONS} />);
    await user.click(screen.getByRole('button', { name: 'Mở' }));
    expect(screen.getByRole('textbox')).toHaveFocus();
    await user.keyboard('  Công trình đổi thiết kế  {Enter}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('output')).toHaveTextContent(/^Công trình đổi thiết kế$/);
  });

  it('trường không bắt buộc để trống trả chuỗi rỗng, không phải null', async () => {
    const user = userEvent.setup();
    render(<Harness options={{ ...OPTIONS, required: false }} />);
    await user.click(screen.getByRole('button', { name: 'Mở' }));
    await user.click(screen.getByRole('button', { name: 'Hủy đề nghị' }));
    expect(document.querySelector('output')).toHaveTextContent(/^$/);
  });
});
