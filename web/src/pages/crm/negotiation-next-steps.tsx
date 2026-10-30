/**
 * Bước Đàm phán của cơ hội: ba việc còn lại tới «Ký hợp đồng», đặt trong thẻ «Bước tiếp theo».
 *
 * Anh Dũng 29/10/2026: đàm phán xong người dùng phải tự để ý nút «Soạn hợp đồng» trên đầu trang —
 * thẻ bước tiếp theo chỉ nói «Tự chuyển khi hợp đồng liên kết được ghi nhận đã ký», không nói phải
 * làm gì để có hợp đồng ấy. Khối này nói ba việc theo thứ tự, việc nào đang ở đâu (đọc bước của
 * hợp đồng thật), và để nút soạn / mở hợp đồng ngay tại việc đang làm.
 *
 * 0243: một cơ hội có thể có HAI hợp đồng — thiết kế trước, thi công sau (quy trình NVO, anh Bùi
 * Văn Thi) — hoặc một hợp đồng trọn gói. Hợp đồng thiết kế ký xong thì cơ hội vẫn mở: khối nói
 * «Đã ký hợp đồng thiết kế» rồi dẫn sang báo giá + hợp đồng thi công.
 */

import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { CONTRACT_SCOPE_KIND_LABELS, type ContractStage, type ContractType } from '@nvg/shared';
import { DraftContractButton } from '@/components/contract/draft-contract-button';
import type { GroupContractRow } from '@/hooks/use-contract-group';
import { cn } from '@/lib/utils';

/** Việc thứ mấy đang làm (0, 1, 2), hoặc 3 khi đã ký. */
export function negotiationStepIndex(stage: ContractStage | null): number {
  if (!stage || stage === 'nhap' || stage === 'huy') return 0;
  if (stage === 'cho_duyet') return 1;
  if (stage === 'da_duyet') return 2;
  return 3;
}

const isSigned = (stage: ContractStage) => stage === 'da_ky' || stage === 'hoan_thanh';

/**
 * Hợp đồng khối này đang theo dõi: hợp đồng thi công / trọn gói nếu đã có; không thì hợp đồng
 * thiết kế chưa ký. Hợp đồng thiết kế đã ký (cơ hội chưa «Chỉ thiết kế») thì việc tiếp theo là
 * hợp đồng thi công — `target` rỗng, `designSigned` mang hợp đồng thiết kế.
 */
export function negotiationTarget(
  group: readonly GroupContractRow[],
  designOnly: boolean,
): { target: GroupContractRow | null; designSigned: GroupContractRow | null } {
  const build = group.find((c) => c.scope_kind === 'thi_cong' || c.scope_kind === 'tron_goi');
  const design = group.find((c) => c.scope_kind === 'thiet_ke') ?? null;
  const other = group.find((c) => c.scope_kind === null);
  if (build)
    return { target: build, designSigned: design && isSigned(design.stage) ? design : null };
  if (other) return { target: other, designSigned: null };
  if (design && (!isSigned(design.stage) || designOnly))
    return { target: design, designSigned: null };
  return { target: null, designSigned: design };
}

export function NegotiationNextSteps({
  opportunityId,
  contractId,
  group,
  designOnly,
  canEdit,
  defaultContractType = 'thi_cong',
}: {
  opportunityId: string;
  /** Hợp đồng soạn thẳng từ cơ hội (mới nhất) — nút «Mở hợp đồng» khi hết chỗ soạn. */
  contractId: string | null | undefined;
  /** Mọi hợp đồng chưa hủy của cơ hội, kể cả qua gói thầu / hồ sơ thiết kế (0243). */
  group: readonly GroupContractRow[];
  designOnly: boolean;
  canEdit: boolean;
  /** Loại hợp đồng mời soạn trước — NVS là hợp đồng cho thuê. */
  defaultContractType?: ContractType;
}) {
  const { target, designSigned } = negotiationTarget(group, designOnly);
  const targetLabel = target?.scope_kind
    ? CONTRACT_SCOPE_KIND_LABELS[target.scope_kind].toLowerCase()
    : designSigned
      ? 'hợp đồng thi công'
      : 'hợp đồng';
  const current = negotiationStepIndex(target?.stage ?? null);
  const afterSign =
    target?.scope_kind === 'thiet_ke' && !designOnly
      ? 'Ghi nhận xong cơ hội vẫn mở để báo giá và ký hợp đồng thi công.'
      : 'Ghi nhận xong cơ hội tự sang «Ký hợp đồng».';
  const steps = [
    {
      label: designSigned
        ? 'Thiết kế được khách duyệt thì báo giá thi công, khách đồng ý thì soạn hợp đồng thi công và gửi phê duyệt'
        : `Khách đồng ý giá thì soạn ${targetLabel} và gửi phê duyệt`,
      hint: designSigned
        ? 'Lập phiên bản báo giá mới ở tab Báo giá cho phần thi công. Máy lấy sẵn khách hàng và giá đã duyệt.'
        : 'Máy lấy sẵn khách hàng và giá đã duyệt. Khách muốn đổi giá thì lập phiên bản báo giá mới.',
    },
    { label: `Ban Giám đốc phê duyệt ${targetLabel}`, hint: null },
    {
      label: `Ký với khách, tải bản đã ký lên và ghi nhận đã ký`,
      hint: afterSign,
    },
  ];

  return (
    <div className="mt-3 rounded-field bg-surface p-3 text-ink">
      {designSigned && (
        <p className="mb-2 flex gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-shell" aria-hidden />
          <span>
            Đã ký hợp đồng thiết kế{' '}
            {designSigned.contract_id ? (
              <Link
                to={`/hd/hop-dong/${designSigned.contract_id}`}
                className="font-mono font-medium text-brand underline-offset-2 hover:underline"
              >
                {designSigned.code}
              </Link>
            ) : (
              <span className="font-mono">{designSigned.code}</span>
            )}
            . Cơ hội vẫn mở cho tới khi ký hợp đồng thi công — khách chỉ thuê thiết kế thì bấm «Chỉ
            thiết kế».
          </span>
        </p>
      )}
      <p className="text-xs font-semibold text-ink-subtle">Việc còn lại tới ký {targetLabel}</p>
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
                {state === 'current' && i === 0 && !target && canEdit && (
                  <div className="mt-2">
                    <DraftContractButton
                      sourceType="opportunities"
                      sourceId={opportunityId}
                      defaultType={defaultContractType}
                      existingContractId={contractId}
                      group={group}
                      designOnly={designOnly}
                    />
                  </div>
                )}
                {state === 'current' && target && target.contract_id && (
                  <Link
                    to={`/hd/hop-dong/${target.contract_id}`}
                    className="mt-1 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Mở hợp đồng {target.code}
                  </Link>
                )}
                {state === 'current' && target && !target.contract_id && (
                  <p className="mt-1 text-xs text-ink-subtle">
                    Hợp đồng {target.code} lập từ gói thầu hoặc hồ sơ thiết kế — xem ở «Chuỗi hồ
                    sơ».
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
