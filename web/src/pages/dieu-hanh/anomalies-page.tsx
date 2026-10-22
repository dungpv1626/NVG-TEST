/**
 * Danh sách bất thường — cho Kiểm soát nội bộ và Ban Giám đốc (Đợt 3 — 3E, migration 0199).
 *
 * Tiêu chí của đợt: «KSNB mở danh sách bất thường thấy đúng hồ sơ». Mỗi nhóm là một DẤU HIỆU quy
 * trình bị đi tắt — không kết luận ai sai; bấm dòng mở hồ sơ để xem. Hai nhóm dựa vào ngưỡng NVG
 * chưa quyết (duyệt sát hạn mức, biên bản lâu chưa ký) ghi «Chưa cấu hình ngưỡng» thay vì tự đặt.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDate } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useParameterNumber } from '@/hooks/use-parameter-number';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

type Kind =
  | 'bo_qua_khao_sat'
  | 'duyet_sat_han_muc'
  | 'phat_sinh_khan_cap'
  | 'chenh_lech_kiem_ke'
  | 'moc_tra_lai'
  | 'bien_ban_chua_ky';

interface AnomalyRow {
  kind: Kind;
  company_id: string;
  company_code: string;
  entity_type: string;
  entity_id: string;
  code: string | null;
  title: string;
  detail: string;
  occurred_at: string | null;
  link: string;
}

const KINDS: { kind: Kind; label: string; param?: string }[] = [
  { kind: 'bo_qua_khao_sat', label: 'Bỏ qua khảo sát' },
  { kind: 'duyet_sat_han_muc', label: 'Duyệt sát hạn mức', param: 'ksnb.near_limit_percent' },
  { kind: 'phat_sinh_khan_cap', label: 'Phát sinh khẩn cấp' },
  { kind: 'chenh_lech_kiem_ke', label: 'Chênh lệch kiểm kê' },
  { kind: 'moc_tra_lai', label: 'Mốc bị trả lại / không đạt' },
  {
    kind: 'bien_ban_chua_ky',
    label: 'Biên bản lâu chưa ký',
    param: 'ksnb.acceptance_unsigned_days',
  },
];

type Filter = 'tat_ca' | Kind;

function ParamNote({ param, kind }: { param: string; kind: Kind }) {
  const { data, isLoading } = useParameterNumber(param);
  if (isLoading) return null;
  if (data == null)
    return (
      <span className="text-sm text-fg-subtle">
        Chưa cấu hình ngưỡng — chưa liệt kê. Quản trị đặt ở Tham số hệ thống.
      </span>
    );
  return (
    <span className="text-sm text-fg-subtle">
      {kind === 'duyet_sat_han_muc'
        ? `Ngưỡng: từ ${data}% hạn mức người duyệt.`
        : `Ngưỡng: lập quá ${data} ngày chưa ký.`}
    </span>
  );
}

export function AnomaliesPage() {
  const scope = useCompanyScope();
  const [filter, setFilter] = useState<Filter>('tat_ca');
  const { data, isLoading, error, refetch } = useQuery<AnomalyRow[], Error>({
    queryKey: ['ksnb-anomalies', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ksnb_anomalies', {
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as AnomalyRow[];
    },
    enabled: scope.isReady,
  });

  const all = data ?? [];
  const count = (k: Kind) => all.filter((r) => r.kind === k).length;
  const rows = filter === 'tat_ca' ? all : all.filter((r) => r.kind === filter);
  const label = (k: Kind) => KINDS.find((x) => x.kind === k)!.label;

  return (
    <>
      <PageHeader
        title="Danh sách bất thường"
        breadcrumbs={[
          { label: 'Tổng quan điều hành', to: '/tong-quan' },
          { label: 'Danh sách bất thường' },
        ]}
        description="Các chỗ quy trình bị đi tắt hoặc có dấu hiệu cần kiểm tra. Danh sách chỉ đưa hồ sơ ra để xem, không kết luận sai phạm."
      />
      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <>
          <ul className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {KINDS.map((k) => (
              <li key={k.kind}>
                <button
                  type="button"
                  onClick={() => setFilter(filter === k.kind ? 'tat_ca' : k.kind)}
                  aria-pressed={filter === k.kind}
                  className={
                    'flex min-h-10 w-full flex-col items-start rounded-lg border bg-surface p-3 text-left ' +
                    (filter === k.kind ? 'border-brand' : 'border-border')
                  }
                >
                  <span className="flex w-full items-baseline gap-2">
                    <span className="font-medium">{k.label}</span>
                    <span className="ms-auto text-lg font-semibold tabular-nums">
                      {count(k.kind)}
                    </span>
                  </span>
                  {k.param && <ParamNote param={k.param} kind={k.kind} />}
                </button>
              </li>
            ))}
          </ul>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {filter === 'tat_ca' ? (
              <span className="text-fg-subtle">
                Tất cả {all.length} hồ sơ — bấm một nhóm ở trên để lọc.
              </span>
            ) : (
              <>
                <span>Đang xem nhóm «{label(filter)}».</span>
                <Button size="sm" variant="secondary" onClick={() => setFilter('tat_ca')}>
                  Xem tất cả
                </Button>
              </>
            )}
          </p>
          {rows.length === 0 ? (
            <EmptyState message="Không có hồ sơ nào trong mục này." />
          ) : (
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li
                  key={`${r.kind}-${r.entity_id}-${i}`}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xs text-fg-subtle">{label(r.kind)}</span>
                    <Link to={r.link} className="font-medium text-brand hover:underline">
                      {r.code ? `${r.code} — ` : ''}
                      {r.title}
                    </Link>
                    <span className="ms-auto text-xs text-fg-subtle">
                      {r.company_code}
                      {r.occurred_at && <> · {formatDate(r.occurred_at)}</>}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{r.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
