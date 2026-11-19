import { contentRights, permissionModeFor } from './access.js';

export const SHARE_NO_MANAGE_COPY='无权添加协作';

export function shareInheritGuidance(state,item,entity,userId){
  if(entity!=='node')return {kind:'library',canAdd:true,canSwitch:false,message:''};
  const inherit=permissionModeFor(item)==='inherit';
  if(!inherit)return {kind:'custom',canAdd:true,canSwitch:false,message:''};
  const canManage=!!contentRights(state,item,userId).manage;
  if(canManage)return {kind:'inherit-manage',canAdd:false,canSwitch:true,message:'当前为继承权限。请先转为自定义后才能添加协作者。'};
  return {kind:'inherit-no-manage',canAdd:false,canSwitch:false,message:SHARE_NO_MANAGE_COPY};
}
