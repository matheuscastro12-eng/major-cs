// Cena three low-poly: caixas instanciadas (1 draw call por material), luz
// hemisférica + 1 direcional sem sombra, fog. Nenhum asset externo.
import * as THREE from 'three';
import { levelBoxes, type Level, WALL_H } from '../logic/level';
import { H_HEAD, H_LEGS, H_TORSO } from '../logic/sim';

export interface BotVisual { x: number; z: number; yaw: number; alive: boolean; flash: number }

export interface ClutchScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  setBots(bots: BotVisual[]): void;
  setBomb(x: number, z: number, blink: boolean, defuse: number): void;
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, player: boolean): void;
  muzzle(on: boolean): void;
  viewKick(kick: number, bob: number, weapon: 'rifle' | 'pistol', reload: number): void;
  update(dt: number): void;
  dispose(): void;
}

const TRACERS = 24;

export function createScene(level: Level, botCount: number): ClutchScene {
  const scene = new THREE.Scene();
  const sky = new THREE.Color('#0b1426');
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 18, 48);
  const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 120);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3226', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 1.4);
  sun.position.set(-10, 20, -6);
  scene.add(sun);

  const disposables: { dispose(): void }[] = [];
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0.5, 0.5, 0.5); // origem no canto: facilita posicionar caixas
  disposables.push(unit);

  const boxes = levelBoxes(level);
  const palette = {
    wall: ['#c9d3dd', '#b9c6d3', '#d4dbe2'],
    crate: ['#b9783f', '#a8693a', '#c58a4c'],
    floor: ['#5b6470', '#56606b', '#606a76'],
  } as const;
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (const kind of ['wall', 'crate', 'floor'] as const) {
    const list = boxes.filter((b) => b.kind === kind);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    disposables.push(mat);
    const mesh = new THREE.InstancedMesh(unit, mat, list.length);
    list.forEach((b, i) => {
      const y0 = kind === 'floor' ? -0.1 : 0;
      m4.makeScale(b.w, b.h, b.d).setPosition(b.x, y0, b.z);
      mesh.setMatrixAt(i, m4);
      // "AO pintada": variação de tom por instância, mais escura perto do chão em caixas baixas
      col.set(palette[kind][(Math.floor(b.x * 7 + b.z * 3)) % 3]);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }
  // teto aberto: uma faixa de "luz" no topo das paredes ajuda a leitura
  const trimMat = new THREE.MeshBasicMaterial({ color: '#2b6cb0' });
  disposables.push(trimMat);
  const walls = boxes.filter((b) => b.kind === 'wall');
  const trim = new THREE.InstancedMesh(unit, trimMat, walls.length);
  walls.forEach((b, i) => { m4.makeScale(b.w, 0.12, b.d).setPosition(b.x, WALL_H, b.z); trim.setMatrixAt(i, m4); });
  scene.add(trim);

  // bots: 3 partes instanciadas
  const partGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(partGeo);
  const mk = (color: string) => {
    const m = new THREE.MeshLambertMaterial({ color });
    disposables.push(m);
    const im = new THREE.InstancedMesh(partGeo, m, Math.max(1, botCount));
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im);
    return im;
  };
  const legs = mk('#3b3f46');
  const torso = mk('#d08a2e');
  const head = mk('#e8c39e');
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  // bomba
  const bombMat = new THREE.MeshLambertMaterial({ color: '#3a3f2a', emissive: '#000000' });
  const bombGeo = new THREE.BoxGeometry(0.45, 0.18, 0.3);
  disposables.push(bombMat, bombGeo);
  const bomb = new THREE.Mesh(bombGeo, bombMat);
  scene.add(bomb);
  const ringGeo = new THREE.RingGeometry(1.35, 1.5, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#e5484d', transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  disposables.push(ringGeo, ringMat);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  // tracers (pool)
  const trPos = new Float32Array(TRACERS * 6);
  const trCol = new Float32Array(TRACERS * 6);
  const trLife = new Float32Array(TRACERS);
  const trGeo = new THREE.BufferGeometry();
  trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
  trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3).setUsage(THREE.DynamicDrawUsage));
  const trMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
  disposables.push(trGeo, trMat);
  const tracers = new THREE.LineSegments(trGeo, trMat);
  tracers.frustumCulled = false;
  scene.add(tracers);
  let trNext = 0;

  // viewmodel genérico (caixas) preso à câmera
  const vm = new THREE.Group();
  const vmMat = new THREE.MeshLambertMaterial({ color: '#2a2f38' });
  const vmAcc = new THREE.MeshLambertMaterial({ color: '#4a5260' });
  disposables.push(vmMat, vmAcc);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), vmMat);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), vmAcc);
  mag.position.set(0, -0.1, -0.05);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.25), vmAcc);
  barrel.position.set(0, 0.015, -0.38);
  vm.add(body, mag, barrel);
  disposables.push(body.geometry, mag.geometry, barrel.geometry);
  const flashMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
  const flashGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  disposables.push(flashMat, flashGeo);
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(0, 0.015, -0.55);
  flash.visible = false;
  vm.add(flash);
  vm.scale.setScalar(0.55);
  vm.position.set(0.2, -0.2, -0.35);
  camera.add(vm);

  return {
    scene, camera,
    setBots(bots) {
      bots.forEach((b, i) => {
        q.setFromAxisAngle(up, b.yaw);
        const s = b.alive ? 1 : 0;
        // deitado quando morto: some (fase 1) — simples e barato
        pos.set(b.x, H_LEGS / 2, b.z); scl.set(0.42 * s, H_LEGS * s, 0.3 * s);
        legs.setMatrixAt(i, m4.compose(pos, q, scl));
        pos.set(b.x, (H_LEGS + H_TORSO) / 2, b.z); scl.set(0.56 * s, (H_TORSO - H_LEGS) * s, 0.34 * s);
        torso.setMatrixAt(i, m4.compose(pos, q, scl));
        pos.set(b.x, (H_TORSO + H_HEAD) / 2, b.z); scl.set(0.3 * s, (H_HEAD - H_TORSO) * s, 0.3 * s);
        head.setMatrixAt(i, m4.compose(pos, q, scl));
        col.set(b.flash > 0 ? '#ffffff' : '#d08a2e');
        torso.setColorAt(i, col);
      });
      for (const im of [legs, torso, head]) {
        im.count = bots.length;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    },
    setBomb(x, z, blink, defuse) {
      bomb.position.set(x, 0.09, z);
      bombMat.emissive.set(blink ? '#ff2a2a' : '#000000');
      ring.position.set(x, 0.02, z);
      ringMat.color.set(defuse > 0 ? '#3ba3ff' : '#e5484d');
      ringMat.opacity = 0.25 + defuse * 0.6;
    },
    tracer(ax, ay, az, bx, by, bz, player) {
      const i = trNext; trNext = (trNext + 1) % TRACERS;
      trPos.set([ax, ay, az, bx, by, bz], i * 6);
      const c = player ? [1, 0.85, 0.45] : [1, 0.45, 0.3];
      trCol.set([...c, ...c], i * 6);
      trLife[i] = 0.06;
      trGeo.attributes.position.needsUpdate = true;
      trGeo.attributes.color.needsUpdate = true;
    },
    muzzle(on) { flash.visible = on; },
    viewKick(kick, bob, weapon, reload) {
      vm.position.set(0.16 + Math.sin(bob) * 0.006, -0.15 + Math.abs(Math.cos(bob)) * 0.005 - reload * 0.15, -0.3 + kick * 0.4);
      vm.rotation.x = kick * 2 - reload * 0.6;
      body.scale.z = weapon === 'pistol' ? 0.45 : 1;
      mag.visible = weapon === 'rifle';
      barrel.position.z = weapon === 'pistol' ? -0.18 : -0.38;
      flash.position.z = weapon === 'pistol' ? -0.3 : -0.55;
    },
    update(dt) {
      let dirty = false;
      for (let i = 0; i < TRACERS; i++) {
        if (trLife[i] <= 0) continue;
        trLife[i] -= dt;
        if (trLife[i] <= 0) { trPos.fill(0, i * 6, i * 6 + 6); dirty = true; }
      }
      if (dirty) trGeo.attributes.position.needsUpdate = true;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      scene.clear();
    },
  };
}
