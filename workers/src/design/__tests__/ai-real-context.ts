/**
 * Ngữ cảnh nhánh AI dựng từ `kb/` + `rules/` thật và lượt đo đã lưu (`fixtures/ai-run-*.json`) — dùng
 * chung cho phép thử phát lại cần một phương án ĐÃ GHI (T53: sửa theo yêu cầu kỹ sư). KHÔNG chạm mạng.
 */

import { readFileSync } from 'node:fs';
import type { AiHouseLayout } from '@nvg/shared/design';
import type { ProgramRow } from '../ai/house-program';
import { rectFromSketch } from '../ai/layout';
import { parseFurniture, parseHouseProgram } from '../kb/house-program';
import { parseRoofPlan } from '../kb/roof-plan';
import { load } from 'js-yaml';
import { fileURLToPath, URL } from 'node:url';
import type { AiBriefDigest, AiFloorPlan, AiSpaceProgram } from '@nvg/shared/design';
import type { HouseIntent } from '../ai/house';
import {
  evaluateHouse,
  finalisePlan,
  planContext,
  programGenerator,
  tidyHouse,
  type HouseScoring,
  type PlanContextInput,
} from '../ai/plan';
import { withStairShape } from '../ai/stair-choice';
import { withHouseProfile } from '../ai/house-profile-norms';
import { parsePlanQuality } from '../ai/plan-quality';
import { parseAiPrompts } from '../ai/prompts';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms } from '../kb/construction';
import { parseSiteContext } from '../kb/site-context';
import { parseAreaNorms } from '../kb/space-norms';
import {
  mergeAllowed,
  parseVocabulary,
  passageRules,
  roomGroups,
  VocabularyIndex,
  zoneDefaults,
} from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';

export const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

export interface RecordedRun {
  digest: AiBriefDigest;
  intents: Record<string, HouseIntent>;
}

/**
 * Lượt ghi: ý định là câu trả lời THÔ của mô hình (`ai_calls/<callId>.json` → `output`). Đường chạy thật
 * chuẩn hoá nó bằng `tidyHouse` trước khi dùng (mã phòng về dạng `loại_n`, cắt chữ vượt trần), nên phát lại
 * cũng phải làm vậy. Thiếu bước này tới 30/09/2026 (T105): lượt 25fdc90c phát lại hỏng cả bốn vòng trong
 * khi lượt thật lưu mặt bằng ở vòng 4 — mã phòng khác thì thứ tự xếp và biến thể được chọn khác.
 */
export const loadRun = (id: string): RecordedRun => {
  const run = JSON.parse(
    read(`workers/src/design/__tests__/fixtures/ai-run-${id}.json`),
  ) as RecordedRun;
  return {
    ...run,
    intents: Object.fromEntries(
      Object.entries(run.intents).map(([key, intent]) => [key, tidyHouse(intent) as HouseIntent]),
    ),
  };
};

const quality = parsePlanQuality(read('kb/plan_quality.yaml'));
const siteContext = parseSiteContext(read('kb/site_context.yaml'));
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groupsTable = roomGroups(vocabulary);
const experience = new RulePack(
  parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
  false,
);
const scoreRules = new RulePack(
  [
    ...parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
    ...parseRuleFile(read('rules/nvg-measured.yaml'), 'nvg-measured'),
  ],
  false,
);

export const prompts = parseAiPrompts(load(read('kb/ai_design_prompts.yaml')));

export const FAKE_CALL = {
  provider: 'fake',
  model: 'fake-1',
  usage: { inputTokens: 0, outputTokens: 0 },
  latencyMs: 0,
};

/**
 * Lượt ghi trước 25/09/2026 chạy khi đầu bài CHƯA hỏi kích thước giếng thang, và chương trình đoán theo
 * tải (350 kg → 2,2 m², cạnh 1,4 m). Nay chương trình không đoán nữa (Haan 25/09/2026); để phát lại đúng
 * tình huống lượt ấy đã gặp, điền giếng 1,4 × 1,6 m (2,24 m²) — chỉ khi đầu bài có thang máy mà thiếu số.
 */
function withRecordedShaft(digest: AiBriefDigest): AiBriefDigest {
  const vertical = digest.vertical;
  if (!vertical || (vertical.elevator !== 'lam_ngay' && vertical.elevator !== 'chua_cho'))
    return digest;
  if (typeof vertical.elevator_shaft_width_m === 'number') return digest;
  return {
    ...digest,
    vertical: { ...vertical, elevator_shaft_width_m: 1.4, elevator_shaft_depth_m: 1.6 },
  };
}

export function realContextInput(
  recorded: AiBriefDigest,
  /**
   * Loại thang theo tài liệu (T105). Mặc định TẮT: lượt ghi được mô hình vẽ khi lời dẫn còn báo ô thang cỡ cũ
   * (1,6 × 3,3 m) — áp cỡ mới thì bản phác cũ hỏng vì ô thang nhỏ, không phải vì bộ xếp. Bật để đo riêng tác động.
   */
  options: {
    stairShape?: boolean;
    /**
     * Mặt giáp đất trống lùi dưới mức `min_open_setback_m` thì không thoáng (T112). Mặc định TẮT, cùng lẽ với
     * loại thang: mọi lượt ghi trước 01/10/2026 được vẽ khi lời dẫn còn báo mặt sau (đất trống, lùi 0 m) là
     * mặt thoáng. Bật thì phát lại 17 → 12 mặt bằng — câu trả lời cũ đặt ban công / phòng ở quay ra mặt ấy,
     * không phải bộ xếp kém đi. Bật để đo riêng tác động.
     */
    openSetback?: boolean;
    /**
     * Số đo cửa / hành lang theo loại nhà (T116, `kb/construction_norms.yaml` `by_house_profile`). Mặc định TẮT để
     * các phép thử lượt ghi giữ đúng tình huống đã gặp; bật để đo tác động bằng phát lại.
     */
    houseProfile?: boolean;
    /**
     * Cạnh tối thiểu nhà ống TRƯỚC bảng KTS (handoff sửa lỗi đợt 2, 06/10/2026: WC 1,1 · giếng trời 1,2 · ngủ 2,4…). Lượt
     * ghi trước đó vẽ [giếng trời | THANG | hành lang] trong nhà 5 m — dưới bảng KTS mọi tầng thiếu bề ngang và bộ dựng
     * lại tầng 1 không còn gì để thử. Bật để kiểm CƠ CHẾ đúng như lúc gặp.
     */
    preKtsSides?: boolean;
  } = {},
): PlanContextInput & HouseScoring {
  const digest = withRecordedShaft(recorded);
  const parsed = parseConstructionNorms(read('kb/construction_norms.yaml'));
  const ong = parsed.by_house_profile?.ong;
  const norms =
    options.preKtsSides && ong?.min_side_m
      ? {
          ...parsed,
          by_house_profile: {
            ...parsed.by_house_profile,
            ong: { ...ong, min_side_m: { balcony: ong.min_side_m.balcony ?? 0.5 } },
          },
        }
      : parsed;
  return {
    digest,
    variant: { id: 'AI-A', label: 'AI-A', strategy: '' },
    labels: Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi])),
    vocabulary: new VocabularyIndex(vocabulary),
    // Lượt ghi trước T96 (27/09/2026): mô hình còn được gợi ý giếng trời, sân thượng mà đầu bài không hỏi.
    // Phát lại kiểm BỘ XẾP trên ý định đã ghi, không kiểm cổng «không bịa thêm» — cổng ấy có phép thử riêng
    // ở `ai-program.test.ts`. Bật lên thì bốn lượt cũ bị bác ngay ở danh mục và không còn gì để phát lại.
    fidelity: { ...parseBriefFidelity(read('kb/brief_fidelity.yaml')), onlyWhenAsked: [] },
    construction: ((c) => (options.houseProfile ? withHouseProfile(c, digest) : c))(
      options.stairShape
        ? withStairShape(norms, digest)
        : { ...norms, stairs: { ...norms.stairs, shape: null } },
    ),
    siteContext: options.openSetback ? siteContext : { ...siteContext, minOpenSetbackM: {} },
    rules: selectedRulePack(NO_RULE_PACKS, { standards: new RulePack([], false), experience }),
    groups: {
      outdoor: new Set(groupsTable.outdoor ?? []),
      vertical: new Set(groupsTable.circulation ?? []),
      noDoorRequired: new Set(groupsTable.no_door_required ?? []),
      habitable: new Set(groupsTable.habitable ?? []),
      doorHosts: groupsTable.door_hosts ?? [],
      passage: passageRules(vocabulary),
    },
    mergeAllowed: mergeAllowed(vocabulary),
    zoneDefaults: zoneDefaults(vocabulary),
    stairTypes: ['stair', 'core'],
    areaNorms: parseAreaNorms(read('kb/space_norms.yaml')),
    scoreRules,
    // Thước 3 (T96) thêm sàn theo nhóm; câu trả lời ghi sẵn sinh dưới thước cũ, nên vòng sửa phát lại
    // giữ ngưỡng tổng như lúc ghi — sàn nhóm có bài riêng ở `ai-design-steps.test.ts`.
    quality: { ...quality, acceptGroupFloorPercent: null },
    roomGroups: groupsTable,
  };
}

/** Phương án đã ghi của một ý định thật — đúng payload `writePlan` đúc (trừ mã chương trình). */
export function savedPlan(
  run: RecordedRun,
  key: string,
): {
  plan: AiFloorPlan;
  program: AiSpaceProgram;
  input: PlanContextInput & HouseScoring;
} {
  // Phương án ĐÃ LƯU là bất biến: dựng lại theo luật lúc lưu. Phép kiểm bản phác thiếu ô (T73,
  // `construction.sketch`) ra đời sau — 58688ead round4 (tầng 1 Haan chấm 16/09/2026) vẽ phòng ngủ 1
  // thiếu ô mà bộ xếp vẫn dựng đủ 25 m².
  const { sketch: _t73, ...construction } = realContextInput(run.digest).construction;
  const input = { ...realContextInput(run.digest), construction };
  const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
  const evaluation = evaluateHouse(
    input,
    planContext(input),
    run.intents[key]!,
    generator,
    prompts,
  );
  if (!evaluation.ok) throw new Error(`Ý định ${key} không xếp được — fixture đổi?`);
  const program = { ...evaluation.ok.program, brief_ref: `sha256:${'b'.repeat(64)}` };
  const final = finalisePlan({
    levels: evaluation.ok.levels,
    context: planContext(input),
    program,
    programRef: `sha256:${'a'.repeat(64)}`,
    variant: input.variant,
    call: FAKE_CALL,
    route: 'ai_text_fake',
    promptVersion: prompts.version,
    resampledLevels: [],
    construction: input.construction,
    groups: input.groups,
    quality: input.quality,
    scoreRules: input.scoreRules,
    areaNorms: input.areaNorms ?? null,
    roomGroups: input.roomGroups,
    buildingType: run.digest.building_type,
  });
  return {
    plan: { ...final.payload, house_intent: evaluation.ok.intent },
    program,
    input,
  };
}

/**
 * Ý định ĐÃ GHI (bản phác lưới) → câu trả lời lược đồ hình chữ nhật v5 với mã DANH MỤC — để phát lại lượt cũ qua
 * đường v5 (bàn giao `prompt-mat-bang-v5.md`). Ghép phòng đã ghi vào dòng danh mục cùng loại, cùng tầng (phòng khép
 * kín theo phòng mẹ đã ghép); phòng còn lại đặt mã theo tiền tố mô hình được tự thêm; tiện ích trong phòng bỏ.
 */
export function layoutFromRecorded(
  intent: HouseIntent,
  program: readonly ProgramRow[],
  block: { x: number; y: number; widthMm: number; depthMm: number },
): AiHouseLayout {
  const map = new Map<string, string>();
  const used = new Set<string>();
  const rowsOf = (level: number) => intent.sketches?.find((s) => s.level === level)?.rows;
  const rects = new Map<string, number[]>();
  for (const room of intent.rooms) {
    const rows = rowsOf(room.level);
    const rect = rows ? rectFromSketch(rows, room.id, block) : null;
    if (rect) rects.set(room.id, [...rect]);
  }
  // Phần không gian mở (`open`) bản phác cũ gộp vào phòng bên cạnh, không có ô: lược đồ v5 cho mỗi phần một rect —
  // tách một phần ba phía sau rect của phòng cùng không gian.
  for (const rel of intent.relationships.filter((r) => r.kind === 'open')) {
    const [host, part] = rects.has(rel.a) ? [rel.a, rel.b] : [rel.b, rel.a];
    const h = rects.get(host);
    if (!h || rects.has(part)) continue;
    const cut = Math.round((h[3]! * 2) / 3 / 100) * 100;
    rects.set(host, [h[0]!, h[1]!, h[2]!, cut]);
    rects.set(part, [h[0]!, h[1]! + cut, h[2]!, h[3]! - cut]);
  }
  // Phòng khép kín (WC riêng…) bản phác cũ vẽ chung ô với phòng mẹ: cắt ở góc phòng mẹ gần tâm khối (phía trong
  // nhà, xa mặt có cửa sổ) một ô cỡ diện tích mục tiêu, cạnh ≥ 1,2 m.
  const cx = block.x + block.widthMm / 2;
  const cy = block.y + block.depthMm / 2;
  const r100 = (v: number) => Math.round(v / 100) * 100;
  for (const room of intent.rooms) {
    const h = room.ensuite_of ? rects.get(room.ensuite_of) : undefined;
    if (!h || rects.has(room.id)) continue;
    const [x, y, w, d] = h as [number, number, number, number];
    const area = Math.max(room.target_area_m2, 2.5) * 1e6;
    // Cắt dải theo cạnh dài của phòng mẹ để phần còn lại vẫn vuông vắn.
    if (w >= d) {
      const cw = Math.min(r100(Math.max(area / d, 1200)), r100(w / 3));
      const left = x + w / 2 > cx;
      rects.set(room.id, [left ? x : x + w - cw, y, cw, d]);
      rects.set(room.ensuite_of!, [left ? x + cw : x, y, w - cw, d]);
    } else {
      const cd = Math.min(r100(Math.max(area / w, 1200)), r100(d / 3));
      const top = y + d / 2 > cy;
      rects.set(room.id, [x, top ? y : y + d - cd, w, cd]);
      rects.set(room.ensuite_of!, [x, top ? y + cd : y, w, d - cd]);
    }
  }
  const drawn = intent.rooms.filter((room) => rects.has(room.id));
  const pick = (row: ProgramRow): HouseIntent['rooms'][number] | undefined => {
    // Phòng khép kín: ghép theo `ensuite_of` đã ghi, không có thì theo phòng kề phòng mẹ đã ghép.
    const parentRec = row.parent ? [...map].find(([, to]) => to === row.parent)?.[0] : undefined;
    const touches = (a: string, b: string) => {
      const p = rects.get(a);
      const q = rects.get(b);
      if (!p || !q) return false;
      const ox = Math.min(p[0]! + p[2]!, q[0]! + q[2]!) - Math.max(p[0]!, q[0]!);
      const oy = Math.min(p[1]! + p[3]!, q[1]! + q[3]!) - Math.max(p[1]!, q[1]!);
      return (ox === 0 && oy > 0) || (oy === 0 && ox > 0);
    };
    const want = (room: HouseIntent['rooms'][number]) =>
      !used.has(room.id) &&
      room.type === row.type &&
      (row.level === '' || String(room.level) === row.level) &&
      (row.parent === null ||
        (room.ensuite_of !== null
          ? map.get(room.ensuite_of) === row.parent
          : parentRec !== undefined && touches(room.id, parentRec)));
    // Dòng không có phòng mẹ (WC chung…) ưu tiên phòng không khép kín.
    const owned = (room: HouseIntent['rooms'][number]) =>
      Number(row.parent === null && room.ensuite_of !== null);
    // Dòng có phòng con (WC riêng, ban công riêng) ưu tiên phòng bản ghi cũng có phòng con cùng loại, và ngược lại.
    const kids = (ofRow: boolean, room: HouseIntent['rooms'][number]) =>
      ofRow
        ? program.filter((p) => p.parent === row.id).map((p) => p.type)
        : intent.rooms.filter((r) => r.ensuite_of === room.id).map((r) => r.type);
    const misfit = (room: HouseIntent['rooms'][number]) => {
      const want = kids(true, room);
      const have = kids(false, room);
      return (
        want.filter((t) => !have.includes(t)).length + have.filter((t) => !want.includes(t)).length
      );
    };
    return drawn
      .filter(want)
      .sort(
        (a, b) =>
          owned(a) - owned(b) ||
          misfit(a) - misfit(b) ||
          Math.abs(a.target_area_m2 - (row.min_m2 ?? a.target_area_m2)) -
            Math.abs(b.target_area_m2 - (row.min_m2 ?? b.target_area_m2)) ||
          b.target_area_m2 - a.target_area_m2,
      )[0];
  };
  for (const row of [...program].sort(
    (a, b) => Number(a.parent !== null) - Number(b.parent !== null),
  )) {
    if (row.level === 'roof') continue;
    const room = pick(row);
    if (!room) continue;
    map.set(room.id, row.id);
    used.add(room.id);
  }
  const prefix: Record<string, string> = {
    circulation: 'gt',
    stair: 'thang',
    core: 'thang',
    porch: 'sanh',
    balcony: 'bc',
    wc: 'wc_x',
    storage: 'kho',
    shaft: 'hkt',
  };
  const n = new Map<string, number>();
  for (const room of drawn) {
    if (map.has(room.id) || !prefix[room.type]) continue;
    const k = (n.get(room.type) ?? 0) + 1;
    n.set(room.type, k);
    map.set(room.id, `${prefix[room.type]}_${k}`);
  }
  const to = (id: string | null) => (id && map.has(id) ? map.get(id)! : '');
  return {
    variant_label: intent.variant_label,
    rationale: intent.rationale,
    design_notes: [],
    assumptions: intent.assumptions,
    rooms: drawn
      .filter((room) => map.has(room.id))
      .map((room) => ({
        id: map.get(room.id)!,
        level: String(room.level),
        rect: rects.get(room.id)!,
      })),
    doors: intent.relationships
      .filter((rel) => rel.kind === 'adjacent' && map.has(rel.a) && map.has(rel.b))
      .map((rel) => [map.get(rel.a)!, map.get(rel.b)!]),
    open: intent.relationships
      .filter((rel) => rel.kind === 'open' && map.has(rel.a) && map.has(rel.b))
      .map((rel) => [map.get(rel.a)!, map.get(rel.b)!]),
    cantilevers: [],
    entry_room: to(intent.entry_room),
    garage_room: to(intent.garage_room),
  };
}

/** Dữ liệu chế độ hình chữ nhật từ `kb/` — cho phép thử và phát lại (Worker nạp ở `house-program-data.ts`). */
export const layoutKb = {
  houseProgram: parseHouseProgram(read('kb/house_program.yaml')),
  furniture: parseFurniture(read('kb/furniture.yaml')),
  roofPlan: parseRoofPlan(read('kb/roof_plan.yaml')),
};
