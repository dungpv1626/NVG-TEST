/**
 * Tờ mặt bằng công năng do MÔ HÌNH ẢNH vẽ — phần THUẦN (T21, 10/09/2026).
 *
 * ── Vì sao đợt này tồn tại ─────────────────────────────────────────────────────────────
 * T15 («AI thiết kế, chương trình cầm bút») giao phần vẽ cho một bộ vẽ SVG tất định trong
 * Worker. Qua hai vòng sửa, tờ vẽ ấy vẫn không đạt, nên Haan chuyển phần VẼ cho mô hình ảnh.
 *
 * Thứ KHÔNG đổi: mô hình văn bản vẫn khai mặt bằng dạng dữ liệu, và dữ liệu ấy vẫn là nguồn
 * duy nhất để đo diện tích, bắt lỗi tự mâu thuẫn và đối chiếu quy chuẩn. Tờ ảnh chỉ là cách
 * TRÌNH BÀY.
 *
 * ── Điều nguy hiểm nhất về tờ ảnh, ghi ở đây một lần ───────────────────────────────────
 * **Không có ảnh neo.** Mô hình ảnh chỉ nhận chữ, không nhận hình (quyết định của Haan,
 * 10/09/2026). Nên hình trên tờ giấy KHÔNG dựng từ toạ độ: kích thước, tỷ lệ và vị trí trên đó
 * là minh hoạ, không đo được, và vẽ lại cùng một tầng sẽ ra một tấm khác.
 *
 * Hệ quả trực tiếp lên mã trong tệp này: `sheetImagePrompt` bơm TÊN PHÒNG và SỐ MÉT VUÔNG thật
 * — lấy từ chính artifact, không phải từ mô hình ảnh — vào lời dẫn. Đó là sợi dây DUY NHẤT
 * buộc tờ ảnh vào bảng diện tích. Bỏ nó đi thì hai thứ không còn liên quan gì tới nhau.
 *
 * Tệp này thuần: không `fetch`, không kho, không CSDL. Nhờ vậy toàn bộ đường vẽ kiểm thử được
 * bằng client giả, không tốn một lượt gọi trả phí nào.
 */

import type { AiFloorPlan, AiPlanSheetImage } from '@nvg/shared/design';
import { bboxOfPoints, toPt } from './draw/geometry';
import type { AiPrompts } from './prompts';

/** Phiên bản hợp đồng `ai-plan-sheet-image` mà tệp này đúc ra. */
const SCHEMA_VERSION = '1.0.0';

/**
 * Tầng không vẽ được — KHÔNG đáng thử lại, và cố ý không phải lỗi máy chủ.
 *
 * Thiếu `sheet_prompt` là trạng thái HỢP LỆ của dữ liệu: trường ấy tuỳ chọn, và mô hình bỏ qua
 * nó không làm hỏng gì trong bảng diện tích. Người dùng cần biết «tầng này chưa vẽ được vì
 * chưa có mô tả», không phải một trang lỗi.
 */
export class SheetImageUnavailable extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'SheetImageUnavailable';
  }
}

export interface SheetImagePromptInput {
  plan: AiFloorPlan;
  level: number;
  prompts: AiPrompts;
  /** Nhãn tiếng Việt của mã phòng — `roomLabels()` từ `kb/room_vocabulary.yaml`. */
  labels: Record<string, string>;
}

export interface SheetImagePrompt {
  system: string;
  prompt: string;
  /** Đoạn mô tả do mô hình văn bản khai, giữ nguyên văn để ghi vào artifact. */
  sheetPrompt: string;
}

/**
 * Ghép lời dẫn gửi cho mô hình ảnh.
 *
 * `system` là hằng số phong cách của NVG; `prompt` là khuôn có bốn chỗ điền. Cả hai nằm ở
 * `kb/ai_design_prompts.yaml` chứ không trong mã — lời dẫn là thứ sẽ chỉnh sau mỗi lần đo, và
 * chỉnh nó không được đòi một lần triển khai.
 */
export function sheetImagePrompt(input: SheetImagePromptInput): SheetImagePrompt {
  const level = input.plan.levels.find((item) => item.level === input.level);
  if (!level) {
    throw new SheetImageUnavailable(`Phương án này không có tầng ${input.level}.`);
  }
  const sheetPrompt = level.sheet_prompt?.trim();
  if (!sheetPrompt) {
    throw new SheetImageUnavailable(
      `Tầng "${level.name}" chưa có mô tả tờ vẽ nên không dựng được ảnh. ` +
        'Chạy lại bước mặt bằng để mô hình khai phần mô tả, hoặc xem bản đối chiếu dạng vector.',
    );
  }

  return {
    system: input.prompts.sheetImage.system,
    prompt: fill(input.prompts.sheetImage.prompt, {
      level_name: level.name,
      sheet_prompt: sheetPrompt,
      rooms: roomLines(level, input.labels),
      footprint: footprintText(level),
      // `north_deg` do Worker điền và có thể vắng ở artifact cũ; vắng thì coi như bắc hướng lên.
      north: northText(input.plan.north_deg ?? 0),
    }),
    sheetPrompt,
  };
}

/**
 * Danh sách phòng gửi kèm: nhãn tiếng Việt + diện tích THẬT.
 *
 * Số ở đây lấy từ artifact, không phải từ mô hình ảnh — mô hình ảnh chỉ được yêu cầu CHÉP LẠI.
 * Nó vẫn chép sai được (đó là bản chất của mô hình ảnh), nhưng chép sai thì nhìn ra ngay khi
 * đối chiếu với bảng diện tích, còn không đưa số vào thì nó tự bịa và không có gì để đối chiếu.
 */
function roomLines(level: AiFloorPlan['levels'][number], labels: Record<string, string>): string {
  return level.rooms
    .map((room) => {
      const name = room.label?.trim() || labels[room.type] || room.type;
      return `- ${name.toLocaleUpperCase('vi-VN')} — ${trimZero(room.area_m2)} m²`;
    })
    .join('\n');
}

/** Bề rộng × chiều sâu của hình bao tầng, tính bằng mét — để mô hình biết tờ giấy dài hay vuông. */
function footprintText(level: AiFloorPlan['levels'][number]): string {
  // Dùng lại `bboxOfPoints` của `draw/geometry.ts` — tệp ấy là hình học dùng chung cho bộ vẽ
  // VÀ bộ kiểm, không phải của riêng bộ vẽ, nên nó ở lại kể cả khi tờ vector bị dọn.
  const box = bboxOfPoints(level.outline.map(toPt));
  return `${trimZero((box.x1 - box.x0) / 100)} m wide by ${trimZero((box.y1 - box.y0) / 100)} m deep`;
}

/**
 * Hướng bắc thành chữ.
 *
 * `north_deg` là góc của hướng bắc đo theo chiều kim đồng hồ từ mép TRÊN tờ giấy. Mô hình ảnh
 * không hiểu số độ, nhưng hiểu «up» hay «to the left» — nên quy về tám hướng.
 */
function northText(deg: number): string {
  const names = [
    'up (towards the top of the sheet)',
    'up and to the right',
    'to the right',
    'down and to the right',
    'down (towards the bottom of the sheet)',
    'down and to the left',
    'to the left',
    'up and to the left',
  ];
  const index = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return names[index]!;
}

/**
 * Điền khuôn.
 *
 * Thay theo BẢNG chứ không thay nối tiếp: giá trị điền vào có thể chứa chuỗi trông như một chỗ
 * điền khác (`sheet_prompt` là chữ tự do do mô hình sinh), và thay nối tiếp thì lần sau sẽ
 * thay tiếp vào chính giá trị vừa đặt.
 */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    key in values ? values[key]! : match,
  );
}

/** Diện tích như cách hồ sơ NVG ghi: một chữ số thập phân, bỏ `.0`, dấu CHẤM. */
function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export interface AssembleSheetImageInput {
  planRef: string;
  level: number;
  uri: string;
  mime: string;
  sheetPrompt: string;
  route: string;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number | null;
}

/**
 * Đúc payload artifact `ai_plan_sheet_image`.
 *
 * `watermark_applied` luôn `false` và hợp đồng khai `const false` — byte trong kho CHƯA đóng
 * dấu. Worker không có canvas, và đóng dấu bằng Container thì phá tính độc lập của nhánh AI
 * (CLAUDE.md 8.5b). Nhãn cảnh báo do trình duyệt in lên, cả khi xem lẫn khi tải về.
 */
export function assembleSheetImage(input: AssembleSheetImageInput): AiPlanSheetImage {
  return {
    schema_version: SCHEMA_VERSION,
    plan_ref: input.planRef,
    level: input.level,
    uri: input.uri,
    mime: input.mime as AiPlanSheetImage['mime'],
    watermark_applied: false,
    // Giữ nguyên văn đoạn đã gửi: cùng một mặt bằng vẽ hai lần ra hai tờ khác nhau, nên biết
    // đã mô tả thế nào là cách duy nhất hiểu vì sao tờ này ra như vậy.
    prompt_excerpt: input.sheetPrompt.slice(0, 1200),
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
