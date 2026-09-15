export const initial=()=>({x:0,y:0,status:'playing',steps:0});
export function move(state,dx,dy){
 if(state.status!=='playing'||![[1,0],[-1,0],[0,1],[0,-1]].some(([x,y])=>x===dx&&y===dy))return state;
 const x=Math.max(0,Math.min(2,state.x+dx)),y=Math.max(0,Math.min(2,state.y+dy));
 if(x===state.x&&y===state.y)return state;
 return {x,y,steps:state.steps+1,status:x===1&&y===1?'lost':x===2&&y===2?'won':'playing'};
}
