# Design system — Broadcast Desk

> Seções de tokens e primitivos: ver o worker de fundação (sa/design-fundacao).
> Esta cópia traz só a seção "Juice"; o integrador junta as duas.

## Juice

Som, háptico, confete e View Transitions (ULTRAPLAN §4, princípio 6; UX-07).
Tudo em `src/lib/juice/`, sem arquivo de áudio e sem dependência nova.
Importe do barril:

```ts
import { juice, celebrate, withViewTransition, SoundToggle } from '../../lib/juice';
```

### Regras

- **Toda conquista tem juice, e só conquista tem o pacote completo.** `achievement` + `celebrate()`
  ficam para título, carta rara, Fundador (o mesmo critério do dourado `--c-achievement`).
  Clique comum não solta confete.
- **Som nunca é o único sinal.** A informação tem de estar na tela (placar, carta, toast);
  som e vibração só reforçam.
- **Nada lança.** Todas as funções são no-op seguro sem `window`, sem WebAudio, sem
  `navigator.vibrate`, antes do primeiro gesto ou com o jogador mudo.
- **`prefers-reduced-motion`**: sem escolha explícita do jogador, som mudo e háptico
  desligado; `celebrate()` não anima; `withViewTransition()` troca direto; o `reveal`
  (se o som foi ligado explicitamente) toca só o acorde final. Escolha explícita no
  `SoundToggle` sempre vence o sistema.
- **Gesto do usuário**: o `AudioContext` só é criado no primeiro `pointerdown`/`keydown`/
  `touchend`. Antes disso `playSfx()` devolve `false` sem aviso no console.

### `juice(name, opts?)` — o atalho

Som + vibração do mesmo evento numa chamada. É o que as telas devem usar.

```ts
juice('lockIn');                    // call travada, lance feito, escalação confirmada
juice('reveal', { tier: 3 });       // walkout: tier 0 comum … 4 lendária/ícone
juice('timerTick', { urgent: secondsLeft <= 5 });
juice('click', { haptic: false });  // só som
```

| `SfxName`     | Quando usar                                        | Háptico      |
|---------------|----------------------------------------------------|--------------|
| `click`       | toque de UI, tick de decisão                       | `tap` (8 ms) |
| `lockIn`      | confirmação de escolha                             | 20 ms        |
| `reveal`      | pack/walkout, crescente pelo `tier` (0..4)         | pulsos por tier |
| `win`         | round/série/partida vencida                        | curto-curto-longo |
| `loss`        | derrota                                            | 60 ms        |
| `achievement` | título, carta rara, conquista (junto de `celebrate`) | fanfarra   |
| `timerTick`   | contagem regressiva; `urgent` nos últimos segundos | 6 ms         |
| `error`       | ação recusada                                      | duplo        |

Opções: `tier?: 0..4`, `urgent?: boolean`, `gain?: 0..1` (sobre o volume global),
`haptic?: boolean` (padrão `true`).

### SFX (`sfx.ts`)

- `playSfx(name, opts?) → boolean`: toca o som (true se agendou). O mesmo som não repete em
  menos de `SFX_MIN_GAP_MS` (40 ms).
- `sfxRecipe(name, opts?) → SfxVoice[]`: a receita pura (osciladores, envelope, glide).
  Para afinar um som, edite a receita; o teste `scripts/test-juice.mts` valida faixas.
- `sfxDuration(voices)`: duração em segundos, para sincronizar animação com o som
  (ex.: esperar o acorde final do reveal antes de mostrar a carta).
- `audioReady()`: já houve gesto e existe WebAudio.
- `installAudioUnlock()`: roda sozinho no import; exportado só por garantia.

### Háptico (`haptics.ts`)

- `haptic(event, tier?) → boolean`: vibra com o padrão do evento. No-op no iOS/desktop.
- `hapticPattern(event, tier?)`: padrão final (ms vibra, pausa, vibra…), sempre ímpar e
  com teto de `HAPTIC_MAX_TOTAL_MS` (400 ms).
- `HAPTIC_PATTERNS`: tabela base, fácil de afinar.
- `hapticsSupported()`: o aparelho vibra.

### Preferências (`prefs.ts`)

Uma preferência por aparelho, em `localStorage['rtm-juice-v1']` (sempre em try/catch;
se o storage falhar, vale só na sessão).

```ts
interface JuicePrefs { muted: boolean | null; volume: number; haptics: boolean | null }
// null = segue o sistema (mudo/sem vibração com reduced-motion)
```

- `soundMuted()`, `toggleMuted()`, `setMuted(b)`, `setVolume(0..1)`, `setHaptics(b)`.
- `juicePrefs.get() / .set(patch) / .subscribe(fn)`: o store (sem Zustand).
- `useJuicePrefs()`: hook React (`useSyncExternalStore`) que devolve as prefs mais
  `soundOff` e `hapticsActive` já resolvidos.
- Lógica pura exportada para teste: `loadJuicePrefs`, `saveJuicePrefs`,
  `createJuiceStore(storage)`, `isEffectivelyMuted`, `isHapticsOn`.

### `<SoundToggle />`

Botão de som global (ícone lucide `Volume2`/`VolumeX`, alvo de 44 px, `aria-pressed`,
`:focus-visible`). Ao ligar, toca um `click` de confirmação.

```tsx
<SoundToggle />                 // só ícone, com borda
<SoundToggle showLabel />       // ícone + "Som"/"Mudo"
<SoundToggle compact />         // sem borda/fundo (topo, placar)
```

Estilo em `src/lib/juice/juice.css`, só com tokens (`--c-*` com fallback para os atuais).

### `celebrate(opts?) → Promise<void>`

Burst de confete num `<canvas>` fixo (`pointer-events: none`). Um canvas e um
`requestAnimationFrame` para todos os bursts; o canvas sai do DOM quando a última
partícula morre. Resolve quando a animação acaba (ou na hora com reduced-motion).

```ts
celebrate();                                         // centro, 60% da altura
celebrate({ origin: trophyRef.current, count: 140 }); // sai do elemento
celebrate({ origin: { x: 0.5, y: 1 }, spread: 360 }); // explosão radial
```

Opções: `origin` (Element ou `{x,y}` em fração da viewport), `count` (padrão 90, teto 300),
`colors` (padrão: `--c-achievement`/`--gold`, `--gold-2`, `--c-ct`/`--blue-bright`, `--c-t`,
branco), `spread` em graus (70), `power` em px/s (900), `seed` (para screenshot estável).
`stopCelebrate()` interrompe tudo. A física (`spawnParticles`, `stepParticles`, `seededRng`)
é pura e testada.

### `withViewTransition(update, opts?) → Promise<void>`

Roda `update` dentro de `document.startViewTransition` quando existe; senão (ou com
reduced-motion), roda direto. Com React, use `flushSync` para o DOM estar pronto:

```ts
import { flushSync } from 'react-dom';
withViewTransition(() => flushSync(() => setScreen('rtp')), { className: 'vt-forward' });
```

`className` fica no `<html>` durante a transição, para CSS de direção
(`html.vt-forward::view-transition-old(root) { … }`). `viewTransitionsSupported()` diz se
o browser suporta.
