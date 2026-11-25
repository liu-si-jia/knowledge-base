import useDiscardGuard from './useDiscardGuard.jsx';
import { useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { SCOPE_LABELS, accessFingerprint, effectiveAccess, spaceAccess, contentRights, libraryRights, permissionLayers, displayedResponsibles, libraryLocalAccess, libraryType, plazaFloor, switchNodePermissionMode, permissionModeFor } from './access.js';
import { initialAccess } from './permissions.js';
import { GrantFields } from './GrantFields.jsx';
import AccessManagerFields from './AccessManagerFields.jsx';
import { createLibrary } from './libraryCreation.js';
import { useLocationDialog } from './LocationPicker.jsx';
import { persistLibraryIcon } from './libraryIcons.jsx';
import LibraryMetadata, { persistLibraryCover } from './LibraryMetadata.jsx';
import { loadState } from './store.js';
import { savePermissionDetails } from './permissionOperations.js';
import LibraryCategoryField from './LibraryCategoryField.jsx';
import { libraryCategoryIds } from './libraryCategories.js';
import { handoverReason } from './handover.js';
import './access.css';

export const AccessFields=GrantFields;
export function ScopeBadge({access,onClick}){return onClick?<button type="button" className={`scope-badge ${access.visibility}`} onClick={onClick}>{SCOPE_LABELS[access.visibility]}</button>:<span className={`scope-badge ${access.visibility}`}>{SCOPE_LABELS[access.visibility]}</span>;}
export default function AccessDialog(props){if(!props.item)return <Unavailable onClose={props.onClose}/>;const library=props.entity==='space'?props.item:props.state.spaces.find(space=>space.id===props.item.spaceId);if(!props.settings&&libraryType(library)==='personal')return <Unavailable onClose={props.onClose} message="个人内容仅自己可见，无需配置权限"/>;const rights=props.entity==='space'?libraryRights(props.state,props.item,props.userId):contentRights(props.state,props.item,props.userId);return rights.manage?<EditAccessDialog {...props}/>:<Unavailable onClose={props.onClose} message="当前没有管理权限"/>;}
function Unavailable({onClose,message='内容已不可用'}){return <div className="action-backdrop"><section className="action-dialog" role="dialog" aria-label="操作不可用"><p>{message}</p><button type="button" onClick={onClose}>关闭</button></section></div>;}
function EditAccessDialog({state,userId,item,entity='node',update,onClose,onSaved,settings=false,initialDraft,initialLocal,expectedOverride,onDelete,onHandover}){
  const library=entity==='space'?item:state.spaces.find(s=>s.id===item.spaceId),protectedRows=displayedResponsibles(state,item,entity),ownerIds=protectedRows.map(row=>row.id),layers=entity==='node'?permissionLayers(state,item):null;
  const [draft,setDraft]=useState(()=>initialDraft||libraryLocalAccess(state,library)),[local,setLocal]=useState(()=>initialLocal||layers?.local),[mode,setMode]=useState(()=>entity==='node'?permissionModeFor({...item,...(layers?{permissionMode:layers.mode,localAccess:initialLocal||layers.local}:{})}):undefined),[convertedBy,setConvertedBy]=useState(()=>entity==='node'?item.convertedBy:undefined),[error,setError]=useState('');
  const [name,setName]=useState(item.name),[description,setDescription]=useState(item.description||''),[icon,setIcon]=useState(item.icon||{kind:'preset',key:'book'}),[cover,setCover]=useState(item.cover||{kind:'preset',key:'original'}),[categoryIds,setCategoryIds]=useState(()=>libraryCategoryIds(item)),[assetReading,setAssetReading]=useState(false),[busy,setBusy]=useState(false);
  const fingerprint=useRef(expectedOverride||accessFingerprint(state,item,entity)),metadata=useRef(JSON.stringify([item.name,item.description||''])),appearance=useRef(JSON.stringify([item.icon||null,item.cover||null])),categorySnapshot=useRef(JSON.stringify(libraryCategoryIds(item))),root=useRef(null),lock=useRef(false);
  const save=async e=>{
    e.preventDefault();if(lock.current)return;if(assetReading){setError('请等待封面读取完成');return;}lock.current=true;setBusy(true);let persisted,persistedCover;
    try{
      const fields={id:item.id,entity,access:draft,...(entity==='node'?{localAccess:local,permissionMode:mode,convertedBy}:{}),expected:fingerprint.current,...(settings?{name,description,expectedMetadata:metadata.current,expectedAppearance:appearance.current,categoryIds,expectedCategories:categorySnapshot.current}:{})};
      savePermissionDetails(loadState(),fields,userId);
      if(settings){persisted=await persistLibraryIcon(icon);persistedCover=await persistLibraryCover(cover);}
      let visibility;update(current=>{if(current.viewAs!==userId)throw Error('当前用户已变化，请重新操作');const next=savePermissionDetails(current,{...fields,...(persisted?{icon:persisted.icon,cover:persistedCover.cover}:{})},userId),target=next[entity==='space'?'spaces':'nodes'].find(n=>n.id===item.id);visibility=(entity==='space'?spaceAccess(next,target):effectiveAccess(next,target)).visibility;return next;});
      onSaved(visibility);onClose();
    }catch(err){await persisted?.rollback().catch(()=>{});await persistedCover?.rollback().catch(()=>{});setError(err.message);}finally{lock.current=false;setBusy(false);}
  };
  const title=settings?'知识库设置':'权限管理';
  const initialForm=useRef({serialized:JSON.stringify([draft,local,mode,convertedBy,name,description,icon,cover,categoryIds]),iconFile:icon?.file,coverFile:cover?.file});
  const originalPermission=useRef(JSON.stringify([draft,local,mode,convertedBy])),permissionDirty=JSON.stringify([draft,local,mode,convertedBy])!==originalPermission.current;
  const dirty=JSON.stringify([draft,local,mode,convertedBy,name,description,icon,cover,categoryIds])!==initialForm.current.serialized||icon?.file!==initialForm.current.iconFile||cover?.file!==initialForm.current.coverFile;
  const {requestClose,prompt}=useDiscardGuard(dirty,onClose,busy||assetReading||lock.current);
  useLocationDialog(root,requestClose);

  return <>{prompt}<div className="knowledge-product-dialog-backdrop access-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)requestClose();}}><form ref={root} className={`knowledge-product-dialog access-dialog ${settings?'library-metadata-dialog':''}`} role="dialog" aria-modal="true" aria-label={title} onSubmit={save}>
    <header><div><h2>{title}</h2><p>{item.name}</p></div><button type="button" className="access-close" aria-label={`关闭${title}`} disabled={busy} onClick={requestClose}><X size={19}/></button></header>
    {settings&&<LibraryMetadata name={name} setName={setName} description={description} setDescription={setDescription} icon={icon} setIcon={setIcon} cover={cover} setCover={setCover} disabled={busy} onLoadingChange={setAssetReading} onEdit={()=>setError('')} legacyTone={['','ice','night','amber'][Math.max(0,state.spaces.findIndex(s=>s.id===item.id))%4]}/>}
    {settings&&<LibraryCategoryField value={categoryIds} disabled={busy} onChange={next=>{setCategoryIds(next);setError('');}}/>}
    <fieldset className="permission-edit-fields" disabled={busy}><AccessManagerFields state={state} userId={userId} local={entity==='space'?draft:local} inherited={entity==='space'?{subjects:[]}:layers.inherited} floor={entity==='space'?plazaFloor(state,library):layers.floor} ownerIds={ownerIds} protectedRows={protectedRows} personal={libraryType(library)==='personal'} mode={mode} allowModeSwitch={entity==='node'} showResponsibility showFloorNotice allowTransfer={!!onHandover&&libraryType(library)!=='personal'} transferReason={handoverReason(state,item.id,entity,userId)} onTransferOwner={()=>onHandover?.(item,entity)} onModeChange={next=>{const result=switchNodePermissionMode(state,{...item,permissionMode:mode,localAccess:local,convertedBy},next,userId);setMode(result.permissionMode);setLocal(result.localAccess);setConvertedBy(result.convertedBy);setError('');}} onChange={value=>{if(entity==='space')setDraft(value);else setLocal(value);setError('');}}/></fieldset>
    {permissionDirty&&(entity==='space'||item.type==='folder')&&<p className="access-note decision-note">保存后，仍处于继承模式的下级会跟随父级当前实际权限更新；已转为自定义的下级保持其快照，不再随本次修改变化。</p>}
    {error&&<p role="alert" className="access-error">{error}</p>}<footer>{settings&&onDelete&&<button type="button" className="library-delete-button" disabled={busy||assetReading} onClick={()=>onDelete(item)}>删除知识库</button>}<button type="button" disabled={busy} onClick={requestClose}>取消</button><button type="submit" disabled={busy||assetReading}>{busy?'保存中…':settings?'保存设置':'保存权限'}</button></footer>
  </form></div></>;
}
export function LibraryCreateDialog({state,userId,view='personal',chooseInitializer=false,update,onClose,onCreated}){
  const [name,setName]=useState(''),[description,setDescription]=useState(''),[initializer,setInitializer]=useState(view),[drafts,setDrafts]=useState(()=>Object.fromEntries(['personal','shared','plaza'].map(v=>[v,initialAccess(state,v)]))),[categoryIds,setCategoryIds]=useState([]),[error,setError]=useState(''),[icon,setIcon]=useState({kind:'preset',key:'book'}),[cover,setCover]=useState({kind:'preset',key:'mist'}),[assetReading,setAssetReading]=useState(false),[busy,setBusy]=useState(false);
  const root=useRef(null),lock=useRef(false);
  const initialForm=useRef({serialized:JSON.stringify([name,description,initializer,drafts,icon,cover,categoryIds]),iconFile:icon?.file,coverFile:cover?.file});
  const dirty=JSON.stringify([name,description,initializer,drafts,icon,cover,categoryIds])!==initialForm.current.serialized||icon?.file!==initialForm.current.iconFile||cover?.file!==initialForm.current.coverFile;
  const {requestClose,prompt}=useDiscardGuard(dirty,onClose,busy||assetReading||lock.current);useLocationDialog(root,requestClose);
  const submit=async e=>{e.preventDefault();if(lock.current)return;if(assetReading){setError('请等待封面读取完成');return;}lock.current=true;setBusy(true);let persisted,persistedCover;try{const fields={name,description,access:drafts[initializer],initializer,categoryIds};createLibrary(loadState(),fields,userId);persisted=await persistLibraryIcon(icon);persistedCover=await persistLibraryCover(cover);let result;update(s=>{if(s.viewAs!==userId)throw Error('当前用户已变化，请重新操作');result=createLibrary(s,{...fields,icon:persisted.icon,cover:persistedCover.cover},userId);return result.state;});onCreated(result.library);onClose();}catch(err){await persisted?.rollback().catch(()=>{});await persistedCover?.rollback().catch(()=>{});setError(err.message);}finally{lock.current=false;setBusy(false);}};
  return <>{prompt}<div className="knowledge-product-dialog-backdrop access-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)requestClose();}}><form ref={root} className="knowledge-product-dialog access-dialog library-metadata-dialog" role="dialog" aria-modal="true" aria-label="新建知识库" onSubmit={submit}>
    <header><h2>新建知识库</h2><button type="button" className="access-close" aria-label="关闭新建知识库" disabled={busy} onClick={requestClose}><X size={19}/></button></header>
    <LibraryMetadata name={name} setName={setName} description={description} setDescription={setDescription} icon={icon} setIcon={setIcon} cover={cover} setCover={setCover} disabled={busy} onLoadingChange={setAssetReading} onEdit={()=>setError('')}/>
    <fieldset className="permission-edit-fields" disabled={busy}>{chooseInitializer&&<fieldset className="library-initial-types library-initial-cards"><legend>知识库类型</legend>{[['personal','个人','仅本人管理，协作时需移动内容'],['shared','共享','可授权公司、部门或人员协作'],['plaza','知识广场','固定公司全员查看，可追加权限']].map(([id,label,description])=><label className={initializer===id?'selected':''} key={id}><input type="radio" name="library-initializer" value={id} checked={initializer===id} onChange={()=>{setInitializer(id);setError('');}}/><span><b>{label}</b><small>{description}</small></span></label>)}</fieldset>}
    <LibraryCategoryField value={categoryIds} disabled={busy} onChange={next=>{setCategoryIds(next);setError('');}}/>
    {initializer==='personal'?<GrantFields state={state} value={drafts[initializer]} onChange={()=>{}} ownerIds={[userId]} allowAdd={false}/>:<GrantFields state={state} value={drafts[initializer]} onChange={value=>{setDrafts(current=>({...current,[initializer]:value}));setError('');}} ownerIds={[userId]} floor={initializer==='plaza'?plazaFloor(state,{kind:'plaza'}):[]} allowAdd defaultRole={initializer==='plaza'?'editor':'viewer'}/>}
    </fieldset>
    {error&&<p className="access-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={requestClose}>取消</button><button type="submit" disabled={busy||assetReading}>{busy?'创建中…':'创建知识库'}</button></footer>
  </form></div></>;
}
