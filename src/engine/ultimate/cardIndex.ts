// [realismo FM · frente B] Índice de cartas com APELIDO de raridade base.
//
// A chave de uma carta é `${playerId}:${raridade}` e a raridade base sai do OVR.
// Com os atributos virando a fonte da verdade (e a base real de atributos da
// frente de dados), o OVR de um jogador pode mudar de faixa — e a chave antiga
// (`pid:gold`) sumiria do catálogo, deixando a carta da coleção sem valor. Este
// índice resolve uma chave BASE que não existe mais para a carta base ATUAL do
// jogador (FUT: a carta base acompanha o jogador). Chaves especiais (tots,
// promo, totw, major, ícone histórico) nunca são apelidadas.
//
// Leve de propósito (só tipos): o servidor usa o mesmo índice sobre o snapshot.
const BASE_RARITIES = new Set(['bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon']);

export class CardIndex<T extends { key: string; playerId: string; rarity: string }> extends Map<string, T> {
  private readonly baseByPlayer = new Map<string, T>();

  constructor(cards: readonly T[] = []) {
    super();
    for (const c of cards) this.add(c);
  }

  add(c: T): this {
    super.set(c.key, c);
    if (BASE_RARITIES.has(c.rarity) && !this.baseByPlayer.has(c.playerId)) this.baseByPlayer.set(c.playerId, c);
    return this;
  }

  override set(key: string, c: T): this {
    super.set(key, c);
    if (key === c.key && BASE_RARITIES.has(c.rarity) && !this.baseByPlayer.has(c.playerId)) this.baseByPlayer.set(c.playerId, c);
    return this;
  }

  override get(key: string): T | undefined {
    const hit = super.get(key);
    if (hit) return hit;
    const i = key.lastIndexOf(':');
    if (i <= 0 || !BASE_RARITIES.has(key.slice(i + 1))) return undefined;
    return this.baseByPlayer.get(key.slice(0, i));
  }

  override has(key: string): boolean {
    return this.get(key) !== undefined;
  }
}
