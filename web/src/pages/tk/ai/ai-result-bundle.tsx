/**
 * Bước 4 «Bộ kết quả» của AI Design (Đợt 5B, vấn đề 7): tải CẢ GÓI một phương án thành một tệp `.zip`
 * tên theo mã hồ sơ thiết kế — tờ mặt bằng SVG từng tầng + tờ mái, DXF cả nhà, ảnh mặt bằng có nội thất
 * (nếu đã vẽ), mặt đứng SVG + DXF + ảnh vật liệu (nếu có), ảnh phối cảnh (nếu có), và tờ «Đọc trước».
 *
 * Chỉ ĐỌC artifact đã có qua đúng các tuyến màn hình vẫn dùng (có kiểm quyền) — không dựng gì mới,
 * không gọi mô hình nào. Gói tạo ngay trên trình duyệt (`pizzip`, đã có trong kho cho mẫu hợp đồng,
 * nạp khi bấm). Dùng được cả trên hồ sơ đã bàn giao / chỉ xem — tải về không đổi gì.
 */

import { formatDateTime, formatNumber } from '@nvg/shared';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { useAiImageSet, useAiPlanReview, type AiDesignState } from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { DesignApiError, designApiFile } from '@/lib/design-api';
import { Chip, Panel } from '../tk-ui';
import { scoreSummary } from './ai-plan-compare';
import { roomName, topDeductions } from './plan-deductions';
import {
  bundleFiles,
  bundleReadme,
  bundleZipName,
  withExtension,
  type BundleFile,
} from './result-bundle';
import { numberedNames } from './variant-name';

const NO_PACKS = { standards: false, experience: false };

export function AiResultBundle({
  projectId,
  projectCode,
  projectName,
  state,
  onGoTo,
}: {
  projectId: string;
  projectCode: string | null | undefined;
  projectName?: string | null;
  state: AiDesignState;
  /** Mở bước còn thiếu. */
  onGoTo: (step: 'mat-bang' | 'mat-ngoai') => void;
}): React.ReactElement {
  const planNames = useMemo(() => numberedNames(state.plans, 'Phương án'), [state.plans]);
  const facadeNames = useMemo(
    () => numberedNames(state.facades ?? [], 'Mặt đứng'),
    [state.facades],
  );
  const setNames = useMemo(() => numberedNames(state.imageSets ?? [], 'Bộ ảnh'), [state.imageSets]);
  const ordered = useMemo(
    () => [...state.plans].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [state.plans],
  );
  const [planId, setPlanId] = useState<string | null>(
    state.planHeadArtifactId ?? ordered[ordered.length - 1]?.artifactId ?? null,
  );
  useEffect(() => {
    if (planId && state.plans.some((p) => p.artifactId === planId)) return;
    setPlanId(state.planHeadArtifactId ?? ordered[ordered.length - 1]?.artifactId ?? null);
  }, [planId, state.plans, state.planHeadArtifactId, ordered]);

  // Mặt đứng dựng TRÊN phương án đang chọn (mới nhất trước); bộ ảnh dựng trên mặt đứng ấy.
  const facade = useMemo(() => {
    if (!planId) return null;
    const list = state.facades ?? [];
    const hit =
      list.find((f) => f.planRef === planId) ??
      (state.facadeArtifactId && state.facadePlanRef === planId
        ? { artifactId: state.facadeArtifactId }
        : null);
    return hit
      ? { artifactId: hit.artifactId, name: facadeNames.get(hit.artifactId) ?? 'Mặt đứng' }
      : null;
  }, [planId, state.facades, state.facadeArtifactId, state.facadePlanRef, facadeNames]);
  const imageSetId =
    facade && state.imageSetArtifactId && state.imageSetFacadeRef === facade.artifactId
      ? state.imageSetArtifactId
      : null;

  const review = useAiPlanReview(projectId, planId, NO_PACKS);
  const imageSet = useAiImageSet(projectId, imageSetId);
  const planName = planId ? (planNames.get(planId) ?? 'Phương án') : '';

  const files = useMemo<BundleFile[]>(() => {
    if (!planId || !review.data) return [];
    return bundleFiles({
      projectId,
      code: projectCode,
      plan: {
        artifactId: planId,
        name: planName,
        levels: review.data.levels.map((l) => ({ level: l.level, name: l.name, roof: l.roof })),
      },
      facade,
      imageSet:
        imageSetId && imageSet.data
          ? {
              artifactId: imageSetId,
              name: setNames.get(imageSetId) ?? 'Bộ ảnh',
              views: imageSet.data.images.map((i) => ({ view: i.view, label: i.label })),
            }
          : null,
    });
  }, [
    planId,
    review.data,
    projectId,
    projectCode,
    planName,
    facade,
    imageSetId,
    imageSet.data,
    setNames,
  ]);

  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ name: string; count: number; skipped: number } | null>(null);

  if (state.plans.length === 0) {
    return (
      <Panel title="Bộ kết quả">
        <p className="text-fg-subtle">
          Chưa có phương án mặt bằng nào nên chưa có gì để tải. Xếp mặt bằng ở bước 2 trước.
        </p>
        <Button className="mt-3" variant="secondary" onClick={() => onGoTo('mat-bang')}>
          Sang bước Mặt bằng
        </Button>
      </Panel>
    );
  }

  const download = async () => {
    if (!review.data) return;
    setError(null);
    setLast(null);
    setBusy({ done: 0, total: files.length });
    try {
      const { default: PizZip } = await import('pizzip');
      const zip = new PizZip();
      const added: string[] = [];
      const skipped: string[] = [];
      let done = 0;
      // Tuần tự: vài chục tệp, bắn song song cùng lúc là dồn Worker (cùng lý do với báo cáo lượt chạy).
      for (const file of files) {
        try {
          const response = await designApiFile(file.url);
          const bytes = new Uint8Array(await response.arrayBuffer());
          const path = withExtension(file.path, response.headers.get('Content-Type'), file.ext);
          zip.file(path, bytes, { binary: true });
          added.push(path);
        } catch (err) {
          // 404 của ảnh chưa vẽ là «chưa có», không phải lỗi. Mọi mã khác phải nói ra.
          if (file.optional && err instanceof DesignApiError && err.status === 404) {
            skipped.push(file.path);
          } else {
            throw err;
          }
        }
        done += 1;
        setBusy({ done, total: files.length });
      }
      const { percent, threshold, passed } = scoreSummary(review.data);
      const readme = bundleReadme({
        code: projectCode,
        projectName,
        planName,
        facadeName: facade?.name ?? null,
        imageSetName: imageSetId ? (setNames.get(imageSetId) ?? 'Bộ ảnh') : null,
        scoreLine:
          percent === null
            ? null
            : `${formatNumber(percent, 1)}%${threshold !== null ? (passed ? ` — đạt ngưỡng ${formatNumber(threshold)}` : ` — dưới ngưỡng ${formatNumber(threshold)}`) : ''}`,
        deductions: topDeductions(review.data.score, 3).map(
          (d) =>
            `${d.label}: −${formatNumber(d.lost, 1)} điểm${d.refs.length ? ` (${d.refs.map((r) => roomName(r, review.data!.roomLabels)).join(', ')})` : ''}`,
        ),
        files: added,
        skipped: skipped.map((s) => s.replace(/^.*\//, '')),
        createdAt: formatDateTime(new Date().toISOString()),
        noCodeCheck: AI_DISCLAIMERS.noCodeCheck,
      });
      zip.file('DOC-TRUOC.txt', String.fromCharCode(0xfeff) + readme);
      const blob = zip.generate({ type: 'blob', compression: 'DEFLATE' }) as Blob;
      const name = bundleZipName(projectCode, planName);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setLast({ name, count: added.length + 1, skipped: skipped.length });
    } catch (err) {
      setError(`Không tạo được gói tải về: ${toUserMessage(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const groups: Array<{ id: BundleFile['group']; label: string; missing: string | null }> = [
    { id: 'mat-bang', label: 'Mặt bằng', missing: null },
    {
      id: 'mat-dung',
      label: 'Mặt đứng',
      missing: facade ? null : 'Chưa có mặt đứng dựng trên phương án này.',
    },
    {
      id: 'phoi-canh',
      label: 'Phối cảnh',
      missing: imageSetId ? null : 'Chưa có bộ ảnh phối cảnh dựng trên mặt đứng này.',
    },
  ];

  return (
    <div className="space-y-4">
      <Panel title="Bộ kết quả">
        <p className="text-fg-subtle">
          Gói mọi thứ đã có của một phương án thành một tệp nén, tên theo mã hồ sơ{' '}
          <b className="text-fg">{projectCode ?? '(chưa có mã)'}</b>. Bản phác tham khảo — không đi
          vào hồ sơ phát hành.
        </p>

        <div className="mt-4">
          <p className="mb-1.5 font-medium">Phương án</p>
          <div role="group" aria-label="Chọn phương án để tải" className="flex flex-wrap gap-2">
            {ordered.map((plan) => {
              const active = plan.artifactId === planId;
              return (
                <button
                  key={plan.artifactId}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPlanId(plan.artifactId)}
                  className={
                    active
                      ? 'min-h-10 rounded-md border border-tk-bl-line bg-tk-bl-bg px-3 font-medium'
                      : 'min-h-10 rounded-md border border-tk-line px-3 hover:bg-tk-hover'
                  }
                >
                  {planNames.get(plan.artifactId)}
                  {plan.artifactId === state.planHeadArtifactId && ' · dùng cho mặt đứng'}
                </button>
              );
            })}
          </div>
        </div>

        {review.isLoading && <Skeleton className="mt-4 h-40 w-full" />}
        {review.isError && (
          <p className="mt-4 text-status-overdue">{toUserMessage(review.error)}</p>
        )}

        {review.data && (
          <ul className="mt-4 space-y-3" aria-label="Nội dung gói">
            {groups.map((group) => {
              const items = files.filter((f) => f.group === group.id);
              return (
                <li key={group.id} className="rounded-md border border-tk-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-auto font-medium">{group.label}</span>
                    {group.missing ? (
                      <Chip tone="mute">Chưa có</Chip>
                    ) : (
                      <Chip tone="gr">{items.length} tệp</Chip>
                    )}
                  </div>
                  {group.missing ? (
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-fg-subtle">
                      <span className="inline-flex items-center gap-1.5">
                        <Minus className="size-4" aria-hidden />
                        {group.missing}
                      </span>
                      <button
                        type="button"
                        className="min-h-10 underline"
                        onClick={() => onGoTo('mat-ngoai')}
                      >
                        Sang bước Mặt ngoài
                      </button>
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {items.map((file) => (
                        <li key={file.path} className="flex items-start gap-1.5 break-all">
                          <Check
                            className="mt-0.5 size-4 shrink-0 text-status-completed"
                            aria-hidden
                          />
                          <span>
                            {file.path.replace(/^.*\//, '')}
                            {/\.[a-z]+$/.test(file.path) ? '' : '.*'}
                            {file.optional && (
                              <span className="text-fg-subtle"> — kèm nếu đã vẽ</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => void download()}
            disabled={!review.data || busy !== null || files.length === 0}
          >
            <Download className="size-4" aria-hidden />
            {busy ? `Đang gói ${busy.done}/${busy.total} tệp…` : 'Tải cả gói (.zip)'}
          </Button>
          <span className="break-all text-fg-subtle">
            Tên tệp: {bundleZipName(projectCode, planName)}
          </span>
        </div>
        {last && (
          <p className="mt-2 text-status-completed">
            Đã tải {last.name}: {last.count} tệp
            {last.skipped > 0 && `, ${last.skipped} ảnh chưa vẽ nên không có trong gói`}.
          </p>
        )}
        {error && <p className="mt-2 text-status-overdue">{error}</p>}
      </Panel>
    </div>
  );
}
