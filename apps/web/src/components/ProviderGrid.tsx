import type { Provider } from '../api.ts'
import { Badge, ProviderMark } from './ui.tsx'

export function ProviderGrid({ providers, selected, onSelect }: {
  providers: Provider[]; selected?: string | null; onSelect: (provider: Provider) => void
}) {
  return (
    <div className="provider-grid">
      {providers.map(provider => (
        <button key={provider.id} type="button" onClick={() => onSelect(provider)}
          className={`provider-card${selected === provider.id ? ' selected' : ''}`} aria-pressed={selected === provider.id}>
          <div className="provider-head">
            <ProviderMark provider={provider.id} />
            <div style={{ minWidth: 0 }}>
              <div className="provider-name">{provider.name}</div>
              <div className="provider-meta">{provider.auth === 'oauth2' ? 'OAuth 2.0' : 'API-ключ'}</div>
            </div>
            <span style={{ marginLeft: 'auto' }}>
              {provider.status === 'available' ? <Badge tone="ok">Доступно</Badge> : <Badge tone="muted" plain>В разработке</Badge>}
            </span>
          </div>
          <p className="provider-meta">{provider.changeCapture}</p>
        </button>
      ))}
    </div>
  )
}
