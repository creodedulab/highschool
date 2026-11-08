import districts from '../data/districts.json' with { type: 'json' };

export default async function handler(req, res) {
  const district = req.query.district;
  if (req.method !== 'GET') return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  if (typeof district !== 'string' || !districts.some(x => x.sido === '52' && x.code === district)) return res.status(400).json({ error: '지역 코드가 올바르지 않습니다.' });
  const key = process.env.SCHOOLINFO_API_KEY;
  if (!key) return res.status(503).json({ error: '학교알리미 연결이 설정되지 않았습니다.' });
  // 아직 검증된 최신 공시연도만 사용한다. 연도 자동 증가는 미공시 자료를 최신으로 오인할 수 있다.
  const year = 2026;
  async function load(type, depth) {
    const url = new URL('https://www.schoolinfo.go.kr/openApi.do');
    url.search = new URLSearchParams({apiKey:key,apiType:type,sidoCode:'52',sggCode:district,schulKndCode:'04',...(type!=='0'?{pbanYr:String(year)}:{}),...(depth?{depthNo:depth}:{})});
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect:'error' });
    if (!response.ok) throw new Error('upstream');
    const data = await response.json();
    if (data.resultCode !== 'success' || !Array.isArray(data.list)) throw new Error('response');
    return data.list;
  }
  try {
    const [basic, metrics, gender, libraryStock, libraryUse, afterschool, clubs, features] = await Promise.all([load('0'),load('62'),load('63').catch(()=>[]),load('58','10').catch(()=>[]),load('58','30').catch(()=>[]),load('59').catch(()=>[]),load('56').catch(()=>[]),load('67').catch(()=>[])]);
    const byCode = new Map(metrics.map(x=>[x.SCHUL_CODE,x]));
    const genderByCode = new Map(gender.map(x=>[x.SCHUL_CODE,x]));
    const stockByCode = new Map(libraryStock.map(x=>[x.SCHUL_CODE,x]));
    const useByCode = new Map(libraryUse.map(x=>[x.SCHUL_CODE,x]));
    const afterByCode = new Map(afterschool.map(x=>[x.SCHUL_CODE,x]));
    const clubsByCode = new Map(clubs.map(x=>[x.SCHUL_CODE,x]));
    const featuresByCode = new Map(features.map(x=>[x.SCHUL_CODE,x]));
    const schools = basic.map(s=>{
      const m=byCode.get(s.SCHUL_CODE);
      const number = value => { const match=/^(\d+)(?:\((\d+)\))?$/.exec(String(value??'').trim()); return match ? {value:Number(match[1]),raw:match[0]} : null; };
      const g=genderByCode.get(s.SCHUL_CODE), male=g?.COL_MSUM, female=g?.COL_WSUM;
      const sex=g?.PBAN_EXCP_YN==='N' && Number.isInteger(male) && male>=0 && Number.isInteger(female) && female>=0 && male+female===g.SUM ? {male,female} : null;
      const stock=stockByCode.get(s.SCHUL_CODE), use=useByCode.get(s.SCHUL_CODE), after=afterByCode.get(s.SCHUL_CODE);
      const valid=(v)=>typeof v==='number' && Number.isFinite(v) && v>=0;
      const gradeClasses=m?.PBAN_EXCP_YN==='N'&&[m.COL_1,m.COL_2,m.COL_3].every(valid)?[m.COL_1,m.COL_2,m.COL_3]:null;
      const club=clubsByCode.get(s.SCHUL_CODE);
      const clubCounts=club?.PBAN_EXCP_YN==='N'&&valid(club.CREAT_EXPER_ACT_CCCLU_FGR)&&valid(club.STDNT_SLCTL_CCCLU_FGR)?{curricular:club.CREAT_EXPER_ACT_CCCLU_FGR,studentLed:club.STDNT_SLCTL_CCCLU_FGR}:null;
      const feature=featuresByCode.get(s.SCHUL_CODE);
      const flag=v=>v==='○'?'YES':v==='×'?'NO':null;
      const specialPrograms=feature?.PBAN_EXCP_YN==='N'?{classroom:flag(feature.CURR_CCCLA_SYST_YN),autonomousSchool:flag(feature.SLCTL_SCHUL_YN),levelBased:flag(feature.LEVEL_ACCTO_MVMN_ITRT_OPRTN_YN)}:null;
      const library={stockPerStudent:stock?.PBAN_EXCP_YN==='N'&&valid(stock.RATIO)?stock.RATIO:null,loansPerStudent:use?.PBAN_EXCP_YN==='N'&&valid(use.DATA1)?use.DATA1:null};
      const afterSchool=after?.PBAN_EXCP_YN==='N'&&[after.ASL_CURR_PGM_FGR,after.ASL_CURR_REG_STDNT_FGR,after.ASL_SPABL_APTD_PGM_FGR,after.ASL_SPABL_APTD_REG_STDNT_FGR].every(valid)?{currPrograms:after.ASL_CURR_PGM_FGR,currEnrollments:after.ASL_CURR_REG_STDNT_FGR,aptitudePrograms:after.ASL_SPABL_APTD_PGM_FGR,aptitudeEnrollments:after.ASL_SPABL_APTD_REG_STDNT_FGR}:null;
      return { code:s.SCHUL_CODE, uuid:s.SHL_IDF_CD, schoolKind:s.HS_KND_SC_NM, name:s.SCHUL_NM, address:s.SCHUL_RDNMA, founder:s.FOND_SC_CODE, gender:s.COEDU_SC_CODE, students:m?number(m.COL_FGR_SUM):null, classes:m?number(m.COL_SUM):null, gradeClasses, sex,library,afterSchool,clubCounts,specialPrograms };
    });
    res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=300');
    return res.status(200).json({schools,year,queriedAt:new Date().toISOString()});
  } catch { return res.status(502).json({error:'학교알리미 정보를 불러오지 못했습니다.'}); }
}

