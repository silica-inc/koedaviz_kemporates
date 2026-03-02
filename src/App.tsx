import { useState, useRef, useEffect } from "react";
import { Text, Badge } from "@chakra-ui/react";
import gsap from "gsap";
import JapanMap from "./components/JapanMap";
import InfoPanel from "./components/InfoPanel";
import { nationalAvg } from "./data/insuranceRates";

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline();
    if (headerRef.current) {
      tl.fromTo(
        headerRef.current,
        { y: -20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" },
      );
    }
  }, []);

  // 選択時にパネルを開く
  useEffect(() => {
    if (selectedId !== null) {
      setPanelOpen(true);
    }
  }, [selectedId]);

  // パネル開閉のアニメーション
  useEffect(() => {
    if (!panelRef.current) return;
    if (panelOpen) {
      gsap.fromTo(
        panelRef.current,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" },
      );
    } else {
      gsap.to(panelRef.current, {
        x: 40,
        opacity: 0,
        duration: 0.25,
        ease: "power2.in",
      });
    }
  }, [panelOpen]);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {/* ベースレイヤー: 全画面マップ */}
      <div style={{ width: "100%", height: "100%" }}>
        <JapanMap
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
        />
      </div>

      {/* オーバーレイ: ヘッダー */}
      <div
        ref={headerRef}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: panelOpen ? 380 : 16,
          transition: "right 0.35s ease",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            gap: 4,
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderRadius: 16,
            padding: "10px 16px",
            boxShadow: "0 2px 16px rgba(0,0,0,0.1)",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            maxWidth: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🏥</span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "#1a202c",
                whiteSpace: "nowrap",
              }}
            >
              都道府県別 健康保険料率マップ
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginLeft: 4,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6b7280" }}>全国平均</div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "#2563eb",
                    fontFamily: "monospace",
                  }}
                >
                  {nationalAvg}%
                </div>
              </div>
              <Badge
                colorPalette="purple"
                variant="subtle"
                px={2}
                py={0}
                borderRadius="full"
                fontSize="10px"
              >
                47都道府県
              </Badge>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#6b7280" }}>
            協会けんぽ 2026年度（令和8年度） ·
            地図をクリックして各都道府県の保険料率を確認
          </div>
        </div>
      </div>

      {/* オーバーレイ: 情報パネル */}
      {panelOpen && (
        <div
          ref={panelRef}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 360,
            // background: "rgba(255, 255, 255, 0.98)",
            backdropFilter: "blur(16px)",
            // WebkitBackdropFilter: "blur(16px)",
            // boxShadow: "-4px 0 32px rgba(0,0,0,0.12)",
            // borderLeft: "1px solid rgba(0, 0, 0, 0.08)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 閉じるボタン */}
          <button
            onClick={() => setPanelOpen(false)}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "12px 16px 8px",
              // background: "rgba(249, 250, 251, 0.98)",
              backdropFilter: "blur(8px)",
              border: "none",
              borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
              cursor: "pointer",
              gap: 6,
              color: "#6b7280",
              fontSize: 12,
              fontFamily: "sans-serif",
            }}
          >
            閉じる ×
          </button>
          <div style={{ padding: "8px 16px 24px", flex: 1 }}>
            <InfoPanel selectedId={selectedId} />
          </div>
        </div>
      )}

      {/* オーバーレイ: フッター */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
        }}
      >
        <Text
          fontSize="10px"
          color="gray.400"
          style={{
            background: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderRadius: 6,
            padding: "3px 8px",
            whiteSpace: "nowrap",
            color: "#6b7280",
            border: "1px solid rgba(0, 0, 0, 0.08)",
          }}
        >
          出典:
          全国健康保険協会（協会けんぽ）2026年度（令和8年度）都道府県単位保険料率
        </Text>
      </div>
    </div>
  );
}
