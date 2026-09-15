/** @jsxImportSource react */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { UiSnapshot } from "../contracts/protocol.js";
import { request } from "./store.js";
import { useUI, Heading, Empty, Row, Modal } from "./ui.js";
const ModelViewer = lazy(() => import("./model-viewer.js"));
interface Media {
  url: string;
  mime: string;
  evidenceId: string;
  revision: string;
  current: boolean;
}
export function Artifacts({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    [selected, setSelected] = useState<Media>(),
    [target, setTarget] = useState<Media>(),
    [zoom, setZoom] = useState(1),
    [selectTarget, setSelectTarget] = useState(false),
    [loading, setLoading] = useState(""),
    video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setSelected(undefined);
    setTarget(undefined);
    setZoom(1);
  }, [s.workspace, s.goal?.id]);
  const open = async (id: string, asTarget = false) => {
    if (!s.goal) return;
    setLoading(id);
    try {
      const result = await request("media", {
          goalId: s.goal.id,
          evidenceId: id,
        }),
        m = result.data as Media;
      if (asTarget) {
        if (!m.mime.startsWith("image/"))
          throw Error("La comparación requiere dos imágenes");
        setTarget(m);
        setSelectTarget(false);
      } else {
        setSelected(m);
        setTarget(undefined);
        setZoom(1);
      }
    } catch (e) {
      ui.notify(String(e));
    } finally {
      setLoading("");
    }
  };
  return (
    <>
      <Heading
        title="Resultados y evidencia"
        description="Imágenes, videos y assets verificados, ligados a una revisión concreta."
      />
      {!s.artifacts.length ? (
        <Empty title="Las capturas y entregables aparecerán aquí">
          Un archivo generado no demuestra por sí solo que pasó la verificación.
        </Empty>
      ) : (
        s.artifacts.map((a) => (
          <Row
            key={a.id}
            title={a.name}
            detail={`${a.kind} · ${a.current ? "Candidato actual" : "Revisión anterior"} · ${a.revision.slice(0, 10)}`}
            onOpen={() => void open(a.id)}
          >
            <button disabled={loading === a.id} onClick={() => void open(a.id)}>
              {loading === a.id ? "Abriendo…" : "Abrir"}
            </button>
            <button
              onClick={() =>
                void ui.execute(
                  {
                    type: "artifact",
                    goalId: s.goal!.id,
                    evidenceId: a.id,
                    operation: "inspect",
                  },
                  true,
                )
              }
            >
              Metadatos
            </button>
          </Row>
        ))
      )}
      {selected && (
        <Modal
          title={target ? "Comparación de imágenes" : "Visor de resultado"}
          wide
          onClose={() => {
            video.current?.pause();
            setSelected(undefined);
            setTarget(undefined);
          }}
        >
          <div className="media-toolbar">
            <span>
              {selected.current ? "Candidato actual" : "Revisión anterior"} ·{" "}
              {selected.revision.slice(0, 10)}
            </span>
            {selected.mime.startsWith("image/") && (
              <>
                <label>
                  Zoom{" "}
                  <input
                    aria-label="Zoom de imágenes"
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  />
                </label>
                <button onClick={() => setSelectTarget(true)}>
                  Comparar con…
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setTarget(undefined);
                  }}
                >
                  Restablecer
                </button>
              </>
            )}
            {selected.mime.startsWith("video/") && (
              <label>
                Velocidad
                <select
                  aria-label="Velocidad de reproducción"
                  defaultValue="1"
                  onChange={(e) => {
                    if (video.current)
                      video.current.playbackRate = Number(e.target.value);
                  }}
                >
                  <option value="0.5">0,5×</option>
                  <option value="1">1×</option>
                  <option value="2">2×</option>
                </select>
              </label>
            )}
          </div>
          <div className={`media-stage ${target ? "comparison" : ""}`}>
            {selected.mime.startsWith("image/") ? (
              <>
                {target && (
                  <figure>
                    <figcaption>
                      Referencia elegida · {target.revision.slice(0, 10)}
                    </figcaption>
                    <div className="image-scroll">
                      <img
                        src={target.url}
                        style={{ width: `${zoom * 100}%` }}
                        alt="Referencia elegida para comparar"
                      />
                    </div>
                  </figure>
                )}
                <figure>
                  <figcaption>
                    {target ? "Resultado actual" : "Imagen verificada"}
                  </figcaption>
                  <div className="image-scroll">
                    <img
                      src={selected.url}
                      style={{ width: `${zoom * 100}%` }}
                      alt="Resultado producido por la aplicación"
                    />
                  </div>
                </figure>
              </>
            ) : selected.mime.startsWith("video/") ? (
              <video
                ref={video}
                src={selected.url}
                controls
                playsInline
                preload="metadata"
                aria-label="Video del resultado"
              />
            ) : selected.mime === "model/gltf-binary" ? (
              <Suspense fallback={<p>Cargando visor 3D…</p>}>
                <ModelViewer url={selected.url} />
              </Suspense>
            ) : (
              <p>Formato no compatible con vista directa.</p>
            )}
          </div>
          <div className="modal-footer">
            <span>
              La inspección manual no altera los resultados del Judge.
            </span>
            <button
              onClick={() => {
                video.current?.pause();
                setSelected(undefined);
                setTarget(undefined);
              }}
            >
              Cerrar
            </button>
          </div>
          {selectTarget && (
            <div className="inline-picker">
              <h3>Elegí evidencia de referencia</h3>
              {s.artifacts
                .filter(
                  (a) =>
                    a.id !== selected.evidenceId &&
                    /\.png$|\.jpe?g$|\.webp$/i.test(a.name),
                )
                .map((a) => (
                  <button key={a.id} onClick={() => void open(a.id, true)}>
                    {a.name}
                  </button>
                ))}
              <button onClick={() => setSelectTarget(false)}>
                Cancelar comparación
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
