import { ArrowUpRight, BarChart3, CircleHelp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import './App.css'

function App() {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-icon"><BarChart3 size={17} /></span>
          <span>CRM Admin</span>
        </div>
        <div className="admin-nav-label">АДМИНИСТРИРОВАНИЕ</div>
        <div className="admin-nav-item"><span className="admin-nav-indicator" />Подключения</div>
        <div className="admin-sidebar-footer">CRM Analytics</div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">Администрирование <span>/</span> <strong>Подключения</strong></div>
          <Button variant="outline" size="icon" className="help-button" aria-label="Справка"><CircleHelp size={16} /></Button>
        </header>

        <div className="admin-content">
          <div className="admin-heading">
            <div>
              <div className="admin-eyebrow">ИНТЕГРАЦИИ</div>
              <h1>Подключения CRM</h1>
              <p>Подключайте CRM, из которых приложение будет получать данные.</p>
            </div>
          </div>

          <section aria-labelledby="available-connectors">
            <div className="connector-section-heading">
              <h2 id="available-connectors">Доступные подключения</h2>
              <span>1 интеграция</span>
            </div>

            <Card className="connector-card">
              <CardHeader className="connector-card-header">
                <div className="bitrix-mark" aria-hidden="true">b</div>
                <div className="connector-title-block">
                  <CardTitle>Bitrix24</CardTitle>
                  <span>CRM и задачи</span>
                </div>
                <Badge variant="outline" className="disconnected-badge"><span /> Не подключена</Badge>
              </CardHeader>
              <CardContent className="connector-card-content">
                <p>Импорт сделок, контактов и CRM-активностей для аналитики.</p>
                <Button variant="outline" className="connect-button" disabled>Подключить <ArrowUpRight size={15} /></Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  )
}

export default App
