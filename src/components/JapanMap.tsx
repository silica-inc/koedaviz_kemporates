import { useEffect, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { prefectureMap, minRate, maxRate } from '../data/insuranceRates';
import gsap from 'gsap';

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

function getRateColor(rate: number, isSelected: boolean, isHovered: boolean): string {
  const t = (rate - minRate) / (maxRate - minRate);
  // Blue (low) -> Yellow (mid) -> Red (high)
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t * 2;
    r = Math.round(30 + u * (220 - 30));
    g = Math.round(120 + u * (200 - 120));
    b = Math.round(200 - u * (200 - 30));
  } else {
    const u = (t - 0.5) * 2;
    r = Math.round(220 + u * (220 - 220));
    g = Math.round(200 - u * (200 - 50));
    b = Math.round(30 - u * 30);
  }

  if (isSelected) {
    return `rgba(${r}, ${g}, ${b}, 1)`;
  }
  if (isHovered) {
    return `rgba(${Math.min(r + 40, 255)}, ${Math.min(g + 40, 255)}, ${Math.min(b + 40, 255)}, 0.95)`;
  }
  return `rgba(${r}, ${g}, ${b}, 0.75)`;
}

export default function JapanMap({ selectedId, hoveredId, onSelect, onHover }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathsRef = useRef<SVGGElement>(null);
  const [paths, setPaths] = useState<{ id: number; d: string }[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const width = 700;
  const height = 720;

  useEffect(() => {
    fetch('/japan.topojson')
      .then(r => r.json())
      .then((topo: Topology) => {
        const japanFeature = feature(topo, (topo as any).objects.japan) as any;
        const projection = geoMercator().fitSize([width, height], japanFeature);
        const pathGen = geoPath().projection(projection);

        const computed = japanFeature.features.map((f: any) => ({
          id: f.properties.id as number,
          d: pathGen(f) ?? '',
        }));
        setPaths(computed);
      });
  }, []);

  // GSAP: stagger reveal on load
  useEffect(() => {
    if (paths.length === 0 || !pathsRef.current) return;
    const els = pathsRef.current.querySelectorAll('path');
    gsap.fromTo(
      els,
      { opacity: 0, scale: 0.92, transformOrigin: 'center center' },
      { opacity: 1, scale: 1, duration: 0.6, stagger: 0.015, ease: 'power2.out', delay: 0.2 }
    );
  }, [paths.length]);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <g ref={pathsRef}>
          {paths.map(({ id, d }) => {
            const pref = prefectureMap.get(id);
            if (!pref) return null;
            const isSelected = selectedId === id;
            const isHovered = hoveredId === id;
            const fill = getRateColor(pref.healthRate, isSelected, isHovered);

            return (
              <path
                key={id}
                d={d}
                fill={fill}
                stroke={isSelected ? '#fff' : '#1a202c'}
                strokeWidth={isSelected ? 2.5 : 0.5}
                style={{
                  cursor: 'pointer',
                  transition: 'fill 0.2s ease, stroke 0.15s ease',
                  filter: isSelected ? 'drop-shadow(0 0 6px rgba(255,255,255,0.6))' : 'none',
                }}
                onClick={() => onSelect(id)}
                onMouseEnter={(e) => {
                  onHover(id);
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) {
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      nameJa: pref.nameJa,
                      rate: pref.healthRate,
                    });
                  }
                }}
                onMouseMove={(e) => {
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) {
                    setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : prev);
                  }
                }}
                onMouseLeave={() => {
                  onHover(null);
                  setTooltip(null);
                }}
              />
            );
          })}
        </g>

        {/* Color legend */}
        <defs>
          <linearGradient id="legend-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(30, 120, 200, 0.85)" />
            <stop offset="50%" stopColor="rgba(220, 200, 30, 0.85)" />
            <stop offset="100%" stopColor="rgba(220, 50, 0, 0.85)" />
          </linearGradient>
        </defs>
        <g transform={`translate(20, ${height - 55})`}>
          <text x="0" y="0" fill="#e2e8f0" fontSize="11" fontFamily="sans-serif" fontWeight="600">
            健康保険料率
          </text>
          <rect x="0" y="6" width="200" height="14" rx="4" fill="url(#legend-grad)" />
          <text x="0" y="34" fill="#a0aec0" fontSize="10" fontFamily="sans-serif">{minRate}%</text>
          <text x="90" y="34" fill="#a0aec0" fontSize="10" fontFamily="sans-serif" textAnchor="middle">全国平均</text>
          <text x="200" y="34" fill="#a0aec0" fontSize="10" fontFamily="sans-serif" textAnchor="end">{maxRate}%</text>
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y - 40,
            background: 'rgba(13, 17, 30, 0.92)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            padding: '8px 12px',
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 700, fontFamily: 'sans-serif' }}>
            {tooltip.nameJa}
          </div>
          <div style={{ color: '#68d391', fontSize: '12px', fontFamily: 'monospace', marginTop: 2 }}>
            健康保険料率: <strong>{tooltip.rate.toFixed(2)}%</strong>
          </div>
        </div>
      )}
    </div>
  );
}
