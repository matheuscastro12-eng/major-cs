I have everything needed. The investigation surfaced four spec-breaking facts that reshape the plan. Note: tasks #24-29 (OV0-OV5 "RtpShell + Scorebug") are marked completed but **no such files exist** — `RtpFrame` is the live shell. The plan accounts for this. Writing the unified plan now.

---

# ROAD TO PRO — Unified Implementation Plan (v6 cycle)

Lead-engineer plan reconciling all 5 specs against the **actual** codebase on branch `claude/quizzical-cerf-95fd88`. Read the "Ground-truth corrections" first — four spec assumptions are wrong and they change scope.

---

## 0. Ground-truth corrections (verified against the tree — DO NOT skip)

These override the specs wherever they conflict:

1. **`lucide-react@1.21.0` IS real lucide-react.** Spec #5's load-bearing claim ("almost certainly NOT real lucide, node_modules absent, build hand-rolled SVG") is **false here**. `require.resolve` succeeds, the package exposes **5951 exports**, and `Mouse, Keyboard, Monitor, Brain, Trophy, LayoutDashboard, Dumbbell, ArrowLeftRight` all exist. *However* — `RtpIcon.tsx` already exists and is the better fit (see #2). **Decision: stay hand-rolled, ignore lucide.** Not because lucide is broken, but because we already have a themed, currentColor-driven, zero-dependency set that matches the inline-SVG board/ovrring language. Spec #5's *conclusion* (hand-rolled) is right; its *reasoning* is wrong — don't repeat the "lucide is fake" rationale to anyone.

2. **`src/components/rtp/RtpIcon.tsx` already exists** (singular `RtpIcon`, not `RtpIcons`), 71 lines, **already drawn**: `energy, fitness, morale, focus, fame, money, mech, tactic, physical, demos, gym, rest, stream, social, brain, crosshair, bomb, skull, trade, spark, injury, fire, snow, career, health, personal, media, team, mouse, keyboard, monitor, headset, chair, pc, wifi, pad, trophy, calendar, chart, users, shop`. **Someone already pre-built the peripheral icons (`mouse/keyboard/monitor/headset/chair/pc/wifi/pad`), the championship icons (`trophy/calendar/chart`), and the store icon (`shop`).** This means: spec #5's "create RtpIcons.tsx + draw 22 glyphs" is mostly **already done**; spec #1/#3/#4 get their icons for free. The icon work collapses to (a) a thin React-free `RtpIconName` type module if engine files need it, and (b) the call-site emoji→`<RtpIcon>` sweep.

3. **`RtpShell` / `RtpScorebug` / `RtpRail` do NOT exist** despite tasks OV1/OV2 being marked "completed." The live shell is **`RtpFrame`** (`.rtp-bar` channel-bug + `.rtp-signal` sweep + `.rtp-body`). Every screen (`RTPCreate/RTPHub/RTPMatch/RTPTransfer`) wraps in `RtpFrame`. **Spec #3's `RtpShell` is therefore NET-NEW** and must be built on top of `RtpFrame`'s header markup, not "ported from a simplified CareerShell that we'll diff against an existing RtpShell." `CareerShell.tsx`, `DashCard.tsx`, `DashIcons.tsx` do exist and are the structural model.

4. **`tierPrize` in `matchSim.ts:266` is already subtly buggy** and the spec ladders must align to the *real* `Tier` union. The union is `'academy' | 'access' | 'challenger' | 'elite'` (league.ts:13), but `tierPrize` switches on `'elite' | 'tier1' | 'challenger' | 'academy'` — `'tier1'` and `'access'` never match, so `access` silently falls through to the `4_000` academy default. Any new prize/price table (specs #1, #4) MUST key on the real 4-member union. Flag-fix `tierPrize` opportunistically in Phase 2.

Other confirmed facts the plan relies on:
- `RTP_SAVE_VERSION = 5` (createSave.ts:23). Migrations registered `1..4` (rtpSaves.ts). `migrateRtp` loops `while (v < RTP_SAVE_VERSION && RTP_MIGRATIONS[v])`.
- `applyAction(save, kind)` — single call site: `RTPHub.doAction` (RTPHub.tsx:76).
- `weeklyTick(life, wage)` — two call sites: `advanceWeek` (weekly.ts:298) and `concludeRound` (matchSim.ts:367).
- `conditionModifiers(life)` — one call site: `prepareMatch` (matchSim.ts:145). `RTPMatch` consumes `prep.factors`, does NOT call `conditionModifiers` directly. Spec #1's "grep all callers" risk is real but small (1 site).
- `finishMatch` hardcodes `simulateSeries(rng, userTeam, oppTeam, prep.maps, 3)` (matchSim.ts:236) and `prepareMatch` generates exactly 3 maps (matchSim.ts:139).
- Career engine exports (swiss.ts): `createSwissStage, stageAdvancers, createPlayoffStage, resolveRound, userPairing, getTeam, pairingBestOf, placementCode, standings, phaseLabel`. **`userPairing`/`getTeam` key on the literal id `'user'`** in some helpers (`userMapRecord` line 209, `updateUserMapConfidence` line 226) but `userPairing`/`userTeam` themselves use `'user'` too (lines 370-375). **Our hero id is `'rtp-user'`** in league.ts but **`'rtp-hero'`** as the player and `'rtp-user'` as the team in matchSim `buildUserTeam`. This id-namespacing is the single highest-risk integration point in spec #4 (see §5, Risk R-CHAMP-1).
- `world.ts` exports `divisionPool(region, tier, season, size)`, `WorldTeam`, `startTeam`, `joinTeam`, `worldTeamById`.
- rtp.css is 1005 lines; tokens exist: `--rtp-deck/deck-2/well/line/line-hot/ink/ink-dim/ink-faint/live/live-glow/signal/signal-glow/radius`. **No `--rtp-accent/surface/gold/bad/frag`** that specs reference — those must be added or mapped to existing (`--rtp-signal` = accent, `--rtp-live` = bad/frag). **Specs reference tokens that don't exist; normalize names in Phase 0.**

---

## 1. Cross-cutting architecture decisions

### 1.1 ONE save-schema bump: v5 → v6 (all systems share it)

Four specs each independently propose "v5→v6." There is exactly **one** v6. It adds **three** optional fields and one combined migration. Minigames (spec #2) add **nothing** to the schema in the shippable phases (perf is transient) — its optional `miniBests` is deferred and, if ever built, becomes v7, never bundled here.

**New fields on `RoadToProSave` / `WorldState` (types.ts):**

```ts
// RoadToProSave gains:
setup: SetupState;        // spec #1 — REQUIRED field, backfilled (the fantasy core)
ui?: RtpUiState;          // spec #3 — OPTIONAL, defaulted at render (pure nav state)
// WorldState gains:
major?: MajorState | null; // spec #4 — OPTIONAL, null/absent between Majors
```

Rationale for required-vs-optional:
- `setup` is **required** (non-optional) so the TypeScript compiler forces every save-construction site to provide it and flags the two `weeklyTick` / one `conditionModifiers` call-site changes. The migration backfills it via a factory.
- `ui` and `major` are **optional** because they're additive UI/feature state that the runtime can default; making them required would break nothing but adds churn. `ui` defaults to `{ tab:'overview' }` at the shell; `major` is simply absent until a Major is built.

**THE single migration (`state/rtpSaves.ts`):**

```ts
// RTP_SAVE_VERSION: 5 -> 6 (createSave.ts)
// One migration covers Setup + UI + Major in a single v5→v6 step.
5: (save) => ({
  ...save,
  setup: (save as any).setup ?? STARTER_SETUP(),   // factory: fresh object (spec #1 risk)
  ui: (save as any).ui ?? { tab: 'overview', attrsOpen: false },
  // world.major stays absent (optional) — explicit no-op for clarity:
  world: { ...(save as any).world },
  _v: 6,
}),
```

- `STARTER_SETUP()` is a **factory** (returns a fresh object every call) exported from `engine/rtp/setup.ts` — NOT a shared constant — to avoid the aliasing bug where multiple migrated saves share one `gear` object and upgrades leak across saves (spec #1 risk, real).
- `createRtpSave` (createSave.ts) and `rebuildRealWorld` both initialize `setup: STARTER_SETUP()` and `ui: { tab:'overview', attrsOpen:false }`.
- `rtpSummary()` unaffected (no new summary fields needed).

### 1.2 ONE shared shell hosts everything: `RtpShell` (spec #3) is the backbone

`RtpShell` is built **first** (Phase 1) because every other system needs a home:
- Setup store (spec #1) → **Training/Setup tab**
- Minigames (spec #2) → launched from the **Training tab** action grid (modal overlay, not a tab)
- Championship (spec #4) → its own **full-screen view** above the shell (like the match view), reached from the **League tab** ("you qualified" CTA) — it is NOT a tab, it's a season-climax takeover, mirroring how `RTPMatch` takes over.

Coexistence model:
```
RoadToPro (orchestrator, owns save + view routing)
├─ view: 'create'  → RTPCreate            (RtpFrame)
├─ view: 'match'   → RTPMatch             (RtpFrame)   [mode: 'league' | 'major']
├─ view: 'major'   → RTPMajor             (RtpFrame)   [NEW — spec #4]
├─ view: 'transfer'→ RTPTransfer          (RtpFrame)
└─ view: 'hub'     → RTPHub → RtpShell (tabbed)        [NEW shell — spec #3]
                      ├─ tab 'overview' → RtpOverview
                      ├─ tab 'training' → RtpTraining → MiniGameModal overlay (spec #2)
                      │                                → RtpSetup section/subtab (spec #1)
                      ├─ tab 'league'   → RtpLeague   → "Classificou-se" CTA → view:'major'
                      ├─ tab 'market'   → RtpMarket
                      └─ tab 'profile'  → RtpProfile
   (LifeEventModal mounts at RTPHub-dispatcher level, auto-opens over any tab)
```

**Tab set (5):** Overview · Training · League · Market · Profile. **Setup (spec #1) lives INSIDE the Training tab** as a second section (or pill-toggle "Treino | Setup"), NOT as a 6th top-level tab — the user asked for career-parity nav and career groups related concerns; training-and-gear are one concern ("how you get better off-server"). This keeps the strip to 5 and avoids horizontal crowding on mobile.

### 1.3 Icons: the cross-cutting FIRST step is mostly a sweep, not a build

Because `RtpIcon.tsx` already exists with the full glyph set, the "icon system" cross-cut reduces to:
1. Add a **React-free `RtpIconName` re-export module** (`engine/rtp/icons.ts`) **only if** engine metadata needs to hold icon ids. Decision: **engine files keep emoji-free *string* ids that happen to match `RtpIconName`, but we do NOT import the type into the engine** unless trivial. Simplest: change `ActionMeta.icon`, `CATEGORY_META.icon`, `ArchetypeDef.icon` from `string` to `RtpIconName` by importing the type from the **component** file is forbidden (React cycle). So: **move the `RtpIconName` union into `engine/rtp/icons.ts` (React-free), and have `RtpIcon.tsx` import the type from there.** Then engine files `import type { RtpIconName } from './icons'`. This is the one genuinely-new icon file.
2. Sweep ~28 emoji literals across 7 components to `<RtpIcon name=… />`.
3. The `.rtp-action-icon` / `.rtp-arch-icon` CSS must flip from `font-size` to `color: var(--rtp-signal)` **in the same commit** as each render swap (else SVG renders at default size).

This is Phase 0 — it ships visible polish immediately and de-risks every later screen (Setup/Major reuse the same icons).

---

## 2. Phase order (each phase a shippable slice; recommended build order)

The ordering optimizes for **visible progress early**, **schema stability**, and **dependency flow** (shell before things that live in it; icons before screens that use them).

| Phase | Slice | Ships | Schema | Risk |
|---|---|---|---|---|
| **P0** | **Icon sweep + token normalize** | Zero-emoji RTP, premium token layer | none | low |
| **P1** | **Tabbed shell (`RtpShell`)** | Career-style tabs; long scroll → 5 panels | none (local tab state) | low |
| **P2** | **Setup engine + store (gear)** | Buy peripherals; training/match get stronger | **v6** (setup+ui+major fields, one migration) | med |
| **P3** | **Psychologist track** | Hire psych; tilt-resist, recovery, retainer | (uses v6) | low |
| **P4** | **Minigames (1 → 5)** | Skill-gated training; perf multiplier | none | med |
| **P5** | **Championship (Swiss → playoffs)** | Qualify → real Major bracket through Round Room | (uses v6 `major`) | **high** |
| **P6** | **Polish pass** | Bracket SVG, gold burst, tab persistence, alert dots, pips | (persist `ui.tab` already in v6) | low |

**Why this order:**
- **P0 first** — pure win, no dependencies, kills the "vibecoding" complaint the user explicitly raised, and every later screen inherits clean icons.
- **P1 before P2** — Setup needs a home; building the shell first means the store drops into a real tab instead of a temporary scroll section that gets moved later (avoids rework the specs themselves flag as "Slice 4: move when tabs land").
- **P2 bundles the v6 bump** — do the schema migration **once**, carrying `setup` + `ui` + `major` fields together even though `ui` is consumed by P1 (held in local state until P2) and `major` not until P5. One migration, one version, no churn. P1 ships with **local** `useState` tab; P2 flips it to persisted `save.ui.tab`.
- **P3 after P2** — psychologist is an additive track on the same `SetupState`; ship gear first (the bigger fantasy), then mental.
- **P4 independent** — minigames touch only `applyAction` + `RtpTraining`; no schema. Slot anywhere after P1, but placed here so the Training tab (P1) and Setup (P2) are already there to host the "playable" badges and so perf tuning happens against the gear-modified XP budget.
- **P5 last of the features** — highest risk (id-namespacing, bestOf plumbing, deferred transfers). Build on a stable v6 + shell.
- **P6** — cosmetic, can interleave.

---

## 3. SPEC #1 — Peripherals + Psychologist (Phase 2 + Phase 3)

### 3.1 Files
- **NEW** `src/engine/rtp/setup.ts` — data + formulas + actions (pure, no React).
- **EDIT** `src/engine/rtp/types.ts` — `PeripheralSlot`, `GearTier`, `SetupState`, `PsychTierDef`-shaped types; `setup: SetupState` on `RoadToProSave`.
- **EDIT** `src/engine/rtp/createSave.ts` — `RTP_SAVE_VERSION = 6`; init `setup` in `createRtpSave` + `rebuildRealWorld`; re-export `STARTER_SETUP`.
- **EDIT** `src/engine/rtp/weekly.ts` — thread setup mods into `applyTraining`/`applyAction`; `weeklyTick(life, wage, setup)`; update `advanceWeek` call site; add `psychRetainer` to `WeekSummary`.
- **EDIT** `src/engine/rtp/matchSim.ts` — `conditionModifiers(life, setup)`; `prepareMatch` passes `save.setup`; `applyMatchOutcome` applies `tiltResist`; `concludeRound` `weeklyTick` call site.
- **EDIT** `src/state/rtpSaves.ts` — the combined v5→v6 migration (§1.1).
- **NEW** `src/components/rtp/RtpSetup.tsx` — gear grid + psych card + upgrade flow (lives in Training tab).
- **EDIT** `src/components/rtp/RtpTraining.tsx` (created in P1) — host RtpSetup section.
- **EDIT** `src/styles/rtp.css` — `.rtp-setup-grid`, `.rtp-gear-card`, `.rtp-tier-pips`, `.rtp-psych-card`, upgrade-button states.

### 3.2 Data model (types.ts)

```ts
export type PeripheralSlot =
  | 'mouse' | 'keyboard' | 'monitor' | 'headset'
  | 'mousepad' | 'chair' | 'pc' | 'internet';
export type GearTier = 0 | 1 | 2 | 3 | 4;

export interface SetupState {
  gear: Record<PeripheralSlot, GearTier>;
  psychTier: GearTier;        // 0 = none
}
```

`PeripheralSlot` → `RtpIcon` name map (icons ALREADY exist): `mouse→mouse, keyboard→keyboard, monitor→monitor, headset→headset, mousepad→pad, chair→chair, pc→pc, internet→wifi`. No new glyphs needed.

### 3.3 Static data + formulas (setup.ts)

Static defs live in `setup.ts`, **only chosen tiers persist**. Two definition tables (`PERIPHERALS: PeripheralDef[]` ×8, `PSYCH_TIERS: PsychTierDef[]` ×5) plus the factory and the two public helpers.

**Key contract — the two pure helpers weekly/match consume:**
```ts
export function setupTrainingMods(setup: SetupState): {
  trainScale: number;                     // KEEP = 1 (route all effect through catBonus — anti-double-dip)
  catBonus: Record<TrainFocus, number>;   // additive fraction per category
};
export function setupConditionMods(setup: SetupState): {
  factors: ConditionFactor[];             // gear/psych rows for the condition panel
  recoveryBonus: number;                  // added to weekly morale/focus drift
  tiltResist: number;                      // 0..1 (psych)
};
```

**Cumulative rule:** tiers are incremental — owning tier 3 = sum of tier 1+2+3 effects. For each slot, sum `trainCat`/`matchPct` over tiers `1..current`. `matchPct` on **tier 0** carries the negative "sucata" penalty (only applied while still at tier 0).

**Balance (from spec, validated against `tierPrize`/condition clamp):**
- Prices geometric per slot: T1 ~R$3k, T2 ~R$10k, T3 ~R$35k, T4 ~R$120k (tracks the `tierPrize` ladder of 4k→12k→45k→120k once `tierPrize` is fixed to the real union).
- Per-tier match bonus +1..+2; **full elite setup ≈ +0.06 mod** (sits under the condition ceiling alongside life factors).
- Tier-0 penalties total **≈ −6 mod** so the boot really feels rough.
- `trainScale = 1` always; **all** training effect flows through `catBonus` (anti-double-dip — the explicit spec risk). Mouse→mechanical, chair/pc→physical, monitor/headset→mechanical+mental small, internet→match-only (lag).
- Psych contributes **nothing** to training (`catBonus` untouched); it only feeds `setupConditionMods`.

**Psych tier shape:**
```ts
export interface PsychTierDef {
  tier: GearTier;
  label: string;          // 'Sem psicólogo' … 'Psicólogo de elite'
  buyPrice: number;       // one-time upgrade cost
  retainer: number;       // R$/week debited in weeklyTick
  tiltResist: number;     // 0..1 — softens post-loss morale hit
  recovery: number;       // +morale/focus weekly drift
  matchPct: number;       // 'Composto' condition factor
}
```
`PSYCH_TIERS[0]` MUST be a real no-op (retainer 0, tiltResist 0, recovery 0, matchPct 0) and the array index MUST be guarded so an out-of-range `psychTier` never crashes `weeklyTick` (spec risk, real).

**Store actions (pure, immutable, no rng/tick bump, no action consumed):**
```ts
export function buyGear(save, slot): { ok; save; reason?; feedback? };  // money ok? tier<4? → debit price, +1 tier
export function hirePsych(save): { ok; save; reason?; feedback? };      // psychTier<4? → debit buyPrice, +1 tier
```

### 3.4 Integration points (exact edits)

**weekly.ts — `applyTraining` gains `setupMods`:**
```ts
function applyTraining(player, focus, energy, relCoach, scale = 1, setupMods?) {
  const sm = setupMods ?? { trainScale: 1, catBonus: { mechanical:0, mental:0, physical:0 } };
  const total = BASE_TRAIN_XP * scale * energyFactor(energy) * ageFactor(player.age)
              * coachFactor * persFactor * sm.trainScale * (1 + sm.catBonus[focus]);
  // …rest unchanged…
}
```
In `applyAction`: compute `const sm = setupTrainingMods(save.setup);` once; pass to the `train:` branch AND the `demos` branch (`0.4` base, sm threaded). Add a feedback line `Setup: +12% mecânica` when `sm.catBonus[focus] !== 0`.

**weekly.ts — `weeklyTick(life, wage, setup)`** (signature change → compiler flags both call sites; intentional per spec risk):
```ts
export function weeklyTick(life, wage, setup) {
  const { recoveryBonus } = setupConditionMods(setup);
  const psych = PSYCH_TIERS[setup.psychTier] ?? PSYCH_TIERS[0];   // guarded
  // …injury decay unchanged…
  morale: clamp(life.morale + Math.round((60 - life.morale)*0.2) + recoveryBonus, 0, 100),
  focus:  clamp(life.focus  + Math.round((65 - life.focus )*0.2) + recoveryBonus, 0, 100),
  money:  life.money + wage - LIVING_COST - psych.retainer,
  // …
}
```
Update `advanceWeek` (weekly.ts:298) → `weeklyTick(save.life, wage, save.setup)`. Add `psychRetainer: psych.retainer` to `WeekSummary`.

**matchSim.ts — `conditionModifiers(life, setup)`** (1 call site):
```ts
export function conditionModifiers(life, setup): { mod; factors } {
  // …existing life factors unchanged…
  const sm = setupConditionMods(setup);
  for (const f of sm.factors) { mod += f.delta/100; factors.push(f); }
  return { mod: clamp(mod, 0.78, 1.18), factors };   // ceiling 1.12 → 1.18 (room for gear)
}
```
Update `prepareMatch` (matchSim.ts:145) → `conditionModifiers(save.life, save.setup)`. Update `concludeRound` (matchSim.ts:367) → `weeklyTick(save.life, wage, save.setup)`.

> ⚠️ **Ceiling widening 1.12→1.18 buffs ALL life factors at the top, not just gear.** Verify matches don't become trivially easy; if they do, **scale gear `matchPct` down rather than raising the ceiling further** (spec risk, honored). The default-param safety net: give `conditionModifiers`'s `setup` a `= STARTER_SETUP()` default so any missed caller stays backward-safe.

**matchSim.ts — tilt in `applyMatchOutcome`** (line ~283):
```ts
const { tiltResist } = setupConditionMods(save.setup);
const rawMorale = (won ? 6 : -6) + (rating>1.3?3: rating<0.8?-3:0);
const moraleDelta = rawMorale < 0 ? Math.round(rawMorale * (1 - tiltResist)) : rawMorale;
```

### 3.5 UI (RtpSetup.tsx)
Header strip: "SETUP" + money chip (`.rtp-moneychip`, RtpIcon `money`) + aggregate "Nível de setup" = Σ gear tiers + psychTier (0–36) as a thin segmented bar (`--rtp-signal` on `--rtp-line`). Gear grid: `repeat(auto-fill, minmax(220px,1fr))`, one card/slot — RtpIcon + label + 5-dot tier pips (filled `--rtp-signal`, empty `--rtp-line`) + two effect chips (training/match, computed cumulative; tier-0 negatives in `--rtp-live`) + NEXT-tier preview + "Upgrade — R$ X" button (disabled when `money < price` or tier 4 → "Máximo"; delta shown inline). Psych card: full-width, `--rtp-signal` left border, RtpIcon `brain`, 3 stat meters, retainer line, Contratar/Upgrade CTA. Buying never costs a weekly action. On `ok` → `onUpdate(save)` + flash `.rtp-feedback` toast; on fail → note.

### 3.6 Phase split
- **P2 (gear):** types + setup.ts (gear only) + createSave + the **whole v6 migration** + wire `setupTrainingMods`/`conditionModifiers` + RtpSetup gear grid. Delivers the full "buy gear, get stronger" fantasy.
- **P3 (psych):** psych retainer in `weeklyTick`, `tiltResist` in `applyMatchOutcome`, psych card + `psychRetainer` in WeekSummary toast.
- **P6 (polish):** pips, level bar, button glow, gear rows already flow into the existing `prep.factors` panel in RTPMatch (free).

---

## 4. SPEC #2 — Minigame-gated actions (Phase 4)

### 4.1 Files
- **NEW** `src/engine/rtp/minigames.ts` — `MiniResult`/`MiniGameDef`/`MiniGameId` types, `ACTION_GAME` registry, `scoreToPerf` curves, seed helper (mirrors `actionRng`), `AUTO_PERF = 0.85`. Pure, no React.
- **NEW** `src/components/rtp/MiniGameModal.tsx` — overlay shell (3-2-1 gate → arena → result band with perf ring → Aplicar/Cancelar); dispatches by `MiniGameId`.
- **NEW** `src/components/rtp/minigames/{CrosshairFlick,ReactionGate,SprayTracer,CalloutMemory,TempoLock}.tsx`.
- **EDIT** `src/engine/rtp/weekly.ts` — `applyAction(save, kind, perf = 1.0)`; thread perf into `applyTraining` scale (train:* and demos) and into gym/demos life deltas; optional `game?: MiniGameId` on `ActionMeta`.
- **EDIT** `src/components/rtp/RtpTraining.tsx` — `doAction` opens `MiniGameModal` for game-gated kinds, passes resulting `perf`; instant kinds unchanged.
- **EDIT** `src/styles/rtp.css` — `.rtp-mini-*` (overlay, arena, countdown, result-ring reuse, scanline), `prefers-reduced-motion` + `pointer:coarse` guards.

### 4.2 Mechanic
`applyAction` gains optional `perf = 1.0` (default preserves backward-compat + auto-sim). For game-gated kinds, the click opens a modal; on finish the modal calls back with `perf` (0..1) → `applyAction(save, kind, perf)`. `perf` flows into the **existing `scale` slot** of `applyTraining` — `perf=0.5` halves the session XP budget; **nothing else in the math changes**, the hidden `potential` cap is untouched, so good play just fills XP toward the same ceiling faster (realistic per spec).

- `train:mechanical→flick · train:mental→tempo · train:physical→reaction · gym→spray · demos→memory`. `rest/social/stream → NO game` (instant; resting through a puzzle is anti-fun).
- `demos` MUST **multiply** the existing `0.4` base: `applyTraining(player,'mental',energy,coach, 0.4 * perf)` (spec risk — replacing makes mental-via-demos far too strong).
- `gym`/`demos` life deltas scale by perf: e.g. `fitness: clamp(life.fitness + Math.round(9*(0.55+0.45*perf)),0,100)`; energy cost stays flat ("good minigame = full gain, bad = partial").
- `scoreToPerf` curves with FLOORS (a consumed action is never worthless) + ceiling 1.0: flick `0.45+0.55·raw`, reaction `0.50+0.50·raw`, spray `0.40+0.60·raw`, memory `0.45+0.55·raw`, tempo `0.45+0.55·raw`.
- `AUTO_PERF = 0.85` passed by every no-game path (auto-sim, "Simular") → small opportunity cost for skipping play, keeps auto deterministic.

**Determinism:** layout seed `(save.rng.seed ^ (save.rng.tick * 0x9e3779b1)) >>> 0` (identical to `actionRng`) — layouts reproducible, but the **score is live input**, so the loop is intentionally no longer fully seed-reproducible on manual play. Auto-sim stays on the `AUTO_PERF` branch → deterministic.

**The 5 games** (320px arena, rAF, cleanup on unmount, hard time-cap force-resolve, always-available Cancel that consumes NO action): Crosshair Flick (8 seeded targets, speed×accuracy, ~10s) · Reaction Gate (5 red→green rounds, early=0, ~8s) · Spray Tracer (track a recoil polyline 4s, ~5s) · Callout Memory (Simon 3×3, 4–6 seq, ~12s) · Tempo Lock (sweeping bar into shrinking zone ×4, ~8s). Icons via RtpIcon: `crosshair, spark, physical, brain, focus`. `@media(pointer:coarse)` enlarges hitboxes (mobile fairness); `prefers-reduced-motion` shortens animation, never blocks input.

### 4.3 Phase split
- **P4.1:** minigames.ts (types + registry with ONLY `flick`) + MiniGameModal shell + CrosshairFlick + `applyAction` perf param + RtpTraining modal for `train:mechanical` only. Proves the whole pipeline with one game, zero schema risk.
- **P4.2:** ReactionGate (physical) + TempoLock (mental) → all three core train actions; add `AUTO_PERF` on auto/simular paths.
- **P4.3:** SprayTracer (gym) + CalloutMemory (demos). All five non-passive actions gated.
- **(deferred, optional v7):** persist `miniBests` + personal-best chips + "playable" badge.

---

## 5. SPEC #4 — Championship import (Phase 5)

### 5.1 Files
- **NEW** `src/engine/rtp/major.ts` — `buildMajor`, `worldTeamToTTeam` adapter, `prepareMajorMatch`, `concludeMajorRound`, `majorQualified`, `majorPlacement`, PRIZE/FAME tables.
- **EDIT** `src/engine/rtp/types.ts` — `MajorState`, `MajorPlacementCode`; `major?: MajorState|null` on `WorldState`.
- **EDIT** `src/engine/rtp/matchSim.ts` — generalize `prepareMatch`/`finishMatch` to honor explicit `{opp, maps, bestOf}`; export refactored `worldTeamToTTeam` (from `buildOppTeam` body); add `bestOf` to `MatchPrep`; insert Major-qualification branch in `concludeRound`.
- **EDIT** `src/engine/rtp/createSave.ts` — (version already 6 from P2).
- **EDIT** `src/state/rtpSaves.ts` — (`major` already covered by the combined v6 migration; nothing to add).
- **NEW** `src/components/rtp/RTPMajor.tsx` — bracket/standings + next-series CTA + result screen.
- **EDIT** `src/components/rtp/RTPMatch.tsx` — `mode: 'league' | 'major'` prop selecting prepare/conclude pair; thread `bestOf`.
- **EDIT** `src/components/rtp/RoadToPro.tsx` — route to RTPMajor when `world.major && !resolved`; wire major match mode; clear `world.major` on dismiss then proceed to transfers.
- **EDIT** `src/styles/rtp.css` — `rtp-br-*` bracket classes (ported from career `hb-*`/`gsl-bracket`) using `--rtp-*`.

### 5.2 Reuse the career Swiss engine (all functions verified present)
Build a **16-team Swiss stage** (`createSwissStage`, `stageOnly`) → 8 advance (`stageAdvancers`, has the ≥8 defensive pad) → **Champions Stage** `createPlayoffStage(seeds8)` (QF MD3 → SF MD3 → Final MD5). Your pairing is played through the existing Round Room; all others resolve via `resolveRound` (which calls `simulateAiSeries` and skips pairings that already have a `result` — line 303 `if (!p.result)`).

**`MajorState`:**
```ts
export type MajorPlacementCode = 'champion'|'runnerup'|'semi'|'quarters'|'top8'|'swiss';
export interface MajorState {
  name: string; edition: number; tier: Tier;
  tournament: Tournament;                  // career engine state (src/types.ts)
  phaseStage: 'swiss'|'playoffs';
  userTeamId: string;                       // see R-CHAMP-1
  history: { phase: string; pairing: Pairing }[];
  resolved?: { placement: MajorPlacementCode; prize: number; fameDelta: number; trophy?: string };
}
```

**Entry gate** (`concludeRound`, matchSim.ts, BEFORE rebuilding next league): `majorQualified(ev, tier)` where `MAJOR_CUT = { academy:1, access:2, challenger:3, elite:4 }`. When qualified → set `world.major = buildMajor(...)` and **DEFER `pendingOffers`** until the Major resolves (so the climax isn't interrupted). `concludeMajorRound` writes the transfer window on resolution. `seasonEnd` still fires for the banner; the orchestrator routes to RTPMajor when `world.major && !resolved`.

**Prize/fame (RTP-local, keyed on the real 4-member union):**
```ts
const PRIZE_BY_TIER: Record<Tier, number> = { academy:20_000, access:60_000, challenger:180_000, elite:600_000 };
const PRIZE_FRAC: Record<MajorPlacementCode,number> = { champion:1, runnerup:.55, semi:.32, quarters:.18, top8:.10, swiss:.04 };
const FAME_BY_PLACE: Record<MajorPlacementCode,number> = { champion:18, runnerup:11, semi:7, quarters:4, top8:2, swiss:1 };
```

**`prepareMajorMatch`/`concludeMajorRound`** parallel the league pair: find `userPairing(t)`, opponent `getTeam`, `bestOf = pairingBestOf(t, up)`, reuse condition/effAttrs/moments. Generalize `finishMatch` to `simulateSeries(rng, userTeam, oppTeam, prep.maps, prep.bestOf ?? 3)` and generate `prep.maps.length === bestOf`. After the user's series, write `up.result = mr.series`, call `resolveRound(t, rng)`, then handle: stage `done` + hero advanced → `createPlayoffStage(stageAdvancers(t))`; hero eliminated or playoffs `done` → compute `majorPlacement`, set `resolved`, apply money/fame, push trophy/award, **then** open deferred transfers.

### 5.3 The critical risk: hero id-namespacing (R-CHAMP-1)
The career Swiss helpers `userPairing`/`userTeam` and the confidence/record helpers key on the literal id **`'user'`** (swiss.ts:209,226,370,374). RTP uses **`'rtp-user'`** (team) and **`'rtp-hero'`** (player). **The hero team inside the Major `Tournament` MUST use whatever id `userPairing`/`resolveRound`/`stageAdvancers` expect.** Two safe options:
- **(A, recommended)** Set the hero `TTeam.id = 'user'` *inside the Major tournament only* (it's a self-contained `Tournament` object, never mixed with the league's `'rtp-user'`). Then `userPairing(t)`/`userTeam(t)` work unchanged. `MajorState.userTeamId = 'user'`. The 15 rivals keep their real `WorldTeam` ids (filter out `save.team.realTeamId`, dedupe ids before `createSwissStage`).
- **(B)** Pass an explicit id everywhere instead of relying on `userPairing`. More invasive.

Choose **(A)**. Document it loudly in `major.ts` — this is the single thing most likely to silently break (`userPairing` returns `undefined` → "JOGAR" never appears → Major soft-locks).

### 5.4 Other championship risks (all real, mitigations honored)
- **bestOf plumbing** — `finishMatch` hardcodes `,3)` and `prepareMatch` makes exactly 3 maps. Thread `bestOf` through BOTH map generation AND `simulateSeries` or score/scoreboard desync.
- **Determinism on `resolveRound`** — career `resolveRound` mutates the Tournament in place; RTP persists it as JSON each step (fine), but the per-AI-resolve rng MUST be derived from stable inputs (`season + swissRound`), NOT `rng.tick`, or F5/re-render re-rolls.
- **placementCode label-matching** — `placementCode` matches PT history strings (`'GRANDE FINAL'`,`'Semifinal'`,`'Quartas de final'`) produced by `phaseLabel`. Reuse `phaseLabel` UNCHANGED; do not translate, or placement silently returns `'swiss'`. Map career `'playoffs'` code → RTP `'top8'`.
- **Thin field** — `divisionPool` may yield <15 rivals in a thin region/tier; it min-clamps to 4. Prefer the existing padding path / cross-region fillers to reach ~16; `createSwissStage` tolerates odd counts (leftover-pairing logic).
- **Auto-sim of YOUR Major series** — "Simular" must still call `finishMatch` with `[]` outcomes to write a `SeriesResult` onto the pairing BEFORE `resolveRound` (mirror `autoSimAndConclude`), or the bracket won't advance.
- **Transfer-window timing** — ensure `concludeRound` does NOT write `pendingOffers` when a Major is created; only `concludeMajorRound` writes them on resolution, else offers fire mid-Major or get lost.

### 5.5 UI (RTPMajor.tsx, RtpFrame-wrapped, `--rtp-*`)
Header: Major name + edition + stage chip ("FASE SUÍÇA · você 2–0" / "CHAMPIONS STAGE · Quartas") + tier badge + prize pool. "YOUR NEXT SERIES" CTA (when `userPairing` unresolved): opponent `TeamBadge` + `bestOf` pill + record context + `JOGAR` (RtpIcon, NOT ▶) + `Simular` ghost. Bracket body — two modes: **Swiss** → record-grouped ladder reusing `.rtp-table` (from `standings(t)`), hero row `.me`; **Playoffs** → left→right column bracket (`rtp-br-*` ported from career `hb-*`), each cell = `RtpBrCell` (two team rows, clickable→`Scoreboard` when `result`), hero `.is-user`, Final larger with "GRANDE FINAL · MD5". Stage progress = 4-pip stepper (Suíça→Quartas→Semi→Final). Result screen: champion gold burst (`--rtp-gold` — add token), placement + prize + fame, "Continuar" → transfers/hub. Icons: `trophy, calendar, chart, crosshair` (all already in RtpIcon).

### 5.6 Phase split
- **P5.1:** `major.ts` (Swiss-only, 16 teams) + `worldTeamToTTeam` + `prepareMajorMatch` + `concludeMajorRound` resolving at top8/swiss WITHOUT playoffs + types + RoadToPro routing + RTPMatch `mode` prop + minimal RTPMajor (Swiss ladder + CTA + auto-sim fallback). Delivers "qualify → real 16-team Swiss through Round Room → prize/fame." Verify a full Swiss runs deterministically and ends.
- **P5.2:** playoffs (`createPlayoffStage`, QF/SF/Final MD5), column bracket UI, placement champion/runnerup/semi/quarters, trophy result, deferred transfers.
- **P5.3 (→P6):** lucide-free icon pass (already covered), SVG connectors, stepper, completed-AI rail, gold burst.

---

## 6. SPEC #3 — Tabbed shell (Phase 1, persistence in Phase 2)

### 6.1 Files
- **NEW** `src/components/rtp/RtpShell.tsx` — header (reuse `RtpFrame`'s `.rtp-bar` markup) + `.rtp-tabs` strip + keyed `.rtp-body`. Props `{ active, onTab, alerts, onExit, money, fame, streak, children }`.
- **REWRITE** `src/components/rtp/RTPHub.tsx` → ~40-line dispatcher: mounts RtpShell + 5 panels + global `LifeEventModal`; computes `alerts` + `setTab`.
- **NEW** `RtpOverview.tsx` — dossier + HUD + injury banner + notice + next-match card (extracted from RTPHub).
- **NEW** `RtpTraining.tsx` — action grid + actionsLeft + feedback + Atributos + `AttrRow` (owns `applyAction` + local `feedback/note/showAttrs`); **also hosts RtpSetup (P2) and launches MiniGameModal (P4)**.
- **NEW** `RtpLeague.tsx` — standings + per-round fixtures + **"Classificou-se para o Major" CTA** (P5 entry).
- **NEW** `RtpMarket.tsx` — contract summary + pending-offer entry point + window status.
- **NEW** `RtpProfile.tsx` — bio + `CareerLog` stats + trophies/awards + sponsors + footer danger actions.
- **EDIT** `types.ts` — `RtpTabId` + `RtpUiState`; `ui?: RtpUiState` on `RoadToProSave` (field added in the P2 v6 bump).
- **EDIT** `createSave.ts` — `ui: { tab:'overview', attrsOpen:false }` initial.
- **EDIT** `rtpSaves.ts` — (`ui` covered by combined v6 migration).
- **EDIT** `rtp.css` — `.rtp-tabs/.rtp-tab/.rtp-tab[data-on]/.rtp-tab-alert`; sticky + scroll-snap mobile; reuse `tab-fade`.

### 6.2 Shape
```ts
export type RtpTabId = 'overview' | 'training' | 'league' | 'market' | 'profile';
export interface RtpUiState { tab: RtpTabId; attrsOpen?: boolean; }
```
Single-level nav (RTP has fewer sections than career — **drop** the `DashNavGroup` dropdown/portal/`useLayoutEffect` rect math; a flat `tabs.map(...)` suffices). Tab icons (RtpIcon — names exist or map): `overview→chart` (or add a `grid`/dashboard glyph), `training→gym`, `league→trophy`, `market→trade`, `profile→users`. Active tab gets `--rtp-signal` underline + `--rtp-signal-glow`; inactive `--rtp-ink-dim`; alert dot = 8px `--rtp-live`. Strip sticky under `.rtp-bar`, `overflow-x:auto` + scroll-snap on mobile. Body `key={ui.tab}` → `tab-fade`.

Alerts derived inline (never persisted): `overview: !!life.flags.injured`, `training: world.actionsLeft > 0`, `market: (world.pendingOffers ?? []).length > 0`, others false.

### 6.3 Critical correctness notes
- **LifeEventModal mounts at the RTPHub-dispatcher level** (over any tab), NOT inside a panel, or it stops auto-opening off the Overview tab.
- Moving the action grid into `RtpTraining` moves `feedback/note/showAttrs` local state with it (last-action feedback resets when leaving/returning Training — acceptable, confirm intended).
- Every read of `save.ui.tab` MUST be guarded (`save.ui ?? { tab:'overview' }`) for pre-migration v5 saves; centralize the default in RtpShell/RTPHub.

### 6.4 Phase split
- **P1:** RtpShell + dispatcher + extract 5 panels, `ui.tab` in **local useState** (no save change), default 'overview'. Add `.rtp-tabs` CSS. Reversible; delivers the full tabbed UX. Verify all 5 tabs render the old scroll content, match CTA works on Overview, training spends actions, life-event modal auto-opens.
- **P2 (bundled with the v6 bump):** flip to persisted `save.ui.tab` + `onUpdate`. **Mitigation for save-write-per-tab-switch:** route pure nav writes through a `setSave`-only path that skips the cloud push (don't `saveRtp` on every tab click — update local state + a debounced/local-only persist). Verify reload returns to last tab and v5 saves load clean.
- **P6:** per-round fixtures detail, Market contract/offer panel, Profile stats/trophies, alert dots.

---

## 7. SPEC #5 — Icons + polish (Phase 0, mostly a sweep)

### 7.1 What's already done vs. what's left
- **DONE:** `RtpIcon.tsx` exists with 41 themed glyphs (incl. all peripheral + championship + store icons). **No new glyph geometry needed for any system** except possibly an `overview`/dashboard glyph for the tab strip (reuse `chart` or add one 3-line path).
- **LEFT:** (a) extract `RtpIconName` into React-free `engine/rtp/icons.ts` and re-import it in `RtpIcon.tsx`; (b) sweep emoji literals; (c) token/polish layer.

### 7.2 Files
- **NEW** `src/engine/rtp/icons.ts` — `export type RtpIconName = …` (moved out of RtpIcon.tsx; React-free seam).
- **EDIT** `src/components/rtp/RtpIcon.tsx` — `import type { RtpIconName } from '../../engine/rtp/icons'`.
- **EDIT engine metadata** (type only, `import type`): `weekly.ts` `ActionMeta.icon: RtpIconName` (8 ids: `mech/brain or tactic/physical/demos/gym/rest/stream/social`); `lifeEvents.ts` `CATEGORY_META.icon` (6: `career/health/personal/media/team/money`); `createSave.ts` `ArchetypeDef.icon` (4: aimstar→`crosshair`, tactician→`brain`, clutchgod→`snow`, allrounder→a balance glyph — reuse `focus` or add); `moments.ts` strip trailing emoji from the narrative string.
- **EDIT components — the sweep** (counts verified): `RTPHub.tsx` (12 lines: 5 METERS, money chip, form 🔥/❄️, injury 🩹, notice ✕, → / ← chevrons, self-marker), `RtpSituationBoard.tsx` (3: `BUY_GLYPH` 🔫/🔧/🎯 → `bomb/…/crosshair`; the two in-`<svg>` dead-X `<text>✕</text>` → inline `<path>` cross helper, NOT an HTML `<RtpIcon>` — they're inside SVG), `RtpRoundRoom.tsx` (2: killfeed 🎯/✦/⇄ → `crosshair/spark/trade`, next chevron), `LifeEventModal.tsx` (1), `RTPMatch.tsx` (3: ★ MVP → `fame` filled, chevrons), `RoadToPro.tsx` (4: 🏆/⬆️/⬇️/🎉 → `trophy` + up/down — note `IconTriangleUp/Down` live in career `DashIcons`), `RTPTransfer.tsx` (3: 💰→`money`, ↑, chevron).
- **EDIT** `rtp.css` — token layer + the two icon-class flips + focus ring + lift utility.

### 7.3 Hard ordering constraint
`.rtp-action-icon` and `.rtp-arch-icon` currently set `font-size` (emoji sizing). They MUST flip to `color: var(--rtp-signal)` **in the same commit** as the corresponding render swap, or the new SVG ignores `font-size` and renders at its default 18.

### 7.4 Polish token layer (add to `.rtp{}` after `--rtp-radius`)
Spacing `--rtp-s1..s6: 4/8/12/16/22/32`; radius `--rtp-r-sm/r/r-lg: 6/10/14`; elevation `--rtp-e1/e2/e3`; **add the missing tokens specs reference**: `--rtp-accent: var(--rtp-signal)`, `--rtp-bad/frag: var(--rtp-live)`, `--rtp-gold: #d9b84a` (champion burst), `--rtp-surface: var(--rtp-well)`. **Focus ring (currently MISSING — a11y gap):** `.rtp :is(button,[role=button],input,select):focus-visible{outline:2px solid var(--rtp-signal);outline-offset:2px}` and convert the bare `:focus{outline:none}` (rtp.css ~L182) to `:focus-visible`. Motion `--rtp-dur:.16s; --rtp-ease:cubic-bezier(.2,.7,.2,1)`; `.rtp-lift` hover-translate on `.rtp-action/.rtp-opt/.rtp-moment-opt/.rtp-arch/.rtp-offer`. Panel tiers: well (inset, `--rtp-well`) vs deck (raised, `--rtp-deck`, e1/e2).

### 7.5 Phase split
P0 ships it all (it's the "premium feel" down payment the user asked for). Acceptance: `grep -P '[emoji ranges]' src/components/rtp src/engine/rtp` returns only comment lines.

---

## 8. Consolidated cross-system checklist (the v6 bump, in one place)

When P2 lands, in a single coherent change:
1. `types.ts`: add `PeripheralSlot/GearTier/SetupState/PsychTierDef`, `RtpTabId/RtpUiState`, `MajorState/MajorPlacementCode`; add `setup: SetupState` (required), `ui?: RtpUiState` (optional) to `RoadToProSave`; `major?: MajorState|null` (optional) to `WorldState`.
2. `createSave.ts`: `RTP_SAVE_VERSION = 6`; `createRtpSave` + `rebuildRealWorld` init `setup: STARTER_SETUP()` and `ui: { tab:'overview', attrsOpen:false }`; re-export `STARTER_SETUP`. **Fix `tierPrize` union** (`'tier1'`→`'elite'` already there; add `access`).
3. `rtpSaves.ts`: register the ONE `RTP_MIGRATIONS[5]` from §1.1 (backfills setup + ui; major stays absent).
4. Compiler will now flag the `weeklyTick` (×2) and `conditionModifiers` (×1) call sites — fix all three.
5. Flip `RtpShell` from local tab state to `save.ui.tab` via a cloud-skip nav-write path.

---

## 9. Risk register (ranked, with mitigations)

1. **[high] Major hero id-namespacing (R-CHAMP-1)** — use id `'user'` inside the Major `Tournament` so `userPairing`/`resolveRound` work; keep `'rtp-user'`/`'rtp-hero'` only in league/match. Mis-set → Major soft-locks. (§5.3)
2. **[high] bestOf plumbing** — thread `bestOf` through map generation AND `simulateSeries`; MD1/MD5 desync otherwise. (§5.4)
3. **[med] condition ceiling 1.12→1.18 buffs all life factors** — verify, prefer scaling gear `matchPct` down over raising ceiling; default `setup` param keeps callers safe. (§3.4)
4. **[med] `weeklyTick`/`conditionModifiers` signature changes** — make `setup` required on `weeklyTick` (compiler flags both sites); default on `conditionModifiers` for safety. (§1.1, §3.4)
5. **[med] Migration aliasing** — `STARTER_SETUP()` MUST be a fresh-object factory, never a shared const. (§1.1)
6. **[med] Gear double-dip** — `trainScale=1`, route ALL training effect through `catBonus`. (§3.3)
7. **[med] Determinism on `resolveRound`** — per-AI-resolve rng from `season+swissRound`, never `rng.tick`. (§5.4)
8. **[med] placementCode label coupling** — reuse `phaseLabel` PT strings verbatim; never translate. (§5.4)
9. **[low] Deferred transfers timing** — `concludeRound` skips `pendingOffers` when Major created; `concludeMajorRound` writes them on resolution. (§5.4)
10. **[low] Save-write per tab switch** — local/cloud-skip nav path. (§6.4)
11. **[low] LifeEventModal placement** — must stay at dispatcher level. (§6.3)
12. **[low] `psychTier` index** — guard `PSYCH_TIERS[psychTier] ?? PSYCH_TIERS[0]`. (§3.3)
13. **[low] in-SVG dead-X** — inline `<path>`, not an HTML `<RtpIcon>` component, inside `RtpSituationBoard`'s `<svg>`. (§7.2)
14. **[low] Engine React cycle** — `RtpIconName` in React-free `engine/rtp/icons.ts`; engine `import type` only. (§7.2)
15. **[info] OV1/OV2 tasks marked done but `RtpShell` absent** — treat spec #3 as net-new on `RtpFrame`; don't assume a shell exists to diff against. (§0.3)

---

## 10. Recommended first move

**Ship P0 (icon sweep + token/focus/motion layer) today.** It's zero-schema, zero-dependency, reversible, directly answers the user's loudest complaint ("vibecoding / emoji-heavy / not loving the UI"), and the glyph set is already drawn — it's a mechanical ~28-line swap plus a CSS token block. It makes every subsequent screen (Setup, Major, tabs) inherit a clean, cohesive look. Then **P1 (shell)** to give all later systems a home, then **P2 (the single v6 bump + gear store)** as the first big feature with real fantasy payoff.

---

### Key file references (all absolute)
- Engine: `/Users/matheuscastro/major-cs/.claude/worktrees/quizzical-cerf-95fd88/src/engine/rtp/{types,createSave,weekly,matchSim,league,world,moments,roundModel}.ts`
- Career engine to reuse: `/Users/matheuscastro/major-cs/.claude/worktrees/quizzical-cerf-95fd88/src/engine/swiss.ts` (and `src/types.ts` for `Tournament/TTeam/Pairing/SeriesResult`)
- Persistence: `/Users/matheuscastro/major-cs/.claude/worktrees/quizzical-cerf-95fd88/src/state/rtpSaves.ts`
- Components: `/Users/matheuscastro/major-cs/.claude/worktrees/quizzical-cerf-95fd88/src/components/rtp/{RoadToPro,RTPHub,RTPMatch,RTPTransfer,RtpFrame,RtpIcon,RtpRoundRoom,RtpSituationBoard,LifeEventModal,RTPCreate}.tsx`
- Career UI model: `/Users/matheuscastro/major-cs/.claude/worktrees/quizzical-cerf-95fd88/src/components/career/{CareerShell,DashCard,DashIcons}.tsx`
- Styles: `/Users/matheuscastro/major-cs/.claude/worktrees/quizzical-cerf-95fd88/src/styles/rtp.css` (1005 lines; tokens at top)
- **Existing icon set (already has all needed glyphs):** `/Users/matheuscastro/major-cs/.claude/worktrees/quizzical-cerf-95fd88/src/components/rtp/RtpIcon.tsx`