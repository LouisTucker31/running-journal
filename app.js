// app.js — application shell: routing, navigation, global events.

const App = {
  state: { tab: 'dashboard', detailId: null, runsFilter: {}, trends: {}, stats: {} },

  async init() {
    await DB.seedDefaults();
    Util.setUnits(await DB.getSetting('units', 'km'));
    this.buildShell();
    this.bindGlobal();
    await this.render();
  },

  buildShell() {
    document.getElementById('app').innerHTML = `
      <main id="screen"></main>
      <nav class="tabbar" id="tabbar">
        ${this._tab('dashboard','Home', '<path d="M3 12l9-9 9 9M5 10v10h14V10"/>')}
        ${this._tab('runs','Runs', '<path d="M4 6h16M4 12h16M4 18h10"/>')}
        ${this._tab('trends','Trends', '<path d="M3 17l5-6 4 4 8-9"/>')}
        ${this._tab('statistics','Stats', '<path d="M5 21V9M12 21V4M19 21v-7"/>')}
        ${this._tab('settings','Settings', '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-5l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L3 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.4h5l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z"/>')}
      </nav>
      <div class="sheet-backdrop" id="sheet-backdrop"></div>
      <div class="sheet" id="sheet"></div>
      <div class="toast" id="toast"></div>`;
  },

  _tab(id, label, path) {
    return `<button class="tab" data-tab="${id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>
      <span>${label}</span></button>`;
  },

  bindGlobal() {
    // tab bar
    document.getElementById('tabbar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) this.go(btn.dataset.tab);
    });

    // backdrop closes sheet
    document.getElementById('sheet-backdrop').addEventListener('click', () => {
      LogForm.close(); this._closeSheet();
    });

    // delegated clicks across the screen
    document.getElementById('screen').addEventListener('click', (e) => this._onScreenClick(e));
    document.getElementById('screen').addEventListener('input', (e) => this._onScreenInput(e));
  },

  go(tab) {
    this.state.tab = tab;
    this.state.detailId = null;
    this.render();
    document.getElementById('screen').scrollTo(0, 0);
    window.scrollTo(0, 0);
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  },

  async render() {
    const screen = document.getElementById('screen');
    // update active tab
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === this.state.tab && !this.state.detailId));

    let html;
    if (this.state.detailId) {
      html = `<div class="view">${await Views.runDetail(this.state.detailId)}</div>`;
    } else {
      switch (this.state.tab) {
        case 'dashboard': html = `<div class="view">${await Views.dashboard()}</div>`; break;
        case 'runs': html = `<div class="view">${await Views.runs(this.state.runsFilter)}</div>`; break;
        case 'trends': html = `<div class="view">${await Views.trends(this.state.trends)}</div>`; break;
        case 'statistics': html = `<div class="view">${await Views.statistics(this.state.stats)}</div>`; break;
        case 'settings': html = `<div class="view">${await Views.settings()}</div>`; break;
      }
    }
    screen.innerHTML = html;
  },

  // ---- screen interactions ---------------------------------------------
  async _onScreenClick(e) {
    const t = e.target;
    const find = (sel) => t.closest(sel);

    // open log
    if (find('[data-action="open-log"]')) return LogForm.open();
    // tab links inside views
    const tabLink = find('[data-tab]');
    if (tabLink && !tabLink.classList.contains('tab')) return this.go(tabLink.dataset.tab);

    // open run detail
    const runEl = find('[data-run]');
    if (runEl) { this.state.detailId = runEl.dataset.run; return this.render(); }

    // back from detail
    if (find('[data-back]')) { this.state.detailId = null; return this.render(); }

    // favourite toggle
    const fav = find('[data-fav]');
    if (fav) {
      const r = await DB.getRun(fav.dataset.fav);
      r.favourite = !r.favourite; await DB.saveRun(r);
      return this.render();
    }

    // edit / delete run
    const edit = find('[data-edit]');
    if (edit) return LogForm.open(edit.dataset.edit);
    const del = find('[data-del-run]');
    if (del) {
      if (confirm('Delete this run? This cannot be undone.')) {
        await DB.deleteRun(del.dataset.delRun);
        await this.recalcShoeMileage();
        this.state.detailId = null;
        this.toast('Run deleted');
        return this.render();
      }
    }

    // runs filters / sort
    const filter = find('[data-filter]');
    if (filter) {
      const v = filter.dataset.filter;
      this.state.runsFilter = { ...this.state.runsFilter, type: null, fav: false };
      if (v === 'fav') this.state.runsFilter.fav = true;
      else if (v.startsWith('type:')) this.state.runsFilter.type = v.slice(5);
      return this.render();
    }
    const sort = find('[data-sort]');
    if (sort) { this.state.runsFilter = { ...this.state.runsFilter, sort: sort.dataset.sort }; return this.render(); }

    // trends metric
    const metric = find('[data-metric]');
    if (metric) { this.state.trends = { metric: metric.dataset.metric }; return this.render(); }

    // stats scope
    const scope = find('[data-scope]');
    if (scope) { this.state.stats = { scope: scope.dataset.scope }; return this.render(); }

    // units
    const units = find('[data-units]');
    if (units) {
      await DB.setSetting('units', units.dataset.units);
      Util.setUnits(units.dataset.units);
      await this.recalcShoeMileage();
      this.toast(`Units set to ${units.dataset.units}`);
      return this.render();
    }

    // settings actions
    if (find('[data-action="add-shoe"]')) return this._shoeSheet();
    if (find('[data-action="add-goal"]')) return this._goalSheet();
    if (find('[data-action="export"]')) return this._export();
    if (find('[data-action="import"]')) return this._import();
    if (find('[data-action="wipe"]')) return this._wipe();

    const delShoe = find('[data-del-shoe]');
    if (delShoe) { await DB.deleteShoe(delShoe.dataset.delShoe); this.toast('Shoe removed'); return this.render(); }
    const delGoal = find('[data-del-goal]');
    if (delGoal) { await DB.deleteGoal(delGoal.dataset.delGoal); this.toast('Goal removed'); return this.render(); }
  },

  _onScreenInput(e) {
    const search = e.target.closest('[data-runsearch]');
    if (search) {
      this.state.runsFilter = { ...this.state.runsFilter, q: search.value };
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        this.render().then(() => {
          const box = document.querySelector('[data-runsearch]');
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        });
      }, 250);
    }
  },

  // ---- shoe / goal mini-sheets -----------------------------------------
  _shoeSheet() {
    const sheet = document.getElementById('sheet');
    document.getElementById('sheet-backdrop').classList.add('open');
    sheet.innerHTML = `<div class="sheet-grip"></div>
      <div class="sheet-header"><h2>Add shoe</h2><button class="sheet-close" id="x">✕</button></div>
      <form id="shoe-form">
        <div class="field"><label>Brand</label><input class="input" name="brand" placeholder="Hoka"></div>
        <div class="field"><label>Model</label><input class="input" name="model" placeholder="Clifton 10" required></div>
        <div class="input-row">
          <div class="field"><label>Starting mileage (km)</label><input class="input" type="number" name="startMileage" value="0"></div>
          <div class="field"><label>Lifespan (km)</label><input class="input" type="number" name="lifespan" value="800"></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit" style="padding:16px">Add shoe</button>
      </form>`;
    requestAnimationFrame(() => sheet.classList.add('open'));
    sheet.querySelector('#x').onclick = () => this._closeSheet();
    sheet.querySelector('#shoe-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await DB.saveShoe({ id: DB.uid(), brand: fd.get('brand')?.trim(), model: fd.get('model')?.trim(),
        startMileage: Number(fd.get('startMileage'))||0, lifespan: Number(fd.get('lifespan'))||800, mileage: 0 });
      await this.recalcShoeMileage();
      this._closeSheet(); this.toast('Shoe added'); this.render();
    };
  },

  _goalSheet() {
    const sheet = document.getElementById('sheet');
    document.getElementById('sheet-backdrop').classList.add('open');
    sheet.innerHTML = `<div class="sheet-grip"></div>
      <div class="sheet-header"><h2>Add goal</h2><button class="sheet-close" id="x">✕</button></div>
      <form id="goal-form">
        <div class="field"><label>Title</label><input class="input" name="title" placeholder="Run 100 km this month" required></div>
        <div class="field"><label>Metric</label>
          <select class="input" name="metric"><option value="distance">Total distance</option><option value="runs">Number of runs</option></select></div>
        <div class="input-row">
          <div class="field"><label>Target</label><input class="input" type="number" name="target" placeholder="100" required></div>
          <div class="field"><label>Period</label>
            <select class="input" name="period"><option value="week">This week</option><option value="month" selected>This month</option><option value="year">This year</option></select></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit" style="padding:16px">Add goal</button>
      </form>`;
    requestAnimationFrame(() => sheet.classList.add('open'));
    sheet.querySelector('#x').onclick = () => this._closeSheet();
    sheet.querySelector('#goal-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await DB.saveGoal({ id: DB.uid(), title: fd.get('title').trim(), metric: fd.get('metric'),
        target: Number(fd.get('target')), period: fd.get('period') });
      this._closeSheet(); this.toast('Goal added'); this.render();
    };
  },

  _closeSheet() {
    const sheet = document.getElementById('sheet');
    sheet.classList.remove('open');
    document.getElementById('sheet-backdrop').classList.remove('open');
  },

  // ---- data operations --------------------------------------------------
  async recalcShoeMileage() {
    const shoes = await DB.getShoes();
    const runs = await DB.getRuns();
    for (const s of shoes) {
      const used = runs.filter(r => r.shoeId === s.id).reduce((a, r) => a + (r.distance||0), 0);
      s.mileage = (s.startMileage || 0) + used;
      await DB.saveShoe(s);
    }
  },

  async _export() {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `running-journal-${Util.today()}.json`; a.click();
    URL.revokeObjectURL(url);
    this.toast('Backup exported');
  },

  _import() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!confirm('Import will replace all current data. Continue?')) return;
        await DB.importAll(data, { merge: false });
        Util.setUnits(await DB.getSetting('units', 'km'));
        this.toast('Backup imported'); this.go('dashboard');
      } catch { this.toast('Could not read that file'); }
    };
    input.click();
  },

  async _wipe() {
    if (!confirm('Erase ALL runs, shoes, goals and settings? This cannot be undone.')) return;
    await DB.importAll({ runs: [], shoes: [], templates: [], goals: [], settings: [] }, { merge: false });
    await DB.seedDefaults();
    this.toast('All data erased'); this.go('dashboard');
  },
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
