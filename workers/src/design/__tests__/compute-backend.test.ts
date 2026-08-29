/**
 * Ranh giới Worker ↔ Container cho bước số hoá (Mốc 3).
 *
 * Thứ đáng kiểm ở đây không phải "gọi được", mà là **phân loại lỗi**. Workflow quyết định
 * thử lại hay dừng dựa hẳn vào loại lỗi ném ra; nhầm một chỗ thì hoặc nó đốt bốn lượt thử
 * vào một tệp PDF, hoặc nó bỏ cuộc ngay lần đầu container còn đang khởi động.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cadExtractionSchema } from '@nvg/shared/design';
import {
  ComputeUnavailable,
  HttpComputeBackend,
  UnconfiguredComputeBackend,
} from '../compute-backend';

const BASE = 'http://localhost:8080';

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(handler);
  vi.stubGlobal('fetch', spy as unknown as typeof fetch);
  return spy;
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const EXTRACTION = {
  schema_version: '1.0.0',
  source_file: 'mb-tang-1.dxf',
  units: 'mm',
  units_assumed: false,
  rooms: [
    {
      polygon_m: [
        [0, 0],
        [5, 0],
        [5, 6],
        [0, 6],
      ],
      area_m2: 30,
      layer: 'A-AREA-ROOM',
      label_raw: 'PHONG KHACH',
      label_source: 'contains',
    },
  ],
  columns_m: [],
  site_boundary_m: null,
  unmatched_labels: [],
  layers_seen: ['A-AREA-ROOM'],
  layers_unmapped: [],
  warnings: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('trích bản vẽ', () => {
  it('gửi tệp bằng multipart, giữ nguyên tên tệp', async () => {
    const spy = stubFetch(() => ok({ status: 'ok', extraction: EXTRACTION }));
    const backend = new HttpComputeBackend(BASE);

    await backend.extract({ name: 'mb-tang-1.dxf', bytes: new Uint8Array([1, 2, 3]) });

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/extract`);
    const form = init.body as FormData;
    expect((form.get('file') as File).name).toBe('mb-tang-1.dxf');
  });

  it('chỉ gửi phần dữ liệu của khung nhìn, không gửi cả vùng đệm', async () => {
    // Một `Uint8Array` có thể chỉ phủ một đoạn của vùng đệm. Gửi cả vùng đệm là gửi kèm dữ
    // liệu không thuộc tệp — với hồ sơ khách hàng thì đó là rò rỉ, không chỉ là lãng phí.
    const spy = stubFetch(() => ok({ status: 'ok', extraction: EXTRACTION }));
    const view = new Uint8Array(new ArrayBuffer(64), 8, 4);
    view.set([9, 9, 9, 9]);

    await new HttpComputeBackend(BASE).extract({ name: 'a.dxf', bytes: view });

    const form = spy.mock.calls[0]![1].body as FormData;
    expect((form.get('file') as File).size).toBe(4);
  });

  it('kết quả khớp hợp đồng đã sinh từ JSON Schema', async () => {
    stubFetch(() => ok({ status: 'ok', extraction: EXTRACTION }));
    const { extraction } = await new HttpComputeBackend(BASE).extract({
      name: 'a.dxf',
      bytes: new Uint8Array([1]),
    });
    expect(cadExtractionSchema.safeParse(extraction).success).toBe(true);
  });

  it('tệp sai định dạng là lỗi dữ liệu — KHÔNG thử lại', async () => {
    stubFetch(
      () => new Response('{"error":"phần mở rộng .pdf","retryable": false}', { status: 422 }),
    );
    await expect(
      new HttpComputeBackend(BASE).extract({ name: 'x.pdf', bytes: new Uint8Array([1]) }),
    ).rejects.not.toBeInstanceOf(ComputeUnavailable);
  });

  it('container đang khởi động là lỗi đáng thử lại', async () => {
    stubFetch(() => new Response('sập', { status: 502 }));
    await expect(
      new HttpComputeBackend(BASE).extract({ name: 'a.dxf', bytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(ComputeUnavailable);
  });

  it('bản triển khai thiếu ODA thì KHÔNG thử lại, dù mã là 503', async () => {
    // Đây là vấn đề triển khai, không phải sự cố tạm thời. Suy đoán chỉ từ mã trạng thái sẽ
    // khiến Workflow thử lại bốn lần rồi vẫn hỏng — Container nói rõ trong thân phản hồi.
    stubFetch(
      () =>
        new Response('{"error":"chưa có ODA File Converter. Xem kb/vendor","retryable": false}', {
          status: 503,
        }),
    );
    await expect(
      new HttpComputeBackend(BASE).extract({ name: 'a.dwg', bytes: new Uint8Array([1]) }),
    ).rejects.not.toBeInstanceOf(ComputeUnavailable);
  });

  it('mạng hỏng là lỗi đáng thử lại', async () => {
    stubFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      new HttpComputeBackend(BASE).extract({ name: 'a.dxf', bytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(ComputeUnavailable);
  });
});

describe('lắp bản ghi Knowledge Base', () => {
  it('gửi các bản trích nguyên vẹn và trả về cả danh sách phép kiểm', async () => {
    const spy = stubFetch(() =>
      ok({
        status: 'ok',
        record: { quality_score: 0.62 },
        checks: [{ code: 'slicing_tree', outcome: 'fail', detail: 'không thuộc lớp slicing' }],
      }),
    );

    const result = await new HttpComputeBackend(BASE).buildKbRecord({
      tenant_id: '00000000-0000-0000-0000-000000000001',
      project_code: 'NVO-015',
      building_type: 'nha_pho',
      site: { width_m: 5, depth_m: 16 },
      plans: [EXTRACTION],
    });

    // Container không giữ trạng thái: bản trích phải quay lại đúng như lúc nhận được.
    const sent = JSON.parse(spy.mock.calls[0]![1].body as string);
    expect(sent.plans[0]).toEqual(EXTRACTION);
    expect(result.checks[0]!.outcome).toBe('fail');
  });
});

describe('chưa cấu hình Container', () => {
  it('mọi lời gọi đều báo cách khắc phục, không im lặng trả dữ liệu giả', async () => {
    const backend = new UnconfiguredComputeBackend();
    for (const call of [
      () => backend.extract(),
      () => backend.buildKbRecord(),
      () => backend.solve(),
    ]) {
      await expect(call()).rejects.toThrow('DESIGN_COMPUTE_URL');
    }
  });
});
