// ================== 改这里：你的 Worker 域名 ==================
const API_BASE = "https://floral-flower-7c16.chen-qiu.workers.dev";
// =============================================================

const END_REGISTER = "/api/auth/register";
const END_LOGIN    = "/api/auth/login";
const END_GET      = "/api/todos/get";
const END_SET      = "/api/todos/set";

// Calendar config（你嫌格子多就调这里）
const WEEK_START = 0;        // 0=Sunday
const START_HOUR = 8;
const END_HOUR   = 20;
const SLOT_MIN   = 60;       // 60分钟一格（更少格子）
const ROW_PX     = 28;       // 每格高度，对应 CSS .slot min-height

// local keys
const kUser = "todo_v7_user";
const kSite = "todo_v7_site";
const kPw   = "todo_v7_pw";
const kSess = "todo_v7_session";

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
 * Store format:
 * { version: 2, tasks: Task[], priority: string[] }
 *
 * Task:
 *  - scheduled: { id, type:"scheduled", title, startISO, durationMin, updatedAt }
 *  - deadline:  { id, type:"deadline",  title, deadlineISO, updatedAt }
 */
let store = { version: 2, tasks: [], priority: [] };
let viewDate = new Date();
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
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function toLocalDTInputValue(d) { return `${toISODate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fromLocalDTInputValue(s) {
  const [datePart, timePart] = (s || "").split("T");
  if (!datePart || !timePart) return null;
  const [y,m,dd] = datePart.split("-").map(Number);
  const [hh,mm] = timePart.split(":").map(Number);
  const d = new Date();
  d.setFullYear(y, (m||1)-1, dd||1);
  d.setHours(hh||0, mm||0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = (day - WEEK_START + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function addMinutes(date, n) { const d = new Date(date); d.setMinutes(d.getMinutes() + n); return d; }
function minutesOfDay(d) { return d.getHours()*60 + d.getMinutes(); }

function escapeHTML(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}

function taskTimeKey(task) {
  if (task.type === "scheduled") return new Date(task.startISO).getTime();
  if (task.type === "deadline") return new Date(task.deadlineISO).getTime();
  return Infinity;
}

function deadlineBadge(deadlineISO) {
  if (!deadlineISO) return { text: "DDL", cls: "badge" };
  const now = new Date();
  const ddl = new Date(deadlineISO);
  const today = new Date(now); today.setHours(0,0,0,0);
  const d0 = new Date(ddl); d0.setHours(0,0,0,0);
  if (d0 < today) return { text: "逾期", cls: "badge overdue" };
  const diffDays = Math.round((d0 - today) / (1000*60*60*24));
  if (diffDays <= 3) return { text: "临近", cls: "badge soon" };
  return { text: "DDL", cls: "badge" };
}

/**
 * ✅ (1) 修复“重新登录任务消失”：
 * Worker/Issue 可能返回 string / ```json ...``` / wrapper 套娃，
 * 这里尽最大努力解析成 object/array。
 */
function parseTodosMaybe(x) {
  if (x == null) return x;
  if (typeof x === "object") return x;
  if (typeof x !== "string") return x;

  let s = x.trim();

  // 去掉 ```json ... ``` / ``` ... ```
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "");
    s = s.replace(/```$/, "");
    s = s.trim();
  }

  // 尝试截取 JSON 对象或数组片段
  const fb = s.indexOf("{"), lb = s.lastIndexOf("}");
  const fbr = s.indexOf("["), lbr = s.lastIndexOf("]");

  if (fb !== -1 && lb !== -1 && lb > fb) {
    const maybe = s.slice(fb, lb + 1);
    try { return JSON.parse(maybe); } catch {}
  }
  if (fbr !== -1 && lbr !== -1 && lbr > fbr) {
    const maybe = s.slice(fbr, lbr + 1);
    try { return JSON.parse(maybe); } catch {}
  }

  try { return JSON.parse(s); } catch {}
  return x;
}

function unwrapTodos(x) {
  let cur = x;
  for (let i = 0; i < 8; i++) {
    cur = parseTodosMaybe(cur);

    if (!cur) break;
    if (Array.isArray(cur)) return cur;

    if (typeof cur === "object") {
      if (cur.version === 2 && Array.isArray(cur.tasks) && Array.isArray(cur.priority)) return cur;
      if (cur.todos !== undefined) { cur = cur.todos; continue; }
      if (cur.data !== undefined) { cur = cur.data; continue; }
      if (cur.payload !== undefined) { cur = cur.payload; continue; }
    }
    break;
  }
  return cur;
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
async function doRegister(u, site, pw) { return await api(END_REGISTER, { site_secret: site, username: u, user_password: pw }); }
async function doLogin(u, site, pw) { return await api(END_LOGIN, { site_secret: site, username: u, user_password: pw }); }

async function remoteGetStore(u, site, pw) {
  const data = await api(END_GET, { site_secret: site, username: u, user_password: pw });
  return unwrapTodos(data.todos || null);
}
async function remoteSetStore(u, site, pw, value) {
  await api(END_SET, { site_secret: site, username: u, user_password: pw, todos: value });
}

// ---------- store normalize ----------
function normalizeStore(raw) {
  raw = unwrapTodos(raw);
  if (!raw) return { version: 2, tasks: [], priority: [] };

  if (Array.isArray(raw)) {
    // migrate legacy array -> deadline tasks
    const tasks = raw.map(t => ({
      id: t.id || uid(),
      type: "deadline",
      title: t.title || "Untitled",
      deadlineISO: t.deadline ? `${t.deadline}T23:59:00.000Z` : new Date().toISOString(),
      updatedAt: t.updatedAt || Date.now(),
    }));
    const priority = [...tasks].sort((a,b)=>taskTimeKey(a)-taskTimeKey(b)).map(t=>t.id);
    return { version: 2, tasks, priority };
  }

  if (typeof raw === "object" && raw.version === 2 && Array.isArray(raw.tasks) && Array.isArray(raw.priority)) {
    return { version: 2, tasks: raw.tasks, priority: raw.priority };
  }

  return { version: 2, tasks: [], priority: [] };
}

function ensurePriorityComplete() {
  const ids = new Set(store.tasks.map(t => t.id));
  store.priority = store.priority.filter(id => ids.has(id));
  for (const t of store.tasks) if (!store.priority.includes(t.id)) store.priority.push(t.id);
}

/**
 * ✅ insert into priority without duplication
 */
function insertByTimeDefault(newTask) {
  store.priority = store.priority.filter(id => id !== newTask.id);

  const key = taskTimeKey(newTask);
  const byId = new Map(store.tasks.map(t => [t.id, t]));

  let inserted = false;
  const out = [];
  for (const id of store.priority) {
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

// ---------- auth ----------
async function enterApp(u, site, pw, fetched) {
  username = u;
  siteSecret = site;
  userPassword = pw;

  store = normalizeStore(fetched);
  ensurePriorityComplete();

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
    } else {
      setAuthMsg("登录中…");
    }

    const data = await doLogin(u, site, pw);
    await enterApp(u, site, pw, data.todos);
    setAuthMsg("");
    userPw2Input.value = "";
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

  // merge tasks by id with updatedAt
  const byId = new Map();
  for (const t of remote.tasks) byId.set(t.id, t);
  for (const t of store.tasks) {
    const r = byId.get(t.id);
    if (!r) byId.set(t.id, t);
    else byId.set(t.id, (r.updatedAt || 0) >= (t.updatedAt || 0) ? r : t);
  }
  store.tasks = Array.from(byId.values());

  ensurePriorityComplete();

  await persist();
  renderAll();

  setAppMsg("同步完成 ✅");
  setTimeout(() => setAppMsg(""), 900);
});

// ---------- render ----------
function renderAll() {
  renderCalendar();
  renderPriority();
}

function renderCalendar() {
  // remove any existing overlays before rebuilding
  calGrid.querySelectorAll(".dayOverlay").forEach(n => n.remove());

  const week0 = startOfWeek(viewDate);
  const weekEnd = addDays(week0, 6);
  weekTitle.textContent = `${toISODate(week0)} ~ ${toISODate(weekEnd)} （周日开始）`;

  calGrid.innerHTML = "";

  // header row
  calGrid.appendChild(cellH("")); // top-left
  for (let i = 0; i < 7; i++) {
    const d = addDays(week0, i);
    const name = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
    const h = cellH("");
    const hdr = document.createElement("div");
    hdr.className = "dayHeader";
    hdr.innerHTML = `<div class="d1">${name}</div><div class="d2">${toISODate(d)}</div>`;

    const chips = document.createElement("div");
    chips.className = "dayDeadline";
    const dayKey = toISODate(d);
    const deadlines = store.tasks
      .filter(t => t.type === "deadline" && toISODate(new Date(t.deadlineISO)) === dayKey)
      .sort((a,b)=>taskTimeKey(a)-taskTimeKey(b))
      .slice(0, 4);
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

  // grid slots
  const totalMin = (END_HOUR - START_HOUR) * 60;
  const rows = Math.floor(totalMin / SLOT_MIN);
  const dayMin0 = START_HOUR * 60;

  for (let r = 0; r < rows; r++) {
    const tMin = dayMin0 + r * SLOT_MIN;
    calGrid.appendChild(timeCell(`${pad2(Math.floor(tMin/60))}:${pad2(tMin%60)}`));

    for (let day = 0; day < 7; day++) {
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
      calGrid.appendChild(cell);
    }
  }

  // overlays need DOM measurements after render
  requestAnimationFrame(() => drawOverlaysAndEvents(week0, rows, dayMin0));
}

function drawOverlaysAndEvents(week0, rows, dayMin0) {
  // clear old overlays
  calGrid.querySelectorAll(".dayOverlay").forEach(n => n.remove());

  const headerCell = calGrid.querySelector(".cellH");
  const headerH = headerCell ? headerCell.getBoundingClientRect().height : 56;

  const gridRect = calGrid.getBoundingClientRect();
  const overlayTop = headerH;
  const overlayHeight = rows * ROW_PX;

  // create overlays aligned to each day column
  const overlays = [];
  for (let day = 0; day < 7; day++) {
    const firstSlot = calGrid.querySelector(`.slot[data-day="${day}"][data-tmin="${dayMin0}"]`);
    if (!firstSlot) continue;

    const r = firstSlot.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "dayOverlay";
    overlay.style.top = `${overlayTop}px`;
    overlay.style.left = `${r.left - gridRect.left}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${overlayHeight}px`;

    calGrid.appendChild(overlay);
    overlays.push({ day, overlay });
  }

  // render scheduled events into each overlay with overlap layout
  const weekStartTs = week0.getTime();
  const weekEndTs = addDays(week0, 7).getTime();

  for (const { day, overlay } of overlays) {
    const dayDate = addDays(week0, day);
    const dayKey = toISODate(dayDate);

    const events = store.tasks
      .filter(t => t.type === "scheduled")
      .map(t => {
        const st = new Date(t.startISO);
        const startMin = minutesOfDay(st);
        const endMin = startMin + (t.durationMin || 60);
        return { task: t, st, startMin, endMin };
      })
      .filter(x => {
        const ts = x.st.getTime();
        return ts >= weekStartTs && ts < weekEndTs && toISODate(x.st) === dayKey;
      })
      .filter(x => x.endMin > dayMin0 && x.startMin < END_HOUR*60)
      .sort((a,b) => (a.startMin - b.startMin) || (a.endMin - b.endMin));

    const laid = layoutDayEvents(events);

    for (const e of laid) {
      const t = e.task;

      // clip to visible range
      const topMin = Math.max(e.startMin, dayMin0);
      const botMin = Math.min(e.endMin, END_HOUR * 60);

      const top = ((topMin - dayMin0) / SLOT_MIN) * ROW_PX + 3;
      const height = Math.max(18, ((botMin - topMin) / SLOT_MIN) * ROW_PX - 6);

      // ✅ (2)(3) 用 left+right 约束，永不溢出；并列任务自动平分填满
      const gap = 6;
      const W = overlay.clientWidth;
      const cols = Math.max(1, e.cols);

      const usable = Math.max(0, W - gap * (cols + 1));
      const colW = usable / cols;

      const left = gap + e.col * (colW + gap);
      const right = gap + (cols - 1 - e.col) * (colW + gap);

      const node = document.createElement("div");
      node.className = "event";
      node.style.top = `${Math.round(top)}px`;
      node.style.height = `${Math.round(height)}px`;
      node.style.left = `${Math.round(left)}px`;
      node.style.right = `${Math.round(right)}px`;
      node.style.width = "auto";

      const st = new Date(t.startISO);
      node.innerHTML = `<div class="t">${escapeHTML(t.title)}</div>
                        <div class="s">${pad2(st.getHours())}:${pad2(st.getMinutes())} · ${(t.durationMin||60)}m</div>`;

      // ✅ Shift+Click: 新建同一开始时间任务
      node.onclick = (evt) => {
        evt.stopPropagation();
        if (evt.shiftKey) openCreateScheduled(new Date(t.startISO));
        else openEditTask(t.id);
      };

      overlay.appendChild(node);
    }
  }

  // overlap layout: greedy columns + union overlap components to compute cols per component
  function layoutDayEvents(events) {
    const n = events.length;
    if (n === 0) return [];

    const parent = Array.from({length:n}, (_,i)=>i);
    const find = (x)=> (parent[x]===x?x:(parent[x]=find(parent[x])));
    const uni = (a,b)=>{ a=find(a); b=find(b); if(a!==b) parent[b]=a; };

    const colEnds = [];
    const colOf = Array(n).fill(0);
    const active = []; // {idx, endMin}

    for (let i=0;i<n;i++) {
      const cur = events[i];

      // remove inactive
      for (let k=active.length-1;k>=0;k--) {
        if (active[k].endMin <= cur.startMin) active.splice(k,1);
      }
      // union overlaps
      for (const a of active) uni(a.idx, i);

      // assign first free column
      let col = 0;
      while (col < colEnds.length && colEnds[col] > cur.startMin) col++;
      if (col === colEnds.length) colEnds.push(cur.endMin);
      else colEnds[col] = cur.endMin;

      colOf[i] = col;
      active.push({ idx: i, endMin: cur.endMin });
    }

    // max cols per overlap component
    const maxCol = new Map();
    for (let i=0;i<n;i++) {
      const root = find(i);
      const c = colOf[i] + 1;
      maxCol.set(root, Math.max(maxCol.get(root)||0, c));
    }

    return events.map((ev,i)=>({ ...ev, col: colOf[i], cols: maxCol.get(find(i)) || 1 }));
  }
}

function renderPriority() {
  ensurePriorityComplete();
  const byId = new Map(store.tasks.map(t => [t.id, t]));
  priorityList.innerHTML = "";

  for (const id of store.priority) {
    const t = byId.get(id);
    if (!t) continue;

    const li = document.createElement("li");
    li.className = "pitem";
    li.draggable = true;
    li.dataset.id = id;

    const badge = (t.type === "deadline") ? deadlineBadge(t.deadlineISO) : { text: "CAL", cls: "badge" };
    li.innerHTML = `
      <div class="pt">
        <div class="name">${escapeHTML(t.title)}</div>
        <span class="${badge.cls}">${badge.text}</span>
      </div>
      <div class="meta">${escapeHTML(taskMeta(t))}</div>
    `;
    li.onclick = () => openEditTask(id);

    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
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

function reorderPriority(fromId, toId) {
  const p = store.priority.slice();
  const fromIdx = p.indexOf(fromId);
  const toIdx = p.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return;
  p.splice(fromIdx, 1);
  p.splice(toIdx, 0, fromId);
  store.priority = p;
}

function taskMeta(t) {
  if (t.type === "scheduled") {
    const st = new Date(t.startISO);
    return `${toISODate(st)} ${pad2(st.getHours())}:${pad2(st.getMinutes())} · ${t.durationMin || 60}m`;
  }
  if (t.type === "deadline") {
    const dl = new Date(t.deadlineISO);
    return `Deadline: ${toISODate(dl)} ${pad2(dl.getHours())}:${pad2(dl.getMinutes())}`;
  }
  return "";
}

function cellH(text) {
  const d = document.createElement("div");
  d.className = "cellH";
  d.textContent = text;
  return d;
}
function timeCell(text) {
  const d = document.createElement("div");
  d.className = "timeCell";
  d.textContent = text;
  return d;
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
  taskDurInput.value = "120";
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
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });

modalSaveBtn.addEventListener("click", withBusy(async () => {
  try {
    const title = (taskTitleInput.value || "").trim();
    if (!title) { setModalMsg("请输入任务标题。"); return; }

    const isDeadline = !!taskIsDeadline.checked;
    const now = Date.now();

    if (!editingTaskId) {
      if (isDeadline) {
        const dl = fromLocalDTInputValue(taskDeadlineInput.value);
        if (!dl) { setModalMsg("请选择 deadline 时间。"); return; }
        const t = { id: uid(), type: "deadline", title, deadlineISO: dl.toISOString(), updatedAt: now };
        store.tasks.push(t);
        insertByTimeDefault(t);
      } else {
        const st = fromLocalDTInputValue(taskStartInput.value);
        const dur = parseInt(taskDurInput.value || "60", 10);
        if (!st) { setModalMsg("请选择开始时间。"); return; }
        if (!dur || dur < 15) { setModalMsg("时长至少 15 分钟。"); return; }
        const t = { id: uid(), type: "scheduled", title, startISO: st.toISOString(), durationMin: Math.round(dur/15)*15, updatedAt: now };
        store.tasks.push(t);
        insertByTimeDefault(t);
      }
    } else {
      const idx = store.tasks.findIndex(x => x.id === editingTaskId);
      if (idx < 0) { closeModal(); return; }
      const old = store.tasks[idx];

      if (isDeadline) {
        const dl = fromLocalDTInputValue(taskDeadlineInput.value);
        if (!dl) { setModalMsg("请选择 deadline 时间。"); return; }
        store.tasks[idx] = { id: old.id, type: "deadline", title, deadlineISO: dl.toISOString(), updatedAt: now };
      } else {
        const st = fromLocalDTInputValue(taskStartInput.value);
        const dur = parseInt(taskDurInput.value || "60", 10);
        if (!st) { setModalMsg("请选择开始时间。"); return; }
        if (!dur || dur < 15) { setModalMsg("时长至少 15 分钟。"); return; }
        store.tasks[idx] = { id: old.id, type: "scheduled", title, startISO: st.toISOString(), durationMin: Math.round(dur/15)*15, updatedAt: now };
      }
    }

    ensurePriorityComplete();
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

// ---------- navigation ----------
prevWeekBtn.onclick = () => { viewDate = addDays(viewDate, -7); renderCalendar(); };
nextWeekBtn.onclick = () => { viewDate = addDays(viewDate,  7); renderCalendar(); };
todayBtn.onclick = () => { viewDate = new Date(); renderCalendar(); };

// ---------- sidebar actions ----------
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
  modalOverlay.classList.add("hidden");

  const savedUser = localStorage.getItem(kUser);
  const savedSite = localStorage.getItem(kSite);
  const savedPw = localStorage.getItem(kPw);

  if (savedUser) { usernameInput.value = savedUser; rememberUser.checked = true; }
  if (savedSite) { siteSecretInput.value = savedSite; rememberSite.checked = true; }
  if (savedPw) { userPwInput.value = savedPw; rememberPw.checked = true; }

  viewDate = new Date();

  // keep overlays aligned on resize
  window.addEventListener("resize", () => {
    if (!appView.classList.contains("hidden")) renderCalendar();
  });
})();
