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
 *
 * 07/10/2026 (Haan, theo mẫu): thu gọn là MỘT nút dạng viên — biểu tượng nhà cung cấp, tên model,
 * mũi tên; bấm vào mở BẢNG NỔI (không đẩy bố cục) gồm tiêu đề, thẻ nhà cung cấp có biểu tượng, và
 * danh sách thẻ model. Tên model thật chuyển vào `title` của nút và dòng dưới mỗi thẻ.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Feather,
  Layers,
  Sparkles,
} from 'lucide-react';
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

/** Biểu tượng chung theo nhà cung cấp — KHÔNG dùng logo thương hiệu, chỉ để nhận nhanh bằng mắt. */
function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}): React.ReactElement {
  const Icon = provider.startsWith('openai')
    ? BrainCircuit
    : provider.startsWith('anthropic')
      ? Feather
      : provider.startsWith('gemini')
        ? Sparkles
        : Cpu;
  return <Icon className={className} aria-hidden />;
}

/**
 * Bảng nổi đóng khi bấm ra ngoài hoặc nhấn Esc — như mọi menu thả xuống. Dùng chung cho ô chọn
 * model và ô mức suy nghĩ (`ai-model-picker.tsx`).
 */
export function usePopoverDismiss(
  rootRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [rootRef, open, close]);
}

export function ModelChooser({
  options,
  value,
  onChange,
  disabled = false,
  recommended = null,
}: {
  options: AiModelOption[];
  /**
   * Tuyến mặc định của công ty (`design_setting`) — thẻ ấy mang nhãn «Mặc định của công ty» làm gợi ý
   * cho người chưa quen (lượt chạy thật 23/10/2026: ô chỉ ghi «GPT-5.6 Terra», không biết chọn gì).
   */
  recommended?: string | null;
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
  const rootRef = useRef<HTMLDivElement>(null);

  // Mở ra thì đứng sẵn ở nhà cung cấp của model đang chọn — không bắt người dùng đi tìm lại.
  useEffect(() => {
    if (selected) setProvider(selected.provider);
  }, [selected]);

  usePopoverDismiss(rootRef, open, () => setOpen(false));

  const shown = groups.find((g) => g.provider === provider) ?? groups[0] ?? null;
  const usable = options.filter((o) => o.enabled);

  return (
    // `role="group"` + `aria-labelledby`: chữ «Model» nối vào cụm bằng ARIA — không có nối thì trình
    // đọc màn hình đọc từng nút rời rạc, và phép thử «mỗi ô chọn cạnh đúng việc nó ăn vào» không tìm ra.
    <div ref={rootRef} className="relative min-w-0" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="mb-1 text-xs font-medium text-fg-subtle">
        Model
      </p>

      {/* Nút gọn dạng viên (Haan, 07/10/2026): biểu tượng nhà cung cấp · tên model · mũi tên. Tên
          model THẬT (`gpt-5`…) nằm trong `title` và trên từng thẻ khi mở — nhật ký chi phí ghi theo
          tên ấy nên nó luôn đọc được, chỉ không chen vào nút. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={selected ? `Đổi model — đang chọn ${titleOf(selected)}` : 'Đổi model'}
        title={selected ? `${providerLabelOf(selected)} · ${selected.model}` : undefined}
        disabled={disabled || usable.length === 0}
        className={cn(
          'inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-left sm:min-h-9',
          'transition-colors duration-(--motion-fast) ease-(--ease-out)',
          open ? 'border-tk-pu-solid bg-tk-pu-bg' : 'border-tk-line2 bg-tk-card hover:bg-tk-hover',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {selected && (
          <ProviderIcon provider={selected.provider} className="size-4 shrink-0 text-tk-pu-fg" />
        )}
        <span className="truncate font-semibold">
          {selected ? titleOf(selected) : 'Chưa có model nào dùng được'}
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-tk-t2 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {/* Nhãn bậc ngay dưới nút (23/10/2026): tên model trần không nói nó rẻ hay đắt, nhanh hay kỹ.
          Dòng riêng, không chen vào nút — cột thiết lập hẹp, chen vào thì bị cắt mất. */}
      {selected?.tag && (
        <p className="mt-1 text-xs text-fg-subtle" data-testid="model-tag">
          {selected.tag}
          {selected.route === recommended && ' · mặc định của công ty'}
        </p>
      )}

      {open && shown && (
        <div
          role="dialog"
          aria-label="Chọn model AI và nhà cung cấp"
          className="absolute top-full left-0 z-30 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-tk-line2 bg-tk-panel p-3 shadow-tk-card"
        >
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-tk-t2">
            <Layers className="size-4 text-tk-pu-fg" aria-hidden />
            Chọn model AI và nhà cung cấp
          </p>

          <div
            className="grid gap-1 rounded-md border border-tk-line bg-tk-deep p-1"
            style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
            role="tablist"
            aria-label="Nhà cung cấp"
          >
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
                    'relative flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 text-sm font-semibold',
                    'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                    active ? 'bg-tk-pu-solid text-white' : 'text-tk-t2 hover:text-tk-tx',
                  )}
                >
                  <ProviderIcon provider={group.provider} className="size-4 shrink-0" />
                  <span className="truncate">
                    {group.label}
                    {/* Chữ «chưa dùng được» là lớp chính; chấm màu chỉ là lớp phụ (CLAUDE.md 5.4). */}
                    {group.usable === 0 && ' (chưa dùng được)'}
                  </span>
                  {group.usable > 0 && (
                    <span
                      className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-tk-acc"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-3 px-1 text-xs text-tk-t2">
            Gợi ý: chưa quen thì dùng model mang nhãn «Mặc định của công ty». Bản xếp bị bác nhiều
            lượt thì thử bậc cao hơn; cần thử nhiều lượt cho rẻ thì chọn bậc rẻ. Giá niêm yết ghi
            dưới từng thẻ.
          </p>
          <p className="mt-3 mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1 text-xs text-tk-t2">
            <span>Các model của {shown.label}:</span>
            <span>{shown.options.length} model</span>
          </p>

          <div
            className="max-h-[min(24rem,60vh)] space-y-1.5 overflow-y-auto pr-1"
            role="radiogroup"
            aria-label="Danh sách model"
          >
            {shown.options.map((option) => (
              <ModelCard
                key={option.route}
                option={option}
                recommended={option.route === recommended}
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
    </div>
  );
}

function ModelCard({
  option,
  checked,
  onPick,
  recommended = false,
}: {
  option: AiModelOption;
  checked: boolean;
  recommended?: boolean;
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
        'transition-[translate,border-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)',
        checked ? 'border-tk-pu-solid bg-tk-pu-bg' : 'border-tk-line bg-tk-card',
        option.enabled
          ? 'cursor-pointer hover:border-tk-pu-solid hover:shadow-sm motion-safe:hover:-translate-y-px'
          : 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold">
          <span className="truncate">{titleOf(option)}</span>
          {checked && <CheckCircle2 className="size-4 shrink-0 text-tk-pu-fg" aria-hidden />}
        </span>
        {option.tag && (
          <span className="shrink-0 rounded-sm bg-tk-pu-tile px-2 py-0.5 text-xs font-medium text-tk-pu-fg">
            {option.tag}
          </span>
        )}
      </span>
      {recommended && (
        <span className="mt-1 block text-xs font-medium text-tk-gr-fg">Mặc định của công ty</span>
      )}
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
