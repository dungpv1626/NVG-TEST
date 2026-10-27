-- 0225 — Lịch sử chuyển bước chung cho hợp đồng, gói thầu, công trình (GĐ1 còn thiếu).
--
-- Vì sao: cơ hội có `opportunity_stage_history` từ đầu, còn tab «Lịch sử» của hợp đồng / gói thầu / công trình chỉ có vài
-- mốc thời gian cố định (duyệt, ký, nộp thầu, bàn giao). Không biết hồ sơ lùi bước khi nào, ai đẩy sang bước kế, tạm
-- dừng vì sao. Thay đổi trạng thái quan trọng phải có bảng lịch sử riêng, không ghi đè (CLAUDE.md 4.2).
--
-- - MỘT bảng cho ba loại hồ sơ, ghi bằng trigger AFTER trên chính bảng hồ sơ: mọi đường đổi bước (hàm, trigger tự
--   chuyển, `decide_approval`) đều được ghi mà không chép lại hàm nào.
-- - Ghi chú: lý do của đúng lần chuyển ấy — cột lý do của hồ sơ vừa đổi (hủy, trượt / kết quả thầu, tạm dừng), hoặc cờ
--   giao dịch `nvg.stage_note` nếu hàm gọi muốn ghi câu riêng.
-- - KHÔNG dựng lùi lịch sử cũ: `updated_at` không phải thời điểm chuyển bước, đoán ra là bịa. Lịch sử bắt đầu từ migration
--   này; các mốc cố định cũ vẫn hiện ở tab Lịch sử.
-- - Đọc theo đúng quyền đọc hồ sơ gốc (chính sách của bảng gốc áp trong EXISTS) — gồm cả phạm vi công trường (Mẫu E).
--   Không ai ghi / sửa / xoá từ trình duyệt.

CREATE TABLE IF NOT EXISTS public.stage_transitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies (id),
  entity_type text NOT NULL CHECK (entity_type IN ('contracts', 'bidding_projects', 'construction_sites')),
  entity_id   uuid NOT NULL,
  from_stage  text,
  to_stage    text NOT NULL,
  note        text,
  changed_by  uuid REFERENCES public.users (id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_transitions_entity_idx
  ON public.stage_transitions (entity_type, entity_id, changed_at);

COMMENT ON TABLE public.stage_transitions IS
  'Lịch sử chuyển bước của hợp đồng / gói thầu / công trình, ghi bằng trigger — 0225. Cơ hội dùng opportunity_stage_history.';

ALTER TABLE public.stage_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_transitions_select ON public.stage_transitions;
CREATE POLICY stage_transitions_select ON public.stage_transitions
  FOR SELECT TO authenticated
  USING (
    CASE entity_type
      WHEN 'contracts' THEN EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = entity_id)
      WHEN 'bidding_projects' THEN EXISTS (SELECT 1 FROM public.bidding_projects b WHERE b.id = entity_id)
      WHEN 'construction_sites' THEN EXISTS (SELECT 1 FROM public.construction_sites s WHERE s.id = entity_id)
      ELSE false
    END
  );

REVOKE ALL ON public.stage_transitions FROM anon;
GRANT SELECT ON public.stage_transitions TO authenticated;

CREATE OR REPLACE FUNCTION public.record_stage_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new  jsonb := to_jsonb(NEW);
  v_old  jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_note text  := NULLIF(btrim(current_setting('nvg.stage_note', true)), '');
  v_col  text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;
  -- Lý do vừa ghi cùng lần chuyển bước (cột tên có «reason» đổi giá trị trong chính câu lệnh này).
  IF v_note IS NULL THEN
    FOR v_col IN SELECT k FROM jsonb_object_keys(v_new) k WHERE k LIKE '%reason%' ORDER BY k LOOP
      IF (v_new ->> v_col) IS NOT NULL AND (v_new ->> v_col) IS DISTINCT FROM (v_old ->> v_col) THEN
        v_note := NULLIF(btrim(v_new ->> v_col), '');
        EXIT WHEN v_note IS NOT NULL;
      END IF;
    END LOOP;
  END IF;
  INSERT INTO public.stage_transitions (company_id, entity_type, entity_id, from_stage, to_stage, note, changed_by)
  VALUES (
    NEW.company_id, TG_TABLE_NAME, NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage::text END,
    NEW.stage::text, v_note, public.auth_user_id()
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stage_transition() FROM PUBLIC, anon, authenticated;

-- Không khai `UPDATE OF stage`: trigger cột chỉ chạy khi câu lệnh GHI cột `stage`, nên bước do trigger BEFORE đổi
-- (vd gói thầu tự sang Khảo sát khi lưu ghi chú — 0226) sẽ lọt khỏi lịch sử. Hàm tự bỏ qua lần sửa không đổi bước.

DROP TRIGGER IF EXISTS contracts_stage_transition ON public.contracts;
CREATE TRIGGER contracts_stage_transition
  AFTER INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.record_stage_transition();

DROP TRIGGER IF EXISTS bidding_projects_stage_transition ON public.bidding_projects;
CREATE TRIGGER bidding_projects_stage_transition
  AFTER INSERT OR UPDATE ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.record_stage_transition();

DROP TRIGGER IF EXISTS construction_sites_stage_transition ON public.construction_sites;
CREATE TRIGGER construction_sites_stage_transition
  AFTER INSERT OR UPDATE ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.record_stage_transition();
