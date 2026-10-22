-- 0217 — Hai câu hỏi treo anh Dũng trả lời 22/10/2026 (CLAUDE.md 9.5).
--
-- Câu 1: «không thi công trước hợp đồng» → bật `tk.handover_requires_signed_contract` (0158) ở
--   phạm vi chung: bàn giao thiết kế sang thi công bị chặn khi hồ sơ thiết kế chưa có hợp đồng
--   đã ký. Chỉ ghi khi chưa ai đặt — giá trị đã đặt tay (kể cả theo pháp nhân) giữ nguyên.
-- Câu 4: «trượt thầu có đánh dấu Mất cơ hội» → gói thầu sang «Trượt thầu» thì cơ hội gốc tự sang
--   «Mất cơ hội», lý do lấy từ lý do trượt (bắt buộc ở `record_bid_result`). Không chuyển khi cơ
--   hội đã kết thúc (ký hợp đồng / mất) hoặc còn gói thầu khác của cùng cơ hội đang chạy.
--   Người chịu trách nhiệm cơ hội vẫn được báo — nay là báo «đã chuyển».

UPDATE public.system_parameters
   SET value = 'true'::jsonb,
       description = 'true (anh Dũng 22/10/2026 — không thi công trước hợp đồng): chặn bàn giao khi hồ '
                     'sơ thiết kế chưa có hợp đồng đã ký. false: vẫn mở công trình nhưng báo Ban Giám '
                     'đốc và Kế toán. Đặt theo pháp nhân để NVO và NVC khác nhau.'
 WHERE param_key = 'tk.handover_requires_signed_contract'
   AND scope_type = 'global'
   AND value IS NULL;

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
BEGIN
  IF NEW.opportunity_id IS NULL OR NEW.stage IS NOT DISTINCT FROM OLD.stage
     OR NEW.stage <> 'truot_thau' THEN
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
       AND b.stage NOT IN ('truot_thau')
  ) THEN
    IF v_owner IS NOT NULL THEN
      PERFORM public.create_notification(
        v_owner, NEW.company_id, 'bid_lost',
        format('Gói thầu %s trượt thầu. Cơ hội %s còn gói thầu khác nên chưa chuyển sang Mất cơ hội.',
               NEW.code, v_ocode),
        'opportunities', NEW.opportunity_id, format('/crm/co-hoi/%s', NEW.opportunity_id)
      );
    END IF;
    RETURN NEW;
  END IF;

  v_reason := format('Trượt thầu gói %s', NEW.code)
              || COALESCE(': ' || NULLIF(btrim(NEW.lost_reason), ''), '');

  PERFORM set_config('nvg.stage_note', v_reason, true);
  UPDATE public.opportunities
     SET stage = 'mat_co_hoi', lost_reason = v_reason, updated_at = now()
   WHERE id = NEW.opportunity_id;

  IF v_owner IS NOT NULL THEN
    PERFORM public.create_notification(
      v_owner, NEW.company_id, 'bid_lost',
      format('Gói thầu %s trượt thầu — cơ hội %s đã tự chuyển sang Mất cơ hội.', NEW.code, v_ocode),
      'opportunities', NEW.opportunity_id, format('/crm/co-hoi/%s', NEW.opportunity_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bidding_projects_notify_opportunity() IS
  'Gói thầu trượt → cơ hội gốc tự sang Mất cơ hội kèm lý do trượt, trừ khi còn gói thầu khác '
  'đang chạy (0217, câu 4 — thay bản chỉ báo của 0158).';
