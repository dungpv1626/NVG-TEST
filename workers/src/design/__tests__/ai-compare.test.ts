import { describe, expect, it } from 'vitest';
import type { SpaceProgram } from '@nvg/shared/design';
import { compareProgramsById } from '../ai/compare';

const program = (spaces: Partial<SpaceProgram['spaces'][number]>[]): SpaceProgram =>
  ({
    schema_version: '1.0.0',
    brief_ref: `sha256:${'a'.repeat(64)}`,
    spaces: spaces.map((s) => ({ min_area_m2: 6, priority: 1, ...s })),
  }) as SpaceProgram;

describe('compareProgramsById', () => {
  it('ghép theo id, chỉ một bên có thì cột kia rỗng, sắp theo tầng', () => {
    const rows = compareProgramsById(
      program([
        { id: 'living_1', type: 'living', floor: 1, target_area_m2: 22 },
        { id: 'storage_1', type: 'storage', floor: 2, target_area_m2: 4 },
      ]),
      program([
        { id: 'living_1', type: 'living', floor: 1, target_area_m2: 28 },
        { id: 'study_1', type: 'study', floor: 2, target_area_m2: 9 },
      ]),
    );
    expect(rows).toEqual([
      { key: 'living_1', type: 'living', floor: 1, solver_m2: 22, ai_m2: 28 },
      { key: 'storage_1', type: 'storage', floor: 2, solver_m2: 4, ai_m2: null },
      { key: 'study_1', type: 'study', floor: 2, solver_m2: null, ai_m2: 9 },
    ]);
  });
});
