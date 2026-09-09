/**
 * Nạp rule pack và chuẩn diện tích THẬT từ đĩa cho kiểm thử.
 *
 * Vì sao đọc tệp thật chứ không dựng dữ liệu giả: hai tệp YAML đó chính là thứ quyết định
 * chương trình không gian. Kiểm thử trên dữ liệu tự dựng chỉ chứng minh mã chạy đúng với dữ
 * liệu tự dựng — nó không bắt được một tệp chuẩn thiếu trường, một dải bề rộng khai lệch,
 * hay một quy tắc mới sai định dạng. Bản dựng Worker nhúng tệp qua esbuild; ở đây đọc bằng
 * `node:fs` để cùng nội dung đi qua cùng đoạn phân tích.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSpaceNorms, type SpaceNorms } from '../program/norms';
import { mergePacks, parseRuleFile, RulePack } from '../rules/rule-pack';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf-8');

const BASE = [
  'rules/base/00-meta.yaml',
  'rules/base/10-dimensions.yaml',
  'rules/base/20-daylight-access.yaml',
  'rules/base/30-adjacency.yaml',
  'rules/base/40-vertical.yaml',
  'rules/base/50-massing.yaml',
];

/**
 * Gói kinh nghiệm nghề của NVG, tách khỏi `rules/base/` ngày 09/09/2026.
 *
 * Bộ giải nhận CẢ HAI gói gộp lại, đúng như `rulePackFor()` thật làm — tách tệp là để nhánh
 * AI và màn hình phân biệt được nguồn cảnh báo, không phải để đổi hành vi bộ giải.
 */
const NVG = ['rules/nvg-experience.yaml'];

/**
 * Gói địa phương dùng trong kiểm thử.
 *
 * RỖNG, giống `LOCALITY_FILES` thật: chưa tỉnh nào có văn bản quy hoạch riêng. Giữ lại cơ
 * chế thay vì xoá — nó là chỗ khai gói đầu tiên khi có văn bản, và `mergePacks` vẫn phải
 * chạy đúng ở nhánh rỗng.
 */
const LOCALITY: Record<string, string[]> = {};

export function testRulePack(locality = 'hung_yen'): RulePack {
  const files = LOCALITY[locality];
  return new RulePack(
    mergePacks(
      mergePacks(
        BASE.flatMap((f) => parseRuleFile(read(f), f)),
        NVG.flatMap((f) => parseRuleFile(read(f), f)),
      ),
      (files ?? []).flatMap((f) => parseRuleFile(read(f), f)),
    ),
    files === undefined,
  );
}

export function testNorms(): SpaceNorms {
  return parseSpaceNorms(read('kb/space_norms.yaml'));
}

export function testVocabularyYaml(): string {
  return read('kb/room_vocabulary.yaml');
}

export function testSiteContextYaml(): string {
  return read('kb/site_context.yaml');
}
