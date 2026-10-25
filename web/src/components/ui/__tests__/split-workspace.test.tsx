import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealElement, SplitWorkspace, type WorkspaceTab } from '../split-workspace';

const tabs = (): WorkspaceTab[] => [
  { id: 'a', label: 'Chỗ trống', side: 'left', content: <p>nội dung A</p> },
  { id: 'b', label: 'Thông tin', side: 'left', content: <input id="o-b" aria-label="ô B" /> },
  { id: 'v', label: 'Văn bản', side: 'right', content: <p>văn bản</p> },
];

function dataTransfer(id = '') {
  const store: Record<string, string> = id ? { 'text/x-workspace-tab': id } : {};
  return {
    types: Object.keys(store),
    getData: (k: string) => store[k] ?? '',
    setData: (k: string, v: string) => {
      store[k] = v;
    },
    effectAllowed: 'move',
  };
}

describe('SplitWorkspace — khung hai ngăn kiểu VS Code', () => {
  // Màn hình rộng (từ lg): hai ngăn. Thiết lập chung của bộ thử cho `matchMedia` trả «không khớp» = điện thoại.
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('hai ngăn: văn bản luôn hiện bên phải cạnh tab đang soạn bên trái', () => {
    render(<SplitWorkspace tabs={tabs()} storageKey="t1" />);
    const left = screen.getByRole('region', { name: 'Ngăn trái' });
    const right = screen.getByRole('region', { name: 'Ngăn phải' });
    expect(within(left).getByText('nội dung A')).toBeVisible();
    expect(within(right).getByText('văn bản')).toBeVisible();
    fireEvent.click(within(left).getByRole('tab', { name: 'Thông tin' }));
    expect(within(left).queryByText('nội dung A')).not.toBeVisible();
    expect(within(right).getByText('văn bản')).toBeVisible();
  });

  it('kéo tab thả sang ngăn kia thì tab chuyển ngăn và được chọn', () => {
    render(<SplitWorkspace tabs={tabs()} storageKey="t2" />);
    const right = screen.getByRole('region', { name: 'Ngăn phải' });
    fireEvent.drop(right, { dataTransfer: dataTransfer('a') });
    expect(within(right).getByRole('tab', { name: 'Chỗ trống' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(right).getByText('nội dung A')).toBeVisible();
  });

  it('thanh giữa: phím mũi tên đổi bề rộng, nhấp đúp chia lại mặc định', () => {
    render(<SplitWorkspace tabs={tabs()} storageKey="t3" defaultRatio={0.5} />);
    const sep = screen.getByRole('separator');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(sep).toHaveAttribute('aria-valuenow', '55');
    fireEvent.doubleClick(sep);
    expect(sep).toHaveAttribute('aria-valuenow', '50');
  });

  it('revealElement mở tab đang ẩn chứa ô cần tới', () => {
    render(<SplitWorkspace tabs={tabs()} storageKey="t4" />);
    const input = document.getElementById('o-b')!;
    expect(input).not.toBeVisible();
    act(() => revealElement(input));
    expect(input).toBeVisible();
  });
});
