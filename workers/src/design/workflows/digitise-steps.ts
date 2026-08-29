/**
 * Các bước của pipeline số hoá hồ sơ cũ (Mốc 3) — phần nghiệp vụ, kiểm thử được.
 *
 * Nguồn: `doc/design/06-knowledge-base.md` mục 6.1.
 *
 * Tách khỏi `digitise.ts` vì tệp kia import `cloudflare:workers` nên chỉ nạp được trong
 * runtime Workers — cùng cách `steps.ts` tách khỏi `design-pipeline.ts`.
 *
 * **Một tệp lỗi không giết cả mẻ.** Đây là yêu cầu tường minh của tài liệu, và nó quyết định
 * cách phân loại lỗi ở đây: lỗi TẠM THỜI (mạng, container đang khởi động) được ném tiếp để
 * Workflow thử lại; lỗi của chính TỆP (hỏng, sai định dạng, quy ước lớp lạ) được bắt lại và
 * ghi vào kết quả. Nếu bắt tất thì một sự cố mạng biến thành "hồ sơ hỏng" vĩnh viễn; nếu ném
 * tất thì một tệp PDF gửi nhầm giết cả mẻ mười tệp.
 */

import { createClient } from '@supabase/supabase-js';
import type { ComputeBackend, KbRecordRequest } from '../compute-backend';
import type { DesignEnv } from '../env';
import type { SourceFileStore, StoredSource } from '../source-files';

export interface DigitiseSource {
  uri: string;
  name: string;
  /** Tầng mà bản vẽ này mô tả. Thứ tự tầng quyết định phép đối chiếu giữa các tầng. */
  level: number;
}

/**
 * Kết quả trích một tệp.
 *
 * `extractionJson` là CHUỖI chứ không phải đối tượng: kết quả mỗi bước Workflow phải
 * serialise được để chạy lại từ giữa, mà bản trích chỉ hợp lệ theo JSON Schema chứ không
 * theo kiểu TypeScript (`unknown`) — và `Serializable` không diễn đạt được `unknown`. Chuỗi
 * hoá ở đúng ranh giới này, thay vì rải ép kiểu khắp nơi.
 */
export type SourceOutcome =
  | { status: 'ok'; source: DigitiseSource; extractionJson: string }
  | { status: 'failed'; source: DigitiseSource; error: string };

export interface DigitiseParams {
  tenantId: string;
  companyId: string;
  projectId?: string | null;
  projectCode: string;
  buildingType: string;
  discipline: string;
  site: Record<string, unknown>;
  sources: DigitiseSource[];
  /** Mã phòng đã chuẩn hoá theo từng tầng. Thiếu thì bản ghi vẫn hợp lệ, chỉ mất few-shot. */
  roomTypes?: (string | null)[][];
  hasBrief?: boolean;
  tier?: string;
  actorId?: string | null;
}

/** Lỗi đáng thử lại hay không — theo cờ mà lớp gọi đã đặt, không đoán từ nội dung thông báo. */
function isRetryable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { retryable?: unknown }).retryable === true
  );
}

/**
 * Bước 1 — trích một bản vẽ.
 *
 * Lỗi tạm thời được ném tiếp (Workflow thử lại). Lỗi của chính tệp trả về `status: 'failed'`
 * để mẻ vẫn chạy tiếp — sửa extractor rồi chạy lại riêng bước đó.
 */
export async function extractSource(
  store: SourceFileStore,
  compute: ComputeBackend,
  source: DigitiseSource,
): Promise<SourceOutcome> {
  try {
    const bytes = await store.get(source.uri);
    const { extraction } = await compute.extract({ name: source.name, bytes });
    return { status: 'ok', source, extractionJson: JSON.stringify(extraction) };
  } catch (error) {
    if (isRetryable(error)) throw error;
    return {
      status: 'failed',
      source,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Bước 2 — gom các bản trích thành yêu cầu lắp bản ghi.
 *
 * Tầng được sắp theo `level` chứ không theo thứ tự tải lên: phép đối chiếu giữa các tầng so
 * tầng trên với TẦNG TRỆT, nên xếp sai thứ tự sẽ cho ra kết luận "tầng trên rộng bất thường"
 * hoàn toàn sai.
 */
export function assembleRecordRequest(
  params: DigitiseParams,
  outcomes: SourceOutcome[],
): KbRecordRequest {
  const ok = outcomes
    .filter((o): o is Extract<SourceOutcome, { status: 'ok' }> => o.status === 'ok')
    .sort((a, b) => a.source.level - b.source.level);

  if (ok.length === 0) {
    throw new Error(
      `Không trích được bản vẽ nào của ${params.projectCode}. Xem lý do từng tệp trong kết quả bước trích.`,
    );
  }

  return {
    tenant_id: params.tenantId,
    project_code: params.projectCode,
    building_type: params.buildingType,
    site: params.site,
    plans: ok.map((o) => JSON.parse(o.extractionJson)),
    room_types: params.roomTypes,
    project_id: params.projectId ?? null,
    tier: params.tier ?? 'A',
    has_brief: params.hasBrief ?? false,
  };
}

export interface PersistedRecord {
  id: string;
  /** `true` = bản ghi mới; `false` = số hoá lại, đã ghi đè bản đang hiệu lực. */
  created: boolean;
}

/**
 * Bước 3 — ghi bản ghi vào `kb_record`.
 *
 * Dùng khoá `service_role` vượt RLS: quyền đã được kiểm ở tuyến gọi trước khi khởi động
 * Workflow, và bước này chạy nền không có phiên người dùng.
 *
 * Số hoá lại thì GHI ĐÈ bản đang hiệu lực thay vì thêm dòng thứ hai. Chỉ mục duy nhất
 * `(tenant_id, project_code) WHERE deleted_at IS NULL` đã chặn việc có hai bản cùng lúc; xử
 * lý tường minh ở đây để lỗi ra là câu tiếng Việt chứ không phải mã ràng buộc Postgres.
 */
export async function persistKbRecord(
  env: DesignEnv,
  params: DigitiseParams,
  record: unknown,
  checks: unknown,
  sources: (StoredSource | DigitiseSource)[],
): Promise<PersistedRecord> {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const row = {
    tenant_id: params.tenantId,
    company_id: params.companyId,
    project_id: params.projectId ?? null,
    discipline: params.discipline,
    payload: record,
    checks,
    source_files: sources,
    updated_by: params.actorId ?? null,
  };

  const existing = await db
    .from('kb_record')
    .select('id')
    .eq('tenant_id', params.tenantId)
    .eq('project_code', params.projectCode)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new Error(`Không đọc được bản ghi cũ: ${existing.error.message}`);

  if (existing.data) {
    const updated = await db
      .from('kb_record')
      .update(row)
      .eq('id', existing.data.id)
      .select('id')
      .single();
    if (updated.error) throw new Error(`Không cập nhật được bản ghi: ${updated.error.message}`);
    return { id: updated.data.id as string, created: false };
  }

  const inserted = await db
    .from('kb_record')
    .insert({ ...row, created_by: params.actorId ?? null })
    .select('id')
    .single();
  if (inserted.error) throw new Error(`Không ghi được bản ghi: ${inserted.error.message}`);
  return { id: inserted.data.id as string, created: true };
}
