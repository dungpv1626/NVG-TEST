/**
 * Lớp 3a — sinh `LayoutIntent`: CẤU TRÚC bố cục, không có một toạ độ nào.
 *
 * Nguồn: `doc/design/04-layer3-floorplan.md` mục 4.2 và 4.3.
 *
 * ## Vì sao bản này tất định chứ không gọi mô hình ngôn ngữ
 *
 * Tài liệu đặt Lớp 3a vào tay mô hình ngôn ngữ, và đó vẫn là đích. Nhưng thứ mô hình ngôn ngữ
 * sinh ra phải đi qua đúng bộ kiểm cấu trúc dưới đây rồi mới tới bộ giải (mục 4.3: "validate
 * output trước khi đưa vào solver… lỗi cấu trúc thì reject và sinh lại variant"). Dựng bộ
 * sinh tất định trước là cách rẻ nhất để có bộ kiểm đó: nó vừa là đường lùi khi hết hạn mức
 * API (PRD, tính năng AI không được chặn luồng chính), vừa là mốc so sánh để biết phương án
 * của mô hình ngôn ngữ có HƠN được một khung mẫu hay không.
 *
 * Nó KHÔNG sinh toạ độ hay kích thước — nguyên tắc bất biến 2 (CLAUDE.md 8.2) áp dụng cho mọi
 * thứ đứng ở vị trí của Lớp 3a, kể cả khi đó là mã nguồn.
 *
 * ## Khung mẫu nhà phố
 *
 *     H( dải mặt tiền ,  V( hành lang dọc , chồng dải phía sau ) )
 *
 * Đây là khung mà mọi nhà ống Việt Nam đi theo, và nó thoả hai vị từ khó nhất THEO CẤU TRÚC:
 *
 *  · **Lối vào** — hành lang chạy suốt chiều sâu nên mọi dải phía sau đều giáp nó. Không có
 *    phòng nào phải đi xuyên phòng khác. Dải mặt tiền giáp hành lang ở cạnh dưới.
 *  · **Chiếu sáng** — dải mặt tiền chạm mặt trước; dải cuối chạm mặt sau. Dải nằm giữa thì
 *    KHÔNG chạm mặt nào, nên phòng cần sáng ở đó được cấp một giếng trời — đúng cách nhà ống
 *    sâu vẫn có phòng ngủ ở giữa.
 *
 * Lõi thang nằm ở dải đầu tiên sau mặt tiền, cùng vị trí trong cây ở mọi tầng, nên nó tự
 * thẳng hàng: `aligned_cuts` thấy các tầng chia giống nhau và dùng chung đúng những đường cắt
 * đó (xem `compute/src/design_compute/solver/tree.py`).
 */

import type { SpaceProgram } from '@nvg/shared/design';

/** Nút của cây chia không gian, đúng ba dạng của hợp đồng — không được lai. */
export type LayoutNode =
  | { split: 'H' | 'V'; ratio_hint?: number; a: LayoutNode; b: LayoutNode }
  | { room: string }
  | { void: 'lightwell' | 'courtyard' | 'atrium' };

export type Face = 'front' | 'back' | 'left' | 'right';

/** Không gian đóng vai trò giao thông — giống danh sách phía Container, cùng lý do tồn tại. */
const CIRCULATION_TYPES = new Set(['circulation', 'stair', 'core']);

/** Loại phòng phục vụ: đẩy vào trong, nhường mặt thoáng cho không gian ở. */
const SERVICE_TYPES = new Set(['wc', 'store', 'technical', 'laundry', 'drying_yard']);

/**
 * Số phòng xếp cạnh nhau trong một dải: MỘT.
 *
 * Xếp hai phòng cạnh nhau thì chỉ phòng sát hành lang có lối vào; phòng còn lại bị kẹp giữa
 * phòng bên cạnh và hai dải trên dưới, và `every_room_requires_access` chặn ngay. Muốn hai
 * phòng một dải thì phải có tuyến giao thông thứ hai — đó là chuyện của biệt thự (Mốc 7),
 * không phải của nhà ống rộng năm mét.
 *
 * Mỗi phòng trải hết bề rộng phần sau cũng chính là cách nhà ống Việt Nam vẫn chia.
 */
const MAX_ROOMS_PER_BAND = 1;

export interface LayoutVariant {
  readonly id: string;
  readonly label: string;
  /** Hành lang dọc nằm bên nào của phần sau. */
  readonly spine: 'left' | 'right';
  /** Lõi thang ở đầu phần sau (giáp mặt tiền) hay ở cuối (giáp mặt sau). */
  readonly core: 'front' | 'rear';
}

/**
 * Ba phương án khác nhau về CẤU TRÚC, không phải khác nhau về vài con số (mục 4.3).
 *
 * "Thang hông trái" và "thang hông phải" đảo chỗ hành lang; "thang phía sau" đổi hẳn thứ tự
 * đi lại trong nhà. Ba cách này cho ra ba mặt bằng mà kiến trúc sư nhận ra ngay là khác nhau.
 */
export const LAYOUT_VARIANTS: readonly LayoutVariant[] = [
  { id: 'A', label: 'Lõi thang hông phải, hành lang bên trái', spine: 'left', core: 'front' },
  { id: 'B', label: 'Lõi thang hông trái, hành lang bên phải', spine: 'right', core: 'front' },
  { id: 'C', label: 'Lõi thang phía sau, hành lang bên trái', spine: 'left', core: 'rear' },
];

export class LayoutIntentError extends Error {
  readonly retryable = false;
}

type Space = SpaceProgram['spaces'][number];

/** Thứ tự nhường mặt thoáng: cần sáng trước, phục vụ sau, rồi tới độ ưu tiên của đầu bài. */
function rank(space: Space): [number, number, number] {
  const needsLight = space.needs_daylight === true ? 0 : 1;
  const service = SERVICE_TYPES.has(space.type) ? 1 : 0;
  return [needsLight, service, space.priority ?? 99];
}

/** Phòng nhỏ trước — dùng để chọn phòng phục vụ đi cùng thang khi không có khu vệ sinh. */
function byArea(a: Space, b: Space): number {
  return (a.target_area_m2 ?? a.min_area_m2) - (b.target_area_m2 ?? b.min_area_m2);
}

function byRank(a: Space, b: Space): number {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i += 1) {
    if (ra[i]! !== rb[i]!) return ra[i]! - rb[i]!;
  }
  return a.id.localeCompare(b.id);
}

/** Gộp một danh sách nút thành chuỗi lát cắt lồng nhau, giữ nguyên thứ tự.

 * Một phần tử thì trả về chính nó — KHÔNG bọc thêm một lát cắt rỗng. Lát cắt thừa sinh ra
 * một ô có bề rộng bằng không, và mọi ràng buộc kích thước tối thiểu sẽ chặn nó lại.
 */
function chain(axis: 'H' | 'V', nodes: LayoutNode[]): LayoutNode {
  if (nodes.length === 0) throw new LayoutIntentError('Không thể dựng lát cắt từ danh sách rỗng.');
  return nodes.reduceRight((rest, node, index) => ({
    split: axis,
    ratio_hint: roundRatio(1 / (nodes.length - index)),
    a: node,
    b: rest,
  }));
}

/** Gợi ý tỉ lệ, làm tròn để cùng đầu vào cho cùng artifact — mã băm phụ thuộc điều đó. */
function roundRatio(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.min(0.99, Math.max(0.01, rounded));
}

interface Band {
  readonly rooms: Space[];
  /** Dải này có chạm một mặt thoáng không — quyết định có phải mở giếng trời hay không. */
  readonly onFacade: boolean;
  /** Hành lang dọc nằm bên nào — giếng trời phải tránh đứng chắn phía đó. */
  readonly spine: 'left' | 'right';
}

/**
 * Ruột của một dải nằm sâu trong nhà: phòng, và giếng trời cạnh nó nếu phòng cần sáng.
 *
 * **Giếng trời đứng về phía ĐỐI DIỆN hành lang.** Cùng lý lẽ đã ghi cho ban công ở dưới,
 * chỉ ngược chiều: ban công phải đứng CÙNG phía hành lang để chạm được nó, còn giếng trời
 * là thứ chen vào giữa nên phải tránh sang phía kia.
 *
 * Bản trước luôn `push` giếng trời xuống cuối dải, tức luôn nằm bên PHẢI phòng, bất kể hành
 * lang ở đâu. Với phương án A và C (hành lang bên trái) điều đó vô hại. Với phương án B
 * (hành lang bên phải) thì giếng trời nằm CHẮN giữa phòng và hành lang, và không có cách nào
 * gỡ: bề rộng tối thiểu của giếng trời mượn chính ngưỡng `corridor_min_width` (0,9 m — một
 * khe 20 cm không lấy sáng cho ai), nên bộ giải không bóp nó về không được. Mọi phòng cần
 * sáng trong phần sau mất lối vào cùng lúc, và `every_room_requires_access` ở mức chặn phát
 * hành kết luận vô nghiệm.
 *
 * Đo trên hồ sơ NVO-TK-2026-2737 ngày 06/09/2026: phương án B hỏng ở MỌI lần sinh, còn A và
 * C luôn giải được — tập ràng buộc mâu thuẫn trỏ vào `corridor_min_width` của một
 * `void_2_…` và `every_room_requires_access` của phòng thờ. Phòng thờ chỉ là phòng mà
 * CP-SAT chọn làm đại diện; mọi phòng cần sáng khác cũng vướng y hệt.
 */
function bandNode(band: Band): LayoutNode {
  const needsLightwell = !band.onFacade && band.rooms.some((r) => r.needs_daylight === true);
  const parts: LayoutNode[] = band.rooms.map((room) => ({ room: room.id }));
  if (needsLightwell) {
    if (band.spine === 'left') parts.push({ void: 'lightwell' });
    else parts.unshift({ void: 'lightwell' });
  }
  return chain('V', parts);
}

/** Mặt nào của hình bao mà một loại phòng BẮT BUỘC giáp — đọc từ vị từ `requires_face`. */
export type FaceNeed = (roomType: string) => 'open' | 'access' | null;

export interface FloorContext {
  /** Tầng đang dựng. Mặt vào được chỉ có nghĩa ở tầng trệt. */
  readonly level?: number;
  /** Mặt nào của thửa vào được từ ngoài. */
  readonly accessFaces?: readonly Face[];
  /**
   * Tra `requires_face` theo loại phòng. Vắng mặt thì trả về `null` cho mọi loại và cây dựng
   * y như trước — gói quy tắc là thứ có thể không có trong tay lớp gọi (xem `NO_RULES`).
   */
  readonly faceOf?: FaceNeed;
}

/**
 * Cây bố cục của MỘT tầng.
 *
 * Trả về `null` khi tầng không có không gian nào — tầng trống là dữ liệu hợp lệ (tum, sân
 * thượng chưa khai), không phải lỗi.
 */
export function floorTree(
  spaces: Space[],
  variant: LayoutVariant,
  openFaces: readonly Face[],
  context: FloorContext = {},
): LayoutNode | null {
  if (spaces.length === 0) return null;

  const stair = spaces.filter((s) => s.type === 'stair');
  const spine = spaces.filter((s) => s.type === 'circulation');
  const others = spaces.filter((s) => !CIRCULATION_TYPES.has(s.type)).sort(byRank);

  const backIsOpen = openFaces.includes('back');
  const frontIsOpen = openFaces.includes('front');

  // Dải mặt tiền nhận phòng đứng đầu bảng xếp hạng — nhưng KHÔNG nhận phòng phục vụ.
  //
  // Dải mặt tiền dùng chung một đường cắt ở mọi tầng (đó chính là tuyến tường ngang đầu tiên),
  // nên diện tích của nó bằng nhau giữa các tầng. Đặt một khu vệ sinh trần 8 m² lên đó là ép
  // cả phòng khách 22 m² của tầng dưới xuống 8 m² — và cái hiện ra không phải "mặt bằng xấu"
  // mà là vô nghiệm, kèm tập ràng buộc trỏ vào đúng chỗ khó hiểu nhất.
  //
  // Tầng không có phòng nào đáng ra mặt tiền thì dải đó thành THÔNG TẦNG. Đây không phải cách
  // né tránh: khoảng rỗng phía trước trên tầng lửng hoặc tầng áp mái là thứ nhà ống vẫn làm,
  // và nó không mang ràng buộc diện tích nào nên không kéo các tầng còn lại theo.
  //
  // ── Hai ngoại lệ đi TRƯỚC bảng xếp hạng ────────────────────────────────────────────
  //
  // Chúng đến từ vị từ `requires_face` của gói quy tắc, và cả hai nói cùng một điều: có
  // những phòng mà VỊ TRÍ là bản chất, không phải sở thích.
  //
  //  · **Chỗ để xe phải giáp mặt đường.** Xếp hạng theo nhu cầu chiếu sáng luôn đẩy phòng
  //    khách ra mặt tiền và dồn chỗ để xe vào trong — đo được 06/09/2026 trên bản vẽ demo:
  //    phòng khách y 0–3,2 m, chỗ để xe y 3,2–6,2 m, và ô tô phải đi xuyên phòng khách.
  //    `every_room_requires_access` không bắt được vì chỗ để xe VẪN giáp hành lang; lối vào
  //    cho xe là quan hệ với đường, không phải với hành lang.
  //  · **Ban công phải giáp mặt thoáng.** Không có ràng buộc này thì nó là một phòng như
  //    mọi phòng khác và rơi vào giữa nhà — bản vẽ demo có ban công 0,40 × 9,00 m, bốn phía
  //    là tường.
  //
  // Ban công đặt CẠNH phòng mặt tiền (lát cắt dọc), không đặt TRƯỚC nó: lát cắt ngang sẽ
  // đẩy phòng mặt tiền ra khỏi mặt trước theo cấu trúc cây, và `bedroom_requires_daylight`
  // — mức chặn phát hành — kết luận vô nghiệm. Ban công lệch một bên là cách nhà ống thật
  // vẫn làm.
  const faceOf = context.faceOf ?? (() => null);
  const accessFaces = context.accessFaces?.length ? context.accessFaces : (['front'] as const);
  const onGround = (context.level ?? 1) === 1;

  const accessRoom =
    onGround && accessFaces.includes('front')
      ? (others.find((o) => faceOf(o.type) === 'access') ?? null)
      : null;
  const outdoorRoom = frontIsOpen
    ? (others.find((o) => o.id !== accessRoom?.id && faceOf(o.type) === 'open') ?? null)
    : null;

  const ranked = others.find((o) => !SERVICE_TYPES.has(o.type) && o.id !== outdoorRoom?.id);
  const front = accessRoom ?? ranked ?? null;
  const taken = new Set([front?.id, outdoorRoom?.id].filter(Boolean) as string[]);
  const afterFront = others.filter((o) => !taken.has(o.id));

  // Thang đi CÙNG một phòng phục vụ (ưu tiên khu vệ sinh) trong một dải, thang ở phía hành
  // lang. Để thang một mình là nó trải hết bề rộng phần sau — 4,1 m × 2,8 m = 13,9 m² cho
  // một vế thang, và tỉ lệ giao thông vọt lên 29% (vướng mắc V-11). Nhà ống thật đặt thang
  // cạnh khu vệ sinh, đúng như thế này. Khu vệ sinh vẫn có lối vào: thang là không gian giao
  // thông (`every_room_requires_access` chấp nhận kề thang).
  const companion =
    stair.length > 0
      ? (afterFront.find((o) => o.type === 'wc') ??
        [...afterFront].filter((o) => SERVICE_TYPES.has(o.type)).sort(byArea)[0] ??
        null)
      : null;
  const rest = companion ? afterFront.filter((o) => o.id !== companion.id) : afterFront;

  // Các phòng còn lại xếp thành dải từ ngoài vào trong. Đảo thứ tự trước khi chia dải để
  // phòng CẦN SÁNG rơi vào dải trong cùng — đó là dải duy nhất chạm mặt sau.
  const ordered = [...rest].reverse();
  const roomBands: Space[][] = [];
  for (let i = 0; i < ordered.length; i += MAX_ROOMS_PER_BAND) {
    roomBands.push(ordered.slice(i, i + MAX_ROOMS_PER_BAND));
  }

  const rooms = (list: Space[]): LayoutNode =>
    chain(
      'V',
      list.map((s) => ({ room: s.id }) as LayoutNode),
    );

  const spineNode = spine.length > 0 ? rooms(spine) : null;
  const stairOnly = stair.length > 0 ? rooms(stair) : null;
  const stairNode: LayoutNode | null =
    stairOnly && companion
      ? variant.spine === 'left'
        ? { split: 'V', ratio_hint: 0.6, a: stairOnly, b: { room: companion.id } }
        : { split: 'V', ratio_hint: 0.4, a: { room: companion.id }, b: stairOnly }
      : stairOnly;

  const stack: LayoutNode[] = [];
  if (stairNode && variant.core === 'front') stack.push(stairNode);
  roomBands.forEach((band, index) => {
    const last = index === roomBands.length - 1 && !(stairNode && variant.core === 'rear');
    stack.push(bandNode({ rooms: band, onFacade: last && backIsOpen, spine: variant.spine }));
  });
  if (stairNode && variant.core === 'rear') stack.push(stairNode);

  // Chồng dải chỉ có mỗi lõi thang: thêm một khoảng thông tầng phía sau nó.
  //
  // Hai lý do, cùng một hành động. Thứ nhất, một vế thang chạy suốt chiều sâu nhà là vô lý và
  // làm bài toán vô nghiệm ngay ở ràng buộc bề rộng tối thiểu. Thứ hai — và quan trọng hơn —
  // `chain` đặt phần tử đầu vào nhánh `a`, nên lõi thang chỉ nằm cùng một ĐƯỜNG ĐI trong cây
  // ở mọi tầng khi mọi tầng đều có ít nhất hai dải. Lệch đường đi thì hai lõi không thể trùng
  // khít, và bộ giải báo `stair_alignment` mâu thuẫn — đúng nhưng không ai đoán ra vì sao.
  if (stack.length === 1 && stairNode) stack.push({ void: 'atrium' });

  // Ruột của dải mặt tiền: phòng mặt tiền, và ban công nằm CẠNH nó — cùng một lát cắt dọc,
  // nên cả hai vẫn chạm mặt trước.
  //
  // Ban công đứng về phía HÀNH LANG, không phải phía đối diện. Đây không phải chuyện thẩm mỹ:
  // hành lang dọc chạy từ sau dải mặt tiền trở vào, nên chỉ phần dải mặt tiền nằm cùng phía
  // với nó mới chung được một đoạn biên với nó. Đặt ban công về phía kia thì nó không kề
  // không gian giao thông nào, và `every_room_requires_access` — mức chặn phát hành — kết
  // luận vô nghiệm. Ban công đi ra từ chiếu nghỉ cũng là cách nhà ống thật vẫn làm.
  const frontCore: LayoutNode | null = front ? { room: front.id } : null;
  const withOutdoor: LayoutNode | null = outdoorRoom
    ? frontCore
      ? variant.spine === 'left'
        ? { split: 'V', ratio_hint: 0.25, a: { room: outdoorRoom.id }, b: frontCore }
        : { split: 'V', ratio_hint: 0.75, a: frontCore, b: { room: outdoorRoom.id } }
      : { room: outdoorRoom.id }
    : frontCore;

  const frontSlot: LayoutNode = withOutdoor
    ? frontIsOpen
      ? withOutdoor
      : // Mặt trước bị bịt: phòng mặt tiền cũng cần giếng trời như một dải nằm giữa.
        { split: 'V', ratio_hint: 0.75, a: withOutdoor, b: { void: 'lightwell' } }
    : { void: 'atrium' };

  if (stack.length === 0) {
    if (!spineNode) return frontSlot;
    return { split: 'H', ratio_hint: 0.6, a: frontSlot, b: spineNode };
  }

  const stackNode = chain('H', stack);
  const rear: LayoutNode = spineNode
    ? variant.spine === 'left'
      ? { split: 'V', ratio_hint: 0.25, a: spineNode, b: stackNode }
      : { split: 'V', ratio_hint: 0.75, a: stackNode, b: spineNode }
    : stackNode;

  return { split: 'H', ratio_hint: 0.3, a: frontSlot, b: rear };
}

export interface BuildIntentArgs {
  readonly program: SpaceProgram;
  readonly programRef: string;
  readonly variant?: LayoutVariant;
  readonly openFaces?: readonly Face[];
  readonly accessFaces?: readonly Face[];
  /** Tra `requires_face` theo loại phòng — xem `FloorContext`. */
  readonly faceOf?: FaceNeed;
}

/** Dựng `LayoutIntent` cho một phương án. Đầu ra vẫn phải qua `parseArtifact` của lớp gọi. */
export function buildLayoutIntent(args: BuildIntentArgs): Record<string, unknown> {
  const variant = args.variant ?? LAYOUT_VARIANTS[0]!;
  const openFaces = args.openFaces?.length ? args.openFaces : (['front', 'back'] as const);

  const levels = [...new Set(args.program.spaces.map((s) => s.floor))].sort((a, b) => a - b);
  const floors = levels
    .map((level) => {
      const tree = floorTree(
        args.program.spaces.filter((s) => s.floor === level),
        variant,
        openFaces,
        { level, accessFaces: args.accessFaces, faceOf: args.faceOf },
      );
      return tree === null ? null : { level, wings: [{ wing_id: 'W1', tree }] };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  if (floors.length === 0) {
    throw new LayoutIntentError('Chương trình không gian chưa có tầng nào có không gian.');
  }

  return {
    schema_version: '1.0.0',
    program_ref: args.programRef,
    variant_id: variant.id,
    variant_label: variant.label,
    massing: { wings: [{ id: 'W1' }], wing_links: [] },
    cores: [
      {
        id: 'C1',
        wing: 'W1',
        band: variant.spine === 'left' ? 'right' : 'left',
        position_hint: variant.core === 'front' ? 'front' : 'rear',
        contains: ['stair'],
      },
    ],
    floors,
    rationale:
      `Khung nhà ống: dải mặt tiền, hành lang dọc bên ${variant.spine === 'left' ? 'trái' : 'phải'}, ` +
      'các dải phòng xếp vào sâu. Mọi phòng giáp hành lang nên không phòng nào phải đi xuyên phòng khác; ' +
      'dải nằm giữa được mở giếng trời khi có phòng cần sáng tự nhiên.',
  };
}
