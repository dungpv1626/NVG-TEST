/**
 * Khung chung của ô nhập, ô chọn và ô nhiều dòng tự dựng bằng phần tử gốc (`<select>`, `<textarea>`).
 *
 * Haan 07/10/2026, biểu mẫu đầu bài: «ô bo góc ít, ô bo góc nhiều — không đồng đều». Ô `Input` bo
 * `rounded-sm` (9px), còn các `<select>` viết tay mỗi nơi một kiểu (`rounded` 4px, viền nhạt hơn,
 * cao 36 hay 40px). Mọi ô cạnh nhau phải cùng bo góc, cùng viền, cùng chiều cao — dùng chung hằng này
 * thay vì chép chuỗi lớp.
 */
export const FIELD_BOX =
  'h-11 rounded-field border border-border-strong bg-surface px-3 text-fg hover:border-fg-subtle disabled:cursor-not-allowed disabled:opacity-60';

export const TEXTAREA_BOX =
  'w-full rounded-field border border-border-strong bg-surface px-3 py-2 text-fg placeholder:text-fg-subtle hover:border-fg-subtle';
