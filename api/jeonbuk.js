import districts from '../data/districts.json' with { type: 'json' };

export default async function handler(req, res) {
  const district = req.query.district;
  if (req.method !== 'GET') return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  if (typeof district !== 'string' || !districts.some(x => x.sido === '52' && x.code === district)) return res.status(400).json({ error: '지역 코드가 올바르지 않습니다.' });
  const key = process.env.SCHOOLINFO_API_KEY;
  if (!key) return res.status(503).json({ error: '학교알리미 연결이 설정되지 않았습니다.' });
  // 아직 검증된 최신 공시연도만 사용한다. 연도 자동 증가는 미공시 자료를 최신으로 오인할 수 있다.
  const year = 2026;
  async function load(type) {
    const url = new URL('https://www.schoolinfo.go.kr/openApi.do');
    url.search = new URLSearchParams({apiKey:key,apiType:type,sidoCode:'52',sggCode:district,schulKndCode:'04',...(type==='62'?{pbanYr:String(year)}:{})});
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect:'error' });
    if (!response.ok) throw new Error('upstream');
    const data = await response.json();
    if (data.resultCode !== 'success' || !Array.isArray(data.list)) throw new Error('response');
    return data.list;
  }
  try {
    const [basic, metrics] = await Promise.all([load('0'),load('62')]);
    const byCode = new Map(metrics.map(x=>[x.SCHUL_CODE,x]));
    const schools = basic.map(s=>{
      const m=byCode.get(s.SCHUL_CODE);
      const number = value => { const match=/^(\d+)(?:\((\d+)\))?$/.exec(String(value??'').trim()); return match ? {value:Number(match[1]),raw:match[0]} : null; };
      return { code:s.SCHUL_CODE, name:s.SCHUL_NM, address:s.SCHUL_RDNMA, founder:s.FOND_SC_CODE, gender:s.COEDU_SC_CODE, students:m?number(m.COL_FGR_SUM):null, classes:m?number(m.COL_SUM):null };
    });
    res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=300');
    return res.status(200).json({schools,year,queriedAt:new Date().toISOString()});
  } catch { return res.status(502).json({error:'학교알리미 정보를 불러오지 못했습니다.'}); }
}

