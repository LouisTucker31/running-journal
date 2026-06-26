// logform.js — builds and handles the "Log a run" bottom sheet.

const LogForm = {
  editing: null, // run being edited, or null

  async open(runId = null) {
    this.editing = runId ? await DB.getRun(runId) : null;
    const r = this.editing || {};
    const templates = await DB.getTemplates();
    const shoes = await DB.getShoes();

    const sheet = document.getElementById('sheet');
    const backdrop = document.getElementById('sheet-backdrop');

    sheet.innerHTML = `
      <div class="sheet-grip"></div>
      <div class="sheet-header">
        <h2>${this.editing ? 'Edit run' : 'Log a run'}</h2>
        <button class="sheet-close" data-close-sheet>✕</button>
      </div>
      <form id="log-form">
        ${this._templatePills(templates, r)}

        <div class="field"><label>Date *</label>
          <input class="input" type="date" name="date" value="${r.date || Util.today()}" required></div>

        <div class="input-row">
          <div class="field"><label>Distance (km) *</label>
            <input class="input" type="number" step="0.01" inputmode="decimal" name="distance" value="${r.distance ?? ''}" placeholder="10.0" required></div>
          <div class="field"><label>Duration *</label>
            <input class="input" type="text" name="duration" value="${r.duration ? Util.fmtDuration(r.duration) : ''}" placeholder="50:00" required></div>
        </div>

        <div class="field"><label>Title</label>
          <input class="input" type="text" name="title" value="${Util.escapeHtml(r.title||'')}" placeholder="Morning run"></div>

        ${this._acc('Heart rate', `
          <div class="input-row">
            ${this._num('Avg HR','avgHr',r.avgHr)}${this._num('Max HR','maxHr',r.maxHr)}
          </div>`)}

        ${this._acc('Power', `<div class="input-row">${this._num('Avg Power','avgPower',r.avgPower)}${this._num('Max Power','maxPower',r.maxPower)}</div>`)}

        ${this._acc('Cadence', `<div class="input-row">${this._num('Avg Cadence','avgCadence',r.avgCadence)}${this._num('Max Cadence','maxCadence',r.maxCadence)}</div>
          <div class="input-row">${this._num('Stride (m)','strideLength',r.strideLength,'0.01')}${this._num('GCT (ms)','gct',r.gct)}</div>`)}

        ${this._acc('Elevation', `<div class="input-row">${this._num('Gain (m)','elevGain',r.elevGain)}${this._num('Loss (m)','elevLoss',r.elevLoss)}</div>`)}

        ${this._acc('Environment', `
          <div class="field"><label>Weather</label>
            <select class="input" name="weather">
              ${['','Clear','Cloudy','Rain','Windy','Hot','Cold','Humid','Snow'].map(w=>`<option ${r.weather===w?'selected':''}>${w}</option>`).join('')}
            </select></div>
          <div class="input-row">${this._num('Temp (°C)','temp',r.temp)}${this._num('Humidity (%)','humidity',r.humidity)}</div>
          <div class="field"><label>Surface</label>
            <select class="input" name="surface">
              ${['','Road','Trail','Track','Treadmill','Grass','Sand'].map(s=>`<option ${r.surface===s?'selected':''}>${s}</option>`).join('')}
            </select></div>`)}

        ${this._acc('Equipment', `
          <div class="field"><label>Shoes</label>
            <select class="input" name="shoeId">
              <option value="">None</option>
              ${shoes.map(s=>`<option value="${s.id}" ${r.shoeId===s.id?'selected':''}>${Util.escapeHtml(s.model||s.brand)}</option>`).join('')}
            </select></div>`)}

        ${this._acc('Nutrition', `<div class="input-row">${this._num('Water (ml)','water',r.water)}${this._num('Carbs (g)','carbs',r.carbs)}</div>
          <div class="input-row">${this._num('Electrolytes (mg)','electrolytes',r.electrolytes)}${this._num('Caffeine (mg)','caffeine',r.caffeine)}</div>`)}

        ${this._acc('Effort', `<div class="input-row">${this._num('RPE /10','rpe',r.rpe)}${this._num('Enjoyment /10','enjoyment',r.enjoyment)}</div>
          ${this._num('Motivation /10','motivation',r.motivation)}`)}

        ${this._acc('Body', `<div class="input-row">${this._num('Weight (kg)','weight',r.weight,'0.1')}${this._num('Resting HR','restingHr',r.restingHr)}</div>
          <div class="input-row">${this._num('Sleep (h)','sleep',r.sleep,'0.1')}${this._num('Fatigue /10','fatigue',r.fatigue)}</div>`)}

        ${this._acc('Location', `<div class="field"><label>Place</label>
          <input class="input" type="text" name="location" value="${Util.escapeHtml(r.location||'')}" placeholder="Search town or address"></div>`)}

        ${this._acc('Photos', `
          <input type="file" id="photo-input" accept="image/*" multiple hidden>
          <button type="button" class="btn btn-block" id="add-photo-btn">＋ Add photos</button>
          <div class="photo-strip mt3" id="photo-preview"></div>`)}

        <div class="field mt4"><label>Notes</label>
          <textarea class="input" name="notes" placeholder="How did it feel?">${Util.escapeHtml(r.notes||'')}</textarea></div>

        <button type="submit" class="btn btn-primary btn-block" style="padding:18px;font-size:16px">
          ${this.editing ? 'Save changes' : 'Save run'}</button>
      </form>`;

    // photo state
    this._photos = (r.photos || []).slice();
    this._renderPhotos();

    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));
    this._wire(sheet);
  },

  close() {
    const sheet = document.getElementById('sheet');
    const backdrop = document.getElementById('sheet-backdrop');
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    this.editing = null;
  },

  _templatePills(templates, r) {
    return `<input type="hidden" name="typeName" value="${Util.escapeHtml(r.typeName||'')}">
      <input type="hidden" name="typeColor" value="${Util.escapeHtml(r.typeColor||'')}">
      <div class="metric-pills">
        ${templates.map(t=>`<button type="button" class="chip ${r.typeName===t.name?'active':''}" data-tpl="${t.id}" data-tpl-name="${Util.escapeHtml(t.name)}" data-tpl-color="${t.color}">
          <span class="chip-dot" style="background:${t.color}"></span>${Util.escapeHtml(t.name)}</button>`).join('')}
      </div>`;
  },

  _acc(title, body) {
    return `<div class="acc"><div class="acc-head" data-acc><h3>${title}</h3><span class="chev">›</span></div>
      <div class="acc-body">${body}</div></div>`;
  },

  _num(label, name, val, step='1') {
    return `<div class="field"><label>${label}</label>
      <input class="input" type="number" inputmode="decimal" step="${step}" name="${name}" value="${val ?? ''}"></div>`;
  },

  _renderPhotos() {
    const wrap = document.getElementById('photo-preview');
    if (!wrap) return;
    wrap.innerHTML = this._photos.map((p,i)=>`<div style="position:relative">
      <img src="${p}" style="height:120px" alt="">
      <button type="button" data-rm-photo="${i}" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.6);width:26px;height:26px;border-radius:50%;color:#fff">✕</button>
    </div>`).join('');
  },

  _wire(sheet) {
    // accordions
    sheet.querySelectorAll('[data-acc]').forEach(h => {
      h.onclick = () => h.closest('.acc').classList.toggle('open');
    });
    // template pills
    sheet.querySelectorAll('[data-tpl]').forEach(p => {
      p.onclick = () => {
        const wasActive = p.classList.contains('active');
        sheet.querySelectorAll('[data-tpl]').forEach(x => x.classList.remove('active'));
        const form = sheet.querySelector('#log-form');
        if (wasActive) {
          form.typeName.value = ''; form.typeColor.value = '';
        } else {
          p.classList.add('active');
          form.typeName.value = p.dataset.tplName;
          form.typeColor.value = p.dataset.tplColor;
        }
      };
    });
    // photos
    const addBtn = sheet.querySelector('#add-photo-btn');
    const input = sheet.querySelector('#photo-input');
    if (addBtn) addBtn.onclick = () => input.click();
    if (input) input.onchange = async () => {
      for (const file of input.files) {
        const data = await this._fileToDataURL(file);
        this._photos.push(data);
      }
      this._renderPhotos();
      this._wirePhotoRemovers(sheet);
    };
    this._wirePhotoRemovers(sheet);

    sheet.querySelector('[data-close-sheet]').onclick = () => this.close();
    sheet.querySelector('#log-form').onsubmit = (e) => { e.preventDefault(); this._save(e.target); };
  },

  _wirePhotoRemovers(sheet) {
    sheet.querySelectorAll('[data-rm-photo]').forEach(b => {
      b.onclick = () => { this._photos.splice(+b.dataset.rmPhoto, 1); this._renderPhotos(); this._wirePhotoRemovers(sheet); };
    });
  },

  _fileToDataURL(file) {
    // downscale to keep IndexedDB lean
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          let { width, height } = img;
          if (width > max || height > max) {
            const ratio = Math.min(max/width, max/height);
            width = Math.round(width*ratio); height = Math.round(height*ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  async _save(form) {
    const fd = new FormData(form);
    const num = (k) => { const v = fd.get(k); return v === '' || v == null ? null : Number(v); };
    const str = (k) => { const v = (fd.get(k)||'').toString().trim(); return v || null; };

    const distance = num('distance');
    const duration = Util.parseDuration(fd.get('duration'));
    if (!distance || !duration) { App.toast('Distance and duration are required'); return; }

    const shoeId = str('shoeId');
    let shoeName = null;
    if (shoeId) { const s = await DB.getShoe(shoeId); shoeName = s ? (s.model||s.brand) : null; }

    const run = {
      id: this.editing ? this.editing.id : DB.uid(),
      date: fd.get('date'),
      title: str('title'),
      typeName: str('typeName'),
      typeColor: str('typeColor'),
      distance, duration,
      avgHr: num('avgHr'), maxHr: num('maxHr'),
      avgPower: num('avgPower'), maxPower: num('maxPower'),
      avgCadence: num('avgCadence'), maxCadence: num('maxCadence'),
      strideLength: num('strideLength'), gct: num('gct'),
      elevGain: num('elevGain'), elevLoss: num('elevLoss'),
      weather: str('weather'), temp: num('temp'), humidity: num('humidity'), surface: str('surface'),
      shoeId, shoeName,
      water: num('water'), carbs: num('carbs'), electrolytes: num('electrolytes'), caffeine: num('caffeine'),
      rpe: num('rpe'), enjoyment: num('enjoyment'), motivation: num('motivation'),
      weight: num('weight'), restingHr: num('restingHr'), sleep: num('sleep'), fatigue: num('fatigue'),
      location: str('location'),
      notes: str('notes'),
      photos: this._photos.slice(),
      favourite: this.editing ? this.editing.favourite : false,
      createdAt: this.editing ? this.editing.createdAt : Date.now(),
    };

    await DB.saveRun(run);
    await App.recalcShoeMileage();
    this.close();
    App.toast(this.editing ? 'Run updated' : 'Run saved');
    App.render();
  },
};

window.LogForm = LogForm;
