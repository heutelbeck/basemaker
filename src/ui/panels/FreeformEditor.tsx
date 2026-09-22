import { useEffect, useRef, useState } from 'react';
import { freeformOutline } from '../../params/freeform.ts';
import type { FreeformSpec } from '../../params/types.ts';
import { Select } from '../controls/Select.tsx';

const VIEW_MM = 130;
const VIEW_PX = 300;
const SCALE = VIEW_PX / VIEW_MM;
const DEFAULT_CIRCLE_RADIUS = 8;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

interface Viewport {
  zoom: number;
  originX: number;
  originY: number;
}

const DEFAULT_VIEWPORT: Viewport = { zoom: 1, originX: VIEW_PX / 2, originY: VIEW_PX / 2 };

function zoomAt(view: Viewport, factor: number, x = VIEW_PX / 2, y = VIEW_PX / 2): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return {
    zoom,
    originX: x - (x - view.originX) * ratio,
    originY: y - (y - view.originY) * ratio,
  };
}

interface FreeformEditorProps {
  spec: FreeformSpec;
  onChange: (spec: FreeformSpec) => void;
}

function canvasPoint(clientX: number, clientY: number, svg: SVGSVGElement): DOMPoint {
  return new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM()?.inverse());
}

function toMm(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  view: Viewport,
): [number, number] {
  const point = canvasPoint(clientX, clientY, svg);
  const x = (point.x - view.originX) / (SCALE * view.zoom);
  const y = -(point.y - view.originY) / (SCALE * view.zoom);
  return [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
}

// Project positions only, keeping text, strokes, and handles the same screen size.
function toPx(x: number, y: number, view: Viewport): [number, number] {
  return [view.originX + x * SCALE * view.zoom, view.originY - y * SCALE * view.zoom];
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
function DimensionAnnotations({ dimensions, view }: { dimensions: DimensionBox; view: Viewport }) {
  const gap = 6;
  const [leftPx, bottomPx] = toPx(dimensions.minX, dimensions.minY, view);
  const [rightPx] = toPx(dimensions.maxX, dimensions.minY, view);
  const [, topPx] = toPx(dimensions.maxX, dimensions.maxY, view);
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
  const [view, setView] = useState(DEFAULT_VIEWPORT);

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = canvasPoint(event.clientX, event.clientY, svg);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? VIEW_PX : 1;
      const factor = Math.exp(-event.deltaY * unit * 0.002);
      setView((current) => zoomAt(current, factor, point.x, point.y));
    };
    // React wheel listeners are passive; a native listener lets zoom prevent sidebar scrolling.
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const outline = spec.points.length > 0 ? freeformOutline(spec, 0.1) : [];
  const outlinePath =
    outline.length > 2
      ? `M ${outline.map(([x, y]) => toPx(x, y, view).join(' ')).join(' L ')} Z`
      : '';

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

  const scale = SCALE * view.zoom;
  const gridLines = [];
  const minX = -view.originX / scale;
  const maxX = (VIEW_PX - view.originX) / scale;
  const minY = (view.originY - VIEW_PX) / scale;
  const maxY = view.originY / scale;
  for (let mm = Math.ceil(minX / 10) * 10; mm <= maxX; mm += 10) {
    const [px] = toPx(mm, 0, view);
    gridLines.push(
      <line key={`v${mm}`} x1={px} y1={0} x2={px} y2={VIEW_PX} className="freeform-grid" />,
    );
  }
  for (let mm = Math.ceil(minY / 10) * 10; mm <= maxY; mm += 10) {
    const [, py] = toPx(0, mm, view);
    gridLines.push(
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
      <div className="freeform-zoom" role="group" aria-label="Drawing zoom">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={view.zoom <= MIN_ZOOM}
          onClick={() => setView((current) => zoomAt(current, 1 / ZOOM_STEP))}
        >
          −
        </button>
        <output aria-label="Zoom level">{Math.round(view.zoom * 100)}%</output>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={view.zoom >= MAX_ZOOM}
          onClick={() => setView((current) => zoomAt(current, ZOOM_STEP))}
        >
          +
        </button>
        <button type="button" onClick={() => setView(DEFAULT_VIEWPORT)}>
          Reset view
        </button>
      </div>
      <svg
        ref={svgRef}
        width={VIEW_PX}
        height={VIEW_PX}
        viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`}
        className="freeform-canvas"
        onPointerDown={(event) => {
          if (event.target === svgRef.current && svgRef.current !== null) {
            const [x, y] = toMm(event.clientX, event.clientY, svgRef.current, view);
            addPoint(x, y);
          }
        }}
        onPointerMove={(event) => {
          if (drag !== null && svgRef.current !== null) {
            const [x, y] = toMm(event.clientX, event.clientY, svgRef.current, view);
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
        {dimensions !== null && <DimensionAnnotations dimensions={dimensions} view={view} />}
        {spec.mode === 'circles' &&
          spec.points.map(([x, y], index) => {
            const radius = spec.radii[index] ?? 1;
            const [px, py] = toPx(x, y, view);
            const [hx, hy] = toPx(x + radius, y, view);
            const dragging = drag !== null && drag.index === index && drag.mode === 'radius';
            return (
              <g key={`c${index}`}>
                <circle cx={px} cy={py} r={radius * scale} className="freeform-circle" />
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
          const [px, py] = toPx(x, y, view);
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
            />
          );
        })}
      </svg>
      <p className="freeform-hint">
        Scroll or use +/− to zoom. Click to add a point, drag to move it, double-click to remove.
        {spec.mode === 'circles' && ' Drag the square handle to change the radius (shown in mm).'}
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
