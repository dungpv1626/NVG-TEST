/**
 * Ô nhập chung: không sửa giá trị lúc gõ, kể cả khi bộ gõ Telex gửi phím xoá rồi gõ lại dồn dập, và tắt
 * gợi ý tự điền của trình duyệt (nguồn của lỗi khoảng trắng lệch chỗ trong tên khách 28/10/2026).
 */

import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Input } from '../input';

function Controlled() {
  const [v, setV] = useState('');
  return <Input aria-label="Tên" value={v} onChange={(e) => setV(e.target.value)} />;
}

/** Bộ gõ kiểu Unikey: gõ ký tự thô, rồi xoá và gõ lại ký tự có dấu — mỗi bước một sự kiện `input`. */
function telex(el: HTMLInputElement, steps: string[]) {
  for (const k of steps) {
    const next = k === '⌫' ? el.value.slice(0, -1) : el.value + k;
    fireEvent.change(el, { target: { value: next } });
  }
}

describe('Input', () => {
  it('gõ Telex dồn dập (xoá + gõ lại) ra đúng chữ, không chèn / bớt khoảng trắng', () => {
    render(<Controlled />);
    const el = screen.getByLabelText('Tên') as HTMLInputElement;
    telex(el, [
      ...'Công ty TNHH Co',
      '⌫',
      'ơ',
      ...' khi',
      '⌫',
      'í',
      ...' Minh Phat',
      '⌫',
      '⌫',
      'á',
      't',
      ...' THU6',
    ]);
    expect(el.value).toBe('Công ty TNHH Cơ khí Minh Phát THU6');
  });

  it('tắt gợi ý tự điền của trình duyệt, trừ khi màn hình nói rõ', () => {
    render(
      <>
        <Input aria-label="Một" />
        <Input aria-label="Hai" autoComplete="username" />
      </>,
    );
    expect(screen.getByLabelText('Một')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Hai')).toHaveAttribute('autocomplete', 'username');
  });
});
