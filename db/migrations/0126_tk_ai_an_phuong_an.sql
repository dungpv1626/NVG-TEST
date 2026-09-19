-- Ẩn một phương án mặt bằng AI khỏi dải chọn phương án (18/09/2026, Haan: «phần danh sách phương án
-- đang bị dài, thêm tính năng cho phép xoá phương án»).
--
-- Vì sao là bảng ĐÁNH DẤU chứ không phải `DELETE FROM design_artifact`: artifact bất biến và có
-- lineage (CLAUDE.md 8.2 nguyên tắc 6, 8.8 mục 1) — bảng `design_artifact` cố ý KHÔNG có policy
-- UPDATE hay DELETE, và một phương án đã bị xoá cứng sẽ làm đứt cạnh lineage của mọi bản sửa dựng
-- từ nó, kể cả bản kỹ sư đang mở. Nên «xoá» ở đây là THÔI HIỆN: dòng đánh dấu bỏ đi thì phương án
-- trở lại, và nhật ký chi phí (`design_ai_call.artifact_id`) vẫn truy được về lượt gọi đã trả tiền.
--
-- Ba chiều quyền như mọi bảng của module (8.8 mục 3): đọc theo `rls_design_readable`, ghi và bỏ dấu
-- theo `rls_design_writable` — ai được ghi bộ môn ấy của dự án ấy thì được ẩn và hiện lại.

CREATE TABLE public.design_artifact_hidden (
  artifact_id varchar(71) PRIMARY KEY REFERENCES public.design_artifact(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  discipline  public.design_discipline NOT NULL,

  hidden_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  hidden_at   timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX design_artifact_hidden_project_idx
  ON public.design_artifact_hidden (project_id, discipline);
--> statement-breakpoint
ALTER TABLE public.design_artifact_hidden ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY design_artifact_hidden_select ON public.design_artifact_hidden
  FOR SELECT TO authenticated
  USING (public.rls_design_readable(tenant_id, project_id, discipline));
--> statement-breakpoint
CREATE POLICY design_artifact_hidden_insert ON public.design_artifact_hidden
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_design_writable(tenant_id, project_id, discipline));
--> statement-breakpoint
CREATE POLICY design_artifact_hidden_delete ON public.design_artifact_hidden
  FOR DELETE TO authenticated
  USING (public.rls_design_writable(tenant_id, project_id, discipline));
--> statement-breakpoint
COMMENT ON TABLE public.design_artifact_hidden IS
  'Artifact thôi hiện trên màn hình. Không xoá dữ liệu: bỏ dòng này thì phương án trở lại.';
