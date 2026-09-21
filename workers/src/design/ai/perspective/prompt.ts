/**
 * Lời dẫn của một góc phối cảnh (T67) — phần THUẦN.
 *
 * Ghép từ ba nguồn, mỗi nguồn một việc:
 *  · `kb/ai_design_prompts.yaml` khối `perspective` — góc máy, ánh sáng, các bảng tra. Là DỮ LIỆU
 *    vì đây là thứ sẽ chỉnh sau mỗi lần đo, và chỉnh nó không được đòi một lần triển khai.
 *  · `facadeLook()` — ngôi nhà làm bằng gì. Dùng CHUNG với tờ ảnh mặt đứng, không viết lại.
 *  · `perspectiveContext()` — hình khối, lối vào, hiện trạng thửa đất, số xe.
 *
 * Hàm KHÔNG nhận mã hồ sơ, tên khách hay địa chỉ — cùng ràng buộc cấu trúc với `sheetImagePrompt`
 * (T57): không có trong tay thì không có đường nào viết nhầm vào lời dẫn.
 *
 * Tệp thuần: không `fetch`, không kho, không CSDL.
 */

import type { AiImageSetView } from '@nvg/shared/design';
import type { FacadeLook } from '../facade/image';
import type { AiPrompts } from '../prompts';
import { sunFrom, type PerspectiveContext, type Side } from './context';

export interface PerspectivePrompt {
  system: string;
  prompt: string;
}

export interface PerspectivePromptInput {
  view: AiImageSetView;
  context: PerspectiveContext;
  look: FacadeLook;
  prompts: AiPrompts;
  /** Ô của kỹ sư: cho phép thêm người, ô tô, xe máy. */
  peopleAndVehicles: boolean;
}

export class PerspectivePromptError extends Error {
  readonly retryable = false;
}

/** Ghép lời dẫn cho một góc. */
export function perspectivePrompt(input: PerspectivePromptInput): PerspectivePrompt {
  const block = input.prompts.perspective;
  const view = block.views[input.view];
  if (!view) {
    throw new PerspectivePromptError(`kb/ai_design_prompts.yaml chưa có góc "${input.view}".`);
  }
  const ctx = input.context;

  // Nắng đến từ đâu phụ thuộc giờ chụp của CHÍNH góc này. Góc không khai giờ thì câu ánh sáng của
  // nó không có `{sun}` (kiểm lúc nạp), nên chỗ điền rỗng cũng không để lại dấu vết nào.
  const sun = view.sunTime ? (block.sun[sunFrom(ctx.orientation, view.sunTime)] ?? '') : '';

  return {
    system: block.system,
    prompt: fill(block.user, {
      view: view.shot,
      camera: fill(view.camera, { depth_note: depthNote(ctx) }),
      lighting: fill(view.lighting, { sun }),
      house: houseText(ctx, block.buildingTypes),
      site: siteText(ctx, block.neighbours, block.scale),
      style: input.look.style,
      roof: input.look.roof,
      materials: input.look.materials,
      palette: input.look.palette,
      railing: input.look.railing,
      gate_fence: input.look.gateFence,
      elements: input.look.elements,
      life: lifeText(ctx, block, input.peopleAndVehicles),
    }).trimEnd(),
  };
}

/**
 * Khối nhà nói bằng chữ: loại, số tầng, ba kích thước, và lối vào nằm đâu.
 *
 * Ba kích thước đi kèm nhau có chủ đích. Bề rộng thì mô hình đọc được trên tờ mặt đứng, nhưng
 * chiều sâu thì KHÔNG — tờ mặt đứng là hình chiếu phẳng. Thiếu con số ấy, một nhà phố sâu 18 m bị
 * vẽ thành khối hộp vuông, và chỗ sai chỉ lộ ra ở góc nghiêng.
 */
function houseText(ctx: PerspectiveContext, types: Record<string, string>): string {
  const kind = types[ctx.buildingType] ?? 'a house';
  const parts = [
    `${ctx.storeys}-storey ${kind}`,
    `${ctx.frontWidthM} m wide across the front`,
    `${ctx.depthM} m deep`,
    `${ctx.heightM} m from the pavement to the top of the parapet`,
  ];
  // Chiều cao TỪNG tầng, không chỉ tổng: nhà tầng trệt 3,9 m đội hai tầng 3,3 m và nhà ba tầng
  // đều 3,5 m có cùng tổng, và mô hình chia đều — ra một mặt tiền không khớp tờ mặt đứng (T68).
  const storeys = ctx.levelHeightsM.length
    ? ` Storey heights from the ground up: ${ctx.levelHeightsM.map((h) => `${h} m`).join(', ')}.`
    : '';
  const step = ctx.stepUpM > 0 ? ` The ground floor sits ${ctx.stepUpM} m above the pavement.` : '';
  return `${parts.join(', ')}.${storeys}${step}${entranceText(ctx)}${balconyText(ctx)}`;
}

/**
 * Lối vào nằm đâu trên mặt tiền.
 *
 * Hai cửa cùng một phía thì gộp một mệnh đề. Viết rời ra thành «cửa chính ở giữa và cửa để xe ở
 * giữa» — đúng dữ liệu, nhưng đọc như hai chỗ khác nhau, và mô hình tách chúng ra hai bên cho
 * «hợp lý». Nhà phố mặt tiền 4 m thì hai cửa nằm cạnh nhau ở giữa là chuyện bình thường.
 */
function entranceText(ctx: PerspectiveContext): string {
  const { mainDoorSide: door, garageSide: garage } = ctx;
  if (door && garage && door === garage) {
    return ` The front door${widthText(ctx.mainDoorWidthM)} and the garage door${widthText(
      ctx.garageWidthM,
    )} are side by side ${sideText(door)} of the facade.`;
  }
  const doors = [
    door ? `the front door${widthText(ctx.mainDoorWidthM)} ${sideText(door)}` : null,
    garage ? `the garage door${widthText(ctx.garageWidthM)} ${sideText(garage)}` : null,
  ].filter(Boolean);
  return doors.length ? ` The facade has ${doors.join(' and ')}.` : '';
}

/** « (2.4 m wide)» — rỗng khi không có số, để câu vẫn đọc được thay vì hở một dấu ngoặc. */
function widthText(widthM: number | null): string {
  return widthM === null ? '' : ` (${widthM} m wide)`;
}

/**
 * Ban công trên mặt tiền: bề rộng thật, tầng nào, lan can cao bao nhiêu.
 *
 * Trước T68 chỗ này là một bit `hasBalcony`. Ban công 1,2 m trên nhà phố 4 m và ban công chạy
 * suốt 6 m mặt tiền ra cùng một lời dẫn — và góc cận cảnh `balcony_close` thì ban công chiếm
 * nửa khung hình, nên sai bề rộng là sai cả tấm ảnh.
 */
function balconyText(ctx: PerspectiveContext): string {
  if (!ctx.balconies.length) return '';
  const list = ctx.balconies
    .map((b) => `${b.widthM} m wide on storey ${b.level}`)
    .join(', and one ');
  const railing =
    ctx.railingHM === null ? '' : ` The balcony railings are ${ctx.railingHM} m high.`;
  return ` There is a balcony ${list}.${railing}`;
}

/** «on the left» / «in the middle» / «on the right», nhìn từ ngoài đường vào. */
function sideText(side: Side): string {
  if (side === 'centre') return 'in the middle';
  return `on the ${side}`;
}

/** Câu nhắc chiều sâu, chỉ dùng ở góc nghiêng — chỗ điền `{depth_note}` của `views.oblique.camera`. */
function depthNote(ctx: PerspectiveContext): string {
  if (ctx.depthM > ctx.frontWidthM * 1.5) return 'much deeper than it is wide';
  if (ctx.frontWidthM > ctx.depthM * 1.5) return 'much wider than it is deep';
  return 'roughly as deep as it is wide';
}

/**
 * Thửa đất và hiện trạng quanh nó.
 *
 * Mã hiện trạng không có trong bảng tra thì phía ấy KHÔNG được nhắc — không đoán hộ. Một câu
 * «an empty plot on the left» sai là một tấm ảnh có khoảng trống không tồn tại, và người xem tin
 * ngay vì nó nằm trong ảnh chứ không nằm trong chữ.
 */
function siteText(
  ctx: PerspectiveContext,
  table: Record<string, string>,
  scale: AiPrompts['perspective']['scale'],
): string {
  const parts = [...yardText(ctx, scale)];
  const sides = (
    [
      ['left', ctx.neighbours.left],
      ['right', ctx.neighbours.right],
      ['behind', ctx.neighbours.back],
    ] as const
  )
    .map(([where, code]) => {
      const phrase = code ? table[code] : undefined;
      return phrase ? `${phrase} ${where === 'behind' ? 'behind' : `on the ${where}`}` : null;
    })
    .filter(Boolean);
  if (sides.length) parts.push(`There is ${sides.join(', ')}.`);
  parts.push('A street runs along the front of the plot.');
  return parts.join(' ');
}

/**
 * Thửa đất và khoảng sân — BẰNG SỐ, kèm hệ quả về tỉ lệ (T68).
 *
 * Đây là chỗ hỏng đã đo được ngày 20/09/2026: đầu bài khai sân trước 3 m, lời dẫn chỉ viết «có
 * một sân trước», và tấm ảnh thật ra sân sâu 8–10 m — ai nhìn cũng thấy sai vì một thân ô tô đã
 * hơn 4 m mà sân vẫn còn thừa.
 *
 * Hai điều phải nói, không phải một:
 *  1. **Con số**, cho cả bốn mặt và cho cả thửa — mô hình cần biết sân là một dải hẹp hay một
 *     khoảng rộng.
 *  2. **Hệ quả**, vì con số một mình không đủ: nói «sân sâu 3 m» rồi vẫn xin «một chiếc ô tô cho
 *     sinh động» là ra chiếc xe đỗ ngang một khoảng sân không chứa nổi nó. Câu hệ quả lấy từ
 *     `kb`, so chiều sâu sân với chiều dài xe thật.
 *
 * Không biết kích thước thửa thì KHÔNG nói gì về sân — một câu đoán ở đây in thẳng thành hình.
 */
function yardText(
  ctx: PerspectiveContext,
  scale: AiPrompts['perspective']['scale'],
): string[] {
  const yard = ctx.yard;
  if (!yard) return [];
  const lot = ctx.lot
    ? [`The plot is ${ctx.lot.widthM} m wide and ${ctx.lot.depthM} m deep.`]
    : [];
  if (yard.frontM <= 0) return [...lot, scale.noYard.trim()];

  const sides = [
    `${yard.frontM} m from the front boundary`,
    `${yard.leftM} m from the left boundary`,
    `${yard.rightM} m from the right boundary`,
    `${yard.backM} m from the rear boundary`,
  ].join(', ');
  const body =
    `The house stands ${sides}. The front yard is therefore ${yard.frontM} m deep, ` +
    `measured from the gate and fence line to the front wall of the house — draw the fence and ` +
    `gate exactly that far in front of the facade, not further.`;
  const consequence =
    yard.frontM < scale.motorbikeLengthM
      ? fill(scale.yardShorterThanMotorbike, { yard: String(yard.frontM) })
      : yard.frontM < scale.carLengthM
        ? fill(scale.yardShorterThanCar, { yard: String(yard.frontM) })
        : '';
  return [...lot, body, ...(consequence ? [consequence.trim()] : [])];
}

/**
 * Câu người và xe.
 *
 * Số xe lấy từ đầu bài. Đầu bài không khai xe nào thì dùng câu `none` — một chiếc chung chung,
 * KHÔNG phải không có xe: đầu bài để trống nghĩa là chưa hỏi, không nghĩa là nhà không có xe, và
 * một sân trống trơn trong ảnh trình khách trông như nhà bỏ không.
 */
function lifeText(
  ctx: PerspectiveContext,
  block: AiPrompts['perspective'],
  allowed: boolean,
): string {
  if (!allowed) return block.life.off;
  // Sân ngắn hơn một thân xe thì KHÔNG dùng câu «đỗ trong thửa»: hai câu ngược nhau trong cùng
  // một lời dẫn, và mô hình giải mâu thuẫn bằng cách nới sân ra cho vừa chiếc xe (T68).
  const tight =
    ctx.yard !== null && ctx.yard.frontM > 0 && ctx.yard.frontM < block.scale.carLengthM;
  const shell = tight ? block.life.onTightYard : block.life.on;
  // `{s}` là chỗ điền số nhiều — để trong DỮ LIỆU chứ không ghép trong mã: tiếng Anh thêm «s»,
  // ngôn ngữ khác thì không, và khuôn câu là thứ sửa được mà không cần triển khai lại.
  const vehicles = [
    ctx.cars && ctx.cars > 0
      ? fill(block.vehicles.cars, { cars: String(ctx.cars), s: ctx.cars > 1 ? 's' : '' })
      : null,
    ctx.motorbikes && ctx.motorbikes > 0
      ? fill(block.vehicles.motorbikes, {
          motorbikes: String(ctx.motorbikes),
          s: ctx.motorbikes > 1 ? 's' : '',
        })
      : null,
  ].filter(Boolean);
  return fill(shell, {
    vehicles: vehicles.length ? capitalise(vehicles.join(' and ')) : block.vehicles.none,
  });
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Điền khuôn theo BẢNG, không thay nối tiếp.
 *
 * Cùng lý do đã ghi ở `sheet-image.ts`: giá trị điền vào có thể chứa chuỗi trông như một chỗ điền
 * khác, và thay nối tiếp thì lượt sau sẽ thay tiếp vào chính giá trị vừa đặt.
 */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    key in values ? values[key]! : match,
  );
}
