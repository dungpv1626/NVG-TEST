-- ============================================================================
-- Điểm danh bằng ảnh tại công trường — BẰNG CHỨNG có mặt, CHƯA phải chấm công.
--
-- Haan 30/09/2026: nhân sự đi làm tại công trình chụp ảnh điểm danh (kiểu Timemark: dải giờ,
-- ngày, công trình in lên ảnh). Chỉ cần «ở khu vực gần công trường», dựa trên sự trung thực của
-- nhân viên — nên vị trí GPS là TUỲ CHỌN, không chặn điểm danh và không so bán kính (công trình
-- cũng chưa có toạ độ). Chưa liên kết bảng chấm công (TC-08 / NS-04 chưa chốt phương thức ghi
-- nhận công tại hiện trường, PRD Mục 10); giao diện nói rõ điều đó ở mọi lượt dùng.
--
-- Ba điều làm cho bản ghi đáng tin hơn một ảnh gửi qua Zalo:
--   · GIỜ do máy chủ đặt (`checked_in_at`), không lấy từ đồng hồ điện thoại — giờ máy ghi riêng
--     ở `client_created_at` để đối chiếu;
--   · NGƯỜI điểm danh luôn là người đang đăng nhập — không điểm danh hộ;
--   · BẤT BIẾN: không có đường sửa, không có đường xoá, kể cả với người điểm danh.
--
-- Quyền theo công trình, cùng hàm với nhật ký (Mẫu A + E): đọc = rls_site_readable, ghi =
-- rls_site_writable. Ảnh nằm trong bucket `construction-photos` (0135), thư mục
-- `<công trình>/diem-danh/` — chính sách tệp của 0135 đã phủ.
--
-- Toạ độ là dữ liệu cá nhân: chỉ lấy ĐÚNG lúc bấm điểm danh, không theo dõi liên tục.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.check_in_location_status AS ENUM ('co_vi_tri', 'khong_cho_phep', 'khong_lay_duoc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.site_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  construction_site_id uuid NOT NULL REFERENCES public.construction_sites(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  photo_path text NOT NULL,
  location_status public.check_in_location_status NOT NULL,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  accuracy_m numeric(10, 1),
  note text,
  client_created_at timestamptz,
  client_generated_id uuid UNIQUE,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  CONSTRAINT site_check_ins_location_matches_status CHECK (
    (location_status = 'co_vi_tri') = (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  CONSTRAINT site_check_ins_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT site_check_ins_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT site_check_ins_note_length CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS site_check_ins_site_time_idx
  ON public.site_check_ins (construction_site_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS site_check_ins_user_time_idx
  ON public.site_check_ins (user_id, checked_in_at DESC);

COMMENT ON TABLE public.site_check_ins IS
  'Điểm danh bằng ảnh tại công trường — bằng chứng có mặt, CHƯA liên kết bảng chấm công (TC-08). Bất biến.';
COMMENT ON COLUMN public.site_check_ins.checked_in_at IS
  'Giờ máy chủ lúc nhận điểm danh — giờ chính thức. Giờ điện thoại ở client_created_at.';
COMMENT ON COLUMN public.site_check_ins.photo_path IS
  'Đường dẫn trong bucket construction-photos: `<công trình>/diem-danh/<uuid>.jpg`.';


-- Trình duyệt không tự đặt được người, giờ, pháp nhân: trigger ghi đè.
CREATE OR REPLACE FUNCTION public.site_check_ins_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- `auth_user_id()` = `users.id` của người đang đăng nhập (khác `auth.uid()` của Supabase Auth).
  IF public.auth_user_id() IS NOT NULL THEN
    NEW.user_id := public.auth_user_id();
    NEW.created_by := NEW.user_id;
    NEW.updated_by := NEW.user_id;
  END IF;
  NEW.checked_in_at := now();
  NEW.synced_at := now();
  NEW.created_at := now();
  NEW.updated_at := now();
  SELECT s.company_id INTO NEW.company_id
  FROM public.construction_sites s WHERE s.id = NEW.construction_site_id;

  IF NEW.photo_path IS NULL
     OR left(NEW.photo_path, length(NEW.construction_site_id::text) + 11)
        <> NEW.construction_site_id::text || '/diem-danh/' THEN
    RAISE EXCEPTION 'Ảnh điểm danh không thuộc công trình này. Chụp lại ảnh từ đúng công trình.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_check_ins_before_insert ON public.site_check_ins;
CREATE TRIGGER site_check_ins_before_insert
  BEFORE INSERT ON public.site_check_ins
  FOR EACH ROW EXECUTE FUNCTION public.site_check_ins_before_insert();

-- Bằng chứng không sửa, không xoá — kể cả qua kết nối quản trị (dọn dữ liệu thử thì tắt trigger).
CREATE OR REPLACE FUNCTION public.site_check_ins_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Điểm danh đã ghi là bằng chứng, không sửa hoặc xoá được.';
END;
$$;

DROP TRIGGER IF EXISTS site_check_ins_immutable ON public.site_check_ins;
CREATE TRIGGER site_check_ins_immutable
  BEFORE UPDATE OR DELETE ON public.site_check_ins
  FOR EACH ROW EXECUTE FUNCTION public.site_check_ins_immutable();


ALTER TABLE public.site_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_check_ins_select ON public.site_check_ins;
CREATE POLICY site_check_ins_select ON public.site_check_ins
  FOR SELECT TO authenticated
  USING (public.rls_site_readable(construction_site_id));

DROP POLICY IF EXISTS site_check_ins_insert ON public.site_check_ins;
CREATE POLICY site_check_ins_insert ON public.site_check_ins
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_site_writable(construction_site_id));

REVOKE ALL ON public.site_check_ins FROM anon;
REVOKE UPDATE, DELETE ON public.site_check_ins FROM authenticated;
GRANT SELECT, INSERT ON public.site_check_ins TO authenticated;
