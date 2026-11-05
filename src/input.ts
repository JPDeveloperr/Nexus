export type Axis = { x: number; y: number };
export type Controls = {
  move: Axis; aim: Axis | null; pointer: Axis; mouseAim: boolean;
  attack: boolean; pause: boolean; confirm: boolean; back: boolean; navigate: number;
  source: 'keyboard' | 'gamepad'; gamepad: number | null; pads: number; unsupported: number;
};
const keyCodes: Record<string,string> = {w:'KeyW',a:'KeyA',s:'KeyS',d:'KeyD',j:'KeyJ',escape:'Escape'};
export function keyboardCode(event: Pick<KeyboardEvent,'code'|'key'>) {
  return event.code || keyCodes[event.key.toLowerCase()] || event.key;
}
export class InputSystem {
  private keys=new Set<string>();
  private pending={attack:false,pause:false,confirm:false,back:false,navigate:0};
  private pointer={x:0,y:0}; private mouseAim=false;
  constructor(private canvas:HTMLCanvasElement, private playing:()=>boolean) {
    canvas.tabIndex=0;
    window.addEventListener('keydown',this.keyDown);
    window.addEventListener('keyup',this.keyUp);
    window.addEventListener('blur',()=>this.reset());
    canvas.addEventListener('pointermove',event=>{
      this.pointer={x:event.clientX/innerWidth*2-1,y:-event.clientY/innerHeight*2+1};this.mouseAim=true;
    });
    canvas.addEventListener('pointerdown',event=>{
      canvas.focus({preventScroll:true});if(event.button===0)this.pending.attack=true;
    });
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
  }
  private keyDown=(event:KeyboardEvent)=>{
    const code=keyboardCode(event);
    if(!this.playing() && (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement))return;
    if(['KeyW','KeyA','KeyS','KeyD','KeyJ','Escape','Space','ArrowUp','ArrowDown'].includes(code) && this.playing())event.preventDefault();
    this.keys.add(code);
    if(!event.repeat){if(code==='KeyJ')this.pending.attack=true;if(code==='Escape')this.pending.pause=true;}
  };
  private keyUp=(event:KeyboardEvent)=>{this.keys.delete(keyboardCode(event));};
  clearAim(){this.mouseAim=false;}
  reset(){this.keys.clear();this.pending={attack:false,pause:false,confirm:false,back:false,navigate:0};}
  read():Controls {
    const move={x:Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA')),y:Number(this.keys.has('KeyS'))-Number(this.keys.has('KeyW'))};
    const length=Math.hypot(move.x,move.y);if(length>1){move.x/=length;move.y/=length;}
    const value:Controls={move,aim:null,pointer:this.pointer,mouseAim:this.mouseAim,...this.pending,source:'keyboard',gamepad:null,pads:0,unsupported:0};
    this.pending={attack:false,pause:false,confirm:false,back:false,navigate:0};return value;
  }
}
