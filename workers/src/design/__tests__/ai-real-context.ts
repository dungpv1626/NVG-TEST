/**
 * Ngữ cảnh nhánh AI dựng từ `kb/` + `rules/` thật và lượt đo đã lưu (`fixtures/ai-run-*.json`) — dùng
 * chung cho phép thử phát lại cần một phương án ĐÃ GHI (T53: sửa theo yêu cầu kỹ sư). KHÔNG chạm mạng.
 */

import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { fileURLToPath, URL } from 'node:url';
import type { AiBriefDigest, AiFloorPlan, AiSpaceProgram } from '@nvg/shared/design';
import type { HouseIntent } from '../ai/house';
import {
  evaluateHouse,
  finalisePlan,
  planContext,
  programGenerator,
  type HouseScoring,
  type PlanContextInput,
} from '../ai/plan';
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

export const loadRun = (id: string) =>
  JSON.parse(read(`workers/src/design/__tests__/fixtures/ai-run-${id}.json`)) as RecordedRun;

const quality = parsePlanQuality(read('kb/plan_quality.yaml'));
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

export function realContextInput(digest: AiBriefDigest): PlanContextInput & HouseScoring {
  return {
    digest,
    variant: { id: 'AI-A', label: 'AI-A', strategy: '' },
    labels: Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi])),
    vocabulary: new VocabularyIndex(vocabulary),
    fidelity: parseBriefFidelity(read('kb/brief_fidelity.yaml')),
    construction: parseConstructionNorms(read('kb/construction_norms.yaml')),
    siteContext: parseSiteContext(read('kb/site_context.yaml')),
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
    quality,
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
  const input = realContextInput(run.digest);
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
