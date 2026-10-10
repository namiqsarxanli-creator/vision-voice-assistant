(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('scene'),effects=$('dynamics'),ctx=effects.getContext('2d');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  let renderer;
  function boot(){try{return new NeonRenderer(canvas);}catch(error){return error;}}
  renderer=boot();
  if(renderer instanceof Error)renderer=boot();
  if(renderer instanceof Error){$('notice').textContent=renderer.message;document.body.classList.add('show-controls');return;}

  const palettes=[{name:'MAVİ',rgb:[0.005,.55,1],hot:[1,.57,.12]},
    {name:'GÜNƏŞ',rgb:[1,.27,.035],hot:[1,.78,.27]},
    {name:'BƏNÖVŞƏ',rgb:[.39,.16,1],hot:[1,.30,.62]},
    {name:'NEFRİT',rgb:[.015,.79,.49],hot:[.85,1,.37]}];

  // GROOT REJİMİ. Səhifə həmişəki kimi açılır; bu, yalnız istifadəçi
  // "groot mode" deyəndə oyanır. Bacarıqlar dəyişmir - yalnız xasiyyət,
  // səs və rəng.
  let groot=false;
  const GROOT_PALETTE={name:'GROOT',rgb:[.16,.86,.28],hot:[1,.74,.24]};
  // Səs tanıma "groot"u müxtəlif cür yaza bilir, ona görə geniş tutur.
  const GROOT_ON=/\b(groot|grut|qrut|qroot)\b[^a-zə]{0,3}(mode|mod|rejim|rejimi)?/i;
  const GROOT_OFF=/\b(normal|vision|adi)[^a-zə]{0,3}(mode|mod|rejim|rejimi)\b|\bgroot\s*(off|son|bitdi|sondur|söndür)\b/i;

  let mode=0,light=1,pulse=0,scatter=0,yaw=0,pitch=0,energy=.1,quality=1;
  let lit=true;   // pinch jesti nüvə işığını söndürüb-yandırır
  // Yığılma (materializasiya): 1 = hissəciklər tam dağınıq, 0 = model formalaşıb.
  // Shader-də erupt = sin(uScatter*π) olduğu üçün tam dağınıqlıq uScatter=0.5-dir.
  // Ona görə 1→0 gedişini 0.5→0 aralığına xəritələyirik: partlayış yox, yalnız yığılma.
  let forming=0,think=0;
  const FORM_SECONDS=2.4;
  // Danışıq bitdikdən sonra mikrofonu bu qədər gec açırıq (əks-səda süzgəci).
  const ECHO_GUARD_MS=700;
  // Cavabdan sonra mikrofon özü açılsın - hər dəfə DANIŞ düyməsinə basmaq
  // lazım gəlməsin. Yalnız alqış dinləyicisi işləyəndə: susmanı aşkarlamaq
  // onun səviyyə ölçüsünə bağlıdır, onsuz mikrofon açıq qalardı.
  let micMuted=false,micEpoch=0,micClapRestore=false;
  let hushed=false;          // SUS basılıbsa növbəti avtomatik dinləmə ləğv olunur
  function canFreeTalk(){return !!clapListener?.active&&!dormant&&!hushed&&!micMuted;}
  function resumeListening(){
    if(!canFreeTalk())return;
    setTimeout(()=>{
      if(canFreeTalk()&&state==='idle'&&!listening)startListening();
    },ECHO_GUARD_MS);
  }
  // Açılışda referans görünüşü göstərilir. Esc modeli yuxuya salır.
  let dormant=true;
  let W=innerWidth,H=innerHeight,last=performance.now(),fpsTime=0,fpsCount=0;
  let rings=[];


  // ---- söhbət vəziyyəti -------------------------------------------------
  // idle -> listening -> thinking -> speaking -> idle
  let state='idle';
  // --- mövqe -----------------------------------------------------------
  // Koordinat YALNIZ öz lokal serverimizə gedir; oradan da yalnız
  // OpenStreetMap-ə. AI provayderinə (Groq) heç vaxt göndərilmir - model
  // sadəcə hazır yer siyahısını görür.
  // Brauzer yaddaşında da saxlamırıq: səhifə bağlananda itir.
  let geo=null;              // {lat, lon, accuracy} və ya null
  let geoWatch=null;
  const GEO_MAX_AGE=120000;  // 2 dəqiqədən köhnə mövqe təzələnir

  let clapListener=null,clapWanted=false;
  // Brauzer mikrofonu yalnız istifadəçi jestindən sonra verir, ona görə alqış
  // rejimini avtomatik başlada bilmirik. Seçimi yadda saxlayıb səhifədəki ilk
  // klik/düymə basışında özümüz bərpa edirik - istifadəçi hər yeniləmədə
  // düyməni axtarmasın.
  const CLAP_PREF='humanoid.clapWake';
  const clapPref=()=>{try{return localStorage.getItem(CLAP_PREF)==='1';}catch{return false;}};
  const setClapPref=(on)=>{try{localStorage.setItem(CLAP_PREF,on?'1':'0');}catch{}};
  // Sükutda avtomatik dayanma (yalnız alqış rejimi açıqdırsa səviyyə gəlir).
  let heardVoice=false,lastVoiceAt=0;

  // --- diqqət dövrü -----------------------------------------------------
  // Uzun sükutdan sonra VISION sönükləşir və başı əyilir; hər hansı təmas onu
  // dərhal dirildir. Yuxu rejimindən (dormant) fərqlidir: model görünür qalır.
  const IDLE_DROWSY_MS=90_000;
  let lastTouchAt=performance.now();
  let attention=1;
  const touch=()=>{lastTouchAt=performance.now();};

  // --- söz kəsmə --------------------------------------------------------
  // VISION danışarkən istifadəçi danışsa susur. Əsas çətinlik əks-səsdir:
  // mikrofon VISION-un öz səsini də eşidir. Ona görə mikrofon səviyyəsini
  // öz çıxışımızın səviyyəsi ilə MÜQAYİSƏ edirik - istifadəçi ondan nəzərəçarpacaq
  // dərəcədə ucadırsa kəsmə sayılır.
  const BARGE_MIN=0.08;       // bundan aşağısı ümumiyyətlə nəzərə alınmır
  // 2.2 çox sərt idi - istifadəçi danışırdı, VISION susmurdu. Yanlış kəsilmə
  // ucuz başa gəlir (bir cümlə yarımçıq qalır), kəsilməməsi isə bahalı.
  const BARGE_RATIO=1.6;      // öz səsimizdən bu qədər ucadırsa - istifadəçidir
  // 180 ms qapı çırpılmasına, klaviaturaya kifayət edirdi - VISION ətraf
  // səsdən susurdu. 350 ms davamlı səs isə yalnız danışıqda olur.
  const BARGE_HOLD_MS=350;
  let bargeScore=0,ambientPeak=.02,lastLevelAt=0;
  let selfLevel=0;

  /** Öz səsimizin anlıq gücü. Həm rəsm döngəsindən, həm də mikrofon tick-indən
   *  çağırılır: rAF fon tabda ~1 kadr/s-ə düşür və sözkəsmə üçün lazım olan
   *  müqayisə köhnə rəqəmlə aparılardı. */
  function sampleSelfLevel(){
    if(!voiceAnalyser){if(state!=='speaking')selfLevel=0;return;}
    voiceAnalyser.getFloatTimeDomainData(voiceData);
    let sum=0;
    for(let i=0;i<voiceData.length;i++)sum+=voiceData[i]*voiceData[i];
    selfLevel=Math.sqrt(sum/voiceData.length);
  }
  const history=[];
  const STATE_TEXT={idle:'HAZIR',listening:'DİNLƏYİR',thinking:'DÜŞÜNÜR',speaking:'CAVAB VERİR'};
  // Hər vəziyyət üçün hədəf enerji: hissəciklərin nə qədər canlı olduğunu idarə edir.
  const STATE_ENERGY={idle:.1,listening:.62,thinking:.85,speaking:.5};

  function setState(next){
    if(state===next)return;
    // Yuxudaykən danışmaq/yazmaq da oyadır - yalnız alqışla məhdud deyil.
    if(dormant&&next!=='idle')materialize();
    state=next;
    // Boş olmayan hər vəziyyətdə alqış tanıma dayanır: assistentin öz səsi,
    // yazma və emal səs-küyü yalançı oyatma yaratmasın.
    // Yalnız yazı zamanı dayandırırıq (mikrofonu recorder tutur). Danışarkən
    // açıq qalır - söz kəsmə onunla işləyir.
    clapListener?.setPaused(next==='listening');
    if(next!=='speaking')bargeScore=0;
    $('tracking').textContent=STATE_TEXT[next];
    $('gesture').textContent=next==='idle'?'GÖZLƏMƏ REJİMİ':STATE_TEXT[next];
    $('talk').dataset.state=next==='idle'?'':next;
    // Vəziyyət dəyişəndə görünən bir təkan: dalğa halqası + işıq zərbəsi.
    if(next!=='idle'){pulse=Math.max(pulse,next==='speaking'?.8:.55);rings.push({age:0});}
  }

  function resize(){
    W=innerWidth;H=innerHeight;renderer.resize();
    const dpr=Math.min(devicePixelRatio||1,1.5);
    effects.width=W*dpr;effects.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function render(now){
    const elapsed=(now-last)/1000,dt=Math.min(elapsed,.05);last=now;const time=now*.001;
    // Yuxu rejimində səhnə heç çəkilmir: boş ekran, GPU da boş yerə işləmir.
    if(dormant){
      if(!dormantCleared)clearScene();
      requestAnimationFrame(render);
      return;
    }
    fpsTime+=elapsed;fpsCount++;
    if(fpsTime>.7){
      const avgFps=fpsCount/fpsTime;$('fps').textContent=Math.round(avgFps)+' KADR/S';fpsCount=0;fpsTime=0;
      if(avgFps<42&&quality>.55){quality=Math.max(.55,quality-.15);renderer.setQuality(quality);}
      else if(avgFps>55&&quality<1){quality=Math.min(1,quality+.1);renderer.setQuality(quality);}
    }

    // Baş yalnız əl izləməsi və sərbəst yüngül hərəkətlə idarə olunur.
    if(hand.active&&now-lastHandAt>1800){hand={active:false};gestureTracker.reset();$('gesture').textContent='ƏL GÖZLƏNİLİR';}
    const input=hand.active?hand
      :{x:.5+Math.sin(time*.25)*.018,y:.5};
    const ease=1-Math.exp(-dt*5);
    yaw+=((input.x-.5)*.50-yaw)*ease;pitch+=(clamp((input.y-.5)*.16,-.08,.08)-pitch)*ease;
    // Düşünərkən nüvə işığı bir qədər sönür, cavab verərkən tam yanır.
    // Yığılarkən işıq sıfırdan qalxır: model formalaşdıqca nüvə yanır.
    const litTarget=(forming>0||!lit)?0:(state==='thinking'?.55:1);
    light+=(litTarget-light)*(1-Math.exp(-dt*(forming>0?3:6)));
    pulse=Math.max(0,pulse-dt*1.55);scatter=Math.max(0,scatter-dt*.65);
    if(forming>0)forming=Math.max(0,forming-dt/FORM_SECONDS);
    // Yığılma gedirsə uScatter-i o idarə edir (0.5 = tam dağınıq → 0 = yığılıb).
    // Sona yaxın yumşalsın deyə kub əyri.
    const sceneScatter=forming>0?Math.pow(forming,3)*.5:scatter;
    // Dərin səs çalınırsa nüvə real amplitüda görə döyünür - söz sərhədindən
    // daha dəqiqdir, çünki səsin özünü ölçür.
    sampleSelfLevel();
    if(voiceAnalyser)pulse=Math.max(pulse,Math.min(1,selfLevel*7));
    // Dinləyərkən yüngül nəfəs, cavab verərkən sözlərə görə (aşağıda) təkan verilir.
    let target=STATE_ENERGY[state];
    if(state==='listening')target+=Math.sin(time*3.1)*.06;
    energy+=(target-energy)*ease;$('energy').style.width=(12+energy*88)+'%';

    // Diqqət: sükutda 1 → 0.3. Yalnız boş dayananda yuxulayır - danışarkən,
    // düşünərkən və əl izlənərkən oyaq qalır.
    const drowsy=state==='idle'&&!listening&&!hand.active&&now-lastTouchAt>IDLE_DROWSY_MS;
    attention+=((drowsy?.3:1)-attention)*(1-Math.exp(-dt*.9));
    // Yuxulayanda baş azca aşağı əyilir - canlı görünür.
    const droop=(1-attention)*.055;
    // Düşünərkən sinir impulsları (şaderdə uThink).
    think+=((state==='thinking'?1:0)-think)*(1-Math.exp(-dt*4));

    renderer.render({time,yaw,pitch:pitch+droop,light:light*attention,pulse,
      scatter:sceneScatter,formation:1-forming,energy:energy*attention,think,
      blue:activePalette().rgb,gold:activePalette().hot});

    ctx.clearRect(0,0,W,H);ctx.globalCompositeOperation='lighter';
    const cx=W*.5+Math.sin(yaw)*H*.18,cy=H*.505;
    for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.age+=dt;if(r.age<0)continue;if(r.age>1.8){rings.splice(i,1);continue;}
      const radius=(.17+r.age*.29)*H;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.lineWidth=.7;
      ctx.strokeStyle='rgba(0,143,255,'+((1-r.age/1.8)*.24)+')';ctx.stroke();}
    if(pulse>.01){const g=ctx.createRadialGradient(cx,cy,0,cx,cy,H*.22);g.addColorStop(0,'rgba(255,190,67,'+pulse*.12+')');g.addColorStop(1,'rgba(255,140,22,0)');ctx.fillStyle=g;ctx.fillRect(cx-H*.22,cy-H*.22,H*.44,H*.44);}
    ctx.globalCompositeOperation='source-over';requestAnimationFrame(render);
  }

  // ---- danışma (TTS) ----------------------------------------------------
  const synth=window.speechSynthesis;
  // Dərin "titan" səsi. Vacib: Chrome-un Google səsləri serverdə sintez olunur və
  // pitch parametrini NƏZƏRƏ ALMIR; lokal Microsoft (SAPI) səsləri isə alır.
  // Ona görə dərin kişi SAPI səsi üstün tutulur - yoxsa pitch susdurulur.
  const DEEP_VOICES=['Microsoft David','Microsoft Mark','Microsoft George','Daniel','Alex','Google UK English Male'];
  const VOICE={lang:'en-US',rate:1,pitch:.55};

  function pickVoice(){
    const voices=synth.getVoices();
    for(const name of DEEP_VOICES){
      const match=voices.find(v=>v.name.includes(name));
      if(match)return match;
    }
    return voices.find(v=>v.lang.startsWith('en'))||null;
  }

  // Danışarkən altdan gedən sub-bas uğultu: TTS-in özü kifayət qədər dərin
  // olmayanda çəkini o verir. Səs sintetikdir, fayl yoxdur.
  let rumble=null;
  function startRumble(){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return;
      toneContext=clapListener?.context||toneContext||new Ctx();
      const ac=toneContext;
      if(ac.state==='suspended')ac.resume().catch(()=>{});
      stopRumble();
      const osc=ac.createOscillator(),sub=ac.createOscillator(),gain=ac.createGain();
      osc.type='sine';osc.frequency.value=52;
      sub.type='sine';sub.frequency.value=78.5;   // yüngül döyünmə yaradır
      gain.gain.setValueAtTime(.0001,ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(.045,ac.currentTime+.35);
      osc.connect(gain);sub.connect(gain);gain.connect(ac.destination);
      osc.start();sub.start();
      rumble={osc,sub,gain,ac};
    }catch(_){ /* uğultu olmasa da danışıq işləyir */ }
  }
  function stopRumble(){
    if(!rumble)return;
    const {osc,sub,gain,ac}=rumble;rumble=null;
    try{
      gain.gain.cancelScheduledValues(ac.currentTime);
      gain.gain.setValueAtTime(gain.gain.value||.0001,ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.4);
      osc.stop(ac.currentTime+.45);sub.stop(ac.currentTime+.45);
    }catch(_){}
  }

  // Backend-in dərin səsi (Windows SAPI + SSML). Alınmasa brauzer TTS-inə qayıdır.
  let voiceSource=null,voiceAnalyser=null,voiceData=null,voiceFinish=null;

  function stopVoiceAudio(){
    if(!voiceSource)return;
    try{voiceSource.onended=null;voiceSource.stop();}catch(_){}
    voiceSource=null;voiceAnalyser=null;
    const finish=voiceFinish;voiceFinish=null;finish?.();
  }

  async function speakDeep(text){
    const speechSession=micEpoch;
    if(micMuted)return;
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)throw new Error('audio yoxdur');
    const response=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text,persona:groot?'groot':'vision'})});
    if(!response.ok)throw new Error('speak '+response.status);
    const bytes=await response.arrayBuffer();

    toneContext=clapListener?.context||toneContext||new Ctx();
    const ac=toneContext;
    if(ac.state==='suspended')await ac.resume();
    const buffer=await ac.decodeAudioData(bytes);
    if(micMuted||speechSession!==micEpoch)return;

    stopVoiceAudio();
    const source=ac.createBufferSource();
    source.buffer=buffer;
    // Vecna üslubu: yüngül ton endirməsi, tünd rezonans və yumşaq xırıltı.
    source.playbackRate.value=1;
    const lowpass=ac.createBiquadFilter();
    // 2400 Hz samitləri (s, ş, t) boğurdu - sözlər bir-birinə qarışırdı.
    // Groot ağacdır - səsi daha kar və qapalı olmalıdır.
    lowpass.type='lowpass';lowpass.frequency.value=groot?2600:4200;lowpass.Q.value=.65;
    const shelf=ac.createBiquadFilter();
    shelf.type='lowshelf';shelf.frequency.value=220;
    shelf.gain.value=groot?14:6;                        // bas gücləndirmə
    const gain=ac.createGain();gain.gain.value=1.05;
    // Analizator: nüvə real səs amplitüduna görə döyünsün (söz sərhədindən daha dəqiq).
    voiceAnalyser=ac.createAnalyser();voiceAnalyser.fftSize=512;
    voiceData=new Float32Array(voiceAnalyser.fftSize);

    // GROOT: yüngül doyma (waveshaper) səsə çınqıl/gövdə xışıltısı verir.
    // Təmiz sinus əyrisi "robot" səslənir, ağac isə kobud olmalıdır. Əyri
    // yumşaqdır (tanh) - sərt kəsmə sözləri anlaşılmaz edərdi.
    let chain=source.connect(lowpass).connect(shelf);
    if(groot){
      const shaper=ac.createWaveShaper();
      const curve=new Float32Array(1024);
      for(let i=0;i<curve.length;i++){
        const x=(i/(curve.length-1))*2-1;
        curve[i]=Math.tanh(x*2.6)/Math.tanh(2.6);
      }
      shaper.curve=curve;shaper.oversample='2x';
      chain=chain.connect(shaper);
    }
    // Short dark resonance adds depth without a long echo or feedback loop.
    if(!groot){
      const rasp=ac.createWaveShaper(),curve=new Float32Array(1024);
      for(let i=0;i<curve.length;i++){const x=i/1023*2-1;curve[i]=Math.tanh(x*.7)/Math.tanh(.7);}
      rasp.curve=curve;rasp.oversample='2x';chain=chain.connect(rasp);
      const delay=ac.createDelay(.2),wet=ac.createGain(),dark=ac.createBiquadFilter();
      delay.delayTime.value=.035;wet.gain.value=.035;dark.type='lowpass';dark.frequency.value=1400;
      chain.connect(delay).connect(dark).connect(wet).connect(gain);
    }
    chain.connect(gain);
    const limiter=ac.createDynamicsCompressor();
    limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=5;
    limiter.attack.value=.003;limiter.release.value=.18;
    gain.connect(limiter);limiter.connect(voiceAnalyser);limiter.connect(ac.destination);

    voiceSource=source;
    setState('speaking');
    startRumble();
    await new Promise((resolve)=>{
      voiceFinish=resolve;
      source.onended=()=>{voiceSource=null;voiceAnalyser=null;voiceFinish=null;resolve();};
      source.start();
    });
    stopRumble();setState('idle');
  }

  // VISION-un son dediyi cümlə. Mikrofon dinamikdən öz səsimizi tutarsa,
  // Whisper onu yazıya çevirir və sual kimi göndərilir - bunu tanımaq üçün
  // saxlayırıq (aşağıda isEcho).
  let lastSpoken='';

  function speak(text){
    if(micMuted){setState('idle');return Promise.resolve();}
    const speechSession=micEpoch;
    lastSpoken=text||'';
    return speakDeep(text).catch(()=>{if(!micMuted&&speechSession===micEpoch)return speakBrowser(text);});
  }

  /** Mətn VISION-un öz sözlərinin əks-sədasıdırmı? */
  function isEcho(text){
    if(!lastSpoken)return false;
    const words=t=>new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>2));
    const heard=words(text), said=words(lastSpoken);
    if(heard.size<3)return false;
    let shared=0;
    for(const word of heard)if(said.has(word))shared++;
    // Eşidilən sözlərin yarıdan çoxu bizim dediyimizdirsə - bu, əks-sədadır.
    return shared/heard.size>0.5;
  }

  // Promise qaytarır: danışıq bitəndə həll olunur (təqdimatdan sonra dinləməyə
  // keçmək üçün lazımdır).
  function speakBrowser(text){
    if(!synth){setState('idle');return Promise.resolve();}
    synth.cancel();
    const utter=new SpeechSynthesisUtterance(text);
    utter.lang=VOICE.lang;utter.rate=VOICE.rate;utter.pitch=VOICE.pitch;
    const voice=pickVoice();
    if(voice){utter.voice=voice;utter.lang=voice.lang;}
    // Hər sözdə nüvəyə kiçik təkan: səs dalğası effekti yaradır.
    utter.onboundary=()=>{pulse=Math.min(1,pulse+.22);energy=Math.min(1,energy+.06);};
    setState('speaking');
    startRumble();
    return new Promise(resolve=>{
      const finish=()=>{stopRumble();setState('idle');resolve();};
      utter.onend=finish;
      utter.onerror=finish;
      synth.speak(utter);
    });
  }

  // Alqışla oyananda VISION qısa salamlayır: adını və kömək təklifini
  // deyir. Mətn İngiliscədir - assistentin danışıq dili ilə eynidir.
  const INTRO="I am Vision. How can I help you?";

  /** Yığılma bitəndən sonra təqdimat, ardınca dinləmə. */
  function introduce(){
    setTimeout(()=>{
      // Bu arada Esc basılıbsa və ya artıq danışırsa müdaxilə etmirik.
      if(dormant||micMuted||state!=='idle')return;
      $('notice').textContent='VISION özünü təqdim edir…';
      speak(INTRO).then(()=>{
        if(dormant)return;
        $('notice').textContent='Dinləyirəm — sualını ver.';
        // Səs bitən kimi açsaq, dinamikin quyruğunu və otaq əks-sədasını
        // özümüz eşidirik. Qısa fasilə onun sönməsinə imkan verir.
        setTimeout(()=>{if(!dormant&&state==='idle'&&!listening)startListening();},ECHO_GUARD_MS);
      });
    },FORM_SECONDS*1000);
  }

  // İcra olunan əməliyyatlar görünsün: istifadəçi assistentin nə etdiyini
  // yalnız eşitməməli, həm də görməlidir.
  const TOOL_LABEL={open_app:'PROQRAM AÇILDI',open_url:'SAYT AÇILDI',search_youtube:'YOUTUBE AXTARIŞI',
    search_files:'FAYL AXTARIŞI',read_file:'FAYL OXUNDU',system_info:'SİSTEM MƏLUMATI',
    web_search:'İNTERNET AXTARIŞI',remember:'YADDA SAXLANDI',forget:'YADDAŞDAN SİLİNDİ',
    forget_all:'YADDAŞ TƏMİZLƏNDİ',play_youtube:'MAHNI AÇILDI',
    calendar_events:'TƏQVİM OXUNDU',recent_mail:'MAİLLƏR OXUNDU',read_mail:'MƏKTUB OXUNDU',
    draft_reply:'QARALAMA HAZIRLANDI',where_am_i:'MÖVQE MÜƏYYƏN EDİLDİ',
    find_nearby:'YAXINLIQ AXTARILDI',search_web:'BRAUZERDƏ AXTARILDI',
    open_result:'NƏTİCƏ AÇILDI',scroll_page:'SƏHİFƏ SÜRÜŞDÜ',go_back:'GERİ QAYIDILDI',
    read_page_text:'SƏHİFƏ OXUNDU',media_control:'OYNATMA İDARƏSİ',
    close_browser:'BRAUZER BAĞLANDI',meetings:'CƏDVƏL OXUNDU',add_meeting:'GÖRÜŞ ƏLAVƏ EDİLDİ',open_sheet:'CƏDVƏL AÇILDI',run_real_project:'LAYİHƏ İŞƏ DÜŞDÜ'};

  function showActions(actions){
    const box=$('actions');
    if(!box)return;
    if(!actions||!actions.length){box.hidden=true;box.textContent='';return;}
    box.hidden=false;
    box.textContent=actions.map(a=>(a.ok?'✓ ':'✕ ')+(TOOL_LABEL[a.tool]||a.tool)).join('   ');
    // Uğursuzluğun səbəbi aşağı sətirdə - "✕" tək başına heç nə demir.
    const failed=actions.find(a=>!a.ok&&a.error);
    if(failed)$('notice').textContent='Səbəb: '+failed.error.split(String.fromCharCode(10))[0].slice(0,160);
  }

  /** "groot mode" / "normal mode" - danışıqdan və ya YAZ-dan gələ bilər.
   *  Tanıyıbsa true qaytarır: belə halda mətn modelə GÖNDƏRİLMİR, çünki bu,
   *  sual deyil - interfeys əmridir. */
  function handleGrootCommand(text){
    if(GROOT_OFF.test(text)){
      if(!groot)return false;
      setGroot(false);
      return true;
    }
    if(GROOT_ON.test(text)&&!groot){setGroot(true);return true;}
    return false;
  }

  function setGroot(on){
    groot=on;
    showPaletteName();
    scatter=1;pulse=1;rings.push({age:0});      // görsəl keçid
    document.body.dataset.groot=on?'1':'';
    const line=on?'I am Groot! Groot is awake and very happy to meet you!'
                 :'Vision is back. How can I help?';
    $('replyLine').textContent=on?'Mən Grootam! Groot oyandı və çox sevinir!'
                                 :'Vision qayıtdı. Necə kömək edim?';
    $('replyLine').hidden=false;
    $('notice').textContent=on?'GROOT REJİMİ — normala qayıtmaq üçün "normal mode" de.'
                              :'Normal rejim.';
    speak(line).then(resumeListening,resumeListening);
  }

  // ---- backend ----------------------------------------------------------
  async function ask(message,voiceSession=null){
    $('userLine').textContent=message;$('userLine').hidden=false;
    // İnterfeys əmridirsə modelə getmir: həm sürətlidir, həm token yemir.
    if(handleGrootCommand(message)){$('replyLine').hidden=false;return;}
    $('replyLine').hidden=true;
    setState('thinking');
    try{
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(Object.assign({message,history,persona:groot?'groot':'vision'},
          geo?{location:geo}:{}))});
      if(!response.ok)throw new Error('Server '+response.status);
      const data=await response.json();
      if(voiceSession!==null&&(micMuted||voiceSession!==micEpoch))return;
      // Kontekstə İngiliscə yazılır - model onunla işləyir.
      history.push({role:'user',content:message},{role:'assistant',content:data.reply});
      if(history.length>20)history.splice(0,history.length-20);
      // Ekranda Azərbaycanca göstərilir, ucadan İngiliscə oxunur: təqdimatda
      // həm oxunaqlı olur, həm də dərin İngilis səsi saxlanılır.
      $('replyLine').textContent=data.reply_az||data.reply;$('replyLine').hidden=false;
      $('source').textContent=data.source==='ai'?'GROQ / Sİ':data.source==='openai'?'OPENAI / EHTİYAT':data.source==='groq2'?'GROQ 2 / EHTİYAT':'NÜMAYİŞ';
      showActions(data.actions);
      speak(data.reply).then(()=>{setState('idle');resumeListening();},()=>{setState('idle');resumeListening();});
    }catch(error){
      $('notice').textContent='Cavab alınmadı: '+error.message+'. Server işləyirmi?';
      setState('idle');
      resumeListening();
    }
  }

  // ---- əl ilə idarə (kamera + MediaPipe) ---------------------------------
  // Baş əli izləyir; pinch işığı, ✌ rəngi dəyişir. Kamera görüntüsü cihazdan
  // çıxmır - model lokal vendor/hands qovluğundadır.
  const MODEL_DIR=new URL('vendor/hands/',document.baseURI).href;
  const GESTURE_TEXT={PINCH:'BARMAQLAR SIXILIB',VICTORY:'RƏNG JESTİ',FIST:'ENERJİ TOPLANIR',
    OPEN:'AÇIQ OVUC',TRACK:'ƏL İZLƏNİR'};

  const gestureTracker=new GestureTracker();
  let hand={active:false},lastHandAt=0;
  let handModel=null,handStream=null,handOn=false,handStarting=false,handPump=0,handSession=0;
  const camVideo=$('camera');

  function handIndicator(on){
    const button=$('handBtn');
    button.textContent=on?'ƏL İDARƏSİ ✓':'ƏL İLƏ İDARƏ';
    button.dataset.on=on?'1':'';
  }

  /** Hazırkı rəng: Groot oyaqdırsa onunku, yoxsa istifadəçinin seçdiyi. */
  function activePalette(){return groot?GROOT_PALETTE:palettes[mode];}

  /** Palitranı dəyişir. step: +1 növbəti, -1 əvvəlki. */
  function cyclePalette(step){
    mode=(mode+step+palettes.length)%palettes.length;
    scatter=1;pulse=.8;rings.push({age:0});
    showPaletteName();
  }

  function showPaletteName(){
    $('mode').textContent=groot?'GROOT':'0'+(mode+1)+' / '+palettes[mode].name;
  }

  /** Nüvə işığını yandırır/söndürür. Əli yumub açmaq və L düyməsi eyni yoldur. */
  function toggleLight(){
    touch();
    lit=!lit;
    pulse=1;rings.push({age:0});
    energy=Math.min(1,energy+.35);
    $('gesture').textContent=lit?'İŞIQ YANDI':'İŞIQ SÖNDÜ';
  }

  function onHandResults(results){
    if(!handOn)return;
    lastHandAt=performance.now();touch();
    const lm=results.multiHandLandmarks?.[0]||null;
    hand=gestureTracker.update(lm,lastHandAt,(camVideo.videoWidth||640)/(camVideo.videoHeight||480));
    $('gesture').textContent=hand.active?(GESTURE_TEXT[hand.gesture]||hand.gesture):'ƏL GÖZLƏNİLİR';
    if(!lm)return;
    // Yuxudaykən əl görünsə model yaransın - "əl ilə oyatma".
    if(dormant)materialize();
    if(hand.flash)toggleLight();
    if(hand.mode)cyclePalette(1);
    // Sürüşdürmə: sağa növbəti rəng, sola əvvəlki.
    if(hand.swipe)cyclePalette(hand.swipe);
  }

  // İLK kadr modeli yükləyir və WASM-ı kompilyasiya edir: ölçüləndə 7.9 san
  // çəkdi, sonrakılar isə 17-27 ms. Əvvəl hər kadra eyni 2.5 san limit
  // verilirdi - soyuq başlanğıcda əl idarəsi "cavab vermədi" deyib sönürdü.
  const HAND_WARMUP_MS=30000;   // ilk kadr (zəif kompüterdə daha uzun ola bilər)
  const HAND_FRAME_MS=2500;     // sonrakı kadrlar
  async function sendHandFrame(model,timeoutMs=HAND_FRAME_MS){
    let timer;
    try{await Promise.race([model.send({image:camVideo}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Kamera modeli cavab vermədi. ƏL düyməsi ilə yenidən başlat.')),timeoutMs);})]);}
    finally{clearTimeout(timer);}
  }
  async function startHand(){
    if(handStarting)return;
    if(handOn){await stopHand();return;}
    handStarting=true;$('handBtn').disabled=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Kamera localhost və ya HTTPS tələb edir.');
      if(!window.Hands)throw new Error('Əl modeli yüklənmədi (vendor/hands).');
      $('notice').textContent='Kamera icazəsi gözlənilir…';
      handStream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});
      camVideo.srcObject=handStream;await camVideo.play();
      handModel=new window.Hands({locateFile:f=>MODEL_DIR+f});
      // complexity 0: inference əsas thread-i az bloklayır (ölçülüb).
      handModel.setOptions({maxNumHands:1,modelComplexity:0,minDetectionConfidence:.5,minTrackingConfidence:.5});
      handModel.onResults(onHandResults);
      handOn=true;const id=++handSession;
      $('notice').textContent='Əl modeli yüklənir — ilk dəfə bir neçə saniyə çəkə bilər…';
      await sendHandFrame(handModel,HAND_WARMUP_MS);
      if(!handOn||handSession!==id)return;
      handIndicator(true);
      $('notice').textContent='Əlini tərpət — baş izləyir · əli yum-aç: işıq · sürüşdür: rəng.';
      let previous=0,failures=0;
      const pump=async now=>{
        if(!handOn||handSession!==id)return;
        if(now-previous>80&&camVideo.readyState>=2){
          previous=now;
          try{await sendHandFrame(handModel);failures=0;}
          catch(error){
            if(!handOn||handSession!==id)return;
            if(++failures>=3){await stopHand('Əl izləməsi dayandı: '+error.message);return;}
          }
        }
        if(handOn&&handSession===id)handPump=requestAnimationFrame(pump);
      };
      handPump=requestAnimationFrame(pump);
      handStream.getVideoTracks()[0].addEventListener('ended',
        ()=>{if(handOn)stopHand('Kamera bağlantısı kəsildi.');},{once:true});
    }catch(error){
      const messages={NotAllowedError:'Kamera icazəsi verilmədi.',NotFoundError:'Kamera tapılmadı.',
        NotReadableError:'Kamera başqa proqramda açıq ola bilər.'};
      await stopHand(messages[error.name]||error.message);
    }finally{handStarting=false;$('handBtn').disabled=false;}
  }

  async function stopHand(message='Əl idarəsi bağlandı. Kamera buraxıldı.'){
    handOn=false;handSession++;cancelAnimationFrame(handPump);
    handStream?.getTracks().forEach(t=>t.stop());handStream=null;camVideo.srcObject=null;
    hand={active:false};gestureTracker.reset();
    const old=handModel;handModel=null;if(old){try{await Promise.race([old.close(),new Promise(resolve=>setTimeout(resolve,800))]);}catch(_){}}
    handIndicator(false);$('gesture').textContent='GÖZLƏMƏ REJİMİ';$('notice').textContent=message;
  }

  // ---- iki alqışla oyatma ------------------------------------------------
  // Səs brauzerdə analiz olunur, heç yerə göndərilmir. Yalnız alqış tanınandan
  // sonra yazma başlayır və o zaman səs Whisper-ə gedir.

  // Yığılma səsi: aşağıdan yuxarı qalxan uğultu + hissəcik pıçıltısı, sonunda
  // model "oturanda" qısa parıltı. Fayl yoxdur, hamısı WebAudio ilə sintez olunur.
  let toneContext=null;
  function formSound(){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return;
      // Alqış dinləyicisinin konteksti varsa onu işlədirik, əlavə kontekst açmırıq.
      toneContext=clapListener?.context||toneContext||new Ctx();
      const ac=toneContext;
      if(ac.state==='suspended')ac.resume().catch(()=>{});
      const t=ac.currentTime,dur=FORM_SECONDS;

      // 1) Qalxan uğultu - hissəciklərin bir yerə axması hissi.
      const sweep=ac.createOscillator(),sweepGain=ac.createGain();
      sweep.type='sawtooth';
      sweep.frequency.setValueAtTime(70,t);
      sweep.frequency.exponentialRampToValueAtTime(420,t+dur*.85);
      const filter=ac.createBiquadFilter();
      filter.type='lowpass';
      filter.frequency.setValueAtTime(300,t);
      filter.frequency.exponentialRampToValueAtTime(2600,t+dur*.85);
      sweepGain.gain.setValueAtTime(.0001,t);
      sweepGain.gain.exponentialRampToValueAtTime(.075,t+dur*.6);
      sweepGain.gain.exponentialRampToValueAtTime(.0001,t+dur);
      sweep.connect(filter).connect(sweepGain).connect(ac.destination);
      sweep.start(t);sweep.stop(t+dur+.05);

      // 2) Hissəcik pıçıltısı: süzgəcdən keçmiş ağ səs-küy.
      const frames=Math.floor(ac.sampleRate*dur);
      const buffer=ac.createBuffer(1,frames,ac.sampleRate);
      const data=buffer.getChannelData(0);
      for(let i=0;i<frames;i++){
        const k=i/frames;
        data[i]=(Math.random()*2-1)*Math.pow(1-k,.6)*.5;
      }
      const noise=ac.createBufferSource();noise.buffer=buffer;
      const noiseFilter=ac.createBiquadFilter();
      noiseFilter.type='bandpass';
      noiseFilter.frequency.setValueAtTime(1200,t);
      noiseFilter.frequency.exponentialRampToValueAtTime(5200,t+dur*.8);
      noiseFilter.Q.value=1.2;
      const noiseGain=ac.createGain();
      noiseGain.gain.setValueAtTime(.05,t);
      noiseGain.gain.exponentialRampToValueAtTime(.0001,t+dur);
      noise.connect(noiseFilter).connect(noiseGain).connect(ac.destination);
      noise.start(t);

      // 3) Model formalaşanda qısa parıltı akkordu.
      [523.25,783.99].forEach((freq,index)=>{
        const bell=ac.createOscillator(),bellGain=ac.createGain();
        bell.type='sine';bell.frequency.value=freq;
        const at=t+dur*.86+index*.05;
        bellGain.gain.setValueAtTime(.0001,at);
        bellGain.gain.exponentialRampToValueAtTime(.09,at+.03);
        bellGain.gain.exponentialRampToValueAtTime(.0001,at+.75);
        bell.connect(bellGain).connect(ac.destination);
        bell.start(at);bell.stop(at+.8);
      });
    }catch(_){ /* səs alınmasa animasiya onsuz da işləyir */ }
  }

  let dormantCleared=false;

  /** Ekranı tamamilə təmizləyir (WebGL + 2D təbəqə). */
  function clearScene(){
    try{
      const gl=renderer.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,renderer.canvas.width,renderer.canvas.height);
      gl.clearColor(.002,.008,.02,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }catch(_){}
    ctx.clearRect(0,0,W,H);
    dormantCleared=true;
  }

  /** Hissəcikləri sıfırdan yığır: dağınıq → insan modeli. */
  function materialize(){
    dormant=false;dormantCleared=false;
    document.body.classList.remove('dormant');
    forming=1;
    light=0;
    rings.length=0;rings.push({age:0});
    formSound();
  }

  /** Modeli yenidən yuxu rejiminə salır (ekran boşalır). */
  function dismiss(){
    dormant=true;dormantCleared=false;
    forming=0;
    // Ekran boş qaldığı üçün idarələr sönükləşməməlidir - yoxsa istifadəçi
    // tamamilə boş qara səhifə görür və nə edəcəyini bilmir.
    document.body.classList.add('dormant');
    document.body.classList.toggle('armed',!!clapListener?.active);
  }

  function geoIndicator(on,label){
    const button=$('geo');
    button.textContent=label||(on?'MƏKAN ✓':'MƏKAN');
    button.dataset.on=on?'1':'';
  }

  /** Yer icazəsini istəyir və izləməyə başlayır. */
  function enableGeo(){
    if(!navigator.geolocation){
      $('notice').textContent='Bu brauzer yer xidmətini dəstəkləmir.';
      return;
    }
    geoIndicator(false,'MƏKAN…');
    $('notice').textContent='Yer icazəsi gözlənilir…';
    // watchPosition: istifadəçi hərəkət edəndə mövqe özü yenilənir, hər sualda
    // yenidən soruşmaq lazım gəlmir.
    geoWatch=navigator.geolocation.watchPosition(
      position=>{
        const c=position.coords;
        geo={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy};
        geoIndicator(true);
        $('notice').textContent='Mövqe alındı (dəqiqlik ~'+Math.round(c.accuracy)+' m). '
          +'İndi "yaxınlıqda aptek varmı?" kimi soruşa bilərsən.';
      },
      error=>{
        stopGeo();
        const messages={1:'Yer icazəsi verilmədi.',2:'Mövqe təyin edilmədi.',3:'Mövqe sorğusu uzun çəkdi.'};
        $('notice').textContent=messages[error.code]||('Mövqe alınmadı: '+error.message);
      },
      {enableHighAccuracy:true,maximumAge:GEO_MAX_AGE,timeout:15000}
    );
  }

  function stopGeo(){
    if(geoWatch!==null){navigator.geolocation.clearWatch(geoWatch);geoWatch=null;}
    geo=null;
    geoIndicator(false);
  }

  function clapIndicator(on){
    const button=$('wake');
    button.textContent=on?'ALQIŞ ✓':'ALQIŞLA OYAT';
    button.dataset.on=on?'1':'';
  }

  async function enableClapWake(){
    if(micMuted)return;
    if(clapListener?.active)return;
    clapListener=new ClapListener({
      // Yazma zamanı səs səviyyəsini izləyirik: danışıq bitəndən sonra
      // sükut olarsa özü dayanır. Əks halda alqışla oyatmağın mənası qalmır -
      // dayandırmaq üçün yenə düyməyə basmaq lazım gələrdi.
      onLevel:(peak)=>{
        const now=performance.now();
        const dt=lastLevelAt?Math.min(.1,(now-lastLevelAt)/1000):0;
        lastLevelAt=now;
        sampleSelfLevel();
        // VISION danışır və istifadəçi onu kəsir?
        if(state==='speaking'&&!listening){
          // Üç şərt: mütləq səviyyə, öz səsimizdən ucalıq və OTAĞIN FONUNDAN ucalıq.
          const loud=peak>BARGE_MIN&&peak>selfLevel*BARGE_RATIO&&peak>ambientPeak*4;
          // Sızan hesab: hecalar arası qısa enişlər danışığı sıfırlamır,
          // qısa küy (qapı, klaviatura, öskürək) isə həddə heç vaxt çatmır.
          bargeScore=loud?bargeScore+dt:Math.max(0,bargeScore-dt*.6);
          if(bargeScore>BARGE_HOLD_MS/1000){
            bargeScore=0;touch();
            $('notice').textContent='Kəsildi — dinləyirəm.';
            stopVoiceAudio();synth?.cancel();stopRumble();
            setState('idle');
            startListening();
          }
          return;
        }
        // Sakit vaxtda otağın fon səviyyəsini öyrənirik (sözkəsmə üçün).
        if(!listening)ambientPeak+=(peak-ambientPeak)*(peak<ambientPeak?.2:.01);
        // Dinləmə zamanı "susdu, bitdi" qərarını YALNIZ meterSpeech verir. Burada
        // ikinci, pik əsaslı detektor var idi - pik qısa küyə həssasdır və iki
        // detektor bir-birinə zidd qərar verirdi.
      },
      onDoubleClap:()=>{
        // Yalnız boşdursa oyanır: danışarkən/düşünərkən müdaxilə etmir.
        if(state!=='idle'||listening)return;
        // Yuxudadırsa alqış onu yenidən yaradır; onsuz da oyaqdırsa tam
        // yığılma animasiyasını təkrarlamırıq - sadəcə dinləməyə keçir.
        if(dormant){
          // Yuxudan oyanır: əvvəlcə yığılır, sonra özünü təqdim edir, sonra dinləyir.
          $('notice').textContent='İki alqış eşidildi — VISION yığılır…';
          materialize();
          introduce();
          return;
        }
        $('notice').textContent='İki alqış eşidildi — dinləyirəm.';
        pulse=1;rings.push({age:0});
        startListening();
      },
    });
    try{
      const pendingClap=clapListener,clapSession=micEpoch;
      await pendingClap.start();
      if(micMuted||clapSession!==micEpoch){pendingClap.stop();return;}
      clapWanted=true;clapIndicator(true);
      document.body.classList.add('armed');setClapPref(true);
      $('notice').textContent='Alqış rejimi açıq. İki dəfə əl çal — dinləməyə başlayacaq.';
    }catch(error){
      clapListener=null;clapWanted=false;clapIndicator(false);
      const messages={NotAllowedError:'Mikrofon icazəsi verilmədi.',NotFoundError:'Mikrofon tapılmadı.',
        NotReadableError:'Mikrofon başqa proqramda açıq ola bilər.'};
      $('notice').textContent='Alqış rejimi açılmadı: '+(messages[error.name]||error.message);
    }
  }

  function disableClapWake(){
    clapWanted=false;
    document.body.classList.remove('armed');setClapPref(false);
    clapListener?.stop();clapListener=null;
    clapIndicator(false);
    $('notice').textContent='Alqış rejimi bağlandı. Mikrofon buraxıldı.';
  }

  // ---- dinləmə (mikrofon → backend Whisper) -----------------------------
  // Brauzerin öz SpeechRecognition-u az-AZ tanımır, ona görə səsi yazıb
  // backend-ə göndəririk; Whisper Azərbaycan dilini tanıyır.
  const recognitionLang='az-AZ';
  let recorder=null,chunks=[],micStream=null,listening=false,silenceTimer=null;
  let speechMeter=null,speechSource=null,speechMute=null,speechTimer=null,speechDuration=0,speechRun=0,speechLastAt=0;
  // Danışıq detektoru - dinləmə zamanı "susdu, bitdi" qərarını verən YEGANƏ yer.
  // Əvvəlki versiyanın üç qüsuru var idi:
  //  1) küy səviyyəsi 0.006-da tavana dirənirdi: səs-küylü otaqda ventilyator
  //     da danışıq sayılırdı - ətraf səslərə həddən artıq həssaslıq;
  //  2) cəmi 1 san sükutda kəsirdi: təbii fikir fasiləsində söz yarımçıq qalırdı;
  //  3) setInterval ilə işləyirdi: fon tabda boğulur və vaxt hesabı pozulurdu.
  const VOICE_START_S=.20;      // bu qədər FASİLƏSİZ səs = danışıq başladı
  const VOICE_MIN_S=.35;        // ümumi danışıq bundan azdırsa göndərilmir (küydür)
  const PAUSE_STOP_MS=1500;     // danışıqdan sonra bu qədər sükut = bitdi
  // Otağın küy səviyyəsi sessiyalar arasında YADDA QALIR: ilk dinləmədən sonra
  // detektor artıq kalibrlənib, hər dəfə sıfırdan öyrənmir.
  let roomNoise=.008;
  // Diaqnostika: yazma atılanda niyə atıldığı ekranda rəqəmlə görünsün.
  let speechPeak=0,lastThreshold=0;
  function meterSpeech(stream){
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    toneContext=toneContext||new Ctx();
    const ac=toneContext;ac.resume().catch(()=>{});
    speechSource=ac.createMediaStreamSource(stream);
    // Səs axınının özü sürür (fon tabda boğulmur - clap.js-dəki kimi).
    // Çıxış sıfır gain-dən keçir ki, mikrofon dinamikə düşməsin.
    speechMeter=ac.createScriptProcessor(2048,1,1);
    speechMute=ac.createGain();speechMute.gain.value=0;
    speechSource.connect(speechMeter);speechMeter.connect(speechMute);speechMute.connect(ac.destination);
    speechDuration=0;speechRun=0;speechLastAt=0;speechPeak=0;
    speechMeter.onaudioprocess=event=>{
      const data=event.inputBuffer.getChannelData(0);
      let power=0;for(let i=0;i<data.length;i++)power+=data[i]*data[i];
      const rms=Math.sqrt(power/data.length);
      const dt=data.length/ac.sampleRate;           // REAL müddət, taymerdən asılı deyil
      // Hədd ölçülüb seçilib: istifadəçinin mikrofonu (Intel Smart Sound,
      // gücləndirmə SÖNÜLÜ) otaqda median .0042, p99 .0097 verdi. Əvvəlki .012
      // minimum 0.010-0.012 səviyyəli normal danışığı 0/10 eşidirdi; .006 / x2.0
      // 10/10 eşidir, küydə isə 2 dəqiqədə 0.01 san yanlış siqnal verir
      // (göndərmə həddi 0.35 san - yəni heç vaxt göndərilmir).
      const threshold=Math.max(.006,roomNoise*2);
      speechPeak=Math.max(speechPeak,rms);lastThreshold=threshold;
      if(rms>threshold){
        speechRun+=dt;
        if(speechRun>=VOICE_START_S){speechDuration+=dt;speechLastAt=performance.now();
          heardVoice=true;lastVoiceAt=speechLastAt;touch();}
        // Çox yavaş qalxma: davamlı yeni küy (ventilyator açıldı) ~15 saniyəyə
        // fona çevrilir, fasiləli danışıq isə səviyyəni demək olar qaldırmır.
        roomNoise+=(rms-roomNoise)*.003;
      }else{
        // Sızan sayğac: hecalar arasındakı qısa eniş danışığı sıfırlamır,
        // uzun sükut isə onu tez sıfıra endirir.
        speechRun=Math.max(0,speechRun-dt*1.5);
        // Sürətli enmə, yavaş qalxma: otağın sakit səviyyəsini izləyir.
        roomNoise+=(rms-roomNoise)*(rms<roomNoise?.15:.02);
      }
      if(listening&&speechDuration>=VOICE_MIN_S&&speechLastAt&&performance.now()-speechLastAt>PAUSE_STOP_MS)stopListening();
    };
  }

  function releaseMic(){
    clearInterval(speechTimer);speechTimer=null;
    if(speechMeter)speechMeter.onaudioprocess=null;
    try{speechSource?.disconnect();speechMeter?.disconnect();speechMute?.disconnect();}catch(_){}
    speechSource=null;speechMeter=null;speechMute=null;
    // Alqış dinləyicisinin axını bizim deyil - onu bağlamırıq, yoxsa oyatma sönür.
    if(micStream && micStream!==clapListener?.stream)micStream.getTracks().forEach(t=>t.stop());
    micStream=null;recorder=null;
    clearTimeout(silenceTimer);silenceTimer=null;
  }

  async function startListening(){
    if(micMuted){$('notice').textContent='Mikrofon sönülüdür. Açmaq üçün MİKROFON düyməsinə bas.';return;}
    if(listening||state==='thinking')return;
    const voiceSession=micEpoch;
    hushed=false;                // yenidən danışmağa başladıq: dövrə açıqdır
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
      $('notice').textContent='Bu brauzer mikrofon yazmanı dəstəkləmir. YAZ düyməsi ilə mətn göndər.';return;
    }
    synth?.cancel();stopVoiceAudio();stopRumble();
    try{
      // Alqış dinləyicisi artıq mikrofonu tutubsa, eyni axını işlədirik:
      // ikinci dəfə getUserMedia bəzi sistemlərdə alınmır.
      micStream=clapListener?.stream||await navigator.mediaDevices.getUserMedia({audio:true});
    }catch(error){
      const messages={NotAllowedError:'Mikrofon icazəsi verilmədi. Brauzer icazəsini yoxla.',
        NotFoundError:'Mikrofon tapılmadı.',NotReadableError:'Mikrofon başqa proqramda açıq ola bilər.'};
      $('notice').textContent=messages[error.name]||('Mikrofon açılmadı: '+error.message);
      return;
    }
    if(micMuted||voiceSession!==micEpoch){releaseMic();return;}
    chunks=[];
    meterSpeech(micStream);
    recorder=new MediaRecorder(micStream);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=async()=>{
      const voicedSeconds=speechDuration;
      const blob=new Blob(chunks,{type:recorder?.mimeType||'audio/webm'});
      releaseMic();listening=false;
      if(voicedSeconds<VOICE_MIN_S||blob.size<1200){setState('idle');$('notice').textContent='Danışıq eşidilmədi — göndərilmədi (ən güclü səs '+speechPeak.toFixed(3)+', hədd '+lastThreshold.toFixed(3)+'). Mikrofona yaxın danış.';
        resumeListening();return;}
      await transcribeAndAsk(blob,voiceSession);
    };
    recorder.start();
    heardVoice=false;lastVoiceAt=0;
    listening=true;setState('listening');
    $('notice').textContent=clapListener?.active
      ?'Danış… sussan özü dayanacaq.'
      :'Danış… bitirəndə yenidən DANIŞ düyməsinə bas (və ya V).';
    // Təhlükəsizlik üçün: 20 saniyədən sonra avtomatik dayandır.
    silenceTimer=setTimeout(()=>{if(listening)stopListening();},20000);
  }

  function stopListening(){
    if(!listening)return;
    try{recorder?.stop();}catch(_){releaseMic();listening=false;setState('idle');}
  }

  async function transcribeAndAsk(blob,voiceSession=micEpoch){
    if(micMuted||voiceSession!==micEpoch)return;
    setState('thinking');
    try{
      const form=new FormData();
      form.append('audio',blob,'speech.webm');
      const response=await fetch('/api/listen',{method:'POST',body:form});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.detail||('Server '+response.status));
      if(micMuted||voiceSession!==micEpoch)return;
      const text=(data.text||'').trim();
      if(!text){setState('idle');$('notice').textContent='Səs tanınmadı. Yenidən sına.';
        resumeListening();return;}
      if(isEcho(text)){
        // Öz səsimizi sual kimi göndərmək həm mənasızdır, həm də token yeyir.
        setState('idle');
        $('notice').textContent='Öz səsimi eşitdim — danış, səni dinləyirəm.';
        resumeListening();
        return;
      }
      await ask(text,voiceSession);
    }catch(error){
      $('notice').textContent='Səs tanıma alınmadı: '+error.message;
      setState('idle');
    }
  }

  function stopEverything(){
    hushed=true;                 // avtomatik dinləmə ləğv olunur
    if(recorder){recorder.onstop=null;recorder.ondataavailable=null;}
    if(listening){try{recorder?.stop();}catch(_){}}
    releaseMic();listening=false;
    synth?.cancel();stopVoiceAudio();stopRumble();
    setState('idle');
  }

  // ---- idarələr ---------------------------------------------------------
  function updateMicButton(){
    const button=$('micToggle');
    button.textContent=micMuted?'🎙 MİKROFON: SÖNÜLÜ':'🎙 MİKROFON: AÇIQ';
    button.setAttribute('aria-pressed',String(!micMuted));
    button.dataset.on=micMuted?'':'1';
  }
  $('micToggle').addEventListener('click',async()=>{
    micMuted=!micMuted;micEpoch++;updateMicButton();
    if(micMuted){
      micClapRestore=clapWanted;
      stopEverything();disableClapWake();
      $('notice').textContent='Mikrofon söndürüldü. Dinləmə və danışıq dayandırıldı.';
    }else{
      hushed=false;
      if(micClapRestore)await enableClapWake();
      if(!micMuted&&!dormant)startListening();
      $('notice').textContent='Mikrofon açıldı.';
    }
  });
  updateMicButton();
  function toggleListening(){listening?stopListening():startListening();}
  $('wake').addEventListener('click',()=>{clapWanted?disableClapWake():enableClapWake();});
  $('geo').addEventListener('click',()=>{
    if(geo||geoWatch!==null){stopGeo();$('notice').textContent='Mövqe söndürüldü.';}
    else enableGeo();
  });
  $('handBtn').addEventListener('click',startHand);
  $('talk').addEventListener('click',toggleListening);
  $('stopVoice').addEventListener('click',stopEverything);
  $('theme').addEventListener('click',()=>cyclePalette(1));
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(_){$('notice').textContent='Tam ekran üçün F11 istifadə et.';}}
  $('fullscreen').addEventListener('click',fullscreen);
  function hideControls(){document.body.classList.toggle('clean');}
  $('hide').addEventListener('click',hideControls);

  const form=$('textForm'),textInput=$('textInput');
  function toggleText(){
    form.hidden=!form.hidden;
    if(!form.hidden)textInput.focus();
  }
  $('text').addEventListener('click',toggleText);
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const value=textInput.value.trim();
    if(!value)return;
    textInput.value='';ask(value);
  });

  window.addEventListener('keydown',e=>{
    // e.target həmişə element olmur (window/document-ə yönəlmiş hadisə) -
    // closest-i birbaşa çağırsaq handler tamamilə sınır.
    if(e.repeat||e.target?.closest?.('button,input,textarea'))return;
    touch();
    if(e.code==='KeyV'){e.preventDefault();toggleListening();}
    else if(e.code==='KeyT'){e.preventDefault();toggleText();}
    // Esc: danışırsa dayandırır; onsuz da boşdursa modeli yuxuya salır.
    else if(e.code==='Escape'){
      if(state==='idle'&&!listening&&!dormant)dismiss();
      else stopEverything();
    }
    else if(e.code==='KeyM')$('theme').click();
    else if(e.code==='KeyL')toggleLight();   // əli yumub açmaqla eyni
    else if(e.code==='KeyR')materialize();   // yığılma animasiyasını təkrar oynat
    else if(e.code==='KeyF')fullscreen();
    else if(e.code==='KeyH')hideControls();
  });


  window.addEventListener('resize',resize);
  window.addEventListener('pagehide',()=>{stopEverything();stopHand();stopGeo();clapListener?.stop();});

  let hideTimer;
  function reveal(){document.body.classList.add('show-controls');clearTimeout(hideTimer);hideTimer=setTimeout(()=>document.body.classList.remove('show-controls'),3500);}
  window.addEventListener('pointermove',reveal);reveal();

  // ---- Google (Gmail / Calendar) ----------------------------------------
  function applyGoogle(google){
    const button=$('google');
    if(!google||!google.available){button.hidden=true;return;}
    button.hidden=false;
    button.textContent=google.connected?'GOOGLE ✓':'GOOGLE QOŞ';
    button.title=google.connected?'Qoşulub. Basmaq bağlantını SİLİR (təsdiq soruşulacaq).'
                                 :'Google hesabını qoş.';
    button.dataset.connected=google.connected?'1':'';
  }

  $('google').addEventListener('click',async()=>{
    const button=$('google');
    const connected=button.dataset.connected==='1';
    // Qoşulu olanda bu düymə token-i SİLİR. Etiket 'GOOGLE ✓' olsa da
    // istifadəçi onu 'yenidən qoş' kimi başa düşüb basa bilər - və
    // təqdimatdan əvvəl Gmail, Təqvim, cədvəl birdən işləməz olur.
    // Ona görə silmə təsdiq istəyir; qoşulma istəmir.
    if(connected&&!confirm('Google bağlantısını silmək istəyirsən?\n\n'
        +'Bundan sonra Gmail, Təqvim və görüş cədvəli işləməyəcək — '
        +'yenidən icazə vermək lazım olacaq.')){
      $('notice').textContent='Google bağlantısı toxunulmadı.';
      return;
    }
    button.disabled=true;
    $('notice').textContent=connected?'Google bağlantısı silinir…'
      :'Brauzerdə Google icazə pəncərəsi açılır — icazə ver.';
    try{
      const response=await fetch(connected?'/api/google/disconnect':'/api/google/connect',{method:'POST'});
      const data=await response.json();
      if(!response.ok)throw new Error(data.detail||('Server '+response.status));
      $('notice').textContent=data.message;
      applyGoogle(data.google);
    }catch(error){
      $('notice').textContent='Google: '+error.message;
    }finally{button.disabled=false;}
  });

  fetch('/api/status').then(r=>r.json()).then(data=>{
    $('source').textContent=data.ai?'GROQ / HAZIR':'NÜMAYİŞ REJİMİ';
    if(!data.ai)$('notice').textContent='AI açarı yoxdur (.env → GROQ_API_KEY). Demo cavablarla işləyir.';
    applyGoogle(data.google);
  }).catch(()=>{});

  // Açılış ekranı iki işi birdən görür:
  //   1. tam ekran seçimi - requestFullscreen YALNIZ istifadəçi jestindən çağırıla bilər,
  //   2. mikrofon icazəsi - brauzer onu da yalnız jestdən sonra verir.
  // Ona görə eyni klikdən hər ikisini alırıq.
  let armTries=0;
  function armMic(){
    // İcazə rədd edilibsə hər klikdə yenidən soruşub istifadəçini yormuruq.
    if(micMuted||clapWanted||armTries>=2)return;
    armTries++;
    enableClapWake().then(()=>{$('notice').textContent='';});
  }

  function dismissStartup(wantFullscreen){
    const panel=$('startup');
    if(!panel||panel.classList.contains('gone'))return;
    panel.classList.add('gone');
    setTimeout(()=>panel.remove(),500);
    if(wantFullscreen){
      // Brauzer rədd etsə səhifə normal işləməyə davam edir - kritik deyil.
      document.documentElement.requestFullscreen?.({navigationUI:'hide'})?.catch(()=>{});
    }
    armMic();
  }
  $('startFull').addEventListener('click',()=>dismissStartup(true));
  $('startWindow').addEventListener('click',()=>dismissStartup(false));
  // Açılış ekranı bağlanmadan da klaviatura ilə davam etmək mümkün olsun.
  addEventListener('keydown',()=>dismissStartup(false),{once:true});

  resize();
  // Açılışda ekran TAM QARA: model yoxdur, HUD və panel gizlidir (assistant.css).
  // İki alqış modeli sıfırdan yaradır.
  dismiss();
  $('notice').textContent='';
  requestAnimationFrame(render);
})();




