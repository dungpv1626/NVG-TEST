/**
 * Oracle (T116, handoff v6 B0): mặt bằng thật đã thi công phải qua cổng. Bản vẽ thật bị bác nghĩa là LUẬT sai, không
 * phải bản vẽ. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  houseProfile,
  type AiBriefDigest,
  type AiPlanTree,
  type AiSpaceProgram,
} from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { withHouseProfile } from '../ai/house-profile-norms';
import { layoutLevel } from '../ai/tree';
import { parseConstructionNorms, type ConstructionNorms } from '../kb/construction';
import { mergeAllowed, parseVocabulary, passageRules, roomGroups } from '../kb/vocabulary';
import {
  MR_DUONG_BUILDABLE,
  MR_DUONG_DIGEST,
  MR_DUONG_OTHERS,
  MR_DUONG_T3,
  MR_DUONG_T3_PROGRAM,
} from './ai-oracle-fixtures';
import { programOf } from './ai-tree-fixtures';

const read = (r: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${r}`, import.meta.url)), 'utf8');
const shared = parseConstructionNorms(read('kb/construction_norms.yaml'));
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const table = roomGroups(vocabulary);
const groups = {
  outdoor: new Set(table.outdoor ?? []),
  vertical: new Set(table.circulation ?? []),
  noDoorRequired: new Set(table.no_door_required ?? []),
  habitable: new Set(table.habitable ?? []),
  doorHosts: table.door_hosts ?? [],
  passage: passageRules(vocabulary),
};
const tube = withHouseProfile(shared, MR_DUONG_DIGEST as unknown as AiBriefDigest);

const FLOORS: [number, AiPlanTree, AiSpaceProgram][] = [
  ...MR_DUONG_OTHERS.map(
    ([level, tree, spaces]) =>
      [level, tree, programOf(spaces)] as [number, AiPlanTree, AiSpaceProgram],
  ),
  [3, MR_DUONG_T3, MR_DUONG_T3_PROGRAM],
];

function gate(
  construction: ConstructionNorms,
  level: number,
  tree: AiPlanTree,
  program: AiSpaceProgram,
) {
  return layoutLevel({
    tree,
    level,
    isTop: false,
    program,
    buildableCm: MR_DUONG_BUILDABLE,
    construction,
    groups,
    mergeAllowed: mergeAllowed(vocabulary),
    openFaces: ['front', 'back'],
    accessFaces: ['front'],
    anchors: null,
  });
}

describe('oracle MR Dương — nhà ống 16,43 × 5 m, 5 tầng', () => {
  it('đầu bài suy ra nhà ống', () => {
    expect(houseProfile(MR_DUONG_DIGEST).profile).toBe('ong');
  });

  it.each(FLOORS.map(([level, tree, program]) => [level, tree, program] as const))(
    'tầng %i qua cổng với số đo nhà ống',
    (level, tree, program) => {
      const result = gate(tube, level, tree, program);
      expect(result.issues.map((i) => `${i.code}: ${i.message}`)).toEqual([]);
      expect(result.level).not.toBeNull();
    },
  );

  it('bộ số chung (biệt thự) bác oan tầng 1 và tầng 3 vì vách đặt cửa — lý do có số đo theo loại nhà', () => {
    for (const [level, tree, program] of FLOORS.filter(([l]) => l === 1 || l === 3)) {
      const codes = gate(shared, level, tree, program).issues.map((i) => i.code);
      expect(codes).toContain('door_wall_too_short');
    }
  });
});
