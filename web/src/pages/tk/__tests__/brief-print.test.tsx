/**
 * Xuất PDF bản Đầu bài (TK-10).
 *
 * Không gọi `window.print()` thật: trên trình duyệt đó là hộp thoại chặn mọi thao tác tiếp
 * theo. Thay `window.open` bằng cửa sổ giả rồi đọc HTML đã ghi vào — đủ để canh bốn thứ dễ
 * hỏng lặng lẽ:
 *
 *  - Câu CHƯA trả lời bị bỏ khỏi bản in. Người cầm bản in không phân biệt được "không hỏi"
 *    với "quên hỏi", mà bản in này tồn tại chính để mang đi hỏi tiếp cho đủ.
 *  - Mã máy lọt ra giữa một trang tiếng Việt (CLAUDE.md 4.1).
 *  - Chữ người dùng nhập lọt thẻ HTML thô vào trang in.
 *  - Nút biến mất ở chế độ chỉ xem — nhưng người cần bản in thường đúng là người không còn
 *    quyền sửa hồ sơ.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({ briefs: [] as unknown[], surveys: [] as unknown[] }));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', fullName: 'Lê Văn C' } }),
  useCan: () => true,
}));
vi.mock('@/hooks/use-design-surveys', () => ({
  useDesignSurveys: () => ({ data: state.surveys, isLoading: false }),
}));
// Nhà máy mock là ASYNC để nhập được `BRIEF_FORM`: `vi.mock` bị nâng lên đầu tệp, nên một
// tham chiếu tới biến nhập ở đầu tệp sẽ đọc trước khi nó kịp khởi tạo.
vi.mock('@/hooks/use-design-projects', async () => {
  const { BRIEF_FORM } = await import('@nvg/shared/design');
  return {
    useDesignBriefs: () => ({ data: state.briefs, isLoading: false }),
    useDesignSetting: () => ({ data: 0.7 }),
    // Không có lớp phủ của quản trị viên: biểu mẫu chạy trên bản gốc, đúng như tenant chưa sửa gì.
    useBriefFormConfig: () => ({
      config: BRIEF_FORM,
      overlay: null,
      broken: false,
      isLoading: false,
    }),
    useSaveDesignBrief: () => ({ mutateAsync: vi.fn() }),
    useSaveBriefDraft: () => ({ mutateAsync: vi.fn() }),
    useConfirmBriefArtifact: () => ({ mutateAsync: vi.fn() }),
  };
});

function brief(structured: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    version: 2,
    is_current_version: true,
    design_task: null,
    functional_needs: null,
    style_note: null,
    site_condition: null,
    legal_documents: null,
    change_reason: null,
    confirmed_at: null,
    created_at: '2026-08-01T00:00:00Z',
    author: null,
    structured,
    completeness_score: '0.400',
    missing_fields: [],
    artifact_id: null,
    site_source_survey_id: null,
    ...over,
  };
}

function capturePrint() {
  const captured = { html: '', title: '' };
  const fake = {
    document: {
      write: (h: string) => {
        captured.html = h;
      },
      close: () => {},
      images: [],
    },
    focus: () => {},
    print: () => {},
    closed: false,
  } as unknown as Window;
  const spy = vi.spyOn(window, 'open').mockReturnValue(fake);
  return { captured, restore: () => spy.mockRestore() };
}

async function open(readOnly = false) {
  const { BriefPanel } = await import('../brief-panel');
  return renderWithApp(
    <BriefPanel
      projectId="p1"
      companyId="c1"
      projectName="Biệt thự nhà vườn (demo)"
      projectCode="NVO-TK-2026-2737"
      readOnly={readOnly}
    />,
  );
}

describe('Xuất PDF bản Đầu bài', () => {
  it('đưa tên dự án, phiên bản và câu trả lời vào bản in', async () => {
    state.briefs = [
      brief({
        building_type: 'biet_thu',
        locality: 'hung_yen',
        floors: 2,
        site: { width_m: 20, depth_m: 25, orientation: 'DN' },
        family: [{ role: 'vo_chong', count: 2 }],
      }),
    ];
    state.surveys = [];
    const print = capturePrint();
    await open();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));

    expect(print.captured.html).toContain('Biệt thự nhà vườn (demo)');
    expect(print.captured.html).toContain('NVO-TK-2026-2737');
    expect(print.captured.html).toContain('Bản 2');
    expect(print.captured.html).toContain('Bản nháp — chưa xác nhận');
    // Giá trị đi qua bảng nhãn, không đổ mã máy ra trang in (CLAUDE.md 4.1).
    expect(print.captured.html).toContain('Đông Nam');
    expect(print.captured.html).not.toContain('>DN<');
    expect(print.captured.html).not.toContain('biet_thu');
    print.restore();
  });

  it('câu CHƯA trả lời vẫn in, mang dấu gạch — không bị bỏ dòng', async () => {
    state.briefs = [brief({ building_type: 'nha_pho', floors: 3 })];
    state.surveys = [];
    const print = capturePrint();
    await open();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));

    // Phong cách chưa chọn, nhưng câu hỏi vẫn phải có mặt: bỏ dòng thì người đọc không biết
    // là không hỏi hay quên hỏi.
    expect(print.captured.html).toContain('Phong cách kiến trúc');
    expect(print.captured.html).toContain('—');
    print.restore();
  });

  it('in kèm mức đầy đủ, còn thiếu và chỗ chưa nhất quán', async () => {
    state.briefs = [brief({ building_type: 'nha_pho', floors: 3 })];
    state.surveys = [];
    const print = capturePrint();
    await open();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));

    expect(print.captured.html).toContain('Mức độ đầy đủ');
    expect(print.captured.html).toContain('Còn thiếu');
    expect(print.captured.html).toContain('Chỗ chưa nhất quán');
    print.restore();
  });

  it('bảng không gian in thành BẢNG, không dồn về một dòng chữ', async () => {
    state.briefs = [
      brief({
        building_type: 'nha_pho',
        floors: 2,
        site: { width_m: 5, depth_m: 18 },
        required_spaces: [
          { type: 'living', floor: 1, area_m2: 24, amenities: 'kệ tivi âm tường' },
          { type: 'kitchen', floor: 1 },
        ],
      }),
    ];
    state.surveys = [];
    const print = capturePrint();
    await open();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));

    expect(print.captured.html).toContain('<th>Tiện ích bổ sung</th>');
    expect(print.captured.html).toContain('kệ tivi âm tường');
    expect(print.captured.html).toContain('Phòng khách');
    print.restore();
  });

  it('thành viên gia đình in thành BẢNG, không dồn về một dòng chữ', async () => {
    // Bản đầu nối cả năm nhóm bằng `·` và `|` thành một ô duy nhất: «Ông bà: 2 người · 1 phòng
    // ngủ · Tầng 1 · khép kín · Kho riêng | Vợ chồng: …». Trên màn hình nó còn đọc được; trong
    // bản in mang đi gặp khách thì người đọc phải tự tách lại năm lần (Haan báo 07/09/2026).
    state.briefs = [
      brief({
        building_type: 'biet_thu',
        locality: 'hung_yen',
        floors: 2,
        site: { width_m: 20, depth_m: 25 },
        family: [
          { role: 'ong_ba', count: 2, floor: 1, ensuite: true, needs: ['storage'] },
          { role: 'con', count: 2, floor: 2, needs: ['balcony'] },
        ],
      }),
    ];
    state.surveys = [];
    const print = capturePrint();
    await open();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));

    const html = print.captured.html;
    expect(html).toContain('<th>Số người</th>');
    expect(html).toContain('<th>Loại phòng</th>');
    expect(html).toContain('<th>Nhu cầu riêng</th>');
    expect(html).toContain('<td>Ông bà</td>');
    expect(html).toContain('<td>2 phòng ngủ</td>');
    // Hai vế của ô chọn đều có tên, y như biểu mẫu — không để trống vế «Riêng».
    expect(html).toContain('<td>Khép kín</td>');
    expect(html).toContain('<td>Riêng</td>');
    // Và KHÔNG còn dấu nối của bản một dòng.
    expect(html).not.toContain('Ông bà: 2 người');
    // Tên mục không bị lặp hai lần: mục này chỉ có đúng một bảng.
    expect(html.match(/Thành viên gia đình/g) ?? []).toHaveLength(1);
    print.restore();
  });

  it('nhóm không sinh phòng ngủ nào thì bỏ trống ô loại phòng, không khẳng định bừa', async () => {
    // «Riêng» hay «Khép kín» chỉ có nghĩa khi có một phòng ngủ để nói tới.
    state.briefs = [
      brief({
        building_type: 'nha_pho',
        floors: 2,
        family: [{ role: 'khong_co_that', count: 2 }],
      }),
    ];
    state.surveys = [];
    const print = capturePrint();
    await open();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));
    expect(print.captured.html).not.toContain('<td>Riêng</td>');
    print.restore();
  });

  it('chữ người dùng nhập được escape, không lọt thẻ thô vào trang in', async () => {
    state.briefs = [
      brief({ building_type: 'nha_pho', floors: 2 }, { design_task: '<img src=x onerror="a()">' }),
    ];
    state.surveys = [];
    const print = capturePrint();
    await open();

    await userEvent.click(screen.getByRole('button', { name: /Xuất PDF/ }));

    expect(print.captured.html).not.toContain('<img');
    expect(print.captured.html).toContain('&lt;img src=x onerror=&quot;a()&quot;&gt;');
    print.restore();
  });

  it('vẫn xuất được ở chế độ chỉ xem, còn Sửa thì không', async () => {
    state.briefs = [brief({ building_type: 'nha_pho', floors: 2 })];
    state.surveys = [];
    await open(true);

    expect(await screen.findByRole('button', { name: /Xuất PDF/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sửa đầu bài|Điều chỉnh đầu bài/ })).toBeNull();
  });
});
