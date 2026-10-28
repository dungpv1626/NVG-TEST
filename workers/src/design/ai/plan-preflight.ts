/**
 * Kiểm đầu bài TRƯỚC khi mở lượt «Xếp mặt bằng» (T178) — cùng các phép kiểm Workflow chạy trước lời gọi mô hình đầu
 * tiên (`briefInfeasible`: T112 diện tích vượt sàn, T178 ô thang không có chỗ), thêm phần cảnh báo «khá chật». Tuyến
 * khởi động lượt (`POST /plan/runs`) chặn bằng chính câu này, và màn hình bước Mặt bằng hiện nó trước khi bấm — không
 * mở dòng lượt chạy nào, không gọi mô hình nào.
 *
 * Chỉ đọc kb + đầu bài đã lược danh tính; không chạm mạng.
 */

import type { AiBriefDigest } from '@nvg/shared/design';
import { roomLabels } from '../auth-scope';
import { briefFidelity } from '../kb/brief-fidelity-data';
import { constructionNorms } from '../kb/construction-data';
import { siteContextTable } from '../kb/site-context-data';
import { areaNorms } from '../kb/space-norms-data';
import { mergeAllowed, passageRules, roomGroups, zoneDefaults } from '../kb/vocabulary';
import { roomVocabulary } from '../kb/vocabulary-data';
import { NO_RULE_PACKS, selectedRulePack } from './rule-packs';
import { nationalRulePack, nvgExperiencePack } from '../rules/rule-pack-data';
import { withHouseProfile } from './house-profile-norms';
import { mandatoryRules } from './mandatory-data';
import { briefAdvice, briefInfeasible, planContext, type PlanContextInput } from './plan';
import { planQuality } from './plan-quality-data';
import { aiPrompts } from './prompts-data';
import { withStairShape } from './stair-choice';

export interface PlanPreflight {
  /** Câu chặn — có thì lượt không mở. */
  blocking: string | null;
  /** Câu cảnh báo — không chặn. */
  warnings: string[];
}

export function planPreflight(
  digest: AiBriefDigest,
  options: { geometry?: 'rect'; pipeline?: 'v6' } = {},
): PlanPreflight {
  const vocabulary = roomVocabulary().vocabulary;
  const groups = roomGroups(vocabulary);
  const strategy = aiPrompts().floorLevel.strategies[0];
  const input: PlanContextInput = {
    ...options,
    digest,
    variant: {
      id: strategy?.id ?? 'AI-A',
      label: strategy?.label ?? 'AI-A',
      strategy: strategy?.strategy ?? '',
    },
    labels: roomLabels(),
    vocabulary: roomVocabulary(),
    fidelity: briefFidelity(),
    construction: withHouseProfile(withStairShape(constructionNorms(), digest), digest),
    siteContext: siteContextTable(),
    rules: selectedRulePack(NO_RULE_PACKS, {
      standards: nationalRulePack(),
      experience: nvgExperiencePack(),
    }),
    groups: {
      outdoor: new Set(groups.outdoor ?? []),
      vertical: new Set(groups.circulation ?? []),
      noDoorRequired: new Set(groups.no_door_required ?? []),
      habitable: new Set(groups.habitable ?? []),
      doorHosts: groups.door_hosts ?? [],
      passage: passageRules(vocabulary),
    },
    mergeAllowed: mergeAllowed(vocabulary),
    zoneDefaults: zoneDefaults(vocabulary),
    stairTypes: briefFidelity().stairTypes,
    areaNorms: areaNorms(),
    quality: planQuality(),
    roomGroups: groups,
    mandatory: mandatoryRules(),
  };
  const context = planContext(input);
  const quality = planQuality();
  return {
    blocking: briefInfeasible({ ...input, quality }, context),
    warnings: briefAdvice(input, context),
  };
}
