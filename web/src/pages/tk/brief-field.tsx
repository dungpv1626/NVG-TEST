/**
 * Một trường của biểu mẫu Đầu bài, vẽ theo CẤU HÌNH.
 *
 * Nguồn: `doc/design/08-milestones.md` Mốc 2 — "logic hiện/ẩn nằm trong cấu hình JSON chứ
 * không viết cứng trong giao diện".
 *
 * Tệp này biết cách vẽ TỪNG KIỂU điều khiển; nó không biết trường nào thuộc loại hình nào,
 * trường nào bắt buộc, thứ tự ra sao. Tất cả những thứ đó nằm ở
 * `shared/src/design/brief-form.json`. Thêm một câu hỏi cho biệt thự là sửa tệp JSON đó,
 * không sửa tệp này.
 *
 * ⚠️ Không dùng điều khiển gốc nào TỰ SINH CHỮ của trình duyệt (CLAUDE.md 4.1): ô chọn ngày
 * gốc và ô số gốc đều hiện tiếng Anh trên máy đặt ngôn ngữ khác — bảng lịch ra "September",
 * nút tăng giảm và thông báo `step` ra tiếng Anh. Ngày dùng `DateInput`, số dùng ô chữ kèm
 * `inputMode`. Có kiểm thử grep canh trong `web/src/test/design-rules.test.ts`.
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import { formatNumber } from '@nvg/shared/format';
import {
  ACCESS_SIDES,
  FAMILY_ROLE_LABEL,
  FAMILY_ROLES,
  ROOM_LABEL,
  SIDE_LABEL,
  bedroomOwnerLabels,
  bedroomTypeFor,
  bedroomsFor,
  displayNumber,
  isBedroomType,
  memberWantsEnsuite,
  siteGeometry,
  storedNumber,
  type BriefFormField,
} from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { cn } from '@/lib/utils';
import { SiteImageUpload } from './site-image-upload';
import type { SiteBoundaryExtractionResult } from '@/hooks/use-site-boundary-extraction';

// Nhãn lấy TỪ `@nvg/shared/design`, không khai lại ở đây: cùng bộ nhãn còn được dùng ở chế
// độ xem đầu bài, và hai bản khai riêng sẽ lệch nhau đúng vào ngày thêm một vai trò mới.
const SIDES = ACCESS_SIDES.map((key) => ({ key, label: SIDE_LABEL[key] }));
const FAMILY_ROLE_OPTIONS = FAMILY_ROLES.map((value) => ({
  value,
  label: FAMILY_ROLE_LABEL[value],
}));
/**
 * Điều khiển nào có NHIỀU ô nhập bên trong — nhãn phải là `<fieldset>`/`<legend>`.
 *
 * `<label>` bọc nhiều ô thì trình duyệt chuyển mọi cú bấm rơi vào khoảng trống sang ô ĐẦU
 * TIÊN: bấm cạnh một hàng nút chọn lại bật/tắt hộ nút thứ nhất. Xem `components/ui/field.tsx`.
 */
const GROUP_CONTROLS = new Set([
  'choice',
  'multi',
  'tristate',
  'sides',
  'space_floor',
  'family',
  'money_range',
  'polygon',
]);

/**
 * Ô nhập số — giữ nguyên CHỮ người dùng đang gõ, chỉ phát ra SỐ.
 *
 * Ô điều khiển đơn giản (`value={String(value)}`) làm mất dấu thập phân giữa chừng: gõ "3"
 * ra 3, gõ tiếp "." thì `Number("3.")` vẫn là 3 nên ô vẽ lại thành "3" — dấu chấm biến mất,
 * và ký tự tiếp theo cho ra "35". Người nhập 3,5 m mặt tiền được một thửa rộng 35 m.
 *
 * Lỗi này thấy được trên màn hình nên không phải loại im lặng nhất, nhưng nó khiến MỌI kích
 * thước lẻ không gõ nổi — mà kích thước thửa đất thì gần như luôn lẻ.
 *
 * Cách chữa: chữ nằm trong state của ô, số đi ra ngoài. Chỉ nạp lại chữ khi giá trị đổi TỪ
 * BÊN NGOÀI (mở hồ sơ khác, bấm "Lấy từ khảo sát hiện trạng") — nhận ra bằng cách so với
 * giá trị chính ô này vừa phát ra.
 */
function NumberField({
  value,
  label,
  placeholder,
  min,
  max,
  onChange,
}: {
  value: unknown;
  label: string;
  /** Chữ mờ khi ô trống — nói ô này BỎ TRỐNG ĐƯỢC, đừng để trông như một chỗ phải điền. */
  placeholder?: string;
  /**
   * Khoảng hợp lệ theo ĐƠN VỊ NGƯỜI DÙNG (cấu hình `min`/`max` của trường). Trước 08/09/2026
   * hai số này được khai trong `brief-form.json` mà không nơi nào đọc: gõ «0» vào Số tầng hay
   * «150» vào Mật độ đều lưu êm, rồi lúc xác nhận Worker báo «Còn thiếu: Số tầng» — một ô đang
   * có số mà bị bảo là thiếu.
   */
  min?: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}) {
  const asNumber = typeof value === 'number' ? value : undefined;
  const [text, setText] = useState(asNumber === undefined ? '' : String(asNumber));
  const emitted = useRef<number | undefined>(asNumber);

  useEffect(() => {
    if (asNumber !== emitted.current) {
      setText(asNumber === undefined ? '' : String(asNumber));
      emitted.current = asNumber;
    }
  }, [asNumber]);

  /**
   * Chữ đang hiện trong ô KHÔNG đọc ra được thành một con số.
   *
   * Đây là chỗ hỏng im lặng nhất của cả biểu mẫu, Haan gặp thật ngày 07/09/2026: gõ «25-30»
   * vào ô diện tích thì `Number('25-30')` ra `NaN`, ô phát ra `undefined` — còn CHỮ thì nằm
   * trong state của chính ô nên vẫn hiện nguyên trên màn hình. Người dùng nhìn thấy con số
   * mình vừa gõ, bấm Lưu, nhận báo thành công, và ô đó lưu xuống `null`. Không một dấu hiệu
   * nào ở bất kỳ khâu nào.
   *
   * Nói ra NGAY TẠI Ô, không để dành tới lúc lưu: lúc đó người dùng đã đi qua bốn bước và
   * không còn nhớ mình gõ gì ở đâu.
   */
  const parsedNow = parseNumber(text);
  const unusable = text.trim() !== '' && parsedNow === undefined;
  const outOfRange =
    parsedNow !== undefined &&
    ((min !== undefined && parsedNow < min) || (max !== undefined && parsedNow > max));
  const rangeText =
    min !== undefined && max !== undefined
      ? `Chỉ nhận số từ ${formatNumber(min)} đến ${formatNumber(max)}.`
      : min !== undefined
        ? `Chỉ nhận số từ ${formatNumber(min)} trở lên.`
        : max !== undefined
          ? `Chỉ nhận số tới ${formatNumber(max)}.`
          : '';
  const invalid = unusable || outOfRange;

  return (
    <div className="space-y-1">
      <Input
        // `inputMode` mở bàn phím số trên di động mà KHÔNG kéo theo nút tăng/giảm và thông báo
        // `step` tiếng Anh của ô số gốc (CLAUDE.md 4.1).
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={text}
        className={invalid ? 'border-status-overdue' : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseNumber(e.target.value);
          emitted.current = parsed;
          onChange(parsed);
        }}
      />
      {/* Kèm CHỮ, không chỉ viền đỏ — màu không được là cách duy nhất truyền đạt (CGD 6.8). */}
      {unusable && <p className="text-xs text-status-overdue">Chỉ nhận một số. Ví dụ 28.</p>}
      {outOfRange && <p className="text-xs text-status-overdue">{rangeText}</p>}
    </div>
  );
}

/** Nút viên thuốc — vùng bấm tối thiểu 40px cho ngón tay (CGD 6.8). */
function Chip({
  active,
  label,
  rank,
  onClick,
}: {
  active: boolean;
  label: string;
  /**
   * Thứ hạng của lựa chọn này, bắt đầu từ 1. Chỉ dùng cho `multi` có `ordered`.
   *
   * Thứ tự chọn VỐN đã được lưu, nhưng trước 07/09/2026 không hiện ra — nên câu gợi ý «chọn
   * theo thứ tự quan trọng giảm dần» là một yêu cầu người dùng không có cách nào kiểm.
   */
  rank?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3',
        active
          ? 'border-brand bg-brand-subtle font-semibold text-brand'
          : 'border-border text-fg-subtle',
      )}
    >
      {rank !== undefined && (
        <>
          {/* Con số trong vòng tròn là hình, không phải chữ đọc lên được: trình đọc màn hình
              phát ra "1 Phong thuỷ" thì không rõ 1 là thứ hạng hay số lượng. Nên số ẩn khỏi
              cây trợ năng, và câu đầy đủ đi kèm ở `sr-only`. */}
          <span
            aria-hidden
            className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-xs text-on-brand"
          >
            {rank}
          </span>
          <span className="sr-only">Ưu tiên thứ {rank}:</span>
        </>
      )}
      {label}
    </button>
  );
}

/**
 * Các lựa chọn tầng, dựng TỪ số tầng đã khai — «Tầng 1», «Tầng 2», không phải «tầng giữa».
 *
 * Một bộ từ vựng duy nhất cho cùng một khái niệm: `required_spaces[].floor` vốn đã là số
 * tầng thật, nên để phần gia đình nói «tầng giữa» là bắt người dùng dịch giữa hai thang đo
 * ngay trong một biểu mẫu — mà «tầng giữa» của một căn hai tầng thì không trỏ vào tầng nào.
 *
 * Giá trị đã lệch ra ngoài dải (khai xong rồi mới giảm số tầng) vẫn được liệt kê, có ghi chú.
 * Bỏ nó đi thì ô hiện trống và lần lưu tiếp theo âm thầm xoá một câu trả lời người dùng chưa
 * hề đụng tới — cùng lý lẽ với các lựa chọn `retired` ở điều khiển `select`.
 */
function floorOptions(floors: number, current: number | null | undefined) {
  const levels = Array.from({ length: floors }, (_, i) => i + 1);
  const stale = current != null && current > floors ? current : null;
  return (
    <>
      {levels.map((f) => (
        <option key={f} value={f}>{`Tầng ${f}`}</option>
      ))}
      {stale !== null && (
        <option value={stale}>{`Tầng ${stale} — công trình chỉ có ${floors} tầng`}</option>
      )}
    </>
  );
}

/**
 * Ô «Thêm phòng» ở cuối danh sách — chọn loại rồi bấm thêm.
 *
 * Đứng riêng để dùng được `useState` mà không vướng quy tắc gọi hook: `BriefControl` gọi các
 * nhánh khác nhau trong một `switch`.
 *
 * Vì sao một ô chọn ở CUỐI thay vì một nút «nhân đôi» trên từng dòng: thêm phòng thứ hai
 * cùng loại là việc hiếm, còn nút trên mỗi dòng thì hiện mười tám lần.
 */
function AddSpaceRow({
  options,
  onAdd,
}: {
  options: readonly { value: string; label: string }[];
  onAdd: (type: string) => void;
}) {
  const [type, setType] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Loại phòng cần thêm"
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="min-h-10 rounded border border-border bg-surface px-2"
      >
        <option value="">— Chọn loại phòng —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        variant="secondary"
        disabled={type === ''}
        onClick={() => {
          onAdd(type);
          setType('');
        }}
      >
        Thêm phòng
      </Button>
    </div>
  );
}

export interface BriefFieldProps {
  field: BriefFormField;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Mã lỗi nhất quán đang chỉ vào trường này — hiện ngay dưới ô. */
  issues?: string[];
  /** Dự án đang sửa — chỉ trường `site.boundary_m` cần, để gọi được tính năng đọc ảnh trích lục. */
  projectId: string;
  /** Số tầng hiện khai — chỉ trường `required_spaces` (control `space_floor`) cần, để dựng
   * danh sách tầng ghim được. */
  floors: number;
  /**
   * Thành phần gia đình đang khai — chỉ `required_spaces` cần, để gọi tên phòng ngủ theo CHỦ
   * NHÂN thay vì đánh số. Truyền cả mảng chứ không truyền sẵn danh sách nhãn: nhãn suy ra từ
   * đây bằng một hàm dùng chung với chế độ xem, và hai bản suy riêng sẽ lệch nhau.
   */
  family?: FamilyMember[];
}

export function BriefField({
  field,
  value,
  onChange,
  issues = [],
  projectId,
  floors,
  family,
}: BriefFieldProps) {
  const hint = field.unit ? `${field.hint ?? ''} Đơn vị: ${field.unit}.`.trim() : field.hint;

  return (
    <div id={`brief-${field.path.replace(/\./g, '-')}`} className="scroll-mt-24">
      <Field
        label={field.label}
        hint={hint}
        optional={field.optional}
        group={GROUP_CONTROLS.has(field.control)}
      >
        <BriefControl
          field={field}
          value={value}
          onChange={onChange}
          projectId={projectId}
          floors={floors}
          family={family}
        />
      </Field>
      {issues.map((message) => (
        <p key={message} className="mt-1 text-status-overdue">
          {message}
        </p>
      ))}
    </div>
  );
}

function BriefControl({
  field,
  value,
  onChange,
  projectId,
  floors,
  family,
}: Omit<BriefFieldProps, 'issues'>) {
  switch (field.control) {
    case 'textarea':
      return (
        <textarea
          rows={3}
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value.trim() === '' ? undefined : e.target.value)}
          className="w-full rounded border border-border bg-surface p-2"
        />
      );

    case 'text':
      return (
        <Input
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value.trim() === '' ? undefined : e.target.value)}
        />
      );

    case 'number':
      return (
        <NumberField
          // Ô hỏi theo ĐƠN VỊ CỦA NGƯỜI DÙNG (`%`), payload lưu theo đơn vị hợp đồng (tỉ lệ
          // 0–1). Quy đổi khai bằng `value_scale` trong cấu hình và chạy ở đúng một cặp hàm,
          // dùng chung với chế độ xem — xem `brief-form.ts::displayNumber`.
          value={typeof value === 'number' ? displayNumber(field, value) : value}
          label={field.label}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          onChange={(next) => onChange(next === undefined ? undefined : storedNumber(field, next))}
        />
      );

    case 'money_range': {
      const range = (value as [number, number] | undefined) ?? undefined;
      const setBound = (index: 0 | 1) => (raw: string) => {
        const next: [number, number] = [range?.[0] ?? 0, range?.[1] ?? 0];
        next[index] = Number(raw || 0);
        onChange(next[0] === 0 && next[1] === 0 ? undefined : next);
      };
      return (
        <div className="flex flex-wrap items-center gap-2">
          <MoneyInput
            aria-label={`${field.label} — từ`}
            value={range ? String(range[0]) : ''}
            onChange={setBound(0)}
          />
          <span className="text-fg-subtle">đến</span>
          <MoneyInput
            aria-label={`${field.label} — đến`}
            value={range ? String(range[1]) : ''}
            onChange={setBound(1)}
          />
        </div>
      );
    }

    case 'choice':
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={matchesChoice(field, value, option.value)}
              // Bấm lại lựa chọn đang chọn để bỏ chọn — không có nút "xoá" riêng cho từng ô.
              onClick={() =>
                onChange(
                  matchesChoice(field, value, option.value)
                    ? undefined
                    : toChoiceValue(field, option.value),
                )
              }
            />
          ))}
        </div>
      );

    case 'select': {
      // Giá trị đã hết hiệu lực (đơn vị hành chính cũ) không nằm trong danh sách chọn —
      // TRỪ KHI hồ sơ đang mang đúng giá trị đó. Bỏ nó đi thì ô hiện trống, và lần lưu tiếp
      // theo âm thầm xoá mất một câu trả lời mà người dùng không hề đụng tới.
      const options = (field.options ?? []).filter((o) => !o.retired || o.value === value);
      // Giữ nguyên thứ tự nhóm theo thứ tự XUẤT HIỆN trong cấu hình, không sắp lại theo
      // bảng chữ cái: thứ tự đó là một quyết định nghiệp vụ ("bốn tỉnh hay thi công lên
      // trước"), và sắp lại ở đây sẽ âm thầm huỷ nó.
      const groups: { name: string | undefined; items: typeof options }[] = [];
      for (const option of options) {
        const last = groups[groups.length - 1];
        if (last && last.name === option.group) last.items.push(option);
        else groups.push({ name: option.group, items: [option] });
      }
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : toChoiceValue(field, e.target.value))
          }
          className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
        >
          <option value="">— Chưa chọn —</option>
          {groups.map((group, index) =>
            group.name === undefined ? (
              group.items.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            ) : (
              <optgroup key={`${group.name}-${index}`} label={group.name}>
                {group.items.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
      );
    }

    case 'multi': {
      const selected = (value as string[] | undefined) ?? [];
      // Thứ tự chọn chỉ mang nghĩa ở trường khai `ordered` — hiện số thứ hạng lên mọi danh
      // sách chọn-nhiều là gán một trật tự cho chỗ vốn không có trật tự nào.
      const ranked = field.ordered === true;
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => {
            const position = selected.indexOf(option.value);
            const active = position !== -1;
            return (
              <Chip
                key={option.value}
                label={option.label}
                active={active}
                rank={ranked && active ? position + 1 : undefined}
                onClick={() => {
                  const next = active
                    ? selected.filter((v) => v !== option.value)
                    : [...selected, option.value];
                  onChange(next.length ? next : undefined);
                }}
              />
            );
          })}
        </div>
      );
    }

    case 'space_floor': {
      const items = (value as SpaceItem[] | undefined) ?? [];
      const optionOf = (type: string) => field.options?.find((o) => o.value === type);
      // Nhãn lấy từ cấu hình trước, `ROOM_LABEL` sau: mã phòng ngủ CÓ trong cấu hình (để tra
      // nhãn và gợi ý) nhưng khai `retired` nên không nằm trong danh sách chọn.
      const labelOf = (type: string) => optionOf(type)?.label ?? ROOM_LABEL[type] ?? type;
      /** Loại người dùng được tự thêm — phòng ngủ do Thành viên gia đình quyết, không chọn ở đây. */
      const pickable = (field.options ?? []).filter((o) => !o.retired);

      const commit = (next: SpaceItem[]) => onChange(next.length ? next : undefined);
      const toggle = (type: string) =>
        commit(
          items.some((it) => it.type === type)
            ? items.filter((it) => it.type !== type)
            : [...items, { type, floor: null }],
        );
      const patchAt = (index: number, patch: Partial<SpaceItem>) =>
        commit(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
      const removeAt = (index: number) => commit(items.filter((_, i) => i !== index));

      // Bề rộng cột khai MỘT chỗ, dùng cho cả hàng tiêu đề lẫn từng dòng — hai bản khai riêng
      // là hai bản sẽ lệch nhau đúng vào ngày thêm cột thứ năm.
      // Đơn vị `m²` nằm ở TIÊU ĐỀ cột, không lặp ở từng dòng: mười tám lần chữ `m²` xếp thành
      // một cột không thêm thông tin nào mà lấy mất chỗ của ô tiện ích.
      const columns = [
        'minmax(9rem, 1.1fr)',
        floors > 1 ? 'minmax(9rem, 0.9fr)' : null,
        '7rem',
        'minmax(10rem, 1.6fr)',
        '5rem',
      ]
        .filter(Boolean)
        .join(' ');
      const span = floors > 1 ? 5 : 4;

      const countOf = (type: string) => items.filter((it) => it.type === type).length;
      const ordinalOf = (index: number) => {
        const type = items[index]!.type;
        return items.slice(0, index + 1).filter((it) => it.type === type).length;
      };

      /** Giữ CHỈ SỐ GỐC theo mảng: mọi thao tác sửa/gỡ đều đánh theo nó, không theo chỗ ngồi. */
      const rows = items.map((it, index) => ({ it, index }));
      const bedrooms = rows.filter((r) => isBedroomType(r.it.type));
      const others = rows.filter((r) => !isBedroomType(r.it.type));

      /**
       * «Phòng ngủ (con 2)» thay cho «Phòng ngủ 3».
       *
       * Đánh số thì không nhận ra phòng nào của ai, mà đó chính là thứ người khai cần biết để
       * đặt tầng và diện tích (Haan bắt được 07/09/2026). Chủ nhân SUY từ Thành viên gia đình
       * chứ không lưu xuống dòng không gian — xem `bedroomOwnerLabels`.
       *
       * Chỉ dùng khi số lượng KHỚP: đầu bài chưa qua một lượt đồng bộ nào thì thứ tự không có
       * bảo đảm, và gán nhầm "của ông bà" cho phòng của khách còn tệ hơn đánh số.
       */
      const ownerLabels = bedroomOwnerLabels(family);
      const ownerOf = (bedroomSeat: number) =>
        ownerLabels.length === bedrooms.length ? (ownerLabels[bedroomSeat] ?? '') : '';
      const seatOf = new Map(bedrooms.map((r, seat) => [r.index, seat]));

      const renderRow = ({ it, index }: { it: SpaceItem; index: number }) => {
        const owner = seatOf.has(index) ? ownerOf(seatOf.get(index)!) : '';
        const base = owner
          ? `${labelOf(it.type)} (${owner})`
          : countOf(it.type) > 1
            ? `${labelOf(it.type)} ${ordinalOf(index)}`
            : labelOf(it.type);
        // Phòng ngủ nói rõ khép kín hay không NGAY TRÊN DÒNG. Không có vế này thì hai dòng
        // «Phòng ngủ 1» và «Phòng ngủ 2» trông giống hệt nhau trong khi một cái có khu vệ
        // sinh riêng — và đó là khác biệt lớn nhất giữa hai phòng.
        //
        // `null` thì không nói gì: đầu bài cũ chưa có trường này và hợp đồng quy định lúc đó
        // lấy theo `family`. Đoán một trong hai vế là nói ngược lại phần Thành viên gia đình
        // ngay trên cùng màn hình.
        const name =
          isBedroomType(it.type) && it.ensuite != null
            ? `${base} · ${it.ensuite ? 'khép kín' : 'riêng'}`
            : base;

        return (
          <Fragment key={`${it.type}-${index}`}>
            <span>{name}</span>

            {floors > 1 && (
              <select
                aria-label={`Tầng — ${name}`}
                value={it.floor ?? ''}
                onChange={(e) =>
                  patchAt(index, { floor: e.target.value ? Number(e.target.value) : null })
                }
                className="min-h-10 w-full rounded border border-border bg-surface px-2"
              >
                <option value="">Để hệ thống tự xếp</option>
                {floorOptions(floors, it.floor)}
              </select>
            )}

            {/*
              Dùng lại `NumberField` chứ không dựng ô số thứ hai: nó giữ nguyên chuỗi người
              dùng đang gõ, nên "18." không bị làm tròn thành "18" ngay giữa chừng rồi biến
              lần gõ tiếp theo thành "185". Bài canh cho đúng chuyện đó đã có sẵn ở phần kích
              thước lô.
            */}
            <NumberField
              value={it.area_m2 ?? undefined}
              label={`Diện tích mong muốn — ${name}`}
              // Mười tám ô trống xếp thành cột trông như mười tám chỗ phải điền, dù câu hướng
              // dẫn ngay trên có nói là không bắt buộc. Chữ mờ trong chính ô đó là chỗ người
              // dùng thật sự nhìn.
              placeholder="tự tính"
              onChange={(next) => patchAt(index, { area_m2: next ?? null })}
            />

            {/*
              Ô chữ tự do, cố ý KHÔNG quy về mã: một cái bồn tắm không phải một không gian, và
              bịa ra một mã phòng cho nó là đưa nó vào cây chia không gian. Engine không đọc ô
              này — nó đi theo artifact cho kiến trúc sư đọc, để yêu cầu của khách không rơi
              lại vào Zalo.

              Gợi ý lấy theo TỪNG loại phòng từ cấu hình. Một chuỗi chung cho mọi dòng thì
              đúng với vài phòng và vô lý với phần còn lại — «bồn tắm, quầy bar» ở dòng Chỗ để
              xe (Haan bắt được 07/09/2026). Loại chưa khai gợi ý thì để trống.
            */}
            <Input
              aria-label={`Tiện ích bổ sung — ${name}`}
              placeholder={optionOf(it.type)?.placeholder ?? ''}
              maxLength={500}
              value={it.amenities ?? ''}
              onChange={(e) =>
                patchAt(index, {
                  amenities: e.target.value.trim() === '' ? null : e.target.value,
                })
              }
            />

            {/*
              Dòng phòng ngủ KHÔNG có nút gỡ: số lượng do phần Thành viên gia đình quyết và tự
              đồng bộ xuống đây. Có nút thì bấm xong dòng quay lại ngay ở lần đồng bộ kế tiếp —
              một nút không làm được việc của nó. Vì sao thì tiêu đề cụm đã nói.
            */}
            {isBedroomType(it.type) ? (
              <span />
            ) : (
              <Button variant="subtle" aria-label={`Bỏ ${name}`} onClick={() => removeAt(index)}>
                Bỏ dòng
              </Button>
            )}
          </Fragment>
        );
      };

      const groupHeading = (text: string, hint?: string) => (
        <div className="mt-3 first:mt-0" style={{ gridColumn: `span ${span}` }}>
          <span className="font-medium">{text}</span>
          {hint && <span className="ml-2 text-xs text-fg-subtle">{hint}</span>}
        </div>
      );

      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {pickable.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={items.some((it) => it.type === option.value)}
                onClick={() => toggle(option.value)}
              />
            ))}
          </div>

          {items.length > 0 && (
            <div
              className="grid items-start gap-x-2 gap-y-1.5"
              style={{ gridTemplateColumns: columns }}
            >
              <span className="text-xs text-fg-subtle">Không gian</span>
              {floors > 1 && <span className="text-xs text-fg-subtle">Tầng</span>}
              <span className="text-xs text-fg-subtle">Diện tích (m²)</span>
              <span className="text-xs text-fg-subtle">Tiện ích bổ sung</span>
              <span />

              {bedrooms.length > 0 &&
                groupHeading(
                  'Phòng ngủ',
                  'theo Thành viên gia đình — thêm hay bớt người ở trên thì số dòng ở đây tự đổi theo',
                )}
              {bedrooms.map(renderRow)}

              {others.length > 0 && groupHeading('Không gian khác')}
              {others.map(renderRow)}
            </div>
          )}

          <AddSpaceRow
            options={pickable}
            onAdd={(type) => commit([...items, { type, floor: null }])}
          />
        </div>
      );
    }

    case 'tristate':
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => {
            const asBool = option.value === 'true';
            return (
              <Chip
                key={option.value}
                label={option.label}
                active={value === asBool}
                onClick={() => onChange(value === asBool ? undefined : asBool)}
              />
            );
          })}
        </div>
      );

    case 'sides': {
      const record = (value as Record<string, unknown> | undefined) ?? {};
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {SIDES.map((side) => (
            <label key={side.key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-fg-subtle">{side.label}</span>
              {field.options ? (
                <select
                  value={(record[side.key] as string) ?? ''}
                  onChange={(e) => onChange(setSide(record, side.key, e.target.value || undefined))}
                  className="min-h-10 w-full rounded border border-border bg-surface px-2"
                >
                  {/* Danh sách đóng nên `<select>` là đúng chỗ: chữ trong đó do mình viết,
                      trình duyệt không tự sinh gì thêm. */}
                  <option value="">Chưa xác định</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <NumberField
                  value={record[side.key]}
                  label={`${field.label} — ${side.label}`}
                  onChange={(next) => onChange(setSide(record, side.key, next))}
                />
              )}
            </label>
          ))}
        </div>
      );
    }

    case 'polygon':
      return (
        <PolygonControl
          value={value as [number, number][] | undefined}
          onChange={onChange}
          projectId={projectId}
        />
      );

    case 'family': {
      const members = (value as FamilyMember[] | undefined) ?? [];
      const update = (index: number, patch: Partial<FamilyMember>) => {
        const next = members.map((m, i) => (i === index ? { ...m, ...patch } : m));
        onChange(next);
      };
      return (
        <div className="space-y-3">
          {members.map((member, index) => {
            const bedroomType = bedroomTypeFor(member.role ?? '');
            const bedroomCount = bedroomsFor(member.role ?? '', member.count ?? 0);
            const ensuite = memberWantsEnsuite(member);
            // Nhu cầu đã gỡ khỏi danh sách vẫn hiện NẾU hồ sơ đang mang nó — bỏ đi thì lần
            // lưu sau âm thầm xoá một câu trả lời người dùng chưa hề đụng tới. Cùng lý lẽ với
            // các lựa chọn `retired` ở điều khiển `select`.
            const needs = member.needs ?? [];
            const needOptions = (field.options ?? []).filter(
              (o) => !o.retired || needs.includes(o.value),
            );
            return (
              <div key={index} className="rounded border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Vai trò"
                    value={member.role}
                    onChange={(e) => update(index, { role: e.target.value })}
                    className="min-h-10 rounded border border-border bg-surface px-2"
                  >
                    {FAMILY_ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    inputMode="numeric"
                    aria-label="Số người"
                    className="w-20"
                    value={String(member.count ?? 0)}
                    onChange={(e) => {
                      // Không đọc được thì giữ số cũ: `Number('2a')` là `NaN`, và `NaN` hiện
                      // nguyên chữ đó lên ô rồi làm dòng phòng ngủ biến mất (rà soát 08/09/2026).
                      const next = parseNumber(e.target.value);
                      if (e.target.value.trim() === '') return update(index, { count: 0 });
                      if (next === undefined || next < 0) return;
                      update(index, { count: Math.floor(next) });
                    }}
                  />
                  {/*
                    Tầng khai bằng SỐ TẦNG THẬT, không phải «tầng trên/tầng giữa».
                    Danh sách không gian ngay bên dưới ghim theo số tầng, nên hai thang đo
                    khác nhau trong cùng một biểu mẫu bắt người dùng tự dịch — mà «tầng giữa»
                    của một căn hai tầng thì không trỏ vào tầng nào.

                    Nhà một tầng thì không hỏi: chỉ có một đáp án.
                  */}
                  {floors > 1 && (
                    <select
                      aria-label="Tầng"
                      value={member.floor ?? ''}
                      onChange={(e) =>
                        update(index, {
                          floor: e.target.value ? Number(e.target.value) : null,
                          // Gỡ luôn cách khai cũ: để cả hai thì hai nguồn nói khác nhau về
                          // cùng một câu trả lời (CLAUDE.md 5.2).
                          floor_pref: null,
                        })
                      }
                      className="min-h-10 rounded border border-border bg-surface px-2"
                    >
                      <option value="">Để hệ thống tự xếp</option>
                      {floorOptions(floors, member.floor)}
                    </select>
                  )}
                  {/*
                    Khép kín hay không là một lựa chọn HAI CHIỀU, nên nêu thẳng cả hai vế.

                    Bản trước là một ô bật/tắt «Phòng ngủ khép kín» lẫn giữa các ô nhu cầu
                    chọn-nhiều: nó đọc lên thành một lời khẳng định, và không thấy phương án
                    còn lại đâu. Bản trước nữa là chip «Khu vệ sinh riêng» ghi chuỗi `wc` vào
                    `needs` — chuỗi mà Lớp 2 bỏ qua hoàn toàn, tức một ô chọn không làm gì cả.
                  */}
                  {bedroomCount > 0 && (
                    <select
                      aria-label="Loại phòng ngủ"
                      value={ensuite ? 'ensuite' : 'shared'}
                      onChange={(e) =>
                        update(index, {
                          ensuite: e.target.value === 'ensuite',
                          // Gỡ CẢ cách khai cũ. Còn `wc` trong `needs` thì
                          // `memberWantsEnsuite` đọc lại nó và ô tự bật lên ở lượt vẽ sau —
                          // người dùng chọn «riêng» mà màn hình vẫn nói «khép kín».
                          needs: needs.filter((n) => n !== 'wc'),
                        })
                      }
                      className="min-h-10 rounded border border-border bg-surface px-2"
                    >
                      <option value="shared">Phòng ngủ riêng</option>
                      <option value="ensuite">Phòng ngủ khép kín</option>
                    </select>
                  )}
                  <Button variant="subtle" onClick={() => onChange(dropAt(members, index))}>
                    Bỏ dòng
                  </Button>
                </div>

                {/*
                  Nói ngay nhóm này sinh ra mấy phòng ngủ. «Con · 2 người» ra HAI phòng còn
                  «Ông bà · 2 người» ra MỘT — quy tắc nằm ở `kb/space_norms.yaml` mục
                  `occupancy`, không hiện ra thì người khai đi tìm chúng ở danh sách không
                  gian bên dưới và không hiểu vì sao số dòng lại như vậy.
                */}
                {bedroomCount > 0 && bedroomType && (
                  <p className="mt-2 text-xs text-fg-subtle">
                    {`Cần ${bedroomCount} ${lowerFirst(ROOM_LABEL[bedroomType] ?? 'phòng ngủ')}${
                      ensuite ? ', khép kín' : ''
                    }.`}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {needOptions.map((option) => {
                    const active = needs.includes(option.value);
                    return (
                      <Chip
                        key={option.value}
                        label={option.label}
                        active={active}
                        onClick={() =>
                          update(index, {
                            needs: active
                              ? needs.filter((n) => n !== option.value)
                              : [...needs, option.value],
                          })
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <Button
            variant="secondary"
            onClick={() => onChange([...members, { role: 'vo_chong', count: 1 }])}
          >
            Thêm nhóm thành viên
          </Button>
        </div>
      );
    }
  }
}

/**
 * Bảng đỉnh của ranh giới thửa đất — tách khỏi `BriefControl` để dùng `useState` không vướng
 * quy tắc gọi hook, vì `BriefControl` gọi các nhánh khác nhau trong một `switch`.
 *
 * Ôm luôn `SiteImageUpload`: kết quả đọc ảnh GHI ĐÈ trực tiếp bảng đỉnh (cùng tiền lệ
 * `copyFromSurvey` ở `brief-panel.tsx` — không hộp thoại xác nhận, người dùng luôn sửa lại
 * được từng đỉnh trước khi lưu), và cảnh báo/độ tin cậy đọc được từ ảnh chỉ có ý nghĩa hiển
 * thị ngay tại đây — không lưu vào `draft`, mất đi khi rời màn hình là đúng vì đây là siêu dữ
 * liệu của LẦN ĐỌC gần nhất, không phải của đầu bài.
 */
function PolygonControl({
  value,
  onChange,
  projectId,
}: {
  value: [number, number][] | undefined;
  onChange: (value: unknown) => void;
  projectId: string;
}) {
  const points = value ?? [];
  const [extraction, setExtraction] = useState<SiteBoundaryExtractionResult | null>(null);

  const update = (index: number, axis: 0 | 1, next: number | undefined) => {
    onChange(
      points.map((point, i) =>
        i === index
          ? ((axis === 0 ? [next ?? 0, point[1]] : [point[0], next ?? 0]) as [number, number])
          : point,
      ),
    );
  };

  // Đối chiếu theo SỐ ĐỈNH: người dùng thêm/bớt tay sau khi đọc ảnh thì huy hiệu độ tin cậy
  // tự mất đi thay vì trỏ nhầm sang đỉnh khác — không cần theo dõi riêng "đã sửa tay chưa".
  const matchesCurrentPoints = extraction && extraction.edges.length === points.length;

  return (
    <div className="space-y-3">
      <SiteImageUpload
        projectId={projectId}
        onExtract={(result) => {
          setExtraction(result);
          onChange(result.boundaryM);
        }}
      />
      {matchesCurrentPoints && extraction.warnings.length > 0 && (
        <div className="rounded border border-border bg-surface-sunken p-3">
          <p className="font-semibold">Chỗ đọc chưa chắc chắn</p>
          <ul className="mt-1 list-disc pl-5 text-fg-subtle">
            {extraction.warnings.map((w, i) => (
              <li key={i}>{w.detail}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-fg-subtle">
              <th className="py-1 pr-2 font-normal">Đỉnh</th>
              <th className="py-1 pr-2 font-normal">Ngang (m)</th>
              <th className="py-1 pr-2 font-normal">Sâu (m)</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => {
              const edge = matchesCurrentPoints ? extraction.edges[index] : undefined;
              const needsReview =
                matchesCurrentPoints &&
                (edge?.confidence === 'low' || extraction.assumedAngleIndices.includes(index));
              return (
                <tr key={index} className="border-b border-border/60">
                  <td className="py-1 pr-2 text-fg-subtle">
                    {index + 1}
                    {needsReview && (
                      <span
                        className="ml-1 rounded border border-status-pending px-1 text-[0.7em] font-normal text-status-pending"
                        title="Đọc từ ảnh với độ tin cậy thấp — kiểm tra lại đỉnh này với thực địa."
                      >
                        kiểm tra lại
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <NumberField
                      value={point[0]}
                      label={`Đỉnh ${index + 1} — toạ độ ngang`}
                      onChange={(next) => update(index, 0, next)}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <NumberField
                      value={point[1]}
                      label={`Đỉnh ${index + 1} — toạ độ sâu`}
                      onChange={(next) => update(index, 1, next)}
                    />
                  </td>
                  <td className="py-1">
                    <Button variant="subtle" onClick={() => onChange(dropAt(points, index))}>
                      Bỏ đỉnh
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => onChange([...points, points[points.length - 1] ?? [0, 0]])}
        >
          Thêm đỉnh
        </Button>
        <SitePreview points={points} />
      </div>
      {matchesCurrentPoints && (
        <p className="text-fg-subtle">
          Ranh giới do AI đọc từ ảnh — bản nháp, đối chiếu với trích lục trước khi xác nhận đầu bài.
        </p>
      )}
    </div>
  );
}

/**
 * Số liệu suy ra từ ranh giới, hiện ngay cạnh bảng toạ độ.
 *
 * Nhập toạ độ là việc dễ gõ nhầm và khó tự phát hiện — một dấu trừ đặt sai cho ra hình
 * đúng số đỉnh, đúng thứ tự, sai hoàn toàn diện tích. Hiện lại ba con số hệ thống ĐANG HIỂU
 * (diện tích, hình bao, ô xây được) là cách rẻ nhất để người nhập đối chiếu với trích lục
 * ngay lúc gõ, thay vì phát hiện ở bước dựng mặt bằng.
 */
function SitePreview({ points }: { points: [number, number][] }) {
  if (points.length < 3) {
    return <span className="text-fg-subtle">Cần ít nhất ba đỉnh để dựng được hình thửa.</span>;
  }
  let geometry;
  try {
    geometry = siteGeometry({ width_m: 1, depth_m: 1, shape: 'da_giac', boundary_m: points });
  } catch (error) {
    return (
      <span className="text-status-overdue">
        {error instanceof Error ? error.message : 'Chưa dựng được hình thửa từ các đỉnh này.'}
      </span>
    );
  }
  return (
    <span className="text-fg-subtle">
      Diện tích {formatNumber(geometry.areaM2)} m² · hình bao {formatNumber(geometry.bboxWidthM)} ×{' '}
      {formatNumber(geometry.bboxDepthM)} m · phần xây được{' '}
      {formatNumber(geometry.buildable.widthM)} × {formatNumber(geometry.buildable.depthM)} m
      {geometry.unusedM2 > 0.5 ? ` · còn ${formatNumber(geometry.unusedM2)} m² ngoài phần đó` : ''}
    </span>
  );
}

interface FamilyMember {
  role: string;
  count: number;
  /** Tầng khai bằng SỐ TẦNG THẬT. Cách hiện hành. */
  floor?: number | null;
  /** Cách khai tầng TRƯỚC 07/09/2026 («tầng trên», «tầng giữa»). Chỉ đọc, không hỏi nữa. */
  floor_pref?: string | null;
  /** Phòng ngủ của nhóm này có khu vệ sinh riêng không. */
  ensuite?: boolean | null;
  needs?: string[];
}

/** Một dòng của «Không gian bắt buộc có» — một PHÒNG, không phải một loại phòng. */
interface SpaceItem {
  type: string;
  floor?: number | null;
  area_m2?: number | null;
  ensuite?: boolean | null;
  amenities?: string | null;
}

/** «Phòng ngủ chính» → «phòng ngủ chính», để ghép được vào giữa câu. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function dropAt<T>(list: T[], index: number): T[] | undefined {
  const next = list.filter((_, i) => i !== index);
  return next.length ? next : undefined;
}

function setSide(
  record: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> | undefined {
  const next = { ...record };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return Object.keys(next).length ? next : undefined;
}

/** Ô chữ rỗng KHÔNG thành `0`: `0` là một câu trả lời, rỗng là chưa trả lời. */
function parseNumber(raw: string): number | undefined {
  const text = raw.replace(',', '.').trim();
  if (text === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function toChoiceValue(field: BriefFormField, option: string): unknown {
  // Lựa chọn trong cấu hình luôn là chuỗi; hợp đồng có chỗ đòi số nguyên.
  return field.value_type === 'number' ? Number(option) : option;
}

function matchesChoice(field: BriefFormField, value: unknown, option: string): boolean {
  return field.value_type === 'number' ? value === Number(option) : value === option;
}
