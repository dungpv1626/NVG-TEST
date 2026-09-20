/**
 * Bốn thẻ Bộ công cụ thiết kế (bản mẫu §5.5b). Mỗi thẻ là cửa vào một màn hình con và bày sẵn
 * con số quan trọng nhất của bước đó, để đọc dải thẻ là biết ngay còn thiếu gì.
 *
 * Mọi con số ở đây đều lấy từ truy vấn thật. Chỗ nào chưa có dữ liệu thì nói "chưa có", KHÔNG
 * hiện `0` — xem `NotYet` trong `ui.tsx`.
 *
 * Các thẻ dùng chung khoá truy vấn với chính màn hình con của chúng, nên mở thẻ ra là dữ liệu
 * đã nằm sẵn trong bộ nhớ đệm, không phải chờ lần nữa.
 */

import { ClipboardList, FileStack, Scan, Sparkles } from 'lucide-react';
import { DESIGN_DISCIPLINE_LABELS, formatNumber, TECHNICAL_DISCIPLINES } from '@nvg/shared';
import { BUILDING_TYPE_LABEL, STYLE_LABEL } from '@nvg/shared/design';
import { Skeleton } from '@/components/ui/states';
import { useDesignSurveys } from '@/hooks/use-design-surveys';
import { useSurveyPhotos } from '@/hooks/use-survey-photos';
import {
  useDesignBriefs,
  useDesignSync,
  useDisciplineTasks,
  type DesignBriefRecord,
} from '@/hooks/use-design-projects';
import { useAiDesignState } from '@/hooks/use-ai-design';
import { CardAction, Chip, FAMILY, NotYet, ToolCard } from '../tk-ui';
import { cn } from '@/lib/utils';

const ICON = 'size-[18px]';

function Deep({
  family,
  children,
}: {
  family: keyof typeof FAMILY;
  children: React.ReactNode;
}): React.ReactElement {
  return <div className={cn('rounded-md p-3 text-xs', FAMILY[family].deep)}>{children}</div>;
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
      <Deep family="bl">
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
        <Deep family="gr">
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
      action={
        <CardAction tone="rd" to={`${basePath}?tab=ho-so-ky-thuat`}>
          Mở hồ sơ kỹ thuật
        </CardAction>
      }
    >
      {tasks.isLoading ? (
        <Waiting />
      ) : (tasks.data?.length ?? 0) === 0 ? (
        <Deep family="rd">
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

// ── Thẻ 3: AI Design ──────────────────────────────────────────────────────────

/**
 * Cửa vào nhánh AI. Tên «AI Design» là ngoại lệ tiếng Anh có chủ đích (Haan, T58). Bày số phương
 * án mặt bằng và đã chọn phương án nào chưa — bước mặt đứng chờ phương án được chọn.
 */
export function AiDesignCard({
  projectId,
  basePath,
}: {
  projectId: string;
  basePath: string;
}): React.ReactElement {
  const state = useAiDesignState(projectId);

  return (
    <ToolCard
      family="pu"
      icon={<Sparkles className={ICON} aria-hidden />}
      title="AI Design"
      description="Mặt bằng từng tầng, mặt đứng và phối cảnh do AI đề xuất từ đầu bài và khảo sát."
      to={`${basePath}?tab=thiet-ke-ai`}
    >
      {state.isLoading ? (
        <Waiting />
      ) : (
        <Deep family="pu">
          {state.data && state.data.plans.length > 0 ? (
            <>
              {state.data.plans.length} phương án mặt bằng
              {state.data.planHeadArtifactId
                ? ' · đã chọn một phương án.'
                : ' · chưa chọn phương án.'}
            </>
          ) : (
            <NotYet>Chưa có phương án mặt bằng nào. Mở để AI dựng mặt bằng từ đầu bài.</NotYet>
          )}
        </Deep>
      )}
    </ToolCard>
  );
}
