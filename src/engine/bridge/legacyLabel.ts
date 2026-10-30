// Rótulo curto do chip "Ex-pro · …" (UI do ManagerSetup). Módulo leve de
// propósito: o ManagerSetup entra na carga inicial e o legacyBridge.ts puxa o
// motor do Road to Pro (e a base de jogadores). Reexportado por legacyBridge.
export function legacyChipLabel(o: { titles: number; majors: number; tierLabel: string }): string {
  const parts = [`Ex-pro · ${o.tierLabel}`];
  if (o.majors > 0) parts.push(`${o.majors} Major${o.majors > 1 ? 's' : ''}`);
  if (o.titles > 0) parts.push(`${o.titles} título${o.titles > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
