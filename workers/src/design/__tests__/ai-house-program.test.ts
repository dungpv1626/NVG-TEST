/**
 * Danh mục phòng chương trình cấp (bàn giao v5 `prompt-mat-bang-v5.md` mục 4 `knowledge.program`; Haan chốt 04/10/2026
 * «theo v5, có nới»). Ca mẫu của tài liệu: biệt thự Hưng Yên — lượt thật 0b7e4957.
 */
import { describe, expect, it } from 'vitest';
import { houseProgram, typeOfId } from '../ai/house-program';
import { planContext } from '../ai/plan';
import { requiredRoofZones } from '../kb/roof-plan';
import { layoutKb, loadRun, realContextInput } from './ai-real-context';

const run = loadRun('0b7e4957');
const context = planContext(realContextInput(run.digest));
const labels = Object.fromEntries(context.knowledge.room_types.map((t) => [t.code, t.vi]));
const rows = houseProgram({
  digest: run.digest,
  knowledge: context.knowledge,
  labels,
  spec: layoutKb.houseProgram,
  roof: {
    spec: layoutKb.roofPlan,
    required: requiredRoofZones(layoutKb.roofPlan, run.digest),
  },
});
const byId = new Map(rows.map((row) => [row.id, row]));

describe('danh mục phòng ca Hưng Yên', () => {
  it('phòng ngủ ghép đúng người: khép kín với khép kín, phòng lớn cho vai trò đứng trước', () => {
    expect(byId.get('ngu_ob')).toMatchObject({
      level: '1',
      type: 'bedroom',
      min_m2: 18,
      for: 'ong_ba',
    });
    expect(byId.get('ngu_gv')).toMatchObject({ level: '1', min_m2: 15, for: 'nguoi_giup_viec' });
    expect(byId.get('ngu_vc')).toMatchObject({ level: '2', type: 'master_bedroom', min_m2: 23 });
    expect(byId.get('ngu_con_1')?.min_m2).toBe(17);
    expect(byId.get('ngu_con_2')?.min_m2).toBe(17);
    expect(byId.get('ngu_kh')?.min_m2).toBe(15);
  });

  it('phòng khép kín và ban công riêng có phòng mẹ; góc học tập nằm trong tên phòng, không thành phòng', () => {
    expect(byId.get('wc_ngu_ob')?.parent).toBe('ngu_ob');
    expect(byId.get('wc_ngu_vc')?.parent).toBe('ngu_vc');
    expect(byId.get('bc_ngu_vc')).toMatchObject({ type: 'balcony', parent: 'ngu_vc' });
    expect(byId.get('ngu_con_1')?.name).toContain('học tập');
    expect(rows.some((row) => row.type === 'study_area')).toBe(false);
    // Phòng làm việc riêng (đầu bài) là một phòng; ban công chung tầng 2 không nhân đôi ban công riêng.
    expect(rows.filter((row) => row.type === 'study')).toHaveLength(1);
    expect(rows.filter((row) => row.type === 'balcony')).toHaveLength(1);
  });

  it('chỗ để xe lấy mức suy từ số xe; mái có đủ bốn khu; mã duy nhất', () => {
    expect(byId.get('garage_1')?.min_m2).toBe(context.knowledge.garage_min_m2);
    expect(rows.filter((row) => row.level === 'roof').map((row) => row.id)).toEqual([
      'terrace',
      'ac_yard',
      'tank_solar',
      'drying_yard',
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('loại của mã: danh mục trước, rồi tiền tố mô hình được tự thêm', () => {
    expect(typeOfId('ngu_ob', rows, layoutKb.houseProgram)).toBe('bedroom');
    expect(typeOfId('gt_3', rows, layoutKb.houseProgram)).toBe('circulation');
    expect(typeOfId('thang', rows, layoutKb.houseProgram)).toBe('stair');
    expect(typeOfId('phong_la', rows, layoutKb.houseProgram)).toBeNull();
  });
});

describe('hai dòng thành viên cùng vai trò, mỗi dòng một người', () => {
  // Lượt thật 139e1a3f (nhà ống, 04/10/2026): đầu bài khai «con» thành hai dòng 1 người — hai phòng cùng ra mã
  // `ngu_con`, mô hình trả một rect cho mỗi mã, cổng danh mục bác «cần 3 phòng ngủ, đề xuất có 2» suốt bốn vòng.
  it('đánh số theo vai trò trên cả nhà — mã không trùng', () => {
    const digest = {
      ...run.digest,
      family: (run.digest.family ?? []).flatMap((member) =>
        member.role === 'con'
          ? [
              { ...member, count: 1 },
              { ...member, count: 1 },
            ]
          : [member],
      ),
    };
    const ctx = planContext(realContextInput(digest));
    const split = houseProgram({
      digest,
      knowledge: ctx.knowledge,
      labels,
      spec: layoutKb.houseProgram,
      roof: null,
    });
    const kids = split.filter((row) => row.for === 'con');
    expect(kids.map((row) => row.id)).toEqual(['ngu_con_1', 'ngu_con_2']);
    expect(new Set(split.map((row) => row.id)).size).toBe(split.length);
  });
});

describe('cục nóng trong hộp kỹ thuật (T116 mục 7 — giữ luật chặn, chương trình tự thêm)', () => {
  it('đầu bài khai `aircon_outdoor = hop_ky_thuat` mà không kê hộp → mỗi tầng một dòng `shaft` 0,48 m²', () => {
    const digest = {
      ...run.digest,
      systems: { ...(run.digest.systems ?? {}), aircon_outdoor: 'hop_ky_thuat' },
      required_spaces: (run.digest.required_spaces ?? []).filter(
        (space) => space.type !== 'shaft' && space.type !== 'technical',
      ),
    } as typeof run.digest;
    const ctx = planContext(realContextInput(digest));
    const program = houseProgram({
      digest,
      knowledge: ctx.knowledge,
      labels,
      spec: layoutKb.houseProgram,
      roof: null,
    });
    const shafts = program.filter((row) => row.type === 'shaft');
    expect(shafts.map((row) => row.level)).toEqual(
      Array.from({ length: ctx.knowledge.floors }, (_, i) => String(i + 1)),
    );
    expect(shafts.every((row) => row.min_m2 === 0.48)).toBe(true);
  });
});
