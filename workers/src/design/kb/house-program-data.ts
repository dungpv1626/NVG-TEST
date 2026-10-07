/**
 * Điểm nạp DUY NHẤT của `kb/house_program.yaml` và `kb/furniture.yaml` vào bản dựng Worker — xem `construction-data.ts`.
 */

import furnitureYaml from '../../../../kb/furniture.yaml';
import programYaml from '../../../../kb/house_program.yaml';
import {
  parseFurniture,
  parseHouseProgram,
  type FurnitureSpec,
  type HouseProgramSpec,
} from './house-program';

let program: HouseProgramSpec | undefined;
let furniture: FurnitureSpec | undefined;

export function houseProgramSpec(): HouseProgramSpec {
  if (!program) program = parseHouseProgram(programYaml as unknown as string);
  return program;
}

export function furnitureSpec(): FurnitureSpec {
  if (!furniture) furniture = parseFurniture(furnitureYaml as unknown as string);
  return furniture;
}
