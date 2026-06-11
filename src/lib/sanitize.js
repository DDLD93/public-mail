import sanitizeHtml from 'sanitize-html';

const MAIL_FRAME_STYLES = `
html,body{margin:0;padding:0;font-family:'IBM Plex Sans',system-ui,sans-serif;color:#1d2319;line-height:1.7;font-size:15px;word-wrap:break-word;background:transparent}
@media (prefers-color-scheme: dark){html,body{color:#bcc4b9}}
a{color:#15a259;text-decoration:underline;text-underline-offset:2px}
@media (prefers-color-scheme: dark){a{color:#23c46c}}
img{max-width:100%;height:auto}
table{max-width:100%}
blockquote{border-left:2px solid #15a259;padding-left:1em;margin-left:0;color:#646e60}
h1,h2,h3{font-family:'IBM Plex Sans',sans-serif;letter-spacing:-0.01em;font-weight:600}
code,pre{font-family:'IBM Plex Mono',monospace}
`.trim();

function extractHtmlBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1];
  return html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');
}

export function sanitizeMailHtml(html) {
  if (!html) return '';
  const fragment = extractHtmlBody(html);
  return sanitizeHtml(fragment, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'style',
      'h1',
      'h2',
      'span',
      'figure',
      'figcaption',
    ]),
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'width', 'height', 'colspan', 'rowspan'],
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'cid'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
    },
    allowVulnerableTags: true,
  });
}

export function buildMailFrameSrcdoc(sanitizedHtml) {
  if (!sanitizedHtml) return '';
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${MAIL_FRAME_STYLES}</style></head><body>${sanitizedHtml}</body></html>`;
}
