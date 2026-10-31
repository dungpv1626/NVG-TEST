/**
 * Lời dẫn của nhánh AI — đọc từ `kb/ai_design_prompts.yaml`, kiểm hình dạng lúc nạp.
 *
 * Tách phần phân tích (thuần, kiểm thử được) khỏi phần nạp tệp (`prompts-data.ts`), cùng khuôn
 * với `render/render.ts` + `render/prompts-data.ts`.
 */

import type { StyleCatalogue } from '@nvg/shared/design';
import { exteriorStylePhrase } from '../kb/style-catalogue';
import type { LayoutRule } from './layout-prompt';
export interface AiPrompts {
  version: string;
  program: {
    /** Chỉ dẫn hệ thống cho bước lập chương trình không gian — tiếng Anh, không mang dữ liệu. */
    system: string;
    /** Lời dẫn lượt sửa, có chỗ `{issues}` để điền danh sách lỗi. */
    repair: string;
  };
  floorLevel: {
    /**
     * Chỉ dẫn hệ thống cho bước khai Ý ĐỊNH BỐ CỤC của MỘT TẦNG (T43) — tiếng Anh, không mang dữ liệu.
     */
    system: string;
    /**
     * Phần nối vào khi LẤY MẪU LẠI một tầng vì câu trả lời trước sai hợp đồng, có chỗ `{avoid}`. KHÔNG
     * mang câu trả lời cũ — không có ý định đúng hợp đồng nào để sửa.
     */
    resample: string;
    /**
     * Lượt SỬA Ý ĐỊNH khi bộ giải không dựng được tầng vì lý do nằm ở ý định (T43) — có chỗ `{intent}`
     * và `{avoid}`. Ý định chỉ ~1 KB nên gửi lại rẻ hơn hẳn để mô hình dựng lại từ đầu và sai chỗ khác.
     */
    revise: string;
    /** Mã lỗi cổng → một dòng tiếng Anh, `{…}` điền từ `params` của lỗi. */
    hints: Record<string, string>;
    /** Dòng dùng khi mã lỗi chưa có trong `hints`; có `{code}` và `{ref}`. */
    hintDefault: string;
    /**
     * Mã tiêu chí điểm (`kb/plan_quality.yaml`) → một dòng tiếng Anh, `{rooms}` = phòng làm mất điểm. Dùng
     * khi phương án qua cổng nhưng dưới ngưỡng điểm (T53). Tiêu chí không có dòng thì không gửi.
     */
    scoreHints: Record<string, string>;
    /**
     * Ba ý đồ bố cục gửi kèm ba phương án.
     *
     * Là DỮ LIỆU chứ không phải hằng số trong mã vì đây là thứ sẽ đổi sau mỗi lần đo: ba phương
     * án chỉ có giá trị khi chúng khác nhau về CẤU TRÚC, và việc tìm ba ý đồ thật sự khác nhau
     * là việc chỉnh lời dẫn, không phải việc triển khai lại.
     */
    strategies: PlanStrategy[];
    /**
     * Có mặt khi lời dẫn chạy ở chế độ hình chữ nhật (`layoutPrompts`): cỡ một ô bản phác theo mm mỗi trục —
     * `hintsFor` đổi tham số ô / hàng / cột của lỗi sang mm, vì mô hình không thấy lưới.
     */
    gridMm?: { x: number; y: number; ox?: number; oy?: number };
    /** Chế độ hình chữ nhật: mã lỗi → số luật mô hình thấy ở `<rules>` — câu nhắc mang «R<số>» (tài liệu v5 mục 6). */
    ruleOf?: Record<string, number>;
  };
  /**
   * Lời dẫn khi mô hình khai hình chữ nhật mm (`contracts/ai-house-layout`, bàn giao v5 cách A). Vắng = tệp
   * dữ liệu chưa có khối `house_layout`, cờ v5 không bật được. `hints` / `scoreHints` ghi đè dòng cùng mã.
   */
  houseLayout?: {
    system: string;
    resample: string;
    revise: string;
    /** Catalog luật có điều kiện (tài liệu v5 mục 3) — `ai/layout-prompt.ts` lọc và đánh số. */
    rules: LayoutRule[];
    /** Mục văn xuôi đầu bài giữ trong `<brief>`. */
    briefSections: string[];
    hints: Record<string, string>;
    scoreHints: Record<string, string>;
  };
  /**
   * Lời dẫn đường v6 — mô hình xếp DẢI, bộ giải tính kích thước (`contracts/ai-house-bands`, T116). Cùng cấu trúc
   * `houseLayout` (tráo vào chỗ ấy khi chạy v6, `promptsFor`), thêm mẫu dải theo loại nhà (`ong`, `pho`, `bt`, `vuon`,
   * `kd`) — chỉ chèn mẫu của loại đang thiết kế.
   */
  houseBands?: NonNullable<AiPrompts['houseLayout']> & { patterns: Record<string, string> };
  /**
   * Lượt SỬA theo yêu cầu kỹ sư trên một bản vẽ đã lưu (T53). `user` có `{plan}` và `{request}`; `retry`
   * có `{issues}` — nối vào khi thao tác lượt trước không qua cổng.
   */
  planEdit: { system: string; user: string; retry: string };
  /**
   * Tờ mặt bằng CÓ NỘI THẤT do mô hình ảnh vẽ từ ảnh neo (T57). `user` có bảy chỗ điền; `styles`
   * là mã phong cách đầu bài → một câu tiếng Anh; `watermark` là câu tiếng Việt in đè lên ảnh.
   */
  sheetImage: {
    system: string;
    user: string;
    styles: Record<string, string>;
    watermark: string;
  };
  /**
   * Ý tưởng mặt đứng mặt tiền (T59). `user` có `{brief}`, `{frame}`, `{requirements}`, `{codes}`; `retry` có `{issues}` —
   * nối vào khi ý tưởng lượt trước không qua phép kiểm.
   */
  facade: { system: string; user: string; retry: string; retryHabits: string };
  /**
   * Ảnh mặt đứng có vật liệu từ ảnh neo (T59 Đợt E). `user` có bảy chỗ điền `FACADE_IMAGE_SLOTS`;
   * `watermark` là câu tiếng Việt in đè lên ảnh.
   */
  facadeImage: {
    system: string;
    user: string;
    /** Mã phong cách → cụm tiếng Anh cho mặt ngoài. */
    styles: Record<string, string>;
    /** Mã kiểu mái → cụm tiếng Anh. */
    roofs: Record<string, string>;
    watermark: string;
  };
  /**
   * Ảnh nội thất MỘT phòng vẽ thẳng từ đầu bài, không ảnh neo (B3b). `user` có năm chỗ điền
   * `ROOM_IMAGE_SLOTS`; `rooms` = mã loại phòng → cụm tiếng Anh (chỉ loại có ở đây mới chọn được);
   * `roles` = vai trong gia đình → cụm tiếng Anh; `notes` = câu nếp sinh hoạt theo câu trả lời đầu bài.
   */
  roomImage: {
    system: string;
    user: string;
    rooms: Record<string, string>;
    roles: Record<string, string>;
    notes: RoomImageNote[];
    /** «Bảng vật liệu chung» suy từ ý tưởng mặt đứng (9.18.0, «Cách 3») — chỗ điền `{palette}`. */
    sharedPalette: RoomSharedPaletteConfig;
  };
  /**
   * Ảnh vẽ từ bản vẽ KỸ SƯ tải lên (T114 Đợt 4). `plan.user` có `{level_name}`, `{style}`;
   * `facade.user` có `{style}`, `{requirements}`. Câu nhãn cảnh báo dùng chung với hai khối ảnh trên.
   */
  uploadImage: {
    plan: { system: string; user: string };
    facade: { system: string; user: string };
  };
  /**
   * Bộ ảnh phối cảnh (T67). `user` có mười ba chỗ điền `PERSPECTIVE_SLOTS`; `views` phải đủ BẢY góc
   * của hợp đồng `ai-image-set` — thiếu một góc chỉ lộ ra khi lượt chạy tới đúng góc ấy, tức sau khi
   * đã trả tiền cho những góc trước nó.
   */
  perspective: {
    system: string;
    user: string;
    views: Record<string, PerspectiveView>;
    /** Câu cho ô bật/tắt người và xe. `onTightYard` dùng khi sân trước ngắn hơn một thân xe. */
    life: { on: string; off: string; onTightYard: string };
    /** Cụm tả số xe khi ô người-xe đang bật; `none` dùng khi đầu bài không khai xe nào. */
    vehicles: { cars: string; motorbikes: string; none: string };
    /** Mã loại công trình (`nha_pho`…) → cụm tiếng Anh. */
    buildingTypes: Record<string, string>;
    /** Mã hiện trạng một phía (`kb/site_context.yaml`) → cụm tiếng Anh. */
    neighbours: Record<string, string>;
    /** `front`/`left`/`right`/`back`/`unknown` → câu tả nắng. */
    sun: Record<string, string>;
    /**
     * Chiều dài thật của phương tiện và ba câu hệ quả của khoảng sân (T68).
     *
     * Đặt ở dữ liệu chứ không viết cứng trong mã: đây là số đo vật lý dùng để so sánh, và
     * CLAUDE.md 8.6 cấm chôn ngưỡng vào mã.
     */
    scale: {
      carLengthM: number;
      motorbikeLengthM: number;
      yardShorterThanCar: string;
      yardShorterThanMotorbike: string;
      noYard: string;
    };
    watermark: string;
  };
}

/** Một góc chụp: nhãn tiếng Việt cho màn hình, câu tả góc máy, câu tả ánh sáng. */
export interface PerspectiveView {
  /** Nhãn tiếng Việt cho màn hình — chỗ DUY NHẤT đặt tên góc, màn hình không viết cứng danh sách. */
  labelVi: string;
  /** Cụm tiếng Anh một dòng tả tấm ảnh, điền vào `{view}` của lời dẫn. */
  shot: string;
  camera: string;
  lighting: string;
  /**
   * Giờ chụp — chỉ có ở góc nào câu ánh sáng của nó dùng `{sun}`. Nắng đến từ đâu suy từ hướng
   * nhà CỘNG giờ này; cùng ngôi nhà chụp sáng và chụp chiều thì nắng đổi bên.
   */
  sunTime: 'morning' | 'midday' | 'afternoon' | null;
}

/**
 * Bảy chỗ điền bắt buộc của `sheet_image.user`.
 *
 * Kiểm lúc NẠP chứ không lúc gọi, vì thiếu một chỗ điền chỉ lộ ra sau khi đã trả tiền một tấm ảnh:
 * lời dẫn vẫn hợp lệ, mô hình vẫn vẽ, chỉ là vẽ thiếu tên phòng hoặc thiếu khung tên.
 */
const SHEET_IMAGE_SLOTS = [
  '{level_name}',
  '{rooms}',
  '{footprint}',
  '{dimensions}',
  '{north}',
  '{title_block}',
  '{style}',
] as const;

/**
 * Bảy chỗ điền bắt buộc của `facade_image.user` — kiểm lúc NẠP, vì thiếu một chỗ chỉ lộ ra sau khi đã
 * trả tiền một tấm ảnh (vẽ thiếu vật liệu hay thiếu cổng mà vẫn ra ảnh).
 */
/** Một câu nếp sinh hoạt của khối `room_image` — `when` là `đường.dẫn=giá trị` trên đầu bài đã lược danh tính. */
export interface RoomImageNote {
  when: { path: string; value: string };
  /** Loại phòng câu này áp vào; rỗng = mọi phòng. */
  rooms: string[];
  en: string;
}

/** Một vai màu của bảng vật liệu chung — `where` = vùng mặt đứng lấy tên màu khi mã hex không trùng mã nào. */
export interface RoomPaletteRole {
  where: string[];
  en: string;
  labelVi: string;
}

/** Khối `room_image.shared_palette` (9.18.0) — mọi chữ và bảng ánh xạ là dữ liệu, mã chỉ ghép. */
export interface RoomSharedPaletteConfig {
  header: string;
  /** Có `{role}` và `{colour}`. */
  colourLine: string;
  /** Có `{material}`. */
  materialLine: string;
  footer: string;
  /** Câu dặn khi kèm ảnh mặt ngoài làm mẫu. */
  referenceNote: string;
  /** Góc phối cảnh dùng làm ảnh mẫu, theo thứ tự ưu tiên. */
  referenceViews: string[];
  maxMaterials: number;
  colourSkip: string[];
  /** Vai màu theo đúng thứ tự `primary`, `secondary`, `accent` của `palette` mặt đứng. */
  colourRoles: Record<'primary' | 'secondary' | 'accent', RoomPaletteRole>;
  /** Mã vật liệu mặt đứng → cách dùng trong nhà; `{colour}` = màu đã khai cho vùng ấy. */
  materials: Record<string, string>;
}

/** Chỗ điền bắt buộc của `room_image.user` — kiểm lúc NẠP, cùng lý do với hai khối ảnh kia. */
const ROOM_IMAGE_SLOTS = [
  '{room}',
  '{floor}',
  '{area}',
  '{household}',
  '{style}',
  '{palette}',
] as const;

const FACADE_IMAGE_SLOTS = [
  '{style}',
  '{roof}',
  '{materials}',
  '{palette}',
  '{railing}',
  '{gate_fence}',
  '{elements}',
] as const;

/**
 * Mười ba chỗ điền bắt buộc của `perspective.user` — kiểm lúc NẠP, cùng lý do với hai khối ảnh
 * trên: thiếu một chỗ thì lời dẫn vẫn hợp lệ, mô hình vẫn vẽ, chỉ là vẽ sai góc hoặc mất vật liệu,
 * và chuyện ấy chỉ lộ ra sau khi đã trả tiền.
 */
const PERSPECTIVE_SLOTS = [
  '{view}',
  '{camera}',
  '{lighting}',
  '{house}',
  '{site}',
  '{style}',
  '{roof}',
  '{materials}',
  '{palette}',
  '{railing}',
  '{gate_fence}',
  '{elements}',
  '{life}',
] as const;

/**
 * Bảy góc của hợp đồng `ai-image-set`. Khai lại ở đây thay vì `import` enum sinh ra: tệp này là
 * phần THUẦN nạp được bằng Vitest, và danh sách góc là thứ phải khớp hợp đồng — có phép thử canh
 * hai bên không lệch nhau, đó mới là chỗ bắt lỗi đúng.
 */
const PERSPECTIVE_VIEWS = [
  'front_day',
  'front_night',
  'gate_close',
  'balcony_close',
  'oblique',
  'aerial',
  'axonometric',
] as const;

/** Một ý đồ bố cục: mã phương án, nhãn tiếng Việt cho màn hình, câu tiếng Anh cho lời dẫn. */
export interface PlanStrategy {
  /** `AI-A`, `AI-B`, `AI-C` — khớp `variant_id` của hợp đồng `ai-floor-plan`. */
  id: string;
  label: string;
  strategy: string;
}

export class AiPromptsError extends Error {
  readonly retryable = false;
}

export function parseAiPrompts(raw: unknown): AiPrompts {
  const doc = raw as Partial<AiPrompts> | undefined;
  if (!doc || typeof doc !== 'object') throw new AiPromptsError('kb/ai_design_prompts.yaml rỗng.');
  if (typeof doc.version !== 'string') {
    throw new AiPromptsError('kb/ai_design_prompts.yaml thiếu `version`.');
  }
  const program = doc.program;
  if (!program || typeof program.system !== 'string' || typeof program.repair !== 'string') {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `program.system` hoặc `program.repair`.',
    );
  }
  if (!program.repair.includes('{issues}')) {
    throw new AiPromptsError('`program.repair` phải có chỗ điền `{issues}`.');
  }
  const floorLevel = (doc as { floor_level?: Record<string, unknown> }).floor_level;
  if (
    !floorLevel ||
    typeof floorLevel.system !== 'string' ||
    typeof floorLevel.resample !== 'string' ||
    typeof floorLevel.revise !== 'string' ||
    typeof floorLevel.hint_default !== 'string'
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `floor_level.system`, `floor_level.resample`, `floor_level.revise` hoặc `floor_level.hint_default`.',
    );
  }
  if (!floorLevel.resample.includes('{avoid}')) {
    throw new AiPromptsError('`floor_level.resample` phải có chỗ điền `{avoid}`.');
  }
  if (!floorLevel.revise.includes('{avoid}') || !floorLevel.revise.includes('{intent}')) {
    throw new AiPromptsError('`floor_level.revise` phải có chỗ điền `{intent}` và `{avoid}`.');
  }
  const hints = floorLevel.hints;
  if (
    !hints ||
    typeof hints !== 'object' ||
    Object.values(hints).some((line) => typeof line !== 'string')
  ) {
    throw new AiPromptsError('`floor_level.hints` phải là bảng mã lỗi → một dòng chữ.');
  }
  const scoreHints = floorLevel.score_hints ?? {};
  if (
    typeof scoreHints !== 'object' ||
    Object.values(scoreHints).some((line) => typeof line !== 'string')
  ) {
    throw new AiPromptsError('`floor_level.score_hints` phải là bảng mã tiêu chí → một dòng chữ.');
  }
  const planEdit = (doc as { plan_edit?: Record<string, unknown> }).plan_edit;
  if (
    !planEdit ||
    typeof planEdit.system !== 'string' ||
    typeof planEdit.user !== 'string' ||
    typeof planEdit.retry !== 'string' ||
    !planEdit.user.includes('{plan}') ||
    !planEdit.user.includes('{request}') ||
    !planEdit.retry.includes('{issues}')
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `plan_edit.system`, `plan_edit.user` (có `{plan}`, `{request}`) hoặc `plan_edit.retry` (có `{issues}`).',
    );
  }
  const sheetImage = parseSheetImage((doc as { sheet_image?: unknown }).sheet_image);
  const facade = (doc as { facade?: Record<string, unknown> }).facade;
  if (
    !facade ||
    typeof facade.system !== 'string' ||
    typeof facade.user !== 'string' ||
    typeof facade.retry !== 'string' ||
    !['{brief}', '{frame}', '{requirements}', '{codes}'].every((slot) =>
      (facade.user as string).includes(slot),
    ) ||
    !facade.retry.includes('{issues}') ||
    typeof facade.retry_habits !== 'string' ||
    !facade.retry_habits.includes('{issues}')
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `facade.system`, `facade.user` (có `{brief}`, `{frame}`, `{requirements}`, `{codes}`), `facade.retry` hoặc `facade.retry_habits` (cả hai phải có `{issues}`).',
    );
  }
  const strategies = parseStrategies(floorLevel.strategies);
  const houseLayout = parseHouseLayout((doc as { house_layout?: unknown }).house_layout);
  const bandsRaw = (doc as { house_bands?: unknown }).house_bands;
  const bandsBlock = parseHouseLayout(bandsRaw, 'house_bands');
  const houseBands = bandsBlock
    ? {
        ...bandsBlock,
        patterns: stringMap(
          (bandsRaw as { patterns?: unknown }).patterns ?? {},
          'house_bands.patterns',
        ),
      }
    : null;
  return {
    version: doc.version,
    program: { system: program.system, repair: program.repair },
    floorLevel: {
      system: floorLevel.system,
      resample: floorLevel.resample,
      revise: floorLevel.revise,
      hints: hints as Record<string, string>,
      hintDefault: floorLevel.hint_default,
      scoreHints: scoreHints as Record<string, string>,
      strategies,
    },
    ...(houseLayout ? { houseLayout } : {}),
    ...(houseBands ? { houseBands } : {}),
    planEdit: { system: planEdit.system, user: planEdit.user, retry: planEdit.retry },
    sheetImage,
    facade: {
      system: facade.system,
      user: facade.user,
      retry: facade.retry,
      retryHabits: facade.retry_habits as string,
    },
    facadeImage: parseFacadeImage((doc as { facade_image?: unknown }).facade_image),
    uploadImage: parseUploadImage((doc as { upload_image?: unknown }).upload_image),
    roomImage: parseRoomImage((doc as { room_image?: unknown }).room_image),
    perspective: parsePerspective((doc as { perspective?: unknown }).perspective),
  };
}

function stringMap(value: unknown, where: string): Record<string, string> {
  if (
    value === undefined ||
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.values(value).some((line) => typeof line !== 'string')
  ) {
    throw new AiPromptsError(`\`${where}\` phải là bảng mã → một dòng chữ.`);
  }
  return value as Record<string, string>;
}

/** Khối `house_layout` (bàn giao v5) — tuỳ chọn; có thì phải đủ chỗ điền như `floor_level`. */
function parseHouseLayout(raw: unknown, name = 'house_layout'): AiPrompts['houseLayout'] | null {
  if (raw === undefined) return null;
  const block = raw as Record<string, unknown> | null;
  if (
    !block ||
    typeof block.system !== 'string' ||
    typeof block.resample !== 'string' ||
    typeof block.revise !== 'string' ||
    !block.resample.includes('{avoid}') ||
    !block.revise.includes('{avoid}') ||
    !block.revise.includes('{intent}')
  ) {
    throw new AiPromptsError(
      `\`${name}\` cần \`system\`, \`resample\` (có \`{avoid}\`) và \`revise\` (có \`{avoid}\`, \`{intent}\`).`,
    );
  }
  if (!Array.isArray(block.rules) || !Array.isArray(block.brief_sections)) {
    throw new AiPromptsError(`\`${name}\` cần \`rules\` (danh sách) và \`brief_sections\`.`);
  }
  const rules = block.rules.map((raw, i): LayoutRule => {
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.when !== 'string' || typeof r.text !== 'string') {
      throw new AiPromptsError(`\`${name}.rules[${i}]\` cần \`id\`, \`when\`, \`text\`.`);
    }
    return {
      id: r.id,
      when: r.when,
      text: r.text,
      codes: Array.isArray(r.codes) ? r.codes.map(String) : [],
      ...(r.soft === true ? { soft: true } : {}),
    };
  });
  return {
    system: block.system,
    resample: block.resample,
    revise: block.revise,
    rules,
    briefSections: block.brief_sections.map(String),
    hints: stringMap(block.hints ?? {}, `${name}.hints`),
    scoreHints: stringMap(block.score_hints ?? {}, `${name}.score_hints`),
  };
}

/**
 * Lời dẫn cho lượt chạy hình chữ nhật: khối `floor_level` với lời dẫn hệ thống, lấy mẫu lại, sửa và các câu
 * nhắc của `house_layout` thay vào; `gridMm` để câu nhắc nói mm thay cho ô. Mọi chỗ dùng `floorLevel` phía sau
 * (bộ xếp, cổng, câu nhắc điểm) chạy nguyên.
 */
export function layoutPrompts(
  prompts: AiPrompts,
  gridMm: { x: number; y: number; ox?: number; oy?: number },
  ruleOf: Record<string, number> = {},
): AiPrompts {
  const layout = prompts.houseLayout;
  if (!layout) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml chưa có khối `house_layout` — không chạy được lược đồ hình chữ nhật.',
    );
  }
  return {
    ...prompts,
    floorLevel: {
      ...prompts.floorLevel,
      system: layout.system,
      resample: layout.resample,
      revise: layout.revise,
      hints: { ...prompts.floorLevel.hints, ...layout.hints },
      scoreHints: { ...prompts.floorLevel.scoreHints, ...layout.scoreHints },
      gridMm,
      ruleOf,
    },
  };
}

/**
 * Khối lời dẫn của bộ ảnh phối cảnh — kiểm đủ chỗ điền, đủ bảy góc, và đủ ba bảng tra.
 *
 * `neighbours` được phép thiếu một mã của `kb/site_context.yaml`: khi ấy phía đó không được nhắc
 * trong lời dẫn, và «không nhắc» là câu trả lời đúng — đoán hộ hiện trạng một phía thửa đất là
 * cách nhanh nhất để ra một tấm ảnh có nhà hàng xóm không tồn tại.
 */
function parsePerspective(raw: unknown): AiPrompts['perspective'] {
  const block = raw as Record<string, unknown> | undefined;
  if (
    !block ||
    typeof block !== 'object' ||
    typeof block.system !== 'string' ||
    typeof block.user !== 'string' ||
    typeof block.watermark !== 'string'
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `perspective.system`, `perspective.user` hoặc `perspective.watermark`.',
    );
  }
  const rawScale = block.scale as
    | Partial<{
        car_length_m: number;
        motorbike_length_m: number;
        yard_shorter_than_car: string;
        yard_shorter_than_motorbike: string;
        no_yard: string;
      }>
    | undefined;
  if (
    !rawScale ||
    typeof rawScale.car_length_m !== 'number' ||
    typeof rawScale.motorbike_length_m !== 'number' ||
    typeof rawScale.yard_shorter_than_car !== 'string' ||
    typeof rawScale.yard_shorter_than_motorbike !== 'string' ||
    typeof rawScale.no_yard !== 'string'
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `perspective.scale` (car_length_m, motorbike_length_m và ba câu hệ quả).',
    );
  }
  // Câu hệ quả không có `{yard}` thì chiều sâu sân không đi tới lời dẫn — đúng lỗi T68 đang sửa,
  // nên chặn ngay lúc nạp thay vì để nó im lặng quay lại.
  for (const [name, text] of [
    ['yard_shorter_than_car', rawScale.yard_shorter_than_car],
    ['yard_shorter_than_motorbike', rawScale.yard_shorter_than_motorbike],
  ] as const) {
    if (!text.includes('{yard}')) {
      throw new AiPromptsError(`\`perspective.scale.${name}\` phải có chỗ điền {yard}.`);
    }
  }

  const missing = PERSPECTIVE_SLOTS.filter((slot) => !(block.user as string).includes(slot));
  if (missing.length) {
    throw new AiPromptsError(`\`perspective.user\` thiếu chỗ điền ${missing.join(', ')}.`);
  }

  const views = block.views;
  if (!views || typeof views !== 'object') {
    throw new AiPromptsError('kb/ai_design_prompts.yaml thiếu `perspective.views`.');
  }
  const parsedViews: Record<string, PerspectiveView> = {};
  for (const view of PERSPECTIVE_VIEWS) {
    const entry = (views as Record<string, unknown>)[view] as Partial<{
      label_vi: string;
      shot: string;
      camera: string;
      lighting: string;
      sun_time: string;
    }>;
    if (
      !entry ||
      typeof entry.label_vi !== 'string' ||
      typeof entry.shot !== 'string' ||
      typeof entry.camera !== 'string' ||
      typeof entry.lighting !== 'string'
    ) {
      throw new AiPromptsError(
        `\`perspective.views.${view}\` phải có đủ \`label_vi\`, \`shot\`, \`camera\`, \`lighting\`.`,
      );
    }
    // Hai chiều phải khớp nhau, và kiểm cả hai: câu ánh sáng dùng `{sun}` mà không khai giờ thì
    // chỗ điền ấy rơi về chuỗi rỗng (câu cụt); khai giờ mà câu không dùng `{sun}` thì giờ ấy
    // không đi tới đâu, tức một dòng cấu hình trông như có tác dụng mà không có.
    const needsSun = entry.lighting.includes('{sun}');
    const sunTime = entry.sun_time ?? null;
    if (needsSun !== (sunTime !== null)) {
      throw new AiPromptsError(
        needsSun
          ? `\`perspective.views.${view}.lighting\` dùng \`{sun}\` nên phải khai \`sun_time\`.`
          : `\`perspective.views.${view}\` khai \`sun_time\` nhưng câu \`lighting\` không dùng \`{sun}\`.`,
      );
    }
    if (sunTime !== null && !['morning', 'midday', 'afternoon'].includes(sunTime)) {
      throw new AiPromptsError(
        `\`perspective.views.${view}.sun_time\` phải là morning, midday hoặc afternoon (đang là "${sunTime}").`,
      );
    }
    parsedViews[view] = {
      labelVi: entry.label_vi,
      shot: entry.shot,
      camera: entry.camera,
      lighting: entry.lighting,
      sunTime: sunTime as PerspectiveView['sunTime'],
    };
  }

  const life = block.life as
    Partial<{ on: string; off: string; on_tight_yard: string }> | undefined;
  if (
    !life ||
    typeof life.on !== 'string' ||
    typeof life.off !== 'string' ||
    typeof life.on_tight_yard !== 'string' ||
    !life.on.includes('{vehicles}') ||
    !life.on_tight_yard.includes('{vehicles}')
  ) {
    throw new AiPromptsError(
      '`perspective.life` phải có đủ `on` và `on_tight_yard` (cả hai chứa `{vehicles}`) và `off`.',
    );
  }
  const vehicles = block.vehicles as
    Partial<{ cars: string; motorbikes: string; none: string }> | undefined;
  if (
    !vehicles ||
    typeof vehicles.cars !== 'string' ||
    typeof vehicles.motorbikes !== 'string' ||
    typeof vehicles.none !== 'string' ||
    !vehicles.cars.includes('{cars}') ||
    !vehicles.motorbikes.includes('{motorbikes}')
  ) {
    throw new AiPromptsError(
      '`perspective.vehicles` phải có `cars` (chứa `{cars}`), `motorbikes` (chứa `{motorbikes}`) và `none`.',
    );
  }

  const table = (key: 'building_types' | 'neighbours' | 'sun'): Record<string, string> => {
    const value = block[key] ?? {};
    if (
      typeof value !== 'object' ||
      value === null ||
      Object.values(value).some((line) => typeof line !== 'string')
    ) {
      throw new AiPromptsError(`\`perspective.${key}\` phải là bảng mã → một dòng chữ.`);
    }
    return value as Record<string, string>;
  };
  const sun = table('sun');
  // `unknown` là đường lùi khi đầu bài không khai hướng. Thiếu nó thì lời dẫn rơi về chuỗi rỗng,
  // tức câu «Light:» cụt — mô hình tự chọn nắng, và mỗi góc chọn một kiểu.
  if (!sun.unknown) {
    throw new AiPromptsError(
      '`perspective.sun` phải có mã `unknown` cho đầu bài không khai hướng.',
    );
  }

  return {
    system: block.system,
    user: block.user,
    views: parsedViews,
    life: { on: life.on, off: life.off, onTightYard: life.on_tight_yard },
    vehicles: { cars: vehicles.cars, motorbikes: vehicles.motorbikes, none: vehicles.none },
    buildingTypes: table('building_types'),
    neighbours: table('neighbours'),
    sun,
    scale: {
      carLengthM: rawScale.car_length_m,
      motorbikeLengthM: rawScale.motorbike_length_m,
      yardShorterThanCar: rawScale.yard_shorter_than_car,
      yardShorterThanMotorbike: rawScale.yard_shorter_than_motorbike,
      noYard: rawScale.no_yard,
    },
    watermark: block.watermark,
  };
}

/**
 * Khối lời dẫn của tờ mặt bằng có nội thất — kiểm đủ bốn khoá và đủ bảy chỗ điền.
 *
 * Bảng `styles` được phép RỖNG: đầu bài có thể không khai phong cách, và khi ấy lời dẫn bỏ hẳn
 * mệnh đề ấy. Nhưng khoá phải có mặt, để việc thiếu bảng phân biệt được với việc thiếu một mã.
 */
function parseSheetImage(raw: unknown): AiPrompts['sheetImage'] {
  const block = raw as Record<string, unknown> | undefined;
  if (
    !block ||
    typeof block !== 'object' ||
    typeof block.system !== 'string' ||
    typeof block.user !== 'string' ||
    typeof block.watermark !== 'string'
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `sheet_image.system`, `sheet_image.user` hoặc `sheet_image.watermark`.',
    );
  }
  const missing = SHEET_IMAGE_SLOTS.filter((slot) => !(block.user as string).includes(slot));
  if (missing.length) {
    throw new AiPromptsError(`\`sheet_image.user\` thiếu chỗ điền ${missing.join(', ')}.`);
  }
  const styles = block.styles ?? {};
  if (
    typeof styles !== 'object' ||
    styles === null ||
    Object.values(styles).some((line) => typeof line !== 'string')
  ) {
    throw new AiPromptsError('`sheet_image.styles` phải là bảng mã phong cách → một dòng chữ.');
  }
  return {
    system: block.system,
    user: block.user,
    styles: styles as Record<string, string>,
    watermark: block.watermark,
  };
}

/** Chỗ điền bắt buộc của khối `upload_image` — kiểm lúc NẠP, cùng lý do với hai khối ảnh kia. */
const UPLOAD_IMAGE_SLOTS = {
  plan: ['{level_name}', '{style}'],
  facade: ['{style}', '{requirements}'],
} as const;

function parseUploadImage(raw: unknown): AiPrompts['uploadImage'] {
  const block = raw as Record<string, unknown> | undefined;
  const part = (key: 'plan' | 'facade') => {
    const sub = block?.[key] as Record<string, unknown> | undefined;
    if (!sub || typeof sub.system !== 'string' || typeof sub.user !== 'string') {
      throw new AiPromptsError(
        `kb/ai_design_prompts.yaml thiếu \`upload_image.${key}.system\` hoặc \`upload_image.${key}.user\`.`,
      );
    }
    const missing = UPLOAD_IMAGE_SLOTS[key].filter((slot) => !(sub.user as string).includes(slot));
    if (missing.length) {
      throw new AiPromptsError(
        `\`upload_image.${key}.user\` thiếu chỗ điền ${missing.join(', ')}.`,
      );
    }
    return { system: sub.system, user: sub.user };
  };
  return { plan: part('plan'), facade: part('facade') };
}

function parseRoomImage(raw: unknown): AiPrompts['roomImage'] {
  const block = raw as Record<string, unknown> | undefined;
  if (!block || typeof block.system !== 'string' || typeof block.user !== 'string') {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `room_image.system` hoặc `room_image.user`.',
    );
  }
  const missing = ROOM_IMAGE_SLOTS.filter((slot) => !(block.user as string).includes(slot));
  if (missing.length) {
    throw new AiPromptsError(`\`room_image.user\` thiếu chỗ điền ${missing.join(', ')}.`);
  }
  const rooms = stringMap(block.rooms ?? {}, 'room_image.rooms');
  if (Object.keys(rooms).length === 0) {
    throw new AiPromptsError('`room_image.rooms` rỗng — không phòng nào chọn được để vẽ.');
  }
  const notes = (Array.isArray(block.notes) ? block.notes : []).map((item, index) => {
    const entry = item as { when?: unknown; rooms?: unknown; en?: unknown };
    const match = typeof entry.when === 'string' ? /^([a-z_.]+)=(.+)$/.exec(entry.when) : null;
    if (!match || typeof entry.en !== 'string') {
      throw new AiPromptsError(
        `\`room_image.notes[${index}]\` phải có \`when: đường.dẫn=giá trị\` và \`en\`.`,
      );
    }
    if (entry.rooms !== undefined && !Array.isArray(entry.rooms)) {
      throw new AiPromptsError(`\`room_image.notes[${index}].rooms\` phải là danh sách mã phòng.`);
    }
    return {
      when: { path: match[1]!, value: match[2]! },
      rooms: ((entry.rooms as unknown[] | undefined) ?? []).map(String),
      en: entry.en,
    };
  });
  return {
    system: block.system,
    user: block.user,
    rooms,
    roles: stringMap(block.roles ?? {}, 'room_image.roles'),
    notes,
    sharedPalette: parseRoomSharedPalette(block.shared_palette),
  };
}

function parseRoomSharedPalette(raw: unknown): RoomSharedPaletteConfig {
  const block = raw as Record<string, unknown> | undefined;
  const text = (key: string, slots: string[] = []): string => {
    const value = block?.[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new AiPromptsError(
        `kb/ai_design_prompts.yaml thiếu \`room_image.shared_palette.${key}\`.`,
      );
    }
    const missing = slots.filter((slot) => !value.includes(slot));
    if (missing.length) {
      throw new AiPromptsError(
        `\`room_image.shared_palette.${key}\` thiếu chỗ điền ${missing.join(', ')}.`,
      );
    }
    return value;
  };
  const list = (key: string): string[] => {
    const value = block?.[key];
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new AiPromptsError(`\`room_image.shared_palette.${key}\` phải là danh sách mã.`);
    }
    return value as string[];
  };
  const max = block?.max_materials;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 0) {
    throw new AiPromptsError('`room_image.shared_palette.max_materials` phải là số nguyên ≥ 0.');
  }
  const rolesRaw = (block?.colour_roles ?? {}) as Record<string, unknown>;
  const role = (key: 'primary' | 'secondary' | 'accent'): RoomPaletteRole => {
    const entry = rolesRaw[key] as
      { where?: unknown; en?: unknown; label_vi?: unknown } | undefined;
    if (
      !entry ||
      !Array.isArray(entry.where) ||
      typeof entry.en !== 'string' ||
      typeof entry.label_vi !== 'string'
    ) {
      throw new AiPromptsError(
        `\`room_image.shared_palette.colour_roles.${key}\` phải có \`where\`, \`en\`, \`label_vi\`.`,
      );
    }
    return { where: entry.where.map(String), en: entry.en, labelVi: entry.label_vi };
  };
  return {
    header: text('header'),
    colourLine: text('colour_line', ['{role}', '{colour}']),
    materialLine: text('material_line', ['{material}']),
    footer: text('footer'),
    referenceNote: text('reference_note'),
    referenceViews: list('reference_views'),
    maxMaterials: max,
    colourSkip: list('colour_skip'),
    colourRoles: { primary: role('primary'), secondary: role('secondary'), accent: role('accent') },
    materials: stringMap(block?.materials ?? {}, 'room_image.shared_palette.materials'),
  };
}

function parseFacadeImage(raw: unknown): AiPrompts['facadeImage'] {
  const block = raw as Record<string, unknown> | undefined;
  if (
    !block ||
    typeof block.system !== 'string' ||
    typeof block.user !== 'string' ||
    typeof block.watermark !== 'string'
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `facade_image.system`, `facade_image.user` hoặc `facade_image.watermark`.',
    );
  }
  const missing = FACADE_IMAGE_SLOTS.filter((slot) => !(block.user as string).includes(slot));
  if (missing.length) {
    throw new AiPromptsError(`\`facade_image.user\` thiếu chỗ điền ${missing.join(', ')}.`);
  }
  const table = (key: 'styles' | 'roofs'): Record<string, string> => {
    const value = block[key] ?? {};
    if (
      typeof value !== 'object' ||
      value === null ||
      Object.values(value).some((line) => typeof line !== 'string')
    ) {
      throw new AiPromptsError(`\`facade_image.${key}\` phải là bảng mã → một dòng chữ.`);
    }
    return value as Record<string, string>;
  };
  return {
    system: block.system,
    user: block.user,
    styles: table('styles'),
    roofs: table('roofs'),
    watermark: block.watermark,
  };
}

/**
 * Danh sách ý đồ bố cục — kiểm đủ hình dạng và mã không trùng.
 *
 * Mã trùng nhau là lỗi phải chặn lúc NẠP, không phải lúc chạy: hai phương án cùng `variant_id`
 * sẽ đúc ra hai artifact mà màn hình không phân biệt được, và lúc ấy đã tốn tiền gọi mô hình.
 */
function parseStrategies(raw: unknown): PlanStrategy[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AiPromptsError('kb/ai_design_prompts.yaml thiếu `floor_level.strategies`.');
  }
  const seen = new Set<string>();
  return raw.map((item, index) => {
    const entry = item as Partial<PlanStrategy>;
    if (
      typeof entry.id !== 'string' ||
      typeof entry.label !== 'string' ||
      typeof entry.strategy !== 'string'
    ) {
      throw new AiPromptsError(
        `\`floor_level.strategies[${index}]\` phải có đủ \`id\`, \`label\`, \`strategy\`.`,
      );
    }
    if (!/^AI-[A-Z]$/.test(entry.id)) {
      throw new AiPromptsError(
        `\`floor_level.strategies[${index}].id\` phải theo khuôn AI-A, AI-B… (đang là "${entry.id}").`,
      );
    }
    if (seen.has(entry.id)) {
      throw new AiPromptsError(`Hai ý đồ bố cục cùng mã "${entry.id}".`);
    }
    seen.add(entry.id);
    return { id: entry.id, label: entry.label, strategy: entry.strategy };
  });
}

/**
 * Hai bảng phong cách của lời dẫn ảnh — `sheetImage.styles` (nội thất) và `facadeImage.styles` (mặt
 * ngoài) — dựng từ `kb/style_catalogue.yaml` (T175). Trước T175 hai bảng là hai khối `styles:` viết tay
 * trong `kb/ai_design_prompts.yaml`; nay một nguồn, để bộ đặc trưng phong cách và lời dẫn ảnh không
 * lệch nhau. Mã nào tệp lời dẫn vẫn còn khai thì bộ đặc trưng thắng.
 */
export function withStylePrompts(prompts: AiPrompts, catalogue: StyleCatalogue): AiPrompts {
  const specs = Object.values(catalogue.styles);
  return {
    ...prompts,
    sheetImage: {
      ...prompts.sheetImage,
      styles: {
        ...prompts.sheetImage.styles,
        ...Object.fromEntries(specs.map((s) => [s.code, s.prompt.interior])),
      },
    },
    facadeImage: {
      ...prompts.facadeImage,
      styles: {
        ...prompts.facadeImage.styles,
        ...Object.fromEntries(specs.map((s) => [s.code, exteriorStylePhrase(s)])),
      },
    },
  };
}
