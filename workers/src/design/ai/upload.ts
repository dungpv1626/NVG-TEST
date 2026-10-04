/**
 * Bản vẽ kỹ sư tải lên làm nguồn cho mô hình ảnh (T114 Đợt 4, 03/10/2026) — phần THUẦN: kiểm tệp,
 * dựng lời dẫn, đúc artifact. Tuyến HTTP ở `upload-routes.ts`.
 *
 * Haan: ảnh mặt bằng có nội thất và ảnh mặt đứng có vật liệu vẽ được «dựa trên bản vẽ do AI tạo hoặc
 * bản vẽ do kỹ sư chỉnh sửa (hoặc tự tạo)». Bản AI có toạ độ nên lời dẫn kể được từng phòng; bản kỹ
 * sư chỉ là ảnh, nên lời dẫn ngắn và mô hình đọc thẳng bản vẽ.
 */

import type { AiFacadeBrief, AiUploadedDrawing } from '@nvg/shared/design';
import type { FacadeVocabulary } from '../kb/facade-vocabulary';
import { facadeRequirementsText } from './facade/brief';
import type { AiPrompts } from './prompts';
import { fill, pngSize, type SheetImagePrompt } from './sheet-image';

export const UPLOADED_DRAWING_SCHEMA_VERSION = '1.0.0';

/**
 * Ba khung mô hình ảnh nhận — cùng ba khung của ảnh neo bản AI. Trình duyệt đệm bản vẽ về một
 * trong ba (không kéo méo); máy chủ chỉ nhận đúng ba khung này.
 */
export const UPLOAD_FRAMES: ReadonlyArray<readonly [number, number]> = [
  [1024, 1024],
  [1536, 1024],
  [1024, 1536],
];

/** Trần một bản vẽ đã chuẩn hoá. Bản nét CAD 1536 px nặng 0,2–1 MB; trần chặn nhầm tệp, không chặn bản lớn. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export type UploadCheck =
  { ok: true; width: 1024 | 1536; height: 1024 | 1536 } | { ok: false; error: string };

/**
 * Kiểm phần chữ của yêu cầu tải lên. Hàng rào dữ liệu hạng 1 (T12) nằm ở đây: không có lời xác nhận
 * đã bỏ khung tên thì không nhận, dù ảnh trông sạch — máy chủ không đọc được chữ trên bản vẽ.
 */
export function checkUploadRequest(body: {
  drawing?: unknown;
  level?: unknown;
  identityCleared?: unknown;
}): { ok: true; drawing: 'plan' | 'facade'; level: number | null } | { ok: false; error: string } {
  if (body.drawing !== 'plan' && body.drawing !== 'facade') {
    return { ok: false, error: 'Chọn loại bản vẽ: mặt bằng hoặc mặt đứng.' };
  }
  const level = body.drawing === 'plan' ? Number(body.level ?? 1) : null;
  if (level !== null && (!Number.isInteger(level) || level < 1 || level > 20)) {
    return { ok: false, error: 'Số tầng không hợp lệ.' };
  }
  if (body.identityCleared !== true) {
    return {
      ok: false,
      error:
        'Cần xác nhận đã bỏ khung tên và mọi thông tin chủ nhà (tên, địa chỉ, số điện thoại, mã hồ sơ) khỏi bản vẽ trước khi tải lên.',
    };
  }
  return { ok: true, drawing: body.drawing, level };
}

/** Tệp nhận về có đúng là PNG, đúng một trong ba khung, trong trần dung lượng không. */
export function checkUploadedPng(bytes: Uint8Array): UploadCheck {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'Bản vẽ quá lớn sau khi chuẩn hoá (tối đa 6 MB). Xuất lại với ít chi tiết hơn.',
    };
  }
  const size = pngSize(bytes);
  if (!size) return { ok: false, error: 'Bản vẽ phải được chuẩn hoá thành tệp PNG trước khi gửi.' };
  const frame = UPLOAD_FRAMES.find(([w, h]) => w === size.width && h === size.height);
  if (!frame) {
    return {
      ok: false,
      error: `Khung ${size.width}×${size.height} điểm ảnh không dùng được. Tải lại tệp để trình duyệt chuẩn hoá.`,
    };
  }
  return { ok: true, width: frame[0] as 1024 | 1536, height: frame[1] as 1024 | 1536 };
}

/** Lời dẫn ảnh mặt bằng có nội thất từ bản kỹ sư. Phong cách lấy từ đầu bài; không có thì bỏ câu ấy. */
export function uploadPlanPrompt(input: {
  level: number;
  styleCode: string | null;
  prompts: AiPrompts;
}): SheetImagePrompt {
  const style = input.styleCode ? (input.prompts.sheetImage.styles[input.styleCode] ?? '') : '';
  return {
    system: input.prompts.uploadImage.plan.system,
    prompt: fill(input.prompts.uploadImage.plan.user, {
      level_name: input.level === 1 ? 'Ground floor (storey 1)' : `Storey ${input.level}`,
      style,
    }).trimEnd(),
  };
}

/**
 * Lời dẫn ảnh mặt đứng có vật liệu từ bản kỹ sư. Vật liệu, màu, mái lấy từ phần Mặt đứng của đầu bài
 * (T114) — cùng khối «REQUIRED / để AI chọn» mà lời dẫn ý tưởng mặt đứng dùng. Không có khung mặt đứng
 * nào từ mặt bằng AI, nên không biết sân trước: để mô hình theo đúng cổng, rào trên bản vẽ.
 */
export function uploadFacadePrompt(input: {
  facadeBrief: AiFacadeBrief | null;
  vocab: FacadeVocabulary;
  prompts: AiPrompts;
}): SheetImagePrompt {
  const code = input.facadeBrief?.style ?? null;
  const style = code
    ? (input.prompts.facadeImage.styles[code] ?? code)
    : 'not given — suit the drawing';
  return {
    system: input.prompts.uploadImage.facade.system,
    prompt: fill(input.prompts.uploadImage.facade.user, {
      style,
      requirements: facadeRequirementsText(input.facadeBrief, input.vocab),
    }).trimEnd(),
  };
}

/** Đúc payload artifact `ai_uploaded_drawing`. */
export function assembleUploadedDrawing(input: {
  drawing: 'plan' | 'facade';
  level: number | null;
  uri: string;
  width: 1024 | 1536;
  height: 1024 | 1536;
  sha256: string;
  bytes: number;
  note: string | null;
}): AiUploadedDrawing {
  return {
    schema_version: UPLOADED_DRAWING_SCHEMA_VERSION,
    drawing: input.drawing,
    // Mặt đứng không có tầng; mặt bằng không khai tầng thì là tầng 1.
    level: input.drawing === 'plan' ? (input.level ?? 1) : null,
    uri: input.uri,
    mime: 'image/png',
    width: input.width,
    height: input.height,
    sha256: input.sha256,
    bytes: input.bytes,
    note: input.note?.trim() ? input.note.trim().slice(0, 200) : null,
    identity_cleared: true,
  };
}
