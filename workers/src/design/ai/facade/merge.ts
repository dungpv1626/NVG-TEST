/**
 * Ghép KHUNG suy từ mặt bằng với phần MÔ HÌNH khai thành artifact `ai_facade_concept` (T59).
 *
 * Hàm thuần, không kiểm: đầu vào đã qua `checkFacade` (Đợt C) hoặc là dữ liệu viết tay của phép
 * thử. Chỉ làm hai việc chương trình phải làm thay mô hình:
 *  · chép nguyên khung KHOÁ (bề rộng, cao độ, lỗ mở, ban công) — mô hình không được chạm;
 *  · dựng đường mái khi mô hình không khai (mọi kiểu trừ mái hỗn hợp), vì toạ độ trên tờ vẽ do
 *    chương trình gán (T15). Hình dạng đường mái theo `roof_defaults` của `kb/facade_vocabulary.yaml`.
 *
 * Nhà không có sân trước thì bỏ cổng và rào: không có chỗ đặt chúng trên mặt đứng.
 */

import type { AiFacadeBrief, AiFacadeConcept, AiFacadeProposal } from '@nvg/shared/design';
import type { FacadeVocabulary } from '../../kb/facade-vocabulary';
import type { FacadeFrame } from './frame';

export const FACADE_SCHEMA_VERSION = '1.0.0';

type Point = [number, number];

/** Về lưới nửa centimet của hợp đồng. */
const half = (value: number) => Math.round(value * 2) / 2;

export interface FacadeMeta {
  planRef: string;
  /** Phiếu yêu cầu của kỹ sư mà ý tưởng này theo — rỗng khi chưa có phiếu. */
  briefRef?: string | null;
  generator: AiFacadeConcept['generator'];
}

type Material = AiFacadeConcept['materials'][number];
type Zone = Material['where'];

/**
 * Ghép khung + ý tưởng mô hình + phiếu yêu cầu của kỹ sư.
 *
 * Mục kỹ sư đã điền THẮNG câu trả lời của mô hình (Haan chốt 19/09/2026: mục đã điền là bắt buộc).
 * Áp thẳng ở đây thay vì bắt mô hình sửa: một lượt gọi lại tốn tiền mà chưa chắc làm theo, còn phép
 * gán thì chắc chắn. Chỉ những thứ chương trình không tự đặt được (chi tiết trang trí, có cổng) mới
 * phải trông vào mô hình — `check.ts` canh chúng.
 */
export function mergeFacade(
  frame: FacadeFrame,
  proposal: AiFacadeProposal,
  vocab: FacadeVocabulary,
  meta: FacadeMeta,
  brief: AiFacadeBrief | null = null,
): AiFacadeConcept {
  const roofType = brief?.roof.type ?? proposal.roof.type;
  const flat = roofType === 'flat';
  const pitch = flat ? null : roofPitch(roofType, proposal, brief, vocab);
  // Tường chắn mái chỉ có nghĩa với mái bằng. Mái dốc mà vẫn giữ số của mô hình thì tờ vẽ dựng một
  // hộp tường chắn rồi chồng tam giác mái lên — hai thứ cùng chỗ, không ai đọc ra ngôi nhà nào.
  const parapet = flat
    ? (brief?.roof.parapet_cm ?? proposal.parapet ?? frame.parapetDefault)
    : null;
  // Đường mái mô hình khai chỉ dùng cho mái hỗn hợp — kỹ sư đổi sang kiểu khác thì chương trình dựng.
  const roofOutline =
    roofType === 'mixed' && proposal.roof_outline && proposal.roof_outline.length >= 2
      ? proposal.roof_outline.map(([x, z]) => [x ?? 0, z ?? 0] as Point)
      : flat
        ? null
        : pitchedOutline(frame, roofType, pitch, vocab);

  const hex = (code: string | null | undefined) => (code ? vocab.colours[code]?.hex : undefined);
  const palette = {
    primary_hex: hex(brief?.palette.primary) ?? proposal.palette.primary_hex,
    secondary_hex: hex(brief?.palette.secondary) ?? proposal.palette.secondary_hex,
    accent_hex: hex(brief?.palette.accent) ?? proposal.palette.accent_hex ?? null,
  };

  const materials = proposal.materials.map((m) => ({ ...m }));
  if (brief) {
    applyFinish(materials, 'body', brief.surfaces.body);
    applyFinish(materials, 'base', brief.surfaces.base);
    applyFinish(materials, 'accent', brief.surfaces.accent);
    applyFinish(materials, 'trim', brief.surfaces.trim);
    applyFinish(materials, 'main_door', brief.main_door);
    applyFinish(materials, 'side_door', brief.side_door);
    applyFinish(materials, 'window', brief.window);
    applyFinish(materials, 'garage_door', brief.garage_door);
    applyFinish(materials, 'railing', {
      material: brief.balcony.material ?? null,
      colour: brief.balcony.colour,
    });
    applyFinish(materials, 'gate', brief.gate);
    applyFinish(materials, 'fence', brief.fence);
  }

  const gateWanted = brief?.gate.wanted;
  const gate =
    frame.frontYard && proposal.gate && gateWanted !== false
      ? {
          ...proposal.gate,
          type: brief?.gate.type ?? proposal.gate.type,
          h: brief?.gate.h_cm ?? proposal.gate.h,
          material: brief?.gate.material ?? proposal.gate.material,
          colour: brief?.gate.colour ?? proposal.gate.colour,
        }
      : null;
  const fence =
    frame.frontYard && proposal.fence
      ? {
          ...proposal.fence,
          h: brief?.fence.h_cm ?? proposal.fence.h,
          material: brief?.fence.material ?? proposal.fence.material,
          colour: brief?.fence.colour ?? proposal.fence.colour,
          ...(brief?.fence.type ? { type: brief.fence.type } : {}),
        }
      : null;

  return {
    schema_version: FACADE_SCHEMA_VERSION,
    plan_ref: meta.planRef,
    brief_ref: meta.briefRef ?? null,
    style: brief?.style ?? proposal.style,
    roof: {
      type: roofType,
      pitch_deg: pitch,
      material: brief?.roof.material ?? proposal.roof.material,
      colour: brief?.roof.colour ?? proposal.roof.colour,
    },
    materials,
    palette,
    gate,
    fence,
    balconies: frame.balconies.map((b) => ({
      ...b,
      railing: brief?.balcony.railing ?? proposal.balcony_railing,
    })),
    openings_front: frame.openings.map((o) => ({ ...o })),
    openings_style: brief
      ? {
          main_door_type: brief.main_door.type,
          side_door_type: brief.side_door.type,
          glass: brief.window.glass,
          garage_door_type: brief.garage_door.type,
        }
      : null,
    elevation: {
      face: 'front',
      width: frame.width,
      ground_z: frame.groundZ,
      levels: frame.levels.map((l) => ({ ...l })),
      parapet: parapet ?? null,
      // Chiều cao lan can của phiếu chép thẳng vào ý tưởng — bộ vẽ, DXF, ảnh neo và thước chấm
      // đọc CÙNG một chỗ. Rỗng thì mọi nơi lùi về `kb/construction_norms.yaml`.
      railing_h_cm: brief?.balcony.h_cm ?? null,
      ...(roofOutline ? { roof_outline: roofOutline } : {}),
      elements: proposal.elements.map((e) => ({
        kind: e.kind,
        rect: [...e.rect],
        material_ref: e.material_ref,
      })),
    },
    rationale: proposal.rationale,
    generator: meta.generator,
  };
}

/**
 * Độ dốc mái: phiếu thắng; rồi số mô hình khai, nhưng chỉ khi mô hình khai CÙNG kiểu mái (kỹ sư đổi
 * kiểu thì độ dốc của kiểu cũ không còn nghĩa); cuối cùng là mặc định của danh mục theo kiểu mái.
 */
function roofPitch(
  roofType: AiFacadeConcept['roof']['type'],
  proposal: AiFacadeProposal,
  brief: AiFacadeBrief | null,
  vocab: FacadeVocabulary,
): number {
  if (typeof brief?.roof.pitch_deg === 'number') return brief.roof.pitch_deg;
  if (proposal.roof.type === roofType && typeof proposal.roof.pitch_deg === 'number') {
    return proposal.roof.pitch_deg;
  }
  return roofType === 'japanese'
    ? vocab.roofDefaults.japanese.pitch_deg
    : vocab.roofDefaults.pitch_deg;
}

/**
 * Vật liệu + màu của một vùng theo phiếu. Vùng đã có thì ghi đè phần kỹ sư đã điền; vùng chưa có thì
 * chỉ thêm khi phiếu đủ CẢ vật liệu lẫn màu — hợp đồng đòi cả hai, và đoán hộ một màu là tự quyết
 * thay kỹ sư.
 */
function applyFinish(
  materials: Material[],
  where: Zone,
  finish: { material: string | null; colour: string | null },
): void {
  if (!finish.material && !finish.colour) return;
  const found = materials.find((m) => m.where === where);
  if (found) {
    if (finish.material) found.material = finish.material;
    if (finish.colour) found.colour = finish.colour;
    return;
  }
  if (finish.material && finish.colour) {
    materials.push({ where, material: finish.material, colour: finish.colour, finish: null });
  }
}

/**
 * Đường mái dốc nhìn từ đường, trên tầng trên cùng.
 *
 * Mái hai dốc: tam giác — đầu hồi quay ra đường. Mái tứ giác, Thái, Nhật, mansard: hình thang, bờ nóc
 * chiếm `hip_ridge_share` bề rộng mái. Chiều cao đỉnh = nửa nhịp × tan(độ dốc), chặn ở
 * `limits.roof_rise_max_cm` — một độ dốc lớn trên nhà rộng không được vẽ đỉnh mái vọt lên trời.
 */
export function pitchedOutline(
  frame: FacadeFrame,
  type: AiFacadeProposal['roof']['type'],
  pitchDeg: number | null,
  vocab: FacadeVocabulary,
): Point[] {
  const top = frame.levels[frame.levels.length - 1];
  // Mái Nhật: đua rộng hơn — vẽ như mái tứ giác với mức đua riêng.
  const overhang =
    type === 'japanese' ? vocab.roofDefaults.japanese.overhang_cm : vocab.roofDefaults.overhang_cm;
  const x0 = (top?.x0 ?? frame.x0) - overhang;
  const x1 = (top?.x1 ?? frame.x1) + overhang;
  const pitch = ((pitchDeg ?? vocab.roofDefaults.pitch_deg) * Math.PI) / 180;
  const halfSpan = (x1 - x0) / 2;
  const rise = Math.round(Math.min(Math.tan(pitch) * halfSpan, vocab.limits.roof_rise_max_cm));
  const z = frame.roofZ;
  const mid = half((x0 + x1) / 2);

  if (type === 'gable' || type === 'mixed') {
    return [
      [x0, z],
      [mid, z + rise],
      [x1, z],
    ];
  }
  const ridgeHalf = halfSpan * vocab.roofDefaults.hip_ridge_share;
  return [
    [x0, z],
    [half(mid - ridgeHalf), z + rise],
    [half(mid + ridgeHalf), z + rise],
    [x1, z],
  ];
}
