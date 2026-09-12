/**
 * Client OpenAI — văn bản có lược đồ và sinh ảnh. Canh những thứ hỏng IM LẶNG nếu sai:
 * khoá chỉ ở header; thân đúng phương ngữ Responses API; từ chối là lỗi không thử lại; cắt
 * giữa chừng là lỗi thử lại; multipart nhiều ảnh vào và không tự đặt Content-Type.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmCallFailed } from '../llm/gemini';
import { OpenAiClient } from '../llm/openai';
import { DataClassViolation, ModelRouter } from '../llm/router';

const TEXT_ENDPOINT = 'https://api.openai.com/v1/responses';
const IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const IMAGE_EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';
const SCHEMA = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };
const JPEG_B64 = '/9j/4AAQSkZJRg==';

function client(key: string | null = 'sk-test') {
  const router = new ModelRouter(
    {
      version: '1',
      routes: {
        ai_text_openai: {
          provider: 'openai',
          model: 'gpt-test',
          endpoint: TEXT_ENDPOINT,
          max_data_class: 2,
          enabled: true,
        },
        ai_image_openai: {
          provider: 'openai',
          model: 'gpt-image-test',
          endpoint: IMAGE_ENDPOINT,
          endpoint_edit: IMAGE_EDIT_ENDPOINT,
          max_data_class: 2,
          enabled: true,
        },
        // Cấu hình KIỂU CŨ: chỉ một `endpoint`, trỏ thẳng đường ảnh → ảnh.
        ai_image_legacy: {
          provider: 'openai',
          model: 'gpt-image-test',
          endpoint: IMAGE_EDIT_ENDPOINT,
          max_data_class: 2,
          enabled: true,
        },
        no_endpoint: { provider: 'openai', model: 'x', max_data_class: 2, enabled: true },
      },
    },
    { openai: key ?? undefined },
  );
  return new OpenAiClient(router);
}

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const textReply = (text: string) => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
  usage: { input_tokens: 120, output_tokens: 30 },
});

afterEach(() => vi.unstubAllGlobals());

describe('Văn bản có lược đồ', () => {
  it('gửi đúng phương ngữ Responses API, khoá chỉ ở header, không lưu phía nhà cung cấp', async () => {
    const fetchMock = respond(textReply('{"a":"x"}'));
    const out = await client().complete('ai_text_openai', 2, {
      system: 'Bạn là kiến trúc sư.',
      prompt: 'Lập chương trình.',
      schema: SCHEMA,
      images: [{ mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' }],
    });

    expect(out.json).toEqual({ a: 'x' });
    expect(out).toMatchObject({ provider: 'openai', model: 'gpt-test' });
    expect(out.usage).toEqual({ inputTokens: 120, outputTokens: 30 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TEXT_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-test');
    expect(body.instructions).toBe('Bạn là kiến trúc sư.');
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    // Phương ngữ strict: mọi property bắt buộc, additionalProperties false.
    expect(body.text.format.schema.additionalProperties).toBe(false);
    // Ảnh vào đứng trước chữ, dạng data URL.
    expect(body.input[0].content[0]).toMatchObject({ type: 'input_image' });
    expect(body.input[0].content[1]).toEqual({ type: 'input_text', text: 'Lập chương trình.' });
    // Không tự thêm temperature — mô hình suy luận từ chối tham số này.
    expect(body).not.toHaveProperty('temperature');
    // Khoá không nằm trong thân.
    expect(init.body as string).not.toContain('sk-test');
  });

  it('mô hình từ chối → lỗi KHÔNG thử lại, câu riêng', async () => {
    respond({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }],
    });
    const err = await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmCallFailed);
    expect((err as LlmCallFailed).retryable).toBe(false);
    expect((err as Error).message).toMatch(/từ chối/);
  });

  it('cắt giữa chừng vì hết token → đáng thử lại', async () => {
    respond({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
    });
    const err = (await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(err.retryable).toBe(true);
  });

  it.each([
    [429, true],
    [500, true],
    [401, false],
    [400, false],
  ])('phân loại HTTP %s → retryable %s', async (status, retryable) => {
    respond({ error: { message: 'x' } }, status);
    const err = (await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(err).toBeInstanceOf(LlmCallFailed);
    expect(err.retryable).toBe(retryable);
    expect(err.status).toBe(status);
  });

  it('thiếu endpoint thì không gọi ra mạng', async () => {
    const fetchMock = respond({});
    await expect(
      client().complete('no_endpoint', 2, { system: 's', prompt: 'p', schema: SCHEMA }),
    ).rejects.toThrow(/endpoint/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lớp chặn hạng dữ liệu đứng trước mọi lời gọi', async () => {
    const fetchMock = respond({});
    await expect(
      client().complete('ai_text_openai', 1, { system: 's', prompt: 'p', schema: SCHEMA }),
    ).rejects.toBeInstanceOf(DataClassViolation);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Sinh ảnh', () => {
  it('multipart với NHIỀU ảnh vào, để runtime tự đặt ranh giới, nhận dạng kiểu từ nội dung', async () => {
    const fetchMock = respond({
      data: [{ b64_json: JPEG_B64 }],
      usage: { input_tokens: 900, output_tokens: 1_200 },
    });
    const out = await client().generateImage('ai_image_openai', 2, {
      system: 'Keep the geometry.',
      prompt: 'Contemporary.',
      images: [
        { mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' },
        { mimeType: 'image/jpeg', dataBase64: JPEG_B64 },
      ],
    });
    expect(out).toMatchObject({ mimeType: 'image/jpeg', dataBase64: JPEG_B64, provider: 'openai' });
    expect(out.usage).toEqual({ inputTokens: 900, outputTokens: 1_200 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(IMAGE_EDIT_ENDPOINT);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBeUndefined();
    const form = init.body as FormData;
    expect(form.get('model')).toBe('gpt-image-test');
    expect(form.getAll('image[]')).toHaveLength(2);
    expect(String(form.get('prompt'))).toMatch(/^Keep the geometry\./);
  });

  it('kiểu ảnh lạ hoặc lời dẫn rỗng thì nói ra trước khi gọi', async () => {
    const fetchMock = respond({});
    await expect(
      client().generateImage('ai_image_openai', 2, {
        system: 's',
        prompt: 'p',
        images: [{ mimeType: 'image/gif', dataBase64: 'R0lGODlh' }],
      }),
    ).rejects.toThrow(/kiểu tệp/);
    await expect(
      client().generateImage('ai_image_openai', 2, { system: '', prompt: '  ', images: [] }),
    ).rejects.toThrow(/lời dẫn rỗng/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('thiếu khoá của ĐÚNG nhà cung cấp thì báo chưa cấu hình, không gọi', async () => {
    const fetchMock = respond({});
    await expect(
      client(null).generateImage('ai_image_openai', 2, { system: 's', prompt: 'p', images: [] }),
    ).rejects.toThrow(/khoá API/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Đường CHỮ → ẢNH, thêm 10/09/2026 cùng T21 (tờ mặt bằng do mô hình ảnh vẽ, không có ảnh neo).
 *
 * Đây là chỗ đã HỎNG và hỏng im lặng: OpenAI tách sinh ảnh làm hai đầu ra, `/v1/images/edits`
 * BẮT BUỘC có ảnh vào. Bản trước luôn gửi multipart, nên gọi không ảnh vào là gửi một biểu mẫu
 * trống phần `image[]` và nhận 400 — chỉ lộ ra sau khi đã trả tiền một lượt.
 */
describe('Sinh ảnh từ CHỮ, không có ảnh vào', () => {
  it('gọi đường generations bằng JSON, không phải đường edits bằng multipart', async () => {
    const fetchMock = respond({ data: [{ b64_json: 'iVBORw0KGgo=' }] });
    const out = await client().generateImage('ai_image_openai', 2, {
      system: 'You draw architectural floor plans.',
      prompt: 'Draw the ground floor.',
      images: [],
    });
    expect(out.mimeType).toBe('image/png');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(IMAGE_ENDPOINT);
    expect(url).not.toContain('/edits');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBeTypeOf('string');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'gpt-image-test', n: 1 });
    // Chỉ dẫn hệ thống phải đi kèm: đầu ra ảnh không có trường `system` riêng.
    expect(String(body.prompt)).toContain('You draw architectural floor plans.');
    expect(String(body.prompt)).toContain('Draw the ground floor.');
  });

  it('cấu hình cũ chỉ có một `endpoint` thì vẫn chạy như trước cho đường ảnh → ảnh', async () => {
    const fetchMock = respond({ data: [{ b64_json: JPEG_B64 }] });
    await client().generateImage('ai_image_legacy', 2, {
      system: 's',
      prompt: 'p',
      images: [{ mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' }],
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(IMAGE_EDIT_ENDPOINT);
    expect(init.body).toBeInstanceOf(FormData);
  });
});

describe('hết giờ — chỗ tốn tiền nhất của cả tệp này', () => {
  // Lượt `adbc2867` (11/09/2026) hỏng sau 6 phút 11 giây: huỷ ở giây 180, chờ 10 giây, huỷ lại ở
  // giây 181. Hai lần huỷ là hai lần mô hình đã sinh xong phần lớn câu trả lời, và OpenAI tính
  // tiền theo token nó sinh — không theo việc ta có đọc được thân phản hồi hay không.
  it('huỷ vì hết giờ thì `retryable` là FALSE — nếu không, Workflow mua lần thứ hai', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }),
    );
    const error = await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e) => e);
    expect(error).toBeInstanceOf(LlmCallFailed);
    expect((error as LlmCallFailed).retryable).toBe(false);
  });

  it('rớt kết nối thì VẪN thử lại — lời gọi có thể chưa tới được model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const error = await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e) => e);
    expect((error as LlmCallFailed).retryable).toBe(true);
  });

  it('hạn chờ văn bản là 300 giây, và nó phải KHỚP với hạn bước Workflow', async () => {
    // Hai con số ràng buộc nhau: 300 + 10 (giãn cách thử lại) + 300 = 610 giây, nên bước phải cho
    // 12 phút. Phép thử này đỏ khi ai đó nâng hạn chờ mà quên bước, tức khi một lượt ĐÃ TÍNH TIỀN
    // sẽ bị bước cắt ngang.
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeDefined();
      return new Response(JSON.stringify(textReply('{"a":"x"}')), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await client().complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA });
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../llm/openai.ts', import.meta.url), 'utf8'),
    );
    expect(source).toContain('const TEXT_TIMEOUT_MS = 300_000;');
    const step = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../workflows/ai-design.ts', import.meta.url), 'utf8'),
    );
    expect(step).toContain("timeout: '12 minutes'");
  });
});
