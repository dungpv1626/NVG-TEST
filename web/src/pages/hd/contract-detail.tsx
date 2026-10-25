/**
 * Chi tiết Hợp đồng — "Hồ sơ 360°" (Webapp Flow 4.3).
 *
 * Đây là màn hình chứng minh tiêu chí nghiệm thu Giai đoạn 1 (PRD Mục 7): từ một hợp đồng
 * phải truy ngược được về đúng cơ hội gốc, đúng phiên bản dự toán đã duyệt, ai duyệt và khi
 * nào. Panel ngữ cảnh bên phải chính là đường đi đó, và nó KHÔNG chép dữ liệu — chỉ liên kết.
 *
 * Nút hành động chính đổi theo bước, mỗi lúc chỉ MỘT nút chính (Content Guidelines 6.3):
 * Nháp → Trình ký · Đã duyệt → Ghi nhận đã ký · Đã ký → Quyết toán.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CONTRACT_FLOW,
  CONTRACT_SOURCE_LABELS,
  CONTRACT_SOURCE_ROUTES,
  CONTRACT_STAGE_META,
  CONTRACT_TYPE_LABELS,
  SITE_STAGE_META,
  contractDisplayStatus,
  contractOpensSite,
  formatCurrency,
  formatDate,
  formatDateTime,
  summarizeContractValue,
} from '@nvg/shared';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import {
  useCloseContract,
  useContract,
  useContractAmendments,
  useSubmitContractApproval,
  useUpdateContract,
} from '@/hooks/use-contracts';
import {
  useContractHasSite,
  useOpenSiteFromContract,
  useSitesOfContract,
} from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan, useIsResponsible } from '@/lib/auth';
import { RecordChain } from '@/components/entity/record-chain';
import { StepTrack } from '@/components/entity/step-track';
import { WaitingOn } from '@/components/entity/waiting-on';
import { useApprovalHistory } from '@/hooks/use-approvals';
import { useStageReadiness } from '@/hooks/use-stage-readiness';
import { AfterSignCard } from './after-sign-card';
import { AmendmentPanel } from './amendment-panel';
import { DocumentPanel } from './document-panel';
import { TermsPanel } from './terms-panel';
import { SignContractDialog } from './sign-contract-dialog';
import { SignedScanLink } from './signed-scan-link';
import { SignedScanPanel } from './signed-scan-panel';
import { revealById } from '@/components/ui/split-workspace';

const EM_DASH = '—';

export function ContractDetailPage() {
  const promptDialog = usePromptDialog();
  const { id } = useParams<{ id: string }>();
  const canEdit = useCan('HD', 'edit');
  // Tách vai (0157): người chịu trách nhiệm soạn và gửi; người có quyền PHÊ DUYỆT hợp đồng
  // (Ban Giám đốc) ghi nhận ký, quyết toán, hủy sau duyệt; Thi công hoặc BGĐ mở công trình.
  // Nút ẩn hẳn khi không có quyền — không hiện rồi báo lỗi (CLAUDE.md 5.4).
  const canApprove = useCan('HD', 'approve');
  const canApproveSite = useCan('TC', 'approve');

  const { data, isLoading, error } = useContract(id);
  const isResponsible = useIsResponsible(data?.responsible_user_id);
  const { data: amendments } = useContractAmendments(id);
  const { data: sites } = useSitesOfContract(id);
  const { data: hasSite } = useContractHasSite(id);
  const openSite = useOpenSiteFromContract();
  const updateContract = useUpdateContract();
  const submitApproval = useSubmitContractApproval();
  const closeContract = useCloseContract();
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: readiness = [] } = useStageReadiness('contract', id);
  const approvals = useApprovalHistory('contracts', id ? [id] : []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [signing, setSigning] = useState(false);
  // Bước đổi (ký xong, được duyệt…) thì mở luôn tab nơi làm việc của bước mới — trước đây ghi
  // nhận ký xong vẫn đứng ở tab Soạn hợp đồng đã khoá (anh Dũng 22/10/2026).
  const currentStage = data?.stage ?? null;
  const seenStage = useRef<string | null>(null);
  useEffect(() => {
    if (!currentStage) return;
    const previous = seenStage.current;
    seenStage.current = currentStage;
    if (previous === null || previous === currentStage) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.set('tab', currentStage === 'nhap' ? 'soan-thao' : 'tong-quan');
        return next;
      },
      { replace: true },
    );
  }, [currentStage, setSearchParams]);
  // Điều khoản + Văn bản gộp thành «Soạn hợp đồng» (21/10/2026) — đường dẫn cũ vẫn mở đúng chỗ.
  const legacyTab = searchParams.get('tab');
  useEffect(() => {
    if (legacyTab !== 'dieu-khoan' && legacyTab !== 'van-ban') return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.set('tab', 'soan-thao');
        return next;
      },
      { replace: true },
    );
  }, [legacyTab, setSearchParams]);
  const navigate = useNavigate();

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="hợp đồng"
        listPath="/hd/hop-dong"
        listLabel="Quay lại danh sách hợp đồng"
      />
    );
  }

  const contract = data;
  const isDraft = contract.stage === 'nhap';
  const isClosed = contract.stage === 'hoan_thanh' || contract.stage === 'huy';
  const canDraft = canEdit && isResponsible;
  const readOnly = !canDraft || isClosed;
  const beforeApproval = contract.stage === 'nhap' || contract.stage === 'cho_duyet';
  const canCancel = !isClosed && (canApprove || (beforeApproval && canDraft));

  /**
   * Mở công trình sau khi ký (TC-01).
   *
   * KHÔNG áp dụng cho hợp đồng khoán tổ đội: đó là hợp đồng NVG đi THUÊ, nằm bên trong một
   * công trình đã có chứ không sinh ra công trình mới — CSDL cũng từ chối nếu vẫn gọi.
   */
  // `hasSite === false` chứ không `!hasSite`: chưa tải xong hoặc ngoài phạm vi (null) thì KHÔNG
  // mời mở — nút chính hiện nhầm trên hợp đồng đã có công trình là lỗi đã gặp (0144).
  const canOpenSite =
    (canApprove || canApproveSite) &&
    contract.stage === 'da_ky' &&
    contractOpensSite(contract.type) &&
    hasSite === false;

  // Chỉ cộng phát sinh ĐÃ PHÊ DUYỆT vào giá trị hiện hành: phát sinh đang đề xuất chưa phải
  // là cam kết, cộng sớm thì báo cáo doanh thu chạy trước thực tế (HD-03).
  const approvedAmendments = (amendments ?? [])
    .filter((a) => a.stage === 'da_duyet' || a.stage === 'da_thuc_hien')
    .reduce((sum, a) => sum + BigInt(String(a.value_change ?? 0).split('.')[0] || '0'), 0n);

  const money = summarizeContractValue(
    contract.value,
    approvedAmendments,
    contract.collected_amount,
  );

  // Tab nơi làm việc của từng bước — mở hồ sơ là tới đúng chỗ (phản hồi chủ dự án).
  const stageTab = contract.stage === 'nhap' ? 'soan-thao' : 'tong-quan';
  function openTab(tab: string, anchor?: string) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
    if (anchor) {
      // Đích có thể nằm trong tab đang ẩn của khung hai ngăn «Soạn hợp đồng» — `revealById` mở tab ấy trước.
      requestAnimationFrame(() => revealById(anchor));
    }
  }

  // Điều kiện bước kế tiếp (0163) — cùng điều kiện với hàm CSDL chặn, nên nút không thể nói
  // «được» khi CSDL nói «không».
  const nextStage =
    contract.stage === 'nhap' ? 'cho_duyet' : contract.stage === 'da_ky' ? 'hoan_thanh' : null;
  // Hợp đồng thi công đã ký mà chưa có công trình: «mọi công trình đã bàn giao» đúng một cách rỗng
  // — thêm điều kiện mở công trình (CSDL chặn cùng điều kiện, 0187).
  const siteRow =
    contract.stage === 'da_ky' && contract.type === 'thi_cong' && hasSite === false
      ? [
          {
            for_stage: 'hoan_thanh',
            requirement: 'site_opened',
            met: false,
            label: 'Đã mở công trình (Ban Giám đốc / Thi công bấm «Mở công trình»)',
            waivable: false,
          },
        ]
      : [];
  const readinessAll = [...siteRow, ...readiness];
  const missing = readinessAll.filter((r) => r.for_stage === nextStage && !r.met);
  const nextRequirements = readinessAll
    .filter((r) => r.for_stage === nextStage)
    .map((r) => ({
      // Câu của CSDL (0176) còn gọi «tab Văn bản» — tab đã gộp vào «Soạn hợp đồng».
      label: r.label.replace('(tab Văn bản)', '(tab Soạn hợp đồng)'),
      met: r.met,
      action:
        r.requirement === 'terms_complete' && canDraft ? (
          <button
            type="button"
            className="font-medium text-brand underline-offset-2 hover:underline"
            onClick={() => openTab('soan-thao', 'dieu-khoan')}
          >
            Ghi điều khoản
          </button>
        ) : r.requirement === 'document_ready' && canDraft ? (
          // 0176: pháp nhân có mẫu Word thì gửi duyệt phải kèm văn bản.
          <button
            type="button"
            className="font-medium text-brand underline-offset-2 hover:underline"
            onClick={() => openTab('soan-thao')}
          >
            Lập văn bản
          </button>
        ) : undefined,
    }));
  const pendingApproval = (approvals.data?.get(contract.id) ?? []).find(
    (a) => a.final_decision === null,
  );

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  function sign() {
    setSigning(true);
  }

  async function cancel() {
    const reason = await promptDialog.ask({
      title: 'Hủy hợp đồng?',
      label: 'Nguyên nhân hủy',
      confirmLabel: 'Hủy hợp đồng',
      danger: true,
    });
    if (reason === null) return;
    void run(() => closeContract.mutateAsync({ contractId: contract.id, stage: 'huy', reason }));
  }

  const hasAnyAction =
    (isDraft && canDraft) ||
    (contract.stage === 'da_duyet' && (canApprove || canDraft)) ||
    canOpenSite ||
    (contract.stage === 'da_ky' && canApprove) ||
    canCancel;

  const actions = !hasAnyAction ? undefined : (
    <>
      {isDraft && canDraft && (
        <Button
          variant="primary"
          disabled={submitApproval.isPending || missing.length > 0}
          title={missing.length > 0 ? `Cần: ${missing.map((m) => m.label).join('; ')}` : undefined}
          onClick={() => void run(() => submitApproval.mutateAsync({ contractId: contract.id }))}
        >
          Gửi phê duyệt
        </Button>
      )}
      {contract.stage === 'da_duyet' && (canApprove || canDraft) && (
        <Button variant="primary" onClick={sign}>
          Ghi nhận đã ký
        </Button>
      )}
      {canOpenSite && (
        <Button
          variant="primary"
          disabled={openSite.isPending}
          onClick={() =>
            // Mở xong thì sang thẳng công trình — việc kế tiếp (phân công chỉ huy trưởng, ngày
            // khởi công) nằm ở đó, không ở hợp đồng.
            void run(async () => {
              const siteId = await openSite.mutateAsync({ contractId: contract.id });
              void navigate(`/tc/cong-trinh/${siteId}`);
            })
          }
        >
          Mở công trình
        </Button>
      )}
      {contract.stage === 'da_ky' && canApprove && (
        // Chỉ MỘT nút chính mỗi màn hình (Content Guidelines 6.3): còn phải mở công trình
        // thì đó mới là việc tiếp theo, quyết toán lùi xuống nút phụ.
        <Button
          variant={canOpenSite ? 'secondary' : 'primary'}
          disabled={missing.length > 0}
          title={missing.length > 0 ? `Cần: ${missing.map((m) => m.label).join('; ')}` : undefined}
          onClick={() =>
            void run(() =>
              closeContract.mutateAsync({ contractId: contract.id, stage: 'hoan_thanh' }),
            )
          }
        >
          Quyết toán hợp đồng
        </Button>
      )}
      {canCancel && (
        <Button variant="secondary" onClick={cancel}>
          Hủy hợp đồng
        </Button>
      )}
    </>
  );

  // Đã duyệt mà chưa ký: nói rõ việc tiếp theo và ai làm — nút «Ghi nhận đã ký» chỉ Ban Giám đốc
  // thấy, nên Kinh doanh trước đây chỉ thấy dải tiến trình báo «Đã ký» mà không thấy nút đâu
  // (anh Dũng 22/10/2026).
  const signNotice =
    contract.stage === 'da_duyet'
      ? canApprove || canDraft
        ? `Hợp đồng đã được phê duyệt. Tải văn bản đã duyệt (mục «Các phiên bản đã lưu»), in và trình hai bên ký; ký xong bấm «Ghi nhận đã ký», ghi số hợp đồng, ngày ký${canApprove ? '' : ' và chụp bản đã ký tải lên — Ban Giám đốc không phải vào hệ thống'}.`
        : 'Hợp đồng đã được phê duyệt — chờ người chịu trách nhiệm hoặc Ban Giám đốc ghi nhận đã ký.'
      : contract.stage === 'da_ky'
        ? !hasSite && contractOpensSite(contract.type)
          ? 'Hợp đồng đã ký. Việc tiếp theo: Ban Giám đốc hoặc Thi công bấm «Mở công trình».'
          : isResponsible
            ? 'Hợp đồng đã ký — phần soạn và ký của Kinh doanh đã xong. Việc còn lại: nhắc khách theo các đợt thanh toán, lập phát sinh khi khách đổi hạng mục.'
            : 'Hợp đồng đã ký. Việc còn lại: theo dõi thu tiền theo các đợt; Ban Giám đốc quyết toán khi công trình đã bàn giao.'
        : null;
  const activeTab = searchParams.get('tab') ?? stageTab;

  return (
    <>
      {promptDialog.dialog}
      {signing && (
        <SignContractDialog
          contractId={contract.id}
          isApprover={canApprove}
          opensSite={
            contract.type === 'thi_cong' &&
            (contract.source_type ?? 'opportunities') === 'opportunities'
          }
          onClose={() => setSigning(false)}
        />
      )}
      {signNotice && (
        <p
          role="status"
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-status-progress bg-status-progress-bg px-3 py-2"
        >
          <span className="min-w-0 flex-1">{signNotice}</span>
          {contract.stage === 'da_ky' && activeTab !== 'tong-quan' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openTab('tong-quan', 'sau-khi-ky')}
            >
              Xem việc còn lại
            </Button>
          )}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[{ label: 'Hợp đồng', to: '/hd/hop-dong' }, { label: contract.title }]}
        title={contract.title}
        code={contract.contract_number ?? contract.code}
        status={contractDisplayStatus(contract.stage, contract.end_date)}
        responsiblePerson={contract.responsible?.full_name ?? null}
        deadline={contract.end_date}
        progress={
          <>
            <RecordChain kind="contract" id={contract.id} />
            <StepTrack
              flow={CONTRACT_FLOW}
              current={contract.stage}
              nextRequirements={nextRequirements}
              holder={contract.stage === 'nhap' ? (contract.responsible?.full_name ?? null) : null}
            />
            {pendingApproval && (
              <div className="-mt-2 mb-4 rounded-md border border-border bg-surface px-3 py-2 lg:-mt-4 lg:mb-6">
                <WaitingOn approvalId={pendingApproval.id} canNudge={canDraft} />
              </div>
            )}
          </>
        }
        actions={actions}
        defaultTab={stageTab}
        tabs={[
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <>
                {contract.stage === 'da_ky' && (
                  <AfterSignCard
                    contractId={contract.id}
                    customer={contract.customer}
                    collected={money.collected}
                    currentValue={money.currentValue}
                    hasSite={hasSite}
                    opensSite={contractOpensSite(contract.type)}
                    isResponsible={isResponsible}
                    canApprove={canApprove}
                    onOpenAmendments={() => openTab('phat-sinh')}
                    hasScan={Boolean(contract.signed_scan_path)}
                  />
                )}
                {(contract.stage === 'da_ky' || contract.stage === 'hoan_thanh') && (
                  <SignedScanPanel
                    contract={contract}
                    canManage={canApprove || (canEdit && isResponsible)}
                  />
                )}
                <DetailFields
                  fields={[
                    { label: 'Trạng thái', value: CONTRACT_STAGE_META[contract.stage].label },
                    { label: 'Loại hợp đồng', value: CONTRACT_TYPE_LABELS[contract.type] },
                    { label: 'Mã hồ sơ nội bộ', value: contract.code },
                    {
                      label: 'Số hợp đồng',
                      value: contract.contract_number ?? 'Chưa ký',
                    },
                    {
                      label: 'Đối tác',
                      value: contract.customer ? (
                        <Link
                          to={`/crm/khach-hang/${contract.customer.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {contract.customer.name}
                        </Link>
                      ) : (
                        (contract.partner_name ?? EM_DASH)
                      ),
                    },
                    {
                      label: 'Ngày ký',
                      value: contract.signed_date ? formatDate(contract.signed_date) : EM_DASH,
                    },
                    ...(contract.signed_scan_path
                      ? [
                          {
                            label: 'Bản đã ký',
                            value: <SignedScanLink path={contract.signed_scan_path} />,
                          },
                        ]
                      : []),
                    {
                      label: 'Thời gian thực hiện',
                      value:
                        contract.start_date || contract.end_date
                          ? `${contract.start_date ? formatDate(contract.start_date) : 'chưa ghi ngày bắt đầu'} — ${
                              contract.end_date
                                ? formatDate(contract.end_date)
                                : 'chưa ghi ngày kết thúc'
                            }`
                          : EM_DASH,
                    },
                    {
                      label: 'Nguyên nhân hủy',
                      value: contract.cancel_reason ?? EM_DASH,
                    },
                  ]}
                />

                {/* HD-03: giá trị, phát sinh, đã thu, còn phải thu — bốn con số phải nằm
                    cạnh nhau, vì câu hỏi thường gặp nhất là "còn phải thu bao nhiêu". */}
                <section className="mt-4 rounded-card bg-surface-sunken p-4">
                  <p className="mb-3 font-medium">Giá trị và công nợ</p>
                  <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-fg-subtle">Giá trị gốc</dt>
                      <dd className="mt-0.5">{formatCurrency(money.baseValue)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Phát sinh đã duyệt</dt>
                      <dd className="mt-0.5">{formatCurrency(money.approvedAmendments)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Giá trị hiện hành</dt>
                      <dd className="mt-0.5 font-semibold">{formatCurrency(money.currentValue)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Còn phải thu</dt>
                      <dd className="mt-0.5 font-semibold">{formatCurrency(money.outstanding)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-fg-subtle">
                    Đã thu {formatCurrency(money.collected)}. Số liệu thu tiền do Module Kế toán cập
                    nhật khi có chứng từ.
                  </p>
                </section>

                <label className="mt-4 block">
                  <span className="block font-medium">Ghi chú</span>
                  {readOnly ? (
                    <p className="mt-1 whitespace-pre-wrap">{contract.notes ?? EM_DASH}</p>
                  ) : (
                    <textarea
                      defaultValue={contract.notes ?? ''}
                      rows={3}
                      className="mt-1 w-full rounded-field border border-border-strong bg-surface px-3 py-2"
                      onBlur={(e) =>
                        void run(() =>
                          updateContract.mutateAsync({
                            id: contract.id,
                            changes: { notes: e.target.value.trim() || null },
                          }),
                        )
                      }
                    />
                  )}
                </label>
              </>
            ),
          },
          {
            id: 'soan-thao',
            label: 'Soạn hợp đồng',
            fullWidth: true,
            content: (
              <DocumentPanel
                contract={contract}
                canDraft={canDraft && !isClosed}
                termsPanel={
                  <TermsPanel
                    contractId={contract.id}
                    companyId={contract.company_id}
                    readOnly={readOnly}
                    contractValue={contract.value}
                    contractType={contract.type}
                    priceForm={contract.price_form}
                    opportunityId={
                      contract.source_type === 'opportunities' ? contract.source_id : null
                    }
                  />
                }
              />
            ),
          },
          {
            id: 'phat-sinh',
            label: 'Phát sinh',
            badge: amendments?.length || undefined,
            content: (
              <AmendmentPanel
                contractId={contract.id}
                companyId={contract.company_id}
                readOnly={readOnly}
              />
            ),
          },
        ]}
        historyContent={
          <DetailFields
            fields={[
              { label: 'Tạo lúc', value: formatDateTime(contract.created_at) },
              { label: 'Cập nhật gần nhất', value: formatDateTime(contract.updated_at) },
              {
                label: 'Phê duyệt nội bộ',
                value: contract.approved_at ? formatDateTime(contract.approved_at) : EM_DASH,
              },
              {
                label: 'Ghi nhận đã ký',
                value: contract.signed_at ? formatDateTime(contract.signed_at) : EM_DASH,
              },
              {
                label: 'Quyết toán',
                value: contract.settled_at ? formatDateTime(contract.settled_at) : EM_DASH,
              },
            ]}
          />
        }
        related={[
          {
            title: 'Truy ngược hồ sơ',
            records: [
              ...(contract.source_type && contract.source_id
                ? [
                    {
                      label: CONTRACT_SOURCE_LABELS[contract.source_type],
                      value: 'Mở hồ sơ nguồn',
                      to: `${CONTRACT_SOURCE_ROUTES[contract.source_type]}/${contract.source_id}`,
                    },
                  ]
                : []),
              ...(contract.estimate
                ? [
                    {
                      label: 'Dự toán đã duyệt',
                      value: `${contract.estimate.code} — phiên bản ${contract.estimate.version}`,
                    },
                  ]
                : []),
            ],
          },
          ...((sites ?? []).length > 0
            ? [
                {
                  title: 'Thi công',
                  records: (sites ?? []).map((s) => ({
                    label: SITE_STAGE_META[s.stage].label,
                    value: `${s.code} — ${s.name}`,
                    to: `/tc/cong-trinh/${s.id}`,
                  })),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
