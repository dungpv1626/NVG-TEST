/**
 * «Bảo lãnh và tiền giữ lại» trên tab Tổng quan của hợp đồng đã duyệt / đã ký / đã quyết toán (G3, 0248).
 *
 * Bảo lãnh tạm ứng / thực hiện / bảo hành: ngân hàng, số, số tiền, hiệu lực từ – đến, bản quét, trạng thái.
 * Quét đêm báo người chịu trách nhiệm, Kế toán, Giám đốc Tài chính trước khi hết hạn (số ngày là tham số
 * `kt.guarantee_remind_days`) và khi đã hết hạn. Ghi được: người chịu trách nhiệm / Ban Giám đốc hoặc Kế toán
 * (CSDL quyết, `rls_contract_guarantee_writable`); người khác chỉ xem. Thi công không xem phân hệ Hợp đồng nên
 * không tới được khối này.
 */

import { useRef, useState } from 'react';
import { daysUntil, formatCurrency, formatDate, toMoney, type StatusGroup } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  GUARANTEE_DIRECTION_LABELS,
  GUARANTEE_STATUS_LABELS,
  GUARANTEE_TYPE_LABELS,
  guaranteeScanUrl,
  useCloseGuarantee,
  useContractGuarantees,
  useContractOpenRetention,
  useCreateGuarantee,
  useExtendGuarantee,
  type ContractGuaranteeRecord,
  type GuaranteeStatus,
  type GuaranteeType,
} from '@/hooks/use-contract-guarantees';

const STATUS_GROUP: Record<GuaranteeStatus, StatusGroup> = {
  dang_hieu_luc: 'in_progress',
  het_han: 'overdue',
  da_thu_hoi: 'completed',
  da_giai_toa: 'completed',
};

function todayIso(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function GuaranteeStatusLabel({
  g,
}: {
  g: Pick<ContractGuaranteeRecord, 'status' | 'valid_to'>;
}) {
  const days = g.status === 'dang_hieu_luc' ? daysUntil(g.valid_to) : null;
  const expired = days !== null && days < 0;
  return (
    <StatusWithLabel
      status={expired ? 'overdue' : STATUS_GROUP[g.status]}
      label={expired ? 'Hết hạn' : GUARANTEE_STATUS_LABELS[g.status]}
    />
  );
}

function GuaranteeRow({ g, canWrite }: { g: ContractGuaranteeRecord; canWrite: boolean }) {
  const prompt = usePromptDialog();
  const extend = useExtendGuarantee();
  const close = useCloseGuarantee();
  const [extending, setExtending] = useState(false);
  const [validTo, setValidTo] = useState(g.valid_to);
  const [error, setError] = useState<string | null>(null);
  const open = g.status === 'dang_hieu_luc' || g.status === 'het_han';
  const days = open ? daysUntil(g.valid_to) : null;

  async function closeAs(status: 'da_thu_hoi' | 'da_giai_toa') {
    const note = await prompt.ask({
      title: status === 'da_thu_hoi' ? 'Ghi đã thu hồi bảo lãnh?' : 'Ghi đã giải toả bảo lãnh?',
      label: 'Ghi chú (vd biên bản trả thư bảo lãnh, ngày ngân hàng xác nhận)',
      confirmLabel: status === 'da_thu_hoi' ? 'Ghi đã thu hồi' : 'Ghi đã giải toả',
      required: false,
    });
    if (note === null) return;
    setError(null);
    try {
      await close.mutateAsync({ id: g.id, status, date: todayIso(), note: note.trim() || null });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <li className="px-3 py-2">
      {prompt.dialog}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1">
          <span className="font-medium">{GUARANTEE_TYPE_LABELS[g.guarantee_type]}</span>
          <span className="block text-sm text-fg-subtle">
            {GUARANTEE_DIRECTION_LABELS[g.direction]} · {g.bank_name}
            {g.guarantee_number && <> · số {g.guarantee_number}</>}
          </span>
          <span className="block text-sm text-fg-subtle">
            Hiệu lực {g.valid_from ? `${formatDate(g.valid_from)} – ` : 'đến '}
            {formatDate(g.valid_to)}
            {days !== null && days >= 0 && <> · còn {days} ngày</>}
            {g.closed_date && (
              <>
                {' '}
                · {GUARANTEE_STATUS_LABELS[g.status].toLowerCase()} ngày {formatDate(g.closed_date)}
                {g.close_note && <>: {g.close_note}</>}
              </>
            )}
          </span>
        </span>
        <span className="font-medium tabular-nums">{formatCurrency(g.amount)}</span>
        <GuaranteeStatusLabel g={g} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {g.scan_path && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void guaranteeScanUrl(g.scan_path!).then((url) => url && window.open(url, '_blank'))
            }
          >
            Mở bản quét
          </Button>
        )}
        {canWrite && open && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setExtending((v) => !v)}>
              Gia hạn
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void closeAs('da_thu_hoi')}>
              Ghi đã thu hồi
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void closeAs('da_giai_toa')}>
              Ghi đã giải toả
            </Button>
          </>
        )}
      </div>
      {extending && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Hiệu lực mới đến ngày" required>
            <DateInput value={validTo} onChange={setValidTo} />
          </Field>
          <Button
            size="sm"
            variant="primary"
            disabled={extend.isPending || !validTo}
            onClick={() => {
              setError(null);
              extend.mutate(
                { id: g.id, validTo },
                {
                  onSuccess: () => setExtending(false),
                  onError: (e) => setError(toUserMessage(e, 'edit')),
                },
              );
            }}
          >
            Lưu hạn mới
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-status-overdue">
          {error}
        </p>
      )}
    </li>
  );
}

function AddGuaranteeForm({ contractId, onDone }: { contractId: string; onDone: () => void }) {
  const create = useCreateGuarantee();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<GuaranteeType>('thuc_hien');
  const [bank, setBank] = useState('');
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!bank.trim()) return setError('Vui lòng nhập ngân hàng phát hành.');
    if (toMoney(amount) <= 0n) return setError('Vui lòng nhập số tiền bảo lãnh lớn hơn 0.');
    if (!to) return setError('Vui lòng nhập ngày hết hiệu lực.');
    try {
      await create.mutateAsync({
        contractId,
        guaranteeType: type,
        bankName: bank,
        guaranteeNumber: number || null,
        amount,
        validFrom: from || null,
        validTo: to,
        file,
      });
      onDone();
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="mt-3 grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
      <Field label="Loại bảo lãnh" required>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as GuaranteeType)}
          className="h-10 w-full rounded-field border border-border-strong bg-surface px-3"
        >
          {(Object.keys(GUARANTEE_TYPE_LABELS) as GuaranteeType[]).map((t) => (
            <option key={t} value={t}>
              {GUARANTEE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ngân hàng phát hành" required>
        <Input value={bank} onChange={(e) => setBank(e.target.value)} />
      </Field>
      <Field label="Số bảo lãnh" optional>
        <Input value={number} onChange={(e) => setNumber(e.target.value)} />
      </Field>
      <Field label="Số tiền (đồng)" required>
        <MoneyInput value={amount} onChange={setAmount} />
      </Field>
      <Field label="Hiệu lực từ ngày" optional>
        <DateInput value={from} onChange={setFrom} />
      </Field>
      <Field label="Hiệu lực đến ngày" required>
        <DateInput value={to} onChange={setTo} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          {file ? 'Chọn tệp khác' : 'Chọn bản quét thư bảo lãnh'}
        </Button>
        {file && <span className="text-sm text-fg-subtle">{file.name}</span>}
        <Button variant="primary" onClick={() => void submit()} disabled={create.isPending}>
          Lưu bảo lãnh
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-status-overdue sm:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}

export function ContractGuaranteesCard({
  contractId,
  canWrite,
}: {
  contractId: string;
  canWrite: boolean;
}) {
  const { data: rows = [], isLoading } = useContractGuarantees(contractId);
  const open = useContractOpenRetention(contractId);
  const [adding, setAdding] = useState(false);
  const retention = open.data ? toMoney(open.data.retention_outstanding) : 0n;

  if (isLoading) return null;
  if (!canWrite && rows.length === 0 && retention === 0n) return null;

  return (
    <section
      id="bao-lanh"
      aria-labelledby="bao-lanh-title"
      className="mb-4 rounded-card bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="bao-lanh-title" className="font-semibold">
            Bảo lãnh và tiền giữ lại
          </h3>
          <p className="text-sm text-fg-subtle">
            {retention > 0n
              ? `Chủ đầu tư đang giữ lại ${formatCurrency(retention)} tiền bảo hành — thu hồi khi hết bảo hành / thanh lý.`
              : 'Hệ thống nhắc người chịu trách nhiệm, Kế toán và Giám đốc Tài chính trước khi bảo lãnh hết hạn.'}
          </p>
        </div>
        {canWrite && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Thêm bảo lãnh
          </Button>
        )}
      </div>
      {adding && <AddGuaranteeForm contractId={contractId} onDone={() => setAdding(false)} />}
      {rows.length > 0 ? (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {rows.map((g) => (
            <GuaranteeRow key={g.id} g={g} canWrite={canWrite} />
          ))}
        </ul>
      ) : (
        !adding && (
          <p className="mt-2 text-sm text-fg-subtle">Chưa ghi bảo lãnh nào cho hợp đồng này.</p>
        )
      )}
      {open.data && (open.data.retention_terms ?? []).length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {(open.data.retention_terms ?? []).map((t) => (
            <li key={t.id}>
              Đợt «{t.description}» —{' '}
              {t.amount !== null ? formatCurrency(t.amount) : 'chưa ghi số tiền'}
              {t.due
                ? ', đã tới hạn thu — lập đề nghị thu tiền ở Đợt thu'
                : t.due_date
                  ? `, đến hạn khi hết bảo hành ${formatDate(t.due_date)}`
                  : ', đến hạn khi hết bảo hành (chờ khai bảo hành công trình)'}
            </li>
          ))}
        </ul>
      )}
      {open.data && open.data.retention_items.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {open.data.retention_items.map((it) => (
            <li key={it.id}>
              {it.description} — còn{' '}
              {formatCurrency(toMoney(it.amount) - toMoney(it.settled_amount))}
              {it.due_date
                ? `, hạn thu hồi ${formatDate(it.due_date)}`
                : ', chưa có hạn (chờ khai bảo hành)'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
