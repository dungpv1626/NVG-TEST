/**
 * Kho lưu payload của artifact — `ArtifactStore`.
 *
 * Quyết định T4 (CLAUDE.md 8.5): **R2 cho artifact** (dữ liệu máy đọc) và **Supabase Storage
 * cho hồ sơ phát hành** (đi qua `documents`/`document_versions`, đã có RLS và phiên bản).
 * R2 cần bật thanh toán, mà giai đoạn dev giữ gói Free (T3) — nên adapter `supabase://` dùng
 * ngay, adapter `r2://` viết sẵn, bật bằng biến môi trường chứ không phải sửa mã.
 *
 * `payload_uri` luôn mang scheme. Nhờ đó một artifact ghi thời gói Free vẫn đọc được sau khi
 * chuyển sang R2 — hai adapter cùng tồn tại, đọc theo scheme của chính URI.
 */

import type { DesignEnv } from './env';

export interface ArtifactStore {
  /** Scheme mà adapter này sinh ra khi ghi mới. */
  readonly scheme: 'supabase' | 'r2';
  /** Ghi payload, trả về URI có scheme. `key` là đường dẫn tương đối, không có scheme. */
  put(key: string, payload: string): Promise<string>;
  /** Đọc payload theo URI đầy đủ. */
  get(uri: string): Promise<string>;
  /** Tên tệp NGAY trong một thư mục (`prefix` không có dấu `/` cuối) — không đệ quy. */
  list(prefix: string): Promise<string[]>;
  /** URI của một khoá — cùng dạng `put` trả về, không cần ghi. */
  uriOf(key: string): string;
}

/** Tách `supabase://design-artifacts/abc.json` thành `['supabase', 'design-artifacts/abc.json']`. */
export function splitUri(uri: string): [scheme: string, key: string] {
  const at = uri.indexOf('://');
  if (at < 0) throw new Error(`URI artifact thiếu scheme: ${uri}`);
  return [uri.slice(0, at), uri.slice(at + 3)];
}

const BUCKET = 'design-artifacts';

/**
 * Supabase Storage đã có khoá này chưa.
 *
 * ⚠️ KHÔNG kiểm bằng `res.status === 409`. Supabase Storage trả **HTTP 400** kèm thân
 * `{"statusCode":"409","code":"KeyAlreadyExists"}` — mã 409 nằm TRONG thân, không phải ở
 * dòng trạng thái. Kiểm sai chỗ thì nhánh "đã tồn tại" không bao giờ chạy, và mọi lần ghi
 * lặp một nội dung y hệt đều hỏng: đúng thứ kho băm nội dung sinh ra để tránh.
 * Đã dựng lại được bằng curl trên chính project này (29/08/2026).
 */
export async function isDuplicateKey(res: Response): Promise<boolean> {
  if (res.status === 409) return true;
  if (res.status !== 400) return false;
  try {
    const body = (await res.clone().json()) as { code?: string; statusCode?: string };
    return body.code === 'KeyAlreadyExists' || body.statusCode === '409';
  } catch {
    return false;
  }
}

/**
 * Adapter Supabase Storage.
 *
 * Dùng REST trực tiếp thay vì `supabase-js`: chỉ cần hai lệnh, và giữ Worker nhẹ. Khoá
 * `service_role` vượt RLS — chấp nhận được vì quyền đã được kiểm ở bảng `design_artifact`
 * TRƯỚC khi tới đây; payload chỉ ghi được sau khi dòng metadata ghi thành công.
 */
export class SupabaseArtifactStore implements ArtifactStore {
  readonly scheme = 'supabase' as const;

  constructor(private readonly env: DesignEnv) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  async put(key: string, payload: string): Promise<string> {
    const url = `${this.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: payload,
    });
    // Khoá đã tồn tại là chuyện BÌNH THƯỜNG và đúng với artifact băm nội dung: cùng nội dung
    // → cùng khoá → không cần ghi lại. Xem `isDuplicateKey` về chỗ Supabase đặt mã 409.
    if (!res.ok && !(await isDuplicateKey(res))) {
      throw new Error(`Không lưu được artifact (${res.status}).`);
    }
    return `${this.scheme}://${BUCKET}/${key}`;
  }

  async get(uri: string): Promise<string> {
    const [, key] = splitUri(uri);
    const res = await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/${key}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Không đọc được artifact (${res.status}).`);
    return res.text();
  }

  async list(prefix: string): Promise<string[]> {
    const res = await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    if (!res.ok) throw new Error(`Không liệt kê được kho artifact (${res.status}).`);
    const rows = (await res.json()) as { name?: string; id?: string | null }[];
    // Thư mục con trả về với `id: null` — chỉ lấy tệp.
    return rows.filter((row) => row.name && row.id).map((row) => row.name!);
  }

  uriOf(key: string): string {
    return `${this.scheme}://${BUCKET}/${key}`;
  }
}

/**
 * Adapter R2 — đích đến khi nâng gói Cloudflare.
 *
 * Viết sẵn và giữ trong bản dựng để không phải nhớ lại thiết kế lúc chuyển; chỉ hoạt động
 * khi `wrangler.jsonc` có `r2_buckets` (đang để chú thích) và `DESIGN_ARTIFACT_STORE=r2`.
 */
export class R2ArtifactStore implements ArtifactStore {
  readonly scheme = 'r2' as const;

  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, payload: string): Promise<string> {
    await this.bucket.put(key, payload, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    return `${this.scheme}://${BUCKET}/${key}`;
  }

  async get(uri: string): Promise<string> {
    const [, path] = splitUri(uri);
    const key = path.startsWith(`${BUCKET}/`) ? path.slice(BUCKET.length + 1) : path;
    const object = await this.bucket.get(key);
    if (!object) throw new Error('Không tìm thấy artifact trong kho.');
    return object.text();
  }

  async list(prefix: string): Promise<string[]> {
    const listed = await this.bucket.list({ prefix: `${prefix}/`, delimiter: '/' });
    return listed.objects.map((object) => object.key.slice(prefix.length + 1));
  }

  uriOf(key: string): string {
    return `${this.scheme}://${BUCKET}/${key}`;
  }
}

/**
 * Chọn adapter theo cấu hình.
 *
 * Mặc định `supabase` chứ không phải `r2`: cấu hình thiếu thì phải rơi về thứ CHẮC CHẮN
 * chạy được, không phải thứ cần bật thanh toán mới có.
 */
export function createArtifactStore(env: DesignEnv): ArtifactStore {
  if (env.DESIGN_ARTIFACT_STORE === 'r2') {
    if (!env.DESIGN_ARTIFACTS) {
      throw new Error(
        'Chưa cấu hình bucket R2 cho artifact — kiểm tra r2_buckets trong wrangler.jsonc.',
      );
    }
    return new R2ArtifactStore(env.DESIGN_ARTIFACTS);
  }
  return new SupabaseArtifactStore(env);
}
