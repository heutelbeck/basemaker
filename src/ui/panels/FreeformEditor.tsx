import { useRef, useState } from 'react';
import { freeformOutline } from '../../params/freeform.ts';
import type { FreeformSpec } from '../../params/types.ts';
import { Select } from '../controls/Select.tsx';

const VIEW_MM = 130;
const VIEW_PX = 300;
const SCALE = VIEW_PX / VIEW_MM;
const DEFAULT_CIRCLE_RADIUS = 8;

interface FreeformEditorProps {
  spec: FreeformSpec;
  onChange: (spec: FreeformSpec) => void;
}

function toMm(clientX: number, clientY: number, svg: SVGSVGElement): [number, number] {
  const rect = svg.getBoundingClientRect();
  const x = (clientX - rect.left - VIEW_PX / 2) / SCALE;
  const y = -(clientY - rect.top - VIEW_PX / 2) / SCALE;
  return [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
}

function toPx(x: number, y: number): [number, number] {
  return [VIEW_PX / 2 + x * SCALE, VIEW_PX / 2 - y * SCALE];
}

interface DimensionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

/** Technical-drawing style extension lines and measurements for the bounding box. */
function DimensionAnnotations({ dimensions }: { dimensions: DimensionBox }) {
  const gap = 6;
  const [leftPx, bottomPx] = toPx(dimensions.minX, dimensions.minY);
  const [rightPx] = toPx(dimensions.maxX, dimensions.minY);
  const [, topPx] = toPx(dimensions.maxX, dimensions.maxY);
  const widthLineY = bottomPx + gap + 8;
  const heightLineX = rightPx + gap + 8;
  return (
    <g>
      <line className="dim-line" x1={leftPx} y1={bottomPx + gap} x2={leftPx} y2={widthLineY + 3} />
      <line
        className="dim-line"
        x1={rightPx}
        y1={bottomPx + gap}
        x2={rightPx}
        y2={widthLineY + 3}
      />
      <line className="dim-line" x1={leftPx} y1={widthLineY} x2={rightPx} y2={widthLineY} />
      <text className="dim-text" x={(leftPx + rightPx) / 2} y={widthLineY + 12} textAnchor="middle">
        {dimensions.width.toFixed(1)} mm
      </text>
      <line
        className="dim-line"
        x1={rightPx + gap}
        y1={bottomPx}
        x2={heightLineX + 3}
        y2={bottomPx}
      />
      <line className="dim-line" x1={rightPx + gap} y1={topPx} x2={heightLineX + 3} y2={topPx} />
      <line className="dim-line" x1={heightLineX} y1={topPx} x2={heightLineX} y2={bottomPx} />
      <text className="dim-text" x={heightLineX + 4} y={(topPx + bottomPx) / 2 + 3}>
        {dimensions.height.toFixed(1)}
      </text>
    </g>
  );
}

type DragState = { index: number; mode: 'move' | 'radius' } | null;

export function FreeformEditor({ spec, onChange }: FreeformEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);

  const outline = spec.points.length > 0 ? freeformOutline(spec, 0.1) : [];
  const outlinePath =
    outline.length > 2 ? `M ${outline.map(([x, y]) => toPx(x, y).join(' ')).join(' L ')} Z` : '';

  const dimensions = (() => {
    if (outline.length < 3) {
      return null;
    }
    const xs = outline.map(([x]) => x);
    const ys = outline.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  })();

  const updatePoint = (index: number, x: number, y: number) => {
    const points = spec.points.map((point, i) =>
      i === index ? ([x, y] as [number, number]) : point,
    );
    onChange({ ...spec, points });
  };

  const addPoint = (x: number, y: number) => {
    onChange({
      ...spec,
      points: [...spec.points, [x, y]],
      radii: [...spec.radii, DEFAULT_CIRCLE_RADIUS],
    });
  };

  const removePoint = (index: number) => {
    onChange({
      ...spec,
      points: spec.points.filter((_, i) => i !== index),
      radii: spec.radii.filter((_, i) => i !== index),
    });
  };

  const changeRadius = (index: number, delta: number) => {
    const radii = spec.radii.map((r, i) =>
      i === index ? Math.max(1, Math.round((r + delta) * 2) / 2) : r,
    );
    onChange({ ...spec, radii });
  };

  const gridLines = [];
  for (let mm = -60; mm <= 60; mm += 10) {
    const [px] = toPx(mm, 0);
    const [, py] = toPx(0, mm);
    gridLines.push(
      <line key={`v${mm}`} x1={px} y1={0} x2={px} y2={VIEW_PX} className="freeform-grid" />,
      <line key={`h${mm}`} x1={0} y1={py} x2={VIEW_PX} y2={py} className="freeform-grid" />,
    );
  }

  return (
    <div className="freeform-editor">
      <Select
        label="Drawing mode"
        value={spec.mode}
        options={[
          { value: 'circles', label: 'Circles with tangent hull' },
          { value: 'smooth', label: 'Smooth curve through points' },
          { value: 'polygon', label: 'Straight polygon' },
        ]}
        onChange={(mode) => onChange({ ...spec, mode: mode as FreeformSpec['mode'] })}
      />
      <svg
        ref={svgRef}
        width={VIEW_PX}
        height={VIEW_PX}
        className="freeform-canvas"
        onPointerDown={(event) => {
          if (event.target === svgRef.current && svgRef.current !== null) {
            const [x, y] = toMm(event.clientX, event.clientY, svgRef.current);
            addPoint(x, y);
          }
        }}
        onPointerMove={(event) => {
          if (drag !== null && svgRef.current !== null) {
            const [x, y] = toMm(event.clientX, event.clientY, svgRef.current);
            if (drag.mode === 'move') {
              updatePoint(drag.index, x, y);
            } else {
              const [cx, cy] = spec.points[drag.index];
              const radius = Math.max(1, Math.round(Math.hypot(x - cx, y - cy) * 2) / 2);
              onChange({
                ...spec,
                radii: spec.radii.map((r, i) => (i === drag.index ? radius : r)),
              });
            }
          }
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {gridLines}
        {outlinePath !== '' && <path d={outlinePath} className="freeform-outline" />}
        {dimensions !== null && <DimensionAnnotations dimensions={dimensions} />}
        {spec.mode === 'circles' &&
          spec.points.map(([x, y], index) => {
            const radius = spec.radii[index] ?? 1;
            const [px, py] = toPx(x, y);
            const [hx, hy] = toPx(x + radius, y);
            const dragging = drag !== null && drag.index === index && drag.mode === 'radius';
            return (
              <g key={`c${index}`}>
                <circle cx={px} cy={py} r={radius * SCALE} className="freeform-circle" />
                <rect
                  x={hx - 4}
                  y={hy - 4}
                  width={8}
                  height={8}
                  className="freeform-radius-handle"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setDrag({ index, mode: 'radius' });
                  }}
                />
                <text
                  className={dragging ? 'dim-text freeform-radius-active' : 'dim-text'}
                  x={hx + 7}
                  y={hy + 3}
                >
                  {radius.toFixed(1)}
                </text>
              </g>
            );
          })}
        {spec.points.map(([x, y], index) => {
          const [px, py] = toPx(x, y);
          return (
            <circle
              key={`p${index}`}
              cx={px}
              cy={py}
              r={5}
              className="freeform-handle"
              onPointerDown={(event) => {
                event.stopPropagation();
                setDrag({ index, mode: 'move' });
              }}
              onDoubleClick={() => removePoint(index)}
              onWheel={(event) => {
                if (spec.mode === 'circles') {
                  changeRadius(index, event.deltaY < 0 ? 0.5 : -0.5);
                }
              }}
            />
          );
        })}
      </svg>
      <p className="freeform-hint">
        Click to add a point, drag to move it, double-click to remove.
        {spec.mode === 'circles' &&
          ' Drag the square handle or scroll over a point to change the radius (shown in mm).'}
      </p>
      <button
        type="button"
        onClick={() => onChange({ ...spec, points: [], radii: [] })}
        disabled={spec.points.length === 0}
      >
        Clear drawing
      </button>
    </div>
  );
}
