/**
 * Truy hồi ba tầng của Knowledge Base (doc/design/06-knowledge-base.md mục 6.3).
 *
 *   Tầng 1 — lọc cứng     : SQL, `kb_retrieve_candidates`
 *   Tầng 2 — lọc hình học : SQL, cùng hàm đó
 *   Tầng 3 — xếp hạng     : khoảng cách vector ở SQL, chọn đa dạng (MMR) ở đây
 *
 * Vì sao MMR không nằm luôn trong SQL: nó cần so từng ứng viên với những ứng viên ĐÃ CHỌN,
 * tức một vòng lặp có trạng thái. Viết được bằng SQL đệ quy, nhưng sẽ là một câu truy vấn
 * không ai đọc lại được — mà ở kho vài chục bản ghi thì phần tính toán này không đáng kể.
 *
 * Truy vấn chạy dưới PHIÊN CỦA NGƯỜI GỌI: `kb_retrieve_candidates` là SECURITY INVOKER nên
 * RLS quyết định thấy được bản ghi nào. Không kiểm lại quyền ở đây (CLAUDE.md 3.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectDiverse, type AdjacencyEdge, type Candidate } from './mmr';

export interface RetrieveQuery {
  tenantId: string;
  buildingType: string;
  floors?: number | null;
  widthM?: number | null;
  depthM?: number | null;
  familyArchetype?: string | null;
  style?: string | null;
  /** Ngưỡng chất lượng tối thiểu. Mặc định theo hàm SQL. */
  minQuality?: number;
  /** Chỉ lấy bản ghi có cây chia không gian — bắt buộc khi dùng làm few-shot Layer 3a. */
  requireSlicingTree?: boolean;
  /**
   * Mã công trình cần LOẠI khỏi tập tham chiếu.
   *
   * Dùng cho đánh giá leave-one-out (mục 6.0c): ở kho dưới 50 bộ, tách riêng bộ dự án mẫu sẽ
   * ngốn quá nửa kho, nên cách đúng là đánh giá từng công trình trong khi loại chính nó ra.
   * Quên tham số này là tự chấm điểm bằng chính đáp án.
   */
  excludeProjectCode?: string | null;
  /** Vector nhúng của đề bài. Thiếu thì xếp hạng dựa vào liền kề và chất lượng. */
  queryEmbedding?: number[] | null;
  /** Liền kề mong muốn (từ SpaceProgram). */
  wantedAdjacency?: AdjacencyEdge[];
  /** Số few-shot cần lấy. */
  k?: number;
  lambda?: number;
  /** Số ứng viên tối đa lấy về từ tầng 1+2 trước khi chọn. */
  poolSize?: number;
}

export interface RetrieveResult {
  /** Bản ghi đã chọn, kèm payload đầy đủ để đưa vào prompt. */
  records: { id: string; project_code: string; payload: unknown }[];
  /** Toàn bộ ứng viên qua được tầng 1+2 — để giải thích vì sao chọn từng ấy. */
  pool: number;
  /**
   * Số ứng viên có vector nhúng.
   *
   * Trả ra chứ không giấu: `0` nghĩa là chưa bản ghi nào được chú giải, và khi đó thứ hạng
   * hoàn toàn dựa vào liền kề và chất lượng. Người đọc kết quả cần biết điều đó thay vì
   * tưởng vector đang hoạt động.
   */
  embedded: number;
}

export async function retrieveFewShots(
  db: SupabaseClient,
  query: RetrieveQuery,
): Promise<RetrieveResult> {
  const { data, error } = await db.rpc('kb_retrieve_candidates', {
    p_tenant_id: query.tenantId,
    p_building_type: query.buildingType,
    p_floors: query.floors ?? null,
    p_width_m: query.widthM ?? null,
    p_depth_m: query.depthM ?? null,
    p_family_archetype: query.familyArchetype ?? null,
    p_style: query.style ?? null,
    p_min_quality: query.minQuality ?? 0.5,
    p_require_tree: query.requireSlicingTree ?? true,
    p_exclude_code: query.excludeProjectCode ?? null,
    // pgvector nhận kiểu văn bản `[a,b,c]` — gửi dạng chuỗi thay vì mảng để không phụ thuộc
    // cách thư viện khách chuyển mảng số sang tham số.
    p_query_embedding: query.queryEmbedding ? `[${query.queryEmbedding.join(',')}]` : null,
    p_limit: query.poolSize ?? 60,
  });

  if (error) throw new Error(`Không truy hồi được hồ sơ tham chiếu: ${error.message}`);

  const candidates = (data ?? []) as Candidate[];
  const chosen = selectDiverse(candidates, {
    k: query.k ?? 5,
    lambda: query.lambda,
    wantedAdjacency: query.wantedAdjacency,
  });

  const records = chosen.length
    ? await fetchPayloads(
        db,
        chosen.map((c) => c.id),
      )
    : [];

  return {
    records: chosen
      // Giữ nguyên thứ tự MMR đã chọn: thứ tự few-shot ảnh hưởng tới kết quả sinh, và truy
      // vấn lấy payload không hứa giữ thứ tự nào.
      .map((c) => records.find((r) => r.id === c.id))
      .filter((r): r is { id: string; project_code: string; payload: unknown } => r !== undefined),
    pool: candidates.length,
    embedded: candidates.filter((c) => c.embedding !== null).length,
  };
}

async function fetchPayloads(
  db: SupabaseClient,
  ids: string[],
): Promise<{ id: string; project_code: string; payload: unknown }[]> {
  const { data, error } = await db
    .from('kb_record')
    .select('id, project_code, payload')
    .in('id', ids);
  if (error) throw new Error(`Không đọc được nội dung hồ sơ tham chiếu: ${error.message}`);
  return (data ?? []) as { id: string; project_code: string; payload: unknown }[];
}
