/**
 * Kho ẢNH do mô hình sinh — `RenderStore`.
 *
 * Tách khỏi `artifact-store.ts` chứ không mở rộng nó, vì ba lý do đều là ràng buộc chứ không
 * phải gu:
 *
 *  1. `ArtifactStore.put` nhận **chuỗi** và `get` trả **chuỗi**. Ảnh là nhị phân; đẩy nó qua
 *     một giao diện chuỗi là base64 hoá hai lần và phình 33% ở cả hai đầu.
 *  2. Hai kho có VÒNG ĐỜI khác nhau. Payload artifact là dữ liệu máy đọc, băm nội dung, bất
 *     biến. Ảnh là tệp lớn, có `file_size_limit` và `allowed_mime_types` riêng, và bucket của
 *     nó (`design-renders`) có policy đọc riêng — xem `db/migrations/0121_tk_ai_design.sql`.
 *  3. `artifact-store.ts` cứng bucket `design-artifacts` ở hằng mô-đun. Nới nó thành tham số
 *     là bắt mọi nơi gọi hiện có phải khai thêm một thứ chúng không có lựa chọn nào khác.
 *
 * Dùng lại `isDuplicateKey` và `splitUri` của tệp kia — **cố ý**. Bẫy «Supabase trả HTTP 400
 * mang mã 409 trong THÂN» giống hệt nhau ở cả hai kho; viết lại là tạo bản thực thi thứ hai
 * rồi một ngày nào đó chỉ sửa một bên.
 *
 * ⚠️ **Khoá đặt theo BĂM NỘI DUNG, không theo `(mặt bằng, tầng)`.** Mô hình ảnh không tất
 * định: vẽ lại cùng một tầng ra một tấm khác. Khoá theo cặp ấy thì lần chạy lại đụng khoá cũ,
 * Supabase báo trùng, mã coi là «đã có» và artifact MỚI trỏ vào byte CŨ — sai hoàn toàn im
 * lặng. Băm nội dung thì «trùng khoá» chỉ xảy ra khi byte y hệt, tức là vô hại.
 *
 * ⚠️ Khoá **phải** bắt đầu bằng mã hồ sơ: policy đọc của bucket lọc theo
 * `(storage.foldername(name))[1]`. Đặt sai tiền tố thì tệp ghi được nhưng không ai đọc được.
 */

import { isDuplicateKey, splitUri } from './artifact-store';
import type { DesignEnv } from './env';

const BUCKET = 'design-renders';

/** Kiểu ảnh bucket nhận — trùng `allowed_mime_types` khai ở migration 0121. */
const ALLOWED_MIME: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface RenderImage {
  bytes: ArrayBuffer;
  mime: string;
}

export interface RenderStore {
  /** Scheme mà adapter này sinh ra khi ghi mới. */
  readonly scheme: 'supabase' | 'r2';
  /** Ghi ảnh, trả về URI có scheme. `key` là đường dẫn tương đối, không có scheme. */
  put(key: string, bytes: Uint8Array, mime: string): Promise<string>;
  /** Đọc ảnh theo URI đầy đủ. */
  get(uri: string): Promise<RenderImage>;
}

export class RenderStoreError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'RenderStoreError';
    this.retryable = retryable;
  }
}

/** Đuôi tệp theo kiểu ảnh — Supabase và nhiều CDN đọc đuôi để đoán `Content-Type`. */
function extensionFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

/**
 * Khoá lưu của một tấm ảnh: `<mã hồ sơ>/<nhóm>/<băm nội dung>.<đuôi>`.
 *
 * `group` để hai loại ảnh của nhánh AI (tờ mặt bằng, bộ ảnh phối cảnh) không nằm lẫn trong
 * cùng một thư mục — chúng có vòng đời dọn dẹp khác nhau.
 */
export async function renderKey(
  projectId: string,
  group: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${projectId}/${group}/${hex}.${extensionFor(mime)}`;
}

function assertMime(mime: string): void {
  if (!ALLOWED_MIME.has(mime)) {
    throw new RenderStoreError(`Kiểu ảnh không lưu được: ${mime}. Nhận PNG, JPEG hoặc WebP.`);
  }
}

/**
 * Adapter Supabase Storage.
 *
 * Khoá `service_role` vượt RLS — chấp nhận được vì quyền đã kiểm ở lớp gọi TRƯỚC khi tới đây,
 * đúng khuôn `SupabaseArtifactStore`.
 */
export class SupabaseRenderStore implements RenderStore {
  readonly scheme = 'supabase' as const;

  constructor(private readonly env: DesignEnv) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  async put(key: string, bytes: Uint8Array, mime: string): Promise<string> {
    assertMime(mime);
    const url = `${this.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': mime },
      body: bytes as unknown as BodyInit,
    });
    // Trùng khoá là chuyện BÌNH THƯỜNG với khoá băm nội dung: cùng byte → cùng khoá → không
    // cần ghi lại. Xem `isDuplicateKey` về chỗ Supabase đặt mã 409.
    if (!res.ok && !(await isDuplicateKey(res))) {
      throw new RenderStoreError(`Không lưu được ảnh (${res.status}).`, res.status >= 500);
    }
    return `${this.scheme}://${BUCKET}/${key}`;
  }

  async get(uri: string): Promise<RenderImage> {
    const [, key] = splitUri(uri);
    const res = await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/${key}`, {
      headers: this.headers(),
    });
    if (!res.ok)
      throw new RenderStoreError(`Không đọc được ảnh (${res.status}).`, res.status >= 500);
    // Kiểu lấy từ header phản hồi, KHÔNG đoán từ đuôi tệp: đuôi do chính ta đặt lúc ghi, nên
    // tin nó là tin lại chính mình chứ không phải kiểm.
    const mime = res.headers.get('Content-Type')?.split(';')[0]?.trim() ?? 'image/png';
    return { bytes: await res.arrayBuffer(), mime };
  }
}

/** Adapter R2 — đích đến khi nâng gói Cloudflare, cùng khuôn `R2ArtifactStore`. */
export class R2RenderStore implements RenderStore {
  readonly scheme = 'r2' as const;

  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, bytes: Uint8Array, mime: string): Promise<string> {
    assertMime(mime);
    await this.bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    return `${this.scheme}://${BUCKET}/${key}`;
  }

  async get(uri: string): Promise<RenderImage> {
    const [, path] = splitUri(uri);
    const key = path.startsWith(`${BUCKET}/`) ? path.slice(BUCKET.length + 1) : path;
    const object = await this.bucket.get(key);
    if (!object) throw new RenderStoreError('Không tìm thấy ảnh trong kho.');
    return {
      bytes: await object.arrayBuffer(),
      mime: object.httpMetadata?.contentType ?? 'image/png',
    };
  }
}

/**
 * Chọn adapter theo cấu hình — cùng biến `DESIGN_ARTIFACT_STORE` với kho artifact.
 *
 * Một biến chứ không hai: hai kho luôn ở cùng một nền tảng, và hai công tắc cho một quyết định
 * là một cách để chúng lệch nhau mà không ai biết.
 */
export function createRenderStore(env: DesignEnv): RenderStore {
  if (env.DESIGN_ARTIFACT_STORE === 'r2') {
    if (!env.DESIGN_RENDERS) {
      throw new RenderStoreError(
        'Chưa cấu hình bucket R2 cho ảnh — kiểm tra r2_buckets trong wrangler.jsonc.',
      );
    }
    return new R2RenderStore(env.DESIGN_RENDERS);
  }
  return new SupabaseRenderStore(env);
}
