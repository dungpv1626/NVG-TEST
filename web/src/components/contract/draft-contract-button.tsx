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
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSignature } from 'lucide-react';
import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  type ContractSourceType,
  type ContractType,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useCreateContractFromSource } from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';

export function DraftContractButton({
  sourceType,
  sourceId,
  defaultType,
  existingContractId,
}: {
  sourceType: ContractSourceType;
  sourceId: string;
  /** Loại hợp đồng thường gặp của module gọi — thiết kế cho TK, thi công cho DA. */
  defaultType: ContractType;
  /** Hồ sơ đã có hợp đồng thì dẫn thẳng sang đó thay vì mời soạn bản thứ hai. */
  existingContractId?: string | null;
}) {
  const navigate = useNavigate();
  const canCreate = useCan('HD', 'create');
  const createContract = useCreateContractFromSource();

  const [choosing, setChoosing] = useState(false);
  const [type, setType] = useState<ContractType>(defaultType);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setError(null);
    try {
      const contractId = await createContract.mutateAsync({ sourceType, sourceId, type });
      navigate(`/hd/hop-dong/${contractId}`);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  if (existingContractId) {
    return (
      <Button variant="secondary" onClick={() => navigate(`/hd/hop-dong/${existingContractId}`)}>
        <FileSignature className="mr-1 size-4" />
        Mở hợp đồng
      </Button>
    );
  }

  // Không có quyền thì KHÔNG hiện nút, chứ không hiện rồi báo lỗi khi bấm (Webapp Flow 6.5).
  if (!canCreate) return null;

  if (!choosing) {
    return (
      <Button variant="secondary" onClick={() => setChoosing(true)}>
        <FileSignature className="mr-1 size-4" />
        Soạn hợp đồng
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-end gap-2">
      <Field label="Loại hợp đồng">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ContractType)}
          className="h-10 rounded-sm border border-border bg-surface px-3 sm:h-9"
        >
          {CONTRACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTRACT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Button variant="primary" disabled={createContract.isPending} onClick={() => void draft()}>
        {createContract.isPending ? 'Đang soạn…' : 'Soạn hợp đồng'}
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
