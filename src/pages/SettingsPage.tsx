import { useState } from 'react'
import { setCurrency, setLang, setRates, useDB, type Lang } from '../lib/store'
import { CURRENCIES, formatDateTime, formatNumber } from '../lib/format'
import { convert, fetchRatesOnline, formatMoney } from '../lib/money'
import { LANGS, useT } from '../lib/i18n'
import { Breadcrumbs, Field, PageHead, SectionHead, num, str } from '../components/ui'

/** Every currency used anywhere in the saved records. */
function useUsedCurrencies() {
  const db = useDB()
  const used = new Set<string>([db.settings.currency, 'USD', 'UZS'])
  for (const list of [db.plantings, db.nutrition, db.shipments, db.workers]) for (const r of list) used.add(r.currency)
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
    </>
  )
}
