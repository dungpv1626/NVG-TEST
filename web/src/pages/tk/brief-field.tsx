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

import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '@nvg/shared/format';
import {
  ACCESS_SIDES,
  FAMILY_ROLE_LABEL,
  FAMILY_ROLES,
  FLOOR_PREF_LABEL,
  FLOOR_PREFS,
  SIDE_LABEL,
  siteGeometry,
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
const FLOOR_PREF_OPTIONS = FLOOR_PREFS.map((value) => ({ value, label: FLOOR_PREF_LABEL[value] }));

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
  onChange,
}: {
  value: unknown;
  label: string;
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

  return (
    <Input
      // `inputMode` mở bàn phím số trên di động mà KHÔNG kéo theo nút tăng/giảm và thông báo
      // `step` tiếng Anh của ô số gốc (CLAUDE.md 4.1).
      inputMode="decimal"
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseNumber(e.target.value);
        emitted.current = parsed;
        onChange(parsed);
      }}
    />
  );
}

/** Nút viên thuốc — vùng bấm tối thiểu 40px cho ngón tay (CGD 6.8). */
function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-10 rounded-full border px-3',
        active
          ? 'border-brand bg-brand-subtle font-semibold text-brand'
          : 'border-border text-fg-subtle',
      )}
    >
      {label}
    </button>
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
}

export function BriefField({
  field,
  value,
  onChange,
  issues = [],
  projectId,
  floors,
}: BriefFieldProps) {
  const hint = field.unit ? `${field.hint ?? ''} Đơn vị: ${field.unit}.`.trim() : field.hint;

  return (
    <div id={`brief-${field.path.replace(/\./g, '-')}`} className="scroll-mt-24">
      <Field label={field.label} hint={hint}>
        <BriefControl
          field={field}
          value={value}
          onChange={onChange}
          projectId={projectId}
          floors={floors}
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
      return <NumberField value={value} label={field.label} onChange={onChange} />;

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
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => {
            const active = selected.includes(option.value);
            return (
              <Chip
                key={option.value}
                label={option.label}
                active={active}
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
      const items = (value as { type: string; floor: number | null }[] | undefined) ?? [];
      const toggle = (type: string) => {
        const next = items.some((it) => it.type === type)
          ? items.filter((it) => it.type !== type)
          : [...items, { type, floor: null }];
        onChange(next.length ? next : undefined);
      };
      const setFloor = (type: string, floor: number | null) =>
        onChange(items.map((it) => (it.type === type ? { ...it, floor } : it)));

      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(field.options ?? []).map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={items.some((it) => it.type === option.value)}
                onClick={() => toggle(option.value)}
              />
            ))}
          </div>
          {items.length > 0 && floors > 1 && (
            <div className="space-y-1.5">
              <p className="text-fg-subtle">
                Ghim vào tầng cụ thể — không bắt buộc, bỏ trống để hệ thống tự xếp
              </p>
              {items.map((it) => (
                <div key={it.type} className="flex items-center gap-2">
                  <span className="w-40 shrink-0">
                    {field.options?.find((o) => o.value === it.type)?.label ?? it.type}
                  </span>
                  <select
                    aria-label={`Tầng — ${it.type}`}
                    value={it.floor ?? ''}
                    onChange={(e) =>
                      setFloor(it.type, e.target.value ? Number(e.target.value) : null)
                    }
                    className="min-h-10 rounded border border-border bg-surface px-2"
                  >
                    <option value="">Để hệ thống tự xếp</option>
                    {Array.from({ length: floors }, (_, i) => i + 1).map((f) => (
                      <option key={f} value={f}>{`Tầng ${f}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
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
          {members.map((member, index) => (
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
                  onChange={(e) => update(index, { count: Number(e.target.value || 0) })}
                />
                <select
                  aria-label="Tầng ưu tiên"
                  value={member.floor_pref ?? ''}
                  onChange={(e) => update(index, { floor_pref: e.target.value || null })}
                  className="min-h-10 rounded border border-border bg-surface px-2"
                >
                  <option value="">Không ưu tiên tầng</option>
                  {FLOOR_PREF_OPTIONS.map((pref) => (
                    <option key={pref.value} value={pref.value}>
                      {pref.label}
                    </option>
                  ))}
                </select>
                <Button variant="subtle" onClick={() => onChange(dropAt(members, index))}>
                  Bỏ dòng
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(field.options ?? []).map((option) => {
                  const needs = member.needs ?? [];
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
          ))}
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
  floor_pref?: string | null;
  needs?: string[];
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
