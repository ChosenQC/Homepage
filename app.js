// Calendar config
const WEEK_START = 0;        // 0=Sunday

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
function setAppMsg(s) {
  appMsg.textContent = s || "";
  appMsg.classList.toggle("is-error", /失败|无法|异常|无效|重试|Failed|Error/.test(s || ""));
}
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
  if (!deadlineISO) return { text: "截止", cls: "badge" };
  const now = new Date();
  const ddl = new Date(deadlineISO);
  const today = new Date(now); today.setHours(0,0,0,0);
  const d0 = new Date(ddl); d0.setHours(0,0,0,0);
  if (d0 < today) return { text: "逾期", cls: "badge overdue" };
  const diffDays = Math.round((d0 - today) / (1000*60*60*24));
  if (diffDays <= 3) return { text: "临近", cls: "badge soon" };
  return { text: "截止", cls: "badge" };
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
    setAppMsg("已保存");
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
  setAppMsg("已同步");
}
const syncFromRemote = withBusy(loadRemote);

// ---------- render ----------
function renderAll() {
  renderCalendar();
  renderPriority();
}

function timeLabel(date) { return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`; }
function durationLabel(minutes) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? `${hours} 小时` : "", rest ? `${rest} 分钟` : ""].filter(Boolean).join(" ");
}
function completionControl(task) {
  const label = document.createElement("label");
  label.className = "completion-control";
  label.title = task.completed ? "标记为未完成" : "标记为已完成";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = !!task.completed;
  checkbox.setAttribute("aria-label", `${task.title}：${task.completed ? "已完成，取消勾选可恢复" : "标记完成"}`);
  checkbox.addEventListener("change", () => {
    if (busy) { checkbox.checked = !!task.completed; return; }
    const complete = checkbox.checked;
    withBusy(async () => {
      checkbox.disabled = true;
      task.completed = complete;
      task.updatedAt = Date.now();
      await persist();
      renderAll();
      const sameTask = [...document.querySelectorAll(".completion-control input")].find(input => input.dataset.taskId === task.id);
      sameTask?.focus({ preventScroll: true });
    })();
  });
  checkbox.dataset.taskId = task.id;
  label.appendChild(checkbox);
  return label;
}
function defaultStart(date) {
  const start = new Date(date);
  start.setHours(9, 0, 0, 0);
  const now = new Date();
  if (toISODate(start) === toISODate(now)) start.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
  return start;
}
function renderCalendar() {
  const week0 = startOfWeek(viewDate), weekEnd = addDays(week0, 6);
  const today = toISODate(new Date());
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const shortDate = d => `${d.getMonth() + 1}月${d.getDate()}日`;
  weekTitle.textContent = `${shortDate(week0)} — ${shortDate(weekEnd)}`;
  document.getElementById("monthTitle").textContent = `${viewDate.getFullYear()} · WEEKLY PLANNER`;
  document.getElementById("monthHeading").textContent = `${viewDate.getMonth() + 1}月`;
  const weekTasks = store.tasks.filter(t => {
    const date = new Date(t.type === "scheduled" ? t.startISO : t.deadlineISO);
    return date >= week0 && date < addDays(week0, 7);
  });
  const completedCount = weekTasks.filter(task => task.completed).length;
  document.getElementById("weekCount").textContent = `${weekTasks.length} 项安排${completedCount ? ` · ${completedCount} 已完成` : ""}`;
  calGrid.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const date = addDays(week0, i), dateKey = toISODate(date), isToday = dateKey === today;
    const dayTasks = weekTasks.filter(t => toISODate(new Date(t.type === "scheduled" ? t.startISO : t.deadlineISO)) === dateKey).sort((a,b) => taskTimeKey(a) - taskTimeKey(b));
    const row = document.createElement("section");
    row.className = `day-row${isToday ? " is-today" : ""}${dayTasks.length ? "" : " is-empty"}`;
    row.setAttribute("aria-label", `${shortDate(date)} ${dayNames[i]}`);
    if (isToday) row.setAttribute("aria-current", "date");
    const label = document.createElement("div");
    label.className = "day-label";
    label.innerHTML = `<div class="weekday">${dayNames[i]}${isToday ? '<span class="today-label">今天</span>' : ""}</div><div class="day-number">${pad2(date.getDate())}<span class="day-month">${date.getMonth()+1}月</span></div>`;
    const content = document.createElement("div");
    content.className = "day-content";
    if (!dayTasks.length) {
      const empty = document.createElement("span");
      empty.className = "empty-day";
      empty.textContent = "暂无安排";
      content.appendChild(empty);
    }
    for (const task of dayTasks) {
      const deadline = task.type === "deadline";
      const start = new Date(deadline ? task.deadlineISO : task.startISO);
      const end = addMinutes(start, task.durationMin || 60);
      const card = document.createElement("article");
      card.className = `task-card${deadline ? " deadline" : ""}${deadline && !task.completed && start < new Date() ? " overdue" : ""}${task.completed ? " is-complete" : ""}`;
      const details = document.createElement("button");
      details.type = "button";
      details.className = "task-details";
      const time = deadline ? `截止 · ${timeLabel(start)}` : `${timeLabel(start)} — ${timeLabel(end)}${toISODate(end) !== toISODate(start) ? ' +' + Math.round((new Date(toISODate(end)) - new Date(toISODate(start))) / 86400000) + '天' : ''}`;
      details.innerHTML = `<span class="task-time">${deadline ? '<svg aria-hidden="true"><use href="#i-flag"/></svg>' : ''}${escapeHTML(time)}${task.completed ? '<span class="completed-label">已完成</span>' : deadline ? '' : `<span class="task-duration">${durationLabel(task.durationMin || 60)}</span>`}</span><span class="task-name">${escapeHTML(task.title)}</span>`;
      details.setAttribute("aria-label", `${task.title}，${time}${task.completed ? "，已完成" : ""}，编辑任务`);
      details.onclick = () => openEditTask(task.id);
      card.append(completionControl(task), details);
      content.appendChild(card);
    }
    const add = document.createElement("button");
    add.className = "add-day";
    add.type = "button";
    add.title = `${shortDate(date)}添加任务`;
    add.setAttribute("aria-label", add.title);
    add.innerHTML = '<svg aria-hidden="true"><use href="#i-plus"/></svg>';
    add.onclick = () => openCreateScheduled(defaultStart(date));
    row.append(label, content, add);
    calGrid.appendChild(row);
  }
}

function renderPriority() {
  ensurePriorityComplete();
  const byId = new Map(store.tasks.map(t => [t.id, t]));
  priorityList.innerHTML = "";
  document.getElementById("priorityCount").textContent = store.tasks.length;
  if (!store.tasks.length) {
    priorityList.innerHTML = '<li class="priority-empty"><span class="empty-icon"><svg aria-hidden="true"><use href="#i-flag"/></svg></span>还没有任务</li>';
  }

  for (const id of store.priority) {
    const t = byId.get(id);
    if (!t) continue;

    const li = document.createElement("li");
    li.className = `pitem${t.completed ? " is-complete" : ""}`;
    li.draggable = true;
    li.dataset.id = id;

    const badge = t.completed ? { text: "已完成", cls: "badge completed-badge" } : (t.type === "deadline") ? deadlineBadge(t.deadlineISO) : { text: "日程", cls: "badge" };
    li.innerHTML = `<span class="drag-handle" aria-hidden="true">⠿</span><button type="button" class="priority-task"><span class="pt"><span class="name">${escapeHTML(t.title)}</span><span class="${badge.cls}">${badge.text}</span></span><span class="meta">${escapeHTML(taskMeta(t))}</span></button>`;
    li.querySelector("button").onclick = () => openEditTask(id);
    li.querySelector(".drag-handle").after(completionControl(t));
    const order = document.createElement("span");
    order.className = "priority-order";
    for (const [step, symbol, label] of [[-1, "↑", "提高优先级"], [1, "↓", "降低优先级"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = symbol;
      button.title = label;
      button.setAttribute("aria-label", `${taskTitleForLabel(t)}：${label}`);
      const index = store.priority.indexOf(id);
      button.disabled = index + step < 0 || index + step >= store.priority.length;
      button.onclick = withBusy(async () => {
        const currentIndex = store.priority.indexOf(id), targetIndex = currentIndex + step;
        if (targetIndex < 0 || targetIndex >= store.priority.length) return;
        [store.priority[currentIndex], store.priority[targetIndex]] = [store.priority[targetIndex], store.priority[currentIndex]];
        await persist();
        renderPriority();
      });
      order.appendChild(button);
    }
    li.appendChild(order);
    li.title = "拖动调整优先级";
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragstart", (e) => {
      li.classList.add("dragging");
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
  const date = new Date(t.type === "scheduled" ? t.startISO : t.deadlineISO);
  return `${date.getMonth()+1}月${date.getDate()}日 · ${timeLabel(date)}`;
}
function taskTitleForLabel(task) { return task.title || "任务"; }

// ---------- modal ----------
let modalReturnFocus;
function openModal() {
  modalReturnFocus = document.activeElement;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setModalMsg("");
  taskTitleInput.focus();
}
function closeModal() {
  modalOverlay.classList.add("hidden");
  editingTaskId = null;
  document.body.style.overflow = "";
  modalReturnFocus?.focus();
}
function applyModalMode(isDeadline) {
  deadlineFields.classList.toggle("hidden", !isDeadline);
  scheduledFields.classList.toggle("hidden", isDeadline);
}

function openCreateScheduled(startDate) {
  if (!loaded) { setAppMsg("请先同步云端任务，再新建任务。"); return; }
  editingTaskId = null;
  modalTitle.textContent = "新建任务";
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
  if (!loaded) { setAppMsg("请先同步云端任务，再新建任务。"); return; }
  editingTaskId = null;
  modalTitle.textContent = "添加截止事项";
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
modalOverlay.addEventListener("keydown", event => {
  if (event.key === "Escape") { closeModal(); return; }
  if (event.key !== "Tab") return;
  const fields = [...modalOverlay.querySelectorAll("button, input")].filter(el => el.getClientRects().length && !el.disabled);
  const first = fields[0], last = fields.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
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
        if (!dl) { setModalMsg("请选择截止时间。"); return; }
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
        if (!dl) { setModalMsg("请选择截止时间。"); return; }
        store.tasks[idx] = { id: old.id, completed: !!old.completed, type: "deadline", title, deadlineISO: dl.toISOString(), updatedAt: now };
      } else {
        const st = fromLocalDTInputValue(taskStartInput.value);
        const dur = parseInt(taskDurInput.value || "60", 10);
        if (!st) { setModalMsg("请选择开始时间。"); return; }
        if (!dur || dur < 15) { setModalMsg("时长至少 15 分钟。"); return; }
        store.tasks[idx] = { id: old.id, completed: !!old.completed, type: "scheduled", title, startISO: st.toISOString(), durationMin: Math.round(dur/15)*15, updatedAt: now };
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
document.getElementById("newTaskBtn").onclick = () => {
  const week0 = startOfWeek(viewDate), now = new Date();
  openCreateScheduled(defaultStart(now >= week0 && now < addDays(week0, 7) ? now : week0));
};
syncBtn.addEventListener("click", syncFromRemote);

document.getElementById("copyLinkBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    setAppMsg("链接已复制");
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
  const refresh = () => {
    if (calendarKey && document.visibilityState === "visible" && modalOverlay.classList.contains("hidden")) syncFromRemote();
  };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  setInterval(refresh, 60000);
})();
