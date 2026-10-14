// GET /api/next — найближчі матчі у п'яти лігах, які в роботі.
// Один запит до football-data.org, відповідь кешується на CDN на 30 хвилин.

const COMPETITIONS = 'PL,PD,BL1,SA,FL1';
const DAYS_AHEAD = 10;
const LIMIT = 3;

const short = t => ((t && (t.shortName || t.name)) || '').trim();
const day = d => d.toISOString().slice(0, 10);

module.exports = async (req, res) => {
  const token = process.env.FOOTBALL_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'no_token', message: 'Не налаштовано FOOTBALL_TOKEN' });
  }

  const now = new Date();
  const from = day(now);
  const to = day(new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000));

  const url = `https://api.football-data.org/v4/matches?competitions=${COMPETITIONS}` +
              `&dateFrom=${from}&dateTo=${to}`;

  try {
    const r = await fetch(url, { headers: { 'X-Auth-Token': token } });

    if (r.status === 429) {
      return res.status(429).json({ error: 'rate', message: 'Забагато запитів. Спробуйте за хвилину.' });
    }
    if (!r.ok) {
      return res.status(502).json({ error: 'upstream', message: 'Джерело даних не відповідає' });
    }

    const data = await r.json();

    const matches = (data.matches || [])
      .filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED')
      .filter(m => new Date(m.utcDate) > now)
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
      .slice(0, LIMIT)
      .map(m => ({
        utcDate: m.utcDate,
        competition: m.competition ? m.competition.name : '',
        home: short(m.homeTeam),
        away: short(m.awayTeam)
      }));

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({ matches });
  } catch (e) {
    return res.status(502).json({ error: 'upstream', message: 'Не вдалося отримати дані' });
  }
};
