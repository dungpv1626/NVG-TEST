/**
 * `FullscreenFrame` — «Toàn màn hình» của khung soạn hợp đồng và các bước AI Design. Canh hai chỗ dễ hỏng im lặng:
 * Esc thu khung về, nhưng Esc khi đang gõ trong ô nhập thì KHÔNG (người dùng đang huỷ gợi ý / thoát ô, không định
 * rời chế độ toàn màn hình).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FullscreenFrame } from '../fullscreen-frame';

function frame(): HTMLElement {
  return screen.getByText('Nội dung').parentElement!;
}

describe('FullscreenFrame', () => {
  it('bấm nút thì phủ cả màn hình, bấm lại hoặc Esc thì thu về', async () => {
    render(
      <FullscreenFrame idleClassName="khung-trong-trang" top={<span>Đầu khung</span>}>
        <p>Nội dung</p>
      </FullscreenFrame>,
    );
    expect(frame()).toHaveClass('khung-trong-trang');
    expect(frame()).not.toHaveClass('fixed');

    await userEvent.click(screen.getByRole('button', { name: /Toàn màn hình/ }));
    expect(frame()).toHaveClass('fixed', 'inset-0');
    expect(frame()).not.toHaveClass('khung-trong-trang');

    await userEvent.click(screen.getByRole('button', { name: /Thu về/ }));
    expect(frame()).not.toHaveClass('fixed');

    await userEvent.click(screen.getByRole('button', { name: /Toàn màn hình/ }));
    await userEvent.keyboard('{Escape}');
    expect(frame()).not.toHaveClass('fixed');
  });

  it('Esc khi đang gõ trong ô nhập không thu khung về', async () => {
    render(
      <FullscreenFrame>
        <p>Nội dung</p>
        <input aria-label="Ô gõ" />
      </FullscreenFrame>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Toàn màn hình/ }));
    await userEvent.click(screen.getByRole('textbox', { name: 'Ô gõ' }));
    await userEvent.keyboard('{Escape}');
    expect(frame()).toHaveClass('fixed');
  });
});
