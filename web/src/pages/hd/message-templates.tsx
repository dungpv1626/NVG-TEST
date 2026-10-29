/**
 * «Mẫu lời nhắn» (0239) — lời nhắn Zalo và email gửi khách kèm báo giá, theo từng pháp nhân.
 *
 * Mẫu bố cục Danh sách + khối sửa tại chỗ (cùng kiểu khối «Thông tin pháp nhân» của trang Mẫu hợp đồng), không
 * phải mẫu bố cục mới. Ban Giám đốc / Quản trị sửa; người khác chỉ xem — CSDL quyết
 * (`auth_can_manage_message_templates`). Chưa sửa lần nào thì đang dùng mẫu mặc định của hệ thống.
 * Khi gửi, người gửi thấy lời đã điền và sửa được cho riêng lần gửi đó.
 */

import { useMemo, useState } from 'react';
import {
  DEFAULT_QUOTE_MESSAGE_TEMPLATES,
  effectiveMessageTemplate,
  fillMessageTemplate,
  formatDateTime,
  QUOTE_MESSAGE_PLACEHOLDERS,
  unknownMessagePlaceholders,
  type MessageChannel,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { TEXTAREA_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { showToast } from '@/components/ui/toast';
import { useTransactionalCompanies } from '@/hooks/use-contract-templates';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useMessageTemplateRows,
  useSaveMessageTemplate,
  type MessageTemplateRow,
} from '@/hooks/use-message-templates';
import { useAuth } from '@/lib/auth';
import { HdNav } from './hd-nav';

const MANAGER_ROLES = ['TGD', 'CFO', 'BGD', 'ADMIN'];

const CHANNEL_LABELS: Record<MessageChannel, string> = {
  zalo: 'Lời nhắn Zalo',
  email: 'Email',
};

/** Giá trị mẫu cho phần xem trước — không phải dữ liệu thật. */
const SAMPLE = {
  ten_khach: 'Ông Trần Văn Phát',
  ma_bao_gia: 'NVC-BG-2026-0012',
  gia_tri: '1.250.000.000 đồng',
  hieu_luc: '30/11/2026',
  nguoi_gui: 'Nguyễn Văn A',
  sdt_nguoi_gui: '091 234 5678',
  ten_cong_trinh: 'Nhà xưởng Phát Đạt',
};

export function MessageTemplatesPage() {
  const { profile } = useAuth();
  const canManage = profile?.assignments?.some((a) => MANAGER_ROLES.includes(a.roleCode)) ?? false;
  const companies = useTransactionalCompanies();
  const visible = useMemo(() => {
    const scope = new Set(profile?.scopeCompanies.map((c) => c.companyId) ?? []);
    return (companies.data ?? []).filter((c) => scope.has(c.id));
  }, [companies.data, profile]);
  const rows = useMessageTemplateRows(visible.map((c) => c.id));

  return (
    <>
      <PageHeader
        title="Mẫu lời nhắn"
        description="Lời nhắn Zalo và email gửi khách kèm báo giá, theo từng pháp nhân. Khi gửi, người gửi sửa được cho riêng lần đó."
        breadcrumbs={[{ label: 'Hợp đồng', to: '/hd/hop-dong' }, { label: 'Mẫu lời nhắn' }]}
      />
      <HdNav />

      {!canManage && (
        <p className="mb-3 rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
          Chỉ xem. Ban Giám đốc hoặc Quản trị hệ thống sửa mẫu lời nhắn.
        </p>
      )}

      {companies.isLoading || rows.isLoading ? (
        <CardGridSkeleton count={2} />
      ) : companies.error || rows.error ? (
        <ErrorState
          message={toUserMessage(companies.error ?? rows.error)}
          onRetry={() => void rows.refetch()}
        />
      ) : (
        <div className="space-y-6">
          {visible.map((c) => (
            <section key={c.id} className="space-y-3">
              <h2 className="text-md font-semibold">{c.legal_name}</h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {(['zalo', 'email'] as const).map((channel) => (
                  <TemplateCard
                    key={`${c.id}-${channel}`}
                    companyId={c.id}
                    companyName={c.legal_name}
                    channel={channel}
                    saved={rows.data?.find((r) => r.company_id === c.id && r.channel === channel)}
                    canEdit={canManage}
                  />
                ))}
              </div>
            </section>
          ))}
          <PlaceholderList />
        </div>
      )}
    </>
  );
}

function TemplateCard({
  companyId,
  companyName,
  channel,
  saved,
  canEdit,
}: {
  companyId: string;
  companyName: string;
  channel: MessageChannel;
  saved: MessageTemplateRow | undefined;
  canEdit: boolean;
}) {
  const current = effectiveMessageTemplate(channel, saved);
  const [subject, setSubject] = useState(current.subject ?? '');
  const [body, setBody] = useState(current.body);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveMessageTemplate();
  const dirty =
    body !== current.body || (channel === 'email' && subject !== (current.subject ?? ''));
  const unknown = unknownMessagePlaceholders(`${subject}\n${body}`);
  const values = { ...SAMPLE, phap_nhan: companyName };
  const preview = fillMessageTemplate(body, values).text;
  const previewSubject = channel === 'email' ? fillMessageTemplate(subject, values).text : null;

  async function submit() {
    setError(null);
    if (!body.trim()) return setError('Vui lòng nhập nội dung lời nhắn.');
    if (channel === 'email' && !subject.trim()) return setError('Vui lòng nhập tiêu đề email.');
    if (unknown.length > 0) {
      return setError(
        `Chỗ trống chưa có trong danh sách: ${unknown.map((u) => `{${u}}`).join(', ')}. Sửa tên theo bảng bên dưới.`,
      );
    }
    try {
      await save.mutateAsync({
        companyId,
        channel,
        subject: channel === 'email' ? subject.trim() : null,
        body: body.trim(),
      });
      showToast({ message: `Đã lưu ${CHANNEL_LABELS[channel].toLowerCase()} của ${companyName}` });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-3 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{CHANNEL_LABELS[channel]}</h3>
        <span className="text-xs text-fg-subtle">
          {saved
            ? `Sửa lần cuối ${formatDateTime(saved.updated_at)}${saved.updater ? ` bởi ${saved.updater.full_name}` : ''}`
            : 'Đang dùng mẫu mặc định của hệ thống'}
        </span>
      </div>
      {channel === 'email' && (
        <Field label="Tiêu đề" required>
          <Input value={subject} disabled={!canEdit} onChange={(e) => setSubject(e.target.value)} />
        </Field>
      )}
      <Field label="Nội dung" required>
        <textarea
          value={body}
          disabled={!canEdit}
          onChange={(e) => setBody(e.target.value)}
          rows={channel === 'email' ? 14 : 6}
          className={TEXTAREA_BOX}
        />
      </Field>
      {unknown.length > 0 && (
        <p className="text-status-overdue">
          Chỗ trống lạ: {unknown.map((u) => `{${u}}`).join(', ')} — sẽ in nguyên chữ khi gửi.
        </p>
      )}
      <div>
        <p className="text-xs font-medium text-fg-subtle">Xem trước với dữ liệu ví dụ</p>
        <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-sm bg-surface-sunken px-3 py-2 text-sm">
          {previewSubject && <p className="mb-2 font-medium">{previewSubject}</p>}
          {preview}
        </div>
      </div>
      {error && <p className="text-status-overdue">{error}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => void submit()}
          >
            {save.isPending ? 'Đang lưu…' : 'Lưu mẫu'}
          </Button>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              const d = DEFAULT_QUOTE_MESSAGE_TEMPLATES[channel];
              setBody(d.body);
              setSubject(d.subject ?? '');
            }}
          >
            Điền lại mẫu mặc định
          </Button>
        </div>
      )}
    </div>
  );
}

function PlaceholderList() {
  return (
    <section className="rounded-card bg-surface p-4">
      <h2 className="font-semibold">Chỗ trống dùng được</h2>
      <p className="text-fg-subtle">
        Gõ đúng tên trong ngoặc nhọn. Chỗ chưa có dữ liệu khi gửi sẽ hiện dải chấm để người gửi
        điền.
      </p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {QUOTE_MESSAGE_PLACEHOLDERS.map((p) => (
          <li key={p.key}>
            <code className="rounded bg-surface-sunken px-1">{`{${p.key}}`}</code> — {p.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
