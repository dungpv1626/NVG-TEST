/**
 * Khối ba chiều — jsdom không có WebGL, nên bộ này canh phần KHÔNG cần WebGL: nhãn "Khối sơ bộ"
 * do mã chèn luôn hiện, và khi không dựng được ngữ cảnh đồ hoạ thì nói bằng câu tiếng Việt thay
 * vì lỗi kỹ thuật.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithApp } from '@/test/render';

vi.mock('@/hooks/use-design-projects', () => ({
  useMassingModel: () => ({ data: 'blob:mock', isLoading: false, isError: false, error: null }),
}));

vi.mock('three', () => ({
  WebGLRenderer: class {
    constructor() {
      throw new Error('Error creating WebGL context.');
    }
  },
}));

const { MassingViewer, MASSING_NOTICE } = await import('../massing-viewer');

describe('Khối ba chiều', () => {
  it('nhãn khối sơ bộ luôn hiện; không có WebGL thì nói bằng tiếng Việt', async () => {
    renderWithApp(<MassingViewer projectId="p" artifactId="sha256:a" variantLabel="Phương án A" />);
    expect(screen.getAllByText(new RegExp(MASSING_NOTICE)).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByText(/không hỗ trợ đồ hoạ ba chiều/)).toBeInTheDocument(),
    );
  });
});
