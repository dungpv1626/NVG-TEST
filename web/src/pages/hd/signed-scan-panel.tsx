/**
 * Khối «Bản hợp đồng đã ký» trên Tổng quan hợp đồng (0189): quét / bổ sung bản giấy đã ký, đóng
 * dấu; xem; chia sẻ từ điện thoại; tạo link xem có hạn cho khách và theo dõi khách đã mở chưa.
 *
 * Ai làm gì do CSDL quyết (`attach_signed_scan`, `rls_contract_scan_sharer`); nút chỉ hiện cho
 * người làm được (CLAUDE.md 5.4). Thay bản đã có phải ghi lý do; Ban Giám đốc được báo.
 */

import { useState } from 'react';
import { Copy, ScanLine, Share2 } from 'lucide-react';
import { formatDate, formatDateTime, toNvgDateInput } from '@nvg/shared';
import { DocumentScanner } from '@/components/scan/document-scanner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import {
  scanShareUrl,
  signedScanUrl,
  useAttachSignedScan,
  useContractScanShares,
  useCreateScanShare,
  useRevokeScanShare,
  useSignedScanHistory,
} from '@/hooks/use-contract-scan';
import { toUserMessage } from '@/hooks/use-error-message';
import { safeFileName, shareOrDownload } from '@/lib/share-file';
import { SignedScanLink } from './signed-scan-link';

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toNvgDateInput(d);
}

export function SignedScanPanel({
  contract,
  canManage,
}: {
  contract: {
    id: string;
    company_id: string;
    code: string;
    title: string;
    contract_number: string | null;
    signed_scan_path: string | null;
  };
  /** Người chịu trách nhiệm hoặc Ban Giám đốc. */
  canManage: boolean;
}) {
  const prompt = usePromptDialog();
  const attach = useAttachSignedScan();
  const { data: shares = [] } = useContractScanShares(contract.id);
  const { data: versions = [] } = useSignedScanHistory(contract.id);
  const revoke = useRevokeScanShare();
  const [scanning, setScanning] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = contract.contract_number ?? contract.code;
  const fileName = `Hop-dong-${safeFileName(label)}-da-ky`;
  const hasScan = Boolean(contract.signed_scan_path);

  async function onScanned(file: File) {
    setScanning(false);
    setError(null);
    let reason: string | undefined;
    if (hasScan) {
      const r = await prompt.ask({
        title: 'Thay bản hợp đồng đã ký',
        label: 'Lý do thay bản đã ký',
        confirmLabel: 'Thay bản đã ký',
      });
      if (r === null) return;
      reason = r;
    }
    try {
      await attach.mutateAsync({ contractId: contract.id, file, reason });
      setMessage(hasScan ? 'Đã thay bản đã ký.' : 'Đã lưu bản đã ký vào hồ sơ hợp đồng.');
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  async function share() {
    setError(null);
    setMessage(null);
    try {
      const url = await signedScanUrl(contract.signed_scan_path!);
      const ext = contract.signed_scan_path!.split('.').pop() ?? 'pdf';
      const outcome = await shareOrDownload(url, `${fileName}.${ext}`, `Hợp đồng ${label}`);
      if (outcome === 'downloaded')
        setMessage('Đã tải tệp về máy — đính kèm vào email hoặc Zalo để gửi.');
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  // Người chịu trách nhiệm hoặc Ban Giám đốc thay được, phải ghi lý do; BGĐ được báo (0189).
  const canReplace = hasScan && canManage;
  const now = Date.now();

  return (
    <section id="ban-da-ky" className="mb-4 rounded-lg border border-border bg-surface p-4">
      {prompt.dialog}
      {scanning && (
        <DocumentScanner
          title={hasScan ? 'Quét lại bản hợp đồng đã ký' : 'Quét bản hợp đồng đã ký'}
          fileName={fileName}
          onDone={(file) => void onScanned(file)}
          onCancel={() => setScanning(false)}
        />
      )}
      {sharing && (
        <ScanShareDialog
          contractId={contract.id}
          companyId={contract.company_id}
          onClose={() => setSharing(false)}
        />
      )}

      <p className="font-medium">Bản hợp đồng đã ký</p>
      {!hasScan ? (
        <p className="mt-1 text-sm text-fg-subtle">
          Chưa có bản đã ký.{' '}
          {canManage
            ? 'Quét bản giấy đã ký, đóng dấu bằng điện thoại (nhiều trang ghép thành một PDF) để lưu hồ sơ và gửi khách.'
            : 'Người chịu trách nhiệm hợp đồng quét và lưu bản giấy đã ký.'}
        </p>
      ) : (
        <p className="mt-1 text-sm">
          <SignedScanLink path={contract.signed_scan_path!} />
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {canManage && !hasScan && (
          <Button variant="secondary" onClick={() => setScanning(true)} disabled={attach.isPending}>
            <ScanLine className="size-4" aria-hidden />
            {attach.isPending ? 'Đang lưu…' : 'Quét / thêm bản đã ký'}
          </Button>
        )}
        {hasScan && (
          <Button variant="secondary" onClick={() => void share()}>
            <Share2 className="size-4" aria-hidden /> Chia sẻ
          </Button>
        )}
        {hasScan && canManage && (
          <Button variant="secondary" onClick={() => setSharing(true)}>
            <Copy className="size-4" aria-hidden /> Tạo link cho khách
          </Button>
        )}
        {canReplace && (
          <Button variant="subtle" onClick={() => setScanning(true)} disabled={attach.isPending}>
            Quét lại / thay bản khác
          </Button>
        )}
      </div>

      {message && (
        <p role="status" className="mt-2 text-sm text-status-completed">
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}

      {versions.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">Các lần quét ({versions.length})</p>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {versions.map((v) => {
              const current = v.path === contract.signed_scan_path;
              return (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{formatDateTime(v.created_at)}</span>
                    {v.creator && <span className="text-fg-subtle"> · {v.creator.full_name}</span>}
                    {current && (
                      <span className="ml-2 rounded-full bg-status-completed-bg px-2 py-0.5 text-xs font-semibold text-status-completed">
                        Đang dùng
                      </span>
                    )}
                    {v.reason && (
                      <span className="block text-fg-subtle">Lý do thay: {v.reason}</span>
                    )}
                  </span>
                  <SignedScanLink path={v.path} label="Xem" />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {shares.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">Link đã gửi khách</p>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {shares.map((s) => {
              const expired = new Date(s.expires_at).getTime() <= now;
              const active = !s.revoked_at && !expired;
              const lastView = s.views
                .map((v) => v.viewed_at)
                .sort()
                .at(-1);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {s.revoked_at
                        ? `Đã thu hồi ${formatDate(s.revoked_at)}`
                        : expired
                          ? `Hết hạn ${formatDate(s.expires_at)}`
                          : `Đang hiệu lực, xem được tới ${formatDate(s.expires_at)}`}
                    </span>
                    {' · '}
                    {s.views.length
                      ? `${s.views.length} lượt xem, gần nhất ${formatDateTime(lastView)}`
                      : 'Khách chưa mở'}
                    {s.creator && <span className="text-fg-subtle"> · {s.creator.full_name}</span>}
                    {s.note && <span className="block text-fg-subtle">{s.note}</span>}
                  </span>
                  {active && (
                    <>
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(scanShareUrl(s.token))
                            .then(() => setMessage('Đã chép link.'))
                        }
                      >
                        Chép link
                      </Button>
                      {canManage && (
                        <Button
                          size="sm"
                          variant="subtle"
                          disabled={revoke.isPending}
                          onClick={() =>
                            void revoke
                              .mutateAsync({ id: s.id, contractId: contract.id })
                              .catch((e) => setError(toUserMessage(e, 'edit')))
                          }
                        >
                          Thu hồi
                        </Button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

const QUICK = [
  { label: '7 ngày', days: 7 },
  { label: '14 ngày', days: 14 },
  { label: '30 ngày', days: 30 },
];

function ScanShareDialog({
  contractId,
  companyId,
  onClose,
}: {
  contractId: string;
  companyId: string;
  onClose: () => void;
}) {
  const create = useCreateScanShare();
  const [until, setUntil] = useState(addDays(7));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setError(null);
    if (!until) return setError('Chọn thời hạn của link.');
    try {
      // Hết hạn vào cuối ngày đã chọn, giờ Việt Nam.
      const expiresAt = new Date(`${until}T23:59:59+07:00`).toISOString();
      const res = await create.mutateAsync({
        contractId,
        companyId,
        expiresAt,
        note: note.trim() || null,
      });
      setLink(scanShareUrl(res.token));
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  if (link) {
    return (
      <ConfirmDialog
        title="Đã tạo link xem hợp đồng"
        confirmLabel={copied ? 'Đã chép link' : 'Chép link'}
        cancelLabel="Đóng"
        onConfirm={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
        onCancel={onClose}
      >
        <p className="break-all rounded-sm bg-surface-sunken px-3 py-2 font-mono text-sm">{link}</p>
        <p className="mt-2 text-fg-subtle">
          Gửi link qua Zalo / email. Khách xem và tải bản đã ký không cần đăng nhập, tới hết ngày{' '}
          {formatDate(until)}. Thu hồi sớm ở mục «Link đã gửi khách».
        </p>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title="Tạo link xem bản đã ký cho khách"
      confirmLabel="Tạo link"
      pending={create.isPending}
      focusConfirm={false}
      onConfirm={() => void submit()}
      onCancel={onClose}
    >
      <div className="space-y-3">
        <Field label="Link dùng được tới hết ngày" required group>
          <div className="space-y-2">
            <DateInput value={until} min={addDays(1)} onChange={setUntil} />
            <div className="flex gap-1">
              {QUICK.map((q) => (
                <button
                  key={q.days}
                  type="button"
                  onClick={() => setUntil(addDays(q.days))}
                  className="min-h-10 rounded-sm border border-border px-2 text-xs hover:bg-surface-hover sm:min-h-8"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </Field>
        <Field label="Ghi chú nội bộ (gửi cho ai)" optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
        <p className="text-xs text-fg-subtle">
          Trang khách xem chỉ có tên, số, ngày ký và bản đã ký — không có giá trị hay điều khoản
          trên hệ thống.
        </p>
        {error && (
          <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
