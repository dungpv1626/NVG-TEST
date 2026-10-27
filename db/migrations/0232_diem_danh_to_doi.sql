-- 0232 — Điểm danh tổ đội và bảng công thời vụ (Đợt 2 — 2C; câu 6, anh Dũng 27/10/2026: «theo gợi ý của bạn, sau này
-- có thể điều chỉnh»).
--
-- Lao động thời vụ không có tài khoản: Chỉ huy trưởng ĐIỂM DANH HỘ theo tổ mỗi ngày — một ảnh tập thể cho mỗi tổ, rồi
-- bấm từng người Cả ngày / Nửa ngày / Vắng, ghi giờ tăng ca nếu có. Mục tiêu < 5 phút / ngày (ngân sách thao tác hiện
-- trường, CLAUDE.md 4.6).
--
-- Quy tắc (tham số, sửa được, KHÔNG hồi tố — mỗi dòng lưu số công đã áp dụng):
-- - Cả ngày = `tc.attendance_full_day_workday` (1) công, Nửa ngày = `tc.attendance_half_day_workday` (0,5) công;
--   tăng ca tính giờ, ghi riêng.
-- - Vị trí lấy lúc lập phiếu; cách tâm công trình quá `tc.attendance_radius_m` (300 m) thì chỉ CẢNH BÁO, không chặn.
--   Công trình chưa ghi toạ độ thì nói rõ, không đoán.
-- - Công thời vụ ghi vào bảng công RIÊNG theo tổ đội × công trình × tháng — không trộn bảng công nhân sự biên chế.
--   Chỉ huy trưởng gửi → Trưởng phòng Thi công xác nhận (hoặc trả lại kèm lý do). Đã gửi / đã xác nhận thì KHOÁ điểm
--   danh của tháng. Kế toán đọc bảng công đã xác nhận qua hàm riêng (không mở quyền xem Thi công) — căn cứ thanh toán
--   tổ đội, máy KHÔNG tự sinh công nợ.
-- - Danh sách người của tổ: họ tên, số điện thoại (tuỳ). KHÔNG lưu CCCD, tài khoản ngân hàng (CLAUDE.md 5.2).
-- Quyền theo công trình như nhật ký: đọc `rls_site_readable`, ghi `rls_site_writable` (Mẫu A + E).

-- --- Toạ độ tâm công trình -------------------------------------------------------------------------------------------
ALTER TABLE public.construction_sites
  ADD COLUMN IF NOT EXISTS latitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9, 6);
ALTER TABLE public.construction_sites DROP CONSTRAINT IF EXISTS construction_sites_coordinates;
ALTER TABLE public.construction_sites
  ADD CONSTRAINT construction_sites_coordinates CHECK (
    (latitude IS NULL) = (longitude IS NULL)
    AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
    AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
  );
COMMENT ON COLUMN public.construction_sites.latitude IS
  'Vĩ độ tâm công trình — Chỉ huy trưởng ghi khi đứng ở công trường; dùng cảnh báo điểm danh xa công trình (0232).';

-- --- Tham số --------------------------------------------------------------------------------------------------------
INSERT INTO public.system_parameters (param_key, scope_type, value, unit, label, description)
SELECT 'tc.attendance_radius_m', 'global', '300'::jsonb, 'm', 'Bán kính điểm danh công trường (m)',
       'Phiếu điểm danh lập xa tâm công trình quá ngần này mét thì cảnh báo (không chặn). Câu 6, 27/10/2026.'
WHERE NOT EXISTS (SELECT 1 FROM public.system_parameters p
                   WHERE p.param_key = 'tc.attendance_radius_m' AND p.scope_type = 'global');
INSERT INTO public.system_parameters (param_key, scope_type, value, unit, label, description)
SELECT 'tc.attendance_full_day_workday', 'global', '1'::jsonb, 'công', 'Số công của một ngày đủ',
       'Điểm danh «Cả ngày» tính ngần này công. Đổi không hồi tố — mỗi dòng lưu số công đã áp dụng. Câu 6, 27/10/2026.'
WHERE NOT EXISTS (SELECT 1 FROM public.system_parameters p
                   WHERE p.param_key = 'tc.attendance_full_day_workday' AND p.scope_type = 'global');
INSERT INTO public.system_parameters (param_key, scope_type, value, unit, label, description)
SELECT 'tc.attendance_half_day_workday', 'global', '0.5'::jsonb, 'công', 'Số công của nửa ngày',
       'Điểm danh «Nửa ngày» tính ngần này công. Đổi không hồi tố. Câu 6, 27/10/2026.'
WHERE NOT EXISTS (SELECT 1 FROM public.system_parameters p
                   WHERE p.param_key = 'tc.attendance_half_day_workday' AND p.scope_type = 'global');

-- --- Người của tổ ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies (id),
  subcontractor_id  uuid NOT NULL REFERENCES public.subcontractors (id) ON DELETE CASCADE,
  full_name         text NOT NULL CHECK (btrim(full_name) <> '' AND char_length(full_name) <= 120),
  phone             varchar(20),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.users (id),
  updated_by        uuid REFERENCES public.users (id)
);
CREATE INDEX IF NOT EXISTS crew_members_crew_idx ON public.crew_members (subcontractor_id, full_name);
COMMENT ON TABLE public.crew_members IS
  'Người của tổ đội (lao động thời vụ không có tài khoản) — họ tên, số điện thoại tuỳ; không CCCD / tài khoản (0232).';

CREATE OR REPLACE FUNCTION public.crew_site_of(p_subcontractor uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT construction_site_id FROM public.subcontractors WHERE id = p_subcontractor;
$$;
REVOKE ALL ON FUNCTION public.crew_site_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_site_of(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.crew_members_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- pháp nhân lấy từ tổ đội — người ghi có thể không đọc thẳng được bảng tổ đội
SET search_path = public
AS $$
BEGIN
  SELECT s.company_id INTO NEW.company_id FROM public.subcontractors s WHERE s.id = NEW.subcontractor_id;
  IF TG_OP = 'UPDATE' THEN
    NEW.subcontractor_id := OLD.subcontractor_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  ELSE
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS crew_members_before_write ON public.crew_members;
CREATE TRIGGER crew_members_before_write
  BEFORE INSERT OR UPDATE ON public.crew_members
  FOR EACH ROW EXECUTE FUNCTION public.crew_members_before_write();

ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crew_members FROM anon;
DROP POLICY IF EXISTS crew_members_select ON public.crew_members;
CREATE POLICY crew_members_select ON public.crew_members FOR SELECT TO authenticated
  USING (public.rls_site_readable(public.crew_site_of(subcontractor_id)));
DROP POLICY IF EXISTS crew_members_insert ON public.crew_members;
CREATE POLICY crew_members_insert ON public.crew_members FOR INSERT TO authenticated
  WITH CHECK (public.rls_site_writable(public.crew_site_of(subcontractor_id)));
DROP POLICY IF EXISTS crew_members_update ON public.crew_members;
CREATE POLICY crew_members_update ON public.crew_members FOR UPDATE TO authenticated
  USING (public.rls_site_writable(public.crew_site_of(subcontractor_id)))
  WITH CHECK (public.rls_site_writable(public.crew_site_of(subcontractor_id)));
GRANT SELECT, INSERT, UPDATE ON public.crew_members TO authenticated;

-- --- Bảng công tháng theo tổ (khoá điểm danh khi đã gửi) -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_timesheet_months (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies (id),
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites (id),
  subcontractor_id      uuid NOT NULL REFERENCES public.subcontractors (id) ON DELETE CASCADE,
  month                 date NOT NULL CHECK (extract(day FROM month) = 1),
  status                text NOT NULL DEFAULT 'nhap' CHECK (status IN ('nhap', 'da_gui', 'da_xac_nhan')),
  submitted_at          timestamptz,
  submitted_by          uuid REFERENCES public.users (id),
  confirmed_at          timestamptz,
  confirmed_by          uuid REFERENCES public.users (id),
  returned_reason       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcontractor_id, month)
);
COMMENT ON TABLE public.crew_timesheet_months IS
  'Bảng công tháng của một tổ ở một công trình: Chỉ huy trưởng gửi, Trưởng phòng Thi công xác nhận. Đã gửi = khoá điểm danh (0232).';

ALTER TABLE public.crew_timesheet_months ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crew_timesheet_months FROM anon;
DROP POLICY IF EXISTS crew_timesheet_months_select ON public.crew_timesheet_months;
CREATE POLICY crew_timesheet_months_select ON public.crew_timesheet_months FOR SELECT TO authenticated
  USING (public.rls_site_readable(construction_site_id));
GRANT SELECT ON public.crew_timesheet_months TO authenticated;

-- Tháng đã gửi / đã xác nhận thì không sửa điểm danh của tháng đó.
CREATE OR REPLACE FUNCTION public.crew_month_locked(p_subcontractor uuid, p_day date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crew_timesheet_months m
     WHERE m.subcontractor_id = p_subcontractor
       AND m.month = date_trunc('month', p_day)::date
       AND m.status IN ('da_gui', 'da_xac_nhan')
  );
$$;

-- --- Phiếu điểm danh theo tổ × ngày --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_attendance_sheets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies (id),
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites (id),
  subcontractor_id      uuid NOT NULL REFERENCES public.subcontractors (id) ON DELETE CASCADE,
  work_date             date NOT NULL,
  photo_path            text NOT NULL,
  latitude              numeric(9, 6),
  longitude             numeric(9, 6),
  accuracy_m            numeric(10, 1),
  distance_m            integer,
  location_flag         text NOT NULL DEFAULT 'khong_vi_tri' CHECK (location_flag IN (
                          'trong_ban_kinh', 'ngoai_ban_kinh', 'khong_vi_tri', 'chua_co_toa_do')),
  note                  text CHECK (note IS NULL OR char_length(note) <= 500),
  client_created_at     timestamptz,
  client_generated_id   uuid UNIQUE,
  synced_at             timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users (id),
  updated_by            uuid REFERENCES public.users (id),
  UNIQUE (subcontractor_id, work_date),
  CONSTRAINT crew_attendance_sheets_photo_path CHECK (photo_path LIKE construction_site_id::text || '/diem-danh-to/%')
);
CREATE INDEX IF NOT EXISTS crew_attendance_sheets_site_day_idx
  ON public.crew_attendance_sheets (construction_site_id, work_date DESC);
COMMENT ON TABLE public.crew_attendance_sheets IS
  'Phiếu điểm danh của một tổ trong một ngày: ảnh tập thể, vị trí lúc lập, khoảng cách tới tâm công trình (0232).';

CREATE OR REPLACE FUNCTION public.crew_attendance_sheets_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site    record;
  v_radius  numeric := COALESCE(public.system_parameter_number('tc.attendance_radius_m'), 300);
  v_today   date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_dist    numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.construction_site_id := OLD.construction_site_id;
    NEW.subcontractor_id := OLD.subcontractor_id;
    NEW.work_date := OLD.work_date;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subcontractors s
                  WHERE s.id = NEW.subcontractor_id AND s.construction_site_id = NEW.construction_site_id) THEN
    RAISE EXCEPTION 'Tổ đội không thuộc công trình này.';
  END IF;
  IF NEW.work_date > v_today OR NEW.work_date < v_today - 2 THEN
    RAISE EXCEPTION 'Chỉ điểm danh cho hôm nay hoặc hai ngày trước — ngày cũ hơn nhờ Trưởng phòng Thi công ghi chú vào bảng công tháng.';
  END IF;
  IF public.crew_month_locked(NEW.subcontractor_id, NEW.work_date) THEN
    RAISE EXCEPTION 'Bảng công tháng này của tổ đã gửi — không sửa điểm danh được. Nhờ Trưởng phòng Thi công trả lại nếu cần sửa.';
  END IF;

  SELECT s.company_id, s.latitude, s.longitude INTO v_site
    FROM public.construction_sites s WHERE s.id = NEW.construction_site_id;
  NEW.company_id := v_site.company_id;
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.location_flag := 'khong_vi_tri';
    NEW.distance_m := NULL;
  ELSIF v_site.latitude IS NULL THEN
    NEW.location_flag := 'chua_co_toa_do';
    NEW.distance_m := NULL;
  ELSE
    -- Khoảng cách mặt cầu (haversine), bán kính Trái Đất 6.371 km.
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(NEW.latitude - v_site.latitude) / 2), 2)
      + cos(radians(v_site.latitude)) * cos(radians(NEW.latitude))
        * power(sin(radians(NEW.longitude - v_site.longitude) / 2), 2)));
    NEW.distance_m := round(v_dist);
    NEW.location_flag := CASE WHEN v_dist <= v_radius THEN 'trong_ban_kinh' ELSE 'ngoai_ban_kinh' END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
    NEW.created_at := now();
  END IF;
  NEW.synced_at := now();
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS crew_attendance_sheets_before_write ON public.crew_attendance_sheets;
CREATE TRIGGER crew_attendance_sheets_before_write
  BEFORE INSERT OR UPDATE ON public.crew_attendance_sheets
  FOR EACH ROW EXECUTE FUNCTION public.crew_attendance_sheets_before_write();

ALTER TABLE public.crew_attendance_sheets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crew_attendance_sheets FROM anon;
DROP POLICY IF EXISTS crew_attendance_sheets_select ON public.crew_attendance_sheets;
CREATE POLICY crew_attendance_sheets_select ON public.crew_attendance_sheets FOR SELECT TO authenticated
  USING (public.rls_site_readable(construction_site_id));
DROP POLICY IF EXISTS crew_attendance_sheets_insert ON public.crew_attendance_sheets;
CREATE POLICY crew_attendance_sheets_insert ON public.crew_attendance_sheets FOR INSERT TO authenticated
  WITH CHECK (public.rls_site_writable(construction_site_id));
DROP POLICY IF EXISTS crew_attendance_sheets_update ON public.crew_attendance_sheets;
CREATE POLICY crew_attendance_sheets_update ON public.crew_attendance_sheets FOR UPDATE TO authenticated
  USING (public.rls_site_writable(construction_site_id))
  WITH CHECK (public.rls_site_writable(construction_site_id));
GRANT SELECT, INSERT, UPDATE ON public.crew_attendance_sheets TO authenticated;

-- --- Từng người trong phiếu -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_attendance (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies (id),
  sheet_id         uuid NOT NULL REFERENCES public.crew_attendance_sheets (id) ON DELETE CASCADE,
  crew_member_id   uuid NOT NULL REFERENCES public.crew_members (id),
  status           text NOT NULL CHECK (status IN ('ca_ngay', 'nua_ngay', 'vang')),
  workday          numeric(4, 2) NOT NULL DEFAULT 0,
  overtime_hours   numeric(4, 1) NOT NULL DEFAULT 0 CHECK (overtime_hours BETWEEN 0 AND 12),
  note             text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, crew_member_id)
);
COMMENT ON COLUMN public.crew_attendance.workday IS
  'Số công đã áp dụng lúc ghi (theo tham số lúc đó) — đổi tham số không hồi tố (0232).';

CREATE OR REPLACE FUNCTION public.crew_attendance_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sheet record;
BEGIN
  SELECT sh.company_id, sh.subcontractor_id, sh.work_date INTO v_sheet
    FROM public.crew_attendance_sheets sh WHERE sh.id = NEW.sheet_id;
  IF NOT EXISTS (SELECT 1 FROM public.crew_members m
                  WHERE m.id = NEW.crew_member_id AND m.subcontractor_id = v_sheet.subcontractor_id) THEN
    RAISE EXCEPTION 'Người này không thuộc tổ của phiếu điểm danh.';
  END IF;
  IF public.crew_month_locked(v_sheet.subcontractor_id, v_sheet.work_date) THEN
    RAISE EXCEPTION 'Bảng công tháng này của tổ đã gửi — không sửa điểm danh được. Nhờ Trưởng phòng Thi công trả lại nếu cần sửa.';
  END IF;
  NEW.company_id := v_sheet.company_id;
  -- Chèn nhiều dòng một lượt qua REST: dòng không ghi tăng ca nhận NULL (không nhận giá trị mặc định).
  NEW.overtime_hours := COALESCE(NEW.overtime_hours, 0);
  IF NEW.status = 'vang' THEN
    NEW.workday := 0;
    NEW.overtime_hours := 0;
  ELSIF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.workday := COALESCE(public.system_parameter_number(
      CASE NEW.status WHEN 'ca_ngay' THEN 'tc.attendance_full_day_workday'
                      ELSE 'tc.attendance_half_day_workday' END),
      CASE NEW.status WHEN 'ca_ngay' THEN 1 ELSE 0.5 END);
  ELSE
    NEW.workday := OLD.workday;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS crew_attendance_before_write ON public.crew_attendance;
CREATE TRIGGER crew_attendance_before_write
  BEFORE INSERT OR UPDATE ON public.crew_attendance
  FOR EACH ROW EXECUTE FUNCTION public.crew_attendance_before_write();

ALTER TABLE public.crew_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crew_attendance FROM anon;
DROP POLICY IF EXISTS crew_attendance_select ON public.crew_attendance;
CREATE POLICY crew_attendance_select ON public.crew_attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crew_attendance_sheets sh WHERE sh.id = sheet_id));
DROP POLICY IF EXISTS crew_attendance_insert ON public.crew_attendance;
CREATE POLICY crew_attendance_insert ON public.crew_attendance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.crew_attendance_sheets sh
                       WHERE sh.id = sheet_id AND public.rls_site_writable(sh.construction_site_id)));
DROP POLICY IF EXISTS crew_attendance_update ON public.crew_attendance;
CREATE POLICY crew_attendance_update ON public.crew_attendance FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crew_attendance_sheets sh
                  WHERE sh.id = sheet_id AND public.rls_site_writable(sh.construction_site_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.crew_attendance_sheets sh
                       WHERE sh.id = sheet_id AND public.rls_site_writable(sh.construction_site_id)));
GRANT SELECT, INSERT, UPDATE ON public.crew_attendance TO authenticated;

-- --- Gửi / xác nhận / trả lại bảng công tháng -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_crew_month(p_subcontractor uuid, p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site uuid := public.crew_site_of(p_subcontractor);
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF v_site IS NULL OR NOT public.rls_site_writable(v_site) THEN
    RAISE EXCEPTION 'Không gửi được bảng công của tổ này — chỉ huy trưởng công trình gửi.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crew_attendance_sheets sh
                  WHERE sh.subcontractor_id = p_subcontractor
                    AND date_trunc('month', sh.work_date)::date = v_month) THEN
    RAISE EXCEPTION 'Tháng này tổ chưa có ngày điểm danh nào.';
  END IF;
  INSERT INTO public.crew_timesheet_months (company_id, construction_site_id, subcontractor_id, month)
  SELECT s.company_id, s.id, p_subcontractor, v_month FROM public.construction_sites s WHERE s.id = v_site
  ON CONFLICT (subcontractor_id, month) DO NOTHING;
  UPDATE public.crew_timesheet_months
     SET status = 'da_gui', submitted_at = now(), submitted_by = public.auth_user_id(),
         returned_reason = NULL, updated_at = now()
   WHERE subcontractor_id = p_subcontractor AND month = v_month AND status = 'nhap';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bảng công tháng này đã gửi rồi.';
  END IF;
END;
$$;

-- Trưởng phòng Thi công (phê duyệt Thi công, KHÔNG giới hạn theo công trường) hoặc Ban Giám đốc xác nhận / trả lại —
-- không phải chỉ huy trưởng tự xác nhận công tổ mình.
CREATE OR REPLACE FUNCTION public.auth_confirms_crew_month(p_site uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_site_readable(p_site)
     AND NOT public.auth_is_read_only()
     AND NOT public.auth_is_site_scoped()
     AND (public.auth_can_approve_module('TC') OR public.auth_manages_all_companies());
$$;

CREATE OR REPLACE FUNCTION public.decide_crew_month(p_subcontractor uuid, p_month date, p_confirm boolean,
                                                   p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site uuid := public.crew_site_of(p_subcontractor);
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF v_site IS NULL OR NOT public.auth_confirms_crew_month(v_site) THEN
    RAISE EXCEPTION 'Trưởng phòng Thi công hoặc Ban Giám đốc xác nhận bảng công tổ đội.';
  END IF;
  IF NOT p_confirm AND NULLIF(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Trả lại bảng công phải ghi lý do để chỉ huy trưởng biết sửa gì.';
  END IF;
  UPDATE public.crew_timesheet_months
     SET status = CASE WHEN p_confirm THEN 'da_xac_nhan' ELSE 'nhap' END,
         confirmed_at = CASE WHEN p_confirm THEN now() END,
         confirmed_by = CASE WHEN p_confirm THEN public.auth_user_id() END,
         returned_reason = CASE WHEN p_confirm THEN NULL ELSE btrim(p_reason) END,
         updated_at = now()
   WHERE subcontractor_id = p_subcontractor AND month = v_month AND status = 'da_gui';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bảng công này chưa được gửi, hoặc đã xử lý rồi.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_crew_month(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_crew_month(uuid, date, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_confirms_crew_month(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crew_month_locked(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_crew_month(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_crew_month(uuid, date, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_confirms_crew_month(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crew_month_locked(uuid, date) TO authenticated;

-- --- Tổng hợp công tháng --------------------------------------------------------------------------------------------
-- Một dòng mỗi người: số ngày có mặt, số công, giờ tăng ca. SECURITY INVOKER cho Thi công (RLS lọc); Kế toán không xem
-- Thi công nên đọc bảng công ĐÃ XÁC NHẬN qua `kt_crew_timesheets` bên dưới.
CREATE OR REPLACE FUNCTION public.crew_month_summary(p_site uuid, p_month date)
RETURNS TABLE (subcontractor_id uuid, crew_member_id uuid, full_name text, days_present integer,
               workdays numeric, overtime_hours numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT sh.subcontractor_id, a.crew_member_id, m.full_name::text,
         count(*) FILTER (WHERE a.status <> 'vang')::int, sum(a.workday), sum(a.overtime_hours)
    FROM public.crew_attendance a
    JOIN public.crew_attendance_sheets sh ON sh.id = a.sheet_id
    JOIN public.crew_members m ON m.id = a.crew_member_id
   WHERE sh.construction_site_id = p_site
     AND date_trunc('month', sh.work_date)::date = date_trunc('month', p_month)::date
   GROUP BY sh.subcontractor_id, a.crew_member_id, m.full_name
   ORDER BY sh.subcontractor_id, m.full_name;
$$;
GRANT EXECUTE ON FUNCTION public.crew_month_summary(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.kt_crew_timesheets(p_month date)
RETURNS TABLE (company_id uuid, site_code text, site_name text, crew_name text, month date,
               people integer, workdays numeric, overtime_hours numeric, confirmed_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (public.auth_can_view_module('KT') AND public.rls_sees_finance()) THEN
    RAISE EXCEPTION 'Bảng công tổ đội đã xác nhận dành cho Kế toán, Tài chính và Ban Giám đốc.';
  END IF;
  RETURN QUERY
  SELECT tm.company_id, s.code::text, s.name::text, sc.name::text, tm.month,
         count(DISTINCT a.crew_member_id) FILTER (WHERE a.status <> 'vang')::int,
         coalesce(sum(a.workday), 0)::numeric, coalesce(sum(a.overtime_hours), 0)::numeric, tm.confirmed_at
    FROM public.crew_timesheet_months tm
    JOIN public.construction_sites s ON s.id = tm.construction_site_id
    JOIN public.subcontractors sc ON sc.id = tm.subcontractor_id
    LEFT JOIN public.crew_attendance_sheets sh
           ON sh.subcontractor_id = tm.subcontractor_id
          AND date_trunc('month', sh.work_date)::date = tm.month
    LEFT JOIN public.crew_attendance a ON a.sheet_id = sh.id
   WHERE tm.status = 'da_xac_nhan'
     AND tm.month = date_trunc('month', p_month)::date
     AND public.rls_company_access(tm.company_id)
   GROUP BY tm.id, tm.company_id, s.code, s.name, sc.name, tm.month, tm.confirmed_at
   ORDER BY s.code, sc.name;
END;
$$;
REVOKE ALL ON FUNCTION public.kt_crew_timesheets(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_crew_timesheets(date) TO authenticated;
