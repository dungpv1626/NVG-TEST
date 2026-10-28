/**
 * «Gửi qua Zalo» (0238): máy tính chép lời nhắn + mở zalo.me; điện thoại gọi bảng chia sẻ kèm tệp; không quyền
 * thì không có nút. Mỗi lần mở Zalo ghi một dòng lịch sử — màn hình nói «đã mở Zalo», không nói «đã gửi».
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithApp } from '@/test/render';
import { ZaloSend } from '../zalo-send';

const inserted: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'eq', 'limit']) builder[m] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  builder.insert = (row: Record<string, unknown>) => {
    inserted.push(row);
    return Promise.resolve({ error: null });
  };
  return { supabase: { from: () => builder } };
});

function setPointer(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: coarse && q.includes('coarse'), media: q })),
  );
}

beforeEach(() => {
  inserted.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ZaloSend', () => {
  it('không có quyền thì không hiện nút', () => {
    renderWithApp(
      <ZaloSend
        canSend={false}
        entityType="quotes"
        entityId="q-1"
        phone="0912345678"
        message="x"
      />,
    );
    expect(screen.queryByRole('button', { name: /Zalo/ })).toBeNull();
  });

  it('máy tính: chép lời nhắn, mở zalo.me đúng số ở tab mới, ghi lịch sử', async () => {
    setPointer(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    renderWithApp(
      <ZaloSend
        canSend
        entityType="contract_signed_scan"
        entityId="hd-1"
        shareLinkId="link-1"
        phone="+84 912 345 678"
        message="Kính gửi Quý khách"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Gửi qua Zalo/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở Zalo' }));

    expect(open).toHaveBeenCalledWith(
      'https://zalo.me/0912345678',
      '_blank',
      'noopener,noreferrer',
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Kính gửi Quý khách'));
    expect(await screen.findByText(/Đã mở Zalo để gửi ở tab mới/)).toBeInTheDocument();
    expect(screen.queryByText(/^Đã gửi/)).toBeNull();
    expect(inserted).toEqual([
      expect.objectContaining({
        entity_type: 'contract_signed_scan',
        entity_id: 'hd-1',
        channel: 'zalo',
        via: 'zalo_web',
        recipient: '0912345678',
        share_link_id: 'link-1',
      }),
    ]);
  });

  it('máy tính: chép bị chặn thì hiện ô chữ để chép tay', async () => {
    setPointer(false);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    renderWithApp(
      <ZaloSend canSend entityType="quotes" entityId="q-1" phone={null} message="Lời nhắn thử" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Gửi qua Zalo/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở Zalo' }));
    expect(await screen.findByText(/Chưa chép được tự động/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lời nhắn thử')).toHaveAttribute('readonly');
  });

  it('điện thoại: gọi bảng chia sẻ kèm tệp và lời nhắn', async () => {
    setPointer(true);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });

    renderWithApp(
      <ZaloSend
        canSend
        entityType="contracts"
        entityId="hd-2"
        phone="0912345678"
        message="Gửi văn bản"
        file={{ name: 'hop-dong.docx', load: () => Promise.resolve(new Blob(['PK'])) }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Gửi qua Zalo/ }));
    const btn = await screen.findByRole('button', { name: 'Chia sẻ' });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0]![0] as ShareData;
    expect(data.text).toBe('Gửi văn bản');
    expect(data.files?.[0]?.name).toBe('hop-dong.docx');
    await waitFor(() =>
      expect(inserted).toEqual([
        expect.objectContaining({ via: 'bang_chia_se', file_name: 'hop-dong.docx' }),
      ]),
    );
  });
});
