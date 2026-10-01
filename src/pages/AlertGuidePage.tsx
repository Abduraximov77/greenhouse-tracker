import { useT } from '../lib/i18n'
import { ALERT_RULES, type AlertLevel } from '../lib/alertRules'
import { Breadcrumbs, PageHead } from '../components/ui'

const LEVEL_LABEL: Record<AlertLevel, string> = { danger: 'Danger', warn: 'Warning', info: 'Notice' }

/** Every weather alert rule: when it is sent and what to do. No AI is used for these. */
export function AlertGuidePage() {
  const t = useT()
  return (
    <>
      <Breadcrumbs items={[{ label: t('Seasons'), to: [] }, { label: t('Weather alert guide') }]} />
      <PageHead
        title={t('Weather alert guide')}
        sub={t('Alerts are made automatically from the forecast for each place, by these rules. No AI is used for them.')}
      />

      <div className="card guide-intro">
        <ul>
          <li>
            {t('Checked for today and tomorrow, so an alert comes a day before the weather. Today only counts the hours still ahead.')}
          </li>
          <li>{t('Each crop gets the alerts for its own place. In Telegram each alert will name the place and the crops.')}</li>
          <li>
            {t('Colours:')} <span className="guide-level lvl-danger">{t('Danger')}</span>{' '}
            <span className="guide-level lvl-warn">{t('Warning')}</span> <span className="guide-level lvl-info">{t('Notice')}</span>
          </li>
          <li>{t('The limits are general settings for film greenhouses, not official norms. Forecast data: Open-Meteo.')}</li>
        </ul>
      </div>

      <div className="guide-list">
        {ALERT_RULES.map((r) => (
          <article key={r.id} className="card guide-rule">
            <div className="guide-rule-head">
              <span className="guide-icon" aria-hidden="true">
                {r.icon}
              </span>
              <h2>{t(r.name)}</h2>
              <span className="guide-levels">
                {r.levels.map((l) => (
                  <span key={l} className={`guide-level lvl-${l}`}>
                    {t(LEVEL_LABEL[l])}
                  </span>
                ))}
              </span>
            </div>
            <p className="guide-when">
              <b>{t('When')}:</b> {t(r.when)}
            </p>
            <p className="guide-do">
              <b>{t('What to do')}:</b> {t(r.action)}
            </p>
          </article>
        ))}
      </div>
    </>
  )
}
