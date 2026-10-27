/**
 * «Hợp đồng đã ký chờ mở công trình» trên trang Công trình (0230, câu 5 — anh Dũng 27/10/2026: Trưởng phòng Thi công và
 * Chỉ huy trưởng đều mở được). Thi công không xem phân hệ Hợp đồng, nên danh sách chỉ nêu đủ để nhận ra hợp đồng (mã,
 * số, tên, khách, ngày ký) — không giá trị, không điều khoản. Chỉ huy trưởng tự mở thì được ghi là người phụ trách công
 * trình, để mở xong vẫn thấy công trình (Mẫu E: chưa phân công thì không thấy).
 *
 * Hợp đồng thi công từ cơ hội CRM tự mở công trình khi ký (0187) — khối này cho các hợp đồng còn lại (từ gói thầu, từ
 * thiết kế), và hiện rỗng khi không còn gì phải mở.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { useOpenSiteFromContract } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface AwaitingContract {
  contract_id: string;
  code: string;
  contract_number: string | null;
  title: string;
  customer_name: string | null;
  signed_date: string | null;
}

export function useContractsAwaitingSite() {
  return useQuery<AwaitingContract[], Error>({
    queryKey: ['contracts', 'awaiting-site'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contracts_awaiting_site');
      if (error) throw new Error(error.message);
      return (data ?? []) as AwaitingContract[];
    },
  });
}

export function ContractsAwaitingSite() {
  const { data } = useContractsAwaitingSite();
  const { profile } = useAuth();
  const openSite = useOpenSiteFromContract();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCommander = Boolean(profile?.assignments.some((a) => a.roleCode === 'CHT'));

  if (!data || data.length === 0) return null;

  async function open(c: AwaitingContract) {
    setError(null);
    setBusyId(c.contract_id);
    try {
      const siteId = await openSite.mutateAsync({
        contractId: c.contract_id,
        responsibleUserId: isCommander ? (profile?.id ?? null) : null,
      });
      void navigate(`/tc/cong-trinh/${siteId}`);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="cho-mo-cong-trinh" className="mb-4 rounded-card bg-surface p-4">
      <h2 id="cho-mo-cong-trinh" className="font-semibold">
        Hợp đồng đã ký chờ mở công trình ({data.length})
      </h2>
      <p className="mt-1 text-sm text-fg-subtle">
        Mở công trình ở bước Chuẩn bị — sau đó phân công chỉ huy trưởng và ngày khởi công.
        {isCommander ? ' Người mở được ghi là người phụ trách công trình.' : ''}
      </p>
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {data.map((c) => (
          <li
            key={c.contract_id}
            className="flex flex-wrap items-center gap-3 rounded-sm border border-border p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {c.contract_number ?? c.code} — {c.title}
              </p>
              <p className="text-sm text-fg-subtle">
                {c.customer_name ?? 'Chưa ghi khách hàng'}
                {c.signed_date ? ` · ký ${formatDate(c.signed_date)}` : ''}
              </p>
            </div>
            <Button variant="secondary" disabled={busyId !== null} onClick={() => void open(c)}>
              {busyId === c.contract_id ? 'Đang mở…' : 'Mở công trình'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
