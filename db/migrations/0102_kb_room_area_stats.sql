-- ============================================================================
-- 0102 — Thống kê thực nghiệm diện tích phòng (Lớp 2, Mốc 4)
--
-- Nguồn: doc/design/06-knowledge-base.md mục 6.0(b) và 6.4; 08-milestones.md Mốc 3 và Mốc 4.
--
-- ── Vì sao KHÔNG phải materialized view như tài liệu ghi ────────────────────────────────
-- Tài liệu đề xuất materialized view. Ở đây là một HÀM đọc thẳng `kb_record`, có chủ ý:
--
--   1. Materialized view KHÔNG chịu RLS. Nó là một bản sao dữ liệu của mọi tenant nằm ngoài
--      mọi policy — đúng thứ mục 6.0 của tài liệu gọi là "rò rỉ giữa các tenant là hỏng sản
--      phẩm". Đổi lấy điều đó phải có lý do rất mạnh.
--   2. Lý do đó là tốc độ, và hiện không có. Kho dưới 50 bộ hồ sơ; chính tài liệu (mục 6.6)
--      viết "1.000 bản ghi là rất nhỏ với PostgreSQL". Trải phẳng vài nghìn dòng phòng mất
--      vài mili giây.
--   3. Materialized view còn cần lịch làm mới. Quên làm mới thì Lớp 2 soạn chương trình theo
--      số liệu cũ mà không có dấu hiệu nào — hỏng im lặng, loại tệ nhất.
--
-- Khi kho lớn tới mức phép đo cho thấy bước trải phẳng đáng kể, đổi sang materialized view
-- là việc trong một tệp này: chữ ký hàm giữ nguyên, lớp gọi không đổi một dòng.
--
-- ── Ngưỡng số mẫu nằm ở ĐÂU, và đếm CÁI GÌ ──────────────────────────────────────────────
-- `p_min_samples` do lớp gọi truyền vào, đọc từ `kb/space_norms.yaml` (`priors.min_samples`)
-- — không viết cứng trong SQL. Nhưng phép lọc `HAVING` thì đặt Ở ĐÂY chứ không ở Worker:
-- ngưỡng bị bỏ qua nghĩa là một loại phòng có ba mẫu được đem ra làm "thống kê thực nghiệm",
-- và không ai nhìn con số đó mà biết nó chỉ dựa trên ba công trình.
--
-- Ngưỡng đếm số CÔNG TRÌNH, không phải số phòng. Đếm phòng thì một biệt thự có mười lăm
-- phòng ngủ tự nó vượt ngưỡng, và "phân bố diện tích phòng ngủ của NVG" hoá ra là phân bố
-- bên trong đúng một căn nhà — chính là "trùng hợp, không phải phân bố" mà mục 6.0(b) cảnh
-- báo. `sample_count` vẫn trả về vì nó cho biết trung vị dựa trên bao nhiêu phép đo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.kb_room_area_stats(
  p_tenant_id uuid,
  p_building_type text,
  p_width_min double precision,
  p_width_max double precision,
  p_floors_min integer,
  p_floors_max integer,
  p_min_samples integer
)
RETURNS TABLE (
  room_type text,
  sample_count bigint,
  project_count bigint,
  p25_m2 double precision,
  median_m2 double precision,
  p75_m2 double precision
)
LANGUAGE sql
STABLE
-- SECURITY INVOKER (mặc định) là CÓ CHỦ Ý, cùng lý lẽ với `kb_retrieve_candidates`: thống kê
-- phải đi qua RLS của `kb_record`. Đặt SECURITY DEFINER sẽ mở đường đọc số liệu của tenant
-- khác qua một hàm tưởng như vô hại.
SET search_path = public, pg_catalog
AS $$
  WITH room AS (
    SELECT
      k.id AS record_id,
      r.value ->> 'type' AS room_type,
      (r.value ->> 'area_m2')::double precision AS area_m2
    FROM public.kb_record k
      CROSS JOIN LATERAL jsonb_array_elements(k.payload -> 'floor_plans') AS fp(value)
      CROSS JOIN LATERAL jsonb_array_elements(fp.value -> 'rooms') AS r(value)
    WHERE k.deleted_at IS NULL
      AND k.tenant_id = p_tenant_id
      AND k.building_type = p_building_type
      AND k.floors BETWEEN p_floors_min AND p_floors_max
      -- Hồ sơ thiếu kích thước lô hoặc thiếu mặt bằng vẫn nằm trong kho (mục 6.0), nhưng
      -- không tham gia thống kê theo bề rộng lô được. Lọc bằng jsonb_typeof chứ không bằng
      -- ép kiểu trực tiếp: một payload lệch định dạng sẽ làm CẢ truy vấn đổ, kéo theo Lớp 2
      -- hỏng vì một bản ghi cũ.
      AND jsonb_typeof(k.payload -> 'floor_plans') = 'array'
      AND jsonb_typeof(k.payload -> 'site' -> 'width_m') = 'number'
      AND (k.payload -> 'site' ->> 'width_m')::double precision > p_width_min
      AND (
        p_width_max IS NULL
        OR (k.payload -> 'site' ->> 'width_m')::double precision <= p_width_max
      )
      AND jsonb_typeof(r.value -> 'area_m2') = 'number'
      AND r.value ->> 'type' IS NOT NULL
  )
  SELECT
    room.room_type,
    count(*) AS sample_count,
    count(DISTINCT room.record_id) AS project_count,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY room.area_m2) AS p25_m2,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY room.area_m2) AS median_m2,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY room.area_m2) AS p75_m2
  FROM room
  GROUP BY room.room_type
  HAVING count(DISTINCT room.record_id) >= p_min_samples
  ORDER BY room.room_type;
$$;

COMMENT ON FUNCTION public.kb_room_area_stats(uuid, text, double precision, double precision, integer, integer, integer) IS
  'Thống kê thực nghiệm diện tích phòng cho Lớp 2 (06-knowledge-base 6.4). Trả về RỖNG khi ô chưa đủ p_min_samples CÔNG TRÌNH — mục 6.0(b). SECURITY INVOKER, đi qua RLS của kb_record.';

GRANT EXECUTE ON FUNCTION public.kb_room_area_stats(
  uuid, text, double precision, double precision, integer, integer, integer
) TO authenticated;
