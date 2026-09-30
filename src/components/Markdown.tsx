import type { ReactNode } from 'react'

/**
 * A small, safe Markdown view for assistant answers: paragraphs, "-"/"1." lists, **bold**, *italic*,
 * `code` and links. Everything becomes React elements, so no HTML from the answer is ever run.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
    para = []
  }
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
      blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>)
    }
    list = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const num = line.match(/^\d+[.)]\s+(.*)$/)
    const head = line.match(/^#{1,6}\s+(.*)$/)
    if (!line) {
      flushPara()
      flushList()
    } else if (bullet || num) {
      flushPara()
      const ordered = !!num
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? num)![1])
    } else if (head) {
      flushPara()
      flushList()
      blocks.push(
        <p key={blocks.length} className="md-head">
          <b>{inline(head[1])}</b>
        </p>,
      )
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ' ' + line
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return <div className="md">{blocks}</div>
}

const TOKEN = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<]+)/g

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of s.matchAll(TOKEN)) {
    if (m.index! > last) out.push(s.slice(last, m.index))
    const k = out.length
    if (m[1]) out.push(<b key={k}>{m[1]}</b>)
    else if (m[2]) out.push(<i key={k}>{m[2]}</i>)
    else if (m[3]) out.push(<code key={k}>{m[3]}</code>)
    else if (m[4])
      out.push(
        <a key={k} href={m[5]} target="_blank" rel="noreferrer noopener">
          {m[4]}
        </a>,
      )
    else if (m[6])
      out.push(
        <a key={k} href={m[6]} target="_blank" rel="noreferrer noopener">
          {m[6].replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
        </a>,
      )
    last = m.index! + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}
