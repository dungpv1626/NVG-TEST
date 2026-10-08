/**
 * Ảnh bìa thẻ AI Design (Haan, 08/10/2026): phối cảnh → mặt bằng có nội thất → tờ mặt bằng thô.
 * Canh: đúng thứ hạng dù ba tấm tải song song, ảnh AI phải có dấu in lên pixel (trên bản thu nhỏ),
 * và ảnh đã dựng được nhớ trong phiên — quay lại danh sách không tải lại.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { AiDesignState } from '../use-ai-design';

const REF = `sha256:${'a'.repeat(64)}`;
const SET = `sha256:${'b'.repeat(64)}`;

/** Đường nào «đã có ảnh» — còn lại trả 404 như máy chủ thật. */
let available: string[] = [];
let stampWorks = true;
const designApiFile = vi.fn(async (path: string) => {
  if (!available.some((part) => path.includes(part))) throw new Error('404');
  return { blob: async () => new Blob([path]) } as unknown as Response;
});

vi.mock('@/lib/design-api', () => ({
  designApiFile: (path: string) => designApiFile(path),
  designApi: vi.fn(),
  DesignApiError: class extends Error {},
}));
const stampWidths: Array<number | undefined> = [];
vi.mock('@/lib/watermark', () => ({
  stampWatermark: async (url: string, _text: string, maxWidth?: number) => {
    stampWidths.push(maxWidth);
    return { url: `${url}#dau`, stamped: stampWorks };
  },
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

let blob = 0;
URL.createObjectURL = vi.fn(() => `blob:${++blob}`);
URL.revokeObjectURL = vi.fn();

const { useAiCoverImage } = await import('../use-ai-design');

const STATE = {
  briefArtifactId: REF,
  plans: [{ artifactId: REF, createdAt: '2026-10-01T00:00:00Z' }],
  planHeadArtifactId: REF,
  facadeArtifactId: REF,
  imageSetArtifactId: SET,
} as AiDesignState;

/** Mỗi phép thử một mã hồ sơ riêng — ảnh bìa được nhớ theo hồ sơ + mã artifact. */
let project = 0;
function cover(state: AiDesignState = STATE, id = `p${++project}`) {
  return renderHook(() => useAiCoverImage(id, state, true));
}

beforeEach(() => {
  designApiFile.mockClear();
  stampWorks = true;
});

describe('Ảnh bìa thẻ AI Design', () => {
  it('có phối cảnh thì lấy phối cảnh, đóng dấu trên bản thu nhỏ', async () => {
    available = ['/perspective/', '/sheet-image', '/sheet?'];
    stampWidths.length = 0;
    const { result } = cover();
    await waitFor(() => expect(result.current.kind).toBe('perspective'));
    expect(result.current.url).toMatch(/#dau$/);
    expect(designApiFile.mock.calls[0]![0]).toContain(`/view/front_day?artifactId=`);
    // Bản xem trước thu nhỏ ở máy chủ, không phải PNG cỡ gốc ~2,7 MB.
    expect(designApiFile.mock.calls[0]![0]).toMatch(/&w=1024$/);
    expect(stampWidths.every((w) => typeof w === 'number' && w > 0)).toBe(true);
  });

  it('có phối cảnh thì CHỈ tải tấm phối cảnh — tấm nội thất ~2 MB không giành băng thông', async () => {
    available = ['/perspective/', '/sheet-image', '/sheet?'];
    const { result } = cover();
    await waitFor(() => expect(result.current.kind).toBe('perspective'));
    expect(designApiFile).toHaveBeenCalledTimes(1);
  });

  it('không có phối cảnh thì hai tấm mặt bằng tải SONG SONG — tấm thô không chờ lượt 404', () => {
    available = ['/sheet?'];
    cover({ ...STATE, imageSetArtifactId: null });
    // Ngay sau lượt dựng đầu tiên, cả hai lời gọi đã đi — trước khi lời gọi nào trả về.
    expect(designApiFile).toHaveBeenCalledTimes(2);
  });

  it('quay lại cùng hồ sơ thì ảnh hiện ngay, không tải lại', async () => {
    available = ['/sheet?'];
    const first = cover(STATE, 'nho');
    await waitFor(() => expect(first.result.current.kind).toBe('plan'));
    first.unmount();
    designApiFile.mockClear();
    const again = cover(STATE, 'nho');
    expect(again.result.current.kind).toBe('plan');
    expect(designApiFile).not.toHaveBeenCalled();
  });

  it('chưa có phối cảnh thì lấy mặt bằng có nội thất', async () => {
    available = ['/sheet-image', '/sheet?'];
    const { result } = cover();
    await waitFor(() => expect(result.current.kind).toBe('furnished_plan'));
    expect(result.current.url).toMatch(/#dau$/);
  });

  it('chỉ có tờ mặt bằng thì lấy tờ ấy', async () => {
    available = ['/sheet?'];
    const { result } = cover();
    await waitFor(() => expect(result.current.kind).toBe('plan'));
    expect(designApiFile.mock.calls.at(-1)![0]).toContain('/sheet?artifactId=');
  });

  it('chưa có bộ ảnh phối cảnh thì không gọi tuyến phối cảnh', async () => {
    available = ['/sheet-image', '/sheet?'];
    const { result } = cover({ ...STATE, imageSetArtifactId: null });
    await waitFor(() => expect(result.current.kind).toBe('furnished_plan'));
    expect(designApiFile).toHaveBeenCalledTimes(2);
    expect(designApiFile.mock.calls.some(([path]) => path.includes('/perspective/'))).toBe(false);
  });

  it('không in được dấu thì bỏ ảnh AI, không hiện ảnh AI trần', async () => {
    available = ['/perspective/', '/sheet-image', '/sheet?'];
    stampWorks = false;
    const { result } = cover();
    await waitFor(() => expect(result.current.kind).toBe('plan'));
    expect(result.current.url).not.toMatch(/#dau$/);
  });

  it('chưa có gì thì không có ảnh', async () => {
    available = [];
    const { result } = cover();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.url).toBeNull();
  });
});
