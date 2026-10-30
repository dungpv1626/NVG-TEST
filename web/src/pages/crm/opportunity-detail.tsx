/**
 * Chi tiết Cơ hội kinh doanh — hành trình ở Webapp Flow Mục 3.1.
 *
 * Tab theo đúng các bước của hành trình Nhân viên Kinh doanh:
 * Tổng quan → Khảo sát (CRM-03) → Báo giá (CRM-04) → Lịch sử (tự thêm).
 *
 * Chuyển giai đoạn có thể làm ở đây HOẶC bằng kéo–thả trên Kanban — kéo–thả không được là
 * cách duy nhất để thực hiện một thao tác (Content Guidelines 6.8).
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { showcaseSendPath } from '@/pages/showcase/send-showcase-link';
import {
  OPPORTUNITY_FLOW,
  OPPORTUNITY_STAGE_META,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
  type ContractType,
  type OpportunityStage,
} from '@nvg/shared';
import { DraftContractButton } from '@/components/contract/draft-contract-button';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { RecordChain } from '@/components/entity/record-chain';
import { StepTrack } from '@/components/entity/step-track';
import { useContractGroup, useMarkDesignOnly } from '@/hooks/use-contract-group';
import { useStageReadiness } from '@/hooks/use-stage-readiness';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useContractForSource } from '@/hooks/use-contracts';
import { useCompanies } from '@/hooks/use-companies';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useMoveStage,
  useOpportunity,
  useOpportunityStageHistory,
  useWaiveSurvey,
} from '@/hooks/use-opportunities';
import { ContactLogPanel } from '@/components/crm/contact-log-panel';
import { useCan, useIsOrgManager, useIsResponsible } from '@/lib/auth';
import { CLASSIFICATION_ANCHOR, ClassificationCard } from './classification-card';
import { NegotiationNextSteps } from './negotiation-next-steps';
import { QuotePanel } from './quote-panel';
import { RentalQuotePanel } from './rental-quote-panel';
import { EMPTY_SURVEY_DRAFT, SurveyPanel, type SurveyDraft } from './survey-panel';
import { cn } from '@/lib/utils';

const EM_DASH = '—';

/**
 * Tab nơi làm việc của từng bước — mở hồ sơ hay vừa chuyển bước thì nhảy thẳng tới đó, người
 * dùng không phải tự mò (phản hồi chủ dự án sau GĐ1).
 */
const STAGE_TAB: Record<OpportunityStage, string> = {
  tiep_nhan: 'tong-quan',
  xac_minh: 'tong-quan',
  khao_sat: 'khao-sat',
  bao_gia: 'bao-gia',
  dam_phan: 'bao-gia',
  ky_hop_dong: 'tong-quan',
  mat_co_hoi: 'tong-quan',
};

/** Điều kiện nào làm ở tab nào — nút «Làm ngay» cạnh dòng «Cần». */
const REQUIREMENT_TAB: Record<string, { tab: string; anchor?: string; label: string }> = {
  classified: { tab: 'tong-quan', anchor: CLASSIFICATION_ANCHOR, label: 'Phân loại' },
  survey_done: { tab: 'khao-sat', label: 'Mở Khảo sát' },
  offer_sent: { tab: 'bao-gia', label: 'Mở Báo giá' },
};

interface CustomerFull {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

export function OpportunityDetailPage() {
  const promptDialog = usePromptDialog();
  const { id } = useParams<{ id: string }>();
  const canEditModule = useCan('CRM', 'edit');

  const { data, isLoading, error } = useOpportunity(id);

  const { data: contractId } = useContractForSource('opportunities', id);
  const { data: readiness = [] } = useStageReadiness('opportunity', id);
  // Mọi hợp đồng của cơ hội, kể cả sinh từ gói thầu / hồ sơ thiết kế (0243): một hợp đồng thiết
  // kế + một hợp đồng thi công, hoặc một hợp đồng trọn gói — chỉ mời soạn phạm vi còn trống.
  const { data: contractGroup } = useContractGroup('opportunity', id);
  const markDesignOnly = useMarkDesignOnly();
  const { data: history } = useOpportunityStageHistory(id);
  const moveStage = useMoveStage();
  const waiveSurvey = useWaiveSurvey();
  const [searchParams, setSearchParams] = useSearchParams();
  const isResponsible = useIsResponsible(data?.owner_id);
  // Ghi liên hệ: người phụ trách / lãnh đạo — trùng policy `contact_logs_insert` (0172).
  const canCreateCrm = useCan('CRM', 'create');
  const isLeader = useIsOrgManager();
  const [moveError, setMoveError] = useState<string | null>(null);

  // Bản nháp biên bản khảo sát giữ Ở ĐÂY, không giữ trong tab: `EntityDetail` chỉ dựng nội
  // dung của tab đang mở, nên chuyển sang tab Báo giá rồi quay lại sẽ mất sạch phần đang gõ
  // nếu state nằm trong chính tab đó (Webapp Flow 6.3).
  const [surveyDraft, setSurveyDraft] = useState<SurveyDraft>(EMPTY_SURVEY_DRAFT);
  // Cơ hội đổi bước trong lúc trang đang mở — kể cả do người khác (Ban Giám đốc duyệt báo cáo
  // khảo sát thì CSDL tự sang Báo giá) — thì mở luôn tab của bước mới. Trước đây đường dẫn giữ
  // `?tab=khao-sat` nên vẫn đứng ở tab cũ (anh Dũng chạy thử 20/10/2026).
  const seenStage = useRef<OpportunityStage | null>(null);
  const currentStage = data?.stage ?? null;
  useEffect(() => {
    if (!currentStage) return;
    const previous = seenStage.current;
    seenStage.current = currentStage;
    if (previous === null || previous === currentStage) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.set('tab', STAGE_TAB[currentStage]);
        return next;
      },
      { replace: true },
    );
  }, [currentStage, setSearchParams]);
  const { data: companies } = useCompanies();

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="cơ hội kinh doanh"
        listPath="/crm/co-hoi"
        listLabel="Quay lại danh sách cơ hội"
      />
    );
  }

  // Hai điều kiện khác nhau: vai trò được sửa hồ sơ CRM, VÀ chính người này phụ trách cơ hội.
  // Thiếu vế thứ hai là hiện nút cho người mà RLS sẽ chặn (Webapp Flow 6.5).
  const canEdit = canEditModule && isResponsible;

  const stageMeta = OPPORTUNITY_STAGE_META[data.stage];
  const customer = (data as unknown as { customer_full: CustomerFull | null }).customer_full;
  // Pháp nhân của cơ hội — chọn phiếu khảo sát riêng (NVC / NVO / NVS) và in tên lên phiếu.
  const company = companies?.find((c) => c.id === data.company_id) ?? null;
  // NVS cho thuê / bán giàn giáo: hợp đồng mặc định là hợp đồng cho thuê, không phải thi công.
  const defaultContractType: ContractType = company?.code === 'NVS' ? 'cho_thue' : 'thi_cong';
  const isHandedOver = data.handed_over_at !== null;
  const quoteMissing = readiness
    .filter((r) => r.for_stage === 'bao_gia' && !r.met)
    .map((r) => r.label);
  const designOnly = data.design_only_at !== null;
  const designContract = contractGroup?.find((c) => c.scope_kind === 'thiet_ke') ?? null;
  const hasBuildContract = Boolean(contractGroup?.some((c) => c.scope_kind !== 'thiet_ke'));
  // «Chỉ thiết kế»: đã có hợp đồng thiết kế, chưa có hợp đồng thi công / trọn gói (0243).
  const canMarkDesignOnly =
    !stageMeta.isTerminal && !designOnly && designContract !== null && !hasBuildContract;

  async function markAsDesignOnly() {
    setMoveError(null);
    const reason = await promptDialog.ask({
      title: 'Khách chỉ thuê thiết kế?',
      label: 'Lý do (không bắt buộc) — ghi vào lịch sử cơ hội',
      confirmLabel: 'Đánh dấu Chỉ thiết kế',
      required: false,
    });
    if (reason === null) return;
    try {
      await markDesignOnly.mutateAsync({ opportunityId: data!.id, reason: reason || null });
    } catch (e) {
      setMoveError(toUserMessage(e, 'edit'));
    }
  }

  function openTab(tab: string, anchor?: string) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
    if (anchor) {
      // Đợi tab dựng xong rồi mới cuộn tới ô cần làm.
      window.setTimeout(() => {
        const el = document.getElementById(anchor);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el?.querySelector<HTMLElement>('select, input, textarea')?.focus({ preventScroll: true });
      }, 50);
    }
  }

  /**
   * Lưu phân loại xong thì đi tiếp luôn: đủ điều kiện (M2–M4 + loại công trình) mà cơ hội còn ở
   * Tiếp nhận / Xác minh → chuyển sang Khảo sát và mở tab Khảo sát. M1 thì nói rõ vì sao đứng lại.
   */
  async function afterClassified(
    classification: string | null,
    projectType: string | null,
  ): Promise<string | null> {
    if (data!.stage !== 'tiep_nhan' && data!.stage !== 'xac_minh') return null;
    if (classification === 'M1') {
      return 'Đã lưu. Khách chưa có nhu cầu nên đứng lại ở Xác minh; đổi phân loại khi khách có nhu cầu thật.';
    }
    if (!classification || !projectType) {
      return 'Đã lưu. Cần chọn đủ phân loại và loại công trình để sang Khảo sát.';
    }
    setMoveError(null);
    try {
      if (data!.stage === 'tiep_nhan') {
        await moveStage.mutateAsync({ opportunityId: data!.id, toStage: 'xac_minh' });
      }
      await moveStage.mutateAsync({ opportunityId: data!.id, toStage: 'khao_sat' });
      openTab(STAGE_TAB.khao_sat);
      return null;
    } catch (e) {
      setMoveError(toUserMessage(e, 'edit'));
      return 'Đã lưu phân loại, nhưng chưa chuyển được sang Khảo sát.';
    }
  }

  // Từ 0175 KHÔNG tự sang Báo giá khi ghi biên bản đã khảo sát: báo cáo phải được Ban Giám đốc
  // duyệt trước — duyệt xong CSDL tự chuyển (decide_approval → _sync_opportunity_stage).

  async function changeStage(toStage: OpportunityStage) {
    setMoveError(null);
    // Điều kiện chưa đạt nhưng miễn được (khảo sát) — hỏi lý do, ghi lại rồi mới chuyển.
    const waivable = readiness.filter((r) => r.for_stage === toStage && !r.met && r.waivable);
    if (waivable.some((r) => r.requirement === 'survey_done')) {
      const reason = await promptDialog.ask({
        title: 'Báo giá mà không khảo sát hiện trạng?',
        label: 'Lý do không khảo sát (ghi vào hồ sơ, lãnh đạo xem được)',
        confirmLabel: 'Ghi lý do và chuyển bước',
      });
      if (reason === null) return;
      try {
        await waiveSurvey.mutateAsync({ opportunityId: data!.id, reason });
      } catch (e) {
        setMoveError(toUserMessage(e, 'edit'));
        return;
      }
    }
    let lostReason: string | undefined;
    if (toStage === 'mat_co_hoi') {
      const input = await promptDialog.ask({
        title: 'Chuyển sang Mất cơ hội?',
        label: 'Nguyên nhân mất cơ hội',
        confirmLabel: 'Ghi nhận mất cơ hội',
      });
      if (input === null) return;
      lostReason = input;
    }
    try {
      await moveStage.mutateAsync({ opportunityId: data!.id, toStage, lostReason });
      openTab(STAGE_TAB[toStage]);
    } catch (e) {
      setMoveError(toUserMessage(e, 'edit'));
    }
  }

  /**
   * Bước đi tới được phép (CRM-02, 0155) — cùng định nghĩa với hàm chặn ở CSDL. «Ký hợp đồng»
   * không có ở đây: hợp đồng đã ký tự đẩy sang. Bước chưa đủ điều kiện thì nút mờ và nói vì sao.
   */
  const forwardStages = OPPORTUNITY_FLOW.steps[data.stage].next;
  // Điều kiện miễn được bằng lý do không khoá nút — bấm thì hỏi lý do (changeStage).
  const missingFor = (stage: OpportunityStage) =>
    readiness.filter((r) => r.for_stage === stage && !r.met && !r.waivable).map((r) => r.label);
  const nextRequirements = (forwardStages[0] ? readiness : [])
    .filter((r) => r.for_stage === forwardStages[0])
    .map((r) => {
      const go = REQUIREMENT_TAB[r.requirement];
      return {
        label:
          r.waivable && !r.met ? `${r.label} — hoặc ghi lý do bỏ qua khi chuyển bước` : r.label,
        met: r.met,
        action:
          go && canEdit && !isHandedOver ? (
            <button
              type="button"
              className="font-medium text-brand underline-offset-2 hover:underline"
              onClick={() => openTab(go.tab, go.anchor)}
            >
              {go.label}
            </button>
          ) : undefined,
      };
    });

  return (
    <>
      {promptDialog.dialog}
      {moveError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {moveError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[
          { label: 'Khách hàng & Cơ hội' },
          { label: 'Cơ hội kinh doanh', to: '/crm/co-hoi' },
          { label: data.name },
        ]}
        title={data.name}
        code={data.code}
        status={stageMeta.statusGroup}
        statusLabel={`Bước: ${stageMeta.label}`}
        responsiblePerson={data.owner?.full_name ?? null}
        deadline={data.due_date}
        defaultTab={STAGE_TAB[data.stage]}
        progress={
          <>
            <RecordChain kind="opportunity" id={data.id} />
            <StepTrack
              flow={OPPORTUNITY_FLOW}
              current={data.stage}
              nextRequirements={nextRequirements}
              holder={data.owner?.full_name ?? null}
              extra={
                contractGroup &&
                (data.stage === 'dam_phan' || (designContract && !stageMeta.isTerminal)) ? (
                  <NegotiationNextSteps
                    opportunityId={data.id}
                    contractId={contractId}
                    group={contractGroup}
                    designOnly={designOnly}
                    canEdit={canEdit && !isHandedOver}
                    defaultContractType={defaultContractType}
                  />
                ) : undefined
              }
            />
          </>
        }
        actions={
          canEdit && !isHandedOver ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {forwardStages.map((stage, i) => {
                  const missing = missingFor(stage);
                  return (
                    <Button
                      key={stage}
                      variant={i === 0 ? 'primary' : 'secondary'}
                      disabled={moveStage.isPending || missing.length > 0}
                      title={missing.length > 0 ? `Cần: ${missing.join('; ')}` : undefined}
                      onClick={() => void changeStage(stage)}
                    >
                      Chuyển sang {OPPORTUNITY_STAGE_META[stage].label}
                    </Button>
                  );
                })}
                {!stageMeta.isTerminal && (
                  <Button
                    variant="secondary"
                    disabled={moveStage.isPending}
                    onClick={() => void changeStage('mat_co_hoi')}
                  >
                    Đánh dấu mất cơ hội
                  </Button>
                )}
                {canMarkDesignOnly && (
                  <Button
                    variant="secondary"
                    disabled={markDesignOnly.isPending}
                    title="Khách chỉ thuê thiết kế: hợp đồng thiết kế ký là cơ hội thành công"
                    onClick={() => void markAsDesignOnly()}
                  >
                    Chỉ thiết kế
                  </Button>
                )}
                {/* Gửi mẫu công trình cho khách — link gắn với cơ hội, tạo xong ghi nhật ký chăm sóc. */}
                {!stageMeta.isTerminal && (
                  <Button variant="secondary" asChild>
                    <Link
                      to={showcaseSendPath({
                        opportunityId: data.id,
                        name: customer?.name ?? data.name,
                        projectType: data.project_type,
                      })}
                    >
                      Gửi mẫu công trình
                    </Link>
                  </Button>
                )}
                {/* Webapp Flow 3.1 bước 5: khách đồng ý ở bước Đàm phán thì soạn hợp đồng
                  ngay tại chỗ, lấy sẵn khách hàng và giá đã duyệt (HD-01). */}
                {/* Ở Báo giá chỉ mời soạn khi giá đã chốt với khách (báo giá đã gửi / gói thầu đã nộp)
                  — chưa có báo giá mà hiện «Soạn hợp đồng» là mời làm bước sau trước bước trước. */}
                {(data.stage === 'dam_phan' ||
                  (data.stage === 'bao_gia' &&
                    readiness.some((r) => r.requirement === 'offer_sent' && r.met))) &&
                  contractGroup && (
                    <DraftContractButton
                      sourceType="opportunities"
                      sourceId={data.id}
                      defaultType={defaultContractType}
                      existingContractId={contractId}
                      group={contractGroup}
                      designOnly={designOnly}
                    />
                  )}
              </div>
              {/* Nút bước kế tiếp bị khoá thì nói lý do NGAY dưới nút — chỉ để trong chú thích khi rê
                chuột thì trên điện thoại không ai thấy, và người dùng tưởng hệ thống lỗi. */}
              {forwardStages[0] && missingFor(forwardStages[0]).length > 0 && (
                <p className="text-sm text-fg-subtle">
                  Chưa chuyển sang {OPPORTUNITY_STAGE_META[forwardStages[0]].label} được — cần:{' '}
                  {missingFor(forwardStages[0]).join('; ')}.
                </p>
              )}
            </div>
          ) : isHandedOver ? (
            // CRM-06: sau khi bàn giao, cơ hội chuyển chế độ chỉ xem.
            <span className="text-fg-subtle">
              Đã bàn giao {formatDate(data.handed_over_at)} — chỉ xem
            </span>
          ) : undefined
        }
        tabs={[
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <div className="space-y-6">
                <ClassificationCard
                  opportunityId={data.id}
                  classification={data.classification}
                  projectType={data.project_type}
                  canEdit={canEdit && !isHandedOver && !stageMeta.isTerminal}
                  highlight={
                    (data.stage === 'tiep_nhan' || data.stage === 'xac_minh') &&
                    !readiness.find((r) => r.requirement === 'classified')?.met
                  }
                  onSaved={afterClassified}
                />
                <DetailFields
                  fields={[
                    {
                      label: 'Khách hàng',
                      value: customer ? (
                        <Link
                          to={`/crm/khach-hang/${customer.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {customer.name}
                        </Link>
                      ) : (
                        EM_DASH
                      ),
                    },
                    { label: 'Người liên hệ', value: customer?.contact_person ?? EM_DASH },
                    { label: 'Điện thoại', value: formatPhone(customer?.phone) || EM_DASH },
                    { label: 'Email', value: customer?.email ?? EM_DASH },
                    {
                      label: 'Giá trị dự kiến',
                      value: data.estimated_value ? formatCurrency(data.estimated_value) : EM_DASH,
                    },
                    {
                      label: 'Tiến độ mong muốn',
                      value: formatDate(data.expected_start_date) || EM_DASH,
                    },
                    { label: 'Ghi chú', value: data.notes ?? EM_DASH },
                    ...(data.survey_waived_reason
                      ? [{ label: 'Lý do không khảo sát', value: data.survey_waived_reason }]
                      : []),
                    ...(data.lost_reason
                      ? [{ label: 'Nguyên nhân mất cơ hội', value: data.lost_reason }]
                      : []),
                    ...(designOnly
                      ? [
                          {
                            label: 'Chỉ thiết kế',
                            value: `Khách chỉ thuê thiết kế (${formatDate(data.design_only_at)})${
                              data.design_only_reason ? ` — ${data.design_only_reason}` : ''
                            }`,
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            ),
          },
          {
            id: 'khao-sat',
            label: 'Khảo sát',
            content: (
              <SurveyPanel
                opportunityId={data.id}
                canEdit={canEdit}
                isHandedOver={isHandedOver}
                draft={surveyDraft}
                onDraftChange={setSurveyDraft}
                printInfo={{
                  code: data.code,
                  name: data.name,
                  customerName: customer?.name ?? null,
                  contactPerson: customer?.contact_person ?? null,
                  phone: customer?.phone ? formatPhone(customer.phone) : null,
                  companyName: company?.short_name ?? null,
                }}
                companyCode={company?.code ?? null}
              />
            ),
          },
          {
            id: 'bao-gia',
            label: 'Báo giá',
            content:
              // Gói C (0256, câu 14): pháp nhân cho thuê (NVS) lập báo giá THUÊ ngay trong cơ hội — nhập
              // một lần. Báo giá theo mẫu chung giữ trong khối gấp (kết cấu thép, báo giá lập trước 0256).
              company?.code === 'NVS' ? (
                <div className="space-y-6">
                  <RentalQuotePanel
                    opportunityId={data.id}
                    companyId={data.company_id}
                    customerId={customer?.id ?? ''}
                    customerName={customer?.name ?? null}
                    customerPhone={customer?.phone ?? null}
                    canEdit={canEdit}
                    isHandedOver={isHandedOver}
                    stage={data.stage}
                    missingForQuote={quoteMissing}
                  />
                  <details className="rounded-card bg-surface p-3">
                    <summary className="min-h-11 cursor-pointer py-2 font-medium">
                      Báo giá khác theo mẫu chung (kết cấu thép, hàng ngoài danh mục giàn giáo)
                    </summary>
                    <div className="pt-3">
                      <QuotePanel
                        opportunityId={data.id}
                        canEdit={canEdit}
                        isHandedOver={isHandedOver}
                        stage={data.stage}
                        companyCode={company?.code ?? null}
                        missingForQuote={quoteMissing}
                      />
                    </div>
                  </details>
                </div>
              ) : (
                <QuotePanel
                  opportunityId={data.id}
                  canEdit={canEdit}
                  isHandedOver={isHandedOver}
                  stage={data.stage}
                  companyCode={company?.code ?? null}
                  missingForQuote={quoteMissing}
                />
              ),
          },
          {
            id: 'cham-soc',
            label: 'Nhật ký chăm sóc',
            content: (
              <ContactLogPanel
                subject={{ opportunityId: data.id }}
                canWrite={isResponsible && (canCreateCrm || isLeader)}
              />
            ),
          },
        ]}
        historyContent={
          history && history.length > 0 ? (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <div
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      h.to_stage === 'mat_co_hoi' ? 'bg-status-overdue' : 'bg-brand',
                    )}
                  />
                  <div className="min-w-0">
                    {/* Hiển thị TÊN GIAI ĐOẠN cho cả hai đầu, không dùng nhãn trạng thái:
                        nhiều giai đoạn cùng quy về một nhóm trạng thái (Khảo sát và Đàm phán
                        đều là "Đang xử lý"), nên dùng nhãn trạng thái sẽ đọc thành
                        "Đang xử lý → Đang xử lý" và mất thông tin. */}
                    <div className="flex flex-wrap items-center gap-2">
                      {h.from_stage && (
                        <>
                          <span className="text-fg-subtle">
                            {OPPORTUNITY_STAGE_META[h.from_stage].label}
                          </span>
                          <span className="text-fg-subtle">→</span>
                        </>
                      )}
                      <span className="font-medium">
                        {OPPORTUNITY_STAGE_META[h.to_stage].label}
                      </span>
                      <StatusLozenge status={OPPORTUNITY_STAGE_META[h.to_stage].statusGroup} />
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {h.changed_by_user?.full_name ?? 'Hệ thống'} · {formatDateTime(h.changed_at)}
                    </div>
                    {h.note && <p className="mt-0.5">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState message="Chưa có lịch sử chuyển giai đoạn." />
          )
        }
        related={[
          {
            title: 'Hồ sơ liên quan',
            records: customer
              ? [
                  {
                    label: 'Khách hàng',
                    value: customer.name,
                    to: `/crm/khach-hang/${customer.id}`,
                  },
                ]
              : [],
          },
        ]}
      />
    </>
  );
}
