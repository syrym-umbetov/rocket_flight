/** Загрузка кита деталей, собранного в Blender (tools/blender/build_kit.py). */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Деталь может приехать как Mesh или как Group: узел glTF с несколькими
 * материалами распадается на примитивы, и загрузчик оборачивает их в группу.
 */
export type Kit = Map<string, THREE.Object3D>;

let cache: Promise<Kit> | null = null;

/**
 * Кит грузится один раз на страницу. Меши остаются шаблонами: сборка ракеты
 * их клонирует, разделяя геометрию и материалы.
 */
export function loadKit(url = '/models/rocket-kit.glb'): Promise<Kit> {
  if (cache) return cache;
  cache = new Promise<Kit>((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const map: Kit = new Map();
        for (const node of gltf.scene.children) map.set(node.name, node);
        resolve(map);
      },
      undefined,
      (err) => { cache = null; reject(err); },
    );
  });
  return cache;
}
