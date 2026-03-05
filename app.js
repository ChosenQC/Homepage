const API_BASE = "https://floral-flower-7c16.chen-qiu.workers.dev";

const END_REGISTER = "/api/auth/register";
const END_LOGIN    = "/api/auth/login";
const END_GET      = "/api/todos/get";
const END_SET      = "/api/todos/set";

// Calendar config
const WEEK_START = 0;        // 0=Sunday
const START_HOUR = 7;        // 07:00
const END_HOUR   = 22;       // 22:00
const SLOT_MIN   = 30;       // 30-min slots

// local keys
const kUser = "todo_v5_user";
const kSite = "todo_v5_site";
const kPw   = "todo_v5_pw";
const kSess = "todo_v5_session";

// DOM auth
const authView = document.getElementById("authView");
const authTitle = document.getElementById("authTitle");
const toLoginBtn = document.getElementById("toLoginBtn");
const toRegisterBtn = document.getElementById("toRegisterBtn");
const usernameInput = document.getElementById("usernameInput");
const siteSecretInput = document.getElementById("siteSecretInput");
const userPwInput = document.getElementById("userPwInput");
const userPw2Row = document.getElementById("userPw2Row");
const userPw2Input = document.getElementById("userPw2Input");
const rememberUser = document.getElementById("rememberUser");
const rememberSite = document.getElementById("rememberSite");
const rememberPw = document.getElementById("rememberPw");
const authBtn = document.getElementById("authBtn");
const authMsg = document.getElementById("authMsg");

// DOM app
const appView = document.getElementById("appView");
const helloTitle = document.getElementById("helloTitle");
const logoutBtn = document.getElementById("logoutBtn");
const syncBtn = document.getElementById("syncBtn");
const prevWeekBtn = document.getElementById("prevWeekBtn");
const nextWeekBtn = document.getElementById("nextWeekBtn");
const todayBtn = document.getElementById("todayBtn");

const weekTitle = document.getElementById("weekTitle");
const calGrid = document.getElementById("calGrid");

const priorityList = document.getElementById("priorityList");
const newDeadlineBtn = document.getElementById("newDeadlineBtn");
const appMsg = document.getElementById("appMsg");

// Modal DOM
const modalOverlay = document.getElementById("modalOverlay");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalSaveBtn = document.getElementById("modalSaveBtn");
const modalDeleteBtn = document.getElementById("modalDeleteBtn");
const modalTitle = document.getElementById("modalTitle");
const modalMsg = document.getElementById("modalMsg");
const taskTitleInput = document.getElementById("taskTitleInput");
const taskIsDeadline = document.getElementById("taskIsDeadline");
const scheduledFields = document.getElementById("scheduledFields");
const deadlineFields = document.getElementById("deadlineFields");
const taskStartInput = document.getElementById("taskStartInput");
const taskDurInput = document.getElementById("taskDurInput");
const taskDeadlineInput = document.getElementById("taskDeadlineInput");

// state
let mode = "login";
let busy = false;

let username = null;
let siteSecret = null;
let userPassword = null;

/**
 * Store format (saved in GitHub issue):
 * {
 *   version: 2,
 *   tasks: Task[],
 *   priority: string[]  // array of task ids in priority order
 * }
 *
 * Task:
 *  - { id, type:"scheduled", title, startISO, durationMin, updatedAt }
 *  - { id, type:"deadline", title, deadlineISO, updatedAt }
 */
let store = { version: 2, tasks: [], priority: [] };

// week view anchor date (any date inside current week)
let viewDate = new Date();

// modal editing state
let editingTaskId = null;

// ---------- helpers ----------
function setView(isAuthed) {
  authView.classList.toggle("hidden", isAuthed);
  appView.classList.toggle("hidden", !isAuthed);
}
function setMode(m) {
  mode = m;
  const isReg = mode === "register";
  authTitle.textContent = isReg ? "注册" : "登录";
  authBtn.textContent = isReg ? "注册" : "登录";
  userPw2Row.classList.toggle("hidden", !isReg);
  setAuthMsg("");
}
function setAuthMsg(s) { authMsg.textContent = s || ""; }
function setAppMsg(s) { appMsg.textContent = s || ""; }
function setModalMsg(s) { modalMsg.textContent = s || ""; }

function withBusy(fn) {
  return async (...args) => {
    if (busy) return;
    busy = true;
    try { await fn(...args); }
    finally { busy = false; }
  };
}

function validUsername(u) {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(u);
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function pad2(n) { return String(n).padStart(2, "0"); }
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function toLocalDTInputValue(d) {
  // datetime-local expects "YYYY-MM-DDTHH:mm"
  return `${toISODate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fromLocalDTInputValue(s) {
  // "YYYY-MM-DDTHH:mm" -> Date (local)
  const [datePart, timePart] = (s || "").split("T");
  if (!datePart || !timePart) return null;
  const [y,m,dd] = datePart.split("-").map(Number);
  const [hh,mm] = timePart.split(":").map(Number);
  const d = new Date();
  d.setFullYear(y, (m||1)-1, dd||1);
  d.setHours(hh||0, mm||0, 0, 0);
  return d;
}
function minutesSinceStart(d) {
  return d.getHours()*60 + d.getMinutes();
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0 Sun
  const diff = (day - WEEK_START + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function addMinutes(date, n) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + n);
  return d;
}

function deadlineBadge(deadlineISO) {
  if (!deadlineISO) return { text: "No DDL", cls: "badge" };
  const now = new Date();
  const ddl = new Date(deadlineISO);
  const today = new Date(now); today.setHours(0,0,0,0);
  const d0 = new Date(ddl); d0.setHours(0,0,0,0);

  if (d0 < today) return { text: `逾期`, cls: "badge overdue" };
  const diffDays = Math.round((d0 - today) / (1000*60*60*24));
  if (diffDays <= 3) return { text: `临近`, cls: "badge soon" };
  return { text: `DDL`, cls: "badge" };
}

function taskTimeKey(task) {
  if (task.type === "scheduled") return new Date(task.startISO).getTime();
  if (task.type === "deadline") return new Date(task.deadlineISO).getTime();
  return Infinity;
}

// ---------- API ----------
async function api(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function doRegister(u, site, pw) {
  return await api(END_REGISTER, { site_secret: site, username: u, user_password: pw });
}
async function doLogin(u, site, pw) {
  return await api(END_LOGIN, { site_secret: site, username: u, user_password: pw });
}
async function remoteGetStore(u, site, pw) {
  const data = await api(END_GET, { site_secret: site, username: u, user_password: pw });
  return data.todos || []; // legacy name in Worker: "todos"
}
async function remoteSetStore(u, site, pw, value) {
  await api(END_SET, { site_secret: site, username: u, user_password: pw, todos: value });
}

// ---------- store migration ----------
function normalizeStore(raw) {
  // raw could be:
  // 1) old array of todos
  // 2) object {version, tasks, priority}
  // 3) empty
  if (!raw) return { version: 2, tasks: [], priority: [] };

  if (Array.isArray(raw)) {
    // migrate legacy todo array into deadline tasks
    const tasks = raw.map(t => ({
      id: t.id || uid(),
      type: "deadline",
      title: t.title || "Untitled",
      deadlineISO: t.deadline ? `${t.deadline}T00:00` : toLocalDTInputValue(new Date()), // best-effort
      updatedAt: t.updatedAt || Date.now(),
    }));
    const priority = [...tasks].sort((a,b)=>taskTimeKey(a)-taskTimeKey(b)).map(t=>t.id);
    return { version: 2, tasks, priority };
  }

  if (typeof raw === "object" && raw.version === 2 && Array.isArray(raw.tasks) && Array.isArray(raw.priority)) {
    return {
      version: 2,
      tasks: raw.tasks,
      priority: raw.priority,
    };
  }

  // unknown -> reset
  return { version: 2, tasks: [], priority: [] };
}

// ---------- auth ----------
async function enterApp(u, site, pw, fetched) {
  username = u;
  siteSecret = site;
  userPassword = pw;

  store = normalizeStore(fetched);

  // ensure priority contains all tasks (and no extra)
  const ids = new Set(store.tasks.map(t => t.id));
  store.priority = store.priority.filter(id => ids.has(id));
  for (const t of store.tasks) if (!store.priority.includes(t.id)) store.priority.push(t.id);

  helloTitle.textContent = `Hi, ${u}`;
  sessionStorage.setItem(kSess, "1");

  if (rememberUser.checked) localStorage.setItem(kUser, u); else localStorage.removeItem(kUser);
  if (rememberSite.checked) localStorage.setItem(kSite, site); else localStorage.removeItem(kSite);
  if (rememberPw.checked) localStorage.setItem(kPw, pw); else localStorage.removeItem(kPw);

  setView(true);
  renderAll();
}

const handleAuth = withBusy(async () => {
  try {
    const u = (usernameInput.value || "").trim();
    const site = (siteSecretInput.value || "").trim();
    const pw = (userPwInput.value || "").trim();
    const pw2 = (userPw2Input.value || "").trim();

    if (!u || !site || !pw) { setAuthMsg("请填写：用户名 / 站点口令 / 用户密码。"); return; }
    if (!validUsername(u)) { setAuthMsg("用户名只能包含字母数字 _ -，长度 1~32。"); return; }

    if (mode === "register") {
      if (!pw2) { setAuthMsg("请确认用户密码。"); return; }
      if (pw !== pw2) { setAuthMsg("两次输入的用户密码不一致。"); return; }

      setAuthMsg("注册中…");
      await doRegister(u, site, pw);

      setAuthMsg("注册成功，登录中…");
      const data = await doLogin(u, site, pw);
      await enterApp(u, site, pw, data.todos);

      setAuthMsg("");
      userPw2Input.value = "";
      return;
    }

    setAuthMsg("登录中…");
    const data = await doLogin(u, site, pw);
    await enterApp(u, site, pw, data.todos);
    setAuthMsg("");
  } catch (e) {
    setView(false);
    setAuthMsg(String(e.message || e));
  }
});

// ---------- persistence ----------
async function persist() {
  setAppMsg("保存中…");
  await remoteSetStore(username, siteSecret, userPassword, store);
  setAppMsg("已保存 ✅");
  setTimeout(() => setAppMsg(""), 900);
}

const syncFromRemote = withBusy(async () => {
  setAppMsg("同步中…");
  const remote = normalizeStore(await remoteGetStore(username, siteSecret, userPassword));

  // merge by id with updatedAt
  const byId = new Map();
  for (const t of remote.tasks) byId.set(t.id, t);

  for (const t of store.tasks) {
    const r = byId.get(t.id);
    if (!r) byId.set(t.id, t);
    else byId.set(t.id, (r.updatedAt || 0) >= (t.updatedAt || 0) ? r : t);
  }

  store.tasks = Array.from(byId.values());

  // priority: prefer current order, append missing
  const ids = new Set(store.tasks.map(t => t.id));
  const nextP = [];
  for (const id of store.priority) if (ids.has(id)) nextP.push(id);
  for (const t of store.tasks) if (!nextP.includes(t.id)) nextP.push(t.id);
  store.priority = nextP;

  await persist();
  renderAll();
  setAppMsg("同步完成 ✅");
  setTimeout(() => setAppMsg(""), 900);
});

// ---------- calendar rendering ----------
function renderAll() {
  renderCalendar();
  renderPriority();
}

function renderCalendar() {
  const week0 = startOfWeek(viewDate);
  const weekEnd = addDays(week0, 6);
  weekTitle.textContent = `${toISODate(week0)} ~ ${toISODate(weekEnd)} （周日开始）`;

  calGrid.innerHTML = "";

  // header row
  calGrid.appendChild(div("cellH", "")); // top-left empty
  for (let i=0;i<7;i++) {
    const d = addDays(week0, i);
    const name = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
    const h = div("cellH", "");
    const hdr = document.createElement("div");
    hdr.className = "dayHeader";
    hdr.innerHTML = `<div class="d1">${name}</div><div class="d2">${toISODate(d)}</div>`;

    // deadline chips for that day
    const chips = document.createElement("div");
    chips.className = "dayDeadline";
    const dayKey = toISODate(d);
    const deadlines = store.tasks
      .filter(t => t.type === "deadline" && toISODate(new Date(t.deadlineISO)) === dayKey)
      .sort((a,b)=>taskTimeKey(a)-taskTimeKey(b))
      .slice(0, 4); // avoid clutter
    for (const t of deadlines) {
      const c = document.createElement("span");
      c.className = "deadChip";
      c.textContent = t.title.length > 10 ? t.title.slice(0,10)+"…" : t.title;
      c.title = t.title;
      c.onclick = () => openEditTask(t.id);
      chips.appendChild(c);
    }
    hdr.appendChild(chips);

    h.appendChild(hdr);
    calGrid.appendChild(h);
  }

  // time slots
  const totalMin = (END_HOUR - START_HOUR) * 60;
  const rows = Math.floor(totalMin / SLOT_MIN);

  // precompute scheduled tasks in this week
  const weekStartTs = week0.getTime();
  const weekEndTs = addDays(week0, 7).getTime();

  const scheduled = store.tasks.filter(t => t.type === "scheduled").filter(t => {
    const st = new Date(t.startISO).getTime();
    return st >= weekStartTs && st < weekEndTs;
  });

  for (let r=0;r<rows;r++) {
    const tMin = START_HOUR*60 + r*SLOT_MIN;
    const hh = Math.floor(tMin/60);
    const mm = tMin%60;
    calGrid.appendChild(div("timeCell", `${pad2(hh)}:${pad2(mm)}`));

    for (let day=0;day<7;day++) {
      const cell = document.createElement("div");
      cell.className = "slot";
      cell.dataset.day = String(day);
      cell.dataset.tmin = String(tMin);

      cell.onclick = () => {
        const d = addDays(week0, day);
        d.setHours(0,0,0,0);
        const start = addMinutes(d, tMin);
        openCreateScheduled(start);
      };

      // render events that start in this slot
      const dayDate = addDays(week0, day);
      const dayKey = toISODate(dayDate);

      const eventsHere = scheduled.filter(t => {
        const st = new Date(t.startISO);
        return toISODate(st) === dayKey && minutesSinceStart(st) === tMin;
      });

      for (const ev of eventsHere) {
        const st = new Date(ev.startISO);
        const height = Math.max(1, Math.round(ev.durationMin / SLOT_MIN)) * 28 - 6; // 28px per slot
        const e = document.createElement("div");
        e.className = "event";
        e.style.height = `${height}px`;
        e.innerHTML = `<div class="t">${escapeHTML(ev.title)}</div><div class="s">${pad2(st.getHours())}:${pad2(st.getMinutes())} · ${ev.durationMin}m</div>`;
        e.onclick = (evt) => { evt.stopPropagation(); openEditTask(ev.id); };
        cell.appendChild(e);
      }

      calGrid.appendChild(cell);
    }
  }
}

function div(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
}

function escapeHTML(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}

// ---------- priority sidebar ----------
function renderPriority() {
  priorityList.innerHTML = "";
  const byId = new Map(store.tasks.map(t => [t.id, t]));

  // cleanup priority
  store.priority = store.priority.filter(id => byId.has(id));
  for (const t of store.tasks) if (!store.priority.includes(t.id)) store.priority.push(t.id);

  for (let idx=0; idx<store.priority.length; idx++) {
    const id = store.priority[idx];
    const t = byId.get(id);
    if (!t) continue;

    const li = document.createElement("li");
    li.className = "pitem";
    li.draggable = true;
    li.dataset.id = id;

    const badge = (t.type === "deadline")
      ? deadlineBadge(t.deadlineISO)
      : { text: "CAL", cls: "badge" };

    const meta = taskMeta(t);

    li.innerHTML = `
      <div class="pt">
        <div class="name">${escapeHTML(t.title)}</div>
        <span class="${badge.cls}">${badge.text}</span>
      </div>
      <div class="meta">${escapeHTML(meta)}</div>
    `;

    li.onclick = () => openEditTask(id);

    // drag & drop
    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    li.addEventListener("drop", withBusy(async (e) => {
      e.preventDefault();
      const fromId = e.dataTransfer.getData("text/plain");
      const toId = id;
      if (!fromId || fromId === toId) return;
      reorderPriority(fromId, toId);
      renderPriority();
      await persist();
    }));

    priorityList.appendChild(li);
  }
}

function taskMeta(t) {
  if (t.type === "scheduled") {
    const st = new Date(t.startISO);
    return `${toISODate(st)} ${pad2(st.getHours())}:${pad2(st.getMinutes())} · ${t.durationMin}m`;
    }
  if (t.type === "deadline") {
    const dl = new Date(t.deadlineISO);
    return `Deadline: ${toISODate(dl)} ${pad2(dl.getHours())}:${pad2(dl.getMinutes())}`;
  }
  return "";
}

function reorderPriority(fromId, toId) {
  const p = store.priority.slice();
  const fromIdx = p.indexOf(fromId);
  const toIdx = p.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return;
  p.splice(fromIdx, 1);
  p.splice(toIdx, 0, fromId);
  store.priority = p;
}

function insertByTimeDefault(newTask) {
  // default: insert into priority by time order (ascending)
  const ids = store.priority.slice();
  const byId = new Map(store.tasks.map(t => [t.id, t]));

  // if priority empty, just push
  if (ids.length === 0) { ids.push(newTask.id); store.priority = ids; return; }

  const key = taskTimeKey(newTask);
  let inserted = false;
  const out = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!inserted && t && taskTimeKey(t) > key) {
      out.push(newTask.id);
      inserted = true;
    }
    out.push(id);
  }
  if (!inserted) out.push(newTask.id);
  store.priority = out;
}

// ---------- modal ----------
function openModal() {
  modalOverlay.classList.remove("hidden");
  setModalMsg("");
}
function closeModal() {
  modalOverlay.classList.add("hidden");
  editingTaskId = null;
}

function applyModalMode(isDeadline) {
  deadlineFields.classList.toggle("hidden", !isDeadline);
  scheduledFields.classList.toggle("hidden", isDeadline);
}

function openCreateScheduled(startDate) {
  editingTaskId = null;
  modalTitle.textContent = "新建日历任务";
  modalDeleteBtn.classList.add("hidden");

  taskTitleInput.value = "";
  taskIsDeadline.checked = false;
  applyModalMode(false);

  taskStartInput.value = toLocalDTInputValue(startDate);
  taskDurInput.value = "60";
  taskDeadlineInput.value = "";

  openModal();
}

function openCreateDeadline(defaultDay = new Date()) {
  editingTaskId = null;
  modalTitle.textContent = "新建 Deadline 任务";
  modalDeleteBtn.classList.add("hidden");

  taskTitleInput.value = "";
  taskIsDeadline.checked = true;
  applyModalMode(true);

  // default deadline: today 23:59
  const d = new Date(defaultDay);
  d.setHours(23,59,0,0);
  taskDeadlineInput.value = toLocalDTInputValue(d);
  taskStartInput.value = "";
  taskDurInput.value = "60";

  openModal();
}

function openEditTask(id) {
  const t = store.tasks.find(x => x.id === id);
  if (!t) return;

  editingTaskId = id;
  modalTitle.textContent = "编辑任务";
  modalDeleteBtn.classList.remove("hidden");

  taskTitleInput.value = t.title || "";
  const isDeadline = t.type === "deadline";
  taskIsDeadline.checked = isDeadline;
  applyModalMode(isDeadline);

  if (t.type === "scheduled") {
    taskStartInput.value = toLocalDTInputValue(new Date(t.startISO));
    taskDurInput.value = String(t.durationMin || 60);
    taskDeadlineInput.value = "";
  } else {
    taskDeadlineInput.value = toLocalDTInputValue(new Date(t.deadlineISO));
    taskStartInput.value = "";
    taskDurInput.value = "60";
  }

  openModal();
}

taskIsDeadline.addEventListener("change", () => applyModalMode(taskIsDeadline.checked));

modalCloseBtn.onclick = closeModal;
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

modalSaveBtn.addEventListener("click", withBusy(async () => {
  try {
    const title = (taskTitleInput.value || "").trim();
    if (!title) { setModalMsg("请输入任务标题。"); return; }

    const isDeadline = !!taskIsDeadline.checked;

    if (!editingTaskId) {
      // create
      const now = Date.now();
      if (isDeadline) {
        const dl = fromLocalDTInputValue(taskDeadlineInput.value);
        if (!dl) { setModalMsg("请选择 deadline 时间。"); return; }
        const t = {
          id: uid(),
          type: "deadline",
          title,
          deadlineISO: dl.toISOString(),
          updatedAt: now,
        };
        store.tasks.push(t);
        insertByTimeDefault(t);
      } else {
        const st = fromLocalDTInputValue(taskStartInput.value);
        const dur = parseInt(taskDurInput.value || "60", 10);
        if (!st) { setModalMsg("请选择开始时间。"); return; }
        if (!dur || dur < 15) { setModalMsg("时长至少 15 分钟。"); return; }
        const t = {
          id: uid(),
          type: "scheduled",
          title,
          startISO: st.toISOString(),
          durationMin: Math.round(dur / 15) * 15,
          updatedAt: now,
        };
        store.tasks.push(t);
        insertByTimeDefault(t);
      }
    } else {
      // edit
      const idx = store.tasks.findIndex(x => x.id === editingTaskId);
      if (idx < 0) { closeModal(); return; }

      const now = Date.now();
      const old = store.tasks[idx];

      if (isDeadline) {
        const dl = fromLocalDTInputValue(taskDeadlineInput.value);
        if (!dl) { setModalMsg("请选择 deadline 时间。"); return; }
        store.tasks[idx] = {
          id: old.id,
          type: "deadline",
          title,
          deadlineISO: dl.toISOString(),
          updatedAt: now,
        };
      } else {
        const st = fromLocalDTInputValue(taskStartInput.value);
        const dur = parseInt(taskDurInput.value || "60", 10);
        if (!st) { setModalMsg("请选择开始时间。"); return; }
        if (!dur || dur < 15) { setModalMsg("时长至少 15 分钟。"); return; }
        store.tasks[idx] = {
          id: old.id,
          type: "scheduled",
          title,
          startISO: st.toISOString(),
          durationMin: Math.round(dur / 15) * 15,
          updatedAt: now,
        };
      }
      // priority list keeps id; default order unchanged (user may have dragged)
    }

    await persist();
    closeModal();
    renderAll();
  } catch (e) {
    setModalMsg(String(e.message || e));
  }
}));

modalDeleteBtn.addEventListener("click", withBusy(async () => {
  if (!editingTaskId) return;
  const id = editingTaskId;
  store.tasks = store.tasks.filter(t => t.id !== id);
  store.priority = store.priority.filter(x => x !== id);
  await persist();
  closeModal();
  renderAll();
}));

// ---------- week navigation ----------
prevWeekBtn.onclick = () => { viewDate = addDays(viewDate, -7); renderCalendar(); };
nextWeekBtn.onclick = () => { viewDate = addDays(viewDate,  7); renderCalendar(); };
todayBtn.onclick = () => { viewDate = new Date(); renderCalendar(); };

// ---------- UI actions ----------
newDeadlineBtn.onclick = () => openCreateDeadline(viewDate);
syncBtn.addEventListener("click", syncFromRemote);

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(kSess);
  username = null; siteSecret = null; userPassword = null;
  store = { version: 2, tasks: [], priority: [] };
  setView(false);
  setAuthMsg("");
});

// ---------- init ----------
authBtn.addEventListener("click", handleAuth);
toLoginBtn.addEventListener("click", () => setMode("login"));
toRegisterBtn.addEventListener("click", () => setMode("register"));

(function init() {
  setMode("login");
  setView(false);

  const savedUser = localStorage.getItem(kUser);
  const savedSite = localStorage.getItem(kSite);
  const savedPw = localStorage.getItem(kPw);

  if (savedUser) { usernameInput.value = savedUser; rememberUser.checked = true; }
  if (savedSite) { siteSecretInput.value = savedSite; rememberSite.checked = true; }
  if (savedPw) { userPwInput.value = savedPw; rememberPw.checked = true; }

  viewDate = new Date();
})();
