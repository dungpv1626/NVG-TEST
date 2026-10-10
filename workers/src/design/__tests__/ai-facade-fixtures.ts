/**
 * Ý tưởng mặt đứng VIẾT TAY cho hai mặt bằng mẫu của bộ vẽ (T59) — không lượt gọi mô hình nào.
 *
 * Cùng lý do với `ai-plan-fixtures.ts`: tờ mặt đứng phải được chấm trước khi tiêu một đồng nào cho
 * mô hình, nên mọi chỗ tờ vẽ trông sai là lỗi của bộ vẽ chứ không phải của lượt gọi hôm ấy. Toạ độ
 * mảng trang trí đặt theo khung suy từ chính mặt bằng mẫu (nhà phố rộng 400, biệt thự rộng 1000).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFacadeConcept, AiFacadeProposal, AiFloorPlan } from '@nvg/shared/design';
import { facadeFrame } from '../ai/facade/frame';
import { mergeFacade } from '../ai/facade/merge';
import { parseConstructionNorms } from '../kb/construction';
import { parseFacadeDetail } from '../kb/facade-detail';
import { parseFacadeVocabulary } from '../kb/facade-vocabulary';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

export const norms = parseConstructionNorms(read('kb/construction_norms.yaml'));
export const facadeVocab = parseFacadeVocabulary(read('kb/facade_vocabulary.yaml'));
export const facadeDetailKb = parseFacadeDetail(read('kb/facade_detail.yaml'));
export const outdoor = new Set(
  roomGroups(parseVocabulary(read('kb/room_vocabulary.yaml'))).outdoor ?? [],
);

export const PLAN_REF = `sha256:${'a'.repeat(64)}`;

const GENERATOR: AiFacadeConcept['generator'] = {
  kind: 'ai',
  provider: 'fixture',
  model: 'viet-tay',
  route: 'fixture',
  prompt_version: '0.0.0',
};

/** Nhà phố hiện đại: mái bằng, tường chắn mái, ô văng trên cửa cuốn, lam che tầng 3. */
export const TOWNHOUSE_PROPOSAL: AiFacadeProposal = {
  style: 'hien_dai',
  roof: { type: 'flat', pitch_deg: null, material: 'btct_chong_tham', colour: 'xam_nhat' },
  materials: [
    { where: 'body', material: 'son_nuoc', colour: 'trang_kem', finish: 'sơn mờ' },
    { where: 'base', material: 'da_granite', colour: 'xam_dam', finish: null },
    { where: 'accent', material: 'go_nhua', colour: 'nau_go', finish: null },
    { where: 'railing', material: 'kinh_cuong_luc', colour: 'tu_nhien', finish: null },
  ],
  palette: { primary_hex: '#F1EAD8', secondary_hex: '#4A4D50', accent_hex: '#8A5A3B' },
  gate: null,
  fence: null,
  balcony_railing: 'kinh_cuong_luc',
  parapet: null,
  roof_outline: null,
  elements: [
    { kind: 'canopy', rect: [30, 260, 370, 275], material_ref: 3 },
    { kind: 'cladding', rect: [0, 360, 30, 1110], material_ref: 2 },
    { kind: 'louvre', rect: [30, 900, 400, 1080], material_ref: 2 },
  ],
  rationale: 'Mặt tiền hẹp nên dùng một mảng lam gỗ che nắng tầng trên cùng và dải ốp gỗ bên trái.',
};

/** Biệt thự mái Thái: mái ngói đỏ, hai cột hai bên cửa chính, phào dưới mái. */
export const VILLA_PROPOSAL: AiFacadeProposal = {
  style: 'mai_thai',
  roof: { type: 'thai', pitch_deg: 35, material: 'ngoi_mau', colour: 'do_ngoi' },
  materials: [
    { where: 'body', material: 'son_nuoc', colour: 'trang', finish: null },
    { where: 'base', material: 'da_cham', colour: 'xam_nhat', finish: null },
    { where: 'trim', material: 'phao_chi', colour: 'trang', finish: null },
    { where: 'gate', material: 'sat_my_thuat', colour: 'den', finish: null },
    { where: 'fence', material: 'son_nuoc', colour: 'trang', finish: null },
  ],
  palette: { primary_hex: '#F5F5F2', secondary_hex: '#A8482F', accent_hex: null },
  gate: { type: 'sliding', w: 360, h: 180, material: 'sat_my_thuat', colour: 'den' },
  fence: { h: 160, material: 'son_nuoc', colour: 'trang' },
  balcony_railing: 'con_tien',
  parapet: null,
  roof_outline: null,
  elements: [
    { kind: 'column', rect: [480, 0, 500, 360], material_ref: 2 },
    { kind: 'column', rect: [690, 0, 710, 360], material_ref: 2 },
    { kind: 'cornice', rect: [0, 700, 1000, 720], material_ref: 2 },
  ],
  rationale: 'Mái Thái ngói đỏ và cột, phào trắng theo phong cách đầu bài.',
};

/** Dời cả nhà vào sâu `cm` — dựng một mặt bằng có sân trước từ mặt bằng mẫu sát ranh. */
export function shiftBack(plan: AiFloorPlan, cm: number): AiFloorPlan {
  return {
    ...plan,
    levels: plan.levels.map((level) => ({
      ...level,
      outline: level.outline.map(([x, y]) => [x, (y ?? 0) + cm]),
      walls: level.walls.map((w) => ({
        ...w,
        a: [w.a[0], (w.a[1] ?? 0) + cm],
        b: [w.b[0], (w.b[1] ?? 0) + cm],
      })),
      rooms: level.rooms.map((r) => ({
        ...r,
        rect: [r.rect[0], (r.rect[1] ?? 0) + cm, r.rect[2], (r.rect[3] ?? 0) + cm],
      })),
    })),
  } as AiFloorPlan;
}

export function conceptOf(plan: AiFloorPlan, proposal: AiFacadeProposal): AiFacadeConcept {
  return mergeFacade(facadeFrame(plan, norms, outdoor), proposal, facadeVocab, {
    planRef: PLAN_REF,
    generator: GENERATOR,
  });
}

export const TOWNHOUSE_FACADE = conceptOf(TOWNHOUSE_PLAN, TOWNHOUSE_PROPOSAL);
/** Biệt thự lùi 5 m khỏi ranh mặt tiền — có sân trước nên có cổng và rào. */
export const VILLA_FACADE = conceptOf(shiftBack(VILLA_PLAN, 500), VILLA_PROPOSAL);

/** Mặt bằng biệt thự đã lùi 5 m — cùng mặt bằng mà `VILLA_FACADE` dựng trên (lưới trục, T147). */
export const VILLA_PLAN_SHIFTED = shiftBack(VILLA_PLAN, 500);

/*
 * ── Mẫu đối chứng «Mạnh – An Bình» (T147) ─────────────────────────────────────────────
 * Số đo CHÉP TAY từ tờ KT08 «mặt đứng trục A-C» của hồ sơ M5 (1/60, đo bằng ezdxf 10/10/2026):
 * mặt rộng 8000, trục 3980 / 3800 cách mặt ngoài 110, hai tầng 3600, tường chắn 900, cửa chính
 * 2700 × 2400 bốn cánh, cửa sổ 1200 × 1500 bậu 900, cửa ra ban công 1600 × 2400, lan can song
 * đứng cao 900 suốt mặt tầng 2, cột nhôm vân gỗ 150 ở trục B, chân nhà ốp đá đen, tường chắn mái
 * sơn ghi. Không qua `facadeFrame`: mẫu này để so tờ vẽ với tờ thật, không để thử bộ suy khung.
 *
 * Mặt bằng chỉ mang thứ bộ vẽ mặt đứng đọc (tường để suy trục, bậc tam cấp) — ép kiểu có chủ đích.
 */
export const MANH_PLAN = {
  levels: [
    {
      level: 1,
      outline: [
        [0, 0],
        [800, 0],
        [800, 1200],
        [0, 1200],
      ],
      walls: [
        { id: 'a', a: [11, 0], b: [11, 1200], t: 22, k: 'e' },
        { id: 'b', a: [409, 0], b: [409, 1200], t: 22, k: 'p' },
        { id: 'c', a: [789, 0], b: [789, 1200], t: 22, k: 'e' },
        { id: 'f', a: [0, 11], b: [800, 11], t: 22, k: 'e' },
      ],
      entry_steps: [{ id: 's1', rect: [450, -90, 750, 0], down: '-y', risers: 3, going: 30 }],
    },
  ],
} as unknown as AiFloorPlan;

export const MANH_FACADE: AiFacadeConcept = {
  ...VILLA_FACADE,
  style: 'hien_dai',
  roof: { type: 'flat', pitch_deg: null, material: 'btct_chong_tham', colour: 'xam_nhat' },
  materials: [
    { where: 'body', material: 'son_nuoc', colour: 'trang', finish: null },
    { where: 'base', material: 'da_granite', colour: 'den', finish: null },
    { where: 'trim', material: 'son_nuoc', colour: 'ghi_bac', finish: null },
    { where: 'railing', material: 'thep_son_tinh_dien', colour: 'den', finish: null },
    { where: 'accent', material: 'nhom_van_go', colour: 'nau_go', finish: null },
  ],
  gate: null,
  fence: null,
  openings_front: [
    { level: 1, x: 82, w: 120, sill: 90, h: 150, kind: 'window' },
    { level: 1, x: 466, w: 270, sill: 0, h: 240, kind: 'door' },
    { level: 2, x: 82, w: 120, sill: 90, h: 150, kind: 'window' },
    { level: 2, x: 608, w: 160, sill: 0, h: 240, kind: 'door' },
  ],
  balconies: [{ level: 2, x0: 0, x1: 800, depth: 0, railing: 'sat_hop' }],
  openings_style: {
    main_door_type: 'bon_canh',
    side_door_type: null,
    glass: null,
    garage_door_type: null,
  },
  elevation: {
    face: 'front',
    width: 800,
    ground_z: -45,
    levels: [
      { level: 1, z: 0, h: 360, x0: 0, x1: 800 },
      { level: 2, z: 360, h: 360, x0: 0, x1: 800 },
    ],
    parapet: 90,
    railing_h_cm: 90,
    roof_outline: [],
    elements: [
      { kind: 'column', rect: [401.5, 360, 416.5, 720], material_ref: 4 },
      { kind: 'reveal', rect: [430, 400, 590, 680], material_ref: null },
    ],
  },
};
