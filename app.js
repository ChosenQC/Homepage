// Calendar config
const WEEK_START = 0;        // 0=Sunday
const START_HOUR = 8;
const END_HOUR   = 20;
const SLOT_MIN   = 60;       // 60分钟一格
const ROW_PX     = 28;

const API_BASE = "https://floral-flower-7c16.chen-qiu.workers.dev";
const LINK_KEY = "todo_calendar_link_v1";
let calendarKey;
let revision = null;
let lastSaved = { version: 2, tasks: [], priority: [] };
let loaded = false;

// DOM app
const appView = document.getElementById("appView");
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
let busy = false;

let store = { version: 2, tasks: [], priority: [] };
let viewDate = new Date();
let editingTaskId = null;

// ---------- helpers ----------
function setAppMsg(s) { appMsg.textContent = s || ""; }
function setModalMsg(s) { modalMsg.textContent = s || ""; }

function withBusy(fn) {
  return async (...args) => {
    if (busy) return;
    busy = true;
    try { await fn(...args); }
    catch (error) {
      const message = String(error.message || error);
      setAppMsg(message);
      if (!modalOverlay.classList.contains("hidden")) setModalMsg(message);
    }
    finally { busy = false; }
  };
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

// ---- robust parse/unwarp for issue body / wrappers ----
function parseTodosMaybe(x) {
  if (x == null) return x;
  if (typeof x === "object") return x;
  if (typeof x !== "string") return x;

  let s = x.trim();

  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "");
    s = s.replace(/```$/, "");
    s = s.trim();
  }

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
  for (let i = 0; i < 10; i++) {
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
async function sharedApi(action, payload = {}) {
  const res = await fetch(`${API_BASE}/api/shared/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: calendarKey, ...payload }),
    signal: AbortSignal.timeout(20000),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error("云端响应异常，请稍后重试。"); }
  if (!res.ok) throw new Error(res.status === 409 ? "其他设备已更新任务，请先同步，再重新保存。" : data.error || `HTTP ${res.status}`);
  return data;
}

// ---------- store normalize ----------
function normalizeStore(raw) {
  raw = unwrapTodos(raw);
  if (!raw) return { version: 2, tasks: [], priority: [] };

  if (Array.isArray(raw)) {
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

// ---------- cloud persistence ----------
async function persist() {
  if (!loaded) throw new Error("尚未从云端加载，请先点击同步。");
  setAppMsg("保存中…");
  try {
    const result = await sharedApi("set", { todos: store, revision });
    revision = result.revision;
    lastSaved = structuredClone(store);
    setAppMsg("已保存到云端");
  } catch (error) {
    store = structuredClone(lastSaved);
    renderAll();
    throw error;
  }
}
async function loadRemote() {
  setAppMsg("同步中…");
  const result = await sharedApi("get");
  store = normalizeStore(result.todos);
  ensurePriorityComplete();
  revision = result.revision;
  lastSaved = structuredClone(store);
  loaded = true;
  renderAll();
  setAppMsg("已同步到最新任务");
}
const syncFromRemote = withBusy(loadRemote);

// ---------- render ----------
function renderAll() {
  renderCalendar();
  renderPriority();
}

function renderCalendar() {
  calGrid.querySelectorAll(".dayOverlay").forEach(n => n.remove());

  const week0 = startOfWeek(viewDate);
  const weekEnd = addDays(week0, 6);
  weekTitle.textContent = `${toISODate(week0)} ~ ${toISODate(weekEnd)} （周日开始）`;

  calGrid.innerHTML = "";

  calGrid.appendChild(cellH(""));
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

  requestAnimationFrame(() => drawOverlaysAndEvents(week0, rows, dayMin0));
}

function drawOverlaysAndEvents(week0, rows, dayMin0) {
  calGrid.querySelectorAll(".dayOverlay").forEach(n => n.remove());

  const headerCell = calGrid.querySelector(".cellH");
  const headerH = headerCell ? headerCell.getBoundingClientRect().height : 56;

  const gridRect = calGrid.getBoundingClientRect();
  const overlayTop = headerH;
  const overlayHeight = rows * ROW_PX;

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

      const topMin = Math.max(e.startMin, dayMin0);
      const botMin = Math.min(e.endMin, END_HOUR * 60);

      const top = ((topMin - dayMin0) / SLOT_MIN) * ROW_PX + 3;
      const height = Math.max(18, ((botMin - topMin) / SLOT_MIN) * ROW_PX - 6);

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

      node.onclick = (evt) => {
        evt.stopPropagation();
        if (evt.shiftKey) openCreateScheduled(new Date(t.startISO));
        else openEditTask(t.id);
      };

      overlay.appendChild(node);
    }
  }

  function layoutDayEvents(events) {
    const n = events.length;
    if (n === 0) return [];

    const parent = Array.from({length:n}, (_,i)=>i);
    const find = (x)=> (parent[x]===x?x:(parent[x]=find(parent[x])));
    const uni = (a,b)=>{ a=find(a); b=find(b); if(a!==b) parent[b]=a; };

    const colEnds = [];
    const colOf = Array(n).fill(0);
    const active = [];

    for (let i=0;i<n;i++) {
      const cur = events[i];

      for (let k=active.length-1;k>=0;k--) {
        if (active[k].endMin <= cur.startMin) active.splice(k,1);
      }
      for (const a of active) uni(a.idx, i);

      let col = 0;
      while (col < colEnds.length && colEnds[col] > cur.startMin) col++;
      if (col === colEnds.length) colEnds.push(cur.endMin);
      else colEnds[col] = cur.endMin;

      colOf[i] = col;
      active.push({ idx: i, endMin: cur.endMin });
    }

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
  if (!loaded) { setAppMsg("请先同步云端任务，再新建任务。"); return; }
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
  if (!loaded) { setAppMsg("请先同步云端任务，再新建任务。"); return; }
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

document.getElementById("copyLinkBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    setAppMsg("同步链接已复制，请在手机或电脑上打开；仅分享给可信的人。");
  } catch {
    setAppMsg("请复制浏览器地址栏中的完整链接（包含 # 后面的内容）。");
  }
};

// ---------- init ----------
(async function init() {
  modalOverlay.classList.add("hidden");
  try {
    const hash = new URLSearchParams(location.hash.slice(1));
    let key = hash.get("calendar");
    if (key && !/^[a-f0-9]{64}$/.test(key)) throw new Error("同步链接无效，请检查完整地址。");
    if (!key) {
      try { key = localStorage.getItem(LINK_KEY); } catch {}
      if (!/^[a-f0-9]{64}$/.test(key || "")) key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    }
    calendarKey = key;
    history.replaceState(null, "", `${location.pathname}${location.search}#calendar=${key}`);
    try { localStorage.setItem(LINK_KEY, key); } catch {}
    renderAll();
    await syncFromRemote();
  } catch (error) {
    setAppMsg(String(error.message || error));
  }
  window.addEventListener("resize", renderCalendar);
  const refresh = () => {
    if (calendarKey && document.visibilityState === "visible" && modalOverlay.classList.contains("hidden")) syncFromRemote();
  };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  setInterval(refresh, 60000);
})();
