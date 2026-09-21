/**
 * Tờ mặt bằng công năng CÓ NỘI THẤT do mô hình ảnh vẽ — phần THUẦN (T57, 19/09/2026).
 *
 * ── Đây là lần thứ hai, và lần trước đã bị gỡ ──────────────────────────────────────────
 * T21 (10/09/2026) làm đúng việc này và T22 (12/09) xoá hẳn nó đi, vì tờ ảnh không đo được
 * trong khi mục tiêu đợt ấy là nâng độ chính xác bản vẽ. Lý do ấy VẪN ĐÚNG: tờ SVG tất định
 * (`ai/draw/`) vẫn là tờ CHÍNH, vẫn hiện mặc định, vẫn là thứ xuất DXF. Tờ ảnh ở đây là tấm
 * TRÌNH KHÁCH, đứng cạnh chứ không thay — cùng vai trò với ảnh phối cảnh.
 *
 * ── Khác biệt DUY NHẤT với T21, và là toàn bộ lý do đợt này được làm lại ───────────────
 * T21 CỐ Ý không gửi ảnh: mô hình chỉ nhận chữ. Hệ quả đo được hôm ấy là nó vẽ một ngôi nhà
 * KHÁC với ngôi nhà đã xếp. Nay lời gọi mang theo **ảnh neo** — chính tờ mặt bằng dựng từ toạ
 * độ (`draw/anchor.ts`), rasterise ở trình duyệt — nên mô hình vẽ lại đúng ngôi nhà ấy.
 *
 * Vì thế `sheetImageCallOptions` tách riêng và có phép thử canh: lời gọi phải mang ĐÚNG MỘT
 * ảnh vào. Gửi mảng rỗng là lặng lẽ rơi về T21 mà vẫn trả tiền, và không màn hình nào lộ ra.
 *
 * ── Thứ Haan đã chấp nhận đánh đổi (19/09) ─────────────────────────────────────────────
 * Mô hình viết CẢ chữ lẫn số. Nên tờ này in tên phòng và mét vuông trông rất có thẩm quyền mà
 * có thể sai dấu, sai số. Chỗ chống đỡ duy nhất là bơm tên phòng và diện tích THẬT vào lời dẫn
 * để mô hình CHÉP LẠI, cộng nhãn cảnh báo hai lớp ở trình duyệt.
 *
 * Tệp này thuần: không `fetch`, không kho, không CSDL. Nhờ vậy toàn bộ đường vẽ kiểm thử được
 * bằng client giả, không tốn một lượt gọi trả phí nào.
 */

import type { AiFloorPlan, AiPlanSheetImage } from '@nvg/shared/design';
import type { GenerateImagePart } from '../llm/gemini';
import type { AiImageOptions } from '../llm/text-client';
// Nhập thẳng mô-đun lá, KHÔNG qua `./draw`: tệp chỉ mục kéo theo `style-data.ts`, mà tệp ấy nạp
// `kb/sheet_style.yaml` bằng `import` — Vitest không nạp được YAML kiểu đó, nên đi qua chỉ mục là
// biến cả tệp thuần này thành thứ chỉ chạy được trong bản dựng Worker.
import { PlanSheetError } from './draw/plan-sheet';
import { bboxOfPoints, polygonArea, toPt } from './draw/geometry';
import type { AiPrompts } from './prompts';

/** Phiên bản hợp đồng `ai-plan-sheet-image` mà tệp này đúc ra. */
const SCHEMA_VERSION = '2.0.0';

export interface SheetImagePromptInput {
  plan: AiFloorPlan;
  level: number;
  prompts: AiPrompts;
  /** Nhãn tiếng Việt của mã phòng — `roomLabels()` từ `kb/room_vocabulary.yaml`. */
  labels: Record<string, string>;
  /** Tỷ lệ của ảnh neo, để khung tên mô hình vẽ ghi đúng con số mà nó đang nhìn. */
  scale: number;
  /** Mã phong cách của đầu bài. `null` = bỏ hẳn mệnh đề phong cách, không thay bằng mặc định. */
  styleCode: string | null;
}

export interface SheetImagePrompt {
  system: string;
  prompt: string;
}

/**
 * Ghép lời dẫn gửi cho mô hình ảnh.
 *
 * `system` là hằng phong cách trình bày của NVG; `prompt` là khuôn bảy chỗ điền. Cả hai nằm ở
 * `kb/ai_design_prompts.yaml` chứ không trong mã — lời dẫn là thứ sẽ chỉnh sau mỗi lần đo, và
 * chỉnh nó không được đòi một lần triển khai.
 *
 * ⚠️ Hàm này KHÔNG nhận `projectId`, và đó là một ràng buộc chứ không phải chuyện tình cờ: khung
 * tên là cửa duy nhất chữ có thể đi từ hồ sơ ra ngoài, và tuyến ảnh chỉ nhận tới hạng 2. Không có
 * mã hồ sơ trong tay thì không có đường nào viết nhầm nó vào lời dẫn.
 */
export function sheetImagePrompt(input: SheetImagePromptInput): SheetImagePrompt {
  const level = input.plan.levels.find((item) => item.level === input.level);
  if (!level) {
    throw new PlanSheetError(`Phương án này không có tầng ${input.level}.`);
  }
  const box = bboxOfPoints(level.outline.map(toPt));
  const style = input.styleCode ? (input.prompts.sheetImage.styles[input.styleCode] ?? '') : '';

  return {
    system: input.prompts.sheetImage.system,
    prompt: fill(input.prompts.sheetImage.user, {
      level_name: level.name,
      rooms: roomLines(level, input.labels),
      footprint: `${trimZero((box.x1 - box.x0) / 100)} m wide by ${trimZero((box.y1 - box.y0) / 100)} m deep`,
      // Bằng MI-LI-MÉT, đúng đơn vị chuỗi kích thước trên ảnh neo — để mô hình chép lại con số
      // nó đang nhìn thấy chứ không quy đổi hộ sang mét rồi sai một dấu phẩy.
      dimensions: `${Math.round((box.x1 - box.x0) * 10)} along the front, ${Math.round((box.y1 - box.y0) * 10)} into the lot`,
      // `north_deg` do Worker điền và có thể vắng ở artifact cũ; vắng thì coi như bắc hướng lên.
      north: northText(input.plan.north_deg ?? 0),
      title_block: titleBlock(level, input.scale),
      style,
    }).trimEnd(),
  };
}

/**
 * Bốn dòng khung tên mà mô hình ĐƯỢC PHÉP viết — và không dòng nào khác.
 *
 * Mọi con số ở đây lấy từ artifact. Không tên khách, không địa chỉ, không mã hồ sơ, không ngày,
 * không chữ ký, không tên công ty: hàm không nhận những thứ ấy nên cũng không viết ra được.
 */
function titleBlock(level: AiFloorPlan['levels'][number], scale: number): string {
  const box = bboxOfPoints(level.outline.map(toPt));
  // Diện tích xây dựng = diện tích hình bao khối xây, không phải tổng diện tích phòng (tổng phòng
  // đo lọt lòng nên luôn nhỏ hơn, và hai con số đứng cạnh nhau trên cùng tờ thì người đọc hiểu là
  // bản vẽ tự mâu thuẫn).
  const built = polygonArea(level.outline.map(toPt)) / 10000;
  return [
    `MẶT BẰNG CÔNG NĂNG — ${level.name.toLocaleUpperCase('vi-VN')}`,
    `DIỆN TÍCH XÂY DỰNG: ${trimZero(built)} m²`,
    `KÍCH THƯỚC: ${Math.round((box.x1 - box.x0) * 10)} × ${Math.round((box.y1 - box.y0) * 10)} mm`,
    `TỶ LỆ 1:${scale} — Kích thước ghi bằng mi-li-mét`,
  ].join('\n');
}

/**
 * Danh sách phòng gửi kèm: nhãn tiếng Việt + diện tích THẬT.
 *
 * Số ở đây lấy từ artifact, không phải từ mô hình ảnh — mô hình ảnh chỉ được yêu cầu CHÉP LẠI.
 * Nó vẫn chép sai được (đó là bản chất của mô hình ảnh), nhưng chép sai thì nhìn ra ngay khi đối
 * chiếu với bảng diện tích, còn không đưa số vào thì nó tự bịa và không có gì để đối chiếu.
 *
 * Không gian mở chia khu (`parts`) kê từng khu MỘT DÒNG, đúng cách tờ vector ghi nhãn: một ô bếp
 * + ăn + khách mà chỉ ghi «PHÒNG KHÁCH» thì người đọc hiểu là một phòng khách khổng lồ (T49).
 *
 * Kèm KÍCH THƯỚC ô chứ không chỉ diện tích (T68). Lời dẫn hệ thống đòi «nội thất vẽ vừa với căn
 * phòng nó nằm trong», mà 12 m² có thể là 3×4 m hay 2×6 m — cái giường đôi 1,6 m vẽ vào phòng
 * rộng 2 m là sai tỉ lệ đúng họ lỗi đã đo ở ảnh phối cảnh.
 */
function roomLines(level: AiFloorPlan['levels'][number], labels: Record<string, string>): string {
  const nameOf = (type: string, label?: string | null): string =>
    (label?.trim() || labels[type] || type).toLocaleUpperCase('vi-VN');
  return level.rooms
    .flatMap((room) => {
      const parts = room.parts ?? [];
      if (parts.length > 1) {
        // `parts[]` cố ý KHÔNG có `label` trong hợp đồng: nhãn của một khu suy từ `type`, vì khu
        // không phải phòng nên mô hình không được đặt tên riêng cho nó.
        return parts.map(
          (part) => `- ${nameOf(part.type)} — ${trimZero(part.area_m2)} m²${sizeOf(part.rect)}`,
        );
      }
      return [
        `- ${nameOf(room.type, room.label)} — ${trimZero(room.area_m2)} m²${sizeOf(room.rect)}`,
      ];
    })
    .join('\n');
}

/** «, 3.2 × 4.1 m» — rỗng khi hợp đồng không có ô chữ nhật của phòng ấy. */
function sizeOf(rect: readonly number[] | null | undefined): string {
  if (!rect || rect.length < 4) return '';
  const [x0, y0, x1, y1] = rect as [number, number, number, number];
  return `, ${trimZero(Math.abs(x1 - x0) / 100)} × ${trimZero(Math.abs(y1 - y0) / 100)} m`;
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
 * Thay theo BẢNG chứ không thay nối tiếp: tên phòng là chữ tự do do mô hình sinh, nên nó có thể
 * chứa chuỗi trông như một chỗ điền khác, và thay nối tiếp thì lần sau sẽ thay tiếp vào chính giá
 * trị vừa đặt.
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

/**
 * Kiểu ảnh của một chuỗi base64 — `null` nghĩa là KHÔNG nhận ra.
 *
 * Cố ý không dùng `sniffMime` của `llm/image-bytes.ts`: hàm ấy ngã về `image/png` khi không nhận
 * ra, đúng cho việc ĐOÁN kiểu của ảnh nhà cung cấp trả về, nhưng sai hẳn cho việc KIỂM một tấm
 * ảnh do trình duyệt gửi lên. Ở đây «không nhận ra» phải là một câu trả lời, không phải một
 * phỏng đoán — nếu không thì mọi chuỗi rác đều đi tiếp thành một tệp PNG hỏng gửi ra ngoài.
 */
export function anchorMime(dataBase64: string): string | null {
  if (dataBase64.startsWith('/9j/')) return 'image/jpeg';
  if (dataBase64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (dataBase64.startsWith('UklGR')) return 'image/webp';
  return null;
}

/**
 * Bề rộng và chiều cao khai trong chính tệp PNG — `null` nếu không phải PNG hợp lệ.
 *
 * Đọc thẳng khối IHDR: 8 byte chữ ký, 4 byte độ dài, 4 byte `IHDR`, rồi hai số nguyên 32 bit
 * big-endian. Không cần thư viện, và cũng cố ý không dùng thư viện — đây là phép đọc bốn con số
 * trên một tệp KHÔNG TIN ĐƯỢC, nên nó phải nhỏ tới mức đọc hết được bằng mắt.
 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24) return null;
  for (let i = 0; i < SIGNATURE.length; i += 1) if (bytes[i] !== SIGNATURE[i]) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
  const at = (offset: number): number =>
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0;
  const width = at(16);
  const height = at(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Tham số lời gọi mô hình ảnh — tách riêng CHỈ để kiểm thử được chỗ quan trọng nhất của đợt này.
 *
 * `images` phải có đúng một phần tử. Một mảng rỗng vẫn chạy, vẫn ra ảnh, vẫn tính tiền — và vẫn
 * là T21, tức mô hình vẽ một ngôi nhà khác. Không màn hình nào lộ ra chuyện đó, nên nó phải có
 * lưới ở đây.
 */
export function sheetImageCallOptions(
  prompt: SheetImagePrompt,
  anchor: GenerateImagePart,
): AiImageOptions {
  return { system: prompt.system, prompt: prompt.prompt, images: [anchor] };
}

export interface AssembleSheetImageInput {
  planRef: string;
  level: number;
  uri: string;
  mime: string;
  widthPx: number | null;
  heightPx: number | null;
  prompt: string;
  styleCode: string | null;
  anchor: { sha256: string; bytes: number; mime: string };
  route: string;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number | null;
}

/**
 * Đúc payload artifact `ai_plan_sheet_image`.
 *
 * `watermark_applied` luôn `false` và hợp đồng khai `const false` — byte trong kho CHƯA đóng dấu.
 * Worker không có canvas, và đóng dấu bằng Container thì phá tính độc lập của nhánh AI (CLAUDE.md
 * 8.5b). Nhãn cảnh báo do trình duyệt in lên, cả khi xem lẫn khi tải về.
 */
export function assembleSheetImage(input: AssembleSheetImageInput): AiPlanSheetImage {
  return {
    schema_version: SCHEMA_VERSION,
    plan_ref: input.planRef,
    level: input.level,
    uri: input.uri,
    mime: input.mime as AiPlanSheetImage['mime'],
    width: input.widthPx,
    height: input.heightPx,
    // Máy chủ không kiểm được tấm PNG nhận về có đúng là tờ nó vừa phát ra không (nó không
    // rasterise được). Băm ở đây là dấu vết pháp y duy nhất, và là chỗ bám để sau này trả lời
    // «hai tờ này vẽ từ cùng một ảnh neo không».
    anchor: {
      source: 'client_raster',
      sha256: input.anchor.sha256,
      bytes: input.anchor.bytes,
      mime: input.anchor.mime as AiPlanSheetImage['anchor']['mime'],
    },
    style_code: input.styleCode,
    watermark_applied: false,
    // Giữ nguyên văn đoạn đã gửi: cùng một mặt bằng vẽ hai lần ra hai tờ khác nhau, nên biết đã
    // mô tả thế nào là cách duy nhất hiểu vì sao tờ này ra như vậy.
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
