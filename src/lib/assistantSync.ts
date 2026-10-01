/**
 * Keeps the AI-assistant link with the signed-in person's own account:
 *  - a device signed in as you, with no link yet, takes it from your account (no re-linking);
 *  - linking, unlinking or a new helper address on one device is saved to your account.
 * The link on a device belongs to the account it was saved for: when someone else signs in on that
 * device (or you sign out), it is removed from the device, so it never passes to another account.
 * Never part of the farm records, so parents' phones never get it.
 */
import { getCloud, refreshMe, subscribeCloud, updateMe } from './cloud'
import { getHelperLink, setHelperLink, subscribeHelperLink, type HelperLink } from './assistant'

const OWNER_KEY = 'agroledger:assistant-user'
const readOwner = () => {
  try {
    const v = localStorage.getItem(OWNER_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}
const writeOwner = (id: number | null) => {
  try {
    if (id === null) localStorage.removeItem(OWNER_KEY)
    else localStorage.setItem(OWNER_KEY, String(id))
  } catch {
    // storage blocked
  }
}

const same = (a: HelperLink | null | undefined, b: HelperLink | null | undefined) =>
  (a?.u ?? '') === (b?.u ?? '') && (a?.k ?? '') === (b?.k ?? '')

let started = false
export function startAssistantSync() {
  if (started) return
  started = true
  let pushed = false
  // while the app itself changes the link (adopting or clearing), don't send it back to the server
  let quiet = false
  const setQuietly = (l: HelperLink | null) => {
    quiet = true
    setHelperLink(l)
    quiet = false
  }

  const adopt = () => {
    const s = getCloud().session
    const owner = readOwner()
    const local = getHelperLink()
    if (!s) {
      // signed out: the link leaves this device with the account
      if (local && owner !== null) setQuietly(null)
      if (owner !== null) writeOwner(null)
      return
    }
    if (owner !== null && owner !== s.user.id) {
      // another account signed in on this device: forget the previous account's link
      writeOwner(null)
      if (local) setQuietly(null)
    }
    // the assistant's owner took access away: stop using it on this device
    if (s.user.assistantRequest === 'revoked' && !s.user.assistant && getHelperLink()) {
      setQuietly(null)
      writeOwner(null)
      return
    }
    const now = getHelperLink()
    const server = s.user.assistant ?? null
    // a new key, or the helper moved to a new address (people let in learn it from the account)
    if (server && (!now || now.k !== server.k || now.u !== server.u)) {
      setQuietly(server)
      writeOwner(s.user.id)
    } else if (!server && now && !pushed && readOwner() === null) {
      // linked on this device before signing in: save it to this account once
      pushed = true
      writeOwner(s.user.id)
      void updateMe({ assistant: now }).catch(() => (pushed = false))
    } else if (now && readOwner() === null) writeOwner(s.user.id)
  }
  subscribeCloud(adopt)

  subscribeHelperLink(() => {
    if (quiet) return
    const s = getCloud().session
    if (!s) return
    const local = getHelperLink()
    if (local) writeOwner(s.user.id)
    if (same(local, s.user.assistant)) return
    void updateMe({ assistant: local }).catch(() => {})
  })

  adopt()
  // the saved account on this device may be older than the link: fetch it once
  if (getCloud().session) void refreshMe(false).catch(() => {})
}
