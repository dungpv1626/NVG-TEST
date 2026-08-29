/**
 * Kho tệp NGUỒN của pipeline số hoá — bản vẽ `.dwg`/`.dxf` gốc của hồ sơ cũ.
 *
 * Tách khỏi `ArtifactStore` có chủ đích, dù hai kho trông giống nhau:
 *
 * | | `ArtifactStore` | `SourceFileStore` |
 * |---|---|---|
 * | Chứa gì | JSON có cấu trúc do hệ thống sinh | Tệp nhị phân do người tải lên |
 * | Ai đọc | Máy, ở bước tính tiếp theo | Con người, khi kết quả trích trông sai |
 * | Vòng đời | Bất biến, gắn với `design_artifact` | Giữ để truy ngược, không gắn artifact |
 *
 * Gộp hai thứ vào một kho sẽ khiến bucket artifact chứa cả trăm megabyte dữ liệu khách hàng
 * mà không có dòng metadata nào mô tả.
 *
 * **Khoá là mã băm nội dung.** Đây chính là Bước 0 của tài liệu — "băm nội dung để gộp bản
 * trùng" (`doc/design/06-knowledge-base.md` mục 6.1). Cùng một bản vẽ nằm ở ba thư mục dự án
 * khác nhau chỉ chiếm chỗ một lần, và trích một lần.
 */

import type { DesignEnv } from './env';
import { isDuplicateKey, splitUri } from './artifact-store';

const BUCKET = 'design-sources';

/**
 * Hạn kích thước một bản vẽ.
 *
 * Đây là hạn của TẦNG LƯU TRỮ (Supabase Storage gói miễn phí chặn ở 50 MB), không phải hạn
 * của bộ trích — Container tự đặt hạn riêng cho bộ nhớ của nó. Kiểm ở đây để người dùng nhận
 * một câu tiếng Việt nói rõ vượt bao nhiêu, thay vì một mã lỗi của Supabase. Chuyển sang R2
 * thì hạn này biến mất và dòng kiểm bên dưới nên bỏ theo.
 */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export interface StoredSource {
  /** `supabase://design-sources/<băm>/<tên tệp>` */
  uri: string;
  /** `sha256:` + 64 hex — cùng định dạng với mã artifact, để đọc log không phải đổi não. */
  contentHash: string;
  name: string;
  bytes: number;
}

export interface SourceFileStore {
  put(name: string, data: Uint8Array): Promise<StoredSource>;
  get(uri: string): Promise<Uint8Array>;
}

/** Băm nội dung tệp. Cùng thuật toán và cùng cách viết với mã artifact. */
export async function hashBytes(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/**
 * Tên tệp an toàn cho đường dẫn kho.
 *
 * Hồ sơ NVG đặt tên bằng tiếng Việt có dấu và có khoảng trắng
 * (`NVO026_NhàAnhA_KT_MặtBằng_V03.dwg`). Giữ nguyên thì URL kho hoặc hỏng, hoặc phải mã hoá
 * ở bốn chỗ khác nhau. Bỏ dấu và thay ký tự lạ bằng gạch dưới — tên gốc vẫn được giữ trong
 * `StoredSource.name` và trong bản ghi, nên không mất thông tin.
 */
export function safeFileName(name: string): string {
  const base = name.split('/').pop() ?? name;
  return (
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'ban-ve'
  );
}

/** Adapter Supabase Storage. Cùng khuôn với `SupabaseArtifactStore`, chỉ khác kiểu dữ liệu. */
export class SupabaseSourceFileStore implements SourceFileStore {
  constructor(private readonly env: DesignEnv) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  async put(name: string, data: Uint8Array): Promise<StoredSource> {
    if (data.byteLength > MAX_SOURCE_BYTES) {
      throw new Error(
        `Bản vẽ ${name} nặng ${Math.round(data.byteLength / 1024 / 1024)} MB, vượt hạn ${MAX_SOURCE_BYTES / 1024 / 1024} MB. Xuất lại bản vẽ đã lược bớt tham chiếu ngoài (xref) rồi tải lên.`,
      );
    }
    const contentHash = await hashBytes(data);
    const key = `${contentHash.slice('sha256:'.length)}/${safeFileName(name)}`;
    const res = await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/octet-stream' },
      body: data as unknown as BodyInit,
    });
    // Khoá đã tồn tại = bản TRÙNG, đúng thứ Bước 0 muốn gộp, không phải lỗi. Xem
    // `isDuplicateKey`: Supabase trả mã 409 trong THÂN phản hồi chứ không ở dòng trạng thái.
    if (!res.ok && !(await isDuplicateKey(res))) {
      throw new Error(`Không lưu được tệp nguồn ${name} (${res.status}).`);
    }
    return { uri: `supabase://${BUCKET}/${key}`, contentHash, name, bytes: data.byteLength };
  }

  async get(uri: string): Promise<Uint8Array> {
    const [, key] = splitUri(uri);
    const res = await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/${key}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Không đọc được tệp nguồn (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Adapter R2 — bật khi nâng gói Cloudflare. Cùng lý do tồn tại như `R2ArtifactStore`. */
export class R2SourceFileStore implements SourceFileStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(name: string, data: Uint8Array): Promise<StoredSource> {
    const contentHash = await hashBytes(data);
    const key = `${contentHash.slice('sha256:'.length)}/${safeFileName(name)}`;
    await this.bucket.put(key, data as unknown as ArrayBuffer);
    return { uri: `r2://${key}`, contentHash, name, bytes: data.byteLength };
  }

  async get(uri: string): Promise<Uint8Array> {
    const [, key] = splitUri(uri);
    const object = await this.bucket.get(key);
    if (!object) throw new Error(`Không tìm thấy tệp nguồn: ${uri}`);
    return new Uint8Array(await object.arrayBuffer());
  }
}

export function createSourceFileStore(env: DesignEnv): SourceFileStore {
  if (env.DESIGN_ARTIFACT_STORE === 'r2') {
    if (!env.DESIGN_SOURCES) {
      throw new Error('DESIGN_ARTIFACT_STORE=r2 nhưng thiếu binding DESIGN_SOURCES.');
    }
    return new R2SourceFileStore(env.DESIGN_SOURCES);
  }
  return new SupabaseSourceFileStore(env);
}
