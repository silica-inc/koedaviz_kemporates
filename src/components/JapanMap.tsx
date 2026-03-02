import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import gsap from "gsap";
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
  dotMeshes: THREE.InstancedMesh[];
  hitMeshes: THREE.Mesh[];
  baseColor: THREE.Color;
  center: { x: number; y: number };
}

function getRateColor(rate: number): THREE.Color {
  const t = (rate - minRate) / (maxRate - minRate);
  let r: number, g: number, b: number;
  if (t < 0.5) {
    // 低料率: 深い青 (#1565C0) → 琥珀 (#F9A825)
    const u = t * 2;
    r = (21 + u * (249 - 21)) / 255;
    g = (101 + u * (168 - 101)) / 255;
    b = (192 - u * (192 - 37)) / 255;
  } else {
    // 高料率: 琥珀 (#F9A825) → 深い赤 (#C62828)
    const u = (t - 0.5) * 2;
    r = (249 - u * (249 - 198)) / 255;
    g = (168 - u * (168 - 40)) / 255;
    b = (37 - u * (37 - 40)) / 255;
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

/** レイキャスト法によるポリゴン内点判定 */
function pointInShape(shape: THREE.Shape, x: number, y: number): boolean {
  const pts = shape.getPoints(80);
  const n = pts.length;
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const xi = pts[i].x,
      yi = pts[i].y;
    const xj = pts[j].x,
      yj = pts[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
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
  const gsapTweenRef = useRef<gsap.core.Tween | null>(null);

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
      const isSelected = selectedIdRef.current === pm.id;
      const isHovered = hoveredIdRef.current === pm.id;

      let color: THREE.Color;
      let opacity: number;

      if (isSelected) {
        color = pm.baseColor.clone();
        color.r = Math.min(color.r * 1.5 + 0.15, 1);
        color.g = Math.min(color.g * 1.5 + 0.15, 1);
        color.b = Math.min(color.b * 1.5 + 0.15, 1);
        opacity = 1.0;
      } else if (isHovered) {
        color = pm.baseColor.clone();
        color.r = Math.min(color.r + 0.25, 1);
        color.g = Math.min(color.g + 0.25, 1);
        color.b = Math.min(color.b + 0.25, 1);
        opacity = 1.0;
      } else {
        color = pm.baseColor.clone();
        opacity = 1.0;
      }

      for (const dm of pm.dotMeshes) {
        const mat = dm.material as THREE.MeshBasicMaterial;
        mat.color.copy(color);
        mat.opacity = opacity;
      }
    }
  }, []);

  // シーン初期化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xf1f5f9, 1);
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

    fetch(`${import.meta.env.BASE_URL}japan.topojson`)
      .then((r) => r.json())
      .then((topo: Topology) => {
        const japanFeature = feature(topo, (topo as any).objects.japan) as any;
        const projection = geoMercator().fitSize([MAP_W, MAP_H], japanFeature);
        const pathGen = geoPath().projection(projection);

        const meshes: PrefMesh[] = [];

        // ドットマップ設定
        const DOT_SPACING = 4.5;
        const DOT_RADIUS = 1.6;
        const dotGeomTemplate = new THREE.CircleGeometry(DOT_RADIUS, 8);
        const dummy = new THREE.Object3D();

        japanFeature.features.forEach((f: any, i: number) => {
          const id = f.properties.id as number;
          const pref = prefectureMap.get(id);
          if (!pref) return;

          const dStr = pathGen(f) ?? "";
          if (!dStr) return;

          const shapes = svgPathToShapes(dStr);
          if (shapes.length === 0) return;

          const baseColor = getRateColor(pref.healthRate);
          const allDotMeshes: THREE.InstancedMesh[] = [];
          const allHitMeshes: THREE.Mesh[] = [];
          let overallMinX = Infinity, overallMaxX = -Infinity;
          let overallMinY = Infinity, overallMaxY = -Infinity;

          shapes.forEach((shape) => {
            // 不可視ヒットメッシュ（レイキャスト専用）
            const hitGeom = new THREE.ShapeGeometry(shape);
            const hitMat = new THREE.MeshBasicMaterial({
              transparent: true,
              opacity: 0,
              side: THREE.DoubleSide,
            });
            const hitMesh = new THREE.Mesh(hitGeom, hitMat);
            hitMesh.userData.prefId = id;
            scene.add(hitMesh);
            allHitMeshes.push(hitMesh);

            // バウンディングボックスを計算
            const pts = shape.getPoints(120);
            let minX = Infinity,
              maxX = -Infinity;
            let minY = Infinity,
              maxY = -Infinity;
            for (const pt of pts) {
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.y > maxY) maxY = pt.y;
            }
            if (minX < overallMinX) overallMinX = minX;
            if (maxX > overallMaxX) overallMaxX = maxX;
            if (minY < overallMinY) overallMinY = minY;
            if (maxY > overallMaxY) overallMaxY = maxY;

            // グリッドサンプリング → 形状内部の点を収集
            // グローバル原点(0,0)基準の統一グリッドを使用し、都道府県間のズレを防ぐ
            const startX = Math.ceil(minX / DOT_SPACING) * DOT_SPACING;
            const startY = Math.ceil(minY / DOT_SPACING) * DOT_SPACING;
            const positions: THREE.Vector3[] = [];
            for (let x = startX; x <= maxX; x += DOT_SPACING) {
              for (let y = startY; y <= maxY; y += DOT_SPACING) {
                if (pointInShape(shape, x, y)) {
                  positions.push(new THREE.Vector3(x, y, 0));
                }
              }
            }

            if (positions.length === 0) return;

            const dotMat = new THREE.MeshBasicMaterial({
              color: baseColor.clone(),
              transparent: true,
              opacity: 0,
            });
            const instancedMesh = new THREE.InstancedMesh(
              dotGeomTemplate,
              dotMat,
              positions.length,
            );
            positions.forEach((pos, idx) => {
              dummy.position.copy(pos);
              dummy.updateMatrix();
              instancedMesh.setMatrixAt(idx, dummy.matrix);
            });
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.userData.prefId = id;
            scene.add(instancedMesh);
            allDotMeshes.push(instancedMesh);
          });

          if (allDotMeshes.length === 0) return;

          meshes.push({
            id,
            dotMeshes: allDotMeshes,
            hitMeshes: allHitMeshes,
            baseColor,
            center: {
              x: (overallMinX + overallMaxX) / 2,
              y: (overallMinY + overallMaxY) / 2,
            },
          });

          // フェードイン
          const delay = 200 + i * 15;
          setTimeout(() => {
            let op = 0;
            const fade = () => {
              op = Math.min(op + 0.04, 1.0);
              allDotMeshes.forEach((dm) => {
                (dm.material as THREE.MeshBasicMaterial).opacity = op;
              });
              if (op < 1.0) requestAnimationFrame(fade);
            };
            requestAnimationFrame(fade);
          }, delay);
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

  // 選択時：都道府県の中心へパン+ズームアニメーション
  useEffect(() => {
    if (selectedId === null) return;
    const pm = prefMeshesRef.current.find((m) => m.id === selectedId);
    if (!pm) return;

    if (gsapTweenRef.current) gsapTweenRef.current.kill();

    const TARGET_ZOOM = 2.5;
    const targetPanX = pm.center.x - MAP_W / 2;
    const targetPanY = pm.center.y + MAP_H / 2;

    const proxy = {
      panX: panOffsetRef.current.x,
      panY: panOffsetRef.current.y,
      zoom: zoomRef.current,
    };

    gsapTweenRef.current = gsap.to(proxy, {
      panX: targetPanX,
      panY: targetPanY,
      zoom: TARGET_ZOOM,
      duration: 0.8,
      ease: "power3.inOut",
      onUpdate: () => {
        panOffsetRef.current.x = proxy.panX;
        panOffsetRef.current.y = proxy.panY;
        zoomRef.current = proxy.zoom;
        updateCamera();
      },
    });
  }, [selectedId, updateCamera]);

  // ドラッグ
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (gsapTweenRef.current) gsapTweenRef.current.kill();
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
        prefMeshesRef.current.flatMap((pm) => pm.hitMeshes),
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
        prefMeshesRef.current.flatMap((pm) => pm.hitMeshes),
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
      if (gsapTweenRef.current) gsapTweenRef.current.kill();
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
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: "#080810",
      }}
    >
      {/* Three.js Canvas */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
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
              background: "rgba(255, 255, 255, 0.95)",
              border: "1px solid rgba(0, 0, 0, 0.12)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
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
            background: "rgba(255, 255, 255, 0.9)",
            border: "1px solid rgba(0, 0, 0, 0.08)",
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
              <stop offset="0%" stopColor="#1565C0" />
              <stop offset="50%" stopColor="#F9A825" />
              <stop offset="100%" stopColor="#C62828" />
            </linearGradient>
          </defs>
          <text
            x="10"
            y="14"
            fill="#334155"
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
            background: "rgba(255, 255, 255, 0.97)",
            border: "1px solid rgba(0, 0, 0, 0.1)",
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
