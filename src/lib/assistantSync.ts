/**
 * Keeps the AI-assistant link with the signed-in person's own account:
 *  - a device signed in as you, with no link yet, takes it from your account (no re-linking);
 *  - linking, unlinking or a new helper address on one device is saved to your account.
 * Never part of the farm records, so parents' phones never get it.
 */
import { getCloud, refreshMe, subscribeCloud, updateMe } from './cloud'
import { getHelperLink, setHelperLink, subscribeHelperLink, type HelperLink } from './assistant'

const same = (a: HelperLink | null | undefined, b: HelperLink | null | undefined) =>
  (a?.u ?? '') === (b?.u ?? '') && (a?.k ?? '') === (b?.k ?? '')

let started = false
export function startAssistantSync() {
  if (started) return
  started = true
  let pushed = false
  let lastUser = getCloud().session?.user.id ?? null

  const adopt = () => {
    const s = getCloud().session
    if (s?.user.id !== lastUser) lastUser = s?.user.id ?? null
    if (!s) return
    const server = s.user.assistant ?? null
    const local = getHelperLink()
    if (server && !local) setHelperLink(server)
    // linked on this device before signing in (or before this existed): save it to the account once
    else if (!server && local && !pushed) {
      pushed = true
      void updateMe({ assistant: local }).catch(() => (pushed = false))
    }
  }
  subscribeCloud(adopt)

  subscribeHelperLink(() => {
    const s = getCloud().session
    if (!s) return
    const local = getHelperLink()
    if (same(local, s.user.assistant)) return
    void updateMe({ assistant: local }).catch(() => {})
  })

  adopt()
  // the saved account on this device may be older than the link: fetch it once
  if (getCloud().session) void refreshMe(false).catch(() => {})
}
