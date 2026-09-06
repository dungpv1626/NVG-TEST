/**
 * Khối ba chiều sơ bộ — xoay được trên trình duyệt (gói trình khách, 11-design-flow 11.4b).
 *
 * Trình duyệt CHỈ XEM: tệp glTF do Container đùn từ mặt bằng, three.js nạp và hiển thị, không
 * dựng thêm hình nào ở đây (bất biến #5). Nhãn "Khối sơ bộ — chưa thể hiện vật liệu và mặt đứng"
 * do mã chèn, không có chỗ tắt.
 *
 * Nút "Chụp ảnh khối" lấy đúng khung hình đang xem — đây là ảnh đầu vào của tuyến phối cảnh
 * (bước 6): Gemini nhận ảnh khối này cùng lời mô tả, không nhận hình học.
 */

import { useEffect, useRef, useState } from 'react';
import { Box, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMassingModel } from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';

export const MASSING_NOTICE = 'Khối sơ bộ — chưa thể hiện vật liệu và mặt đứng';

export function MassingViewer({
  projectId,
  artifactId,
  variantLabel,
  onSnapshot,
}: {
  projectId: string;
  artifactId: string | null;
  variantLabel: string;
  /** Nhận ảnh PNG (data URL) của khung hình đang xem. */
  onSnapshot?: (dataUrl: string) => void;
}): React.ReactElement {
  const model = useMassingModel(projectId, artifactId);
  const mountRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<(() => string | null) | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const url = model.data;
    if (!mount || !url) return undefined;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(mount.clientWidth, Math.max(320, mount.clientWidth * 0.6));
        renderer.setClearColor(0xf7f8f9);
        mount.replaceChildren(renderer.domElement);

        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1));
        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(8, 14, 10);
        scene.add(sun);

        const camera = new THREE.PerspectiveCamera(
          40,
          renderer.domElement.width / renderer.domElement.height,
          0.1,
          500,
        );
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        const gltf = await new GLTFLoader().loadAsync(url);
        if (disposed) return;
        const root = gltf.scene;
        // Khối trắng, nét cạnh mảnh — đúng "trắng hoặc xám nhạt, không vật liệu".
        root.traverse((obj) => {
          const mesh = obj as { isMesh?: boolean; material?: unknown; geometry?: unknown };
          if (mesh.isMesh && mesh.geometry) {
            const material = mesh.material as { color?: { getHex(): number } } | undefined;
            const hex = material?.color?.getHex() ?? 0xffffff;
            const glass = hex === 0x8cb0cd;
            (obj as unknown as { material: unknown }).material = new THREE.MeshLambertMaterial({
              color: glass ? 0x8cb0cd : hex,
              transparent: glass,
              opacity: glass ? 0.45 : 1,
            });
            if (!glass) {
              const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(mesh.geometry as never, 20),
                new THREE.LineBasicMaterial({ color: 0x44546f }),
              );
              (obj as unknown as { add(o: unknown): void }).add(edges);
            }
          }
        });
        scene.add(root);

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());

        // Khung hình mặc định nhìn vào MẶT TIỀN, không nhìn vào tường bên.
        //
        // Mặt tiền nhà lô rộng 5 m còn tường bên dài 18 m. Ngắm vào tâm khối rồi lùi máy ảnh
        // theo bán kính bao thì tường bên — dài gấp ba — chiếm gần hết khung, còn lối vào và
        // cửa sổ nằm ở rìa ảnh: đúng thứ khách muốn xem lại là thứ nhìn kém nhất. Nên ngắm
        // vào PHẦN TRƯỚC của khối và đứng chủ yếu phía trước.
        //
        // Mặt tiền quay về phía +Z (massing.py đặt chiều sâu lô chạy theo -Z).
        const target = new THREE.Vector3(centre.x, centre.y, box.max.z - size.z * 0.28);
        controls.target.copy(target);
        // Cái phải lọt khung là bề rộng mặt tiền và chiều cao công trình, không phải chiều sâu lô.
        const fit = Math.max(size.x, size.y) * 1.35;
        const distance = fit / 2 / Math.tan((camera.fov * Math.PI) / 360);
        // Lệch khoảng 28° so với trục vuông góc mặt tiền: đủ thấy đây là khối ba chiều, chưa
        // tới mức tường bên che mất mặt tiền.
        const direction = new THREE.Vector3(0.52, 0.42, 1).normalize();
        camera.position.copy(target).addScaledVector(direction, distance);
        camera.lookAt(target);
        const radius = Math.max(size.x, size.y, size.z);
        scene.add(
          new THREE.GridHelper(radius * 3, 30, 0xdcdfe4, 0xeceef1).translateY(box.min.y - 0.01),
        );

        let frame = 0;
        const tick = () => {
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        tick();
        captureRef.current = () => {
          renderer.render(scene, camera);
          return renderer.domElement.toDataURL('image/png');
        };

        const onResize = () => {
          const w = mount.clientWidth;
          renderer.setSize(w, Math.max(320, w * 0.6));
          camera.aspect = w / Math.max(320, w * 0.6);
          camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', onResize);
        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener('resize', onResize);
          controls.dispose();
          renderer.dispose();
          captureRef.current = null;
        };
      } catch (error) {
        setWebglError(
          error instanceof Error && /WebGL|context/i.test(error.message)
            ? 'Trình duyệt này không hỗ trợ đồ hoạ ba chiều (WebGL). Mở bằng Chrome hoặc Edge mới để xem khối.'
            : toUserMessage(error),
        );
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [model.data]);

  return (
    <section className="rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1 font-medium">
            Khối ba chiều — {variantLabel}
            <SectionHelp {...DESIGN_HELP.massing} />
          </h3>
          <p className="text-fg-subtle">Kéo để xoay, lăn chuột để phóng. {MASSING_NOTICE}.</p>
        </div>
        {onSnapshot && (
          <Button
            variant="secondary"
            onClick={() => {
              const png = captureRef.current?.();
              if (png) onSnapshot(png);
            }}
          >
            <Camera className="size-4" />
            Chụp ảnh khối
          </Button>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded border border-border bg-surface-sunken">
        {model.isLoading ? (
          <div className="h-80 animate-pulse" aria-hidden />
        ) : model.isError ? (
          <p className="p-4 text-status-overdue">{toUserMessage(model.error)}</p>
        ) : webglError ? (
          <p className="flex items-center gap-2 p-4 text-fg-subtle">
            <Box className="size-5" aria-hidden />
            {webglError}
          </p>
        ) : (
          <div ref={mountRef} className="min-h-80 w-full" data-testid="khoi-ba-chieu" />
        )}
      </div>
      <p className="mt-2 text-xs text-fg-subtle">{MASSING_NOTICE}</p>
    </section>
  );
}
