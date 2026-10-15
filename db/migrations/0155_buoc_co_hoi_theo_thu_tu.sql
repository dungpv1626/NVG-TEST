-- ============================================================================
-- Cơ hội đi ĐÚNG THỨ TỰ, có điều kiện — và «Ký hợp đồng» không còn là bước bấm tay.
--
-- Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 3): `move_opportunity_stage` (0076) chỉ chặn rời
-- giai đoạn kết thúc, nên Kinh doanh kéo được thẻ Kanban từ «Tiếp nhận» thẳng sang «Ký hợp
-- đồng» mà không có báo giá, hồ sơ thầu hay hợp đồng nào. Phễu bán hàng (BC-03) và Dashboard
-- («Tỷ lệ chốt») vì thế đo những bước không hề xảy ra.
--
-- Quy tắc mới (ánh xạ 1-1 với `OPPORTUNITY_FLOW` trong shared/src/flow.ts — có phép thử canh):
--   · Đi TỚI chỉ sang bước kế tiếp được phép (`opportunity_next_stages`), và chỉ khi mọi điều
--     kiện của bước đó đã đạt (`stage_readiness`).
--   · Đi LÙI về một bước đang mở trước đó — phải nêu lý do (ghi vào lịch sử 0010).
--   · «Mất cơ hội» đi được từ mọi bước đang mở, bắt buộc nguyên nhân (CRM-09, giữ nguyên).
--   · «Ký hợp đồng» KHÔNG chuyển tay: bước này do hợp đồng được ghi nhận đã ký đẩy sang
--     (`_sync_opportunity_stage`, gọi từ trigger của hợp đồng ở 0158).
--
-- Điều kiện «đã định giá» chấp nhận cả ba đường định giá thật của NVG, vì NVC định giá qua GÓI
-- THẦU (DA) chứ không qua báo giá CRM, còn NVO qua hồ sơ thiết kế:
--   bao_gia  ← có báo giá hiện hành, HOẶC gói thầu / hồ sơ thiết kế liên kết cơ hội.
--   dam_phan ← báo giá đã duyệt và đã gửi khách, HOẶC gói thầu đã nộp, HOẶC thiết kế đã tới
--              bước chờ khách duyệt trở đi.
--
-- `stage_readiness` là MỘT nguồn cho cả hàm chặn lẫn giao diện (dải tiến trình hiện «Cần: …»),
-- nên màn hình không thể nói «đủ điều kiện» trong khi CSDL từ chối. SECURITY DEFINER vì Kinh
-- doanh không có quyền xem DA — nhưng chỉ trả CỜ đạt/chưa đạt và nhãn, không lộ dữ liệu gói
-- thầu, và kiểm quyền đọc cơ hội trước.
-- ============================================================================

-- --- Bước kế tiếp được phép (đi tới) ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.opportunity_next_stages(p_stage public.opportunity_stage)
RETURNS public.opportunity_stage[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_stage
    WHEN 'tiep_nhan' THEN ARRAY['xac_minh']::public.opportunity_stage[]
    -- Không phải cơ hội nào cũng cần khảo sát trước khi báo giá (nhà xưởng NVC thường định
    -- giá từ hồ sơ mời thầu) — nên từ «Xác minh» được đi thẳng tới «Báo giá».
    WHEN 'xac_minh'  THEN ARRAY['khao_sat', 'bao_gia']::public.opportunity_stage[]
    WHEN 'khao_sat'  THEN ARRAY['bao_gia']::public.opportunity_stage[]
    WHEN 'bao_gia'   THEN ARRAY['dam_phan']::public.opportunity_stage[]
    -- dam_phan → ky_hop_dong chỉ do hợp đồng đã ký đẩy sang (0158), không bấm tay.
    ELSE ARRAY[]::public.opportunity_stage[]
  END;
$$;

COMMENT ON FUNCTION public.opportunity_next_stages(public.opportunity_stage) IS
  'Bước đi TỚI được phép của cơ hội (0155). Gương của OPPORTUNITY_FLOW.next trong '
  'shared/src/flow.ts — phép thử flow-guard canh hai bên không lệch.';

-- --- Điều kiện của từng bước — một nguồn cho CSDL và giao diện -------------------------------
CREATE OR REPLACE FUNCTION public.stage_readiness(p_entity_type text, p_id uuid)
RETURNS TABLE (for_stage text, requirement text, met boolean, label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
BEGIN
  IF p_entity_type = 'opportunity' THEN
    SELECT id, company_id, stage, deleted_at INTO o
      FROM public.opportunities WHERE id = p_id;
    -- Không đọc được cơ hội thì không trả gì — không lộ cả việc cơ hội có tồn tại.
    IF NOT FOUND OR o.deleted_at IS NOT NULL OR NOT public.rls_company_access(o.company_id) THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT 'bao_gia'::text, 'pricing_started'::text,
           (EXISTS (SELECT 1 FROM public.quotes q
                     WHERE q.opportunity_id = p_id AND q.is_current_version AND q.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.bidding_projects b
                        WHERE b.opportunity_id = p_id AND b.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.design_projects d
                        WHERE d.opportunity_id = p_id AND d.deleted_at IS NULL)),
           'Đã lập báo giá, hoặc đã có gói thầu / hồ sơ thiết kế liên kết cơ hội'::text;

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
           'Báo giá đã duyệt và đã gửi khách, hoặc gói thầu đã nộp, hoặc phương án thiết kế đã gửi khách duyệt'::text;

    RETURN QUERY
    SELECT 'ky_hop_dong'::text, 'contract_signed'::text, false,
           'Tự chuyển khi hợp đồng liên kết được ghi nhận đã ký'::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.stage_readiness(text, uuid) IS
  'Điều kiện để sang từng bước của một hồ sơ (0155) — CÙNG một nguồn cho hàm chuyển bước và '
  'dải tiến trình trên giao diện. Chỉ trả cờ đạt/chưa đạt + nhãn, không lộ hồ sơ liên kết.';

REVOKE ALL ON FUNCTION public.stage_readiness(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_readiness(text, uuid) TO authenticated;

-- --- Chuyển bước bằng tay --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_opportunity_stage(
  p_opportunity_id uuid,
  p_to_stage opportunity_stage,
  p_note text DEFAULT NULL,
  p_lost_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := public.auth_user_id();
  o         record;
  v_order   public.opportunity_stage[] := enum_range(NULL::public.opportunity_stage);
  v_from_ix int;
  v_to_ix   int;
  v_missing text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT id, company_id, owner_id, stage, handed_over_at, deleted_at
    INTO o
    FROM public.opportunities
   WHERE id = p_opportunity_id
   FOR UPDATE;

  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Không tìm thấy cơ hội, hoặc không có quyền truy cập.';
  END IF;

  IF NOT public.rls_owner_can_write(o.company_id, o.owner_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội này mới chuyển được giai đoạn. Liên hệ % để được bàn giao.',
      COALESCE((SELECT u.full_name FROM public.users u WHERE u.id = o.owner_id), 'người phụ trách');
  END IF;

  IF o.handed_over_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cơ hội đã bàn giao nên không đổi được giai đoạn.';
  END IF;

  IF o.stage = p_to_stage THEN
    RETURN;
  END IF;

  IF o.stage IN ('ky_hop_dong', 'mat_co_hoi') THEN
    RAISE EXCEPTION 'Cơ hội đã ở giai đoạn kết thúc, không đổi giai đoạn được nữa.';
  END IF;

  IF p_to_stage = 'ky_hop_dong' THEN
    RAISE EXCEPTION 'Giai đoạn Ký hợp đồng tự chuyển khi hợp đồng liên kết được ghi nhận đã ký — không chuyển tay được.';
  END IF;

  IF p_to_stage = 'mat_co_hoi' THEN
    -- CRM-09 yêu cầu báo cáo "nguyên nhân mất cơ hội" — không cho bỏ trống.
    IF p_lost_reason IS NULL OR btrim(p_lost_reason) = '' THEN
      RAISE EXCEPTION 'Vui lòng nhập nguyên nhân mất cơ hội.';
    END IF;
  ELSE
    v_from_ix := array_position(v_order, o.stage);
    v_to_ix   := array_position(v_order, p_to_stage);

    IF v_to_ix < v_from_ix THEN
      -- Lùi bước: được, nhưng phải nói vì sao — lịch sử là thứ duy nhất giải thích được một
      -- cơ hội "đi ngược" trên phễu.
      IF p_note IS NULL OR btrim(p_note) = '' THEN
        RAISE EXCEPTION 'Vui lòng nêu lý do đưa cơ hội về giai đoạn trước.';
      END IF;
    ELSE
      IF NOT (p_to_stage = ANY (public.opportunity_next_stages(o.stage))) THEN
        RAISE EXCEPTION 'Không chuyển thẳng từ «%» sang «%» được — cần đi qua từng giai đoạn.',
          o.stage, p_to_stage;
      END IF;

      SELECT string_agg(r.label, '; ') INTO v_missing
        FROM public.stage_readiness('opportunity', p_opportunity_id) r
       WHERE r.for_stage = p_to_stage::text AND NOT r.met;

      IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Chưa đủ điều kiện sang giai đoạn này. Cần: %.', v_missing;
      END IF;
    END IF;
  END IF;

  -- Ghi chú đi kèm lần chuyển này; trigger `opportunities_log_stage_change` (0010) ghi lịch sử.
  PERFORM set_config('nvg.stage_note', COALESCE(p_note, ''), true);

  UPDATE public.opportunities
     SET stage       = p_to_stage,
         lost_reason = CASE WHEN p_to_stage = 'mat_co_hoi' THEN p_lost_reason ELSE lost_reason END,
         updated_at  = now(),
         updated_by  = v_user
   WHERE id = p_opportunity_id;
END;
$$;

COMMENT ON FUNCTION public.move_opportunity_stage(uuid, opportunity_stage, text, text) IS
  'Chuyển giai đoạn pipeline bằng tay (PRD CRM-02, CRM-09). Từ 0155: đi tới chỉ sang bước kế '
  'tiếp khi đủ điều kiện (stage_readiness), lùi phải có lý do, Ký hợp đồng chỉ do hợp đồng đã '
  'ký đẩy sang. Lịch sử do trigger opportunities_log_stage_change ghi.';

-- --- Đồng bộ từ module khác — KHÔNG gọi được từ trình duyệt ---------------------------------
CREATE OR REPLACE FUNCTION public._sync_opportunity_stage(
  p_opportunity_id uuid,
  p_to_stage public.opportunity_stage,
  p_note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o       record;
  v_order public.opportunity_stage[] := enum_range(NULL::public.opportunity_stage);
BEGIN
  SELECT id, stage, deleted_at INTO o
    FROM public.opportunities WHERE id = p_opportunity_id FOR UPDATE;

  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Chỉ đi tới, không rời giai đoạn kết thúc. KHÔNG xét `handed_over_at`: cơ hội đã bàn giao
  -- cho Đấu thầu / Thiết kế vẫn phải tới được «Ký hợp đồng» khi hợp đồng của nó được ký.
  IF o.stage IN ('ky_hop_dong', 'mat_co_hoi') OR o.stage = p_to_stage THEN
    RETURN false;
  END IF;
  IF p_to_stage <> 'ky_hop_dong'
     AND array_position(v_order, p_to_stage) < array_position(v_order, o.stage) THEN
    RETURN false;
  END IF;

  PERFORM set_config('nvg.stage_note', COALESCE(p_note, 'Đồng bộ từ hồ sơ liên kết'), true);

  UPDATE public.opportunities
     SET stage = p_to_stage, updated_at = now()
   WHERE id = p_opportunity_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public._sync_opportunity_stage(uuid, public.opportunity_stage, text) IS
  'Đẩy cơ hội tới một giai đoạn khi hồ sơ liên kết đổi bước (0155, gọi từ trigger 0158). Chỉ '
  'đi tới, không rời giai đoạn kết thúc, bỏ qua khoá bàn giao. Không cấp quyền cho trình duyệt.';

REVOKE ALL ON FUNCTION public._sync_opportunity_stage(uuid, public.opportunity_stage, text)
  FROM PUBLIC, anon, authenticated;
