import sanitizeHtml from 'sanitize-html';

export function sanitizeMailHtml(html) {
  if (!html) return '';
  return sanitizeHtml(html, {
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
  });
}
