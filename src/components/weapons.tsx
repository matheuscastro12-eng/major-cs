// Ícones de arma do killfeed: SVGs oficiais do HUD do CS (pasta src/assets/weapons,
// estilo "normal"/preenchido). Inlinados via ?raw e pintados com currentColor pra
// herdar a cor do killfeed (fundo escuro). O calibre de QUAL arma aparece em cada
// round (pistol/eco/force/full e AWP) está em engine/match.ts:weaponFor.

// carrega os SVGs como string (sem prolog xml), uma vez, no bundle.
const RAW = import.meta.glob('../assets/weapons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const svgBody = (file: string): string => {
  const raw = RAW[`../assets/weapons/${file}.svg`] ?? '';
  const i = raw.indexOf('<svg');
  return i >= 0 ? raw.slice(i) : '';
};

// arma (string do engine) -> arquivo do ícone + rótulo amigável.
const WEAPON_FILE: Record<string, string> = {
  ak47: 'weapon_ak47',
  m4: 'weapon_m4a1_silencer',
  awp: 'weapon_awp',
  ssg08: 'weapon_ssg08',
  deagle: 'weapon_deagle',
  usp: 'weapon_usp_silencer',
  glock: 'weapon_glock',
  mp9: 'weapon_mp9',
  mac10: 'weapon_mac10',
  tec9: 'weapon_tec9',
  knife: 'weapon_knife',
};

export const WEAPON_LABELS: Record<string, string> = {
  ak47: 'AK-47',
  m4: 'M4A1-S',
  awp: 'AWP',
  ssg08: 'SSG 08',
  deagle: 'Desert Eagle',
  usp: 'USP-S',
  glock: 'Glock-18',
  mp9: 'MP9',
  mac10: 'MAC-10',
  tec9: 'Tec-9',
  knife: 'Faca',
};

export function WeaponIcon({ weapon }: { weapon: string }) {
  const file = WEAPON_FILE[weapon] ?? WEAPON_FILE.ak47;
  const body = svgBody(file);
  if (!body) return null;
  // o SVG herda a cor via CSS (.wpn svg { fill: currentColor }); o tamanho é
  // controlado no CSS, sobrepondo o width/height do arquivo.
  return <span className="wpn-svg" aria-label={WEAPON_LABELS[weapon] ?? weapon} dangerouslySetInnerHTML={{ __html: body }} />;
}

export function HeadshotIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-label="headshot">
      <circle cx="10" cy="8" r="5" />
      <rect x="6" y="13" width="8" height="5" rx="2" />
      <circle cx="12" cy="7" r="1.6" fill="#12161b" />
    </svg>
  );
}
