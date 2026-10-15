-- ============================================================================
-- Đồng bộ bước giữa các module — hồ sơ phía sau đổi bước thì hồ sơ phía trước biết.
--
-- Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 3): cơ hội NVC-CH-2026-0002 vẫn ở «Đàm phán» khi
-- gói thầu đã trúng, hợp đồng 6,5 tỷ đã ký và công trình đang thi công — Dashboard hiện «Tỷ lệ
-- chốt 0%» ngay cạnh «Đã ký 6.500.000.000 đồng». Bàn giao thiết kế mở công trình khi hợp đồng
-- còn Nháp, và báo cáo lãi/lỗ cộng «lãi dự kiến» của công trình chưa gắn hợp đồng.
--
-- Trong migration này:
--   1. Hợp đồng ĐÃ KÝ → cơ hội gốc tự sang «Ký hợp đồng» (`_sync_opportunity_stage`, 0155).
--      Cơ hội gốc tìm qua nguồn của hợp đồng: cơ hội trực tiếp, gói thầu hoặc hồ sơ thiết kế
--      mang `opportunity_id`. Hợp đồng HỦY → báo người chịu trách nhiệm cơ hội (không tự lùi).
--   2. Gói thầu TRƯỢT → báo người chịu trách nhiệm cơ hội để đánh dấu Mất cơ hội (chỉ gợi ý —
--      câu hỏi treo cho Haan: có tự đánh dấu không).
--   3. Chuyển bước hồ sơ thiết kế BẰNG TAY không nhảy cóc (lùi về để sửa vẫn được — vòng sửa
--      phương án là chuyện thường của TK). «Dừng thiết kế» đi được từ mọi bước.
--   4. Bàn giao thiết kế sang thi công:
--      · có hợp đồng ĐÃ KÝ từ hồ sơ thiết kế → công trình mở ra GẮN hợp đồng đó;
--      · chưa có → tham số `tk.handover_requires_signed_contract` (theo pháp nhân) = true thì
--        chặn; chưa cấu hình / false thì vẫn mở nhưng báo Ban Giám đốc và Kế toán. Câu hỏi treo
--        cho Haan: NVO có được thi công trước khi ký hợp đồng không (mặc định: cảnh báo).
--
-- KHÔNG làm: tự đẩy công trình sang «Nghiệm thu» khi có biên bản nghiệm thu khách hàng — biên
-- bản có thể chỉ cho MỘT đợt (`stage_name`), tự chuyển là sai.
-- ============================================================================

-- --- Tìm cơ hội gốc của một hợp đồng -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_origin_opportunity(p_contract_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE c.source_type
    WHEN 'opportunities'    THEN c.source_id
    WHEN 'bidding_projects' THEN (SELECT b.opportunity_id FROM public.bidding_projects b WHERE b.id = c.source_id)
    WHEN 'design_projects'  THEN (SELECT d.opportunity_id FROM public.design_projects d WHERE d.id = c.source_id)
  END
  FROM public.contracts c
  WHERE c.id = p_contract_id;
$$;

COMMENT ON FUNCTION public.contract_origin_opportunity(uuid) IS
  'Cơ hội gốc của hợp đồng — qua nguồn trực tiếp, gói thầu hoặc hồ sơ thiết kế (0158).';

-- --- 1. Hợp đồng đổi bước → cơ hội ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contracts_sync_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp   uuid := public.contract_origin_opportunity(NEW.id);
  v_owner uuid;
  v_ocode text;
BEGIN
  IF v_opp IS NULL OR NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  IF NEW.stage = 'da_ky' THEN
    PERFORM public._sync_opportunity_stage(
      v_opp, 'ky_hop_dong', format('Hợp đồng %s đã ký', NEW.code)
    );
  ELSIF NEW.stage = 'huy' THEN
    SELECT owner_id, code INTO v_owner, v_ocode FROM public.opportunities WHERE id = v_opp;
    IF v_owner IS NOT NULL THEN
      PERFORM public.create_notification(
        v_owner, NEW.company_id, 'contract_cancelled',
        format('Hợp đồng %s của cơ hội %s đã hủy. Xem lại giai đoạn cơ hội.', NEW.code, v_ocode),
        'opportunities', v_opp, format('/crm/co-hoi/%s', v_opp)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_sync_opportunity ON public.contracts;
CREATE TRIGGER contracts_sync_opportunity
  AFTER UPDATE OF stage ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_sync_opportunity();

-- --- 2. Gói thầu trượt → báo người chịu trách nhiệm cơ hội -------------------------------------
CREATE OR REPLACE FUNCTION public.bidding_projects_notify_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_ocode text;
  v_ostage text;
BEGIN
  IF NEW.opportunity_id IS NULL OR NEW.stage IS NOT DISTINCT FROM OLD.stage
     OR NEW.stage <> 'truot_thau' THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, code, stage::text INTO v_owner, v_ocode, v_ostage
    FROM public.opportunities WHERE id = NEW.opportunity_id;

  IF v_owner IS NOT NULL AND v_ostage NOT IN ('ky_hop_dong', 'mat_co_hoi') THEN
    PERFORM public.create_notification(
      v_owner, NEW.company_id, 'bid_lost',
      format('Gói thầu %s trượt thầu. Cập nhật cơ hội %s sang Mất cơ hội kèm nguyên nhân.', NEW.code, v_ocode),
      'opportunities', NEW.opportunity_id, format('/crm/co-hoi/%s', NEW.opportunity_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bidding_projects_notify_opportunity ON public.bidding_projects;
CREATE TRIGGER bidding_projects_notify_opportunity
  AFTER UPDATE OF stage ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.bidding_projects_notify_opportunity();

-- --- 3. Hồ sơ thiết kế không nhảy cóc khi chuyển bằng tay ----------------------------------
-- Đặt trong `move_design_stage`, KHÔNG phải trigger trên bảng: `record_design_review` đẩy hồ sơ
-- từ Phương án / Chờ khách duyệt sang Hồ sơ kỹ thuật khi khách duyệt — một trigger «từng bước
-- một» sẽ chặn nhầm thao tác thật đó. Thân hàm giữ NGUYÊN VĂN 0025, chỉ chèn một đoạn kiểm.
CREATE OR REPLACE FUNCTION public.move_design_stage(
  p_design_project_id uuid,
  p_stage design_stage,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  p      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.design_projects
   WHERE id = p_design_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_design_project_writable(p_design_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này, hoặc hồ sơ đã bàn giao.';
  END IF;

  IF p_stage = 'ban_giao' THEN
    RAISE EXCEPTION 'Bàn giao thi công phải đi qua bước kiểm tra đồng bộ hồ sơ.';
  END IF;

  -- 0158: đi tới từng bước một — không nhảy cóc bằng tay. Lùi để sửa vẫn được, Dừng thiết kế
  -- đi được từ mọi bước. Chỉ áp ở hàm chuyển bước BẰNG TAY: ghi nhận khách duyệt
  -- (`record_design_review`) tự đẩy sang Hồ sơ kỹ thuật là bước nghiệp vụ có căn cứ, không chặn.
  IF p_stage <> 'dung_thiet_ke' AND p.stage <> 'dung_thiet_ke'
     AND array_position(enum_range(NULL::public.design_stage), p_stage)
         > array_position(enum_range(NULL::public.design_stage), p.stage) + 1 THEN
    RAISE EXCEPTION 'Không chuyển thẳng hồ sơ thiết kế từ «%» sang «%» được — cần đi qua từng bước.',
      p.stage, p_stage;
  END IF;

  IF p_stage = 'dung_thiet_ke' AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân dừng thiết kế.';
  END IF;

  IF p_stage = 'cho_khach_duyet' AND NOT EXISTS (
    SELECT 1 FROM public.design_versions v
     WHERE v.design_project_id = p_design_project_id
       AND v.discipline = 'phuong_an'
       AND v.published_at IS NOT NULL
       AND v.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Chưa phát hành phương án kiến trúc nào để gửi khách hàng xem.';
  END IF;

  UPDATE public.design_projects
     SET stage = p_stage,
         stopped_reason = CASE WHEN p_stage = 'dung_thiet_ke' THEN btrim(p_reason) ELSE NULL END,
         updated_at = now(), updated_by = v_user
   WHERE id = p_design_project_id;
END;
$$;

-- --- 4. Bàn giao thiết kế → công trình gắn hợp đồng đã ký -------------------------------------
INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'tk.handover_requires_signed_contract', 'global', NULL,
       'Bàn giao thiết kế sang thi công phải có hợp đồng đã ký',
       'true: chặn bàn giao khi hồ sơ thiết kế chưa có hợp đồng đã ký. Để trống hoặc false: vẫn '
       'mở công trình nhưng báo Ban Giám đốc và Kế toán. Đặt theo pháp nhân để NVO và NVC khác nhau.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters
   WHERE param_key = 'tk.handover_requires_signed_contract' AND scope_type = 'global'
);

CREATE OR REPLACE FUNCTION public.construction_sites_link_design_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract uuid;
  v_code     text;
  v_require  boolean;
  r          record;
BEGIN
  IF NEW.design_project_id IS NULL OR NEW.contract_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_contract
    FROM public.contracts c
   WHERE c.source_type = 'design_projects' AND c.source_id = NEW.design_project_id
     AND c.deleted_at IS NULL AND c.stage = 'da_ky'
     AND NOT EXISTS (SELECT 1 FROM public.construction_sites s
                      WHERE s.contract_id = c.id AND s.deleted_at IS NULL)
   ORDER BY c.signed_date DESC NULLS LAST
   LIMIT 1;

  IF v_contract IS NOT NULL THEN
    NEW.contract_id := v_contract;
    RETURN NEW;
  END IF;

  -- `coalesce` ở nơi gọi: tham số chưa cấu hình nghĩa là KHÔNG bắt buộc (CLAUDE.md 5.2).
  v_require := COALESCE(
    (public.system_parameter('tk.handover_requires_signed_contract', 'company', NEW.company_id))::text::boolean,
    false
  );

  SELECT code INTO v_code FROM public.design_projects WHERE id = NEW.design_project_id;

  IF v_require THEN
    RAISE EXCEPTION 'Hồ sơ thiết kế % chưa có hợp đồng đã ký nên chưa bàn giao sang thi công được.', v_code;
  END IF;

  -- Vẫn mở — nhưng người kiểm soát tiền phải biết công trình đang chạy không có hợp đồng.
  FOR r IN
    SELECT DISTINCT uc.user_id
      FROM public.user_companies uc
      JOIN public.roles ro ON ro.id = uc.role_id
     WHERE uc.deleted_at IS NULL AND ro.code IN ('TGD', 'BGD', 'CFO', 'KT')
       AND (uc.company_id = NEW.company_id OR ro.sees_all_companies)
  LOOP
    PERFORM public.create_notification(
      r.user_id, NEW.company_id, 'site_without_contract',
      format('Công trình từ hồ sơ thiết kế %s được mở khi chưa có hợp đồng đã ký.', v_code),
      'design_projects', NEW.design_project_id, format('/tk/du-an/%s', NEW.design_project_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.construction_sites_link_design_contract() IS
  'Bàn giao thiết kế: gắn hợp đồng đã ký vào công trình; chưa có thì chặn hoặc cảnh báo theo '
  'tham số tk.handover_requires_signed_contract (0158).';

-- Tên trigger bắt đầu bằng «a_» để chạy TRƯỚC `construction_sites_open_permission` (0157) —
-- PostgreSQL chạy trigger cùng thời điểm theo thứ tự tên.
DROP TRIGGER IF EXISTS a_construction_sites_link_design_contract ON public.construction_sites;
CREATE TRIGGER a_construction_sites_link_design_contract
  BEFORE INSERT ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_link_design_contract();

-- Mở công trình bằng đường bàn giao thiết kế đã có điều kiện riêng ở trên — quyền «mở công trình
-- từ hợp đồng» (0157) chỉ áp cho đường mở thẳng từ hợp đồng.
CREATE OR REPLACE FUNCTION public.construction_sites_open_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL AND NEW.design_project_id IS NULL
     AND public.auth_user_id() IS NOT NULL
     AND NOT (public.auth_can_approve_module('HD') OR public.auth_can_approve_module('TC')) THEN
    RAISE EXCEPTION 'Mở công trình từ hợp đồng cần Ban Giám đốc hoặc Trưởng phòng Thi công / Chỉ huy trưởng.';
  END IF;
  RETURN NEW;
END;
$$;
