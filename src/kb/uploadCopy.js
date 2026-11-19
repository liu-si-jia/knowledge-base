export function uploadModeCopy(mode){
  const folder=mode==='folder';
  return {
    title:folder?'上传文件夹':'上传文件',
    chooseLabel:folder?'选择文件夹':'选择本地文件',
    chooseClass:folder?'upload-choose-folder':'upload-choose-file',
    hint:folder
      ?'所选文件夹内只能包含文件，不能包含子文件夹，空文件夹无法上传。每批最多 20 个文件，单个不超过 50 MB'
      :'或拖拽文件到这里。每批最多 20 个文件，单个不超过 50 MB',
    directoryDropError:'上传文件夹请使用「上传文件夹」入口选择。所选目录内只能包含文件，不能包含子文件夹',
  };
}

export function selectedFileSummary(count){
  return `已选择 ${count} 个文件`;
}
