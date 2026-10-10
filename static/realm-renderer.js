/* Original procedural humanoid, with a subdued blue/gold environment. */
(() => {
  const Base = window.NeonRenderer;
  const vs = `attribute vec2 aQuad;varying vec2 vUv;void main(){vUv=aQuad*.5+.5;gl_Position=vec4(aQuad,0.,1.);}`;
  const fs = `precision mediump float;varying vec2 vUv;
    uniform sampler2D uImage,uBloom,uRealm;
    uniform vec2 uViewport,uRealmSize;
    uniform float uReveal;
    void main(){
      vec2 ratio=uViewport/max(uViewport.x/uRealmSize.x,uViewport.y/uRealmSize.y)/uRealmSize;
      vec2 uv=(vUv-.5)*ratio+.5;uv.y=1.-uv.y;
      vec3 bg=texture2D(uRealm,uv).rgb*.48*uReveal;
      vec3 robot=texture2D(uImage,vUv).rgb+texture2D(uBloom,vUv).rgb*.65;
      gl_FragColor=vec4(max(bg,robot),1.);
    }`;
  class RealmRenderer extends Base {
    constructor(canvas){
      super(canvas);
      this.realmProgram=this.compile(vs,fs);
      this.realmReady=false;this.realmReveal=1;
      const gl=this.gl;
      this.realmTexture=gl.createTexture();
      const image=new Image();
      image.onload=()=>{
        gl.bindTexture(gl.TEXTURE_2D,this.realmTexture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        this.realmSize=[image.naturalWidth,image.naturalHeight];this.realmReady=true;
      };
      image.src='realm-background.png';
    }
    drawGroup(group,lines=false){
      // Replace terrain and decorative background with the new environment.
      if(this.realmReady&&(group===this.background||group===this.network))return;
      super.drawGroup(group,lines);
    }
    render(state){this.realmReveal=1-Math.min(1,state.scatter*2);super.render(state);}
    fullscreenPass(program,target,input,setup){
      if(program!==this.compositeProgram||!this.realmReady)return super.fullscreenPass(program,target,input,setup);
      const gl=this.gl,p=this.realmProgram;
      super.fullscreenPass(p,target,input,()=>{
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.targets[2].texture);
        gl.uniform1i(gl.getUniformLocation(p,'uBloom'),1);
        gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.realmTexture);
        gl.uniform1i(gl.getUniformLocation(p,'uRealm'),2);
        gl.uniform2f(gl.getUniformLocation(p,'uViewport'),this.width,this.height);
        gl.uniform2fv(gl.getUniformLocation(p,'uRealmSize'),this.realmSize);
        gl.uniform1f(gl.getUniformLocation(p,'uReveal'),this.realmReveal);
      });
      gl.activeTexture(gl.TEXTURE0);
    }
  }
  window.NeonRenderer=RealmRenderer;
})();
