import type { Provider } from '../api.ts'
import { Badge, CopyField } from './ui.tsx'

/** Everything an operator needs to know before connecting a CRM; data comes from the backend catalog. */
export function ProviderDetails({ provider }: { provider: Provider }) {
  return (
    <div className="stack">
      <div>
        <p className="section-title">Как подключить</p>
        <ol className="steps">{provider.setupSteps.map(step => <li key={step}>{step}</li>)}</ol>
      </div>
      {provider.callbackUrl && (
        <div className="field">
          <span className="field-label">Redirect URI для приложения в CRM</span>
          <CopyField value={provider.callbackUrl} label="Redirect URI" />
        </div>
      )}
      <div className="divider" />
      <dl className="kv">
        <dt>Коммерческие данные</dt>
        <dd><ul className="list">{provider.commercialData.map(item => <li key={item}>{item}</li>)}</ul></dd>
        <dt>Работа менеджеров</dt>
        <dd><ul className="list">{provider.workData.map(item => <li key={item}>{item}</li>)}</ul></dd>
        <dt>Права доступа</dt>
        <dd><div className="chips">{provider.scopes.map(scope => <span className="chip" key={scope}>{scope}</span>)}</div></dd>
        <dt>Получение изменений</dt>
        <dd>{provider.changeCapture}</dd>
        <dt>Ограничения API</dt>
        <dd>{provider.limits}</dd>
        <dt>Встраивание в CRM</dt>
        <dd>{provider.embed}</dd>
        <dt>Авторизация</dt>
        <dd>{provider.auth === 'oauth2' ? 'OAuth 2.0, только чтение' : <>API-ключ с правами только на чтение <Badge plain>хранится зашифрованным</Badge></>}</dd>
        <dt>Документация</dt>
        <dd><a href={provider.docsUrl} target="_blank" rel="noreferrer">Официальная документация ↗</a></dd>
      </dl>
    </div>
  )
}
