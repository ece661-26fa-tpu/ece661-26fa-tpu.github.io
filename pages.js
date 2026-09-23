import { API_ORIGIN } from './config.js';
const status = document.getElementById('transport-status');
const getRoutes = new Set(['/', '/me', '/ta', '/ta/export.csv', '/ta/compute.csv']);
const postRoutes = new Set(['/me', '/ta', '/ta/logout', '/ta/revoke', '/ta/reissue']);
let session = ''; // Expiring TA session. Never use cookies, URL parameters, or browser storage.
let busy = false;
let requestEpoch = 0;
let activeRequest = null;
const origin = new URL(API_ORIGIN).origin;

function routeFromHash() { const p = location.hash.slice(1) || '/'; return getRoutes.has(p) ? p : '/'; }
function localPath(value) {
  const url = new URL(value, 'https://portal.internal');
  if (!['https://portal.internal', origin].includes(url.origin) || url.search || url.hash) return null;
  return url.pathname;
}
function render(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const main = doc.querySelector('main#main');
  if (!main) throw new Error('Unexpected portal page.');
  // Only the existing portal's rendered content is imported. Never import scripts,
  // styles, frames, images, or event attributes from a response.
  main.querySelectorAll('script,style,link,iframe,object,embed,svg,math,img,video,audio,source,meta,base').forEach(el => el.remove());
  for (const el of [main, ...main.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || ['style', 'src', 'srcset', 'srcdoc', 'formaction', 'formmethod'].includes(attr.name)) el.removeAttribute(attr.name);
    }
  }
  for (const a of main.querySelectorAll('a[href]')) {
    const path = localPath(a.getAttribute('href'));
    if (path && getRoutes.has(path)) { a.dataset.route = path; a.href = '#' + path; }
    else if (a.getAttribute('href').startsWith('#')) { /* local section link */ }
    else { a.removeAttribute('href'); }
  }
  for (const form of main.querySelectorAll('form')) {
    const path = localPath(form.getAttribute('action') || '/');
    if (!postRoutes.has(path) || form.method.toLowerCase() !== 'post') throw new Error('Unsupported portal form.');
    form.dataset.route = path;
    form.removeAttribute('action');
    if (path === '/ta') {
      const hint=form.querySelector('.hint');
      if (hint) hint.textContent='TA access lasts up to eight hours in this tab. Reloading signs you out. Your API key is not saved.';
    }
  }
  main.tabIndex = -1;
  main.classList.remove('reveal');
  document.getElementById('main').replaceWith(document.importNode(main, true));
  document.title = doc.title || 'Course compute · ECE 661';
  document.getElementById('main').focus({preventScroll:true});
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function send(method, path, form = {}) {
  if (busy) return;
  if (!(method === 'GET' ? getRoutes : postRoutes).has(path)) return;
  busy=true;
  const epoch=requestEpoch;
  const controller=new AbortController();
  activeRequest=controller;
  const deadline=setTimeout(()=>controller.abort(),120000);
  status.textContent='Loading…';
  document.getElementById('main').setAttribute('aria-busy','true');
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  if (path === '/ta' && method === 'POST') session='';
  try {
    for (let hop=0; hop<3; hop++) {
      const headers={'Content-Type':'application/json'};
      if (session) headers.Authorization='Bearer '+session;
      const res=await fetch(origin+'/pages-api/request', {method:'POST',headers,
        body:JSON.stringify({method,path,form}),signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
      form={};
      const result=await res.json();
      if (epoch !== requestEpoch) return;
      if (!res.ok) throw new Error(result.error || 'Portal unavailable.');
      if (result.session !== null && typeof result.session === 'string') session=result.session;
      if (result.status === 401) session='';
      if (result.redirect) {
        if (!getRoutes.has(result.redirect)) throw new Error('Unexpected redirect.');
        path=result.redirect; method='GET'; continue;
      }
      if (result.download) download(result.download,result.text);
      else if (typeof result.html === 'string') {
        render(result.html);
        history.replaceState(null,'','#'+(path.startsWith('/ta') ? '/ta' : '/'));
      } else throw new Error('Unexpected portal response.');
      status.textContent='';
      return;
    }
    throw new Error('Too many portal redirects.');
  } catch (error) {
    // An uncertain action is never retried automatically.
    if (epoch !== requestEpoch) return;
    status.textContent=error.name === 'AbortError' ? 'The request timed out. Check the portal before retrying an action.' : error instanceof TypeError ? 'Cannot reach the portal. Check your connection. Check the portal before retrying an action.' : error.message;
  } finally {
    form={}; clearTimeout(deadline);
    if (epoch !== requestEpoch) return;
    activeRequest=null; busy=false;
    document.getElementById('main').removeAttribute('aria-busy');
    document.querySelectorAll('button').forEach(b=>b.disabled=false);
  }
}
document.addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.target;
  if (!(form instanceof HTMLFormElement) || busy || !postRoutes.has(form.dataset.route)) return;
  const data=Object.fromEntries(new FormData(form));
  form.querySelectorAll('input[type=password]').forEach(input=>input.value='');
  send('POST',form.dataset.route,data);
});
document.addEventListener('click',event=>{
  const a=event.target.closest('a');
  if (!a) return;
  const route=a.dataset.route || (a.getAttribute('href')?.startsWith('#/') ? a.getAttribute('href').slice(1) : null);
  if (!route) return;
  event.preventDefault();
  if (!busy) send('GET',route);
});
window.addEventListener('hashchange',()=>{ if (!busy) send('GET',routeFromHash()); });
window.addEventListener('pagehide',()=>{ requestEpoch++; activeRequest?.abort(); activeRequest=null; busy=false; session=''; document.getElementById('main').replaceChildren(); });
window.addEventListener('pageshow',event=>{ if (event.persisted) send('GET',routeFromHash()); });
send('GET',routeFromHash());
