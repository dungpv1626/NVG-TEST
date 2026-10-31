/**
 * Ảnh nội thất TỪNG PHÒNG vẽ thẳng từ đầu bài (B3b «bộ ý tưởng cho khách», 30/10/2026).
 *
 * Canh:
 *  · chỉ phòng có cụm tiếng Anh trong `room_image.rooms` mới chọn được (gara, thang không phải nội thất);
 *  · lời dẫn ghép từ loại phòng, tầng, diện tích ĐẦU BÀI khai, phong cách và nếp sinh hoạt ĐÃ trả lời —
 *    không số bịa, không chữ tự do, không mã hồ sơ;
 *  · lời gọi CHỮ → ẢNH: không ảnh vào nào — trừ ảnh mặt ngoài làm mẫu khi tuyến nhận ảnh vào (9.18.0);
 *  · «bảng vật liệu chung» suy tất định từ ý tưởng mặt đứng; chưa có mặt đứng thì lời dẫn y như 9.17.0;
 *  · artifact đúc ra qua hợp đồng `ai-room-image`;
 *  · client giả lập (`AI_FAKE`) trả PNG đọc được cỡ khung, không tốn tiền.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { aiRoomImageSchema, type AiBriefDigest, type DesignBrief } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import {
  assembleRoomImage,
  briefRooms,
  deriveSharedPalette,
  roomImageCallOptions,
  roomImagePrompt,
  sharedPaletteText,
} from '../ai/room-image';
import { pngSize } from '../ai/sheet-image';
import { aiFakeOn, fakeImageClient, FAKE_PROVIDER } from '../llm/fake-image';
import { decodeBase64 } from '../llm/image-bytes';
import { ModelRouter } from '../llm/router';
import { facadeVocab, TOWNHOUSE_FACADE } from './ai-facade-fixtures';
import { digestOf, VILLA } from './ai-digest-fixtures';
import { prompts } from './ai-real-context';

const villa = (): AiBriefDigest =>
  digestOf({
    ...VILLA,
    style: 'hien_dai',
    required_spaces: [
      { type: 'living', floor: 1, area_m2: 32 },
      { type: 'garage', floor: 1 },
      { type: 'kitchen', floor: 1 },
      { type: 'bedroom', floor: 2, area_m2: 14.25 },
      { type: 'bedroom', floor: 2, area_m2: 12 },
      { type: 'altar_room', floor: 2 },
      { type: 'stair' },
    ],
    lifestyle: { cooking: 'nau_nhieu_chien_xao', pets: 'cho' },
  } as DesignBrief);

describe('Danh sách phòng vẽ được', () => {
  const rooms = briefRooms(villa(), prompts);

  it('bỏ gara và thang; hai phòng ngủ cùng tầng là hai dòng', () => {
    expect(rooms.map((r) => r.type)).toEqual([
      'living',
      'kitchen',
      'bedroom',
      'bedroom',
      'altar_room',
    ]);
    expect(new Set(rooms.map((r) => r.key)).size).toBe(rooms.length);
    expect(rooms.find((r) => r.type === 'living')).toMatchObject({ floor: 1, areaM2: 32 });
  });

  it('ban công, sân thượng, giặt phơi vẽ được; gara vẫn không (anh Dũng 30/10/2026)', () => {
    const drawable = Object.keys(prompts.roomImage.rooms);
    for (const type of ['balcony', 'terrace', 'laundry']) expect(drawable).toContain(type);
    expect(drawable).not.toContain('garage');
  });

  it('loại phòng nào chọn được là DỮ LIỆU — mọi loại trong bảng đều có trong từ vựng phòng', () => {
    for (const type of Object.keys(prompts.roomImage.rooms)) expect(type).toMatch(/^[a-z_]+$/);
  });
});

describe('Lời dẫn ảnh phòng', () => {
  const digest = villa();
  const rooms = briefRooms(digest, prompts);
  const kitchen = rooms.find((r) => r.type === 'kitchen')!;
  const bedroom = rooms.find((r) => r.type === 'bedroom')!;

  it('phòng ngủ: loại phòng, tầng trên tổng số tầng, diện tích đầu bài, phong cách', () => {
    const { prompt } = roomImagePrompt({ digest, room: bedroom, prompts, styleCode: 'hien_dai' });
    expect(prompt).toContain('Room: bedroom');
    expect(prompt).toContain('storey 2 of 2');
    expect(prompt).toContain('about 14.3 m2');
    expect(prompt).toContain(`Style: ${prompts.sheetImage.styles.hien_dai}`);
    // Thành phần gia đình bằng số người theo vai, không tên.
    expect(prompt).toMatch(/2 grandparent\(s\)/);
    // Câu bếp không lọt sang phòng ngủ; câu thú nuôi áp mọi phòng.
    expect(prompt).not.toMatch(/range hood/);
    expect(prompt).toMatch(/keeps a dog/);
  });

  it('bếp: câu nếp nấu nướng đã trả lời đi vào; diện tích chưa khai thì nói «not specified»', () => {
    const { prompt } = roomImagePrompt({ digest, room: kitchen, prompts, styleCode: null });
    expect(prompt).toMatch(/range hood/);
    expect(prompt).toContain('Floor area: not specified');
    // Chưa chọn phong cách thì bỏ hẳn mệnh đề, không đoán.
    expect(prompt).not.toMatch(/Style:/);
  });

  it('không mang mã hồ sơ, địa phương hay chữ tự do của đầu bài', () => {
    const { prompt, system } = roomImagePrompt({
      digest,
      room: bedroom,
      prompts,
      styleCode: 'hien_dai',
    });
    const all = `${system}\n${prompt}`;
    expect(all).not.toContain(VILLA.project_id);
    expect(all).not.toContain('hung_yen');
  });

  it('lời gọi CHỮ → ẢNH: không ảnh vào nào', () => {
    const options = roomImageCallOptions(
      roomImagePrompt({ digest, room: bedroom, prompts, styleCode: null }),
    );
    expect(options.images).toEqual([]);
    expect(options.system.length).toBeGreaterThan(0);
  });
});

describe('Artifact và client giả lập', () => {
  it('tấm đúc ra qua hợp đồng ai-room-image, không in dấu', () => {
    const room = briefRooms(villa(), prompts)[0]!;
    const payload = assembleRoomImage({
      briefRef: `sha256:${'b'.repeat(64)}`,
      room,
      styleCode: 'hien_dai',
      uri: 'supabase://design-renders/x.png',
      mime: 'image/png',
      widthPx: 64,
      heightPx: 48,
      prompt: 'x'.repeat(2000),
      route: 'ai_image_openai',
      provider: FAKE_PROVIDER,
      model: 'gia-lap',
      promptVersion: prompts.version,
      latencyMs: 0,
    });
    const parsed = aiRoomImageSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(payload.watermark_applied).toBe(false);
    expect(payload.prompt_excerpt).toHaveLength(1200);
  });

  it('AI_FAKE bật theo «1» hoặc theo tên chức năng', () => {
    expect(aiFakeOn({ AI_FAKE: '1' }, 'room_image')).toBe(true);
    expect(aiFakeOn({ AI_FAKE: 'transcribe, room_image' }, 'room_image')).toBe(true);
    expect(aiFakeOn({ AI_FAKE: 'transcribe' }, 'room_image')).toBe(false);
    expect(aiFakeOn({ AI_FAKE: '' }, 'room_image')).toBe(false);
    expect(aiFakeOn({}, 'room_image')).toBe(false);
  });

  it('client giả trả PNG đọc được cỡ khung, không token, nhà cung cấp «gia_lap»', async () => {
    const out = await fakeImageClient().generateImage('ai_image_openai', 2, {
      system: 's',
      prompt: 'p',
      images: [],
    });
    expect(out.provider).toBe(FAKE_PROVIDER);
    expect(out.usage).toEqual({ inputTokens: null, outputTokens: null });
    expect(pngSize(decodeBase64(out.dataBase64))).toEqual({ width: 64, height: 48 });
  });
});

describe('Bảng vật liệu chung từ mặt đứng (9.18.0, «Cách 3»)', () => {
  const digest = villa();
  const bedroom = briefRooms(digest, prompts).find((r) => r.type === 'bedroom')!;
  const FACADE_REF = `sha256:${'f'.repeat(64)}`;
  const palette = deriveSharedPalette({
    facadeRef: FACADE_REF,
    concept: TOWNHOUSE_FACADE,
    vocabulary: facadeVocab,
    prompts,
  });

  it('màu theo palette mặt đứng (tên = mã có đúng mã hex), vật liệu đổi sang cách dùng trong nhà', () => {
    expect(palette.colours).toEqual([
      { role: 'primary', colour: 'trang_kem', hex: '#F1EAD8' },
      { role: 'secondary', colour: 'xam_dam', hex: '#4A4D50' },
      { role: 'accent', colour: 'nau_go', hex: '#8A5A3B' },
    ]);
    // Sơn nước và mái bê tông không có cách dùng trong nhà — màu tường đã ở vai màu.
    expect(palette.materials.map((m) => m.code)).toEqual([
      'da_granite',
      'go_nhua',
      'kinh_cuong_luc',
    ]);
    const text = sharedPaletteText({
      palette,
      vocabulary: facadeVocab,
      prompts,
      withReference: false,
    });
    expect(text).toContain('- main wall colour: cream white (#F1EAD8)');
    expect(text).toContain('- warm wood brown wood-look panels for cabinetry and one accent wall');
    expect(text).toContain('- clear glass partitions and balustrades');
    expect(text).not.toContain('{colour}');
    expect(text).not.toContain('EXTERIOR');
    const { prompt } = roomImagePrompt({
      digest,
      room: bedroom,
      prompts,
      styleCode: 'hien_dai',
      paletteText: text,
    });
    expect(prompt).toContain(prompts.roomImage.sharedPalette.header.trim());
    expect(prompt).toContain('charcoal grey');
  });

  it('mọi mã vật liệu trong bảng ánh xạ có trong danh mục mặt đứng (không mã chết)', () => {
    for (const code of Object.keys(prompts.roomImage.sharedPalette.materials)) {
      expect(code in facadeVocab.materials || code in facadeVocab.roofMaterials).toBe(true);
    }
    for (const code of prompts.roomImage.sharedPalette.colourSkip) {
      expect(code in facadeVocab.colours).toBe(true);
    }
    for (const view of prompts.roomImage.sharedPalette.referenceViews) {
      expect(prompts.perspective.views[view]).toBeDefined();
    }
  });

  it('chưa có mặt đứng → lời dẫn y như 9.17.0 (không chỗ điền thừa, không dòng trống thừa)', () => {
    const legacy = {
      ...prompts,
      roomImage: { ...prompts.roomImage, user: prompts.roomImage.user.replace('\n{palette}', '') },
    };
    expect(legacy.roomImage.user).not.toContain('{palette}');
    for (const styleCode of ['hien_dai', null]) {
      const now = roomImagePrompt({ digest, room: bedroom, prompts, styleCode });
      const before = roomImagePrompt({ digest, room: bedroom, prompts: legacy, styleCode });
      expect(now).toEqual(before);
      expect(
        roomImagePrompt({
          digest,
          room: bedroom,
          prompts,
          styleCode,
          paletteText: sharedPaletteText({
            palette: null,
            vocabulary: facadeVocab,
            prompts,
            withReference: true,
          }),
        }),
      ).toEqual(before);
    }
  });

  it('ảnh mẫu: chỉ kèm khi được đưa vào, đúng MỘT ảnh, và lời dẫn có câu dặn không vẽ mặt ngoài', () => {
    const reference = {
      artifactRef: `sha256:${'c'.repeat(64)}`,
      kind: 'ai_image_set' as const,
      view: 'front_day',
      uri: 'supabase://design-renders/pc.png',
      image: { mimeType: 'image/png', dataBase64: 'AAAA' },
    };
    const withRef = roomImagePrompt({
      digest,
      room: bedroom,
      prompts,
      styleCode: null,
      paletteText: sharedPaletteText({
        palette,
        vocabulary: facadeVocab,
        prompts,
        withReference: true,
      }),
    });
    expect(withRef.prompt).toContain(prompts.roomImage.sharedPalette.referenceNote.trim());
    expect(roomImageCallOptions(withRef, reference).images).toEqual([reference.image]);
    expect(roomImageCallOptions(withRef).images).toEqual([]);

    const payload = assembleRoomImage({
      briefRef: `sha256:${'b'.repeat(64)}`,
      room: bedroom,
      styleCode: null,
      uri: 'supabase://design-renders/x.png',
      mime: 'image/png',
      widthPx: 64,
      heightPx: 48,
      prompt: withRef.prompt,
      route: 'ai_image_gemini',
      provider: FAKE_PROVIDER,
      model: 'gia-lap',
      promptVersion: prompts.version,
      latencyMs: 0,
      palette,
      reference,
    });
    expect(aiRoomImageSchema.safeParse(payload).success).toBe(true);
    expect(payload.shared_palette).toMatchObject({
      facade_ref: FACADE_REF,
      materials: ['da_granite', 'go_nhua', 'kinh_cuong_luc'],
      reference: { kind: 'ai_image_set', view: 'front_day' },
    });
  });

  it('tuyến nào nhận ảnh vào: Gemini có, OpenAI chỉ khi khai đường sửa ảnh, Pollinations không', () => {
    const router = new ModelRouter({
      version: '1',
      routes: {
        g: { provider: 'gemini_paid', model: 'g', max_data_class: 2, enabled: true },
        o: {
          provider: 'openai',
          model: 'o',
          max_data_class: 2,
          enabled: true,
          endpoint_edit: 'https://x/edits',
        },
        o2: { provider: 'openai', model: 'o', max_data_class: 2, enabled: true },
        p: { provider: 'pollinations', model: 'p', max_data_class: 2, enabled: true },
      },
    });
    expect(['g', 'o', 'o2', 'p', 'khong_co'].map((r) => router.acceptsInputImages(r))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('AI_FAKE vẫn vẽ được khi có ảnh mẫu', async () => {
    const out = await fakeImageClient().generateImage('ai_image_gemini', 2, {
      system: 's',
      prompt: 'p',
      images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }],
    });
    expect(out.provider).toBe(FAKE_PROVIDER);
  });
});
