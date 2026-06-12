import { useEffect, useRef } from "react";
import * as THREE from "three";

export function GeometryPreview(props: {
  ariaLabel: string;
  maxDimension: number;
  createGeometries: () => THREE.BufferGeometry[];
  color?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    rotationX: number;
    rotationZ: number;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const width = host.clientWidth || 420;
    const height = host.clientHeight || 280;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f0e6");

    const maxDimension = Math.max(10, props.maxDimension);
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1200);
    camera.position.set(maxDimension * 0.6, -maxDimension * 1.25, -maxDimension * 0.85);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    host.replaceChildren(renderer.domElement);

    const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
    keyLight.position.set(maxDimension * 0.6, -maxDimension, -maxDimension);
    scene.add(keyLight);
    scene.add(new THREE.AmbientLight("#ffffff", 1.15));

    const model = new THREE.Group();
    scene.add(model);

    for (const geometry of props.createGeometries()) {
      model.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: props.color ?? "#2f7c6b", roughness: 0.58, side: THREE.DoubleSide }),
        ),
      );
    }

    model.rotation.x = THREE.MathUtils.degToRad(2);

    const startDrag = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        rotationX: model.rotation.x,
        rotationZ: model.rotation.z,
      };
    };

    const drag = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - current.x;
      const deltaY = event.clientY - current.y;
      model.rotation.z = current.rotationZ + deltaX * 0.012;
      model.rotation.x = current.rotationX + deltaY * 0.012;
    };

    const stopDrag = (event: PointerEvent) => {
      const current = dragRef.current;
      if (current?.pointerId === event.pointerId) {
        dragRef.current = null;
      }
    };

    renderer.domElement.addEventListener("pointerdown", startDrag);
    renderer.domElement.addEventListener("pointermove", drag);
    renderer.domElement.addEventListener("pointerup", stopDrag);
    renderer.domElement.addEventListener("pointercancel", stopDrag);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!dragRef.current) {
        model.rotation.z += 0.006;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener("pointerdown", startDrag);
      renderer.domElement.removeEventListener("pointermove", drag);
      renderer.domElement.removeEventListener("pointerup", stopDrag);
      renderer.domElement.removeEventListener("pointercancel", stopDrag);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [props]);

  return <div className="preview-3d interactive-preview" ref={hostRef} aria-label={props.ariaLabel} />;
}
