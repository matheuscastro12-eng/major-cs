import { useEffect, useState } from 'react';
import { useLang } from '../state/i18n';

export const PIXGG_URL = 'https://pixgg.com/MatheusCastro';
export const KOFI_URL = 'https://ko-fi.com/matheuscastrobr';

export interface Donor {
  name: string;
  amount: number;
  message: string;
  source: string;
  created_at: string;
}

interface DonorData {
  donors: Donor[];
  total: number;
  count: number;
}

let donorCache: DonorData | null = null;

export async function fetchDonors(): Promise<DonorData | null> {
  if (donorCache) return donorCache;
  try {
    const res = await fetch('/api/donors', { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = (await res.json()) as DonorData;
    donorCache = data;
    return data;
  } catch {
    return null;
  }
}

export function invalidateDonors(): void {
  donorCache = null;
}

export function DonateButton({ onClick }: { onClick: () => void }) {
  const { t } = useLang();
  return (
    <button className="donate-cta" onClick={onClick}>
      {t('donate.cta')}
    </button>
  );
}

export function DonateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const [data, setData] = useState<DonorData | null>(donorCache);

  useEffect(() => {
    if (!open) return;
    fetchDonors().then((d) => d && setData(d));
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal donate-modal fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          {t('donate.title')}
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label={t('donate.close')}>
            ✕
          </button>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>
            {t('donate.blurb')}
          </p>
          <div className="donate-actions">
            <a className="btn gold big" href={PIXGG_URL} target="_blank" rel="noreferrer">
              {t('donate.pix')}
            </a>
            <a className="btn big" href={KOFI_URL} target="_blank" rel="noreferrer">
              {t('donate.kofi')}
            </a>
          </div>

          <div className="donors-box">
            <div className="donors-head">
              {t('donate.wall')}
              {data && data.count > 0 && (
                <span className="muted small">
                  {' '}
                  - {data.count} {t('donate.donations')} · R$ {data.total.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
            {!data && <div className="muted small">{t('donate.loading')}</div>}
            {data && data.donors.length === 0 && (
              <div className="muted small">{t('donate.first')}</div>
            )}
            {data && data.donors.length > 0 && (
              <div className="donors-list">
                {data.donors.slice(0, 20).map((d, i) => (
                  <div key={i} className="donor-row">
                    <span className="dname">
                      {d.source === 'kofi' ? '☕' : '⚡'} {d.name}
                    </span>
                    {d.amount > 0 && <span className="damount">R$ {Number(d.amount).toFixed(2).replace('.', ',')}</span>}
                    {d.message && <span className="dmsg">"{d.message}"</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Painel compacto de apoiadores para a home
export function DonorsPanel({ onDonate }: { onDonate: () => void }) {
  const { t } = useLang();
  const [data, setData] = useState<DonorData | null>(donorCache);
  useEffect(() => {
    fetchDonors().then((d) => d && setData(d));
  }, []);

  return (
    <div className="panel" style={{ maxWidth: 640, margin: '26px auto 0' }}>
      <div className="panel-head">
        {t('donate.panel')}
        <span className="spacer" />
        <button className="btn gold" onClick={onDonate}>
          {t('donate.want')}
        </button>
      </div>
      <div className="panel-body">
        {!data || data.donors.length === 0 ? (
          <div className="muted small center">
            {t('donate.empty')}
          </div>
        ) : (
          <div className="donors-list compact">
            {data.donors.slice(0, 8).map((d, i) => (
              <div key={i} className="donor-row">
                <span className="dname">
                  {d.source === 'kofi' ? '☕' : '⚡'} {d.name}
                </span>
                {d.amount > 0 && <span className="damount">R$ {Number(d.amount).toFixed(2).replace('.', ',')}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
