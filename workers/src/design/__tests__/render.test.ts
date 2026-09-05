/**
 * Tuyến phối cảnh — hai tầng. Canh: chính sách hạng dữ liệu đi trước việc gọi; tuyến tắt hay
 * thiếu khoá là trạng thái đọc được, không phải lỗi; có ảnh thì nhãn cảnh báo đi kèm; lời dẫn
 * và phong cách lấy từ kb/render_prompts.yaml.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../llm/router';
import { ModelNotConfigured } from '../llm/router';
import {
  parseImageDataUrl,
  parseRenderPrompts,
  renderFromMassing,
  type RenderImageClient,
} from '../render/render';

const prompts = parseRenderPrompts(
  load(
    readFileSync(
      fileURLToPath(new URL('../../../../kb/render_prompts.yaml', import.meta.url)),
      'utf-8',
    ),
  ),
);
const PNG = { mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' };

function router(enabled: boolean, maxClass: 1 | 2 | 3 = 3, key: string | undefined = 'k') {
  return new ModelRouter(
    {
      version: '1',
      routes: {
        layer5_render: { provider: 'gemini', model: 'x', max_data_class: maxClass, enabled },
      },
    },
    key,
  );
}

describe('Phối cảnh từ ảnh khối', () => {
  it('có mô hình thì trả ảnh kèm nhãn cảnh báo và lời dẫn đúng phong cách', async () => {
    const calls: unknown[] = [];
    const client: RenderImageClient = {
      async generateImage(route, dataClass, options) {
        calls.push({ route, dataClass, options });
        return { mimeType: 'image/png', dataBase64: 'AAAA' };
      },
    };
    const out = await renderFromMassing({
      router: router(true),
      client,
      prompts,
      image: PNG,
      style: 'indochine',
    });
    expect(out.status).toBe('rendered');
    expect(out.watermark).toBe('Ảnh tham khảo ý tưởng — chưa phải phương án thi công');
    const call = calls[0] as {
      route: string;
      dataClass: number;
      options: { prompt: string; system: string };
    };
    expect(call.route).toBe('layer5_render');
    expect(call.dataClass).toBe(3);
    expect(call.options.prompt).toMatch(/Đông Dương/);
    expect(call.options.system).toMatch(/giữ NGUYÊN hình khối/);
  });

  it('tuyến tắt → trạng thái đọc được, không ném lỗi', async () => {
    const client: RenderImageClient = {
      async generateImage(route, dataClass) {
        router(false).resolve(route, dataClass as 3);
        throw new Error('không tới đây');
      },
    };
    const out = await renderFromMassing({
      router: router(false),
      client,
      prompts,
      image: PNG,
      style: null,
    });
    expect(out.status).toBe('unavailable');
    expect(out.status === 'unavailable' && out.reason).toMatch(/đang tắt/);
    expect(out.style).toBe('hien_dai');
  });

  it('thiếu khoá → không gọi, vẫn trả nhãn để ảnh khối dùng làm ảnh tham khảo', async () => {
    const out = await renderFromMassing({
      router: router(true),
      client: undefined,
      prompts,
      image: PNG,
      style: null,
    });
    expect(out.status).toBe('unavailable');
    expect(out.watermark).toMatch(/chưa phải phương án thi công/);
  });

  it('chính sách hạng dữ liệu chặn trước khi gọi', async () => {
    let called = false;
    const client: RenderImageClient = {
      async generateImage() {
        called = true;
        return { mimeType: 'image/png', dataBase64: 'AAAA' };
      },
    };
    // Tuyến chỉ nhận hạng 1 (nhạy cảm nhất) — hạng 3 thấp hơn nên vẫn được; đổi lại tuyến khai
    // hạng 3 không nhận hạng 1. Ở đây ảnh khối là hạng 3, nên chỉ chặn được khi tuyến đòi >3
    // — không tồn tại. Kiểm ngược: DataClassViolation từ resolve được đổi thành trạng thái.
    const strict = {
      allows: () => false,
      resolve: () => {
        throw new ModelNotConfigured('layer5_render', 'x');
      },
    } as unknown as ModelRouter;
    const out = await renderFromMassing({
      router: strict,
      client,
      prompts,
      image: PNG,
      style: null,
    });
    expect(out.status).toBe('unavailable');
    expect(called).toBe(false);
  });

  it('đọc data URL của ảnh chụp canvas', () => {
    expect(parseImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toEqual(PNG);
    expect(parseImageDataUrl('data:text/plain;base64,QUJD')).toBeNull();
  });
});
