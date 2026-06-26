// views.js — renders each screen into the #screen container.
// Each view is a function returning an HTML string; wiring happens in app.js.

const Views = {
  // ---- DASHBOARD --------------------------------------------------------
  async dashboard() {
    const runs = await DB.getRuns();
    const shoes = await DB.getShoes();
    const sorted = [...runs].sort((a, b) => b.date.localeCompare(a.date));

    const now = new Date();
    const thisWeek = runs.filter(r => Util.weekKey(r.date) === Util.weekKey(Util.today()));
    const thisMonth = runs.filter(r => Util.monthKey(r.date) === Util.monthKey(Util.today()));
    const streak = Util.streak(runs);
    const pbs = Util.computePBs(runs);
    const insights = Util.insights(runs, shoes);
    const goals = await DB.getGoals();

    const weekDist = Util.sumDist(thisWeek);
    const monthDist = Util.sumDist(thisMonth);

    let html = `
      <div class="greeting">
        <div class="hello">${Util.greeting()}</div>
        <div class="date">${Util.fmtDate(Util.today(), { weekday:'long', day:'numeric', month:'long' })}</div>
      </div>`;

    // primary summary cards
    html += `<div class="dash-grid two">
      <div class="card stat-card">
        <span class="card-label">This week</span>
        <div><span class="big num">${Util.fmtDist(weekDist, 1)}</span> <span class="unit">${Util.distLabel()}</span></div>
        <span class="sub">${thisWeek.length} run${thisWeek.length===1?'':'s'}</span>
      </div>
      <div class="card stat-card">
        <span class="card-label">This month</span>
        <div><span class="big num">${Util.fmtDist(monthDist, 1)}</span> <span class="unit">${Util.distLabel()}</span></div>
        <span class="sub">${thisMonth.length} run${thisMonth.length===1?'':'s'}</span>
      </div>
    </div>`;

    // streak
    if (streak > 0) {
      html += `<div class="card streak-card mt3 row between">
        <div><span class="card-label">Current streak</span>
        <div><span class="big num">${streak}</span> <span class="unit">day${streak===1?'':'s'}</span></div></div>
        <span class="streak-flame">🔥</span>
      </div>`;
    }

    // log button
    html += `<button class="btn btn-primary btn-block mt4" data-action="open-log" style="padding:18px;font-size:16px">＋ Log a run</button>`;

    // insights
    if (insights.length) {
      html += `<div class="section-head"><h2>Insights</h2></div>`;
      for (const i of insights) {
        html += `<div class="insight-card"><div class="ic-icon">${i.icon}</div><p>${Util.escapeHtml(i.text)}</p></div>`;
      }
    }

    // PB highlights
    const pbList = ['5k','10k','half','longest'].map(k => pbs[k]).filter(Boolean);
    if (pbList.length) {
      html += `<div class="section-head"><h2>Personal bests</h2></div><div class="pb-strip">`;
      for (const p of pbList) {
        const val = p.time != null ? Util.fmtDuration(p.time)
          : p.distance != null ? `${Util.fmtDist(p.distance,1)} ${Util.distLabel()}` : '';
        html += `<div class="pb-chip"><div class="pb-label">${p.label}</div><div class="pb-val">${val}</div></div>`;
      }
      html += `</div>`;
    }

    // goals preview
    const activeGoals = goals.filter(g => !g.archived).slice(0, 2);
    if (activeGoals.length) {
      html += `<div class="section-head"><h2>Goals</h2><a data-tab="settings">Manage</a></div>`;
      for (const g of activeGoals) html += this._goalCard(g, runs);
    }

    // recent runs
    html += `<div class="section-head"><h2>Recent runs</h2><a data-tab="runs">All</a></div>`;
    if (!sorted.length) {
      html += this._empty('🏃', 'No runs yet', 'Log your first run to start building your journal.');
    } else {
      for (const r of sorted.slice(0, 5)) html += await this._runItem(r);
    }

    return html;
  },

  // ---- RUNS -------------------------------------------------------------
  async runs(state = {}) {
    let html = `<div class="view-header"><div class="view-eyebrow">Your journal</div><h1 class="view-title">Runs</h1></div>`;
    html += `<input class="input mb4" type="search" placeholder="Search runs…" data-runsearch value="${Util.escapeHtml(state.q||'')}">`;
    html += `<div id="runs-list">${await this.runsList(state)}</div>`;
    return html;
  },

  async runsList(state = {}) {
    const runs = await DB.getRuns();
    const q = (state.q || '').toLowerCase();
    let filtered = runs.filter(r => {
      if (!q) return true;
      return (r.title||'').toLowerCase().includes(q)
        || (r.notes||'').toLowerCase().includes(q)
        || (r.typeName||'').toLowerCase().includes(q);
    });
    filtered.sort((a, b) => b.date.localeCompare(a.date)); // newest first

    if (!filtered.length) {
      return this._empty('🔍', q ? 'No matches' : 'No runs yet',
        q ? 'Try a different search.' : 'Log your first run to get started.');
    }
    let html = `<div class="card" style="padding:var(--s2) var(--s5)">`;
    for (const r of filtered) html += await this._runItem(r);
    html += `</div>`;
    return html;
  },

  // ---- TRENDS -----------------------------------------------------------
  async trends(state = {}) {
    const runs = await DB.getRuns();
    const metric = state.metric || 'weekly-mileage';
    const metrics = [
      ['weekly-mileage', 'Weekly mileage'],
      ['monthly-mileage', 'Monthly mileage'],
      ['avg-pace', 'Average pace'],
      ['avg-hr', 'Average HR'],
      ['duration', 'Duration'],
      ['avg-cadence', 'Average cadence'],
      ['elevation', 'Elevation'],
    ];

    let html = `<div class="view-header"><div class="view-eyebrow">Progress over time</div><h1 class="view-title">Trends</h1></div>`;
    html += `<div class="metric-pills">${metrics.map(([k,l]) =>
      `<button class="chip ${metric===k?'active':''}" data-metric="${k}">${l}</button>`).join('')}</div>`;

    const series = this._buildSeries(runs, metric);
    if (series.length < 2) {
      html += `<div class="card">${this._empty('📊','Not enough data','Log a few more runs to see this trend take shape.')}</div>`;
    } else {
      html += `<div class="card chart-wrap">${this._svgChart(series, metric)}</div>`;
      // quick summary
      const first = series[0].y, last = series[series.length-1].y;
      const delta = last - first;
      const pct = first ? Math.round((delta/first)*100) : 0;
      const better = metric === 'avg-pace' ? delta < 0 : delta > 0;
      html += `<div class="card mt3 row between"><span class="muted">Change over period</span>
        <span class="delta ${better?'up':'down'}">${pct>0?'+':''}${pct}%</span></div>`;
    }
    return html;
  },

  // ---- STATISTICS -------------------------------------------------------
  async statistics(state = {}) {
    const runs = await DB.getRuns();
    const scope = state.scope || 'lifetime';
    const now = Util.today();
    let scoped = runs;
    if (scope === 'year') scoped = runs.filter(r => r.date.slice(0,4) === now.slice(0,4));
    if (scope === 'month') scoped = runs.filter(r => Util.monthKey(r.date) === Util.monthKey(now));
    if (scope === 'week') scoped = runs.filter(r => Util.weekKey(r.date) === Util.weekKey(now));

    const totalDist = Util.sumDist(scoped);
    const totalTime = Util.sumDuration(scoped);
    const avgDist = scoped.length ? totalDist/scoped.length : 0;
    const avgPace = totalDist ? totalTime/totalDist : null;
    const longest = scoped.reduce((m,r)=>(r.distance>(m?.distance||0)?r:m), null);
    const pbs = Util.computePBs(runs);

    // weekly / monthly peaks (lifetime)
    const byWeek = Util.groupBy(runs, Util.weekKey.bind(Util));
    const byMonth = Util.groupBy(runs, Util.monthKey.bind(Util));
    const peakWeek = Math.max(0, ...Object.values(byWeek).map(Util.sumDist.bind(Util)));
    const peakMonth = Math.max(0, ...Object.values(byMonth).map(Util.sumDist.bind(Util)));

    let html = `<div class="view-header"><div class="view-eyebrow">By the numbers</div><h1 class="view-title">Statistics</h1></div>`;
    html += `<div class="metric-pills">${[['lifetime','Lifetime'],['year','Year'],['month','Month'],['week','Week']]
      .map(([k,l])=>`<button class="chip ${scope===k?'active':''}" data-scope="${k}">${l}</button>`).join('')}</div>`;

    const stat = (label, val, unit='') => `<div class="card stat-card"><span class="card-label">${label}</span>
      <div><span class="big num" style="font-size:26px">${val}</span> ${unit?`<span class="unit">${unit}</span>`:''}</div></div>`;

    html += `<div class="dash-grid two">
      ${stat('Total distance', Util.fmtDist(totalDist,1), Util.distLabel())}
      ${stat('Total runs', scoped.length)}
      ${stat('Total time', Util.fmtDuration(totalTime))}
      ${stat('Avg distance', Util.fmtDist(avgDist,1), Util.distLabel())}
      ${stat('Avg pace', avgPace?Util.fmtPace(avgPace):'—')}
      ${stat('Longest run', longest?Util.fmtDist(longest.distance,1):'—', longest?Util.distLabel():'')}
    </div>`;

    html += `<div class="section-head"><h2>Records</h2></div><div class="dash-grid two">
      ${stat('Fastest 5K', pbs['5k']?Util.fmtDuration(pbs['5k'].time):'—')}
      ${stat('Fastest 10K', pbs['10k']?Util.fmtDuration(pbs['10k'].time):'—')}
      ${stat('Fastest Half', pbs.half?Util.fmtDuration(pbs.half.time):'—')}
      ${stat('Peak week', Util.fmtDist(peakWeek,1), Util.distLabel())}
      ${stat('Peak month', Util.fmtDist(peakMonth,1), Util.distLabel())}
      ${stat('Longest streak', Util.longestStreak(runs), 'days')}
    </div>`;

    return html;
  },

  // ---- SETTINGS ---------------------------------------------------------
  async settings() {
    const shoes = await DB.getShoes();
    const templates = await DB.getTemplates();
    const goals = await DB.getGoals();
    const units = await DB.getSetting('units', 'km');

    let html = `<div class="view-header"><div class="view-eyebrow">Preferences</div><h1 class="view-title">Settings</h1></div>`;

    html += `<div class="settings-group">
      <div class="settings-row"><span class="sr-label">Units</span>
        <div class="row gap"><button class="chip ${units==='km'?'active':''}" data-units="km">km</button>
        <button class="chip ${units==='mi'?'active':''}" data-units="mi">mi</button></div></div>
    </div>`;

    // Goals
    html += `<div class="section-head"><h2>Goals</h2><a data-action="add-goal">＋ Add</a></div>`;
    const runs = await DB.getRuns();
    if (!goals.length) html += `<p class="dim mb4">No goals yet. Set one to track your progress.</p>`;
    for (const g of goals) html += this._goalCard(g, runs, true);

    // Shoes
    html += `<div class="section-head"><h2>Shoes</h2><a data-action="add-shoe">＋ Add</a></div>`;
    if (!shoes.length) html += `<p class="dim mb4">No shoes added.</p>`;
    for (const s of shoes) {
      html += `<div class="manage-item"><div class="run-type-dot" style="background:var(--mint)"></div>
        <div class="mi-main"><div class="mi-title">${Util.escapeHtml(s.model||s.brand||'Shoe')}</div>
        <div class="mi-sub">${Util.escapeHtml(s.brand||'')} · ${Util.fmtDist(s.mileage||0,0)} ${Util.distLabel()}</div></div>
        <button class="btn btn-ghost" data-del-shoe="${s.id}" style="padding:8px 12px">Remove</button></div>`;
    }

    // Templates
    html += `<div class="section-head"><h2>Workout templates</h2></div>`;
    for (const t of templates) {
      html += `<div class="manage-item"><div class="run-type-dot" style="background:${t.color||'var(--accent)'}"></div>
        <div class="mi-main"><div class="mi-title">${Util.escapeHtml(t.name)}</div></div></div>`;
    }

    // Data
    html += `<div class="section-head"><h2>Data</h2></div>
      <button class="btn btn-block mb3" data-action="export">Export backup</button>
      <button class="btn btn-block mb3" data-action="import">Import backup</button>
      <button class="btn btn-block btn-danger" data-action="wipe">Erase all data</button>
      <p class="dim center mt4" style="font-size:13px">Running Journal · all data stored on this device</p>`;

    return html;
  },

  // ---- RUN DETAIL -------------------------------------------------------
  async runDetail(id) {
    const r = await DB.getRun(id);
    if (!r) return `<div class="view">${this._empty('❓','Run not found','')}</div>`;
    const pace = Util.pace(r.distance, r.duration);

    let html = `<div class="row between mb4">
      <button class="sheet-close" data-back>‹</button>
      <button class="chip" data-fav="${r.id}">${r.favourite?'★ Favourited':'☆ Favourite'}</button>
    </div>`;

    html += `<div class="detail-hero">
      ${r.typeName?`<div class="dh-type"><span class="run-type-dot" style="background:${r.typeColor||'var(--accent)'}"></span>${Util.escapeHtml(r.typeName)}</div>`:''}
      <div class="dh-dist num">${Util.fmtDist(r.distance)} <small>${Util.distLabel()}</small></div>
      <div class="dh-date">${Util.fmtDateLong(r.date)}${r.startTime?` · ${r.startTime}`:''}</div>
    </div>`;

    html += `<div class="hero-stats">
      <div class="hero-stat"><div class="hs-val">${Util.fmtDuration(r.duration)}</div><div class="hs-label">Time</div></div>
      <div class="hero-stat"><div class="hs-val">${pace?Util.fmtPace(pace).split('/')[0]:'—'}</div><div class="hs-label">Pace</div></div>
      <div class="hero-stat"><div class="hs-val">${r.rpe?r.rpe+'/10':(r.avgHr?r.avgHr:'—')}</div><div class="hs-label">${r.rpe?'Effort':'Avg HR'}</div></div>
    </div>`;

    // photos
    if (r.photos && r.photos.length) {
      html += `<div class="detail-group"><span class="card-label">Photos</span>
        <div class="photo-strip mt3">${r.photos.map(p=>`<img src="${p}" alt="Run photo">`).join('')}</div></div>`;
    }

    const group = (label, pairs) => {
      const valid = pairs.filter(([,v]) => v != null && v !== '');
      if (!valid.length) return '';
      return `<div class="card detail-group"><span class="card-label">${label}</span>
        <div class="kv-grid">${valid.map(([k,v])=>`<div class="kv"><div class="kv-k">${k}</div><div class="kv-v">${v}</div></div>`).join('')}</div></div>`;
    };

    html += group('Heart rate', [['Avg HR', r.avgHr], ['Max HR', r.maxHr], ['Resting HR', r.restingHr], ['HRV', r.hrv]]);
    html += group('Power', [['Avg Power', r.avgPower&&r.avgPower+' W'], ['Max Power', r.maxPower&&r.maxPower+' W']]);
    html += group('Cadence', [['Avg Cadence', r.avgCadence], ['Max Cadence', r.maxCadence], ['Stride', r.strideLength]]);
    html += group('Elevation', [['Gain', r.elevGain&&r.elevGain+' m'], ['Loss', r.elevLoss&&r.elevLoss+' m']]);
    html += group('Environment', [['Weather', r.weather], ['Temp', r.temp!=null?r.temp+'°':null], ['Humidity', r.humidity&&r.humidity+'%'], ['Surface', r.surface]]);
    html += group('Effort', [['RPE', r.rpe&&r.rpe+'/10'], ['Enjoyment', r.enjoyment&&r.enjoyment+'/10'], ['Motivation', r.motivation&&r.motivation+'/10']]);
    html += group('Body', [['Weight', r.weight&&r.weight+' kg'], ['Sleep', r.sleep&&r.sleep+' h'], ['Fatigue', r.fatigue&&r.fatigue+'/10']]);

    if (r.shoeName) html += group('Equipment', [['Shoes', r.shoeName]]);
    if (r.location) html += group('Location', [['Place', r.location]]);

    if (r.notes) {
      html += `<div class="card detail-group"><span class="card-label">Notes</span><p class="mt3">${Util.escapeHtml(r.notes)}</p></div>`;
    }

    html += `<button class="btn btn-block mt4" data-edit="${r.id}">Edit run</button>
      <button class="btn btn-block btn-danger mt3" data-del-run="${r.id}">Delete run</button>`;

    return html;
  },

  // ---- SHARED PARTIALS --------------------------------------------------
  async _runItem(r) {
    const pace = Util.pace(r.distance, r.duration);
    return `<div class="run-item" data-run="${r.id}">
      <span class="run-type-dot" style="background:${r.typeColor||'var(--accent)'}"></span>
      <div class="ri-main">
        <div class="ri-title">${Util.escapeHtml(r.title || r.typeName || 'Run')}${r.favourite?' ★':''}</div>
        <div class="ri-meta">${Util.fmtDate(r.date)} · ${Util.fmtDuration(r.duration)}${pace?` · ${Util.fmtPace(pace)}`:''}</div>
      </div>
      <div class="ri-dist num">${Util.fmtDist(r.distance,1)}<small> ${Util.distLabel()}</small></div>
    </div>`;
  },

  _goalCard(g, runs, manage = false) {
    const prog = this._goalProgress(g, runs);
    const pct = Math.min(100, Math.round(prog.pct));
    return `<div class="card goal-card">
      <div class="row between"><strong>${Util.escapeHtml(g.title)}</strong>
        ${manage?`<button class="chip" data-del-goal="${g.id}" style="padding:4px 10px">Remove</button>`:`<span class="muted num">${pct}%</span>`}</div>
      <div class="goal-bar"><div class="goal-fill" style="width:${pct}%"></div></div>
      <div class="goal-meta"><span class="muted">${prog.label}</span><span class="num">${pct}%</span></div>
    </div>`;
  },

  _goalProgress(g, runs) {
    const now = Util.today();
    let scoped = runs;
    if (g.period === 'week') scoped = runs.filter(r => Util.weekKey(r.date) === Util.weekKey(now));
    if (g.period === 'month') scoped = runs.filter(r => Util.monthKey(r.date) === Util.monthKey(now));
    if (g.period === 'year') scoped = runs.filter(r => r.date.slice(0,4) === now.slice(0,4));

    if (g.metric === 'distance') {
      const have = Util.sumDist(scoped);
      return { pct: g.target?have/g.target*100:0, label: `${Util.fmtDist(have,1)} / ${Util.fmtDist(g.target,0)} ${Util.distLabel()}` };
    }
    if (g.metric === 'runs') {
      const have = scoped.length;
      return { pct: g.target?have/g.target*100:0, label: `${have} / ${g.target} runs` };
    }
    return { pct: 0, label: '' };
  },

  _empty(icon, title, msg) {
    return `<div class="empty"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${msg}</p></div>`;
  },

  // ---- TREND SERIES + SVG ----------------------------------------------
  _buildSeries(runs, metric) {
    if (!runs.length) return [];
    const sorted = [...runs].sort((a,b)=>a.date.localeCompare(b.date));

    if (metric === 'weekly-mileage' || metric === 'monthly-mileage') {
      const keyFn = metric === 'weekly-mileage' ? Util.weekKey.bind(Util) : Util.monthKey.bind(Util);
      const grouped = Util.groupBy(sorted, keyFn);
      return Object.keys(grouped).sort().map(k => ({ x: k, y: Util.distToDisplay(Util.sumDist(grouped[k])) }));
    }
    // per-run metrics
    const pick = {
      'avg-pace': r => r.distance&&r.duration ? r.duration/r.distance : null,
      'avg-hr': r => r.avgHr || null,
      'duration': r => r.duration ? r.duration/60 : null,
      'avg-cadence': r => r.avgCadence || null,
      'elevation': r => r.elevGain || null,
    }[metric];
    return sorted.map(r => ({ x: r.date, y: pick(r) })).filter(p => p.y != null);
  },

  _svgChart(series, metric) {
    const W = 320, H = 200, padL = 8, padR = 8, padT = 16, padB = 24;
    const ys = series.map(s => s.y);
    let min = Math.min(...ys), max = Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12; min -= pad; max += pad;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const xFor = i => padL + (series.length===1?innerW/2:(i/(series.length-1))*innerW);
    const yFor = v => padT + innerH - ((v - min)/(max - min))*innerH;

    const accent = metric === 'avg-pace' ? 'var(--mint)' : 'var(--accent)';
    let path = '', area = '';
    series.forEach((s,i) => {
      const x = xFor(i), y = yFor(s.y);
      path += (i===0?`M${x},${y}`:` L${x},${y}`);
    });
    area = `M${xFor(0)},${yFor(min)} ` + series.map((s,i)=>`L${xFor(i)},${yFor(s.y)}`).join(' ') + ` L${xFor(series.length-1)},${yFor(min)} Z`;

    // gridlines (3)
    let grid = '';
    for (let g=0; g<=2; g++) {
      const v = min + (max-min)*(g/2);
      const y = yFor(v);
      grid += `<line class="chart-grid-line" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/>`;
      const lbl = metric==='avg-pace' ? Util.fmtPace(v).split('/')[0] : (Math.round(v*10)/10);
      grid += `<text class="chart-label" x="${padL+2}" y="${y-4}">${lbl}</text>`;
    }
    const dots = series.map((s,i)=>`<circle class="chart-dot" cx="${xFor(i)}" cy="${yFor(s.y)}" r="3.5" fill="${accent}"/>`).join('');

    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${accent}"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      <path class="chart-area" d="${area}" fill="url(#ag)"/>
      <path class="chart-line" d="${path}" stroke="${accent}"/>
      ${dots}
    </svg>`;
  },
};

window.Views = Views;
