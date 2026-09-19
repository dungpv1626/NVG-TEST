/**
 * Panel điểm chất lượng mặt bằng — 15 tiêu chí, 5 nhóm (Đợt C′ của phương án, T24·T27·T31).
 *
 * Bốn thứ panel này phải nói ra, và cả bốn là ràng buộc chứ không phải chi tiết trình bày:
 *
 *  1. **Điểm KHÔNG phải trên 100.** Nó là điểm trên `scoredWeight` — phần trọng số thật sự chấm
 *     được. In «89» cạnh một dấu «/100» ngầm là nói sai khi có tiêu chí thiếu đầu vào, và phần
 *     thiếu cố ý KHÔNG chia lại cho tiêu chí khác (CLAUDE.md 5.2).
 *  2. **Tiêu chí không chấm được hiện LÝ DO, không hiện 0.** Và hai lý do khác hẳn nhau: «cổng dữ
 *     liệu đã bảo đảm» là đã đạt rồi nên không chấm, «thiếu đầu vào» là không biết. Gộp hai thứ
 *     vào một ô trống thì người đọc tự điền nghĩa, thường là nghĩa có lợi.
 *  3. **`n` và nhãn `[ĐO]`/`[CHUNG]` hiện ở TỪNG DÒNG** (T31). Bộ đo mới có n ≤ 6, nên «Chưa đủ
 *     dữ liệu» phải nhìn thấy được ở mức từng tiêu chí, không chỉ ở một câu chung cuối panel.
 *  4. **Thước cũ phải bị gọi ra.** `scoreVersion ≠ currentVersion` nghĩa là con số này chấm bằng
 *     cái thước khác với thước hôm nay; hai dòng như vậy trong bảng so model là hai con số không
 *     so được (T27). Không chấm lại ở đây được — điểm nằm trong payload bất biến, chấm lại đòi
 *     đúc lại phương án, tức một lượt gọi mô hình có tính tiền.
 */

import { AlertTriangle, Info } from 'lucide-react';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { formatNumber } from '@nvg/shared';
import type { AiPlanScoreCriterion, AiPlanScoreView } from '@/hooks/use-ai-design';
import { Chip, Panel } from '../tk-ui';

export function PlanScorePanel({ score }: { score: AiPlanScoreView | null }): React.ReactElement {
  if (!score) {
    return (
      <Panel title="Điểm chất lượng" aside={<Chip tone="mute">Chưa chấm</Chip>}>
        {/* Artifact bất biến nên không có đường chấm bù về sau: phương án cũ đành không có điểm.
            Nói thẳng cái giá của việc muốn có, kẻo người dùng đi tìm một cái nút không tồn tại. */}
        <p className="text-fg-subtle">
          Phương án này xếp trước khi có thước chấm nên không mang điểm. Điểm nằm trong chính phương
          án, không phải một ô sửa được, nên chấm bù đòi xếp lại phương án — tức một lượt gọi mô
          hình mới.
        </p>
      </Panel>
    );
  }

  const missing = 100 - score.scoredWeight;
  const staleRuler = score.scoreVersion !== score.currentVersion;

  return (
    <Panel
      title="Điểm chất lượng"
      aside={
        <Chip tone={staleRuler ? 'am' : 'mute'}>
          Thước phiên bản {score.scoreVersion}
          {staleRuler ? ` · hôm nay ${score.currentVersion}` : ''}
        </Chip>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-semibold">{formatNumber(score.points, 1)}</span>
        {/* Mẫu số là `scoredWeight`, và nó in ra thành chữ ngay cạnh con số — không để dấu gạch
            chéo tự nói, vì «89/89» đọc nhanh thành «89/100». */}
        <span>
          điểm trên <b>{formatNumber(score.scoredWeight, 2)}</b> phần trọng số chấm được
        </span>
      </div>

      {missing > 0.001 && (
        <p className="mt-2 flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
          <span>
            {formatNumber(missing, 2)} phần trọng số không chấm được trên phương án này, và{' '}
            <b>không chia lại</b> cho tiêu chí khác. Hai phương án có phần trọng số chấm được khác
            nhau thì hai điểm không so trực tiếp với nhau được.
          </span>
        </p>
      )}

      {score.reasonedWeight > 0.001 && (
        <p className="mt-2 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-pending" aria-hidden />
          <span>
            <b>{formatNumber(score.reasonedWeight, 2)} phần trọng số dựa trên ngưỡng chưa ai đo</b>{' '}
            (n = 0). Phần đó là suy luận, không phải số đo trên hồ sơ thật.
          </span>
        </p>
      )}

      {staleRuler && (
        <p className="mt-2 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-pending" aria-hidden />
          <span>
            Điểm này chấm bằng thước phiên bản {score.scoreVersion}; thước hôm nay là phiên bản{' '}
            {score.currentVersion}. Hai con số chấm bằng hai thước khác nhau không so với nhau được.
          </span>
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {score.groups.map((group) => (
          <li key={group.code} className="flex flex-wrap items-baseline gap-x-2">
            <b className="w-5 shrink-0">{group.code}</b>
            <span className="min-w-0 flex-1">{group.vi}</span>
            <span className="tabular-nums">
              {formatNumber(group.points, 2)} / {formatNumber(group.scoredWeight, 2)}
              {group.scoredWeight + 0.001 < group.weight && (
                <span className="text-fg-subtle">
                  {' '}
                  (trọng số nhóm {formatNumber(group.weight, 2)})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <table className="mt-4 w-full border-collapse text-left">
        <caption className="sr-only">Điểm từng tiêu chí, kèm số mẫu đã đo và nguồn ngưỡng</caption>
        <thead>
          <tr className="border-b border-tk-line text-fg-subtle">
            <th scope="col" className="py-1 pr-2 font-medium">
              Tiêu chí
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Đo được
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Điểm
            </th>
            <th scope="col" className="py-1 font-medium">
              Nguồn ngưỡng
            </th>
          </tr>
        </thead>
        <tbody>
          {score.criteria.map((entry) => (
            <CriterionRow key={entry.code} entry={entry} />
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-fg-subtle">{score.coSoDuLieu}</p>
      <p className="mt-3 font-medium">{AI_DISCLAIMERS.scoreNotJudgement}</p>
    </Panel>
  );
}

function CriterionRow({ entry }: { entry: AiPlanScoreCriterion }): React.ReactElement {
  const scored = entry.notScored === null && entry.score !== null;
  return (
    <tr className="border-b border-tk-line align-top">
      <th scope="row" className="py-2 pr-2 font-normal">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b>{entry.code}</b>
          <span className="min-w-0">{entry.vi}</span>
        </span>
        {entry.giaiThich && <p className="mt-0.5 text-fg-subtle">{entry.giaiThich}</p>}
        {entry.refs.length > 0 && (
          // Chỗ bị trừ điểm, nêu tên. Một con số thấp không nói được phải sửa gì; danh sách phòng
          // thì nói được — và chính danh sách này đi vào ghi chú «tránh những chỗ này» của lượt
          // lấy mẫu sau (T25), nên nó là cùng một dữ liệu cho hai người đọc.
          <p className="mt-0.5 text-fg-subtle">Chỗ bị trừ: {entry.refs.join(', ')}</p>
        )}
      </th>
      <td className="py-2 pr-2 tabular-nums">
        {/* Không chấm được thì hiện LÝ DO, không hiện 0 — `0` đọc như «vi phạm hết»
            (CLAUDE.md 5.2). Hai lý do giữ riêng: cổng đã bảo đảm, hay thiếu đầu vào. */}
        {entry.notScored !== null ? (
          <span className="text-fg-subtle">
            {entry.why ??
              (entry.notScored === 'gate'
                ? 'Cổng dữ liệu đã bảo đảm nên không chấm điểm.'
                : 'Chưa đủ dữ liệu để chấm tiêu chí này.')}
          </span>
        ) : entry.value === null ? (
          <span className="text-fg-subtle">Chưa đủ dữ liệu</span>
        ) : (
          formatNumber(entry.value, 3)
        )}
      </td>
      <td className="py-2 pr-2 tabular-nums">
        {scored ? (
          <>
            {formatNumber(entry.score! * entry.weight, 2)} / {formatNumber(entry.weight, 2)}
          </>
        ) : entry.notScored === 'thieu_du_lieu' ? (
          // Nói ra trọng số bị rút khỏi mẫu số, vì đây chính là chỗ `scoredWeight` tụt dưới 100.
          // Không có dòng này thì con số thiếu ở đầu panel không truy được về tiêu chí nào.
          <span className="text-fg-subtle">không cộng ({formatNumber(entry.weight, 2)} phần)</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="py-2">
        <span className="flex flex-wrap items-baseline gap-1">
          <Chip tone={entry.n > 0 ? 'gr' : 'am'}>
            {entry.label || (entry.n > 0 ? 'ĐO' : 'CHUNG')}
          </Chip>
          <span className="text-fg-subtle">n = {entry.n}</span>
        </span>
      </td>
    </tr>
  );
}
