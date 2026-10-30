/**
 * Ảnh nội thất TỪNG PHÒNG vẽ thẳng từ đầu bài (B3b «bộ ý tưởng cho khách», 30/10/2026).
 *
 * Canh:
 *  · chỉ phòng có cụm tiếng Anh trong `room_image.rooms` mới chọn được (gara, thang không phải nội thất);
 *  · lời dẫn ghép từ loại phòng, tầng, diện tích ĐẦU BÀI khai, phong cách và nếp sinh hoạt ĐÃ trả lời —
 *    không số bịa, không chữ tự do, không mã hồ sơ;
 *  · lời gọi CHỮ → ẢNH: không ảnh vào nào;
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
  roomImageCallOptions,
  roomImagePrompt,
} from '../ai/room-image';
import { pngSize } from '../ai/sheet-image';
import { aiFakeOn, fakeImageClient, FAKE_PROVIDER } from '../llm/fake-image';
import { decodeBase64 } from '../llm/image-bytes';
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
