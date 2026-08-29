/**
 * Ghi và đọc artifact — băm nội dung, đồ thị phụ thuộc, bản đang hiệu lực.
 *
 * Nguồn: doc/design/03-data-contracts.md mục 3.8.
 *
 * Ba quy tắc do tệp này giữ:
 *  1. Băm trên JSON đã CHUẨN HOÁ (khoá sắp xếp, không khoảng trắng thừa) — nếu không thì
 *     cùng một nội dung dựng theo hai đường sẽ ra hai mã băm và hệ thống tính lại thứ đã có.
 *  2. Không bao giờ `UPDATE` artifact. Sửa = tạo artifact mới + đổi `design_head`.
 *     (CSDL cũng không có policy UPDATE — xem migration 0096.)
 *  3. Trước khi tính một bước, hỏi đồ thị: cùng input + cùng cấu hình thì đã có kết quả chưa.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  artifactId,
  canonicalJson,
  paramsHash,
  type ArtifactDiscipline,
  type ArtifactKind,
  type PipelineStep,
} from '@nvg/shared/design';
import { parseArtifact } from './contracts';
import { createArtifactStore, type ArtifactStore } from './artifact-store';
import type { DesignEnv } from './env';

export interface ArtifactScope {
  tenantId: string;
  companyId: string;
  projectId: string;
  discipline: ArtifactDiscipline;
  /** `users.id` của người khởi động bước này. */
  actorId: string | null;
}

export interface WriteArtifactInput<K extends ArtifactKind = ArtifactKind> {
  scope: ArtifactScope;
  kind: K;
  payload: unknown;
  /** Artifact đầu vào của bước — sinh cạnh lineage. Rỗng với bước đầu tiên. */
  inputs?: string[];
  step?: PipelineStep;
  /** Cấu hình đã dùng; băm lại thành `params_hash`. */
  params?: unknown;
  /** Đặt luôn làm bản đang hiệu lực. Mặc định có — đó là hành vi thường gặp. */
  setHead?: boolean;
}

export interface WrittenArtifact {
  id: string;
  kind: ArtifactKind;
  payloadUri: string;
  /** `true` nghĩa là artifact y hệt đã tồn tại từ trước, lần này không tính lại gì. */
  reused: boolean;
}

export class ArtifactRepository {
  /**
   * Client `service_role`, vượt RLS.
   *
   * Để `readonly` công khai thay vì `private` vì cổng chặn Lớp 2 phải đọc
   * `design_setting` trong CÙNG một lượt chạy nền, và dựng thêm một client thứ hai chỉ để
   * đọc một dòng cấu hình là thêm một chỗ giữ khoá `service_role`.
   */
  readonly db: SupabaseClient;
  private readonly store: ArtifactStore;

  constructor(env: DesignEnv) {
    // `service_role` vượt RLS. Quyền của người dùng ĐÃ được kiểm ở lớp gọi (`assertCan…`)
    // trước khi tới đây; lớp này là hạ tầng ghi, không phải nơi quyết định quyền.
    this.db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    this.store = createArtifactStore(env);
  }

  /**
   * Ghi một artifact. Idempotent: cùng payload → cùng `id` → dòng cũ được dùng lại.
   *
   * Thứ tự cố ý là payload TRƯỚC, dòng metadata SAU. Ngược lại thì có lúc bảng trỏ tới một
   * URI chưa tồn tại — và người đọc không có cách nào phân biệt "đang ghi dở" với "hỏng".
   * Theo thứ tự này, hỏng nửa chừng chỉ để lại một tệp mồ côi trong kho: tốn chỗ, không sai.
   */
  async write<K extends ArtifactKind>(input: WriteArtifactInput<K>): Promise<WrittenArtifact> {
    const { scope, kind } = input;

    // Kiểm ở ranh giới trước khi băm: băm một payload sai hợp đồng là ghi vĩnh viễn một thứ
    // không đọc lại được, vì artifact không sửa được.
    const payload = parseArtifact(kind, input.payload);
    const id = await artifactId(payload);

    const existing = await this.db
      .from('design_artifact')
      .select('id, payload_uri')
      .eq('id', id)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    let payloadUri: string;
    let reused = false;

    if (existing.data) {
      payloadUri = existing.data.payload_uri as string;
      reused = true;
    } else {
      const key = `${scope.projectId}/${kind}/${id.slice('sha256:'.length)}.json`;
      payloadUri = await this.store.put(key, canonicalJson(payload));

      const inserted = await this.db.from('design_artifact').insert({
        id,
        tenant_id: scope.tenantId,
        company_id: scope.companyId,
        project_id: scope.projectId,
        discipline: scope.discipline,
        kind,
        schema_version: (payload as { schema_version: string }).schema_version,
        payload_uri: payloadUri,
        created_by: scope.actorId,
      });
      // 23505 = đụng khoá chính: một lần chạy song song đã ghi đúng artifact này. Cùng mã băm
      // nghĩa là cùng nội dung, nên không có gì để hoà giải — dùng luôn bản kia.
      if (inserted.error && inserted.error.code !== '23505') {
        throw new Error(inserted.error.message);
      }
      reused = Boolean(inserted.error);
    }

    if (input.inputs?.length && input.step) {
      const hash = await paramsHash(input.params ?? {});
      const edges = input.inputs.map((fromId) => ({
        tenant_id: scope.tenantId,
        from_id: fromId,
        to_id: id,
        step: input.step,
        params_hash: hash,
      }));
      const edgeResult = await this.db
        .from('design_artifact_edge')
        .upsert(edges, { onConflict: 'from_id,to_id,step', ignoreDuplicates: true });
      if (edgeResult.error) throw new Error(edgeResult.error.message);
    }

    if (input.setHead !== false) {
      await this.setHead(scope, kind, id);
    }

    return { id, kind, payloadUri, reused };
  }

  /** Chuyển con trỏ "bản đang hiệu lực" sang một artifact khác. */
  async setHead(scope: ArtifactScope, kind: ArtifactKind, id: string): Promise<void> {
    const { error } = await this.db.from('design_head').upsert(
      {
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        discipline: scope.discipline,
        kind,
        artifact_id: id,
        updated_by: scope.actorId,
      },
      { onConflict: 'project_id,discipline,kind' },
    );
    if (error) throw new Error(error.message);
  }

  /** Bản đang hiệu lực của một loại artifact, kèm payload đã kiểm hợp đồng. */
  async head(
    projectId: string,
    discipline: ArtifactDiscipline,
    kind: ArtifactKind,
  ): Promise<{ id: string; payload: unknown } | null> {
    const { data, error } = await this.db
      .from('design_head')
      .select('artifact_id, design_artifact!inner(payload_uri)')
      .eq('project_id', projectId)
      .eq('discipline', discipline)
      .eq('kind', kind)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    const uri = (data as unknown as { design_artifact: { payload_uri: string } }).design_artifact
      .payload_uri;
    const payload = parseArtifact(kind, JSON.parse(await this.store.get(uri)));
    return { id: data.artifact_id as string, payload };
  }

  /**
   * Tìm kết quả đã tính của một bước: cùng artifact đầu vào, cùng bước, cùng cấu hình.
   *
   * Đây là cơ chế "không tính lại" của 02-architecture 2.5. Không có nó thì mỗi lần mở lại
   * một phương án cũ là một lần chạy bộ giải.
   */
  async findComputed(fromId: string, step: PipelineStep, params: unknown): Promise<string | null> {
    const hash = await paramsHash(params ?? {});
    const { data, error } = await this.db
      .from('design_artifact_edge')
      .select('to_id')
      .eq('from_id', fromId)
      .eq('step', step)
      .eq('params_hash', hash)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.to_id as string | undefined) ?? null;
  }

  /** Đường đi ngược từ một artifact về mọi input trực tiếp — nền của "vì sao ra bản này". */
  async lineage(id: string): Promise<Array<{ fromId: string; step: string; paramsHash: string }>> {
    const { data, error } = await this.db
      .from('design_artifact_edge')
      .select('from_id, step, params_hash')
      .eq('to_id', id);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      fromId: r.from_id as string,
      step: r.step as string,
      paramsHash: r.params_hash as string,
    }));
  }
}
