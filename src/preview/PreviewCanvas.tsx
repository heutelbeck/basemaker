import { useEffect, useRef } from 'react';
import type {
  BufferGeometry} from 'three';
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
}

interface PreviewScene {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  partGroup: Group;
  overlayGroup: Group;
  framed: boolean;
}

const BODY_PREVIEW_COLOR = 0xc8ccd4;

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

  const grid = new GridHelper(200, 20, 0x3a4048, 0x272c33);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const partGroup = new Group();
  scene.add(partGroup);
  const overlayGroup = new Group();
  scene.add(overlayGroup);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 2);

  return { renderer, scene, camera, controls, partGroup, overlayGroup, framed: false };
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

export function PreviewCanvas({ parts, overhangOverlay, showOverhangs }: PreviewCanvasProps) {
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
      const material = new MeshStandardMaterial({
        color: isBody ? BODY_PREVIEW_COLOR : new Color(part.colorHex),
        flatShading: true,
        metalness: 0.05,
        roughness: isBody ? 0.65 : 0.5,
        polygonOffset: index > 0,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: -4 * index,
      });
      preview.partGroup.add(new Mesh(toBufferGeometry(part.mesh), material));
    });
    if (!preview.framed && parts.length > 0) {
      const box = new Box3().setFromObject(preview.partGroup);
      const radius = Math.max(box.getSize(preview.camera.position.clone()).length() / 2, 10);
      const distance = radius * 2.6;
      preview.camera.position.set(distance, -distance, distance * 0.9);
      box.getCenter(preview.controls.target);
      preview.framed = true;
    }
  }, [parts]);

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
