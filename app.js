/* ===== CONSTANTS ===== */
const MEMBERS = {
  claudio: { name: 'Cláudio', color: '#6C63FF', role: 'Pai' },
  odete:   { name: 'Odete',   color: '#FF6584', role: 'Mãe' },
  clara:   { name: 'Clara',   color: '#43D9AD', role: 'Filha' },
  leonor:  { name: 'Leonor',  color: '#FFB347', role: 'Filha' },
};

const TYPES = {
  medico:      { label: 'Médico',      icon: '🏥' },
  escola:      { label: 'Escola',      icon: '🏫' },
  desporto:    { label: 'Desporto',    icon: '⚽' },
  aniversario: { label: 'Aniversário', icon: '🎂' },
  viagem:      { label: 'Viagem',      icon: '✈️' },
  trabalho:    { label: 'Trabalho',    icon: '💼' },
  social:      { label: 'Social',      icon: '🍽️' },
  outro:       { label: 'Outro',       icon: '📋' },
};

const PT_MONTHS     = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PT_DAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const PT_DAYS_FULL  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

/* ===== STATE ===== */
let state = {
  events: {},
  currentYear:  new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  selectedDate: null,
  filterMember: 'all',
  editingId:    null,
};

let db = null;
let eventsRef = null;

/* ===== PIN ===== */
const PIN_CODE = '1425';

function initPin() {
  if (sessionStorage.getItem('familia_auth') === '1') {
    document.getElementById('pin-screen').classList.add('hidden');
    return;
  }

  let entered = '';
  const dots  = document.querySelectorAll('#pin-dots span');
  const errEl = document.getElementById('pin-error');

  function updateDots() {
    dots.forEach((d, i) => {
      d.classList.toggle('filled', i < entered.length);
      d.classList.remove('error');
    });
    errEl.classList.remove('visible');
  }

  function checkPin() {
    if (entered === PIN_CODE) {
      sessionStorage.setItem('familia_auth', '1');
      document.getElementById('pin-screen').classList.add('hidden');
    } else {
      dots.forEach(d => { d.classList.add('error'); d.classList.remove('filled'); });
      errEl.classList.add('visible');
      entered = '';
      setTimeout(updateDots, 600);
    }
  }

  document.querySelectorAll('.pin-btn[data-d]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (entered.length >= 4) return;
      entered += btn.dataset.d;
      updateDots();
      if (entered.length === 4) setTimeout(checkPin, 150);
    });
  });

  document.getElementById('pin-clear').addEventListener('click', () => {
    entered = entered.slice(0, -1);
    updateDots();
  });

  document.getElementById('pin-ok').addEventListener('click', () => {
    if (entered.length === 4) checkPin();
  });
}

/* ===== FIREBASE INIT ===== */
function initFirebase() {
  try {
    const app = firebase.initializeApp(firebaseConfig);
    db = firebase.database(app);

    setSyncStatus(null);

    firebase.auth(app).signInAnonymously().then(() => {
      eventsRef = db.ref('events');
      eventsRef.on('value', snapshot => {
        state.events = snapshot.val() || {};
        refreshAll();
        setSyncStatus(true);
      }, () => {
        setSyncStatus(false);
      });
      initNotifications(app);
    }).catch(e => {
      console.error('Auth error:', e);
      setSyncStatus(false);
    });
  } catch (e) {
    console.error('Firebase error:', e);
    setSyncStatus(false);
  }
}

/* ===== PUSH NOTIFICATIONS ===== */
async function initNotifications(app) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const messaging = firebase.messaging(app);
    const token = await messaging.getToken({
      vapidKey: window.VAPID_KEY,
      serviceWorkerRegistration: reg
    });

    if (token) {
      const key = btoa(token).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
      db.ref(`fcm_tokens/${key}`).set(token);
    }

    messaging.onMessage(payload => {
      const { title, body } = payload.notification;
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icon-192.png', tag: 'familia-evento' });
      }
    });
  } catch (e) {
    console.warn('Notifications not available:', e);
  }
}

function setSyncStatus(online) {
  const dot  = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (!dot) return;
  if (online === null) {
    dot.style.background = '#FFB347';
    text.textContent = 'A ligar ao servidor…';
  } else if (online) {
    dot.style.background = '#43D9AD';
    text.textContent = 'Sincronizado com a cloud ✓';
  } else {
    dot.style.background = '#FF6584';
    text.textContent = 'Sem ligação — a funcionar offline';
  }
}

/* ===== HELPERS ===== */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function dateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatDatePT(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return `${String(d).padStart(2,'0')} ${PT_MONTHS[m-1]} ${y}`;
}

function formatDayOfWeekPT(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return PT_DAYS_FULL[new Date(y, m - 1, d).getDay()];
}

function todayStr() {
  const t = new Date();
  return dateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

function eventsArray() {
  return Object.entries(state.events).map(([id, ev]) => ({ ...ev, id }));
}

function eventsForDate(dateISO) {
  return eventsArray()
    .filter(e => e.date === dateISO)
    .filter(e => state.filterMember === 'all' || (e.members || []).includes(state.filterMember))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

function primaryColor(ev) {
  return ev.members && ev.members.length > 0 ? (MEMBERS[ev.members[0]]?.color || '#6C63FF') : '#6C63FF';
}

/* ===== CALENDAR ===== */
function renderCalendar() {
  const { currentYear: y, currentMonth: m } = state;
  document.getElementById('month-label').textContent = `${PT_MONTHS[m]} ${y}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDay    = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev  = new Date(y, m, 0).getDate();
  const today       = todayStr();

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, month: m - 1, year: m === 0 ? y - 1 : y, other: true });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, month: m, year: y, other: false });
  const remaining = (7 - cells.length % 7) % 7;
  for (let d = 1; d <= remaining; d++)
    cells.push({ day: d, month: m + 1, year: m === 11 ? y + 1 : y, other: true });

  cells.forEach(({ day, month, year, other }) => {
    const ds  = dateStr(year, month, day);
    const evs = eventsForDate(ds);
    const cell = document.createElement('div');
    cell.className = 'cal-day' +
      (other ? ' other-month' : '') +
      (ds === today ? ' today' : '') +
      (ds === state.selectedDate ? ' selected' : '');

    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = day;
    cell.appendChild(num);

    if (evs.length > 0) {
      const dots = document.createElement('div');
      dots.className = 'cal-dots';
      evs.slice(0, 6).forEach(ev => {
        const dot = document.createElement('div');
        dot.className = 'cal-dot';
        dot.style.background = primaryColor(ev);
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }

    cell.addEventListener('click', () => selectDay(ds));
    grid.appendChild(cell);
  });
}

function selectDay(ds) {
  state.selectedDate = ds;
  renderCalendar();
  showDayPanel(ds);
}

/* ===== DAY PANEL ===== */
function showDayPanel(ds) {
  const panel = document.getElementById('day-panel');
  const title = document.getElementById('day-panel-title');
  const list  = document.getElementById('day-events-list');

  title.textContent = `${formatDayOfWeekPT(ds)}, ${formatDatePT(ds)}`;
  list.innerHTML = '';

  const evs = eventsForDate(ds);
  if (evs.length === 0) {
    list.innerHTML = '<div class="empty-day">Sem compromissos</div>';
  } else {
    evs.forEach(ev => list.appendChild(makeEventItem(ev)));
  }
  panel.classList.remove('hidden');
}

function makeEventItem(ev) {
  const el = document.createElement('div');
  el.className = 'event-item';
  el.style.setProperty('--member-color', primaryColor(ev));
  const t = TYPES[ev.type] || TYPES.outro;
  const members = (ev.members || []).map(mid =>
    `<span class="event-member-badge" style="--c:${MEMBERS[mid]?.color}">${MEMBERS[mid]?.name}</span>`
  ).join('');
  el.innerHTML = `
    <div class="event-item-icon">${t.icon}</div>
    <div class="event-item-body">
      <div class="event-item-title">${ev.title}</div>
      <div class="event-item-meta">${ev.time ? ev.time + ' · ' : ''}${t.label}</div>
      <div class="event-item-members">${members}</div>
    </div>`;
  el.addEventListener('click', () => openDetail(ev.id));
  return el;
}

/* ===== LIST VIEW ===== */
function renderListView() {
  const container = document.getElementById('list-view-content');
  container.innerHTML = '';

  const today = todayStr();
  const upcoming = eventsArray()
    .filter(e => e.date >= today)
    .filter(e => state.filterMember === 'all' || (e.members || []).includes(state.filterMember))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

  if (upcoming.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="es-icon">📅</div><p>Sem compromissos futuros.<br>Toca em + para adicionar!</p></div>`;
    return;
  }

  let lastMonth = '';
  upcoming.forEach(ev => {
    const [y, m, d] = ev.date.split('-').map(Number);
    const monthKey = `${PT_MONTHS[m - 1]} ${y}`;
    if (monthKey !== lastMonth) {
      const lbl = document.createElement('div');
      lbl.className = 'list-month-label';
      lbl.textContent = monthKey;
      container.appendChild(lbl);
      lastMonth = monthKey;
    }
    const dow = PT_DAYS_SHORT[new Date(y, m - 1, d).getDay()];
    const t   = TYPES[ev.type] || TYPES.outro;
    const members = (ev.members || []).map(mid =>
      `<span class="event-member-badge" style="--c:${MEMBERS[mid]?.color}">${MEMBERS[mid]?.name}</span>`
    ).join('');
    const el = document.createElement('div');
    el.className = 'list-event-item';
    el.style.setProperty('--member-color', primaryColor(ev));
    el.innerHTML = `
      <div class="list-event-date">
        <div class="list-event-day">${String(d).padStart(2,'0')}</div>
        <div class="list-event-dow">${dow}</div>
      </div>
      <div class="list-event-body">
        <div class="list-event-title">${t.icon} ${ev.title}</div>
        <div class="list-event-meta">${ev.time ? ev.time + ' · ' : ''}${t.label}</div>
        <div class="event-item-members" style="margin-top:4px">${members}</div>
      </div>`;
    el.addEventListener('click', () => openDetail(ev.id));
    container.appendChild(el);
  });
}

/* ===== DETAIL MODAL ===== */
function openDetail(id) {
  const ev = eventsArray().find(e => e.id === id);
  if (!ev) return;
  const t = TYPES[ev.type] || TYPES.outro;
  document.getElementById('detail-title').textContent = ev.title;
  const membersHtml = (ev.members || []).map(mid =>
    `<span class="event-member-badge" style="--c:${MEMBERS[mid]?.color};padding:4px 10px;font-size:13px">${MEMBERS[mid]?.name} <small style="opacity:.7">${MEMBERS[mid]?.role}</small></span>`
  ).join(' ');
  document.getElementById('detail-body').innerHTML = `
    <div class="detail-row"><div class="detail-icon">${t.icon}</div><div class="detail-info"><label>Tipo</label><span>${t.label}</span></div></div>
    <div class="detail-row"><div class="detail-icon">📅</div><div class="detail-info"><label>Data</label><span>${formatDayOfWeekPT(ev.date)}, ${formatDatePT(ev.date)}${ev.time ? ' às ' + ev.time : ''}</span></div></div>
    <div class="detail-row"><div class="detail-icon">👥</div><div class="detail-info"><label>Quem</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${membersHtml}</div></div></div>
    ${ev.note ? `<div class="detail-row"><div class="detail-icon">📝</div><div class="detail-info"><label>Nota</label><span>${ev.note}</span></div></div>` : ''}
  `;
  document.getElementById('btn-delete-event').onclick = () => {
    if (confirm('Eliminar este compromisso?')) {
      eventsRef.child(id).remove();
      closeDetail();
    }
  };
  document.getElementById('btn-edit-event').onclick = () => {
    closeDetail();
    openAddModal(ev);
  };
  document.getElementById('detail-overlay').classList.remove('hidden');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.add('hidden');
}

/* ===== ADD / EDIT MODAL ===== */
let selectedType    = 'outro';
let selectedMembers = [];

function openAddModal(prefill = null) {
  state.editingId = prefill ? prefill.id : null;
  selectedType    = prefill ? prefill.type : 'outro';
  selectedMembers = prefill ? [...(prefill.members || [])] : [];

  document.getElementById('modal-title').textContent = prefill ? 'Editar compromisso' : 'Novo compromisso';
  document.getElementById('ev-title').value = prefill ? prefill.title : '';
  document.getElementById('ev-date').value  = prefill ? prefill.date  : (state.selectedDate || todayStr());
  document.getElementById('ev-time').value  = prefill ? (prefill.time || '') : '';
  document.getElementById('ev-note').value  = prefill ? (prefill.note || '') : '';

  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === selectedType));
  document.querySelectorAll('.mp-btn').forEach(b => b.classList.toggle('active', selectedMembers.includes(b.dataset.member)));

  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('ev-title').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function saveEvent() {
  const title = document.getElementById('ev-title').value.trim();
  const date  = document.getElementById('ev-date').value;
  const time  = document.getElementById('ev-time').value;
  const note  = document.getElementById('ev-note').value.trim();

  if (!title) { document.getElementById('ev-title').focus(); return; }
  if (!date)  { document.getElementById('ev-date').focus(); return; }
  if (selectedMembers.length === 0) { alert('Selecciona pelo menos um membro!'); return; }

  const payload = { title, date, time, note, type: selectedType, members: selectedMembers };

  if (state.editingId) {
    eventsRef.child(state.editingId).update(payload);
  } else {
    eventsRef.push(payload);
    fetch('/.netlify/functions/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        date: formatDatePT(date),
        time,
        type: selectedType,
        members: selectedMembers
      })
    }).catch(() => {});
  }

  closeModal();
}

/* ===== NAV ===== */
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
  if (id === 'screen-list') renderListView();
}

function refreshAll() {
  renderCalendar();
  const cur = document.querySelector('.screen.active')?.id;
  if (cur === 'screen-list') renderListView();
  if (state.selectedDate) showDayPanel(state.selectedDate);
}

/* ===== INIT ===== */
function init() {
  initFirebase();

  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen))
  );

  document.getElementById('btn-prev-month').onclick = () => {
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    state.selectedDate = null;
    document.getElementById('day-panel').classList.add('hidden');
    renderCalendar();
  };
  document.getElementById('btn-next-month').onclick = () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    state.selectedDate = null;
    document.getElementById('day-panel').classList.add('hidden');
    renderCalendar();
  };
  document.getElementById('btn-today').onclick = () => {
    const t = new Date();
    state.currentYear  = t.getFullYear();
    state.currentMonth = t.getMonth();
    renderCalendar();
    selectDay(todayStr());
  };

  document.querySelectorAll('.member-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.member-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filterMember = chip.dataset.member;
      refreshAll();
    });
  });

  document.getElementById('btn-open-add').onclick     = () => openAddModal();
  document.getElementById('btn-add-from-day').onclick = () => openAddModal();
  document.getElementById('close-modal').onclick      = closeModal;
  document.getElementById('btn-cancel').onclick       = closeModal;
  document.getElementById('btn-save').onclick         = saveEvent;

  document.querySelectorAll('.type-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
    })
  );

  document.querySelectorAll('.mp-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const m = btn.dataset.member;
      if (selectedMembers.includes(m)) selectedMembers = selectedMembers.filter(x => x !== m);
      else selectedMembers.push(m);
      btn.classList.toggle('active', selectedMembers.includes(m));
    })
  );

  document.getElementById('close-day-panel').onclick = () => {
    document.getElementById('day-panel').classList.add('hidden');
    state.selectedDate = null;
    renderCalendar();
  };

  document.getElementById('close-detail').onclick = closeDetail;
  document.getElementById('detail-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('detail-overlay')) closeDetail();
  });

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  document.getElementById('btn-clear-data').onclick = () => {
    if (confirm('Apagar TODOS os compromissos? Esta acção não pode ser desfeita.')) {
      eventsRef.remove();
    }
  };

  document.getElementById('ev-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveEvent();
  });

  selectDay(todayStr());
}

document.addEventListener('DOMContentLoaded', () => { initPin(); init(); });
