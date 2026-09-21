/**
 * Ô chọn model dạng THẺ, chọn nhà cung cấp trước rồi chọn model (T60, 20/09/2026).
 *
 * Haan gửi một mẫu giao diện chọn theo nhà cung cấp và yêu cầu áp cho cả model ngôn ngữ lẫn model
 * ảnh. Ô cũ là một `<select>` một dòng: «Gemini 3.1 Pro (Google) — chất lượng cao ·
 * gemini-3.1-pro-preview». Ba thứ chen trong một dòng, và thứ đắt nhất trong danh sách trông y hệt
 * thứ rẻ nhất — trong khi chênh lệch giữa hai đầu danh sách là hai mươi lần tiền.
 *
 * Ba ràng buộc giữ nguyên từ ô cũ, vì chúng là hàng rào chứ không phải trang trí:
 *  · **Tên model thật luôn hiện** (`gpt-5`, `gemini-3.1-pro-preview`). Nhật ký `design_ai_call` ghi
 *    theo tên model, nên giấu nó đi là không đối chiếu được kết quả trên màn hình với dòng tiền.
 *  · **Tuyến chưa dùng được vẫn liệt kê**, mờ đi kèm lý do (AFD 6.5) — không giấu hẳn khiến người
 *    dùng tưởng tính năng không tồn tại, cũng không hiện rồi mới báo lỗi lúc bấm.
 *  · **Giá niêm yết hiện trước khi bấm.** Chưa khai giá thì nói chưa có, không để trống — trống
 *    đọc thành miễn phí (CLAUDE.md 5.2).
 *
 * Chữ trên thẻ (tên ngắn, nhãn phân loại, câu mô tả, tên nhà cung cấp) là DỮ LIỆU trong
 * `config/models.yaml`. Màn hình không biết tên model nào, và không cắt chuỗi `label` ra ba mảnh —
 * cắt chuỗi là đoán, và đoán sai lặng lẽ khi ai đó sửa nhãn.
 *
 * Mặc định THU GỌN: chỗ này nằm ngay trên nút tiêu tiền, mở sẵn cả danh sách thì nút chính bị đẩy
 * xuống quá tầm nhìn («một hành động chính mỗi màn hình», CLAUDE.md 4.3).
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { formatNumber } from '@nvg/shared';
import { cn } from '@/lib/utils';
import type { AiModelOption } from '@/hooks/use-ai-design';

/** Tên nhà cung cấp; máy chủ cũ chưa trả `providerLabel` thì hiện chính mã nhà cung cấp. */
function providerLabelOf(option: AiModelOption): string {
  return option.providerLabel ?? option.provider;
}

/** Tên trên thẻ; cấu hình chưa khai `short` thì lùi về nhãn một dòng cũ. */
function titleOf(option: AiModelOption): string {
  return option.short ?? option.label;
}

const usd = (value: number) => formatNumber(value, 3);

/** Giá niêm yết gọn một dòng cho thẻ. Không bao giờ trả chuỗi rỗng. */
export function priceShort(option: AiModelOption): string {
  if (option.billed === false) return 'Gói miễn phí — không phát sinh tiền';
  if (option.imageUsd != null) return `${usd(option.imageUsd)} USD mỗi ảnh`;
  if (option.inputPer1mUsd != null && option.outputPer1mUsd != null) {
    // «2 USD vào · 12 USD ra» chứ không phải «2 / 12 USD … vào / ra»: hai dấu gạch chéo trong một
    // dòng bắt người đọc ghép cặp trong đầu, và ghép ngược thì hiểu sai giá gấp sáu lần.
    return `${usd(option.inputPer1mUsd)} USD vào · ${usd(option.outputPer1mUsd)} USD ra, mỗi triệu token`;
  }
  return 'Chưa có giá niêm yết trong cấu hình';
}

interface ProviderGroup {
  provider: string;
  label: string;
  options: AiModelOption[];
  usable: number;
}

/** Gom theo nhà cung cấp, giữ nguyên thứ tự cấu hình khai. */
export function groupByProvider(options: AiModelOption[]): ProviderGroup[] {
  const groups: ProviderGroup[] = [];
  for (const option of options) {
    let group = groups.find((g) => g.provider === option.provider);
    if (!group) {
      group = {
        provider: option.provider,
        label: providerLabelOf(option),
        options: [],
        usable: 0,
      };
      groups.push(group);
    }
    group.options.push(option);
    if (option.enabled) group.usable += 1;
  }
  return groups;
}

export function ModelChooser({
  options,
  value,
  onChange,
  disabled = false,
  kind,
}: {
  options: AiModelOption[];
  /** Tên tuyến đang chọn. */
  value: string | null;
  onChange: (route: string) => void;
  disabled?: boolean;
  kind: 'text' | 'image';
}): React.ReactElement {
  const groups = useMemo(() => groupByProvider(options), [options]);
  const selected = options.find((o) => o.route === value) ?? null;
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const labelId = useId();

  // Mở ra thì đứng sẵn ở nhà cung cấp của model đang chọn — không bắt người dùng đi tìm lại.
  useEffect(() => {
    if (selected) setProvider(selected.provider);
  }, [selected]);

  const shown = groups.find((g) => g.provider === provider) ?? groups[0] ?? null;
  const usable = options.filter((o) => o.enabled);

  return (
    // `role="group"` + `aria-labelledby`: ô chọn nay là một cụm nút chứ không còn một `<select>`,
    // nên chữ «Model» phải nối vào cụm bằng ARIA — không có nối thì trình đọc màn hình đọc từng
    // nút rời rạc, và phép thử canh «mỗi ô chọn cạnh đúng việc nó ăn vào» cũng không tìm ra ô nào.
    <div className="min-w-72" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="mb-1 text-xs font-medium text-fg-subtle">
        Model
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={disabled || usable.length === 0}
        className={cn(
          'flex w-full items-center gap-3 rounded-md border border-tk-line bg-tk-card px-3 py-2 text-left',
          'transition-colors duration-(--motion-fast) ease-(--ease-out)',
          'hover:bg-tk-hover disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate font-semibold">
                {titleOf(selected)}
                {selected.tag ? <span className="text-tk-t2"> · {selected.tag}</span> : null}
              </span>
              <span className="block truncate text-xs text-tk-t3">
                {providerLabelOf(selected)} · {selected.model}
              </span>
            </>
          ) : (
            <span className="block font-semibold">Chưa có model nào dùng được</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-tk-acc">
          {open ? 'Thu gọn' : 'Đổi model'}
          <ChevronDown className={cn('size-4', open && 'rotate-180')} aria-hidden />
        </span>
      </button>

      {open && shown && (
        <div className="mt-2 rounded-md border border-tk-line bg-tk-deep p-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Nhà cung cấp">
            {groups.map((group) => {
              const active = group.provider === shown.provider;
              return (
                <button
                  key={group.provider}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setProvider(group.provider)}
                  className={cn(
                    'cursor-pointer rounded-sm px-3 py-1.5 text-xs font-semibold',
                    'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                    active ? 'bg-brand-mint text-brand-mint-ink' : 'text-tk-t2 hover:text-tk-tx',
                  )}
                >
                  {/* Chấm màu là lớp phụ; chữ «chưa dùng được» mới là lớp chính — màu không bao
                      giờ là cách duy nhất truyền đạt (CLAUDE.md 5.4). */}
                  <span
                    className={cn(
                      'mr-1.5 inline-block size-1.5 rounded-full align-middle',
                      group.usable > 0 ? 'bg-tk-acc' : 'bg-tk-t3',
                    )}
                    aria-hidden
                  />
                  {group.label}
                  {group.usable === 0 && ' (chưa dùng được)'}
                </button>
              );
            })}
          </div>

          <p className="mt-2 mb-1 flex flex-wrap items-baseline justify-between gap-2 px-1 text-xs text-tk-t2">
            <span>Các model của {shown.label}:</span>
            <span>{shown.options.length} model</span>
          </p>

          <div className="space-y-1.5" role="radiogroup" aria-label="Danh sách model">
            {shown.options.map((option) => (
              <ModelCard
                key={option.route}
                option={option}
                checked={option.route === value}
                onPick={() => {
                  onChange(option.route);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <p className="mt-1 text-xs text-fg-subtle">
        {kind === 'text'
          ? 'Dữ liệu gửi đi đã lược tên, số điện thoại, địa chỉ, mã hồ sơ và ngân sách.'
          : 'Ảnh gửi đi không mang khung tên hay mã hồ sơ.'}
        {selected ? ` Giá niêm yết: ${priceShort(selected)}.` : ''}
      </p>
    </div>
  );
}

function ModelCard({
  option,
  checked,
  onPick,
}: {
  option: AiModelOption;
  checked: boolean;
  onPick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={!option.enabled}
      onClick={onPick}
      className={cn(
        'block w-full rounded-md border p-3 text-left',
        'transition-colors duration-(--motion-fast) ease-(--ease-out)',
        checked ? 'border-tk-acc bg-tk-acc-dim' : 'border-tk-line bg-tk-card',
        option.enabled ? 'cursor-pointer hover:border-tk-line2' : 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold">
          <span className="truncate">{titleOf(option)}</span>
          {checked && <Check className="size-4 shrink-0 text-tk-acc" aria-hidden />}
        </span>
        {option.tag && (
          <span className="shrink-0 rounded-sm bg-tk-chip-mute px-2 py-0.5 text-xs text-tk-t2">
            {option.tag}
          </span>
        )}
      </span>
      {option.blurb && <span className="mt-1 block text-xs text-tk-t2">{option.blurb}</span>}
      <span className="mt-1 block text-xs text-tk-t3">
        {option.model} · {priceShort(option)}
      </span>
      {!option.enabled && (
        <span className="mt-1 block text-xs text-status-overdue">
          {option.unavailableReason ?? 'Chưa dùng được.'}
        </span>
      )}
    </button>
  );
}
