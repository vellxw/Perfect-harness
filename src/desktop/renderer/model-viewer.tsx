/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
export default function ModelViewer({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [info, setInfo] = useState("Cargando GLB…"),
    reset = useRef<() => void>(() => {});
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let closed = false,
      renderer: THREE.WebGLRenderer | undefined,
      controls: OrbitControls | undefined,
      scene: THREE.Scene | undefined,
      frame = 0,
      observer: ResizeObserver | undefined;
    const abort = new AbortController();
    const dispose = () => {
      closed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls?.dispose();
      scene?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : []) {
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
    void (async () => {
      try {
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw Error("No se pudo leer el GLB verificado");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 150000000) throw Error("GLB demasiado grande");
        const view = new DataView(bytes);
        if (
          view.getUint32(0, true) !== 0x46546c67 ||
          view.getUint32(4, true) !== 2 ||
          view.getUint32(8, true) !== bytes.byteLength ||
          view.getUint32(16, true) !== 0x4e4f534a
        )
          throw Error("Cabecera GLB inválida");
        const length = view.getUint32(12, true);
        if (length > bytes.byteLength - 20) throw Error("GLB corrupto");
        const json = JSON.parse(
          new TextDecoder().decode(new Uint8Array(bytes, 20, length)).trim(),
        );
        if (
          [...(json.buffers ?? []), ...(json.images ?? [])].some(
            (entry: { uri?: string }) =>
              entry.uri && !entry.uri.startsWith("data:"),
          )
        )
          throw Error("El visor no carga recursos externos del modelo");
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((resource) => {
          if (!resource.startsWith("blob:") && !resource.startsWith("data:"))
            throw Error("Recurso externo bloqueado");
          return resource;
        });
        const gltf = await new GLTFLoader(manager).parseAsync(bytes, "");
        if (closed) {
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) o.geometry.dispose();
          });
          return;
        }
        scene = new THREE.Scene();
        scene.background = new THREE.Color("#10151e");
        scene.add(gltf.scene);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x344360, 2));
        const light = new THREE.DirectionalLight(0xffffff, 3);
        light.position.set(3, 4, 5);
        scene.add(light);
        const box = new THREE.Box3().setFromObject(gltf.scene),
          center = box.getCenter(new THREE.Vector3()),
          size = box.getSize(new THREE.Vector3()).length();
        if (!Number.isFinite(size) || size <= 0)
          throw Error("La geometría está vacía o fuera de rango");
        const camera = new THREE.PerspectiveCamera(
          40,
          1,
          Math.max(size / 1000, 0.0001),
          size * 100,
        );
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        root.appendChild(renderer.domElement);
        renderer.domElement.setAttribute(
          "aria-label",
          "Vista 3D interactiva; arrastrá para orbitar y rueda para zoom",
        );
        renderer.domElement.tabIndex = 0;
        const draw = () => {
          if (frame || closed) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (renderer && scene) renderer.render(scene, camera);
          });
        };
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.target.copy(center);
        controls.addEventListener("change", draw);
        reset.current = () => {
          camera.position
            .copy(center)
            .add(new THREE.Vector3(size, size * 0.7, size));
          controls!.target.copy(center);
          controls!.update();
          draw();
        };
        reset.current();
        observer = new ResizeObserver(() => {
          if (!renderer || closed) return;
          const width = Math.max(1, root.clientWidth),
            height = Math.max(1, root.clientHeight);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          draw();
        });
        observer.observe(root);
        let meshes = 0,
          triangles = 0;
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            meshes++;
            triangles +=
              (o.geometry.index?.count ??
                o.geometry.attributes.position?.count ??
                0) / 3;
          }
        });
        setInfo(
          `${meshes} mallas · ${Math.round(triangles).toLocaleString("es-AR")} triángulos · render bajo demanda`,
        );
      } catch (e) {
        if (!closed)
          setError(
            e instanceof Error ? e.message : "No se pudo visualizar el modelo",
          );
      }
    })();
    return dispose;
  }, [url]);
  return (
    <div className="model-viewer">
      <div ref={host} className="model-canvas" />
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : (
        <div className="model-controls">
          <span>{info}</span>
          <button onClick={() => reset.current()}>Restablecer cámara</button>
        </div>
      )}
    </div>
  );
}
