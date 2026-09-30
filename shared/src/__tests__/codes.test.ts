/**
 * Bộ mã thống nhất — `doc/BO_MA.md`, migration 0132.
 *
 * Ba nhóm phép thử:
 *  1. Dạng mã của từng họ, đọc ngược được.
 *  2. `RECORD_TYPES` khớp đúng những loại CSDL và giao diện đang cấp — hai bên khai lệch thì
 *     một loại mã hoặc không kiểm dạng được, hoặc khai ra mà không ai cấp.
 *  3. Không màn hình nào tự đặt mã cho khách hàng, nhà cung cấp, tài sản.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildCatalogCode,
  buildRecordCode,
  CATALOG_TYPES,
  parseCatalogCode,
  parseRecordCode,
  RECORD_TYPES,
} from '../codes';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function filesUnder(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') return [];
    return statSync(full).isDirectory() ? filesUnder(full, ext) : ext.test(name) ? [full] : [];
  });
}

describe('mã hồ sơ giao dịch — {PHÁP NHÂN}-{LOẠI}-{NĂM}-{4 số}', () => {
  it('dựng và đọc ngược', () => {
    const code = buildRecordCode('NVC', 'TS', 2026, 7);
    expect(code).toBe('NVC-TS-2026-0007');
    expect(parseRecordCode(code)).toEqual({ company: 'NVC', type: 'TS', year: 2026, sequence: 7 });
  });

  it('không nhận loại danh mục chung — khách hàng không mang pháp nhân', () => {
    expect(parseRecordCode('NVC-KH-2026-0002')).toBeNull();
    expect(parseRecordCode('NVC-NCC-2026-0001')).toBeNull();
  });
});

describe('mã danh mục dùng chung — {LOẠI}-{5 số}', () => {
  it('dựng và đọc ngược', () => {
    expect(buildCatalogCode('KH', 1)).toBe('KH-00001');
    expect(buildCatalogCode('NCC', 42)).toBe('NCC-00042');
    expect(parseCatalogCode('ncc-00042')).toEqual({ type: 'NCC', sequence: 42 });
  });

  it('vượt 99.999 thì dài thêm, không quay vòng', () => {
    expect(buildCatalogCode('KH', 123456)).toBe('KH-123456');
    expect(parseCatalogCode('KH-123456')).toEqual({ type: 'KH', sequence: 123456 });
  });

  it('bác dạng có nhóm hàng hoặc có pháp nhân', () => {
    expect(parseCatalogCode('NCC-THEP-001')).toBeNull();
    expect(parseCatalogCode('NVC-KH-2026-0002')).toBeNull();
    expect(parseCatalogCode('KH-0001')).toBeNull();
  });

  it('hai họ không trùng tiền tố', () => {
    for (const type of Object.keys(CATALOG_TYPES)) expect(RECORD_TYPES).not.toHaveProperty(type);
  });
});

describe('RECORD_TYPES khớp với nơi cấp mã', () => {
  // Loại mã được cấp ở CSDL (`next_record_code` / `issue_record_code` với tham số chữ) và ở
  // giao diện (`rpc('next_record_code', { p_record_type: '…' })`).
  const issued = new Set<string>();
  for (const file of filesUnder(join(ROOT, 'db/migrations'), /\.sql$/)) {
    const sql = readFileSync(file, 'utf8');
    for (const m of sql.matchAll(/(?:next|issue)_record_code\(\s*[^,()]+,\s*'([A-Z]{2,5})'/g))
      issued.add(m[1]!);
    for (const m of sql.matchAll(/THEN '(DNT[TU])'/g)) issued.add(m[1]!);
  }
  for (const file of filesUnder(join(ROOT, 'web/src'), /\.tsx?$/)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/p_record_type: '([A-Z]{2,5})'/g))
      issued.add(m[1]!);
  }

  it('đọc được danh sách loại đang cấp', () => {
    expect(issued.size).toBeGreaterThan(10);
  });

  it('mọi loại đang cấp đều được khai', () => {
    const undeclared = [...issued].filter((t) => !(t in RECORD_TYPES));
    expect(undeclared, 'loại mã CSDL/giao diện cấp mà RECORD_TYPES không khai').toEqual([]);
  });

  it('không loại danh mục chung nào còn cấp theo pháp nhân', () => {
    for (const type of Object.keys(CATALOG_TYPES)) expect(issued).not.toContain(type);
  });
});

describe('không màn hình nào tự đặt mã khách hàng, nhà cung cấp, tài sản', () => {
  // CSDL đã ghi đè mã do người dùng gửi (0132). Phép thử này canh phía giao diện: không còn ô
  // nhập mã, không còn lượt tự xin mã, để người dùng không gõ một thứ rồi thấy một thứ khác.
  const CREATE_SCREENS = [
    'web/src/pages/crm/customer-create.tsx',
    'web/src/pages/mh/supplier-list.tsx',
    'web/src/pages/ns/asset-page.tsx',
    'web/src/hooks/use-hr.ts',
  ];
  const SELF_CODED = [
    /name="code"/,
    /\bsetCode\(/,
    /p_record_type: '(KH|NCC|TS)'/,
    /NCC-THEP/,
    /code: input\.code/,
    /code: String\(form\.get\('code'\)/,
  ];

  it.each(CREATE_SCREENS)('%s', (file) => {
    const text = readFileSync(join(ROOT, file), 'utf8');
    expect(SELF_CODED.filter((re) => re.test(text)).map(String)).toEqual([]);
  });
});
