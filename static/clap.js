/* İki dəfə əl çalmaqla oyatma.

   Səs BRAUZERDƏ analiz olunur, heç yerə göndərilmir. Yalnız alqış tanınandan
   sonra yazma başlayır və o zaman səs Whisper-ə gedir.

   Alqışın imzası: çox qısa, güclü və genişzolaqlı partlayış. Danışıq enerjisi
   əsasən 2 kHz-dən aşağıdadır; alqışda yuxarı tezliklərin payı yüksək olur.
   Ona görə yalnız səs həcminə baxmaq azdır - yuxarı zolağın payı da yoxlanılır.
*/
(function (root) {
  'use strict';

  const DEFAULTS = {
    minPeak: 0.12,        // mütləq minimum: sakit otaqda xışıltı tetikləməsin
    riseRatio: 3.2,       // fon səviyyəsindən neçə dəfə yüksək olmalı
    highBandMin: 0.34,    // yuxarı tezliklərin payı (alqış ~0.4+, danışıq ~0.15)
    refractoryMs: 130,    // əks-səda ikinci alqış sayılmasın
    minGapMs: 140,        // iki alqış arasında minimum
    maxGapMs: 900,        // maksimum: bundan uzunsa ayrı-ayrı səslərdir
    baselineAlpha: 0.02,  // fon səviyyəsinin uyğunlaşma sürəti
  };

  class ClapListener {
    constructor(options = {}) {
      this.options = { ...DEFAULTS, ...options };
      this.onDoubleClap = options.onDoubleClap || (() => {});
      this.onLevel = options.onLevel || null;
      this.stream = null;
      this.context = null;
      this.analyser = null;
      this.timer = 0;
      this.paused = false;
      this.baseline = 0.02;
      this.lastOnset = 0;
      this.pendingClap = 0;
    }

    get active() { return !!this.analyser; }

    async start() {
      if (this.analyser) return this.stream;
      // Xam axın: echoCancellation/noiseSuppression/autoGainControl alqış kimi
      // qısa partlayışları əzir və tanınmanı pozur.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.context = new Ctx();
      if (this.context.state === 'suspended') await this.context.resume();

      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0; // xam kadr lazımdır, hamarlanmış yox
      source.connect(this.analyser);           // destination-a qoşulmur: əks-səda olmasın

      this.time = new Float32Array(this.analyser.fftSize);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.baseline = 0.02;
      this.lastOnset = 0;
      this.pendingClap = 0;
      // TIMING: setInterval fon tabda 1 saniyəyə qədər ləngidilir. İstifadəçi
      // brauzer pəncərəsinə baxanda VISION fon tabda qalır - alqış, susmanın
      // aşkarlanması və sözkəsmə ölür. Audio thread throttle OLUNMUR, ona görə
      // tick-i mikrofon axınının özü sürür. setInterval yalnız ehtiyatdır
      // (ScriptProcessor dəstəklənməyən brauzerlər üçün).
      try {
        this.pump = this.context.createScriptProcessor(1024, 1, 1);
        source.connect(this.pump);
        // Çıxış SIFIR gain-dən keçir: qoşulmasa onaudioprocess işləmir,
        // birbaşa qoşulsa mikrofon dinamikə düşüb əks-səda yaradır.
        this.mute = this.context.createGain();
        this.mute.gain.value = 0;
        this.pump.connect(this.mute);
        this.mute.connect(this.context.destination);
        this.pump.onaudioprocess = () => this.tick();
      } catch (error) {
        this.pump = null;
      }
      this.timer = setInterval(() => this.tick(), this.pump ? 250 : 16);
      return this.stream;
    }

    stop() {
      clearInterval(this.timer);
      this.timer = 0;
      if (this.pump) { this.pump.onaudioprocess = null; this.pump.disconnect(); this.pump = null; }
      this.mute?.disconnect();
      this.mute = null;
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.analyser = null;
      this.context?.close().catch(() => {});
      this.context = null;
    }

    /** Assistent danışarkən/yazarkən söndürülür - öz səsi tetikləməsin. */
    setPaused(value) {
      this.paused = !!value;
      if (value) this.pendingClap = 0;
    }

    tick() {
      if (!this.analyser) return;
      const { minPeak, riseRatio, highBandMin, refractoryMs, minGapMs, maxGapMs, baselineAlpha } = this.options;

      this.analyser.getFloatTimeDomainData(this.time);
      let peak = 0;
      for (let i = 0; i < this.time.length; i++) {
        const value = Math.abs(this.time[i]);
        if (value > peak) peak = value;
      }
      if (this.onLevel) this.onLevel(peak);
      if (this.paused) { this.baseline += (peak - this.baseline) * baselineAlpha; return; }

      const now = performance.now();
      const loudEnough = peak > minPeak && peak > this.baseline * riseRatio;

      // Fon səviyyəsi yalnız sakit anlarda yenilənir; əks halda alqışın özü
      // fonu qaldırıb növbəti alqışı görünməz edir.
      if (!loudEnough) this.baseline += (peak - this.baseline) * baselineAlpha;

      if (!loudEnough || now - this.lastOnset < refractoryMs) return;

      // Genişzolaqlılıq yoxlaması: alqışda yuxarı tezliklərin payı yüksəkdir.
      this.analyser.getByteFrequencyData(this.freq);
      const nyquist = this.context.sampleRate / 2;
      const splitBin = Math.floor((2500 / nyquist) * this.freq.length);
      let low = 0, high = 0;
      for (let i = 0; i < this.freq.length; i++) {
        if (i < splitBin) low += this.freq[i]; else high += this.freq[i];
      }
      // Vacib: cəmi yox, ORTALAMANI müqayisə edirik. Yuxarı zolaqda bin sayı
      // qat-qat çoxdur (459 vs 53), ona görə cəm həmişə yuxarı zolağın xeyrinə
      // əyilir və danışıq da "genişzolaqlı" görünür.
      const lowAvg = low / Math.max(1, splitBin);
      const highAvg = high / Math.max(1, this.freq.length - splitBin);
      const total = lowAvg + highAvg;
      if (!total) return;
      if (highAvg / total < highBandMin) return; // danışıq/musiqi - alqış deyil

      this.lastOnset = now;
      const gap = now - this.pendingClap;
      if (this.pendingClap && gap >= minGapMs && gap <= maxGapMs) {
        this.pendingClap = 0;
        this.onDoubleClap();
      } else {
        this.pendingClap = now;
      }
    }
  }

  root.ClapListener = ClapListener;
  if (typeof module !== 'undefined') module.exports = ClapListener;
})(typeof window !== 'undefined' ? window : globalThis);
