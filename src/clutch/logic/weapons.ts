// Armas GENÉRICAS (sem nome registrado): "Fuzil" e "Pistola".
export type WeaponId = 'rifle' | 'pistol';

export interface WeaponDef {
  id: WeaponId;
  label: string;
  base: number;         // dano base no torso
  rpm: number;
  auto: boolean;
  mag: number;
  reloadS: number;
  drawS: number;
  falloffPer10m: number;
  armorPen: number;     // fração do dano que passa pelo colete
  spread: number;       // rad parado
  moveSpread: number;   // rad extra correndo
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: 'rifle', label: 'Fuzil', base: 34, rpm: 600, auto: true, mag: 30, reloadS: 2.4, drawS: 0.5,
    falloffPer10m: 0.98, armorPen: 0.7, spread: 0.003, moveSpread: 0.045,
  },
  pistol: {
    id: 'pistol', label: 'Pistola', base: 30, rpm: 400, auto: false, mag: 12, reloadS: 2.0, drawS: 0.35,
    falloffPer10m: 0.9, armorPen: 0.6, spread: 0.005, moveSpread: 0.02,
  },
};

export const fireInterval = (w: WeaponDef) => 60 / w.rpm;
