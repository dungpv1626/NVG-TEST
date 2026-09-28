/**
 * Huỷ stub RPC nhận về từ binding Workflow (T84, 26/09/2026).
 *
 * Root cause ba lần `wrangler dev` sập trong ngày 25/09/2026 (backtrace gdb, lượt thật 0f80cd0b):
 * `env.AI_DESIGN_PIPELINE.create()` và `workflow.get()` trả về một STUB RPC (`WorkflowInstance`). Mã
 * chỉ đọc `.id` / `.status()` rồi bỏ rơi stub cho bộ dọn rác. Khi V8 dọn rác giữa lúc bộ xếp đang tính
 * (`Builtins_MathHypot` → `StackGuard` → `CollectGarbage`), finalizer của stub
 * (`~RpcStubDisposalGroup`) ghi cảnh báo «An RPC result was not disposed properly»; với inspector của
 * `wrangler dev` đang gắn, `logWarningOnce` → `stackTraceToCDP` → `v8::StackTrace::CurrentStackTrace`
 * CẤP PHÁT bộ nhớ ngay trong lúc dọn rác → dọn rác lồng nhau → `CppHeap::InitializeMarking` tự huỷ
 * (`trap int3`). Xảy ra hay không tuỳ thời điểm dọn rác và tuỳ cảnh báo đã ghi «once» chưa, nên ba
 * lượt sập, một lượt sáu vòng không sao, và hai lần tái hiện bằng máy chủ giả không sao.
 *
 * Vì sao là việc của ta chứ không chỉ của workerd: stub RPC là tài nguyên phải huỷ (`Symbol.dispose`),
 * runtime nói rõ điều đó trong cảnh báo. Không huỷ thì trên production cũng rò cảnh báo, chỉ không sập
 * vì không có inspector. Mọi chỗ nhận stub đi qua đây; phép thử canh không chỗ nào gọi
 * `PIPELINE.create(` mà không huỷ.
 *
 * `Symbol.dispose` có ở runtime (workerd, Node 22) nhưng `lib: ES2022` của dự án chưa khai kiểu — đọc
 * qua ép kiểu, vắng thì thôi.
 */

const DISPOSE: symbol | undefined = (Symbol as unknown as { dispose?: symbol }).dispose;

/** Gọi `[Symbol.dispose]()` của một stub RPC nếu có; không có (bản giả trong test) thì bỏ qua. */
export function disposeStub(stub: unknown): void {
  if (!DISPOSE || !stub || typeof stub !== 'object') return;
  const fn = (stub as Record<symbol, unknown>)[DISPOSE];
  if (typeof fn !== 'function') return;
  try {
    (fn as (this: unknown) => void).call(stub);
  } catch {
    // Stub đã huỷ hoặc kết nối đã đóng — không còn gì để giữ.
  }
}

/** Mã instance vừa tạo, rồi huỷ stub NGAY: mã là thứ duy nhất được lưu (`attachWorkflow`). */
export function instanceIdOf(instance: { id: string }): string {
  const id = instance.id;
  disposeStub(instance);
  return id;
}

/**
 * `step` mà engine truyền vào `run()` cũng là stub RPC (lớp `Context` của engine Workflows, bên kia
 * ranh giới isolate), nên MỖI `await step.do(...)` trả về một kết quả RPC mang bộ huỷ. `ai-design.ts`
 * có mười hai chỗ `step.do`, lượt sáu vòng để lại hàng chục kết quả như thế cho bộ dọn rác — nguồn thứ
 * hai của cùng cảnh báo, còn nguyên sau khi đã huỷ stub `create()`/`get()` (lượt thật dc949b49,
 * 26/09/2026: cảnh báo vẫn ghi giữa vòng 2 và 3). Bọc một lần ở đầu `run()` thay vì sửa từng chỗ: dữ
 * liệu thuần trong kết quả vẫn đọc được sau khi huỷ, chỉ đường ống RPC kèm theo được nhả.
 *
 * Gọi bằng `Reflect.apply`/`Reflect.get`, KHÔNG `.call`/`.bind`: trên stub, `.call` là tên một phương
 * thức từ xa, không phải `Function.prototype.call`.
 */
export function disposingStep<S extends object>(step: S): S {
  return new Proxy(step, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop !== 'do' || typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        const result: unknown = await Reflect.apply(value, target, args);
        disposeStub(result);
        return result;
      };
    },
  });
}
