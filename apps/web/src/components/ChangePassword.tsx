import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { errorText, useToast } from '@/lib/toast'

export function ChangePassword({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (next !== confirm) { setError('Новые пароли не совпадают.'); return }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      toast.show('Пароль изменён. Другие сессии завершены.')
      onOpenChange(false)
    } catch (failure) { setError(errorText(failure)) }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent>
        <form onSubmit={submit} aria-busy={busy}>
          <DialogHeader icon={KeyRound}>
            <DialogTitle>Смена пароля</DialogTitle>
            <DialogDescription>Остальные ваши сессии завершатся, эта останется активной.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Текущий пароль" htmlFor="current-password">
              <Input id="current-password" type={visible ? 'text' : 'password'} autoComplete="current-password" required autoFocus disabled={busy}
                value={current} onChange={event => { setCurrent(event.target.value); setError(null) }} />
            </Field>
            <Field label="Новый пароль" htmlFor="new-password" hint="От 10 до 200 символов.">
              <Input id="new-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={200}
                disabled={busy} value={next} onChange={event => { setNext(event.target.value); setError(null) }} />
            </Field>
            <Field label="Повторите новый пароль" htmlFor="confirm-password" error={error}>
              <Input id="confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required maxLength={200}
                aria-invalid={!!error} disabled={busy} value={confirm} onChange={event => { setConfirm(event.target.value); setError(null) }} />
            </Field>
            <Button variant="ghost" className="justify-self-start" aria-pressed={visible} onClick={() => setVisible(!visible)}>
              {visible ? <EyeOff /> : <Eye />}{visible ? 'Скрыть пароли' : 'Показать пароли'}
            </Button>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" disabled={busy} onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" size="lg" disabled={busy}>{busy ? 'Меняем…' : 'Сменить пароль'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
