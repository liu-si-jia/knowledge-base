import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Buildings, UsersThree, UserCircle, Plus, X } from '@phosphor-icons/react';
import { subjectKey, subjectLabel, accessFromSubjects } from './permissions.js';
import { GrantNotices, SubjectPicker } from './GrantFields.jsx';
import PermissionRolePicker, { permissionRoleOptions } from './PermissionRolePicker.jsx';
import {
  DEFAULT_ADD_ROLE, collaboratorCaption, subjectCountLabel, MODE_SWITCH_COPY,
  prepareAddedCollaborators, applyCollaboratorAction, applyBatchCollaboratorAction,
  rowRoleOptions, batchPermissionOptions, classifyCollaborator,
} from './collaboratorRules.js';
import { explainPermission, permissionLabel } from './permissionExplanation.js';
import { useLocationDialog } from './LocationPicker.jsx';
import './grants.css';

const icons={company:Buildings,department:UsersThree,person:UserCircle};

function SubjectAvatar({state,subject}){
  if(subject.type==='person'){
    const name=subjectLabel(state,subject);
    return <span className="grant-avatar" aria-hidden="true">{(name||'?').slice(0,1)}</span>;
  }
  const Icon=icons[subject.type];
  return <span className="grant-avatar is-org" aria-hidden="true"><Icon size={18}/></span>;
}

function CollaboratorRolePicker({label,kind,role,inheritedRole,effectiveRole,onChange,allowRemove,mode}){
  const options=rowRoleOptions(kind,role,inheritedRole,mode);
  const actions=allowRemove?[{value:'remove',label:'移除',description:'移除此授权对象'}]:[];
  return <PermissionRolePicker label={label} value={role} displayValue={effectiveRole} disabled={mode==='inherit'} options={permissionRoleOptions(role,actions).map(option=>{
    const match=options.find(item=>item.value===option.value);
    return match?{...option,disabled:match.disabled}:option;
  })} onChange={onChange} groupLabel="设置本项权限"/>;
}

function BatchRolePicker({label,rows,onChange,allowRemove=true,mode='custom'}){
  const {options,canRemove}=batchPermissionOptions(rows,mode);
  const actions=allowRemove&&canRemove?[{value:'remove',label:'移除',description:'移除所选授权对象'}]:[];
  const current=options.find(option=>!option.disabled)?.value||'';
  return <PermissionRolePicker label={label} value={current} triggerLabel="修改权限" options={[...options.map(option=>({...option})),...actions.map((action,index)=>({...action,danger:true,separated:index===0}))]} onChange={onChange} groupLabel="批量修改权限"/>;
}

function ModeSwitchConfirm({nextMode,onCancel,onConfirm}){
  const root=useRef(null);
  useLocationDialog(root,onCancel);
  const copy=MODE_SWITCH_COPY[nextMode];
  const capture=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}};
  return createPortal(<div className="subject-picker-backdrop permission-mode-backdrop" onMouseDown={e=>{e.stopPropagation();if(e.target===e.currentTarget)onCancel();}}>
    <form ref={root} className="subject-picker location-picker permission-mode-confirm" role="dialog" aria-modal="true" aria-label={copy.title} onKeyDownCapture={capture} onSubmit={e=>{e.preventDefault();e.stopPropagation();onConfirm();}}>
      <header><h2>{copy.title}</h2><button type="button" className="location-close" aria-label="关闭权限模式确认" onClick={onCancel}><X size={19}/></button></header>
      <p>{copy.body}</p>
      <footer><button type="button" onClick={onCancel}>取消</button><button type="submit" className="location-confirm">确认</button></footer>
    </form>
  </div>,document.body);
}

export default function AccessManagerFields({
  state,userId,local,inherited,floor=[],ownerIds=[],protectedRows,onChange,personal=false,
  mode,onModeChange,allowModeSwitch=false,
}){
  const currentMode=allowModeSwitch?(mode||'inherit'):'custom';
  const inheritLocked=currentMode==='inherit';
  const inheritedSubjects=inherited?.subjects||[];
  const localSubjects=local?.subjects||[];
  const inheritedKeys=new Set(inheritedSubjects.map(subjectKey));
  const localKeys=new Set(localSubjects.map(subjectKey));
  const protections=protectedRows||[...new Set(ownerIds.filter(Boolean))].map(id=>({id,sources:['负责人']}));
  const ownerSet=new Set(protections.map(row=>row.id));
  const floorKey=floor.length?subjectKey(floor[0]):'';
  const collaborators=(inheritLocked?inheritedSubjects:localSubjects)
    .filter(s=>!(s.type==='person'&&ownerSet.has(s.id)))
    .filter(s=>subjectKey(s)!==floorKey||s.role!=='viewer');
  const [selected,setSelected]=useState(()=>new Set());
  const [picker,setPicker]=useState(false);
  const [pending,setPending]=useState(null);
  const [modePrompt,setModePrompt]=useState('');
  const selectableKeys=inheritLocked?[]:collaborators.map(subjectKey);
  const selectedKeys=[...selected].filter(key=>selectableKeys.includes(key));
  const allSelected=selectableKeys.length>0&&selectableKeys.every(key=>selected.has(key));
  const someSelected=selectedKeys.length>0;
  const toggle=key=>setSelected(current=>{const next=new Set(current);next.has(key)?next.delete(key):next.add(key);return next;});
  const emit=nextLocals=>onChange(accessFromSubjects(state,nextLocals));
  const changeRow=(subject,action)=>{
    const result=applyCollaboratorAction(state,{localSubjects,inheritedSubjects,mode:currentMode},subject,action,userId);
    if(!result.error){emit(result.localSubjects);setSelected(current=>{const next=new Set(current);if(action==='remove')next.delete(subjectKey(subject));return next;});}
  };
  const changeBatch=action=>{
    const result=applyBatchCollaboratorAction(state,{localSubjects,inheritedSubjects,mode:currentMode},selectedKeys,action,userId);
    if(!result.error){emit(result.localSubjects);if(action==='remove')setSelected(new Set());}
  };
  const existingForPicker=[...inheritedSubjects,...localSubjects,...floor,...protections.map(row=>({type:'person',id:row.id}))];
  const batchRows=selectedKeys.map(key=>{
    const localRow=localSubjects.find(s=>subjectKey(s)===key);
    return {kind:'local',role:localRow?.role};
  }).filter(row=>row.role);

  return <div className="grant-fields access-manager-fields">
    <GrantNotices state={state} showOwners={false} floor={floor}/>
    {!!protections.length&&<div className="grant-responsibility" aria-label="负责人">
      {protections.map(row=>{
        const subject={type:'person',id:row.id},name=subjectLabel(state,subject);
        return <div className="grant-row is-owner" key={`owner:${row.id}`}>
          <SubjectAvatar state={state} subject={subject}/>
          <div className="grant-subject">
            <b>{name}{row.sources.map(source=><span className="grant-owner-tag" key={source}>{source}</span>)}</b>
          </div>
          <span className="grant-fixed-role">可管理</span>
        </div>;
      })}
    </div>}
    {allowModeSwitch&&<div className="grant-mode-bar">
      <p>当前：{inheritLocked?'继承权限':'自定义权限'}</p>
      <button type="button" className="grant-mode-switch" onClick={()=>setModePrompt(inheritLocked?'custom':'inherit')}>{inheritLocked?'转为自定义':'改回继承'}</button>
    </div>}
    <div className="grant-heading">
      <span>{inheritLocked?'继承权限':'所有协作者'}</span>
      {!personal&&!inheritLocked&&<button type="button" className="grant-add" onClick={()=>setPicker(true)}><Plus size={14}/>添加协作者</button>}
    </div>
    {!!selectableKeys.length&&<div className="grant-batch-bar">
      <label className="grant-check"><input type="checkbox" checked={allSelected} ref={el=>{if(el)el.indeterminate=someSelected&&!allSelected;}} onChange={()=>setSelected(allSelected?new Set():new Set(selectableKeys))}/>全选</label>
      {someSelected&&<BatchRolePicker label="批量修改权限" rows={batchRows} mode={currentMode} onChange={changeBatch}/>}
    </div>}
    <div className="grant-list">
      {collaborators.map(subject=>{
        const key=subjectKey(subject),kind=inheritLocked?'inherited':classifyCollaborator(key,localKeys,inheritedKeys),name=subjectLabel(state,subject);
        const caption=collaboratorCaption(state,subject,{mode:currentMode});
        const parent=inheritedSubjects.find(s=>subjectKey(s)===key),explanation=explainPermission(state,subject,{local:inheritLocked?[]:localSubjects,inherited:inheritLocked?inheritedSubjects:[],floor,protectedRows:protections});
        return <div className="grant-row" key={key}>
          {!inheritLocked&&<label className="grant-check"><input type="checkbox" checked={selected.has(key)} aria-label={`选择 ${name}`} onChange={()=>toggle(key)}/></label>}
          <SubjectAvatar state={state} subject={subject}/>
          <div className="grant-subject"><b>{name}</b><small>{caption}</small></div>
          {inheritLocked?<span className="grant-fixed-role">{permissionLabel(subject.role)}</span>:<CollaboratorRolePicker label={`${name}的权限`} kind={kind} mode={currentMode} role={subject.role} inheritedRole={parent?.role} effectiveRole={explanation.effectiveRole} allowRemove={!inheritLocked} onChange={role=>changeRow(subject,role)}/>}
        </div>;
      })}
      {!collaborators.length&&<p className="grant-empty">{inheritLocked?'当前没有从父级继承的普通权限':'尚未添加其他授权对象'}</p>}
    </div>
    {picker&&!inheritLocked&&<SubjectPicker title="选择协作者" state={state} ownerIds={[...ownerSet]} blocked={existingForPicker} selected={[]} onClose={()=>setPicker(false)} onConfirm={chosen=>{
      const additions=prepareAddedCollaborators(chosen,userId,existingForPicker).map(s=>({...s,role:DEFAULT_ADD_ROLE,addedBy:undefined}));
      setPicker(false);
      if(additions.length)setPending(additions.map(s=>({type:s.type,id:s.id,role:DEFAULT_ADD_ROLE})));
    }}/>}
    {pending&&<AddCollaboratorsConfirm state={state} pending={pending} setPending={setPending} onCancel={()=>setPending(null)} onConfirm={rows=>{emit([...localSubjects,...prepareAddedCollaborators(rows,userId,existingForPicker)]);setPending(null);}}/>}
    {modePrompt&&<ModeSwitchConfirm nextMode={modePrompt} onCancel={()=>setModePrompt('')} onConfirm={()=>{onModeChange(modePrompt);setModePrompt('');setSelected(new Set());}}/>}
  </div>;
}

function AddCollaboratorsConfirm({state,pending,setPending,onCancel,onConfirm}){
  const root=useRef(null);
  useLocationDialog(root,onCancel);
  const capture=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}};
  const setAll=role=>setPending(current=>current.map(s=>({...s,role})));
  const setOne=(key,role)=>setPending(current=>current.map(s=>subjectKey(s)===key?{...s,role}:s));
  return createPortal(<div className="subject-picker-backdrop add-collaborators-backdrop" onMouseDown={e=>{e.stopPropagation();if(e.target===e.currentTarget)onCancel();}}>
    <form ref={root} className="subject-picker location-picker add-collaborators-confirm" role="dialog" aria-modal="true" aria-label="添加协作者" onKeyDownCapture={capture} onSubmit={e=>{e.preventDefault();e.stopPropagation();onConfirm(pending);}}>
      <header><h2>添加协作者</h2><button type="button" className="location-close" aria-label="关闭添加协作者" onClick={onCancel}><X size={19}/></button></header>
      <div className="add-collaborators-toolbar">
        <strong>{subjectCountLabel(pending)}</strong>
        <BatchRolePicker label="修改权限" allowRemove={false} rows={pending.map(s=>({kind:'local',role:s.role}))} onChange={setAll}/>
      </div>
      <div className="grant-list add-collaborators-list">
        {pending.map(subject=>{
          const name=subjectLabel(state,subject);
          return <div className="grant-row" key={subjectKey(subject)}>
            <SubjectAvatar state={state} subject={subject}/>
            <div className="grant-subject"><b>{name}</b><small>{{company:'公司',department:'部门',person:'人员'}[subject.type]}</small></div>
            <PermissionRolePicker label={`${name}的权限`} value={subject.role} options={permissionRoleOptions(subject.role,[])} onChange={role=>setOne(subjectKey(subject),role)}/>
          </div>;
        })}
      </div>
      <footer><button type="button" onClick={onCancel}>取消</button><button type="submit" className="location-confirm">确认</button></footer>
    </form>
  </div>,document.body);
}
