import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Buildings, UsersThree, UserCircle, Plus, X } from '@phosphor-icons/react';
import { subjectKey, subjectLabel, accessFromSubjects } from './permissions.js';
import { GrantNotices, SubjectPicker } from './GrantFields.jsx';
import PermissionRolePicker, { permissionRoleOptions } from './PermissionRolePicker.jsx';
import {
  DEFAULT_ADD_ROLE, collaboratorCaption, subjectCountLabel,
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

function CollaboratorRolePicker({label,kind,role,inheritedRole,effectiveRole,onChange,allowRemove}){
  const options=rowRoleOptions(kind,role,inheritedRole);
  const actions=allowRemove?[{value:'remove',label:'移除',description:'移除此授权对象'}]:[];
  return <PermissionRolePicker label={label} value={role} displayValue={effectiveRole} options={permissionRoleOptions(role,actions).map(option=>{
    const match=options.find(item=>item.value===option.value);
    return match?{...option,disabled:match.disabled}:option;
  })} onChange={onChange} groupLabel="设置本项权限"/>;
}

function BatchRolePicker({label,rows,onChange,allowRemove=true}){
  const {options,canRemove}=batchPermissionOptions(rows);
  const actions=allowRemove&&canRemove?[{value:'remove',label:'移除',description:'移除所选授权对象'}]:[];
  const current=options.find(option=>!option.disabled)?.value||'';
  return <PermissionRolePicker label={label} value={current} triggerLabel="修改权限" options={[...options.map(option=>({...option})),...actions.map((action,index)=>({...action,danger:true,separated:index===0}))]} onChange={onChange} groupLabel="批量修改权限"/>;
}

export default function AccessManagerFields({
  state,userId,local,inherited,floor=[],ownerIds=[],protectedRows,onChange,personal=false,
  responsibleId,onHandover,handoverDisabled=false,handoverTitle='交接负责人',
}){
  const inheritedSubjects=inherited?.subjects||[];
  const localSubjects=local?.subjects||[];
  const inheritedKeys=new Set(inheritedSubjects.map(subjectKey));
  const localKeys=new Set(localSubjects.map(subjectKey));
  const protections=protectedRows||[...new Set(ownerIds.filter(Boolean))].map(id=>({id,sources:['负责人']}));
  const ownerSet=new Set(protections.map(row=>row.id));
  const floorKey=floor.length?subjectKey(floor[0]):'';
  const collaborators=[...inheritedSubjects.filter(s=>!localKeys.has(subjectKey(s))),...localSubjects]
    .filter(s=>!(s.type==='person'&&ownerSet.has(s.id)))
    .filter(s=>subjectKey(s)!==floorKey||s.role!=='viewer');
  const [selected,setSelected]=useState(()=>new Set());
  const [picker,setPicker]=useState(false);
  const [pending,setPending]=useState(null);
  const selectableKeys=collaborators.map(subjectKey);
  const selectedKeys=[...selected].filter(key=>selectableKeys.includes(key));
  const allSelected=selectableKeys.length>0&&selectableKeys.every(key=>selected.has(key));
  const someSelected=selectedKeys.length>0;
  const toggle=key=>setSelected(current=>{const next=new Set(current);next.has(key)?next.delete(key):next.add(key);return next;});
  const emit=nextLocals=>onChange(accessFromSubjects(state,nextLocals));
  const changeRow=(subject,action)=>{
    const result=applyCollaboratorAction(state,{localSubjects,inheritedSubjects},subject,action,userId);
    if(!result.error){emit(result.localSubjects);setSelected(current=>{const next=new Set(current);if(action==='remove')next.delete(subjectKey(subject));return next;});}
  };
  const changeBatch=action=>{
    const result=applyBatchCollaboratorAction(state,{localSubjects,inheritedSubjects},selectedKeys,action,userId);
    if(!result.error){emit(result.localSubjects);if(action==='remove')setSelected(new Set());}
  };
  const existingForPicker=[...inheritedSubjects,...localSubjects,...floor,...protections.map(row=>({type:'person',id:row.id}))];
  const batchRows=selectedKeys.map(key=>{
    const localRow=localSubjects.find(s=>subjectKey(s)===key);
    const inheritedRow=inheritedSubjects.find(s=>subjectKey(s)===key);
    return {kind:classifyCollaborator(key,localKeys,inheritedKeys),role:(localRow||inheritedRow)?.role,inheritedRole:inheritedRow?.role};
  }).filter(row=>row.role);

  return <div className="grant-fields access-manager-fields">
    <GrantNotices state={state} showOwners={false} floor={floor}/>
    <div className="grant-heading">
      <span>所有协作者</span>
      {!personal&&<button type="button" className="grant-add" onClick={()=>setPicker(true)}><Plus size={14}/>添加协作者</button>}
    </div>
    {!!selectableKeys.length&&<div className="grant-batch-bar">
      <label className="grant-check"><input type="checkbox" checked={allSelected} ref={el=>{if(el)el.indeterminate=someSelected&&!allSelected;}} onChange={()=>setSelected(allSelected?new Set():new Set(selectableKeys))}/>全选</label>
      {someSelected&&<BatchRolePicker label="批量修改权限" rows={batchRows} onChange={changeBatch}/>}
    </div>}
    <div className="grant-list">
      {protections.map(row=>{
        const subject={type:'person',id:row.id},name=subjectLabel(state,subject),canHandover=!!onHandover&&row.id===responsibleId;
        return <div className="grant-row is-owner" key={`owner:${row.id}`}>
          <label className="grant-check"><input type="checkbox" disabled checked={false} aria-label={`${name}（负责人，不可全选）`}/></label>
          <SubjectAvatar state={state} subject={subject}/>
          <div className="grant-subject">
            <b>{name}<span className="grant-owner-tag">负责人</span></b>
          </div>
          {canHandover&&<button type="button" className="grant-handover" disabled={handoverDisabled} title={handoverTitle} onClick={()=>onHandover()}>转交负责人</button>}
          <span className="grant-fixed-role">可管理</span>
        </div>;
      })}
      {collaborators.map(subject=>{
        const key=subjectKey(subject),kind=classifyCollaborator(key,localKeys,inheritedKeys),name=subjectLabel(state,subject);
        const caption=collaboratorCaption(state,subject,{inheritedOnly:kind==='inherited'});
        const parent=inheritedSubjects.find(s=>subjectKey(s)===key),explanation=explainPermission(state,subject,{local:localSubjects,inherited:inheritedSubjects,floor,protectedRows:protections});
        return <div className="grant-row" key={key}>
          <label className="grant-check"><input type="checkbox" checked={selected.has(key)} aria-label={`选择 ${name}`} onChange={()=>toggle(key)}/></label>
          <SubjectAvatar state={state} subject={subject}/>
          <div className="grant-subject"><b>{name}</b><small>{caption}</small>{kind==='local'&&<small>本项权限：{permissionLabel(subject.role)}{parent?` · 继承下限：${permissionLabel(parent.role)}`:''} · 实际生效：{permissionLabel(explanation.effectiveRole)}</small>}</div>
          <CollaboratorRolePicker label={`${name}的权限`} kind={kind} role={subject.role} inheritedRole={parent?.role} effectiveRole={explanation.effectiveRole} allowRemove={kind==='local'} onChange={role=>changeRow(subject,role)}/>
        </div>;
      })}
      {!protections.length&&!collaborators.length&&<p className="grant-empty">尚未添加其他授权对象</p>}
    </div>
    {picker&&<SubjectPicker title="选择协作者" state={state} ownerIds={[...ownerSet]} blocked={existingForPicker} selected={[]} onClose={()=>setPicker(false)} onConfirm={chosen=>{
      const additions=prepareAddedCollaborators(chosen,userId,existingForPicker).map(s=>({...s,role:DEFAULT_ADD_ROLE,addedBy:undefined}));
      setPicker(false);
      if(additions.length)setPending(additions.map(s=>({type:s.type,id:s.id,role:DEFAULT_ADD_ROLE})));
    }}/>}
    {pending&&<AddCollaboratorsConfirm state={state} pending={pending} setPending={setPending} onCancel={()=>setPending(null)} onConfirm={rows=>{emit([...localSubjects,...prepareAddedCollaborators(rows,userId,existingForPicker)]);setPending(null);}}/>}
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
