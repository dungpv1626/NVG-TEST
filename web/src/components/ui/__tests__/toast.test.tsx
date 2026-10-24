import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast, Toaster, TOAST_DURATION_MS, useToastStore } from '../toast';

describe('Toaster — thông báo nhỏ có «Hoàn tác»', () => {
  beforeEach(() => useToastStore.setState({ current: null }));
  afterEach(() => vi.useRealTimers());

  it('bấm «Hoàn tác» chạy onUndo, KHÔNG chạy onExpire', async () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    render(<Toaster />);
    act(() => showToast({ message: 'Đã xoá dòng', onUndo, onExpire }));

    await userEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByText('Đã xoá dòng')).toBeNull();
  });

  it('hết hạn thì chạy onExpire (việc được ghi thật)', () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    render(<Toaster />);
    act(() => showToast({ message: 'Đã xoá dòng', onUndo, onExpire }));

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS + 10));

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('thông báo mới tới thì việc của thông báo cũ được ghi, không bị bỏ rơi', () => {
    const first = vi.fn();
    render(<Toaster />);
    act(() => showToast({ message: 'Một', onExpire: first }));
    act(() => showToast({ message: 'Hai' }));

    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Hai')).toBeTruthy();
    expect(screen.queryByText('Một')).toBeNull();
  });

  it('không có onUndo thì không hiện nút «Hoàn tác»', () => {
    render(<Toaster />);
    act(() => showToast({ message: 'Đã lưu' }));
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).toBeNull();
  });
});
