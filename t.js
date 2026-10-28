/* Gaming Scroll visit counter: cookie-free, no personal data. Runs only on the public site. */
(function(){try{
  var h=location.hostname;
  if(!/^https?:$/.test(location.protocol)||!h||h==="localhost"||/claude\.ai$|claudeusercontent\.com$|claude\.site$/.test(h))return;
  if(navigator.doNotTrack==="1"||window.doNotTrack==="1"||navigator.globalPrivacyControl)return;
  function send(o){o.p=location.pathname;o.r=document.referrer||"";o.w=window.innerWidth||0;var b=JSON.stringify(o);
    try{if(navigator.sendBeacon&&navigator.sendBeacon("/api/hit",new Blob([b],{type:"application/json"})))return}catch(e){}
    try{fetch("/api/hit",{method:"POST",body:b,keepalive:true,headers:{"content-type":"application/json"}})}catch(e){}}
  send({t:"pv"});
  /* count a story only when the visitor chose it: a link with #story, or a click or key press */
  var sent={},timer=null,acted=!!location.hash;
  ["pointerdown","keydown","touchstart"].forEach(function(e){addEventListener(e,function(){acted=true},{capture:true,passive:true})});
  function check(){clearTimeout(timer);var id=location.hash.slice(1);if(!acted||!/^[a-z0-9-]{2,40}$/.test(id)||sent[id])return;
    timer=setTimeout(function(){if(location.hash.slice(1)===id&&!sent[id]){sent[id]=1;send({t:"story",s:id})}},2000)}
  var rs=history.replaceState,ps=history.pushState;
  history.replaceState=function(){var r=rs.apply(this,arguments);check();return r};
  history.pushState=function(){var r=ps.apply(this,arguments);check();return r};
  addEventListener("hashchange",check);check();
}catch(e){}})();
