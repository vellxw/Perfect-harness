import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BorderBeam} from 'border-beam';
import {initial,move} from './game.mjs';
function App(){
 const [game,setGame]=useState(initial),[reduced,setReduced]=useState(false);
 useEffect(()=>{const m=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(m.matches);update();m.addEventListener('change',update);return()=>m.removeEventListener('change',update);},[]);
 useEffect(()=>{const key=e=>{const direction={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[e.key];if(direction){e.preventDefault();setGame(s=>move(s,...direction));}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 return <main>
  <p className="eyebrow">PERFECT · GAME CREATOR / FIXTURE</p>
  <h1>Alcanzá la baliza</h1><p>Usá las flechas o los botones. Evitá el centro rojo y llegá a la esquina iluminada.</p>
  <section className="game" aria-label="Tablero 3 por 3">
   {!reduced&&<div data-testid="beam" aria-hidden="true"><BorderBeam active={game.status==='playing'} size={100} duration={8} colorFrom="#89adff" colorTo="#b9ffc8" borderWidth={1.5}/></div>}
   <div className="board">{Array.from({length:9},(_,n)=>{const x=n%3,y=Math.floor(n/3),player=game.x===x&&game.y===y;return <div key={n} className={`cell ${n===4?'hazard':''} ${n===8?'target':''}`} aria-label={player?'Jugador':n===4?'Peligro':n===8?'Baliza':'Vacío'}>{player?'●':n===4?'×':n===8?'◇':''}</div>;})}</div>
  </section>
  <div role="status" data-testid="status" data-state={game.status}>{game.status==='won'?'Victoria':game.status==='lost'?'Derrota':'En juego'} · {game.steps} pasos</div>
  <nav aria-label="Controles del juego"><button data-testid="up" aria-label="Arriba" onClick={()=>setGame(s=>move(s,0,-1))}>↑</button><button data-testid="left" aria-label="Izquierda" onClick={()=>setGame(s=>move(s,-1,0))}>←</button><button data-testid="down" aria-label="Abajo" onClick={()=>setGame(s=>move(s,0,1))}>↓</button><button data-testid="right" aria-label="Derecha" onClick={()=>setGame(s=>move(s,1,0))}>→</button></nav>
  <button data-testid="reset" onClick={()=>setGame(initial())}>Reiniciar partida</button>
  <p className="note" data-testid="motion">{reduced?'Movimiento reducido: borde estático':'Beam público MIT: animación selectiva'}</p>
 </main>;
}
createRoot(document.getElementById('app')).render(<App/>);
