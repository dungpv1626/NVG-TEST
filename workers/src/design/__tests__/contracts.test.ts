/**
 * Hợp đồng dữ liệu và tính idempotent của mã băm artifact.
 *
 * Chạy hoàn toàn trong bộ nhớ, không chạm CSDL — đây là phần kiểm thử phải nhanh vì nó chạy
 * mỗi lần sửa `contracts/`. Các ca của bộ giải nội bộ (bước pipeline, mặt bằng, phát hành) đã gỡ
 * cùng bộ giải (T58).
 */

import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_ID_PATTERN,
  artifactId,
  canonicalJson,
  paramsHash,
  publishCapability,
  writeCapability,
} from '@nvg/shared/design';
import { ContractError, parseArtifact } from '../contracts';

const BRIEF = {
  schema_version: '1.0.0',
  project_id: '11111111-1111-4111-8111-111111111111',
  building_type: 'nha_pho',
  locality: 'hung_yen',
  site: { width_m: 5, depth_m: 18 },
  floors: 3,
} as const;

describe('Chuẩn hoá JSON và mã băm artifact', () => {
  it('sắp xếp khoá nên thứ tự dựng đối tượng không đổi mã băm', async () => {
    const a = { b: 1, a: { d: 4, c: 3 } };
    const b = { a: { c: 3, d: 4 }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(await artifactId(a)).toBe(await artifactId(b));
  });

  it('coi khoá gán undefined như khoá không tồn tại', async () => {
    // `JSON.stringify` bỏ qua `undefined`, nên nếu không loại sớm thì hai đối tượng cho ra
    // cùng chuỗi nhưng người đọc mã lại tưởng chúng khác nhau. Chốt hành vi này lại.
    expect(await artifactId({ a: 1, b: undefined })).toBe(await artifactId({ a: 1 }));
  });

  it('sinh mã đúng định dạng khoá chính của bảng artifact', async () => {
    expect(await artifactId(BRIEF)).toMatch(ARTIFACT_ID_PATTERN);
  });

  it('đổi nội dung là đổi mã băm', async () => {
    expect(await artifactId(BRIEF)).not.toBe(await artifactId({ ...BRIEF, floors: 4 }));
  });

  it('từ chối băm số không hữu hạn thay vì lặng lẽ ghi null', () => {
    // `JSON.stringify(NaN)` ra `null`. Ghi im lặng nghĩa là một artifact bất biến chứa dữ
    // liệu sai và không sửa được.
    expect(() => canonicalJson({ area: Number.NaN })).toThrow(/không hữu hạn/);
  });

  it('băm cấu hình không mang tiền tố sha256 vì nó không phải mã artifact', async () => {
    const hash = await paramsHash({ locality: 'hung_yen' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Kiểm tra ở ranh giới', () => {
  it('nhận đầu bài hợp lệ', () => {
    expect(parseArtifact('design_brief', BRIEF).floors).toBe(3);
  });

  it('từ chối mã dự án không phải UUID', () => {
    expect(() => parseArtifact('design_brief', { ...BRIEF, project_id: 'NVO-028' })).toThrow(
      ContractError,
    );
  });

  it('lỗi hợp đồng tự khai là không đáng thử lại', () => {
    // Workflow đọc cờ này để không đốt bốn lần thử vào một lỗi cấu trúc.
    try {
      parseArtifact('design_brief', {});
    } catch (error) {
      expect((error as ContractError).retryable).toBe(false);
      return;
    }
    throw new Error('Lẽ ra phải ném lỗi hợp đồng.');
  });
});

describe('Tên quyền', () => {
  it('quyền ghi và quyền ký là hai quyền khác nhau cho cùng một bộ môn', () => {
    // Vẽ được không có nghĩa là ký được — chữ ký là trách nhiệm chuyên môn.
    expect(writeCapability('ket_cau')).toBe('design.write.ket_cau');
    expect(publishCapability('ket_cau')).toBe('design.publish.ket_cau');
    expect(writeCapability('ket_cau')).not.toBe(publishCapability('ket_cau'));
  });
});
