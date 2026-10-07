// Documentation pages (#/docs/...). Each page is a <template> in index.html, shown inside the
// docs-shell template. Nothing here makes a request. Never add fetch or the bridge to this file.
import { API_ORIGIN, CANVAS_GROUP_DEADLINE, GROUP_CREDIT_USD, REGISTRATION_DEADLINE } from './config.js';

// [route, template id, title], in sidebar order.
export const DOCS = [
  ['/docs', 'doc-overview', 'Overview'],
  ['/docs/api', 'doc-api', 'Course API'],
  ['/docs/cli', 'doc-cli', 'ece661 command'],
  ['/docs/tpu', 'doc-tpu', 'TPU sessions'],
  ['/docs/groups', 'doc-groups', 'Project groups and credit'],
  ['/docs/troubleshooting', 'doc-troubleshooting', 'Troubleshooting'],
  ['/docs/help', 'doc-help', 'Getting help'],
];
export const docsRoutes = new Set(DOCS.map(([route]) => route));
const SECTION = /^[a-z0-9-]{1,64}$/;
const COPY_LABEL = 'Copy';

// '/docs/cli#install' -> {path: '/docs/cli', section: 'install'}. null when it is not a docs page.
export function docsRoute(value) {
  const [path, section = ''] = String(value).split('#');
  if (!docsRoutes.has(path)) return null;
  return {path, section: SECTION.test(section) ? section : ''};
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(href, text) {
  const a = el('a', '', text);
  a.setAttribute('href', href);
  return a;
}

function fill(root) {
  const values = {origin: new URL(API_ORIGIN).origin, credit: '$' + GROUP_CREDIT_USD, deadline: REGISTRATION_DEADLINE, 'canvas-deadline': CANVAS_GROUP_DEADLINE};
  for (const node of root.querySelectorAll('[data-docs]')) {
    if (values[node.dataset.docs] !== undefined) node.textContent = values[node.dataset.docs];
  }
}

// Copy runs in the page only: the Clipboard API, or a text selection when it is unavailable.
export async function copyCode(button, code) {
  const text = code.textContent;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    try {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
  }
  button.textContent = copied ? 'Copied' : 'Copy failed';
  setTimeout(() => { button.textContent = COPY_LABEL; }, 2000);
  return copied;
}

// Also used by pages.js for code blocks in the imported portal views.
export function wrapCode(pre) {
  const block = el('div', 'code-block');
  const head = el('div', 'code-head');
  head.append(el('span', 'code-lang', pre.dataset.lang || 'Text'));
  const button = el('button', 'code-copy', COPY_LABEL);
  button.type = 'button';
  button.setAttribute('aria-label', 'Copy code');
  const code = pre.querySelector('code') || pre;
  button.addEventListener('click', () => copyCode(button, code));
  head.append(button);
  pre.tabIndex = 0;
  pre.replaceWith(block);
  block.append(head, pre);
}

function build(path) {
  const index = DOCS.findIndex(([route]) => route === path);
  const [, templateId, title] = DOCS[index];
  const main = el('main', 'docs-main');
  main.id = 'main';
  main.tabIndex = -1;
  main.dataset.doc = path;
  main.append(document.getElementById('docs-shell').content.cloneNode(true));
  const article = main.querySelector('.docs-content');
  article.append(document.getElementById(templateId).content.cloneNode(true));
  fill(main);

  const sections = [...article.querySelectorAll('h2[id]')];
  const toc = main.querySelector('.docs-toc ul');
  const sub = el('ul', 'docs-sections');
  for (const heading of sections) {
    const href = '#' + path + '#' + heading.id;
    const label = heading.textContent;
    const anchor = link(href, '#');
    anchor.className = 'heading-anchor';
    anchor.setAttribute('aria-label', 'Link to ' + label);
    heading.append(anchor);
    for (const list of [toc, sub]) {
      const item = el('li');
      item.append(link(href, label));
      list.append(item);
    }
  }
  for (const a of main.querySelectorAll('.docs-sidebar a')) {
    if (a.getAttribute('href') !== '#' + path) continue;
    a.setAttribute('aria-current', 'page');
    if (sections.length) a.after(sub);
  }
  for (const pre of article.querySelectorAll('pre')) wrapCode(pre);

  const pager = el('nav', 'docs-pager');
  pager.setAttribute('aria-label', 'Previous and next page');
  for (const [offset, kind, word] of [[-1, 'prev', 'Previous'], [1, 'next', 'Next']]) {
    const other = DOCS[index + offset];
    if (!other) continue;
    const a = link('#' + other[0]);
    a.className = 'docs-pager-' + kind;
    a.append(el('span', 'docs-pager-label', word), el('span', 'docs-pager-title', other[2]));
    pager.append(a);
  }
  article.append(pager);

  const menu = main.querySelector('.docs-menu');
  const sidebar = main.querySelector('.docs-sidebar');
  menu.querySelector('.docs-menu-current').textContent = title;
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    sidebar.classList.toggle('open', open);
  });
  return {main, title};
}

// Show a docs page, or scroll to a section of the page already on screen.
export function showDocs(path, section = '') {
  let main = document.getElementById('main');
  if (main.dataset.doc !== path || !main.querySelector('.docs-content')) {
    const page = build(path);
    main.replaceWith(page.main);
    main = page.main;
    document.title = page.title + ' · Docs · ECE 661';
    window.scrollTo(0, 0);
  }
  document.body.classList.add('docs-mode');
  const menu = main.querySelector('.docs-menu');
  menu.setAttribute('aria-expanded', 'false');
  main.querySelector('.docs-sidebar').classList.remove('open');
  const target = section && [...main.querySelectorAll('.docs-content h2[id]')].find(h => h.id === section);
  if (target) target.scrollIntoView();
  main.focus({preventScroll: true});
}
