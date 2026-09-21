/**
 * ẢNH NEO THỨ HAI — tờ mặt bằng mái nhìn thẳng từ trên (T67 Đợt B, 20/09/2026).
 *
 * ── Vì sao cần nó ─────────────────────────────────────────────────────────────────────────
 * Tờ mặt đứng là hình chiếu phẳng: nó nói bề rộng, cao độ và lỗ mở, nhưng KHÔNG nói nhà sâu bao
 * nhiêu, mái hình gì nhìn từ trên, tầng nào lùi vào, và gara nằm về phía nào của khối. Hai góc
 * `oblique` và `aerial` cần đúng những thứ ấy. Thiếu chúng thì mô hình đoán, và đoán xong thì hai
 * tờ vẽ của cùng một ngôi nhà nói ngược nhau — đúng họ lỗi T65.
 *
 * ── RANH THỬA: vẽ, và vì sao đổi ý ────────────────────────────────────────────────────────
 * Bản đầu (20/09/2026) CỐ Ý không vẽ ranh thửa, với lý do «khoảng lùi không có trong
 * `ai_floor_plan` lẫn `ai_facade_concept`, muốn vẽ thì phải bịa». Lý do ấy SAI, và nó tốn một
 * lượt chạy thật mới lộ ra: đầu bài khai sân trước 3 m, tấm `aerial` vẽ sân 8–10 m, ai nhìn cũng
 * thấy sai vì một thân ô tô đã hơn 4 m.
 *
 * Số đo ấy vẫn có, chỉ là ở chỗ khác: gốc toạ độ mặt bằng là góc TRƯỚC-TRÁI thửa, nên hình bao
 * trong `plan` ĐÃ nằm đúng chỗ của nó trên thửa — chỉ thiếu đường bao ngoài. Đường bao ấy lấy từ
 * `siteGeometry(brief.site).boundary`, là đa giác THẬT của thửa, không phải một hình chữ nhật suy
 * đoán. Không có nó thì tờ neo là một khối nhà trôi trong khoảng trắng, và mô hình không có cách
 * nào biết sân rộng bao nhiêu — cả bằng hình lẫn bằng chữ.
 *
 * Đầu bài không khai đủ kích thước thửa thì `lotBoundary` là `null` và tờ vẽ trở về như cũ: thiếu
 * dữ liệu vẫn KHÔNG được vẽ đoán.
 *
 * ── Hai thứ tờ này CỐ Ý không vẽ ──────────────────────────────────────────────────────────
 *  1. **Chữ.** Lời dẫn phối cảnh nói «Write NO text», và mô hình ảnh chép lại chữ nó nhìn thấy.
 *     Một tờ neo có chữ là một cách chắc chắn để chữ ấy hiện lên tấm ảnh đưa khách.
 *  2. **Chuỗi kích thước.** Cùng lý do — số đo đi trong lời dẫn, không đi trên tờ.
 *
 * Hướng đường đánh dấu bằng MỘT MŨI TÊN chỉ vào mặt tiền, đặt ngoài khối. Mũi tên không đọc nhầm
 * thành tường hay ranh đất được; một dải kẻ ngang thì có.
 *
 * Tệp thuần: không `fetch`, không kho, không CSDL.
 */

import type { AiFacadeConcept, AiFloorPlan } from '@nvg/shared/design';
import type { FacadeVocabulary } from '../../kb/facade-vocabulary';
import { anchorPaper, anchorSvg } from './anchor';
import { bboxOfPoints, toPt, toRect, type Pt, type Rect } from './geometry';
import { DrawNotes, type DrawNote } from './notes';
import { PlanSheetError } from './plan-sheet';
import { CLS, el, num, tag } from './svg';
import type { SheetStyle } from './style';
import { chooseLayout, type Paper } from './units';

export interface RoofPlanAnchorResult {
  svg: string;
  widthPx: number;
  heightPx: number;
  scale: number;
  notes: DrawNote[];
}

export interface RoofPlanOptions {
  style: SheetStyle;
  vocab: FacadeVocabulary;
  /** Nhóm `outdoor` của `kb/room_vocabulary.yaml` — ban công, sân thượng nhìn thấy từ trên. */
  outdoor: ReadonlySet<string>;
  /**
   * Ranh thửa, cm, cùng gốc toạ độ với `plan` (góc trước-trái thửa). `null` khi đầu bài chưa khai
   * đủ kích thước thửa — khi ấy tờ vẽ không có đường bao ngoài, và đó là câu trả lời đúng.
   */
  lotBoundary: readonly Pt[] | null;
}

/** Chiều dài mũi tên chỉ hướng đường, tính theo bề ngang khối nhà. */
const ARROW_SHARE = 0.18;
/** Khoảng cách từ mũi tên tới mặt tiền, cũng theo bề ngang khối — không phải số đo khoảng lùi. */
const ARROW_GAP_SHARE = 0.08;
/** Tường chắn mái mỏng bao nhiêu khi nhìn từ trên, cm — chỉ để mái bằng có hai nét chứ không một. */
const PARAPET_T_CM = 20;
/** Bề dày vạch lối vào, cm — nó nằm NGOÀI mặt tiền nên không lấn vào hình bao. */
const ENTRANCE_T_CM = 25;

/**
 * Dựng tờ mặt bằng mái.
 *
 * `plan` cho hình bao từng tầng, `concept` cho kiểu mái và lỗ mở mặt tiền. Hai artifact ấy là đủ —
 * hàm KHÔNG nhận đầu bài, nên không có đường nào để một con số khảo sát đi vào tờ này.
 */
export function renderRoofPlanAnchor(
  plan: AiFloorPlan,
  concept: AiFacadeConcept,
  options: RoofPlanOptions,
): RoofPlanAnchorResult {
  const levels = [...plan.levels].sort((a, b) => a.level - b.level);
  const top = levels[levels.length - 1];
  if (!top) throw new PlanSheetError('Phương án này không có tầng nào.');

  const notes = new DrawNotes();
  const outlines = levels.map((level) => level.outline.map(toPt));
  const topOutline = outlines[outlines.length - 1]!;
  const roof = roofGeometry(topOutline, concept, options.vocab, notes);

  // Hộp bao gồm CẢ mái đua và mũi tên: thứ gì chìa ra ngoài mà không nằm trong hộp thì bị cắt, và
  // một mái bị cắt cụt là một mái mô hình sẽ vẽ lại cụt y vậy.
  // Ranh thửa vào hộp bao TRƯỚC: nó là hình lớn nhất trên tờ, bỏ ra ngoài thì khung cắt mất ranh
  // và tỉ lệ sân — đúng thứ tờ này sinh ra để nói — biến mất.
  const lot = options.lotBoundary ?? null;
  const all: Pt[] = [...outlines.flat(), ...roof.eaves, ...(lot ?? [])];
  const blockBox = bboxOfPoints(all);
  const width = blockBox.x1 - blockBox.x0;
  const arrow = arrowPoints(blockBox, width);
  const bbox = bboxOfPoints([...all, ...arrow.hull]);

  const { scale } = chooseLayout(bbox, options.style);
  const { paper, viewW, viewH, frame } = anchorPaper(bbox, scale, options.style);

  const body = [
    // Ranh thửa dưới cùng: mọi thứ khác vẽ đè lên nó.
    ...(lot ? [polygon(lot, paper, CLS.roofLot)] : []),
    // Tầng dưới TRƯỚC, nét mảnh: chúng chỉ để thấy tầng nào lùi vào, tầng nào đua ra.
    ...outlines.slice(0, -1).map((outline) => polygon(outline, paper, CLS.roofBelow)),
    ...balconies(levels, options.outdoor, paper),
    ...roofBody(roof, paper),
    // Khối tầng trên cùng vẽ SAU mái, nét đậm: đó là thứ người xem phải đọc ra trước tiên.
    polygon(topOutline, paper, CLS.roofBlock),
    ...frontOpenings(concept, levels, paper),
    ...arrowBody(arrow, paper),
  ].join('');

  return {
    svg: anchorSvg({ paper, viewW, viewH, frame }, options.style, body),
    widthPx: frame.widthPx,
    heightPx: frame.heightPx,
    scale,
    notes: notes.list(),
  };
}

interface RoofGeometry {
  /** Hình bao mái đua — trùng hình bao khối khi mái bằng. */
  eaves: Pt[];
  /** Mép mái trùng hình bao khối (mái bằng) — khi ấy không vẽ lại nó. */
  sameAsBlock: boolean;
  /** Đường nóc và đường xiên; rỗng khi mái bằng hoặc mái hỗn hợp. */
  ridges: Array<[Pt, Pt]>;
  /** Mặt trong tường chắn mái — chỉ mái bằng mới có. */
  parapet: Pt[] | null;
}

/**
 * Hình mái nhìn từ trên, suy từ KIỂU MÁI của ý tưởng.
 *
 * ⚠️ Đường nóc và đường xiên dựng theo HỘP BAO của tầng trên cùng, không theo đa giác thật. Nhà
 * hình chữ L lợp mái dốc thì hình thật là hai khối mái giao nhau, và bộ vẽ này không dựng được —
 * nên nó ghi một dòng chú thích thay vì vẽ ra một hình sai trông như đúng. Hình bao mái đua thì
 * vẫn theo đa giác thật, nên chiều sâu và hình khối — thứ hai góc kia cần — vẫn đúng.
 */
function roofGeometry(
  outline: readonly Pt[],
  concept: AiFacadeConcept,
  vocab: FacadeVocabulary,
  notes: DrawNotes,
): RoofGeometry {
  const type = concept.roof.type;
  if (type === 'flat') {
    return {
      eaves: [...outline],
      sameAsBlock: true,
      ridges: [],
      parapet: inset(outline, PARAPET_T_CM),
    };
  }

  const overhang =
    type === 'japanese' ? vocab.roofDefaults.japanese.overhang_cm : vocab.roofDefaults.overhang_cm;
  const eaves = inset(outline, -overhang) ?? [...outline];

  if (type === 'mixed') {
    // `mixed` nghĩa là ý tưởng tự khai đường mái trên MẶT ĐỨNG; không có gì nói về hình nó nhìn từ
    // trên. Vẽ mỗi mái đua, và nói ra là đã không vẽ đường nóc.
    notes.add(
      'roof_plan_mixed',
      'Mái hỗn hợp: tờ mặt bằng mái chỉ vẽ mép mái đua, không vẽ đường nóc.',
    );
    return { eaves, sameAsBlock: false, ridges: [], parapet: null };
  }

  const box = bboxOfPoints(eaves);
  if (!isRectangular(outline)) {
    notes.add(
      'roof_plan_bbox_ridge',
      'Hình bao tầng trên cùng không phải hình chữ nhật: đường nóc vẽ theo hộp bao.',
    );
  }
  const w = box.x1 - box.x0;
  const d = box.y1 - box.y0;
  const alongX = w >= d;
  const longLen = alongX ? w : d;
  const midShort = alongX ? (box.y0 + box.y1) / 2 : (box.x0 + box.x1) / 2;

  // Mái hai dốc: nóc chạy SUỐT chiều dài. Mái bốn dốc: nóc ngắn lại, phần còn lại là hai dốc hồi,
  // và tỷ lệ ấy là dữ liệu (`hip_ridge_share`) chứ không phải số trong mã.
  const share = type === 'gable' ? 1 : vocab.roofDefaults.hip_ridge_share;
  const half = (longLen * Math.min(1, Math.max(0, share))) / 2;
  const mid = alongX ? (box.x0 + box.x1) / 2 : (box.y0 + box.y1) / 2;
  const a = mid - half;
  const b = mid + half;
  const ridge: [Pt, Pt] = alongX
    ? [
        [a, midShort],
        [b, midShort],
      ]
    : [
        [midShort, a],
        [midShort, b],
      ];

  const ridges: Array<[Pt, Pt]> = [ridge];
  if (type !== 'gable') {
    // Bốn đường xiên nối góc mái với hai đầu nóc — dấu hiệu nhận ra mái bốn dốc khi nhìn từ trên.
    const corners: Pt[] = [
      [box.x0, box.y0],
      [box.x1, box.y0],
      [box.x1, box.y1],
      [box.x0, box.y1],
    ];
    for (const corner of corners) {
      const near = distance(corner, ridge[0]) <= distance(corner, ridge[1]) ? ridge[0] : ridge[1];
      ridges.push([corner, near]);
    }
  }
  return { eaves, sameAsBlock: false, ridges, parapet: null };
}

function roofBody(roof: RoofGeometry, paper: Paper): string[] {
  // Mái bằng: mép mái TRÙNG hình bao khối, nên vẽ nó là vẽ đè lên chính nét đã có — hai đường
  // chồng nhau trông dày hơn thật và đọc thành một chi tiết không tồn tại.
  const out = roof.sameAsBlock ? [] : [polygon(roof.eaves, paper, CLS.roofEdge)];
  if (roof.parapet) out.push(polygon(roof.parapet, paper, CLS.roofEdge));
  for (const [a, b] of roof.ridges) {
    const [x1, y1] = paper.p(a);
    const [x2, y2] = paper.p(b);
    out.push(tag('line', { class: CLS.roofEdge, x1, y1, x2, y2 }));
  }
  return out;
}

/** Ban công và sân thượng — nét đứt, vì chúng là sàn hở chứ không phải mái. */
function balconies(
  levels: readonly AiFloorPlan['levels'][number][],
  outdoor: ReadonlySet<string>,
  paper: Paper,
): string[] {
  const out: string[] = [];
  for (const level of levels) {
    for (const room of level.rooms) {
      if (!outdoor.has(room.type)) continue;
      const r = toRect(room.rect);
      const [x1, y1] = paper.p([r.x0, r.y0]);
      const [x2, y2] = paper.p([r.x1, r.y1]);
      out.push(
        tag('rect', {
          class: CLS.softDivider,
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        }),
      );
    }
  }
  return out;
}

/**
 * Cửa đi và cửa để xe trên mặt tiền — vạch đậm nằm trên mép trước của khối.
 *
 * Đây là thứ quyết định ảnh góc nghiêng có đúng hay không: mô hình phải biết xe vào từ phía nào.
 * `x` của lỗ mở cùng gốc toạ độ với mặt bằng (hợp đồng `ai-facade-concept`), nên không phải quy đổi.
 */
function frontOpenings(
  concept: AiFacadeConcept,
  levels: readonly AiFloorPlan['levels'][number][],
  paper: Paper,
): string[] {
  const ground = levels[0];
  if (!ground) return [];
  const frontY = Math.min(...ground.outline.map((point) => toPt(point)[1]));
  const lowest = Math.min(...concept.openings_front.map((o) => o.level));
  return concept.openings_front
    .filter((o) => o.level === lowest && (o.kind === 'door' || o.kind === 'garage'))
    .map((o) => {
      // Vạch TÔ ĐẶC đặt ngay ngoài mặt tiền, không phải một nét trên chính mép tường: nét viền
      // của bộ vẽ này cùng bề dày với tường, nên vẽ chồng lên là vẽ vào chỗ đã có mực — đo trên
      // bản dựng đầu, hai cửa của biệt thự mẫu không nhìn thấy được.
      const [x1, y1] = paper.p([o.x, frontY]);
      const [x2, y2] = paper.p([o.x + o.w, frontY - ENTRANCE_T_CM]);
      return tag('rect', {
        class: CLS.roofEntrance,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      });
    });
}

interface Arrow {
  tip: Pt;
  tail: Pt;
  /** Mọi điểm của mũi tên, để tính hộp bao. */
  hull: Pt[];
}

/** Mũi tên chỉ từ phía đường vào mặt tiền. Đường nằm ở phía `y` nhỏ (hợp đồng `design-brief`). */
function arrowPoints(box: Rect, width: number): Arrow {
  const x = (box.x0 + box.x1) / 2;
  const gap = width * ARROW_GAP_SHARE;
  const len = width * ARROW_SHARE;
  const tip: Pt = [x, box.y0 - gap];
  const tail: Pt = [x, box.y0 - gap - len];
  const head = len * 0.3;
  return {
    tip,
    tail,
    hull: [tip, tail, [x - head, tip[1] - head], [x + head, tip[1] - head]],
  };
}

/**
 * Mũi tên trên giấy.
 *
 * Hai cánh đầu mũi suy từ CHÍNH vector đuôi → mũi, không đặt theo trục màn hình. Bộ đổi toạ độ lật
 * trục y (mép đường nằm ở ĐÁY tờ, không phải đỉnh), nên đặt cứng «cánh nằm phía trên mũi» cho ra
 * một mũi tên chỉ ra xa ngôi nhà — đúng ngược thứ nó phải nói. Đã dựng nhầm như vậy ở bản đầu.
 */
function arrowBody(arrow: Arrow, paper: Paper): string[] {
  const [tx, ty] = paper.p(arrow.tip);
  const [bx, by] = paper.p(arrow.tail);
  const len = Math.hypot(tx - bx, ty - by) || 1;
  const ux = (tx - bx) / len;
  const uy = (ty - by) / len;
  const head = len * 0.3;
  // Chân cánh lùi `head` NGƯỢC hướng đi, rồi doãi sang hai bên theo pháp tuyến.
  const baseX = tx - ux * head;
  const baseY = ty - uy * head;
  const spread = head * 0.6;
  const a = `${num(baseX - uy * spread)},${num(baseY + ux * spread)}`;
  const b = `${num(baseX + uy * spread)},${num(baseY - ux * spread)}`;
  return [
    tag('line', { class: CLS.roofArrow, x1: bx, y1: by, x2: tx, y2: ty }),
    el('polyline', { class: CLS.roofArrow, points: `${a} ${num(tx)},${num(ty)} ${b}` }, ''),
  ];
}

function polygon(points: readonly Pt[], paper: Paper, cls: string): string {
  if (points.length < 3) return '';
  const d = points
    .map((point, index) => {
      const [x, y] = paper.p(point);
      return `${index === 0 ? 'M' : 'L'}${num(x)},${num(y)}`;
    })
    .join(' ');
  return tag('path', { class: cls, d: `${d} Z` });
}

/**
 * Đa giác thu vào (hoặc nở ra khi `by` âm) — chỉ đúng cho đa giác CHỮ NHẬT TRỤC.
 *
 * Bộ vẽ không có phép offset đa giác tổng quát, và viết một cái ở đây để vẽ mái đua là đổi một
 * hàm vẽ lấy một bài toán hình học. Hình bao nhà NVG gần như luôn là đa giác trục (`plan-geometry`
 * dựng chúng từ lưới ô), nên nở theo từng cạnh theo pháp tuyến trục là đủ; cạnh vát thì trả về
 * `null` và nơi gọi ngã về chính hình bao.
 */
function inset(points: readonly Pt[], by: number): Pt[] | null {
  const n = points.length;
  if (n < 4) return null;
  const centre = bboxOfPoints(points);
  const cx = (centre.x0 + centre.x1) / 2;
  const cy = (centre.y0 + centre.y1) / 2;
  const out: Pt[] = [];
  for (const [x, y] of points) {
    // Kéo mỗi đỉnh về phía tâm (hoặc ra xa khi `by` âm) đúng `by` theo cả hai trục. Trên đa giác
    // trục, phép này cho đúng kết quả của offset từng cạnh.
    out.push([x + Math.sign(cx - x) * by, y + Math.sign(cy - y) * by]);
  }
  return out;
}

function isRectangular(points: readonly Pt[]): boolean {
  return points.length === 4;
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
