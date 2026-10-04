/**
 * Bộ ảnh phối cảnh từ mặt đứng KỸ SƯ tải lên (T114 Đợt 4b, 04/10/2026).
 *
 * Haan: «số tầng nhà và chiều sâu nhà đã có trong đề bài, chiều cao nhà thì có trong bản vẽ mặt đứng
 * (ảnh phối cảnh không cần chính xác 100 % — chỉ cần tương đối 90 %)». Canh:
 *  · khối nhà lấy từ đầu bài (thửa trừ sân mong muốn / khoảng lùi), chiều cao để mô hình đọc từ bản vẽ;
 *  · đủ năm góc, góc nào cũng có ảnh vào (tấm ban ngày neo vào chính bản vẽ tải lên);
 *  · vật liệu theo phần Mặt đứng của đầu bài, mục chưa chốt nói «theo bản vẽ» chứ không bịa;
 *  · bộ ảnh đúc ra qua được hợp đồng với `upload_ref`, không có mã ý tưởng / mặt bằng.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { aiImageSetSchema, emptyFacadeBrief, type AiBriefDigest } from '@nvg/shared/design';
import { facadeLookFromBrief } from '../ai/facade/image';
import { assembleImageSet } from '../ai/perspective/assemble';
import { perspectiveContextFromBrief } from '../ai/perspective/context';
import { perspectivePrompt } from '../ai/perspective/prompt';
import { perspectivePlanFromUpload } from '../ai/perspective/views';
import { digestFor } from '../brief/slice';
import { drawViewStep } from '../workflows/ai-perspective-steps';
import { digestOf, VILLA } from './ai-digest-fixtures';
import { facadeVocab } from './ai-facade-fixtures';
import { prompts } from './ai-real-context';

/** Biệt thự mẫu 15 × 20 m, lùi trước 4 m (đầu bài mẫu). */
const villa = (): AiBriefDigest => digestFor(digestOf(VILLA), 'perspective');

describe('Khối nhà theo đầu bài', () => {
  it('thửa trừ khoảng lùi; chiều cao để trống — nằm trên bản vẽ', () => {
    const ctx = perspectiveContextFromBrief(villa());
    expect(ctx.storeys).toBe(2);
    expect(ctx.frontWidthM).toBe(15);
    expect(ctx.depthM).toBe(16);
    expect(ctx.heightM).toBeNull();
    expect(ctx.yard).toEqual({ frontM: 4, backM: 0, leftM: 0, rightM: 0 });
    expect(ctx.lot).toEqual({ widthM: 15, depthM: 20 });
  });

  it('sân mong muốn thắng khoảng lùi bắt buộc', () => {
    const digest = villa();
    const withYards = {
      ...digest,
      massing: { ...(digest.massing ?? {}), yard_depth_m: { front: 6, back: 3, left: 1.5 } },
    } as AiBriefDigest;
    const ctx = perspectiveContextFromBrief(withYards);
    expect(ctx.depthM).toBe(11);
    expect(ctx.frontWidthM).toBe(13.5);
    expect(ctx.yard?.frontM).toBe(6);
  });

  it('lời dẫn nói chiều cao theo bản vẽ gửi kèm, vẫn nói số tầng và chiều sâu', () => {
    const prompt = perspectivePrompt({
      view: 'oblique',
      context: perspectiveContextFromBrief(villa()),
      look: facadeLookFromBrief(null, facadeVocab, prompts),
      prompts,
      peopleAndVehicles: true,
    });
    expect(prompt.prompt).toContain('as tall as the attached front elevation drawing shows');
    expect(prompt.prompt).toContain('2-storey');
    expect(prompt.prompt).toContain('16 m deep');
    expect(prompt.prompt).not.toMatch(/null|undefined|NaN/);
  });
});

describe('Danh sách góc', () => {
  it('đủ năm góc; tấm ban ngày neo vào bản vẽ tải lên, các góc khác dựng từ tấm ban ngày', () => {
    const plan = perspectivePlanFromUpload(false);
    expect(plan.skipped).toEqual([]);
    expect(plan.steps.map((s) => s.view)).toEqual([
      'front_day',
      'front_night',
      'gate_close',
      'oblique',
      'aerial',
    ]);
    expect(plan.steps[0]!.sources).toEqual([{ anchor: 'elevation' }]);
    for (const step of plan.steps.slice(1)) {
      expect(step.sources).toEqual([{ image: 'front_day' }]);
    }
  });

  it('đầu bài bắt buộc ban công mặt trước thì cận cảnh ban công', () => {
    expect(perspectivePlanFromUpload(true).steps.map((s) => s.view)).toContain('balcony_close');
  });
});

describe('Vật liệu theo phần Mặt đứng của đầu bài', () => {
  it('chưa chốt gì thì «theo bản vẽ», không bịa vật liệu', () => {
    const look = facadeLookFromBrief(emptyFacadeBrief(), facadeVocab, prompts);
    expect(look.roof).toBe('roof as drawn');
    expect(look.materials).toContain('as drawn');
    expect(look.gateFence).toBe('exactly as drawn on the attached elevation');
  });

  it('mục đã chốt đi vào đúng chỗ', () => {
    const brief = { ...emptyFacadeBrief(), style: 'hien_dai' as const };
    brief.roof = { ...brief.roof, type: 'hip', pitch_deg: 30 };
    brief.decorations = ['canopy'];
    const look = facadeLookFromBrief(brief, facadeVocab, prompts);
    expect(look.style).toBe(prompts.facadeImage.styles.hien_dai);
    expect(look.roof).toContain(prompts.facadeImage.roofs.hip);
    expect(look.roof).toContain('30 degrees');
    expect(look.elements).toBe('canopy');
  });
});

describe('Đúc bộ ảnh từ bản tải lên', () => {
  it('qua được hợp đồng: có `upload_ref`, không mã ý tưởng / mặt bằng', () => {
    const set = assembleImageSet({
      facadeRef: null,
      planRef: null,
      uploadRef: `sha256:${'d'.repeat(64)}`,
      anchors: [
        {
          kind: 'elevation',
          uri: 'supabase://design-renders/p/upload/x.png',
          sha256: 'e'.repeat(64),
          bytes: 4096,
        },
      ],
      drawn: [
        {
          view: 'front_day',
          uri: 'supabase://design-renders/front_day.png',
          mime: 'image/png',
          widthPx: 1536,
          heightPx: 1024,
          sourceRefs: ['supabase://design-renders/p/upload/x.png'],
          prompt: 'lời dẫn',
          provider: 'fixture',
          model: 'viet-tay',
          latencyMs: 1000,
        },
      ],
      missing: [],
      peopleAndVehicles: true,
      route: 'ai_image_openai',
      provider: 'openai',
      model: 'gpt-image-2',
      promptVersion: prompts.version,
    });
    expect(() => aiImageSetSchema.parse(set)).not.toThrow();
    expect(set.upload_ref).toBe(`sha256:${'d'.repeat(64)}`);
    expect(set.facade_ref).toBeNull();
    expect(set.plan_ref).toBeNull();
  });
});

describe('Bước vẽ góc ban ngày từ bản tải lên', () => {
  it('gửi đúng bản vẽ đã tải làm ảnh neo, vật liệu lấy từ đầu bài đã xác nhận', async () => {
    const BRIEF_REF = `sha256:${'f'.repeat(64)}`;
    const UPLOAD_URI = 'supabase://design-renders/p/upload/x.png';
    const files = new Map<string, Uint8Array>([[UPLOAD_URI, new Uint8Array([1, 2, 3])]]);
    const reads: string[] = [];
    const calls: Array<{ images: number; prompt: string }> = [];
    const brief = { ...VILLA, style: 'indochine', facade: { roof: { type: 'hip' } } };
    const deps = {
      client: {
        generateImage(
          _route: string,
          _cls: number,
          options: { prompt: string; images: unknown[] },
        ) {
          calls.push({ images: options.images.length, prompt: options.prompt });
          return Promise.resolve({
            mimeType: 'image/png',
            dataBase64: 'iVBORw0KGgo=',
            provider: 'fixture',
            model: 'viet-tay',
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
          });
        },
      },
      prompts,
      vocab: facadeVocab,
      repo: {
        db: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
        get: (id: string) =>
          Promise.resolve(id === BRIEF_REF ? { id, kind: 'design_brief', payload: brief } : null),
      },
      store: {
        put: (key: string) => Promise.resolve(`supabase://design-renders/${key}`),
        get(uri: string) {
          reads.push(uri);
          return Promise.resolve({
            bytes: files.get(uri)!.buffer as ArrayBuffer,
            mime: 'image/png',
          });
        },
      },
      provider: 'fixture',
      model: 'viet-tay',
    } as unknown as Parameters<typeof drawViewStep>[0];
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
      briefRef: BRIEF_REF,
      digest: digestOf(VILLA),
      rulePacks: { standards: false, experience: false },
      variants: [],
      planRef: null,
      facadeRef: null,
      facadeUploadRef: `sha256:${'d'.repeat(64)}`,
      peopleAndVehicles: false,
    } as unknown as Parameters<typeof drawViewStep>[1];

    const step = perspectivePlanFromUpload(false).steps[0]!;
    const drawn = await drawViewStep(
      deps,
      params,
      step,
      [{ kind: 'elevation', uri: UPLOAD_URI, sha256: 'e'.repeat(64), bytes: 3 }],
      [],
    );
    expect(drawn.view).toBe('front_day');
    expect(reads).toEqual([UPLOAD_URI]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.images).toBe(1);
    expect(calls[0]!.prompt).toContain(prompts.facadeImage.styles.indochine);
    expect(calls[0]!.prompt).toContain(prompts.facadeImage.roofs.hip);
    expect(calls[0]!.prompt).toContain('as tall as the attached front elevation drawing shows');
  });
});
