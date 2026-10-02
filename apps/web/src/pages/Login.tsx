import { useState, type FormEvent } from 'react'
import { api, setAdminKey } from '../api.ts'
import { BrandMark } from '../components/icons.tsx'
import { Button, Field } from '../components/ui.tsx'
import { errorText } from '../toast.ts'

export function Login() {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.verifyKey(key.trim())
      setAdminKey(key.trim())
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark"><BrandMark /></span>
          <div>
            <div className="brand-name">CRM Analytics</div>
            <div className="brand-sub">Администрирование</div>
          </div>
        </div>
        <form className="card" onSubmit={submit}>
          <div className="card-body">
            <h1 className="page-title" style={{ fontSize: 20 }}>Вход оператора</h1>
            <p className="page-sub" style={{ marginBottom: 20 }}>Введите ADMIN_API_KEY сервера. Ключ хранится только в этой вкладке браузера.</p>
            <Field label="Ключ администратора" htmlFor="admin-key" error={error}>
              <input id="admin-key" className="input" type="password" autoComplete="current-password" required autoFocus
                value={key} onChange={event => setKey(event.target.value)} />
            </Field>
            <Button variant="primary" type="submit" loading={busy} style={{ width: '100%', marginTop: 20 }}>Войти</Button>
          </div>
        </form>
      </div>
    </main>
  )
}
