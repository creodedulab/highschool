import districts from '../data/districts.json' with { type: 'json' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET 요청만 지원합니다.' });
  const { sido, district } = req.query;
  if (typeof sido !== 'string' || typeof district !== 'string' || !districts.some(d => d.sido === sido && d.code === district)) {
    return res.status(400).json({ error: '유효한 시도 및 시군구를 선택해 주세요.' });
  }
  if (!process.env.SCHOOLINFO_API_KEY) return res.status(503).json({ error: '학교알리미 API 키가 서버에 설정되지 않았습니다.' });
  const url = new URL('https://www.schoolinfo.go.kr/openApi.do');
  url.search = new URLSearchParams({ apiKey: process.env.SCHOOLINFO_API_KEY, apiType: '0', sidoCode: sido, sggCode: district, schulKndCode: '04' });
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) throw new Error('upstream');
    const data = await upstream.json();
    if (data.resultCode !== 'success' || !Array.isArray(data.list)) throw new Error('invalid response');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=300');
    return res.status(200).json({ schools: data.list.map(s => ({ name: s.SCHUL_NM || '', code: s.SCHUL_CODE || '', address: s.SCHUL_RDNMA || s.ADRCD_NM || '', founder: s.SCHUL_FOND_TYP_CODE || '' })), fetchedAt: new Date().toISOString() });
  } catch {
    return res.status(502).json({ error: '학교알리미 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}

