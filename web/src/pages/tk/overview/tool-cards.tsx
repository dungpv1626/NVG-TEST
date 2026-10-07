/**
 * Năm thẻ Bộ công cụ thiết kế (bản mẫu §5.5b) — một thẻ cho mỗi bước của dải tiến trình: Đầu bài,
 * Khảo sát, Hồ sơ kỹ thuật, Dự toán, Trình khách (07/10/2026). Mỗi thẻ là cửa vào một màn hình con và bày sẵn
 * con số quan trọng nhất của bước đó, để đọc dải thẻ là biết ngay còn thiếu gì.
 *
 * Mọi con số ở đây đều lấy từ truy vấn thật. Chỗ nào chưa có dữ liệu thì nói "chưa có", KHÔNG
 * hiện `0` — xem `NotYet` trong `ui.tsx`.
 *
 * Các thẻ dùng chung khoá truy vấn với chính màn hình con của chúng, nên mở thẻ ra là dữ liệu
 * đã nằm sẵn trong bộ nhớ đệm, không phải chờ lần nữa.
 */

import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calculator,
  ClipboardList,
  FileStack,
  Presentation,
  Scan,
  Sparkles,
} from 'lucide-react';
import {
  DESIGN_DISCIPLINE_LABELS,
  formatDate,
  formatNumber,
  TECHNICAL_DISCIPLINES,
} from '@nvg/shared';
import { BUILDING_TYPE_LABEL, STYLE_LABEL } from '@nvg/shared/design';
import { Skeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useEstimates } from '@/hooks/use-estimates';
import { useDesignSurveys } from '@/hooks/use-design-surveys';
import { useSurveyPhotos } from '@/hooks/use-survey-photos';
import {
  useDesignBriefs,
  useDesignSync,
  useDesignVersions,
  useDisciplineTasks,
  type DesignBriefRecord,
} from '@/hooks/use-design-projects';
import { useAiDesignState } from '@/hooks/use-ai-design';
import { Chip, FAMILY, NotYet, ToolCard } from '../tk-ui';
import { cn } from '@/lib/utils';

const ICON = 'size-[18px]';

function Deep({
  family,
  empty = false,
  children,
}: {
  family: keyof typeof FAMILY;
  /** Ô «chưa có»: kéo đầy phần thân và căn giữa, để năm thẻ cao bằng nhau vẫn cân. */
  empty?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-md p-3 text-xs',
        FAMILY[family].deep,
        empty && 'grid flex-1 place-items-center text-center',
      )}
    >
      {children}
    </div>
  );
}

/** Một dòng chờ, cao đúng bằng phần thân thẻ để lưới không nhảy khi dữ liệu về. */
function Waiting(): React.ReactElement {
  return <Skeleton className="h-20 w-full" />;
}

// ── Thẻ 1: Đầu bài ────────────────────────────────────────────────────────────

export function BriefCard({
  projectId,
  basePath,
}: {
  projectId: string;
  basePath: string;
}): React.ReactElement {
  const briefs = useDesignBriefs(projectId);
  const current = briefs.data?.find((b) => b.is_current_version) ?? briefs.data?.[0] ?? null;

  return (
    <ToolCard
      family="bl"
      icon={<ClipboardList className={ICON} aria-hidden />}
      title="Đầu bài thiết kế"
      description="Chuẩn hoá yêu cầu khách hàng thành dữ liệu thiết kế có cấu trúc."
      to={`${basePath}?tab=dau-bai`}
    >
      {briefs.isLoading ? <Waiting /> : <BriefBody brief={current} />}
    </ToolCard>
  );
}

function BriefBody({ brief }: { brief: DesignBriefRecord | null }): React.ReactElement {
  if (!brief) {
    return (
      <Deep family="bl" empty>
        <NotYet>Chưa lập đầu bài. Mở để nhập yêu cầu của khách hàng.</NotYet>
      </Deep>
    );
  }
  const s = brief.structured ?? {};
  const width = s.site?.width_m;
  const depth = s.site?.depth_m;
  const size =
    width != null && depth != null
      ? `${formatNumber(width, 1)} × ${formatNumber(depth, 1)} m`
      : null;
  const floors = s.floors != null ? `${s.floors} tầng` : null;
  const type = s.building_type ? BUILDING_TYPE_LABEL[s.building_type] : null;
  const style = s.style ? STYLE_LABEL[s.style] : null;
  // `completeness_score` là cột sinh, về dưới dạng chuỗi số.
  const score = brief.completeness_score != null ? Number(brief.completeness_score) : null;

  return (
    <div className="grid gap-3">
      <Deep family="bl">
        <p className="font-medium text-tk-tx">
          {[type, size].filter(Boolean).join(' ') || <NotYet>Chưa khai kích thước lô</NotYet>}
        </p>
        <p className="mt-0.5 text-tk-t3">
          {[style && `Phong cách ${style.toLowerCase()}`, floors].filter(Boolean).join(' · ') ||
            '—'}
        </p>
      </Deep>
      <div className="flex flex-wrap gap-1.5">
        {[size, floors, brief.confirmed_at ? 'Đã xác nhận' : 'Bản nháp']
          .filter(Boolean)
          .map((t) => (
            <Chip key={String(t)}>{t}</Chip>
          ))}
      </div>
      {score != null ? (
        <div>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-tk-bl-tile">
            <div
              className="h-full rounded-full bg-tk-bl-bar"
              style={{ width: `${Math.round(score * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 flex justify-between text-xs text-tk-t3">
            <span>Độ đầy đủ</span>
            <span className="tabular-nums">{Math.round(score * 100)}%</span>
          </p>
        </div>
      ) : (
        <p className="text-xs">
          <NotYet>Độ đầy đủ tính sau khi xác nhận đầu bài.</NotYet>
        </p>
      )}
    </div>
  );
}

// ── Thẻ 2: Khảo sát ───────────────────────────────────────────────────────────

export function SurveyCard({
  projectId,
  basePath,
}: {
  projectId: string;
  basePath: string;
}): React.ReactElement {
  const surveys = useDesignSurveys(projectId);
  const photos = useSurveyPhotos(projectId);
  const loading = surveys.isLoading || photos.isLoading;
  // Chỉ nhận ảnh đã ký được đường dẫn — `url` rỗng nghĩa là Storage từ chối, và một thẻ `img`
  // không có nguồn thì trình duyệt vẽ ô vỡ chứ không vẽ chỗ trống.
  const firstPhoto = photos.data?.find((p) => p.url) ?? null;
  const survey = surveys.data?.[0] ?? null;
  const landSize =
    survey?.land_width && survey.land_depth
      ? `${formatNumber(Number(survey.land_width))} × ${formatNumber(Number(survey.land_depth))} m`
      : null;
  const orientation = survey?.orientation ? `Hướng ${survey.orientation}` : null;

  return (
    <ToolCard
      family="gr"
      icon={<Scan className={ICON} aria-hidden />}
      title="Khảo sát hiện trạng"
      description="Số hoá hiện trạng khu đất và hồ sơ bản vẽ để làm đầu vào thiết kế."
      to={`${basePath}?tab=khao-sat`}
    >
      {loading ? (
        <Waiting />
      ) : (surveys.data?.length ?? 0) === 0 ? (
        <Deep family="gr" empty>
          <NotYet>Chưa có biên bản khảo sát nào.</NotYet>
        </Deep>
      ) : (
        <div className="grid gap-2">
          {/* Hai ô xem trước cao 96px (bản mẫu §5.5b). Bản mẫu để ô phải là bản vẽ CAD; hồ sơ
              khảo sát của ta chưa lưu tệp CAD nào, nên ô đó mang thứ khảo sát THẬT SỰ có —
              số đo khu đất. Vẽ một bản vẽ giả cho đúng hình là bịa dữ liệu. */}
          <div className="grid grid-cols-2 gap-2">
            <div
              className={cn(
                'relative h-24 overflow-hidden rounded-md',
                FAMILY.gr.deep,
                'grid place-items-center',
              )}
            >
              {firstPhoto ? (
                <>
                  <img
                    src={firstPhoto.url ?? undefined}
                    alt={firstPhoto.caption || 'Ảnh hiện trạng khu đất'}
                    className="size-full object-cover"
                  />
                  {(photos.data?.length ?? 0) > 1 && (
                    <span className="absolute right-1.5 bottom-1.5 rounded-xs bg-tk-gr-deep2 px-1.5 py-0.5 text-xs text-tk-gr-fg2">
                      +{(photos.data?.length ?? 1) - 1}
                    </span>
                  )}
                </>
              ) : (
                <span className="px-2 text-center text-xs text-tk-t3">Chưa có ảnh hiện trạng</span>
              )}
            </div>
            <div className={cn('grid h-24 place-items-center rounded-md px-2', FAMILY.gr.deep)}>
              {landSize ? (
                <span className="text-center">
                  <span className="block text-tk-tx">{landSize}</span>
                  {orientation && <span className="block text-xs text-tk-t3">{orientation}</span>}
                </span>
              ) : (
                <span className="text-center text-xs text-tk-t3">Chưa đo kích thước lô</span>
              )}
            </div>
          </div>
          <ul className="grid gap-1.5 text-xs">
            <li className="flex justify-between">
              <span className="text-tk-t2">Biên bản khảo sát</span>
              <span className="text-tk-tx">{surveys.data?.length}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-tk-t2">Ảnh hiện trạng</span>
              <span className="text-tk-tx">
                {(photos.data?.length ?? 0) ? photos.data?.length : <NotYet>chưa có</NotYet>}
              </span>
            </li>
          </ul>
        </div>
      )}
    </ToolCard>
  );
}

// ── Thẻ 4: Hồ sơ kỹ thuật ─────────────────────────────────────────────────────

/** Tiến độ ba bộ môn (TK-04) và các hạng mục còn chặn bàn giao thi công. */
export function ExportCard({
  projectId,
  basePath,
}: {
  projectId: string;
  basePath: string;
}): React.ReactElement {
  const tasks = useDisciplineTasks(projectId);
  const sync = useDesignSync(projectId);
  const blocking = (sync.data ?? []).filter((f) => f.blocking).length;
  const byDiscipline = new Map((tasks.data ?? []).map((t) => [t.discipline, t]));

  return (
    <ToolCard
      family="rd"
      icon={<FileStack className={ICON} aria-hidden />}
      title="Hồ sơ kỹ thuật"
      description="Tiến độ ba bộ môn và các hạng mục còn chặn bàn giao thi công."
      to={`${basePath}?tab=ho-so-ky-thuat`}
    >
      {tasks.isLoading ? (
        <Waiting />
      ) : (tasks.data?.length ?? 0) === 0 ? (
        <Deep family="rd" empty>
          <NotYet>Chưa phân công bộ môn nào. Mở để đặt người chịu trách nhiệm từng bộ môn.</NotYet>
        </Deep>
      ) : (
        <div className="grid gap-2">
          <ul className="grid gap-1.5 text-xs">
            {TECHNICAL_DISCIPLINES.map((discipline) => {
              const task = byDiscipline.get(discipline);
              return (
                <li
                  key={discipline}
                  className="flex items-center justify-between gap-2 border-t border-tk-rd-line pt-1.5 first:border-t-0 first:pt-0"
                >
                  <span className="text-tk-t2">{DESIGN_DISCIPLINE_LABELS[discipline]}</span>
                  <span className="text-tk-tx">
                    {task ? (
                      <>
                        {task.progress_percent}%
                        {task.assignee && (
                          <span className="text-tk-t3"> · {task.assignee.full_name}</span>
                        )}
                      </>
                    ) : (
                      <NotYet>chưa phân công</NotYet>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* Con số chặn bàn giao là thứ DUY NHẤT ở thẻ này người dùng phải hành động ngay —
              cùng con số mà nút "Bàn giao thi công" ở header dùng để tự khoá. */}
          <p className="text-xs text-tk-t3">
            {sync.isLoading
              ? 'Đang soát hạng mục chặn bàn giao…'
              : blocking > 0
                ? `${blocking} hạng mục còn chặn bàn giao`
                : 'Không còn hạng mục nào chặn bàn giao'}
          </p>
        </div>
      )}
    </ToolCard>
  );
}

// ── Thẻ 4: Dự toán ────────────────────────────────────────────────────────────

/**
 * Bản dự toán đang hiệu lực của hồ sơ. KHÔNG bày giá: số tiền dự toán thuộc nhóm cột hạn chế
 * (Mẫu D) — thẻ chỉ nói có bản nào, phiên bản mấy, trạng thái gì; con số xem trong màn hình con,
 * nơi quyền theo cột đã lo.
 */
export function EstimateCard({
  projectId,
  basePath,
}: {
  projectId: string;
  basePath: string;
}): React.ReactElement {
  const estimates = useEstimates({ kind: 'design', id: projectId });
  const list = estimates.data ?? [];
  const current = list.find((e) => e.is_current_version) ?? list[0] ?? null;

  return (
    <ToolCard
      family="am"
      icon={<Calculator className={ICON} aria-hidden />}
      title="Dự toán"
      description="Dự toán chi phí xây dựng theo hồ sơ thiết kế, có phiên bản và phê duyệt."
      to={`${basePath}?tab=du-toan`}
    >
      {estimates.isLoading ? (
        <Waiting />
      ) : !current ? (
        <Deep family="am" empty>
          <NotYet>Chưa có bản dự toán nào. Mở để lập dự toán theo hồ sơ thiết kế.</NotYet>
        </Deep>
      ) : (
        <Deep family="am">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-tk-tx">
              {current.code} · phiên bản {current.version}
            </span>
            <StatusLozenge status={current.status} />
          </div>
          <p className="mt-1.5 text-tk-t2">
            {list.length > 1 ? `${list.length} phiên bản` : 'Một phiên bản'}
            {current.prepared && ` · lập bởi ${current.prepared.full_name}`}
            {current.approved_at && ` · phê duyệt ${formatDate(current.approved_at)}`}
          </p>
        </Deep>
      )}
    </ToolCard>
  );
}

// ── Thẻ 5: Trình khách ────────────────────────────────────────────────────────

/**
 * Họ màu xanh dương, KHÔNG tím: tím là màu của AI Design ngay cột bên — trùng màu đọc như hai thứ
 * liên quan. Trình khách đọc từ CHÍNH nguồn mà bước «Trình khách» của dải tiến trình dùng: phiên bản bản vẽ
 * đã phát hành và có `customer_approved_at`.
 */
export function PresentCard({
  projectId,
  basePath,
}: {
  projectId: string;
  basePath: string;
}): React.ReactElement {
  const versions = useDesignVersions(projectId);
  const list = versions.data ?? [];
  const published = list.filter((v) => v.published_at !== null);
  const approved = list
    .filter((v) => v.customer_approved_at !== null)
    .sort((a, b) => b.customer_approved_at!.localeCompare(a.customer_approved_at!));

  return (
    <ToolCard
      family="bl"
      icon={<Presentation className={ICON} aria-hidden />}
      title="Trình khách"
      description="Phiên bản bản vẽ đã phát hành gửi khách hàng duyệt phương án."
      to={`${basePath}?tab=phien-ban`}
    >
      {versions.isLoading ? (
        <Waiting />
      ) : published.length === 0 ? (
        <Deep family="bl" empty>
          <NotYet>Chưa phát hành phiên bản bản vẽ nào để trình khách.</NotYet>
        </Deep>
      ) : (
        <Deep family="bl">
          <ul className="grid gap-1.5">
            <li className="flex justify-between gap-2">
              <span className="text-tk-t2">Phiên bản đã phát hành</span>
              <span className="text-tk-tx">{published.length}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-tk-t2">Khách hàng đã duyệt</span>
              <span className="text-tk-tx">
                {approved.length > 0 ? (
                  `${approved[0]!.title} · ${formatDate(approved[0]!.customer_approved_at!)}`
                ) : (
                  <NotYet>chưa có</NotYet>
                )}
              </span>
            </li>
          </ul>
        </Deep>
      )}
    </ToolCard>
  );
}

// ── Công cụ hỗ trợ: AI Design (KHÔNG thuộc quy trình) ─────────────────────────

/**
 * Lối sang module AI Design — đặt RIÊNG ở cột phải, không trong lưới các bước quy trình.
 *
 * Haan 07/10/2026: AI Design là module độc lập hỗ trợ phòng thiết kế, không nằm trong quy trình
 * thiết kế. Trước đó nó là thẻ thứ ba giữa Khảo sát và Hồ sơ kỹ thuật, kèm câu «chưa chọn phương
 * án» — đọc như một việc hồ sơ còn nợ. Ở đây chỉ còn: nó là gì, đã có bao nhiêu bản phác, và lối
 * mở. Không trạng thái «xong / chưa xong», không lời nhắc phải chọn.
 */
export function AiDesignSupportPanel({ projectId }: { projectId: string }): React.ReactElement {
  const state = useAiDesignState(projectId);
  const count = state.data?.plans.length ?? 0;

  return (
    <section aria-label="Công cụ hỗ trợ" className={cn('rounded-lg border p-4', FAMILY.pu.card)}>
      <h3 className="text-xs font-medium tracking-[0.04em] text-tk-t3 uppercase">Công cụ hỗ trợ</h3>
      <div className="mt-3 flex items-start gap-3">
        <span
          className={cn('grid size-9 shrink-0 place-items-center rounded-md', FAMILY.pu.tile)}
          aria-hidden
        >
          <Sparkles className={ICON} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">AI Design</p>
          <p className="mt-0.5 text-xs leading-relaxed text-tk-t2">
            Công cụ hỗ trợ kỹ sư phác mặt bằng, mặt đứng và phối cảnh bằng AI từ đầu bài. Bản phác
            chỉ để tham khảo, không thuộc quy trình của hồ sơ.
          </p>
          <p className="mt-2 text-xs">
            {state.isLoading ? (
              <NotYet>Đang tải…</NotYet>
            ) : count > 0 ? (
              `Có ${count} bản phác mặt bằng.`
            ) : (
              <NotYet>Chưa dùng cho hồ sơ này.</NotYet>
            )}
          </p>
        </div>
      </div>
      <Link
        to={`/tk/ai-design/${projectId}`}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-sm bg-tk-pu-solid px-3 font-medium text-white transition-colors hover:bg-tk-pu-solid2"
      >
        Mở AI Design
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
