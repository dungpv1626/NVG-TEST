/**
 * Ảnh NỘI THẤT MỘT PHÒNG vẽ thẳng từ ĐẦU BÀI — phần THUẦN (B3b «bộ ý tưởng cho khách», anh Dũng 30/10/2026).
 *
 * Khác ảnh mặt bằng có nội thất (T57): KHÔNG có ảnh neo, vì chưa có mặt bằng. Kiến trúc sư chọn MỘT phòng trong
 * `required_spaces` của đầu bài; lời dẫn ghép từ:
 *  · loại phòng (cụm tiếng Anh ở `room_image.rooms` của `kb/ai_design_prompts.yaml` — chỉ loại có ở đó mới chọn
 *    được, thang / gara / giếng trời không phải nội thất để trình khách);
 *  · tầng và diện tích ĐẦU BÀI khai (không khai thì nói «not specified», không bịa số);
 *  · phong cách đầu bài — cùng câu `prompt.interior` của `kb/style_catalogue.yaml` mà ảnh mặt bằng có nội thất
 *    dùng (`sheetImage.styles`); thiếu mã thì bỏ hẳn mệnh đề, không đoán phong cách hộ khách;
 *  · số người theo vai trong gia đình và vài câu nếp sinh hoạt ĐÃ trả lời (`room_image.notes`).
 *
 * Đầu vào là đầu bài ĐÃ LƯỢC DANH TÍNH (`anonymiseForAi`) — hàm không nhận mã hồ sơ, tên hay địa chỉ, nên không có
 * đường nào viết chúng vào lời dẫn (T12, hạng 2). Ô chữ tự do (`amenities`, ghi chú) KHÔNG gửi: một dòng ghi chú
 * dễ mang tên người, và ảnh không cần nó để ra đúng phòng.
 *
 * Tệp thuần: không `fetch`, không kho, không CSDL — kiểm thử được bằng client giả.
 */

import type { AiBriefDigest, AiRoomImage } from '@nvg/shared/design';
import type { AiImageOptions } from '../llm/text-client';
import type { AiPrompts } from './prompts';

/** Phiên bản hợp đồng `ai-room-image` mà tệp này đúc ra. */
const SCHEMA_VERSION = '1.0.0';

export interface BriefRoom {
  /** `<loại>:<tầng hoặc 0>:<thứ tự trong đầu bài>` — ổn định khi đầu bài không đổi. */
  key: string;
  type: string;
  floor: number | null;
  areaM2: number | null;
}

/**
 * Phòng VẼ ĐƯỢC của đầu bài, theo thứ tự đầu bài khai. Khoá mang thứ tự trong `required_spaces` để hai phòng
 * ngủ cùng tầng là hai dòng khác nhau.
 */
export function briefRooms(digest: AiBriefDigest, prompts: AiPrompts): BriefRoom[] {
  const drawable = prompts.roomImage.rooms;
  return (digest.required_spaces ?? []).flatMap((space, index) =>
    space.type in drawable
      ? [
          {
            key: `${space.type}:${space.floor ?? 0}:${index}`,
            type: space.type,
            floor: typeof space.floor === 'number' ? space.floor : null,
            areaM2: typeof space.area_m2 === 'number' ? space.area_m2 : null,
          },
        ]
      : [],
  );
}

export interface RoomImagePrompt {
  system: string;
  prompt: string;
}

/** Giá trị theo đường dẫn chấm trên đầu bài — `lifestyle.cooking`. Vắng thì `undefined`. */
function valueAt(digest: AiBriefDigest, path: string): unknown {
  let node: unknown = digest;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** «2 child(ren), 2 adult(s) of the main couple» — chỉ vai có trong bảng `roles`, số người > 0. */
function householdText(digest: AiBriefDigest, prompts: AiPrompts): string {
  const counts = new Map<string, number>();
  for (const member of digest.family ?? []) {
    const phrase = prompts.roomImage.roles[member.role];
    if (!phrase || !(member.count > 0)) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + member.count);
  }
  return [...counts].map(([phrase, count]) => `${count} ${phrase}`).join(', ');
}

/** Câu nếp sinh hoạt áp vào loại phòng này — chỉ câu ĐÃ trả lời đúng giá trị khai (không `?? false`). */
function notesFor(digest: AiBriefDigest, prompts: AiPrompts, type: string): string[] {
  return prompts.roomImage.notes
    .filter((note) => note.rooms.length === 0 || note.rooms.includes(type))
    .filter((note) => {
      const value = valueAt(digest, note.when.path);
      return value !== undefined && value !== null && String(value) === note.when.value;
    })
    .map((note) => note.en);
}

/** Một chữ số thập phân, bỏ số 0 thừa — cùng cách lời dẫn ảnh nói mét. */
function oneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function roomImagePrompt(input: {
  digest: AiBriefDigest;
  room: BriefRoom;
  prompts: AiPrompts;
  /** Mã phong cách đầu bài; `null` = chưa chọn. */
  styleCode: string | null;
}): RoomImagePrompt {
  const { digest, room, prompts } = input;
  const block = prompts.roomImage;
  const phrase = block.rooms[room.type];
  if (!phrase) throw new Error(`Loại phòng "${room.type}" không có trong danh sách vẽ được.`);
  const styleLine = input.styleCode ? prompts.sheetImage.styles[input.styleCode] : undefined;
  const household = householdText(digest, prompts);
  const notes = notesFor(digest, prompts, room.type);
  const prompt = block.user
    .replace('{room}', () => phrase)
    .replace('{floor}', () =>
      room.floor === null ? 'not specified' : `storey ${room.floor} of ${digest.floors}`,
    )
    .replace('{area}', () =>
      room.areaM2 === null ? 'not specified' : `about ${oneDecimal(room.areaM2)} m2`,
    )
    .replace('{household}', () => [household || 'not specified', ...notes].join('\n'))
    .replace('{style}', () => (styleLine ? `Style: ${styleLine}` : ''))
    .trim();
  return { system: block.system.trim(), prompt };
}

/** Lời gọi CHỮ → ẢNH: không ảnh vào nào — chưa có mặt bằng để làm neo. */
export function roomImageCallOptions(prompt: RoomImagePrompt): AiImageOptions {
  return { system: prompt.system, prompt: prompt.prompt, images: [] };
}

export interface AssembleRoomImageInput {
  briefRef: string;
  room: BriefRoom;
  styleCode: string | null;
  uri: string;
  mime: string;
  widthPx: number | null;
  heightPx: number | null;
  prompt: string;
  route: string;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number | null;
}

/** Đúc payload `ai_room_image`. `watermark_applied` luôn `false` — ảnh hiện nguyên bản (T154). */
export function assembleRoomImage(input: AssembleRoomImageInput): AiRoomImage {
  return {
    schema_version: SCHEMA_VERSION,
    brief_ref: input.briefRef,
    room: {
      key: input.room.key,
      type: input.room.type,
      floor: input.room.floor,
      area_m2: input.room.areaM2,
    },
    style: input.styleCode,
    uri: input.uri,
    mime: input.mime as AiRoomImage['mime'],
    width: input.widthPx,
    height: input.heightPx,
    watermark_applied: false,
    prompt_excerpt: input.prompt.slice(0, 1200),
    generator: {
      kind: 'ai',
      provider: input.provider,
      model: input.model,
      route: input.route,
      prompt_version: input.promptVersion,
      latency_ms: input.latencyMs,
    },
  };
}
