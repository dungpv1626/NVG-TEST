/**
 * Đề nghị thu tiền — danh sách và chi tiết (Đợt 3 — 3B, migration 0196).
 *
 * Tiêu chí của đợt: «từ một biên bản nghiệm thu đợt, Kế toán có đề nghị thu tiền đúng số trong
 * một bấm». Bản nháp do máy soạn (số tiền theo đợt thu gắn biên bản, căn cứ hợp đồng / biên bản /
 * mốc); Kế toán kiểm, sửa, in gửi chủ đầu tư, đính kèm bản đã ký quét lại, rồi «Ghi công nợ» —
 * chỉ lúc đó khoản phải thu mới sinh ra. Máy không tự ghi công nợ.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  moneyToVietnameseWords,
  toMoney,
  type StatusGroup,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { DocumentScanner } from '@/components/scan/document-scanner';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  COLLECTION_REQUEST_STATUS_LABELS,
  collectionScanUrl,
  useAttachCollectionScan,
  useCollectionRequest,
  useCollectionRequestAction,
  useCollectionRequests,
  useCreateCollectionRequest,
  useUpdateCollectionRequest,
  type CollectionRequestRecord,
  type CollectionRequestStatus,
} from '@/hooks/use-collection-requests';
import { toUserMessage } from '@/hooks/use-error-message';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { KtNav } from './kt-nav';

const STATUS_GROUP: Record<CollectionRequestStatus, StatusGroup> = {
  nhap: 'draft',
  da_gui: 'in_progress',
  da_ghi_cong_no: 'completed',
  huy: 'draft',
};

function StatusOf({ status }: { status: CollectionRequestStatus }) {
  return (
    <StatusWithLabel
      status={STATUS_GROUP[status]}
      label={COLLECTION_REQUEST_STATUS_LABELS[status]}
    />
  );
}

/**
 * Nút «Lập đề nghị thu» dùng ở trang Biên bản nghiệm thu và Đợt thu: gọi hàm lập (bấm lại thì mở
 * bản đang có), xong sang trang chi tiết.
 */
export function useOpenCollectionRequest() {
  const create = useCreateCollectionRequest();
  const navigate = useNavigate();
  return {
    isPending: create.isPending,
    open: async (input: { acceptanceId?: string; termId?: string }) => {
      const id = await create.mutateAsync(input);
      void navigate(`/kt/de-nghi-thu/${id}`);
    },
  };
}

export function printCollectionRequest(r: CollectionRequestRecord, amount: bigint) {
  const contract = r.contract;
  const body = `
<p style="text-align:center;font-weight:600">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br/>Độc lập – Tự do – Hạnh phúc</p>
<h2 style="text-align:center">${escapeHtml(r.title)}</h2>
<p style="text-align:center" class="muted">Số: ${escapeHtml(r.code)}</p>
<dl>
  <div><dt>Kính gửi</dt><dd>${escapeHtml(r.party_name ?? '……………………………………')}</dd></div>
  <div><dt>Đơn vị đề nghị</dt><dd>${escapeHtml(r.company?.legal_name ?? r.company?.short_name ?? '')}</dd></div>
  ${contract ? `<div><dt>Hợp đồng</dt><dd>${escapeHtml(`${contract.contract_number ?? contract.code} — ${contract.title}`)}</dd></div>` : ''}
  ${r.site ? `<div><dt>Công trình</dt><dd>${escapeHtml(`${r.site.code} — ${r.site.name}`)}</dd></div>` : ''}
</dl>
<h2>Căn cứ</h2>
<p style="white-space:pre-wrap">${escapeHtml(r.basis)}</p>
<p>Đề nghị thanh toán số tiền: <strong>${escapeHtml(formatCurrency(amount))}</strong></p>
<p>Bằng chữ: <em>${escapeHtml(moneyToVietnameseWords(amount))}</em></p>
${r.due_date ? `<p>Thời hạn thanh toán: trước ngày ${escapeHtml(formatDate(r.due_date))}</p>` : ''}
${r.content ? `<p style="white-space:pre-wrap">${escapeHtml(r.content)}</p>` : ''}
<table style="margin-top:32px">
  <tr><th style="width:50%">Xác nhận của chủ đầu tư</th><th>Đại diện ${escapeHtml(r.company?.short_name ?? 'Nhà Việt')}</th></tr>
  <tr><td style="height:96px"></td><td></td></tr>
  <tr><td>(Ký, ghi rõ họ tên)</td><td>(Ký, ghi rõ họ tên, đóng dấu)</td></tr>
</table>`;
  openPrintReport(`Đề nghị thanh toán ${r.code}`, body);
}

export function CollectionRequestListPage() {
  const scope = useCompanyScope();
  const { data, isLoading, error, refetch } = useCollectionRequests();
  const rows = data ?? [];
  return (
    <>
      <KtNav />
      <PageHeader
        title="Đề nghị thu tiền"
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Đề nghị thu tiền' }]}
        description="Hồ sơ đề nghị thanh toán gửi chủ đầu tư. Lập từ biên bản nghiệm thu đã ký hoặc từ đợt thu đã đến hạn."
      />
      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          message="Chưa có đề nghị thu tiền. Mở «Biên bản nghiệm thu» hoặc «Đợt thu» rồi bấm «Lập đề nghị thu»."
          action={
            <Link to="/kt/bien-ban-nghiem-thu" className="text-brand underline">
              Mở Biên bản nghiệm thu
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-card bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link
                  to={`/kt/de-nghi-thu/${r.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {r.code}
                </Link>
                <span>{r.title}</span>
                <span className="ms-auto">
                  <StatusOf status={r.status} />
                </span>
              </div>
              <p className="mt-1 text-fg-subtle">
                {r.contract?.contract_number ?? r.contract?.code}
                {r.party_name && <> · {r.party_name}</>}
                {scope.isAggregate && r.company && <> · {r.company.code}</>}
              </p>
              <p className="mt-1">
                <strong>{formatCurrency(r.amount)}</strong>
                <span className="text-fg-subtle">
                  {' '}
                  · lập {formatDate(r.created_at)}
                  {r.due_date && <> · hạn {formatDate(r.due_date)}</>}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function CollectionRequestDetailPage() {
  const { id } = useParams();
  const { data: r, isLoading, error, refetch } = useCollectionRequest(id);
  const canEdit = useCan('KT', 'edit');
  const update = useUpdateCollectionRequest();
  const action = useCollectionRequestAction();
  const attach = useAttachCollectionScan();
  const prompt = usePromptDialog();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [basis, setBasis] = useState('');
  const [content, setContent] = useState('');
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    if (!r) return;
    setTitle(r.title);
    setAmount(String(r.amount));
    setDueDate(r.due_date ?? '');
    setBasis(r.basis);
    setContent(r.content ?? '');
  }, [r]);

  const editable = Boolean(r && canEdit && r.status === 'nhap');
  const dirty = Boolean(
    r &&
    editable &&
    (title !== r.title ||
      amount !== String(r.amount) ||
      dueDate !== (r.due_date ?? '') ||
      basis !== r.basis ||
      content !== (r.content ?? '')),
  );
  useUnsavedChangesGuard(dirty);

  if (isLoading) return <TableSkeleton />;
  if (error || !r)
    return <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />;

  const money = amount ? toMoney(amount) : 0n;
  const fail = (e: unknown) => setMessage({ kind: 'error', text: toUserMessage(e, 'edit') });

  async function save(): Promise<boolean> {
    if (!dirty || !r) return true;
    if (money <= 0n) {
      setMessage({ kind: 'error', text: 'Vui lòng nhập số tiền đề nghị lớn hơn 0.' });
      return false;
    }
    try {
      await update.mutateAsync({
        id: r.id,
        values: {
          title: title.trim(),
          amount,
          due_date: dueDate || null,
          basis: basis.trim(),
          content: content.trim() || null,
        },
      });
      setMessage({ kind: 'ok', text: 'Đã lưu thay đổi.' });
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }

  async function record() {
    if (!r || !(await save())) return;
    const invoice = await prompt.ask({
      title: `Ghi công nợ phải thu ${formatCurrency(money)}?`,
      label: 'Số hóa đơn (nếu đã xuất)',
      confirmLabel: 'Ghi công nợ',
      required: false,
    });
    if (invoice === null) return;
    try {
      await action.mutateAsync({
        kind: 'record',
        id: r.id,
        dueDate: dueDate || null,
        invoiceNumber: invoice.trim() || null,
      });
      setMessage({ kind: 'ok', text: 'Đã ghi công nợ phải thu — xem ở màn hình Công nợ.' });
    } catch (e) {
      fail(e);
    }
  }

  async function send() {
    if (!r || !(await save())) return;
    try {
      await action.mutateAsync({ kind: 'send', id: r.id });
      setMessage({ kind: 'ok', text: 'Đã ghi «đã gửi khách».' });
    } catch (e) {
      fail(e);
    }
  }

  async function cancel() {
    if (!r) return;
    const reason = await prompt.ask({
      title: `Hủy đề nghị ${r.code}?`,
      label: 'Lý do hủy',
      confirmLabel: 'Hủy đề nghị',
      required: true,
    });
    if (reason === null) return;
    try {
      await action.mutateAsync({ kind: 'cancel', id: r.id, reason });
    } catch (e) {
      fail(e);
    }
  }

  const open = r.status === 'nhap' || r.status === 'da_gui';
  return (
    <>
      <KtNav />
      {prompt.dialog}
      {scanning && (
        <DocumentScanner
          title="Quét đề nghị thanh toán đã ký"
          fileName={`de-nghi-thanh-toan-${r.code}`}
          onDone={(file) => {
            setScanning(false);
            attach.mutate(
              { id: r.id, file },
              {
                onSuccess: () => setMessage({ kind: 'ok', text: 'Đã đính kèm bản quét.' }),
                onError: fail,
              },
            );
          }}
          onCancel={() => setScanning(false)}
        />
      )}
      <PageHeader
        title={r.code}
        breadcrumbs={[
          { label: 'Kế toán – Tài chính' },
          { label: 'Đề nghị thu tiền', to: '/kt/de-nghi-thu' },
          { label: r.code },
        ]}
        description={r.title}
        actions={
          canEdit && open ? (
            <Button variant="primary" onClick={() => void record()} disabled={action.isPending}>
              Ghi công nợ
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusOf status={r.status} />
        {r.sent_at && (
          <span className="text-sm text-fg-subtle">Gửi khách {formatDateTime(r.sent_at)}</span>
        )}
        {r.recorded_at && (
          <span className="text-sm text-fg-subtle">
            Ghi công nợ {formatDateTime(r.recorded_at)} —{' '}
            <Link to="/kt/cong-no" className="text-brand underline">
              mở Công nợ
            </Link>
          </span>
        )}
        {r.cancel_reason && (
          <span className="text-sm text-fg-subtle">Lý do hủy: {r.cancel_reason}</span>
        )}
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={
            'mb-3 rounded-sm px-3 py-2 ' +
            (message.kind === 'error'
              ? 'bg-status-overdue-bg text-status-overdue'
              : 'bg-status-completed-bg text-status-completed')
          }
        >
          {message.text}
        </p>
      )}

      <section className="mb-4 grid gap-4 rounded-card bg-surface p-4 sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm text-fg-subtle">
          {r.contract && (
            <>
              Hợp đồng{' '}
              <Link to={`/hd/hop-dong/${r.contract_id}`} className="text-brand underline">
                {r.contract.contract_number ?? r.contract.code}
              </Link>{' '}
              — {r.contract.title}
            </>
          )}
          {r.party_name && <> · Kính gửi {r.party_name}</>}
          {r.site && (
            <>
              {' '}
              · Công trình {r.site.code} — {r.site.name}
            </>
          )}
        </p>
        <Field label="Tiêu đề" required className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Số tiền đề nghị (đồng)" required>
          <MoneyInput value={amount} onChange={setAmount} disabled={!editable} />
        </Field>
        <Field label="Hạn thanh toán" optional>
          <DateInput value={dueDate} onChange={setDueDate} disabled={!editable} />
        </Field>
        <p className="sm:col-span-2">
          Bằng chữ: <em>{money > 0n ? moneyToVietnameseWords(money) : 'Chưa nhập số tiền'}</em>
        </p>
        <Field
          label="Căn cứ"
          required
          className="sm:col-span-2"
          hint="Máy soạn từ hợp đồng, biên bản, mốc — sửa nếu cần."
        >
          <textarea
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            disabled={!editable}
            rows={5}
            className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
          />
        </Field>
        <Field label="Nội dung thêm" optional className="sm:col-span-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!editable}
            rows={3}
            className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
          />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {editable && (
            <Button
              variant="secondary"
              onClick={() => void save()}
              disabled={!dirty || update.isPending}
            >
              Lưu thay đổi
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => void save().then((ok) => ok && printCollectionRequest(r, money))}
          >
            In đề nghị
          </Button>
          {canEdit && r.status === 'nhap' && (
            <Button variant="secondary" disabled={action.isPending} onClick={() => void send()}>
              Ghi đã gửi khách
            </Button>
          )}
          {canEdit && open && (
            <Button variant="secondary" onClick={() => void cancel()}>
              Hủy đề nghị
            </Button>
          )}
        </div>
      </section>

      <section className="mb-4 rounded-card bg-surface p-4">
        <p className="font-medium">Bản đã ký / đóng dấu</p>
        <p className="mt-1 text-sm text-fg-subtle">
          In đề nghị, ký đóng dấu, gửi chủ đầu tư; quét bản giấy để lưu cùng hồ sơ.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {r.scan_path && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void collectionScanUrl(r.scan_path!).then(
                  (url) => url && window.open(url, '_blank'),
                )
              }
            >
              Mở bản quét
            </Button>
          )}
          {canEdit && r.status !== 'huy' && (
            <Button size="sm" variant="secondary" onClick={() => setScanning(true)}>
              <ScanLine className="size-4" aria-hidden />
              {r.scan_path ? 'Quét lại' : 'Quét bản giấy'}
            </Button>
          )}
          {!r.scan_path && !canEdit && (
            <span className="text-sm text-fg-subtle">Chưa có bản quét.</span>
          )}
        </div>
      </section>
    </>
  );
}
