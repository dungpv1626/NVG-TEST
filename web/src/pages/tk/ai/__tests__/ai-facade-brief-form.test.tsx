/**
 * Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2) — dựng trong bộ nhớ, không gọi mạng.
 *
 * Canh những lời hứa của phiếu:
 *  · mọi ô chọn có «Để AI đề xuất» làm mặc định — để trống là một lựa chọn, không phải thiếu sót;
 *  · bề rộng cửa CHỈ ĐỌC, lấy từ mặt bằng (Haan chốt 19/09/2026);
 *  · màu kèm tên và mã hex bằng chữ (CGD 6.8);
 *  · lưu gửi đúng MÃ danh mục; nháp đang gõ không mất khi màn hình dựng lại (CLAUDE.md 5.4).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiFacadeBrief } from '@nvg/shared/design';
import { renderWithApp } from '@/test/render';

const PLAN = `sha256:${'a'.repeat(64)}`;

const state = vi.hoisted(() => ({
  saved: null as unknown,
  save: vi.fn((_input: unknown) => Promise.resolve({ artifactId: 'sha256:x' })),
}));

import { DesignApiError } from '@/lib/design-api';

const option = (code: string, label: string) => ({ code, label });

vi.mock('@/hooks/use-ai-design', () => ({
  useFacadeVocabulary: () => ({
    isLoading: false,
    error: null,
    data: {
      roofTypes: [option('flat', 'Mái bằng'), option('japanese', 'Mái Nhật')],
      roofMaterials: [option('ngoi_phang', 'Ngói phẳng')],
      materials: [option('son_nuoc', 'Sơn nước ngoại thất')],
      colours: [
        { code: 'ghi_bac', label: 'Ghi bạc', hex: '#A7ABAE' },
        { code: 'den', label: 'Đen', hex: '#1F2022' },
      ],
      railings: [option('kinh_cuong_luc', 'Lan can kính cường lực')],
      doorMaterials: [option('nhom_kinh_he', 'Nhôm kính hệ (Xingfa…)')],
      doorTypes: [option('bon_canh', '4 cánh (2 cố định, 2 mở)')],
      glassTypes: [option('trong', 'Kính trong')],
      garageDoorTypes: [option('cuon', 'Cửa cuốn')],
      fenceTypes: [option('xay_dac', 'Xây đặc')],
      gateTypes: [option('sliding', 'Cổng trượt')],
      elements: [option('canopy', 'Ô văng'), option('planter', 'Bồn cây')],
      defaults: { groundRaiseCm: 45, parapetCm: 110, doorHeightCm: 250, railingHCm: 110 },
    },
  }),
  useFacadeBrief: () => ({ isLoading: false, error: null, data: state.saved }),
  useSaveFacadeBrief: () => ({ mutateAsync: state.save, isPending: false }),
}));

const { FacadeBriefForm, useFacadeBriefController } = await import('../ai-facade-brief-form');

function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const controller = useFacadeBriefController('p1');
  return <FacadeBriefForm controller={controller} readOnly={readOnly} />;
}

function savedState(over: Record<string, unknown> = {}) {
  return {
    artifactId: null,
    savedAt: null,
    brief: null,
    plan: {
      artifactId: PLAN,
      mainDoorW: 165,
      sideDoorWs: [180],
      garageW: 200,
      frontYard: true,
      balconies: 1,
    },
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  state.save.mockClear();
  state.saved = savedState();
});

describe('Phiếu yêu cầu mặt đứng', () => {
  it('mọi ô chọn mặc định «Để AI đề xuất»; phiếu chưa điền nói rõ', async () => {
    renderWithApp(<Harness />);
    expect(await screen.findByText('Chưa điền')).toBeInTheDocument();
    const roof = screen.getByRole('combobox', { name: 'Loại mái' });
    expect(roof).toHaveValue('');
    expect(within(roof).getByRole('option', { name: 'Để AI đề xuất' })).toBeInTheDocument();
    // Ô số: gợi ý giá trị mặc định khi để trống.
    expect(
      screen.getByRole('textbox', { name: 'Cốt sàn tầng 1 cao hơn vỉa hè (cm)' }),
    ).toHaveAttribute('placeholder', 'Để AI đề xuất (mặc định 45)');
  });

  it('bề rộng cửa chỉ đọc, lấy từ mặt bằng, nhắc sửa ở bước 1', () => {
    renderWithApp(<Harness />);
    expect(screen.getByText('1.650 mm. Muốn đổi, sửa ở bước 1.')).toBeInTheDocument();
    expect(screen.getByText('2.000 mm — theo mặt bằng')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Bề rộng/ })).toBeNull();
  });

  it('màu có tên kèm mã hex trong danh sách chọn', () => {
    renderWithApp(<Harness />);
    const colour = screen.getByRole('combobox', { name: 'Màu chính' });
    expect(within(colour).getByRole('option', { name: 'Ghi bạc — #A7ABAE' })).toBeInTheDocument();
  });

  it('chọn rồi lưu: gửi đúng MÃ danh mục, không gửi nhãn', async () => {
    renderWithApp(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Loại mái' }), 'japanese');
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Chiều cao (cm)' })[0]!, '280');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Bồn cây' }));
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Lưu yêu cầu' }));
    const sent = (state.save.mock.calls[0]![0] as { brief: AiFacadeBrief }).brief;
    expect(sent.roof.type).toBe('japanese');
    expect(sent.main_door.h_cm).toBe(280);
    expect(sent.decorations).toEqual(['planter']);
  });

  it('nháp đang gõ còn nguyên khi màn hình dựng lại (rời bước rồi quay lại)', async () => {
    const first = renderWithApp(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Loại mái' }), 'flat');
    first.unmount();

    renderWithApp(<Harness />);
    expect(await screen.findByRole('combobox', { name: 'Loại mái' })).toHaveValue('flat');
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument();
  });

  it('nhà sát ranh mặt tiền: không có nhóm cổng và tường rào, nói lý do', () => {
    state.saved = savedState({
      plan: { ...savedState().plan, frontYard: false, balconies: 0 },
    });
    renderWithApp(<Harness />);
    expect(screen.getByText(/không có sân trước/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Kiểu cổng' })).toBeNull();
  });

  /*
   * Haan 20/09/2026: «chưa thấy khảo sát cho lan can». Nhóm ấy vốn bị ẩn khi phương án mặt bằng
   * chưa có ban công — và ẩn LẶNG LẼ, không một dòng nói vì sao. Nhóm cổng bên cạnh cũng ẩn theo
   * điều kiện nhưng có nói lý do; chỗ này thì không, nên nó đọc như một mục bị thiếu.
   */
  it('mặt bằng chưa có ban công: nhóm lan can VẪN hiện, kèm lý do', () => {
    state.saved = savedState({ plan: { ...savedState().plan, balconies: 0 } });
    renderWithApp(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Kiểu lan can' })).toBeInTheDocument();
    expect(screen.getByText(/chưa có ban công nào ra mặt trước/)).toBeInTheDocument();
  });

  it('ô ghi chú nhắc không ghi danh tính khách — nội dung đi tới nhà cung cấp mô hình', () => {
    renderWithApp(<Harness />);
    expect(screen.getByText(/không ghi tên khách, số điện thoại, địa chỉ/)).toBeInTheDocument();
  });

  /*
   * Haan 20/09/2026: «thêm 1 mục khảo sát cho lan can: vật liệu, chiều cao».
   *
   * Chiều cao lan can là số duy nhất của nhóm Lan can mà thước chấm đo (R1) và nó do chương trình
   * đặt, nên ô này là đường duy nhất để một hồ sơ dùng số khác quy ước cấu tạo.
   */
  it('mục lan can có vật liệu và chiều cao; để trống thì gợi ý số của quy ước cấu tạo', async () => {
    renderWithApp(<Harness />);
    const height = screen.getByRole('textbox', { name: 'Chiều cao lan can (cm)' });
    expect(height).toHaveAttribute('placeholder', expect.stringContaining('110'));

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Vật liệu lan can' }),
      'son_nuoc',
    );
    await userEvent.type(height, '90');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu yêu cầu' }));

    const sent = (state.save.mock.calls[0]![0] as { brief: AiFacadeBrief }).brief;
    expect(sent.balcony.material).toBe('son_nuoc');
    expect(sent.balcony.h_cm).toBe(90);
  });

  /*
   * Lỗi đã xảy ra thật: phiếu bị từ chối với đúng một câu «Phiếu yêu cầu chưa đúng. Kiểm tra lại
   * các ô đã điền» — phiếu có mười bốn mục, câu ấy không dẫn tới đâu. Danh sách mục hỏng do Worker
   * trả về từng bị lớp gọi VỨT BỎ.
   */
  it('lưu hỏng thì hiện ĐÚNG mục nào hỏng, không chỉ một câu chung', async () => {
    state.save.mockRejectedValueOnce(
      new DesignApiError('Phiếu yêu cầu chưa đúng nên chưa lưu được.', 400, [
        'Chi tiết trang trí mong muốn: chọn quá nhiều, tối đa 12 mục.',
      ]),
    );
    renderWithApp(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Loại mái' }), 'flat');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu yêu cầu' }));

    expect(await screen.findByText(/Chi tiết trang trí mong muốn: chọn quá nhiều/)).toBeVisible();
  });
});
