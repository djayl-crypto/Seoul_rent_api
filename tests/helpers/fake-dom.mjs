// Minimal DOM boundary for orchestration tests; no browser layout or Leaflet simulation.
export function installDom() {
  const previous = new Map(['document','window','Option'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  class Element {
    constructor() {this.style={};this.listeners=new Map();this.children=[];this.checked=false;}
    addEventListener(type,listener) {this.listeners.set(type,listener);}
    emit(type) {return this.listeners.get(type)?.();}
    replaceChildren(...children) {this.children=children;}
    append(child) {this.children.push(child);}
    setAttribute(name,value) {this[name]=value;}
  }
  const nodes=new Map(), node=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector);};
  globalThis.document={querySelector:node,createElement:()=>new Element()};
  globalThis.window={matchMedia:()=>({matches:false,addEventListener(){}}),Plotly:{react:async()=>{}}};
  globalThis.Option=class {constructor(text,value){this.text=text;this.value=value;}};
  return {node,restore(){for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
}
