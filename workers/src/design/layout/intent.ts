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
 *
 * ## Khung mẫu hành lang ngang — vì sao phải có khung thứ hai
 *
 *     H( dải trước ,  H( hành lang ngang + lõi thang , dải sau ) )
 *
 * Khung nhà ống có một giới hạn CỨNG mà không con số nào chỉnh được: mỗi phòng chiếm trọn một
 * dải ngang, nên dải nào cũng rộng bằng phần sau của nhà. Một dải muốn sâu tối thiểu `m` mét
 * thì phòng trong nó phải có diện tích ít nhất `bề rộng phần sau × m`. Trên lô 15 m, phần sau
 * rộng khoảng 13 m, nên một phòng ngủ phải rộng hơn **31 m²** mới đứng nổi thành dải — trong
 * khi phòng ngủ thật rộng 20 m². Hệ quả: mọi biệt thự mặt tiền rộng đều vô nghiệm, và tập
 * ràng buộc mâu thuẫn trỏ vào `room_min_dimension_bedroom` của một phòng ngủ bất kỳ chứ không
 * nói ra được điều vừa viết ở trên.
 *
 * Điều đó ĐÃ bị che khuất suốt một thời gian: chương trình không gian cũ để hành lang nuốt
 * tới 40 % mặt sàn (đo trên NVO-TK-2026-2737: hành lang 122 m² / 300 m²), và chính phần thừa
 * đó cho bộ giải đủ chỗ xoay. Sửa xong Lớp 2 thì giới hạn của Lớp 3a lộ ra ngay — nó vốn ở
 * đó từ đầu.
 *
 * Khung ngang xoay chồng dải đi 90°: hành lang chạy NGANG giữa nhà, phòng bám hai bên. Mỗi
 * phòng rộng `diện tích / chiều sâu dải`, mà chiều sâu dải chỉ bằng non nửa chiều sâu nhà,
 * nên phòng nhỏ vẫn đứng được. Hai vị từ khó nhất vẫn thoả THEO CẤU TRÚC:
 *
 *  · **Lối vào** — mọi phòng của cả hai dải đều giáp hành lang ngang ở một cạnh dài.
 *  · **Chiếu sáng** — dải trước chạm mặt trước, dải sau chạm mặt sau. Không phòng nào nằm
 *    giữa, nên khung này KHÔNG cần giếng trời; đổi lại nó đòi **cả mặt trước lẫn mặt sau
 *    thoáng**, và đó là điều kiện để được chọn.
 *
 * Chọn khung nào là việc của `chooseFrame`, quyết định MỘT lần cho cả công trình chứ không
 * mỗi tầng một kiểu: hai tầng chia khác nhau thì không dùng chung được đường cắt kết cấu nào
 * (`structural_depth`), và lõi thang hết đường thẳng hàng.
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

/**
 * Hai khung mẫu — xem phần mở đầu tệp.
 *
 * `tube` là khung nhà ống (dải ngang xếp vào sâu, hành lang dọc một bên); `cross` là khung
 * hành lang ngang giữa nhà, phòng bám hai bên.
 */
export type LayoutFrame = 'tube' | 'cross';

/**
 * Mặt sàn dùng chung của công trình, mét — do lớp gọi tính từ thửa và chương trình không gian.
 *
 * Lớp 3a nhận nó để CHỌN KHUNG, không phải để gán toạ độ: câu hỏi duy nhất nó trả lời là
 * "một dải rộng ngần này thì còn đặt nổi phòng không". Nguyên tắc bất biến 2 vẫn nguyên vẹn —
 * đầu ra vẫn chỉ có cây chia và gợi ý tỉ lệ.
 */
export interface Plate {
  readonly widthM: number;
  readonly depthM: number;
}

/** Cạnh nhỏ nhất theo quy chuẩn cho một mã phòng, mét. `null` = không quy tắc nào nhắm tới. */
export type MinSide = (roomType: string) => number | null;

/** Diện tích dùng để ước lượng — mục tiêu nếu có, không thì mức tối thiểu. */
function areaOf(space: Space): number {
  return space.target_area_m2 ?? space.min_area_m2;
}

/**
 * Khung nhà ống có đặt nổi mọi phòng của tầng này không.
 *
 * Phép thử rút gọn về đúng một bất đẳng thức, và nó là toàn bộ vật lý của khung: mỗi phòng
 * chiếm trọn một dải rộng bằng phần sau, nên chiều sâu dải bằng `diện tích / bề rộng phần
 * sau`, và nó phải không nhỏ hơn cạnh tối thiểu của phòng. Tổng chiều sâu tự khớp: tổng diện
 * tích các dải đúng bằng mặt sàn.
 *
 * Bề rộng hành lang dọc ước lượng bằng `diện tích hành lang / chiều sâu nhà` — nó chạy gần
 * hết chiều sâu, nên đây là xấp xỉ tốt và không cần bộ giải mới biết.
 */
function tubeFits(spaces: Space[], plate: Plate, minSide: MinSide): boolean {
  const spineArea = spaces
    .filter((s) => s.type === 'circulation')
    .reduce((sum, s) => sum + areaOf(s), 0);
  const usableWidth = plate.widthM - spineArea / plate.depthM;
  if (usableWidth <= 0) return false;
  return spaces
    .filter((s) => !CIRCULATION_TYPES.has(s.type) && !isEnclosedSpace(s))
    .every((s) => areaOf(s) >= usableWidth * (minSide(s.type) ?? 0));
}

/**
 * Khung hành lang ngang có đặt nổi mọi phòng của tầng này không.
 *
 * Cùng một bất đẳng thức, xoay 90°: bề rộng phòng bằng `diện tích / chiều sâu dải`, và chiều
 * sâu dải bằng `diện tích dải / bề rộng nhà`. Hai dải chia đôi nên lấy nửa tổng — bản chia
 * thật có thể lệch một chút, nhưng lệch theo hướng làm dải này sâu hơn và dải kia nông hơn,
 * và phép thử này chỉ để CHỌN khung.
 *
 * Hành lang ngang cũng phải đủ sâu: nó nằm ngang nên chiều sâu của nó chính là bề rộng lọt
 * lòng mà `corridor_min_width` nói tới.
 */
function crossFits(spaces: Space[], plate: Plate, minSide: MinSide): boolean {
  const rooms = spaces.filter((s) => !CIRCULATION_TYPES.has(s.type) && !isEnclosedSpace(s));
  const core = spaces.filter((s) => CIRCULATION_TYPES.has(s.type));
  if (core.length === 0 || rooms.length === 0) return false;
  const coreDepth = core.reduce((sum, s) => sum + areaOf(s), 0) / plate.widthM;
  if (coreDepth < (minSide('circulation') ?? 0)) return false;
  const stripDepth = rooms.reduce((sum, s) => sum + areaOf(s), 0) / 2 / plate.widthM;
  if (stripDepth <= 0) return false;
  return rooms.every((s) => areaOf(s) >= stripDepth * (minSide(s.type) ?? 0));
}

/**
 * Khung cho CẢ công trình — một lần, không phải mỗi tầng một kiểu.
 *
 * Giữ khung nhà ống trừ khi nó không đặt nổi phòng ở một tầng nào đó. Đổi khung là thay đổi
 * lớn và thấy được ngay trên bản vẽ, nên nó phải có lý do bắt buộc chứ không phải vì khung
 * kia "có vẻ hợp hơn". Thiếu kích thước mặt sàn hoặc thiếu tra cứu quy chuẩn thì giữ nguyên
 * hành vi cũ — không đoán.
 */
export function chooseFrame(
  byLevel: Space[][],
  plate: Plate | undefined,
  minSide: MinSide | undefined,
  openFaces: readonly Face[],
): LayoutFrame {
  if (!plate || !minSide || plate.widthM <= 0 || plate.depthM <= 0) return 'tube';
  if (byLevel.every((spaces) => tubeFits(spaces, plate, minSide))) return 'tube';
  // Khung ngang không có giếng trời: phòng lấy sáng qua chính mặt trước và mặt sau. Thiếu
  // một trong hai thì cả một dải mất chiếu sáng, và đó là mức chặn phát hành.
  if (!openFaces.includes('front') || !openFaces.includes('back')) return 'tube';
  if (byLevel.every((spaces) => crossFits(spaces, plate, minSide))) return 'cross';
  return 'tube';
}

/** Phòng nằm LỌT trong một phòng khác — khu vệ sinh của phòng ngủ khép kín. */
function isEnclosedSpace(space: Space): boolean {
  return Boolean((space as { enclosed_in?: string | null }).enclosed_in);
}

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

/**
 * Như `chain`, nhưng gợi ý tỉ lệ theo TRỌNG SỐ (diện tích) thay vì chia đều.
 *
 * `ratio_hint` không ràng buộc gì — bộ giải vẫn gán số thật. Nhưng nó là điểm xuất phát, và
 * với một tầng mười ba phòng thì điểm xuất phát quyết định bộ giải có kịp hội tụ trong ngân
 * sách thời gian hay không. Đo trên NVO-TK-2026-2737: gợi ý chia đều làm bộ giải hết giờ ở
 * 25 giây và trả về phương án có chỗ để xe 44 m² cạnh cái bếp 8 m² — hợp lệ, và vô lý.
 */
function weightedChain(
  axis: 'H' | 'V',
  parts: Array<{ node: LayoutNode; weight: number }>,
): LayoutNode {
  if (parts.length === 0) throw new LayoutIntentError('Không thể dựng lát cắt từ danh sách rỗng.');
  const rest = parts.map((p) => Math.max(p.weight, 0));
  // Tổng luỹ kế từ cuối lên: tỉ lệ của lát cắt thứ i là phần của nó trên phần CÒN LẠI.
  const tails: number[] = new Array(parts.length).fill(0);
  for (let i = parts.length - 1; i >= 0; i -= 1) tails[i] = rest[i]! + (tails[i + 1] ?? 0);
  let node = parts[parts.length - 1]!.node;
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const total = tails[i]!;
    node = {
      split: axis,
      ratio_hint: roundRatio(total > 0 ? rest[i]! / total : 1 / (parts.length - i)),
      a: parts[i]!.node,
      b: node,
    };
  }
  return node;
}

interface Band {
  readonly rooms: Space[];
  /** Dựng lá cho một phòng — phòng có khu vệ sinh khép kín thành một lát cắt con. */
  readonly leaf: (room: Space) => LayoutNode;
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
  const parts: LayoutNode[] = band.rooms.map((room) => band.leaf(room));
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
  /** Khung mẫu đã chọn cho CẢ công trình — xem `chooseFrame`. Vắng mặt = khung nhà ống. */
  readonly frame?: LayoutFrame;
}

/**
 * Phần diện tích mà dải TRƯỚC nhận, theo `variant.core` — vị trí hành lang ngang trên chiều sâu.
 *
 * Đây là con số duy nhất của khung ngang không suy ra được từ dữ liệu, và nó không phải
 * ngưỡng quy chuẩn nên không thuộc `rules/` (CLAUDE.md 8.7). Nó là một quy ước bố cục, cùng
 * loại với `MAX_ROOMS_PER_BAND` ở trên.
 *
 * Đo trên NVO-TK-2026-2737 ngày 07/09/2026, hàm mục tiêu của bộ giải (tổng lệch diện tích,
 * đơn vị 0,01 m²) ở ngân sách 20 giây cho ba phương án:
 *
 *     phần dải trước   0,40    0,45    0,50    0,55    0,60    0,65
 *     hàm mục tiêu    12482   13290    8750   10466  **2770**  9846
 *
 * Vì sao 0,6 chứ không phải 0,5: hai dải dùng chung bề rộng nhà nên dải nào sâu hơn thì phòng
 * trong đó rộng hơn. Xếp phòng LỚN vào dải sâu và phòng nhỏ (vệ sinh, kho, giặt) vào dải nông
 * giữ được cả hai — phòng lớn không bị bóp, phòng nhỏ không bị kéo thành dải hẹp. Vòng chia
 * bên dưới xếp từ phòng lớn xuống nên tự đạt điều đó khi ngân sách dải trước rộng hơn nửa.
 *
 * ⚠️ Con số này ĐO ĐƯỢC LẠI: đổi chuẩn diện tích ở `kb/space_norms.yaml` hoặc đổi trọng số
 * hàm mục tiêu phía Container thì đo lại, đừng suy đoán. Và nó phải LUÔN từ 0,5 trở lên —
 * vòng chia bên dưới xếp phòng lớn vào dải trước, nên dải trước phải là dải sâu hơn. Có bài
 * kiểm thử canh điều đó.
 */
export const CROSS_FRONT_SHARE: Record<'front' | 'rear', number> = { front: 0.6, rear: 0.5 };

/**
 * Hàm dựng lá cho một phòng: chính nó, hoặc nó cùng các phòng khép kín bên trong.
 *
 * Khu vệ sinh của một phòng ngủ khép kín KHÔNG phải một ô ngang hàng trong chồng dải: nó nằm
 * LỌT bên trong ô của phòng mẹ, nên nó bị rút khỏi danh sách xếp dải và gắn lại thành một
 * lát cắt con ngay tại chỗ phòng mẹ đứng.
 *
 * Bọc MỌI lá `{room}` qua một hàm là có chủ ý: phòng mẹ có thể rơi vào dải mặt tiền, dải
 * giữa, đi cùng lõi thang, hay nằm trong một dải của khung ngang — bọc ở lá thì mọi đường
 * đều đúng, còn xử lý riêng ở từng nhánh thì sớm muộn sót một nhánh và khu vệ sinh biến mất
 * khỏi bản vẽ.
 *
 * Khu vệ sinh đứng ở nhánh `b` — phía sâu hơn của lát cắt — nên phần trước của phòng vẫn là
 * phần chạm hành lang hoặc mặt thoáng.
 */
function enclosedLeaf(spaces: Space[]): (space: Space) => LayoutNode {
  const inside = new Map<string, Space[]>();
  for (const s of spaces) {
    const parent = (s as { enclosed_in?: string | null }).enclosed_in;
    if (!parent) continue;
    inside.set(parent, [...(inside.get(parent) ?? []), s]);
  }
  return (space) => {
    const children = inside.get(space.id);
    if (!children?.length) return { room: space.id };
    return chain('V', [
      { room: space.id },
      ...children.map((child) => ({ room: child.id }) as LayoutNode),
    ]);
  };
}

/**
 * Cây bố cục của một tầng theo KHUNG HÀNH LANG NGANG.
 *
 *     H( dải trước ,  H( hành lang ngang + lõi thang , dải sau ) )
 *
 * Trả về `null` khi tầng không có không gian giao thông nào — khi đó không dải nào có lối
 * vào, và lớp gọi rơi về khung nhà ống.
 *
 * Ba điểm quyết định chất lượng, ghi ở đây vì cả ba đều dễ bị "dọn cho gọn" mất:
 *
 *  · **Lõi thang nằm TRONG dải hành lang**, ở một đầu. Nó là không gian giao thông nên phòng
 *    nào giáp nó cũng coi như có lối vào — không có vùng chết ở đoạn dải hành lang bị thang
 *    chiếm. Để thang thành một dải riêng thì nó cắt ngang cả nhà.
 *  · **Chia phòng về hai dải theo DIỆN TÍCH**, không theo số phòng: hai dải dùng chung bề
 *    rộng nhà nên chiều sâu của chúng tỉ lệ thuận với diện tích. Chia theo số phòng thì một
 *    dải chứa phòng khách 50 m² và một dải chứa bốn phòng ngủ sẽ lệch sâu gấp đôi.
 *  · **Phòng phải giáp mặt vào được thì ở dải TRƯỚC.** Chỗ để xe là ví dụ duy nhất hiện có,
 *    và nó không thương lượng được: ô tô vào nhà từ đường, không từ hành lang.
 */
function crossTree(
  spaces: Space[],
  variant: LayoutVariant,
  context: FloorContext,
): LayoutNode | null {
  const core = spaces.filter((s) => CIRCULATION_TYPES.has(s.type));
  if (core.length === 0) return null;
  const rooms = spaces
    .filter((s) => !CIRCULATION_TYPES.has(s.type) && !isEnclosedSpace(s))
    .sort(byRank);
  if (rooms.length === 0) return null;

  const leaf = enclosedLeaf(spaces);
  const faceOf = context.faceOf ?? (() => null);
  const accessFaces = context.accessFaces?.length ? context.accessFaces : (['front'] as const);
  const onGround = (context.level ?? 1) === 1;
  // `spine === 'right'` LẬT toàn bộ mặt bằng qua trục dọc: lõi thang sang đầu bên phải và thứ
  // tự phòng trong mỗi dải đảo lại. Không lật thì hai phương án chỉ khác nhau ở chỗ đứng của
  // lõi thang — một khác biệt mà bộ giải hoà tan gần hết, và người dùng nhận về hai bản vẽ
  // giống hệt nhau ở ba ô lựa chọn (đo được 07/09/2026 trên NVO-TK-2026-2737).
  const mirrored = variant.spine === 'right';
  const inOrder = <T>(list: T[]): T[] => (mirrored ? [...list].reverse() : list);

  // Dải hành lang: hành lang ngang, lõi thang ở đầu bên phía `variant.spine`.
  const spine = core.filter((s) => s.type === 'circulation');
  const stair = core.filter((s) => s.type !== 'circulation');
  const coreNode = weightedChain(
    'V',
    inOrder([...stair, ...spine]).map((s) => ({ node: leaf(s), weight: areaOf(s) })),
  );

  // ── Chia hai dải ────────────────────────────────────────────────────────────────────
  const frontShare = CROSS_FRONT_SHARE[variant.core];
  const total = rooms.reduce((sum, s) => sum + areaOf(s), 0);
  const frontBudget = total * frontShare;

  const front: Space[] = [];
  const back: Space[] = [];
  let frontArea = 0;
  const mustBeFront = new Set(
    onGround && accessFaces.includes('front')
      ? rooms.filter((s) => faceOf(s.type) === 'access').map((s) => s.id)
      : [],
  );
  for (const space of rooms.filter((s) => mustBeFront.has(s.id))) {
    front.push(space);
    frontArea += areaOf(space);
  }
  // Xếp từ phòng LỚN xuống nhỏ, và một khi dải trước đã đủ thì mọi phòng còn lại đi hết về
  // dải sau — KHÔNG bỏ qua một phòng vừa rồi nhặt tiếp phòng nhỏ hơn cho vừa ngân sách.
  //
  // Vế "một khi đã đủ thì thôi" là phần quan trọng, và nó đến từ một lỗi đo được: dải trước
  // sâu hơn, nên bề rộng của một phòng trong đó bằng `diện tích / chiều sâu dải`. Một khu vệ
  // sinh 4 m² lọt vào dải sâu 5,7 m không thể hẹp hơn cạnh tối thiểu của nó, nên bộ giải buộc
  // phải thổi nó lên 13,7 m² — to hơn phòng ăn bên cạnh. Cách chọn "vừa ngân sách thì nhặt"
  // đúng là cách để phòng nhỏ lọt vào đó.
  //
  // Trùng diện tích thì theo mã để kết quả tất định.
  const remaining = rooms
    .filter((s) => !mustBeFront.has(s.id))
    .sort((a, b) => areaOf(b) - areaOf(a) || a.id.localeCompare(b.id));
  let frontFull = false;
  for (const space of remaining) {
    if (!frontFull && frontArea + areaOf(space) / 2 <= frontBudget) {
      front.push(space);
      frontArea += areaOf(space);
    } else {
      frontFull = true;
      back.push(space);
    }
  }
  // Dải rỗng là một ô bề rộng bằng không — mọi ràng buộc kích thước tối thiểu chặn ngay.
  if (front.length === 0 || back.length === 0) return null;

  const strip = (list: Space[]): LayoutNode =>
    weightedChain(
      'V',
      inOrder([...list].sort(byRank)).map((s) => ({ node: leaf(s), weight: areaOf(s) })),
    );

  const coreArea = core.reduce((sum, s) => sum + areaOf(s), 0);
  return weightedChain('H', [
    { node: strip(front), weight: frontArea },
    { node: coreNode, weight: coreArea },
    { node: strip(back), weight: total - frontArea },
  ]);
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
  if (context.frame === 'cross') {
    // Khung ngang có điều kiện riêng (phải có không gian giao thông trên tầng). Không thoả
    // thì rơi về khung nhà ống thay vì trả về cây thiếu — một tầng vắng hành lang vẫn phải
    // dựng được, ví dụ tầng tum chỉ có sân thượng.
    const cross = crossTree(spaces, variant, context);
    if (cross) return cross;
  }

  const stair = spaces.filter((s) => s.type === 'stair');
  const spine = spaces.filter((s) => s.type === 'circulation');

  const roomNode = enclosedLeaf(spaces);
  const others = spaces
    .filter((s) => !CIRCULATION_TYPES.has(s.type) && !isEnclosedSpace(s))
    .sort(byRank);

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
      list.map((s) => roomNode(s)),
    );

  const spineNode = spine.length > 0 ? rooms(spine) : null;
  const stairOnly = stair.length > 0 ? rooms(stair) : null;
  const stairNode: LayoutNode | null =
    stairOnly && companion
      ? variant.spine === 'left'
        ? { split: 'V', ratio_hint: 0.6, a: stairOnly, b: roomNode(companion) }
        : { split: 'V', ratio_hint: 0.4, a: roomNode(companion), b: stairOnly }
      : stairOnly;

  const stack: LayoutNode[] = [];
  if (stairNode && variant.core === 'front') stack.push(stairNode);
  roomBands.forEach((band, index) => {
    const last = index === roomBands.length - 1 && !(stairNode && variant.core === 'rear');
    stack.push(
      bandNode({ rooms: band, onFacade: last && backIsOpen, spine: variant.spine, leaf: roomNode }),
    );
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
  const frontCore: LayoutNode | null = front ? roomNode(front) : null;
  const withOutdoor: LayoutNode | null = outdoorRoom
    ? frontCore
      ? variant.spine === 'left'
        ? { split: 'V', ratio_hint: 0.25, a: roomNode(outdoorRoom), b: frontCore }
        : { split: 'V', ratio_hint: 0.75, a: frontCore, b: roomNode(outdoorRoom) }
      : roomNode(outdoorRoom)
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
  /**
   * Mặt sàn dùng chung của công trình. Vắng mặt thì luôn dùng khung nhà ống — xem `chooseFrame`.
   */
  readonly plate?: Plate;
  /** Tra `min_dimension` theo loại phòng — gói quy tắc do lớp gọi cấp, tệp này không tự nạp. */
  readonly minSideOf?: MinSide;
  /**
   * Ý đồ khối nhà lấy nguyên văn từ đầu bài (`DesignBrief.massing`).
   *
   * Vào đây để ghi được vào artifact — nghĩa là truy được, băm được, và đọc lại được ở thẻ
   * phương án. Trước 07/09/2026 sáu câu hỏi ở mục «Tổ chức khối nhà» không tới được lớp này,
   * nên chúng chiếm 10 trên 38 điểm đầy đủ của một đầu bài biệt thự mà không tác động gì.
   *
   * Chỉ LỰA CHỌN RỜI RẠC đi qua đây. Không con số kích thước nào — bộ giải vẫn là nơi gán số
   * (CLAUDE.md 8.2 nguyên tắc 2).
   */
  readonly massing?: {
    readonly wings_preferred?: number | null;
    readonly footprint_shape?: string | null;
    readonly cores_preferred?: number | null;
    readonly service_core?: boolean | null;
    readonly yards?: readonly string[] | null;
    readonly indoor_outdoor?: string | null;
  } | null;
}

/**
 * Câu nào của mục «Tổ chức khối nhà» cây chia này thật sự diễn đạt được, câu nào chưa.
 *
 * Đây là chỗ giữ cho phần khối nhà không nói dối. Đầu bài hỏi sáu câu; nếu artifact im lặng
 * thì cả sáu trông như đã được tôn trọng, và kiến trúc sư đọc phương án không có cách nào
 * biết mình đang nhìn kết quả của yêu cầu nào. Nói thẳng câu nào chưa giải được, kèm lý do,
 * thì phần chưa làm vẫn là một sự thật đọc được chứ không phải một khoảng lặng.
 *
 * Cập nhật danh sách này mỗi khi một trường được nối dây thật — bỏ quên thì nó nói dối theo
 * chiều ngược lại.
 */
function massingDigest(
  massing: BuildIntentArgs['massing'],
  frame: LayoutFrame,
): Record<string, unknown> {
  const honoured: string[] = [];
  const deferred: { field: string; reason: string }[] = [];
  if (!massing) return { honoured, deferred };

  // `service_core` đã có hiệu lực THẬT ở Lớp 2: nó thành một cặp quan hệ trong
  // `SpaceProgram.adjacency`, và hàm mục tiêu của bộ giải đã có sẵn số hạng cho quan hệ.
  if (massing.service_core === true) honoured.push('service_core');

  // `cores_preferred` đang bị kẹp về 1 ở Lớp 2 cho tới khi `_align_cores` gom theo nhóm.
  if ((massing.cores_preferred ?? 1) > 1) {
    deferred.push({
      field: 'cores_preferred',
      reason: 'Bộ giải chưa đặt được nhiều lõi thang tách rời, đang xếp một lõi (V-21).',
    });
  } else if (massing.cores_preferred != null) {
    honoured.push('cores_preferred');
  }

  // Hình bao và số cánh cần khung mẫu dành cho mặt sàn RỘNG–NÔNG của biệt thự; hai khung hiện
  // có đều dựng cho lô hẹp–sâu của nhà phố.
  if (massing.footprint_shape && massing.footprint_shape !== 'chu_nhat') {
    deferred.push({
      field: 'footprint_shape',
      reason: `Chưa có khung mẫu cho hình bao ${massing.footprint_shape}; đang dựng theo khung ${frame === 'cross' ? 'hành lang ngang' : 'nhà ống'}.`,
    });
  } else if (massing.footprint_shape) {
    honoured.push('footprint_shape');
  }

  if ((massing.wings_preferred ?? 1) > 1) {
    deferred.push({
      field: 'wings_preferred',
      reason:
        'Bộ giải hiện chia một hình chữ nhật duy nhất — nhiều cánh nhà là bước đặt khối riêng.',
    });
  } else if (massing.wings_preferred != null) {
    honoured.push('wings_preferred');
  }

  if (massing.yards?.length) {
    deferred.push({
      field: 'yards',
      reason: 'Vị trí sân chưa vào được cây chia; kiến trúc sư tự đặt khi dựng hồ sơ.',
    });
  }
  if (massing.indoor_outdoor) {
    deferred.push({
      field: 'indoor_outdoor',
      reason: 'Chưa nối vào hồ sơ kính của bước dựng hình học.',
    });
  }
  return { honoured, deferred };
}

/** Dựng `LayoutIntent` cho một phương án. Đầu ra vẫn phải qua `parseArtifact` của lớp gọi. */
export function buildLayoutIntent(args: BuildIntentArgs): Record<string, unknown> {
  const variant = args.variant ?? LAYOUT_VARIANTS[0]!;
  const openFaces = args.openFaces?.length ? args.openFaces : (['front', 'back'] as const);

  const levels = [...new Set(args.program.spaces.map((s) => s.floor))].sort((a, b) => a - b);
  const byLevel = levels.map((level) => args.program.spaces.filter((s) => s.floor === level));
  const frame = chooseFrame(byLevel, args.plate, args.minSideOf, openFaces);
  const floors = levels
    .map((level, index) => {
      const tree = floorTree(byLevel[index]!, variant, openFaces, {
        level,
        accessFaces: args.accessFaces,
        faceOf: args.faceOf,
        frame,
      });
      return tree === null ? null : { level, wings: [{ wing_id: 'W1', tree }] };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  if (floors.length === 0) {
    throw new LayoutIntentError('Chương trình không gian chưa có tầng nào có không gian.');
  }

  const side = variant.spine === 'left' ? 'trái' : 'phải';
  return {
    schema_version: '1.0.0',
    program_ref: args.programRef,
    variant_id: variant.id,
    // Nhãn nói đúng khung ĐÃ DỰNG, không phải khung mặc định của phương án.
    //
    // Nhãn tĩnh của `LAYOUT_VARIANTS` mô tả khung nhà ống ("hành lang dọc bên trái"). Giữ
    // nguyên nó khi đã đổi sang khung ngang là ghi sai lên màn hình đúng chỗ người dùng dựa
    // vào để phân biệt ba phương án.
    variant_label: frameLabel(frame, variant),
    // Một cánh, và CỐ Ý giữ nguyên: `adapters.py::_single_wing` ném lỗi khi nhận nhiều hơn
    // một, tức là phát ra hai cánh không cho ra kết quả kém hơn mà cho ra lỗi 500. Nguyện
    // vọng của đầu bài nằm ở `wings_preferred` bên dưới, tách khỏi con số bộ giải thật sự
    // nhận — hai thứ lệch nhau thì `deferred` nói vì sao.
    massing: {
      wings: [{ id: 'W1' }],
      wing_links: [],
      shape: args.massing?.footprint_shape ?? null,
      yards: [...(args.massing?.yards ?? [])],
      indoor_outdoor: args.massing?.indoor_outdoor ?? null,
      service_core: args.massing?.service_core ?? null,
      wings_preferred: args.massing?.wings_preferred ?? null,
      ...massingDigest(args.massing, frame),
    },
    cores: [
      {
        id: 'C1',
        wing: 'W1',
        band: frame === 'cross' ? variant.spine : variant.spine === 'left' ? 'right' : 'left',
        position_hint: variant.core === 'front' ? 'front' : 'rear',
        contains: ['stair'],
      },
    ],
    floors,
    rationale:
      frame === 'cross'
        ? `Khung hành lang ngang: hành lang chạy ngang ${
            CROSS_FRONT_SHARE[variant.core] > 0.55 ? 'lùi về phía sau' : 'giữa nhà'
          }, lõi thang ở đầu bên ${side}, phòng bám hai bên. Dải trước chạm mặt trước và dải sau ` +
          'chạm mặt sau nên mọi phòng đều lấy sáng trực tiếp, và mọi phòng đều giáp hành lang.'
        : `Khung nhà ống: dải mặt tiền, hành lang dọc bên ${side}, ` +
          'các dải phòng xếp vào sâu. Mọi phòng giáp hành lang nên không phòng nào phải đi xuyên phòng khác; ' +
          'dải nằm giữa được mở giếng trời khi có phòng cần sáng tự nhiên.',
  };
}

/**
 * Nhãn hiển thị của một phương án, theo khung thật đã dựng.
 *
 * Nói theo HÌNH DẠNG thật, không theo tên trường của biến thể: `variant.core === 'front'`
 * nghĩa là "lõi thang ở đầu phần sau" trong khung nhà ống, còn ở khung ngang nó chỉ chọn tỉ
 * lệ hai dải. Chép nguyên chữ "phía trước" sang đây là ghi sai lên màn hình.
 */
export function frameLabel(frame: LayoutFrame, variant: LayoutVariant): string {
  if (frame !== 'cross') return variant.label;
  const side = variant.spine === 'left' ? 'trái' : 'phải';
  const place = CROSS_FRONT_SHARE[variant.core] > 0.55 ? 'lùi về sau' : 'giữa nhà';
  return `Hành lang ngang ${place}, lõi thang bên ${side}`;
}
