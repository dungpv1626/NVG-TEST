/**
 * KHUNG mặt đứng dựng THẲNG TỪ ĐẦU BÀI, khi chưa có phương án mặt bằng (B3 «bộ ý tưởng cho khách»,
 * anh Dũng đồng ý 30/10/2026, `doc/design/KE_HOACH_BO_Y_TUONG_KHACH.md`).
 *
 * Cùng kiểu `FacadeFrame` với khung suy từ mặt bằng (`frame.ts`), nên đề xuất, ghép, kiểm, tờ vẽ và ảnh mặt
 * đứng dùng nguyên — chỉ nguồn của khung khác. Khung này là PHƯƠNG ÁN Ý TƯỞNG: không có mặt bằng thì không có
 * tường thật để biết cửa nằm đâu, nên lỗ mở xếp theo NẾP từng tầng:
 *
 *  · bề ngang = ô xây được của thửa trừ khoảng lùi / sân đầu bài khai (`buildableFromDigest`, một nguồn với
 *    mặt bằng AI) — toạ độ cùng hệ thửa với mặt bằng, gốc góc trước-trái;
 *  · số tầng = `floors` của đầu bài; chiều cao tầng theo `kb/construction_norms.yaml` `levels` (tầng trên cùng
 *    dùng `top_storey_height_m`, cùng phép với bộ dựng mặt bằng);
 *  · mặt tiền chia KHOANG đều (`facade.from_brief.bay_width_m`), mỗi khoang một lỗ mở;
 *  · tầng 1: cửa để xe khi đầu bài có ô tô và lối xe ở mặt tiền; cửa chính khi lối vào ở mặt tiền (nhà một
 *    khoang có ô tô thì đi vào qua gara, T165); khoang còn lại cửa sổ;
 *  · tầng trên: đầu bài BẮT BUỘC ban công mặt tiền thì mỗi tầng một dải ban công suốt bề ngang (T182) và mỗi
 *    khoang một cửa ra ban công; không thì cửa sổ;
 *  · sân trước có hay không theo khoảng lùi trước.
 *
 * Cỡ lỗ mở lấy ở `openings.entrance` / `openings.window` (tỉ lệ đoạn tường kẹp trong hai cận đo được) — không số
 * nào viết ở đây. Chỉ suy từ câu ĐÃ trả lời: lối vào chưa khai thì coi là mặt tiền (đầu bài mặc định đường ở
 * phía trước, hợp đồng `design-brief`); số xe chưa khai thì không vẽ gara.
 *
 * Giới hạn đã biết và nói ra trên màn hình: mặt đứng này không khớp một mặt bằng nào. Có mặt bằng thì dựng lại
 * mặt đứng từ mặt bằng (`facadeFrame`).
 */

import { balconySides, type AiBriefDigest, type AiFacadeBrief } from '@nvg/shared/design';
import type { ConstructionNorms, OpeningNorm } from '../../kb/construction';
import { buildableFromDigest } from '../buildable';
import {
  FacadeFrameError,
  withBriefDoorHeights,
  type FacadeBalcony,
  type FacadeFrame,
  type FacadeLevel,
  type FacadeOpening,
} from './frame';

const cm = (metres: number) => Math.round(metres * 100);
/** Về lưới nửa centimet của hợp đồng. */
const half = (value: number) => Math.round(value * 2) / 2;

interface Bay {
  x0: number;
  x1: number;
}

export function facadeFrameFromBrief(
  digest: AiBriefDigest,
  norms: ConstructionNorms,
  brief: AiFacadeBrief | null = null,
): FacadeFrame {
  const facade = norms.facade;
  if (!facade) {
    throw new FacadeFrameError('Thiếu mục "facade" trong kb/construction_norms.yaml.');
  }
  const rules = facade.from_brief;
  if (!rules) {
    throw new FacadeFrameError(
      'Thiếu mục "facade.from_brief" trong kb/construction_norms.yaml — chưa dựng được mặt đứng khi chưa có mặt bằng.',
    );
  }
  const entrance = norms.openings.entrance;
  const window = norms.openings.window;
  if (entrance?.height_m === undefined || entrance.width_m === undefined) {
    throw new FacadeFrameError(
      'Quy cách cửa chính ("openings.entrance") thiếu bề rộng hoặc chiều cao.',
    );
  }
  if (window?.height_m === undefined || window.sill_m === undefined) {
    throw new FacadeFrameError(
      'Quy cách cửa sổ ("openings.window") thiếu cao độ bệ hoặc chiều cao.',
    );
  }

  const box = buildableFromDigest(digest);
  if (!(box.widthM > 0) || !(box.depthM > 0)) {
    throw new FacadeFrameError(
      'Đầu bài không còn phần đất xây được sau khoảng lùi và sân — sửa kích thước thửa hoặc khoảng lùi trong đầu bài.',
    );
  }
  const x0 = half(cm(box.x0));
  const x1 = half(cm(box.x1));
  const width = half(x1 - x0);

  // Tầng và cao độ — cùng phép với bộ dựng mặt bằng (`tree/index.ts`): tầng trên cùng cao `top_storey_height_m`.
  const floors = Math.max(1, Math.floor(digest.floors));
  const levels: FacadeLevel[] = [];
  let z = 0;
  for (let level = 1; level <= floors; level += 1) {
    const h = cm(
      level === floors ? norms.levels.top_storey_height_m : norms.levels.storey_height_m,
    );
    levels.push({ level, z: half(z), h, x0, x1 });
    z += h;
  }

  const bays = baysOf(x0, width, cm(rules.bay_width_m));
  const margin = cm(rules.edge_margin_m);

  const mainSide = digest.site.main_entrance_side ?? 'front';
  const vehicleSide = digest.site.vehicle_entrance_side ?? mainSide;
  const garage = (digest.parking?.cars ?? 0) > 0 && vehicleSide === 'front';
  const mainDoor = mainSide === 'front';

  const frontBalcony =
    digest.balconies?.scope !== 'khong_co' &&
    balconySides(digest.balconies).required.includes('front');

  const openings: FacadeOpening[] = [];
  const balconies: FacadeBalcony[] = [];

  // ── Tầng 1 ──────────────────────────────────────────────────────────────────────────
  const garageBay = garage ? 0 : -1;
  // Nhà một khoang có ô tô: cửa để xe chiếm cả mặt tiền, người vào qua gara (T165) — không vẽ thêm cửa chính.
  const mainBay = !mainDoor
    ? -1
    : garage
      ? bays.length > 1
        ? 1
        : -1
      : Math.floor((bays.length - 1) / 2);
  bays.forEach((bay, index) => {
    if (index === garageBay) {
      const w = sized(entrance, bay, margin, entrance.max_width_m);
      if (w) openings.push(centred(1, bay, w, 0, cm(entrance.height_m!), 'garage'));
    } else if (index === mainBay) {
      const w = fixed(cm(entrance.width_m!), bay, margin);
      if (w) openings.push(centred(1, bay, w, 0, cm(entrance.height_m!), 'door'));
    } else {
      const w = sized(window, bay, margin, window.max_width_m, window.min_width_m);
      if (w) openings.push(centred(1, bay, w, cm(window.sill_m!), cm(window.height_m!), 'window'));
    }
  });

  // ── Tầng trên ───────────────────────────────────────────────────────────────────────
  for (let level = 2; level <= floors; level += 1) {
    if (frontBalcony) {
      // Ban công chính suốt mặt tiền (T182); độ đua không đổi hình chiếu đứng — chỉ bề ngang lan can.
      balconies.push({ level, x0, x1, depth: 0, railing: null });
      for (const bay of bays) {
        const w = fixed(cm(entrance.width_m!), bay, margin);
        if (w) openings.push(centred(level, bay, w, 0, cm(entrance.height_m!), 'door'));
      }
      continue;
    }
    for (const bay of bays) {
      const w = sized(window, bay, margin, window.max_width_m, window.min_width_m);
      if (w) {
        openings.push(centred(level, bay, w, cm(window.sill_m!), cm(window.height_m!), 'window'));
      }
    }
  }

  const raise =
    brief?.ground_raise_cm ??
    (typeof digest.entrance?.floor_above_road_m === 'number'
      ? cm(digest.entrance.floor_above_road_m)
      : cm(facade.ground_floor_raise_m));

  return {
    x0,
    x1,
    width,
    groundZ: -Math.max(0, raise),
    levels,
    roofZ: half(z),
    parapetDefault: brief?.roof.parapet_cm ?? cm(facade.parapet_height_m),
    openings: withBriefDoorHeights(openings, levels, brief),
    balconies,
    frontYard: box.y0 > 0,
  };
}

/** Chia mặt tiền thành các khoang đều nhau, bề rộng gần `bayCm` nhất. */
function baysOf(x0: number, width: number, bayCm: number): Bay[] {
  const count = Math.max(1, Math.round(width / bayCm));
  const step = width / count;
  return Array.from({ length: count }, (_, i) => ({
    x0: half(x0 + i * step),
    x1: half(x0 + (i + 1) * step),
  }));
}

/** Chỗ trống cho lỗ mở trong một khoang, trừ lề hai bên. */
function room(bay: Bay, margin: number): number {
  return bay.x1 - bay.x0 - 2 * margin;
}

/**
 * Bề rộng theo TỈ LỆ khoang (`share_of_wall`), kẹp giữa cận dưới và cận trên đo được, rồi kẹp vào chỗ trống
 * của khoang. Không vừa cận dưới thì `null` — không vẽ một lỗ mở nhỏ hơn cỡ nhỏ nhất NVG từng làm.
 */
function sized(
  norm: OpeningNorm,
  bay: Bay,
  margin: number,
  maxM: number | undefined,
  minM: number | undefined = norm.width_m,
): number | null {
  const space = room(bay, margin);
  const share = norm.share_of_wall ?? 1;
  let w = (bay.x1 - bay.x0) * share;
  if (typeof minM === 'number') w = Math.max(w, cm(minM));
  if (typeof maxM === 'number') w = Math.min(w, cm(maxM));
  w = Math.min(w, space);
  if (typeof minM === 'number' && w < cm(minM)) return null;
  return w > 0 ? half(w) : null;
}

/** Bề rộng cố định (cửa chính, cửa ra ban công), kẹp vào chỗ trống của khoang; không vừa thì `null`. */
function fixed(w: number, bay: Bay, margin: number): number | null {
  return room(bay, margin) >= w ? w : null;
}

function centred(
  level: number,
  bay: Bay,
  w: number,
  sill: number,
  h: number,
  kind: FacadeOpening['kind'],
): FacadeOpening {
  return { level, x: half((bay.x0 + bay.x1 - w) / 2), w, sill, h, kind };
}
