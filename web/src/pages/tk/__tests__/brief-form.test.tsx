/**
 * Biểu mẫu Đầu bài — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Điều quan trọng nhất bộ này chứng minh: **phân nhánh theo loại hình thật sự đi từ tệp cấu
 * hình ra DOM.** Nếu ai đó "sửa cho nhanh" bằng một câu `if` trong JSX thì tệp cấu hình trở
 * thành trang trí, và lời hứa "thêm câu hỏi cho biệt thự là sửa một tệp JSON" hết hiệu lực
 * mà không có gì báo.
 *
 * Ngoài ra: mức độ đầy đủ hiện bằng CHỮ chứ không chỉ bằng màu; danh sách còn thiếu bấm
 * được; và kích thước lệch với biên bản khảo sát thì hiện CẢ HAI con số.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  briefs: [] as unknown[],
  surveys: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { id: 'u1', fullName: 'Lê Văn C', assignments: [], permissions: [] },
  }),
  useCan: () => true,
}));

vi.mock('@/hooks/use-design-surveys', () => ({
  useDesignSurveys: () => ({ data: state.surveys, isLoading: false }),
}));

vi.mock('@/hooks/use-design-projects', () => ({
  useDesignBriefs: () => ({ data: state.briefs, isLoading: false }),
  useDesignSetting: () => ({ data: 0.7 }),
  useSaveDesignBrief: () => ({ mutateAsync: vi.fn() }),
  useSaveBriefDraft: () => ({ mutateAsync: vi.fn() }),
  useConfirmBriefArtifact: () => ({ mutateAsync: vi.fn() }),
}));

function brief(over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    version: 1,
    is_current_version: true,
    design_task: null,
    functional_needs: null,
    budget_amount: null,
    budget_note: null,
    style_note: null,
    site_condition: null,
    legal_documents: null,
    change_reason: null,
    confirmed_at: null,
    created_at: '2026-08-01T00:00:00Z',
    author: null,
    structured: { building_type: 'nha_pho', site: { width_m: 5, depth_m: 18 }, floors: 3 },
    completeness_score: '0.400',
    missing_fields: ['style'],
    artifact_id: null,
    site_source_survey_id: null,
    ...over,
  };
}

async function openForm() {
  const { BriefPanel } = await import('../brief-panel');
  const view = renderWithApp(<BriefPanel projectId="p1" companyId="c1" readOnly={false} />);
  await userEvent.click(await screen.findByRole('button', { name: /Sửa đầu bài|Lập đầu bài/ }));
  return view;
}

describe('Phân nhánh theo loại hình đi từ cấu hình ra DOM', () => {
  it('nhà phố KHÔNG hỏi khoảng lùi và mật độ', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    expect(screen.queryByText('Khoảng lùi theo quy hoạch')).toBeNull();
    expect(screen.queryByText('Mật độ xây dựng tối đa')).toBeNull();
  });

  it('nhà phố KHÔNG hỏi tổ chức khối nhà', async () => {
    // Nhà phố theo mô hình của engine luôn là một cánh nhà lấp kín lô — hỏi số cánh nhà là
    // hỏi một câu chỉ có một đáp án.
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();
    expect(screen.queryByText('Tổ chức khối nhà')).toBeNull();
  });

  it('biệt thự hỏi số cánh nhà, số lõi thang và tổ chức sân', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();
    await userEvent.click(screen.getByRole('button', { name: 'Biệt thự' }));

    expect(await screen.findByText('Tổ chức khối nhà')).toBeTruthy();
    expect(screen.getAllByText('Số cánh nhà mong muốn')).not.toHaveLength(0);
    expect(screen.getAllByText('Số lõi thang')).not.toHaveLength(0);
    expect(screen.getAllByText('Sân nằm ở đâu')).not.toHaveLength(0);
  });

  it('số cánh nhà ghi vào payload dưới dạng SỐ, không phải chuỗi', async () => {
    // Lựa chọn trong tệp cấu hình luôn là chuỗi vì JSON không có khoá số. Ghi "2" vào chỗ
    // hợp đồng đòi 2 thì màn hình trông vẫn đúng, và lỗi chỉ nổ ở tận bước đúc artifact.
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();
    await userEvent.click(screen.getByRole('button', { name: 'Biệt thự' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Hai cánh' }));

    // Chọn xong thì nút phải ở trạng thái đã chọn — nếu ghi sai kiểu, phép so sánh ngược lại
    // sẽ không khớp và nút không sáng lên.
    expect(screen.getByRole('button', { name: 'Hai cánh' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('đổi sang biệt thự thì hai câu hỏi đó XUẤT HIỆN', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    await userEvent.click(screen.getByRole('button', { name: 'Biệt thự' }));

    // Nhãn xuất hiện ở hai chỗ và đó là ĐÚNG: một lần ở ô nhập vừa hiện ra, một lần ở danh
    // sách "còn thiếu" — trường mới hiện thì đương nhiên chưa ai điền.
    expect(await screen.findAllByText('Khoảng lùi theo quy hoạch')).not.toHaveLength(0);
    expect(screen.getAllByText('Mật độ xây dựng tối đa')).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: /Khoảng lùi theo quy hoạch/ })).toBeTruthy();
  });
});

describe('Thước độ đầy đủ', () => {
  it('hiện phần trăm KÈM CHỮ, không chỉ bằng màu', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(<BriefPanel projectId="p1" companyId="c1" readOnly={false} />);

    expect(await screen.findByText('40%')).toBeTruthy();
    expect(screen.getByText(/Chưa đủ để dựng phương án tự động/)).toBeTruthy();
  });

  it('danh sách còn thiếu bấm được để nhảy tới đúng ô', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    const link = await screen.findByRole('link', { name: /Phong cách kiến trúc/ });
    expect(link.getAttribute('href')).toBe('#brief-style');
    expect(link.className).toContain('min-h-10');
  });

  it('chỉ dùng năm màu trạng thái chuẩn, không tạo màu thứ sáu', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    const { container } = renderWithApp(
      <BriefPanel projectId="p1" companyId="c1" readOnly={false} />,
    );
    await screen.findByText('40%');

    const bar = container.querySelector('[role="progressbar"] > div')!;
    expect(bar.className).toMatch(/bg-status-(draft|pending|completed|progress|overdue)/);
  });
});

describe('Không gõ lại số đã có ở khảo sát', () => {
  it('có khảo sát thì hiện nút lấy theo biên bản', async () => {
    state.briefs = [brief()];
    state.surveys = [
      {
        id: 's1',
        land_width: '5.0',
        land_depth: '18.0',
        surveyed_at: '2026-08-02T00:00:00Z',
        created_at: '2026-08-02T00:00:00Z',
      },
    ];
    await openForm();
    expect(await screen.findByRole('button', { name: /Lấy theo biên bản khảo sát/ })).toBeTruthy();
  });

  it('lệch với biên bản đã dùng thì hiện CẢ HAI con số', async () => {
    // Giấu một bên đi thì không ai biết đã lệch. Khách nói một đằng, đo thực tế một nẻo là
    // chuyện thường — người quyết định phải nhìn thấy cả hai mới quyết được.
    state.briefs = [
      brief({
        site_source_survey_id: 's1',
        structured: { building_type: 'nha_pho', site: { width_m: 5, depth_m: 18 }, floors: 3 },
      }),
    ];
    state.surveys = [
      {
        id: 's1',
        land_width: '5.2',
        land_depth: '18.0',
        surveyed_at: null,
        created_at: '2026-08-02T00:00:00Z',
      },
    ];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(<BriefPanel projectId="p1" companyId="c1" readOnly={false} />);

    const notice = await screen.findByText(/khác biên bản khảo sát/);
    expect(notice.textContent).toContain('5.2');
    expect(notice.textContent).toContain('mặt tiền 5 m × sâu 18 m');
  });
});

describe('Phiên bản và xác nhận', () => {
  it('bản chưa xác nhận lưu tại chỗ, KHÔNG hỏi nguyên nhân', async () => {
    // Biểu mẫu ba mươi trường mà mỗi lần lưu đều đòi lý do thì không ai dùng nổi.
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeTruthy();
    expect(screen.queryByText('Nguyên nhân điều chỉnh')).toBeNull();
  });

  it('bản ĐÃ xác nhận thì lần lưu sau là phiên bản mới và phải nêu nguyên nhân', async () => {
    state.briefs = [brief({ confirmed_at: '2026-08-03T00:00:00Z' })];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(<BriefPanel projectId="p1" companyId="c1" readOnly={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Điều chỉnh đầu bài' }));

    expect(await screen.findByText('Nguyên nhân điều chỉnh')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu đầu bài' })).toBeTruthy();
  });

  it('đã xác nhận rồi thì không còn nút Xác nhận', async () => {
    state.briefs = [brief({ confirmed_at: '2026-08-03T00:00:00Z' })];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(<BriefPanel projectId="p1" companyId="c1" readOnly={false} />);
    await screen.findByText(/Đã xác nhận/);
    expect(screen.queryByRole('button', { name: 'Xác nhận đầu bài' })).toBeNull();
  });

  it('chỉ xem thì không có nút sửa nào', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(<BriefPanel projectId="p1" companyId="c1" readOnly />);
    await screen.findByText(/Đầu bài đang hiệu lực/);
    expect(screen.queryByRole('button', { name: 'Sửa đầu bài' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận đầu bài' })).toBeNull();
  });
});

describe('Vùng bấm cho ngón tay', () => {
  it('mọi nút lựa chọn trong biểu mẫu đạt tối thiểu 40px', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    const { container } = await openForm();

    const chips = [...container.querySelectorAll('button[aria-pressed]')];
    expect(chips.length).toBeGreaterThan(5);
    for (const chip of chips) expect(chip.className).toContain('min-h-10');
  });
});

describe('Chế độ xem — không để lọt mã máy ra màn hình', () => {
  // Đây là lỗi đã lọt thật, và nó không gây lỗi nào khác để lộ ra: bản trước đổ thẳng giá trị
  // đã lưu ra màn hình, nên hiện `nha_pho`, `[object Object]` và `2000000000` giữa một màn
  // hình tiếng Việt. Nhân sự NVG có người không đọc được tiếng Anh (CLAUDE.md 4.1).
  const filled = {
    building_type: 'nha_pho',
    locality: 'hung_yen',
    site: { width_m: 5, depth_m: 18, orientation: 'N' },
    floors: 3,
    family: [{ role: 'vo_chong', count: 2, floor_pref: 'mid', needs: ['bedroom'] }],
    required_spaces: [{ type: 'living' }, { type: 'kitchen' }],
    style: 'hien_dai',
    budget_range_vnd: [2000000000, 3000000000],
    priorities: ['natural_light'],
    decision_maker: { relationship: 'chu_nha' },
  };

  it('lựa chọn hiện bằng nhãn tiếng Việt, không phải mã', async () => {
    state.briefs = [brief({ structured: filled })];
    const { BriefPanel } = await import('../brief-panel');
    const { container } = renderWithApp(
      <BriefPanel projectId="p1" companyId="c1" readOnly={false} />,
    );
    await screen.findByText('Nhà phố');

    const text = container.textContent ?? '';
    for (const code of [
      'nha_pho',
      'hung_yen',
      'hien_dai',
      'natural_light',
      'vo_chong',
      'chu_nha',
      '[object Object]',
    ]) {
      expect(text).not.toContain(code);
    }
  });

  it('thành viên gia đình đọc được, tiền có đơn vị', async () => {
    state.briefs = [brief({ structured: filled })];
    const { BriefPanel } = await import('../brief-panel');
    const { container } = renderWithApp(
      <BriefPanel projectId="p1" companyId="c1" readOnly={false} />,
    );
    await screen.findByText(/Vợ chồng: 2 người/);
    expect(container.textContent).toContain('2.000.000.000 đồng');
  });

  it('câu hỏi riêng của biệt thự KHÔNG hiện ở hồ sơ nhà phố', async () => {
    // Hiện ra kèm dấu gạch ngang cũng là sai: một danh sách trường trống kéo dài làm người
    // đọc tưởng hồ sơ còn thiếu thông tin.
    state.briefs = [brief({ structured: filled })];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(<BriefPanel projectId="p1" companyId="c1" readOnly={false} />);
    await screen.findByText('Nhà phố');

    expect(screen.queryByText('Số cánh nhà mong muốn')).not.toBeInTheDocument();
    expect(screen.queryByText('Số lõi thang')).not.toBeInTheDocument();
  });
});

describe('Hình thửa đất', () => {
  it('gõ được kích thước lẻ — dấu thập phân không bị nuốt giữa chừng', async () => {
    // Ô số điều khiển đơn giản mất dấu chấm ngay khi vừa gõ: `Number("3.")` là 3 nên ô vẽ
    // lại thành "3", và ký tự tiếp theo cho ra "35". Người nhập 3,5 m mặt tiền được một
    // thửa rộng 35 m. Mà kích thước thửa đất thì gần như luôn lẻ.
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    const field = screen.getByLabelText('Chiều rộng mặt tiền') as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, '3.5');
    expect(field.value).toBe('3.5');

    // Dấu phẩy là cách viết số thập phân của tiếng Việt — phải gõ được y như dấu chấm.
    await userEvent.clear(field);
    await userEvent.type(field, '4,25');
    expect(field.value).toBe('4,25');
  });

  it('chọn Hình thang thì hỏi mặt hậu, chọn Đa giác thì hỏi ranh giới', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    expect(screen.queryByLabelText('Chiều rộng mặt hậu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Hình thang' }));
    expect(await screen.findByLabelText('Chiều rộng mặt hậu')).toBeTruthy();
    expect(screen.queryAllByText('Ranh giới thửa đất')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Đa giác không đều' }));
    expect(await screen.findAllByText('Ranh giới thửa đất')).not.toHaveLength(0);
    // Đa giác thì hai ô kích thước không còn nghĩa — ranh giới đã nói đủ.
    expect(screen.queryByLabelText('Chiều rộng mặt hậu')).toBeNull();
    expect(screen.queryByLabelText('Chiều rộng mặt tiền')).toBeNull();
  });

  it('hình thang thiếu mặt hậu thì nói ra ngay, không chờ tới lúc lưu', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();
    await userEvent.click(screen.getByRole('button', { name: 'Hình thang' }));

    expect(
      (await screen.findAllByText(/chưa có chiều rộng mặt hậu/)).length,
      'cảnh báo phải hiện cả cạnh ô lẫn ở cột phải',
    ).toBeGreaterThan(0);
  });
});

describe('Không gian bắt buộc — ghim tầng', () => {
  it('chọn không gian thì hiện ô ghim tầng, mặc định để hệ thống tự xếp', async () => {
    state.briefs = [brief()]; // floors: 3
    state.surveys = [];
    await openForm();

    expect(screen.queryByLabelText('Tầng — garage')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Chỗ để xe' }));

    const select = (await screen.findByLabelText('Tầng — garage')) as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('ghim vào một tầng cụ thể thì ô ghi đúng giá trị đó', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();
    await userEvent.click(screen.getByRole('button', { name: 'Chỗ để xe' }));

    const select = (await screen.findByLabelText('Tầng — garage')) as HTMLSelectElement;
    await userEvent.selectOptions(select, '1');
    expect(select.value).toBe('1');
  });

  it('bỏ chọn không gian thì mất luôn ô ghim tầng của nó', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();
    const chip = screen.getByRole('button', { name: 'Chỗ để xe' });
    await userEvent.click(chip);
    await screen.findByLabelText('Tầng — garage');

    await userEvent.click(chip);
    expect(screen.queryByLabelText('Tầng — garage')).toBeNull();
  });

  it('nhà một tầng thì không hiện khu vực ghim tầng — chỉ một tầng thì không có gì để chọn', async () => {
    state.briefs = [brief({ structured: { building_type: 'nha_pho', floors: 1 } })];
    state.surveys = [];
    await openForm();
    await userEvent.click(screen.getByRole('button', { name: 'Chỗ để xe' }));

    expect(screen.queryByLabelText('Tầng — garage')).toBeNull();
    expect(screen.queryByText(/Ghim vào tầng cụ thể/)).toBeNull();
  });
});
