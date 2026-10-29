/**
 * Nút "Soạn hợp đồng" đặt trên màn hình Chi tiết của hồ sơ NGUỒN (HD-01).
 *
 * Vì sao ở đây chứ không phải trên danh sách Hợp đồng: Webapp Flow 3.1 bước 5 và 3.2 đều
 * cho người dùng chuyển sang soạn hợp đồng ngay tại chỗ họ đang đứng — lúc khách vừa đồng
 * ý, hoặc lúc vừa biết tin trúng thầu. Bắt họ sang module khác rồi chọn lại hồ sơ nguồn là
 * thêm hai cú nhấp và một cơ hội chọn nhầm.
 *
 * Toàn bộ dữ liệu (khách hàng, tên, giá ĐÃ DUYỆT) do hàm CSDL lấy từ hồ sơ nguồn — màn hình
 * không gửi lên con số nào, đúng PRD Mục 2.3: không nhập lại dữ liệu đã có ở nơi khác.
 *
 * 0243: một cơ hội có tối đa một hợp đồng thiết kế + một hợp đồng thi công, hoặc một hợp đồng trọn
 * gói. Truyền `group` (các hợp đồng đã có của cơ hội) thì nút chỉ mời soạn phạm vi còn trống —
 * «Soạn hợp đồng thiết kế» / «Soạn hợp đồng thi công» — CSDL cũng chặn bằng trigger.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileSignature } from 'lucide-react';
import {
  CONTRACT_SCOPE_KIND_LABELS,
  CONTRACT_SCOPE_KIND_TYPE,
  CONTRACT_TYPES,
  isPayableContract,
  CONTRACT_TYPE_LABELS,
  remainingContractKinds,
  type ContractScopeKind,
  type ContractSourceType,
  type ContractType,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { GroupContractRow } from '@/hooks/use-contract-group';
import { useCreateContractFromSource } from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';

export function DraftContractButton({
  sourceType,
  sourceId,
  defaultType,
  existingContractId,
  group,
  designOnly = false,
}: {
  sourceType: ContractSourceType;
  sourceId: string;
  /** Loại hợp đồng thường gặp của module gọi — thiết kế cho TK, thi công cho DA. */
  defaultType: ContractType;
  /** Hồ sơ đã có hợp đồng thì dẫn thẳng sang đó thay vì mời soạn bản thứ hai. */
  existingContractId?: string | null;
  /** Hợp đồng đã có của cơ hội (0243) — có thì chọn theo phạm vi còn trống thay vì theo loại. */
  group?: readonly GroupContractRow[];
  /** Cơ hội «Chỉ thiết kế»: không còn hợp đồng thi công. */
  designOnly?: boolean;
}) {
  const navigate = useNavigate();
  const canCreate = useCan('HD', 'create');
  const createContract = useCreateContractFromSource();

  const [choosing, setChoosing] = useState(false);
  const [type, setType] = useState<ContractType>(defaultType);
  const kinds = group ? remainingContractKinds(group, designOnly) : null;
  const [kindChoice, setKindChoice] = useState<ContractScopeKind | null>(null);
  const kind: ContractScopeKind | null = kinds
    ? kindChoice && kinds.includes(kindChoice)
      ? kindChoice
      : (kinds.find((k) => k === defaultType) ?? kinds[0] ?? null)
    : null;
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setError(null);
    try {
      const contractId = await createContract.mutateAsync(
        kind
          ? { sourceType, sourceId, type: CONTRACT_SCOPE_KIND_TYPE[kind], scopeKind: kind }
          : { sourceType, sourceId, type },
      );
      void navigate(`/hd/hop-dong/${contractId}`);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  // Theo phạm vi (0243): hết chỗ thì dẫn sang hợp đồng đã có của chính hồ sơ này (nếu có).
  if (kinds && kinds.length === 0) {
    if (!existingContractId) return null;
    return (
      <Button variant="secondary" asChild>
        <Link to={`/hd/hop-dong/${existingContractId}`}>
          <FileSignature className="mr-1 size-4" />
          Mở hợp đồng
        </Link>
      </Button>
    );
  }

  if (!kinds && existingContractId) {
    return (
      <Button variant="secondary" asChild>
        <Link to={`/hd/hop-dong/${existingContractId}`}>
          <FileSignature className="mr-1 size-4" />
          Mở hợp đồng
        </Link>
      </Button>
    );
  }

  // Không có quyền thì KHÔNG hiện nút, chứ không hiện rồi báo lỗi khi bấm (Webapp Flow 6.5).
  if (!canCreate) return null;

  // Còn đúng một phạm vi: nút nói thẳng soạn hợp đồng gì, không bắt chọn.
  const onlyKind = kinds && kinds.length === 1 ? kinds[0]! : null;
  const draftLabel = onlyKind
    ? `Soạn ${CONTRACT_SCOPE_KIND_LABELS[onlyKind].toLowerCase()}`
    : 'Soạn hợp đồng';

  if (!choosing) {
    return (
      <Button variant="secondary" onClick={() => setChoosing(true)}>
        <FileSignature className="mr-1 size-4" />
        {draftLabel}
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-end gap-2">
      {kinds ? (
        !onlyKind && (
          <Field label="Loại hợp đồng">
            <select
              value={kind ?? ''}
              onChange={(e) => setKindChoice(e.target.value as ContractScopeKind)}
              className="h-10 rounded-sm border border-border bg-surface px-3 sm:h-9"
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {CONTRACT_SCOPE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
        )
      ) : (
        <Field label="Loại hợp đồng">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ContractType)}
            className="h-10 rounded-sm border border-border bg-surface px-3 sm:h-9"
          >
            {/* Hồ sơ nguồn (cơ hội, gói thầu, thiết kế) là việc KHÁCH trả tiền cho NVG — loại NVG đi
              mua / thuê / khoán ở đây sẽ in NVG sai bên trên văn bản (0185). */}
            {CONTRACT_TYPES.filter((t) => !isPayableContract(t)).map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Button variant="primary" disabled={createContract.isPending} onClick={() => void draft()}>
        {createContract.isPending ? 'Đang soạn…' : draftLabel}
      </Button>
      <Button variant="secondary" onClick={() => setChoosing(false)}>
        Bỏ qua
      </Button>
      {error && (
        <span role="alert" className="w-full text-status-overdue">
          {error}
        </span>
      )}
    </span>
  );
}
