/* Geometry-only recognizer. Distances are normalized by palm size, independent of camera distance. */
(function(root){
  'use strict';
  class GestureTracker {
    constructor(){this.reset();this.lastFlash=-Infinity;this.lastMode=-Infinity;this.lastSwipe=-Infinity;}
    reset(){this.contact=false;this.contactAt=0;this.peakContact=0;this.victoryAt=null;this.victoryFired=false;this.lastSeen=null;this.fistAt=null;this.prevX=null;this.prevAt=0;}
    update(lm,now,aspect=4/3){
      if(!lm){this.reset();return {active:false};}
      if(this.lastSeen!==null && now-this.lastSeen>1800)this.reset();
      this.lastSeen=now;
      const dist=(a,b)=>Math.hypot((lm[a].x-lm[b].x)*aspect,lm[a].y-lm[b].y);
      const scale=Math.max(.025,dist(0,9));
      const index=dist(4,8)/scale, middle=dist(4,12)/scale;
      const proximity=Math.min(index,middle);
      const extended=[8,12,16,20].map(t=>dist(t,0)>dist(t-2,0)*1.23 && dist(t,t-3)>scale*.48);
      const count=extended.filter(Boolean).length;

      let mode=false;
      // İki ayrı jest eyni "flash" siqnalını verir:
      //   a) barmaq ucları toxunub ayrılır (çırtma təqlidi),
      //   b) əl yumulub açılır (yumruq -> açıq ovuc).
      // Əli yumanda baş barmaq onsuz da barmaqlara yaxınlaşır, yəni (b) çox vaxt
      // (a)-nı da işə salır. Hər kadrda yalnız bir flash göndərilir;
      // yumruq açıldıqda contact sıfırlanır ki, eyni jest təkrarlanmasın.
      let raw=false;
      if(!this.contact && proximity<.32){this.contact=true;this.contactAt=now;this.peakContact=proximity;}
      if(this.contact && proximity>.58){
        const duration=now-this.contactAt;
        raw=duration>=35 && duration<2200;
        this.contact=false;
      }
      // A fresh close/open cycle rearms itself; it must not be swallowed by
      // the pinch cooldown. Three visible fingers suffice for an open palm.
      let fistRelease=false;
      if(count<=1){
        if(this.fistAt===null)this.fistAt=now;
        raw=false;
      }
      else if(this.fistAt!==null && count>=3){
        fistRelease=now-this.fistAt>=60;
        this.fistAt=null;
        this.contact=false;
        raw=false;
      }
      // Fingers often open over several frames. Ignore a pinch release on
      // the intermediate two-finger frame; the fist cycle owns this action.
      if(this.fistAt!==null)raw=false;

      const flash=fistRelease || (raw && now-this.lastFlash>900);
      if(flash)this.lastFlash=now;

      // Sürüşdürmə: ovucun üfüqi sürəti (vahid/saniyə). Yalnız açıq əl sayılır -
      // yumruq və çırtma zamanı əl onsuz da sürətlə hərəkət edir, onları
      // rəng dəyişikliyi kimi saymaq olmaz. MediaPipe ~12 Hz işlədiyi üçün
      // sürəti iki ardıcıl kadrdan hesablamaq kifayətdir.
      const palmX=1-(lm[0].x+lm[9].x)/2;
      let swipe=0;
      if(this.prevX!==null && now>this.prevAt){
        const vx=(palmX-this.prevX)/((now-this.prevAt)/1000);
        if(Math.abs(vx)>1.6 && count>=3 && now-this.lastSwipe>900){
          swipe=vx>0?1:-1;
          this.lastSwipe=now;
        }
      }
      this.prevX=palmX;this.prevAt=now;

      const victory=extended[0]&&extended[1]&&!extended[2]&&!extended[3]&&!this.contact;
      if(victory){
        if(this.victoryAt===null)this.victoryAt=now;
        if(!this.victoryFired && now-this.victoryAt>750 && now-this.lastMode>1200){mode=true;this.lastMode=now;this.victoryFired=true;}
      }else{this.victoryAt=null;this.victoryFired=false;}
      return {active:true,x:palmX,y:(lm[0].y+lm[9].y)/2,
        tipX:1-lm[8].x,tipY:lm[8].y,flash,mode,swipe,
        gesture:this.contact?'PINCH':victory?'VICTORY':count===0?'FIST':count>=4?'OPEN':'TRACK',
        openness:count/4};
    }
  }
  root.GestureTracker=GestureTracker;
  if(typeof module!=='undefined')module.exports=GestureTracker;
})(typeof window!=='undefined'?window:globalThis);

