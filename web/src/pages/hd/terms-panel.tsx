/**
 * Khối Điều khoản của tab «Soạn hợp đồng» (HD-02).
 *
 * Bố cục theo TÁM NHÓM mà HD-02 liệt kê, kể cả nhóm chưa có dòng nào — nhìn là biết còn
 * thiếu gì. Danh sách phẳng thì nhóm bị bỏ quên trông giống hệt nhóm không cần dùng, và
 * "để sau đọc lại bản Word" chính là cách những điều khoản này bị bỏ sót ngoài đời.
 *
 * Ba nhóm phạm vi / giá trị / tiến độ thanh toán được đánh dấu bắt buộc vì CSDL chặn trình
 * ký khi thiếu chúng — báo trước ở đây để người dùng không gõ xong mới biết.
 *
 * Mỗi nhóm chỉ hỏi đúng ô nó dùng (`TERM_FORMS`): trước đây nhóm nào cũng có Giá trị / Tỷ lệ /
 * Ngày đến hạn, người dùng ghi 30% vào Phạm vi công việc và số đó in luôn vào văn bản (anh Dũng
 * chạy thử 21/10/2026). Dòng ghi nhầm sửa / xoá được khi hợp đồng còn Nháp.
 */

import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  BUTTONS,
  CONTRACT_REQUIRED_TERM_TYPES,
  CONTRACT_TERM_TYPES,
  CONTRACT_TERM_TYPE_LABELS,
  formatCurrency,
  formatDate,
  suggestContractTerms,
  type ContractPriceForm,
  type ContractTermType,
  type ContractType,
  type MoneyValue,
  type TermSuggestion,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import {
  useContractTerms,
  useDeleteContractTerm,
  useSaveContractTerm,
  type ContractTermRecord,
} from '@/hooks/use-contracts';
import { rankTemplates, useTemplatesForContract } from '@/hooks/use-contract-templates';
import { toUserMessage } from '@/hooks/use-error-message';
import { useContractTermSources } from '@/hooks/use-quotes';

interface TermForm {
  /** Ô số tiền (đồng). */
  amount?: string;
  /** Ô tỷ lệ % — có ô số tiền thì máy tính sẵn số tiền theo giá trị hợp đồng. */
  percent?: string;
  /** Ô ngày — nhãn riêng từng nhóm. */
  due?: string;
  placeholder: string;
  hint: string;
}

const TERM_FORMS: Record<ContractTermType, TermForm> = {
  pham_vi: {
    placeholder: 'Thi công phần thô và hoàn thiện nhà 3 tầng theo bản vẽ thiết kế đã duyệt',
    hint: 'Mỗi hạng mục một dòng. In vào điều «Phạm vi công việc».',
  },
  gia_tri: {
    amount: 'Số tiền',
    placeholder: 'Giá trị hợp đồng trọn gói, đã gồm thuế GTGT',
    hint: 'Thường một dòng. Số tiền là giá trị đã gồm thuế như ở «Thông tin in lên văn bản».',
  },
  tien_do_thanh_toan: {
    percent: 'Tỷ lệ (%)',
    amount: 'Số tiền',
    due: 'Hạn thanh toán',
    placeholder: 'Đợt 1 — tạm ứng khi ký hợp đồng',
    hint: 'Mỗi đợt một dòng. Ghi tỷ lệ thì máy tự tính số tiền theo giá trị hợp đồng; hạn là nguồn của nhắc khoản sắp đến hạn.',
  },
  tam_ung: {
    percent: 'Tỷ lệ (%)',
    amount: 'Số tiền',
    due: 'Hạn tạm ứng',
    placeholder: 'Tạm ứng 30% giá trị hợp đồng trong 5 ngày kể từ ngày ký',
    hint: 'Không bắt buộc.',
  },
  bao_lanh: {
    percent: 'Tỷ lệ (%)',
    amount: 'Số tiền',
    due: 'Hết hiệu lực',
    placeholder: 'Bảo lãnh thực hiện hợp đồng 5% giá trị hợp đồng',
    hint: 'Không bắt buộc. Mỗi loại bảo lãnh (thực hiện hợp đồng, tạm ứng, bảo hành) một dòng.',
  },
  phat: {
    percent: 'Mức phạt (%)',
    placeholder: 'Chậm tiến độ: phạt 0,1% giá trị phần việc chậm cho mỗi ngày',
    hint: 'Không bắt buộc.',
  },
  bao_hanh: {
    percent: 'Giữ lại (%)',
    amount: 'Số tiền giữ lại',
    placeholder: 'Bảo hành kết cấu 5 năm, hoàn thiện 12 tháng kể từ ngày bàn giao',
    hint: 'Không bắt buộc. Tỷ lệ / số tiền là phần giữ lại bảo hành, nếu có.',
  },
  quyet_toan: {
    placeholder: 'Quyết toán theo khối lượng thực tế nghiệm thu, trong 30 ngày kể từ ngày bàn giao',
    hint: 'Không bắt buộc.',
  },
};

const EMPTY_FORM = { description: '', amount: '', percentValue: '', dueDate: '', notes: '' };

/** Số tiền = tỷ lệ × giá trị hợp đồng, làm tròn tới đồng; `null` khi chưa đủ số để tính. */
function amountFromPercent(percent: string, contractValue: MoneyValue | null): string | null {
  const p = Number(percent.replace(',', '.'));
  if (!contractValue || !Number.isFinite(p) || p <= 0) return null;
  // Nhân trên bigint với tỷ lệ phần vạn để không mất số lẻ của giá trị lớn.
  const basisPoints = BigInt(Math.round(p * 100));
  return ((BigInt(contractValue) * basisPoints + 5000n) / 10000n).toString();
}

export function TermsPanel({
  contractId,
  companyId,
  readOnly,
  contractValue = null,
  contractType,
  priceForm = null,
  opportunityId = null,
}: {
  contractId: string;
  companyId: string;
  readOnly: boolean;
  /** Loại + hình thức giá — chọn mẫu Word giống cột bên phải để gợi ý các đợt thanh toán. */
  contractType?: ContractType;
  priceForm?: ContractPriceForm | null;
  /** Giá trị hợp đồng — để tính số tiền từ tỷ lệ. */
  contractValue?: MoneyValue | null;
  /** Cơ hội nguồn — có thì máy gợi ý Phạm vi / Giá trị từ báo giá và khảo sát. */
  opportunityId?: string | null;
}) {
  const { data: terms } = useContractTerms(contractId);
  const sources = useContractTermSources(readOnly ? null : opportunityId);
  const suggestions: Partial<Record<ContractTermType, TermSuggestion | null>> = sources.data
    ? suggestContractTerms(sources.data.quote, sources.data.survey)
    : {};
  const saveTerm = useSaveContractTerm();
  const deleteTerm = useDeleteContractTerm();
  const templates = useTemplatesForContract(readOnly ? undefined : companyId, contractType);
  // Mẫu Word có bảng các đợt → gợi ý «Tiến độ thanh toán» theo đúng mốc mẫu đề xuất (0185).
  const milestoneTemplate =
    rankTemplates(templates.data ?? [], priceForm).find((t) => t.payment_milestones?.length) ??
    null;
  const [applying, setApplying] = useState(false);

  /** Nhóm đang mở biểu mẫu, và dòng đang sửa (null = thêm mới). */
  const [editing, setEditing] = useState<{ type: ContractTermType; id: string | null } | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // Người dùng đã tự gõ số tiền thì đổi tỷ lệ không đè lên nữa.
  const [amountTouched, setAmountTouched] = useState(false);

  const byType = new Map<ContractTermType, ContractTermRecord[]>();
  for (const term of terms ?? []) {
    const list = byType.get(term.term_type) ?? [];
    list.push(term);
    byType.set(term.term_type, list);
  }

  function open(type: ContractTermType, from?: TermSuggestion | ContractTermRecord) {
    const isRecord = from !== undefined && 'id' in from;
    setForm({
      description: from?.description ?? '',
      amount: from?.amount != null ? String(from.amount) : '',
      percentValue: isRecord ? (from.percent_value ?? '') : '',
      dueDate: isRecord ? (from.due_date ?? '') : '',
      notes: from?.notes ?? '',
    });
    setAmountTouched(isRecord && from.amount != null);
    setError(null);
    setConfirmDelete(null);
    setEditing({ type, id: isRecord ? from.id : null });
  }

  function setPercent(value: string) {
    const percentValue = value.replace(/[^\d.,]/g, '');
    setForm((f) => {
      const auto =
        editing && TERM_FORMS[editing.type].amount && !amountTouched
          ? amountFromPercent(percentValue, contractValue)
          : null;
      return { ...f, percentValue, amount: auto ?? (amountTouched ? f.amount : '') };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    if (!form.description.trim()) {
      setError('Vui lòng nhập nội dung điều khoản.');
      return;
    }
    const spec = TERM_FORMS[editing.type];
    try {
      await saveTerm.mutateAsync({
        id: editing.id ?? undefined,
        contractId,
        companyId,
        values: {
          ...(editing.id ? {} : { term_type: editing.type }),
          description: form.description.trim(),
          // Ô nhóm này không hỏi thì ghi rỗng — không giữ số ghi nhầm từ trước.
          amount: spec.amount ? form.amount.trim() || null : null,
          percent_value: spec.percent ? form.percentValue.replace(',', '.').trim() || null : null,
          due_date: spec.due ? form.dueDate || null : null,
          notes: form.notes.trim() || null,
          ...(editing.id ? {} : { position: String((byType.get(editing.type)?.length ?? 0) + 1) }),
        },
      });
      setEditing(null);
    } catch (e) {
      setError(toUserMessage(e, editing.id ? 'edit' : 'create'));
    }
  }

  async function applyMilestones() {
    if (!milestoneTemplate) return;
    setError(null);
    setApplying(true);
    try {
      for (const [i, m] of milestoneTemplate.payment_milestones.entries()) {
        await saveTerm.mutateAsync({
          contractId,
          companyId,
          values: {
            term_type: 'tien_do_thanh_toan',
            description: m.noi_dung,
            percent_value: m.ty_le,
            amount: m.ty_le ? amountFromPercent(m.ty_le, contractValue) : null,
            position: String(i + 1),
          },
        });
      }
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    } finally {
      setApplying(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteTerm.mutateAsync(id);
      setConfirmDelete(null);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
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
        const spec = TERM_FORMS[type];
        const rows = byType.get(type) ?? [];
        const required = CONTRACT_REQUIRED_TERM_TYPES.includes(type);
        const suggestion = rows.length === 0 && !readOnly ? suggestions[type] : null;
        const formOpen = editing?.type === type;

        return (
          <section key={type} className="rounded-card bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="font-medium">{CONTRACT_TERM_TYPE_LABELS[type]}</p>
              {required && rows.length === 0 && (
                <span className="inline-flex items-center gap-1 text-status-overdue">
                  <AlertTriangle className="size-4" />
                  Bắt buộc trước khi trình ký
                </span>
              )}
              {!required && <span className="text-xs text-fg-subtle">Không bắt buộc</span>}
              {!readOnly && !formOpen && (
                <span className="ml-auto">
                  <Button variant="secondary" size="sm" onClick={() => open(type)}>
                    {rows.length === 0 ? 'Thêm điều khoản' : 'Thêm dòng'}
                  </Button>
                </span>
              )}
            </div>

            {suggestion && !formOpen && (
              <div className="mb-3 rounded-sm border border-status-progress bg-status-progress-bg px-3 py-2">
                <p className="text-xs text-fg-subtle">Máy soạn sẵn — {suggestion.source}</p>
                <p className="mt-1 whitespace-pre-wrap">{suggestion.description}</p>
                {suggestion.notes && <p className="text-fg-subtle">{suggestion.notes}</p>}
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => open(type, suggestion)}
                >
                  Dùng bản soạn sẵn
                </Button>
              </div>
            )}

            {type === 'tien_do_thanh_toan' &&
              rows.length === 0 &&
              !readOnly &&
              !formOpen &&
              milestoneTemplate && (
                <div className="mb-3 rounded-sm border border-status-progress bg-status-progress-bg px-3 py-2">
                  <p className="text-xs text-fg-subtle">
                    Mẫu «{milestoneTemplate.title}» đề xuất{' '}
                    {milestoneTemplate.payment_milestones.length} đợt
                  </p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                    {milestoneTemplate.payment_milestones.map((m, i) => (
                      <li key={i}>
                        {m.noi_dung}
                        <span className="text-fg-subtle">
                          {' — '}
                          {m.ty_le ? `${m.ty_le}%` : 'tỷ lệ chưa ghi'}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-1 text-xs text-fg-subtle">
                    Thêm xong sửa tỷ lệ, hạn từng đợt; đợt nào không dùng thì xoá.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    disabled={applying}
                    onClick={() => void applyMilestones()}
                  >
                    {applying ? 'Đang thêm…' : 'Dùng các đợt này'}
                  </Button>
                </div>
              )}

            {type === 'tien_do_thanh_toan' && rows.length > 0 && <PercentTotal rows={rows} />}

            {rows.length === 0 ? (
              !formOpen && <p className="text-fg-subtle">Chưa có dòng nào.</p>
            ) : (
              <ol className="space-y-2">
                {rows.map((term, i) => (
                  <li key={term.id} className="border-l-2 border-border pl-3">
                    <p className="whitespace-pre-wrap">
                      {rows.length > 1 && <span className="font-medium">{i + 1}. </span>}
                      {term.description}
                    </p>
                    <TermFigures term={term} spec={spec} />
                    {term.notes && <p className="text-sm text-fg-subtle">{term.notes}</p>}
                    {!readOnly && (
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                        <button
                          type="button"
                          className="text-brand underline-offset-2 hover:underline"
                          onClick={() => open(type, term)}
                        >
                          Sửa
                        </button>
                        {confirmDelete === term.id ? (
                          <span className="inline-flex items-center gap-2">
                            Xoá dòng này?
                            <button
                              type="button"
                              className="font-medium text-status-overdue underline-offset-2 hover:underline"
                              disabled={deleteTerm.isPending}
                              onClick={() => void remove(term.id)}
                            >
                              Xoá
                            </button>
                            <button
                              type="button"
                              className="text-fg-subtle underline-offset-2 hover:underline"
                              onClick={() => setConfirmDelete(null)}
                            >
                              Không
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="text-fg-subtle underline-offset-2 hover:underline"
                            onClick={() => setConfirmDelete(term.id)}
                          >
                            Xoá
                          </button>
                        )}
                        {spec.due &&
                          (term.completed_at ? (
                            <span className="inline-flex items-center gap-1 text-status-completed">
                              <CheckCircle2 className="size-4" />
                              Đã hoàn thành {formatDate(term.completed_at)}
                              <button
                                type="button"
                                className="ml-1 underline"
                                onClick={() => void toggleCompleted(term)}
                              >
                                Bỏ đánh dấu
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="text-brand underline-offset-2 hover:underline"
                              onClick={() => void toggleCompleted(term)}
                            >
                              Đánh dấu đã hoàn thành
                            </button>
                          ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {formOpen && (
              <form
                onSubmit={submit}
                noValidate
                className={rows.length > 0 ? 'mt-3 border-t border-border pt-3' : ''}
              >
                <p className="mb-2 text-sm font-medium">
                  {editing.id ? 'Sửa dòng' : 'Dòng mới'} — {CONTRACT_TERM_TYPE_LABELS[type]}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Nội dung điều khoản"
                    required
                    hint={spec.hint}
                    className="sm:col-span-2"
                  >
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={3}
                      placeholder={spec.placeholder}
                      className="w-full rounded-field border border-border-strong bg-surface px-3 py-2 placeholder:text-fg-subtle"
                      autoFocus
                    />
                  </Field>

                  {spec.percent && (
                    <Field label={spec.percent}>
                      <Input
                        value={form.percentValue}
                        onChange={(e) => setPercent(e.target.value)}
                        inputMode="decimal"
                        placeholder="30"
                      />
                    </Field>
                  )}

                  {spec.amount && (
                    <Field
                      label={spec.amount}
                      hint={
                        spec.percent && contractValue && !amountTouched
                          ? 'Máy tính từ tỷ lệ × giá trị hợp đồng; sửa được.'
                          : 'Đơn vị đồng.'
                      }
                    >
                      <MoneyInput
                        value={form.amount}
                        onChange={(v) => {
                          setAmountTouched(true);
                          setForm((f) => ({ ...f, amount: v }));
                        }}
                      />
                    </Field>
                  )}

                  {spec.due && (
                    <Field label={spec.due}>
                      <DateInput
                        value={form.dueDate}
                        onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))}
                      />
                    </Field>
                  )}

                  <Field label="Ghi chú nội bộ" hint="Không in lên văn bản.">
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
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
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

/** Tổng tỷ lệ các đợt — thiếu / thừa 100% thì nói ngay, trước khi trình ký. */
function PercentTotal({ rows }: { rows: ContractTermRecord[] }) {
  const values = rows.map((r) => Number((r.percent_value ?? '').replace(',', '.')));
  if (values.every((v) => !Number.isFinite(v) || v === 0)) return null;
  const missing = values.filter((v) => !Number.isFinite(v) || v === 0).length;
  const total = Math.round(values.filter(Number.isFinite).reduce((a, b) => a + b, 0) * 100) / 100;
  const ok = total === 100 && missing === 0;
  return (
    <p className={ok ? 'mb-2 text-sm text-status-completed' : 'mb-2 text-sm text-status-pending'}>
      Tổng tỷ lệ: {String(total).replace('.', ',')}%
      {!ok &&
        (missing > 0
          ? ` — còn ${missing} đợt chưa ghi tỷ lệ`
          : total < 100
            ? ` — còn thiếu ${String(Math.round((100 - total) * 100) / 100).replace('.', ',')}%`
            : ' — vượt 100%')}
    </p>
  );
}

/** Số tiền / tỷ lệ / hạn — chỉ những ô nhóm này dùng. */
function TermFigures({ term, spec }: { term: ContractTermRecord; spec: TermForm }) {
  const parts: string[] = [];
  if (spec.percent && term.percent_value) parts.push(`${term.percent_value}%`);
  if (spec.amount && term.amount != null) parts.push(formatCurrency(term.amount));
  if (spec.due)
    parts.push(term.due_date ? `${spec.due}: ${formatDate(term.due_date)}` : 'Chưa ghi hạn');
  if (parts.length === 0) return null;
  return <p className="text-fg-subtle">{parts.join(' · ')}</p>;
}
