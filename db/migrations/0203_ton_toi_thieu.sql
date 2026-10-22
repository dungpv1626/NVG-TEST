-- ============================================================================
-- Đợt 4 — 4D. Tồn tối thiểu: báo Kho + Mua hàng khi tồn xuống tới mức NVG đặt.
--
-- Đã có từ 0038/0040: `inventory_items.min_quantity` (mức theo TỪNG KHO × vật tư, sửa được bởi người
-- có quyền sửa KHO — `rls_warehouse_writable`), và nhãn «Sắp hết» trên danh sách tồn
-- (`stockAlerts` ở `shared/src/kho.ts`: tồn > 0 và tồn ≤ mức).
-- Thêm ở đây: BÁO CHỦ ĐỘNG (KHO-08) — lúc tồn đi qua mức (phiếu xuất, điều chuyển, điều chỉnh kiểm
-- kê) hoặc lúc đặt mức mà tồn đã thấp hơn, gửi thông báo cho Kho của pháp nhân, thủ kho phụ trách
-- kho đó và Mua hàng. Báo NGAY bằng trigger, không chờ quét đêm: mục tiêu là hàng sắp hết được báo
-- trước khi công trường hỏi.
--
-- Mức để TRỐNG mặc định (CLAUDE.md 5.2 — NVG chưa đặt, câu 17): vật tư chưa đặt mức KHÔNG báo.
-- Chỉ báo khi đi QUA mức (từ trên xuống), không báo lại mỗi phiếu khi đã ở dưới — tránh loãng
-- thông báo (CGD 3.4). Quy tắc «≤ mức» khớp `stockAlerts` để màn hình và thông báo nói cùng một điều.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.inventory_low_stock_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w      record;
  m      record;
  v_msg  text;
  v_was_low boolean;
BEGIN
  IF NEW.min_quantity IS NULL OR NEW.min_quantity <= 0 OR NEW.quantity_on_hand > NEW.min_quantity THEN
    RETURN NEW;
  END IF;

  v_was_low := TG_OP = 'UPDATE'
               AND OLD.min_quantity IS NOT NULL AND OLD.min_quantity > 0
               AND OLD.quantity_on_hand <= OLD.min_quantity;
  IF v_was_low THEN
    RETURN NEW;
  END IF;

  SELECT * INTO w FROM public.warehouses WHERE id = NEW.warehouse_id;
  SELECT * INTO m FROM public.materials WHERE id = NEW.material_id;

  v_msg := CASE
    WHEN NEW.quantity_on_hand <= 0 THEN format(
      '%s đã hết %s (%s) — mức tối thiểu %s %s. Cần đặt mua bổ sung.',
      w.name, m.name, m.code, trim_scale(NEW.min_quantity), m.unit)
    ELSE format(
      '%s: %s (%s) còn %s %s, đã xuống tới mức tối thiểu %s %s. Cần đặt mua bổ sung.',
      w.name, m.name, m.code, trim_scale(NEW.quantity_on_hand), m.unit, trim_scale(NEW.min_quantity), m.unit)
  END;

  PERFORM public.create_notification(
    r.uid, NEW.company_id, 'low_stock', v_msg, 'inventory_items', NEW.id, '/kho/ton-kho?canh-bao=1'
  )
  FROM (
    SELECT DISTINCT x.uid FROM (
      SELECT uc.user_id AS uid
        FROM public.user_companies uc
        JOIN public.roles ro ON ro.id = uc.role_id
       WHERE uc.deleted_at IS NULL
         AND ro.code IN ('KHO', 'MH')
         AND (uc.company_id = NEW.company_id OR ro.sees_all_companies)
      UNION SELECT w.manager_user_id
    ) x
    JOIN public.users u ON u.id = x.uid AND u.is_active AND u.deleted_at IS NULL
  ) r;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_low_stock_notify ON public.inventory_items;
CREATE TRIGGER inventory_items_low_stock_notify
  AFTER INSERT OR UPDATE OF quantity_on_hand, min_quantity ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.inventory_low_stock_notify();

COMMENT ON FUNCTION public.inventory_low_stock_notify() IS
  '4D (0203): tồn đi qua mức tối thiểu (≤ mức, mức đã đặt) → báo Kho, thủ kho phụ trách kho và Mua hàng. Mức trống thì không báo.';

COMMENT ON COLUMN public.inventory_items.min_quantity IS
  'Mức tồn tối thiểu của vật tư ở kho này (KHO-08, 4D). NVG đặt; trống = chưa đặt mức, không cảnh báo.';
