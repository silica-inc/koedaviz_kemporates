import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { prefectureMap, minRate, maxRate } from "../data/insuranceRates";

interface Props {
  selectedId: number | null;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}

interface TooltipState {
  x: number;
  y: number;
  nameJa: string;
  rate: number;
}

interface PrefMesh {
  id: number;
  mesh: THREE.Mesh;
  line: THREE.LineSegments;
  baseColor: THREE.Color;
}

function getRateColor(rate: number): THREE.Color {
  const t = (rate - minRate) / (maxRate - minRate);
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t * 2;
    r = (30 + u * (220 - 30)) / 255;
    g = (120 + u * (200 - 120)) / 255;
    b = (200 - u * (200 - 30)) / 255;
  } else {
    const u = (t - 0.5) * 2;
    r = 220 / 255;
    g = (200 - u * (200 - 50)) / 255;
    b = (30 - u * 30) / 255;
  }
  return new THREE.Color(r, g, b);
}

/** SVG path の d 文字列を THREE.Shape[] に変換 */
function svgPathToShapes(d: string): THREE.Shape[] {
  const shapes: THREE.Shape[] = [];
  const commands = d.match(/[MLZmlz][^MLZmlz]*/g);
  if (!commands) return shapes;

  let currentShape: THREE.Shape | null = null;

  for (const cmd of commands) {
    const type = cmd[0];
    const args = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    if (type === "M") {
      currentShape = new THREE.Shape();
      shapes.push(currentShape);
      currentShape.moveTo(args[0], -args[1]);
      for (let i = 2; i < args.length; i += 2) {
        currentShape.lineTo(args[i], -args[i + 1]);
      }
    } else if (type === "L") {
      if (!currentShape) continue;
      for (let i = 0; i < args.length; i += 2) {
        currentShape.lineTo(args[i], -args[i + 1]);
      }
    }
    // Z は THREE.Shape が自動処理
  }
  return shapes;
}

export default function JapanMap({
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const prefMeshesRef = useRef<PrefMesh[]>([]);
  const animFrameRef = useRef<number>(0);

  // ドラッグ＆ズーム用
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const selectedIdRef = useRef(selectedId);
  const hoveredIdRef = useRef(hoveredId);
  selectedIdRef.current = selectedId;
  hoveredIdRef.current = hoveredId;

  const MAP_W = 700;
  const MAP_H = 720;

  const updateCamera = useCallback(() => {
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!camera || !container) return;
    const z = zoomRef.current;
    const cx = MAP_W / 2 + panOffsetRef.current.x;
    const cy = -MAP_H / 2 + panOffsetRef.current.y;
    // コンテナのアスペクト比に合わせてフラスタムを計算（縦横比歪み防止）
    // 1ピクセル = MAP_W / (containerWidth * z) ワールド単位 で統一
    const unitsPerPx = MAP_W / (container.clientWidth * z);
    const halfW = (container.clientWidth * unitsPerPx) / 2;
    const halfH = (container.clientHeight * unitsPerPx) / 2;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.position.set(cx, cy, 1);
    camera.lookAt(cx, cy, 0);
    camera.updateProjectionMatrix();
  }, []);

  const updateColors = useCallback(() => {
    for (const pm of prefMeshesRef.current) {
      const mat = pm.mesh.material as THREE.MeshBasicMaterial;
      const lineMat = pm.line.material as THREE.LineBasicMaterial;
      const isSelected = selectedIdRef.current === pm.id;
      const isHovered = hoveredIdRef.current === pm.id;

      if (isSelected) {
        mat.color.copy(pm.baseColor);
        mat.opacity = 1.0;
        lineMat.color.set(0xffffff);
      } else if (isHovered) {
        const h = pm.baseColor.clone();
        h.r = Math.min(h.r + 0.15, 1);
        h.g = Math.min(h.g + 0.15, 1);
        h.b = Math.min(h.b + 0.15, 1);
        mat.color.copy(h);
        mat.opacity = 0.95;
        lineMat.color.set(0xffffff);
      } else {
        mat.color.copy(pm.baseColor);
        mat.opacity = 0.75;
        lineMat.color.set(0xffffff);
      }
    }
  }, []);

  // シーン初期化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.display = "block"; // inlineマージンによる高さずれを防止
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(
      -MAP_W / 2,
      MAP_W / 2,
      MAP_H / 2,
      -MAP_H / 2,
      -10,
      10,
    );
    // 真上からの画角：地図の中心(MAP_W/2, -MAP_H/2)を見下ろす
    camera.position.set(MAP_W / 2, -MAP_H / 2, 1);
    camera.lookAt(MAP_W / 2, -MAP_H / 2, 0);
    cameraRef.current = camera;
    updateCamera(); // コンテナの実サイズに合わせた初期フラスタムを適用

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    fetch("/japan.topojson")
      .then((r) => r.json())
      .then((topo: Topology) => {
        const japanFeature = feature(topo, (topo as any).objects.japan) as any;
        const projection = geoMercator().fitSize([MAP_W, MAP_H], japanFeature);
        const pathGen = geoPath().projection(projection);

        const meshes: PrefMesh[] = [];

        japanFeature.features.forEach((f: any, i: number) => {
          const id = f.properties.id as number;
          const pref = prefectureMap.get(id);
          if (!pref) return;

          const dStr = pathGen(f) ?? "";
          if (!dStr) return;

          const shapes = svgPathToShapes(dStr);
          if (shapes.length === 0) return;

          const baseColor = getRateColor(pref.healthRate);

          shapes.forEach((shape) => {
            const geom = new THREE.ShapeGeometry(shape);
            const mat = new THREE.MeshBasicMaterial({
              color: baseColor.clone(),
              transparent: true,
              opacity: 0,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.userData.prefId = id;
            mesh.position.z = -0.1;

            const edgeGeom = new THREE.EdgesGeometry(geom);
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0 });
            const line = new THREE.LineSegments(edgeGeom, edgeMat);

            scene.add(mesh);
            scene.add(line);
            meshes.push({ id, mesh, line, baseColor });

            // フェードイン
            const delay = 200 + i * 15;
            setTimeout(() => {
              let op = 0;
              const fade = () => {
                op = Math.min(op + 0.05, 0.75);
                mat.opacity = op;
                if (op < 0.75) requestAnimationFrame(fade);
              };
              requestAnimationFrame(fade);
            }, delay);
          });
        });

        prefMeshesRef.current = meshes;
        setIsLoaded(true);
      });

    const onResize = () => {
      if (!container || !renderer) return;
      renderer.setSize(container.clientWidth, container.clientHeight);
      updateCamera();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    updateColors();
  }, [selectedId, hoveredId, updateColors]);

  // ドラッグ
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      if (!container || !camera || !scene) return;

      const rect = container.getBoundingClientRect();

      if (isDraggingRef.current) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        const worldPerPx = MAP_W / (container.clientWidth * zoomRef.current);
        panOffsetRef.current.x -= dx * worldPerPx;
        panOffsetRef.current.y += dy * worldPerPx;
        updateCamera();
        setTooltip(null);
        container.style.cursor = "grabbing";
        return;
      }

      // ホバー（Raycasting）— キャンバス要素の rect を使うことでサイズ不一致によるズレを防ぐ
      const canvas = rendererRef.current?.domElement;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - canvasRect.left) / canvas.clientWidth) * 2 - 1;
      const ndcY =
        -((e.clientY - canvasRect.top) / canvas.clientHeight) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hits = raycaster.intersectObjects(
        prefMeshesRef.current.map((pm) => pm.mesh),
      );

      if (hits.length > 0) {
        const hitId = hits[0].object.userData.prefId as number;
        onHover(hitId);
        const pref = prefectureMap.get(hitId);
        if (pref) {
          setTooltip({
            x: e.clientX - canvasRect.left,
            y: e.clientY - canvasRect.top,
            nameJa: pref.nameJa,
            rate: pref.healthRate,
          });
        }
        container.style.cursor = "pointer";
      } else {
        onHover(null);
        setTooltip(null);
        container.style.cursor = "grab";
      }
    },
    [onHover, updateCamera],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = false;
    const container = containerRef.current;
    if (container) container.style.cursor = "grab";
    void e;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    onHover(null);
    setTooltip(null);
  }, [onHover]);

  // クリック
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      if (!container || !camera || !scene) return;

      const canvas = rendererRef.current?.domElement;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - canvasRect.left) / canvas.clientWidth) * 2 - 1;
      const ndcY =
        -((e.clientY - canvasRect.top) / canvas.clientHeight) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hits = raycaster.intersectObjects(
        prefMeshesRef.current.map((pm) => pm.mesh),
      );
      if (hits.length > 0) {
        onSelect(hits[0].object.userData.prefId as number);
      }
    },
    [onSelect],
  );

  // ホイールズーム
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      zoomRef.current = Math.max(0.5, Math.min(8, zoomRef.current * delta));
      updateCamera();
    },
    [updateCamera],
  );

  // タッチ操作
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      lastPinchDistRef.current = null;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.hypot(dx, dy);
      lastTouchRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      if (e.touches.length === 1 && lastTouchRef.current) {
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        lastTouchRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        const worldPerPx = MAP_W / (container.clientWidth * zoomRef.current);
        panOffsetRef.current.x -= dx * worldPerPx;
        panOffsetRef.current.y += dy * worldPerPx;
        updateCamera();
      } else if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        zoomRef.current = Math.max(
          0.5,
          Math.min(8, zoomRef.current * (dist / lastPinchDistRef.current)),
        );
        lastPinchDistRef.current = dist;
        updateCamera();
      }
    },
    [updateCamera],
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchRef.current = null;
    lastPinchDistRef.current = null;
  }, []);

  const resetView = useCallback(() => {
    zoomRef.current = 1;
    panOffsetRef.current = { x: 0, y: 0 };
    updateCamera();
  }, [updateCamera]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: 400,
      }}
    >
      {/* Three.js Canvas */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 400,
          cursor: "grab",
          touchAction: "none",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* リセットボタン */}
      {isLoaded && (
        <div style={{ position: "absolute", bottom: 60, right: 10 }}>
          <button
            onClick={resetView}
            title="表示をリセット"
            style={{
              background: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              color: "#374151",
              fontFamily: "sans-serif",
            }}
          >
            🔄 リセット
          </button>
        </div>
      )}

      {/* 操作ヒント */}
      {isLoaded && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            background: "rgba(255,255,255,0.8)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 10,
            color: "#6b7280",
            fontFamily: "sans-serif",
            pointerEvents: "none",
          }}
        >
          🖱 ドラッグ: 移動 ／ スクロール: ズーム
        </div>
      )}

      {/* カラー凡例 */}
      {isLoaded && (
        <svg
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            pointerEvents: "none",
          }}
          width={240}
          height={55}
        >
          <defs>
            <linearGradient id="legend-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="rgba(30,120,200,0.85)" />
              <stop offset="50%" stopColor="rgba(220,200,30,0.85)" />
              <stop offset="100%" stopColor="rgba(220,50,0,0.85)" />
            </linearGradient>
          </defs>
          <text
            x="10"
            y="14"
            fill="#1a202c"
            fontSize="11"
            fontFamily="sans-serif"
            fontWeight="600"
          >
            健康保険料率
          </text>
          <rect
            x="10"
            y="20"
            width="200"
            height="14"
            rx="4"
            fill="url(#legend-grad)"
          />
          <text
            x="10"
            y="48"
            fill="#4a5568"
            fontSize="10"
            fontFamily="sans-serif"
          >
            {minRate}%
          </text>
          <text
            x="110"
            y="48"
            fill="#4a5568"
            fontSize="10"
            fontFamily="sans-serif"
            textAnchor="middle"
          >
            全国平均
          </text>
          <text
            x="210"
            y="48"
            fill="#4a5568"
            fontSize="10"
            fontFamily="sans-serif"
            textAnchor="end"
          >
            {maxRate}%
          </text>
        </svg>
      )}

      {/* ツールチップ */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 40,
            background: "rgba(255,255,255,0.97)",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 8,
            padding: "8px 12px",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div
            style={{
              color: "#1a202c",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "sans-serif",
            }}
          >
            {tooltip.nameJa}
          </div>
          <div
            style={{
              color: "#16a34a",
              fontSize: 12,
              fontFamily: "monospace",
              marginTop: 2,
            }}
          >
            健康保険料率: <strong>{tooltip.rate.toFixed(2)}%</strong>
          </div>
        </div>
      )}
    </div>
  );
}
