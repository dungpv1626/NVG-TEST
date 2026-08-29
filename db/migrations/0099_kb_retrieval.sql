-- ============================================================================
-- Knowledge Base — nhúng vector và truy hồi ba tầng (Mốc 3, mục 6.3).
--
-- Nguồn: `doc/design/06-knowledge-base.md` mục 6.2 (`rationale_embedding`) và 6.3
-- (truy hồi ba tầng).
--
-- Ba tầng của tài liệu, và tầng nào nằm ở đâu:
--
--   Tầng 1 — lọc cứng     : SQL, hàm `kb_retrieve_candidates` dưới đây
--   Tầng 2 — lọc hình học : SQL, cùng hàm đó
--   Tầng 3 — xếp hạng     : một PHẦN ở SQL (khoảng cách vector), phần chọn đa dạng (MMR)
--                           ở Worker vì nó cần so từng ứng viên với những ứng viên ĐÃ CHỌN
--
-- VÌ SAO CHƯA CÓ CHỈ MỤC VECTOR: mục 6.6 của tài liệu nói thẳng — "1.000 bản ghi là rất nhỏ
-- với PostgreSQL […] chưa cần cả chỉ mục HNSW". Kho hiện dưới 50 bộ; quét tuần tự trên 50
-- dòng nhanh hơn đi qua chỉ mục, mà chỉ mục xấp xỉ còn ĐÁNH ĐỔI độ chính xác. Thêm chỉ mục
-- khi kho vượt vài nghìn bản ghi — và khi đó số chiều 1536 vẫn nằm dưới trần 2000 chiều của
-- pgvector, đó là lý do `config/models.yaml` cắt vector xuống 1536 ngay từ bây giờ.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;


-- ----------------------------------------------------------------------------
-- Cột nhúng + các cột lọc của tầng 2
-- ----------------------------------------------------------------------------

-- KHÔNG phải cột sinh, khác mọi cột lọc còn lại của bảng này: giá trị đến từ một dịch vụ bên
-- ngoài (mô hình nhúng), không suy được từ `payload`. Hệ quả phải nhớ: sửa `rationale` mà
-- quên tính lại vector thì hai thứ lệch nhau trong im lặng — nên đường ghi duy nhất là hàm
-- `kb_apply_rationale` ở dưới, nó ghi cả hai cùng lúc.
ALTER TABLE public.kb_record
  ADD COLUMN IF NOT EXISTS rationale_embedding extensions.vector(1536);

COMMENT ON COLUMN public.kb_record.rationale_embedding IS
  'Nhúng phần rationale (06-knowledge-base 6.2). 1536 chiều — dưới trần 2000 của chỉ mục pgvector. Ghi qua kb_apply_rationale để không lệch với payload->rationale.';

-- Tầng 2 lọc theo kích thước lô và hồ sơ gia đình. Cột sinh, cùng lý lẽ với các cột lọc đã
-- có: chép tay là tạo nguồn thứ hai có thể nói khác `payload`.
ALTER TABLE public.kb_record
  ADD COLUMN IF NOT EXISTS site_width_m double precision
    GENERATED ALWAYS AS ((payload -> 'site' ->> 'width_m')::double precision) STORED,
  ADD COLUMN IF NOT EXISTS site_depth_m double precision
    GENERATED ALWAYS AS ((payload -> 'site' ->> 'depth_m')::double precision) STORED,
  ADD COLUMN IF NOT EXISTS family_archetype text
    GENERATED ALWAYS AS (payload ->> 'family_archetype') STORED,
  ADD COLUMN IF NOT EXISTS style text
    GENERATED ALWAYS AS (payload ->> 'style') STORED,
  -- Bước 3 (tri thức ngầm) đã làm hay chưa. Là bộ lọc của màn hình chú giải: danh sách "còn
  -- phải chú giải" phải suy từ dữ liệu, không phải từ một cờ ai đó nhớ bật.
  ADD COLUMN IF NOT EXISTS has_rationale boolean
    GENERATED ALWAYS AS (
      COALESCE(jsonb_typeof(payload -> 'rationale') = 'object', false)
    ) STORED;

CREATE INDEX IF NOT EXISTS kb_record_geometry_idx
  ON public.kb_record (tenant_id, building_type, floors, site_width_m)
  WHERE deleted_at IS NULL;

-- Hàng chờ chú giải của kiến trúc sư (Bước 3).
CREATE INDEX IF NOT EXISTS kb_record_annotation_queue_idx
  ON public.kb_record (tenant_id, has_rationale, quality_score DESC)
  WHERE deleted_at IS NULL;


-- ----------------------------------------------------------------------------
-- Truy hồi — tầng 1 (lọc cứng) + tầng 2 (lọc hình học) + khoảng cách vector
-- ----------------------------------------------------------------------------

-- SECURITY INVOKER (mặc định) là CÓ CHỦ Ý: truy hồi phải đi qua RLS của `kb_record`. Đặt
-- SECURITY DEFINER ở đây sẽ mở đường đọc tri thức của tenant khác — đúng thứ mục 6.0 của
-- tài liệu gọi là "hỏng sản phẩm".
CREATE OR REPLACE FUNCTION public.kb_retrieve_candidates(
  p_tenant_id        uuid,
  p_building_type    text,
  p_floors           integer   DEFAULT NULL,
  p_width_m          double precision DEFAULT NULL,
  p_depth_m          double precision DEFAULT NULL,
  p_family_archetype text      DEFAULT NULL,
  p_style            text      DEFAULT NULL,
  p_min_quality      double precision DEFAULT 0.5,
  p_require_tree     boolean   DEFAULT true,
  p_exclude_code     text      DEFAULT NULL,
  p_query_embedding  text      DEFAULT NULL,
  p_limit            integer   DEFAULT 60
)
RETURNS TABLE (
  id               uuid,
  project_code     text,
  quality_score    double precision,
  floors           integer,
  site_width_m     double precision,
  site_depth_m     double precision,
  family_archetype text,
  style            text,
  has_rationale    boolean,
  similarity       double precision,
  adjacency        jsonb,
  embedding        double precision[]
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    r.id,
    r.project_code,
    r.quality_score,
    r.floors,
    r.site_width_m,
    r.site_depth_m,
    r.family_archetype,
    r.style,
    r.has_rationale,
    -- Khoảng cách cosin đổi thành ĐỘ TƯƠNG ĐỒNG trong [0,1] để lớp gọi không phải nhớ chiều
    -- nào là gần. Bản ghi chưa có nhúng nhận 0 — chưa chú giải thì không có tín hiệu này,
    -- KHÔNG phải "khác hoàn toàn".
    CASE
      WHEN p_query_embedding IS NULL OR r.rationale_embedding IS NULL THEN 0::double precision
      ELSE GREATEST(0, 1 - (r.rationale_embedding <=> p_query_embedding::extensions.vector))
    END AS similarity,
    COALESCE(r.payload -> 'adjacency_graph', '[]'::jsonb) AS adjacency,
    CASE
      WHEN r.rationale_embedding IS NULL THEN NULL
      ELSE r.rationale_embedding::real[]::double precision[]
    END AS embedding
  FROM public.kb_record r
  WHERE r.deleted_at IS NULL
    AND r.tenant_id = p_tenant_id
    -- Tầng 1 — lọc cứng.
    AND r.building_type = p_building_type
    AND (p_floors IS NULL OR r.floors BETWEEN p_floors - 1 AND p_floors + 1)
    AND r.quality_score >= p_min_quality
    -- Hạng C không bao giờ vào few-shot (mục 6.3).
    AND r.tier IN ('A', 'B')
    AND (NOT p_require_tree OR r.has_slicing_tree)
    -- Đánh giá leave-one-out (mục 6.0c): loại chính công trình đang xét khỏi tập tham chiếu.
    -- Ở kho dưới 50 bộ, quên bước này là tự chấm điểm bằng chính đáp án.
    AND (p_exclude_code IS NULL OR r.project_code <> p_exclude_code)
    -- Tầng 2 — lọc hình học. Dung sai lấy từ mục 6.3: rộng ±0,5 m, sâu ±2 m.
    AND (p_width_m IS NULL OR r.site_width_m IS NULL OR abs(r.site_width_m - p_width_m) <= 0.5)
    AND (p_depth_m IS NULL OR r.site_depth_m IS NULL OR abs(r.site_depth_m - p_depth_m) <= 2.0)
    AND (p_family_archetype IS NULL OR r.family_archetype IS NULL
         OR r.family_archetype = p_family_archetype)
    AND (p_style IS NULL OR r.style IS NULL OR r.style = p_style)
  ORDER BY similarity DESC, r.quality_score DESC, r.project_code
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

COMMENT ON FUNCTION public.kb_retrieve_candidates IS
  'Truy hồi Knowledge Base tầng 1+2 (06-knowledge-base 6.3). SECURITY INVOKER — đi qua RLS. Bước chọn đa dạng (MMR) nằm ở Worker.';

GRANT EXECUTE ON FUNCTION public.kb_retrieve_candidates(
  uuid, text, integer, double precision, double precision, text, text,
  double precision, boolean, text, text, integer
) TO authenticated;


-- ----------------------------------------------------------------------------
-- Bước 3 — kiến trúc sư ghi tri thức ngầm
-- ----------------------------------------------------------------------------

-- Ghi `rationale` VÀ vector nhúng trong cùng một câu lệnh. Để hai lời gọi riêng thì có ngày
-- lời gọi thứ hai hỏng và bản ghi mang chú giải mới với vector cũ — sai lệch này không có
-- triệu chứng nào ngoài việc truy hồi trả về kết quả kỳ lạ.
--
-- SECURITY INVOKER: quyền do policy UPDATE của `kb_record` quyết định, không kiểm lại ở
-- tầng Worker (CLAUDE.md 3.4).
CREATE OR REPLACE FUNCTION public.kb_apply_rationale(
  p_id        uuid,
  p_rationale jsonb,
  p_embedding text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.kb_record
     SET payload = jsonb_set(payload, '{rationale}', COALESCE(p_rationale, 'null'::jsonb), true),
         rationale_embedding = CASE
           WHEN p_embedding IS NULL THEN NULL
           ELSE p_embedding::extensions.vector
         END
   WHERE id = p_id
     AND deleted_at IS NULL
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Không phân biệt "không tồn tại" với "không đủ quyền": trả lời khác nhau cho hai trường
    -- hợp là cách để người ngoài tenant dò xem bản ghi nào có thật.
    RAISE EXCEPTION 'Không lưu được chú giải: bản ghi không tồn tại hoặc không đủ quyền sửa.';
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.kb_apply_rationale(uuid, jsonb, text) IS
  'Bước 3 số hoá (06-knowledge-base 6.1): ghi rationale và vector nhúng cùng lúc. SECURITY INVOKER.';

GRANT EXECUTE ON FUNCTION public.kb_apply_rationale(uuid, jsonb, text) TO authenticated;
