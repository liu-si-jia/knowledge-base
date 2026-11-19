import { useState } from 'react';
import { dismissOverlay, overlayDismissed } from './sessionOverlay.js';
import './overlays.css';

export default function OverlayNotice({storageKey,title,actionLabel='继续查看',className='',description=''}){
  const [open,setOpen]=useState(()=>!overlayDismissed(storageKey));
  if(!open)return null;
  return <div className={`prototype-overlay ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
    <div className="prototype-overlay-card">
      <p>{title}</p>
      {description?<small>{description}</small>:null}
      <button type="button" onClick={()=>{dismissOverlay(storageKey);setOpen(false);}}>{actionLabel}</button>
    </div>
  </div>;
}
