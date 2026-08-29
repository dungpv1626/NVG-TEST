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
import { mergePacks, parseRuleFile, RulePack } from '../program/rule-pack';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf-8');

const BASE = [
  'rules/base/00-meta.yaml',
  'rules/base/10-dimensions.yaml',
  'rules/base/20-daylight-access.yaml',
  'rules/base/30-adjacency.yaml',
  'rules/base/40-vertical.yaml',
];

const LOCALITY: Record<string, string[]> = {
  thai_binh: ['rules/locality/thai-binh/00-meta.yaml', 'rules/locality/thai-binh/10-massing.yaml'],
};

export function testRulePack(locality = 'thai_binh'): RulePack {
  const files = LOCALITY[locality];
  return new RulePack(
    mergePacks(
      BASE.flatMap((f) => parseRuleFile(read(f), f)),
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
