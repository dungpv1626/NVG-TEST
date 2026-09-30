/**
 * Điểm danh bằng ảnh tại công trường (0139) — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Canh:
 *  1. Câu «chưa liên kết với bảng chấm công» LUÔN hiện — kể cả khi chỉ xem, kể cả khi đã có
 *     điểm danh. Haan 30/09/2026: người dùng phải được cảnh báo rõ mỗi lần dùng.
 *  2. Chỉ xem (công trình đóng / không có quyền ghi) thì không có nút chụp.
 *  3. Dải chữ in lên ảnh có đủ giờ, ngày có thứ, công trình, người, tình trạng vị trí.
 *  4. Giờ điện thoại lệch giờ máy chủ quá ngưỡng thì danh sách nói rõ cả hai giờ.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithApp } from '@/test/render';
import { checkInStampText, CLOCK_SKEW_WARN_MINUTES } from '@/lib/check-in-stamp';
import { CHECK_IN_NOT_TIMESHEET, SiteCheckInPanel, clockSkewMinutes } from '../site-check-in-panel';

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', fullName: 'Đỗ Văn K' } }),
  useCan: () => true,
}));
vi.mock('@/hooks/use-site-check-ins', () => ({
  useSiteCheckIns: () => ({ data: state.rows, isLoading: false }),
  useCreateSiteCheckIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-site-photos', () => ({
  useSignedPhotoUrls: () => ({ data: {} }),
}));

function render(readOnly = false) {
  return renderWithApp(
    <SiteCheckInPanel
      siteId="s1"
      siteCode="NVC-CT-2026-0001"
      siteName="Nhà xưởng A"
      readOnly={readOnly}
    />,
  );
}

describe('Điểm danh bằng ảnh', () => {
  it('luôn cảnh báo chưa liên kết bảng chấm công, và có nút chụp khi được ghi', () => {
    state.rows = [];
    render();
    expect(screen.getByRole('note')).toHaveTextContent(CHECK_IN_NOT_TIMESHEET);
    expect(CHECK_IN_NOT_TIMESHEET).toContain('chưa liên kết với bảng chấm công');
    expect(screen.getByRole('button', { name: /Chụp ảnh điểm danh/ })).toBeInTheDocument();
  });

  it('chỉ xem thì vẫn cảnh báo nhưng không có nút chụp', () => {
    state.rows = [];
    render(true);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chụp ảnh điểm danh/ })).toBeNull();
  });

  it('danh sách hiện người, giờ máy chủ và nói rõ khi không có vị trí', () => {
    state.rows = [
      {
        id: 'c1',
        user_id: 'u1',
        checked_in_at: '2026-09-30T00:29:00Z',
        client_created_at: '2026-09-30T00:29:00Z',
        photo_path: 's1/diem-danh/a.jpg',
        location_status: 'khong_cho_phep',
        latitude: null,
        longitude: null,
        accuracy_m: null,
        note: null,
        person: { full_name: 'Đỗ Văn K' },
      },
    ];
    render();
    expect(screen.getByText('07:29 · Đỗ Văn K')).toBeInTheDocument();
    expect(screen.getByText(/điện thoại không cho phép lấy vị trí/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('dải chữ trên ảnh: giờ, thứ ngày, công trình, người, vị trí', () => {
    const text = checkInStampText({
      at: new Date('2026-09-30T07:29:00Z'),
      siteCode: 'NVC-CT-2026-0001',
      siteName: 'Nhà xưởng A',
      personName: 'Đỗ Văn K',
      location: { status: 'co_vi_tri', latitude: 20.41234567, longitude: 106.4, accuracy: 24.6 },
    });
    expect(text.badge).toBe('Điểm danh');
    expect(text.time).toBe('14:29');
    expect(text.lines).toEqual([
      'Thứ Tư, 30/09/2026',
      'NVC-CT-2026-0001 — Nhà xưởng A',
      'Đỗ Văn K',
      'Vị trí 20.41235, 106.40000 (sai số ~25 m)',
    ]);
  });

  it('giờ điện thoại lệch giờ máy chủ quá ngưỡng thì được tính ra', () => {
    const skew = clockSkewMinutes({
      checked_in_at: '2026-09-30T08:00:00Z',
      client_created_at: '2026-09-30T07:00:00Z',
    });
    expect(skew).toBe(60);
    expect(skew).toBeGreaterThan(CLOCK_SKEW_WARN_MINUTES);
  });
});
