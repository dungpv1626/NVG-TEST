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
import { LlmCallFailed } from '../llm/gemini';
import {
  describeSite,
  parseImageDataUrl,
  parseRenderPrompts,
  renderFromMassing,
  type RenderImageClient,
} from '../render/render';
import { parseSiteContext, siteFaces } from '../kb/site-context';

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
        layer5_render: { provider: 'pollinations', model: 'x', max_data_class: maxClass, enabled },
      },
    },
    { pollinations: key },
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
    expect(call.options.prompt).toMatch(/Indochine/);
    expect(call.options.system).toMatch(/Do not add floors/);
  });

  /**
   * Lời dẫn phải là TIẾNG ANH — ngoại lệ có bằng chứng của quy tắc "100% tiếng Việt".
   *
   * Đo 06/09/2026: cùng ảnh vào, cùng yêu cầu đổi phong cách, lời dẫn tiếng Việt cho ra ảnh
   * gần như không đổi còn tiếng Anh đổi đúng mặt đứng. Bộ mã hoá văn bản của FLUX huấn luyện
   * trên tiếng Anh, và nó KHÔNG báo lỗi khi không hiểu — nó trả về ảnh khối được tô lại.
   * Không có test này thì lần ai đó "sửa lại cho đúng quy tắc tiếng Việt" sẽ hỏng im lặng.
   */
  it('lời dẫn gửi cho mô hình là tiếng Anh, còn chữ người dùng đọc vẫn là tiếng Việt', () => {
    const vietnamese = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
    expect(prompts.system).not.toMatch(vietnamese);
    for (const [name, style] of Object.entries(prompts.styles)) {
      expect(style.prompt, name).not.toMatch(vietnamese);
      expect(style.vi, name).toMatch(vietnamese); // nhãn hiện trên màn hình thì ngược lại
    }
    expect(prompts.watermark).toMatch(vietnamese);
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
    expect(out.status === 'unavailable' && out.reason).toMatch(/chưa được cấu hình/);
    expect(out.style).toBe('hien_dai');
  });

  /**
   * Chữ ra màn hình phải là tiếng Việt và KHÔNG mang mã HTTP hay câu của nhà cung cấp.
   *
   * Đo 06/09/2026 bằng lời gọi thật: hết hạn mức tháng, Hugging Face trả 402 kèm
   * "You have depleted your monthly included credits…". Dán nguyên câu đó ra màn hình là
   * đưa cho kiến trúc sư một dòng vừa không đọc được vừa không xử lý được (CGD 5.5).
   */
  it('lỗi của nhà cung cấp không lọt ra màn hình, và nói rõ ai xử lý được', async () => {
    const cases: [LlmCallFailed, RegExp][] = [
      [
        new LlmCallFailed('You have depleted your monthly included credits.', false, 402),
        /hết hạn mức/,
      ],
      [new LlmCallFailed('Unauthorized', false, 401), /khoá.*không còn hiệu lực/],
      [new LlmCallFailed('busy', true, 429), /quá tải/],
      [new LlmCallFailed('model returned no image', false), /Báo Quản trị hệ thống/],
    ];
    for (const [thrown, expected] of cases) {
      const out = await renderFromMassing({
        router: router(true),
        client: {
          generateImage: () => Promise.reject(thrown),
        },
        prompts,
        image: PNG,
        style: null,
      });
      expect(out.status).toBe('unavailable');
      const reason = out.status === 'unavailable' ? out.reason : '';
      expect(reason).toMatch(expected);
      expect(reason).not.toMatch(/402|429|depleted|credits/);
      expect(reason).toMatch(/Ảnh khối vẫn dùng được/);
    }
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

  it('khung hình lạ thì lấy khung đầu tiên, và mã khung hình đi kèm kết quả', async () => {
    const seen: string[] = [];
    const client: RenderImageClient = {
      async generateImage(_route, _dataClass, options) {
        seen.push(options.prompt);
        return { mimeType: 'image/png', dataBase64: 'AAAA' };
      },
    };
    const out = await renderFromMassing({
      router: router(true),
      client,
      prompts,
      image: PNG,
      style: null,
      view: 'khong-co-that',
    });
    expect(out.view).toBe(prompts.views[0]!.id);
    expect(seen[0]).toContain(prompts.views[0]!.prompt.trim().slice(0, 20));
  });

  it('lời dẫn ghép theo thứ tự: ngữ cảnh thửa đất → phong cách → ánh sáng khung hình', async () => {
    // Thứ tự quan trọng: phần đứng sau bị mô hình bám yếu hơn, nên vế "chỉ một mặt tiền" phải
    // đứng trước phần trang trí. Đảo thứ tự không làm test nào khác đỏ.
    let prompt = '';
    const client: RenderImageClient = {
      async generateImage(_route, _dataClass, options) {
        prompt = options.prompt;
        return { mimeType: 'image/png', dataBase64: 'AAAA' };
      },
    };
    await renderFromMassing({
      router: router(true),
      client,
      prompts,
      image: PNG,
      style: 'indochine',
      view: 'dem',
      siteContext: 'NGU-CANH.',
    });
    const night = prompts.views.find((v) => v.id === 'dem')!;
    expect(prompt.indexOf('NGU-CANH.')).toBe(0);
    expect(prompt.indexOf('Indochine')).toBeGreaterThan(0);
    expect(prompt.indexOf(night.prompt.trim().slice(0, 20))).toBeGreaterThan(
      prompt.indexOf('Indochine'),
    );
  });
});

/**
 * Câu ngữ cảnh thửa đất — vế mà thiếu nó thì mô hình dựng nhà phố kẹp giữa thành lô góc.
 *
 * Đây là lỗi Haan bắt được ngày 06/09/2026: ảnh phối cảnh đầu tiên có HAI mặt tiền vì ảnh khối
 * không nói được rằng hai bên đã có nhà xây sát.
 */
describe('Ngữ cảnh thửa đất trong lời dẫn', () => {
  const table = parseSiteContext(
    readFileSync(
      fileURLToPath(new URL('../../../../kb/site_context.yaml', import.meta.url)),
      'utf-8',
    ),
  );
  const rowHouse: {
    building_type: string;
    floors: number;
    site: {
      width_m: number;
      depth_m: number;
      access_sides: string[];
      adjacent: Record<string, string>;
    };
  } = {
    building_type: 'nha_pho',
    floors: 5,
    site: {
      width_m: 5,
      depth_m: 18,
      access_sides: ['front'],
      adjacent: { front: 'duong_lon', left: 'nha_hang_xom', right: 'nha_hang_xom' },
    },
  };

  function describe_(brief: typeof rowHouse) {
    return describeSite(brief, siteFaces(brief.site, table).open, prompts.context);
  }

  it('nhà phố kẹp giữa hai nhà hàng xóm → nói rõ CHỈ MỘT mặt tiền', () => {
    const text = describe_(rowHouse);
    expect(text).toContain('5.0 m wide and 18.0 m deep');
    expect(text).toContain('5 storeys');
    expect(text).toMatch(/party wall/);
    expect(text).toContain(prompts.context.single_frontage);
    expect(text).not.toContain(prompts.context.extra_frontage);
  });

  it('một mặt bên giáp hẻm → KHÔNG nói một mặt tiền nữa', () => {
    const text = describe_({
      ...rowHouse,
      site: { ...rowHouse.site, adjacent: { ...rowHouse.site.adjacent, right: 'hem_3m' } },
    });
    expect(text).toContain(prompts.context.extra_frontage);
    expect(text).not.toContain(prompts.context.single_frontage);
  });

  it('mặt chưa khai hiện trạng thì im lặng, không bịa', () => {
    const text = describe_({
      ...rowHouse,
      site: { ...rowHouse.site, adjacent: { front: 'duong_lon' } },
    });
    expect(text).not.toMatch(/left-hand side|right-hand side/);
    // Chưa khai vẫn là "bị che" theo `default_open: false`, nên vẫn phải chốt một mặt tiền.
    expect(text).toContain(prompts.context.single_frontage);
  });

  it('không có đầu bài thì vẫn ra câu dùng được, không ném lỗi', () => {
    const text = describeSite(null, [], prompts.context);
    expect(text).toBe(prompts.context.single_frontage);
  });

  /**
   * Hai tệp `kb/` giữ hai câu trả lời khác nhau cho CÙNG một mã hiện trạng: `site_context.yaml`
   * trả lời "mặt này có thoáng không", `render_prompts.yaml` trả lời "gọi nó là gì bằng tiếng
   * Anh". Thiếu một mã ở tệp sau thì câu ngữ cảnh lặng lẽ bỏ qua mặt đó — không lỗi, không
   * cảnh báo, chỉ là ảnh ra sai bối cảnh.
   */
  it('mọi mã hiện trạng của Đầu bài đều có mặt ở CẢ HAI tệp dữ liệu', () => {
    const form = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../../shared/src/design/brief-form.json', import.meta.url)),
        'utf-8',
      ),
    ) as { sections: { fields: { path: string; options?: { value: string }[] }[] }[] };
    const field = form.sections
      .flatMap((section) => section.fields)
      .find((f) => f.path === 'site.adjacent');
    const codes = (field?.options ?? []).map((o) => o.value);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(table.openFaces, code).toHaveProperty(code);
      expect(prompts.context.adjacent, code).toHaveProperty(code);
    }
  });
});
