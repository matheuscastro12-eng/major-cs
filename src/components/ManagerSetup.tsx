// Tela de criação do manager — "Become a Major manager". Porta fiel do Setup.jsx
// do design (2 colunas: esquerda cinematográfica + preview ao vivo; direita o form).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BrandMark } from './brand';
import { Button } from './ds';
import { Flag } from './ui';
import { ACCENTS, SETUP_COUNTRIES, type Manager } from '../state/manager';
import { ct } from '../state/career-i18n';

const NICKS = ['zera', 'taclocal', 'igl_diff', 'awp_main', 'clutchgod', 'br4z1l'];
const ORGS = ['Your Dream Team', 'Selva Gaming', 'Capivara Esports', 'Aurora Major', 'Furacão CS'];
const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function ManagerSetup({ onDone, initial, defaultNick }: { onDone: (m: Manager) => void; initial?: Manager | null; defaultNick?: string }) {
  const nickEdited = useRef(false);
  const [nick, setNick] = useState(initial?.nick ?? defaultNick ?? 'br4z1l_zera');
  const [name, setName] = useState(initial?.name ?? '');
  const [age, setAge] = useState(initial?.age ?? 24);
  const [cc, setCc] = useState(initial?.country ?? 'br');
  const [org, setOrg] = useState(initial?.org ?? 'Your Dream Team');
  const [accent, setAccent] = useState(initial?.accent ?? ACCENTS[0]);

  // useAccount carrega async: na montagem account é null, então defaultNick chega
  // depois. Prefilla o nick com o da conta enquanto o usuário não tiver mexido.
  useEffect(() => {
    if (!nickEdited.current && !initial?.nick && defaultNick) setNick(defaultNick);
  }, [defaultNick, initial?.nick]);

  // país salvo pode estar fora da lista curada (ex.: re-edição com 'de'); garante
  // que o <select> tenha a opção correspondente em vez de exibir o 1º item.
  const countries = SETUP_COUNTRIES.some(([c]) => c === cc)
    ? SETUP_COUNTRIES
    : [[cc, cc.toUpperCase()] as [string, string], ...SETUP_COUNTRIES];
  const preview = nick.trim() || 'manager';

  const randomize = () => {
    nickEdited.current = true;
    setNick(rand(NICKS) + Math.floor(Math.random() * 90 + 10));
    setAge(Math.floor(Math.random() * (70 - 18 + 1)) + 18);
    setCc(rand(SETUP_COUNTRIES)[0]);
    setOrg(rand(ORGS));
    setAccent(rand(ACCENTS));
  };
  const start = () => onDone({ nick: nick.trim() || 'manager', name: name.trim(), age, country: cc, accent, org: org.trim() || 'Your Dream Team' });

  const label: CSSProperties = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--rtm-dim)', marginBottom: '6px', display: 'block' };
  const input: CSSProperties = { width: '100%', background: 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)', borderRadius: 'var(--rtm-radius)', color: 'var(--rtm-text)', padding: '10px 12px', fontSize: '14px', fontFamily: 'var(--font)' };

  return (
    <div className="rtm-setup" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', alignItems: 'stretch' }}>
      {/* esquerda cinematográfica */}
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 56px' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/mirage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.28 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(13,17,22,.92), rgba(13,17,22,.65))' }} />
        <div style={{ position: 'relative' }}>
          <BrandMark size={64} />
          <div style={{ fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--rtm-gold)', fontWeight: 700, marginTop: '18px' }}>{ct('Crie seu perfil')}</div>
          <h1 style={{ fontFamily: 'var(--font-cond)', fontSize: '52px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--rtm-text-strong)', margin: '6px 0 14px', lineHeight: 1 }}>{ct('Vire um')}<br /><span style={{ color: 'var(--rtm-blue-bright)' }}>{ct('manager de Major')}</span></h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '15px', maxWidth: '440px', lineHeight: 1.6 }}>
            {ct('Assuma o comando de uma organização. Seu nome e idade te seguem na bio, nos contratos e nas notícias. Monte lendas de cada era e brigue pelo título.')}
          </p>
          {/* preview ao vivo do card do manager */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', marginTop: '26px', padding: '14px 18px', borderRadius: '12px', background: 'rgba(18,22,27,.7)', border: '1px solid var(--rtm-border-soft)' }}>
            <span style={{ width: '56px', height: '56px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '20px', color: '#fff', background: `linear-gradient(160deg, ${accent}, #20303f)` }}>{preview.slice(0, 2).toUpperCase()}</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '20px', color: 'var(--rtm-text-strong)' }}>{preview}</div>
              <div style={{ fontSize: '12px', color: 'var(--rtm-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}><Flag cc={cc} /> {name || ct('Seu nome')} · {age}a</div>
              <div style={{ fontSize: '12px', color: 'var(--rtm-gold)', fontWeight: 700, marginTop: '2px' }}>{org}</div>
            </div>
          </div>
        </div>
      </div>

      {/* direita: form */}
      <div style={{ background: 'var(--rtm-panel)', borderLeft: '1px solid var(--rtm-border-soft)', padding: '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-cond)', fontSize: '22px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--rtm-text-strong)' }}>{ct('Crie seu manager')}</h2>
          <Button variant="ghost" size="sm" onClick={randomize}>⟳ {ct('Aleatório')}</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={label}>{ct('Nick de manager')}</label><input style={input} value={nick} maxLength={24} onChange={(e) => { nickEdited.current = true; setNick(e.target.value); }} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={label}>{ct('Nome completo')}</label><input style={input} value={name} maxLength={40} placeholder={ct('ex: Caio Ferreira')} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <label style={label}>{ct('Idade')} · {age}</label>
            <input type="range" min={18} max={70} value={age} onChange={(e) => setAge(+e.target.value)} style={{ width: '100%', accentColor: 'var(--rtm-blue-bright)' }} />
          </div>
          <div><label style={label}>{ct('País')}</label>
            <select style={input} value={cc} onChange={(e) => setCc(e.target.value)}>
              {countries.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}><label style={label}>{ct('Organização')}</label><input style={input} value={org} maxLength={30} onChange={(e) => setOrg(e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>{ct('Cor do time')}</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {ACCENTS.map((c) => (
                <button key={c} type="button" onClick={() => setAccent(c)} style={{ width: '38px', height: '38px', borderRadius: '50%', background: c, cursor: 'pointer', border: accent === c ? '2px solid var(--rtm-text-strong)' : '2px solid transparent', boxShadow: accent === c ? `0 0 0 2px ${c}` : 'none' }} />
              ))}
            </div>
          </div>
        </div>
        <Button size="big" onClick={start} style={{ width: '100%', marginTop: '28px' }}>{ct('Continuar')} →</Button>
        <p style={{ fontSize: '11px', color: 'var(--rtm-faint)', textAlign: 'center', marginTop: '12px' }}>{ct('A idade afeta só a narrativa, sem efeito mecânico.')}</p>
      </div>
    </div>
  );
}
