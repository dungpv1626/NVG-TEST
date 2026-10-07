/**
 * Danh mục phòng chương trình cấp cho lời gọi mặt bằng chế độ hình chữ nhật (bàn giao v5 mục 4 `knowledge.program`;
 * Haan chốt 04/10/2026 «theo v5, có nới»).
 *
 * Mỗi dòng: mã cố định, tên tiếng Việt, tầng («1», «2»…, «» = mô hình chọn, «roof» = mái), loại, diện tích tối thiểu,
 * phòng mẹ. Mô hình dùng đúng các mã ấy và chỉ tự thêm loại ở `kb/house_program.yaml` `model_added`. Đầu bài không
 * nói phòng ngủ nào của ai — ghép theo tầng và loại: khép kín với khép kín, rồi phòng lớn cho vai trò đứng trước
 * (`bedroom_role_order`). Hàm thuần.
 */
import { FAMILY_ROLE_LABEL, type AiBriefDigest } from '@nvg/shared/design';
import type { HouseProgramSpec } from '../kb/house-program';
import type { RoofPlanSpec } from '../kb/roof-plan';
import type { ProgramKnowledge } from './program';

export interface ProgramRow {
  id: string;
  name: string;
  /** «1», «2»… tầng ghim; «» = mô hình chọn tầng; «roof» = khu trên mái. */
  level: string;
  type: string;
  min_m2: number | null;
  parent: string | null;
  /** Vai trò thành viên dùng phòng ngủ này — vắng với phòng khác. */
  for?: string;
}

export interface ProgramInput {
  digest: AiBriefDigest;
  knowledge: ProgramKnowledge;
  labels: Readonly<Record<string, string>>;
  spec: HouseProgramSpec;
  roof: { spec: RoofPlanSpec; required: readonly string[] } | null;
}

const BEDROOM_TYPES = new Set(['bedroom', 'master_bedroom']);

export function houseProgram(input: ProgramInput): ProgramRow[] {
  const { digest, knowledge, labels, spec } = input;
  const label = (type: string) => labels[type] ?? type;
  const rows: ProgramRow[] = [];
  const used = new Set<string>();
  const fresh = (base: string) => {
    let n = 1;
    while (used.has(`${base}_${n}`)) n += 1;
    used.add(`${base}_${n}`);
    return `${base}_${n}`;
  };
  const take = (id: string) => {
    used.add(id);
    return id;
  };
  const levelOf = (floor: number | null | undefined) => (floor ? String(floor) : '');
  const spaces = digest.required_spaces ?? [];

  // ── Phòng ngủ: ghép dòng đầu bài với thành viên theo (tầng, loại) ──────────────────────────────
  type Slot = {
    role: string;
    ensuite: boolean;
    floor: number | null;
    type: string;
    k: number;
    of: number;
    member: ProgramKnowledge['members'][number];
  };
  const slots: Slot[] = knowledge.members.flatMap((member) =>
    member.bedroom_type && member.rooms > 0
      ? Array.from({ length: member.rooms }, (_, i) => ({
          role: member.role,
          ensuite: member.ensuite,
          floor: member.floor,
          type: member.bedroom_type!,
          k: i + 1,
          of: member.rooms,
          member,
        }))
      : [],
  );
  // Đánh số theo VAI TRÒ trên cả nhà, không theo từng dòng thành viên: hai dòng «con» mỗi dòng 1 người
  // ở hai tầng (lượt thật 139e1a3f, nhà ống 04/10/2026) từng cùng ra mã `ngu_con` — mô hình trả một rect
  // cho mỗi mã nên mất một phòng ngủ, cổng danh mục bác cả bốn vòng sửa.
  const perRole = new Map<string, number>();
  for (const slot of slots) {
    slot.k = (perRole.get(slot.role) ?? 0) + 1;
    perRole.set(slot.role, slot.k);
  }
  for (const slot of slots) slot.of = perRole.get(slot.role)!;
  type BedRow = { type: string; floor: number | null; area: number | null; ensuite: boolean };
  const bedRows: BedRow[] = spaces
    .filter((space) => BEDROOM_TYPES.has(space.type))
    .map((space) => ({
      type: space.type,
      floor: space.floor ?? null,
      area: space.area_m2 ?? null,
      ensuite: space.ensuite === true,
    }));
  const rank = (role: string) => {
    const i = spec.bedroomRoleOrder.indexOf(role);
    return i < 0 ? spec.bedroomRoleOrder.length : i;
  };
  const pairs = new Map<Slot, BedRow | null>();
  const free = [...bedRows];
  const pass = (sameFloor: boolean) => {
    const open = slots
      .filter((slot) => !pairs.has(slot))
      .sort(
        (a, b) => Number(b.ensuite) - Number(a.ensuite) || rank(a.role) - rank(b.role) || a.k - b.k,
      );
    for (const slot of open) {
      const candidates = free
        .filter(
          (row) =>
            row.type === slot.type &&
            (sameFloor ? row.floor === slot.floor : slot.floor === null || row.floor === null),
        )
        .sort(
          (a, b) =>
            Number(b.ensuite === slot.ensuite) - Number(a.ensuite === slot.ensuite) ||
            (b.area ?? 0) - (a.area ?? 0),
        );
      const row = candidates[0];
      if (!row) continue;
      pairs.set(slot, row);
      free.splice(free.indexOf(row), 1);
    }
  };
  pass(true);
  pass(false);

  for (const slot of slots) {
    const row = pairs.get(slot) ?? null;
    const code = spec.roleCodes[slot.role] ?? slot.role;
    const id = take(slot.of > 1 ? `ngu_${code}_${slot.k}` : `ngu_${code}`);
    const role = FAMILY_ROLE_LABEL[slot.role as keyof typeof FAMILY_ROLE_LABEL] ?? slot.role;
    const inside = slot.member.in_room.map((type) => label(type).toLowerCase());
    rows.push({
      id,
      name: `${label(slot.type)} ${role.toLowerCase()}${slot.of > 1 ? ` ${slot.k}` : ''}${inside.length ? ` (gồm ${inside.join(', ')})` : ''}`,
      level: levelOf(row?.floor ?? slot.floor),
      type: slot.type,
      min_m2: row?.area ?? null,
      parent: null,
      for: slot.role,
    });
    if (slot.ensuite || row?.ensuite) {
      rows.push({
        id: take(`wc_${id}`),
        name: `${label('wc')} ${role.toLowerCase()}`,
        level: levelOf(row?.floor ?? slot.floor),
        type: 'wc',
        min_m2: null,
        parent: id,
      });
    }
    for (const need of slot.member.needs) {
      const prefix = Object.entries(spec.modelAdded).find(([, type]) => type === need)?.[0] ?? need;
      rows.push({
        id: take(`${prefix}_${id}`),
        name: `${label(need)} ${role.toLowerCase()}`,
        level: levelOf(row?.floor ?? slot.floor),
        type: need,
        min_m2: null,
        parent: id,
      });
    }
  }
  // Dòng phòng ngủ đầu bài không ghép được với thành viên nào.
  for (const row of free) {
    const id = fresh('ngu');
    rows.push({
      id,
      name: label(row.type),
      level: levelOf(row.floor),
      type: row.type,
      min_m2: row.area,
      parent: null,
    });
    if (row.ensuite)
      rows.push({
        id: take(`wc_${id}`),
        name: label('wc'),
        level: levelOf(row.floor),
        type: 'wc',
        min_m2: null,
        parent: id,
      });
  }

  // ── Không gian khác của đầu bài ───────────────────────────────────────────────────────────────
  for (const space of spaces) {
    if (BEDROOM_TYPES.has(space.type)) continue;
    // Ban công chung một tầng đã có ban công riêng của thành viên: một cái là đủ cho dòng ấy.
    if (
      space.type === 'balcony' &&
      rows.some((row) => row.type === 'balcony' && row.level === levelOf(space.floor))
    )
      continue;
    const amenities =
      typeof space.amenities === 'string' && space.amenities.trim()
        ? ` (${space.amenities.trim()})`
        : '';
    const min =
      space.type === 'garage' && knowledge.garage_min_m2
        ? Math.max(space.area_m2 ?? 0, knowledge.garage_min_m2)
        : (space.area_m2 ?? null);
    rows.push({
      id: fresh(space.type),
      name: `${label(space.type)}${amenities}`.slice(0, 80),
      level: levelOf(space.floor),
      type: space.type,
      min_m2: min || null,
      parent: null,
    });
  }
  // Chỗ để xe đầu bài suy từ số xe mà không có dòng «Không gian gia chủ yêu cầu».
  if (knowledge.garage_min_m2 && !rows.some((row) => row.type === 'garage')) {
    rows.push({
      id: fresh('garage'),
      name: label('garage'),
      level: '1',
      type: 'garage',
      min_m2: knowledge.garage_min_m2,
      parent: null,
    });
  }
  // Đòi hỏi suy từ câu đã trả lời mà danh mục chưa có loại nào đáp ứng (chỉ dòng CHẶN — dòng cảnh báo để mô hình tự quyết).
  for (const demand of knowledge.brief_demands.spaces) {
    if (!demand.blocking) continue;
    // Liên tục các tầng (hộp kỹ thuật cục nóng, T116): mỗi tầng chưa có loại nào đáp ứng thì thêm một dòng.
    if (demand.perStorey) {
      const type = demand.anyOf[0]!;
      for (let level = 1; level <= knowledge.floors; level += 1) {
        if (rows.some((row) => demand.anyOf.includes(row.type) && row.level === String(level)))
          continue;
        rows.push({
          id: fresh(type),
          name: label(type),
          level: String(level),
          type,
          min_m2: demand.minM2 ?? null,
          parent: null,
        });
      }
      continue;
    }
    const have = rows.filter(
      (row) =>
        demand.anyOf.includes(row.type) &&
        (demand.level === null || row.level === String(demand.level)),
    ).length;
    for (let i = have; i < demand.count; i += 1) {
      const type = demand.anyOf[0]!;
      rows.push({
        id: fresh(type),
        name: label(type),
        level: levelOf(demand.level),
        type,
        min_m2: null,
        parent: null,
      });
    }
  }
  const lift = knowledge.brief_demands.elevator;
  if (lift && !rows.some((row) => row.type === lift.type)) {
    const size =
      lift.shaftWidthM && lift.shaftDepthM
        ? ` (giếng ${lift.shaftWidthM} × ${lift.shaftDepthM} m)`
        : '';
    // Thang máy (kể cả chừa chỗ) chồng khít MỌI tầng (T65): mỗi tầng một dòng.
    for (let level = 1; level <= knowledge.floors; level += 1) {
      rows.push({
        id: take(`thang_may_${level}`),
        name: `${label(lift.type)}${size}`,
        level: String(level),
        type: lift.type,
        min_m2: lift.minAreaM2,
        parent: null,
      });
    }
  }

  // ── Mái ──────────────────────────────────────────────────────────────────────────────────────
  if (input.roof) {
    for (const code of input.roof.required) {
      const zone = input.roof.spec.zones.find((z) => z.code === code);
      if (!zone) continue;
      rows.push({
        id: take(code),
        name: zone.vi,
        level: 'roof',
        type: code,
        min_m2: zone.minM2,
        parent: null,
      });
    }
  }
  return rows;
}

/** Loại của một mã mô hình trả về: danh mục trước, rồi tiền tố mô hình được tự thêm. `null` = mã lạ. */
export function typeOfId(
  id: string,
  program: readonly ProgramRow[],
  spec: HouseProgramSpec,
): string | null {
  const row = program.find((r) => r.id === id);
  if (row) return row.type;
  const prefix = id.split('_')[0]!;
  return spec.modelAdded[prefix] ?? null;
}
