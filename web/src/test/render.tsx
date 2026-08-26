/**
 * Bộ khung dựng component trong test.
 *
 * Nguyên tắc: test giao diện phải khẳng định điều NGƯỜI DÙNG thấy và làm được — chữ trên màn
 * hình, nhãn của nút, đường dẫn sau khi bấm — chứ không khẳng định cấu trúc DOM hay tên lớp CSS.
 * Test bám vào tên lớp sẽ đỏ ở mọi đợt sửa giao diện mà không phát hiện được lỗi thật nào, tức
 * là tệ hơn không có test: nó vừa không bảo vệ được gì, vừa cản việc sửa.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

/** Hiện đường dẫn hiện tại ra DOM để test đọc được — dùng kiểm điều hướng sau khi bấm. */
function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="duong-dan-hien-tai">{`${location.pathname}${location.search}`}</div>
  );
}

export interface RenderOptions {
  /** Đường dẫn khởi đầu, kèm tham số truy vấn. Ví dụ `/hd/hop-dong?trang-thai=overdue`. */
  route?: string;
}

export function renderWithApp(ui: ReactElement, { route = '/' }: RenderOptions = {}): RenderResult {
  // `retry: false`: trong test, thử lại chỉ làm lỗi hiện ra chậm hơn và test khó đọc hơn.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          {children}
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

/** Đường dẫn hiện tại theo cây vừa dựng — đọc từ `LocationProbe`. */
export function currentPath(result: RenderResult): string {
  return result.getByTestId('duong-dan-hien-tai').textContent ?? '';
}
