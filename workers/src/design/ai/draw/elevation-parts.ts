/**
 * Chi tiết cấu tạo của tờ mặt đứng — vẽ như hồ sơ NVG thật (T147).
 *
 * Trước T147 tờ chỉ có khung bao, lỗ mở một nét đố, lan can một khung và mảng trang trí tô nhạt. Tờ
 * KT07-08 của M5 thì có dải dầm + phào ở mỗi sàn, khung cửa đủ lớp với kính xiên, lan can trụ–nan,
 * tường chắn mái tô xám, chân nhà ốp đá. Tệp này dựng các chi tiết ấy; mọi số cấu tạo đọc từ
 * `kb/facade_detail.yaml`, mọi toạ độ vẫn suy từ artifact (T15) — không con số nào do mô hình đặt.
 *
 * Mỗi hàm trả chuỗi SVG trong hệ thật `x × z` (cm), qua `Pen` dựng trên bộ đổi toạ độ `Paper`.
 */

import type { AiFacadeConcept } from '@nvg/shared/design';
import type { FacadeDetail, HatchKind, RailingDraw } from '../../kb/facade-detail';
import type { FacadeVocabulary } from '../../kb/facade-vocabulary';
import type { Pt } from './geometry';
import { glassStrokes, hatchSvg, paintGrey, toneFill } from './hatch';
import { arcPath, CLS, num, polylinePath, tag, type Attrs } from './svg';
import type { Paper } from './units';

export type Opening = AiFacadeConcept['openings_front'][number];
export type FacadeElement = NonNullable<AiFacadeConcept['elevation']['elements']>[number];
export type FacadeMaterial = AiFacadeConcept['materials'][number];
export type Balcony = NonNullable<AiFacadeConcept['balconies']>[number];

/** Kiểu chia cánh của cửa đi: số cánh, xếp nhiều cánh hẹp, hoặc lùa (hai cánh chồng mép). */
export type DoorLeaves = number | 'folding' | 'sliding';

// ── Bút vẽ ─────────────────────────────────────────────────────────────────────────────

export interface Pen {
  paper: Paper;
  rect: (x0: number, z0: number, x1: number, z1: number, cls: string, attrs?: Attrs) => string;
  path: (points: Pt[], cls: string, close?: boolean) => string;
  /** Nhiều đoạn thẳng gộp vào MỘT thẻ `path` — nan lan can, nẹp cánh cửa. */
  segments: (list: ReadonlyArray<readonly [Pt, Pt]>, cls: string) => string;
}

export function penFor(paper: Paper): Pen {
  return {
    paper,
    rect(x0, z0, x1, z1, cls, attrs = {}) {
      const [ax, ay] = paper.p([Math.min(x0, x1), Math.max(z0, z1)]);
      return tag('rect', {
        x: ax,
        y: ay,
        width: paper.len(Math.abs(x1 - x0)),
        height: paper.len(Math.abs(z1 - z0)),
        class: cls,
        ...attrs,
      });
    },
    path(points, cls, close = false) {
      return tag('path', {
        class: cls,
        d: polylinePath(
          points.map((p) => paper.p(p)),
          close,
        ),
      });
    },
    segments(list, cls) {
      if (list.length === 0) return '';
      const d = list
        .map(([a, b]) => {
          const [ax, ay] = paper.p(a);
          const [bx, by] = paper.p(b);
          return `M ${num(ax)} ${num(ay)} L ${num(bx)} ${num(by)}`;
        })
        .join(' ');
      return tag('path', { class: cls, d });
    },
  };
}

const rectPoly = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

/** Nét đôi gần nhau hơn ngưỡng này trên giấy thì gộp — không vẽ nét trong. */
function visible(cm: number, paper: Paper, detail: FacadeDetail): boolean {
  return paper.len(cm) >= detail.hatch.minGap;
}

// ── Vật liệu ───────────────────────────────────────────────────────────────────────────

export interface Look {
  hatch: HatchKind;
  /** Độ xám tô đặc — chỉ lớp sơn đủ tối. */
  grey: string | null;
}

const NO_LOOK: Look = { hatch: 'none', grey: null };

/** Ký hiệu của một vật liệu đã chọn: kiểu nét theo mã vật liệu, độ xám theo mã màu. */
export function lookOf(
  material: Pick<FacadeMaterial, 'material' | 'colour'> | null | undefined,
  detail: FacadeDetail,
  vocab: FacadeVocabulary,
): Look {
  if (!material) return NO_LOOK;
  const hatch = detail.materialHatch[material.material] ?? 'none';
  const hex = vocab.colours[material.colour]?.hex;
  const grey = hatch === 'paint' && hex ? paintGrey(hex, detail) : null;
  return { hatch, grey };
}

/** Vật liệu của vùng đầu tiên có trong ý tưởng, theo thứ tự `zones`. */
export function materialFor(
  concept: AiFacadeConcept,
  zones: readonly string[],
): FacadeMaterial | undefined {
  for (const zone of zones) {
    const hit = concept.materials.find((m) => m.where === zone);
    if (hit) return hit;
  }
  return undefined;
}

/** Vật liệu của một mảng trang trí: `material_ref` trỏ vào `materials`, rỗng thì thân nhà. */
export function elementMaterial(
  concept: AiFacadeConcept,
  element: FacadeElement,
): FacadeMaterial | undefined {
  const ref = element.material_ref;
  if (ref !== null && ref !== undefined) return concept.materials[ref];
  return materialFor(concept, ['body']);
}

/** Mảng có vật liệu: tô xám (nếu có) rồi nét ký hiệu (nếu có). Không viền — viền do nơi gọi vẽ. */
export function surface(poly: readonly Pt[], look: Look, pen: Pen, detail: FacadeDetail): string {
  return [
    look.grey ? toneFill(poly, look.grey, pen.paper) : '',
    look.hatch === 'paint' || look.hatch === 'glass' || look.hatch === 'none'
      ? ''
      : hatchSvg(poly, look.hatch, pen.paper, detail),
  ].join('');
}

// ── Dải sàn, phào, tường chắn mái ──────────────────────────────────────────────────────

/**
 * Dải dầm ngay dưới cốt sàn và phào ngay trên cốt sàn (M5: 400 + phào 100×50 đua 50). Dải dầm là hai
 * nét ngang, cắt chỗ lỗ mở nào cao vượt lên dải; phào là một băng đua ra hai đầu, che nét bao tường.
 *
 * `skipCornice` — mô hình đã đặt phào riêng ở đúng cao độ này: phào mô hình THAY phào mặc định.
 */
export function floorBand(
  z: number,
  x0: number,
  x1: number,
  openings: ReadonlyArray<{ x: number; w: number; base: number; top: number }>,
  withCornice: boolean,
  look: Look,
  pen: Pen,
  detail: FacadeDetail,
): string {
  const fb = detail.floorBand;
  const out: string[] = [];
  const bandZ = z - fb.bandCm;
  // Nét dưới của dải dầm, trừ chỗ lỗ mở đâm lên.
  const cuts = openings
    // Chỉ lỗ mở của tầng NGAY DƯỚI sàn này mà đỉnh đâm lên dải — cửa tầng trên đứng trên sàn.
    .filter((o) => o.top > bandZ + 0.5 && o.base < z)
    .map((o) => [o.x, o.x + o.w] as const)
    .sort((a, b) => a[0] - b[0]);
  const runs: Array<[number, number]> = [];
  let from = x0;
  for (const [a, b] of cuts) {
    if (a > from) runs.push([from, Math.min(a, x1)]);
    from = Math.max(from, b);
  }
  if (from < x1) runs.push([from, x1]);
  out.push(
    pen.segments(
      runs.filter(([a, b]) => b - a > 0.5).map(([a, b]) => [[a, bandZ] as Pt, [b, bandZ] as Pt]),
      CLS.detail,
    ),
  );
  if (withCornice)
    out.push(cornice(z, z + fb.corniceHCm, x0, x1, fb.corniceProjectionCm, look, pen, detail));
  return out.join('');
}

/** Băng phào đua `projection` ra hai đầu: che màu giấy, tô theo vật liệu, viền và một nét gờ giữa. */
export function cornice(
  z0: number,
  z1: number,
  x0: number,
  x1: number,
  projection: number,
  look: Look,
  pen: Pen,
  detail: FacadeDetail,
): string {
  const a = x0 - projection;
  const b = x1 + projection;
  const out = [
    pen.rect(a, z0, b, z1, CLS.mask),
    surface(rectPoly(a, z0, b, z1), look, pen, detail),
    pen.rect(a, z0, b, z1, CLS.detail),
  ];
  const mid = (z0 + z1) / 2;
  if (visible((z1 - z0) / 2, pen.paper, detail)) {
    out.push(
      pen.path(
        [
          [a, mid],
          [b, mid],
        ],
        CLS.detail,
      ),
    );
  }
  return out.join('');
}

/** Tường chắn mái: tô theo vật liệu, viền đậm, phào đỉnh đua ra hai bên. */
export function parapetShape(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  look: Look,
  pen: Pen,
  detail: FacadeDetail,
): string {
  const p = detail.parapet;
  const copingZ = Math.max(z0, z1 - p.copingHCm);
  return [
    surface(rectPoly(x0, z0, x1, copingZ), look, pen, detail),
    pen.rect(x0, z0, x1, z1, CLS.elevationOutline),
    cornice(copingZ, z1, x0, x1, p.copingProjectionCm, NO_LOOK, pen, detail),
  ].join('');
}

// ── Lỗ mở ──────────────────────────────────────────────────────────────────────────────

/** Một ô cánh: khung cánh, nẹp góc 45°, kính xiên — hoặc ô đặc (cửa gỗ). */
function leaf(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  sash: number,
  solid: Look | null,
  pen: Pen,
  detail: FacadeDetail,
): string {
  const out = [pen.rect(x0, z0, x1, z1, CLS.detail)];
  const s = Math.min(sash, (x1 - x0) / 3, (z1 - z0) / 3);
  const gx0 = x0 + s;
  const gx1 = x1 - s;
  const gz0 = z0 + s;
  const gz1 = z1 - s;
  if (s > 0 && visible(s, pen.paper, detail)) {
    out.push(pen.rect(gx0, gz0, gx1, gz1, CLS.detail));
    // Nẹp cắt góc 45° — bốn nét nối góc cánh với góc ô kính.
    out.push(
      pen.segments(
        [
          [
            [x0, z0],
            [gx0, gz0],
          ],
          [
            [x1, z0],
            [gx1, gz0],
          ],
          [
            [x1, z1],
            [gx1, gz1],
          ],
          [
            [x0, z1],
            [gx0, gz1],
          ],
        ],
        CLS.detail,
      ),
    );
  }
  if (solid) out.push(surface(rectPoly(gx0, gz0, gx1, gz1), solid, pen, detail));
  else out.push(glassStrokes(gx0, gz0, gx1, gz1, pen.paper, detail));
  return out.join('');
}

/** Chia `[a, b]` thành `n` ô đều. */
function split(a: number, b: number, n: number): Array<[number, number]> {
  const w = (b - a) / n;
  return Array.from({ length: n }, (_, i) => [a + w * i, a + w * (i + 1)] as [number, number]);
}

export function windowShape(o: Opening, base: number, pen: Pen, detail: FacadeDetail): string {
  const wd = detail.window;
  const x0 = o.x;
  const x1 = o.x + o.w;
  const z0 = base;
  const z1 = base + o.h;
  const out = [pen.rect(x0, z0, x1, z1, CLS.mask), pen.rect(x0, z0, x1, z1, CLS.opening)];
  const f = visible(wd.frameCm, pen.paper, detail) ? Math.min(wd.frameCm, o.w / 4, o.h / 4) : 0;
  const ix0 = x0 + f;
  const ix1 = x1 - f;
  const iz0 = z0 + f;
  let iz1 = z1 - f;
  if (f > 0) out.push(pen.rect(ix0, iz0, ix1, iz1, CLS.detail));

  // Ô kính cố định phía trên — chỉ khi kb bật và cửa đủ cao.
  if (wd.topFixed && o.h > wd.topFixedHCm * 2) {
    const t = iz1 - wd.topFixedHCm;
    out.push(
      pen.path(
        [
          [ix0, t],
          [ix1, t],
        ],
        CLS.detail,
      ),
    );
    out.push(glassStrokes(ix0, t, ix1, iz1, pen.paper, detail));
    iz1 = t;
  }
  const n = o.w >= wd.multiLeafFromCm ? Math.max(2, Math.round(o.w / wd.leafTargetCm)) : 1;
  for (const [a, b] of split(ix0, ix1, n)) {
    out.push(leaf(a, iz0, b, iz1, wd.sashCm, null, pen, detail));
  }
  return out.join('');
}

export function doorShape(
  o: Opening,
  base: number,
  leaves: DoorLeaves | null,
  solid: Look | null,
  pen: Pen,
  detail: FacadeDetail,
): string {
  const dd = detail.door;
  const x0 = o.x;
  const x1 = o.x + o.w;
  const z0 = base;
  const z1 = base + o.h;
  const out = [pen.rect(x0, z0, x1, z1, CLS.mask), pen.rect(x0, z0, x1, z1, CLS.opening)];
  // Cửa đi không có khung dưới: khung trong chạy xuống tận ngưỡng.
  const f = visible(dd.frameCm, pen.paper, detail) ? Math.min(dd.frameCm, o.w / 6) : 0;
  const ix0 = x0 + f;
  const ix1 = x1 - f;
  const iz1 = z1 - f;
  if (f > 0) {
    out.push(
      pen.path(
        [
          [ix0, z0],
          [ix0, iz1],
          [ix1, iz1],
          [ix1, z0],
        ],
        CLS.detail,
      ),
    );
  }
  if (o.kind !== 'door') return out.join('');

  const style: DoorLeaves = leaves ?? (o.w >= dd.twoLeafFromCm ? 2 : 1);
  let cells: Array<[number, number]>;
  if (style === 'sliding') {
    const at = ix0 + (ix1 - ix0) * dd.slidingSplitShare;
    const overlap = Math.min(dd.stileCm, (ix1 - ix0) / 10);
    cells = [
      [ix0, at],
      [at - overlap, ix1],
    ];
  } else {
    cells = split(ix0, ix1, style === 'folding' ? dd.foldingPanels : style);
  }
  for (const [a, b] of cells) out.push(leaf(a, z0, b, iz1, dd.stileCm, solid, pen, detail));

  // Tay nắm: ở mép giữa hai cánh giữa, hoặc mép phải của cửa một cánh.
  const meet =
    cells.length >= 2
      ? (cells[Math.floor(cells.length / 2) - 1]?.[1] ?? ix1)
      : ix1 - dd.stileCm / 2;
  const hz = Math.min(z0 + dd.handleZCm, iz1 - dd.handleHCm);
  const handles: Array<[number, number]> =
    cells.length >= 2
      ? [
          [meet - dd.stileCm / 2 - dd.handleWCm / 2, meet - dd.stileCm / 2 + dd.handleWCm / 2],
          [meet + dd.stileCm / 2 - dd.handleWCm / 2, meet + dd.stileCm / 2 + dd.handleWCm / 2],
        ]
      : [[meet - dd.handleWCm / 2, meet + dd.handleWCm / 2]];
  for (const [a, b] of handles) out.push(pen.rect(a, hz, b, hz + dd.handleHCm, CLS.detail));
  return out.join('');
}

/** Phào bo quanh cửa chính — chữ U úp ngược, hở chân (M5: 100×50). */
export function doorSurround(o: Opening, base: number, pen: Pen, detail: FacadeDetail): string {
  const s = detail.door.surroundCm;
  const x0 = o.x - s;
  const x1 = o.x + o.w + s;
  const top = base + o.h + s;
  return pen.path(
    [
      [x0, base],
      [x0, top],
      [x1, top],
      [x1, base],
    ],
    CLS.detail,
  );
}

export function garageShape(
  o: Opening,
  base: number,
  garage: string | null,
  pen: Pen,
  detail: FacadeDetail,
): string {
  const g = detail.garage;
  const x0 = o.x;
  const x1 = o.x + o.w;
  const z1 = base + o.h;
  const out = [pen.rect(x0, base, x1, z1, CLS.mask), pen.rect(x0, base, x1, z1, CLS.opening)];
  const f = visible(g.frameCm, pen.paper, detail) ? Math.min(g.frameCm, o.w / 6) : 0;
  const ix0 = x0 + f;
  const ix1 = x1 - f;
  const iz1 = z1 - f;
  if (f > 0) {
    out.push(
      pen.path(
        [
          [ix0, base],
          [ix0, iz1],
          [ix1, iz1],
          [ix1, base],
        ],
        CLS.detail,
      ),
    );
  }
  const verticals = (n: number) =>
    pen.segments(
      split(ix0, ix1, n)
        .slice(1)
        .map(([a]) => [[a, base] as Pt, [a, iz1] as Pt]),
      CLS.doorLeaf,
    );
  if (garage === 'xep') out.push(verticals(g.foldingPanels));
  else if (garage === 'mo_quay' || garage === 'truot') out.push(verticals(2));
  else {
    // Cửa cuốn: nan ngang theo bước kb; khoang trên cùng là hộp cuốn.
    const slats: Array<[Pt, Pt]> = [];
    for (let z = base + g.shutterSlatCm; z < iz1 - g.shutterSlatCm / 2; z += g.shutterSlatCm) {
      slats.push([
        [ix0, z],
        [ix1, z],
      ]);
    }
    out.push(pen.segments(slats, CLS.doorLeaf));
  }
  return out.join('');
}

// ── Lan can ────────────────────────────────────────────────────────────────────────────

export function railingDrawOf(code: string | null | undefined, detail: FacadeDetail): RailingDraw {
  return (code ? detail.railing.draw[code] : undefined) ?? detail.railing.defaultDraw;
}

/**
 * Lan can một ban công: trụ ở hai đầu và cách nhau không quá `post_max_spacing_mm`, tay vịn, thanh
 * dưới, rồi ruột theo kiểu — nan đứng (M5 «LAN CAN 1»: nan 20 bước 120), kính, con tiện, xây đặc.
 */
export function railingShape(
  b: Balcony,
  z: number,
  h: number,
  pen: Pen,
  detail: FacadeDetail,
): string {
  const r = detail.railing;
  const kind = railingDrawOf(b.railing, detail);
  const x0 = b.x0;
  const x1 = b.x1;
  const top = z + h;
  if (x1 - x0 <= 0 || h <= 0) return '';
  const out: string[] = [];

  if (kind === 'solid') {
    out.push(pen.rect(x0, z, x1, top, CLS.mask));
    out.push(pen.rect(x0, z, x1, top, CLS.railing));
    out.push(
      pen.path(
        [
          [x0, top - r.handrailCm],
          [x1, top - r.handrailCm],
        ],
        CLS.detail,
      ),
    );
    return out.join('');
  }

  const handZ = top - r.handrailCm;
  const railZ0 = z + r.bottomGapCm;
  const railZ1 = railZ0 + r.railCm;
  const bays = Math.max(1, Math.ceil((x1 - x0 - r.postCm) / r.postMaxSpacingCm));
  const posts = Array.from(
    { length: bays + 1 },
    (_, i) => x0 + r.postCm / 2 + ((x1 - x0 - r.postCm) * i) / bays,
  );

  // Tay vịn và thanh dưới chạy suốt.
  out.push(pen.rect(x0, handZ, x1, top, CLS.railing));
  if (kind !== 'glass') out.push(pen.rect(x0, railZ0, x1, railZ1, CLS.detail));
  for (const c of posts)
    out.push(pen.rect(c - r.postCm / 2, z, c + r.postCm / 2, handZ, CLS.railing));

  for (let i = 0; i + 1 < posts.length; i += 1) {
    const a = posts[i]! + r.postCm / 2;
    const c = posts[i + 1]! - r.postCm / 2;
    if (c - a <= 0) continue;
    if (kind === 'glass') {
      const inset = Math.min(1, (c - a) / 10);
      out.push(pen.rect(a + inset, railZ0, c - inset, handZ - inset, CLS.detail));
      out.push(glassStrokes(a + inset, railZ0, c - inset, handZ - inset, pen.paper, detail));
      continue;
    }
    const spec = kind === 'turned' ? r.turned : kind === 'ornamental' ? r.ornamental : r.balusters;
    const count = Math.floor((c - a) / spec.pitchCm);
    if (count <= 0) continue;
    // Căn giữa nhịp: khe hai đầu bằng nhau.
    const start = a + (c - a - (count - 1) * spec.pitchCm) / 2;
    const thin = !visible(spec.widthCm, pen.paper, detail);
    const bars: Array<[Pt, Pt]> = [];
    for (let k = 0; k < count; k += 1) {
      const cx = start + k * spec.pitchCm;
      if (thin) {
        bars.push([
          [cx, railZ1],
          [cx, handZ],
        ]);
      } else {
        out.push(pen.rect(cx - spec.widthCm / 2, railZ1, cx + spec.widthCm / 2, handZ, CLS.detail));
      }
      if (kind === 'turned') {
        // Con tiện: hai vạch thắt ở giữa thân.
        const mid = (railZ1 + handZ) / 2;
        bars.push(
          [
            [cx - spec.widthCm / 2, mid - spec.widthCm / 3],
            [cx + spec.widthCm / 2, mid - spec.widthCm / 3],
          ],
          [
            [cx - spec.widthCm / 2, mid + spec.widthCm / 3],
            [cx + spec.widthCm / 2, mid + spec.widthCm / 3],
          ],
        );
      }
    }
    out.push(pen.segments(bars, CLS.detail));
    if (kind === 'ornamental') {
      // Sắt mỹ thuật: dải hoa văn giữa — hai thanh ngang và vòng tròn trong mỗi khe nan.
      const mid = (railZ1 + handZ) / 2;
      const band = spec.pitchCm / 2;
      out.push(pen.rect(a, mid - band / 2, c, mid + band / 2, CLS.detail));
      for (let k = 0; k + 1 < count; k += 1) {
        const [cx, cy] = pen.paper.p([start + (k + 0.5) * spec.pitchCm, mid]);
        out.push(tag('circle', { cx, cy, r: pen.paper.len(band / 2.4), class: CLS.detail }));
      }
    }
  }
  return out.join('');
}

// ── Mảng trang trí mô hình chọn ────────────────────────────────────────────────────────

/**
 * Mảng trang trí vẽ thành CHI TIẾT theo loại (Haan chốt «kết hợp», 10/10/2026): phào có gờ, ron là
 * dãy rãnh, lam là dãy nan, cột có đầu và chân, ô văng có nét đáy — không còn là hình chữ nhật tô nhạt.
 * Vòm, ô tròn, mái sảnh giữ hình riêng của T63. Mô hình vẫn chỉ khai khung bao (T15).
 */
export function elementShape(
  element: FacadeElement,
  look: Look,
  pen: Pen,
  detail: FacadeDetail,
): string {
  const [x0 = 0, z0 = 0, x1 = 0, z1 = 0] = element.rect;
  const w = x1 - x0;
  const h = z1 - z0;
  if (w <= 0 || h <= 0) return '';
  const paper = pen.paper;
  const e = detail.elements;
  const box = rectPoly(x0, z0, x1, z1);
  const filled = (): string[] => [
    pen.rect(x0, z0, x1, z1, CLS.mask),
    surface(box, look, pen, detail),
    pen.rect(x0, z0, x1, z1, CLS.element),
  ];

  switch (element.kind) {
    case 'arch': {
      // Vòm đầu cửa: bán kính suy từ dây cung `w` và độ vồng `h` (T63). Tâm thấp hơn đỉnh đúng `r`.
      const r = (w * w) / 4 / (2 * h) + h / 2;
      return tag('path', {
        class: CLS.element,
        d: arcPath(
          paper.p([x0, z0]),
          paper.p([x1, z0]),
          paper.p([x0 + w / 2, z1 - r]),
          paper.len(r),
        ),
      });
    }
    case 'oculus': {
      const [cx, cy] = paper.p([(x0 + x1) / 2, (z0 + z1) / 2]);
      const r = paper.len(Math.min(w, h) / 2);
      return [
        tag('circle', { cx, cy, r, class: CLS.element }),
        visible(Math.min(w, h) / 10, paper, detail)
          ? tag('circle', { cx, cy, r: r * 0.8, class: CLS.detail })
          : '',
      ].join('');
    }
    case 'porch_roof':
      return pen.path(
        [
          [x0, z0],
          [x0 + w / 2, z1],
          [x1, z0],
        ],
        CLS.element,
        true,
      );
    case 'cornice': {
      const out = filled();
      const n = e.cornice.profileLines;
      const lines: Array<[Pt, Pt]> = [];
      for (let i = 1; i <= n; i += 1) {
        const z = z0 + (h * i) / (n + 1);
        lines.push([
          [x0, z],
          [x1, z],
        ]);
      }
      if (visible(h / (n + 1), paper, detail)) out.push(pen.segments(lines, CLS.detail));
      return out.join('');
    }
    case 'reveal': {
      // Ron chỉ âm: rãnh đôi NGANG theo bước kb — mọi hồ sơ đo được (M1, M4, M5) đều ron ngang.
      const g = e.reveal.grooveCm;
      const count = Math.max(1, Math.floor(h / e.reveal.pitchCm));
      const lines: Array<[Pt, Pt]> = [];
      for (let i = 0; i < count; i += 1) {
        const c = z0 + (h * (i + 0.5)) / count;
        for (const at of visible(g, paper, detail) ? [c - g / 2, c + g / 2] : [c]) {
          lines.push([
            [x0, at],
            [x1, at],
          ]);
        }
      }
      return pen.segments(lines, CLS.detail);
    }
    case 'louvre': {
      // Lam: nan đặt trước mặt tường / cửa — mỗi nan che màu giấy. Lam đứng khi mảng bè ngang.
      const vertical = w >= h;
      const length = vertical ? w : h;
      const count = Math.max(1, Math.floor(length / e.louvre.pitchCm));
      const fin = Math.min(e.louvre.finCm, length / count);
      const out = [pen.rect(x0, z0, x1, z1, CLS.element)];
      for (let i = 0; i < count; i += 1) {
        const c = (vertical ? x0 : z0) + (length * (i + 0.5)) / count;
        const poly: [number, number, number, number] = vertical
          ? [c - fin / 2, z0, c + fin / 2, z1]
          : [x0, c - fin / 2, x1, c + fin / 2];
        out.push(pen.rect(...poly, CLS.mask));
        out.push(surface(rectPoly(...poly), look, pen, detail));
        out.push(pen.rect(...poly, CLS.detail));
      }
      return out.join('');
    }
    case 'column': {
      const out = filled();
      const cap = Math.min(e.column.capCm, h / 6);
      const base = Math.min(e.column.baseCm, h / 6);
      out.push(pen.rect(x0 - cap / 3, z1 - cap, x1 + cap / 3, z1, CLS.detail));
      out.push(pen.rect(x0 - base / 3, z0, x1 + base / 3, z0 + base, CLS.detail));
      return out.join('');
    }
    case 'canopy': {
      const out = filled();
      const z = z0 + h * e.canopy.soffitShare;
      out.push(
        pen.path(
          [
            [x0, z],
            [x1, z],
          ],
          CLS.detail,
        ),
      );
      return out.join('');
    }
    case 'planter': {
      const out = filled();
      const lip = Math.min(e.planter.lipCm, h / 3);
      out.push(
        pen.path(
          [
            [x0, z1 - lip],
            [x1, z1 - lip],
          ],
          CLS.detail,
        ),
      );
      return out.join('');
    }
    case 'finial': {
      // Chóp: đế chữ nhật một phần ba dưới, thân tam giác phía trên.
      const zb = z0 + h / 3;
      return [
        pen.rect(x0, z0, x1, zb, CLS.element),
        pen.path(
          [
            [x0, zb],
            [x0 + w / 2, z1],
            [x1, zb],
          ],
          CLS.element,
          true,
        ),
      ].join('');
    }
    default:
      return filled().join('');
  }
}

// ── Bậc tam cấp ────────────────────────────────────────────────────────────────────────

export type EntryStep = { rect: number[]; down: string; risers: number };

/**
 * Bậc tam cấp ngoài cửa chính (T70) nhìn từ đường. Bậc đi xuống về phía đường (`-y`) thấy MẶT bậc:
 * mỗi cổ bậc một nét ngang. Bậc đi xuống dọc mặt tiền (`±x`) thấy BIÊN bậc: đường bậc thang.
 */
export function entryStepsShape(step: EntryStep, groundZ: number, pen: Pen): string {
  const [x0 = 0, , x1 = 0] = step.rect;
  const risers = Math.max(1, step.risers);
  const rise = (0 - groundZ) / risers;
  if (!(rise > 0) || x1 <= x0) return '';
  if (step.down === '-y') {
    const lines: Array<[Pt, Pt]> = [];
    for (let i = 1; i < risers; i += 1) {
      const z = groundZ + rise * i;
      lines.push([
        [x0, z],
        [x1, z],
      ]);
    }
    return [
      pen.rect(x0, groundZ, x1, 0, CLS.mask),
      pen.rect(x0, groundZ, x1, 0, CLS.elevationOutline),
      pen.segments(lines, CLS.detail),
    ].join('');
  }
  if (step.down === '+x' || step.down === '-x') {
    const going = (x1 - x0) / risers;
    const pts: Pt[] = [];
    // Từ cửa (cao nhất) xuống sân: `+x` thì cửa ở bên trái.
    const sign = step.down === '+x' ? 1 : -1;
    const start = sign > 0 ? x0 : x1;
    pts.push([start, 0]);
    for (let i = 1; i <= risers; i += 1) {
      const x = start + sign * going * i;
      const zTop = -rise * (i - 1);
      pts.push([x, zTop], [x, zTop - rise]);
    }
    pts.push([start, groundZ]);
    return pen.path(pts, CLS.detail, true);
  }
  return '';
}
