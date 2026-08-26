/**
 * Bản thay thế cho `virtual:pwa-register/react` khi chạy test.
 *
 * Module đó do `vite-plugin-pwa` sinh ra lúc dựng bản thật; test không chạy plugin nên import sẽ
 * hỏng và kéo đổ mọi test có dính tới App Shell — dù bản thân chúng chẳng liên quan gì tới PWA.
 *
 * Trả về trạng thái "không có bản cập nhật nào": đó là trạng thái bình thường của ứng dụng, nên
 * test nào không nói về PWA sẽ không phải bận tâm tới nó.
 */

export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, (v: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (v: boolean) => void],
    updateServiceWorker: async () => {},
  };
}
