export type Axis = { x: number; y: number };
export type Controls = {
  move: Axis; aim: Axis | null; pointer: Axis; mouseAim: boolean;
  attack: boolean; pause: boolean; confirm: boolean; back: boolean; navigate: number;
  source: 'keyboard' | 'gamepad'; gamepad: number | null; pads: number; unsupported: number;
};
// Standard Gamepad mapping: Xbox X / PlayStation Square. Other actions are reserved, not implemented.
export const GAMEPAD_ACTIONS = {attack:2,heavy:3,dodge:0,special:5,ultimate:7,interact:1,pause:9} as const;
const keyCodes: Record<string,string> = {w:'KeyW',a:'KeyA',s:'KeyS',d:'KeyD',j:'KeyJ',escape:'Escape'};
export function keyboardCode(event: Pick<KeyboardEvent,'code'|'key'>) {
  return event.code || keyCodes[event.key.toLowerCase()] || event.key;
}
export function radialDeadzone(x:number,y:number,deadzone:number):Axis {
  x=Number.isFinite(x)?Math.max(-1,Math.min(1,x)):0;y=Number.isFinite(y)?Math.max(-1,Math.min(1,y)):0;
  const length=Math.hypot(x,y), threshold=Math.max(.05,Math.min(.4,deadzone));
  if(length<=threshold)return {x:0,y:0};
  const magnitude=Math.min(1,(length-threshold)/(1-threshold));return {x:x/length*magnitude,y:y/length*magnitude};
}
const emptyActions=()=>({attack:false,pause:false,confirm:false,back:false,navigate:0});
export class InputSystem {
  private keys=new Set<string>(); private pending=emptyActions();
  private pointer={x:0,y:0}; private mouseAim=false;
  private source:'keyboard'|'gamepad'='keyboard';
  private previous=new Map<number,{buttons:boolean[];move:Axis;aim:Axis;nav:number}>();
  private active:number|null=null; private selected:number|null=null;
  deadzone=.18;
  constructor(private canvas:HTMLCanvasElement, private playing:()=>boolean) {
    canvas.tabIndex=0;
    try {this.setDeadzone(Number(localStorage.getItem('nexus.deadzone')||.18));}catch{/* storage is optional */}
    window.addEventListener('keydown',this.keyDown);window.addEventListener('keyup',this.keyUp);
    window.addEventListener('blur',()=>this.reset());
    window.addEventListener('gamepaddisconnected',event=>{this.previous.delete(event.gamepad.index);if(this.active===event.gamepad.index)this.active=null;});
    canvas.addEventListener('pointermove',event=>{
      this.pointer={x:event.clientX/innerWidth*2-1,y:-event.clientY/innerHeight*2+1};this.mouseAim=true;this.source='keyboard';
    });
    canvas.addEventListener('pointerdown',event=>{
      canvas.focus({preventScroll:true});this.source='keyboard';if(event.button===0)this.pending.attack=true;
    });
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
  }
  private keyDown=(event:KeyboardEvent)=>{
    const code=keyboardCode(event);
    if(!this.playing() && (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement))return;
    if(['KeyW','KeyA','KeyS','KeyD','KeyJ','Escape','Space','ArrowUp','ArrowDown'].includes(code) && this.playing())event.preventDefault();
    this.keys.add(code);
    if(['KeyW','KeyA','KeyS','KeyD','KeyJ','Escape'].includes(code)){
      this.source='keyboard';if(code!=='KeyJ')this.mouseAim=false;
    }
    if(!event.repeat){if(code==='KeyJ')this.pending.attack=true;if(code==='Escape')this.pending.pause=true;}
  };
  private keyUp=(event:KeyboardEvent)=>{this.keys.delete(keyboardCode(event));};
  setDeadzone(value:number){this.deadzone=Number.isFinite(value)?Math.max(.05,Math.min(.4,value)):.18;}
  saveDeadzone(value:number){this.setDeadzone(value);try{localStorage.setItem('nexus.deadzone',String(this.deadzone));}catch{}}
  selectGamepad(index:number|null){this.selected=index;this.active=index;}
  available():Gamepad[]{
    try{return Array.from(navigator.getGamepads?.()||[]).filter((p):p is Gamepad=>p!==null&&p.connected);}catch{return [];}
  }
  clearAim(){this.mouseAim=false;}
  reset(){this.keys.clear();this.pending=emptyActions();/* Keep button history: holding a button across a menu cannot trigger again. */}
  read():Controls {
    const pads=this.available(),supported=pads.filter(p=>p.mapping==='standard'&&p.axes.length>=2&&p.buttons.length>=10);
    for(const index of this.previous.keys())if(!pads.some(p=>p.index===index))this.previous.delete(index);
    if(this.selected!==null&&!supported.some(p=>p.index===this.selected))this.selected=null;
    if(!supported.some(p=>p.index===this.active))this.active=supported[0]?.index??null;
    if(this.active===null&&this.source==='gamepad')this.source='keyboard';
    const states=supported.map(p=>{
      const move=radialDeadzone(p.axes[0],p.axes[1],this.deadzone),aim=radialDeadzone(p.axes[2]||0,p.axes[3]||0,this.deadzone);
      const buttons=Array.from(p.buttons,b=>Boolean(b.pressed||b.value>.5));
      const nav=buttons[12]?-1:buttons[13]?1:move.y<-.55?-1:move.y>.55?1:0;
      const prev=this.previous.get(p.index);
      const rising=(i:number)=>Boolean(buttons[i]&&!prev?.buttons[i]);
      const changed=buttons.some((b,i)=>b&&!prev?.buttons[i])||Math.hypot(move.x-(prev?.move.x||0),move.y-(prev?.move.y||0))>.05||Math.hypot(aim.x-(prev?.aim.x||0),aim.y-(prev?.aim.y||0))>.05;
      // Only meaningful activity switches sources. A held stick cannot reclaim keyboard input every frame.
      const activity=changed&&(Math.hypot(move.x,move.y)>.05||Math.hypot(aim.x,aim.y)>.05||buttons.some(Boolean));
      if(activity&&(this.selected===null||this.selected===p.index)){this.active=p.index;this.source='gamepad';this.mouseAim=false;}
      return {p,move,aim,buttons,nav,rising,previousNav:prev?.nav||0};
    });
    const active=states.find(s=>s.p.index===this.active);
    let move={x:Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA')),y:Number(this.keys.has('KeyS'))-Number(this.keys.has('KeyW'))};
    const length=Math.hypot(move.x,move.y);if(length>1){move.x/=length;move.y/=length;}
    let aim:Axis|null=null;const actions={...this.pending};
    if(active&&this.source==='gamepad'){
      move=active.move;aim=Math.hypot(active.aim.x,active.aim.y)>0?active.aim:null;
      actions.attack ||= active.rising(GAMEPAD_ACTIONS.attack);
      actions.pause ||= active.rising(GAMEPAD_ACTIONS.pause);
      actions.confirm ||= active.rising(0);actions.back ||= active.rising(1);
      actions.navigate=active.nav!==active.previousNav?active.nav:0;
    }
    for(const state of states)this.previous.set(state.p.index,{buttons:state.buttons,move:state.move,aim:state.aim,nav:state.nav});
    this.pending=emptyActions();
    return {move,aim,pointer:this.pointer,mouseAim:this.mouseAim,...actions,source:this.source,gamepad:this.active,pads:pads.length,unsupported:pads.length-supported.length};
  }
}
