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
        ai_text_budget: {
          provider: 'openai',
          model: 'gpt-test',
          endpoint: TEXT_ENDPOINT,
          max_data_class: 2,
          enabled: true,
          max_output_tokens: 40_000,
        },
        ai_text_thinking: {
          provider: 'openai',
          model: 'gpt-test',
          endpoint: TEXT_ENDPOINT,
          max_data_class: 2,
          enabled: true,
          reasoning_effort: 'low' as const,
        },
        ai_text_uncapped: {
          provider: 'openai',
          model: 'gpt-test',
          endpoint: TEXT_ENDPOINT,
          max_data_class: 2,
          enabled: true,
          max_output_tokens: 0,
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

  it('cắt vì hết ngân sách token → KHÔNG thử lại, và câu lỗi nêu đúng chỗ vặn', async () => {
    // Đảo hành vi cũ, theo một phép đo THẬT ngày 13/09/2026: một lượt `gpt-5` xếp mặt bằng cho
    // biệt thự 26 phòng trả `status: incomplete` vì hết trần 16.384, Workflow thử lại, lượt thứ
    // hai trả JSON cắt dở. Hai hoá đơn cho cùng một nguyên nhân tất định — cùng ngân sách thì
    // lượt sau cắt đúng chỗ ấy. Đây là bản sao của bài học «huỷ vì hết giờ» (12/09/2026).
    respond({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
    });
    const err = (await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/ngân sách token đầu ra/);
    // Câu cho người đọc phải nêu TÊN cái van, vì chương trình cố ý không tự nâng trần hộ.
    expect(err.userMessage).toMatch(/max_output_tokens/);
  });

  it('JSON hỏng mà lượt gọi bị CẮT → không thử lại; JSON hỏng khi trả đủ → có thử lại', async () => {
    // Hai đường vào cùng một triệu chứng. Chuỗi cắt dở không phải lỗi ngẫu nhiên; JSON hỏng trên
    // một bản trả về ĐỦ thì mới là thứ lượt sau có thể khác.
    respond({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"a":"x' }] }],
    });
    const cut = (await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(cut.retryable).toBe(false);

    respond({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'không phải JSON' }] }],
    });
    const garbled = (await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(garbled.retryable).toBe(true);
  });

  it('lượt hỏng MANG THEO số token và thời gian — nếu không, khoản chi biến mất khỏi sổ', async () => {
    // Đo 13/09/2026: ba lượt `gpt-5` hỏng liên tiếp ghi 0 token, 0 đồng, latency 0 — trong khi
    // lượt đầu tiêu trọn 32.000 token đầu ra. `LlmCallFailed` đã có sẵn trường `usage` từ
    // 11/09 (bản vá cho Gemini) nhưng client OpenAI chưa bao giờ gắn vào. Bản trả về
    // `incomplete` CÓ mang `usage`, nên số đo luôn nằm trong tầm tay — chỉ là bị vứt đi.
    respond({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
      usage: {
        input_tokens: 12_000,
        output_tokens: 32_000,
        output_tokens_details: { reasoning_tokens: 29_500 },
      },
    });
    const err = (await client()
      .complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;

    expect(err.usage).toEqual({ inputTokens: 12_000, outputTokens: 32_000 });
    expect(err.latencyMs).toBeGreaterThanOrEqual(0);
    expect(err.latencyMs).not.toBeUndefined();
    // Câu lỗi nói luôn phần NGHĨ: «hết 32.000 token» một mình không chỉ ra chỗ vặn.
    expect(err.message).toMatch(/29\.500 token là phần suy nghĩ/);
  });

  it('mức suy nghĩ gửi đi CHỈ khi tuyến khai — không khai thì mặc định của model', async () => {
    // Van đánh đổi chất lượng lấy tiền và thời gian, nên nó phải là dữ liệu có người quyết. Và
    // mặc định phải là KHÔNG gửi gì: tự chọn hộ một mức là âm thầm đổi chất lượng bố cục của
    // mọi hồ sơ.
    const withEffort = respond(textReply('{"a":"x"}'));
    await client().complete('ai_text_thinking', 2, { system: 's', prompt: 'p', schema: SCHEMA });
    const [, one] = withEffort.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(one.body)).reasoning).toEqual({ effort: 'low' });

    const without = respond(textReply('{"a":"x"}'));
    await client().complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA });
    const [, two] = without.mock.calls[0] as unknown as [string, RequestInit];
    expect('reasoning' in JSON.parse(String(two.body))).toBe(false);
  });

  it('trần token đầu ra lấy theo TUYẾN, không phải hằng số trong mã', async () => {
    // Trước 13/09/2026 chỗ này là 16.384 chôn cứng, trong khi `max_output_tokens` của tuyến đã
    // có trong `config/models.yaml` và Gemini đã đọc nó — cấu hình khai ra mà không nơi nào đọc
    // còn tệ hơn không khai: nó tạo cảm giác đã chỉnh được.
    const fetchMock = respond(textReply('{"a":"x"}'));
    await client('sk-test').complete('ai_text_budget', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      maxOutputTokens: 4096,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.max_output_tokens).toBe(40_000);
  });

  it('tuyến khai trần `0` thì KHÔNG gửi trường nào — để nhà cung cấp dùng mức tối đa của model', async () => {
    // Dùng khi cần ĐO một bước thật sự tiêu bao nhiêu: đặt một con số đoán rồi đo là đo chính
    // con số mình đoán.
    const fetchMock = respond(textReply('{"a":"x"}'));
    await client('sk-test').complete('ai_text_uncapped', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect('max_output_tokens' in body).toBe(false);
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

  it('hạn chờ lời gọi × số lần thử phải NẰM TRONG hạn bước, và trong mốc «đứng hình»', async () => {
    // Canh QUAN HỆ, không canh con số — bản trước ghim thẳng «300_000» và «12 minutes», nên mỗi
    // lần chỉnh hạn chờ là một lần phải sửa phép thử, và phép thử thôi bảo vệ điều nó sinh ra để
    // bảo vệ. Điều cần giữ là ba bất đẳng thức:
    //
    //   1. mọi lần thử cộng giãn cách ≤ hạn BƯỚC — nếu không, bước cắt ngang một lượt ĐÃ TÍNH TIỀN;
    //   2. hạn bước < mốc «đứng hình» (`RUN_STALE_MS`) — nếu không, màn hình tuyên bố lượt chạy đã
    //      chết trong khi lời gọi còn đang bay, và `finishRun` ghi «hỏng» đè lên kết quả sắp có;
    //   3. hạn chờ phải thật sự được gắn vào lời gọi (`signal`).
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeDefined();
      return new Response(JSON.stringify(textReply('{"a":"x"}')), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await client().complete('ai_text_openai', 2, { system: 's', prompt: 'p', schema: SCHEMA });

    const read = async (path: string) =>
      import('node:fs').then((fs) => fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
    const callMs = Number(
      /const TEXT_TIMEOUT_MS = ([\d_]+);/
        .exec(await read('../llm/openai.ts'))![1]!
        .replace(/_/g, ''),
    );
    const stepSource = await read('../workflows/ai-design.ts');
    const stepMs = Number(/timeout: '(\d+) minutes'/.exec(stepSource)![1]) * 60_000;
    const retries = Number(/retries: \{ limit: (\d+)/.exec(stepSource)![1]);
    const delayMs = Number(/delay: '(\d+) seconds'/.exec(stepSource)![1]) * 1_000;
    const { RUN_STALE_MS } = await import('../ai/runs');

    expect(callMs * (retries + 1) + delayMs * retries).toBeLessThanOrEqual(stepMs);
    expect(stepMs).toBeLessThan(RUN_STALE_MS);
  });
});

describe('Theo dõi trực tiếp, mức suy nghĩ theo lượt, và nút Dừng (13/09/2026)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Luồng SSE giả của Responses API: một đoạn chữ hai mảnh rồi sự kiện hoàn tất có `usage`. */
  function sse(events: unknown[]): Response {
    const text = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');
    return new Response(new Blob([text]).stream(), { status: 200 });
  }

  it('có người theo dõi thì gọi ở chế độ truyền luồng, báo ký tự đang về, và đọc số token ở sự kiện cuối', async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(String(init.body));
        return sse([
          { type: 'response.created' },
          { type: 'response.output_text.delta', delta: '{"a":' },
          { type: 'response.output_text.delta', delta: '"x"}' },
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [{ type: 'message', content: [{ type: 'output_text', text: '{"a":"x"}' }] }],
              usage: { input_tokens: 1200, output_tokens: 3400 },
            },
          },
        ]);
      }),
    );
    const seen: { phase: string; outputChars: number }[] = [];
    const result = await client().complete('ai_text_openai', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      reasoningEffort: 'high',
      onProgress: (p) => seen.push(p),
    });
    expect(sentBody.stream).toBe(true);
    // Mức kỹ sư chọn cho lượt này thắng mức của tuyến (tuyến này không khai gì).
    expect(sentBody.reasoning).toEqual({ effort: 'high' });
    expect(seen[0]).toEqual({ phase: 'thinking', outputChars: 0 });
    expect(seen.at(-1)).toEqual({ phase: 'writing', outputChars: 9 });
    expect(result.json).toEqual({ a: 'x' });
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 3400 });
  });

  it('mức theo lượt thắng mức của tuyến', async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify(textReply('{"a":"x"}')), { status: 200 });
      }),
    );
    await client().complete('ai_text_thinking', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      reasoningEffort: 'medium',
    });
    expect(sentBody.reasoning).toEqual({ effort: 'medium' });
  });

  it('bấm Dừng thì huỷ lời gọi tới nhà cung cấp', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const stop = new AbortController();
    const pending = client()
      .complete('ai_text_openai', 2, {
        system: 's',
        prompt: 'p',
        schema: SCHEMA,
        signal: stop.signal,
      })
      .catch((e) => e);
    stop.abort();
    expect(await pending).toBeInstanceOf(LlmCallFailed);
  });
});
