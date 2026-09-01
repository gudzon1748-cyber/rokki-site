// GET /api/teams — довідник команд для поля пошуку.
// Відповідь кешується на CDN Vercel на добу, тож ліміт 10 запитів/хв не страждає.

const COMPETITIONS = [
  { code: 'PL',  label: 'АПЛ' },
  { code: 'PD',  label: 'Ла Ліга' },
  { code: 'BL1', label: 'Бундесліга' },
  { code: 'SA',  label: 'Серія А' },
  { code: 'FL1', label: 'Ліга 1' },
  { code: 'ELC', label: 'Чемпіоншип' }
];

let cache = null;
let cachedAt = 0;
const TTL = 24 * 60 * 60 * 1000;

async function fetchCompetition(code, label, token) {
  const r = await fetch(`https://api.football-data.org/v4/competitions/${code}/teams`, {
    headers: { 'X-Auth-Token': token }
  });
  if (!r.ok) return [];
  const data = await r.json();
  return (data.teams || []).map(t => ({
    id: t.id,
    name: t.shortName || t.name,
    full: t.name,
    tla: t.tla || '',
    crest: t.crest || '',
    league: label
  }));
}

module.exports = async (req, res) => {
  const token = process.env.FOOTBALL_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'no_token', message: 'Не налаштовано FOOTBALL_TOKEN' });
  }

  if (cache && Date.now() - cachedAt < TTL) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(cache);
  }

  try {
    const lists = [];
    // послідовно, щоб не впертись у ліміт 10 запитів/хв
    for (const c of COMPETITIONS) {
      lists.push(await fetchCompetition(c.code, c.label, token));
    }
    const teams = lists.flat();
    if (!teams.length) {
      return res.status(502).json({ error: 'empty', message: 'Джерело даних не відповідає' });
    }
    cache = { teams, updated: new Date().toISOString() };
    cachedAt = Date.now();
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(cache);
  } catch (e) {
    return res.status(502).json({ error: 'upstream', message: 'Не вдалося отримати список команд' });
  }
};
