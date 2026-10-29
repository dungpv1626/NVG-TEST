-- ============================================================================
-- 0247 — G6 (doc/KE_HOACH_KHOP_KHAO_SAT_ANH_THI.md A10): gói thầu có hình thức lựa chọn nhà thầu và
-- loại công trình, Ban Giám đốc quyết định tham gia, Cung ứng / Thi công / Kế toán góp ý ngay trên gói.
--
-- Nguồn: phiếu khảo sát Ban Giám đốc (HoSo_KhaoSat_NVG_full.md dòng 739, 743, 952, 959–965).
--
--  1. `bidding_projects.procurement_form` (chỉ định / chào giá cạnh tranh / đấu thầu) và `work_type`
--     (xây mới nhà xưởng / cải tạo nhà máy / bảo trì / nhà cao tầng / hạ tầng / công trình phụ trợ) —
--     chữ có CHECK, nhãn ở `shared/src/bid-participation.ts`.
--  2. Đánh giá tham gia: sáu tiêu chí (năng lực, tiến độ, dòng tiền, pháp lý, cạnh tranh, khả năng sinh
--     lời), mỗi tiêu chí một mức «Thuận lợi / Cần lưu ý / Rủi ro cao» + ghi chú (bắt buộc khi khác
--     «Thuận lợi»), cộng đề xuất tham gia / không và tóm tắt — jsonb `participation_assessment`.
--     `submit_bid_participation` kiểm đủ rồi mở phê duyệt loại mới `bid_participation` (Ban Giám đốc /
--     Tổng Giám đốc; Đấu thầu không có hạn mức nên không tự duyệt).
--  3. Ban Giám đốc từ chối = «Không tham gia»: bước mới `khong_tham_gia` (nhánh rẽ, KHÔNG tính là
--     trượt thầu trong tỷ lệ trúng / trượt), lý do vào `lost_reason`; cơ hội gốc đi theo quy tắc 0217
--     (sang Mất cơ hội trừ khi còn gói thầu khác đang chạy) — `bidding_projects_notify_opportunity`
--     chép bản 0217, thêm nhánh này. Nhắc hạn nộp (0208) tắt bằng `deadline_reminded_stage = 0`.
--  4. Cửa chặn ở CSDL: chưa duyệt tham gia thì người dùng KHÔNG lập được dự toán (BEFORE INSERT trên
--     `estimates`) và gói thầu không vào được Lập dự toán trở đi (BEFORE UPDATE trên bước). Áp cho mọi
--     thao tác có người đăng nhập (kể cả qua hàm nghiệp vụ); việc của hệ thống (seed, migration, quét
--     đêm) không có người đăng nhập nên không bị chặn. `stage_readiness('bidding')` (chép bản 0243,
--     thêm nhánh) trả điều kiện để màn hình nói lý do dưới nút bị khoá.
--     Gói thầu ĐÃ có dự toán / đã qua Lập dự toán lúc chạy migration → `truoc_quy_dinh` (lập trước khi
--     có bước này, không đòi — KHÔNG ghi là đã duyệt). Gói chưa tới đó phải đi qua quyết định.
--  5. Ý kiến các phòng: `bid_department_reviews` (mỗi gói một dòng mỗi phòng MH / TC / KT), người
--     chịu trách nhiệm gói xin ý kiến (`request_bid_reviews`, báo người của phòng), phòng trả lời
--     (`submit_bid_review`, báo người xin). Tệp báo giá nhà cung cấp: `bid_department_review_files` +
--     kho `bid-review-files`. Thi công / Kế toán / Cung ứng KHÔNG có quyền xem Module DA: họ đọc yêu
--     cầu và tóm tắt gói (không giá dự thầu, không dự toán, không giá vốn) qua `bid_reviews()`
--     SECURITY DEFINER. Hộp duyệt giá dự toán và hộp duyệt tham gia hiện các ý kiến này.
--  6. `decide_approval`: chép NGUYÊN VĂN bản 0246 (gói G2 chạy song song), thêm nhánh `bidding_projects`.
--     0246 đổi `decide_approval` lần nữa thì chép lại từ bản mới (giữ nhánh này).
--
-- Chạy lại được. Giá trị enum mới chỉ dùng trong thân hàm (chạy lúc gọi) hoặc so dạng text — migration
-- chạy chung một giao dịch thì giá trị enum vừa thêm chưa dùng được.
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'bid_participation';
ALTER TYPE public.bidding_stage ADD VALUE IF NOT EXISTS 'khong_tham_gia';

-- ----------------------------------------------------------------------------
-- 1–2. Cột mới trên gói thầu
-- ----------------------------------------------------------------------------
ALTER TABLE public.bidding_projects
  ADD COLUMN IF NOT EXISTS procurement_form text,
  ADD COLUMN IF NOT EXISTS work_type text,
  ADD COLUMN IF NOT EXISTS participation_status text,
  ADD COLUMN IF NOT EXISTS participation_assessment jsonb,
  ADD COLUMN IF NOT EXISTS participation_approval_id uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participation_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS participation_submitted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participation_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS participation_decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participation_decision_note text;

ALTER TABLE public.bidding_projects DROP CONSTRAINT IF EXISTS bidding_projects_procurement_form_check;
ALTER TABLE public.bidding_projects ADD CONSTRAINT bidding_projects_procurement_form_check
  CHECK (procurement_form IS NULL OR procurement_form IN ('chi_dinh', 'chao_gia_canh_tranh', 'dau_thau'));

ALTER TABLE public.bidding_projects DROP CONSTRAINT IF EXISTS bidding_projects_work_type_check;
ALTER TABLE public.bidding_projects ADD CONSTRAINT bidding_projects_work_type_check
  CHECK (work_type IS NULL OR work_type IN ('xay_moi_nha_xuong', 'cai_tao_nha_may', 'bao_tri',
                                            'nha_cao_tang', 'ha_tang', 'cong_trinh_phu_tro'));

-- Gói thầu đang có: chỉ gán MỘT lần (cột vừa thêm còn rỗng), nên chạy lại không đụng gói mới.
-- Đã có dự toán / đã qua Lập dự toán → lập trước khi có bước này; còn lại phải đi qua quyết định.
UPDATE public.bidding_projects b
   SET participation_status = CASE
         WHEN b.stage::text IN ('du_toan', 'cho_duyet_gia', 'da_duyet_gia', 'nop_thau', 'trung_thau', 'truot_thau')
           OR EXISTS (SELECT 1 FROM public.estimates e WHERE e.bidding_project_id = b.id AND e.deleted_at IS NULL)
         THEN 'truoc_quy_dinh'
         ELSE 'chua_danh_gia'
       END
 WHERE b.participation_status IS NULL;

ALTER TABLE public.bidding_projects ALTER COLUMN participation_status SET DEFAULT 'chua_danh_gia';
ALTER TABLE public.bidding_projects ALTER COLUMN participation_status SET NOT NULL;

ALTER TABLE public.bidding_projects DROP CONSTRAINT IF EXISTS bidding_projects_participation_status_check;
ALTER TABLE public.bidding_projects ADD CONSTRAINT bidding_projects_participation_status_check
  CHECK (participation_status IN ('chua_danh_gia', 'cho_duyet', 'da_duyet', 'khong_tham_gia', 'truoc_quy_dinh'));

COMMENT ON COLUMN public.bidding_projects.procurement_form IS
  'Hình thức lựa chọn nhà thầu (0247): chi_dinh / chao_gia_canh_tranh / dau_thau — nhãn ở shared/src/bid-participation.ts.';
COMMENT ON COLUMN public.bidding_projects.work_type IS
  'Loại công việc (0247): xay_moi_nha_xuong / cai_tao_nha_may / bao_tri / nha_cao_tang / ha_tang / cong_trinh_phu_tro.';
COMMENT ON COLUMN public.bidding_projects.participation_status IS
  'Quyết định tham gia (0247): chua_danh_gia → cho_duyet → da_duyet | khong_tham_gia. truoc_quy_dinh = gói đã lập dự toán trước khi có bước này (không đòi, KHÔNG phải đã duyệt). Chỉ hàm nghiệp vụ đổi.';
COMMENT ON COLUMN public.bidding_projects.participation_assessment IS
  'Đánh giá của người chịu trách nhiệm (0247): {criteria: {nang_luc|tien_do|dong_tien|phap_ly|canh_tranh|loi_nhuan: {rating: thuan_loi|can_luu_y|rui_ro_cao, note}}, recommendation: tham_gia|khong_tham_gia, summary}. Sửa được khi chưa gửi.';

-- Các chỗ còn thiếu của bản đánh giá — cùng quy tắc với `bidAssessmentMissing` (shared).
CREATE OR REPLACE FUNCTION public.bid_assessment_missing(p jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(m ORDER BY n), '{}') FROM (
    SELECT c.n,
           CASE
             WHEN COALESCE(p -> 'criteria' -> c.k ->> 'rating', '') NOT IN ('thuan_loi', 'can_luu_y', 'rui_ro_cao')
               THEN c.lbl || ': chọn mức'
             WHEN p -> 'criteria' -> c.k ->> 'rating' <> 'thuan_loi'
                  AND NULLIF(btrim(COALESCE(p -> 'criteria' -> c.k ->> 'note', '')), '') IS NULL
               THEN c.lbl || ': ghi rõ vì sao'
           END AS m
      FROM (VALUES (1, 'nang_luc', 'Năng lực'), (2, 'tien_do', 'Tiến độ'), (3, 'dong_tien', 'Dòng tiền'),
                   (4, 'phap_ly', 'Pháp lý'), (5, 'canh_tranh', 'Cạnh tranh'),
                   (6, 'loi_nhuan', 'Khả năng sinh lời')) AS c(n, k, lbl)
    UNION ALL
    SELECT 7, CASE WHEN COALESCE(p ->> 'recommendation', '') NOT IN ('tham_gia', 'khong_tham_gia')
                   THEN 'Đề xuất tham gia hay không' END
  ) x
  WHERE m IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.bid_assessment_missing(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bid_assessment_missing(jsonb) TO authenticated;

-- Cột quyết định chỉ hàm nghiệp vụ đổi; bản đánh giá và phân loại khoá khi đã gửi.
CREATE OR REPLACE FUNCTION public.bidding_projects_participation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Gói thầu mới luôn bắt đầu chưa có quyết định — không khai «đã duyệt» được từ trình duyệt.
    NEW.participation_status := 'chua_danh_gia';
    NEW.participation_approval_id := NULL;
    NEW.participation_submitted_at := NULL;
    NEW.participation_submitted_by := NULL;
    NEW.participation_decided_at := NULL;
    NEW.participation_decided_by := NULL;
    NEW.participation_decision_note := NULL;
    RETURN NEW;
  END IF;

  IF NEW.participation_status IS DISTINCT FROM OLD.participation_status
     OR NEW.participation_approval_id IS DISTINCT FROM OLD.participation_approval_id
     OR NEW.participation_submitted_at IS DISTINCT FROM OLD.participation_submitted_at
     OR NEW.participation_submitted_by IS DISTINCT FROM OLD.participation_submitted_by
     OR NEW.participation_decided_at IS DISTINCT FROM OLD.participation_decided_at
     OR NEW.participation_decided_by IS DISTINCT FROM OLD.participation_decided_by
     OR NEW.participation_decision_note IS DISTINCT FROM OLD.participation_decision_note THEN
    RAISE EXCEPTION 'Quyết định tham gia chỉ đổi qua «Gửi phê duyệt» và Hộp thư Phê duyệt.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.participation_status IN ('cho_duyet', 'da_duyet', 'khong_tham_gia')
     AND (NEW.participation_assessment IS DISTINCT FROM OLD.participation_assessment
          OR NEW.procurement_form IS DISTINCT FROM OLD.procurement_form
          OR NEW.work_type IS DISTINCT FROM OLD.work_type) THEN
    RAISE EXCEPTION 'Đánh giá tham gia đã gửi Ban Giám đốc nên không sửa được — hình thức, loại công trình và đánh giá giữ đúng như lúc gửi.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bidding_projects_participation_guard ON public.bidding_projects;
CREATE TRIGGER bidding_projects_participation_guard
  BEFORE INSERT OR UPDATE ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.bidding_projects_participation_guard();

-- ----------------------------------------------------------------------------
-- 4. Cửa chặn: chưa duyệt tham gia thì không lập dự toán, không qua Lập dự toán
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bid_participation_block_reason(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'chua_danh_gia' THEN 'Gói thầu chưa được Ban Giám đốc duyệt tham gia — điền «Đánh giá và quyết định tham gia» ở tab Tổng quan rồi gửi phê duyệt trước khi lập dự toán.'
    WHEN 'cho_duyet'     THEN 'Quyết định tham gia đang chờ Ban Giám đốc duyệt — duyệt xong mới lập được dự toán.'
    WHEN 'khong_tham_gia' THEN 'Ban Giám đốc đã quyết định không tham gia gói thầu này.'
  END;
$$;

CREATE OR REPLACE FUNCTION public.estimates_participation_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.bidding_project_id IS NULL OR public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT participation_status INTO v_status FROM public.bidding_projects WHERE id = NEW.bidding_project_id;
  IF v_status IS NOT NULL AND v_status NOT IN ('da_duyet', 'truoc_quy_dinh') THEN
    RAISE EXCEPTION '%', public.bid_participation_block_reason(v_status) USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_participation_gate ON public.estimates;
CREATE TRIGGER estimates_participation_gate
  BEFORE INSERT ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.estimates_participation_gate();

-- Tên bắt đầu bằng «z» để chạy SAU các trigger BEFORE khác (0226 tự đổi bước trong BEFORE).
CREATE OR REPLACE FUNCTION public.bidding_projects_participation_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage OR public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.stage::text IN ('du_toan', 'cho_duyet_gia', 'da_duyet_gia', 'nop_thau', 'trung_thau')
     AND NEW.participation_status NOT IN ('da_duyet', 'truoc_quy_dinh') THEN
    RAISE EXCEPTION '%', public.bid_participation_block_reason(NEW.participation_status) USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bidding_projects_z_participation_gate ON public.bidding_projects;
CREATE TRIGGER bidding_projects_z_participation_gate
  BEFORE UPDATE ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.bidding_projects_participation_gate();

-- ----------------------------------------------------------------------------
-- 2. Gửi quyết định tham gia
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_bid_participation(p_bidding_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  b          record;
  v_missing  text[];
  v_approval uuid;
  v_subject  public.approval_subject := 'bid_participation';
  v_risks    text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO b FROM public.bidding_projects WHERE id = p_bidding_project_id FOR UPDATE;
  IF NOT FOUND OR b.deleted_at IS NOT NULL OR NOT public.rls_company_access(b.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy gói thầu, hoặc không có quyền truy cập.';
  END IF;
  IF public.auth_is_read_only() OR NOT public.auth_can_edit_module('DA')
     OR NOT public.rls_owner_can_write(b.company_id, b.responsible_user_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm gói thầu gửi được quyết định tham gia.' USING ERRCODE = '42501';
  END IF;
  IF b.participation_status = 'cho_duyet' THEN
    RAISE EXCEPTION 'Quyết định tham gia đang chờ Ban Giám đốc duyệt.';
  ELSIF b.participation_status IN ('da_duyet', 'truoc_quy_dinh') THEN
    RAISE EXCEPTION 'Gói thầu đã qua bước quyết định tham gia.';
  ELSIF b.participation_status = 'khong_tham_gia' OR b.stage::text IN ('trung_thau', 'truot_thau', 'khong_tham_gia') THEN
    RAISE EXCEPTION 'Gói thầu đã kết thúc.';
  END IF;
  IF b.procurement_form IS NULL OR b.work_type IS NULL THEN
    RAISE EXCEPTION 'Ghi hình thức lựa chọn nhà thầu và loại công trình trước khi gửi quyết định tham gia.';
  END IF;
  v_missing := public.bid_assessment_missing(b.participation_assessment);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Đánh giá tham gia còn thiếu: %.', array_to_string(v_missing, '; ');
  END IF;

  SELECT string_agg(c.lbl, ', ' ORDER BY c.n) INTO v_risks
    FROM (VALUES (1, 'nang_luc', 'năng lực'), (2, 'tien_do', 'tiến độ'), (3, 'dong_tien', 'dòng tiền'),
                 (4, 'phap_ly', 'pháp lý'), (5, 'canh_tranh', 'cạnh tranh'),
                 (6, 'loi_nhuan', 'khả năng sinh lời')) AS c(n, k, lbl)
   WHERE b.participation_assessment -> 'criteria' -> c.k ->> 'rating' = 'rui_ro_cao';

  INSERT INTO public.approvals (company_id, subject, entity_type, entity_id, entity_code,
                                title, amount, reason, status, requested_by)
  VALUES (b.company_id, v_subject, 'bidding_projects', b.id, b.code,
          format('Quyết định tham gia gói thầu %s — %s', b.code, b.name),
          b.estimated_value,
          btrim(concat_ws(' ',
            CASE b.participation_assessment ->> 'recommendation'
              WHEN 'tham_gia' THEN 'Đề xuất tham gia.' ELSE 'Đề xuất không tham gia.' END,
            CASE WHEN v_risks IS NOT NULL THEN format('Rủi ro cao: %s.', v_risks) END,
            NULLIF(btrim(b.participation_assessment ->> 'summary'), ''))),
          'pending_approval', v_user)
  RETURNING id INTO v_approval;

  UPDATE public.bidding_projects
     SET participation_status = 'cho_duyet', participation_approval_id = v_approval,
         participation_submitted_at = now(), participation_submitted_by = v_user,
         participation_decided_at = NULL, participation_decided_by = NULL, participation_decision_note = NULL,
         updated_at = now(), updated_by = v_user
   WHERE id = b.id;

  RETURN v_approval;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_bid_participation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_bid_participation(uuid) TO authenticated;
COMMENT ON FUNCTION public.submit_bid_participation(uuid) IS
  'Người chịu trách nhiệm gói thầu gửi Ban Giám đốc quyết định tham gia (0247): cần hình thức, loại công trình và đủ đánh giá sáu tiêu chí + đề xuất. Mở phê duyệt bid_participation.';

-- ----------------------------------------------------------------------------
-- 3. Gói thầu «Không tham gia» → cơ hội gốc (bản 0217 + nhánh khong_tham_gia)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bidding_projects_notify_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner  uuid;
  v_ocode  text;
  v_ostage text;
  v_reason text;
  v_skip   boolean := NEW.stage::text = 'khong_tham_gia';
BEGIN
  IF NEW.opportunity_id IS NULL OR NEW.stage IS NOT DISTINCT FROM OLD.stage
     OR NEW.stage::text NOT IN ('truot_thau', 'khong_tham_gia') THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, code, stage::text INTO v_owner, v_ocode, v_ostage
    FROM public.opportunities
   WHERE id = NEW.opportunity_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR v_ostage IN ('ky_hop_dong', 'mat_co_hoi') THEN
    RETURN NEW;
  END IF;

  -- Cùng cơ hội còn gói thầu khác chưa có kết quả thì cơ hội chưa mất.
  IF EXISTS (
    SELECT 1 FROM public.bidding_projects b
     WHERE b.opportunity_id = NEW.opportunity_id AND b.id <> NEW.id AND b.deleted_at IS NULL
       AND b.stage::text NOT IN ('truot_thau', 'khong_tham_gia')
  ) THEN
    IF v_owner IS NOT NULL THEN
      PERFORM public.create_notification(
        v_owner, NEW.company_id, 'bid_lost',
        format(CASE WHEN v_skip
                    THEN 'Ban Giám đốc quyết định không tham gia gói thầu %s. Cơ hội %s còn gói thầu khác nên chưa chuyển sang Mất cơ hội.'
                    ELSE 'Gói thầu %s trượt thầu. Cơ hội %s còn gói thầu khác nên chưa chuyển sang Mất cơ hội.' END,
               NEW.code, v_ocode),
        'opportunities', NEW.opportunity_id, format('/crm/co-hoi/%s', NEW.opportunity_id)
      );
    END IF;
    RETURN NEW;
  END IF;

  v_reason := CASE WHEN v_skip
                   THEN format('Không tham gia gói thầu %s', NEW.code)
                        || COALESCE(': ' || NULLIF(btrim(NEW.participation_decision_note), ''), '')
                   ELSE format('Trượt thầu gói %s', NEW.code)
                        || COALESCE(': ' || NULLIF(btrim(NEW.lost_reason), ''), '')
              END;

  PERFORM set_config('nvg.stage_note', v_reason, true);
  UPDATE public.opportunities
     SET stage = 'mat_co_hoi', lost_reason = v_reason, updated_at = now()
   WHERE id = NEW.opportunity_id;

  IF v_owner IS NOT NULL THEN
    PERFORM public.create_notification(
      v_owner, NEW.company_id, 'bid_lost',
      format(CASE WHEN v_skip
                  THEN 'Ban Giám đốc quyết định không tham gia gói thầu %s — cơ hội %s đã tự chuyển sang Mất cơ hội.'
                  ELSE 'Gói thầu %s trượt thầu — cơ hội %s đã tự chuyển sang Mất cơ hội.' END,
             NEW.code, v_ocode),
      'opportunities', NEW.opportunity_id, format('/crm/co-hoi/%s', NEW.opportunity_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bidding_projects_notify_opportunity() IS
  'Gói thầu trượt thầu hoặc Ban Giám đốc quyết định không tham gia → cơ hội gốc tự sang Mất cơ hội kèm lý do, trừ khi còn gói thầu khác đang chạy (0217, 0247).';

-- ----------------------------------------------------------------------------
-- 5. Ý kiến các phòng
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bid_department_reviews (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bidding_project_id     uuid NOT NULL REFERENCES public.bidding_projects(id) ON DELETE CASCADE,
  department             text NOT NULL CHECK (department IN ('MH', 'TC', 'KT')),
  status                 text NOT NULL DEFAULT 'cho_y_kien' CHECK (status IN ('cho_y_kien', 'da_gop_y')),
  request_note           text,
  requested_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  requested_at           timestamptz NOT NULL DEFAULT now(),
  recommendation         text CHECK (recommendation IS NULL OR recommendation IN ('dong_y', 'dong_y_co_dieu_kien', 'khong_dong_y')),
  summary                text,
  supplier_quotes        text,
  method_opinion         text,
  capacity_opinion       text,
  cash_flow_opinion      text,
  guarantee_opinion      text,
  payment_terms_opinion  text,
  responded_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  responded_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (bidding_project_id, department)
);

COMMENT ON TABLE public.bid_department_reviews IS
  'Ý kiến của Cung ứng (MH), Thi công (TC), Kế toán – Tài chính (KT) trên gói thầu (0247, dòng 743 phiếu Ban Giám đốc). Mỗi gói một dòng mỗi phòng; chỉ ghi qua request_bid_reviews / submit_bid_review.';

CREATE INDEX IF NOT EXISTS bid_department_reviews_dept_idx
  ON public.bid_department_reviews (department, status, company_id);

-- Vai trò thuộc từng phòng. Chỉ huy trưởng (CHT) không tính — ý kiến năng lực là của Trưởng phòng
-- Thi công; Giám đốc Tài chính (CFO) cùng phòng Kế toán – Tài chính.
CREATE OR REPLACE FUNCTION public.bid_review_department_roles(p_department text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_department
    WHEN 'MH' THEN ARRAY['MH']
    WHEN 'TC' THEN ARRAY['TC']
    WHEN 'KT' THEN ARRAY['KT', 'CFO']
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.auth_in_bid_review_department(p_department text, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_company_access(p_company_id) AND EXISTS (
    SELECT 1 FROM public.user_companies uc
      JOIN public.roles r ON r.id = uc.role_id
     WHERE uc.user_id = public.auth_user_id() AND uc.deleted_at IS NULL
       AND r.code::text = ANY (public.bid_review_department_roles(p_department))
       AND (uc.company_id = p_company_id OR r.sees_all_companies)
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_bid_review_readable(p_review_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bid_department_reviews rv
     WHERE rv.id = p_review_id
       AND (public.rls_bidding_project_readable(rv.bidding_project_id)
            OR public.auth_in_bid_review_department(rv.department, rv.company_id))
  );
$$;

-- Người của phòng trả lời được tới khi gói thầu có kết quả.
CREATE OR REPLACE FUNCTION public.rls_bid_review_writable(p_review_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bid_department_reviews rv
      JOIN public.bidding_projects b ON b.id = rv.bidding_project_id
     WHERE rv.id = p_review_id AND b.deleted_at IS NULL
       AND b.stage::text NOT IN ('trung_thau', 'truot_thau', 'khong_tham_gia')
       AND NOT public.auth_is_read_only()
       AND public.auth_in_bid_review_department(rv.department, rv.company_id)
  );
$$;

REVOKE ALL ON FUNCTION public.auth_in_bid_review_department(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_bid_review_readable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_bid_review_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_in_bid_review_department(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_bid_review_readable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_bid_review_writable(uuid) TO authenticated;

ALTER TABLE public.bid_department_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bid_department_reviews FROM anon;
GRANT SELECT ON public.bid_department_reviews TO authenticated;

DROP POLICY IF EXISTS bid_department_reviews_select ON public.bid_department_reviews;
CREATE POLICY bid_department_reviews_select ON public.bid_department_reviews
  FOR SELECT TO authenticated
  USING (public.rls_bidding_project_readable(bidding_project_id)
         OR public.auth_in_bid_review_department(department, company_id));
-- Không có chính sách INSERT / UPDATE / DELETE: chỉ hai hàm dưới đây ghi.

CREATE OR REPLACE FUNCTION public.request_bid_reviews(
  p_bidding_project_id uuid,
  p_departments text[],
  p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.auth_user_id();
  b       record;
  d       text;
  v_id    uuid;
  v_note  text := NULLIF(btrim(p_note), '');
  v_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO b FROM public.bidding_projects WHERE id = p_bidding_project_id;
  IF NOT FOUND OR b.deleted_at IS NOT NULL OR NOT public.rls_company_access(b.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy gói thầu, hoặc không có quyền truy cập.';
  END IF;
  IF public.auth_is_read_only() OR NOT public.auth_can_edit_module('DA')
     OR NOT public.rls_owner_can_write(b.company_id, b.responsible_user_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm gói thầu xin ý kiến các phòng được.' USING ERRCODE = '42501';
  END IF;
  IF b.stage::text IN ('trung_thau', 'truot_thau', 'khong_tham_gia') THEN
    RAISE EXCEPTION 'Gói thầu đã kết thúc.';
  END IF;
  IF p_departments IS NULL OR cardinality(p_departments) = 0 THEN
    RAISE EXCEPTION 'Chọn ít nhất một phòng cần xin ý kiến.';
  END IF;

  FOREACH d IN ARRAY p_departments LOOP
    IF d NOT IN ('MH', 'TC', 'KT') THEN
      RAISE EXCEPTION 'Phòng không hợp lệ: %.', d;
    END IF;

    INSERT INTO public.bid_department_reviews AS rv
           (company_id, bidding_project_id, department, request_note, requested_by, created_by, updated_by)
    VALUES (b.company_id, b.id, d, v_note, v_user, v_user, v_user)
    ON CONFLICT (bidding_project_id, department) DO UPDATE
      -- Xin lại sau khi phòng đã góp ý: mở lại «chờ ý kiến», giữ nội dung cũ để phòng sửa tiếp.
      -- Đang chờ thì chỉ nhắc lại (giữ mốc bắt đầu chờ).
      SET status = 'cho_y_kien',
          request_note = COALESCE(EXCLUDED.request_note, rv.request_note),
          requested_by = EXCLUDED.requested_by,
          requested_at = CASE WHEN rv.status = 'da_gop_y' THEN now() ELSE rv.requested_at END,
          updated_at = now(), updated_by = v_user
    RETURNING rv.id INTO v_id;

    PERFORM public.create_notification(
      u.id, b.company_id, 'bid_review_requested',
      format('Gói thầu %s — %s cần ý kiến của phòng %s%s', b.code, b.name,
             CASE d WHEN 'MH' THEN 'Cung ứng – Mua hàng' WHEN 'TC' THEN 'Thi công' ELSE 'Kế toán – Tài chính' END,
             COALESCE(': ' || v_note, '.')),
      'bid_department_reviews', v_id, '/y-kien-goi-thau/' || v_id
    )
    FROM public.users u
    WHERE u.is_active AND u.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_companies uc JOIN public.roles r ON r.id = uc.role_id
         WHERE uc.user_id = u.id AND uc.deleted_at IS NULL
           AND r.code::text = ANY (public.bid_review_department_roles(d))
           AND (uc.company_id = b.company_id OR r.sees_all_companies));

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.request_bid_reviews(uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_bid_reviews(uuid, text[], text) TO authenticated;
COMMENT ON FUNCTION public.request_bid_reviews(uuid, text[], text) IS
  'Người chịu trách nhiệm gói thầu xin ý kiến Cung ứng / Thi công / Kế toán (0247); báo người của từng phòng.';

CREATE OR REPLACE FUNCTION public.submit_bid_review(
  p_review_id uuid,
  p_recommendation text,
  p_summary text DEFAULT NULL,
  p_supplier_quotes text DEFAULT NULL,
  p_method_opinion text DEFAULT NULL,
  p_capacity_opinion text DEFAULT NULL,
  p_cash_flow_opinion text DEFAULT NULL,
  p_guarantee_opinion text DEFAULT NULL,
  p_payment_terms_opinion text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  rv     record;
  b      record;
  v_missing text[] := '{}';
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO rv FROM public.bid_department_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_bid_review_readable(p_review_id) THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu ý kiến, hoặc không có quyền truy cập.';
  END IF;
  IF NOT public.rls_bid_review_writable(p_review_id) THEN
    RAISE EXCEPTION 'Chỉ người của phòng được xin ý kiến trả lời được, và chỉ khi gói thầu chưa có kết quả.'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_recommendation, '') NOT IN ('dong_y', 'dong_y_co_dieu_kien', 'khong_dong_y') THEN
    v_missing := v_missing || 'kết luận của phòng'::text;
  END IF;
  IF rv.department = 'MH' AND NULLIF(btrim(p_supplier_quotes), '') IS NULL THEN
    v_missing := v_missing || 'báo giá nhà cung cấp đã lấy'::text;
  ELSIF rv.department = 'TC' THEN
    IF NULLIF(btrim(p_method_opinion), '') IS NULL THEN v_missing := v_missing || 'biện pháp thi công'::text; END IF;
    IF NULLIF(btrim(p_capacity_opinion), '') IS NULL THEN v_missing := v_missing || 'năng lực đáp ứng'::text; END IF;
  ELSIF rv.department = 'KT' THEN
    IF NULLIF(btrim(p_cash_flow_opinion), '') IS NULL THEN v_missing := v_missing || 'dòng tiền'::text; END IF;
    IF NULLIF(btrim(p_guarantee_opinion), '') IS NULL THEN v_missing := v_missing || 'bảo lãnh'::text; END IF;
    IF NULLIF(btrim(p_payment_terms_opinion), '') IS NULL THEN v_missing := v_missing || 'điều kiện thanh toán'::text; END IF;
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Ý kiến còn thiếu: %.', array_to_string(v_missing, ', ');
  END IF;

  UPDATE public.bid_department_reviews
     SET status = 'da_gop_y', recommendation = p_recommendation,
         summary = NULLIF(btrim(p_summary), ''),
         supplier_quotes = CASE WHEN rv.department = 'MH' THEN NULLIF(btrim(p_supplier_quotes), '') END,
         method_opinion = CASE WHEN rv.department = 'TC' THEN NULLIF(btrim(p_method_opinion), '') END,
         capacity_opinion = CASE WHEN rv.department = 'TC' THEN NULLIF(btrim(p_capacity_opinion), '') END,
         cash_flow_opinion = CASE WHEN rv.department = 'KT' THEN NULLIF(btrim(p_cash_flow_opinion), '') END,
         guarantee_opinion = CASE WHEN rv.department = 'KT' THEN NULLIF(btrim(p_guarantee_opinion), '') END,
         payment_terms_opinion = CASE WHEN rv.department = 'KT' THEN NULLIF(btrim(p_payment_terms_opinion), '') END,
         responded_by = v_user, responded_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_review_id;

  SELECT id, code, company_id, responsible_user_id INTO b
    FROM public.bidding_projects WHERE id = rv.bidding_project_id;
  PERFORM public.create_notification(
    x.uid, b.company_id, 'bid_review_answered',
    format('Phòng %s đã góp ý gói thầu %s.',
           CASE rv.department WHEN 'MH' THEN 'Cung ứng – Mua hàng' WHEN 'TC' THEN 'Thi công' ELSE 'Kế toán – Tài chính' END,
           b.code),
    'bidding_projects', b.id, '/da/goi-thau/' || b.id || '?tab=tong-quan'
  )
  FROM (SELECT DISTINCT uid FROM unnest(ARRAY[rv.requested_by, b.responsible_user_id]) AS t(uid)
         WHERE uid IS NOT NULL) x;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_bid_review(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_bid_review(uuid, text, text, text, text, text, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.submit_bid_review(uuid, text, text, text, text, text, text, text, text) IS
  'Phòng Cung ứng / Thi công / Kế toán trả lời yêu cầu ý kiến gói thầu (0247). Sửa lại được tới khi gói có kết quả; báo người xin.';

-- Tệp kèm ý kiến (báo giá nhà cung cấp của Cung ứng…). Thư mục đầu của đường dẫn = mã yêu cầu ý kiến.
CREATE TABLE IF NOT EXISTS public.bid_department_review_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
  review_id   uuid NOT NULL REFERENCES public.bid_department_reviews(id) ON DELETE CASCADE,
  file_path   text NOT NULL UNIQUE,
  file_name   text NOT NULL,
  mime_type   text,
  size_bytes  bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS bid_department_review_files_review_idx
  ON public.bid_department_review_files (review_id);

CREATE OR REPLACE FUNCTION public.bid_department_review_files_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT rv.company_id INTO NEW.company_id FROM public.bid_department_reviews rv WHERE rv.id = NEW.review_id;
  NEW.created_at := now();
  NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  IF split_part(NEW.file_path, '/', 1) <> NEW.review_id::text THEN
    RAISE EXCEPTION 'Tệp phải nằm trong thư mục của đúng yêu cầu ý kiến.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bid_department_review_files_before_write ON public.bid_department_review_files;
CREATE TRIGGER bid_department_review_files_before_write
  BEFORE INSERT ON public.bid_department_review_files
  FOR EACH ROW EXECUTE FUNCTION public.bid_department_review_files_before_write();

ALTER TABLE public.bid_department_review_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bid_department_review_files FROM anon;
GRANT SELECT, INSERT, DELETE ON public.bid_department_review_files TO authenticated;

DROP POLICY IF EXISTS bid_department_review_files_select ON public.bid_department_review_files;
CREATE POLICY bid_department_review_files_select ON public.bid_department_review_files
  FOR SELECT TO authenticated USING (public.rls_bid_review_readable(review_id));

DROP POLICY IF EXISTS bid_department_review_files_insert ON public.bid_department_review_files;
CREATE POLICY bid_department_review_files_insert ON public.bid_department_review_files
  FOR INSERT TO authenticated WITH CHECK (public.rls_bid_review_writable(review_id));

DROP POLICY IF EXISTS bid_department_review_files_delete ON public.bid_department_review_files;
CREATE POLICY bid_department_review_files_delete ON public.bid_department_review_files
  FOR DELETE TO authenticated USING (public.rls_bid_review_writable(review_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bid-review-files', 'bid-review-files', false, 26214400,
        ARRAY[
          'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
          'application/pdf',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS bid_review_files_select ON storage.objects;
CREATE POLICY bid_review_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bid-review-files'
         AND public.rls_bid_review_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS bid_review_files_insert ON storage.objects;
CREATE POLICY bid_review_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bid-review-files'
              AND public.rls_bid_review_writable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS bid_review_files_delete ON storage.objects;
CREATE POLICY bid_review_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bid-review-files'
         AND public.rls_bid_review_writable(public.try_uuid((storage.foldername(name))[1])));

-- Yêu cầu ý kiến kèm TÓM TẮT gói thầu — cho người của phòng (không xem được Module DA) lẫn người
-- xem gói thầu. Chỉ thông tin hồ sơ mời thầu: KHÔNG giá dự thầu, KHÔNG dự toán, KHÔNG giá vốn.
CREATE OR REPLACE FUNCTION public.bid_reviews(
  p_bidding_project_id uuid DEFAULT NULL,
  p_review_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id                    uuid,
  bidding_project_id    uuid,
  company_id            uuid,
  company_code          text,
  department            text,
  status                text,
  request_note          text,
  requested_by_name     text,
  requested_at          timestamptz,
  recommendation        text,
  summary               text,
  supplier_quotes       text,
  method_opinion        text,
  capacity_opinion      text,
  cash_flow_opinion     text,
  guarantee_opinion     text,
  payment_terms_opinion text,
  responded_by_name     text,
  responded_at          timestamptz,
  can_respond           boolean,
  bid_code              text,
  bid_name              text,
  bid_stage             text,
  customer_name         text,
  site_address          text,
  submission_deadline   date,
  estimated_value       bigint,
  procurement_form      text,
  work_type             text,
  survey_notes          text,
  responsible_name      text,
  file_count            integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rv.id, rv.bidding_project_id, rv.company_id, c.code::text, rv.department, rv.status,
         rv.request_note, rq.full_name::text, rv.requested_at, rv.recommendation, rv.summary,
         rv.supplier_quotes, rv.method_opinion, rv.capacity_opinion, rv.cash_flow_opinion,
         rv.guarantee_opinion, rv.payment_terms_opinion, rs.full_name::text, rv.responded_at,
         public.rls_bid_review_writable(rv.id),
         b.code::text, b.name, b.stage::text, cu.name::text, b.site_address, b.submission_deadline,
         b.estimated_value, b.procurement_form, b.work_type, b.survey_notes, ru.full_name::text,
         (SELECT count(*)::integer FROM public.bid_department_review_files f WHERE f.review_id = rv.id)
    FROM public.bid_department_reviews rv
    JOIN public.bidding_projects b ON b.id = rv.bidding_project_id AND b.deleted_at IS NULL
    JOIN public.companies c ON c.id = rv.company_id
    LEFT JOIN public.customers cu ON cu.id = b.customer_id
    LEFT JOIN public.users rq ON rq.id = rv.requested_by
    LEFT JOIN public.users rs ON rs.id = rv.responded_by
    LEFT JOIN public.users ru ON ru.id = b.responsible_user_id
   WHERE (p_bidding_project_id IS NULL OR rv.bidding_project_id = p_bidding_project_id)
     AND (p_review_id IS NULL OR rv.id = p_review_id)
     AND (public.rls_bidding_project_readable(rv.bidding_project_id)
          OR public.auth_in_bid_review_department(rv.department, rv.company_id))
   ORDER BY (rv.status = 'cho_y_kien') DESC, rv.requested_at DESC;
$$;

REVOKE ALL ON FUNCTION public.bid_reviews(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bid_reviews(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.bid_reviews(uuid, uuid) IS
  'Yêu cầu ý kiến các phòng kèm tóm tắt gói thầu (0247) — cho người xem gói thầu và người của phòng được hỏi. Không có giá dự thầu, dự toán, giá vốn.';

-- ----------------------------------------------------------------------------
-- 4. stage_readiness — chép NGUYÊN VĂN bản 0243, thêm nhánh gói thầu
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stage_readiness(p_entity_type text, p_id uuid)
RETURNS TABLE (for_stage text, requirement text, met boolean, label text, waivable boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o            record;
  c            record;
  v_site       record;
  v_missing    text[];
  v_classified boolean;
  v_class_lbl  text;
  v_surveyed   boolean;
  v_any_surveyed boolean;
  v_bid        record;
BEGIN
  IF p_entity_type = 'opportunity' THEN
    SELECT id, company_id, stage, classification, project_type, survey_waived_reason, deleted_at
      INTO o
      FROM public.opportunities WHERE id = p_id;
    -- Không đọc được cơ hội thì không trả gì — không lộ cả việc cơ hội có tồn tại.
    IF NOT FOUND OR o.deleted_at IS NOT NULL OR NOT public.rls_company_access(o.company_id) THEN
      RETURN;
    END IF;

    v_classified := o.classification IN ('M2', 'M3', 'M4')
                    AND NULLIF(btrim(o.project_type), '') IS NOT NULL;
    v_class_lbl := CASE
      WHEN o.classification = 'M1' THEN
        'Khách đang ở mức «Chưa có nhu cầu — lưu để chăm sóc sau» (M1): chỉ đi tiếp khi khách có nhu cầu thật'
      ELSE 'Đã phân loại: khách có nhu cầu thật (M2–M4) và khai loại công trình'
    END;
    -- 0175 (Đợt 1 — 1D): «đã khảo sát» = có biên bản đã khảo sát VÀ báo cáo đã được Ban Giám đốc
    -- duyệt. Chưa duyệt (nháp, chờ duyệt, bị trả về) thì chưa sang Báo giá — chủ dự án chốt.
    v_surveyed := EXISTS (SELECT 1 FROM public.site_surveys s
                           WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                             AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now()
                             AND s.report_status = 'da_duyet');
    -- Đã có buổi khảo sát thật thì KHÔNG còn lối «bỏ qua khảo sát»: lối đó dành cho cơ hội không
    -- khảo sát, dùng ở đây là vượt qua Ban Giám đốc (thấy khi chạy thử 17/10/2026).
    v_any_surveyed := EXISTS (SELECT 1 FROM public.site_surveys s
                               WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                                 AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now());

    RETURN QUERY SELECT 'khao_sat'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY SELECT 'bao_gia'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY
    SELECT 'bao_gia'::text, 'survey_done'::text,
           v_surveyed OR (o.survey_waived_reason IS NOT NULL AND NOT v_any_surveyed),
           CASE WHEN NOT v_any_surveyed AND o.survey_waived_reason IS NOT NULL
                THEN 'Bỏ qua khảo sát: ' || o.survey_waived_reason
                -- 0183: nói đúng tình trạng báo cáo — «gửi báo cáo, chờ duyệt» đọc như ĐÃ gửi rồi,
                -- trong khi báo cáo còn nháp (anh Dũng chạy thử 20/10/2026).
                WHEN v_any_surveyed AND NOT v_surveyed
                THEN CASE (SELECT s.report_status::text FROM public.site_surveys s
                            WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                              AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now()
                            ORDER BY s.surveyed_at DESC LIMIT 1)
                       WHEN 'cho_duyet'
                       THEN 'Báo cáo khảo sát đang chờ Ban Giám đốc duyệt — duyệt xong tự sang Báo giá'
                       WHEN 'tra_ve'
                       THEN 'Báo cáo khảo sát bị Ban Giám đốc trả về — sửa theo ý kiến rồi gửi lại'
                       ELSE 'Đã khảo sát nhưng chưa gửi báo cáo — bấm «Gửi Ban Giám đốc duyệt» ở tab Khảo sát'
                     END
                ELSE 'Báo cáo khảo sát đã được Ban Giám đốc duyệt' END,
           NOT v_any_surveyed;

    RETURN QUERY
    SELECT 'dam_phan'::text, 'offer_sent'::text,
           (EXISTS (SELECT 1 FROM public.quotes q
                     WHERE q.opportunity_id = p_id AND q.is_current_version AND q.deleted_at IS NULL
                       AND q.status = 'completed' AND q.sent_to_customer_at IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.bidding_projects b
                        WHERE b.opportunity_id = p_id AND b.deleted_at IS NULL
                          AND b.stage IN ('nop_thau', 'trung_thau'))
            OR EXISTS (SELECT 1 FROM public.design_projects d
                        WHERE d.opportunity_id = p_id AND d.deleted_at IS NULL
                          AND d.stage IN ('cho_khach_duyet', 'ho_so_ky_thuat', 'du_toan',
                                          'ban_giao', 'dung_thiet_ke'))),
           'Báo giá đã duyệt và đã gửi khách, hoặc gói thầu đã nộp, hoặc phương án thiết kế đã gửi khách duyệt'::text,
           false;

    RETURN QUERY
    SELECT 'ky_hop_dong'::text, 'contract_signed'::text, false,
           -- 0243: hợp đồng thiết kế ký xong chưa đủ (còn hợp đồng thi công), trừ khi «Chỉ thiết kế».
           CASE WHEN (SELECT design_only_at FROM public.opportunities WHERE id = p_id) IS NOT NULL
                THEN 'Chỉ thiết kế: tự chuyển khi hợp đồng thiết kế được ghi nhận đã ký'
                ELSE 'Tự chuyển khi hợp đồng thi công (hoặc thiết kế – thi công trọn gói) được ghi nhận đã ký — hợp đồng thiết kế ký xong cơ hội vẫn mở'
           END::text, false;
  END IF;
  IF p_entity_type = 'contract' THEN
    SELECT id, value, stage, deleted_at INTO c FROM public.contracts WHERE id = p_id;
    IF NOT FOUND OR c.deleted_at IS NOT NULL OR NOT public.rls_contract_readable(p_id) THEN
      RETURN;
    END IF;

    -- Cùng ba nhóm điều khoản mà `submit_contract_approval` (0027) chặn — đọc trước để màn hình
    -- nói «còn thiếu gì» thay vì để người dùng bấm rồi mới nhận lỗi.
    SELECT array_agg(CASE r.t WHEN 'pham_vi' THEN 'phạm vi công việc'
                              ELSE 'tiến độ thanh toán' END ORDER BY r.n)
      INTO v_missing
      FROM unnest(ARRAY['pham_vi', 'tien_do_thanh_toan']::contract_term_type[])
           WITH ORDINALITY AS r(t, n)
     WHERE NOT EXISTS (SELECT 1 FROM public.contract_terms ct
                        WHERE ct.contract_id = p_id AND ct.deleted_at IS NULL AND ct.term_type = r.t);

    RETURN QUERY SELECT 'cho_duyet'::text, 'value_set'::text,
           COALESCE(c.value, 0) > 0,
           'Có giá trị hợp đồng (lấy từ báo giá / dự toán đã duyệt)'::text, false;

    RETURN QUERY SELECT 'cho_duyet'::text, 'terms_complete'::text,
           v_missing IS NULL,
           CASE WHEN v_missing IS NULL
                THEN 'Đã ghi đủ điều khoản bắt buộc: phạm vi công việc, tiến độ thanh toán'
                ELSE 'Ghi điều khoản còn thiếu: ' || array_to_string(v_missing, ', ') END,
           false;

    -- 0176 (Đợt 1 — 1E): pháp nhân đã có mẫu Word cho loại hợp đồng này thì phải lập văn bản trước
    -- khi gửi phê duyệt — người duyệt xem đúng văn bản sẽ ký. Chưa có mẫu thì không đòi.
    IF public.contract_requires_document(p_id) THEN
      RETURN QUERY SELECT 'cho_duyet'::text, 'document_ready'::text,
             EXISTS (SELECT 1 FROM public.contract_documents d WHERE d.contract_id = p_id),
             'Đã lập văn bản hợp đồng từ mẫu (tab Văn bản)'::text, false;
    END IF;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'sites_done'::text,
           NOT EXISTS (SELECT 1 FROM public.construction_sites s
                        WHERE s.contract_id = p_id AND s.deleted_at IS NULL
                          AND s.stage NOT IN ('bao_hanh', 'hoan_thanh')),
           'Mọi công trình của hợp đồng đã sang Bảo hành hoặc Hoàn thành'::text, false;
  END IF;
  IF p_entity_type = 'site' THEN
    SELECT id, responsible_user_id, planned_start_date, planned_end_date, deleted_at
      INTO v_site FROM public.construction_sites WHERE id = p_id;
    IF NOT FOUND OR v_site.deleted_at IS NOT NULL OR NOT public.rls_site_readable(p_id) THEN
      RETURN;
    END IF;

    -- Chỉ huy trưởng phải là người làm thi công (có quyền sửa Module TC) — không phải bất kỳ ai:
    -- trước 0164 công trình mở từ hợp đồng tự lấy người Kinh doanh phụ trách hợp đồng.
    RETURN QUERY SELECT 'dang_thi_cong'::text, 'commander_assigned'::text,
           v_site.responsible_user_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.user_companies uc
                         JOIN public.permissions pm ON pm.role_id = uc.role_id
                        WHERE uc.user_id = v_site.responsible_user_id AND uc.deleted_at IS NULL
                          AND pm.module_code = 'TC' AND pm.can_edit),
           'Đã phân công chỉ huy trưởng (người thuộc bộ phận Thi công)'::text, false;

    RETURN QUERY SELECT 'dang_thi_cong'::text, 'planned_dates'::text,
           v_site.planned_start_date IS NOT NULL AND v_site.planned_end_date IS NOT NULL,
           'Đã ghi ngày khởi công và ngày hoàn thành dự kiến'::text, false;

    -- Đúng điều kiện `move_site_stage` (0035) chặn khi bàn giao.
    RETURN QUERY SELECT 'bao_hanh'::text, 'customer_acceptance'::text,
           EXISTS (SELECT 1 FROM public.acceptance_records a
                    WHERE a.construction_site_id = p_id AND a.deleted_at IS NULL
                      AND a.acceptance_type = 'khach_hang' AND a.status = 'da_nghiem_thu'),
           'Có biên bản nghiệm thu với chủ đầu tư đã ký'::text, false;

    -- 0182 (Đợt 2 — 2A): công trình có mốc thi công thì chỉ sang Nghiệm thu bàn giao khi mọi mốc đã
    -- đạt (nghiệm thu nội bộ + phụ trách kỹ thuật nếu mốc cần). Công trình không có mốc: không đòi.
    IF EXISTS (SELECT 1 FROM public.site_milestones sm WHERE sm.construction_site_id = p_id) THEN
      RETURN QUERY SELECT 'nghiem_thu'::text, 'milestones_passed'::text,
             NOT EXISTS (SELECT 1 FROM public.site_milestones sm
                          WHERE sm.construction_site_id = p_id AND sm.status <> 'dat'),
             COALESCE('Đạt đủ các mốc thi công (còn: '
                      || (SELECT sm.label FROM public.site_milestones sm
                           WHERE sm.construction_site_id = p_id AND sm.status <> 'dat'
                           ORDER BY sm.position LIMIT 1) || ')',
                      'Đạt đủ các mốc thi công'),
             false;
    END IF;

    -- 0166: kết thúc công trình = hết bảo hành, không còn việc bảo hành nào treo. Áp cho cả
    -- đường tắt Nghiệm thu → Kết thúc: công trình không khai bảo hành thì không kết thúc được.
    RETURN QUERY SELECT 'hoan_thanh'::text, 'warranties_declared'::text,
           EXISTS (SELECT 1 FROM public.warranties w
                    WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL),
           'Đã khai hạng mục bảo hành'::text, false;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'warranties_expired'::text,
           EXISTS (SELECT 1 FROM public.warranties w
                    WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL)
           AND NOT EXISTS (SELECT 1 FROM public.warranties w
                            WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL
                              AND (w.warranty_until IS NULL OR w.warranty_until > current_date)),
           COALESCE('Mọi hạng mục đã hết hạn bảo hành (hạng mục cuối hết hạn '
                    || (SELECT to_char(max(w.warranty_until), 'DD/MM/YYYY') FROM public.warranties w
                         WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL) || ')',
                    'Mọi hạng mục đã hết hạn bảo hành'),
           false;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'claims_closed'::text,
           NOT EXISTS (SELECT 1 FROM public.warranty_claims wc
                         JOIN public.warranties w ON w.id = wc.warranty_id
                        WHERE w.construction_site_id = p_id AND wc.deleted_at IS NULL
                          AND wc.status IN ('tiep_nhan', 'dang_xu_ly')),
           'Không còn yêu cầu bảo hành nào đang mở'::text, false;
  END IF;
  -- 0247 (G6): gói thầu — Ban Giám đốc duyệt tham gia trước khi lập dự toán và trước khi trình giá.
  -- Đúng điều kiện mà `estimates_participation_gate` / `bidding_projects_participation_gate` chặn.
  IF p_entity_type = 'bidding' THEN
    SELECT id, stage, participation_status, deleted_at INTO v_bid
      FROM public.bidding_projects WHERE id = p_id;
    IF NOT FOUND OR v_bid.deleted_at IS NOT NULL OR NOT public.rls_bidding_project_readable(p_id) THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT s.st, 'participation_approved'::text,
           v_bid.participation_status IN ('da_duyet', 'truoc_quy_dinh'),
           CASE v_bid.participation_status
             WHEN 'da_duyet' THEN 'Ban Giám đốc đã duyệt tham gia gói thầu'
             WHEN 'truoc_quy_dinh' THEN 'Gói thầu lập trước khi có bước quyết định tham gia — không đòi'
             ELSE public.bid_participation_block_reason(v_bid.participation_status)
           END::text,
           false
      FROM unnest(ARRAY['du_toan', 'cho_duyet_gia']) AS s(st);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. decide_approval — chép NGUYÊN VĂN bản 0246, thêm nhánh quyết định tham gia gói thầu
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_approval(
  p_approval_id uuid,
  p_decision approval_decision,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  perm   record;
  e      record;
  st     record;
  adj    jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.approvals
  WHERE id = p_approval_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ phê duyệt.';
  END IF;

  IF a.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Hồ sơ này đã được xử lý.';
  END IF;

  IF NOT public.rls_can_approve(a.subject, a.company_id, a.amount) THEN
    RAISE EXCEPTION 'Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại, hoặc vai trò không được duyệt loại nghiệp vụ này.';
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do từ chối.';
  END IF;

  SELECT * INTO perm FROM public.auth_approval_permission(a.subject, a.company_id);

  INSERT INTO public.approval_decisions (
    approval_id, step, decision, note,
    approver_limit_at_time, approver_unlimited, decided_by
  )
  VALUES (
    p_approval_id, a.current_step, p_decision, NULLIF(btrim(p_note), ''),
    perm.max_amount, perm.is_unlimited, v_user
  );

  UPDATE public.approvals
     SET status = 'completed', final_decision = p_decision,
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_approval_id;

  IF a.entity_type = 'quotes' THEN
    UPDATE public.quotes
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'estimates' THEN
    UPDATE public.estimates
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING bidding_project_id, design_project_id INTO e;

    IF e.bidding_project_id IS NOT NULL THEN
      UPDATE public.bidding_projects
         SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
             updated_at = now(), updated_by = v_user
       WHERE id = e.bidding_project_id;
    END IF;

  ELSIF a.entity_type = 'contracts' THEN
    -- Từ chối thì hợp đồng quay lại bước Nháp để sửa, không nằm mãi ở "chờ phê duyệt".
    UPDATE public.contracts
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'nhap' END)::contract_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'contract_amendments' THEN
    UPDATE public.contract_amendments
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::amendment_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           decision_notes = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'purchase_requests' THEN
    -- Từ chối thì đề nghị về bước "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy
    -- hồ sơ của mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa (MH-02).
    UPDATE public.purchase_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::purchase_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Đề nghị đã duyệt là việc cần làm của Phòng Mua hàng: họ mới là người đi hỏi báo giá
      -- (MH-04), còn người đề nghị thường ở công trường và không mở màn hình MH hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'purchase_request_approved',
        format('Đề nghị mua %s đã được phê duyệt, giá trị ước tính %s đồng.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'purchase_requests', a.entity_id,
        format('/mh/de-nghi-mua/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'MH';
    END IF;

    -- Người đề nghị cần biết kết quả dù duyệt hay từ chối — họ đang chờ hàng.
    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'purchase_request_approved' ELSE 'purchase_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị mua %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị mua %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'purchase_requests', a.entity_id,
      format('/mh/de-nghi-mua/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'stocktakes' THEN
    IF p_decision = 'approved' THEN
      /*
       * KHO-07: "lập biên bản và trình phê duyệt TRƯỚC KHI điều chỉnh số liệu". Đây là giây
       * phút sổ kho được phép đổi — và nó đổi bằng một PHIẾU điều chỉnh, không phải bằng một
       * câu UPDATE lặng lẽ, để lần sau còn đọc được ai duyệt và lệch những gì.
       *
       * Đổi trạng thái TRƯỚC khi ghi phiếu: chừng nào đợt kiểm còn mở thì kho vẫn bị khoá
       * nhập xuất, và chính phiếu điều chỉnh cũng sẽ bị chặn.
       */
      UPDATE public.stocktakes
         SET status = 'da_dieu_chinh', adjusted_at = now(),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING warehouse_id INTO st;

      SELECT jsonb_agg(jsonb_build_object(
               'material_id', si.material_id,
               'quantity', abs(si.counted_quantity - si.book_quantity),
               'direction', CASE WHEN si.counted_quantity > si.book_quantity THEN 'tang' ELSE 'giam' END
             ))
        INTO adj
        FROM public.stocktake_items si
       WHERE si.stocktake_id = a.entity_id
         AND si.counted_quantity IS NOT NULL
         AND si.counted_quantity <> si.book_quantity;

      IF adj IS NOT NULL THEN
        PERFORM public.write_stock_movement(
          'kiem_ke', st.warehouse_id, NULL, current_date, adj,
          NULL, NULL, NULL, NULL, NULL, NULL, a.entity_id,
          format('Điều chỉnh theo biên bản kiểm kê %s.', COALESCE(a.entity_code, ''))
        );
      END IF;
    ELSE
      -- Từ chối thì kho đếm lại, KHÔNG phải là chấp nhận số sổ cũ rồi đóng hồ sơ.
      UPDATE public.stocktakes
         SET status = 'dang_kiem', updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'stocktake_adjusted' ELSE 'stocktake_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Biên bản kiểm kê %s đã được duyệt, sổ kho đã điều chỉnh.', COALESCE(a.entity_code, ''))
           ELSE format('Biên bản kiểm kê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'stocktakes', a.entity_id,
      format('/kho/kiem-ke/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'payment_requests' THEN
    /*
     * KT-01 bước 5 — phê duyệt theo hạn mức. Ba bước kiểm trước đó đã xong và đã ghi vào
     * `payment_request_steps`; ở đây chỉ còn quyết định cuối cùng về tiền.
     *
     * Từ chối thì hồ sơ về "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy hồ sơ của
     * mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa. Sửa xong gửi lại là
     * đi LẠI TỪ ĐẦU cả ba bước kiểm — người kiểm trước đó đã ký trên một con số khác.
     */
    UPDATE public.payment_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::payment_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Khoản đã duyệt là việc cần làm của Kế toán – Tài chính: họ lập phiếu chi và thực
      -- hiện chi (KT-01 bước 6, 7). Người đề nghị thường không mở màn hình KT hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'payment_request_approved',
        format('Đề nghị chi %s đã được phê duyệt, giá trị %s đồng. Lập phiếu chi để thực hiện.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'payment_requests', a.entity_id,
        format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = a.company_id OR r.sees_all_companies)
        AND r.code = 'KT';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'payment_request_approved' ELSE 'payment_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị chi %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị chi %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'payment_requests', a.entity_id,
      format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'leave_requests' THEN
    /*
     * NS-05 — đơn nghỉ phép. Từ chối thì đơn ĐÓNG kèm lý do, không quay về Nháp: người lao
     * động cần đọc được vì sao bị từ chối trước khi xin lại ngày khác.
     */
    UPDATE public.leave_requests
       SET status = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::leave_request_status,
           decided_at = now(),
           reject_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN 'Đơn nghỉ phép đã được duyệt.'
           ELSE format('Đơn nghỉ phép bị từ chối. %s', COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'leave_requests', a.entity_id, '/ns/nghi-phep'
    );

  ELSIF a.entity_type = 'recruitment_positions' THEN
    /*
     * NS-02 — yêu cầu tuyển dụng. Được duyệt thì chuyển sang "Đang tuyển" và HCNS bắt đầu
     * đăng tuyển; từ chối thì dừng hẳn, người đề nghị lập yêu cầu mới nếu vẫn cần người.
     */
    UPDATE public.recruitment_positions
       SET status = (CASE WHEN p_decision = 'approved' THEN 'dang_tuyen' ELSE 'dung_tuyen' END)::recruitment_position_status,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      PERFORM public.create_notification(
        u.id, a.company_id, 'recruitment_approved',
        format('Yêu cầu tuyển dụng %s đã được duyệt. Bắt đầu đăng tuyển.', COALESCE(a.entity_code, '')),
        'recruitment_positions', a.entity_id, '/ns/tuyen-dung'
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'NS';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'recruitment_approved' ELSE 'recruitment_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Yêu cầu tuyển dụng %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Yêu cầu tuyển dụng %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'recruitment_positions', a.entity_id, '/ns/tuyen-dung'
    );
  ELSIF a.entity_type = 'site_surveys' THEN
    /*
     * Đợt 1 — 1D (0175): báo cáo khảo sát. Duyệt → «Đã duyệt», cơ hội còn ở Khảo sát thì tự sang
     * Báo giá. Trả về → «Bị trả về» kèm ý kiến (bắt buộc — kiểm ở đầu hàm), người khảo sát sửa
     * rồi gửi lại. Báo cho người gửi cả hai trường hợp.
     */
    PERFORM set_config('nvg.survey_report', 'on', true);
    UPDATE public.site_surveys
       SET report_status = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tra_ve' END)::survey_report_status,
           report_feedback = CASE WHEN p_decision = 'approved' THEN NULL ELSE NULLIF(btrim(p_note), '') END,
           report_decided_at = now(),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING opportunity_id INTO e;
    PERFORM set_config('nvg.survey_report', 'off', true);

    IF p_decision = 'approved' THEN
      PERFORM public._sync_opportunity_stage(e.opportunity_id, 'bao_gia',
        'Báo cáo khảo sát đã được duyệt');
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'survey_report_approved' ELSE 'survey_report_returned' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Báo cáo khảo sát %s đã được duyệt — lập báo giá.', COALESCE(a.entity_code, ''))
           ELSE format('Báo cáo khảo sát %s bị trả về: %s', COALESCE(a.entity_code, ''),
                       COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'opportunities', e.opportunity_id,
      '/crm/co-hoi/' || e.opportunity_id || '?tab=khao-sat'
    );
  ELSIF a.entity_type = 'showcase_items' THEN
    /*
     * Đợt 1 — 1H (0179): Thiết kế đề nghị xoá mẫu công trình, Giám đốc đồng ý thì xoá mềm; không
     * đồng ý thì mẫu giữ nguyên, bỏ dấu «đang đề nghị xoá». Báo người đề nghị.
     */
    PERFORM set_config('nvg.showcase', 'on', true);
    IF p_decision = 'approved' THEN
      UPDATE public.showcase_items
         SET deleted_at = now(), updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    ELSE
      UPDATE public.showcase_items
         SET deletion_requested_at = NULL, deletion_requested_by = NULL,
             deletion_reason = NULL, deletion_approval_id = NULL,
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;
    PERFORM set_config('nvg.showcase', 'off', true);

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'showcase_deleted' ELSE 'showcase_kept' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Giám đốc đã đồng ý xoá mẫu «%s».', a.title)
           ELSE format('Giám đốc giữ lại mẫu «%s»: %s', a.title, COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'showcase_items', a.entity_id, '/mau-cong-trinh'
    );
  ELSIF a.entity_type = 'rental_quotes' THEN
    /*
     * G5 (0245): báo giá thuê giàn giáo có giá đặc biệt hoặc công nợ vượt hạn mức. Duyệt → «Đã duyệt»
     * (lập đơn thuê được); từ chối → «Bị từ chối» kèm ý kiến, Xưởng sửa rồi gửi lại.
     */
    UPDATE public.rental_quotes
       SET status = CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END,
           decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'rental_quote_approved' ELSE 'rental_quote_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Báo giá thuê %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Báo giá thuê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'rental_quotes', a.entity_id, '/sx/bao-gia-thue?bao-gia=' || a.entity_id
    );
  ELSIF a.entity_type = 'internal_rental_requests' THEN
    /*
     * G5 (0245): cho thuê giàn giáo nội bộ (QĐ-6). Duyệt → Xưởng xuất giàn giáo; từ chối → đề nghị
     * đóng kèm lý do. Báo người gửi (chỉ huy trưởng) và Xưởng.
     */
    UPDATE public.internal_rental_requests
       SET status = CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END,
           decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING requested_by, requesting_company_id, construction_site_id INTO e;

    PERFORM public.create_notification(
      e.requested_by, e.requesting_company_id,
      CASE WHEN p_decision = 'approved' THEN 'internal_rental_approved' ELSE 'internal_rental_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị thuê giàn giáo %s đã được duyệt — chờ Nhà Việt Steel xuất hàng.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị thuê giàn giáo %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'construction_sites', e.construction_site_id,
      '/tc/cong-trinh/' || e.construction_site_id || '?tab=gian-giao'
    );
    PERFORM public.notify_sx_editors(
      a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'internal_rental_approved' ELSE 'internal_rental_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị thuê nội bộ %s đã được duyệt — xuất giàn giáo.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị thuê nội bộ %s bị từ chối.', COALESCE(a.entity_code, ''))
      END,
      'internal_rental_requests', a.entity_id, '/sx/thue-noi-bo'
    );
  ELSIF a.entity_type = 'subcontract_selections' THEN
    /*
     * G2 (0246): chọn thầu phụ / tổ đội. Duyệt → tạo / cập nhật tổ đội của công trình (khoán gọn tự
     * có dòng trọn gói), báo người gửi và người soạn hợp đồng của pháp nhân (soạn hợp đồng khoán).
     * Từ chối → «Bị từ chối» kèm ý kiến; Ban công trường sửa báo giá rồi gửi lại.
     */
    IF p_decision = 'approved' THEN
      PERFORM public._apply_subcontract_selection(a.entity_id);
      PERFORM public.create_notification(
        u.id, a.company_id, 'subcontract_selection_approved',
        format('Chọn thầu phụ %s đã được duyệt — soạn hợp đồng khoán.', COALESCE(a.entity_code, '')),
        'subcontract_selections', a.entity_id, '/hd/hop-dong?thau-phu=1'
      )
      FROM public.users u
      WHERE u.is_active AND u.deleted_at IS NULL
        AND u.id IS DISTINCT FROM a.requested_by
        AND EXISTS (SELECT 1 FROM public.user_companies uc
                      JOIN public.permissions pm ON pm.role_id = uc.role_id
                     WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = a.company_id
                       AND pm.module_code = 'HD' AND pm.can_create);
    ELSE
      UPDATE public.subcontract_selections
         SET status = 'tu_choi', decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'subcontract_selection_approved' ELSE 'subcontract_selection_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Chọn thầu phụ %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Chọn thầu phụ %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'subcontract_selections', a.entity_id, '/tc/chon-thau-phu/' || a.entity_id
    );
  ELSIF a.entity_type = 'bidding_projects' THEN
    /*
     * G6 (0247): quyết định tham gia gói thầu. Duyệt → lập dự toán được. Từ chối → «Không tham gia»:
     * gói đóng ở bước khong_tham_gia, lý do (bắt buộc — kiểm ở đầu hàm) vào lost_reason; cơ hội gốc đi
     * theo bidding_projects_notify_opportunity (0217 + 0247). Tắt nhắc hạn nộp (0208).
     */
    IF p_decision = 'approved' THEN
      UPDATE public.bidding_projects
         SET participation_status = 'da_duyet',
             participation_decided_at = now(), participation_decided_by = v_user,
             participation_decision_note = NULLIF(btrim(p_note), ''),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING responsible_user_id INTO e;
    ELSE
      UPDATE public.bidding_projects
         SET participation_status = 'khong_tham_gia',
             participation_decided_at = now(), participation_decided_by = v_user,
             participation_decision_note = NULLIF(btrim(p_note), ''),
             stage = 'khong_tham_gia',
             lost_reason = 'Không tham gia: ' || btrim(p_note),
             deadline_reminded_stage = 0,
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING responsible_user_id INTO e;
    END IF;

    PERFORM public.create_notification(
      x.uid, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'bid_participation_approved' ELSE 'bid_participation_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Ban Giám đốc đã duyệt tham gia gói thầu %s — lập dự toán.', COALESCE(a.entity_code, ''))
           ELSE format('Ban Giám đốc quyết định không tham gia gói thầu %s: %s', COALESCE(a.entity_code, ''),
                       COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'bidding_projects', a.entity_id,
      '/da/goi-thau/' || a.entity_id || CASE WHEN p_decision = 'approved' THEN '?tab=du-toan' ELSE '' END
    )
    FROM (SELECT DISTINCT uid FROM unnest(ARRAY[a.requested_by, e.responsible_user_id]) AS t(uid)
           WHERE uid IS NOT NULL) x;
  ELSE
    -- Không có nhánh nào khớp: loại hồ sơ lạ (gõ sai, hoặc module mới chưa nối). Raise ở
    -- đây cuộn ngược toàn bộ giao dịch — kể cả UPDATE approvals/INSERT approval_decisions
    -- phía trên — để không xảy ra tình trạng "phê duyệt xong" mà hồ sơ gốc không hề đổi
    -- (0086, sửa lại đúng ở 0088 sau khi 0086 tự ý viết lại các nhánh khác và làm sai).
    RAISE EXCEPTION 'Loại hồ sơ phê duyệt không xác định: %.', a.entity_type;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6). entity_type lạ thì raise (0088). Nhánh báo cáo khảo sát (0175), xoá mẫu công trình (0179), báo giá thuê + thuê nội bộ giàn giáo (0245), chọn thầu phụ (0246), quyết định tham gia gói thầu (0247).';
