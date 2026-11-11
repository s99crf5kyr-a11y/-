// note向けの最小Markdown→HTML変換（見出し・太字・リスト・引用・リンク・段落）
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');

export function parseNote(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let title = '';
  const tags = [];
  const html = [];
  let list = null; // 'ul' | 'ol'
  let quote = [];
  const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
  const closeQuote = () => {
    if (quote.length) { html.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`); quote = []; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!title && /^# /.test(line)) { title = line.slice(2).trim(); continue; }
    // 最終行などの「#タグ #タグ」はハッシュタグとして抜き出す
    if (/^(#[^\s#]+\s*)+$/.test(line) && !/^#+ /.test(line)) {
      tags.push(...line.match(/#[^\s#]+/g).map((t) => t.slice(1)));
      continue;
    }
    if (/^> ?/.test(line)) { closeList(); quote.push(line.replace(/^> ?/, '')); continue; }
    closeQuote();
    let m;
    if ((m = line.match(/^(#{2,3}) (.*)/))) { closeList(); html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = line.match(/^(?:[-*・]) ?(.*)/)) && !/^\*\*/.test(line)) { if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; } html.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\d+\. (.*)/))) { if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; } html.push(`<li>${inline(m[1])}</li>`); continue; }
    closeList();
    if (line.trim() === '') continue;
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList(); closeQuote();
  return { title, tags, html: html.join('\n') };
}
