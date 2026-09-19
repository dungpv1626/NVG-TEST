/**
 * Ba lỗi cùng một gốc, bắt được ngày 11/09/2026 trên một lượt xếp mặt bằng THẬT.
 *
 * Nguyên văn câu lỗi hôm ấy: «lý do dừng: MAX_TOKENS; đã sinh 31986 token, dài 2113 ký tự».
 * 31.986 token mà chỉ ra 2.113 ký tự thì phần lớn không phải chữ — đó là token SUY NGHĨ, và
 * `maxOutputTokens` là trần CHUNG cho cả nghĩ lẫn trả lời. Dòng Gemini 3 mặc định nghĩ ở mức
 * `high`, nên nó tiêu gần hết ngân sách rồi mới bắt đầu viết JSON, và JSON bị cắt.
 *
 * Ba hệ quả, và cả ba đều tốn tiền:
 *  1. Lượt gọi hỏng chắc chắn, lần nào cũng vậy — trừ khi hạ mức nghĩ.
 *  2. Lỗi ấy từng khai `retryable: true`, nên Workflow mua lại đúng một thất bại đã biết trước.
 *  3. Lỗi ấy không mang số token, nên bảng chi phí ghi lượt đắt nhất thành 0 đồng —
 *     đo được: 6/6 dòng `failed` trong `design_ai_call` có `cost_usd` rỗng.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient, LlmCallFailed } from '../llm/gemini';
import { ModelRouter } from '../llm/router';

const SCHEMA = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };

function client(thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high', maxOutputTokens?: number) {
  const router = new ModelRouter(
    {
      version: '1',
      routes: {
        gemini3: {
          provider: 'gemini_paid',
          model: 'gemini-3.1-pro-preview',
          max_data_class: 2,
          enabled: true,
          ...(thinkingLevel ? { thinking_level: thinkingLevel } : {}),
          ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
        },
      },
    },
    { gemini_paid: 'khoá-giả' },
  );
  return new GeminiClient(router);
}

/** Phản hồi Gemini bị CẮT giữa chừng — đúng hình dạng đã gặp thật. */
function truncatedReply() {
  return {
    candidates: [
      {
        content: { parts: [{ text: '{"a": "bắt đầu một chuỗi JSON rất dài nhưng chưa' }] },
        finishReason: 'MAX_TOKENS',
      },
    ],
    usageMetadata: { promptTokenCount: 4299, candidatesTokenCount: 520, thoughtsTokenCount: 31466 },
  };
}

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Mức suy nghĩ là dữ liệu của tuyến', () => {
  it('tuyến có khai thì gửi kèm thinkingConfig.thinkingLevel', async () => {
    const fetchMock = stub({ candidates: [{ content: { parts: [{ text: '{"a":"x"}' }] } }] });
    await client('low').complete('gemini3', 2, { system: 's', prompt: 'p', schema: SCHEMA });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, never>;
    expect(body.generationConfig).toMatchObject({ thinkingConfig: { thinkingLevel: 'low' } });
  });

  it('tuyến KHÔNG khai thì không gửi trường nào — dòng 2.5 không nhận nó', async () => {
    // Gửi `thinkingLevel` cho model dòng 2.5, hoặc gửi cùng lúc với `thinkingBudget` cũ, là 400.
    // Các tuyến của bộ giải đều chạy 2.5, nên im lặng ở đây là bắt buộc chứ không phải tiết kiệm.
    const fetchMock = stub({ candidates: [{ content: { parts: [{ text: '{"a":"x"}' }] } }] });
    await client().complete('gemini3', 2, { system: 's', prompt: 'p', schema: SCHEMA });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { generationConfig: Record<string, unknown> };
    expect(body.generationConfig).not.toHaveProperty('thinkingConfig');
  });
});

describe('Cắt vì hết ngân sách token', () => {
  it('KHÔNG đáng thử lại — thử lại là mua lại đúng một thất bại đã biết trước', async () => {
    stub(truncatedReply());
    await expect(
      client('low').complete('gemini3', 2, { system: 's', prompt: 'p', schema: SCHEMA }),
    ).rejects.toMatchObject({ name: 'LlmCallFailed', retryable: false });
  });

  it('mang theo SỐ TOKEN đã tiêu, gồm cả token nghĩ', async () => {
    // Đây là điều kiện để bảng chi phí ghi đúng: 520 token trả lời + 31.466 token nghĩ.
    try {
      stub(truncatedReply());
      await client('low').complete('gemini3', 2, { system: 's', prompt: 'p', schema: SCHEMA });
      expect.unreachable('phải ném lỗi');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmCallFailed);
      expect((error as LlmCallFailed).usage).toEqual({
        inputTokens: 4299,
        outputTokens: 31_986,
      });
    }
  });

  it('câu lỗi chỉ đúng chỗ phải sửa: mức nghĩ, không phải lược đồ', async () => {
    stub(truncatedReply());
    await expect(
      client('low').complete('gemini3', 2, { system: 's', prompt: 'p', schema: SCHEMA }),
    ).rejects.toThrow(/thinking_level|SUY NGHĨ/);
  });

  it('JSON hỏng vì lý do KHÁC thì vẫn đáng thử lại', async () => {
    // Phân biệt hai chuyện: hết ngân sách là lỗi CẤU HÌNH, còn một lần trả về méo mó thì có thể
    // là nhất thời. Gộp chung thì hoặc mua lại thất bại, hoặc bỏ mất lượt cứu được.
    stub({
      candidates: [{ content: { parts: [{ text: 'không phải JSON' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });
    await expect(
      client('low').complete('gemini3', 2, { system: 's', prompt: 'p', schema: SCHEMA }),
    ).rejects.toMatchObject({ retryable: true });
  });
});

describe('Trần token đầu ra là dữ liệu của tuyến', () => {
  const ok = () => ({ candidates: [{ content: { parts: [{ text: '{"a":"x"}' }] } }] });
  const sent = async (
    cap: number | undefined,
    requested: number | undefined,
  ): Promise<Record<string, unknown>> => {
    const fetchMock = stub(ok());
    await client('low', cap).complete('gemini3', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      maxOutputTokens: requested,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return (JSON.parse(init.body as string) as { generationConfig: Record<string, unknown> })
      .generationConfig;
  };

  it('`0` nghĩa là BỎ HẲN trường — để model dùng mức tối đa của chính nó', async () => {
    // Đây là chế độ ĐO: đặt một con số đoán rồi đo là đo chính con số mình đoán. Lượt hỏng
    // ngày 11/09/2026 sinh đúng 31.986 trên trần 32.000, tức nó ĐỤNG TRẦN — con số ấy không
    // nói lên bước này thật sự cần bao nhiêu.
    expect(await sent(0, 32_000)).not.toHaveProperty('maxOutputTokens');
  });

  it('tuyến khai số dương thì THẮNG con số nơi gọi xin', async () => {
    // Chỉ tuyến mới biết model này nghĩ tốn bao nhiêu, mà trần là trần CHUNG cho nghĩ và trả lời.
    expect(await sent(50_000, 32_000)).toMatchObject({ maxOutputTokens: 50_000 });
  });

  it('tuyến không khai thì theo nơi gọi', async () => {
    expect(await sent(undefined, 32_000)).toMatchObject({ maxOutputTokens: 32_000 });
  });

  it('không ai khai thì rơi về mặc định', async () => {
    expect(await sent(undefined, undefined)).toMatchObject({ maxOutputTokens: 8192 });
  });
});
