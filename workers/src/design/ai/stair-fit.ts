/**
 * Ô thang có chỗ trong cả nhà không — kiểm TẤT ĐỊNH từ đầu bài + khối nhà, trước lời gọi mô hình (T178, việc 3).
 *
 * Ô thang thẳng trục mọi tầng, nên ở MỖI tầng của nhà nhiều tầng có một chữ nhật cố định rộng `sw` × sâu `sl` nằm đâu
 * đó trong khối `W` × `D`. Một phòng chữ nhật không đè ô thang thì nằm hẳn về một phía của nó (định lý trục tách): bên
 * trái / phải — bề ngang phòng ≤ `W − sw`; hoặc trước / sau — chiều sâu phòng ≤ `D − sl`. Nên với mỗi hướng đặt thang:
 * - phòng có cạnh tối thiểu lớn hơn cả hai khoảng ấy thì không có chỗ nào;
 * - các phòng chỉ đặt được trước / sau phải vừa vùng `W × (D − sl)`, phòng chỉ đặt được hai bên phải vừa `(W − sw) × D`,
 *   và tổng mọi phòng + ô thang vừa sàn.
 * Tầng chỉ bị CHẶN khi HAI hướng đặt thang đều hỏng — chắc chắn không dựng được, dù ô thang đặt ở đâu (T49 / T52: luật
 * cứng chỉ khi không dựng được).
 *
 * Cố ý ĐẾM THIẾU để không chặn oan: cạnh và diện tích phòng lấy LỌT LÒNG (nhỏ hơn số theo tim), ô thang lấy cỡ nhỏ nhất
 * theo loại thang, diện tích đầu bài trừ dung sai cổng, chỉ phòng đầu bài GHIM tầng; hành lang, tường, thang máy không
 * cộng. Phần «khó» (không chắc) chỉ là cảnh báo.
 *
 * Hàm THUẦN.
 */

export interface FitRoom {
  type: string;
  /** Diện tích tối thiểu lọt lòng, m² (đã trừ dung sai cổng). */
  minM2: number;
  /** Cạnh ngắn dùng được, m — 0 khi loại phòng không có mức. */
  minSideM: number;
}

export interface FitLevel {
  level: number;
  rooms: FitRoom[];
  /** Sàn xây được của tầng, m² (tầng 1 đã kẹp mật độ). */
  plateM2: number;
}

export interface StairFitInput {
  /** Khối xây được, m. */
  widthM: number;
  depthM: number;
  /** Ô thang nhỏ nhất, m (lọt lòng) — cạnh ngắn × cạnh dài. */
  stair: { shortM: number; longM: number };
  levels: readonly FitLevel[];
}

export type FitProblem =
  | { kind: 'stair_too_big' }
  | { kind: 'room_nowhere'; type: string; minSideM: number; besideM: number; frontBackM: number }
  | { kind: 'front_back_full'; needM2: number; haveM2: number; types: string[] }
  | { kind: 'beside_full'; needM2: number; haveM2: number; types: string[] }
  | { kind: 'plate_full'; needM2: number; haveM2: number };

export interface OrientationFit {
  /** Cạnh ô thang theo bề ngang khối nhà, m. */
  acrossM: number;
  alongM: number;
  problems: FitProblem[];
  /** Phần đã dùng của vùng chặt nhất (0–1+) — để cảnh báo «khó». */
  tightest: number;
}

export interface LevelFit {
  level: number;
  /** Hai hướng đặt thang: cạnh ngắn theo bề ngang, rồi cạnh dài theo bề ngang. */
  orientations: OrientationFit[];
  /** Không hướng nào dựng được — chắc chắn hỏng. */
  blocked: boolean;
  /** Hướng tốt nhất còn dùng tới chừng này vùng chặt nhất. */
  tightest: number;
}

const EPS = 1e-6;

function orientationFit(
  input: StairFitInput,
  level: FitLevel,
  acrossM: number,
  alongM: number,
): OrientationFit {
  const W = input.widthM;
  const D = input.depthM;
  const beside = W - acrossM;
  const frontBack = D - alongM;
  if (beside < -EPS || frontBack < -EPS) {
    return { acrossM, alongM, problems: [{ kind: 'stair_too_big' }], tightest: Infinity };
  }
  const problems: FitProblem[] = [];
  const besideArea = Math.max(0, beside) * D;
  const frontBackArea = W * Math.max(0, frontBack);
  let fbOnly = 0;
  let sideOnly = 0;
  const fbTypes: string[] = [];
  const sideTypes: string[] = [];
  let total = 0;
  for (const room of level.rooms) {
    const s = room.minSideM;
    const a = room.minM2;
    total += a;
    const canSide = s <= beside + EPS && s <= D + EPS && a <= besideArea + EPS;
    const canFront = s <= frontBack + EPS && s <= W + EPS && a <= frontBackArea + EPS;
    if (!canSide && !canFront) {
      problems.push({
        kind: 'room_nowhere',
        type: room.type,
        minSideM: s,
        besideM: Math.max(0, beside),
        frontBackM: Math.max(0, frontBack),
      });
    } else if (!canSide) {
      fbOnly += a;
      fbTypes.push(room.type);
    } else if (!canFront) {
      sideOnly += a;
      sideTypes.push(room.type);
    }
  }
  if (fbOnly > frontBackArea + EPS) {
    problems.push({
      kind: 'front_back_full',
      needM2: fbOnly,
      haveM2: frontBackArea,
      types: fbTypes,
    });
  }
  if (sideOnly > besideArea + EPS) {
    problems.push({ kind: 'beside_full', needM2: sideOnly, haveM2: besideArea, types: sideTypes });
  }
  const floor = Math.max(0, Math.min(W * D, level.plateM2) - acrossM * alongM);
  if (total > floor + EPS) problems.push({ kind: 'plate_full', needM2: total, haveM2: floor });
  const share = (need: number, have: number) =>
    have > EPS ? need / have : need > EPS ? Infinity : 0;
  const tightest = Math.max(
    share(fbOnly, frontBackArea),
    share(sideOnly, besideArea),
    share(total, floor),
  );
  return { acrossM, alongM, problems, tightest };
}

/** Kiểm từng tầng đưa vào (nhà một tầng không có ô thang — bên gọi không đưa vào). */
export function stairFit(input: StairFitInput): LevelFit[] {
  const { shortM, longM } = input.stair;
  if (!(shortM > 0) || !(longM > 0)) return [];
  const shapes: [number, number][] =
    Math.abs(shortM - longM) < EPS
      ? [[shortM, longM]]
      : [
          [shortM, longM],
          [longM, shortM],
        ];
  return input.levels.map((level) => {
    const orientations = shapes.map(([across, along]) =>
      orientationFit(input, level, across, along),
    );
    return {
      level: level.level,
      orientations,
      blocked: orientations.every((o) => o.problems.length > 0),
      tightest: Math.min(...orientations.map((o) => o.tightest)),
    };
  });
}

const m = (value: number) =>
  (Math.round(value * 10) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });

function problemText(problem: FitProblem, label: (type: string) => string): string {
  const names = (types: readonly string[]) => [...new Set(types.map(label))].join(', ');
  switch (problem.kind) {
    case 'stair_too_big':
      return 'ô thang không lọt khối nhà';
    case 'room_nowhere':
      return `${label(problem.type)} cần cạnh tối thiểu ${m(problem.minSideM)} m mà cạnh ô thang chỉ còn ${m(problem.besideM)} m bề ngang, trước và sau ô thang chỉ còn ${m(problem.frontBackM)} m chiều sâu`;
    case 'front_back_full':
      return `các phòng không đặt cạnh ô thang được (${names(problem.types)}) cần khoảng ${m(problem.needM2)} m² mà phần trước và sau ô thang chỉ có ${m(problem.haveM2)} m²`;
    case 'beside_full':
      return `các phòng chỉ đặt được cạnh ô thang (${names(problem.types)}) cần khoảng ${m(problem.needM2)} m² mà hai bên ô thang chỉ có ${m(problem.haveM2)} m²`;
    case 'plate_full':
      return `diện tích tối thiểu các phòng khoảng ${m(problem.needM2)} m² vượt ${m(problem.haveM2)} m² sàn còn lại sau ô thang`;
  }
}

/**
 * Câu chặn tiếng Việt (CGD 4.4: việc không làm được + vì sao + cần làm gì), hoặc `null` khi không tầng nào chắc chắn
 * hỏng. Mỗi tầng nói theo hướng đặt thang ít lỗi nhất.
 */
export function stairFitBlockMessage(
  fits: readonly LevelFit[],
  label: (type: string) => string,
): string | null {
  const blocked = fits.filter((fit) => fit.blocked);
  if (!blocked.length) return null;
  const parts = blocked.map((fit) => {
    // Hướng thang không lọt khối nhà nói ít nhất — đứng sau mọi hướng lọt được.
    const weight = (o: OrientationFit) =>
      o.problems.some((p) => p.kind === 'stair_too_big') ? Infinity : o.problems.length;
    const best = [...fit.orientations].sort((a, b) => weight(a) - weight(b))[0]!;
    return `tầng ${fit.level}: ${best.problems
      .slice(0, 3)
      .map((p) => problemText(p, label))
      .join('; ')}`;
  });
  return (
    `Chưa tạo được mặt bằng vì đầu bài không xếp vừa khối nhà dù đặt ô thang ở đâu — ${parts.join(' · ')}. ` +
    'Cần nới đầu bài trước khi chạy: giảm diện tích tối thiểu hoặc số phòng ở tầng ấy, dời bớt phòng lên tầng khác, ' +
    'thu hẹp sân hoặc khoảng lùi, hoặc tăng số tầng.'
  );
}

/** Câu cảnh báo «khó» — tầng còn dựng được nhưng vùng chặt nhất đã dùng từ `warnShare` trở lên. Không chặn. */
export function stairFitWarnings(fits: readonly LevelFit[], warnShare: number): string[] {
  return fits
    .filter((fit) => !fit.blocked && fit.tightest >= warnShare)
    .map(
      (fit) =>
        `Tầng ${fit.level} khá chật: diện tích tối thiểu các phòng ghim ở tầng này đã dùng khoảng ${Math.round(
          fit.tightest * 100,
        )} % phần sàn còn chỗ quanh ô thang (chưa kể hành lang và tường). Mô hình dễ vẽ thiếu diện tích hoặc thiếu lối vào — nên xem lại diện tích tối thiểu hoặc số phòng ở tầng này trước khi chạy.`,
    );
}
