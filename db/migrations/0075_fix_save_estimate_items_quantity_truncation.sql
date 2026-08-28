-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `save_estimate_items`
-- (TK-01, tính dòng chi phí dự toán) ép `quantity` sang `bigint` (làm tròn số nguyên) TRƯỚC
-- khi nhân với đơn giá, thay vì nhân xong mới làm tròn tổng tiền:
--
--   COALESCE((i->>'quantity')::numeric, 0)::bigint * COALESCE((i->>'unit_price')::bigint, 0)
--
-- Khối lượng vật tư/nhân công gần như luôn có phần lẻ (m³, m², tấn — ví dụ 2,5 m³). Với
-- quantity=2.5, unit_price=100.000: đúng ra amount=250.000, nhưng `2.5::bigint` làm tròn
-- (round-half-to-even) về 2 hoặc 3 TRƯỚC khi nhân, ra 200.000 hoặc 300.000 — sai lệch trực
-- tiếp số tiền dòng chi phí, kéo theo `direct_cost` (sum các dòng) của cả dự toán sai theo,
-- ảnh hưởng thẳng tới giá dự thầu.
--
-- Vá: nhân ở kiểu numeric (giữ nguyên phần lẻ), chỉ làm tròn ở bước CUỐI cùng khi ép ra
-- bigint (đơn vị tiền VNĐ không có số thập phân, CLAUDE.md 4.2).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_estimate_items(p_estimate_id uuid, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e       record;
  v_count integer;
BEGIN
  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bản dự toán này.';
  END IF;

  IF e.status <> 'draft' THEN
    RAISE EXCEPTION 'Bản dự toán này đã trình duyệt nên không sửa được. Lập phiên bản mới nếu cần đổi giá.';
  END IF;

  IF NOT public.rls_estimate_parent_writable(e.bidding_project_id, e.design_project_id) THEN
    RAISE EXCEPTION 'Không sửa được dự toán của hồ sơ này.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được nhập giá vốn.';
  END IF;

  PERFORM public.log_sensitive_access('cost', 'estimates', p_estimate_id, 'edit', e.company_id);

  DELETE FROM public.estimate_items WHERE estimate_id = p_estimate_id;

  INSERT INTO public.estimate_items (
    company_id, estimate_id, boq_item_id, unit_price_id, position, cost_group,
    description, unit, quantity, unit_price, amount, notes
  )
  SELECT
    e.company_id,
    p_estimate_id,
    NULLIF(i->>'boq_item_id', '')::uuid,
    NULLIF(i->>'unit_price_id', '')::uuid,
    COALESCE((i->>'position')::numeric, 0),
    (i->>'cost_group')::cost_group,
    i->>'description',
    NULLIF(i->>'unit', ''),
    COALESCE((i->>'quantity')::numeric, 0),
    COALESCE((i->>'unit_price')::bigint, 0),
    -- Nhân ở numeric để giữ phần lẻ khối lượng, chỉ ROUND khi ra bigint ở bước cuối (0075) —
    -- trước đây quantity bị ép bigint (làm tròn) TRƯỚC khi nhân, sai amount với mọi khối
    -- lượng có phần thập phân.
    ROUND(COALESCE((i->>'quantity')::numeric, 0) * COALESCE((i->>'unit_price')::bigint, 0))::bigint,
    NULLIF(i->>'notes', '')
  FROM jsonb_array_elements(p_items) AS i;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.estimates
     SET direct_cost = COALESCE((
           SELECT sum(amount) FROM public.estimate_items
           WHERE estimate_id = p_estimate_id AND deleted_at IS NULL
             AND cost_group IN ('vat_tu', 'nhan_cong', 'may_moc', 'thau_phu')
         ), 0)
   WHERE id = p_estimate_id;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.save_estimate_items(uuid, jsonb) IS
  'Ghi các dòng chi phí dự toán và tính lại direct_cost — nhân quantity*unit_price ở numeric rồi mới làm tròn, không mất phần lẻ khối lượng (0075).';
