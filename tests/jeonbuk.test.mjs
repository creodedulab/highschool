import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/jeonbuk.js';

const now=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()));
const res=()=>({status(n){this.code=n;return this},json(x){this.body=x;return this},setHeader(k,v){this.headers??={};this.headers[k]=v}});
test('입력 검증과 항목별 최신 공시연도, 미공시 대체, 오류 구분',async()=>{
  process.env.SCHOOLINFO_API_KEY='test-secret';
  const previous=global.fetch;
  global.fetch=async input=>{const p=new URL(input).searchParams,t=p.get('apiType'),y=Number(p.get('pbanYr'));const base={SCHUL_CODE:'s1',PBAN_EXCP_YN:'N'};
    if(t==='56')throw new Error('offline');
    if(t!=='0' && y===now)return {ok:true,json:async()=>({resultCode:'fail',resultMsg:'선택하신 항목은 해당 연도에 공시되지 않은 항목으로 제공이 불가합니다.'})};
    const entry=t==='0'?{...base,SCHUL_NM:'학교'}:t==='62'?{...base,COL_FGR_SUM:'100(2)',COL_SUM:'5(1)',COL_1:2,COL_2:1,COL_3:1}:t==='63'?{...base,SUM:100,COL_MSUM:60,COL_WSUM:40}:t==='51'?{...base,ALL_SUM:10,MAN_SUM:6,WOMAN_SUM:4}:base;
    return {ok:true,json:async()=>({resultCode:'success',list:[entry]})};
  };
  try{
    const output=res();await handler({method:'GET',query:{district:'52111'}},output);
    assert.equal(output.body.years.metrics,now-1);assert.equal(output.body.years.gender,now-1);
    assert.equal(output.body.schools[0].students.value,100);assert.deepEqual(output.body.schools[0].gradeClasses,[2,1,1]);
    assert.equal(output.body.schools[0].admissionStats.year,now-1);assert(output.body.failedGroups.includes('clubs'));
    assert.equal(output.headers['Cache-Control'],'no-store');assert(!JSON.stringify(output.body).includes('test-secret'));
    const invalid=res();await handler({method:'GET',query:{district:'52111',extra:'x'}},invalid);assert.equal(invalid.code,400);
  }finally{global.fetch=previous;delete process.env.SCHOOLINFO_API_KEY;}
});
