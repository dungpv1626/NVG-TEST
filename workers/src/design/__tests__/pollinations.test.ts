/**
 * Client sinh ảnh Pollinations — nhà cung cấp của tuyến phối cảnh từ 06/09/2026.
 *
 * Canh những thứ một lời gọi thật đã dạy, và đều là loại hỏng IM LẶNG nếu sai:
 *  · phải gửi `multipart/form-data` với ba trường `model`, `image`, `prompt` — và KHÔNG tự đặt
 *    `Content-Type`, vì ranh giới multipart do runtime sinh;
 *  · phản hồi không khai kiểu tệp và thực tế trả JPEG, nên kiểu phải nhận dạng từ nội dung;
 *  · thiếu `endpoint` hay lời dẫn rỗng phải nói ra ngay, đừng gọi ra mạng;
 *  · phân loại lỗi đúng — 429 và 5xx đáng thử lại, 401/402/400 thì không.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmCallFailed } from '../llm/gemini';
import { PollinationsImageClient, sniffMime } from '../llm/pollinations';
import { ModelNotConfigured, ModelRouter } from '../llm/router';

const ENDPOINT = 'https://gen.pollinations.ai/v1/images/edits';
const IMAGE = { mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' };
const OPTIONS = { system: 'Keep the geometry.', prompt: 'Contemporary style.', image: IMAGE };
/** Ảnh JPEG một pixel, đủ để `sniffMime` nhận ra và `atob` giải được. */
const JPEG_B64 = '/9j/4AAQSkZJRg==';

function client(overrides: Record<string, unknown> = {}, key: string | null = 'sk_test') {
  const router = new ModelRouter(
    {
      version: '1',
      routes: {
        layer5_render: {
          provider: 'pollinations',
          model: 'kontext',
          endpoint: ENDPOINT,
          max_data_class: 3,
          enabled: true,
          ...overrides,
        },
      },
    },
    { pollinations: key ?? undefined },
  );
  return new PollinationsImageClient(router);
}

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('Client sinh ảnh Pollinations', () => {
  it('gửi ảnh khối kèm lời dẫn dạng multipart, và để runtime tự đặt ranh giới', async () => {
    const fetchMock = respond({ data: [{ b64_json: JPEG_B64 }] });
    const out = await client().generateImage('layer5_render', 3, OPTIONS);

    // Kiểu tệp NHẬN DẠNG từ nội dung, không lấy từ phản hồi (phản hồi không khai) và cũng
    // không lấy từ ảnh vào (ảnh vào là PNG, ảnh ra là JPEG).
    expect(out).toEqual({ mimeType: 'image/jpeg', dataBase64: JPEG_B64 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk_test');
    // Đặt tay `Content-Type: multipart/form-data` là mất ranh giới → máy chủ đọc không ra.
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');

    const form = init.body as FormData;
    expect(form.get('model')).toBe('kontext');
    // Ràng buộc hình học đứng TRƯỚC phong cách — đảo lại là đẩy nó xuống cuối lời dẫn.
    expect(form.get('prompt')).toBe('Keep the geometry.\n\nContemporary style.');
    const sent = form.get('image');
    expect(sent).toBeInstanceOf(Blob);
    expect((sent as Blob).type).toBe('image/png');
    expect((sent as Blob).size).toBeGreaterThan(0);
  });

  it('nhận dạng kiểu ảnh từ nội dung, không đoán bừa', () => {
    expect(sniffMime('/9j/4AAQ')).toBe('image/jpeg');
    expect(sniffMime('iVBORw0KGgoAAAA')).toBe('image/png');
    expect(sniffMime('UklGRhoAAABXRUJQ')).toBe('image/webp');
    // Không nhận ra thì khai PNG — trình duyệt tự dò lại theo nội dung.
    expect(sniffMime('AAAA')).toBe('image/png');
  });

  it('phản hồi không có ảnh → lỗi nêu rõ đã nhận được gì', async () => {
    respond({ error: 'x' });
    await expect(client().generateImage('layer5_render', 3, OPTIONS)).rejects.toThrow(
      /không trả về ảnh.*error/s,
    );
  });

  it('thiếu endpoint → nói ra ngay, không gọi ra mạng', async () => {
    const fetchMock = respond({});
    await expect(
      client({ endpoint: undefined }).generateImage('layer5_render', 3, OPTIONS),
    ).rejects.toThrow(/thiếu `endpoint`/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ảnh khối sai kiểu tệp hoặc lời dẫn rỗng → chặn trước khi gọi', async () => {
    const fetchMock = respond({});
    await expect(
      client().generateImage('layer5_render', 3, {
        ...OPTIONS,
        image: { mimeType: 'image/gif', dataBase64: 'AAAA' },
      }),
    ).rejects.toThrow(/kiểu tệp không gửi được/);
    await expect(
      client().generateImage('layer5_render', 3, { system: ' ', prompt: '', image: IMAGE }),
    ).rejects.toThrow(/lời dẫn rỗng/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('phân loại lỗi: 429 và 5xx đáng thử lại, khoá sai và hết hạn mức thì không', async () => {
    for (const status of [429, 503]) {
      respond({ error: 'busy' }, status);
      await expect(client().generateImage('layer5_render', 3, OPTIONS)).rejects.toMatchObject({
        retryable: true,
      });
    }
    for (const status of [400, 401, 402, 403]) {
      respond({ error: 'nope' }, status);
      const failure = await client()
        .generateImage('layer5_render', 3, OPTIONS)
        .catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(LlmCallFailed);
      expect((failure as LlmCallFailed).retryable, String(status)).toBe(false);
      expect((failure as LlmCallFailed).status).toBe(status);
    }
  });

  // ⚠️ Tuyến này KHÁC các tuyến trả phí, và khác có chủ đích. Từ 12/09/2026 lời gọi trả phí bị
  // huỷ vì hết giờ KHÔNG được thử lại (nhà cung cấp vẫn tính tiền phần đã sinh — xem
  // `provider-faults.test.ts`). Ở đây vẫn thử lại vì Pollinations MIỄN PHÍ: không có hoá đơn nào
  // để mua hai lần, còn hàng đợi miễn phí tắc tạm thời là chuyện thường. Cờ `timeoutIsBilled=false`
  // trong `pollinations.ts` là chỗ khai điều đó. Đừng «thống nhất» hai hành vi này.
  it('mạng hỏng hoặc hết giờ → đáng thử lại, không phải lỗi yêu cầu (tuyến MIỄN PHÍ)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('timed out', 'TimeoutError'))),
    );
    await expect(client().generateImage('layer5_render', 3, OPTIONS)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('thiếu khoá của ĐÚNG nhà cung cấp này → chặn trước khi gọi', async () => {
    const fetchMock = respond({});
    await expect(
      client({}, null).generateImage('layer5_render', 3, OPTIONS),
    ).rejects.toBeInstanceOf(ModelNotConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('khoá KHÔNG bao giờ nằm trong nội dung gửi đi, chỉ ở tiêu đề xác thực', async () => {
    // Đặt khoá vào URL hay vào thân yêu cầu là để nó lọt vào log của bên thứ ba.
    const fetchMock = respond({ data: [{ b64_json: JPEG_B64 }] });
    await client().generateImage('layer5_render', 3, OPTIONS);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('sk_test');
    const form = init.body as FormData;
    for (const value of form.values()) {
      if (typeof value === 'string') expect(value).not.toContain('sk_test');
    }
  });
});
