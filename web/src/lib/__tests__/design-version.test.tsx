/**
 * Phát hiện lệch phiên bản hợp đồng giữa giao diện và dịch vụ thiết kế.
 *
 * Vì sao cần canh: ngày 21/09/2026 bản công khai chạy giao diện dựng 20/09 với `nvg-api` tải
 * lên 19/09. Artifact `ai_facade_concept` do bản mã mới ghi ra không đọc được bằng lược đồ cũ,
 * và cả tab «AI Design» chỉ hiện một câu lỗi kiểm kiểu bằng tiếng Anh kèm nút «Thử lại» không
 * bao giờ thoát được. Không mã nào ở hai phía nhìn thấy được tình huống đó — nên phải đo.
 *
 * Những tính chất được canh ở đây đều hỏng lặng lẽ nếu sai:
 *  · thiếu header (phản hồi từ bộ đệm, proxy lược header) KHÔNG được coi là lệch;
 *  · lệch thì câu lỗi phải là câu nói về PHIÊN BẢN, không phải câu của Worker;
 *  · khớp thì câu của Worker phải đi nguyên vẹn lên màn hình — cảnh báo sai chỗ còn tệ hơn
 *    không cảnh báo, vì nó dạy người dùng bỏ qua;
 *  · dải báo phải hiện ngay ở vỏ màn hình, không nằm trong một bước cụ thể.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { CONTRACTS_FINGERPRINT } from '@nvg/shared/design';
import { renderWithApp } from '@/test/render';
import { DesignWorkspace } from '@/pages/tk/design-workspace';
import { designApi } from '../design-api';
import {
  noteContractsHeader,
  resetDesignVersionSkew,
  VERSION_SKEW_MESSAGE,
} from '../design-version';

/** Phiên đăng nhập giả — `designApi` dừng trước khi gọi mạng nếu không có thẻ. */
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'the-test' } } }) },
  },
}));

afterEach(() => {
  // Gỡ component TRƯỚC khi đặt lại kho: `resetDesignVersionSkew` báo cho mọi người đang nghe,
  // mà một lần dựng lại React ngoài `act` là một cảnh báo lẫn vào kết quả kiểm.
  cleanup();
  act(() => {
    resetDesignVersionSkew();
  });
  vi.unstubAllGlobals();
});

function workspace() {
  return renderWithApp(
    <DesignWorkspace
      breadcrumbs={[{ label: 'Thiết kế' }]}
      title="Biệt thự nhà vườn"
      code="NVO-TK-2026-2737"
      status="in_progress"
      meta={[]}
      primaryTabIds={['tong-quan']}
      tabs={[{ id: 'tong-quan', label: 'Tổng quan', content: <p>Bảng tổng quan</p> }]}
    />,
    { route: '/tk/du-an/p' },
  );
}

describe('Dấu vân tay hợp đồng', () => {
  it('cùng dấu vân tay thì không có gì xảy ra', () => {
    expect(noteContractsHeader(CONTRACTS_FINGERPRINT)).toBe(false);
    workspace();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('thiếu header KHÔNG phải là lệch', () => {
    expect(noteContractsHeader(null)).toBe(false);
    workspace();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lệch dấu vân tay thì vỏ màn hình hiện dải báo kèm cả hai mã', () => {
    expect(noteContractsHeader('0badc0ffee11')).toBe(true);
    workspace();
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(VERSION_SKEW_MESSAGE);
    expect(notice).toHaveTextContent('0badc0ffee11');
    expect(notice).toHaveTextContent(CONTRACTS_FINGERPRINT);
  });

  it('lời gọi hỏng kèm dấu vân tay lệch nói về PHIÊN BẢN, không lặp lại câu của Worker', async () => {
    // Đúng cảnh ngày 21/09/2026: Worker cũ đọc artifact viết theo hợp đồng mới, trả 422 kèm
    // câu nói về dữ liệu. Câu ấy đúng chữ nhưng dẫn người đọc đi sửa dữ liệu, trong khi dữ
    // liệu không sai — chỉ giao diện mới biết thêm điều Worker không biết: bản nó đang chạy.
    stubFetch(
      new Response(JSON.stringify({ error: 'Dữ liệu không đúng hợp đồng "ai_facade_concept".' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json', 'X-NVG-Contracts': '0badc0ffee11' },
      }),
    );
    await expect(designApi('/design/ai/facade/p')).rejects.toThrow(VERSION_SKEW_MESSAGE);
  });

  it('lời gọi hỏng với dấu vân tay KHỚP thì giữ nguyên câu của Worker', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: 'Chưa có phương án mặt bằng nào để dựng mặt đứng.' }), {
        status: 409,
        headers: {
          'Content-Type': 'application/json',
          'X-NVG-Contracts': CONTRACTS_FINGERPRINT,
        },
      }),
    );
    await expect(designApi('/design/ai/facade/p')).rejects.toThrow(
      'Chưa có phương án mặt bằng nào để dựng mặt đứng.',
    );
  });
});

function stubFetch(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}
