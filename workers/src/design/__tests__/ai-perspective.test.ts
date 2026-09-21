/**
 * Bộ ảnh phối cảnh (T67) — phần thuần, KHÔNG chạm mạng, không một lượt gọi trả phí nào.
 *
 * Canh bốn chỗ mà một lỗi sẽ KHÔNG trông giống lỗi:
 *  · **Hướng nắng** — sai chiều thì bóng đổ ngược, mà ảnh vẫn đẹp và vẫn giao được cho khách.
 *  · **Ảnh gửi kèm từng góc** — thiếu một tấm thì lượt vẫn chạy, vẫn ra ảnh, vẫn tính tiền, và vẽ
 *    một ngôi nhà khác (bài học T21). Không màn hình nào lộ ra.
 *  · **Trường cấm trong lời dẫn** — danh sách phòng, nhân khẩu, chữ tự do của đầu bài không được
 *    đi ra ngoài. Không ai nhìn ra chuyện ấy bằng mắt trên một lời dẫn dài.
 *  · **Bộ ảnh tự mâu thuẫn** — một góc vừa có ảnh vừa ghi là thiếu, hay hai tấm cùng góc.
 */

import {
  aiImageSetSchema,
  aiImageSetViewSchema,
  type AiBriefDigest,
  type AiImageSet,
  type AiImageSetView,
} from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { facadeLook } from '../ai/facade/image';
import { assembleImageSet, ImageSetError, type DrawnView } from '../ai/perspective/assemble';
import { perspectiveContext, sunFrom } from '../ai/perspective/context';
import { perspectivePrompt } from '../ai/perspective/prompt';
import {
  closeUpView,
  perspectivePlan,
  redrawAloneRefusal,
  SET_ANCHOR_VIEW,
} from '../ai/perspective/views';
import { drawViewStep } from '../workflows/ai-perspective-steps';
import { ANCHOR_FRAMES } from '../ai/draw/anchor';
import { renderRoofPlanAnchor } from '../ai/draw/roof-plan';
import { CLS } from '../ai/draw/svg';
import { parseSheetStyle } from '../ai/draw/style';
import { digestOf, TOWNHOUSE, VILLA } from './ai-digest-fixtures';
import { facadeVocab, outdoor, TOWNHOUSE_FACADE, VILLA_FACADE } from './ai-facade-fixtures';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';
import { shiftBack } from './ai-facade-fixtures';
import { prompts, read } from './ai-real-context';

const townhouseCtx = () =>
  perspectiveContext(digestOf(TOWNHOUSE), TOWNHOUSE_PLAN, TOWNHOUSE_FACADE);
const villaCtx = () => perspectiveContext(digestOf(VILLA), VILLA_PLAN, VILLA_FACADE);
const look = () => facadeLook(TOWNHOUSE_FACADE, facadeVocab, prompts);

/** Bọc `renderRoofPlanAnchor` với đúng bộ phụ thuộc mà Worker dùng — không dựng bản thứ hai. */
const roofPlanAnchorOf = (
  plan: typeof VILLA_PLAN,
  concept: typeof VILLA_FACADE,
  lotBoundary: Array<[number, number]> | null = null,
) =>
  renderRoofPlanAnchor(plan, concept, {
    style: parseSheetStyle(read('kb/sheet_style.yaml')),
    vocab: facadeVocab,
    outdoor,
    lotBoundary,
  });

describe('Ngữ cảnh phối cảnh', () => {
  it('rút hình khối từ mặt bằng và mặt đứng, không từ chữ của đầu bài', () => {
    const ctx = townhouseCtx();
    expect(ctx.buildingType).toBe('nha_pho');
    expect(ctx.storeys).toBe(TOWNHOUSE_FACADE.elevation.levels.length);
    expect(ctx.frontWidthM).toBeCloseTo(TOWNHOUSE_FACADE.elevation.width / 100, 1);
    // Chiều sâu là thứ tờ mặt đứng KHÔNG nói được — nó phải tới từ mặt bằng.
    expect(ctx.depthM).toBeGreaterThan(ctx.frontWidthM);
    expect(ctx.heightM).toBeGreaterThan(0);
  });

  it('khoảng sân là SỐ ĐO bốn mặt, không phải một bit có-hay-không', () => {
    // Bài canh lỗi T68. Trước đó cả cụm này là `frontYard: boolean` suy từ «ý tưởng có cổng
    // không», và lượt chạy thật 20/09/2026 vẽ sân trước 8–10 m trong khi đầu bài khai 3 m.
    const ctx = perspectiveContext(digestOf(VILLA), shiftBack(VILLA_PLAN, 300), VILLA_FACADE);
    expect(ctx.lot).not.toBeNull();
    expect(ctx.yard).not.toBeNull();
    // Đẩy khối nhà lùi 3 m thì sân trước phải ĐÚNG 3 m — không phải «có sân».
    expect(ctx.yard!.frontM).toBeCloseTo(3, 1);
    // Sân trước + chiều sâu nhà + sân sau đúng bằng chiều sâu thửa: bốn số phải đóng kín.
    expect(ctx.yard!.frontM + ctx.depthM + ctx.yard!.backM).toBeCloseTo(ctx.lot!.depthM, 1);
    // Nhà phố xây sát ranh trước: sân trước bằng 0, và đó là SỐ ĐO chứ không phải thiếu dữ liệu.
    expect(townhouseCtx().yard?.frontM).toBe(0);
  });

  it('lối vào quy về trái / giữa / phải theo TÂM lỗ mở', () => {
    for (const ctx of [townhouseCtx(), villaCtx()]) {
      for (const side of [ctx.mainDoorSide, ctx.garageSide]) {
        if (side !== null) expect(['left', 'centre', 'right']).toContain(side);
      }
    }
  });

  it('giữ nguyên mã hướng, không quy sẵn ra hướng nắng', () => {
    expect(townhouseCtx().orientation).toBe(digestOf(TOWNHOUSE).site.orientation ?? null);
  });
});

describe('Hướng nắng', () => {
  // Thử lại bằng tay: người xem đứng ngoài đường quay lưng ra đường, nhìn vào mặt tiền.
  it('nhà hướng nam: sáng nắng bên phải, chiều nắng bên trái', () => {
    expect(sunFrom('N', 'morning')).toBe('right');
    expect(sunFrom('N', 'afternoon')).toBe('left');
  });

  it('nhà hướng bắc thì ngược lại', () => {
    expect(sunFrom('B', 'morning')).toBe('left');
    expect(sunFrom('B', 'afternoon')).toBe('right');
  });

  it('hướng đông đón nắng sáng thẳng mặt, hướng tây thì mặt tiền trong bóng', () => {
    expect(sunFrom('D', 'morning')).toBe('front');
    expect(sunFrom('T', 'morning')).toBe('back');
    expect(sunFrom('T', 'afternoon')).toBe('front');
  });

  it('trưa: nhà hướng nam ăn nắng, hướng bắc nằm trong bóng', () => {
    expect(sunFrom('N', 'midday')).toBe('front');
    expect(sunFrom('B', 'midday')).toBe('back');
  });

  it('đầu bài không khai hướng thì nói ánh sáng chung, KHÔNG đoán một hướng', () => {
    expect(sunFrom(null, 'morning')).toBe('unknown');
    expect(sunFrom('khong-phai-ma-huong', 'morning')).toBe('unknown');
  });
});

describe('Danh sách góc và ảnh gửi kèm', () => {
  it('lời dẫn khai đủ đúng bảy góc của hợp đồng, không thừa không thiếu', () => {
    // `prompts.ts` khai lại danh sách góc thay vì import enum sinh ra (nó là tệp thuần nạp được
    // bằng Vitest). Đây là chỗ canh hai bên không lệch: thêm một góc vào hợp đồng mà quên khai
    // lời dẫn thì lượt chạy tới góc ấy mới hỏng, tức sau khi đã trả tiền cho những góc trước nó.
    expect(Object.keys(prompts.perspective.views).sort()).toEqual(
      [...aiImageSetViewSchema.options].sort(),
    );
  });

  it('ảnh cận cảnh chọn theo ban công, không hỏi mô hình', () => {
    for (const concept of [TOWNHOUSE_FACADE, VILLA_FACADE]) {
      const expected = (concept.balconies ?? []).length > 0 ? 'balcony_close' : 'gate_close';
      expect(closeUpView(concept)).toBe(expected);
    }
  });

  it('front_day chạy trước và là góc duy nhất cầm tờ mặt đứng', () => {
    const { steps } = perspectivePlan(VILLA_FACADE, ['elevation', 'roof_plan']);
    expect(steps[0]!.view).toBe('front_day');
    expect(steps[0]!.sources).toEqual([{ anchor: 'elevation' }]);
    const withElevation = steps.filter((s) =>
      s.sources.some((src) => 'anchor' in src && src.anchor === 'elevation'),
    );
    expect(withElevation).toHaveLength(1);
  });

  it('mọi góc sau đều cầm chính tấm front_day — đó là cách giữ năm tấm cùng một ngôi nhà', () => {
    const { steps } = perspectivePlan(VILLA_FACADE, ['elevation', 'roof_plan']);
    for (const step of steps.slice(1)) {
      expect(step.sources).toContainEqual({ image: 'front_day' });
    }
  });

  it('góc nghiêng và trên cao đòi tờ mặt bằng mái, và nhận nó TRƯỚC tấm màu', () => {
    const { steps } = perspectivePlan(VILLA_FACADE, ['elevation', 'roof_plan']);
    for (const view of ['oblique', 'aerial'] as const) {
      const step = steps.find((s) => s.view === view);
      expect(step?.sources).toEqual([{ anchor: 'roof_plan' }, { image: 'front_day' }]);
    }
  });

  it('chưa có tờ mặt bằng mái thì hai góc ấy KHÔNG vẽ, và lý do nói ra bằng tiếng Việt', () => {
    const { steps, skipped } = perspectivePlan(VILLA_FACADE, ['elevation']);
    expect(steps.map((s) => s.view)).toEqual([
      'front_day',
      'front_night',
      closeUpView(VILLA_FACADE),
    ]);
    expect(skipped.map((s) => s.view).sort()).toEqual(['aerial', 'oblique']);
    for (const gap of skipped) expect(gap.reason).toMatch(/mặt bằng mái/);
  });

  it('không góc nào vừa chạy vừa bị bỏ', () => {
    for (const anchors of [['elevation'], ['elevation', 'roof_plan']] as const) {
      const { steps, skipped } = perspectivePlan(VILLA_FACADE, anchors);
      const running = new Set(steps.map((s) => s.view));
      for (const gap of skipped) expect(running.has(gap.view)).toBe(false);
    }
  });
});

describe('Lời dẫn từng góc', () => {
  const ctx = townhouseCtx();

  it('mọi góc ghép xong không còn chỗ điền nào sót lại', () => {
    for (const view of Object.keys(prompts.perspective.views) as Array<
      keyof typeof prompts.perspective.views
    >) {
      const { prompt } = perspectivePrompt({
        view: view as never,
        context: ctx,
        look: look(),
        prompts,
        peopleAndVehicles: true,
      });
      expect(prompt, `góc ${view}`).not.toMatch(/\{[a-z_]+\}/);
    }
  });

  it('nói ba kích thước, vì tờ mặt đứng chỉ cho biết một', () => {
    const { prompt } = perspectivePrompt({
      view: 'oblique',
      context: ctx,
      look: look(),
      prompts,
      peopleAndVehicles: true,
    });
    expect(prompt).toContain(`${ctx.frontWidthM} m wide across the front`);
    expect(prompt).toContain(`${ctx.depthM} m deep`);
    expect(prompt).toContain(`${ctx.heightM} m from the pavement`);
  });

  it('tắt người và xe thì nói thẳng là không có, nhưng cây vẫn còn', () => {
    const { prompt } = perspectivePrompt({
      view: 'front_day',
      context: ctx,
      look: look(),
      prompts,
      peopleAndVehicles: false,
    });
    expect(prompt).toMatch(/No people anywhere, no cars/);
    expect(prompt).toMatch(/Planting/);
  });

  it('bật thì số xe lấy theo đầu bài, và xe không được chắn lối vào gara', () => {
    const digest = digestOf(TOWNHOUSE);
    const withCars: AiBriefDigest = { ...digest, parking: { cars: 2, motorbikes: 3 } };
    const { prompt } = perspectivePrompt({
      view: 'front_day',
      context: perspectiveContext(withCars, TOWNHOUSE_PLAN, TOWNHOUSE_FACADE),
      look: look(),
      prompts,
      peopleAndVehicles: true,
    });
    expect(prompt).toContain('2 cars');
    expect(prompt).toContain('3 motorbikes');
    // Khuôn trong YAML xuống dòng giữa câu, nên khoảng trắng phải khớp cả `\n`.
    expect(prompt).toMatch(/clear\s+of the garage opening/);
  });

  it('hiện trạng một phía không khai thì KHÔNG nhắc phía ấy — không đoán hộ', () => {
    const digest = digestOf(TOWNHOUSE);
    const oneSide: AiBriefDigest = {
      ...digest,
      site: { ...digest.site, adjacent: { front: null, back: null, left: 'ao_ho', right: null } },
    };
    const { prompt } = perspectivePrompt({
      view: 'aerial',
      context: perspectiveContext(oneSide, TOWNHOUSE_PLAN, TOWNHOUSE_FACADE),
      look: look(),
      prompts,
      peopleAndVehicles: false,
    });
    expect(prompt).toContain('a pond on the left');
    expect(prompt).not.toMatch(/on the right/);
  });

  it('vật liệu nói y như tờ ảnh mặt đứng — một bản mô tả, không phải hai', () => {
    const { prompt } = perspectivePrompt({
      view: 'front_day',
      context: ctx,
      look: look(),
      prompts,
      peopleAndVehicles: false,
    });
    expect(prompt).toContain(look().materials);
    expect(prompt).toContain(look().palette);
  });
});

describe('Trường cấm không lọt vào lời dẫn', () => {
  /**
   * Đánh dấu đầu bài bằng những chuỗi không thể trùng ngẫu nhiên, rồi đòi chúng KHÔNG có mặt.
   *
   * Đây là hàng rào thật của quyết định «rút tập trường trắng»: kiểu trả về của
   * `perspectiveContext` đã chặn bằng cấu trúc, nhưng một lần thêm trường vội vàng về sau sẽ mở
   * lại đường ấy mà không ai để ý — lời dẫn chỉ dài thêm, không đỏ ở đâu cả.
   */
  it('không mang danh sách phòng, nhân khẩu hay chữ tự do của đầu bài', () => {
    const digest = digestOf(TOWNHOUSE);
    const marked: AiBriefDigest = {
      ...digest,
      free_text: {
        design_task: 'DAUBAI-VIEC-THIET-KE',
        functional_needs: 'DAUBAI-NHU-CAU',
        style_note: 'DAUBAI-GHI-CHU-PHONG-CACH',
        site_condition: 'DAUBAI-HIEN-TRANG',
      },
    };
    const ctx = perspectiveContext(marked, TOWNHOUSE_PLAN, TOWNHOUSE_FACADE);
    const joined = (Object.keys(prompts.perspective.views) as string[])
      .map(
        (view) =>
          perspectivePrompt({
            view: view as never,
            context: ctx,
            look: look(),
            prompts,
            peopleAndVehicles: true,
          }).prompt,
      )
      .join('\n');

    for (const marker of [
      'DAUBAI-VIEC-THIET-KE',
      'DAUBAI-NHU-CAU',
      'DAUBAI-GHI-CHU-PHONG-CACH',
      'DAUBAI-HIEN-TRANG',
    ]) {
      expect(joined, `lời dẫn không được mang "${marker}"`).not.toContain(marker);
    }
    // Phòng ốc và nhân khẩu cũng không: bếp, thờ, phòng ngủ không đổi được vẻ ngoài ngôi nhà.
    for (const word of ['altar', 'bedroom', 'kitchen', 'vo_chong', 'ong_ba']) {
      expect(joined.toLowerCase(), `lời dẫn không được mang "${word}"`).not.toContain(word);
    }
  });
});

describe('Đúc bộ ảnh', () => {
  const drawn = (view: DrawnView['view'], n: number): DrawnView => ({
    view,
    uri: `supabase://design-renders/${view}.png`,
    mime: 'image/png',
    widthPx: 1024,
    heightPx: 1024,
    sourceRefs: n === 0 ? [] : ['supabase://design-renders/front_day.png'],
    prompt: `lời dẫn ${view}`,
    provider: 'fixture',
    model: 'viet-tay',
    latencyMs: 1000,
  });

  const base = {
    facadeRef: `sha256:${'a'.repeat(64)}`,
    planRef: `sha256:${'b'.repeat(64)}`,
    anchors: [
      {
        kind: 'elevation' as const,
        uri: 'supabase://design-renders/anchor.png',
        sha256: 'c'.repeat(64),
        bytes: 4096,
      },
    ],
    missing: [],
    peopleAndVehicles: true,
    route: 'ai_image_openai',
    provider: 'openai',
    model: 'gpt-image-2',
    promptVersion: prompts.version,
  };

  it('đúc ra payload qua được hợp đồng, đúng một tấm mang cờ ảnh neo', () => {
    const set: AiImageSet = assembleImageSet({
      ...base,
      drawn: [drawn('front_day', 0), drawn('front_night', 1), drawn('gate_close', 2)],
    });
    expect(() => aiImageSetSchema.parse(set)).not.toThrow();
    expect(set.images.filter((i) => i.anchor)).toHaveLength(1);
    expect(set.images[0]!.anchor).toBe(true);
    expect(set.options?.people_and_vehicles).toBe(true);
  });

  it('thiếu tấm front_day thì DỪNG, không ghi một bộ không có gốc', () => {
    expect(() => assembleImageSet({ ...base, drawn: [drawn('front_night', 1)] })).toThrow(
      ImageSetError,
    );
  });

  it('hai tấm cùng một góc thì dừng', () => {
    expect(() =>
      assembleImageSet({ ...base, drawn: [drawn('front_day', 0), drawn('front_day', 1)] }),
    ).toThrow(ImageSetError);
  });

  it('một góc vừa có ảnh vừa ghi là thiếu thì dừng — hai câu trả lời ngược nhau', () => {
    expect(() =>
      assembleImageSet({
        ...base,
        drawn: [drawn('front_day', 0), drawn('oblique', 1)],
        missing: [{ view: 'oblique', reason: 'Không vẽ được.' }],
      }),
    ).toThrow(ImageSetError);
  });

  it('góc bỏ dở ghi vào `missing` kèm lý do, không lặng lẽ trả về ít ảnh hơn', () => {
    const set = assembleImageSet({
      ...base,
      drawn: [drawn('front_day', 0)],
      missing: [{ view: 'aerial', reason: 'Chưa dựng được tờ mặt bằng mái.' }],
    });
    expect(() => aiImageSetSchema.parse(set)).not.toThrow();
    expect(set.missing).toHaveLength(1);
  });
});

describe('Bước vẽ một góc', () => {
  /** Kho giả: nhớ byte theo URI, và ghi lại thứ tự đã đọc. */
  function fakeStore() {
    const files = new Map<string, Uint8Array>();
    return {
      scheme: 'supabase' as const,
      reads: [] as string[],
      put(key: string, bytes: Uint8Array) {
        const uri = `supabase://design-renders/${key}`;
        files.set(uri, bytes);
        return Promise.resolve(uri);
      },
      get(uri: string) {
        this.reads.push(uri);
        const bytes = files.get(uri);
        if (!bytes) throw new Error(`Kho giả không có ${uri}`);
        return Promise.resolve({ bytes: bytes.buffer as ArrayBuffer, mime: 'image/png' });
      },
    };
  }

  /** Client giả: ghi lại MỌI lời gọi, trả về một tấm PNG nhỏ. */
  function fakeClient() {
    const calls: Array<{
      route: string;
      images: number;
      prompt: string;
      signal?: AbortSignal;
    }> = [];
    return {
      calls,
      generateImage(
        route: string,
        _dataClass: number,
        options: { prompt: string; images: unknown[]; signal?: AbortSignal },
      ) {
        calls.push({
          route,
          images: options.images.length,
          prompt: options.prompt,
          signal: options.signal,
        });
        return Promise.resolve({
          mimeType: 'image/png',
          dataBase64: 'iVBORw0KGgo=',
          provider: 'fixture',
          model: 'viet-tay',
          usage: { inputTokens: 100, outputTokens: 200 },
          latencyMs: 500,
        });
      },
    };
  }

  const FACADE_REF = `sha256:${'a'.repeat(64)}`;
  const PLAN_REF_ID = `sha256:${'b'.repeat(64)}`;

  function fakeRepo() {
    return {
      db: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
      get(id: string) {
        if (id === FACADE_REF) {
          return Promise.resolve({ id, kind: 'ai_facade_concept', payload: VILLA_FACADE });
        }
        if (id === PLAN_REF_ID) {
          return Promise.resolve({ id, kind: 'ai_floor_plan', payload: VILLA_PLAN });
        }
        return Promise.resolve(null);
      },
    };
  }

  function deps(store: ReturnType<typeof fakeStore>, client: ReturnType<typeof fakeClient>) {
    return {
      client,
      prompts,
      vocab: facadeVocab,
      repo: fakeRepo(),
      store,
      provider: 'fixture',
      model: 'viet-tay',
    } as unknown as Parameters<typeof drawViewStep>[0];
  }

  const params = {
    runId: 'run',
    tenantId: 't',
    companyId: 'c',
    projectId: 'p',
    actorId: null,
    discipline: 'kien_truc',
    stage: 'images',
    textRoute: 'ai_image_openai',
    imageRoute: 'ai_image_openai',
    briefRef: 'sha256:00',
    digest: digestOf(VILLA),
    rulePacks: { standards: false, experience: false },
    variants: [],
    planRef: PLAN_REF_ID,
    facadeRef: FACADE_REF,
    peopleAndVehicles: true,
  } as unknown as Parameters<typeof drawViewStep>[1];

  it('gửi đúng những ảnh mà danh sách góc khai, đúng thứ tự', async () => {
    const store = fakeStore();
    const client = fakeClient();
    const anchor = {
      kind: 'elevation' as const,
      uri: await store.put('anchor.png', new Uint8Array([1, 2, 3])),
      sha256: 'c'.repeat(64),
      bytes: 3,
    };

    const day = await drawViewStep(
      deps(store, client),
      params,
      {
        view: 'front_day',
        sources: [{ anchor: 'elevation' }],
      },
      [anchor],
      [],
    );
    expect(client.calls[0]!.images).toBe(1);
    expect(store.reads).toEqual([anchor.uri]);

    store.reads.length = 0;
    await drawViewStep(
      deps(store, client),
      params,
      {
        view: 'front_night',
        sources: [{ image: 'front_day' }],
      },
      [anchor],
      [day],
    );
    // Ảnh ban đêm phải cầm ĐÚNG tấm ban ngày, không cầm lại tờ neo.
    expect(client.calls[1]!.images).toBe(1);
    expect(store.reads).toEqual([day.uri]);
  });

  it('ghi lại URI đã gửi vào `source_refs` — đọc artifact biết tấm nào dẫn xuất từ tấm nào', async () => {
    const store = fakeStore();
    const client = fakeClient();
    const anchor = {
      kind: 'elevation' as const,
      uri: await store.put('anchor.png', new Uint8Array([1, 2, 3])),
      sha256: 'c'.repeat(64),
      bytes: 3,
    };
    const day = await drawViewStep(
      deps(store, client),
      params,
      {
        view: 'front_day',
        sources: [{ anchor: 'elevation' }],
      },
      [anchor],
      [],
    );
    expect(day.sourceRefs).toEqual([anchor.uri]);
    expect(day.prompt).toContain('Shot:');
  });

  it('tín hiệu «Dừng» đi TỚI lời gọi — không thì bấm dừng chỉ có tác dụng ở góc sau', async () => {
    // Một lượt vẽ ảnh kéo tới bốn phút và không phát tiến độ dọc đường. Quên truyền tín hiệu thì
    // màn hình nói «đang dừng» trong khi lời gọi vẫn chạy hết và vẫn tính tiền — không có gì đỏ.
    const store = fakeStore();
    const client = fakeClient();
    const anchor = {
      kind: 'elevation' as const,
      uri: await store.put('anchor.png', new Uint8Array([1, 2, 3])),
      sha256: 'c'.repeat(64),
      bytes: 3,
    };
    const stop = new AbortController();
    await drawViewStep(
      deps(store, client),
      params,
      { view: 'front_day', sources: [{ anchor: 'elevation' }] },
      [anchor],
      [],
      stop.signal,
    );
    expect(client.calls[0]!.signal).toBe(stop.signal);
  });

  it('thiếu tờ neo thì DỪNG, không gọi mô hình — lượt rỗng vẫn tính tiền', async () => {
    const store = fakeStore();
    const client = fakeClient();
    await expect(
      drawViewStep(
        deps(store, client),
        params,
        {
          view: 'oblique',
          sources: [{ anchor: 'roof_plan' }, { image: 'front_day' }],
        },
        [],
        [],
      ),
    ).rejects.toThrow(/roof_plan/);
    expect(client.calls).toHaveLength(0);
  });

  it('góc gốc chưa vẽ xong thì DỪNG, không gọi mô hình', async () => {
    const store = fakeStore();
    const client = fakeClient();
    await expect(
      drawViewStep(
        deps(store, client),
        params,
        {
          view: 'front_night',
          sources: [{ image: 'front_day' }],
        },
        [],
        [],
      ),
    ).rejects.toThrow(/front_day/);
    expect(client.calls).toHaveLength(0);
  });
});

describe('Tờ mặt bằng mái', () => {
  const villa = () => roofPlanAnchorOf(VILLA_PLAN, VILLA_FACADE);
  const townhouse = () => roofPlanAnchorOf(TOWNHOUSE_PLAN, TOWNHOUSE_FACADE);

  it('dựng ra khung ảnh chuẩn, cùng ba khung với ảnh neo mặt đứng', () => {
    for (const sheet of [villa(), townhouse()]) {
      expect(ANCHOR_FRAMES).toContainEqual({
        widthPx: sheet.widthPx,
        heightPx: sheet.heightPx,
      });
    }
  });

  it('KHÔNG viết một chữ nào — mô hình ảnh chép lại chữ nó nhìn thấy', () => {
    for (const sheet of [villa(), townhouse()]) {
      expect(sheet.svg).not.toMatch(/<text/);
    }
  });

  it('mái dốc có đường nóc và bốn đường xiên; mái bằng thì không có đường nào', () => {
    // Biệt thự mẫu lợp mái Thái (bốn dốc), nhà phố mẫu mái bằng.
    expect(VILLA_FACADE.roof.type).toBe('thai');
    expect(TOWNHOUSE_FACADE.roof.type).toBe('flat');
    const lines = (svg: string) => (svg.match(/<line /g) ?? []).length;
    // Mũi tên hướng đường là một `<line>`, lỗ mở mặt tiền mỗi cái một `<line>`.
    expect(lines(villa().svg)).toBeGreaterThan(lines(townhouse().svg));
  });

  it('mái đua chìa ra NGOÀI khối, và không bị cắt mất ở mép ảnh', () => {
    // Hộp bao phải ôm cả mái đua: một mái bị cắt cụt là một mái mô hình vẽ lại cụt y vậy.
    const sheet = villa();
    expect(sheet.svg).toMatch(/<path/);
    expect(sheet.notes.every((note) => note.code !== 'roof_plan_mixed')).toBe(true);
  });

  // ── Bốn chỗ đã dựng SAI ở bản đầu và chỉ lộ ra khi mở tờ vẽ ra nhìn ─────────────────────
  it('lối vào vẽ bằng hình TÔ ĐẶC, không phải một nét trùng bề dày tường', () => {
    // Bản đầu vẽ lối vào bằng `<line>` lớp `opening` — cùng 0,25 mm với nét tường nó nằm đè lên,
    // nên hai cửa của biệt thự mẫu không nhìn thấy được. Bộ kiểm khi ấy vẫn xanh.
    const svg = villa().svg;
    expect((svg.match(/<rect class="rn"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toMatch(/\.rn\{fill:[^;]+;stroke:none\}/);
  });

  it('mũi tên chỉ VỀ PHÍA nhà — cánh đầu mũi nằm bên đuôi, không nằm quá mũi', () => {
    // Bộ đổi toạ độ lật trục y (mặt tiền nằm ở ĐÁY tờ), nên đặt cứng «cánh phía trên mũi» cho ra
    // một mũi tên chỉ ra xa nhà. Đúng ngược thứ nó phải nói, mà tờ vẽ vẫn trông bình thường.
    const svg = villa().svg;
    const line = /<line class="ra" x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/.exec(svg);
    const poly = /<polyline class="ra" points="([^"]+)"/.exec(svg);
    expect(line).not.toBeNull();
    expect(poly).not.toBeNull();
    const tailY = Number(line![1]);
    const tipY = Number(line![2]);
    const barbs = poly![1]!.split(' ').map((pair) => Number(pair.split(',')[1]));
    expect(tipY).toBeLessThan(tailY);
    for (const barb of [barbs[0]!, barbs[2]!]) {
      expect(barb).toBeGreaterThan(tipY);
      expect(barb).toBeLessThan(tailY);
    }
  });

  it('khối nhà là nét ĐẬM NHẤT — đậm hơn mái và hơn tầng dưới', () => {
    // Bản đầu mượn nét của tờ mặt đứng: mái 0,5 mm đè lên khối 0,25 mm, tức thứ hạng đảo ngược.
    const style = parseSheetStyle(read('kb/sheet_style.yaml'));
    expect(style.line_mm.roof_block).toBeGreaterThan(style.line_mm.roof_edge);
    expect(style.line_mm.roof_edge).toBeGreaterThan(style.line_mm.roof_below);
  });

  it('mái bằng KHÔNG vẽ lại mép mái trùng hình bao khối', () => {
    // Hai đường chồng khít nhau trông dày hơn thật, và đọc thành một chi tiết không tồn tại.
    const svg = townhouse().svg;
    const block = /<path class="rb" d="([^"]+)"/.exec(svg)?.[1];
    expect(block).toBeTruthy();
    expect(svg).not.toContain(`<path class="re" d="${block}"`);
  });

  it('cùng dữ liệu vào thì ra cùng chuỗi — điều kiện để máy chủ đối chiếu được cỡ khung', () => {
    expect(roofPlanAnchorOf(VILLA_PLAN, VILLA_FACADE).svg).toBe(
      roofPlanAnchorOf(VILLA_PLAN, VILLA_FACADE).svg,
    );
  });
});

describe('Vẽ lại một góc (Đợt C)', () => {
  const drawn = (view: AiImageSetView, uri: string): DrawnView => ({
    view,
    uri,
    mime: 'image/png',
    widthPx: 1024,
    heightPx: 1024,
    sourceRefs: view === 'front_day' ? ['supabase://a/anchor.png'] : ['supabase://a/front_day.png'],
    prompt: `lời dẫn ${view}`,
    provider: 'fixture',
    model: 'viet-tay',
    latencyMs: 1000,
  });

  const base = {
    facadeRef: `sha256:${'a'.repeat(64)}`,
    planRef: `sha256:${'b'.repeat(64)}`,
    anchors: [
      {
        kind: 'elevation' as const,
        uri: 'supabase://a/anchor.png',
        sha256: 'c'.repeat(64),
        bytes: 4096,
      },
    ],
    peopleAndVehicles: false,
    route: 'ai_image_openai',
    provider: 'openai',
    model: 'gpt-image-2',
    promptVersion: prompts.version,
  };

  it('tấm gốc của bộ KHÔNG vẽ lại lẻ được, và lý do nói bằng tiếng Việt', () => {
    expect(redrawAloneRefusal(SET_ANCHOR_VIEW)).toMatch(/tấm gốc của cả bộ/);
    for (const view of [
      'front_night',
      'gate_close',
      'balcony_close',
      'oblique',
      'aerial',
    ] as const) {
      expect(redrawAloneRefusal(view)).toBeNull();
    }
  });

  it('mốc «tấm gốc» khớp góc mà danh sách bước chạy đầu tiên — một hằng, không hai', () => {
    const { steps } = perspectivePlan(VILLA_FACADE, ['elevation', 'roof_plan']);
    expect(steps[0]!.view).toBe(SET_ANCHOR_VIEW);
  });

  it('bộ mới giữ NGUYÊN uri của những góc không vẽ lại — không sinh lại byte, không tốn tiền', () => {
    const kept = [
      drawn('front_day', 'supabase://a/front_day.png'),
      drawn('gate_close', 'supabase://a/gate.png'),
    ];
    const truoc = assembleImageSet({
      ...base,
      drawn: [...kept, drawn('front_night', 'supabase://a/night-1.png')],
      missing: [],
    });
    const sau = assembleImageSet({
      ...base,
      drawn: [...kept, drawn('front_night', 'supabase://a/night-2.png')],
      missing: [],
    });
    const uriOf = (set: typeof truoc, view: string) => set.images.find((i) => i.view === view)?.uri;
    expect(uriOf(sau, 'front_day')).toBe(uriOf(truoc, 'front_day'));
    expect(uriOf(sau, 'gate_close')).toBe(uriOf(truoc, 'gate_close'));
    expect(uriOf(sau, 'front_night')).not.toBe(uriOf(truoc, 'front_night'));
  });

  it('góc vừa vẽ được thì rời khỏi danh sách thiếu, không nằm ở cả hai chỗ', () => {
    const set = assembleImageSet({
      ...base,
      drawn: [
        drawn('front_day', 'supabase://a/front_day.png'),
        drawn('aerial', 'supabase://a/aerial.png'),
      ],
      // Lớp gọi đã lọc `aerial` khỏi `missing`; nếu quên thì phép đúc phải NỔ chứ không ghi ra một
      // artifact tự mâu thuẫn — đã có phép thử riêng cho chiều ấy.
      missing: [{ view: 'oblique', reason: 'Chưa dựng được tờ mặt bằng mái.' }],
    });
    expect(set.missing?.map((g) => g.view)).toEqual(['oblique']);
    expect(set.images.map((i) => i.view)).toContain('aerial');
  });

  it('lựa chọn người-xe của lượt cũ đi theo bộ mới, không rơi về mặc định', () => {
    const set = assembleImageSet({
      ...base,
      peopleAndVehicles: false,
      drawn: [drawn('front_day', 'supabase://a/front_day.png')],
      missing: [],
    });
    expect(set.options?.people_and_vehicles).toBe(false);
  });
});

describe('Trung thực kích thước (T68)', () => {
  const setback = 300;
  const ctx = () =>
    perspectiveContext(digestOf(VILLA), shiftBack(VILLA_PLAN, setback), VILLA_FACADE);
  const promptOf = (view: Parameters<typeof perspectivePrompt>[0]['view'], people = true) =>
    perspectivePrompt({
      view,
      context: ctx(),
      look: facadeLook(VILLA_FACADE, facadeVocab, prompts),
      prompts,
      peopleAndVehicles: people,
    }).prompt;

  it('chiều sâu sân trước đi vào lời dẫn BẰNG SỐ, ở cả năm góc', () => {
    // Lỗi thật 20/09/2026: đầu bài khai 3 m, lời dẫn chỉ nói «có một sân trước», ảnh ra 8–10 m.
    for (const view of [
      'front_day',
      'front_night',
      'oblique',
      'aerial',
      'balcony_close',
    ] as const) {
      expect(promptOf(view)).toContain('The front yard is therefore 3 m deep');
    }
  });

  it('nói luôn HỆ QUẢ: sân ngắn hơn thân xe thì không có xe nào đỗ trong sân', () => {
    // Con số một mình không đủ. Nói «sân 3 m» rồi vẫn xin «một chiếc ô tô cho sinh động» là ra
    // đúng tấm ảnh đã hỏng — mô hình nới sân cho vừa chiếc xe.
    const text = promptOf('aerial');
    expect(text).toContain('shorter than a car');
    expect(text).toContain('no car may be parked in it');
    // Và câu người-xe KHÔNG được bảo đỗ trong thửa — hai câu ngược nhau thì mô hình chọn một.
    expect(text).not.toContain('parked inside the plot');
    expect(text).toContain('stands in the street at the kerb');
  });

  it('sân đủ rộng thì KHÔNG chèn câu cấm đỗ xe', () => {
    const wide = perspectivePrompt({
      view: 'aerial',
      context: perspectiveContext(digestOf(VILLA), shiftBack(VILLA_PLAN, 800), VILLA_FACADE),
      look: facadeLook(VILLA_FACADE, facadeVocab, prompts),
      prompts,
      peopleAndVehicles: true,
    }).prompt;
    expect(wide).toContain('The front yard is therefore 8 m deep');
    expect(wide).not.toContain('shorter than a car');
    expect(wide).toContain('parked inside the plot');
  });

  it('bề rộng cửa chính và cửa để xe đi vào lời dẫn bằng mét', () => {
    const text = promptOf('front_day');
    const door = VILLA_FACADE.openings_front.find((o) => o.kind === 'door')!;
    expect(text).toContain(`(${Math.round(door.w / 10) / 10} m wide)`);
  });

  it('chiều cao TỪNG tầng, không chỉ tổng — mô hình không được chia đều', () => {
    expect(promptOf('front_day')).toContain('Storey heights from the ground up:');
  });

  it('cổng và rào nói bằng MÉT như phần còn lại, không phải cm', () => {
    const text = promptOf('front_day');
    expect(text).toMatch(/gate [\d.]+ m wide/);
    expect(text).not.toContain(' cm ');
  });

  it('thiếu kích thước thửa thì KHÔNG nói gì về sân — không đoán', () => {
    const noSite = digestOf(VILLA);
    const blind = perspectiveContext(
      { ...noSite, site: { ...noSite.site, width_m: undefined, depth_m: undefined } } as never,
      shiftBack(VILLA_PLAN, setback),
      VILLA_FACADE,
    );
    expect(blind.yard).toBeNull();
    expect(blind.lot).toBeNull();
    const text = perspectivePrompt({
      view: 'aerial',
      context: blind,
      look: facadeLook(VILLA_FACADE, facadeVocab, prompts),
      prompts,
      peopleAndVehicles: true,
    }).prompt;
    expect(text).not.toContain('front yard is');
    expect(text).not.toContain('The plot is');
  });

  it('tờ neo mái VẼ ranh thửa, và khối nhà nằm gọn bên trong', () => {
    // Ràng buộc bằng HÌNH, không chỉ bằng chữ: hai góc trên cao đọc tỉ lệ sân từ tờ này.
    const lot: Array<[number, number]> = [
      [0, 0],
      [1500, 0],
      [1500, 2000],
      [0, 2000],
    ];
    const withLot = roofPlanAnchorOf(shiftBack(VILLA_PLAN, setback), VILLA_FACADE, lot);
    const without = roofPlanAnchorOf(shiftBack(VILLA_PLAN, setback), VILLA_FACADE, null);
    expect(withLot.svg).toContain(`class="${CLS.roofLot}"`);
    expect(without.svg).not.toContain(`class="${CLS.roofLot}"`);
    // Ranh phải nằm TRONG hộp bao, không bị cắt: thêm nó vào thì tờ phải LÙI tỉ lệ ra (mẫu số
    // 1:N lớn hơn) cho vừa khung. Tỉ lệ không đổi nghĩa là ranh đã rơi ra ngoài hộp và bị xén.
    expect(withLot.scale).toBeGreaterThan(without.scale);
  });
});

describe('Tên lớp CSS của bộ vẽ', () => {
  it('không lớp nào trùng tên lớp nào — luật sau đè luật trước, im lặng', () => {
    // T68: `roofLot` từng đặt là `rl`, trùng `railing`. Luật CSS của nó nằm SAU nên lan can của
    // mọi tờ mặt đứng thành nét đứt. Ảnh chụp vàng không bắt được: hình y nguyên, chỉ CSS khác.
    const names = Object.values(CLS);
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [key, value] of Object.entries(CLS)) {
      const first = seen.get(value);
      if (first) clashes.push(`${first} và ${key} cùng dùng "${value}"`);
      else seen.set(value, key);
    }
    expect(clashes).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
  });
});
