/* Faceless mist artwork, animated in a separate layer above the realm. */
(() => {
  'use strict';
  const Base=window.NeonRenderer;
  const vs=`attribute vec2 aQuad;varying vec2 vUv;void main(){vUv=aQuad*.5+.5;gl_Position=vec4(aQuad,0.,1.);}`;
  const fs=`precision mediump float;varying vec2 vUv;
    uniform sampler2D uFigure,uRealm;
    uniform vec2 uViewport,uFigureSize,uRealmSize;
    uniform float uTime,uYaw,uPitch,uLight,uPulse,uScatter,uThink,uMotion;
    uniform vec3 uTint,uRealmTint;
    uniform float uRealmMix,uFormation;
    void main(){
      vec2 cover=uViewport/max(uViewport.x/uRealmSize.x,uViewport.y/uRealmSize.y)/uRealmSize;
      vec2 bgUv=(vUv-.5)*cover+.5;bgUv.y=1.-bgUv.y;
      vec3 bg=texture2D(uRealm,bgUv).rgb*.48;
      // Recolor by luminance so clouds and ruins keep their depth and contrast.
      float bgLuma=dot(bg,vec3(.2126,.7152,.0722));
      vec3 realmTone=mix(vec3(1.),uRealmTint,.78);
      realmTone/=max(.12,dot(realmTone,vec3(.2126,.7152,.0722)));
      bg=mix(bg,bgLuma*realmTone,uRealmMix);
      vec2 fit=uViewport/min(uViewport.x/uFigureSize.x,uViewport.y/uFigureSize.y)/uFigureSize;
      vec2 uv=(vUv-.5)*fit+.5;uv.y=1.-uv.y;
      // Warp only the figure; the environment stays stationary.
      float head=1.-smoothstep(.38,.76,uv.y);
      uv.x-=uYaw*.09*head*uMotion;
      uv.y+=uPitch*.08*head*uMotion;
      uv.x+=sin(uv.y*19.-uTime*.65)*.0015*uMotion;
      uv.y+=sin(uTime*1.1)*.001*uMotion;
      vec4 figure=vec4(0.);
      if(uv.x>=0.&&uv.x<=1.&&uv.y>=0.&&uv.y<=1.)figure=texture2D(uFigure,uv);
      float appear=1.-clamp(uScatter*2.,0.,1.);
      // A soft irregular mist edge travels from the chest to the crown.
      float front=1.12-uFormation*1.24;
      float mistEdge=sin(uv.x*43.+uTime*1.5)*.015+sin(uv.x*91.-uTime)*.009;
      float upward=smoothstep(front-.08,front+.08,uv.y+mistEdge);
      float reveal=mix(smoothstep(0.,1.,uFormation),upward,uMotion);
      reveal*=uFormation<.999?1.:smoothstep(0.,1.,appear);
      float shimmer=1.+sin(uTime*1.3+uv.y*14.)*.025*uMotion;
      float thought=pow(max(0.,sin(uv.y*18.+uTime*3.)),12.)*uThink*.12*uMotion;
      vec3 color=figure.rgb*uTint*(.35+uLight*.65+uPulse*.12+thought)*shimmer;
      float dissolve=1.-smoothstep(.82,1.,uv.y);
      float backgroundFade=smoothstep(0.,.24,uFormation);
      gl_FragColor=vec4(mix(bg*backgroundFade,color,figure.a*reveal*dissolve),1.);
    }`;
  class MistRenderer extends Base {
    constructor(canvas){
      super(canvas);
      this.mistProgram=this.compile(vs,fs);this.mistReady=false;
      this.motion=matchMedia('(prefers-reduced-motion: reduce)');
      this.mistUniforms={};
      for(const key of ['uFigure','uRealm','uViewport','uFigureSize','uRealmSize','uTime','uYaw','uPitch','uLight','uPulse','uScatter','uThink','uMotion','uTint','uRealmTint','uRealmMix','uFormation'])this.mistUniforms[key]=this.gl.getUniformLocation(this.mistProgram,key);
      this.mistPosition=this.gl.getAttribLocation(this.mistProgram,'aQuad');
      Promise.all([this.loadArt('mist-figure.png'),this.loadArt('realm-background.png')]).then(([figure,realm])=>{this.figureArt=figure;this.realmArt=realm;this.mistReady=true;}).catch(()=>{const n=document.getElementById('notice');if(n)n.textContent='Duman təsviri yüklənmədi — əvvəlki model göstərilir.';});
    }
    loadArt(src){return new Promise((resolve,reject)=>{
      const image=new Image();image.onerror=reject;
      image.onload=()=>{const gl=this.gl,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);resolve({texture,size:[image.naturalWidth,image.naturalHeight]});};image.src=src;
    });}
    render(state){
      if(!this.mistReady)return super.render(state);if(this.lost)return;
      const gl=this.gl,u=this.mistUniforms;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.disable(gl.BLEND);gl.useProgram(this.mistProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.enableVertexAttribArray(this.mistPosition);gl.vertexAttribPointer(this.mistPosition,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.figureArt.texture);gl.uniform1i(u.uFigure,0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.realmArt.texture);gl.uniform1i(u.uRealm,1);
      gl.uniform2f(u.uViewport,this.width,this.height);gl.uniform2fv(u.uFigureSize,this.figureArt.size);gl.uniform2fv(u.uRealmSize,this.realmArt.size);
      for(const key of ['time','yaw','pitch','light','pulse','scatter','think'])gl.uniform1f(u['u'+key[0].toUpperCase()+key.slice(1)],state[key]||0);
      gl.uniform1f(u.uMotion,this.motion.matches?0:1);
      gl.uniform1f(u.uFormation,Math.max(0,Math.min(1,state.formation ?? 1)));
      const blue=state.blue||[.005,.55,1];
      gl.uniform3fv(u.uRealmTint,blue);
      const paletteDistance=Math.hypot(blue[0]-.005,blue[1]-.55,blue[2]-1);
      gl.uniform1f(u.uRealmMix,Math.min(1,paletteDistance*2));
      // Neutral for the original blue palette; other existing palettes tint the mist.
      gl.uniform3fv(u.uTint,[Math.min(1.6,.998+blue[0]*.4),Math.min(1.4,.78+blue[1]*.4),Math.min(1.4,.6+blue[2]*.4)]);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.disableVertexAttribArray(this.mistPosition);gl.activeTexture(gl.TEXTURE0);
    }
  }
  window.NeonRenderer=MistRenderer;
})();
