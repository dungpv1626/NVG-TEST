/**
 * `useAiSheetImage` — tờ mặt bằng do mô hình ảnh vẽ (T21).
 *
 * Canh đúng một thứ, và nó là chỗ hỏng IM LẶNG: **không được tải ảnh về khi chưa có nhãn.**
 *
 * Nhãn tới từ `/plan/:id/review`, một lời gọi chạy song song, nên có một khoảnh khắc nó còn
 * rỗng. Đóng dấu bằng chuỗi rỗng vẽ ra một ô nền không chữ, `stamped` vẫn báo `true` — nghĩa
 * là màn hình không hiện cảnh báo dự phòng — và nút tải trỏ vào một tấm ảnh AI KHÔNG mang
 * nhãn. Tấm không nhãn trông y hệt tấm có nhãn, nên không ai phát hiện ra.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const designApiFile = vi.hoisted(() => vi.fn());

vi.mock('@/lib/design-api', () => ({ designApi: vi.fn(), designApiFile }));

const { useAiSheetImage } = await import('../use-ai-design');

const REF = `sha256:${'a'.repeat(64)}`;
const WATERMARK = 'Đề xuất AI — không dựng từ toạ độ';

describe('Chưa có nhãn thì chưa tải ảnh', () => {
  it('nhãn rỗng: không gọi máy chủ, không có ảnh, và KHÔNG treo ở trạng thái đang nạp', () => {
    designApiFile.mockClear();
    const { result } = renderHook(() => useAiSheetImage('p1', REF, 1, ''));
    expect(designApiFile).not.toHaveBeenCalled();
    expect(result.current.url).toBeNull();
    expect(result.current.stamped).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('có nhãn thì mới gọi, và gọi đúng tầng đang xem', async () => {
    designApiFile.mockClear();
    designApiFile.mockResolvedValue({ blob: () => Promise.resolve(new Blob(['x'])) });
    renderHook(() => useAiSheetImage('p1', REF, 2, WATERMARK));
    await waitFor(() => expect(designApiFile).toHaveBeenCalledTimes(1));
    expect(String(designApiFile.mock.calls[0]![0])).toContain('/sheet-image?');
    expect(String(designApiFile.mock.calls[0]![0])).toContain('level=2');
  });

  it('chưa chọn phương án thì cũng không gọi', () => {
    designApiFile.mockClear();
    renderHook(() => useAiSheetImage('p1', null, 1, WATERMARK));
    expect(designApiFile).not.toHaveBeenCalled();
  });
});
