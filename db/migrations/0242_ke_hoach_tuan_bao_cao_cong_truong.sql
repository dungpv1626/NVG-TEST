-- ============================================================================
-- 0242 — Thi công theo phiếu khảo sát công trường: T3 + T4 (doc/KE_HOACH_THI_CONG_THEO_KHAO_SAT.md).
--
-- T3. KẾ HOẠCH TUẦN VÀ GIAO VIỆC CHO TỔ ĐỘI (`site_plan_items`, `site_log_plan_progress`)
--   · đầu tuần chỉ huy trưởng lập đầu việc của tuần: tên ngắn, tổ đội của công trình HOẶC người Thi công,
--     khối lượng mục tiêu (numeric + đơn vị, tuỳ chọn), mốc liên quan (tuỳ chọn), ghi chú (tuỳ chọn);
--   · «Chép việc chưa xong của tuần trước» một lần bấm (`copy_unfinished_plan_items`) — khối lượng mục
--     tiêu chép phần CÒN LẠI (mục tiêu − đã ghi), không tự đặt số mới;
--   · nhật ký ngày đánh dấu đầu việc nào đã làm hôm nay: mỗi dấu là một dòng `site_log_plan_progress`
--     gắn MỤC NHẬT KÝ (khối lượng hôm nay và «xong» đều tuỳ chọn). Không thêm ô bắt buộc nào vào nhật
--     ký — ngân sách thao tác công trường 5–10 phút / ngày là tiêu chí nghiệm thu (CLAUDE.md 4.6);
--   · quyền: cùng nhật ký — đọc theo `rls_site_readable`, ghi theo `rls_site_writable` (Mẫu E). Dấu tiến
--     độ chỉ người ĐÃ GHI mục nhật ký mới thêm (chữ ký dưới dòng nhật ký là của người đó — 0035).
--
-- T4. BÁO CÁO TUẦN / THÁNG TỰ TỔNG HỢP (`site_reports`)
--   · `site_report_data` dựng báo cáo từ dữ liệu ĐÃ CÓ: kế hoạch / đã làm, nhật ký (ngày ghi, quân số,
--     thời tiết), mốc, đề nghị đang mở (`site_request_tracker`, gồm đề xuất phát sinh 0241), tồn tại
--     (0241), điểm danh tổ đội (0232), đề xuất phát sinh (chỉ trạng thái). KHÔNG có cột / khoá tiền nào;
--   · thiếu dữ liệu thì trả NULL (giao diện hiện «Chưa đủ dữ liệu»), không trả 0, không ước lượng;
--   · «Gửi báo cáo» (`send_site_report`): chỉ huy trưởng thêm ba ô nhận định → máy CHỤP số liệu lúc gửi
--     vào `site_reports.data` (jsonb) — dòng BẤT BIẾN (không chính sách UPDATE / DELETE, trigger chặn mọi
--     sửa / xoá) — và báo người nhận;
--   · người nhận (anh Dũng chốt): Trưởng phòng Thi công (vai trò TC không giới hạn công trường) của pháp
--     nhân + Tổng Giám đốc / Ban Giám đốc (`_site_report_recipients`). Lãnh đạo đọc bằng quyền XEM phân hệ
--     TC có sẵn, không cần quyền sửa;
--   · báo cáo tháng: cùng hàm với kỳ tháng, kèm nhận định của các báo cáo tuần đã gửi trong tháng.
--
-- Chạy lại được: CREATE … IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS.
-- ============================================================================


-- ============================================================================
-- T3. Đầu việc của tuần
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.site_plan_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites (id) ON DELETE CASCADE,
  -- Thứ Hai của tuần (trigger quy về thứ Hai, theo ngày Việt Nam).
  week_start            date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  position              integer NOT NULL DEFAULT 0,
  name                  text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
  subcontractor_id      uuid REFERENCES public.subcontractors (id) ON DELETE SET NULL,
  assigned_user_id      uuid REFERENCES public.users (id) ON DELETE SET NULL,
  target_quantity       numeric CHECK (target_quantity IS NULL OR target_quantity >= 0),
  quantity_unit         varchar(32),
  site_milestone_id     uuid REFERENCES public.site_milestones (id) ON DELETE SET NULL,
  note                  text,
  status                text NOT NULL DEFAULT 'dang_lam' CHECK (status IN ('dang_lam', 'xong')),
  done_at               timestamptz,
  done_by               uuid REFERENCES public.users (id) ON DELETE SET NULL,
  done_log_id           uuid REFERENCES public.site_logs (id) ON DELETE SET NULL,
  copied_from_id        uuid REFERENCES public.site_plan_items (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users (id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.users (id) ON DELETE SET NULL,
  deleted_at            timestamptz,
  CONSTRAINT site_plan_items_one_assignee CHECK (subcontractor_id IS NULL OR assigned_user_id IS NULL),
  CONSTRAINT site_plan_items_done CHECK ((status = 'xong') = (done_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS site_plan_items_site_week_idx
  ON public.site_plan_items (construction_site_id, week_start, position);
-- Chép từ tuần trước một lần — bấm lại không nhân bản.
CREATE UNIQUE INDEX IF NOT EXISTS site_plan_items_copied_unique
  ON public.site_plan_items (copied_from_id, week_start) WHERE copied_from_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE public.site_plan_items IS
  'Đầu việc của tuần trên công trình (T3, 0242): tổ đội / người nội bộ, khối lượng mục tiêu, mốc. Tiến độ ghi qua site_log_plan_progress.';

SELECT public.attach_audit_touch('public.site_plan_items');

CREATE OR REPLACE FUNCTION public.site_plan_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s      record;
  v_user uuid := public.auth_user_id();
BEGIN
  SELECT * INTO s FROM public.construction_sites WHERE id = NEW.construction_site_id;
  IF NOT FOUND OR s.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Không tìm thấy công trình của đầu việc.';
  END IF;

  NEW.name := btrim(NEW.name);
  NEW.week_start := date_trunc('week', NEW.week_start)::date;

  IF TG_OP = 'INSERT' THEN
    NEW.company_id := s.company_id;
    IF v_user IS NOT NULL THEN
      NEW.created_by := v_user;
      IF NEW.status = 'xong' THEN
        NEW.done_at := now();
        NEW.done_by := v_user;
      ELSE
        NEW.done_at := NULL; NEW.done_by := NULL; NEW.done_log_id := NULL;
      END IF;
    END IF;
  ELSE
    IF NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.copied_from_id IS DISTINCT FROM OLD.copied_from_id THEN
      RAISE EXCEPTION 'Công trình và người lập của đầu việc không đổi được.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      -- Đóng từ nhật ký thì `done_log_id` là mục nhật ký làm căn cứ (trigger dấu tiến độ đặt cùng lượt);
      -- đóng tay trên kế hoạch thì không có.
      IF NEW.status = 'xong' THEN
        NEW.done_at := now();
        NEW.done_by := v_user;
        IF v_user IS NOT NULL AND NEW.done_log_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.site_logs l
                            WHERE l.id = NEW.done_log_id AND l.construction_site_id = NEW.construction_site_id) THEN
          NEW.done_log_id := NULL;
        END IF;
      ELSE
        NEW.done_at := NULL; NEW.done_by := NULL; NEW.done_log_id := NULL;
      END IF;
    ELSIF v_user IS NOT NULL THEN
      NEW.done_at := OLD.done_at;
      NEW.done_by := OLD.done_by;
      NEW.done_log_id := OLD.done_log_id;
    END IF;
  END IF;

  IF NEW.subcontractor_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.subcontractor_id IS DISTINCT FROM OLD.subcontractor_id)
     AND NOT EXISTS (SELECT 1 FROM public.subcontractors sc
                      WHERE sc.id = NEW.subcontractor_id AND sc.construction_site_id = NEW.construction_site_id
                        AND sc.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Tổ đội được giao phải là tổ đội của công trình này.';
  END IF;
  IF NEW.site_milestone_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.site_milestone_id IS DISTINCT FROM OLD.site_milestone_id)
     AND NOT EXISTS (SELECT 1 FROM public.site_milestones m
                      WHERE m.id = NEW.site_milestone_id AND m.construction_site_id = NEW.construction_site_id) THEN
    RAISE EXCEPTION 'Mốc thi công không thuộc công trình của đầu việc này.';
  END IF;
  IF v_user IS NOT NULL AND NEW.assigned_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.site_commander_candidates(NEW.company_id) c
                      WHERE c.id = NEW.assigned_user_id) THEN
    RAISE EXCEPTION 'Người được giao đầu việc phải là người của Thi công.';
  END IF;

  IF v_user IS NOT NULL THEN
    NEW.updated_by := v_user;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_plan_items_guard ON public.site_plan_items;
CREATE TRIGGER site_plan_items_guard
  BEFORE INSERT OR UPDATE ON public.site_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.site_plan_items_guard();

ALTER TABLE public.site_plan_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_plan_items FROM anon;
REVOKE DELETE ON public.site_plan_items FROM authenticated;

DROP POLICY IF EXISTS site_plan_items_select ON public.site_plan_items;
CREATE POLICY site_plan_items_select ON public.site_plan_items
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_readable(construction_site_id));

DROP POLICY IF EXISTS site_plan_items_insert ON public.site_plan_items;
CREATE POLICY site_plan_items_insert ON public.site_plan_items
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_site_writable(construction_site_id) AND NOT public.auth_is_read_only());

DROP POLICY IF EXISTS site_plan_items_update ON public.site_plan_items;
CREATE POLICY site_plan_items_update ON public.site_plan_items
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_writable(construction_site_id))
  WITH CHECK (public.rls_site_writable(construction_site_id));


-- ----------------------------------------------------------------------------
-- Dấu tiến độ trong nhật ký ngày
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_log_plan_progress (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites (id) ON DELETE CASCADE,
  site_log_id           uuid NOT NULL REFERENCES public.site_logs (id) ON DELETE CASCADE,
  plan_item_id          uuid NOT NULL REFERENCES public.site_plan_items (id) ON DELETE CASCADE,
  quantity_done         numeric CHECK (quantity_done IS NULL OR quantity_done >= 0),
  marked_done           boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT site_log_plan_progress_once UNIQUE (site_log_id, plan_item_id)
);

CREATE INDEX IF NOT EXISTS site_log_plan_progress_item_idx
  ON public.site_log_plan_progress (plan_item_id);
CREATE INDEX IF NOT EXISTS site_log_plan_progress_site_idx
  ON public.site_log_plan_progress (construction_site_id);

COMMENT ON TABLE public.site_log_plan_progress IS
  'Đầu việc đã làm trong một mục nhật ký (T3, 0242) — khối lượng hôm nay và «xong» đều tuỳ chọn. Chỉ thêm, không sửa.';

CREATE OR REPLACE FUNCTION public.site_log_plan_progress_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l      record;
  v_user uuid := public.auth_user_id();
BEGIN
  SELECT * INTO l FROM public.site_logs WHERE id = NEW.site_log_id;
  IF NOT FOUND OR l.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Không tìm thấy mục nhật ký.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_plan_items i
                  WHERE i.id = NEW.plan_item_id AND i.construction_site_id = l.construction_site_id
                    AND i.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Đầu việc không thuộc công trình của mục nhật ký này.';
  END IF;
  IF v_user IS NOT NULL AND l.logged_by IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Chỉ người đã ghi mục nhật ký mới đánh dấu được đầu việc của mục đó.';
  END IF;
  NEW.company_id := l.company_id;
  NEW.construction_site_id := l.construction_site_id;
  IF v_user IS NOT NULL THEN
    NEW.created_by := v_user;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_log_plan_progress_guard ON public.site_log_plan_progress;
CREATE TRIGGER site_log_plan_progress_guard
  BEFORE INSERT ON public.site_log_plan_progress
  FOR EACH ROW EXECUTE FUNCTION public.site_log_plan_progress_guard();

-- «Xong» trong nhật ký đóng đầu việc, ghi mục nhật ký làm căn cứ.
CREATE OR REPLACE FUNCTION public.site_log_plan_progress_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.marked_done THEN
    UPDATE public.site_plan_items
       SET status = 'xong', done_log_id = NEW.site_log_id
     WHERE id = NEW.plan_item_id AND status <> 'xong';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_log_plan_progress_done ON public.site_log_plan_progress;
CREATE TRIGGER site_log_plan_progress_done
  AFTER INSERT ON public.site_log_plan_progress
  FOR EACH ROW EXECUTE FUNCTION public.site_log_plan_progress_done();

ALTER TABLE public.site_log_plan_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_log_plan_progress FROM anon;
REVOKE UPDATE, DELETE ON public.site_log_plan_progress FROM authenticated;

DROP POLICY IF EXISTS site_log_plan_progress_select ON public.site_log_plan_progress;
CREATE POLICY site_log_plan_progress_select ON public.site_log_plan_progress
  FOR SELECT TO authenticated
  USING (public.rls_site_readable(construction_site_id));

DROP POLICY IF EXISTS site_log_plan_progress_insert ON public.site_log_plan_progress;
CREATE POLICY site_log_plan_progress_insert ON public.site_log_plan_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.auth_is_read_only()
    AND public.rls_site_writable(
      (SELECT l.construction_site_id FROM public.site_logs l WHERE l.id = site_log_id))
  );


-- ----------------------------------------------------------------------------
-- Chép đầu việc chưa xong của tuần trước (một lần bấm)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copy_unfinished_plan_items(p_site_id uuid, p_week_start date)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_week date := date_trunc('week', p_week_start)::date;
  v_n    integer;
  v_pos  integer;
BEGIN
  IF NOT public.rls_site_writable(p_site_id) THEN
    RAISE EXCEPTION 'Không lập được kế hoạch tuần cho công trình này.';
  END IF;
  SELECT coalesce(max(position), 0) INTO v_pos
    FROM public.site_plan_items
   WHERE construction_site_id = p_site_id AND week_start = v_week AND deleted_at IS NULL;

  INSERT INTO public.site_plan_items (construction_site_id, company_id, week_start, position, name,
                                      subcontractor_id, assigned_user_id, target_quantity, quantity_unit,
                                      site_milestone_id, note, copied_from_id)
  SELECT i.construction_site_id, i.company_id, v_week, v_pos + row_number() OVER (ORDER BY i.position, i.created_at),
         i.name, i.subcontractor_id, i.assigned_user_id,
         -- Phần CÒN LẠI của mục tiêu theo số đã ghi; chưa ghi số nào thì giữ mục tiêu cũ.
         CASE WHEN i.target_quantity IS NULL OR p.qty IS NULL THEN i.target_quantity
              ELSE greatest(i.target_quantity - p.qty, 0) END,
         i.quantity_unit, i.site_milestone_id, i.note, i.id
    FROM public.site_plan_items i
    LEFT JOIN LATERAL (
      SELECT sum(g.quantity_done) AS qty FROM public.site_log_plan_progress g WHERE g.plan_item_id = i.id
    ) p ON true
   WHERE i.construction_site_id = p_site_id
     AND i.week_start = v_week - 7
     AND i.status = 'dang_lam'
     AND i.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.site_plan_items x
                      WHERE x.copied_from_id = i.id AND x.week_start = v_week AND x.deleted_at IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_unfinished_plan_items(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_unfinished_plan_items(uuid, date) TO authenticated;


-- ============================================================================
-- T4. Báo cáo tuần / tháng
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.site_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites (id) ON DELETE CASCADE,
  code                  varchar(40) NOT NULL UNIQUE,
  kind                  text NOT NULL CHECK (kind IN ('tuan', 'thang')),
  period_start          date NOT NULL,
  period_end            date NOT NULL CHECK (period_end >= period_start),
  -- Số liệu chụp lúc gửi — không có khoá / giá trị tiền nào.
  data                  jsonb NOT NULL,
  highlights            text,
  problems              text,
  next_plan             text,
  sent_at               timestamptz NOT NULL DEFAULT now(),
  sent_by               uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT site_reports_once UNIQUE (construction_site_id, kind, period_start)
);

CREATE INDEX IF NOT EXISTS site_reports_site_idx ON public.site_reports (construction_site_id, period_start DESC);
CREATE INDEX IF NOT EXISTS site_reports_company_idx ON public.site_reports (company_id, sent_at DESC);

COMMENT ON TABLE public.site_reports IS
  'Báo cáo tuần / tháng của công trường đã gửi (T4, 0242) — số liệu chụp lúc gửi + nhận định của chỉ huy trưởng. Bất biến; không chứa tiền.';

-- Bất biến: không ai sửa / xoá, kể cả hàm nghiệp vụ. Muốn đính chính thì nói ở báo cáo kỳ sau.
-- Ngoại lệ duy nhất: dòng bị xoá DÂY CHUYỀN vì chính công trình bị xoá cứng (khoá ngoại ON DELETE CASCADE
-- chạy trong trigger của bảng cha → độ sâu trigger > 1) — công trình thật chỉ xoá mềm.
CREATE OR REPLACE FUNCTION public.site_reports_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Báo cáo công trường đã gửi không sửa, không xoá được. Cần đính chính thì ghi ở báo cáo kỳ sau.';
END;
$$;

DROP TRIGGER IF EXISTS site_reports_frozen ON public.site_reports;
CREATE TRIGGER site_reports_frozen
  BEFORE UPDATE OR DELETE ON public.site_reports
  FOR EACH ROW EXECUTE FUNCTION public.site_reports_frozen();

ALTER TABLE public.site_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_reports FROM anon;
-- Chỉ ghi qua `send_site_report` (số liệu do máy chụp, không nhận từ trình duyệt).
REVOKE INSERT, UPDATE, DELETE ON public.site_reports FROM authenticated;

DROP POLICY IF EXISTS site_reports_select ON public.site_reports;
CREATE POLICY site_reports_select ON public.site_reports
  FOR SELECT TO authenticated
  USING (public.rls_site_readable(construction_site_id));


-- --- Kỳ báo cáo ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_report_period(p_kind text, p_date date)
RETURNS TABLE (period_start date, period_end date)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_kind = 'tuan' THEN date_trunc('week', p_date)::date
              ELSE date_trunc('month', p_date)::date END,
         CASE WHEN p_kind = 'tuan' THEN date_trunc('week', p_date)::date + 6
              ELSE (date_trunc('month', p_date) + interval '1 month')::date - 1 END;
$$;

GRANT EXECUTE ON FUNCTION public.site_report_period(text, date) TO authenticated;


-- --- Số liệu báo cáo ----------------------------------------------------------------------------
-- SECURITY DEFINER để tránh RLS lặp trên năm bảng nối (bài học 0200: quá 8 giây); phạm vi kiểm tường minh
-- bằng `rls_site_readable` ngay đầu hàm — chỉ huy trưởng công trình khác bị từ chối.
CREATE OR REPLACE FUNCTION public.site_report_data(p_site_id uuid, p_kind text, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s        record;
  c        record;
  v_start  date;
  v_end    date;
  v_today  date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_days   integer;
  j_plan   jsonb;
  j_logs   jsonb;
  j_ms     jsonb;
  j_req    jsonb;
  j_iss    jsonb;
  j_att    jsonb;
  j_chg    jsonb;
  j_weeks  jsonb;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('tuan', 'thang') THEN
    RAISE EXCEPTION 'Loại báo cáo không hợp lệ.';
  END IF;
  IF p_site_id IS NULL OR NOT public.rls_site_readable(p_site_id) THEN
    RAISE EXCEPTION 'Không xem được báo cáo của công trình này.';
  END IF;

  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id;
  SELECT * INTO c FROM public.companies WHERE id = s.company_id;
  SELECT p.period_start, p.period_end INTO v_start, v_end
    FROM public.site_report_period(p_kind, coalesce(p_date, v_today)) p;
  v_days := greatest(least(v_end, v_today) - v_start + 1, 0);

  -- Kế hoạch / đã làm. Khối lượng đã làm = tổng số đã ghi trong nhật ký của kỳ; chưa ghi số nào → NULL.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'week_start', i.week_start,
           'name', i.name,
           'crew', sc.name,
           'assignee', u.full_name,
           'milestone', m.label,
           'target_quantity', i.target_quantity,
           'unit', i.quantity_unit,
           'done_quantity', pg.qty,
           'days_worked', coalesce(pg.days, 0),
           'status', i.status,
           'done_date', (i.done_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
           'carried_over', i.copied_from_id IS NOT NULL,
           'note', i.note
         ) ORDER BY i.week_start, i.position, i.created_at), '[]'::jsonb)
    INTO j_plan
    FROM public.site_plan_items i
    LEFT JOIN public.subcontractors sc ON sc.id = i.subcontractor_id
    LEFT JOIN public.users u ON u.id = i.assigned_user_id
    LEFT JOIN public.site_milestones m ON m.id = i.site_milestone_id
    LEFT JOIN LATERAL (
      SELECT sum(g.quantity_done) AS qty, count(DISTINCT l.log_date)::int AS days
        FROM public.site_log_plan_progress g
        JOIN public.site_logs l ON l.id = g.site_log_id AND l.deleted_at IS NULL
       WHERE g.plan_item_id = i.id AND l.log_date BETWEEN v_start AND v_end
    ) pg ON true
   WHERE i.construction_site_id = p_site_id AND i.deleted_at IS NULL
     AND i.week_start BETWEEN v_start - 6 AND v_end;

  -- Nhật ký: số ngày có ghi, quân số (cao nhất trong ngày), thời tiết.
  SELECT jsonb_build_object(
           'days_in_period', v_days,
           'days_logged', count(*),
           'entries', coalesce(sum(d.entries), 0),
           'days', coalesce(jsonb_agg(jsonb_build_object(
                     'date', d.log_date, 'entries', d.entries,
                     'workforce', d.workforce, 'weather', d.weather) ORDER BY d.log_date), '[]'::jsonb))
    INTO j_logs
    FROM (
      SELECT l.log_date, count(*)::int AS entries, max(l.workforce_count) AS workforce,
             string_agg(DISTINCT NULLIF(btrim(l.weather), ''), ' · ') AS weather
        FROM public.site_logs l
       WHERE l.construction_site_id = p_site_id AND l.deleted_at IS NULL
         AND l.log_date BETWEEN v_start AND v_end
       GROUP BY l.log_date
    ) d;

  -- Mốc: đạt trong kỳ, còn lại, chờ kiểm kỹ thuật.
  SELECT jsonb_build_object(
           'total', count(*),
           'passed_in_period', coalesce(jsonb_agg(jsonb_build_object(
               'label', m.label, 'passed_date', (m.passed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
               ORDER BY m.position)
             FILTER (WHERE m.status = 'dat'
                       AND (m.passed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN v_start AND v_end),
             '[]'::jsonb),
           'passed_total', count(*) FILTER (WHERE m.status = 'dat'),
           'pending', coalesce(jsonb_agg(jsonb_build_object(
               'label', m.label, 'status', m.status, 'planned_end_date', m.planned_end_date,
               'overdue', coalesce(m.planned_end_date < v_today, false))
               ORDER BY m.position) FILTER (WHERE m.status <> 'dat'), '[]'::jsonb),
           'waiting_technical', count(*) FILTER (WHERE m.status = 'cho_ky_thuat')
         )
    INTO j_ms
    FROM public.site_milestones m
   WHERE m.construction_site_id = p_site_id;

  -- Đề nghị đang mở (gồm đề xuất phát sinh 0241) — chỉ tên, người giữ, ngày cần; không giá trị.
  SELECT jsonb_build_object(
           'open', count(*),
           'overdue', count(*) FILTER (WHERE r.needed_date < v_today),
           'items', coalesce(jsonb_agg(jsonb_build_object(
               'entity_type', r.entity_type, 'code', r.code, 'title', r.title,
               'holder_label', r.holder_label, 'holder_names', to_jsonb(r.holder_names),
               'needed_date', r.needed_date, 'overdue', coalesce(r.needed_date < v_today, false),
               'waiting_since', r.waiting_since)
               ORDER BY r.needed_date NULLS LAST, r.created_at), '[]'::jsonb))
    INTO j_req
    FROM public.site_request_tracker(p_site_id, false) r
   WHERE NOT r.is_closed;

  -- Tồn tại: mở / đóng trong kỳ, đang mở, quá hạn.
  SELECT jsonb_build_object(
           'opened_in_period', count(*) FILTER (
               WHERE (i.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN v_start AND v_end),
           'closed_in_period', count(*) FILTER (
               WHERE i.status = 'da_dong'
                 AND (i.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN v_start AND v_end),
           'open_now', count(*) FILTER (WHERE i.status = 'dang_mo'),
           'overdue_now', count(*) FILTER (WHERE i.status = 'dang_mo' AND i.due_date < v_today),
           'items', coalesce(jsonb_agg(jsonb_build_object(
               'code', i.code, 'work_item', i.work_item, 'description', left(i.description, 200),
               'assignee', coalesce(sc.name, u.full_name), 'due_date', i.due_date,
               'overdue', coalesce(i.due_date < v_today, false))
               ORDER BY i.due_date NULLS LAST, i.created_at) FILTER (WHERE i.status = 'dang_mo'), '[]'::jsonb))
    INTO j_iss
    FROM public.site_issues i
    LEFT JOIN public.subcontractors sc ON sc.id = i.subcontractor_id
    LEFT JOIN public.users u ON u.id = i.assigned_user_id
   WHERE i.construction_site_id = p_site_id AND i.deleted_at IS NULL;

  -- Điểm danh tổ đội (0232): số ngày có điểm danh, tổng công, số người cao nhất một ngày.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'crew', x.crew, 'days', x.days, 'workdays', x.workdays, 'max_people', x.max_people)
           ORDER BY x.crew), '[]'::jsonb)
    INTO j_att
    FROM (
      SELECT sc.name::text AS crew, count(*)::int AS days, sum(sh.workdays) AS workdays,
             max(sh.present)::int AS max_people
        FROM (
          SELECT h.subcontractor_id, h.work_date,
                 coalesce(sum(a.workday), 0) AS workdays,
                 count(a.id) FILTER (WHERE a.status <> 'vang') AS present
            FROM public.crew_attendance_sheets h
            LEFT JOIN public.crew_attendance a ON a.sheet_id = h.id
           WHERE h.construction_site_id = p_site_id AND h.work_date BETWEEN v_start AND v_end
           GROUP BY h.id, h.subcontractor_id, h.work_date
        ) sh
        JOIN public.subcontractors sc ON sc.id = sh.subcontractor_id
       GROUP BY sc.id, sc.name
    ) x;

  -- Đề xuất phát sinh: chỉ trạng thái (không giá — 0241). Lập trong kỳ hoặc chưa đóng.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'code', p.code, 'cause', p.cause, 'description', left(p.description, 200),
           'is_emergency', p.is_emergency,
           'created_date', (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
           'display_status', st.display_status, 'holder_label', st.holder_label,
           'is_closed', st.is_closed)
           ORDER BY p.created_at), '[]'::jsonb)
    INTO j_chg
    FROM public.site_change_proposals p
    JOIN public.site_change_proposal_states(p_site_id) st ON st.proposal_id = p.id
   WHERE p.construction_site_id = p_site_id AND p.deleted_at IS NULL
     AND (NOT st.is_closed
          OR (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN v_start AND v_end);

  -- Báo cáo tháng: nhận định của các báo cáo tuần đã gửi trong tháng.
  IF p_kind = 'thang' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'code', r.code, 'period_start', r.period_start, 'period_end', r.period_end,
             'highlights', r.highlights, 'problems', r.problems) ORDER BY r.period_start), '[]'::jsonb)
      INTO j_weeks
      FROM public.site_reports r
     WHERE r.construction_site_id = p_site_id AND r.kind = 'tuan'
       AND r.period_start BETWEEN v_start - 6 AND v_end;
  END IF;

  RETURN jsonb_build_object(
    'kind', p_kind,
    'period_start', v_start,
    'period_end', v_end,
    'generated_at', now(),
    'site', jsonb_build_object(
      'id', s.id, 'code', s.code, 'name', s.name, 'address', s.site_address, 'stage', s.stage,
      'commander', (SELECT u.full_name FROM public.users u WHERE u.id = s.responsible_user_id),
      'planned_end_date', s.planned_end_date),
    'company', jsonb_build_object(
      'code', c.code, 'short_name', c.short_name, 'legal_name', c.legal_name, 'address', c.address,
      'phone', c.phone),
    'plan', j_plan,
    'logs', j_logs,
    'milestones', j_ms,
    'requests', j_req,
    'issues', j_iss,
    'attendance', j_att,
    'changes', j_chg,
    'weekly_reports', coalesce(j_weeks, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.site_report_data(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_report_data(uuid, text, date) TO authenticated;

COMMENT ON FUNCTION public.site_report_data(uuid, text, date) IS
  'T4 (0242): số liệu báo cáo tuần / tháng của công trường từ dữ liệu đã có. Không có tiền. Thiếu dữ liệu → NULL, không 0.';


-- --- Người nhận báo cáo -------------------------------------------------------------------------
-- Anh Dũng chốt: Trưởng phòng Thi công (vai trò TC, không giới hạn công trường) của pháp nhân và các giám
-- đốc (Tổng Giám đốc, Ban Giám đốc). Không gồm Giám đốc Tài chính, Quản trị, Kiểm soát nội bộ.
CREATE OR REPLACE FUNCTION public._site_report_recipients(p_company_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT u.id ORDER BY u.id), '{}'::uuid[])
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
   WHERE u.is_active AND u.deleted_at IS NULL
     AND NOT r.site_scoped
     AND ((r.code::text = 'TC' AND uc.company_id = p_company_id)
          OR (r.code::text IN ('TGD', 'BGD') AND (uc.company_id = p_company_id OR r.sees_all_companies)));
$$;

REVOKE ALL ON FUNCTION public._site_report_recipients(uuid) FROM PUBLIC, anon, authenticated;


-- --- Gửi báo cáo --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_site_report(
  p_site_id    uuid,
  p_kind       text,
  p_date       date,
  p_highlights text DEFAULT NULL,
  p_problems   text DEFAULT NULL,
  p_next_plan  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       record;
  v_user  uuid := public.auth_user_id();
  v_start date;
  v_end   date;
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_id    uuid;
  v_code  text;
  u       uuid;
BEGIN
  IF v_user IS NULL OR public.auth_is_read_only() OR NOT public.rls_site_writable(p_site_id) THEN
    RAISE EXCEPTION 'Không gửi được báo cáo của công trình này. Chỉ huy trưởng hoặc Trưởng phòng Thi công phụ trách công trình gửi được.';
  END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id;
  SELECT p.period_start, p.period_end INTO v_start, v_end
    FROM public.site_report_period(p_kind, coalesce(p_date, v_today)) p;
  IF v_start > v_today THEN
    RAISE EXCEPTION 'Kỳ báo cáo chưa bắt đầu.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.site_reports r
              WHERE r.construction_site_id = p_site_id AND r.kind = p_kind AND r.period_start = v_start) THEN
    RAISE EXCEPTION 'Báo cáo % này đã gửi. Cần bổ sung thì ghi ở báo cáo kỳ sau.',
      CASE WHEN p_kind = 'tuan' THEN 'tuần' ELSE 'tháng' END;
  END IF;

  v_code := public.issue_record_code(
    (SELECT c.code FROM public.companies c WHERE c.id = s.company_id),
    CASE WHEN p_kind = 'tuan' THEN 'BCT' ELSE 'BCTH' END);

  INSERT INTO public.site_reports (company_id, construction_site_id, code, kind, period_start, period_end,
                                   data, highlights, problems, next_plan, sent_by)
  VALUES (s.company_id, p_site_id, v_code, p_kind, v_start, v_end,
          public.site_report_data(p_site_id, p_kind, v_start),
          NULLIF(btrim(coalesce(p_highlights, '')), ''),
          NULLIF(btrim(coalesce(p_problems, '')), ''),
          NULLIF(btrim(coalesce(p_next_plan, '')), ''),
          v_user)
  RETURNING id INTO v_id;

  FOREACH u IN ARRAY public._site_report_recipients(s.company_id) LOOP
    CONTINUE WHEN u = v_user;
    PERFORM public.create_notification(
      u, s.company_id, 'site_report_sent',
      format('Công trình %s gửi báo cáo %s %s — %s', s.code,
             CASE WHEN p_kind = 'tuan' THEN 'tuần' ELSE 'tháng' END,
             to_char(v_start, 'DD/MM/YYYY') || '–' || to_char(v_end, 'DD/MM/YYYY'),
             coalesce(left(NULLIF(btrim(coalesce(p_problems, '')), ''), 100), 'không nêu vướng mắc')),
      'site_reports', v_id, format('/tc/bao-cao/%s', v_id));
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_site_report(uuid, text, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_site_report(uuid, text, date, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.send_site_report(uuid, text, date, text, text, text) IS
  'T4 (0242): chụp số liệu báo cáo tuần / tháng + nhận định của chỉ huy trưởng thành dòng bất biến, báo Trưởng phòng Thi công và các giám đốc.';
