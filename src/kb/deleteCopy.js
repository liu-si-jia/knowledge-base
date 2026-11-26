export function withConfirmError(body, error = '') {
  return error ? `${body} ${error}` : body;
}

export const LIBRARY_DELETE_COPY = '知识库和其中的内容将移入回收站，之后可在回收站恢复。';

export function libraryDeleteBody(error = '') {
  return withConfirmError(LIBRARY_DELETE_COPY, error);
}

export function contentDeleteBody({ batchSummary = '', hasFolder = false, error = '' } = {}) {
  const lead = batchSummary ? `${batchSummary}${/。$/.test(batchSummary) ? '' : '。'}` : '';
  const result = hasFolder
    ? '文件夹和其中的内容将移入回收站，之后可在回收站恢复。'
    : lead
      ? '所选内容将移入回收站，之后可在回收站恢复。'
      : '该内容将移入回收站，之后可在回收站恢复。';
  return withConfirmError(`${lead}${result}`, error);
}

export const LIBRARY_PERMANENT_DELETE_COPY = '知识库和其中的内容将永久删除，无法恢复。';

export function contentPermanentDeleteBody(isFolder = false) {
  return isFolder
    ? '该内容和其中的内容将永久删除，无法恢复。'
    : '该内容将永久删除，无法恢复。';
}
