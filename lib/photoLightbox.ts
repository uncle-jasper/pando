// Photo viewing for sent issues. Email clients don't run JavaScript (and Gmail strips the
// CSS-only tricks), so a real pop-up lightbox can't live inside the email itself. Instead:
//
//   - In the email ("link" mode), every photo — hero, inline, gallery, full-bleed — links to
//     the issue's web page (/p/[id]) with a #photo-N pointer to that exact photo.
//   - On the web page ("lightbox" mode), a small inline script opens the photo large over the
//     page, with ✕ / Esc / tap-outside to close and arrows / swipe to step through EVERY photo
//     in the issue, in reading order. Closing leaves the reader on that photo in the issue.
//
// Both modes number photos identically (data-photo="N", in document order), so the #photo-N
// from an email always lands on the right one.

export type PhotoMode = "none" | "link" | "lightbox";

// The gallery renderer (lib/markdown/email.ts) wraps each gallery photo in a link straight to
// its image file. Those are removed here so gallery photos get handled like every other photo.
const GALLERY_LINK = /<a href="[^"]*" target="_blank" rel="noopener" class="gallery-link">(<img\b[^>]*>)<\/a>/g;

export function applyPhotoMode(html: string, mode: PhotoMode, linkBase: string): string {
  if (mode === "none") return html;
  let n = 0;
  let anchorDepth = 0;
  return html.replace(GALLERY_LINK, "$1").replace(/<a\b[^>]*>|<\/a>|<img\b[^>]*>/g, (tag) => {
    if (tag.startsWith("</a")) {
      anchorDepth = Math.max(0, anchorDepth - 1);
      return tag;
    }
    if (tag.startsWith("<a")) {
      anchorDepth++;
      return tag;
    }
    n++;
    const img = tag.replace(/^<img\b/, `<img data-photo="${n}"`);
    // A photo you've deliberately linked somewhere yourself ([![](photo)](url)) keeps that link.
    if (mode !== "link" || anchorDepth > 0) return img;
    const href = `${linkBase}#photo-${n}`;
    return `<a href="${href}" class="photo-link" style="display:block;text-decoration:none">${img}</a>`;
  });
}

// Appended after CSS inlining (so juice leaves it alone). Plain JS, no dependencies.
export const LIGHTBOX_SNIPPET = `
<style>
img[data-photo]{cursor:zoom-in}
a img[data-photo]{cursor:pointer}
.lb{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;font-family:inherit;color:#eee;-webkit-user-select:none;user-select:none}
.lb[hidden]{display:none}
.lb-fig{margin:0;display:flex;flex-direction:column;align-items:center;max-width:94vw}
.lb-img{max-width:94vw;max-height:84vh;width:auto;height:auto;object-fit:contain;display:block}
.lb-cap{font-size:13px;color:#bbb;margin-top:10px;text-align:center;min-height:1em;padding:0 12px}
.lb button{position:absolute;background:none;border:0;color:#eee;font:inherit;cursor:pointer;opacity:.75;padding:12px 16px;line-height:1}
.lb button:hover,.lb button:focus-visible{opacity:1}
.lb .lb-close{top:6px;right:6px;font-size:26px}
.lb .lb-prev,.lb .lb-next{top:50%;transform:translateY(-50%);font-size:44px}
.lb .lb-prev{left:2px}.lb .lb-next{right:2px}
.lb-count{position:absolute;top:16px;left:18px;font-size:13px;color:#aaa}
@media (max-width:600px){.lb .lb-prev,.lb .lb-next{top:auto;bottom:8px;transform:none}}
</style>
<script>
(function(){
  var imgs=[].slice.call(document.querySelectorAll('img[data-photo]'));
  if(!imgs.length)return;
  var box=document.createElement('div');
  box.className='lb';box.hidden=true;box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<div class="lb-count"></div><button class="lb-close" aria-label="Close">\\u2715</button>'+
    '<button class="lb-prev" aria-label="Previous photo">\\u2039</button>'+
    '<figure class="lb-fig"><img class="lb-img" alt=""><figcaption class="lb-cap"></figcaption></figure>'+
    '<button class="lb-next" aria-label="Next photo">\\u203a</button>';
  document.body.appendChild(box);
  var big=box.querySelector('.lb-img'),cap=box.querySelector('.lb-cap'),count=box.querySelector('.lb-count');
  var prev=box.querySelector('.lb-prev'),next=box.querySelector('.lb-next');
  if(imgs.length<2){prev.style.display='none';next.style.display='none';}
  var cur=0;
  function show(i){
    cur=(i+imgs.length)%imgs.length;
    var s=imgs[cur];
    big.src=s.currentSrc||s.src;big.alt=s.alt||'';
    cap.textContent=s.alt||'';
    count.textContent=imgs.length>1?(cur+1)+' / '+imgs.length:'';
    box.hidden=false;document.documentElement.style.overflow='hidden';
    [cur-1,cur+1].forEach(function(j){var p=imgs[(j+imgs.length)%imgs.length];new Image().src=p.currentSrc||p.src;});
  }
  function close(){
    box.hidden=true;document.documentElement.style.overflow='';
    if(location.hash)history.replaceState(null,'',location.pathname+location.search);
    imgs[cur].scrollIntoView({block:'center'});
  }
  imgs.forEach(function(im,i){
    if(im.closest('a'))return;
    im.addEventListener('click',function(){show(i);});
  });
  box.querySelector('.lb-close').addEventListener('click',close);
  prev.addEventListener('click',function(e){e.stopPropagation();show(cur-1);});
  next.addEventListener('click',function(e){e.stopPropagation();show(cur+1);});
  box.addEventListener('click',function(e){if(e.target===box||e.target.className==='lb-fig')close();});
  document.addEventListener('keydown',function(e){
    if(box.hidden)return;
    if(e.key==='Escape')close();
    else if(e.key==='ArrowLeft')show(cur-1);
    else if(e.key==='ArrowRight')show(cur+1);
  });
  var x0=null;
  box.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
  box.addEventListener('touchend',function(e){
    if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;x0=null;
    if(Math.abs(dx)>50)show(dx<0?cur+1:cur-1);
  });
  function fromHash(){
    var m=location.hash.match(/^#photo-(\\d+)$/);if(!m)return;
    for(var i=0;i<imgs.length;i++){if(imgs[i].getAttribute('data-photo')===m[1]){imgs[i].scrollIntoView({block:'center'});show(i);return;}}
  }
  window.addEventListener('hashchange',fromHash);
  fromHash();
})();
</script>`;
