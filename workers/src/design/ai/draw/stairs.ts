/**
 * Thang bộ: bậc, vế, chiếu nghỉ và mũi tên «LÊN».
 *
 * Hợp đồng chỉ khai ô thang (`rect`), chiều đi lên của vế đầu (`up`), số vế, tổng số bậc và bề
 * sâu mặt bậc (`going`) — cố ý không bắt mô hình khai từng bậc. Bậc là thứ SUY được: chia đều tổng
 * số bậc cho số vế, rồi đặt mỗi bậc sâu đúng `going`; phần ô thang còn dư vào chiếu nghỉ. Đó là
 * cách hồ sơ NVG vẽ: mặt bậc 250 trên cả bốn vế đo được, vế dài theo số bậc (13.16.1, T70).
 * Artifact trước T70 không có `going` thì vẫn rải đều bậc trên chiều dài vế như cũ.
 *
 * Bậc được ĐÁNH SỐ từ 1 ở chân vế đầu — HS-03 và HS-05 làm vậy (13.16.1, 13.16.2).
 *
 * Đây là ký hiệu SƠ ĐỒ, không phải chi tiết cấu tạo: nó nói thang nằm đâu, đi lên hướng nào,
 * chiếm bao nhiêu chỗ. Chiều cao bậc, chiếu tới, chiều dày bản thang là việc của hồ sơ kỹ
 * thuật — thứ nhánh AI không sinh ra (CLAUDE.md 8.5b, T14).
 */

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import { addVec, along, bboxOfPoints, toRect, type Pt, type Rect } from './geometry';
import { CLS, polylinePath, tag, textEl } from './svg';
import type { SheetStyle } from './style';
import type { Paper } from './units';

type Stair = NonNullable<AiFloorPlanLevel['stairs']>[number];
type EntryStep = NonNullable<AiFloorPlanLevel['entry_steps']>[number];

/** Nhãn chiều đi lên, in ở chân vế thứ nhất. */
const UP_LABEL = 'LÊN';

/** Nhãn ở tầng trên cùng: thang của tầng dưới đi lên tới đây, người đứng ở đây thì đi XUỐNG. */
const DOWN_LABEL = 'XUỐNG';

/** Chữ số bậc chỉ in khi một bậc trên giấy cao ít nhất bấy nhiêu lần cỡ chữ — chật hơn thì chồng lên nét. */
const NUMBER_FIT = 1.4;

const AXIS: Record<string, Pt> = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };

/** Hình học vế thang trong hệ (dọc `up`, ngang) — MỘT chỗ tính cho bộ vẽ và bộ tránh chữ. */
interface FlightGeometry {
  runLength: number;
  runWidth: number;
  flights: number;
  laneWidth: number;
  /** Số bậc mỗi vế. */
  stepCount: number;
  /** Chiều dài phần có bậc — `stepCount × going`, hoặc cả phần trừ chiếu nghỉ khi không có `going`. */
  flightLength: number;
  /** Bề sâu một bậc, đơn vị thật. */
  going: number;
}

function flightGeometry(stair: Stair): FlightGeometry | null {
  const rect = toRect(stair.rect);
  const horizontal = stair.up === '+x' || stair.up === '-x';
  const runLength = horizontal ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
  const runWidth = horizontal ? rect.y1 - rect.y0 : rect.x1 - rect.x0;
  if (runLength <= 0 || runWidth <= 0) return null;
  const flights = Math.max(1, Math.min(3, stair.flights ?? 1));
  const laneWidth = runWidth / flights;
  // Nhiều vế thì chừa một chiếu nghỉ ở đầu xa để quay đầu; một vế thì chạy suốt.
  const landingMin = flights > 1 ? Math.min(laneWidth, runLength / 3) : 0;
  const room = runLength - landingMin;
  const stepCount = Math.max(2, Math.round((stair.treads ?? 12) / flights));
  // Có mặt bậc thì vế dài đúng số bậc × mặt bậc, phần dư vào chiếu nghỉ. Ô thang NGẮN hơn thế thì
  // `stair-fit.ts` đã báo ở cổng; ở đây chỉ co lại cho khỏi vẽ bậc chọc qua tường.
  const flightLength =
    stair.going && stair.going > 0 ? Math.min(room, stepCount * stair.going) : room;
  return {
    runLength,
    runWidth,
    flights,
    laneWidth,
    stepCount,
    flightLength,
    going: flightLength / stepCount,
  };
}

/**
 * `arriving` = vẽ thang của TẦNG DƯỚI trên tờ tầng trên cùng. Tầng trên cùng không khai thang đi lên
 * (hợp đồng: `stair: null`), nên trước đây ô thang của nó để trắng — tờ vẽ tầng 2 có chữ «Thang bộ»
 * mà không có một bậc nào (13/09/2026).
 */
export function renderStairs(
  stairs: readonly Stair[],
  paper: Paper,
  style: SheetStyle,
  arriving = false,
): string {
  const treads: string[] = [];
  const arrows: string[] = [];
  const labels: string[] = [];

  const numbers: string[] = [];

  for (const stair of stairs) {
    const rect = toRect(stair.rect);
    const geometry = flightGeometry(stair);
    if (!geometry) continue;
    const { runLength, flights, laneWidth, stepCount, flightLength, going } = geometry;
    // Trục đi lên và trục ngang, trong hệ toạ độ THẬT.
    const up: Pt = AXIS[stair.up] ?? [0, -1];
    const across: Pt = [-up[1], up[0]];

    // Gốc = góc ô thang mà vế thứ nhất XUẤT PHÁT: đi theo `up` và theo `across` từ đó thì
    // luôn ở trong ô. `up` và `across` vuông góc và cùng phương trục, nên mỗi véc-tơ quyết
    // định đúng một toạ độ.
    const stepX = up[0] !== 0 ? up[0] : across[0];
    const stepY = up[1] !== 0 ? up[1] : across[1];
    const origin: Pt = [stepX > 0 ? rect.x0 : rect.x1, stepY > 0 ? rect.y0 : rect.y1];
    const landing = runLength - flightLength;
    const gap = paper.k > 0 ? style.symbol.stair_gap_mm / paper.k : 0;
    const numberSize = style.text_mm.stair_number;
    const numbered = going * paper.k >= numberSize * NUMBER_FIT;

    const at = (alongUp: number, alongAcross: number): Pt =>
      addVec(along(origin, up, alongUp), across, alongAcross);

    for (let lane = 0; lane < flights; lane += 1) {
      const forward = lane % 2 === 0;
      const laneFrom = lane * laneWidth;
      const laneTo = laneFrom + laneWidth;

      for (let step = 1; step < stepCount; step += 1) {
        const distance = going * step;
        // Hai vế của thang chữ U nằm CẠNH nhau trên cùng đoạn chiều dài, không nối tiếp nhau:
        // vế lên chạy từ chân tới chiếu nghỉ, người quay 180° rồi vế sau chạy ngược lại trên
        // đúng đoạn ấy ở lằn bên kia. Phần chiếu nghỉ ở đầu xa để trống, không có bậc.
        const position = forward ? distance : flightLength - distance;
        treads.push(
          polylinePath(
            [paper.p(at(position, laneFrom + gap)), paper.p(at(position, laneTo - gap))],
            false,
          ),
        );
      }
      // Số bậc ở giữa mỗi bậc, lệch khỏi trục mũi tên về phía khe/tường để hai thứ không đè nhau.
      if (numbered) {
        for (let step = 0; step < stepCount; step += 1) {
          // Mỗi vế vẽ cùng một số bậc (làm tròn), nên tổng có thể dư một bậc so với `treads` —
          // bậc dư không đánh số: số in ra phải khớp số bậc hợp đồng khai.
          const number = lane * stepCount + step + 1;
          if (stair.treads !== undefined && number > stair.treads) continue;
          const middle = going * (step + 0.5);
          const position = forward ? middle : flightLength - middle;
          const point = paper.p(at(position, laneFrom + laneWidth * 0.8));
          numbers.push(
            textEl(String(number), {
              x: point[0],
              y: point[1],
              class: CLS.textStairNumber,
            }),
          );
        }
      }
      // Lồng thang: khe giữa hai vế, dừng ở chiếu nghỉ vì từ đó trở đi sàn liền.
      if (lane > 0) {
        treads.push(
          // Bắt đầu từ bậc đầu tiên, không từ mép ô: mép ô thường là chỗ đặt cửa vào thang, và một
          // nét chạy tới đó đâm thẳng vào lỗ cửa.
          polylinePath([paper.p(at(going, laneFrom)), paper.p(at(flightLength, laneFrom))], false),
        );
      }
    }

    // Mũi tên: chạy giữa vế thứ nhất, qua chiếu nghỉ rồi xuống giữa vế kế tiếp nếu có.
    const path: Pt[] = [at(flightLength * 0.08, laneWidth / 2)];
    if (flights > 1) {
      // Lên hết vế một, vòng qua giữa chiếu nghỉ, rồi xuôi theo vế hai.
      path.push(at(flightLength, laneWidth / 2));
      path.push(at(runLength - landing / 2, laneWidth / 2));
      path.push(at(runLength - landing / 2, laneWidth * 1.5));
      path.push(at(flightLength, laneWidth * 1.5));
      path.push(at(flightLength * 0.08, laneWidth * 1.5));
    } else {
      path.push(at(flightLength * 0.92, laneWidth / 2));
    }
    arrows.push(
      polylinePath(
        path.map((point) => paper.p(point)),
        false,
      ),
    );
    const beforeTip = path[path.length - 2];
    const tipPoint = path[path.length - 1];
    if (beforeTip && tipPoint) arrows.push(arrowHead(beforeTip, tipPoint, paper, style));

    // Nhãn để NẰM NGANG dù vế thang chạy hướng nào: «LÊN» có ba chữ cái, xoay theo vế không
    // giúp đọc dễ hơn mà lại đẻ ra một quy ước phải nhớ (xoay chiều nào thì chữ không lộn).
    const labelAt = paper.p(at(flightLength * 0.08, laneWidth * 0.2));
    labels.push(
      textEl(arriving ? DOWN_LABEL : UP_LABEL, {
        x: labelAt[0],
        y: labelAt[1],
        class: CLS.textStair,
      }),
    );
  }

  const parts: string[] = [];
  if (treads.length) parts.push(tag('path', { class: CLS.stair, d: treads.join(' ') }));
  if (arrows.length) parts.push(tag('path', { class: CLS.stairArrow, d: arrows.join(' ') }));
  parts.push(...labels, ...numbers);
  return parts.join('');
}

/**
 * Bậc tam cấp ngoài cửa chính (T70): viền phần đất bậc chiếm, nét chia từng bậc, và số bậc 1…n tính
 * từ bậc NGOÀI CÙNG (thấp nhất) vào — cách HS-05 ghi «1 2 3» (13.16.2). Bậc n sát tường là bậc cao
 * nhất, ngang cốt nền: đứng trên đó là đứng trước cửa.
 */
export function renderEntrySteps(
  steps: readonly EntryStep[],
  paper: Paper,
  style: SheetStyle,
): string {
  const lines: string[] = [];
  const numbers: string[] = [];
  for (const step of steps) {
    const rect = toRect(step.rect);
    const down = AXIS[step.down];
    if (!down || step.risers < 1) continue;
    const corners: Pt[] = [
      [rect.x0, rect.y0],
      [rect.x1, rect.y0],
      [rect.x1, rect.y1],
      [rect.x0, rect.y1],
    ];
    lines.push(
      polylinePath(
        corners.map((point) => paper.p(point)),
        true,
      ),
    );
    // Mép sát tường: đi theo `down` từ đó là ra sân.
    const alongX = down[0] !== 0;
    const wallAt = alongX ? (down[0] > 0 ? rect.x0 : rect.x1) : down[1] > 0 ? rect.y0 : rect.y1;
    const depth = alongX ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
    const going = depth / step.risers;
    const cut = (distance: number): [Pt, Pt] => {
      const c = wallAt + (alongX ? down[0] : down[1]) * distance;
      return alongX
        ? [
            [c, rect.y0],
            [c, rect.y1],
          ]
        : [
            [rect.x0, c],
            [rect.x1, c],
          ];
    };
    for (let k = 1; k < step.risers; k += 1) {
      const [a, b] = cut(going * k);
      lines.push(polylinePath([paper.p(a), paper.p(b)], false));
    }
    if (going * paper.k < style.text_mm.stair_number * NUMBER_FIT) continue;
    for (let n = 1; n <= step.risers; n += 1) {
      // Bậc n cách tường (risers − n + ½) mặt bậc.
      const [a, b] = cut(going * (step.risers - n + 0.5));
      const point = paper.p([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      numbers.push(textEl(String(n), { x: point[0], y: point[1], class: CLS.textStairNumber }));
    }
  }
  const parts: string[] = [];
  if (lines.length) parts.push(tag('path', { class: CLS.stair, d: lines.join(' ') }));
  parts.push(...numbers);
  return parts.join('');
}

/** Hai nét chụm ở mũi tên, dài `stair_arrow_head_mm` trên giấy. */
function arrowHead(from: Pt, to: Pt, paper: Paper, style: SheetStyle): string {
  const tip = paper.p(to);
  const tail = paper.p(from);
  const dx = tip[0] - tail[0];
  const dy = tip[1] - tail[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const size = style.symbol.stair_arrow_head_mm;
  const wing = (sign: number): [number, number] => [
    tip[0] - size * (ux * 0.87 - sign * uy * 0.5),
    tip[1] - size * (uy * 0.87 + sign * ux * 0.5),
  ];
  return [
    polylinePath([wing(1), [tip[0], tip[1]]], false),
    polylinePath([wing(-1), [tip[0], tip[1]]], false),
  ].join(' ');
}

/**
 * Phần ô thang có BẬC, toạ độ thật — không gồm chiếu nghỉ. Bộ ghi tên phòng đặt «Thang bộ» ra
 * chiếu nghỉ thay vì giữa đám bậc và mũi tên (tờ vẽ 13/09/2026).
 */
export function stairTreadZones(stairs: readonly Stair[]): Rect[] {
  const zones: Rect[] = [];
  for (const stair of stairs) {
    const rect = toRect(stair.rect);
    const flightLength = flightGeometry(stair)?.flightLength ?? 0;
    const points: Pt[] =
      stair.up === '+x'
        ? [
            [rect.x0, rect.y0],
            [rect.x0 + flightLength, rect.y1],
          ]
        : stair.up === '-x'
          ? [
              [rect.x1 - flightLength, rect.y0],
              [rect.x1, rect.y1],
            ]
          : stair.up === '+y'
            ? [
                [rect.x0, rect.y0],
                [rect.x1, rect.y0 + flightLength],
              ]
            : [
                [rect.x0, rect.y1 - flightLength],
                [rect.x1, rect.y1],
              ];
    zones.push(bboxOfPoints(points));
  }
  return zones;
}
