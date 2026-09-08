/**
 * Danh mục model cho ô chọn (nhánh AI): chỉ tuyến `ai_*` và tuyến phối cảnh; tuyến thiếu khoá
 * hay đang tắt được liệt kê MỜ kèm lý do; không bao giờ lộ khoá.
 */

import { describe, expect, it } from 'vitest';
import { aiModelCatalogue, isSelectableRoute } from '../ai/models';
import { ModelRouter } from '../llm/router';

const router = new ModelRouter(
  {
    version: '1',
    routes: {
      layer2_program: { provider: 'gemini', model: 'g', max_data_class: 3, enabled: true },
      ai_text_openai: {
        provider: 'openai',
        model: 'gpt',
        label: 'GPT (OpenAI)',
        max_data_class: 2,
        enabled: true,
      },
      ai_text_anthropic: {
        provider: 'anthropic',
        model: 'claude',
        label: 'Claude',
        max_data_class: 2,
        enabled: true,
      },
      ai_text_gemini: {
        provider: 'gemini',
        model: 'g-pro',
        label: 'Gemini',
        max_data_class: 2,
        enabled: false,
      },
      ai_image_openai: {
        provider: 'openai',
        model: 'gpt-image',
        label: 'GPT Image',
        max_data_class: 2,
        enabled: true,
      },
      layer5_render: {
        provider: 'pollinations',
        model: 'kontext',
        label: 'Pollinations',
        max_data_class: 3,
        enabled: true,
      },
    },
  },
  { openai: 'sk-openai', gemini: 'g-key' },
);

describe('aiModelCatalogue', () => {
  const catalogue = aiModelCatalogue(router);

  it('chỉ liệt kê tuyến ai_text_* ở văn bản, ai_image_* + phối cảnh ở ảnh', () => {
    expect(catalogue.text.map((o) => o.route)).toEqual([
      'ai_text_openai',
      'ai_text_anthropic',
      'ai_text_gemini',
    ]);
    expect(catalogue.image.map((o) => o.route)).toEqual(['ai_image_openai', 'layer5_render']);
  });

  it('thiếu khoá → mờ kèm lý do; đang tắt → mờ kèm lý do khác; có đủ → bấm được', () => {
    const byRoute = Object.fromEntries(catalogue.text.map((o) => [o.route, o]));
    expect(byRoute.ai_text_openai).toMatchObject({ enabled: true, unavailableReason: null });
    expect(byRoute.ai_text_anthropic).toMatchObject({ enabled: false });
    expect(byRoute.ai_text_anthropic?.unavailableReason).toMatch(/khoá API/);
    expect(byRoute.ai_text_gemini?.unavailableReason).toMatch(/tắt/);
  });

  it('tuyến Gemini trả phí dùng khoá RIÊNG — có khoá miễn phí mà thiếu khoá trả phí thì không bấm được', () => {
    // Chính sách hạng dữ liệu bám vào khoá được cấp (rà soát 08/09/2026): cùng API Google, nhưng
    // khoá miễn phí không bao giờ được router cấp cho tuyến hạng 2.
    const paid = new ModelRouter(
      {
        version: '1',
        routes: {
          layer2_program: { provider: 'gemini', model: 'g', max_data_class: 3, enabled: true },
          ai_text_gemini: {
            provider: 'gemini_paid',
            model: 'g-pro',
            label: 'Gemini',
            max_data_class: 2,
            enabled: true,
          },
        },
      },
      { gemini: 'free-key' },
    );
    const only = aiModelCatalogue(paid).text[0]!;
    expect(only.enabled).toBe(false);
    expect(only.unavailableReason).toMatch(/khoá API/);
  });

  it('không có khoá nào trong đầu ra', () => {
    expect(JSON.stringify(catalogue)).not.toMatch(/sk-openai|g-key/);
  });

  it('tuyến người dùng gửi lên phải nằm trong danh mục CỦA LOẠI ĐÓ và bấm được', () => {
    expect(isSelectableRoute(catalogue, 'text', 'ai_text_openai')).toBe(true);
    expect(isSelectableRoute(catalogue, 'text', 'ai_text_anthropic')).toBe(false); // thiếu khoá
    expect(isSelectableRoute(catalogue, 'text', 'ai_image_openai')).toBe(false); // sai loại
    expect(isSelectableRoute(catalogue, 'text', 'layer2_program')).toBe(false); // không phải ai_*
  });
});
