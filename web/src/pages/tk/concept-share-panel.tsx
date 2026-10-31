/**
 * Khối «Gửi khách xem» — đường dẫn xem «Bộ ý tưởng» có hạn (B5, migration 0259).
 *
 * Luồng: Kinh doanh hoặc kiến trúc sư «Đề nghị gửi khách» → kiến trúc sư «Duyệt gửi khách» (máy chụp bộ ý tưởng đang
 * hiệu lực, link mở 14 ngày) → chép link / «Gửi qua Zalo» → thu hồi được, đếm lượt xem. Hồ sơ gắn cơ hội chưa có báo cáo
 * khảo sát đã duyệt thì không đề nghị được — câu lý do do CSDL trả (`design_concept_share_readiness`).
 *
 * Nút nào hiện do CSDL quyết (`can_approve`, `can_revoke`, `can_send`), không đoán theo vai trò ở đây (CLAUDE.md 5.4).
 */

import { useState } from 'react';
import { Check, Copy, ExternalLink, Eye, Link2 } from 'lucide-react';
import { formatDate, formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/states';
import { ZaloSend } from '@/components/share/zalo-send';
import { useCompanyLookup } from '@/hooks/use-companies';
import {
  CONCEPT_SHARE_STATUS_LABEL,
  conceptShareUrl,
  useApproveConceptShare,
  useConceptProjectContact,
  useConceptShares,
  useRequestConceptShare,
  useRevokeConceptShare,
  type ConceptShare,
} from '@/hooks/use-concept-shares';
import { toUserMessage } from '@/hooks/use-error-message';
import { useRecipientContact } from '@/hooks/use-outbound-shares';
import { composeZaloMessage } from '@/lib/zalo-share';
import { CONCEPT_PREVIEW_PARAM } from './public-concept';
import { Chip, Panel } from './tk-ui';

const TONE: Record<ConceptShare['status'], 'am' | 'gr' | 'mute'> = {
  cho_duyet: 'am',
  da_duyet: 'gr',
  het_han: 'mute',
  da_thu_hoi: 'mute',
};

export function ConceptSharePanel({ projectId }: { projectId: string }): React.ReactElement {
  const query = useConceptShares(projectId);
  const request = useRequestConceptShare(projectId);
  const [note, setNote] = useState('');
  const readiness = query.data?.readiness;
  const shares = query.data?.shares ?? [];

  return (
    <Panel title="Gửi khách xem">
      <p className="text-sm text-tk-t2">
        Khách mở đường dẫn trên điện thoại, xem mặt đứng, phối cảnh, ảnh phòng và sơ đồ công năng —
        không kích thước, không bản vẽ kỹ thuật, không tải về. Kiến trúc sư duyệt trước khi link mở
        được; link mở 14 ngày kể từ lúc duyệt và thu hồi được bất cứ lúc nào.
      </p>

      {query.isLoading ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : query.error ? (
        <p className="mt-3 text-sm text-status-overdue">{toUserMessage(query.error)}</p>
      ) : (
        <>
          {readiness?.can_request ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Ghi chú cho kiến trúc sư" optional className="flex-1">
                <Input
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: khách hẹn xem tối thứ Bảy"
                />
              </Field>
              <Button
                onClick={() => request.mutate(note, { onSuccess: () => setNote('') })}
                disabled={request.isPending}
              >
                <Link2 className="size-4" aria-hidden />
                {readiness.is_architect ? 'Tạo link gửi khách' : 'Đề nghị gửi khách'}
              </Button>
            </div>
          ) : (
            readiness?.reason && <p className="mt-3 text-sm text-tk-t2">{readiness.reason}</p>
          )}
          {request.error && (
            <p className="mt-2 text-sm text-status-overdue">
              {toUserMessage(request.error, 'create')}
            </p>
          )}

          {shares.length > 0 && (
            <ul className="mt-4 space-y-3">
              {shares.map((share) => (
                <ShareRow key={share.id} share={share} projectId={projectId} />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function ShareRow({ share, projectId }: { share: ConceptShare; projectId: string }) {
  const approve = useApproveConceptShare(projectId);
  const revoke = useRevokeConceptShare(projectId);
  const [askRevoke, setAskRevoke] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = share.token ? conceptShareUrl(share.token) : null;
  const error = approve.error ?? revoke.error;

  return (
    <li className="rounded-md border border-tk-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={TONE[share.status]}>{CONCEPT_SHARE_STATUS_LABEL[share.status]}</Chip>
        <span className="text-sm text-tk-t2">
          {share.requested_name ?? 'Không rõ'} đề nghị {formatDateTime(share.requested_at)}
        </span>
      </div>
      {share.note && <p className="mt-1 text-sm">{share.note}</p>}
      {share.approved_at && (
        <p className="mt-1 text-sm text-tk-t2">
          {share.approved_name ?? 'Kiến trúc sư'} duyệt {formatDateTime(share.approved_at)}
          {share.expires_at && <> · mở tới {formatDate(share.expires_at)}</>}
        </p>
      )}
      {share.approved_at && (
        <p className="mt-1 flex items-center gap-1 text-sm text-tk-t2">
          <Eye className="size-4" aria-hidden />
          {share.view_count > 0
            ? `${share.view_count} lượt xem · lần cuối ${formatDateTime(share.last_viewed_at!)}`
            : 'Khách chưa mở link'}
        </p>
      )}

      {link && share.status === 'da_duyet' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="max-w-full truncate rounded bg-tk-chip-mute px-2 py-1 text-xs">
            {link}
          </code>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
          >
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? 'Đã chép' : 'Chép link'}
          </Button>
          {share.can_send && <ConceptZaloSend share={share} projectId={projectId} link={link} />}
          <a
            href={`${link}?${CONCEPT_PREVIEW_PARAM}=1`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand"
            title="Mở đúng trang khách thấy — không tính vào lượt xem của khách"
          >
            <ExternalLink className="size-4" aria-hidden />
            Xem như khách
          </a>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {share.can_approve && (
          <Button size="sm" onClick={() => approve.mutate(share.id)} disabled={approve.isPending}>
            Duyệt gửi khách
          </Button>
        )}
        {share.can_revoke && (
          <Button size="sm" variant="secondary" onClick={() => setAskRevoke(true)}>
            {share.status === 'cho_duyet' ? 'Huỷ đề nghị' : 'Thu hồi link'}
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-status-overdue">{toUserMessage(error, 'approve')}</p>
      )}

      {askRevoke && (
        <ConfirmDialog
          title={share.status === 'cho_duyet' ? 'Huỷ đề nghị gửi khách' : 'Thu hồi link gửi khách'}
          confirmLabel={share.status === 'cho_duyet' ? 'Huỷ đề nghị' : 'Thu hồi'}
          danger
          pending={revoke.isPending}
          onCancel={() => setAskRevoke(false)}
          onConfirm={() => revoke.mutate(share.id, { onSettled: () => setAskRevoke(false) })}
        >
          {share.status === 'cho_duyet'
            ? 'Đề nghị này sẽ không được duyệt nữa. Muốn gửi lại thì tạo đề nghị mới.'
            : 'Khách mở link sẽ thấy «link đã hết hạn». Không mở lại được — muốn gửi lại thì tạo link mới.'}
        </ConfirmDialog>
      )}
    </li>
  );
}

function ConceptZaloSend({
  share,
  projectId,
  link,
}: {
  share: ConceptShare;
  projectId: string;
  link: string;
}) {
  const project = useConceptProjectContact(projectId).data;
  const contact = useRecipientContact({
    customerId: project?.customer_id ?? null,
    opportunityId: project?.opportunity_id ?? null,
  }).data;
  const companyName = useCompanyLookup()(project?.company_id ?? null)?.short_name ?? null;
  return (
    <ZaloSend
      canSend={share.can_send}
      size="sm"
      showHistory={false}
      entityType="design_concept_shares"
      entityId={share.id}
      shareLinkId={share.id}
      phone={contact?.phone ?? null}
      message={composeZaloMessage({
        recipientName: contact?.name ?? null,
        companyName,
        subject: 'phương án ý tưởng ngôi nhà để Quý khách hình dung (chưa phải bản thiết kế)',
        link: { url: link, expiresAt: share.expires_at },
      })}
    />
  );
}
