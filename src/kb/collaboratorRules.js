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

export const MODE_SWITCH_COPY={
  custom:{title:'转为自定义权限',body:'转为自定义后，将把当前从父级继承下来的普通权限快照留在本项。之后父级再改权限，不再影响本项。取消则不切换。'},
  inherit:{title:'改回继承权限',body:'改回继承后，本项自定义的添加和修改会全部失效，并重新跟随父级当前的实际权限。取消则不切换。'},
};

export function collaboratorCaption(state,subject,{mode}={}){
  if(mode==='inherit')return '继承权限';
  const name=state?.members?.find(m=>m.id===subject?.addedBy)?.name;
  return name?`自定义权限：由「${name}」添加`:'本项单独授权';
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

export function rowRoleOptions(kind,currentRole,inheritedRole,mode='custom'){
  return PERMISSION_ROLES.map(([value,label])=>({
    value,label,
    disabled:mode==='inherit'||kind==='inherited',
  }));
}

export function batchPermissionOptions(rows=[],mode='custom'){
  const inherited=mode==='inherit'||rows.some(row=>row.kind==='inherited');
  const options=PERMISSION_ROLES.map(([value,label])=>({value,label,disabled:inherited}));
  return {options,canRemove:!inherited&&rows.length>0};
}

export function applyCollaboratorAction(state,{localSubjects,inheritedSubjects=[],mode='custom'},subject,action,userId){
  if(mode==='inherit')return {error:'继承模式不能修改继承权限，请先转为自定义',localSubjects};
  const key=subjectKey(subject);
  const localRow=localSubjects.find(s=>subjectKey(s)===key);
  if(action==='remove'){
    if(!localRow)return {error:'继承权限不能在继承模式中移除，请先转为自定义',localSubjects};
    return {localSubjects:localSubjects.filter(s=>subjectKey(s)!==key)};
  }
  if(!isKnownRole(action))return {error:'请选择有效权限',localSubjects};
  return {localSubjects:[...localSubjects.filter(s=>subjectKey(s)!==key),localRow?{...localRow,role:action}:withAddedBy({type:subject.type,id:subject.id,role:action},userId)]};
}

export function applyBatchCollaboratorAction(state,{localSubjects,inheritedSubjects=[],mode='custom'},keys,action,userId){
  if(mode==='inherit')return {error:'继承模式不能修改继承权限，请先转为自定义',localSubjects};
  const keySet=new Set(keys),unique=[];
  for(const key of keySet){
    const subject=localSubjects.find(s=>subjectKey(s)===key);
    if(subject)unique.push(subject);
  }
  if(!unique.length)return {error:'请选择要修改的协作者',localSubjects};
  if(action==='remove')return {localSubjects:localSubjects.filter(s=>!keySet.has(subjectKey(s)))};
  if(!isKnownRole(action))return {error:'请选择有效权限',localSubjects};
  let next=localSubjects;
  for(const subject of unique){
    const result=applyCollaboratorAction(state,{localSubjects:next,mode},subject,action,userId);
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
    const {addedBy:ignored,...clean}=subject;
    return {...clean,...(prior?(prior.addedBy?{addedBy:prior.addedBy}:{}):userId?{addedBy:userId}:{})};
  });
}

// Opening management never confirms the separate share draft. Cancel returns to
// that draft; management Save commits only management's own confirmed additions.
export function managementDraftFromShare(target,entity){
  return entity==='node'?target.layers.local:target.access;
}
