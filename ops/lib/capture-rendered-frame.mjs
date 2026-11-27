// Capture a genuinely rendered scene after temporary QA draw suppression. The
// normal resize observer invalidates a paused world; no flight state is changed.
export async function captureRenderedFrame(browser,path){
 const viewport=await browser.evaluate('({width:innerWidth,height:innerHeight,deviceScaleFactor:devicePixelRatio,mobile:false})');
 await browser.send('Emulation.setDeviceMetricsOverride',{...viewport,width:viewport.width+4,height:viewport.height+4});
 await browser.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
 await browser.send('Emulation.setDeviceMetricsOverride',viewport);
 await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await browser.evaluate('(()=>{const q=window.__qaFrameCapture={original:window.requestAnimationFrame,pending:[]};window.requestAnimationFrame=f=>{q.pending.push(f);return 0;};})()');
 try{await browser.screenshot(path);}finally{await browser.evaluate('(()=>{const q=window.__qaFrameCapture;window.requestAnimationFrame=q.original;for(const f of q.pending)q.original.call(window,f);delete window.__qaFrameCapture;})()');}
}
