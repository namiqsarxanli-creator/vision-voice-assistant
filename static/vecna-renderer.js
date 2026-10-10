/* Approved Vecna artwork with restrained, state-driven 2.5D animation. */
(() => {
  'use strict';
  const OriginalRenderer = window.NeonRenderer;
  const vertex = `attribute vec2 aPosition; varying vec2 vUv;
    void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
  const fragment = `precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uImage;
    uniform vec2 uResolution,uImageSize;
    uniform float uTime,uYaw,uPitch,uLight,uPulse,uScatter,uEnergy,uThink,uMotion;
    uniform vec3 uTint;
    void main(){
      // Contain the complete composition; keep the head visible on narrow screens.
      vec2 fit=uResolution/min(uResolution.x/uImageSize.x,uResolution.y/uImageSize.y)/uImageSize;
      vec2 uv=(vUv-.5)*fit+.5;
      uv.y=1.-uv.y;
      float bust=1.-smoothstep(.20,.49,length((uv-vec2(.5,.49))*vec2(1.,.85)));
      uv.x-=uYaw*.032*bust*uMotion;
      uv.y+=uPitch*.04*bust*uMotion;
      uv.y+=sin(uTime*1.2)*.0008*bust*uMotion;
      if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(.004,.001,.002,1.);return;}
      vec3 color=texture2D(uImage,uv).rgb;
      float bright=max(color.r,max(color.g,color.b));
      float subject=smoothstep(.22,.70,bright);
      float glow=.28+.72*uLight+uPulse*.14+uEnergy*.07;
      color*=mix(.78,glow,subject);
      color*=mix(vec3(1.),uTint,subject*.7);
      float thought=pow(max(0.,sin(uv.y*22.+uTime*3.)),10.)*uThink*.10*uMotion;
      color+=vec3(thought,thought*.09,thought*.04)*subject;
      float appear=1.-clamp(uScatter*2.,0.,1.);
      color*=smoothstep(0.,.9,appear);
      // Soft side edges blend into the dark canvas without stretching the artwork.
      float edge=smoothstep(0.,.035,uv.x)*smoothstep(0.,.035,1.-uv.x);
      gl_FragColor=vec4(mix(vec3(.004,.001,.002),color,edge),1.);
    }`;
  class VecnaRenderer extends OriginalRenderer {
    constructor(canvas) {
      super(canvas);
      const gl=this.gl;
      this.artProgram=this.compile(vertex,fragment);
      this.artPosition=gl.getAttribLocation(this.artProgram,'aPosition');
      this.artUniforms={};
      for(const name of ['uImage','uResolution','uImageSize','uTime','uYaw','uPitch','uLight','uPulse','uScatter','uEnergy','uThink','uMotion','uTint'])
        this.artUniforms[name]=gl.getUniformLocation(this.artProgram,name);
      this.artTexture=gl.createTexture();
      this.artReady=false;
      this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
      const image=new Image();
      image.onload=()=>{
        gl.bindTexture(gl.TEXTURE_2D,this.artTexture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        this.artSize=[image.naturalWidth,image.naturalHeight];
        this.artReady=true;
      };
      image.onerror=()=>{document.getElementById('notice').textContent='Vecna təsviri yüklənmədi — əvvəlki model göstərilir.';};
      image.src='vecna-scene.png';
    }
    render(state) {
      if(!this.artReady)return super.render(state);
      if(this.lost)return;
      const gl=this.gl,u=this.artUniforms;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,this.canvas.width,this.canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(this.artProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
      gl.enableVertexAttribArray(this.artPosition);
      gl.vertexAttribPointer(this.artPosition,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,this.artTexture);
      gl.uniform1i(u.uImage,0);
      gl.uniform2f(u.uResolution,this.width,this.height);
      gl.uniform2fv(u.uImageSize,this.artSize);
      for(const name of ['time','yaw','pitch','light','pulse','scatter','energy','think'])
        gl.uniform1f(u['u'+name[0].toUpperCase()+name.slice(1)],state[name]||0);
      gl.uniform1f(u.uMotion,this.reducedMotion.matches?0:1);
      gl.uniform3fv(u.uTint,state.blue||[1,1,1]);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      gl.disableVertexAttribArray(this.artPosition);
    }
  }
  window.NeonRenderer=VecnaRenderer;
})();
