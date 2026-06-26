// util.js — formatting, calculations, stats, PB detection, insights.
// Pure functions where possible. Units handled centrally so a metric/imperial
// toggle only changes this layer.

const Util = {
  units: 'km', // 'km' | 'mi'

  setUnits(u) { this.units = u; },

  // --- distance ---
  // Internally everything stored in km. Convert on display only.
  distToDisplay(km) {
    if (km == null) return null;
    return this.units === 'mi' ? km * 0.621371 : km;
  },
  distLabel() { return this.units === 'mi' ? 'mi' : 'km'; },
  fmtDist(km, dp = 2) {
    const v = this.distToDisplay(km);
    if (v == null) return '—';
    return v.toFixed(dp);
  },

  // --- duration (seconds) ---
  fmtDuration(sec) {
    if (sec == null) return '—';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
  },
  // parse "mm:ss" or "h:mm:ss" → seconds
  parseDuration(str) {
    if (!str) return null;
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
    if (parts.length === 2) return parts[0]*60 + parts[1];
    return parts[0];
  },

  // --- pace (sec per km internally) ---
  pace(km, sec) {
    if (!km || !sec) return null;
    return sec / km; // sec per km
  },
  fmtPace(secPerKm) {
    if (secPerKm == null) return '—';
    let v = secPerKm;
    if (this.units === 'mi') v = secPerKm / 0.621371; // sec per mile
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2,'0')}/${this.distLabel()}`;
  },

  // --- dates ---
  today() { return new Date().toISOString().slice(0, 10); },
  fmtDate(iso, opts) {
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short' });
  },
  fmtDateLong(iso) {
    return this.fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  },
  weekKey(iso) {
    // ISO week start Monday
    const d = new Date(iso + 'T00:00:00');
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  },
  monthKey(iso) { return iso.slice(0, 7); },

  greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  },

  // --- aggregations ---
  sumDist(runs) { return runs.reduce((a, r) => a + (r.distance || 0), 0); },
  sumDuration(runs) { return runs.reduce((a, r) => a + (r.duration || 0), 0); },

  // group runs by a key function
  groupBy(runs, keyFn) {
    const map = {};
    for (const r of runs) {
      const k = keyFn(r.date);
      (map[k] = map[k] || []).push(r);
    }
    return map;
  },

  // current streak in days (consecutive days w/ at least one run, ending today/yesterday)
  streak(runs) {
    if (!runs.length) return 0;
    const days = new Set(runs.map(r => r.date));
    let count = 0;
    let cursor = new Date();
    // allow streak to count from yesterday if no run today yet
    const todayStr = this.today();
    if (!days.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const key = cursor.toISOString().slice(0, 10);
      if (days.has(key)) { count++; cursor.setDate(cursor.getDate() - 1); }
      else break;
    }
    return count;
  },

  longestStreak(runs) {
    if (!runs.length) return 0;
    const days = [...new Set(runs.map(r => r.date))].sort();
    let best = 1, cur = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i-1]); prev.setDate(prev.getDate() + 1);
      if (prev.toISOString().slice(0,10) === days[i]) cur++;
      else cur = 1;
      best = Math.max(best, cur);
    }
    return best;
  },

  // --- PB detection ---
  // Distances in km we care about for time PBs
  PB_DISTANCES: [
    { key: '1k', label: '1 km', km: 1 },
    { key: '1mi', label: '1 Mile', km: 1.60934 },
    { key: '5k', label: '5K', km: 5 },
    { key: '10k', label: '10K', km: 10 },
    { key: 'half', label: 'Half Marathon', km: 21.0975 },
    { key: 'full', label: 'Marathon', km: 42.195 },
  ],
  // best time for a target distance: among runs whose distance >= target,
  // estimate time via pace (best-effort given manual logging)
  computePBs(runs) {
    const pbs = {};
    for (const d of this.PB_DISTANCES) {
      let best = null;
      for (const r of runs) {
        if (!r.distance || !r.duration) continue;
        if (r.distance + 0.05 >= d.km) {
          const est = (r.duration / r.distance) * d.km;
          if (best == null || est < best.time) best = { time: est, run: r };
        }
      }
      if (best) pbs[d.key] = { ...d, time: best.time, runId: best.run.id };
    }
    // fastest pace & longest run
    let fastest = null, longest = null;
    for (const r of runs) {
      if (r.distance && r.duration) {
        const p = r.duration / r.distance;
        if (!fastest || p < fastest.pace) fastest = { pace: p, runId: r.id };
      }
      if (r.distance && (!longest || r.distance > longest.distance)) longest = { distance: r.distance, runId: r.id };
    }
    if (fastest) pbs.fastest = { label: 'Fastest Pace', pace: fastest.pace, runId: fastest.runId };
    if (longest) pbs.longest = { label: 'Longest Run', distance: longest.distance, runId: longest.runId };
    return pbs;
  },

  // --- insights (simple logic, no AI) ---
  insights(runs, shoes) {
    const out = [];
    if (runs.length < 2) return out;
    const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));

    // weekly mileage trend
    const byWeek = this.groupBy(sorted, (d) => this.weekKey(d));
    const weeks = Object.keys(byWeek).sort();
    if (weeks.length >= 2) {
      const last = this.sumDist(byWeek[weeks[weeks.length-1]]);
      const prev = this.sumDist(byWeek[weeks[weeks.length-2]]);
      if (prev > 0) {
        const pct = Math.round(((last - prev) / prev) * 100);
        if (Math.abs(pct) >= 5) {
          out.push({ icon: pct > 0 ? '📈' : '📉',
            text: `Weekly mileage ${pct > 0 ? 'increased' : 'decreased'} ${Math.abs(pct)}% versus last week.` });
        }
      }
    }

    // longest run recency
    const longest = sorted.reduce((m, r) => (r.distance > (m?.distance||0) ? r : m), null);
    if (longest && longest.date === sorted[sorted.length-1].date) {
      out.push({ icon: '🏅', text: `Your most recent run was your longest yet at ${this.fmtDist(longest.distance)} ${this.distLabel()}.` });
    }

    // shoe mileage callout
    if (shoes && shoes.length) {
      const top = [...shoes].sort((a,b) => (b.mileage||0)-(a.mileage||0))[0];
      if (top && top.mileage > 0) {
        out.push({ icon: '👟', text: `You've logged ${this.fmtDist(top.mileage,0)} ${this.distLabel()} in your ${top.model || top.brand}.` });
      }
    }

    // pace improvement (last 5 vs previous 5)
    const withPace = sorted.filter(r => r.distance && r.duration);
    if (withPace.length >= 6) {
      const recent = withPace.slice(-3);
      const older = withPace.slice(-6, -3);
      const avg = (arr) => arr.reduce((a,r)=>a + r.duration/r.distance, 0) / arr.length;
      const diff = Math.round(avg(older) - avg(recent));
      if (diff >= 3) out.push({ icon: '⚡', text: `Average pace improved by ${diff} sec/km across your recent runs.` });
    }

    return out.slice(0, 4);
  },

  escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
};

window.Util = Util;
