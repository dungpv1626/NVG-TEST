/**
 * Danh sách giấy tờ có thời hạn của pháp nhân (Đợt 5 — 5F Hành chính, 5C hồ sơ năng lực).
 * Mẫu bố cục Danh sách (AFD 4.2): hạn gần nhất đứng đầu — danh sách để biết hôm nay phải đi gia
 * hạn giấy nào.
 *
 * Nhắc hạn: đã hết hạn thì luôn báo; «sắp hết hạn» chỉ khi NVG đã đặt số ngày nhắc trước
 * (tham số trống thì nói rõ, không tự đặt số — CLAUDE.md 5.2).
 */

import { useState, type FormEvent } from 'react';
import { FileText, Plus } from 'lucide-react';
import { formatDate } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useActiveUsers } from '@/hooks/use-active-users';
import {
  companyDocumentUrl,
  expiryState,
  openFinancialStatementUrl,
  useCompanyDocuments,
  useCreateCompanyDocument,
  useParameterNumber,
  useRenewCompanyDocument,
  useSeesFinancialStatements,
  type CompanyDocumentRecord,
} from '@/hooks/use-company-documents';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCompanyScope } from '@/lib/company-scope';
import { cn } from '@/lib/utils';

export interface DocumentCategory {
  value: string;
  label: string;
  /** Loại có năm tài chính (báo cáo tài chính) thay vì ngày hết hạn. */
  yearly?: boolean;
}

const SELECT_BOX = 'h-10 w-full rounded-sm border border-border bg-surface px-2 sm:h-9';

export function ExpiryTag({
  expiry,
  remindDays,
}: {
  expiry: string | null;
  remindDays: number | null;
}) {
  const s = expiryState(expiry, remindDays);
  if (s.kind === 'none') return <span className="text-fg-subtle">Không có hạn</span>;
  if (s.kind === 'expired')
    return <span className="font-medium text-status-overdue">Đã hết hạn</span>;
  if (s.kind === 'soon')
    return <span className="font-medium text-status-pending">Sắp hết hạn — còn {s.days} ngày</span>;
  return <span className="text-status-completed">Còn hạn</span>;
}

export function CompanyDocumentsPanel({
  categories,
  remindParamKey,
  canEdit,
  emptyMessage,
}: {
  categories: readonly DocumentCategory[];
  remindParamKey: string;
  canEdit: boolean;
  emptyMessage: string;
}) {
  const scope = useCompanyScope();
  const { data, isLoading, error, refetch } = useCompanyDocuments(categories.map((c) => c.value));
  const { data: remindDays } = useParameterNumber(remindParamKey);
  const { data: seesFinance } = useSeesFinancialStatements();
  const [adding, setAdding] = useState(false);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const labelOf = (v: string) => categories.find((c) => c.value === v)?.label ?? v;

  async function openFile(d: CompanyDocumentRecord) {
    try {
      // Báo cáo tài chính (Mẫu D) mở qua hàm kiểm quyền + ghi nhật ký truy cập.
      const url =
        d.category === 'bao_cao_tai_chinh'
          ? await openFinancialStatementUrl(d.id)
          : await companyDocumentUrl(d.file_path!);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setPageError(toUserMessage(e, 'view'));
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-sm bg-surface-sunken px-3 py-2 text-sm text-fg-subtle">
        {remindDays === null || remindDays === undefined
          ? 'Số ngày nhắc trước khi hết hạn chưa cấu hình — hệ thống chỉ báo người phụ trách khi giấy tờ đã hết hạn.'
          : `Hệ thống báo người phụ trách trước ${remindDays} ngày và khi giấy tờ đã hết hạn.`}
      </p>

      {pageError && <ErrorState message={pageError} />}

      {canEdit && !adding && (
        <Button
          variant="primary"
          onClick={() => {
            setPageError(null);
            if (!scope.companyId || scope.isAggregate) {
              setPageError(
                'Chọn một pháp nhân cụ thể ở bộ chọn góc trên bên trái trước khi thêm giấy tờ.',
              );
              return;
            }
            setAdding(true);
          }}
        >
          <Plus className="size-4" aria-hidden />
          Thêm giấy tờ
        </Button>
      )}
      {canEdit && adding && scope.companyId && (
        <AddDocumentForm
          companyId={scope.companyId}
          categories={categories}
          onDone={() => setAdding(false)}
        />
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} onRetry={() => void refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {(data ?? []).map((d) => (
            <li key={d.id} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-sm text-fg-subtle">
                    {labelOf(d.category)}
                    {d.document_number ? ` · Số ${d.document_number}` : ''}
                    {d.issuer ? ` · ${d.issuer}` : ''}
                    {scope.isAggregate && d.company ? ` · ${d.company.code}` : ''}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {d.fiscal_year ? (
                    <span>Năm tài chính {d.fiscal_year}</span>
                  ) : (
                    <>
                      <ExpiryTag expiry={d.expiry_date} remindDays={remindDays ?? null} />
                      {d.expiry_date && (
                        <div className="text-fg-subtle">Hết hạn {formatDate(d.expiry_date)}</div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-fg-subtle">
                  Người phụ trách: {d.responsible?.full_name ?? 'Chưa giao'}
                </span>
                {d.file_path && d.category === 'bao_cao_tai_chinh' && !seesFinance ? (
                  <span className="text-fg-subtle">
                    · Đã có bản chụp — chỉ Ban Giám đốc, Tài chính, Kế toán mở được
                  </span>
                ) : d.file_path ? (
                  <Button variant="subtle" onClick={() => void openFile(d)}>
                    <FileText className="size-4" aria-hidden />
                    Xem bản chụp
                  </Button>
                ) : (
                  <span className="text-fg-subtle">· Chưa có bản chụp</span>
                )}
                {canEdit && !d.fiscal_year && renewing !== d.id && (
                  <Button variant="subtle" onClick={() => setRenewing(d.id)}>
                    Gia hạn
                  </Button>
                )}
              </div>
              {renewing === d.id && <RenewForm doc={d} onDone={() => setRenewing(null)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddDocumentForm({
  companyId,
  categories,
  onDone,
}: {
  companyId: string;
  categories: readonly DocumentCategory[];
  onDone: () => void;
}) {
  const create = useCreateCompanyDocument();
  const { data: users } = useActiveUsers();
  const [form, setForm] = useState({
    category: categories[0]!.value,
    title: '',
    documentNumber: '',
    issuer: '',
    issuedDate: '',
    expiryDate: '',
    fiscalYear: '',
    responsible: '',
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const yearly = categories.find((c) => c.value === form.category)?.yearly ?? false;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError('Vui lòng nhập tên giấy tờ.');
      return;
    }
    if (yearly && !/^\d{4}$/.test(form.fiscalYear)) {
      setError('Vui lòng nhập năm tài chính (bốn chữ số).');
      return;
    }
    try {
      await create.mutateAsync({
        companyId,
        category: form.category,
        title: form.title.trim(),
        documentNumber: form.documentNumber.trim() || null,
        issuer: form.issuer.trim() || null,
        issuedDate: form.issuedDate || null,
        expiryDate: yearly ? null : form.expiryDate || null,
        fiscalYear: yearly ? Number(form.fiscalYear) : null,
        responsibleUserId: form.responsible || null,
        notes: form.notes.trim() || null,
        file,
      });
      onDone();
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-3"
    >
      <Field label="Loại giấy tờ" required>
        <select
          className={SELECT_BOX}
          value={form.category}
          onChange={(e) => set('category')(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tên giấy tờ" required className="lg:col-span-2">
        <Input value={form.title} onChange={(e) => set('title')(e.target.value)} />
      </Field>
      <Field label="Số hiệu">
        <Input
          value={form.documentNumber}
          onChange={(e) => set('documentNumber')(e.target.value)}
        />
      </Field>
      <Field label="Nơi cấp">
        <Input value={form.issuer} onChange={(e) => set('issuer')(e.target.value)} />
      </Field>
      <Field label="Ngày cấp">
        <DateInput value={form.issuedDate} onChange={set('issuedDate')} />
      </Field>
      {yearly ? (
        <Field label="Năm tài chính" required>
          <Input
            value={form.fiscalYear}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => set('fiscalYear')(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      ) : (
        <Field label="Ngày hết hạn" hint="Để trống nếu giấy tờ không có hạn.">
          <DateInput value={form.expiryDate} onChange={set('expiryDate')} />
        </Field>
      )}
      <Field label="Người phụ trách" hint="Người nhận nhắc khi sắp / đã hết hạn.">
        <select
          className={SELECT_BOX}
          value={form.responsible}
          onChange={(e) => set('responsible')(e.target.value)}
        >
          <option value="">Chưa giao</option>
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Bản chụp (PDF hoặc ảnh)">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
      </Field>
      <Field label="Ghi chú" className="sm:col-span-2 lg:col-span-3">
        <Input value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className={cn('text-status-overdue', 'sm:col-span-2 lg:col-span-3')}>
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          Lưu giấy tờ
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

function RenewForm({ doc, onDone }: { doc: CompanyDocumentRecord; onDone: () => void }) {
  const renew = useRenewCompanyDocument();
  const [expiry, setExpiry] = useState(doc.expiry_date ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 grid gap-3 rounded-sm bg-surface-sunken p-3 sm:grid-cols-3">
      <Field label="Ngày hết hạn mới">
        <DateInput value={expiry} onChange={setExpiry} />
      </Field>
      <Field label="Bản chụp mới (nếu có)">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
      </Field>
      <div className="flex items-end gap-2">
        <Button
          variant="primary"
          disabled={renew.isPending}
          onClick={async () => {
            setError(null);
            try {
              await renew.mutateAsync({
                id: doc.id,
                companyId: doc.company_id,
                expiryDate: expiry || null,
                file,
              });
              onDone();
            } catch (e) {
              setError(toUserMessage(e, 'edit'));
            }
          }}
        >
          Lưu gia hạn
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-status-overdue sm:col-span-3">
          {error}
        </p>
      )}
    </div>
  );
}
