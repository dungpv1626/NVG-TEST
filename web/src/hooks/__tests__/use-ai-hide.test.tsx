/**
 * Xoá một phương án / mặt đứng / bộ ảnh khỏi dải chọn (Haan, 11/10/2026: «sau khi xoá 1 phương án thì phải re-load lại
 * web thì phương án đó mới biến mất»). Hộp thoại đóng lúc lệnh xoá xong; `/state` trên bản demo mất vài giây mới về.
 * Canh: mục đã xoá rời dải NGAY khi lệnh xoá xong, không chờ `/state` nạp lại.
 */

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { AiDesignState } from '../use-ai-design';

const A = `sha256:${'a'.repeat(64)}`;
const B = `sha256:${'b'.repeat(64)}`;

/** Lệnh xoá trả ngay; `/state` thì treo mãi — như bản demo chậm, chỉ còn bản đang giữ để hiện. */
const designApi = vi.fn((path: string, body?: { artifactId: string; hidden?: boolean }) =>
  path.startsWith('/design/ai/state/')
    ? new Promise(() => {})
    : Promise.resolve({ artifactId: body!.artifactId, hidden: body!.hidden !== false }),
);

vi.mock('@/lib/design-api', () => ({
  designApi: (path: string, body?: never) => designApi(path, body),
  designApiFile: vi.fn(),
  DesignApiError: class extends Error {},
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const { useHideAiPlan, useHideAiFacade, useHideAiImageSet } = await import('../use-ai-design');

const STATE = {
  plans: [
    { artifactId: A, createdAt: '2026-10-01T00:00:00Z' },
    { artifactId: B, createdAt: '2026-10-02T00:00:00Z' },
  ],
  facades: [
    { artifactId: A, createdAt: '2026-10-01T00:00:00Z' },
    { artifactId: B, createdAt: '2026-10-02T00:00:00Z' },
  ],
  imageSets: [
    { artifactId: A, createdAt: '2026-10-01T00:00:00Z' },
    { artifactId: B, createdAt: '2026-10-02T00:00:00Z' },
  ],
} as AiDesignState;

function setup<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['ai_design_state', 'p1'], STATE);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(hook, { wrapper });
  const held = () => client.getQueryData<AiDesignState>(['ai_design_state', 'p1'])!;
  return { result, held };
}

describe('xoá khỏi dải chọn — rời dải ngay, không chờ /state', () => {
  it('phương án', async () => {
    const { result, held } = setup(() => useHideAiPlan());
    await act(() => result.current.mutateAsync({ projectId: 'p1', artifactId: A }));
    expect(held().plans.map((p) => p.artifactId)).toEqual([B]);
    // Danh sách khác không đụng tới.
    expect(held().facades).toHaveLength(2);
  });

  it('mặt đứng và bộ ảnh phối cảnh cùng khuôn', async () => {
    const facade = setup(() => useHideAiFacade());
    await act(() => facade.result.current.mutateAsync({ projectId: 'p1', artifactId: B }));
    expect(facade.held().facades!.map((f) => f.artifactId)).toEqual([A]);

    const images = setup(() => useHideAiImageSet());
    await act(() => images.result.current.mutateAsync({ projectId: 'p1', artifactId: A }));
    expect(images.held().imageSets!.map((s) => s.artifactId)).toEqual([B]);
  });

  it('đưa trở lại (`hidden: false`) không tự đoán chỗ — giữ nguyên, chờ nạp lại', async () => {
    const { result, held } = setup(() => useHideAiPlan());
    await act(() => result.current.mutateAsync({ projectId: 'p1', artifactId: A, hidden: false }));
    expect(held().plans).toHaveLength(2);
  });
});
