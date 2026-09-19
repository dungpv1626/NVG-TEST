/**
 * Model gói miễn phí chỉ nhận dữ liệu đã ẩn danh — ô chọn phải mờ nó ở bước gửi đầu bài.
 */

import { describe, expect, it } from 'vitest';
import type { AiModelOption } from '@/hooks/use-ai-design';
import { optionsForDataClass } from '../ai-model-picker';

const option = (over: Partial<AiModelOption>): AiModelOption => ({
  route: 'ai_text_openai',
  provider: 'openai',
  label: 'GPT-5',
  model: 'gpt-5',
  maxDataClass: 2,
  enabled: true,
  unavailableReason: null,
  imageUsd: null,
  ...over,
});

describe('optionsForDataClass', () => {
  const free = option({ route: 'ai_text_gemini_free', provider: 'gemini', maxDataClass: 3 });

  it('bước gửi đầu bài (hạng 2): tuyến miễn phí mờ đi, kèm lý do', () => {
    const [paid, blocked] = optionsForDataClass([option({}), free], 2);
    expect(paid!.enabled).toBe(true);
    expect(blocked!.enabled).toBe(false);
    expect(blocked!.unavailableReason).toContain('chỉ nhận dữ liệu đã ẩn danh');
  });

  it('bước chỉ gửi bản tóm tắt ẩn danh (hạng 3): mọi tuyến đều chọn được', () => {
    expect(optionsForDataClass([option({}), free], 3).every((o) => o.enabled)).toBe(true);
  });

  it('không mở lại tuyến vốn đã tắt', () => {
    const off = option({ enabled: false, unavailableReason: 'Chưa cấu hình khoá API.' });
    expect(optionsForDataClass([off], 3)[0]).toEqual(off);
  });
});
