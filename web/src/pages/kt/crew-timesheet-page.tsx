/**
 * «Bảng công tổ đội» cho Kế toán (0232, câu 6): bảng công tháng của từng tổ ở từng công trình, ĐÃ được Trưởng phòng Thi
 * công xác nhận — căn cứ thanh toán tổ đội. Kế toán không xem phân hệ Thi công nên đọc qua hàm riêng `kt_crew_timesheets`
 * (chỉ số tổng: người, công, giờ tăng ca). Máy không tự sinh công nợ — đơn giá công, khấu trừ là việc của Kế toán.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime, formatNumber } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';
import { KtNav } from './kt-nav';

interface CrewTimesheetRow {
  company_id: string;
  site_code: string;
  site_name: string;
  crew_name: string;
  month: string;
  people: number;
  workdays: number;
  overtime_hours: number;
  confirmed_at: string | null;
}

const thisMonth = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);

export function CrewTimesheetPage() {
  const scope = useCompanyScope();
  const [month, setMonth] = useState(thisMonth());
  const valid = /^\d{4}-\d{2}$/.test(month);
  const q = useQuery<CrewTimesheetRow[], Error>({
    queryKey: ['kt-crew-timesheets', month],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('kt_crew_timesheets', { p_month: `${month}-01` });
      if (error) throw new Error(error.message);
      return (data ?? []) as CrewTimesheetRow[];
    },
    enabled: valid,
  });
  const rows = (q.data ?? []).filter(
    (r) => scope.isAggregate || !scope.companyId || r.company_id === scope.companyId,
  );

  return (
    <>
      <PageHeader
        title="Bảng công tổ đội"
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Bảng công tổ đội' }]}
        description="Bảng công tháng của tổ đội đã được Trưởng phòng Thi công xác nhận — căn cứ thanh toán tổ đội. Hệ thống không tự lập công nợ."
      />
      <KtNav />
      <div className="mb-4 max-w-xs">
        <Field label="Tháng (yyyy-mm)">
          <Input
            value={month}
            inputMode="numeric"
            onChange={(e) => setMonth(e.target.value.trim())}
          />
        </Field>
      </div>
      {q.isLoading ? (
        <TableSkeleton />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message="Tháng này chưa có bảng công tổ đội nào được xác nhận." />
      ) : (
        <div className="overflow-x-auto rounded-card bg-surface p-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-fg-subtle">
                <th className="py-2">Công trình</th>
                <th className="py-2">Tổ đội</th>
                <th className="py-2">Số người</th>
                <th className="py-2">Công</th>
                <th className="py-2">Tăng ca (giờ)</th>
                <th className="py-2">Xác nhận lúc</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.site_code}-${r.crew_name}`} className="border-t border-line-soft">
                  <td className="py-2">
                    {r.site_code} — {r.site_name}
                  </td>
                  <td className="py-2">{r.crew_name}</td>
                  <td className="py-2">{r.people}</td>
                  <td className="py-2">{formatNumber(Number(r.workdays), 1)}</td>
                  <td className="py-2">{formatNumber(Number(r.overtime_hours), 1)}</td>
                  <td className="py-2">{r.confirmed_at ? formatDateTime(r.confirmed_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
