const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const newsTags = new Set(['p', 'b', 'strong', 'br', 'ol', 'ul', 'li']);
const hiddenTags = new Set([
  'script', 'style', 'template', 'title', 'noscript', 'iframe', 'noembed', 'noframes', 'object',
  'form', 'button', 'select', 'textarea',
]);

function copyNewsContent(source, destination) {
  for (const node of source.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      destination.append(document.createTextNode(node.data));
    } else if (node.nodeType === Node.ELEMENT_NODE && node.namespaceURI === htmlNamespace
      && !hiddenTags.has(node.localName)) {
      if (newsTags.has(node.localName)) {
        const element = document.createElement(node.localName);
        copyNewsContent(node, element);
        destination.append(element);
      } else {
        copyNewsContent(node, destination);
      }
    }
  }
}

function wrapOrphanListItems(content) {
  const createdLists = new Set();
  for (const item of content.querySelectorAll('li')) {
    const parent = item.parentNode;
    if (parent.localName === 'ul' || parent.localName === 'ol') continue;

    let previous = item.previousSibling;
    while (previous?.nodeType === Node.TEXT_NODE && !previous.data.trim()) {
      previous = previous.previousSibling;
    }
    let list = previous;
    if (!createdLists.has(list)) {
      list = document.createElement('ul');
      parent.insertBefore(list, item);
      createdLists.add(list);
    }
    list.append(item);
  }
}

export function readNews(source) {
  const invalid = () => new Error('無法讀取公告格式。');
  if (typeof source !== 'string') throw invalid();

  const xml = new DOMParser().parseFromString(source, 'application/xml');
  const root = xml.documentElement;
  if (xml.doctype || root?.localName !== 'XML' || root.namespaceURI !== null
    || xml.getElementsByTagNameNS('*', 'parsererror').length) {
    throw invalid();
  }

  const fields = Array.from(root.children).filter((element) => element.localName === 'news'
    && element.namespaceURI === null);
  if (fields.length !== 1 || Array.from(fields[0].childNodes).some((node) => (
    node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.CDATA_SECTION_NODE
    && node.nodeType !== Node.COMMENT_NODE
  ))) {
    throw invalid();
  }

  // Parse the legacy formatting in an inert document, then rebuild just the display content.
  const template = document.createElement('template');
  template.innerHTML = fields[0].textContent;
  const content = document.createDocumentFragment();
  copyNewsContent(template.content, content);
  wrapOrphanListItems(content);
  return content;
}
