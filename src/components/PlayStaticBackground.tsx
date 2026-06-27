// PlayStaticBackground — substitui o PlayShaderBackground em Home.tsx.
// Mesmo visual de fundo (3 orbs blur + vignette), mas SEM canvas WebGL2
// contínuo nem animações CSS infinitas. Custo zero de GPU/CPU.
//
// Reusa as classes .play-bg-orb / .play-bg-vignette de play-hub.css. Aplica
// `animation: none` inline pra cancelar o keyframe playOrbFloat — assim não
// precisa mexer no CSS existente (que ainda serve o caso prefers-reduced-motion).

export function PlayStaticBackground() {
  const noAnim = { animation: 'none' } as const;
  return (
    <div className="play-bg" aria-hidden>
      <div className="play-bg-orb play-bg-orb--a" style={noAnim} />
      <div className="play-bg-orb play-bg-orb--b" style={noAnim} />
      <div className="play-bg-orb play-bg-orb--c" style={noAnim} />
      <div className="play-bg-vignette" />
    </div>
  );
}
