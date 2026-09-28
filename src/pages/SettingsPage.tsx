import { useState } from 'react'
import { removeRecord, seasonLabel, setCurrency, setLang, setRates, setTheme, useDB, type Lang, type Theme } from '../lib/store'
import { cropName } from '../lib/crops'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { CURRENCIES, formatDateTime, formatNumber } from '../lib/format'
import { convert, fetchRatesOnline, formatMoney } from '../lib/money'
import { LANGS, useT } from '../lib/i18n'
import { Breadcrumbs, Field, PageHead, SectionHead, num, str } from '../components/ui'

/** Every currency used anywhere in the saved records. */
function useUsedCurrencies() {
  const db = useDB()
  const used = new Set<string>([db.settings.currency, 'USD', 'UZS'])
  for (const list of [db.expenses, db.shipments, db.workers]) for (const r of list) used.add(r.currency)
  for (const a of Object.values(db.attendance)) used.add(a.currency)
  return [...used]
}

export function SettingsPage() {
  const db = useDB()
  const t = useT()
  const s = db.settings
  const others = useUsedCurrencies().filter((c) => c !== 'USD')

  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(others.map((c) => [c, str(s.rates[c] ?? null)])),
  )
  const [status, setStatus] = useState<null | 'saved' | 'loading' | 'online-ok' | 'online-fail'>(null)

  function save() {
    const next: Record<string, number> = {}
    for (const c of others) {
      const n = num(draft[c] ?? '')
      if (n && n > 0) next[c] = n
    }
    setRates(next, 'manual')
    setStatus('saved')
  }

  async function updateOnline() {
    setStatus('loading')
    const ok = await fetchRatesOnline()
    setStatus(ok ? 'online-ok' : 'online-fail')
  }

  // Keep the inputs in step with rates fetched online.
  const shown = (c: string) => (status === 'online-ok' ? str(s.rates[c] ?? null) : (draft[c] ?? ''))

  // ----- converter -----
  const [amount, setAmount] = useState('100')
  const [from, setFrom] = useState('USD')
  const [to, setTo] = useState(s.currency === 'USD' ? 'UZS' : s.currency)
  const a = num(amount)
  const result = a !== null ? convert(a, from, to, s.rates) : null
  const convChoices = [...new Set(['USD', ...others, ...CURRENCIES.filter((c) => s.rates[c])])]

  return (
    <>
      <Breadcrumbs items={[{ label: t('Seasons'), to: [] }, { label: t('Settings') }]} />
      <PageHead title={t('Settings')} />

      <SectionHead title={t('Account')} />
      <div className="card settings-card account-soon">
        <p className="empty-title">{t('Accounts are coming soon')}</p>
        <p className="field-hint">
          {t('Signing in and sharing the same records with your family will be set up here.')}
        </p>
      </div>

      <SectionHead title={t('General')} />

      <div className="card settings-card">
        <div className="form-grid">
          <Field label={t('Language')}>
            <select id="set-lang" className="input" value={s.lang} onChange={(e) => setLang(e.target.value as Lang)}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Show totals in')} hint={t('Each amount keeps its own currency; totals are converted into this one.')}>
            <select id="set-currency" className="input" value={s.currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <div className="field field-wide">
            <span className="field-label" id="set-theme-label">
              {t('Screen')}
            </span>
            <div className="segmented theme-switch" role="radiogroup" aria-labelledby="set-theme-label">
              {(
                [
                  ['day', '☀', t('Day')],
                  ['night', '☾', t('Night')],
                  ['auto', '◐', t('Automatic')],
                ] as [Theme, string, string][]
              ).map(([k, icon, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={(s.theme ?? 'day') === k}
                  className={(s.theme ?? 'day') === k ? 'is-on is-good' : ''}
                  onClick={() => setTheme(k)}
                >
                  <span aria-hidden="true">{icon}</span> {label}
                </button>
              ))}
            </div>
            <span className="field-hint">{t('Night makes the screen dark, easier on the eyes in the evening. Automatic follows your phone or computer.')}</span>
          </div>
        </div>
      </div>

      <SectionHead title={t('Exchange rate')} />
      <div className="card settings-card">
        <div className="form-grid">
          {others.map((c) => (
            <Field key={c} label={`1 USD = … ${c}`}>
              <div className="money-input">
                <input
                  id={`rate-${c}`}
                  className="input"
                  inputMode="decimal"
                  value={shown(c)}
                  onChange={(e) => {
                    setDraft({ ...Object.fromEntries(others.map((x) => [x, shown(x)])), [c]: e.target.value })
                    setStatus(null)
                  }}
                />
                <span className="money-cur money-cur-static">{c}</span>
              </div>
            </Field>
          ))}
        </div>
        <p className="field-hint">
          {s.ratesUpdatedAt
            ? t('Last updated {time} ({source})', {
                time: formatDateTime(s.ratesUpdatedAt),
                source: s.ratesSource === 'online' ? t('online') : t('entered by hand'),
              })
            : t('No exchange rate saved yet.')}
        </p>
        <div className="form-actions form-actions-start">
          <button className="btn btn-primary" onClick={save}>
            {t('Save rate')}
          </button>
          <button className="btn btn-ghost" onClick={updateOnline} disabled={status === 'loading'}>
            {status === 'loading' ? t('Getting today’s rate…') : t('Get today’s rate online')}
          </button>
        </div>
        {status === 'saved' && <p className="form-ok">{t('Saved. All totals now use this rate.')}</p>}
        {status === 'online-ok' && <p className="form-ok">{t('Updated with today’s rate.')}</p>}
        {status === 'online-fail' && (
          <p className="form-error">{t('Couldn’t get the rate online here. Type it in and press Save rate.')}</p>
        )}
      </div>

      <SectionHead title={t('Currency converter')} />
      <div className="card settings-card converter">
        <div className="money-input">
          <input id="conv-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className="money-cur" aria-label={t('From')} value={from} onChange={(e) => setFrom(e.target.value)}>
            {convChoices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={t('Swap')}
          onClick={() => {
            setFrom(to)
            setTo(from)
          }}
        >
          ⇄
        </button>
        <select id="conv-to" className="input input-compact" aria-label={t('To')} value={to} onChange={(e) => setTo(e.target.value)}>
          {convChoices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="converter-result" aria-live="polite">
          {result !== null ? formatMoney(result, to) : a === null ? '—' : t('Set the exchange rate first')}
        </div>
        {result !== null && from !== to && (
          <p className="field-hint converter-note">
            1 {from} = {formatNumber(convert(1, from, to, s.rates) ?? 0, 4)} {to}
          </p>
        )}
      </div>

      <SectionHead title={t('Seasons and crops')} />
      <p className="field-hint">{t('Delete seasons or crops you no longer need. Workers are never deleted here.')}</p>
      <div className="manage-list">
        {[...db.seasons]
          .sort((a, b) => a.startYear - b.startYear)
          .map((season) => {
            const crops = db.crops.filter((c) => c.seasonId === season.id)
            return (
              <div key={season.id} className="card manage-season">
                <div className="manage-row">
                  <span className="manage-name">{t('{season} season', { season: seasonLabel(season) })}</span>
                  <ConfirmDelete
                    label={t('Delete season')}
                    question={t('Delete the {season} season?', { season: seasonLabel(season) })}
                    details={t('Its {n} crops and all their records (expenses, worker days, harvest, export) will be deleted. Workers stay.', { n: crops.length })}
                    onDelete={() => removeRecord('seasons', season.id)}
                  />
                </div>
                {crops.length > 0 && (
                  <ul className="manage-crops">
                    {crops.map((c) => {
                      const name = [cropName(c.crop, s.lang), c.variety].filter(Boolean).join(' · ')
                      return (
                        <li key={c.id} className="manage-row">
                          <span>{name}</span>
                          <ConfirmDelete
                            label={t('Delete crop')}
                            question={t('Delete {crop} from {season}?', { crop: name, season: seasonLabel(season) })}
                            details={t('All its records (expenses, worker days, harvest, export) will be deleted. Workers stay.')}
                            onDelete={() => removeRecord('crops', c.id)}
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
      </div>
    </>
  )
}
