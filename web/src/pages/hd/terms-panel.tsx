/**
 * Tab Điều khoản của Chi tiết Hợp đồng (HD-02).
 *
 * Bố cục theo TÁM NHÓM mà HD-02 liệt kê, kể cả nhóm chưa có dòng nào — nhìn là biết còn
 * thiếu gì. Danh sách phẳng thì nhóm bị bỏ quên trông giống hệt nhóm không cần dùng, và
 * "để sau đọc lại bản Word" chính là cách những điều khoản này bị bỏ sót ngoài đời.
 *
 * Ba nhóm phạm vi / giá trị / tiến độ thanh toán được đánh dấu bắt buộc vì CSDL chặn trình
 * ký khi thiếu chúng — báo trước ở đây để người dùng không gõ xong mới biết.
 */

import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  BUTTONS,
  CONTRACT_TERM_TYPES,
  CONTRACT_TERM_TYPE_LABELS,
  formatCurrency,
  formatDate,
  type ContractTermType,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import {
  useContractTerms,
  useSaveContractTerm,
  type ContractTermRecord,
} from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';

/** Ba nhóm mà `submit_contract_approval` chặn trình ký nếu thiếu. */
const REQUIRED_TYPES: readonly ContractTermType[] = ['pham_vi', 'gia_tri', 'tien_do_thanh_toan'];

export function TermsPanel({
  contractId,
  companyId,
  readOnly,
}: {
  contractId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: terms } = useContractTerms(contractId);
  const saveTerm = useSaveContractTerm();

  const [addingTo, setAddingTo] = useState<ContractTermType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    percentValue: '',
    dueDate: '',
    notes: '',
  });

  const byType = new Map<ContractTermType, ContractTermRecord[]>();
  for (const term of terms ?? []) {
    const list = byType.get(term.term_type) ?? [];
    list.push(term);
    byType.set(term.term_type, list);
  }

  function startAdding(type: ContractTermType) {
    setForm({ description: '', amount: '', percentValue: '', dueDate: '', notes: '' });
    setError(null);
    setAddingTo(type);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.description.trim()) {
      setError('Vui lòng nhập nội dung điều khoản.');
      return;
    }
    try {
      await saveTerm.mutateAsync({
        contractId,
        companyId,
        values: {
          term_type: addingTo,
          description: form.description.trim(),
          amount: form.amount.trim() || null,
          percent_value: form.percentValue.trim() || null,
          due_date: form.dueDate || null,
          notes: form.notes.trim() || null,
          position: String((byType.get(addingTo!)?.length ?? 0) + 1),
        },
      });
      setAddingTo(null);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function toggleCompleted(term: ContractTermRecord) {
    setError(null);
    try {
      await saveTerm.mutateAsync({
        id: term.id,
        contractId,
        companyId,
        values: { completed_at: term.completed_at ? null : new Date().toISOString() },
      });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {CONTRACT_TERM_TYPES.map((type) => {
        const rows = byType.get(type) ?? [];
        const isMissingRequired = REQUIRED_TYPES.includes(type) && rows.length === 0;

        return (
          <section
            key={type}
            className="rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="font-medium">{CONTRACT_TERM_TYPE_LABELS[type]}</p>
              {isMissingRequired && (
                <span className="inline-flex items-center gap-1 text-status-overdue">
                  <AlertTriangle className="size-4" />
                  Bắt buộc trước khi trình ký
                </span>
              )}
              {!readOnly && (
                <span className="ml-auto">
                  <Button variant="secondary" onClick={() => startAdding(type)}>
                    Thêm điều khoản
                  </Button>
                </span>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="text-fg-subtle">Chưa ghi nhận điều khoản nhóm này.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((term) => (
                  <li key={term.id} className="border-l-2 border-border pl-3">
                    <p className="whitespace-pre-wrap">{term.description}</p>
                    <p className="text-fg-subtle">
                      {term.amount != null && <span>{formatCurrency(term.amount)} · </span>}
                      {term.percent_value && <span>{term.percent_value}% · </span>}
                      {term.due_date ? `Đến hạn ${formatDate(term.due_date)}` : 'Không có mốc hạn'}
                    </p>
                    {term.completed_at ? (
                      <p className="inline-flex items-center gap-1 text-status-completed">
                        <CheckCircle2 className="size-4" />
                        Đã hoàn thành {formatDate(term.completed_at)}
                        {!readOnly && (
                          <button
                            type="button"
                            className="ml-2 underline"
                            onClick={() => void toggleCompleted(term)}
                          >
                            Bỏ đánh dấu
                          </button>
                        )}
                      </p>
                    ) : (
                      !readOnly && (
                        <button
                          type="button"
                          className="text-brand underline"
                          onClick={() => void toggleCompleted(term)}
                        >
                          Đánh dấu đã hoàn thành
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}

            {addingTo === type && (
              <form onSubmit={submit} noValidate className="mt-3 border-t border-border pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nội dung điều khoản" required className="sm:col-span-2">
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                      className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                      autoFocus
                    />
                  </Field>

                  <Field label="Giá trị" hint="Đơn vị đồng.">
                    <MoneyInput
                      value={form.amount}
                      onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
                    />
                  </Field>

                  <Field label="Tỷ lệ phần trăm">
                    <Input
                      value={form.percentValue}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          percentValue: e.target.value.replace(/[^\d.]/g, ''),
                        }))
                      }
                      inputMode="decimal"
                    />
                  </Field>

                  <Field label="Ngày đến hạn" hint="Nguồn của cảnh báo khoản sắp đến hạn.">
                    <DateInput
                      value={form.dueDate}
                      onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))}
                    />
                  </Field>

                  <Field label="Ghi chú">
                    <Input
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </Field>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button type="submit" variant="primary" disabled={saveTerm.isPending}>
                    {BUTTONS.save}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setAddingTo(null)}>
                    {BUTTONS.cancel}
                  </Button>
                </div>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
