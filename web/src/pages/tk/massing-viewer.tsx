/**
 * Khối ba chiều sơ bộ — xoay được trên trình duyệt (gói trình khách, 11-design-flow 11.4b).
 *
 * Trình duyệt CHỈ XEM: tệp glTF do Container đùn từ mặt bằng, three.js nạp và hiển thị, không
 * dựng thêm hình nào ở đây (bất biến #5). Nhãn "Khối sơ bộ — chưa thể hiện vật liệu và mặt đứng"
 * do mã chèn, không có chỗ tắt.
 *
 * Nút "Chụp ảnh khối" lấy đúng khung hình đang xem — đây là ảnh đầu vào của tuyến phối cảnh
 * (bước 6): mô hình sinh ảnh nhận ảnh khối này cùng lời mô tả, không nhận hình học.
 *
 * Một lần bấm chụp HAI góc, vì tuyến phối cảnh dựng ba khung hình mà hai trong ba dùng chung
 * góc nhìn thẳng còn khung thứ ba là góc nghiêng. Góc nghiêng KHÔNG phải một khung cố định:
 * nó là chính khung người dùng đang xem, xoay thêm một góc quanh trục đứng — nếu cố định thì
 * việc người dùng xoay khối tới góc mình muốn (đúng lời hướng dẫn trên màn hình) sẽ bị bỏ qua.
 */

import { useEffect, useRef, useState } from 'react';
import { Box, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMassingModel } from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';

export const MASSING_NOTICE = 'Khối sơ bộ — chưa thể hiện vật liệu và mặt đứng';

/** Ảnh khối theo từng góc máy. Khoá dùng đúng bộ từ vựng `camera` của khung hình phối cảnh. */
export type MassingShots = Record<string, string>;

/**
 * Góc xoay thêm quanh trục đứng cho từng góc máy, tính bằng radian.
 *
 * `eye_level` giữ nguyên khung người dùng đang xem. `street_level` xoay thêm khoảng 31° — đủ
 * để thấy đây là khối ba chiều nhìn xiên từ vỉa hè, chưa tới mức phơi cả tường hông dài gấp ba
 * mặt tiền. Xoay nhiều hơn thì ảnh ra trông như một lô góc, đúng thứ câu ngữ cảnh đang chống.
 */
const CAMERA_YAW: Record<string, number> = { eye_level: 0, street_level: 0.55 };

export function MassingViewer({
  projectId,
  artifactId,
  variantLabel,
  onSnapshot,
}: {
  projectId: string;
  artifactId: string | null;
  variantLabel: string;
  /** Nhận ảnh PNG (data URL) theo từng góc máy, khoá là mã `camera` của khung hình. */
  onSnapshot?: (shots: MassingShots) => void;
}): React.ReactElement {
  const model = useMassingModel(projectId, artifactId);
  const mountRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<(() => MassingShots) | null>(null);
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
        /**
         * Tô theo TÊN NÚT, không theo màu vật liệu.
         *
         * `trimesh` ghi màu mặt thành màu ĐỈNH (COLOR_0) chứ không thành vật liệu, nên sau khi
         * xuất glTF thì `material.color` của MỌI mesh đều trắng. Bản trước dò kính bằng
         * `hex === 0x8cb0cd` nên không bao giờ khớp: cửa đi và cửa sổ nhận đúng vật liệu như
         * tường, và trên màn hình chúng chỉ còn là mấy ô chữ nhật viền mảnh cùng màu mảng tường
         * (Haan chỉ ra 06/09/2026). Container nay đặt tên nút theo loại — xem `massing.py`.
         *
         * Vẫn là "trình duyệt chỉ xem": hình học không đổi, đây là vật liệu và ánh sáng.
         */
        const STYLE: Record<string, { color: number; opacity?: number; edge: number }> = {
          window: { color: 0x6f9ec4, opacity: 0.42, edge: 0x2f5b7d },
          // Cửa đi tô đặc và đậm hơn hẳn: cửa vào là thứ khách tìm đầu tiên khi nhìn khối, mà
          // kính trong suốt thì ở xa đọc thành một vệt mờ như cửa sổ.
          door: { color: 0x7a6a5a, edge: 0x3f342a },
          wall: { color: 0xe8e5df, edge: 0x44546f },
          // Lan can ban công: mảnh, sáng hơn tường, và có viền riêng để đọc ra được từ xa là
          // một cạnh HỞ chứ không phải một mảng tường thấp.
          railing: { color: 0xf2efe9, edge: 0x2f5b7d },
          slab: { color: 0xd6d2ca, edge: 0x44546f },
          parapet: { color: 0xdedad2, edge: 0x44546f },
        };
        root.traverse((obj) => {
          const mesh = obj as { isMesh?: boolean; material?: unknown; geometry?: unknown };
          if (!mesh.isMesh || !mesh.geometry) return;
          const name = obj.name || obj.parent?.name || '';
          const style = STYLE[name.split('-')[0] ?? ''] ?? STYLE.wall!;
          (obj as unknown as { material: unknown }).material = new THREE.MeshLambertMaterial({
            color: style.color,
            transparent: style.opacity !== undefined,
            opacity: style.opacity ?? 1,
          });
          // Lỗ mở CŨNG có nét viền. Không có viền thì ô kính mờ chìm vào mảng tường ngay khi
          // thu nhỏ hình — đúng cái làm cửa sổ "không rõ".
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry as never, 20),
            new THREE.LineBasicMaterial({ color: style.edge }),
          );
          (obj as unknown as { add(o: unknown): void }).add(edges);
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
          const savedPosition = camera.position.clone();
          const shots: MassingShots = {};
          const offset = new THREE.Vector3();
          const spherical = new THREE.Spherical();
          for (const [id, yaw] of Object.entries(CAMERA_YAW)) {
            offset.copy(camera.position).sub(controls.target);
            spherical.setFromVector3(offset);
            spherical.theta += yaw;
            camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
            camera.lookAt(controls.target);
            renderer.render(scene, camera);
            shots[id] = renderer.domElement.toDataURL('image/png');
            // Về đúng chỗ cũ SAU MỖI góc, không cộng dồn: xoay tiếp từ góc vừa chụp thì góc
            // thứ ba sẽ lệch gấp đôi, và lỗi đó chỉ lộ ra khi thêm góc máy thứ ba.
            camera.position.copy(savedPosition);
            camera.lookAt(controls.target);
          }
          renderer.render(scene, camera);
          return shots;
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
              const shots = captureRef.current?.();
              if (shots) onSnapshot(shots);
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
