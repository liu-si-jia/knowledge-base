import useDiscardGuard from './useDiscardGuard.jsx';
import { creatorId, responsibleId } from './ownership.js';
import { useRef, useState } from 'react';
import { X, CaretRight } from '@phosphor-icons/react';
import { SCOPE_LABELS, accessFingerprint, effectiveAccess, parentAccess, spaceAccess, saveEntityAccess, contentRights, libraryRights, scopeSummary, permissionLayers, displayedResponsibles, libraryLocalAccess, libraryType, plazaFloor, LIBRARY_TYPES, switchNodePermissionMode, permissionModeFor } from './access.js';
import { initialAccess, toSubjectAccess, accessFromSubjects } from './permissions.js';
import { GrantFields, GrantNotices } from './GrantFields.jsx';
import AccessManagerFields, { ModeSwitchConfirm } from './AccessManagerFields.jsx';
import { managementDraftFromShare } from './collaboratorRules.js';
import { shareInheritGuidance, SHARE_NO_MANAGE_COPY } from './shareGuidance.js';
import { createLibrary } from './libraryCreation.js';
import { useLocationDialog } from './LocationPicker.jsx';
import { persistLibraryIcon } from './libraryIcons.jsx';
import LibraryMetadata, { persistLibraryCover } from './LibraryMetadata.jsx';
import { loadState } from './store.js';
import { addCollaborators, permissionTarget, savePermissionDetails } from './permissionOperations.js';
import './access.css';

const clone=value=>JSON.parse(JSON.stringify(value));
export const AccessFields=GrantFields;
export function ScopeBadge({access,onClick}){return onClick?<button type="button" className={`scope-badge ${access.visibility}`} onClick={onClick}>{SCOPE_LABELS[access.visibility]}</button>:<span className={`scope-badge ${access.visibility}`}>{SCOPE_LABELS[access.visibility]}</span>;}
export default function AccessDialog(props){if(!props.item)return <Unavailable onClose={props.onClose}/>;const library=props.entity==='space'?props.item:props.state.spaces.find(space=>space.id===props.item.spaceId);if(!props.settings&&libraryType(library)==='personal')return <Unavailable onClose={props.onClose} message="个人内容仅自己可见，无需配置权限"/>;const rights=props.entity==='space'?libraryRights(props.state,props.item,props.userId):contentRights(props.state,props.item,props.userId);return rights.manage?<EditAccessDialog {...props}/>:<Unavailable onClose={props.onClose} message="当前没有管理权限"/>;}
function Unavailable({onClose,message='内容已不可用'}){return <div className="action-backdrop"><section className="action-dialog" role="dialog" aria-label="操作不可用"><p>{message}</p><button type="button" onClick={onClose}>关闭</button></section></div>;}
function EditAccessDialog({state,userId,item,entity='node',update,onClose,onSaved,settings=false,initialDraft,initialLocal,expectedOverride,fromShare=false,onDelete}){
  const library=entity==='space'?item:state.spaces.find(s=>s.id===item.spaceId),protectedRows=displayedResponsibles(state,item,entity),ownerIds=protectedRows.map(row=>row.id),layers=entity==='node'?permissionLayers(state,item):null;
  const [draft,setDraft]=useState(()=>initialDraft||libraryLocalAccess(state,library)),[local,setLocal]=useState(()=>initialLocal||layers?.local),[mode,setMode]=useState(()=>entity==='node'?permissionModeFor({...item,...(layers?{permissionMode:layers.mode,localAccess:initialLocal||layers.local}:{})}):undefined),[convertedBy,setConvertedBy]=useState(()=>entity==='node'?item.convertedBy:undefined),[error,setError]=useState('');
  const [name,setName]=useState(item.name),[description,setDescription]=useState(item.description||''),[icon,setIcon]=useState(item.icon||{kind:'preset',key:'book'}),[cover,setCover]=useState(item.cover||{kind:'preset',key:'original'}),[assetReading,setAssetReading]=useState(false),[busy,setBusy]=useState(false);
  const fingerprint=useRef(expectedOverride||accessFingerprint(state,item,entity)),metadata=useRef(JSON.stringify([item.name,item.description||''])),appearance=useRef(JSON.stringify([item.icon||null,item.cover||null])),root=useRef(null),lock=useRef(false);
  const save=async e=>{
    e.preventDefault();if(lock.current)return;if(assetReading){setError('请等待封面读取完成');return;}lock.current=true;setBusy(true);let persisted,persistedCover;
    try{
      const fields={id:item.id,entity,access:draft,...(entity==='node'?{localAccess:local,permissionMode:mode,convertedBy}:{}),expected:fingerprint.current,...(settings?{name,description,expectedMetadata:metadata.current,expectedAppearance:appearance.current}:{})};
      savePermissionDetails(loadState(),fields,userId);
      if(settings){persisted=await persistLibraryIcon(icon);persistedCover=await persistLibraryCover(cover);}
      let visibility;update(current=>{if(current.viewAs!==userId)throw Error('当前用户已变化，请重新操作');const next=savePermissionDetails(current,{...fields,...(persisted?{icon:persisted.icon,cover:persistedCover.cover}:{})},userId),target=next[entity==='space'?'spaces':'nodes'].find(n=>n.id===item.id);visibility=(entity==='space'?spaceAccess(next,target):effectiveAccess(next,target)).visibility;return next;});
      onSaved(visibility);onClose();
    }catch(err){await persisted?.rollback().catch(()=>{});await persistedCover?.rollback().catch(()=>{});setError(err.message);}finally{lock.current=false;setBusy(false);}
  };
  const title=settings?'知识库设置':'权限管理';
  const initialForm=useRef({serialized:JSON.stringify([draft,local,mode,convertedBy,name,description,icon,cover]),iconFile:icon?.file,coverFile:cover?.file});
  const originalPermission=useRef(JSON.stringify([draft,local,mode,convertedBy])),permissionDirty=JSON.stringify([draft,local,mode,convertedBy])!==originalPermission.current;
  const dirty=JSON.stringify([draft,local,mode,convertedBy,name,description,icon,cover])!==initialForm.current.serialized||icon?.file!==initialForm.current.iconFile||cover?.file!==initialForm.current.coverFile;
  const {requestClose,prompt}=useDiscardGuard(dirty,onClose,busy||assetReading||lock.current);
  useLocationDialog(root,requestClose);

  return <>{prompt}<div className="knowledge-product-dialog-backdrop access-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)requestClose();}}><form ref={root} className={`knowledge-product-dialog access-dialog ${settings?'library-metadata-dialog':''}`} role="dialog" aria-modal="true" aria-label={title} onSubmit={save}>
    <header><div><h2>{title}</h2><p>{item.name}</p></div><button type="button" className="access-close" aria-label={`关闭${title}`} disabled={busy} onClick={requestClose}><X size={19}/></button></header>
    {settings&&<LibraryMetadata name={name} setName={setName} description={description} setDescription={setDescription} icon={icon} setIcon={setIcon} cover={cover} setCover={setCover} disabled={busy} onLoadingChange={setAssetReading} onEdit={()=>setError('')} legacyTone={['','ice','night','amber'][Math.max(0,state.spaces.findIndex(s=>s.id===item.id))%4]}/>}
    {settings&&<div className="library-settings-meta">
      <p className="library-kind-readonly">知识库类型：{LIBRARY_TYPES[libraryType(library)]}</p>
      <p className="library-responsibility">历史创建人：{state.members.find(m=>m.id===creatorId(item))?.name||'未知成员'} · 当前负责人：{state.members.find(m=>m.id===responsibleId(item))?.name||'未知成员'}</p>
      {libraryType(library)==='plaza'&&<GrantNotices state={state} showOwners={false} floor={plazaFloor(state,library)}/>}
    </div>}
    {!(settings&&libraryType(library)==='personal')&&<fieldset className="permission-edit-fields" disabled={busy}>{libraryType(library)==='personal'?<GrantNotices state={state} ownerIds={ownerIds} protectedRows={protectedRows}/>:<AccessManagerFields state={state} userId={userId} local={entity==='space'?draft:local} inherited={entity==='space'?{subjects:[]}:layers.inherited} floor={entity==='space'?plazaFloor(state,library):layers.floor} ownerIds={ownerIds} protectedRows={protectedRows} personal={libraryType(library)==='personal'} mode={mode} allowModeSwitch={entity==='node'} showResponsibility={!settings} showFloorNotice={!settings} onModeChange={next=>{const result=switchNodePermissionMode(state,{...item,permissionMode:mode,localAccess:local,convertedBy},next,userId);setMode(result.permissionMode);setLocal(result.localAccess);setConvertedBy(result.convertedBy);setError('');}} onChange={value=>{if(entity==='space')setDraft(value);else setLocal(value);setError('');}}/>}</fieldset>}
    {permissionDirty&&(entity==='space'||item.type==='folder')&&<p className="access-note decision-note">保存后，仍处于继承模式的下级会跟随父级当前实际权限更新；已转为自定义的下级保持其快照，不再随本次修改变化。</p>}
    {error&&<p role="alert" className="access-error">{error}</p>}<footer>{settings&&onDelete&&<button type="button" className="library-delete-button" disabled={busy||assetReading} onClick={()=>onDelete(item)}>删除知识库</button>}<button type="button" disabled={busy} onClick={requestClose}>{fromShare?'返回分享':'取消'}</button><button type="submit" disabled={busy||assetReading}>{busy?'保存中…':settings?'保存设置':'保存权限'}</button></footer>
  </form></div></>;
}
export function ShareDialog(props){return props.item?<ShareController {...props}/>:<Unavailable onClose={props.onClose}/>;}
function ShareController({state,userId,item,entity='node',update,onClose,onSaved,afterMove=false,onHandover}){
  const [pending,setPending]=useState([]),[mode,setMode]=useState('share'),fingerprint=useRef(accessFingerprint(state,item,entity));
  let target;try{target=permissionTarget(state,item.id,entity,userId);}catch{return <Unavailable onClose={onClose} message={entity==='node'?SHARE_NO_MANAGE_COPY:'只有管理者可以添加协作者'}/>;}
  if(libraryType(target.library)==='personal')return <Unavailable onClose={onClose} message="个人内容仅本人管理，请先移动到共享知识库或知识广场再添加协作者"/>;
  const merged=managementDraftFromShare(target,entity);
  if(mode==='permissions')return <AccessDialog state={state} userId={userId} item={item} entity={entity} update={update} initialDraft={merged} initialLocal={entity==='node'?merged:undefined} onHandover={onHandover} expectedOverride={fingerprint.current} fromShare onClose={()=>setMode('share')} onSaved={visibility=>{onSaved(visibility);onClose();}}/>;
  return <ShareForm afterMove={afterMove} state={state} userId={userId} item={item} entity={entity} target={target} pending={pending} setPending={setPending} expected={fingerprint.current} update={update} onClose={onClose} onManage={()=>setMode('permissions')} onSaved={onSaved}/>;
}
function ShareForm({state,userId,item,entity,afterMove,target,pending,setPending,expected,update,onClose,onManage,onSaved}){
  const root=useRef(null),[error,setError]=useState(''),[modePrompt,setModePrompt]=useState(false);
  const {requestClose,prompt}=useDiscardGuard(pending.length>0,onClose);useLocationDialog(root,requestClose);
  const guidance=shareInheritGuidance(state,item,entity,userId);
  const canAdd=guidance.canAdd;
  const commit=()=>{try{let visibility;update(s=>{if(s.viewAs!==userId)throw Error('当前用户已变化，请重新操作');const latest=s[entity==='space'?'spaces':'nodes'].find(n=>n.id===item.id);const next=addCollaborators(s,{id:item.id,entity,subjects:pending,expected:accessFingerprint(s,latest,entity),confirmedIndependent:true},userId);visibility=entity==='space'?spaceAccess(next,next.spaces.find(n=>n.id===item.id)).visibility:effectiveAccess(next,next.nodes.find(n=>n.id===item.id)).visibility;return next;});onSaved(visibility);onClose();}catch(err){setError(err.message);}};
  const submit=e=>{e.preventDefault();if(!canAdd){setError(guidance.message||SHARE_NO_MANAGE_COPY);return;}if(!pending.length){setError('请选择要添加的协作者');return;}commit();};
  const confirmSwitch=()=>{
    try{
      update(s=>{
        if(s.viewAs!==userId)throw Error('当前用户已变化，请重新操作');
        const current=s.nodes.find(n=>n.id===item.id);
        const result=switchNodePermissionMode(s,current,'custom',userId);
        return saveEntityAccess(s,{id:item.id,permissionMode:result.permissionMode,localAccess:result.localAccess,convertedBy:result.convertedBy},userId);
      });
      setModePrompt(false);setError('');
    }catch(err){setModePrompt(false);setError(err.message);}
  };
  return <>{prompt}{modePrompt&&<ModeSwitchConfirm nextMode="custom" onCancel={()=>setModePrompt(false)} onConfirm={confirmSwitch}/>}<div className="knowledge-product-dialog-backdrop access-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)requestClose();}}><form ref={root} className="knowledge-product-dialog access-dialog share-dialog" role="dialog" aria-modal="true" aria-label="分享" onSubmit={submit}><header><div><h2>分享</h2><p>{item.name}</p></div><button type="button" className="access-close" aria-label="关闭分享" onClick={requestClose}><X size={19}/></button></header>{afterMove&&<p className="access-note">移动已完成；关闭此弹窗不会撤销移动。</p>}<div className="share-intro"><span>邀请协作者</span><button type="button" title="查看、修改或移除已有授权" onClick={onManage}>权限管理 <CaretRight size={13}/></button></div>
    {guidance.kind==='inherit-manage'&&<div className="share-inherit-guide"><p>{guidance.message}</p><button type="button" onClick={()=>setModePrompt(true)}>转为自定义</button></div>}
    {guidance.kind==='inherit-no-manage'&&<p className="share-inherit-blocked" role="status">{SHARE_NO_MANAGE_COPY}</p>}
    {canAdd&&<GrantFields state={state} value={accessFromSubjects(state,pending)} onChange={value=>{setPending(value.subjects);setError('');}} ownerIds={target.owners} showOwners={false} heading="待新增协作者" explanationContext={{local:(entity==='node'?target.layers.local:target.access).subjects,inherited:target.layers?.inherited?.subjects||[],excluded:target.layers?.excluded||[],sourceLabel:item.parentId?'父级目录':'知识库'}} blocked={[...(entity==='node'?[...target.layers.local.subjects,...(target.layers.inherited?.subjects||[])]:target.access.subjects),...plazaFloor(state,target.library)]}/>}
    {canAdd&&<p className="access-note decision-note" hidden={!pending.length}>本次新增 {pending.length} 项授权，已有授权保持不变。</p>}
    {error&&<p className="access-error" role="alert">{error}</p>}
    <footer><button type="button" onClick={requestClose}>取消</button><button type="submit" disabled={!canAdd||!pending.length}>添加协作者</button></footer></form></div></>;
}
export function LibraryCreateDialog({state,userId,view='personal',chooseInitializer=false,update,onClose,onCreated}){
  const [name,setName]=useState(''),[description,setDescription]=useState(''),[initializer,setInitializer]=useState(view),[drafts,setDrafts]=useState(()=>Object.fromEntries(['personal','shared','plaza'].map(v=>[v,initialAccess(state,v)]))),[error,setError]=useState(''),[icon,setIcon]=useState({kind:'preset',key:'book'}),[cover,setCover]=useState({kind:'preset',key:'mist'}),[assetReading,setAssetReading]=useState(false),[busy,setBusy]=useState(false);
  const root=useRef(null),lock=useRef(false);
  const initialForm=useRef({serialized:JSON.stringify([name,description,initializer,drafts,icon,cover]),iconFile:icon?.file,coverFile:cover?.file});
  const dirty=JSON.stringify([name,description,initializer,drafts,icon,cover])!==initialForm.current.serialized||icon?.file!==initialForm.current.iconFile||cover?.file!==initialForm.current.coverFile;
  const {requestClose,prompt}=useDiscardGuard(dirty,onClose,busy||assetReading||lock.current);useLocationDialog(root,requestClose);
  const submit=async e=>{e.preventDefault();if(lock.current)return;if(assetReading){setError('请等待封面读取完成');return;}lock.current=true;setBusy(true);let persisted,persistedCover;try{const fields={name,description,access:drafts[initializer],initializer};createLibrary(loadState(),fields,userId);persisted=await persistLibraryIcon(icon);persistedCover=await persistLibraryCover(cover);let result;update(s=>{if(s.viewAs!==userId)throw Error('当前用户已变化，请重新操作');result=createLibrary(s,{...fields,icon:persisted.icon,cover:persistedCover.cover},userId);return result.state;});onCreated(result.library);onClose();}catch(err){await persisted?.rollback().catch(()=>{});await persistedCover?.rollback().catch(()=>{});setError(err.message);}finally{lock.current=false;setBusy(false);}};
  return <>{prompt}<div className="knowledge-product-dialog-backdrop access-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)requestClose();}}><form ref={root} className="knowledge-product-dialog access-dialog library-metadata-dialog" role="dialog" aria-modal="true" aria-label="新建知识库" onSubmit={submit}>
    <header><h2>新建知识库</h2><button type="button" className="access-close" aria-label="关闭新建知识库" disabled={busy} onClick={requestClose}><X size={19}/></button></header>
    <LibraryMetadata name={name} setName={setName} description={description} setDescription={setDescription} icon={icon} setIcon={setIcon} cover={cover} setCover={setCover} disabled={busy} onLoadingChange={setAssetReading} onEdit={()=>setError('')}/>
    <fieldset className="permission-edit-fields" disabled={busy}>{chooseInitializer&&<fieldset className="library-initial-types library-initial-cards"><legend>知识库类型</legend>{[['personal','个人','仅本人管理，协作时需移动内容'],['shared','共享','可授权公司、部门或人员协作'],['plaza','知识广场','固定公司全员查看，可追加权限']].map(([id,label,description])=><label className={initializer===id?'selected':''} key={id}><input type="radio" name="library-initializer" value={id} checked={initializer===id} onChange={()=>{setInitializer(id);setError('');}}/><span><b>{label}</b><small>{description}</small></span></label>)}</fieldset>}
    {!chooseInitializer&&<p className="library-kind-readonly">知识库类型：{LIBRARY_TYPES[initializer]}</p>}
    {initializer==='personal'?<GrantNotices state={state} ownerIds={[userId]}/>:<GrantFields state={state} value={drafts[initializer]} onChange={value=>{setDrafts(current=>({...current,[initializer]:value}));setError('');}} ownerIds={[userId]} floor={initializer==='plaza'?plazaFloor(state,{kind:'plaza'}):[]} allowAdd defaultRole={initializer==='plaza'?'editor':'viewer'}/>}
    </fieldset>
    {error&&<p className="access-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={requestClose}>取消</button><button type="submit" disabled={busy||assetReading}>{busy?'创建中…':'创建知识库'}</button></footer>
  </form></div></>;
}
