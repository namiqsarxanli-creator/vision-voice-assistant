/* Alqış tanıma alqoritminin sınağı: süni siqnallarla, mikrofonsuz.
   Yoxlanan: alqışı danışıqdan ayırır, iki alqışı sayır, tək alqışa reaksiya vermir. */
const ClapListener = require('./static/clap.js');

let fakeNow = 0;
global.performance = { now: () => fakeNow };

function makeListener() {
  const listener = new ClapListener({ onDoubleClap: () => { listener._fired = (listener._fired || 0) + 1; } });
  listener._fired = 0;
  listener.time = new Float32Array(1024);
  listener.freq = new Uint8Array(512);
  listener.context = { sampleRate: 48000 };
  // Süni analiz qovşağı: test hansı siqnalı verdiyimizi özü idarə edir.
  listener.analyser = {
    fftSize: 1024,
    frequencyBinCount: 512,
    getFloatTimeDomainData: (array) => array.set(listener._time),
    getByteFrequencyData: (array) => array.set(listener._freq),
  };
  listener._time = new Float32Array(1024);
  listener._freq = new Uint8Array(512);
  listener.baseline = 0.02;
  return listener;
}

/** peak: amplituda, highRatio: yuxarı tezliklərin payı (alqış ~0.5, danışıq ~0.1) */
function feed(listener, peak, highRatio) {
  listener._time = new Float32Array(1024).fill(0);
  listener._time[10] = peak;
  const freq = new Uint8Array(512);
  // 2500 Hz / 24000 Hz nyquist * 512 bin ≈ 53-cü bin
  const split = Math.floor((2500 / 24000) * 512);
  const lowLevel = Math.round(200 * (1 - highRatio));
  const highLevel = Math.round(200 * highRatio);
  for (let i = 0; i < 512; i++) freq[i] = i < split ? lowLevel : highLevel;
  listener._freq = freq;
  listener.tick();
}

function quiet(listener, frames = 40) {
  for (let i = 0; i < frames; i++) { fakeNow += 16; feed(listener, 0.01, 0.2); }
}

const results = [];
function check(name, condition) {
  results.push((condition ? 'PASS' : 'FAIL') + ' — ' + name);
  if (!condition) process.exitCode = 1;
}

// 1) İki alqış, normal ara -> oyatmalı
{
  const l = makeListener(); quiet(l);
  fakeNow += 16; feed(l, 0.9, 0.55);          // birinci alqış
  quiet(l, 15);                                // ~240 ms ara
  fakeNow += 16; feed(l, 0.9, 0.55);          // ikinci alqış
  check('iki alqış (240 ms ara) oyadır', l._fired === 1);
}

// 2) Tək alqış -> oyatmamalı
{
  const l = makeListener(); quiet(l);
  fakeNow += 16; feed(l, 0.9, 0.55);
  quiet(l, 60);
  check('tək alqış oyatmır', l._fired === 0);
}

// 3) Ara çox uzun (>900 ms) -> oyatmamalı
{
  const l = makeListener(); quiet(l);
  fakeNow += 16; feed(l, 0.9, 0.55);
  quiet(l, 70);                                // ~1120 ms
  fakeNow += 16; feed(l, 0.9, 0.55);
  check('ara çox uzun olanda oyatmır', l._fired === 0);
}

// 4) Danışıq kimi siqnal (aşağı tezlikli, güclü) -> oyatmamalı
{
  const l = makeListener(); quiet(l);
  fakeNow += 16; feed(l, 0.9, 0.10);
  quiet(l, 15);
  fakeNow += 16; feed(l, 0.9, 0.10);
  check('danışıq/bas səs oyatmır (genişzolaqlı deyil)', l._fired === 0);
}

// 5) Əks-səda: iki partlayış çox yaxın (<130 ms refractory) -> tək sayılmalı
{
  const l = makeListener(); quiet(l);
  fakeNow += 16; feed(l, 0.9, 0.55);
  fakeNow += 48; feed(l, 0.8, 0.55);          // 48 ms sonra = əks-səda
  quiet(l, 60);
  check('əks-səda ikinci alqış sayılmır', l._fired === 0);
}

// 6) Pauzada tetiklənməməli (assistent danışarkən)
{
  const l = makeListener(); quiet(l); l.setPaused(true);
  fakeNow += 16; feed(l, 0.9, 0.55);
  quiet(l, 15);
  fakeNow += 16; feed(l, 0.9, 0.55);
  check('pauzada oyatmır', l._fired === 0);
}

// 7) Sakit otaqda fon xışıltısı -> oyatmamalı
{
  const l = makeListener();
  for (let i = 0; i < 200; i++) { fakeNow += 16; feed(l, 0.03 + Math.random() * 0.04, 0.4); }
  check('fon xışıltısı oyatmır', l._fired === 0);
}

console.log(results.join('\n'));
