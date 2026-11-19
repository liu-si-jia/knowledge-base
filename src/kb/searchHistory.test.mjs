import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSearchHistory, rememberSearchTerm, readSearchHistory, SEARCH_HISTORY_LIMIT } from './searchHistory.js';

function memory(initial){
  const data=new Map(initial?[[undefined,undefined]]:[ ]);
  if(initial)Object.entries(initial).forEach(([k,v])=>data.set(k,v));
  data.clear();
  if(initial)Object.entries(initial).forEach(([k,v])=>data.set(k,v));
  return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>{data.set(key,String(value));},removeItem:key=>{data.delete(key);},data};
}

test('全局搜索历史最新在前、去重并最多保留 10 条，清除后为空',()=>{
  const storage=memory();
  assert.deepEqual(readSearchHistory(storage),[]);
  assert.deepEqual(rememberSearchTerm('  制度  ',storage),['制度']);
  assert.deepEqual(rememberSearchTerm('报销',storage),['报销','制度']);
  assert.deepEqual(rememberSearchTerm('制度',storage),['制度','报销']);
  assert.deepEqual(rememberSearchTerm('   ',storage),['制度','报销']);
  for(let i=0;i<12;i+=1)rememberSearchTerm(`词${i}`,storage);
  const history=readSearchHistory(storage);
  assert.equal(history.length,SEARCH_HISTORY_LIMIT);
  assert.equal(history[0],'词11');
  assert.equal(history.at(-1),'词2');
  assert.ok(!history.includes('制度'));
  assert.deepEqual(clearSearchHistory(storage),[]);
  assert.deepEqual(readSearchHistory(storage),[]);
});
