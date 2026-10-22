-- ============================================================================
-- Ký hợp đồng không bắt Ban Giám đốc vào hệ thống; ký xong công trình tự mở.
--
-- Anh Dũng chạy thử 22/10/2026: «giám đốc thường không có thời gian vào app — nhân viên đưa trực
-- tiếp sếp ký», và sau khi ghi nhận đã ký thì hợp đồng «kẹt ở bước quyết toán, không biết nhảy
-- đi đâu».
--
-- 1. Người chịu trách nhiệm hợp đồng (thường là Kinh doanh) ghi nhận đã ký được — với điều kiện
--    TẢI LÊN BẢN ĐÃ KÝ (ảnh chụp / PDF) làm căn cứ. Ban Giám đốc vẫn ghi nhận được, không bắt
--    buộc bản chụp. Ban Giám đốc được báo khi người khác ghi nhận.
--    Phê duyệt nội bộ (HD-05) vẫn đứng trước: chỉ ghi nhận ký khi hợp đồng đã được phê duyệt.
-- 2. Hợp đồng thi công (từ cơ hội CRM) ký xong thì hệ thống tự mở công trình ở bước «Chuẩn bị» (tên, địa điểm,
--    ngày từ hợp đồng; chỉ huy trưởng để Thi công phân công) và báo Thi công. Loại khác (thiết kế,
--    mua bán, cho thuê…) không tự mở — mở tay như cũ nếu cần.
--
-- Hàm `sign_contract`: thân giữ nguyên bản 0157, thêm tham số bản chụp + nhánh tự mở công trình.
-- ============================================================================

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS signed_scan_path text,
  ADD COLUMN IF NOT EXISTS signed_recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contracts.signed_scan_path IS
  'Bản hợp đồng đã ký (ảnh / PDF) trong kho contract-documents — bắt buộc khi người ghi nhận ký không phải Ban Giám đốc (0187).';

-- Kho văn bản hợp đồng nhận thêm ảnh / PDF (bản đã ký).
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'
   ]
 WHERE id = 'contract-documents';

-- --- Ai đổi được bước nào (bản 0157, sửa nhánh da_ky) ------------------------------------------
CREATE OR REPLACE FUNCTION public.contracts_stage_permissions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  v_open integer;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  -- Tác vụ hệ thống (cron, migration, seed bằng service_role) không mang người dùng.
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.stage = 'cho_duyet' THEN
    IF NOT public.rls_owner_can_write(NEW.company_id, NEW.responsible_user_id) THEN
      RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng mới gửi phê duyệt được.';
    END IF;

  ELSIF NEW.stage = 'da_ky' THEN
    -- 0187: người chịu trách nhiệm ghi nhận được khi có bản đã ký làm căn cứ.
    IF NOT (public.auth_can_approve_module('HD')
            OR (public.rls_owner_can_write(NEW.company_id, NEW.responsible_user_id)
                AND NEW.signed_scan_path IS NOT NULL)) THEN
      RAISE EXCEPTION 'Ghi nhận hợp đồng đã ký cần Ban Giám đốc, hoặc người chịu trách nhiệm kèm bản hợp đồng đã ký.';
    END IF;

  ELSIF NEW.stage = 'hoan_thanh' THEN
    IF NOT public.auth_can_approve_module('HD') THEN
      RAISE EXCEPTION 'Quyết toán hợp đồng cần người có quyền phê duyệt hợp đồng (Ban Giám đốc).';
    END IF;

    -- 0187: hợp đồng thi công chưa mở công trình nào thì chưa có gì để quyết toán — trước đây
    -- «mọi công trình đã bàn giao» đúng một cách rỗng khi không có công trình (anh Dũng 22/10/2026).
    IF NEW.type::text = 'thi_cong' AND NOT EXISTS (
      SELECT 1 FROM public.construction_sites s WHERE s.contract_id = NEW.id AND s.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Hợp đồng thi công chưa mở công trình — mở công trình, thi công và bàn giao rồi mới quyết toán.';
    END IF;

    SELECT count(*) INTO v_open
      FROM public.construction_sites s
     WHERE s.contract_id = NEW.id AND s.deleted_at IS NULL
       AND s.stage NOT IN ('bao_hanh', 'hoan_thanh');
    IF v_open > 0 THEN
      RAISE EXCEPTION 'Còn % công trình của hợp đồng chưa bàn giao. Quyết toán sau khi công trình đã sang bảo hành hoặc hoàn thành.', v_open;
    END IF;

  ELSIF NEW.stage = 'huy' THEN
    IF OLD.stage IN ('nhap', 'cho_duyet') THEN
      IF NOT (public.rls_owner_can_write(NEW.company_id, NEW.responsible_user_id)
              OR public.auth_can_approve_module('HD')) THEN
        RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng hoặc người có quyền phê duyệt hợp đồng mới hủy được.';
      END IF;
    ELSIF NOT public.auth_can_approve_module('HD') THEN
      RAISE EXCEPTION 'Hợp đồng đã được phê duyệt — hủy cần người có quyền phê duyệt hợp đồng (Ban Giám đốc).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- --- Quyền mở công trình từ hợp đồng (bản 0158) + đường hệ thống tự mở khi ký ----------------
CREATE OR REPLACE FUNCTION public.construction_sites_open_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 0187: `sign_contract` tự mở công trình cho hợp đồng thi công — cờ chỉ sống trong giao dịch đó.
  IF current_setting('nvg.auto_open_site', true) = NEW.contract_id::text THEN
    RETURN NEW;
  END IF;
  IF NEW.contract_id IS NOT NULL AND NEW.design_project_id IS NULL
     AND public.auth_user_id() IS NOT NULL
     AND NOT (public.auth_can_approve_module('HD') OR public.auth_can_approve_module('TC')) THEN
    RAISE EXCEPTION 'Mở công trình từ hợp đồng cần Ban Giám đốc hoặc Trưởng phòng Thi công / Chỉ huy trưởng.';
  END IF;
  RETURN NEW;
END;
$$;

-- --- sign_contract (bản 0157 + bản chụp + tự mở công trình) -----------------------------------
DROP FUNCTION IF EXISTS public.sign_contract(uuid, text, date);
CREATE OR REPLACE FUNCTION public.sign_contract(
  p_contract_id uuid,
  p_contract_number text,
  p_signed_date date,
  p_signed_scan_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  c      record;
  v_site uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT (public.auth_can_edit_module('HD') OR public.auth_can_approve_module('HD')) THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;

  -- Ghi nhận đã ký trước khi có phê duyệt nội bộ nghĩa là hạn mức HD-05 bị bỏ qua hoàn toàn.
  IF c.stage <> 'da_duyet' THEN
    RAISE EXCEPTION 'Chỉ ghi nhận đã ký sau khi hợp đồng được phê duyệt nội bộ.';
  END IF;

  IF p_contract_number IS NULL OR btrim(p_contract_number) = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập số hợp đồng theo văn bản đã ký.';
  END IF;

  -- Bản chụp phải nằm đúng thư mục của hợp đồng trong kho văn bản hợp đồng.
  IF p_signed_scan_path IS NOT NULL AND (
       split_part(p_signed_scan_path, '/', 1) <> c.id::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
                       WHERE o.bucket_id = 'contract-documents' AND o.name = p_signed_scan_path)
     ) THEN
    RAISE EXCEPTION 'Không thấy bản hợp đồng đã ký vừa tải lên — tải lại tệp rồi ghi nhận.';
  END IF;

  UPDATE public.contracts
     SET stage = 'da_ky',
         contract_number = btrim(p_contract_number),
         signed_date = COALESCE(p_signed_date, current_date),
         signed_at = now(),
         signed_scan_path = NULLIF(btrim(p_signed_scan_path), ''),
         signed_recorded_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = p_contract_id;

  -- Hợp đồng đã ký là tín hiệu khởi động của Thi công và Kế toán (PRD Mục 7, TC-01).
  PERFORM public.create_notification(
    u.id, c.company_id, 'contract_signed',
    format('Hợp đồng %s đã được ký, giá trị %s đồng.', c.code, to_char(c.value, 'FM999,999,999,999')),
    'contracts', c.id,
    format('/hd/hop-dong/%s', c.id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = c.company_id
    AND (r.code IN ('TC', 'KT', 'KD') OR u.id = c.responsible_user_id)
    AND u.id <> v_user;

  -- 0187: người khác Ban Giám đốc ghi nhận → báo Ban Giám đốc để biết (không phải việc phải làm).
  IF NOT public.auth_can_approve_module('HD') THEN
    PERFORM public.create_notification(
      u.id, c.company_id, 'contract_signed_recorded',
      format('Hợp đồng %s: %s đã ghi nhận đã ký (số %s), kèm bản đã ký.',
             c.code, (SELECT full_name FROM public.users WHERE id = v_user), btrim(p_contract_number)),
      'contracts', c.id,
      format('/hd/hop-dong/%s', c.id)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'HD' AND pm.can_approve
    WHERE u.is_active AND u.deleted_at IS NULL AND u.id <> v_user
      AND (uc.company_id = c.company_id OR r.sees_all_companies)
    GROUP BY u.id;
  END IF;

  -- 0187: hợp đồng thi công ký xong → tự mở công trình ở bước Chuẩn bị (một hợp đồng một công
  -- trình, như `open_site_from_contract`). Chỉ huy trưởng để trống cho Thi công phân công.
  -- Chỉ hợp đồng thi công từ cơ hội CRM: hợp đồng từ gói thầu có bước lập ngân sách thi công
  -- riêng (DA-09) TRƯỚC khi mở công trình, hợp đồng từ hồ sơ thiết kế mở công trình ở bước bàn
  -- giao thiết kế — tự mở ở đây là lập ngân sách hai lần (golden-path đã bắt được).
  IF c.type::text = 'thi_cong' AND COALESCE(c.source_type::text, 'opportunities') = 'opportunities'
     AND NOT EXISTS (
    SELECT 1 FROM public.construction_sites s WHERE s.contract_id = c.id AND s.deleted_at IS NULL
  ) THEN
    PERFORM set_config('nvg.auto_open_site', c.id::text, true);
    v_site := public.open_construction_site(
      c.company_id, c.title, c.id, NULL, NULL,
      c.project_location, NULL, c.start_date, c.end_date
    );
    PERFORM set_config('nvg.auto_open_site', '', true);

    PERFORM public.create_notification(
      u.id, c.company_id, 'site_opened_from_contract',
      format('Hợp đồng %s đã ký — công trình %s đã mở, chờ phân công chỉ huy trưởng và ngày khởi công.',
             c.code, (SELECT code FROM public.construction_sites WHERE id = v_site)),
      'construction_sites', v_site,
      format('/tc/cong-trinh/%s', v_site)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'TC' AND pm.can_approve
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL AND u.id <> v_user
      AND uc.company_id = c.company_id AND NOT r.site_scoped
    GROUP BY u.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_contract(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_contract(uuid, text, date, text) TO authenticated;
