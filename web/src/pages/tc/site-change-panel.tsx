/**
 * Tab «Phát sinh» của công trình — đề xuất phát sinh lập từ công trường (T1, migration 0241).
 *
 * Chỉ huy trưởng lập trên điện thoại: chọn nguyên nhân (bấm, không gõ), mô tả, vị trí, chụp ảnh, số đo,
 * khối lượng ước tính, ảnh hưởng tiến độ. Gửi xong người chịu trách nhiệm hợp đồng (Kinh doanh / Dự án)
 * được báo và lập báo giá phát sinh ở phân hệ Hợp đồng.
 *
 * Thi công KHÔNG xem phân hệ Hợp đồng: thẻ chỉ hiện trạng thái + ai đang giữ (hàm
 * `site_change_proposal_states`, không có cột tiền) — không bao giờ có giá.
 *
 * «Khẩn cấp — đã làm trước» (anh Dũng chốt): chọn người đã cho phép (Trưởng phòng Thi công / Ban Giám
 * đốc). Người đó tự bấm «Xác nhận đã cho phép» — chỉ huy trưởng không tự cho phép mình, CSDL chặn.
 */

import { useState, type FormEvent } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  SITE_CHANGE_CAUSES,
  SITE_CHANGE_CAUSE_LABELS,
  SITE_CHANGE_STATUS_META,
  formatDateTime,
  formatDeadline,
  formatWaiting,
  type SiteChangeCause,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { TEXTAREA_BOX, FIELD_BOX } from '@/components/ui/field-box';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useAuthorizeSiteChangeEmergency,
  useCreateSiteChangeProposal,
  useIsSiteSuperior,
  useSiteChangeAuthorizers,
  useSiteChangeProposals,
  useSiteChangeStates,
  type SiteChangeProposal,
  type SiteChangeState,
} from '@/hooks/use-site-changes';
import { uploadConstructionPhotos } from '@/hooks/use-site-photos';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { PhotoStrip, SitePhotoPicker } from './site-photo-picker';

const EMPTY_FORM = {
  cause: '' as SiteChangeCause | '',
  description: '',
  location: '',
  measurements: '',
  quantity: '',
  unit: '',
  scheduleDays: '',
  isEmergency: false,
  requestedTo: '',
  emergencyNote: '',
};

/** Đơn vị hay dùng — bấm chọn thay vì gõ (ngân sách thao tác công trường, CLAUDE.md 4.6). */
const UNIT_SUGGESTIONS = ['m3', 'm2', 'm', 'kg', 'tấn', 'cái', 'bộ', 'công'];

export function SiteChangePanel({
  siteId,
  companyId,
  hasContract,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  hasContract: boolean;
  readOnly: boolean;
}) {
  const { data: proposals, isLoading } = useSiteChangeProposals({ siteId });
  const { data: states } = useSiteChangeStates(siteId);
  const { data: authorizers } = useSiteChangeAuthorizers(readOnly ? undefined : companyId);
  const create = useCreateSiteChangeProposal();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!form.cause) {
      setError('Vui lòng chọn nguyên nhân phát sinh.');
      return;
    }
    if (!form.description.trim()) {
      setError('Vui lòng mô tả phát sinh.');
      return;
    }
    if (form.isEmergency && !form.requestedTo) {
      setError(
        'Việc đã làm trước phải ghi người đã cho phép (Trưởng phòng Thi công hoặc Ban Giám đốc).',
      );
      return;
    }
    const quantity = form.quantity.trim().replace(',', '.');
    if (quantity && !/^\d+(\.\d+)?$/.test(quantity)) {
      setError('Khối lượng ước tính chỉ gồm chữ số, ví dụ 12,5.');
      return;
    }
    const days = form.scheduleDays.trim();
    if (days && !/^-?\d+$/.test(days)) {
      setError('Ảnh hưởng tiến độ ghi bằng số ngày, ví dụ 3.');
      return;
    }
    setSaving(true);
    try {
      // Ảnh tải TRƯỚC, dòng ghi SAU — đề xuất không bao giờ trỏ vào ảnh chưa có.
      const photoPaths =
        files.length > 0 ? await uploadConstructionPhotos(siteId, 'phat-sinh', files) : [];
      await create.mutateAsync({
        construction_site_id: siteId,
        company_id: companyId,
        cause: form.cause,
        description: form.description.trim(),
        location: form.location.trim() || null,
        measurements: form.measurements.trim() || null,
        estimated_quantity: quantity || null,
        quantity_unit: quantity ? form.unit.trim() || null : null,
        schedule_impact_days: days ? Number(days) : null,
        photo_paths: photoPaths,
        is_emergency: form.isEmergency,
        emergency_requested_to: form.isEmergency ? form.requestedTo : null,
        emergency_note: form.isEmergency ? form.emergencyNote.trim() || null : null,
        client_created_at: new Date().toISOString(),
        client_generated_id: crypto.randomUUID(),
      });
      setForm(EMPTY_FORM);
      setFiles([]);
      setAdding(false);
      setNotice(
        hasContract
          ? 'Đã gửi — người chịu trách nhiệm hợp đồng đã nhận thông báo để lập báo giá phát sinh.'
          : 'Đã gửi — công trình chưa gắn hợp đồng nên Ban Giám đốc nhận thông báo.',
      );
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    } finally {
      setSaving(false);
    }
  }

  const rows = proposals ?? [];

  return (
    <div className="space-y-4">
      {notice && (
        <p
          role="status"
          className="rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed"
        >
          {notice}
        </p>
      )}

      {!readOnly && !adding && (
        <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
          Đề xuất phát sinh
        </Button>
      )}

      {adding && (
        <form onSubmit={submit} noValidate className="space-y-4 rounded-card bg-surface p-4">
          <p className="font-medium">Đề xuất phát sinh / biên bản hiện trường</p>

          <Field label="Nguyên nhân" required group>
            <div className="grid grid-cols-2 gap-2">
              {SITE_CHANGE_CAUSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={form.cause === c}
                  onClick={() => setForm((f) => ({ ...f, cause: c }))}
                  className={cn(
                    'min-h-11 rounded-field border px-3 py-2 text-left',
                    form.cause === c
                      ? 'border-brand bg-brand-subtle font-semibold text-fg'
                      : 'border-border-strong bg-surface text-fg',
                  )}
                >
                  {SITE_CHANGE_CAUSE_LABELS[c]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Mô tả phát sinh" required>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Nền đất yếu khu móng trục A, phải gia cố cọc tre"
              className={TEXTAREA_BOX}
            />
          </Field>

          {/* Nút chụp ảnh luôn hiện, không nằm sau menu (AFD 4.8). */}
          <SitePhotoPicker files={files} onChange={setFiles} disabled={saving} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vị trí / hạng mục" optional>
              <Input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Móng trục A1–A4"
              />
            </Field>
            <Field label="Số đo hiện trạng" optional>
              <Input
                value={form.measurements}
                onChange={(e) => setForm((f) => ({ ...f, measurements: e.target.value }))}
                placeholder="Lún 12 cm sau khi đào"
              />
            </Field>
            <Field label="Khối lượng ước tính" optional>
              <div className="flex gap-2">
                <Input
                  value={form.quantity}
                  inputMode="decimal"
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  placeholder="35,5"
                  className="w-28"
                />
                <Input
                  value={form.unit}
                  list="site-change-units"
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="m3"
                  aria-label="Đơn vị"
                  className="w-24"
                />
                <datalist id="site-change-units">
                  {UNIT_SUGGESTIONS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </Field>
            <Field label="Ảnh hưởng tiến độ (ngày)" optional>
              <Input
                value={form.scheduleDays}
                inputMode="numeric"
                onChange={(e) => setForm((f) => ({ ...f, scheduleDays: e.target.value }))}
                placeholder="3"
                className="w-28"
              />
            </Field>
          </div>

          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={form.isEmergency}
              onChange={(e) => setForm((f) => ({ ...f, isEmergency: e.target.checked }))}
            />
            <span>Khẩn cấp — đã làm trước, hồ sơ hoàn thiện sau</span>
          </label>

          {form.isEmergency && (
            <div className="grid gap-3 rounded-sm bg-status-overdue-bg p-3 sm:grid-cols-2">
              <Field
                label="Người đã cho phép"
                required
                hint="Người này nhận thông báo và tự xác nhận trên hệ thống. Chỉ huy trưởng không tự cho phép được."
              >
                <select
                  value={form.requestedTo}
                  onChange={(e) => setForm((f) => ({ ...f, requestedTo: e.target.value }))}
                  className={cn(FIELD_BOX, 'w-full')}
                >
                  <option value="">Chọn Trưởng phòng Thi công / Ban Giám đốc</option>
                  {(authorizers ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lý do làm trước" optional>
                <Input
                  value={form.emergencyNote}
                  onChange={(e) => setForm((f) => ({ ...f, emergencyNote: e.target.value }))}
                  placeholder="Mưa lớn, phải đổ bê tông lót ngay"
                />
              </Field>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="lg" disabled={saving}>
              {saving ? 'Đang gửi…' : 'Gửi đề xuất'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Hủy
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState message="Chưa có đề xuất phát sinh. Gặp việc ngoài hợp đồng (chủ đầu tư yêu cầu, thiết kế đổi, hiện trường khác hồ sơ) thì lập đề xuất tại đây kèm ảnh — văn phòng lập báo giá phát sinh." />
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <ProposalCard key={p.id} proposal={p} state={states?.[p.id]} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalCard({
  proposal: p,
  state,
}: {
  proposal: SiteChangeProposal;
  state: SiteChangeState | undefined;
}) {
  const promptDialog = usePromptDialog();
  const { profile } = useAuth();
  const { data: isSuperior } = useIsSiteSuperior(
    p.is_emergency && !p.emergency_authorized_by ? profile?.id : undefined,
    p.company_id,
  );
  const authorize = useAuthorizeSiteChangeEmergency();
  const [error, setError] = useState<string | null>(null);

  const meta = state ? SITE_CHANGE_STATUS_META[state.display_status] : null;
  const holder =
    state?.holder_label &&
    (state.holder_names.length > 0
      ? `${state.holder_label} — ${state.holder_names.join(', ')}`
      : state.holder_label);

  async function onAuthorize() {
    const note = await promptDialog.ask({
      title: 'Xác nhận đã cho phép làm trước?',
      label: 'Ghi chú',
      confirmLabel: 'Xác nhận đã cho phép',
      required: false,
    });
    if (note === null) return;
    setError(null);
    try {
      await authorize.mutateAsync({ proposalId: p.id, note: note.trim() || null });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <li className="space-y-2 rounded-card bg-surface p-4">
      {promptDialog.dialog}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-fg-subtle">
            {p.code} · {SITE_CHANGE_CAUSE_LABELS[p.cause]}
          </p>
          <p className="whitespace-pre-wrap text-fg">{p.description}</p>
        </div>
        {meta && <StatusLozenge status={meta.statusGroup} />}
      </div>

      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        {meta && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-subtle">Bước hiện tại:</dt>
            <dd>{meta.label}</dd>
          </div>
        )}
        {holder && !state?.is_closed && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-subtle">Đang giữ:</dt>
            <dd>{holder}</dd>
          </div>
        )}
        {state && !state.is_closed && state.waiting_since && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-subtle">Thời gian chờ:</dt>
            <dd>{formatWaiting(state.waiting_since)}</dd>
          </div>
        )}
        {state &&
          (state.display_status === 'da_gui' || state.display_status === 'dang_bao_gia') && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-fg-subtle">Hạn xử lý của văn phòng:</dt>
              <dd>
                {state.due_at ? (
                  <strong>{formatDeadline(state.due_at)}</strong>
                ) : (
                  <span className="text-fg-subtle">Chưa có thời hạn cam kết</span>
                )}
              </dd>
            </div>
          )}
        {p.location && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-subtle">Vị trí:</dt>
            <dd>{p.location}</dd>
          </div>
        )}
        {p.measurements && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-subtle">Số đo:</dt>
            <dd>{p.measurements}</dd>
          </div>
        )}
        {p.estimated_quantity != null && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-subtle">Khối lượng ước tính:</dt>
            <dd>
              {Number(p.estimated_quantity).toLocaleString('vi-VN')} {p.quantity_unit ?? ''}
            </dd>
          </div>
        )}
        {p.schedule_impact_days != null && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-subtle">Ảnh hưởng tiến độ:</dt>
            <dd>{p.schedule_impact_days} ngày</dd>
          </div>
        )}
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-fg-subtle">Người lập:</dt>
          <dd>
            {p.creator?.full_name ?? '—'} · {formatDateTime(p.created_at)}
          </dd>
        </div>
        {state?.amendment_code && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-subtle">Phát sinh hợp đồng:</dt>
            <dd>{state.amendment_code}</dd>
          </div>
        )}
      </dl>

      {p.is_emergency && (
        <p className="flex gap-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-sm text-status-overdue">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Khẩn cấp — đã làm trước.{' '}
            {p.emergency_authorized_by ? (
              <>
                Người cho phép: <strong>{p.authorizer?.full_name ?? '—'}</strong>
                {p.emergency_authorized_at && ` · ${formatDateTime(p.emergency_authorized_at)}`}
              </>
            ) : (
              <>
                Chờ <strong>{p.requested_to?.full_name ?? 'người có thẩm quyền'}</strong> xác nhận
                đã cho phép.
              </>
            )}
            {p.emergency_note && ` ${p.emergency_note}`}
          </span>
        </p>
      )}

      {p.reject_reason && (
        <p className="text-sm text-fg-subtle">Lý do không lập: {p.reject_reason}</p>
      )}

      <PhotoStrip paths={p.photo_paths} />

      {p.is_emergency &&
        !p.emergency_authorized_by &&
        isSuperior &&
        p.created_by !== profile?.id && (
          <Button
            variant="primary"
            onClick={() => void onAuthorize()}
            disabled={authorize.isPending}
          >
            Xác nhận đã cho phép làm trước
          </Button>
        )}
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
    </li>
  );
}
