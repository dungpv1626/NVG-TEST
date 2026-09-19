/**
 * Xuất PDF biên bản khảo sát (TK-02).
 *
 * Không gọi `window.print()` thật: trên trình duyệt đó là hộp thoại chặn mọi thao tác tiếp
 * theo. Bộ này thay `window.open` bằng một cửa sổ giả rồi đọc HTML đã ghi vào — đủ để canh
 * ba thứ dễ hỏng lặng lẽ:
 *
 *  - Chữ do người dùng nhập lọt thẻ HTML thô vào trang in.
 *  - Ảnh hiện trạng bị bỏ quên: đó là thứ người mang biên bản ra công trường cần nhất, và
 *    thiếu nó thì bản in vẫn ra bình thường nên không ai nhận ra.
 *  - Nút biến mất ở chế độ chỉ xem — nhưng người cần bản in thường đúng là người không còn
 *    quyền sửa hồ sơ.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  surveys: [] as unknown[],
  photos: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', fullName: 'Lê Văn C' } }),
  useCan: () => true,
}));

vi.mock('@/hooks/use-design-surveys', () => ({
  useDesignSurveys: () => ({ data: state.surveys, isLoading: false }),
  useCreateDesignSurvey: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateDesignSurvey: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveDesignSurvey: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-survey-photos', () => ({
  SITE_PHOTO_ACCEPT: 'image/*',
  useSurveyPhotos: () => ({ data: state.photos, isLoading: false }),
  useUploadSurveyPhotos: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveSurveyPhoto: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-design-projects', () => ({
  useDesignBriefs: () => ({ data: [], isLoading: false }),
}));

function survey(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    surveyed_at: '2026-09-06T14:38:00Z',
    created_at: '2026-09-06T14:38:00Z',
    land_width: '15.1',
    land_depth: '20',
    land_area: '302',
    orientation: 'Đông Nam',
    measurement_notes: 'cốt nền cao hơn mặt đường',
    surrounding_notes: null,
    usage_notes: null,
    notes: null,
    surveyor: { full_name: 'Phạm Thị D' },
    ...over,
  };
}

/** Bắt HTML gửi vào cửa sổ in, không cho hộp thoại in nổ ra. */
function capturePrint() {
  const captured = { html: '', printed: 0 };
  const fake = {
    document: {
      write: (h: string) => {
        captured.html = h;
      },
      close: () => {},
      images: [],
    },
    focus: () => {},
    print: () => {
      captured.printed += 1;
    },
    closed: false,
  } as unknown as Window;
  const spy = vi.spyOn(window, 'open').mockReturnValue(fake);
  return {
    captured,
    fire: () => (fake as unknown as { onload: () => void }).onload(),
    restore: () => spy.mockRestore(),
  };
}

async function openPanel(readOnly = false) {
  const { SurveyPanel } = await import('../survey-panel');
  return renderWithApp(
    <SurveyPanel
      projectId="p1"
      companyId="c1"
      projectName="Biệt thự nhà vườn (demo)"
      readOnly={readOnly}
    />,
  );
}

describe('Xuất PDF biên bản khảo sát', () => {
  it('đưa số đo, người khảo sát và ghi chú vào bản in', async () => {
    state.surveys = [survey()];
    state.photos = [];
    const print = capturePrint();
    await openPanel();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));
    print.fire();

    expect(print.captured.html).toContain('Biệt thự nhà vườn (demo)');
    expect(print.captured.html).toContain('Phạm Thị D');
    expect(print.captured.html).toContain('15,1 × 20 m');
    expect(print.captured.html).toContain('cốt nền cao hơn mặt đường');
    expect(print.captured.printed).toBe(1);
    print.restore();
  });

  it('chữ người dùng nhập được escape, không lọt thẻ thô vào trang in', async () => {
    state.surveys = [survey({ notes: '<img src=x onerror="alert(1)">' })];
    state.photos = [];
    const print = capturePrint();
    await openPanel();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));

    // Chữ `onerror=` vẫn còn — nhưng là CHỮ trong một `<p>`, không phải thuộc tính của thẻ.
    // Điều phải đúng là không có thẻ nào được dựng nên: dấu `<` đã thành `&lt;`.
    expect(print.captured.html).not.toContain('<img');
    expect(print.captured.html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    print.restore();
  });

  it('ảnh hiện trạng đi kèm bản in; ảnh chưa ký được đường dẫn thì NÓI RA', async () => {
    state.surveys = [survey()];
    state.photos = [
      {
        id: 'a',
        design_survey_id: 's1',
        url: 'https://x/1.jpg',
        caption: 'mặt tiền',
        file_name: '1.jpg',
        mime_type: 'image/jpeg',
      },
      {
        id: 'b',
        design_survey_id: 's1',
        url: null,
        caption: null,
        file_name: '2.jpg',
        mime_type: 'image/jpeg',
      },
    ];
    const print = capturePrint();
    await openPanel();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));

    expect(print.captured.html).toContain('https://x/1.jpg');
    expect(print.captured.html).toContain('mặt tiền');
    // Im lặng in thiếu là cách chắc chắn nhất để không ai phát hiện ra.
    expect(print.captured.html).toContain('1 tệp chưa tải được để in');
    print.restore();
  });

  it('nói rõ khi biên bản chưa có ảnh, không để một mục trống', async () => {
    state.surveys = [survey()];
    state.photos = [];
    const print = capturePrint();
    await openPanel();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));
    expect(print.captured.html).toContain('chưa có ảnh hiện trạng');
    print.restore();
  });

  it('vẫn xuất được ở chế độ chỉ xem, còn Sửa và Gỡ thì không', async () => {
    state.surveys = [survey()];
    state.photos = [];
    await openPanel(true);

    expect(screen.getByRole('button', { name: /Xuất PDF/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Sửa biên bản/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Gỡ biên bản/ })).toBeNull();
  });
});
