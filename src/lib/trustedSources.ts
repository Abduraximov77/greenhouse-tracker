/** Sites the AI assistant may read (same list as the helper on the computer). Only links to these are shown. */
export const TRUSTED_DOMAINS = [
  'fao.org',
  'eppo.int',
  'cabi.org',
  'plantwiseplusknowledgebank.org',
  'worldveg.org',
  'ipm.ucanr.edu',
  'ucanr.edu',
  'vegetables.cornell.edu',
  'cornell.edu',
  'extension.umn.edu',
  'extension.psu.edu',
  'extension.wisc.edu',
  'extension.umd.edu',
  'ag.umass.edu',
  'wur.nl',
  'ahdb.org.uk',
  'rhs.org.uk',
  'apsnet.org',
  'agro.gov.uz',
  'gov.uz',
]

export function isTrustedUrl(url: string) {
  try {
    const u = new URL(url)
    const h = u.hostname.toLowerCase()
    return u.protocol === 'https:' && TRUSTED_DOMAINS.some((d) => h === d || h.endsWith('.' + d))
  } catch {
    return false
  }
}
