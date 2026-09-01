// GET /api/team?id=<teamId> — найближчий матч, форма за 5 турів і місце в таблиці.
// Тільки факти: жодних прогнозів і рекомендацій.

const RESULT = (m, teamId) => {
  const home = m.homeTeam.id === teamId;
  const w = m.score && m.score.winner;
  if (!w) return '?';
  if (w === 'DRAW') return 'D';
  if ((w === 'HOME_TEAM' && home) || (w === 'AWAY_TEAM' && !home)) return 'W';
  return 'L';
};

const short = t => (t.shortName || t.name || '').trim();

module.exports = async (req, res) => {
  const token = process.env.FOOTBALL_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'no_token', message: 'Не налаштовано FOOTBALL_TOKEN' });
  }

  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: 'bad_id', message: 'Не вказано команду' });

  const head = { headers: { 'X-Auth-Token': token } };

  try {
    const [nextR, lastR] = await Promise.all([
      fetch(`https://api.football-data.org/v4/teams/${id}/matches?status=SCHEDULED&limit=1`, head),
      fetch(`https://api.football-data.org/v4/teams/${id}/matches?status=FINISHED&limit=5`, head)
    ]);

    if (nextR.status === 429 || lastR.status === 429) {
      return res.status(429).json({ error: 'rate', message: 'Забагато запитів. Спробуйте за хвилину.' });
    }
    if (!nextR.ok && !lastR.ok) {
      return res.status(502).json({ error: 'upstream', message: 'Джерело даних не відповідає' });
    }

    const nextData = nextR.ok ? await nextR.json() : { matches: [] };
    const lastData = lastR.ok ? await lastR.json() : { matches: [] };

    const n = (nextData.matches || [])[0] || null;
    const next = n ? {
      utcDate: n.utcDate,
      competition: n.competition ? n.competition.name : '',
      home: short(n.homeTeam),
      away: short(n.awayTeam),
      homeCrest: n.homeTeam.crest || '',
      awayCrest: n.awayTeam.crest || '',
      isHome: n.homeTeam.id === id
    } : null;

    const finished = (lastData.matches || [])
      .slice()
      .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
      .slice(0, 5);

    const form = finished.map(m => ({
      date: m.utcDate,
      competition: m.competition ? m.competition.name : '',
      home: short(m.homeTeam),
      away: short(m.awayTeam),
      score: `${m.score.fullTime.home ?? '-'}:${m.score.fullTime.away ?? '-'}`,
      outcome: RESULT(m, id)
    }));

    const wins = form.filter(f => f.outcome === 'W').length;
    const draws = form.filter(f => f.outcome === 'D').length;
    const losses = form.filter(f => f.outcome === 'L').length;

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({ next, form, tally: { wins, draws, losses } });
  } catch (e) {
    return res.status(502).json({ error: 'upstream', message: 'Не вдалося отримати дані' });
  }
};
