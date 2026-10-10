/**
 * Bản xem trước thu nhỏ của ảnh AI (ảnh bìa thẻ, 08/10/2026). Canh: chỉ nhận độ rộng trong danh
 * sách (mỗi độ rộng là một biến đổi Images tính phí), ETag bản thu nhỏ khác bản gốc, và mọi đường
 * hỏng đều lùi về ảnh gốc chứ không mất ảnh.
 */

import { describe, expect, it, vi } from 'vitest';
import { AI_PREVIEW_WIDTH } from '@nvg/shared/design';
import { imageResponse, previewEtag, readPreviewWidth } from '../ai/image-preview';

/** PNG tối thiểu đủ cho `pngSize` đọc: chữ ký + khối IHDR mang bề ngang/cao. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set(
    [...'IHDR'].map((ch) => ch.charCodeAt(0)),
    12,
  );
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function fakeImages(fail = false) {
  const transform = vi.fn();
  const output = vi.fn();
  const binding = {
    input: () => {
      const handle = {
        transform: (t: unknown) => {
          transform(t);
          return handle;
        },
        output: async (o: unknown) => {
          output(o);
          if (fail) throw new Error('9412');
          return {
            response: (opts?: { headers?: Record<string, string> }) =>
              new Response('nho', {
                headers: { 'Content-Type': 'image/webp', ...(opts?.headers ?? {}) },
              }),
          };
        },
      };
      return handle;
    },
  } as unknown as ImagesBinding;
  return { binding, transform, output };
}

describe('Bản xem trước ảnh AI', () => {
  it('chỉ nhận độ rộng trong danh sách — số tuỳ ý nhân số biến đổi tính phí', () => {
    expect(readPreviewWidth(undefined)).toBeNull();
    expect(readPreviewWidth('')).toBeNull();
    expect(readPreviewWidth(String(AI_PREVIEW_WIDTH))).toBe(AI_PREVIEW_WIDTH);
    expect(readPreviewWidth('777')).toBe('invalid');
    expect(readPreviewWidth('abc')).toBe('invalid');
  });

  it('ETag bản thu nhỏ khác bản gốc — không trả 304 lẫn cho nhau', () => {
    expect(previewEtag('sha256:x', null)).toBe('"sha256:x"');
    expect(previewEtag('sha256:x', 1024)).toBe('"sha256:x@w1024"');
  });

  it('ảnh lớn hơn khung thì thu nhỏ về WebP, kèm ETag bản thu nhỏ', async () => {
    const images = fakeImages();
    const res = await imageResponse(images.binding, png(1536, 1024), 'image/png', 'a', 1024);
    expect(images.transform).toHaveBeenCalledWith({ width: 1024 });
    expect(images.output).toHaveBeenCalledWith(expect.objectContaining({ format: 'image/webp' }));
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(res.headers.get('ETag')).toBe('"a@w1024"');
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache');
  });

  it('không xin bản thu nhỏ thì trả ảnh gốc, không gọi binding', async () => {
    const images = fakeImages();
    const res = await imageResponse(images.binding, png(1536, 1024), 'image/png', 'a', null);
    expect(images.transform).not.toHaveBeenCalled();
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('ETag')).toBe('"a"');
  });

  it('ảnh đã nhỏ hơn khung thì không phóng to', async () => {
    const images = fakeImages();
    const res = await imageResponse(images.binding, png(800, 600), 'image/png', 'a', 1024);
    expect(images.transform).not.toHaveBeenCalled();
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  it('binding vắng hoặc biến đổi hỏng thì lùi về ảnh gốc với ETag bản gốc', async () => {
    const missing = await imageResponse(undefined, png(1536, 1024), 'image/png', 'a', 1024);
    expect(missing.headers.get('Content-Type')).toBe('image/png');
    expect(missing.headers.get('ETag')).toBe('"a"');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = await imageResponse(
      fakeImages(true).binding,
      png(1536, 1024),
      'image/png',
      'a',
      1024,
    );
    expect(broken.headers.get('Content-Type')).toBe('image/png');
    expect(broken.headers.get('ETag')).toBe('"a"');
    warn.mockRestore();
  });
});
