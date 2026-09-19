/**
 * Lời gọi mô hình ảnh của tờ mặt bằng có nội thất — phép thử ĐÁNG GIÁ NHẤT của T57.
 *
 * Nó canh đúng một điều: lời gọi mang **đúng một ảnh neo**.
 *
 * Vì sao chỗ này cần lưới riêng, trong khi nó chỉ là một dòng: bỏ ảnh neo đi thì không có gì
 * hỏng. Lời gọi vẫn hợp lệ, OpenAI tự chuyển sang đường chữ→ảnh (`llm/openai.ts` chọn endpoint
 * theo `images.length`), mô hình vẫn trả về một tờ mặt bằng đẹp, kho vẫn lưu, màn hình vẫn hiện,
 * tiền vẫn mất. Thứ duy nhất đổi là tờ ấy vẽ một ngôi nhà KHÁC — và đó chính xác là T21, phương
 * án đã bị T22 gỡ bỏ ngày 12/09/2026.
 *
 * Không một lượt gọi trả phí nào: client giả, ghi lại tham số rồi trả một ảnh dựng sẵn.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import type { AiImageClient, AiImageOptions, AiImageResult } from '../llm/text-client';
import { parseAiPrompts } from '../ai/prompts';
import { sheetImageCallOptions, sheetImagePrompt } from '../ai/sheet-image';
import { parseVocabulary } from '../kb/vocabulary';
import { TOWNHOUSE_PLAN } from './ai-plan-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const prompts = parseAiPrompts(load(read('../../../../kb/ai_design_prompts.yaml')));
const vocabulary = parseVocabulary(read('../../../../kb/room_vocabulary.yaml'));
const labels: Record<string, string> = Object.fromEntries(
  vocabulary.types.map((type) => [type.code, type.vi]),
);

/** Ảnh neo giả — tiền tố PNG thật, phần còn lại là chữ, vì không lớp nào ở đây giải mã nó. */
const ANCHOR_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+';

class RecordingImageClient implements AiImageClient {
  calls: Array<{ route: string; dataClass: number; options: AiImageOptions }> = [];

  async generateImage(
    routeName: string,
    dataClass: 1 | 2 | 3,
    options: AiImageOptions,
  ): Promise<AiImageResult> {
    this.calls.push({ route: routeName, dataClass, options });
    return {
      mimeType: 'image/png',
      dataBase64: ANCHOR_B64,
      provider: 'gia-lap',
      model: 'gia-lap',
      usage: { inputTokens: null, outputTokens: null },
      latencyMs: 1,
    };
  }
}

const prompt = sheetImagePrompt({
  plan: TOWNHOUSE_PLAN,
  level: 1,
  prompts,
  labels,
  scale: 60,
  styleCode: 'hien_dai',
});

describe('lời gọi mô hình ảnh', () => {
  it('mang ĐÚNG MỘT ảnh vào — mảng rỗng là lặng lẽ quay về T21 mà vẫn tốn tiền', async () => {
    const client = new RecordingImageClient();
    const options = sheetImageCallOptions(prompt, {
      mimeType: 'image/png',
      dataBase64: ANCHOR_B64,
    });
    await client.generateImage('ai_image_openai', 2, options);

    const call = client.calls[0]!;
    expect(call.options.images).toHaveLength(1);
    expect(call.options.images[0]!.dataBase64).toBe(ANCHOR_B64);
    expect(call.options.images[0]!.mimeType).toBe('image/png');
  });

  it('gửi kèm cả lời dẫn hệ thống lẫn lời dẫn có số liệu thật', async () => {
    const options = sheetImageCallOptions(prompt, {
      mimeType: 'image/png',
      dataBase64: ANCHOR_B64,
    });
    expect(options.system).toBe(prompt.system);
    expect(options.prompt).toBe(prompt.prompt);
    expect(options.prompt).toContain('MẶT BẰNG CÔNG NĂNG — TẦNG 1');
  });

  it('không tự thêm ảnh thứ hai dù gọi lại nhiều lần', () => {
    const anchor = { mimeType: 'image/png', dataBase64: ANCHOR_B64 };
    expect(sheetImageCallOptions(prompt, anchor).images).toHaveLength(1);
    expect(sheetImageCallOptions(prompt, anchor).images).toHaveLength(1);
  });
});
