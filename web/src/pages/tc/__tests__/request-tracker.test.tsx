/**
 * Theo dõi đề nghị từ công trường (TC-10) — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Canh bốn điều:
 *  1. Chưa khai thời hạn cam kết thì KHÔNG hiện đồng hồ — nói rõ «Chưa có thời hạn cam kết»,
 *     không bịa một con số (CLAUDE.md 5.2).
 *  2. Nút «Thúc» chỉ hiện khi có người ở văn phòng đang giữ — hiện rồi báo lỗi là điều
 *     CLAUDE.md 5.4 cấm.
 *  3. Đang giãn cách thì thay nút bằng câu nói khi nào thúc lại được.
 *  4. Bấm «Thúc» gửi đúng đề nghị và báo lại cho người bấm.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';
import { nudgeAvailability, RequestTrackerList } from '../request-tracker';

const nudge = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ rows: [] as unknown[], canEdit: true }));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'cht-1', fullName: 'Đỗ Văn K' } }),
  useCan: () => state.canEdit,
}));

vi.mock('@/hooks/use-site-requests', () => ({
  useSiteRequestTracker: () => ({ data: state.rows, isLoading: false, error: null }),
  useNudgeRequest: () => ({ mutateAsync: nudge, isPending: false }),
  useRequestReminders: () => ({ data: [], isLoading: false }),
}));

function row(over: Record<string, unknown> = {}) {
  return {
    entity_type: 'purchase_requests',
    entity_id: 'pr-1',
    code: 'NVC-DNM-2026-0007',
    title: 'Thép D16 cho sàn tầng 2',
    site_id: 's1',
    site_code: 'NVC-CT-2026-0001',
    site_name: 'Nhà xưởng Phố Nối A',
    company_id: 'c1',
    requested_by: 'cht-1',
    requested_by_name: 'Đỗ Văn K',
    needed_date: '2099-10-05',
    urgency: 'gap',
    stage: 'cho_duyet',
    is_closed: false,
    holder_kind: 'approver',
    holder_label: 'Giám đốc Tài chính',
    holder_ids: ['cfo-1'],
    holder_names: ['Lương Thị Vân'],
    waiting_since: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    due_at: null,
    promised_date: null,
    last_nudged_at: null,
    nudge_count: 0,
    next_nudge_at: null,
    created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    ...over,
  };
}

function renderList() {
  return renderWithApp(<RequestTrackerList siteId="s1" emptyMessage="Chưa có đề nghị nào." />);
}

describe('Theo dõi đề nghị từ công trường — TC-10', () => {
  beforeEach(() => {
    nudge.mockReset();
    nudge.mockResolvedValue('reminder-1');
    state.rows = [row()];
    state.canEdit = true;
  });

  it('hiện ai đang giữ và đã chờ bao lâu', () => {
    renderList();
    expect(screen.getByText('Giám đốc Tài chính — Lương Thị Vân')).toBeInTheDocument();
    expect(screen.getByText('Chờ 3 ngày')).toBeInTheDocument();
  });

  it('chưa khai thời hạn cam kết thì nói rõ, không hiện đồng hồ', () => {
    renderList();
    expect(screen.getByText('Chưa có thời hạn cam kết')).toBeInTheDocument();
    expect(screen.queryByText(/Còn \d+ ngày|Quá hạn \d+ ngày|Đến hạn hôm nay/)).toBeNull();
  });

  it('đã khai thời hạn thì hiện hạn xử lý', () => {
    state.rows = [row({ due_at: new Date(Date.now() - 86_400_000).toISOString() })];
    renderList();
    expect(screen.getByText('Quá hạn 1 ngày')).toBeInTheDocument();
  });

  it('bấm «Thúc» gửi đúng đề nghị và báo lại', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: /Thúc/ }));
    expect(nudge).toHaveBeenCalledWith({ entityId: 'pr-1' });
    expect(await screen.findByRole('status')).toHaveTextContent('Đã thúc');
  });

  it('đề nghị còn nháp — không có ai ở văn phòng giữ — thì không có nút «Thúc»', () => {
    state.rows = [
      row({ stage: 'nhap', holder_kind: 'requester', holder_label: 'Người gửi đề nghị' }),
    ];
    renderList();
    expect(screen.queryByRole('button', { name: /Thúc/ })).toBeNull();
  });

  it('người không gửi và không được giao công trình thì không thấy nút «Thúc»', () => {
    state.canEdit = false;
    state.rows = [row({ requested_by: 'nguoi-khac' })];
    renderList();
    expect(screen.queryByRole('button', { name: /Thúc/ })).toBeNull();
  });

  it('đang giãn cách thì thay nút bằng giờ thúc lại được', () => {
    state.rows = [
      row({
        nudge_count: 1,
        last_nudged_at: new Date().toISOString(),
        next_nudge_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      }),
    ];
    renderList();
    expect(screen.queryByRole('button', { name: /^Thúc$/ })).toBeNull();
    expect(screen.getByText(/Thúc lại được sau \d{2}:\d{2}/)).toBeInTheDocument();
  });
});

describe('nudgeAvailability', () => {
  const now = new Date('2026-10-01T03:00:00Z');

  it('đề nghị đã đóng thì không hiện', () => {
    expect(
      nudgeAvailability(
        { is_closed: true, holder_kind: 'purchasing', next_nudge_at: null },
        true,
        now,
      ).visible,
    ).toBe(false);
  });

  it('hết giãn cách thì bấm được', () => {
    expect(
      nudgeAvailability(
        { is_closed: false, holder_kind: 'purchasing', next_nudge_at: '2026-10-01T02:00:00Z' },
        true,
        now,
      ),
    ).toEqual({ visible: true, allowed: true, reason: null });
  });
});
