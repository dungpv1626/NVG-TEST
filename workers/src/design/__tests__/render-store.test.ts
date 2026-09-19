/**
 * Kho ảnh `render-store.ts` — chạy hoàn toàn bằng `fetch` giả, không chạm mạng.
 *
 * Ba thứ đáng canh ở đây, và cả ba đều là loại HỎNG IM LẶNG:
 *  · Supabase trả **HTTP 400** kèm mã 409 trong THÂN khi khoá đã tồn tại. Đọc sai chỗ thì mọi
 *    lần ghi lặp một nội dung y hệt đều hỏng — đúng thứ kho băm nội dung sinh ra để tránh.
 *  · Khoá phải bắt đầu bằng mã hồ sơ, nếu không policy đọc của bucket không khớp.
 *  · Khoá phải theo BĂM NỘI DUNG, nếu không lần vẽ lại sẽ đụng khoá cũ và artifact mới trỏ
 *    vào byte cũ.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderStoreError, SupabaseRenderStore, renderKey } from '../render-store';
import type { DesignEnv } from '../env';

const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'khoá-giả',
} as unknown as DesignEnv;

const PROJECT = '11111111-1111-4111-8111-111111111111';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `fetch` giả ghi lại mọi lượt gọi và trả về phản hồi do phép thử dựng sẵn. */
function stubFetch(reply: () => Response): Array<{ url: string; init: RequestInit }> {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(reply());
  });
  return calls;
}

describe('Khoá lưu ảnh', () => {
  it('bắt đầu bằng mã hồ sơ để policy đọc của bucket khớp được', async () => {
    const key = await renderKey(PROJECT, 'plan-sheet', PNG, 'image/png');
    expect(key.startsWith(`${PROJECT}/`)).toBe(true);
    expect(key).toMatch(/^[^/]+\/plan-sheet\/[0-9a-f]{64}\.png$/);
  });

  it('đổi theo NỘI DUNG, nên vẽ lại cùng một tầng không đụng khoá cũ', async () => {
    const a = await renderKey(PROJECT, 'plan-sheet', PNG, 'image/png');
    const b = await renderKey(PROJECT, 'plan-sheet', new Uint8Array([...PNG, 9]), 'image/png');
    expect(a).not.toBe(b);
  });

  it('cùng byte cho cùng khoá — trùng khoá khi ấy là vô hại', async () => {
    const a = await renderKey(PROJECT, 'plan-sheet', PNG, 'image/png');
    const b = await renderKey(PROJECT, 'plan-sheet', new Uint8Array(PNG), 'image/png');
    expect(a).toBe(b);
  });

  it('lấy đuôi tệp theo kiểu ảnh', async () => {
    expect(await renderKey(PROJECT, 'g', PNG, 'image/jpeg')).toMatch(/\.jpg$/);
    expect(await renderKey(PROJECT, 'g', PNG, 'image/webp')).toMatch(/\.webp$/);
  });
});

describe('Ghi ảnh lên Supabase Storage', () => {
  it('gửi đúng bucket, đúng kiểu nội dung, và trả URI có scheme', async () => {
    const calls = stubFetch(() => new Response('{}', { status: 200 }));
    const store = new SupabaseRenderStore(ENV);
    const uri = await store.put(`${PROJECT}/plan-sheet/abc.png`, PNG, 'image/png');

    expect(uri).toBe(`supabase://design-renders/${PROJECT}/plan-sheet/abc.png`);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/storage/v1/object/design-renders/');
    expect((calls[0]!.init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });

  it('coi HTTP 400 mang mã 409 trong THÂN là ghi thành công', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ statusCode: '409', code: 'KeyAlreadyExists' }), {
          status: 400,
        }),
    );
    const store = new SupabaseRenderStore(ENV);
    await expect(store.put(`${PROJECT}/plan-sheet/abc.png`, PNG, 'image/png')).resolves.toContain(
      'supabase://',
    );
  });

  it('lỗi 400 THẬT vẫn là lỗi, và không đáng thử lại', async () => {
    stubFetch(() => new Response(JSON.stringify({ message: 'sai gì đó' }), { status: 400 }));
    const store = new SupabaseRenderStore(ENV);
    await expect(store.put(`${PROJECT}/x.png`, PNG, 'image/png')).rejects.toMatchObject({
      name: 'RenderStoreError',
      retryable: false,
    });
  });

  it('lỗi 5xx đáng thử lại', async () => {
    stubFetch(() => new Response('', { status: 503 }));
    const store = new SupabaseRenderStore(ENV);
    await expect(store.put(`${PROJECT}/x.png`, PNG, 'image/png')).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('từ chối kiểu ảnh bucket không nhận, TRƯỚC khi gọi mạng', async () => {
    const calls = stubFetch(() => new Response('{}', { status: 200 }));
    const store = new SupabaseRenderStore(ENV);
    await expect(store.put(`${PROJECT}/x.svg`, PNG, 'image/svg+xml')).rejects.toBeInstanceOf(
      RenderStoreError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('Đọc ảnh', () => {
  it('lấy kiểu ảnh từ HEADER phản hồi, không đoán theo đuôi tệp', async () => {
    stubFetch(
      () =>
        new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/webp; charset=x' } }),
    );
    const store = new SupabaseRenderStore(ENV);
    const image = await store.get(`supabase://design-renders/${PROJECT}/plan-sheet/abc.png`);
    expect(image.mime).toBe('image/webp');
    expect(new Uint8Array(image.bytes)).toEqual(PNG);
  });

  it('bỏ scheme rồi mới ghép địa chỉ đọc', async () => {
    const calls = stubFetch(() => new Response(PNG, { status: 200 }));
    const store = new SupabaseRenderStore(ENV);
    await store.get(`supabase://design-renders/${PROJECT}/a.png`);
    expect(calls[0]!.url).toBe(
      `https://example.supabase.co/storage/v1/object/design-renders/${PROJECT}/a.png`,
    );
  });
});

/**
 * `edgeTargets` — chọn artifact đáng đọc TRƯỚC khi trả tiền một lượt đọc kho.
 *
 * Canh ở đây vì đây là chỗ hỏng theo kiểu lớn dần: mỗi lần vẽ lại một tầng cộng thêm một lượt
 * tải tệp vào MỌI lần mở màn hình sau đó, và không có gì trông giống lỗi.
 */
describe('Chọn đích lineage mà không nạp payload', () => {
  it('trả về MỚI NHẤT trước, và không đụng tới kho đối tượng', async () => {
    const calls: string[] = [];
    const rows = [
      { id: 'sha256:b', kind: 'ai_plan_sheet_image', created_at: '2026-09-10T02:00:00Z' },
      { id: 'sha256:a', kind: 'ai_plan_sheet_image', created_at: '2026-09-10T01:00:00Z' },
    ];
    const db = {
      from(table: string) {
        calls.push(table);
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => Promise.resolve({ data: rows, error: null }),
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: [{ to_id: 'sha256:a' }, { to_id: 'sha256:b' }], error: null }),
        };
        return chain;
      },
    };
    const { ArtifactRepository } = await import('../artifacts');
    const repo = Object.create(ArtifactRepository.prototype) as InstanceType<
      typeof ArtifactRepository
    >;
    Object.defineProperty(repo, 'db', { value: db, writable: true });
    Object.defineProperty(repo, 'store', {
      value: {
        get: () => {
          throw new Error('edgeTargets KHÔNG được đọc kho');
        },
      },
      writable: true,
    });

    const out = await repo.edgeTargets('sha256:plan', 'ai_image_render');
    expect(out.map((row) => row.id)).toEqual(['sha256:b', 'sha256:a']);
    expect(calls).toEqual(['design_artifact_edge', 'design_artifact']);
  });

  it('không có cạnh nào thì KHÔNG hỏi bảng artifact', async () => {
    const calls: string[] = [];
    const db = {
      from(table: string) {
        calls.push(table);
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => Promise.resolve({ data: [], error: null }),
          then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
        };
        return chain;
      },
    };
    const { ArtifactRepository } = await import('../artifacts');
    const repo = Object.create(ArtifactRepository.prototype) as InstanceType<
      typeof ArtifactRepository
    >;
    Object.defineProperty(repo, 'db', { value: db, writable: true });
    expect(await repo.edgeTargets('sha256:plan', 'ai_image_render')).toEqual([]);
    expect(calls).toEqual(['design_artifact_edge']);
  });
});
