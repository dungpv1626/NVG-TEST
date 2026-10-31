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
 *  · số người theo vai trong gia đình và vài câu nếp sinh hoạt ĐÃ trả lời (`room_image.notes`);
 *  · «bảng vật liệu chung» (9.18.0, «Cách 3», anh Dũng duyệt 31/10/2026): khi hồ sơ có ý tưởng mặt đứng hiện hành
 *    của đầu bài đang xác nhận, màu chính / phụ / nhấn và vật liệu của nó (đổi sang cách dùng trong nhà theo
 *    `room_image.shared_palette`) để các phòng trông như CÙNG MỘT nhà. Có thể kèm MỘT ảnh mặt ngoài làm mẫu — chỉ khi
 *    tuyến ảnh nhận ảnh vào; ảnh ấy do mô hình vẽ, không mang danh tính (hạng 2). Không có mặt đứng thì lời dẫn y
 *    như trước.
 *
 * Đầu vào là đầu bài ĐÃ LƯỢC DANH TÍNH (`anonymiseForAi`) — hàm không nhận mã hồ sơ, tên hay địa chỉ, nên không có
 * đường nào viết chúng vào lời dẫn (T12, hạng 2). Ô chữ tự do (`amenities`, ghi chú) KHÔNG gửi: một dòng ghi chú
 * dễ mang tên người, và ảnh không cần nó để ra đúng phòng.
 *
 * Tệp thuần: không `fetch`, không kho, không CSDL — kiểm thử được bằng client giả.
 */

import type { AiBriefDigest, AiFacadeConcept, AiRoomImage } from '@nvg/shared/design';
import type { FacadeVocabulary } from '../kb/facade-vocabulary';
import type { GenerateImagePart } from '../llm/gemini';
import type { AiImageOptions } from '../llm/text-client';
import type { AiPrompts } from './prompts';

/** Phiên bản hợp đồng `ai-room-image` mà tệp này đúc ra (1.1.0: thêm `shared_palette`). */
const SCHEMA_VERSION = '1.1.0';

type PaletteRoleKey = 'primary' | 'secondary' | 'accent';
const PALETTE_ROLES: readonly PaletteRoleKey[] = ['primary', 'secondary', 'accent'];

/** Một vai màu đã suy — `colour` là mã `kb/facade_vocabulary.yaml` (rỗng khi không mã nào khớp). */
export interface SharedPaletteColour {
  role: PaletteRoleKey;
  colour: string | null;
  hex: string | null;
}

/** «Bảng vật liệu chung» suy TẤT ĐỊNH từ một ý tưởng mặt đứng. */
export interface SharedPalette {
  facadeRef: string;
  colours: SharedPaletteColour[];
  /** Mã vật liệu mặt đứng có cách dùng trong nhà, đúng thứ tự đưa vào lời dẫn. */
  materials: Array<{ code: string; colour: string | null }>;
}

/** Ảnh mặt ngoài gửi kèm làm mẫu màu / vật liệu. */
export interface PaletteReference {
  artifactRef: string;
  kind: 'ai_image_set' | 'ai_facade_image';
  view: string | null;
  uri: string;
  image: GenerateImagePart;
}

/**
 * Suy bảng vật liệu chung từ ý tưởng mặt đứng. Mọi chữ và ánh xạ ở `room_image.shared_palette` +
 * `kb/facade_vocabulary.yaml`; hàm chỉ chọn:
 *  · vai màu theo `palette` của mặt đứng (màu thật của phương án): tên = mã màu có đúng mã hex ấy, không có thì
 *    màu của vùng đầu tiên trong `where` có khai; màu trong `colour_skip` không nêu thành tên;
 *  · vật liệu theo thứ tự khai của mặt đứng rồi tới vật liệu mái, chỉ mã có cách dùng trong nhà, mỗi mã một lần.
 */
export function deriveSharedPalette(input: {
  facadeRef: string;
  concept: AiFacadeConcept;
  vocabulary: FacadeVocabulary;
  prompts: AiPrompts;
}): SharedPalette {
  const { concept, vocabulary } = input;
  const config = input.prompts.roomImage.sharedPalette;
  const skip = new Set(config.colourSkip);
  const named = (code: string | null | undefined): string | null =>
    code && vocabulary.colours[code] && !skip.has(code) ? code : null;
  const byHex = (hex: string | null | undefined): string | null => {
    if (!hex) return null;
    const found = Object.entries(vocabulary.colours).find(
      ([, entry]) => entry.hex.toLowerCase() === hex.toLowerCase(),
    );
    return named(found?.[0]);
  };
  const hexOf: Record<PaletteRoleKey, string | null> = {
    primary: concept.palette.primary_hex,
    secondary: concept.palette.secondary_hex,
    accent: concept.palette.accent_hex ?? null,
  };

  const seen = new Set<string>();
  const colours: SharedPaletteColour[] = [];
  for (const role of PALETTE_ROLES) {
    const fromSurface = config.colourRoles[role].where
      .map((where) => named(concept.materials.find((m) => m.where === where)?.colour))
      .find((code) => code !== null);
    const hex = hexOf[role];
    const colour = byHex(hex) ?? fromSurface ?? null;
    const key = colour ?? hex?.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    colours.push({ role, colour, hex });
  }

  const materials: SharedPalette['materials'] = [];
  const used = new Set<string>();
  const surfaces = [
    ...concept.materials.map((m) => ({ code: m.material, colour: m.colour })),
    { code: concept.roof.material, colour: concept.roof.colour },
  ];
  for (const { code, colour } of surfaces) {
    if (materials.length >= config.maxMaterials) break;
    if (used.has(code) || !(code in config.materials)) continue;
    used.add(code);
    materials.push({ code, colour: named(colour) });
  }
  return { facadeRef: input.facadeRef, colours, materials };
}

/** Câu `{palette}` của lời dẫn. Bảng rỗng (không màu, không vật liệu) = chuỗi rỗng. */
export function sharedPaletteText(input: {
  palette: SharedPalette | null;
  vocabulary: FacadeVocabulary;
  prompts: AiPrompts;
  withReference: boolean;
}): string {
  const { palette, vocabulary } = input;
  if (!palette || (palette.colours.length === 0 && palette.materials.length === 0)) return '';
  const config = input.prompts.roomImage.sharedPalette;
  const colourName = (code: string | null) => (code ? vocabulary.colours[code]!.prompt_en : '');
  const colourText = (c: SharedPaletteColour) =>
    c.colour && c.hex
      ? `${colourName(c.colour)} (${c.hex})`
      : colourName(c.colour) || (c.hex ?? '');
  const lines = [
    config.header.trim(),
    ...palette.colours.map((c) =>
      config.colourLine
        .replace('{role}', () => config.colourRoles[c.role].en)
        .replace('{colour}', () => colourText(c)),
    ),
    ...palette.materials.map((m) =>
      config.materialLine.replace('{material}', () =>
        config.materials[m.code]!.replace('{colour}', () => colourName(m.colour))
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    ),
    config.footer.trim(),
    ...(input.withReference ? [config.referenceNote.trim()] : []),
  ];
  return lines.join('\n');
}

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
  /** Câu `{palette}` đã ghép (`sharedPaletteText`); vắng = chưa có mặt đứng, lời dẫn như 9.17.0. */
  paletteText?: string;
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
    .replace('{palette}', () => input.paletteText ?? '')
    .trim();
  return { system: block.system.trim(), prompt };
}

/**
 * Lời gọi CHỮ → ẢNH; có ảnh mặt ngoài làm mẫu thì kèm đúng MỘT ảnh vào. Nơi gọi chỉ đưa `reference` khi tuyến
 * nhận ảnh vào (`ModelRouter.acceptsInputImages`) — và khi đưa, lời dẫn đã có câu dặn chỉ lấy màu / vật liệu.
 */
export function roomImageCallOptions(
  prompt: RoomImagePrompt,
  reference: PaletteReference | null = null,
): AiImageOptions {
  return {
    system: prompt.system,
    prompt: prompt.prompt,
    images: reference ? [reference.image] : [],
  };
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
  /** Bảng vật liệu chung đã dùng; vắng / `null` = chưa có mặt đứng. */
  palette?: SharedPalette | null;
  reference?: PaletteReference | null;
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
    shared_palette: input.palette
      ? {
          facade_ref: input.palette.facadeRef,
          colours: input.palette.colours.map((c) => ({
            role: c.role,
            colour: c.colour,
            hex: c.hex,
          })),
          materials: input.palette.materials.map((m) => m.code),
          reference: input.reference
            ? {
                artifact_ref: input.reference.artifactRef,
                kind: input.reference.kind,
                view: input.reference.view,
                uri: input.reference.uri,
              }
            : null,
        }
      : null,
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
