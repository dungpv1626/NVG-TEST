/**
 * «Có thể đang tính trùng» trên trang Dòng tiền theo tuần (0227).
 *
 * Công nợ phải thu gắn hợp đồng mà chưa chọn đợt thu, trong khi hợp đồng còn đợt thu đang tính ở dòng tiền: máy không biết
 * công nợ ấy có phải chính một đợt không, nên KHÔNG tự gắn (đoán) — liệt kê ở đây để Kế toán chọn đợt. Chọn xong đợt rời
 * dòng tiền, công nợ còn lại một lần.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { COLLECTION_TERM_TYPES, formatCurrency, formatDate } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { useContractTerms } from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

interface UnlinkedReceivable {
  receivable_id: string;
  receivable_code: string | null;
  contract_id: string;
  contract_code: string;
  amount: number | string;
}

const SELECT_CLASS =
  'h-9 min-w-0 rounded-field border border-border-strong bg-surface px-2 text-sm text-ink';

export function useUnlinkedReceivables() {
  const scope = useCompanyScope();
  return useQuery<UnlinkedReceivable[], Error>({
    queryKey: ['cash-forecast-unlinked', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cash_flow_unlinked_receivables', {
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as UnlinkedReceivable[];
    },
    enabled: scope.isReady,
  });
}

export function UnlinkedReceivables() {
  const { data } = useUnlinkedReceivables();
  if (!data || data.length === 0) return null;
  return (
    <section
      aria-labelledby="co-the-trung"
      className="rounded-lg border border-status-pending bg-status-pending-bg p-4"
    >
      <h2 id="co-the-trung" className="font-semibold">
        {data.length} khoản phải thu có thể đang tính trùng
      </h2>
      <p className="mt-1 text-sm">
        Các khoản này gắn hợp đồng nhưng chưa chọn đợt thu, trong khi hợp đồng còn đợt thu đang tính
        ở bảng dưới. Nếu khoản là một đợt của hợp đồng, chọn đợt ấy để dòng tiền chỉ tính một lần.
      </p>
      <ul className="mt-3 space-y-2">
        {data.map((r) => (
          <UnlinkedRow key={r.receivable_id} row={r} />
        ))}
      </ul>
    </section>
  );
}

function UnlinkedRow({ row }: { row: UnlinkedReceivable }) {
  const canEdit = useCan('KT', 'edit');
  const queryClient = useQueryClient();
  const { data: terms } = useContractTerms(row.contract_id);
  const [termId, setTermId] = useState('');
  const options = (terms ?? []).filter(
    (t) => COLLECTION_TERM_TYPES.includes(t.term_type) && !t.completed_at,
  );
  const link = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('receivables_payables')
        .update({ contract_term_id: id })
        .eq('id', row.receivable_id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cash-forecast-unlinked'] });
      void queryClient.invalidateQueries({ queryKey: ['cash-forecast-items'] });
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
    },
  });

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md bg-surface p-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{row.receivable_code ?? 'Khoản phải thu'}</span> · hợp đồng{' '}
        <Link
          to={`/hd/hop-dong/${row.contract_id}`}
          className="font-medium text-brand hover:underline"
        >
          {row.contract_code}
        </Link>{' '}
        · còn thu {formatCurrency(row.amount)}
      </span>
      {canEdit && (
        <>
          <select
            aria-label={`Đợt thu cho ${row.receivable_code ?? 'khoản phải thu'}`}
            className={SELECT_CLASS}
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
          >
            <option value="">Chọn đợt thu</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.description}
                {t.due_date ? ` — hạn ${formatDate(t.due_date)}` : ''}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!termId || link.isPending}
            onClick={() => link.mutate(termId)}
          >
            {link.isPending ? 'Đang lưu…' : 'Gắn đợt'}
          </Button>
        </>
      )}
      {link.isError && (
        <p className="w-full text-status-overdue">{toUserMessage(link.error, 'edit')}</p>
      )}
    </li>
  );
}
