/**
 * Cảnh báo đề nghị chi trông như trả tổ đội / thầu phụ mà KHÔNG gắn tổ đội (0255, anh Dũng
 * 30/10/2026). Chỉ cảnh báo, không chặn: người lập thấy trên trang đề nghị, người duyệt thấy trong
 * hộp Phê duyệt. CSDL (`payment_request_crew_warning`) quyết có cảnh báo không và ai đọc được.
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useCan } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface CrewWarning {
  warn: boolean;
  matched_crew: string | null;
  crews: { id: string; name: string; site_id: string; site_code: string }[];
  message: string | null;
}

export function useCrewPaymentWarning(requestId: string | undefined) {
  return useQuery<CrewWarning | null, Error>({
    // Nằm dưới khoá «allocations» để đổi phân bổ chi phí (đổi công trình) thì tải lại cảnh báo.
    queryKey: ['payment-requests', requestId, 'allocations', 'crew-warning'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('payment_request_crew_warning', {
        p_request_id: requestId!,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as CrewWarning[])[0] ?? null;
    },
    enabled: Boolean(requestId),
  });
}

export function CrewPaymentWarning({ requestId }: { requestId: string }) {
  const { data } = useCrewPaymentWarning(requestId);
  // Liên kết sang trang tổ đội chỉ hiện cho người xem được Thi công (5.4 — ẩn, không báo lỗi).
  const canViewSite = useCan('TC', 'view');
  if (!data?.warn) return null;
  return (
    <div
      role="note"
      className="flex gap-2 rounded-sm bg-status-pending-bg px-3 py-2 text-status-pending"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">Không gắn tổ đội — chưa kiểm khối lượng đã nghiệm thu</p>
        {data.message && <p>{data.message.replace(/^Không gắn tổ đội[^.]*\.\s*/, '')}</p>}
        {data.crews.length > 0 && (
          <p>
            Tổ đội đã đăng ký:{' '}
            {data.crews.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ', '}
                {canViewSite ? (
                  <Link to={`/tc/thau-phu/${c.id}`} className="underline underline-offset-4">
                    {c.name}
                  </Link>
                ) : (
                  c.name
                )}{' '}
                ({c.site_code})
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
