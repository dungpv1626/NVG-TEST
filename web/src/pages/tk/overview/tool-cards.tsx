/**
 * Sáu thẻ Bộ công cụ thiết kế (bản mẫu §5.5b). Mỗi thẻ là cửa vào một màn hình con và bày sẵn
 * con số quan trọng nhất của bước đó, để đọc dải thẻ là biết ngay còn thiếu gì.
 *
 * Mọi con số ở đây đều lấy từ truy vấn thật. Chỗ nào chưa có dữ liệu thì nói "chưa có", KHÔNG
 * hiện `0` — xem `NotYet` trong `ui.tsx`.
 *
 * Các thẻ dùng chung khoá truy vấn với chính màn hình con của chúng, nên mở thẻ ra là dữ liệu
 * đã nằm sẵn trong bộ nhớ đệm, không phải chờ lần nữa.
 */

import { ClipboardList, FileStack, Ruler, Scan, Sparkles } from 'lucide-react';
import { DESIGN_DISCIPLINE_LABELS, formatNumber, TECHNICAL_DISCIPLINES } from '@nvg/shared';
import { BUILDING_TYPE_LABEL, STYLE_LABEL } from '@nvg/shared/design';
import { Skeleton } from '@/components/ui/states';
import { useDesignSurveys } from '@/hooks/use-design-surveys';
import { useSurveyPhotos } from '@/hooks/use-survey-photos';
import {
  useDesignBriefs,
  useDesignSync,
  useDisciplineTasks,
  useFloorPlanVariants,
  useGenerateFloorPlans,
  useSpaceProgram,
  type DesignBriefRecord,
  type FloorPlanVariant,
} from '@/hooks/use-design-projects';
import { useAiDesignState } from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
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

// ── Thẻ 3: Chương trình không gian ────────────────────────────────────────────

export function ProgramCard({
  projectId,
  basePath,
}: {
  projectId: string;
  basePath: string;
}): React.ReactElement {
  const program = useSpaceProgram(projectId);

  const floors = program.data
    ? [...new Set(program.data.program.spaces.map((s) => s.floor))].sort((a, b) => a - b)
    : [];
  const allocation = new Map(
    (program.data?.program.floor_allocation ?? []).map((f) => [f.floor, f]),
  );

  return (
    <ToolCard
      family="am"
      icon={<Ruler className={ICON} aria-hidden />}
      title="Chương trình không gian"
      description="Xác định các phòng, diện tích, tầng và quan hệ giữa các không gian."
      to={`${basePath}?tab=chuong-trinh-khong-gian`}
    >
      {program.isLoading ? (
        <Waiting />
      ) : !program.data || floors.length === 0 ? (
        <Deep family="am">
          <NotYet>Chưa có chương trình không gian. Cần xác nhận đầu bài trước.</NotYet>
        </Deep>
      ) : (
        <div className="text-xs">
          <ul>
            {floors.map((floor) => {
              const spaces = program.data!.program.spaces.filter((s) => s.floor === floor);
              const area = allocation.get(floor)?.allocated_area_m2;
              return (
                <li
                  key={floor}
                  className="flex h-8 items-center justify-between border-t border-tk-am-line"
                >
                  <span className="text-tk-tx">Tầng {floor}</span>
                  <span className="text-tk-t2">
                    {spaces.length} không gian
                    {area != null && ` · ${formatNumber(area, 1)} m²`}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-tk-t3">
            {program.data.program.spaces.length} không gian · {floors.length} tầng
          </p>
        </div>
      )}
    </ToolCard>
  );
}

// ── Thẻ 4: AI phương án kiến trúc ─────────────────────────────────────────────

/**
 * Bốn chỉ tiêu khách hay hỏi khi chọn phương án. Cùng thứ tự với bảng ở màn hình con, để nhìn
 * thẻ rồi mở ra không phải tìm lại hàng nào là hàng nào.
 */
const COMPARE_ROWS: [string, (s: NonNullable<FloorPlanVariant['summary']>) => React.ReactNode][] = [
  ['Tổng diện tích', (s) => `${formatNumber(s.total_area_m2, 1)} m²`],
  ['Phòng ngủ', (s) => s.bedrooms],
  ['Giao thông', (s) => `${formatNumber(s.circulation_share * 100, 1)}%`],
  [
    'Ràng buộc',
    (s) =>
      s.violations.length === 0 ? (
        `${s.rulesPassed ?? s.rulesChecked ?? 0}/${s.rulesChecked ?? 0} đạt`
      ) : (
        <span className="text-tk-am-fg">{s.violations.length} cảnh báo</span>
      ),
  ],
];

/**
 * Thẻ "So sánh phương án" TỪNG là một thẻ riêng, đúng như bản mẫu §5.5b tách làm hai.
 *
 * Bản mẫu tách được vì thẻ thứ tư của nó bày ba ẢNH mặt bằng thu nhỏ — hình với số là hai thứ
 * khác hẳn nhau. Ở đây trình duyệt không dựng hình học (bất biến 5), nên thẻ thứ tư chỉ còn
 * chữ, và hai thẻ hoá ra cùng đọc một nguồn dữ liệu, cùng mở một màn hình, cùng nói về ba
 * phương án. Haan chỉ ra điều đó ngày 06/09/2026.
 *
 * Nay gộp làm một: hàng ô nói ba phương án khác nhau ở CHỖ NÀO, bảng nói chọn cái nào thì
 * được gì. "So sánh" không phải một bước của quy trình — nó là một cách nhìn bên trong bước
 * Phương án, và mỗi thẻ ở Tổng quan ứng với đúng một bước.
 */
export function VariantsCard({
  projectId,
  basePath,
  readOnly,
}: {
  projectId: string;
  basePath: string;
  readOnly: boolean;
}): React.ReactElement {
  const variants = useFloorPlanVariants(projectId);
  const generate = useGenerateFloorPlans();
  const feasible = (variants.data?.variants ?? []).filter((v) => v.status === 'ok');
  const rules = feasible.map((v) => v.summary).filter((s): s is NonNullable<typeof s> => s != null);
  const checked = rules.reduce((max, s) => Math.max(max, s.rulesChecked ?? 0), 0);
  const passedAll = rules.every((s) => (s.violations?.length ?? 0) === 0);

  return (
    <ToolCard
      family="pu"
      icon={<Sparkles className={ICON} aria-hidden />}
      title="AI phương án kiến trúc"
      description="Sinh 3–4 phương án tổ chức mặt bằng khác nhau dựa trên đầu bài và quy tắc."
      to={`${basePath}?tab=phuong-an`}
      action={
        readOnly ? undefined : (
          // Nút này chạy ĐÚNG mutation của màn hình con, không phải một lối đi thứ hai: một
          // nút tên "Tạo phương án mới" mà chỉ điều hướng là nói sai kết quả (CGD 4.6).
          <CardAction
            tone="pu"
            onClick={() => generate.mutate({ projectId })}
            disabled={generate.isPending}
          >
            {generate.isPending ? 'Đang sinh phương án…' : 'Tạo phương án mới'}
          </CardAction>
        )
      }
    >
      {variants.isLoading ? (
        <Waiting />
      ) : feasible.length === 0 ? (
        <Deep family="pu">
          <NotYet>Chưa sinh phương án nào. Cần chốt chương trình không gian trước.</NotYet>
        </Deep>
      ) : (
        <div className="grid gap-2">
          {/* Ô phương án KHÔNG vẽ mặt bằng thu nhỏ.
              Hai lý do, cả hai đều cứng: trình duyệt không dựng hình học (bất biến 5), còn tờ
              bản vẽ thật do Container sinh là khổ A3 đầy trục và chuỗi kích thước — thu vào ô
              rộng chín chục điểm ảnh chỉ ra một vệt xám. Nên ô này mang thứ THẬT SỰ phân biệt
              ba phương án với nhau: cấu trúc lõi thang và hành lang. Bản vẽ xem ở màn hình con.

              Hàng ô này và bảng bên dưới trả lời hai câu khác nhau: "ba phương án khác nhau ở
              CHỖ NÀO" và "chọn cái nào thì được gì". Bỏ hàng ô thì bảng số nói rằng ba phương
              án chỉ khác nhau vài con số — đúng thứ màn hình con cảnh báo là hiểu sai. */}
          <ul className="grid grid-cols-3 gap-2">
            {feasible.slice(0, 3).map((v) => (
              <li
                key={v.artifactId}
                className={cn(
                  'flex min-h-16 flex-col gap-1 rounded-sm border p-2',
                  v.isHead ? 'border-tk-pu-sel' : 'border-tk-pu-line',
                  'bg-tk-pu-deep',
                )}
              >
                <span className="font-semibold text-tk-pu-fg">{v.variantId}</span>
                <span className="line-clamp-3 text-[11px] leading-snug text-tk-t2">{v.label}</span>
                {v.isHead && <span className="mt-auto text-[11px] text-tk-acc">Đang hiệu lực</span>}
              </li>
            ))}
          </ul>

          <table className="w-full text-xs">
            <caption className="sr-only">So sánh các phương án khả thi</caption>
            <thead>
              <tr className="border-b border-tk-pu-line text-tk-t2">
                <th scope="col" className="py-1.5 pr-2 text-left font-normal">
                  Chỉ tiêu
                </th>
                {feasible.slice(0, 3).map((v) => (
                  <th
                    key={v.artifactId}
                    scope="col"
                    title={v.label}
                    className="px-2 py-1.5 text-right font-normal"
                  >
                    {v.variantId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(([label, cell]) => (
                <tr key={label}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-tk-t2">
                    {label}
                  </th>
                  {feasible.slice(0, 3).map((v) => (
                    <td
                      key={v.artifactId}
                      className="px-2 py-1.5 text-right tabular-nums text-tk-tx"
                    >
                      {v.summary ? cell(v.summary) : <NotYet>—</NotYet>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {generate.error && (
            <p className="text-xs text-status-overdue">{toUserMessage(generate.error)}</p>
          )}
          <p className="text-xs text-tk-t2">
            {feasible.length} phương án khả thi
            {checked > 0 && (
              <>
                {' · '}
                {passedAll ? `${checked}/${checked} quy tắc đạt` : 'có cảnh báo ràng buộc'}
              </>
            )}
          </p>
        </div>
      )}
    </ToolCard>
  );
}

// ── Thẻ 6: Hồ sơ kỹ thuật ─────────────────────────────────────────────────────

/**
 * Thẻ này TỪNG bày ba tệp xuất ra (DXF · XLSX · PDF) của phương án đang hiệu lực và mở màn
 * hình Phương án kiến trúc — đúng bản mẫu, nhưng bản mẫu gọi nó là "Hồ sơ & DXF".
 *
 * Khi thẻ đổi tên thành "Hồ sơ kỹ thuật" (Haan chốt 06/09/2026) thì tên và nội dung chỏi nhau:
 * hệ thống ĐÃ có một bước tên như vậy — bước 5 của dải tiến trình, màn hình ba bộ môn (TK-04)
 * — nên một thẻ mang tên đó mà mở ra phần xuất tệp của bước 4 là dẫn người dùng đi sai chỗ.
 * Nay thẻ bày đúng thứ bước đó nói: tiến độ ba bộ môn và các hạng mục còn chặn bàn giao.
 *
 * Ba tệp xuất ra KHÔNG mất: chúng nằm trong màn hình Phương án kiến trúc, cạnh tờ bản vẽ và
 * bảng thống kê sinh ra chúng.
 */
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

// ── Thẻ 6: Thiết kế AI ────────────────────────────────────────────────────────

/**
 * Cửa vào nhánh AI (T15–T18, 09/09/2026).
 *
 * Thẻ này CỐ Ý không nằm trong dải "năm bước quy trình" của bộ giải: nhánh AI là một dòng
 * riêng, không phải một bước của dòng kia. Nó bày đúng một con số — đã lập chương trình không
 * gian chưa — vì đó là điều kiện để ba bước sau chạy được.
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
      title="Thiết kế AI"
      description="Chương trình không gian, mặt bằng, mặt đứng và phối cảnh do AI đề xuất."
      to={`${basePath}?tab=thiet-ke-ai`}
    >
      {state.isLoading ? (
        <Waiting />
      ) : (
        <Deep family="pu">
          {state.data?.program ? (
            <>
              Đã có chương trình không gian: {state.data.program.payload.spaces.length} không gian.
              {state.data.plans.length > 0 && ` ${state.data.plans.length} phương án mặt bằng.`}
            </>
          ) : (
            <NotYet>Chưa chạy bước nào. Mở để AI lập chương trình không gian.</NotYet>
          )}
        </Deep>
      )}
    </ToolCard>
  );
}
