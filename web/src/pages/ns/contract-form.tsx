/**
 * Lập hợp đồng lao động (NS-07) — biểu mẫu trong tab Hợp đồng của hồ sơ nhân sự.
 *
 * Hợp đồng mới thường THAY một hợp đồng đang hiệu lực (thử việc → chính thức, gia hạn). Ô
 * «Kết thúc hợp đồng đang hiệu lực» bật sẵn khi có hợp đồng như vậy: hai hợp đồng cùng hiệu lực
 * cho một người là thứ HCNS phải tự nhớ đi sửa, và thường không ai nhớ.
 *
 * Hợp đồng không xác định thời hạn không có ngày kết thúc; các loại khác bắt buộc có — thiếu
 * ngày kết thúc thì hệ thống không nhắc hạn hợp đồng được.
 */

import { useState } from 'react';
import {
  EMPLOYMENT_CONTRACT_TYPES,
  EMPLOYMENT_CONTRACT_TYPE_LABELS,
  INSURANCE_STATUS_LABELS,
  type EmploymentContractType,
  type InsuranceStatus,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCreateEmploymentContract,
  type EmployeeRecord,
  type EmploymentContractRecord,
} from '@/hooks/use-hr';

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export function EmploymentContractForm({
  employee,
  activeContracts,
  defaultType,
  onDone,
}: {
  employee: EmployeeRecord;
  activeContracts: EmploymentContractRecord[];
  defaultType?: EmploymentContractType;
  onDone: () => void;
}) {
  const create = useCreateEmploymentContract();
  const [type, setType] = useState<EmploymentContractType>(
    defaultType ?? (employee.status === 'thu_viec' ? 'thu_viec' : 'xac_dinh_han'),
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [signedDate, setSignedDate] = useState('');
  const [salary, setSalary] = useState('');
  const [insurance, setInsurance] = useState<InsuranceStatus>(
    type === 'thu_viec' ? 'chua_tham_gia' : 'dang_tham_gia',
  );
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [replaceActive, setReplaceActive] = useState(activeContracts.length > 0);
  const [error, setError] = useState<string | null>(null);

  const needsEnd = type !== 'khong_xac_dinh_han';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!startDate) {
      setError('Chưa chọn ngày bắt đầu hiệu lực.');
      return;
    }
    if (needsEnd && !endDate) {
      setError('Chưa chọn ngày kết thúc. Chỉ hợp đồng không xác định thời hạn mới để trống.');
      return;
    }
    if (needsEnd && endDate < startDate) {
      setError('Ngày kết thúc không được trước ngày bắt đầu.');
      return;
    }
    try {
      await create.mutateAsync({
        companyId: employee.company_id,
        employeeId: employee.id,
        type,
        startDate,
        endDate: needsEnd ? endDate : null,
        signedDate: signedDate || null,
        salaryAmount: salary || null,
        insuranceStatus: insurance,
        insuranceNumber: insuranceNumber || null,
        replacesContractIds: replaceActive ? activeContracts.map((c) => c.id) : [],
      });
      onDone();
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-3 rounded border border-border bg-surface p-4"
      aria-label="Lập hợp đồng lao động"
    >
      <h3 className="font-semibold">Hợp đồng lao động mới</h3>
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Loại hợp đồng" required>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EmploymentContractType)}
            className={SELECT_CLASS}
          >
            {EMPLOYMENT_CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngày ký">
          <DateInput value={signedDate} onChange={setSignedDate} />
        </Field>
        <Field label="Hiệu lực từ ngày" required>
          <DateInput value={startDate} onChange={setStartDate} required />
        </Field>
        {needsEnd && (
          <Field label="Đến ngày" required>
            <DateInput value={endDate} onChange={setEndDate} min={startDate || undefined} />
          </Field>
        )}
        <Field
          label="Lương ghi trên hợp đồng (đồng)"
          hint="Dữ liệu hạn chế: không hiện lại trên màn hình sau khi lưu."
        >
          <MoneyInput value={salary} onChange={setSalary} />
        </Field>
        <Field label="Bảo hiểm xã hội">
          <select
            value={insurance}
            onChange={(e) => setInsurance(e.target.value as InsuranceStatus)}
            className={SELECT_CLASS}
          >
            {(Object.keys(INSURANCE_STATUS_LABELS) as InsuranceStatus[]).map((s) => (
              <option key={s} value={s}>
                {INSURANCE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        {insurance === 'dang_tham_gia' && (
          <Field label="Số sổ bảo hiểm">
            <Input value={insuranceNumber} onChange={(e) => setInsuranceNumber(e.target.value)} />
          </Field>
        )}
      </div>
      {activeContracts.length > 0 && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={replaceActive}
            onChange={(e) => setReplaceActive(e.target.checked)}
          />
          <span>
            Kết thúc hợp đồng đang hiệu lực (
            {activeContracts.map((c) => EMPLOYMENT_CONTRACT_TYPE_LABELS[c.type]).join(', ')}) khi
            hợp đồng mới được lưu
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? 'Đang lưu…' : 'Lưu hợp đồng'}
        </Button>
        <Button type="button" variant="subtle" onClick={onDone}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
