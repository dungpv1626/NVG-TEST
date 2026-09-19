/**
 * Tường: từ TIM tường của hợp đồng ra nét tường trên tờ vẽ.
 *
 * ── Vì sao ruột tường để TRẮNG (sửa 10/09/2026) ───────────────────────────────────────
 * Bản trước tô đặc ruột tường bằng màu mực, và cả tờ vẽ đọc thành một vệt đen — sơ đồ khối
 * chứ không phải bản vẽ. Đo trên hồ sơ thật của NVG (HS-01, 54 tờ A3 kiến trúc): tường là
 * HAI NÉT MẢNH với ruột trắng; thứ duy nhất tô đặc là CỘT. Đây là khác biệt lớn nhất giữa hai
 * loại hình, và nó chỉ tốn một lần đổi cách vẽ.
 *
 * Ba việc, và cả ba đều là chỗ bản vẽ dễ trông sai nhất:
 *
 *  1. **Nối góc.** Tường khai theo tim, nên hai bức gặp nhau ở góc để hở một ô vuông đúng
 *     bằng nửa bề dày. Kéo dài đầu tường ra bằng nửa bề dày của bức nó chạm thì góc liền.
 *  2. **Cắt lỗ mở.** Chỗ có cửa thì tường phải ĐỨT, không phải vẽ đè một hình trắng lên. Vẽ
 *     đè trông giống nhau trên màn hình nhưng sai khi in trên nền không trắng, và sai hẳn khi
 *     tờ vẽ được rasterise để làm ảnh tham chiếu.
 *  3. **Xoá nét ở ngã ba.** Ruột trắng thì mọi nét đều nhìn thấy, kể cả đoạn mặt tường chạy
 *     xuyên vào ruột bức tường kia. Không xoá thì mỗi ngã ba có hai gạch nhỏ đâm ngang qua mặt
 *     bức chính — chỗ mà mắt người đọc bản vẽ nhận ra ngay là máy vẽ. Nét được cắt bằng
 *     `clipSegmentByQuad` với thân của MỌI bức khác.
 *
 * Lan can (`k: 'r'`) vẫn là hai nét mảnh riêng, mảnh hơn tường: nó là lan can ban công, và vẽ
 * nó như tường thì ban công đọc thành một cái hộp kín (cùng lý lẽ với mục `outdoor` của
 * `kb/construction_norms.yaml`).
 */

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import {
  along,
  addVec,
  clipSegmentByQuad,
  distanceToSegment,
  normalOf,
  subtractIntervals,
  toPt,
  unitAlong,
  type Interval,
  type Pt,
} from './geometry';
import { CLS, polylinePath, tag } from './svg';
import type { Paper } from './units';

/** Sai lệch cho phép khi hỏi "hai bức tường này có chạm nhau không", cm. */
export const TOUCH_TOLERANCE_CM = 1;

export type WallInput = AiFloorPlanLevel['walls'][number];

export interface WallGeom {
  id: string;
  kind: WallInput['k'];
  /** Tim tường, nguyên văn hợp đồng. */
  a: Pt;
  b: Pt;
  /** Bề dày, cm. */
  t: number;
  /** Véc-tơ đơn vị dọc tường, chiều `a → b`. */
  u: Pt;
  /** Pháp tuyến trái của `u`. */
  n: Pt;
  /** Chiều dài tim, cm. */
  length: number;
  /** Đầu tường sau khi kéo dài để nối góc. */
  origin: Pt;
  /** Chiều dài sau khi kéo dài hai đầu, cm. */
  drawnLength: number;
  /** Đoạn đã kéo dài ở đầu `a` — cộng vào `at` của lỗ mở để đổi sang hệ đã kéo dài. */
  headExtension: number;
}

/**
 * Chuẩn bị hình học của mọi bức tường trong một tầng.
 *
 * Tính một lần rồi dùng chung cho tường, cửa, cửa sổ và bộ kiểm — nếu mỗi nơi tự tính lại
 * pháp tuyến thì sớm muộn hai nơi sẽ chọn hai chiều pháp tuyến khác nhau, và cánh cửa mở
 * ngược so với má cửa mà không ai thấy sai ở đâu.
 */
export function prepareWalls(walls: readonly WallInput[]): WallGeom[] {
  const raw = walls.map((wall) => {
    const a = toPt(wall.a);
    const b = toPt(wall.b);
    const u = unitAlong(a, b);
    return {
      id: wall.id,
      kind: wall.k,
      a,
      b,
      t: wall.t,
      u,
      n: normalOf(u),
      length: Math.hypot(b[0] - a[0], b[1] - a[1]),
    };
  });

  return raw.map((wall) => {
    const headExtension = extensionAt(wall.a, wall.id, raw);
    const tailExtension = extensionAt(wall.b, wall.id, raw);

    return {
      ...wall,
      origin: along(wall.a, wall.u, -headExtension),
      drawnLength: wall.length + headExtension + tailExtension,
      headExtension,
    };
  });
}

/**
 * Kéo dài bao nhiêu ở một đầu tường — và CHỈ ở góc chữ L.
 *
 * Hai kiểu gặp nhau, hai cách xử lý khác hẳn:
 *
 *  · **Góc chữ L** — đầu bức này gặp ĐẦU bức kia. Cả hai cùng dừng ở tim nhau nên góc hở một ô
 *    vuông bằng nửa bề dày; phải kéo dài tới MẶT XA của bức kia thì góc mới liền.
 *  · **Ngã ba chữ T** — đầu bức này đâm vào GIỮA bức kia. Không kéo dài gì cả: đầu vách đã nằm
 *    trong thân tường bao rồi, và nét thừa sẽ bị `renderWalls` cắt đi.
 *
 * ⚠️ Phân biệt hai kiểu là bắt buộc, không phải tinh chỉnh. Kéo dài ở ngã ba chữ T thì thân vách
 * phủ TRỌN bề dày tường bao, và lúc cắt nét nó xoá luôn cả MẶT NGOÀI của tường bao — tường bao
 * đứt một khúc ở đúng chỗ mỗi vách đâm vào. Lỗi này ẩn suốt thời gian ruột tường còn tô đặc.
 */
function extensionAt(
  point: Pt,
  selfId: string,
  walls: ReadonlyArray<{ id: string; a: Pt; b: Pt; t: number }>,
): number {
  let extension = 0;
  for (const other of walls) {
    if (other.id === selfId) continue;
    const gap = distanceToSegment(point, other.a, other.b);
    if (gap > other.t / 2 + TOUCH_TOLERANCE_CM) continue;
    // Gặp ở ĐẦU bức kia hay ở giữa? Đo tới hai đầu tim của nó; xa cả hai thì đây là ngã ba chữ T.
    const toHead = Math.hypot(point[0] - other.a[0], point[1] - other.a[1]);
    const toTail = Math.hypot(point[0] - other.b[0], point[1] - other.b[1]);
    const corner = Math.min(toHead, toTail) <= other.t / 2 + TOUCH_TOLERANCE_CM;
    if (!corner) continue;
    // Vừa đủ tới mặt xa, không hơn: cộng thẳng `t/2` thì một đầu tường khai sẵn ở mặt ngoài bức
    // kia sẽ chìa hẳn ra ngoài góc nhà.
    extension = Math.max(extension, Math.max(0, other.t / 2 - gap));
  }
  return extension;
}

/** Lỗ mở trên một bức, đo từ đầu `a` của tim tường — khoá là mã tường. */
export type WallHoles = Map<string, Interval[]>;

/**
 * Các đoạn ĐẶC còn lại của một bức sau khi trừ lỗ mở, trong hệ đã kéo dài (gốc `origin`).
 *
 * Phần kéo dài để nối góc không bao giờ bị cắt: nó nằm bên trong bức tường vuông góc, và cắt
 * ở đó là khoét một lỗ ngay giữa góc nhà.
 */
export function solidRuns(wall: WallGeom, holes: readonly Interval[]): Interval[] {
  const shifted = holes.map((hole) => ({
    from: hole.from + wall.headExtension,
    to: hole.to + wall.headExtension,
  }));
  return subtractIntervals(wall.drawnLength, shifted);
}

/** Bốn đỉnh của một đoạn tường đặc, toạ độ THẬT, theo thứ tự: hai mặt bên rồi vòng lại. */
export function runCorners(wall: WallGeom, run: Interval): [Pt, Pt, Pt, Pt] {
  const half = wall.t / 2;
  const start = along(wall.origin, wall.u, run.from);
  const end = along(wall.origin, wall.u, run.to);
  return [
    addVec(start, wall.n, -half),
    addVec(end, wall.n, -half),
    addVec(end, wall.n, half),
    addVec(start, wall.n, half),
  ];
}

/**
 * Dung sai co thân tường khi cắt nét, cm.
 *
 * Co vào thì hai mặt tường TRÙNG NHAU không bị coi là nằm trong nhau — vách 11 vuông góc ăn vào
 * tường 22 thường có mặt trùng đúng một mặt phẳng, và nét ấy là nét thật phải giữ.
 */
const CLIP_INSET_CM = 0.5;

/** Thân đầy đủ của một bức (chưa trừ lỗ mở) — dùng làm dao cắt nét của những bức khác. */
function wallBody(wall: WallGeom): [Pt, Pt, Pt, Pt] {
  return runCorners(wall, { from: 0, to: wall.drawnLength });
}

/**
 * Vẽ toàn bộ tường của một tầng.
 *
 * Hai lớp: một lớp TÔ ruột bằng màu giấy (che nét gạch ô thông tầng và mọi thứ vẽ trước chạy
 * vào dưới tường), rồi một lớp NÉT đã cắt sạch chỗ chui vào bức khác.
 *
 * Gộp mọi đoạn vào ít thẻ `<path>` nhất có thể: một tầng nhà phố có tới vài trăm đoạn, và một
 * thẻ mỗi đoạn thì riêng phần thuộc tính đã dài hơn cả hình.
 */
export function renderWalls(walls: readonly WallGeom[], holes: WallHoles, paper: Paper): string {
  const fills: string[] = [];
  const edges: string[] = [];
  const railing: string[] = [];

  // Dao cắt: thân của mọi bức KHÔNG phải lan can. Lan can chỉ hai nét mảnh nên không có ruột
  // để nuốt nét của ai.
  const bodies = walls
    .filter((wall) => wall.kind !== 'r')
    .map((wall) => ({ id: wall.id, quad: wallBody(wall) }));

  for (const wall of walls) {
    const runs = solidRuns(wall, holes.get(wall.id) ?? []);
    for (const run of runs) {
      if (run.to - run.from <= 0) continue;
      const corners = runCorners(wall, run);
      const [nearStart, nearEnd, farEnd, farStart] = corners;

      if (wall.kind === 'r') {
        railing.push(polylinePath([paper.p(nearStart), paper.p(nearEnd)], false));
        railing.push(polylinePath([paper.p(farStart), paper.p(farEnd)], false));
        continue;
      }

      fills.push(
        polylinePath(
          corners.map((point) => paper.p(point)),
          true,
        ),
      );

      // Bốn cạnh của đoạn tường: hai MẶT chạy dọc, hai NẮP ở hai đầu. Nắp ở đầu tự do là nét
      // thật (đầu hồi, má cửa); nắp ở ngã ba nằm trong ruột bức kia nên tự biến mất khi cắt —
      // không cần phân biệt hai loại bằng tay.
      const sides: Array<[Pt, Pt]> = [
        [nearStart, nearEnd],
        [farStart, farEnd],
        [nearStart, farStart],
        [nearEnd, farEnd],
      ];
      for (const [from, to] of sides) {
        for (const piece of visibleParts(from, to, wall.id, bodies)) {
          edges.push(polylinePath([paper.p(piece[0]), paper.p(piece[1])], false));
        }
      }
    }
  }

  const parts: string[] = [];
  if (fills.length) parts.push(tag('path', { class: CLS.wallFill, d: fills.join(' ') }));
  if (edges.length) parts.push(tag('path', { class: CLS.wall, d: edges.join(' ') }));
  if (railing.length) parts.push(tag('path', { class: CLS.railing, d: railing.join(' ') }));
  return parts.join('');
}

/** Những đoạn con của `from→to` KHÔNG nằm trong ruột bức tường nào khác. */
function visibleParts(
  from: Pt,
  to: Pt,
  selfId: string,
  bodies: ReadonlyArray<{ id: string; quad: readonly Pt[] }>,
): Array<[Pt, Pt]> {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length <= 0) return [];

  const covered: Interval[] = [];
  for (const body of bodies) {
    if (body.id === selfId) continue;
    // Dương là CO vào (`numer + eps > 0` coi là ngoài). Bản trước truyền số âm, tức PHÌNH ra: nét mặt
    // ngoài tường bao nằm đúng trên mép bức vuông góc bị xoá, và mọi góc nhà hở một khấc (tờ vẽ
    // 13/09/2026).
    const hit = clipSegmentByQuad(from, to, body.quad, CLIP_INSET_CM);
    // `clipSegmentByQuad` trả tham số t ∈ [0,1]; `subtractIntervals` làm việc trên chiều dài.
    if (hit) covered.push({ from: hit.from * length, to: hit.to * length });
  }

  const dx = (to[0] - from[0]) / length;
  const dy = (to[1] - from[1]) / length;
  return subtractIntervals(length, covered)
    .filter((piece) => piece.to - piece.from > 0.05)
    .map((piece) => [
      [from[0] + dx * piece.from, from[1] + dy * piece.from] as Pt,
      [from[0] + dx * piece.to, from[1] + dy * piece.to] as Pt,
    ]);
}
