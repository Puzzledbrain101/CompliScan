// Page handoff: the "CompliScan this page" bookmarklet opens the web app in a
// named tab and passes it the store page's HTML with postMessage. The web app
// (already allowed by the backend's CORS list) then runs the check, so store
// Content-Security-Policy and bot walls never come into play.

export const HANDOFF_PARAM = 'handoff';
export const PAGE_MESSAGE = 'compliscan:page';
export const RECEIVED_MESSAGE = 'compliscan:received';

// Source of the bookmarklet. It offers the page every 250 ms until the app
// confirms receipt (the new tab needs a moment to load), for up to 15 s.
export function bookmarkletCode(appOrigin) {
  const app = JSON.stringify(appOrigin);
  const source = `(()=>{
const A=${app};
const w=window.open(A+'/?${HANDOFF_PARAM}=1','compliscan');
if(!w){alert('Allow pop-ups for this site to use CompliScan.');return;}
const d={type:'${PAGE_MESSAGE}',url:location.href,html:document.documentElement.outerHTML};
let n=0;
const t=setInterval(()=>{if(++n>60){clearInterval(t);return;}try{w.postMessage(d,A);}catch(e){}},250);
addEventListener('message',e=>{if(e.origin===A&&e.data==='${RECEIVED_MESSAGE}')clearInterval(t);});
})();`;
  return `javascript:${encodeURIComponent(source.replace(/\n/g, ''))}`;
}

export function isHandoffLaunch() {
  return new URLSearchParams(window.location.search).has(HANDOFF_PARAM) && Boolean(window.opener);
}

// Accept one page from the tab that opened us. The page's claimed URL must
// match the origin that actually sent it.
export function listenForPage(onPage) {
  const onMessage = (event) => {
    if (event.source !== window.opener) return;
    const data = event.data;
    if (!data || data.type !== PAGE_MESSAGE || typeof data.url !== 'string' || typeof data.html !== 'string') return;
    let pageOrigin;
    try {
      pageOrigin = new URL(data.url).origin;
    } catch {
      return;
    }
    if (pageOrigin !== event.origin) return;

    window.removeEventListener('message', onMessage);
    event.source.postMessage(RECEIVED_MESSAGE, event.origin);
    onPage({ url: data.url, html: data.html });
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

export function clearHandoffParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete(HANDOFF_PARAM);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}
