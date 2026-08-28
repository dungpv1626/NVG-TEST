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
import { useState, type ReactElement, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';

/** Hiện đường dẫn hiện tại ra DOM để test đọc được — dùng kiểm điều hướng sau khi bấm. */
function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="duong-dan-hien-tai">{`${location.pathname}${location.search}`}</div>
      {/* `state` mang theo lúc điều hướng (vd. breadcrumb "đường đi thực tế") — không hiện
          trên màn hình, nên phải có cách riêng để test đọc lại đúng những gì `<Link state=…>`
          đã gửi đi sau khi bấm. */}
      <div data-testid="trang-thai-dieu-huong">{JSON.stringify(location.state ?? null)}</div>
    </>
  );
}

export interface RenderOptions {
  /** Đường dẫn khởi đầu, kèm tham số truy vấn. Ví dụ `/hd/hop-dong?trang-thai=overdue`. */
  route?: string;
  /** `location.state` khởi đầu — dùng để mô phỏng đã điều hướng tới từ một `<Link state=…>`. */
  state?: unknown;
}

export function renderWithApp(
  ui: ReactElement,
  { route = '/', state }: RenderOptions = {},
): RenderResult {
  // `retry: false`: trong test, thử lại chỉ làm lỗi hiện ra chậm hơn và test khó đọc hơn.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  /**
   * Dùng ROUTER DỮ LIỆU cho khớp `App.tsx` thật.
   *
   * `<MemoryRouter>` không phải router dữ liệu, nên `useBlocker` — thứ `useUnsavedChangesGuard`
   * dựa vào — sẽ ném lỗi. Với `MemoryRouter`, mọi màn hình biểu mẫu (Tạo khách hàng, Tạo cơ
   * hội, Lập báo giá…) không dựng được trong test, và bộ kiểm thử xanh chỉ vì chưa ai thử.
   */
  function Wrapper({ children }: { children: ReactNode }) {
    // Dựng MỘT lần: `RouterProvider` nhận một router khác là gắn lại toàn bộ cây con và đưa
    // đường dẫn về `initialEntries`. Dựng lại mỗi lượt vẽ thì `rerender()` trong test sẽ xoá
    // sạch state của component và cả những lần điều hướng đã xảy ra.
    const [router] = useState(() =>
      createMemoryRouter(
        [
          {
            path: '*',
            element: (
              <>
                {children}
                <LocationProbe />
              </>
            ),
          },
        ],
        // `pathname` KHÔNG được gồm chuỗi truy vấn khi truyền state — phải tách riêng, nếu
        // không React Router sẽ mã hoá luôn dấu `?` vào pathname.
        {
          initialEntries:
            state === undefined
              ? [route]
              : [
                  (() => {
                    const [pathname, search] = route.split('?');
                    return { pathname, search: search ? `?${search}` : '', state };
                  })(),
                ],
        },
      ),
    );
    return (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

/** Đường dẫn hiện tại theo cây vừa dựng — đọc từ `LocationProbe`. */
export function currentPath(result: RenderResult): string {
  return result.getByTestId('duong-dan-hien-tai').textContent ?? '';
}

/** `location.state` hiện tại — đọc từ `LocationProbe`, dùng kiểm state đã gửi kèm khi điều hướng. */
export function currentNavigationState(result: RenderResult): unknown {
  return JSON.parse(result.getByTestId('trang-thai-dieu-huong').textContent ?? 'null');
}
