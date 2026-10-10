const assert=require('node:assert/strict');
const GestureTracker=require('./static/gestures.js');
function pose(kind='open'){
  const lm=Array.from({length:21},()=>({x:.5,y:.6}));
  lm[0]={x:.5,y:.8};lm[9]={x:.5,y:.6};lm[4]={x:.28,y:.60};
  for(const [k,x] of [[5,.42],[9,.5],[13,.58],[17,.66]]){
    const up=kind==='open'||kind==='victory'&&k<13;
    lm[k]={x,y:.6};lm[k+1]={x,y:up?.48:.57};lm[k+2]={x,y:up?.38:.62};lm[k+3]={x,y:up?.28:.67};
  }return lm;
}
const g=new GestureTracker(),open=pose();
assert.equal(g.update(open,0).gesture,'OPEN');
const pinch=structuredClone(open);pinch[4]={...pinch[8]};
assert.equal(g.update(pinch,100).flash,false);
assert.equal(g.update(pinch,200).flash,false,'holding contact must not repeatedly fire');
assert.equal(g.update(open,300).flash,true,'release toggles the light');
assert.equal(g.update(open,400).flash,false,'continued open hand does not retrigger');
g.update(pinch,450);assert.equal(g.update(open,500).flash,false,'cooldown suppresses bounce');
g.update(pinch,1100);g.update(null,1150);assert.equal(g.update(open,1200).flash,false,'hand loss must clear contact');
const v=pose('victory');
g.update(v,2000);g.update(v,2200);g.update(v,2400);g.update(v,2600);
assert.equal(g.update(v,2800).mode,true,'held victory changes mode');
assert.equal(g.update(v,3000).mode,false,'held victory fires only once');
assert.equal(g.update(pose('fist'),3200).gesture,'FIST');
const scaled=open.map(p=>({x:.5+(p.x-.5)*.5,y:.5+(p.y-.5)*.5}));
assert.equal(new GestureTracker().update(scaled,0).gesture,'OPEN','scale invariance');
g.update(pinch,4000);assert.equal(g.update(open,6000).flash,false,'tracking gap clears armed snap');

// Yumruq -> aciq ovuc: isiq acari. Bir jest = BIR deyisiklik.
const fist=pose('fist');
const t=new GestureTracker();
t.update(open,0);
assert.equal(t.update(fist,100).flash,false,'yumruq tek basina isigi deyismir');
assert.equal(t.update(fist,200).flash,false,'yumrugu saxlamaq tekrar ise dusmur');
assert.equal(t.update(open,300).flash,true,'yumrugu acmaq isigi deyisir');
assert.equal(t.update(open,400).flash,false,'aciq qalmaq tekrar ise dusmur');
// Eyni jest icinde hem cirtma, hem yumruq-acilma ise dusse bele isiq
// yalniz BIR defe deyismelidir (ortaq soyuma sayqaci).
t.update(fist,500);
assert.equal(t.update(open,700).flash,true,'fresh close/open immediately toggles again');
assert.equal(t.update(fist,1700).flash,false,'');
assert.equal(t.update(open,1800).flash,true,'soyuma bitdikden sonra yeniden isleyir');


// Sürüşdürmə: açıq əl sürətlə yana keçəndə rəng dəyişir.
const shift=(p,dx)=>p.map(q=>({x:q.x+dx,y:q.y}));
const sw=new GestureTracker();
sw.update(open,0);
assert.equal(sw.update(shift(open,-.20),80).swipe,1,'sağa sürüşdürmə aşkarlanır');
assert.equal(sw.update(shift(open,-.40),160).swipe,0,'soyuma ikinci sürüşməni udur');
sw.update(open,1200);
assert.equal(sw.update(shift(open,.05),1300).swipe,0,'yavaş hərəkət rəngi dəyişmir');
sw.update(shift(open,0),2300);
assert.equal(sw.update(shift(open,.20),2380).swipe,-1,'sola sürüşdürmə əks istiqamət verir');

// Yumruqla sürətli hərəkət rəng dəyişməməlidir - əl onsuz da çırtma və
// işıq jestlərində sürətlə tərpənir.
const fistSwipe=new GestureTracker();
fistSwipe.update(pose('fist'),0);
assert.equal(fistSwipe.update(shift(pose('fist'),-.30),80).swipe,0,'yumruqla sürüşdürmə sayılmır');

// Əl itəndə sürət tarixçəsi təmizlənməlidir, yoxsa əl yenidən görünəndə
// sıçrayış saxta sürüşdürmə yaradır.
const lost=new GestureTracker();
lost.update(open,0);lost.update(null,100);
assert.equal(lost.update(shift(open,-.30),200).swipe,0,'əl itəndən sonra saxta sürüşdürmə olmur');

console.log('PASS: release, hold, cooldown, lost hand, victory latch, fist, scale, tracking gap,');
console.log('      fist-open toggle, swipe (yön, soyuma, yavaş, yumruq, əl itməsi)');

const repeat=new GestureTracker();
for(let i=0;i<6;i++){
  const at=i*300;
  assert.equal(repeat.update(fist,at).flash,false);
  assert.equal(repeat.update(open,at+100).flash,true,'each repeated cycle toggles once');
  assert.equal(repeat.update(open,at+200).flash,false,'held palm never repeats');
}
const partial=pose();partial[20]={x:.66,y:.67};partial[19]={x:.66,y:.62};partial[18]={x:.66,y:.57};
const forgiving=new GestureTracker();forgiving.update(fist,0);
assert.equal(forgiving.update(partial,100).flash,true,'three visible fingers reopen the hand');


const phased=new GestureTracker();
const closed=pose('fist');closed[4]={...closed[8]};
phased.update(open,0);
phased.update(closed,100);
assert.equal(phased.update(pose('victory'),200).flash,false,'partial opening cannot emit pinch flash');
assert.equal(phased.update(open,300).flash,true,'complete opening emits exactly one flash');
phased.update(closed,400);
assert.equal(phased.update(pose('victory'),500).flash,false,'second cycle intermediate frame stays quiet');
assert.equal(phased.update(open,600).flash,true,'second complete opening restores light');
assert.equal(phased.update(open,700).flash,false,'held open hand does not undo restored light');
console.log('PASS: gradual close -> partial open -> full open, repeated twice.');


const slow=new GestureTracker();slow.update(fist,0);
assert.equal(slow.update(open,500).flash,true,'slow camera retains fist state');
slow.update(fist,1000);assert.equal(slow.update(open,1500).flash,true,'slow camera toggles light back');
const slowVictory=new GestureTracker();slowVictory.update(v,0);slowVictory.update(v,500);
assert.equal(slowVictory.update(v,1000).mode,true,'two-finger hold survives slow inference');
assert.equal(slowVictory.update(v,1500).mode,false,'held two fingers only change color once');

