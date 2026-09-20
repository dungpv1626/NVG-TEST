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
import { parseFacadeVocabulary } from '../kb/facade-vocabulary';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

export const norms = parseConstructionNorms(read('kb/construction_norms.yaml'));
export const facadeVocab = parseFacadeVocabulary(read('kb/facade_vocabulary.yaml'));
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
