/**
 * Kiểm ý tưởng mặt đứng mô hình khai (T59) — sau hợp đồng, trước khi ghép và lưu.
 *
 * Hợp đồng `ai-facade-proposal` chỉ kiểm HÌNH DẠNG. Ở đây kiểm những thứ hợp đồng không nói được:
 *  · mã có trong danh mục `kb/facade_vocabulary.yaml` — mã lạ thì bảng ý tưởng in ra mã trần và lời
 *    dẫn ảnh không có cụm tiếng Anh để ghép;
 *  · toạ độ nằm trong khung mặt đứng và mảng trang trí không đè lên lỗ mở — lỗ mở là dữ liệu KHOÁ
 *    của mặt bằng (T16), một mảng ốp đè lên cửa sổ là mặt đứng nói khác mặt bằng;
 *  · con số nằm trong giới hạn DỰNG ĐƯỢC của danh mục (cổng cao 20 m, rào âm).
 *
 * Đây là điều kiện DỰNG, không phải thẩm mỹ: đúng tinh thần T49 — luật cứng chỉ khi không vẽ được.
 * Mọi câu trả lời về đây là tiếng Việt: chúng vừa gửi lại cho mô hình ở lượt sửa, vừa hiện lên màn
 * hình khi hết lượt mà vẫn hỏng.
 */

import type { AiFacadeBrief, AiFacadeProposal } from '@nvg/shared/design';
import type { FacadeVocabulary, Range } from '../../kb/facade-vocabulary';
import type { FacadeFrame } from './frame';

/** Mảng trang trí được phép đè lên lỗ mở — ô văng che trên cửa, lam che trước cửa sổ. */
const MAY_COVER_OPENINGS = new Set(['canopy', 'louvre']);
/** Vùng cửa lấy vật liệu từ nhóm `door_materials`, không phải vật liệu bề mặt tường. */
const DOOR_ZONES = new Set(['main_door', 'side_door', 'window', 'garage_door']);

/**
 * `brief` là phiếu yêu cầu của kỹ sư. Mục chương trình tự áp được (`merge.ts`) KHÔNG kiểm ở đây — ghi đè
 * thì chắc hơn bắt mô hình sửa, và rẻ hơn một lượt gọi. Chỉ kiểm hai thứ chương trình không tự làm
 * được: chi tiết trang trí đã chọn (cần toạ độ), và cổng khi kỹ sư muốn có cổng (cần bề rộng).
 */
export function checkFacade(
  proposal: AiFacadeProposal,
  frame: FacadeFrame,
  vocab: FacadeVocabulary,
  brief: AiFacadeBrief | null = null,
): string[] {
  const issues: string[] = [];
  const code = (table: Record<string, unknown>, value: unknown, where: string) => {
    if (typeof value !== 'string' || !(value in table)) {
      issues.push(`${where}: mã «${String(value)}» không có trong danh mục.`);
    }
  };
  const within = (value: number | null | undefined, range: Range, where: string) => {
    if (typeof value === 'number' && (value < range[0] || value > range[1])) {
      issues.push(`${where} ${value} cm nằm ngoài khoảng ${range[0]}–${range[1]} cm.`);
    }
  };

  // ── Mã danh mục ─────────────────────────────────────────────────────────────────────
  code(vocab.roofMaterials, proposal.roof.material, 'Vật liệu mái');
  code(vocab.colours, proposal.roof.colour, 'Màu mái');
  proposal.materials.forEach((m, i) => {
    const table = DOOR_ZONES.has(m.where) ? vocab.doorMaterials : vocab.materials;
    code(table, m.material, `Vật liệu vùng ${m.where} (materials[${i}])`);
    code(vocab.colours, m.colour, `Màu vùng ${m.where} (materials[${i}])`);
  });
  if (!proposal.materials.some((m) => m.where === 'body')) {
    issues.push('Thiếu vật liệu thân nhà (vùng body).');
  }
  if (frame.balconies.length && !brief?.balcony.railing) {
    if (!proposal.balcony_railing) issues.push('Mặt tiền có ban công mà chưa chọn kiểu lan can.');
    else code(vocab.railings, proposal.balcony_railing, 'Lan can ban công');
  }

  // ── Mái ─────────────────────────────────────────────────────────────────────────────
  within(proposal.parapet, vocab.limits.parapet_cm, 'Tường chắn mái cao');
  const outline = proposal.roof_outline;
  const roofType = brief?.roof.type ?? proposal.roof.type;
  if (roofType === 'mixed' && !(outline && outline.length >= 2)) {
    issues.push('Mái hỗn hợp phải khai đường bao mái (roof_outline).');
  }
  if (outline && outline.length >= 2) {
    const overhang = vocab.limits.roof_overhang_max_cm;
    const topZ = frame.roofZ + vocab.limits.roof_rise_max_cm + (proposal.parapet ?? 0);
    for (const [x = 0, z = 0] of outline) {
      if (x < frame.x0 - overhang || x > frame.x1 + overhang || z < frame.roofZ || z > topZ) {
        issues.push(
          `Điểm đường mái [${x}, ${z}] nằm ngoài khung mái (x ${frame.x0 - overhang}–${frame.x1 + overhang}, z ${frame.roofZ}–${topZ}).`,
        );
        break;
      }
    }
  }

  // ── Cổng, rào ───────────────────────────────────────────────────────────────────────
  // Nhà không có sân trước: `mergeFacade` bỏ cổng và rào, nên khai thừa không đáng một lượt gọi lại
  // tính tiền — bỏ qua phép kiểm của chúng.
  const gate = frame.frontYard ? proposal.gate : null;
  const fence = frame.frontYard ? proposal.fence : null;
  if (frame.frontYard && brief?.gate.wanted === true && !proposal.gate) {
    issues.push('Kỹ sư yêu cầu có cổng mà ý tưởng để cổng trống (gate = null).');
  }
  if (gate) {
    within(gate.h, vocab.limits.gate_h_cm, 'Cổng cao');
    const ground = frame.levels[0];
    const span = ground ? ground.x1 - ground.x0 : frame.width;
    if (gate.w <= 0 || gate.w > span) {
      issues.push(`Cổng rộng ${gate.w} cm, phải trong khoảng 1–${span} cm (bề rộng nhà).`);
    }
  }
  if (fence) within(fence.h, vocab.limits.fence_h_cm, 'Tường rào cao');
  if (gate) {
    code(vocab.materials, gate.material, 'Vật liệu cổng');
    code(vocab.colours, gate.colour, 'Màu cổng');
  }
  if (fence) {
    code(vocab.materials, fence.material, 'Vật liệu tường rào');
    code(vocab.colours, fence.colour, 'Màu tường rào');
  }

  // ── Mảng trang trí ──────────────────────────────────────────────────────────────────
  const overhang = vocab.limits.roof_overhang_max_cm;
  // Trần của mảng trang trí phải là trần của MÁI, không phải đỉnh tường chắn mái: chóp trang trí
  // và diềm mái nằm trên đường mái dốc, mà mái dốc được phép cao tới `roof_rise_max_cm` (dòng
  // kiểm đường mái ở trên dùng đúng trần ấy). Lấy nhầm trần thì phiếu yêu cầu «chóp trang trí»
  // trên nhà mái Nhật không bao giờ qua được, và mỗi lượt thử lại là một lượt gọi tính tiền.
  const top =
    roofType === 'flat'
      ? frame.roofZ + (proposal.parapet ?? frame.parapetDefault)
      : frame.roofZ + vocab.limits.roof_rise_max_cm + (proposal.parapet ?? 0);
  const openings = frame.openings.map((o) => {
    const z = (frame.levels.find((l) => l.level === o.level)?.z ?? 0) + o.sill;
    return { x0: o.x, x1: o.x + o.w, z0: z, z1: z + o.h, o };
  });
  proposal.elements.forEach((element, i) => {
    const [x0 = 0, z0 = 0, x1 = 0, z1 = 0] = element.rect;
    const where = `${vocab.elements[element.kind] ?? element.kind} (elements[${i}])`;
    if (!(x1 > x0 && z1 > z0)) {
      issues.push(`${where}: chữ nhật phải có x1 > x0 và z1 > z0.`);
      return;
    }
    if (x0 < frame.x0 - overhang || x1 > frame.x1 + overhang || z0 < frame.groundZ || z1 > top) {
      issues.push(
        `${where} [${x0}, ${z0}, ${x1}, ${z1}] nằm ngoài khung mặt đứng (x ${frame.x0 - overhang}–${frame.x1 + overhang}, z ${frame.groundZ}–${top}).`,
      );
    }
    if (element.material_ref !== null && element.material_ref >= proposal.materials.length) {
      issues.push(`${where}: material_ref ${element.material_ref} không trỏ tới vật liệu nào.`);
    }
    if (!MAY_COVER_OPENINGS.has(element.kind)) {
      const hit = openings.find((r) => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0);
      if (hit) {
        issues.push(
          `${where} đè lên lỗ mở tầng ${hit.o.level} (x ${hit.x0}–${hit.x1}, z ${hit.z0}–${hit.z1}). Chỉ ô văng và lam được đè lên cửa.`,
        );
      }
    }
  });

  // Chi tiết trang trí kỹ sư đã chọn: mỗi loại phải có ít nhất một mảng.
  for (const kind of brief?.decorations ?? []) {
    if (!proposal.elements.some((element) => element.kind === kind)) {
      issues.push(
        `Kỹ sư yêu cầu có ${(vocab.elements[kind] ?? kind).toLocaleLowerCase('vi')} (${kind}) mà ý tưởng chưa có mảng nào loại này.`,
      );
    }
  }

  return issues;
}
