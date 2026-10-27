/**
 * «Điểm danh tổ đội» (0232, câu 6): nhanh là tiêu chí — cả tổ mặc định «Cả ngày», chỉ bấm người khác rồi lưu một lần.
 * Tháng đã gửi thì khoá; chỉ người được xác nhận (Trưởng phòng Thi công) thấy «Xác nhận / Trả lại».
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const saved: unknown[] = [];
let sheets: unknown[] = [];
let months: unknown[] = [];
let canConfirm = false;

vi.mock('@/hooks/use-construction-sites', () => ({
  useSubcontractors: () => ({ data: [{ id: 'to-1', name: 'Tổ nề anh Lâm' }] }),
}));
vi.mock('@/hooks/use-crew-attendance', async (original) => {
  const actual = await original<typeof import('@/hooks/use-crew-attendance')>();
  const mutation = (onCall?: (v: unknown) => void) => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(async (v: unknown) => onCall?.(v)),
  });
  return {
    ...actual,
    useCrewMembers: () => ({
      data: [
        {
          id: 'm1',
          subcontractor_id: 'to-1',
          full_name: 'Nguyễn Văn Lâm',
          phone: null,
          is_active: true,
        },
        {
          id: 'm2',
          subcontractor_id: 'to-1',
          full_name: 'Trần Văn Bảy',
          phone: null,
          is_active: true,
        },
      ],
    }),
    useCrewSheets: () => ({ data: sheets }),
    useCrewMonth: () => ({ data: { months, summary: [] } }),
    useCanConfirmCrewMonth: () => ({ data: canConfirm }),
    useCreateCrewSheet: () => mutation(),
    useSaveCrewAttendance: () => mutation((v) => saved.push(v)),
    useAddCrewMember: () => mutation(),
    useSubmitCrewMonth: () => mutation(),
    useDecideCrewMonth: () => mutation(),
    useSetSiteLocation: () => mutation(),
  };
});

const { CrewAttendancePanel } = await import('../crew-attendance-panel');

const site = { id: 'ct-1', code: 'NVC-CT-1', name: 'Nhà xưởng', latitude: null, longitude: null };
const sheet = {
  id: 'sh-1',
  subcontractor_id: 'to-1',
  work_date: '2026-10-27',
  photo_path: 'ct-1/diem-danh-to/a.jpg',
  location_flag: 'ngoai_ban_kinh',
  distance_m: 2200,
  attendance: [],
};

describe('CrewAttendancePanel', () => {
  beforeEach(() => {
    saved.length = 0;
    sheets = [];
    months = [];
    canConfirm = false;
  });

  it('chưa điểm danh: mời chụp ảnh tổ; nói rõ công trình chưa ghi vị trí', () => {
    renderWithApp(<CrewAttendancePanel site={site} readOnly={false} />);
    expect(screen.getByRole('button', { name: /Chụp ảnh tổ và điểm danh/ })).toBeInTheDocument();
    expect(screen.getByText(/Công trình chưa ghi vị trí/)).toBeInTheDocument();
  });

  it('đã có phiếu: mặc định «Cả ngày», bấm «Vắng» một người rồi lưu; cảnh báo xa công trình', async () => {
    sheets = [sheet];
    renderWithApp(<CrewAttendancePanel site={site} readOnly={false} />);
    expect(screen.getByText(/Cách công trình 2,2 km — kiểm lại/)).toBeInTheDocument();
    const bay = screen.getByRole('radiogroup', { name: 'Điểm danh Trần Văn Bảy' });
    await userEvent.click(bay.querySelector('[role="radio"]:last-child')!);
    await userEvent.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));
    expect(saved[0]).toEqual({
      sheetId: 'sh-1',
      rows: [
        { crewMemberId: 'm1', status: 'ca_ngay', overtime: 0 },
        { crewMemberId: 'm2', status: 'vang', overtime: 0 },
      ],
    });
  });

  it('tháng đã gửi: khoá điểm danh; người xác nhận thấy «Xác nhận / Trả lại», chỉ huy trưởng thì không', () => {
    sheets = [sheet];
    months = [{ subcontractor_id: 'to-1', status: 'da_gui', returned_reason: null }];
    const { unmount } = renderWithApp(<CrewAttendancePanel site={site} readOnly={false} />);
    expect(screen.queryByRole('button', { name: 'Lưu điểm danh' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument();
    unmount();
    canConfirm = true;
    renderWithApp(<CrewAttendancePanel site={site} readOnly={false} />);
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trả lại' })).toBeInTheDocument();
  });
});
