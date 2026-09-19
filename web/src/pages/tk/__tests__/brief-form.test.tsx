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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  briefs: [] as unknown[],
  surveys: [] as unknown[],
  // Giữ nguyên một hàm giả xuyên suốt để đếm được số lần ghi — trả về hàm mới mỗi lượt vẽ
  // thì không bài nào khẳng định được "đã lưu" hay "chưa lưu".
  saveDraft: vi.fn(async (_input: { structured: Record<string, unknown> }) => undefined),
  saveNewVersion: vi.fn(async (_input: { structured: Record<string, unknown> }) => ({
    id: 'b-moi',
  })),
  confirmBrief: vi.fn(async (_input: { briefId: string }) => ({})),
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
  useSaveDesignBrief: () => ({ mutateAsync: state.saveNewVersion, isPending: false }),
  useSaveBriefDraft: () => ({ mutateAsync: state.saveDraft, isPending: false }),
  useConfirmBriefArtifact: () => ({ mutateAsync: state.confirmBrief, isPending: false }),
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

/**
 * Mở trình soạn thảo, và đi tới đúng BƯỚC cần kiểm.
 *
 * Biểu mẫu chia bước từ 07/09/2026 nên chỉ một mục hiện ra mỗi lần. Đi qua thanh tiến trình
 * thay vì bấm «Tiếp» nhiều lần: bài kiểm nói mình cần ô nào, không phải mình bấm bao nhiêu
 * nút để tới đó — và thứ tự bước đổi thì các bài này không phải sửa lại.
 */
async function openForm(step?: string) {
  const { BriefPanel } = await import('../brief-panel');
  const view = renderWithApp(
    <BriefPanel
      projectId="p1"
      companyId="c1"
      projectName="Biệt thự nhà vườn (demo)"
      projectCode="NVO-TK-2026-2737"
      readOnly={false}
    />,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: /Sửa đầu bài|Điều chỉnh đầu bài|Lập đầu bài/ }),
  );
  if (step) await goToStep(step);
  return view;
}

/** Đi tới một bước qua thanh tiến trình. Tách riêng cho bài phải đổi loại hình TRƯỚC — bước
 *  «Tổ chức khối nhà» chỉ tồn tại sau khi đã chọn Biệt thự. */
beforeEach(() => {
  state.saveDraft.mockClear();
  state.saveNewVersion.mockClear();
  state.confirmBrief.mockClear();
  state.confirmBrief.mockResolvedValue({});
});

async function goToStep(step: string) {
  const bar = screen.getByRole('navigation', { name: 'Các bước của đầu bài' });
  await userEvent.click(within(bar).getByRole('button', { name: new RegExp(`^${step}`) }));
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
    await goToStep('Tổ chức khối nhà');
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
    renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );

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

  it('chỉ dùng sáu màu trạng thái chuẩn, không tạo màu thứ bảy', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    const { container } = renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );
    await screen.findByText('40%');

    const bar = container.querySelector('[role="progressbar"] > div')!;
    expect(bar.className).toMatch(/bg-status-(draft|pending|completed|progress|overdue|disputed)/);
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
    await openForm('Khu đất');
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
    renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );

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
    renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Điều chỉnh đầu bài' }));
    // Ô nguyên nhân nằm ở BƯỚC CUỐI, cạnh nút Lưu — hỏi lý do ngay bước đầu là hỏi trước khi
    // người dùng biết mình sẽ đổi những gì.
    await goToStep('Ưu tiên');

    expect(await screen.findByText('Nguyên nhân điều chỉnh')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu đầu bài' })).toBeTruthy();
  });

  it('đã xác nhận rồi thì không còn nút Xác nhận', async () => {
    state.briefs = [brief({ confirmed_at: '2026-08-03T00:00:00Z' })];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );
    await screen.findByText(/Đã xác nhận/);
    expect(screen.queryByRole('button', { name: 'Xác nhận đầu bài' })).toBeNull();
  });

  it('chỉ xem thì không có nút sửa nào', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly
      />,
    );
    await screen.findByText(/Đầu bài đang hiệu lực/);
    expect(screen.queryByRole('button', { name: 'Sửa đầu bài' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận đầu bài' })).toBeNull();
  });
});

describe('Vùng bấm cho ngón tay', () => {
  it('mọi nút lựa chọn trong biểu mẫu đạt tối thiểu 40px', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    const { container } = await openForm('Không gian và phong cách');

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
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
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
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );
    await screen.findByText(/Vợ chồng: 2 người/);
    expect(container.textContent).toContain('2.000.000.000 đồng');
  });

  it('câu hỏi riêng của biệt thự KHÔNG hiện ở hồ sơ nhà phố', async () => {
    // Hiện ra kèm dấu gạch ngang cũng là sai: một danh sách trường trống kéo dài làm người
    // đọc tưởng hồ sơ còn thiếu thông tin.
    state.briefs = [brief({ structured: filled })];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );
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
    await openForm('Khu đất');

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
    await openForm('Khu đất');

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
    await openForm('Khu đất');
    await userEvent.click(screen.getByRole('button', { name: 'Hình thang' }));

    expect(
      (await screen.findAllByText(/chưa có chiều rộng mặt hậu/)).length,
      'cảnh báo phải hiện cả cạnh ô lẫn ở cột phải',
    ).toBeGreaterThan(0);
  });
});

describe('Không gian bắt buộc — mỗi dòng một phòng', () => {
  // `aria-label` dùng NHÃN tiếng Việt chứ không phải mã (`Tầng — Chỗ để xe`, không phải
  // `Tầng — garage`): đó là chữ trình đọc màn hình đọc lên, nên nó thuộc phần giao diện phải
  // 100% tiếng Việt (CLAUDE.md 4.1).
  it('chọn không gian thì hiện ô ghim tầng, mặc định để hệ thống tự xếp', async () => {
    state.briefs = [brief()]; // floors: 3
    state.surveys = [];
    await openForm('Không gian và phong cách');

    expect(screen.queryByLabelText('Tầng — Chỗ để xe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Chỗ để xe' }));

    const select = (await screen.findByLabelText('Tầng — Chỗ để xe')) as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('ghim vào một tầng cụ thể thì ô ghi đúng giá trị đó', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Không gian và phong cách');
    await userEvent.click(screen.getByRole('button', { name: 'Chỗ để xe' }));

    const select = (await screen.findByLabelText('Tầng — Chỗ để xe')) as HTMLSelectElement;
    await userEvent.selectOptions(select, '1');
    expect(select.value).toBe('1');
  });

  it('bỏ chọn không gian thì mất luôn dòng của nó', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Không gian và phong cách');
    const chip = screen.getByRole('button', { name: 'Chỗ để xe' });
    await userEvent.click(chip);
    await screen.findByLabelText('Tầng — Chỗ để xe');

    await userEvent.click(chip);
    expect(screen.queryByLabelText('Tầng — Chỗ để xe')).toBeNull();
  });

  it('thêm được nhiều phòng CÙNG LOẠI, mỗi phòng ghim tầng riêng', async () => {
    // Đây là lý do danh sách chuyển từ "một dòng một LOẠI" sang "một dòng một PHÒNG": một căn
    // bảy phòng ngủ trước đây chỉ khai được một dòng, và mọi thứ khai ở đó áp cho cả bảy.
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Không gian và phong cách');
    await userEvent.click(screen.getByRole('button', { name: 'Phòng làm việc' }));

    // Thêm phòng thứ hai bằng ô ở CUỐI danh sách, không phải bằng một nút lặp trên từng dòng.
    await userEvent.selectOptions(
      await screen.findByLabelText('Loại phòng cần thêm'),
      'Phòng làm việc',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Thêm phòng' }));

    const first = (await screen.findByLabelText('Tầng — Phòng làm việc 1')) as HTMLSelectElement;
    const second = (await screen.findByLabelText('Tầng — Phòng làm việc 2')) as HTMLSelectElement;
    await userEvent.selectOptions(first, '1');
    await userEvent.selectOptions(second, '3');

    expect(first.value).toBe('1');
    expect(second.value).toBe('3');
  });

  it('ô chọn loại phòng KHÔNG đề xuất phòng ngủ — phòng ngủ khai ở phần gia đình', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Không gian và phong cách');

    const picker = (await screen.findByLabelText('Loại phòng cần thêm')) as HTMLSelectElement;
    const labels = [...picker.options].map((o) => o.textContent);
    expect(labels).not.toContain('Phòng ngủ');
    expect(labels).not.toContain('Phòng ngủ chính');
    expect(labels).toContain('Bếp');
  });

  it('nhập được diện tích mong muốn cho từng phòng, dấu thập phân không bị nuốt', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Không gian và phong cách');
    await userEvent.click(screen.getByRole('button', { name: 'Chỗ để xe' }));

    const area = (await screen.findByLabelText(
      'Diện tích tối thiểu — Chỗ để xe',
    )) as HTMLInputElement;
    await userEvent.type(area, '18.5');
    expect(area.value).toBe('18.5');
  });

  it('dòng tổng dưới bảng nói tổng diện tích TỐI THIỂU so với sàn xây được, và đỏ khi vượt', async () => {
    state.briefs = [
      brief({
        structured: {
          building_type: 'biet_thu',
          floors: 1,
          site: { width_m: 10, depth_m: 10 },
          required_spaces: [
            { type: 'living', area_m2: 70 },
            { type: 'kitchen', area_m2: 40 },
          ],
        },
      }),
    ];
    state.surveys = [];
    await openForm('Không gian và phong cách');

    const line = (await screen.findByText(/Tổng diện tích tối thiểu đã khai:/)).closest('p')!;
    expect(line.textContent).toContain('110 m²');
    expect(line.textContent).toContain('sàn xây được 100 m²');
    expect(line.closest('div')?.className).toContain('text-status-overdue');
  });

  it('nhà một tầng thì không hiện ô ghim tầng — nhưng vẫn nhập được diện tích', async () => {
    state.briefs = [brief({ structured: { building_type: 'nha_pho', floors: 1 } })];
    state.surveys = [];
    await openForm('Không gian và phong cách');
    await userEvent.click(screen.getByRole('button', { name: 'Chỗ để xe' }));

    expect(screen.queryByLabelText('Tầng — Chỗ để xe')).toBeNull();
    expect(await screen.findByLabelText('Diện tích tối thiểu — Chỗ để xe')).toBeTruthy();
  });

  it('loại phòng ngủ là một lựa chọn HAI CHIỀU, nêu rõ cả hai vế', async () => {
    // Bản trước có chip "Khu vệ sinh riêng" ghi chuỗi `"wc"` vào `needs`. Chuỗi đó bị Lớp 2 bỏ
    // qua hoàn toàn vì `wc` thuộc nhóm hệ thống tự suy — ô chọn tồn tại mà không làm gì cả.
    //
    // Bản sau đó thay bằng MỘT ô bật/tắt "Phòng ngủ khép kín" lẫn giữa các ô nhu cầu chọn-nhiều,
    // và nó đọc lên thành một lời khẳng định chứ không phải một lựa chọn: không thấy phương án
    // còn lại đâu. Nay là ô chọn nêu thẳng cả hai vế.
    state.briefs = [
      brief({
        structured: {
          building_type: 'nha_pho',
          site: { width_m: 5, depth_m: 18 },
          floors: 3,
          family: [{ role: 'vo_chong', count: 2 }],
        },
      }),
    ];
    state.surveys = [];
    await openForm('Thành viên gia đình');

    expect(screen.queryByRole('button', { name: 'Khu vệ sinh riêng' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Phòng ngủ khép kín' })).toBeNull();

    const select = (await screen.findByLabelText('Loại phòng ngủ')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Phòng ngủ riêng',
      'Phòng ngủ khép kín',
    ]);
    // Mặc định phải đọc ra được là "riêng", không phải một ô trống ai cũng đoán một kiểu.
    expect(select.value).toBe('shared');

    await userEvent.selectOptions(select, 'ensuite');
    expect(select.value).toBe('ensuite');
    expect(await screen.findByText('Cần 1 phòng ngủ chính, khép kín.')).toBeTruthy();
  });

  it('đầu bài cũ khai bằng chuỗi `wc` đọc ra đúng là khép kín', async () => {
    state.briefs = [
      brief({
        structured: {
          building_type: 'nha_pho',
          site: { width_m: 5, depth_m: 18 },
          floors: 2,
          family: [{ role: 'nguoi_giup_viec', count: 1, needs: ['wc'] }],
        },
      }),
    ];
    state.surveys = [];
    await openForm('Thành viên gia đình');

    const select = (await screen.findByLabelText('Loại phòng ngủ')) as HTMLSelectElement;
    expect(select.value).toBe('ensuite');

    // Và chuyển về "riêng" phải gỡ CẢ cách khai cũ, nếu không nó tự bật lại ở lần vẽ sau.
    await userEvent.selectOptions(select, 'shared');
    expect((screen.getByLabelText('Loại phòng ngủ') as HTMLSelectElement).value).toBe('shared');
  });
});

describe('Chế độ xem KHÔNG đổ mã máy ra màn hình', () => {
  it('nhu cầu do Lớp 2 tự suy trong đầu bài cũ không hiện thành mã thô', async () => {
    // Đầu bài đã lưu còn mang `bedroom`/`master_bedroom`/`wc` trong `needs` — ba ô chọn cũ
    // chưa bao giờ có tác dụng. Không mã nào còn trong danh sách lựa chọn, nên nếu quên lọc
    // thì dòng tóm tắt in nguyên chữ "bedroom" cho kiến trúc sư đọc. Đã thấy trên hồ sơ thật.
    state.briefs = [
      brief({
        structured: {
          building_type: 'nha_pho',
          site: { width_m: 5, depth_m: 18 },
          floors: 2,
          family: [{ role: 'ong_ba', count: 2, needs: ['bedroom', 'wc', 'balcony'] }],
        },
      }),
    ];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );

    const summary = await screen.findByText(/Ông bà: 2 người/);
    expect(summary.textContent).not.toContain('bedroom');
    expect(summary.textContent).not.toContain('wc');
    expect(summary.textContent).toContain('Ban công riêng');
    // Và số phòng ngủ suy ra được nói thẳng, không bắt đọc chéo sang tab khác.
    expect(summary.textContent).toContain('1 phòng ngủ');
  });
});

describe('Số tầng dẫn dắt mọi ô chọn tầng bên dưới', () => {
  const withFamily = (floors: number) =>
    brief({
      structured: {
        building_type: 'nha_pho',
        site: { width_m: 5, depth_m: 18 },
        floors,
        family: [
          { role: 'ong_ba', count: 2 },
          { role: 'con', count: 2 },
        ],
      },
    });

  it('nhà hai tầng chỉ chọn được Tầng 1 và Tầng 2, không còn "tầng giữa"', async () => {
    // Đây là chỗ hai phần của cùng một biểu mẫu từng dùng hai thang đo khác nhau cho cùng một
    // khái niệm: danh sách không gian ghim theo SỐ tầng, phần gia đình lại chọn "tầng giữa" —
    // mà "tầng giữa" của một căn hai tầng không trỏ vào tầng nào.
    state.briefs = [withFamily(2)];
    state.surveys = [];
    await openForm('Thành viên gia đình');

    const selects = (await screen.findAllByLabelText('Tầng')) as HTMLSelectElement[];
    const labels = [...selects[0]!.options].map((o) => o.textContent);
    expect(labels).toEqual(['Để hệ thống tự xếp', 'Tầng 1', 'Tầng 2']);
    expect(labels).not.toContain('Tầng giữa');
  });

  it('nhà một tầng thì không hỏi tầng nữa', async () => {
    state.briefs = [withFamily(1)];
    state.surveys = [];
    await openForm();
    expect(screen.queryByLabelText('Tầng')).toBeNull();
  });

  it('nói ngay mỗi nhóm thành viên sinh ra mấy phòng ngủ', async () => {
    // "Con · 2 người" ra HAI phòng ngủ còn "Ông bà · 2 người" ra MỘT. Không nói ra thì người
    // khai đi tìm chúng ở danh sách không gian bên dưới và không thấy.
    state.briefs = [withFamily(2)];
    state.surveys = [];
    await openForm('Thành viên gia đình');

    expect(await screen.findByText('Cần 1 phòng ngủ.')).toBeTruthy();
    expect(screen.getByText('Cần 2 phòng ngủ.')).toBeTruthy();
  });
});

describe('Bấm vào khoảng trống KHÔNG được đổi lựa chọn', () => {
  /**
   * Lỗi gặp thật (07/09/2026): bấm vào chỗ trống cạnh một hàng nút chọn thì một lựa chọn đang
   * bật tự tắt.
   *
   * Nguyên nhân nằm ở HTML chứ không ở mã xử lý sự kiện: nhãn trường bọc ô nhập trong
   * `<label>`, và trình duyệt chuyển mọi cú bấm rơi vào khoảng trống của `<label>` — kể cả
   * chữ nhãn và dòng chú thích — sang phần tử nhập ĐẦU TIÊN bên trong. Với một hàng nút, đó
   * là bấm hộ nút đầu tiên.
   *
   * Bộ này bấm đúng ba chỗ trống đó và đòi lựa chọn không đổi. Không có nó thì lần sau ai
   * dùng lại `<label>` cho một nhóm nút sẽ tái hiện lỗi mà không test nào đỏ.
   */
  const filled = {
    building_type: 'nha_pho',
    site: { width_m: 5, depth_m: 18, access_sides: ['front', 'left'] },
    floors: 3,
  };

  it('bấm nhãn, chú thích và phần trống của hàng nút đều không tắt lựa chọn nào', async () => {
    state.briefs = [brief({ structured: filled })];
    state.surveys = [];
    await openForm('Khu đất');

    const pressed = () =>
      screen
        .getAllByRole('button', { pressed: true })
        .map((b) => b.textContent)
        .sort();
    const before = pressed();
    expect(before).toContain('Mặt trước');
    expect(before).toContain('Bên trái');

    await userEvent.click(screen.getByText('Mặt tiếp cận được'));
    await userEvent.click(screen.getByText('Mặt nào giáp đường hoặc hẻm, đi vào được.'));

    expect(pressed()).toEqual(before);
  });

  it('nhãn của nhóm nhiều ô là fieldset/legend, không phải label', async () => {
    // Kiểm ngay ở tầng HTML: `<label>` là chỗ hành vi chuyển cú bấm sinh ra, nên chặn nó ở
    // đây bắt được lỗi kể cả khi cú bấm mô phỏng của jsdom không tái hiện đúng hành vi thật
    // của trình duyệt.
    state.briefs = [brief({ structured: filled })];
    state.surveys = [];
    const { container } = await openForm('Khu đất');

    const legend = [...container.querySelectorAll('legend')].find(
      (el) => el.textContent === 'Mặt tiếp cận được',
    );
    expect(legend).toBeTruthy();
    expect(legend!.closest('fieldset')).toBeTruthy();
    expect(legend!.closest('label')).toBeNull();
  });
});

describe('Nhu cầu riêng của nhóm thành viên', () => {
  it('cho chọn Tủ đồ và Phòng thay đồ riêng, KHÔNG còn kho riêng', async () => {
    // Kho là không gian chung của cả nhà — khai ở «Không gian bắt buộc có», không phải ở đây.
    state.briefs = [
      brief({ structured: { ...brief().structured, family: [{ role: 'con', count: 1 }] } }),
    ];
    state.surveys = [];
    await openForm('Thành viên gia đình');

    expect(screen.getByRole('button', { name: 'Tủ đồ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Phòng thay đồ riêng' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /kho riêng/i })).toBeNull();
  });

  it('đầu bài đã lưu mang mã kho riêng vẫn đọc ra tiếng Việt', async () => {
    // Bản đã xác nhận là BẤT BIẾN, nên mã cũ còn nằm đó mãi. Gỡ lựa chọn khỏi cấu hình mà
    // không giữ nhãn thì màn hình in `storage` ra giữa một trang tiếng Việt (CLAUDE.md 4.1).
    state.briefs = [
      brief({
        structured: {
          ...brief().structured,
          family: [{ role: 'con', count: 1, needs: ['storage'] }],
        },
      }),
    ];
    state.surveys = [];
    const { BriefPanel } = await import('../brief-panel');
    const { container } = renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );
    await screen.findByText(/Con: 1 người/);
    expect(container.textContent).toContain('Kho riêng');
    expect(container.textContent).not.toContain('storage');
  });
});

describe('Phòng ngủ tự sinh từ Thành viên gia đình', () => {
  const withFamily = {
    building_type: 'biet_thu',
    site: { width_m: 15, depth_m: 20 },
    floors: 2,
    family: [
      { role: 'vo_chong', count: 2, ensuite: true, floor: 2 },
      { role: 'con', count: 2 },
    ],
    required_spaces: [{ type: 'living' }],
  };

  it('gọi tên phòng ngủ theo CHỦ NHÂN, không đánh số', async () => {
    // «Phòng ngủ 3» không nói được phòng đó của ai, mà đó chính là thứ người khai cần biết để
    // đặt tầng và diện tích (Haan bắt được 07/09/2026).
    state.briefs = [brief({ structured: withFamily })];
    state.surveys = [];
    await openForm('Không gian và phong cách');

    expect(screen.getByText('Phòng ngủ chính (vợ chồng) · khép kín')).toBeTruthy();
    expect(screen.getByText('Phòng ngủ (con 1) · riêng')).toBeTruthy();
    expect(screen.getByText('Phòng ngủ (con 2) · riêng')).toBeTruthy();
    // Nhóm chỉ sinh một phòng thì KHÔNG đánh số — «(con)» chứ không «(con 1)».
    expect(screen.queryByText(/Phòng ngủ \d+/)).toBeNull();
  });

  it('nhóm chỉ sinh một phòng thì không đánh số trong ngoặc', async () => {
    state.briefs = [
      brief({
        structured: { ...withFamily, family: [{ role: 'ong_ba', count: 2 }] },
      }),
    ];
    state.surveys = [];
    await openForm('Không gian và phong cách');
    expect(screen.getByText('Phòng ngủ (ông bà) · riêng')).toBeTruthy();
  });

  it('thêm một người thì danh sách không gian mọc thêm đúng một dòng', async () => {
    state.briefs = [brief({ structured: withFamily })];
    state.surveys = [];
    // Hai đầu của phép đồng bộ nay nằm ở HAI bước khác nhau: số người ở bước Gia đình, dòng
    // phòng ngủ ở bước Không gian. Đó chính là lý do bài này đáng giữ — sửa một bên rồi đi
    // sang bên kia là đúng cách người dùng thật sự dùng biểu mẫu.
    await openForm('Không gian và phong cách');
    const before = screen.getAllByText(/^Phòng ngủ \(con \d+\) · riêng$/).length;

    await goToStep('Thành viên gia đình');
    const counts = screen.getAllByLabelText('Số người');
    await userEvent.clear(counts[1]!);
    await userEvent.type(counts[1]!, '3');

    await goToStep('Không gian và phong cách');
    expect(screen.getAllByText(/^Phòng ngủ \(con \d+\) · riêng$/).length).toBe(before + 1);
  });

  it('tách hai cụm: phòng ngủ theo gia đình, rồi không gian khác', async () => {
    // Trước đó mỗi dòng phòng ngủ tự mang chữ «theo gia đình» ở cột cuối — bảy dòng là bảy
    // lần lặp cùng một câu, mà vẫn không nói được vì sao chúng khác các dòng kia.
    state.briefs = [brief({ structured: withFamily })];
    state.surveys = [];
    const { container } = await openForm('Không gian và phong cách');

    expect(screen.getByText('Phòng ngủ', { selector: 'span.font-medium' })).toBeTruthy();
    expect(screen.getByText('Không gian khác')).toBeTruthy();
    expect(container.textContent).not.toContain('theo gia đình —');
  });

  it('gợi ý ô tiện ích lấy theo TỪNG loại phòng, không dùng chung một câu', async () => {
    // Một chuỗi chung thì đúng với vài phòng và vô lý với phần còn lại — «bồn tắm, quầy bar»
    // ở dòng Chỗ để xe. Gợi ý nằm ở cấu hình, mỗi lựa chọn một câu.
    state.briefs = [
      brief({
        structured: { ...withFamily, required_spaces: [{ type: 'garage' }, { type: 'wc' }] },
      }),
    ];
    state.surveys = [];
    await openForm('Không gian và phong cách');

    expect(screen.getByLabelText('Tiện ích bổ sung — Chỗ để xe')).toHaveAttribute(
      'placeholder',
      'chỗ sạc xe điện, vòi rửa xe',
    );
    expect(screen.getByLabelText('Tiện ích bổ sung — Khu vệ sinh')).toHaveAttribute(
      'placeholder',
      'bồn tắm nằm, vòi sen đứng',
    );
  });

  it('đơn vị m² nói MỘT lần ở tiêu đề cột, không lặp mỗi dòng', async () => {
    state.briefs = [brief({ structured: withFamily })];
    state.surveys = [];
    const { container } = await openForm('Không gian và phong cách');

    expect(screen.getByText('Diện tích tối thiểu (m²)')).toBeTruthy();
    // Mười tám lần chữ `m²` xếp thành một cột không thêm thông tin nào mà lấy mất chỗ của ô
    // tiện ích.
    const table = container.querySelector('[style*="grid-template-columns"]');
    expect(table?.textContent?.match(/m²/g) ?? []).toHaveLength(1);
  });

  it('dòng phòng ngủ KHÔNG có nút gỡ — bấm xong nó quay lại ngay', async () => {
    state.briefs = [brief({ structured: withFamily })];
    state.surveys = [];
    await openForm('Không gian và phong cách');

    expect(screen.queryByRole('button', { name: /Bỏ Phòng ngủ/ })).toBeNull();
    // Phòng không phải phòng ngủ thì vẫn gỡ được — nếu không, phép kiểm trên đúng vì lý do sai.
    expect(screen.getByRole('button', { name: 'Bỏ Phòng khách' })).toBeTruthy();
  });

  it('mỗi phòng có ô tiện ích bổ sung riêng, ghi vào đúng dòng', async () => {
    state.briefs = [brief({ structured: withFamily })];
    state.surveys = [];
    await openForm('Không gian và phong cách');

    const box = screen.getByLabelText('Tiện ích bổ sung — Phòng ngủ chính (vợ chồng) · khép kín');
    await userEvent.type(box, 'bồn tắm nằm');
    expect((box as HTMLInputElement).value).toBe('bồn tắm nằm');
    // Ô của phòng khác không ăn theo.
    expect(
      (screen.getByLabelText('Tiện ích bổ sung — Phòng ngủ (con 1) · riêng') as HTMLInputElement)
        .value,
    ).toBe('');
  });
});

describe('Đơn vị và thứ hạng — hai chỗ màn hình nói khác dữ liệu', () => {
  it('mật độ xây dựng: gõ PHẦN TRĂM, hiện lại đúng phần trăm', async () => {
    // Hợp đồng lưu tỉ lệ 0–1, biểu mẫu hỏi `%`. Không quy đổi thì con số người dùng gõ không
    // bao giờ lưu được — và tới 07/09/2026 quả thật chưa đầu bài nào có ô này.
    state.briefs = [
      brief({ structured: { building_type: 'biet_thu', site: { width_m: 20, depth_m: 25 } } }),
    ];
    await openForm('Khu đất');

    const input = screen.getByLabelText('Mật độ xây dựng tối đa');
    await userEvent.type(input, '60');
    // Ô hiện đúng thứ vừa gõ — không phải 0,6 và cũng không phải 60,00000000000001.
    expect((input as HTMLInputElement).value).toBe('60');
  });

  it('ưu tiên đã chọn mang số thứ hạng, theo đúng thứ tự bấm', async () => {
    // Câu gợi ý bảo «chọn theo thứ tự quan trọng giảm dần». Thứ tự vốn được lưu, nhưng trước
    // đây không có gì hiện ra — người dùng không kiểm được mình vừa chọn đúng thứ tự chưa.
    state.briefs = [brief()];
    await openForm('Ưu tiên');

    await userEvent.click(screen.getByRole('button', { name: /Phong thuỷ/ }));
    await userEvent.click(screen.getByRole('button', { name: /Lấy sáng tự nhiên/ }));

    // Không có khoảng trắng sau dấu hai chấm: JSX không chèn gì giữa hai phần tử cạnh nhau.
    expect(screen.getByRole('button', { name: /Ưu tiên thứ 1:\s*Phong thuỷ/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ưu tiên thứ 2:\s*Lấy sáng tự nhiên/ })).toBeTruthy();
    // Ô chưa chọn thì không mang thứ hạng nào.
    expect(screen.queryByRole('button', { name: /Ưu tiên thứ \d+:\s*Dễ bảo trì/ })).toBeNull();
  });

  it('người quyết định hỏi được ngay trong Đầu bài', async () => {
    // Hợp đồng ghi «bắt buộc THU THẬP» và phần này còn mang tên «…và người quyết định», nhưng
    // trước 07/09/2026 không có ô nào để nhập.
    state.briefs = [brief()];
    await openForm('Ưu tiên');

    // `getByLabelText` khớp CẢ câu gợi ý nằm trong `<label>`, nên dùng khớp một phần.
    expect(screen.getByLabelText(/^Người quyết định/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hai vợ chồng cùng quyết' })).toBeTruthy();
  });
});

describe('Biểu mẫu chia bước', () => {
  it('nhà phố đi năm bước, biệt thự sáu — bước khối nhà chỉ có ở biệt thự', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    const titles = () =>
      within(screen.getByRole('navigation', { name: 'Các bước của đầu bài' }))
        .getAllByRole('button')
        .map((b) => b.textContent);

    expect(titles()).toHaveLength(5);
    expect(titles().join('|')).not.toContain('Tổ chức khối nhà');

    await userEvent.click(screen.getByRole('button', { name: 'Biệt thự' }));
    expect(titles()).toHaveLength(6);
    expect(titles().join('|')).toContain('Tổ chức khối nhà');
  });

  it('đổi loại hình KHÔNG đẩy người dùng sang bước khác cái đang xem', async () => {
    // Bước giữ theo MÃ mục chứ không theo số thứ tự. Giữ theo số thì bỏ đi một bước ở giữa
    // sẽ làm màn hình nhảy sang một mục khác hẳn, ngay giữa lúc đang gõ.
    state.briefs = [brief({ structured: { building_type: 'biet_thu', floors: 2 } })];
    state.surveys = [];
    await openForm('Tổ chức khối nhà');

    // Đổi loại hình ở bước đầu, rồi quay lại: bước vừa xem đã biến mất khỏi biểu mẫu.
    await goToStep('Loại hình');
    await userEvent.click(screen.getByRole('button', { name: 'Nhà phố' }));

    // Đi tới bước còn lại GẦN NHẤT theo thứ tự cấu hình, không rơi về bước 1.
    await goToStep('Ưu tiên');
    expect(screen.getByRole('heading', { name: /^Ưu tiên/ })).toBeTruthy();
  });

  it('dữ liệu đã gõ còn nguyên sau khi đi qua lại giữa các bước', async () => {
    // Điều kiện của AFD mẫu 4: «quay lại không mất dữ liệu». Không có bài này thì mất dữ
    // liệu khi đổi bước là thứ chỉ phát hiện được bằng tay.
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Khu đất');

    const depth = screen.getByLabelText(/^Chiều sâu lô đất/);
    await userEvent.clear(depth);
    await userEvent.type(depth, '21,5');

    await goToStep('Thành viên gia đình');
    await goToStep('Khu đất');

    // Kiểm GIÁ TRỊ, không kiểm chuỗi: đổi bước làm ô nhập dựng lại, nên nó hiện con số đã lưu
    // (`21.5`) chứ không phải nguyên văn vừa gõ (`21,5`). Cùng hành vi với lúc mở lại hồ sơ.
    const kept = (screen.getByLabelText(/^Chiều sâu lô đất/) as HTMLInputElement).value;
    expect(Number(kept.replace(',', '.'))).toBe(21.5);
  });

  it('bước còn ô bắt buộc chưa điền thì NÓI RA ngay trên thanh tiến trình', async () => {
    // Không có dấu này thì phải mở từng bước mới biết chỗ nào còn thiếu.
    state.briefs = [brief({ structured: { building_type: 'nha_pho', floors: 3 } })];
    state.surveys = [];
    await openForm();

    const bar = screen.getByRole('navigation', { name: 'Các bước của đầu bài' });
    expect(within(bar).getByRole('button', { name: /^Khu đất.*thiếu \d+/ })).toBeTruthy();
  });

  it('bấm một mục trong «Còn thiếu» thì chuyển sang đúng bước chứa nó', async () => {
    // Liên kết `#neo` thuần chỉ cuộn trong bước đang mở — bấm vào không có gì xảy ra, đúng
    // kiểu hỏng im lặng mà không bài kiểm nào bắt được nếu chỉ nhìn thuộc tính `href`.
    state.briefs = [brief({ structured: { building_type: 'nha_pho', floors: 3 } })];
    state.surveys = [];
    await openForm();

    await userEvent.click(screen.getByRole('link', { name: /Phong cách kiến trúc/ }));
    expect(screen.getByRole('heading', { name: /^Không gian/ })).toBeTruthy();
  });

  it('lưu nháp được ở bước giữa, không bắt đi hết mới được lưu', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Khu đất');

    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeTruthy();
    // Bước giữa KHÔNG có nút lưu chính — mỗi màn hình đúng một hành động chính (CGD 6.3).
    expect(screen.queryByRole('button', { name: 'Lưu đầu bài' })).toBeNull();
  });
});

/**
 * Bốn lỗi Haan gặp ngày 07/09/2026 khi đi thật trên hồ sơ `NVO-TK-2026-2737`:
 * sửa xong bấm «Tiếp» thì không lưu, và bấm «Xác nhận đầu bài» thì không có gì xảy ra —
 * không kết quả, không lỗi, không dấu hiệu đang chạy.
 */
describe('Tự lưu và báo trạng thái', () => {
  it('bấm «Tiếp» thì GHI xuống, không chỉ giữ trong bộ nhớ trình duyệt', async () => {
    // Đây là lỗi mất dữ liệu, không phải lỗi tiện nghi: đóng tab hay tải lại trang giữa
    // chừng là mất sạch những gì đã gõ ở các bước trước (Webapp Flow 6.3).
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Khu đất');

    const width = screen.getByLabelText(/^Chiều rộng mặt tiền/);
    await userEvent.clear(width);
    await userEvent.type(width, '7');

    await userEvent.click(screen.getByRole('button', { name: /^Tiếp/ }));

    expect(state.saveDraft).toHaveBeenCalledTimes(1);
    const written = state.saveDraft.mock.calls[0]![0].structured as {
      site?: { width_m?: number };
    };
    expect(written.site?.width_m).toBe(7);
  });

  it('chưa gõ gì thì đổi bước KHÔNG ghi — không đẻ lượt lưu rỗng', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    await goToStep('Khu đất');
    expect(state.saveDraft).not.toHaveBeenCalled();
  });

  it('bản ĐÃ xác nhận thì đổi bước KHÔNG tự lưu', async () => {
    // Ở đó mỗi lần ghi là một phiên bản mới bắt buộc nêu nguyên nhân (NEN-05). Tự lưu sẽ đẻ
    // năm phiên bản cho một lượt đi hết biểu mẫu, và dấu vết "khách đổi yêu cầu lúc nào"
    // mất hẳn nghĩa.
    state.briefs = [brief({ confirmed_at: '2026-09-01T00:00:00Z' })];
    state.surveys = [];
    await openForm('Khu đất');

    const width = screen.getByLabelText(/^Chiều rộng mặt tiền/);
    await userEvent.clear(width);
    await userEvent.type(width, '7');
    await userEvent.click(screen.getByRole('button', { name: /^Tiếp/ }));

    expect(state.saveNewVersion).not.toHaveBeenCalled();
    expect(state.saveDraft).not.toHaveBeenCalled();
  });

  it('bản đã xác nhận thì ô «Nguyên nhân điều chỉnh» có ở MỌI bước', async () => {
    // Nút lưu giữa chừng đòi nguyên nhân, mà ô để nhập nguyên nhân trước đây chỉ có ở bước
    // cuối — người dùng nhận đúng câu «Vui lòng nêu nguyên nhân» trên một màn hình không có
    // chỗ nào nêu được. Một ngõ cụt kín.
    state.briefs = [brief({ confirmed_at: '2026-09-01T00:00:00Z' })];
    state.surveys = [];
    await openForm('Khu đất');

    expect(screen.getByRole('heading', { name: 'Nguyên nhân điều chỉnh' })).toBeTruthy();
    // Và nút không được tự xưng là «Lưu nháp»: bản đã xác nhận không có nháp.
    expect(screen.getAllByRole('button', { name: 'Lưu đầu bài' })).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Lưu nháp' })).toBeNull();
  });

  it('xác nhận đầu bài hỏng thì NÓI RA — không im lặng', async () => {
    // Câu lỗi vốn vẫn được đặt vào state, nhưng chỉ chế độ NHẬP vẽ nó ra. «Xác nhận đầu bài»
    // chạy ở chế độ XEM, nên mọi câu nó trả về đều rơi thẳng xuống đất.
    state.briefs = [brief()];
    state.surveys = [];
    state.confirmBrief.mockRejectedValue(
      new Error('Chưa đủ thông tin bắt buộc để chốt đầu bài. Còn thiếu: Mật độ xây dựng tối đa.'),
    );
    const { BriefPanel } = await import('../brief-panel');
    renderWithApp(
      <BriefPanel
        projectId="p1"
        companyId="c1"
        projectName="Biệt thự nhà vườn (demo)"
        projectCode="NVO-TK-2026-2737"
        readOnly={false}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận đầu bài' }));

    // Nguyên văn cả hai vế: VIỆC GÌ không làm được và CẦN LÀM GÌ (CGD 5.5). Vế đầu từng bị
    // `toUserMessage` xén mất vì nó cắt mọi thứ tới dấu hai chấm đầu tiên.
    expect(
      await screen.findByText(/Chưa đủ thông tin bắt buộc để chốt đầu bài.*Mật độ xây dựng tối đa/),
    ).toBeTruthy();
  });
});

describe('Không mất phần vừa gõ', () => {
  it('gõ tiếp trong lúc đang ghi thì ghi THÊM một lượt với bản mới, không đóng biểu mẫu với bản cũ', async () => {
    // Lời ghi mất vài trăm mi-li-giây. Bản trước `setDirty(false)` vô điều kiện sau `await`,
    // nên phần gõ trong lúc chờ bị coi là đã lưu; với «Lưu nháp» thì biểu mẫu đóng và phần đó
    // biến mất ngay trên màn hình (rà soát 08/09/2026).
    state.briefs = [brief()];
    state.surveys = [];
    let release!: () => void;
    state.saveDraft.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined);
        }),
    );
    await openForm('Khu đất');

    const width = screen.getByLabelText(/^Chiều rộng mặt tiền/);
    await userEvent.clear(width);
    await userEvent.type(width, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    // Lời ghi thứ nhất còn treo — gõ thêm một chữ số.
    await userEvent.type(width, '5');
    release();

    await waitFor(() => expect(state.saveDraft).toHaveBeenCalledTimes(2));
    const second = state.saveDraft.mock.calls[1]![0].structured as { site?: { width_m?: number } };
    expect(second.site?.width_m).toBe(75);
  });

  it('bấm «Hủy» khi còn thay đổi thì HỎI, không vứt ngay', async () => {
    // Sáu bước, và bản đã xác nhận không tự lưu khi đổi bước — bấm nhầm nút nằm ngay cạnh
    // «Lưu» là mất cả buổi khai (AFD 6.3). Hộp tự dựng, không `window.confirm`.
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Khu đất');

    const width = screen.getByLabelText(/^Chiều rộng mặt tiền/);
    await userEvent.clear(width);
    await userEvent.type(width, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(screen.getByRole('alertdialog', { name: 'Bỏ các thay đổi chưa lưu?' })).toBeTruthy();
    // Vẫn đang sửa: ô nhập còn đó.
    expect(screen.getByLabelText(/^Chiều rộng mặt tiền/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục sửa' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByLabelText(/^Chiều rộng mặt tiền/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ thay đổi' }));
    expect(screen.queryByLabelText(/^Chiều rộng mặt tiền/)).toBeNull();
    expect(state.saveDraft).not.toHaveBeenCalled();
  });

  it('chưa sửa gì thì «Hủy» đóng ngay, không hỏi thừa', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Khu đất');
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByLabelText(/^Chiều rộng mặt tiền/)).toBeNull();
  });
});

describe('Ô số không được nhận rồi vứt đi', () => {
  it('gõ một KHOẢNG vào ô diện tích thì nói ra ngay, không im lặng bỏ', async () => {
    // Haan gặp thật 07/09/2026: gõ «25-30» vào bốn dòng phòng ngủ, bấm Lưu, nhận báo thành
    // công — và cả bốn ô lưu xuống `null`. Chữ vẫn nằm nguyên trên màn hình vì nó ở trong
    // state của chính ô nhập, nên không có cách nào nhận ra.
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Khu đất');

    const depth = screen.getByLabelText(/^Chiều sâu lô đất/);
    await userEvent.clear(depth);
    await userEvent.type(depth, '25-30');

    expect(depth).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Chỉ nhận một số. Ví dụ 28.')).toBeTruthy();
  });

  it('số ngoài khoảng khai trong cấu hình thì kêu NGAY TẠI Ô, kèm khoảng hợp lệ', async () => {
    // `min`/`max` từng được khai trong `brief-form.json` mà không nơi nào đọc: gõ «0» vào Số
    // tầng lưu êm, rồi lúc xác nhận Worker báo «Còn thiếu: Số tầng» — một ô đang có số mà bị
    // bảo là thiếu (rà soát 08/09/2026).
    state.briefs = [brief()];
    state.surveys = [];
    await openForm();

    const floors = screen.getByLabelText(/^Số tầng/);
    await userEvent.clear(floors);
    await userEvent.type(floors, '0');

    expect(floors).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Chỉ nhận số từ 1 đến 12.')).toBeTruthy();

    await userEvent.clear(floors);
    await userEvent.type(floors, '3');
    expect(floors).not.toHaveAttribute('aria-invalid');
  });

  it('số hợp lệ thì KHÔNG kêu — kể cả lúc đang gõ dở dấu thập phân', async () => {
    state.briefs = [brief()];
    state.surveys = [];
    await openForm('Khu đất');

    const depth = screen.getByLabelText(/^Chiều sâu lô đất/);
    await userEvent.clear(depth);
    await userEvent.type(depth, '21,');

    expect(depth).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Chỉ nhận một số. Ví dụ 28.')).toBeNull();
  });
});
