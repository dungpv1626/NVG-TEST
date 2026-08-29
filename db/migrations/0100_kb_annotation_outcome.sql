-- ============================================================================
-- Bước 3 số hoá — bổ sung `outcome` vào cùng một lần ghi với `rationale`.
--
-- Nguồn: `doc/design/06-knowledge-base.md` mục 6.1 Bước 3 — năm câu hỏi, trong đó câu cuối
-- ("Khách có hài lòng không? Thi công có phát sinh gì?") thuộc trường `outcome` của hợp đồng
-- chứ không thuộc `rationale`.
--
-- VÌ SAO KHÔNG SỬA THẲNG 0099: hàm ở đó đã chạy trên CSDL. Sửa tệp cũ thì tệp và CSDL nói
-- khác nhau với bất kỳ ai kéo repo về sau. Postgres coi hai danh sách tham số khác nhau là
-- HAI hàm nạp chồng, nên phải bỏ bản ba tham số đi — để lại thì lời gọi cũ vẫn chạy và âm
-- thầm bỏ qua `outcome`.
-- ============================================================================

DROP FUNCTION IF EXISTS public.kb_apply_rationale(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.kb_apply_rationale(
  p_id        uuid,
  p_rationale jsonb,
  p_embedding text DEFAULT NULL,
  p_outcome   jsonb DEFAULT NULL
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
     SET payload = jsonb_set(
           jsonb_set(payload, '{rationale}', COALESCE(p_rationale, 'null'::jsonb), true),
           '{outcome}', COALESCE(p_outcome, 'null'::jsonb), true
         ),
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

COMMENT ON FUNCTION public.kb_apply_rationale(uuid, jsonb, text, jsonb) IS
  'Bước 3 số hoá (06-knowledge-base 6.1): ghi rationale, outcome và vector nhúng cùng lúc. SECURITY INVOKER.';

GRANT EXECUTE ON FUNCTION public.kb_apply_rationale(uuid, jsonb, text, jsonb) TO authenticated;
