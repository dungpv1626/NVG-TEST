/**
 * Ảnh MẶT ĐỨNG CÓ VẬT LIỆU do mô hình ảnh vẽ từ ảnh neo — phần THUẦN (T59 Đợt E, 20/09/2026).
 *
 * Cùng khuôn với tờ mặt bằng có nội thất (`../sheet-image.ts`, T57):
 *  · **Ảnh neo** là chính tờ mặt đứng vector dựng từ toạ độ, không khung tên (`renderElevationAnchor`),
 *    rasterise ở trình duyệt. Không có nó thì mô hình vẽ một ngôi nhà khác — bài học T21. Vì thế
 *    `facadeImageCallOptions` tách riêng và có phép thử canh ĐÚNG MỘT ảnh.
 *  · Lời dẫn ghép từ ý tưởng mặt đứng ĐÃ LƯU: vật liệu từng vùng (cụm tiếng Anh của danh mục), mã
 *    màu hex, mái, lan can, cổng, rào. Mô hình ảnh chỉ tô vẽ, không chọn.
 *  · Hàm KHÔNG nhận mã hồ sơ: không có trong tay thì không viết nhầm được vào lời dẫn (T12).
 *
 * Khác T57: ảnh này không viết chữ nào — xem chú thích khối `facade_image` trong lời dẫn.
 *
 * Tệp thuần: không `fetch`, không kho, không CSDL — kiểm thử được bằng client giả.
 */

import type { AiFacadeBrief, AiFacadeConcept, AiFacadeImage } from '@nvg/shared/design';
import type { FacadeVocabulary, VocabEntry } from '../../kb/facade-vocabulary';
import type { GenerateImagePart } from '../../llm/gemini';
import type { AiImageOptions } from '../../llm/text-client';
import type { AiPrompts } from '../prompts';

/** Phiên bản hợp đồng `ai-facade-image` mà tệp này đúc ra. */
const SCHEMA_VERSION = '1.0.0';

/** Vùng cửa lấy cụm tiếng Anh từ nhóm vật liệu cửa. */
const DOOR_ZONES = new Set(['main_door', 'side_door', 'window', 'garage_door']);

export interface FacadeImagePrompt {
  system: string;
  prompt: string;
}

/**
 * Ngôi nhà TRÔNG NHƯ THẾ NÀO, nói bằng tiếng Anh — bảy cụm rút từ ý tưởng mặt đứng đã lưu.
 *
 * Tách riêng vì bước Phối cảnh (T67) cần đúng bảy cụm ấy: năm góc phối cảnh và tờ ảnh mặt đứng
 * phải mô tả CÙNG một ngôi nhà bằng CÙNG một cách. Hai bản mô tả song song là đường chắc chắn dẫn
 * tới hai bộ ảnh lệch màu mà không ai giải thích được vì sao.
 */
export interface FacadeLook {
  style: string;
  roof: string;
  /** Vật liệu từng vùng, mỗi vùng một dòng `- zone: material, colour`, kèm kiểu cửa đã chọn. */
  materials: string;
  palette: string;
  railing: string;
  gateFence: string;
  elements: string;
}

const phrase = (table: Record<string, VocabEntry>, code: unknown): string =>
  typeof code === 'string' ? (table[code]?.prompt_en ?? code.replace(/_/g, ' ')) : '';

/** Bảy cụm mô tả mặt ngoài — dùng chung cho tờ ảnh mặt đứng và cả năm góc phối cảnh. */
/** Centimet của hợp đồng → mét của lời dẫn, một chữ số thập phân, bỏ số 0 thừa. */
function metres(cm: number): string {
  return String(Math.round(cm / 10) / 10);
}

/**
 * « 3.6 m wide, 1.8 m high» — và khai được số nào thì nói số ấy.
 *
 * Trước T68 điều kiện là `gate.w && gate.h`, nên thiếu MỘT trong hai là mất CẢ HAI: hợp đồng chỉ
 * bắt buộc `type`, và một cái cổng không có số đo nào trong lời dẫn thì mô hình vẽ cổng to bằng
 * cả mặt tiền. Đơn vị đổi sang MÉT cho khớp phần còn lại — cùng một lời dẫn mà chỗ nói cm chỗ
 * nói m là mời mô hình đọc nhầm một bậc mười.
 */
function sizeText(w: number | null | undefined, h: number | null | undefined): string {
  const parts = [
    typeof w === 'number' ? `${metres(w)} m wide` : null,
    typeof h === 'number' ? `${metres(h)} m high` : null,
  ].filter(Boolean);
  return parts.length ? ` ${parts.join(', ')}` : '';
}

export function facadeLook(
  concept: AiFacadeConcept,
  vocab: FacadeVocabulary,
  prompts: AiPrompts,
): FacadeLook {
  const block = prompts.facadeImage;
  const colour = (code: unknown) => phrase(vocab.colours, code);

  const roof = [
    block.roofs[concept.roof.type] ?? `${concept.roof.type} roof`,
    concept.roof.pitch_deg ? `about ${concept.roof.pitch_deg} degrees pitch` : null,
    `${phrase(vocab.roofMaterials, concept.roof.material)} in ${colour(concept.roof.colour)}`,
  ]
    .filter(Boolean)
    .join(', ');

  const materials = concept.materials
    .map((m) => {
      const table = DOOR_ZONES.has(m.where) ? vocab.doorMaterials : vocab.materials;
      return `- ${m.where.replace(/_/g, ' ')}: ${phrase(table, m.material)}, ${colour(m.colour)}`;
    })
    .join('\n');

  const style = concept.openings_style;
  const openingNotes = [
    style?.main_door_type ? `main door: ${phrase(vocab.doorTypes, style.main_door_type)}` : null,
    style?.glass ? `window glass: ${phrase(vocab.glassTypes, style.glass)}` : null,
    style?.garage_door_type
      ? `garage door: ${phrase(vocab.garageDoorTypes, style.garage_door_type)}`
      : null,
  ].filter(Boolean);

  const palette = [
    `primary ${concept.palette.primary_hex}`,
    `secondary ${concept.palette.secondary_hex}`,
    concept.palette.accent_hex ? `accent ${concept.palette.accent_hex}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const railing = concept.balconies?.find((b) => b.railing)?.railing;
  const gate = concept.gate;
  const fence = concept.fence;
  const gateFence =
    gate || fence
      ? [
          gate
            ? `${gate.type} gate${sizeText(gate.w, gate.h)} in ${phrase(vocab.materials, gate.material)}, ${colour(gate.colour)}`
            : null,
          fence
            ? `${metres(fence.h)} m high fence${fence.type ? ` (${phrase(vocab.fenceTypes, fence.type)})` : ''} in ${phrase(vocab.materials, fence.material)}, ${colour(fence.colour)}`
            : null,
        ]
          .filter(Boolean)
          .join('; ')
      : 'none — the house stands on the street line';

  const counts = new Map<string, number>();
  for (const element of concept.elevation.elements ?? []) {
    counts.set(element.kind, (counts.get(element.kind) ?? 0) + 1);
  }
  const elements = counts.size
    ? [...counts].map(([kind, n]) => `${n} ${kind}${n > 1 ? 's' : ''}`).join(', ')
    : 'none';

  return {
    style: block.styles[concept.style] ?? 'as the materials suggest',
    roof,
    materials: [materials, ...openingNotes.map((note) => `- ${note}`)].join('\n'),
    palette,
    // Kèm CHIỀU CAO. `railing_h_cm` được `merge.ts` cất công chép từ phiếu kỹ sư vào artifact để
    // «bộ vẽ, DXF, ảnh neo và thước chấm đọc cùng một chỗ», nhưng trước T68 lời dẫn ảnh chỉ lấy
    // mã KIỂU — và góc `balcony_close` thì lan can chiếm nửa khung hình.
    railing: railing
      ? `${phrase(vocab.railings, railing)}${
          typeof concept.elevation.railing_h_cm === 'number'
            ? `, ${metres(concept.elevation.railing_h_cm)} m high`
            : ''
        }`
      : 'none',
    gateFence,
    elements,
  };
}

/**
 * Bảy cụm mô tả mặt ngoài khi mặt đứng là bản KỸ SƯ tải lên (T114 Đợt 4b) — không có ý tưởng mặt
 * đứng AI, nên lấy từ phần Mặt đứng của đầu bài. Mục chưa chốt nói «theo bản vẽ / hợp phong cách»
 * thay vì bịa một vật liệu: hình học và chi tiết nằm trên bản vẽ gửi kèm.
 */
export function facadeLookFromBrief(
  brief: AiFacadeBrief | null,
  vocab: FacadeVocabulary,
  prompts: AiPrompts,
): FacadeLook {
  const block = prompts.facadeImage;
  const colour = (code: unknown) => phrase(vocab.colours, code);
  const withColour = (what: string, code: unknown) => (code ? `${what} in ${colour(code)}` : what);
  if (!brief) {
    return {
      style: 'as the attached drawing suggests',
      roof: 'as drawn',
      materials: '- as drawn; choose materials that suit the style',
      palette: 'choose colours that suit the style',
      railing: 'as drawn',
      gateFence: 'exactly as drawn on the attached elevation',
      elements: 'as drawn',
    };
  }

  const roof = [
    brief.roof.type ? (block.roofs[brief.roof.type] ?? `${brief.roof.type} roof`) : 'roof as drawn',
    brief.roof.pitch_deg ? `about ${brief.roof.pitch_deg} degrees pitch` : null,
    brief.roof.material
      ? withColour(phrase(vocab.roofMaterials, brief.roof.material), brief.roof.colour)
      : brief.roof.colour
        ? `in ${colour(brief.roof.colour)}`
        : null,
  ]
    .filter(Boolean)
    .join(', ');

  const zones = [
    ...(['body', 'base', 'accent', 'trim'] as const).map((zone) => {
      const finish = brief.surfaces[zone];
      return finish.material || finish.colour
        ? `- ${zone}: ${finish.material ? phrase(vocab.materials, finish.material) : 'material to suit'}${finish.colour ? `, ${colour(finish.colour)}` : ''}`
        : null;
    }),
    ...(
      [
        ['main door', brief.main_door],
        ['side door', brief.side_door],
      ] as const
    ).map(([zone, door]) =>
      door.material || door.colour || door.type
        ? `- ${zone}: ${[
            door.material ? phrase(vocab.doorMaterials, door.material) : null,
            door.colour ? colour(door.colour) : null,
            door.type ? phrase(vocab.doorTypes, door.type) : null,
          ]
            .filter(Boolean)
            .join(', ')}`
        : null,
    ),
    brief.window.material || brief.window.glass
      ? `- windows: ${[
          brief.window.material ? phrase(vocab.doorMaterials, brief.window.material) : null,
          brief.window.colour ? colour(brief.window.colour) : null,
          brief.window.glass ? phrase(vocab.glassTypes, brief.window.glass) : null,
        ]
          .filter(Boolean)
          .join(', ')}`
      : null,
  ].filter(Boolean);

  const palette = [
    brief.palette.primary ? `primary ${colour(brief.palette.primary)}` : null,
    brief.palette.secondary ? `secondary ${colour(brief.palette.secondary)}` : null,
    brief.palette.accent ? `accent ${colour(brief.palette.accent)}` : null,
  ].filter(Boolean);

  const gateFence = [
    brief.gate.wanted === false
      ? 'no gate'
      : brief.gate.type || brief.gate.material
        ? withColour(
            `${brief.gate.type ?? ''} gate${brief.gate.material ? ` in ${phrase(vocab.materials, brief.gate.material)}` : ''}`.trim(),
            brief.gate.colour,
          )
        : null,
    brief.fence.type || brief.fence.material
      ? withColour(
          `fence${brief.fence.type ? ` (${phrase(vocab.fenceTypes, brief.fence.type)})` : ''}${brief.fence.material ? ` in ${phrase(vocab.materials, brief.fence.material)}` : ''}`,
          brief.fence.colour,
        )
      : null,
  ].filter(Boolean);

  return {
    style: brief.style
      ? (block.styles[brief.style] ?? brief.style)
      : 'as the attached drawing suggests',
    roof,
    materials: zones.length ? zones.join('\n') : '- as drawn; choose materials that suit the style',
    palette: palette.length ? palette.join(', ') : 'choose colours that suit the style',
    railing: brief.balcony.railing
      ? `${phrase(vocab.railings, brief.balcony.railing)}${typeof brief.balcony.h_cm === 'number' ? `, ${metres(brief.balcony.h_cm)} m high` : ''}`
      : 'as drawn',
    gateFence: gateFence.length
      ? `${gateFence.join('; ')} — placed exactly as drawn on the attached elevation`
      : 'exactly as drawn on the attached elevation',
    elements: brief.decorations.length ? brief.decorations.join(', ') : 'as drawn',
  };
}

/** Ghép lời dẫn gửi cho mô hình ảnh từ ý tưởng mặt đứng đã lưu. */
export function facadeImagePrompt(
  concept: AiFacadeConcept,
  vocab: FacadeVocabulary,
  prompts: AiPrompts,
): FacadeImagePrompt {
  const look = facadeLook(concept, vocab, prompts);
  return {
    system: prompts.facadeImage.system,
    prompt: fill(prompts.facadeImage.user, {
      style: look.style,
      roof: look.roof,
      materials: look.materials,
      palette: look.palette,
      railing: look.railing,
      gate_fence: look.gateFence,
      elements: look.elements,
    }).trimEnd(),
  };
}

/** Điền khuôn theo BẢNG, không thay nối tiếp — cùng lý do với `sheet-image.ts`. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    key in values ? values[key]! : match,
  );
}

/**
 * Tham số lời gọi mô hình ảnh — `images` có ĐÚNG MỘT phần tử (ảnh neo). Mảng rỗng vẫn chạy, vẫn tính
 * tiền, và vẽ một ngôi nhà khác; không màn hình nào lộ ra, nên có phép thử canh.
 */
export function facadeImageCallOptions(
  prompt: FacadeImagePrompt,
  anchor: GenerateImagePart,
): AiImageOptions {
  return { system: prompt.system, prompt: prompt.prompt, images: [anchor] };
}

export interface AssembleFacadeImageInput {
  /** Ý tưởng mặt đứng AI mà tấm vẽ theo; `null` khi vẽ từ bản kỹ sư tải lên (có `uploadRef`). */
  facadeRef: string | null;
  /** Bản vẽ kỹ sư tải lên (T114 Đợt 4). */
  uploadRef?: string | null;
  uri: string;
  mime: string;
  widthPx: number | null;
  heightPx: number | null;
  prompt: string;
  anchor: { sha256: string; bytes: number; mime: string };
  route: string;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number | null;
}

/** Đúc payload `ai_facade_image`. `watermark_applied` luôn `false` — trình duyệt đóng dấu. */
export function assembleFacadeImage(input: AssembleFacadeImageInput): AiFacadeImage {
  return {
    schema_version: SCHEMA_VERSION,
    facade_ref: input.facadeRef,
    ...(input.uploadRef ? { upload_ref: input.uploadRef } : {}),
    uri: input.uri,
    mime: input.mime as AiFacadeImage['mime'],
    width: input.widthPx,
    height: input.heightPx,
    anchor: {
      source: input.uploadRef ? 'engineer_upload' : 'client_raster',
      sha256: input.anchor.sha256,
      bytes: input.anchor.bytes,
      mime: input.anchor.mime as AiFacadeImage['anchor']['mime'],
    },
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
