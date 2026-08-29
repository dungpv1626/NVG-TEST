/**
 * Hợp đồng dữ liệu và tính idempotent của mã băm artifact.
 *
 * Chạy hoàn toàn trong bộ nhớ, không chạm CSDL — đây là phần kiểm thử phải nhanh vì nó chạy
 * mỗi lần sửa `contracts/`.
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
import { ContractError, parseArtifact, parseRequest } from '../contracts';
import {
  stubArchModel,
  stubLayoutIntent,
  stubRenderResult,
  stubSpaceProgram,
} from '../workflows/steps';

const REF = `sha256:${'a'.repeat(64)}`;

const BRIEF = {
  schema_version: '1.0.0',
  project_id: '11111111-1111-4111-8111-111111111111',
  building_type: 'nha_pho',
  locality: 'thai_binh',
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
    const hash = await paramsHash({ locality: 'thai_binh' });
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

  it('từ chối nút cây lai giữa hai dạng', () => {
    // Cây chia đệ quy không sinh được khe hở hay chồng lấn — nhưng chỉ khi mỗi nút đúng MỘT
    // dạng. Nút lai phá đúng tính chất đó.
    expect(() =>
      parseArtifact('layout_intent', {
        schema_version: '1.0.0',
        program_ref: REF,
        variant_id: 'A',
        massing: { wings: [{ id: 'W1' }] },
        cores: [{ id: 'C1', wing: 'W1' }],
        floors: [
          {
            level: 1,
            wings: [
              {
                wing_id: 'W1',
                tree: { split: 'H', room: 'x', a: { room: 'a' }, b: { room: 'b' } },
              },
            ],
          },
        ],
      }),
    ).toThrow(ContractError);
  });

  it('từ chối mặt bằng thiếu phiên bản rule pack', () => {
    expect(() =>
      parseArtifact('floor_plan', {
        schema_version: '1.0.0',
        intent_ref: REF,
        site: { width_m: 5, depth_m: 18 },
        levels: [{ level: 1, rooms: [] }],
        constraint_report: { status: 'pass' },
      }),
    ).toThrow(/rule_pack_version/);
  });

  it('từ chối phát hành gộp nhiều bộ môn', () => {
    // Hợp đồng chỉ nhận MỘT giá trị `discipline`. Ký gộp là không kiểm được ai chịu trách
    // nhiệm phần nào (03-data-contracts 3.8b).
    expect(() =>
      parseRequest('publish_request', {
        schema_version: '1.0.0',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        project_id: '22222222-2222-4222-8222-222222222222',
        artifact_ids: { floor_plan: REF },
        discipline: ['kien_truc', 'ket_cau'],
        documents: [{ kind: 'dxf', name: 'MatBang', uri: 'supabase://x/y.dxf' }],
        signed_by: '33333333-3333-4333-8333-333333333333',
      }),
    ).toThrow(ContractError);
  });

  it('từ chối phát hành không có artifact nguồn', () => {
    expect(() =>
      parseRequest('publish_request', {
        schema_version: '1.0.0',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        project_id: '22222222-2222-4222-8222-222222222222',
        artifact_ids: {},
        discipline: 'kien_truc',
        documents: [{ kind: 'dxf', name: 'MatBang', uri: 'supabase://x/y.dxf' }],
        signed_by: '33333333-3333-4333-8333-333333333333',
      }),
    ).toThrow(ContractError);
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

describe('Bước stub của khung xương', () => {
  it('mọi stub sinh ra dữ liệu ĐÚNG hợp đồng', () => {
    const program = stubSpaceProgram(BRIEF, REF);
    const intent = stubLayoutIntent(program.payload, REF);
    const plan = parseArtifact('floor_plan', {
      schema_version: '1.0.0',
      intent_ref: REF,
      rule_pack_version: '2026.08.1',
      site: { width_m: 5, depth_m: 18 },
      levels: [{ level: 1, height_m: 3.4, rooms: [] }],
      constraint_report: { status: 'pass' },
    });
    const arch = stubArchModel(plan, REF);

    expect(program.stub).toBe(true);
    expect(intent.payload.floors).toHaveLength(3);
    expect(arch.payload.massing.levels[0]?.extrude_to_m).toBeCloseTo(3.4);
  });

  it('stub sinh ảnh trả danh sách RỖNG, không trả ảnh giả', () => {
    // Ảnh giả đã đóng dấu sẽ lẫn được với ảnh thật; không có ảnh thì không có gì để lẫn.
    expect(stubRenderResult().payload.images).toHaveLength(0);
  });

  it('stub bố cục vẫn không sinh toạ độ hay kích thước', () => {
    // Nguyên tắc bất biến số 2 áp dụng cho MỌI thứ đứng ở vị trí của mô hình ngôn ngữ,
    // kể cả mã tạm.
    const program = stubSpaceProgram(BRIEF, REF);
    const json = JSON.stringify(stubLayoutIntent(program.payload, REF).payload);
    for (const forbidden of ['x_m', 'y_m', 'polygon', 'area_m2', 'width_m']) {
      expect(json).not.toContain(forbidden);
    }
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
