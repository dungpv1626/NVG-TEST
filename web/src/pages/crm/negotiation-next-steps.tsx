/**
 * Bước Đàm phán của cơ hội: ba việc còn lại tới «Ký hợp đồng», đặt trong thẻ «Bước tiếp theo».
 *
 * Anh Dũng 29/10/2026: đàm phán xong người dùng phải tự để ý nút «Soạn hợp đồng» trên đầu trang —
 * thẻ bước tiếp theo chỉ nói «Tự chuyển khi hợp đồng liên kết được ghi nhận đã ký», không nói phải
 * làm gì để có hợp đồng ấy. Khối này nói ba việc theo thứ tự, việc nào đang ở đâu (đọc bước của
 * hợp đồng thật), và để nút soạn / mở hợp đồng ngay tại việc đang làm.
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import type { ContractStage } from '@nvg/shared';
import { DraftContractButton } from '@/components/contract/draft-contract-button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface ContractBrief {
  id: string;
  code: string;
  stage: ContractStage;
}

function useContractBrief(contractId: string | null | undefined) {
  return useQuery<ContractBrief | null, Error>({
    queryKey: ['contracts', 'brief', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, code, stage')
        .eq('id', contractId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as ContractBrief | null) ?? null;
    },
    enabled: Boolean(contractId),
  });
}

/** Việc thứ mấy đang làm (0, 1, 2), hoặc 3 khi đã ký. */
export function negotiationStepIndex(stage: ContractStage | null): number {
  if (!stage || stage === 'nhap' || stage === 'huy') return 0;
  if (stage === 'cho_duyet') return 1;
  if (stage === 'da_duyet') return 2;
  return 3;
}

export function NegotiationNextSteps({
  opportunityId,
  contractId,
  hasContract,
  canEdit,
}: {
  opportunityId: string;
  contractId: string | null | undefined;
  /** Cơ hội đã có hợp đồng (kể cả hợp đồng sinh từ gói thầu / hồ sơ thiết kế của nó). */
  hasContract: boolean | null | undefined;
  canEdit: boolean;
}) {
  const { data: contract } = useContractBrief(contractId);

  // Hợp đồng sinh từ gói thầu / hồ sơ thiết kế: không mời soạn bản thứ hai (0159).
  if (!contractId && hasContract) {
    return (
      <p className="mt-3 rounded-field bg-surface p-3 text-sm text-ink">
        Cơ hội đã có hợp đồng lập từ gói thầu hoặc hồ sơ thiết kế — mở ở «Chuỗi hồ sơ».
      </p>
    );
  }

  const current = negotiationStepIndex(contract?.stage ?? null);
  const steps = [
    {
      label: 'Khách đồng ý giá thì soạn hợp đồng và gửi phê duyệt',
      hint: 'Máy lấy sẵn khách hàng và giá đã duyệt. Khách muốn đổi giá thì lập phiên bản báo giá mới.',
    },
    { label: 'Ban Giám đốc phê duyệt hợp đồng', hint: null },
    {
      label: 'Ký với khách, tải bản đã ký lên và ghi nhận đã ký',
      hint: 'Ghi nhận xong cơ hội tự sang «Ký hợp đồng».',
    },
  ];

  return (
    <div className="mt-3 rounded-field bg-surface p-3 text-ink">
      <p className="text-xs font-semibold text-ink-subtle">Việc còn lại tới ký hợp đồng</p>
      <ol className="mt-2 space-y-2">
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={s.label} className="flex gap-2 text-sm">
              {state === 'done' && (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-shell" aria-hidden />
              )}
              {state === 'current' && (
                <CircleDot className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              )}
              {state === 'todo' && (
                <Circle className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
              )}
              <div className="min-w-0">
                <p
                  className={cn(
                    state === 'current' && 'font-semibold',
                    state === 'done' && 'text-ink-subtle',
                  )}
                >
                  {i + 1}. {s.label}
                  <span className="sr-only">
                    {state === 'done' ? ' — đã xong' : state === 'current' ? ' — đang làm' : ''}
                  </span>
                </p>
                {state === 'current' && s.hint && (
                  <p className="text-xs text-ink-subtle">{s.hint}</p>
                )}
                {state === 'current' && i === 0 && !contractId && canEdit && (
                  <div className="mt-2">
                    <DraftContractButton
                      sourceType="opportunities"
                      sourceId={opportunityId}
                      defaultType="thi_cong"
                    />
                  </div>
                )}
                {state === 'current' && contract && (
                  <Link
                    to={`/hd/hop-dong/${contract.id}`}
                    className="mt-1 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Mở hợp đồng {contract.code}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
