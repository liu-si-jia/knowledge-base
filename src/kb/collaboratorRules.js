import { PERMISSION_ROLES, subjectKey, mergeSubjects } from './permissions.js';

export const ROLE_RANK={viewer:0,downloader:1,editor:2,manager:3};
export const DEFAULT_ADD_ROLE='downloader';
export const roleRank=role=>ROLE_RANK[role]??-1;
export const isKnownRole=role=>PERMISSION_ROLES.some(([id])=>id===role);

export function composeOrdinarySubjects(inherited=[],local=[]){
  // Stored layers stay independent; effective access unions both layers.
  return mergeSubjects(inherited,local);
}

export function addedByCaption(state,addedBy){
  const name=state?.members?.find(m=>m.id===addedBy)?.name;
  return name?`由「${name}」添加`:'本项单独授权';
}

export function collaboratorCaption(state,subject,{inheritedOnly=false}={}){
  return inheritedOnly?'继承自上层目录':addedByCaption(state,subject?.addedBy);
}

export function subjectCounts(subjects=[]){
  const count=type=>subjects.filter(s=>s.type===type).length;
  return {company:count('company'),department:count('department'),person:count('person')};
}

export function subjectCountLabel(subjects=[]){
  const {company,department,person}=subjectCounts(subjects);
  const parts=[...(company?[`${company}公司`]:[]),`${department}部门`,`${person}人`];
  return `共${parts.join('、')}`;
}

export function withAddedBy(subject,userId){
  return {type:subject.type,id:subject.id,role:subject.role,...(subject.role==='legacy'?{rights:subject.rights}:{}),...(userId?{addedBy:userId}:{})};
}

export function classifyCollaborator(key,localKeys,inheritedKeys){
  if(localKeys.has(key))return 'local';
  if(inheritedKeys.has(key))return 'inherited';
  return 'local';
}

export function rowRoleOptions(kind,currentRole,inheritedRole){
  return PERMISSION_ROLES.map(([value,label])=>({
    value,label,
    disabled:roleRank(value)<roleRank(inheritedRole||(kind==='inherited'?currentRole:undefined)),
  }));
}

export function batchPermissionOptions(rows=[]){
  const hasInherited=rows.some(row=>row.kind==='inherited');
  const options=PERMISSION_ROLES.map(([value,label])=>({
    value,label,
    disabled:rows.some(row=>roleRank(value)<roleRank(row.inheritedRole||(row.kind==='inherited'?row.role:undefined)))||hasInherited&&rows.some(row=>roleRank(value)<roleRank(row.role)),
  }));
  return {options,canRemove:!hasInherited&&rows.length>0&&rows.every(row=>row.kind==='local')};
}

export function applyCollaboratorAction(state,{localSubjects,inheritedSubjects},subject,action,userId){
  const key=subjectKey(subject);
  const inheritedRow=inheritedSubjects.find(s=>subjectKey(s)===key);
  const localRow=localSubjects.find(s=>subjectKey(s)===key);
  const kind=localRow?'local':inheritedRow?'inherited':'local';
  if(action==='remove'){
    if(kind!=='local')return {error:'继承权限不能移除',localSubjects};
    return {localSubjects:localSubjects.filter(s=>subjectKey(s)!==key)};
  }
  if(!isKnownRole(action))return {error:'请选择有效权限',localSubjects};
  const current=localRow?.role||inheritedRow?.role;
  if(inheritedRow&&roleRank(action)<roleRank(inheritedRow.role))return {error:'不能下调至继承权限下限以下',localSubjects};
  if(kind==='inherited'&&roleRank(action)===roleRank(current))return {localSubjects};
  return {localSubjects:[...localSubjects.filter(s=>subjectKey(s)!==key),localRow?{...localRow,role:action}:withAddedBy({type:subject.type,id:subject.id,role:action},userId)]};
}

export function applyBatchCollaboratorAction(state,{localSubjects,inheritedSubjects},keys,action,userId){
  const keySet=new Set(keys),unique=[];
  for(const key of keySet){
    const localRow=localSubjects.find(s=>subjectKey(s)===key),inheritedRow=inheritedSubjects.find(s=>subjectKey(s)===key),subject=localRow||inheritedRow;
    if(subject)unique.push({subject,kind:localRow?'local':'inherited',role:subject.role,inheritedRole:inheritedRow?.role});
  }
  if(!unique.length)return {error:'请选择要修改的协作者',localSubjects};
  const {options,canRemove}=batchPermissionOptions(unique);
  if(action==='remove'){
    if(!canRemove)return {error:'包含继承项时不能批量移除',localSubjects};
    return {localSubjects:localSubjects.filter(s=>!keySet.has(subjectKey(s)))};
  }
  if(options.find(option=>option.value===action)?.disabled)return {error:'包含继承项时批量只能上调，不能下调',localSubjects};
  if(!isKnownRole(action))return {error:'请选择有效权限',localSubjects};
  let next=localSubjects;
  for(const row of unique){
    const result=applyCollaboratorAction(state,{localSubjects:next,inheritedSubjects},row.subject,action,userId);
    if(result.error)return result;
    next=result.localSubjects;
  }
  return {localSubjects:next};
}

export function filterNewCollaborators(selected=[],existing=[]){
  const blocked=new Set(existing.map(subjectKey));
  return selected.filter(s=>!blocked.has(subjectKey(s))).map(s=>({type:s.type,id:s.id,role:s.role||DEFAULT_ADD_ROLE}));
}

export function prepareAddedCollaborators(selected,userId,existing=[]){
  return filterNewCollaborators(selected,existing).map(s=>withAddedBy({...s,role:s.role||DEFAULT_ADD_ROLE},userId));
}

export function rejectNonElevatingInherited(additions,inheritedSubjects){
  const inherited=new Map(inheritedSubjects.map(s=>[subjectKey(s),s]));
  return additions.filter(s=>{
    const parent=inherited.get(subjectKey(s));
    return !parent||roleRank(s.role)>roleRank(parent.role);
  });
}

// Validate only deliberate edits: a parent raise must not rewrite or reject an
// unchanged local value that was valid before the raise. Removals affect local only.
export function validateLocalEdits(subjects,previous,inherited,userId){
  return subjects.map(subject=>{
    const key=subjectKey(subject),prior=previous.find(s=>subjectKey(s)===key),parent=inherited.find(s=>subjectKey(s)===key);
    if(parent&&(!prior||prior.role!==subject.role)&&roleRank(subject.role)<roleRank(parent.role))throw Error('本项权限不能低于当前继承权限下限');
    const {addedBy:ignored,...clean}=subject;
    return {...clean,...(prior?(prior.addedBy?{addedBy:prior.addedBy}:{}):userId?{addedBy:userId}:{})};
  });
}

// Opening management never confirms the separate share draft. Cancel returns to
// that draft; management Save commits only management's own confirmed additions.
export function managementDraftFromShare(target,entity){
  return entity==='node'?target.layers.local:target.access;
}
