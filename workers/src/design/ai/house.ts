/**
 * Ý định CẢ NHÀ → danh mục phòng + ý định từng tầng (T45, 15/09/2026 — Haan chốt).
 *
 * Tài liệu bàn giao `ai-architectural-floorplan-claude-code-handoff`: một lượt gọi cho ra một
 * `FloorPlanIntent` — danh sách phòng, diện tích mục tiêu, vùng, quan hệ — rồi Constraint Engine và
 * Geometry Engine lo phần còn lại. Tệp này là phần CHIA của bước ấy: từ một ý định cả nhà dựng lại đúng
 * hai thứ mà bộ kiểm và bộ giải đã đọc từ trước (`AiSpaceProgram`, `AiPlanIntent` từng tầng), để không
 * phải viết lại cổng nào.
 *
 * Mọi hàm ở đây THUẦN, tất định, không tốn tiền.
 */

import type {
  AiBriefDigest,
  AiHouseIntent,
  AiPlanIntent,
  AiPlanIntentZone,
  AiSpaceProgram,
  AiSpaceProgramProposal,
} from '@nvg/shared/design';

/**
 * Phòng của ý định cả nhà. `zone` và `street_facing` chỉ có ở ý định theo hợp đồng TRƯỚC T48 — bản phát
 * lại lượt đo cũ và dữ liệu mẫu của phép thử. Hợp đồng hiện hành nói vùng bằng bản phác lưới.
 */
export type HouseRoom = AiHouseIntent['rooms'][number] & {
  zone?: AiPlanIntentZone;
  street_facing?: boolean;
};

/** Ý định cả nhà như chương trình đọc: hợp đồng hiện hành, hoặc hợp đồng trước T48 (vùng, không phác). */
export type HouseIntent = Omit<AiHouseIntent, 'rooms' | 'sketches'> & {
  rooms: HouseRoom[];
  sketches?: AiHouseIntent['sketches'];
};

/** Trần chữ `rationale` của một tầng trong `ai-plan-intent`. */
const LEVEL_RATIONALE_MAX = 300;

/** Phần danh mục phòng của ý định cả nhà, đúng hình dạng bộ kiểm bám đầu bài (T41) đọc. */
export function proposalFromHouse(intent: HouseIntent): AiSpaceProgramProposal {
  return {
    schema_version: '1.0.0',
    spaces: intent.rooms.map((room) => ({
      id: room.id,
      type: room.type,
      level: room.level,
      target_area_m2: room.target_area_m2,
      ensuite_of: room.ensuite_of,
      why: null,
    })),
    rationale: intent.rationale,
    assumptions: intent.assumptions,
  };
}

/**
 * Đánh lại mã phòng của ý định theo `idMap` (mã tạm → `type_n`). Phòng không có trong bảng — tiện ích
 * đã gộp vào phòng ngủ (`foldInBedroom`) — bị bỏ, cùng mọi quan hệ trỏ vào nó.
 *
 * Lượt sửa gửi lại CHÍNH bản đã đánh mã này: lỗi cổng nói bằng mã `type_n`, nên mô hình phải đọc cùng
 * bộ mã với lời lỗi.
 */
export function renameHouse(intent: HouseIntent, idMap: ReadonlyMap<string, string>): HouseIntent {
  const fix = (id: string | null) => (id === null ? null : (idMap.get(id) ?? null));
  // Ô bản phác mang mã lạ giữ nguyên mã: bộ xếp coi là ô trống và ghi chú đúng mã mô hình đã viết.
  const cell = (token: string) => idMap.get(token) ?? token;
  return {
    ...intent,
    rooms: intent.rooms
      .filter((room) => idMap.has(room.id))
      .map((room) => ({ ...room, id: idMap.get(room.id)!, ensuite_of: fix(room.ensuite_of) })),
    relationships: intent.relationships
      .filter((rel) => idMap.has(rel.a) && idMap.has(rel.b))
      .map((rel) => ({ ...rel, a: idMap.get(rel.a)!, b: idMap.get(rel.b)! })),
    ...(intent.sketches
      ? {
          sketches: intent.sketches.map((sketch) => ({
            ...sketch,
            rows: sketch.rows.map((row) => row.trim().split(/\s+/).map(cell).join(' ')),
          })),
        }
      : {}),
    entry_room: fix(intent.entry_room),
    garage_room: fix(intent.garage_room),
  };
}

/**
 * Gộp các ô giao thông đứng khai RIÊNG trên cùng một tầng vào MỘT ô thang — tất định, không tốn lượt gọi.
 *
 * `stairTypes` đọc từ `kb/brief_fidelity.yaml` theo thứ tự: loại ĐẦU là ô thang giữ lại, các loại sau
 * gộp vào nó. Tầng chỉ có loại sau (một `core` đứng một mình) thì giữ nguyên.
 *
 * Vì sao: lượt đo 4a521f52 (15/09/2026, gpt-5) khai mỗi tầng `stair` 6 m² + `core` 3 m² — «lõi thang»
 * đứng cạnh «thang bộ». Bộ xếp coi cả hai là ô thang, dựng hai ô không ô nào đủ dài cho 21 bậc; tầng
 * trên phải chồng khít một ô ấy nên vỡ ở cả bốn lượt, và lượt sửa của mô hình không gỡ được. Trên mặt
 * bằng thật lõi thang và thang bộ là một khối.
 *
 * `absorbed`: mã ô bị gộp → mã ô thang gánh nó, để mọi quan hệ trỏ vào ô bị gộp trỏ về ô thang.
 */
export function foldStairCore(
  proposal: AiSpaceProgramProposal,
  stairTypes: readonly string[],
): { proposal: AiSpaceProgramProposal; absorbed: Map<string, string> } {
  const [primary, ...secondary] = stairTypes;
  const absorbed = new Map<string, string>();
  if (!primary || !secondary.length) return { proposal, absorbed };
  const extra = new Map<string, number>();
  const levels = [...new Set(proposal.spaces.map((space) => space.level))];
  for (const level of levels) {
    const onLevel = proposal.spaces.filter((space) => space.level === level);
    const host = onLevel
      .filter((space) => space.type === primary)
      .sort((a, b) => b.target_area_m2 - a.target_area_m2 || a.id.localeCompare(b.id))[0];
    if (!host) continue;
    for (const space of onLevel) {
      if (!secondary.includes(space.type)) continue;
      absorbed.set(space.id, host.id);
      extra.set(host.id, (extra.get(host.id) ?? 0) + space.target_area_m2);
    }
  }
  if (!absorbed.size) return { proposal, absorbed };
  return {
    proposal: {
      ...proposal,
      spaces: proposal.spaces
        .filter((space) => !absorbed.has(space.id))
        .map((space) =>
          extra.has(space.id)
            ? {
                ...space,
                target_area_m2: Math.round((space.target_area_m2 + extra.get(space.id)!) * 10) / 10,
              }
            : space,
        ),
    },
    absorbed,
  };
}

export interface LevelIntents {
  byLevel: Map<number, AiPlanIntent>;
  /**
   * Bản phác của từng tầng (T48). Tầng vắng trong khi ý định CÓ `sketches` → `null` (mô hình quên phác
   * tầng ấy); ý định theo hợp đồng cũ không có `sketches` → không tầng nào có mục ở đây.
   */
  sketches: Map<number, string[] | null>;
  /** Quan hệ khai giữa hai tầng khác nhau — không diễn đạt được trên mặt bằng, đã bỏ. */
  crossLevel: { a: string; b: string }[];
}

/**
 * Tách ý định cả nhà thành ý định từng tầng, đúng hợp đồng `ai-plan-intent` mà bộ giải đọc.
 *
 * Cửa chính chỉ ở tầng 1; cửa xe ở tầng chứa phòng xe. Quan hệ chỉ giữ khi hai phòng cùng tầng. Bản phác
 * đi riêng (`sketches`) — vùng suy từ nó cần hình bao, thứ chỉ bộ xếp biết.
 */
export function levelIntentsOf(intent: HouseIntent, levels: readonly number[]): LevelIntents {
  const levelOf = new Map(intent.rooms.map((room) => [room.id, room.level]));
  const crossLevel = intent.relationships
    .filter((rel) => levelOf.get(rel.a) !== levelOf.get(rel.b))
    .map((rel) => ({ a: rel.a, b: rel.b }));
  const rationale =
    intent.rationale.length > LEVEL_RATIONALE_MAX
      ? `${intent.rationale.slice(0, LEVEL_RATIONALE_MAX - 1)}…`
      : intent.rationale;
  const byLevel = new Map<number, AiPlanIntent>();
  const sketches = new Map<number, string[] | null>();
  for (const level of levels) {
    if (intent.sketches) {
      sketches.set(level, intent.sketches.find((sketch) => sketch.level === level)?.rows ?? null);
    }
    const rooms = intent.rooms.filter((room) => room.level === level);
    const here = new Set(rooms.map((room) => room.id));
    byLevel.set(level, {
      variant_label: level === 1 ? intent.variant_label : null,
      rationale,
      // Vùng khai chỉ có ở ý định cũ; ý định mới lấy vùng từ bản phác trong bộ xếp.
      rooms: rooms.flatMap((room) =>
        room.zone
          ? [{ id: room.id, zone: room.zone, street_facing: room.street_facing ?? false }]
          : [],
      ),
      relationships: intent.relationships.filter((rel) => here.has(rel.a) && here.has(rel.b)),
      entry_room:
        level === 1 && intent.entry_room && here.has(intent.entry_room) ? intent.entry_room : null,
      garage_room: intent.garage_room && here.has(intent.garage_room) ? intent.garage_room : null,
    });
  }
  return { byLevel, crossLevel, sketches };
}

/**
 * Diện tích tối thiểu ĐẦU BÀI khai, gán vào từng phòng của danh mục — sàn CỨNG của bộ giải (Haan,
 * 15/09/2026: «phòng nào khai thì phải tuân thủ, phòng nào không khai thì AI được quyền suy luận»).
 *
 * Ghép cùng cách bộ kiểm danh mục ghép (`program.ts` `areaMismatches`): theo loại phòng và tầng ghim,
 * mức lớn nhất với phòng lớn nhất. Phòng không có dòng đầu bài nào ghép vào thì không có sàn.
 */
export function briefMinimums(digest: AiBriefDigest, program: AiSpaceProgram): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, number[]>();
  for (const row of digest.required_spaces ?? []) {
    if (typeof row.area_m2 !== 'number' || row.area_m2 <= 0) continue;
    const key = `${row.type}@${row.floor ?? '*'}`;
    groups.set(key, [...(groups.get(key) ?? []), row.area_m2]);
  }
  // Nhóm có tầng ghim ghép trước: dòng không ghim tầng không được lấy mất phòng của dòng đã ghim.
  const keys = [...groups.keys()].sort(
    (p, q) => Number(p.endsWith('@*')) - Number(q.endsWith('@*')) || p.localeCompare(q),
  );
  for (const key of keys) {
    const [type, floorKey] = key.split('@') as [string, string];
    const floor = floorKey === '*' ? null : Number(floorKey);
    const minimums = [...groups.get(key)!].sort((a, b) => b - a);
    const candidates = program.spaces
      .filter(
        (space) =>
          space.type === type && (floor === null || space.level === floor) && !out.has(space.id),
      )
      .sort((a, b) => b.target_area_m2 - a.target_area_m2 || a.id.localeCompare(b.id));
    minimums.forEach((minimum, index) => {
      const space = candidates[index];
      if (space) out.set(space.id, minimum);
    });
  }
  return out;
}
