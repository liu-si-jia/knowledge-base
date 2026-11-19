import { useRef, useState } from 'react';
import { DotsSixVertical, X } from '@phosphor-icons/react';
import { LibraryIcon } from './libraryIcons.jsx';
import ContentIcon from './ContentIcon.jsx';
import { visiblePins, reorderPin, togglePin, toggleNodePin } from './personalization.js';
export default function PinnedLibraries({state,userId,update,onOpen,onNotice}){
  const items=visiblePins(state,userId),drag=useRef(''),[over,setOver]=useState('');
  const reorder=(id,target,after)=>{try{update(s=>reorderPin(s,userId,id,target,after));onNotice('左侧置顶顺序已保存');}catch(e){onNotice(e.message);}};
  const open=item=>{if(item.kind==='node')onOpen(item);else onOpen(item);};
  const unpin=item=>{try{update(s=>item.kind==='node'?toggleNodePin(s,userId,item.node.id):togglePin(s,userId,item.library.id));onNotice('已取消置顶');}catch(e){onNotice(e.message);}};
  return <div className="knowledge-subnav-group pinned-libraries"><strong>置顶</strong>{items.map((item,index)=>{
    const id=item.key,name=item.kind==='node'?item.node.name:item.library.name;
    return <div className={`pinned-library-row ${over===id?'drag-over':''}`} data-pin-id={id} key={id} draggable onDragStart={e=>{drag.current=id;e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{drag.current='';setOver('');}} onDragOver={e=>{if(drag.current){e.preventDefault();setOver(id);}}} onDrop={e=>{e.preventDefault();const bounds=e.currentTarget.getBoundingClientRect();reorder(drag.current,id,e.clientY>bounds.top+bounds.height/2);drag.current='';setOver('');}} onKeyDown={e=>{if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;const next=index+(e.key==='ArrowUp'?-1:1);e.preventDefault();if(items[next])reorder(id,items[next].key,e.key==='ArrowDown');}}>
      <button type="button" className="pin-drag-handle" aria-label={`调整置顶顺序 ${name}`} title="拖拽排序，或按 Alt＋↑/↓"><DotsSixVertical size={14}/></button>
      <button type="button" className="pinned-library-open" onClick={()=>open(item)}>{item.kind==='node'?<ContentIcon node={item.node} size={23}/>:<LibraryIcon library={item.library} size={23}/>}<span title={name}>{name}</span></button>
      <button type="button" className="pin-remove" aria-label={`取消置顶 ${name}`} onClick={()=>unpin(item)}><X size={13}/></button>
    </div>;
  })}{!items.length&&<p className="empty-pins">点击知识库卡片的图钉，或在文件、文件夹的更多操作中置顶</p>}</div>;
}
