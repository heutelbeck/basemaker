import { useEffect, useRef } from 'react';
import type { BufferGeometry } from 'three';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { JobPart } from '../generators/job.ts';
import type { RawMesh } from '../geometry/mesh.ts';
import { toBufferGeometry } from './toBufferGeometry.ts';

interface PreviewCanvasProps {
  parts: JobPart[] | null;
  overhangOverlay: RawMesh | null;
  showOverhangs: boolean;
  /** Changes whenever a job is loaded; the next model shown is framed anew. */
  loadCount: number;
  /** The model's front faces +Y, so the camera frames it from that side. */
  frontAtPlusY: boolean;
}

interface PreviewScene {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  partGroup: Group;
  overlayGroup: Group;
  grid: GridHelper;
  gridSize: number;
  framed: boolean;
  frontAtPlusY: boolean;
}

const BODY_PREVIEW_COLOR = 0xc8ccd4;
/** The floor grid: 10 mm cells, at least this size, grown in steps for larger models. */
const GRID_CELL_MM = 10;
const GRID_MIN_MM = 200;
const GRID_STEP_MM = 100;
/** View direction for framing a model whose front faces -Y: from the front right, above. */
const FRAME_DIRECTION = new Vector3(1, -1, 0.9).normalize();
/** The same view for a model whose front faces +Y. */
const FRAME_DIRECTION_PLUS_Y = new Vector3(-1, 1, 0.9).normalize();
/** Room left around a framed model. */
const FRAME_MARGIN = 1.1;
/** Mock parts such as preview bottles stay see-through so the model shows. */
const MOCK_OPACITY = 0.55;

function createPreviewScene(container: HTMLDivElement): PreviewScene {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0x1a1d21);

  const camera = new PerspectiveCamera(40, 1, 0.1, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(45, -45, 40);

  const ambient = new AmbientLight(0xffffff, 0.45);
  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(60, -40, 90);
  const fill = new DirectionalLight(0x88aaff, 0.5);
  fill.position.set(-50, 60, 30);
  scene.add(ambient, key, fill);

  const grid = floorGrid(GRID_MIN_MM);
  scene.add(grid);

  const partGroup = new Group();
  scene.add(partGroup);
  const overlayGroup = new Group();
  scene.add(overlayGroup);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 2);

  return {
    renderer,
    scene,
    camera,
    controls,
    partGroup,
    overlayGroup,
    grid,
    gridSize: GRID_MIN_MM,
    framed: false,
    frontAtPlusY: false,
  };
}

function floorGrid(size: number): GridHelper {
  const grid = new GridHelper(size, size / GRID_CELL_MM, 0x3a4048, 0x272c33);
  grid.rotation.x = Math.PI / 2;
  return grid;
}

/** Grows the floor grid so it reaches past the model's footprint around the origin. */
function fitGrid(preview: PreviewScene, box: Box3): void {
  const reach = Math.max(
    Math.abs(box.min.x),
    Math.abs(box.max.x),
    Math.abs(box.min.y),
    Math.abs(box.max.y),
  );
  const size = Math.max(
    GRID_MIN_MM,
    Math.ceil((2 * reach * FRAME_MARGIN) / GRID_STEP_MM) * GRID_STEP_MM,
  );
  if (size === preview.gridSize) {
    return;
  }
  preview.scene.remove(preview.grid);
  preview.grid.dispose();
  preview.grid = floorGrid(size);
  preview.gridSize = size;
  preview.scene.add(preview.grid);
}

/** Points the camera at the model from far enough that all of it is on screen. */
function frameModel(preview: PreviewScene, box: Box3): void {
  const { camera, controls } = preview;
  const radius = Math.max(box.getBoundingSphere(new Sphere()).radius, 10);
  const vertical = (camera.fov * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const distance = (radius * FRAME_MARGIN) / Math.sin(Math.min(vertical, horizontal) / 2);
  box.getCenter(controls.target);
  camera.position
    .copy(controls.target)
    .addScaledVector(preview.frontAtPlusY ? FRAME_DIRECTION_PLUS_Y : FRAME_DIRECTION, distance);
  camera.far = Math.max(2000, distance * 4);
  camera.updateProjectionMatrix();
}

function disposeParts(group: Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof Mesh) {
      const mesh = child as Mesh<BufferGeometry, MeshStandardMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

export function PreviewCanvas({
  parts,
  overhangOverlay,
  showOverhangs,
  loadCount,
  frontAtPlusY,
}: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<PreviewScene | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const preview = createPreviewScene(container);
    sceneRef.current = preview;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) {
        return;
      }
      preview.renderer.setSize(clientWidth, clientHeight);
      preview.camera.aspect = clientWidth / clientHeight;
      preview.camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let animationFrame = 0;
    const renderLoop = () => {
      preview.controls.update();
      preview.renderer.render(preview.scene, preview.camera);
      animationFrame = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      preview.controls.dispose();
      disposeParts(preview.partGroup);
      disposeParts(preview.overlayGroup);
      preview.renderer.dispose();
      container.removeChild(preview.renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const preview = sceneRef.current;
    if (preview === null || parts === null) {
      return;
    }
    disposeParts(preview.partGroup);
    parts.forEach((part, index) => {
      const isBody = part.name === 'body' || part.name === 'model';
      const mock = part.previewOnly === true;
      const material = new MeshStandardMaterial({
        color: isBody ? BODY_PREVIEW_COLOR : new Color(part.colorHex),
        flatShading: !mock,
        metalness: 0.05,
        roughness: isBody ? 0.65 : 0.5,
        transparent: mock,
        opacity: mock ? MOCK_OPACITY : 1,
        depthWrite: !mock,
        polygonOffset: index > 0,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: -4 * index,
      });
      preview.partGroup.add(new Mesh(toBufferGeometry(part.mesh), material));
    });
    if (parts.length > 0) {
      const box = new Box3().setFromObject(preview.partGroup);
      fitGrid(preview, box);
      if (!preview.framed) {
        frameModel(preview, box);
        preview.framed = true;
      }
    }
  }, [parts]);

  useEffect(() => {
    const preview = sceneRef.current;
    if (preview !== null) {
      preview.framed = false;
    }
  }, [loadCount]);

  useEffect(() => {
    const preview = sceneRef.current;
    if (preview !== null) {
      preview.frontAtPlusY = frontAtPlusY;
    }
  }, [frontAtPlusY]);

  useEffect(() => {
    const preview = sceneRef.current;
    if (preview === null) {
      return;
    }
    disposeParts(preview.overlayGroup);
    if (showOverhangs && overhangOverlay !== null) {
      const material = new MeshStandardMaterial({
        color: 0xe05d5d,
        emissive: 0xa03030,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      preview.overlayGroup.add(new Mesh(toBufferGeometry(overhangOverlay), material));
    }
  }, [overhangOverlay, showOverhangs]);

  return <div ref={containerRef} className="preview-canvas" />;
}
