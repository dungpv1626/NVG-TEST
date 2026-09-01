/**
 * Pipeline số hoá — phần nghiệp vụ của từng bước.
 *
 * Yêu cầu quan trọng nhất của tài liệu ở mốc này là **một tệp lỗi không giết cả mẻ**
 * (`06-knowledge-base.md` 6.1). Nó không phải một dòng mã, nó là một cách phân loại lỗi: sự
 * cố tạm thời phải ném tiếp để Workflow thử lại, còn tệp hỏng phải được ghi nhận và đi tiếp.
 * Lẫn hai loại theo bất kỳ chiều nào cũng hỏng: bắt tất thì một lần mạng chập biến thành
 * "hồ sơ hỏng" vĩnh viễn; ném tất thì một tệp PDF gửi nhầm vứt bỏ công của chín tệp trước.
 */

import { describe, expect, it } from 'vitest';
import { isDuplicateKey } from '../artifact-store';
import { ComputeUnavailable, type ComputeBackend } from '../compute-backend';
import { hashBytes, safeFileName, type SourceFileStore } from '../source-files';
import {
  assembleRecordRequest,
  extractSource,
  type DigitiseParams,
  type SourceOutcome,
} from '../workflows/digitise-steps';

const SOURCE = {
  uri: 'supabase://design-sources/abc/mb-tang-1.dxf',
  name: 'mb-tang-1.dxf',
  level: 1,
};

const store: SourceFileStore = {
  async get() {
    return new Uint8Array([1, 2, 3]);
  },
  async put(name, data) {
    return {
      uri: `supabase://design-sources/x/${name}`,
      contentHash: 'sha256:0',
      name,
      bytes: data.byteLength,
    };
  },
};

function backend(overrides: Partial<ComputeBackend> = {}): ComputeBackend {
  return {
    name: 'gia-lap',
    async health() {
      return true;
    },
    async solve() {
      throw new Error('không dùng');
    },
    async exportDxf() {
      throw new Error('không dùng');
    },
    async extract() {
      return { status: 'ok', extraction: { rooms: [] } };
    },
    async buildKbRecord() {
      return { status: 'ok', record: {}, checks: [] };
    },
    ...overrides,
  };
}

const params: DigitiseParams = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  companyId: '00000000-0000-0000-0000-000000000002',
  projectCode: 'NVO-015',
  buildingType: 'nha_pho',
  discipline: 'kien_truc',
  site: { width_m: 5, depth_m: 16 },
  sources: [SOURCE],
};

const okOutcome = (level: number, marker: string): SourceOutcome => ({
  status: 'ok',
  source: { ...SOURCE, level, name: `mb-tang-${level}.dxf` },
  extractionJson: JSON.stringify({ marker }),
});

describe('trích một tệp', () => {
  it('trả về bản trích khi thuận lợi', async () => {
    const result = await extractSource(store, backend(), SOURCE);
    expect(result.status).toBe('ok');
  });

  it('tệp hỏng được ghi nhận, KHÔNG ném ra — mẻ vẫn chạy tiếp', async () => {
    const result = await extractSource(
      store,
      backend({
        async extract() {
          throw new Error('Không trích được bản vẽ mb-tang-1.dxf (422).');
        },
      }),
      SOURCE,
    );
    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ error: expect.stringContaining('422') });
  });

  it('sự cố tạm thời được ném tiếp để Workflow thử lại', async () => {
    // Bắt lại ở đây sẽ biến một lần container khởi động chậm thành "hồ sơ hỏng" vĩnh viễn.
    await expect(
      extractSource(
        store,
        backend({
          async extract() {
            throw new ComputeUnavailable('container đang khởi động');
          },
        }),
        SOURCE,
      ),
    ).rejects.toBeInstanceOf(ComputeUnavailable);
  });

  it('không đọc được tệp trong kho cũng là lỗi của tệp đó, không phải của cả mẻ', async () => {
    const result = await extractSource(
      {
        ...store,
        async get() {
          throw new Error('Không đọc được tệp nguồn (404).');
        },
      },
      backend(),
      SOURCE,
    );
    expect(result.status).toBe('failed');
  });
});

describe('gom thành yêu cầu lắp bản ghi', () => {
  it('xếp tầng theo `level`, không theo thứ tự tải lên', () => {
    // Phép đối chiếu giữa các tầng so tầng trên với TẦNG TRỆT. Xếp sai thứ tự sẽ cho kết luận
    // "tầng trên rộng bất thường" hoàn toàn sai.
    const request = assembleRecordRequest(params, [
      okOutcome(3, 'c'),
      okOutcome(1, 'a'),
      okOutcome(2, 'b'),
    ]);
    expect(request.plans.map((p) => (p as { marker: string }).marker)).toEqual(['a', 'b', 'c']);
  });

  it('bỏ qua tệp hỏng và vẫn lắp được bản ghi từ phần còn lại', () => {
    const request = assembleRecordRequest(params, [
      okOutcome(1, 'a'),
      { status: 'failed', source: { ...SOURCE, level: 2 }, error: 'hỏng' },
    ]);
    expect(request.plans).toHaveLength(1);
  });

  it('không tệp nào trích được thì dừng, và nói rõ xem lý do ở đâu', () => {
    expect(() =>
      assembleRecordRequest(params, [{ status: 'failed', source: SOURCE, error: 'hỏng' }]),
    ).toThrow(/NVO-015/);
  });

  it('chuyển tiếp mã phòng đã chuẩn hoá và cờ có đầu bài', () => {
    const request = assembleRecordRequest(
      { ...params, roomTypes: [['living']], hasBrief: true, projectId: null },
      [okOutcome(1, 'a')],
    );
    expect(request.room_types).toEqual([['living']]);
    expect(request.has_brief).toBe(true);
  });
});

describe('kho tệp nguồn', () => {
  it('băm nội dung để gộp bản trùng — cùng nội dung, cùng khoá', async () => {
    // Bước 0 của tài liệu: một bản vẽ nằm ở ba thư mục dự án chỉ chiếm chỗ một lần.
    const a = await hashBytes(new Uint8Array([1, 2, 3]));
    const b = await hashBytes(new Uint8Array([1, 2, 3]));
    const c = await hashBytes(new Uint8Array([1, 2, 4]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('tên tệp tiếng Việt có dấu thành đường dẫn an toàn', () => {
    expect(safeFileName('NVO026_NhàAnhA_KT_MặtBằng_V03.dwg')).toBe(
      'NVO026_NhaAnhA_KT_MatBang_V03.dwg',
    );
  });

  it('tên chỉ toàn ký tự lạ vẫn cho ra một tên dùng được', () => {
    expect(safeFileName('///')).toBe('ban-ve');
  });
});

describe('nhận diện khoá đã tồn tại', () => {
  it('Supabase đặt mã 409 trong THÂN phản hồi, không ở dòng trạng thái', async () => {
    // Bug thật, dựng lại được bằng curl (29/08/2026): tải lại đúng tệp đã có trả HTTP 400
    // kèm `{"statusCode":"409","code":"KeyAlreadyExists"}`. Kiểm `res.status === 409` thì
    // nhánh "đã tồn tại" không bao giờ chạy, và mọi lần ghi lặp nội dung y hệt đều hỏng —
    // đúng thứ kho băm nội dung sinh ra để tránh.
    const res = new Response('{"statusCode":"409","error":"Duplicate","code":"KeyAlreadyExists"}', {
      status: 400,
    });
    expect(await isDuplicateKey(res)).toBe(true);
  });

  it('vẫn nhận mã 409 thật, phòng khi Supabase đổi cách trả', async () => {
    expect(await isDuplicateKey(new Response('', { status: 409 }))).toBe(true);
  });

  it('lỗi 400 khác KHÔNG bị coi là trùng khoá', async () => {
    const res = new Response('{"statusCode":"400","code":"InvalidRequest"}', { status: 400 });
    expect(await isDuplicateKey(res)).toBe(false);
  });

  it('thân phản hồi không phải JSON cũng không làm hàm nổ', async () => {
    expect(await isDuplicateKey(new Response('<html>lỗi cổng</html>', { status: 400 }))).toBe(
      false,
    );
  });
});
