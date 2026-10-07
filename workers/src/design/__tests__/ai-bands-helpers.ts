/**
 * Tiện ích cho phép thử đường dải: bản ghi lượt thật với giếng trời bỏ khỏi mọi tầng — để thử bộ dựng lại tầng 1 khi luật
 * giếng trời thông tầng (T116) không chặn trước nó.
 */
import type { AiHouseBands } from '@nvg/shared/design';

export function withoutLightWell(bands: AiHouseBands): AiHouseBands {
  const keep = (id: string) => !id.startsWith('light_well');
  return {
    ...bands,
    storeys: bands.storeys.map((storey) => ({
      ...storey,
      bands: storey.bands
        .map((band) => ({
          ...band,
          cells: band.cells
            .map((cell) => ({ ...cell, stack: cell.stack.filter((s) => keep(s.id)) }))
            .filter((cell) => (cell.stack.length ? true : keep(cell.id) && cell.id !== '')),
        }))
        .filter((band) => band.cells.length > 0),
    })),
  };
}

const c = (id: string, w = 0) => ({ id, w, stack: [] as { id: string; d: number }[] });
/** Ô xếp chồng — các phòng trước ra sau trong một cột. */
const st = (...ids: string[]) => ({ id: '', w: 0, stack: ids.map((id) => ({ id, d: 0 })) });
const band = (...cells: ReturnType<typeof c>[]) => ({ depth: 0, cells });
/**
 * Bộ dải viết tay nhà ống demo sau handoff sửa lỗi đợt 3 (Haan 07/10/2026, T116 tiếp 17): WC / giặt tầng trên không đè
 * phòng ở (WC RIÊNG được đè khách / ăn), «lấy sáng» ưu tiên → phòng ngủ chính mỗi tầng, làm việc, thờ phải có mặt
 * thoáng. Giếng trời GIỮA nhà, cột phải (đầu thang ở bên trái phải chạm hành lang); WC riêng đứng cạnh phòng ngủ trên gara
 * / chồng nhau; WC chung tầng 1 → 2 → 3 → 4 một trục ở dải giếng (nhóm E qua sàn — T116 tiếp 18); tầng 4 thờ + giặt ở mặt
 * tiền, sân thượng sau nhà như đầu bài. Đầu bài demo đã sửa (`withDemoAreas`): phòng ngủ chính 16 m², phòng ngủ con tầng 3 / tầng 4 10 m².
 */
export const NHAONG_BANDS: AiHouseBands = {
  variant_label: 'Nhà ống thang sau, giếng trời giữa nhà',
  parti: 'Hành lang 0,9 m dọc tường trái ở tầng trên; giếng trời giữa nhà cột phải; thang sau nhà.',
  rationale: 'Gara mặt tiền là lối vào; khách sau gara; bếp cạnh giếng trời, phòng ăn cạnh thang.',
  design_notes: [],
  assumptions: [],
  storeys: [
    {
      level: '1',
      bands: [
        band(c('garage_1')),
        band(c('living_1')),
        band(c('kitchen_1'), c('wc_1', 1200), c('light_well_1', 1200)),
        band(c('THANG'), c('dining_1')),
      ],
    },
    {
      level: '2',
      bands: [
        band(c('ngu_ob'), c('wc_ngu_ob', 1200)),
        band(c('gt_2', 900), c('study_1')),
        band(c('gt_3'), c('wc_2', 1200), c('LW', 1200)),
        band(c('THANG'), c('gt_4')),
      ],
    },
    {
      level: '3',
      bands: [
        band(c('ngu_vc'), c('wc_ngu_vc', 1200)),
        band(c('gt_6', 900), c('ngu_con_1')),
        band(c('gt_7'), c('wc_4', 1200), c('LW', 1200)),
        band(c('THANG'), c('gt_8')),
      ],
    },
    {
      level: '4',
      bands: [
        band(c('altar_room_1'), c('laundry_1', 1200)),
        band(c('gt_9')),
        band(c('gt_10', 900), c('ngu_con_2')),
        band(c('gt_11'), c('wc_3', 1200), c('LW', 1200)),
        band(c('THANG'), c('terrace_1')),
      ],
    },
  ],
  doors_prefer: [],
  cantilevers: [{ id: 'bc_ngu_vc', from_room: 'ngu_vc', face: 'front', depth: 900 }],
  entry_room: 'garage_1',
  garage_room: 'garage_1',
};

/** Đầu bài demo đã sửa cho vừa luật đợt 3 (Haan đồng ý 07/10/2026): phòng ngủ chính 16 m², phòng ngủ con tầng 3 / 4 10 m². */
export function withDemoAreas<T extends { required_spaces?: unknown }>(digest: T): T {
  const spaces = (digest.required_spaces ?? []) as {
    type: string;
    floor: number | null;
    area_m2: number | null;
  }[];
  return {
    ...digest,
    required_spaces: spaces.map((space) =>
      space.type === 'master_bedroom'
        ? { ...space, area_m2: 16 }
        : space.type === 'bedroom' && (space.floor === 3 || space.floor === 4)
          ? { ...space, area_m2: 10 }
          : space,
    ),
  };
}

/** Bộ dải viết tay trước handoff đợt 3 (thang sau, giếng trời trong ô cạnh thang) — luật WC / mặt thoáng mới bác nó. */
export const NHAONG_BANDS_T2: AiHouseBands = {
  variant_label: 'Nhà ống thang sau, giếng trời cạnh thang',
  parti: 'Hành lang 0,9 m dọc tường trái ở tầng trên; thang sau nhà cạnh giếng trời thông tầng.',
  rationale: 'Gara mặt tiền là lối vào; khách sau gara; bếp ăn trước thang, giếng trời cuối nhà.',
  design_notes: [],
  assumptions: [],
  storeys: [
    {
      level: '1',
      bands: [
        band(c('garage_1')),
        band(c('living_1')),
        band(c('kitchen_1'), c('dining_1')),
        band(c('THANG'), st('wc_1', 'light_well_1')),
      ],
    },
    {
      level: '2',
      bands: [
        band(c('gt_1', 900), st('ngu_ob', 'wc_ngu_ob')),
        band(c('gt_2', 900), c('study_1')),
        // Sảnh ngang trước đầu ngắn ô thang — bậc 1 và chỗ bước ra giáp lối đi (T116, Haan chấm lượt a68c50bb).
        band(c('gt_3')),
        band(c('THANG'), st('wc_2', 'light_well_1')),
      ],
    },
    {
      level: '3',
      bands: [
        band(c('gt_4', 900), st('ngu_vc', 'wc_ngu_vc')),
        band(c('gt_5', 900), c('ngu_con_1')),
        band(c('gt_6')),
        band(c('THANG'), st('kho_3', 'light_well_1')),
      ],
    },
    {
      level: '4',
      bands: [
        band(c('terrace_1')),
        band(c('gt_7', 900), c('laundry_1')),
        band(c('gt_8', 900), c('altar_room_1')),
        band(c('gt_9', 900), c('ngu_con_2')),
        band(c('gt_10')),
        band(c('THANG'), st('wc_3', 'light_well_1')),
      ],
    },
    {
      level: 'roof',
      bands: [
        band(c('drying_yard')),
        band(c('terrace')),
        band(c('ac_yard', 900), c('gt_11')),
        band(c('THANG'), st('tank_solar', 'light_well_1')),
      ],
    },
  ],
  doors_prefer: [],
  cantilevers: [{ id: 'bc_ngu_vc', from_room: 'ngu_vc', face: 'front', depth: 900 }],
  entry_room: 'garage_1',
  garage_room: 'garage_1',
};
/** Đổi mã một phòng (cả trong ô xếp chồng) ở một tầng. */
export const swapRoom = (
  bands: AiHouseBands,
  level: string,
  from: string,
  to: string,
): AiHouseBands => ({
  ...bands,
  storeys: bands.storeys.map((storey) =>
    storey.level !== level
      ? storey
      : {
          ...storey,
          bands: storey.bands.map((b) => ({
            ...b,
            cells: b.cells.map((cell) =>
              cell.id === from
                ? { ...cell, id: to }
                : { ...cell, stack: cell.stack.map((s) => (s.id === from ? { ...s, id: to } : s)) },
            ),
          })),
        },
  ),
});

/**
 * Bộ dải viết tay nhà ống demo TRƯỚC bảng cạnh KTS (thang giữa nhà, hành lang 0,9 m cạnh thang, giếng trời cạnh thang) —
 * qua cổng với `preKtsSides`. Tầng 1 vào được CẢ HAI đầu thang (khách phía trước, bếp phía sau), tầng trên chỉ có sảnh ở
 * đầu trước — để kiểm chọn đầu thang tầng 1 theo cả nhà (`preferredSide`, M156).
 */
const cc = (id: string, w = 0) => ({ id, w, stack: [] as { id: string; d: number }[] });
const bb = (...cells: ReturnType<typeof cc>[]) => ({ depth: 0, cells });
export const NHAONG_BANDS_PRE_KTS: AiHouseBands = {
  ...NHAONG_BANDS_T2,
  storeys: [
    {
      level: '1',
      bands: [
        bb(cc('garage_1')),
        bb(cc('living_1')),
        bb(cc('gt_1', 900), cc('THANG'), {
          id: '',
          w: 1300,
          stack: [
            { id: 'wc_1', d: 0 },
            { id: 'light_well_1', d: 0 },
          ],
        }),
        bb(cc('kitchen_1'), cc('dining_1')),
      ],
    },
    {
      level: '2',
      bands: [
        bb(cc('gt_2', 900), {
          id: '',
          w: 0,
          stack: [
            { id: 'ngu_ob', d: 0 },
            { id: 'wc_ngu_ob', d: 0 },
          ],
        }),
        bb(cc('gt_4', 2400), cc('wc_2')),
        bb(cc('gt_3', 900), cc('THANG'), cc('.')),
        bb(cc('gt_12', 900), cc('study_1')),
      ],
    },
    {
      level: '3',
      bands: [
        bb(cc('gt_5', 900), {
          id: '',
          w: 0,
          stack: [
            { id: 'ngu_vc', d: 0 },
            { id: 'wc_ngu_vc', d: 0 },
          ],
        }),
        bb(cc('gt_13')),
        bb(cc('gt_6', 900), cc('THANG'), cc('.')),
        bb(cc('gt_7', 900), cc('ngu_con_1')),
      ],
    },
    {
      level: '4',
      bands: [
        bb(cc('gt_8', 900), cc('altar_room_1')),
        bb(cc('gt_10', 900), cc('ngu_con_2')),
        bb(cc('gt_14')),
        bb(cc('gt_9', 900), cc('THANG'), cc('.')),
        bb(cc('gt_11', 900), cc('wc_3'), cc('laundry_1')),
        { depth: 1500, cells: [cc('terrace_1')] },
      ],
    },
  ],
};
