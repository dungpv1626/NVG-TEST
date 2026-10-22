/**
 * Bước «Bộ kết quả» (Đợt 5B): bấm một nút ra MỘT tệp zip tên theo mã hồ sơ, gồm mọi tệp đã có;
 * ảnh chưa vẽ (404) bỏ qua và ghi vào «Đọc trước»; lỗi khác thì báo, không tải gói thiếu.
 * Không gọi mạng: tuyến tệp giả lập, gói dựng bằng `pizzip` thật.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PizZip from 'pizzip';
import { renderWithApp } from '@/test/render';

const REF = `sha256:${'a'.repeat(64)}`;
const FAC = `sha256:${'f'.repeat(64)}`;

const state = vi.hoisted(() => ({
  fail500: false,
  saved: [] as Array<{ name: string; blob: Blob }>,
}));

vi.mock('@/lib/design-api', () => {
  class DesignApiError extends Error {
    constructor(
      message: string,
      public status?: number,
    ) {
      super(message);
    }
  }
  return {
    DesignApiError,
    designApiFile: vi.fn(async (path: string) => {
      if (path.includes('/sheet-image') || path.includes('/facade/p1/image')) {
        if (state.fail500 && path.includes('/sheet-image'))
          throw new DesignApiError('Kho ảnh lỗi.', 502);
        throw new DesignApiError('Chưa có.', 404);
      }
      const type = path.includes('/dxf') ? 'application/dxf' : 'image/svg+xml';
      return new Response(`tệp ${path}`, { headers: { 'Content-Type': type } });
    }),
  };
});

vi.mock('@/hooks/use-ai-design', () => ({
  useAiPlanReview: () => ({
    data: {
      artifactId: REF,
      levels: [
        { level: 1, name: 'Tầng 1', rooms: 3, notes: [], openSpaces: [] },
        { level: 2, name: 'Mái', roof: true, rooms: 0, notes: [], openSpaces: [] },
      ],
      roomLabels: {},
      score: null,
      acceptPercent: 60,
      blocking: [],
    },
    isLoading: false,
    isError: false,
  }),
  useAiImageSet: () => ({ data: undefined }),
}));

const { AiResultBundle } = await import('../ai-result-bundle');

function stubDownload() {
  state.saved = [];
  let last: Blob | null = null;
  // jsdom không có hai hàm này — gắn bản giả.
  URL.createObjectURL = (b: Blob | MediaSource) => {
    last = b as Blob;
    return 'blob:zip';
  };
  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    state.saved.push({ name: this.download, blob: last! });
  });
}

const designState = {
  briefArtifactId: REF,
  program: null,
  plans: [{ artifactId: REF, createdAt: '2026-10-01T00:00:00Z', label: '2' }],
  planHeadArtifactId: REF,
  facadeArtifactId: FAC,
  facades: [{ artifactId: FAC, createdAt: '2026-10-02T00:00:00Z', planRef: REF, label: '1' }],
  facadePlanRef: REF,
  imageSetArtifactId: null,
  runs: {},
  roomLabels: {},
};

describe('Bộ kết quả — tải cả gói', () => {
  it('một tệp zip tên theo mã hồ sơ, đủ tờ vẽ + DXF; ảnh chưa vẽ ghi vào «Đọc trước»', async () => {
    stubDownload();
    state.fail500 = false;
    renderWithApp(
      <AiResultBundle
        projectId="p1"
        projectCode="NVO-TK-2026-0007"
        state={designState as never}
        onGoTo={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Chưa có bộ ảnh phối cảnh dựng trên mặt đứng này.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tải cả gói/ }));
    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect(state.saved[0]!.name).toBe('NVO-TK-2026-0007_AI-Design_phuong-an-2.zip');
    const zip = new PizZip(await state.saved[0]!.blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      'DOC-TRUOC.txt',
      'mat-bang/NVO-TK-2026-0007_phuong-an-2_ca-nha.dxf',
      'mat-bang/NVO-TK-2026-0007_phuong-an-2_mai.svg',
      'mat-bang/NVO-TK-2026-0007_phuong-an-2_tang-1.svg',
      'mat-dung/NVO-TK-2026-0007_mat-dung-1.dxf',
      'mat-dung/NVO-TK-2026-0007_mat-dung-1.svg',
    ]);
    const readme = zip.file('DOC-TRUOC.txt')!.asText();
    expect(readme).toContain('NVO-TK-2026-0007_phuong-an-2_tang-1_noi-that');
    expect(readme).toContain('BẢN PHÁC THAM KHẢO');
    expect(screen.getByText(/2 ảnh chưa vẽ nên không có trong gói/)).toBeInTheDocument();
  });

  it('lỗi khác 404 thì báo và KHÔNG tải gói thiếu', async () => {
    stubDownload();
    state.fail500 = true;
    renderWithApp(
      <AiResultBundle
        projectId="p1"
        projectCode="NVO-TK-2026-0007"
        state={designState as never}
        onGoTo={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Tải cả gói/ }));
    expect(await screen.findByText(/Không tạo được gói tải về/)).toBeInTheDocument();
    expect(state.saved).toHaveLength(0);
  });
});
