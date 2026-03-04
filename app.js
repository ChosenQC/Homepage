// ================== 你只需要改这里 ==================
const API_BASE = "https://floral-flower-7c16.chen-qiu.workers.dev"; 


// Worker endpoints
const END_GET = "/api/todos/get";
const END_SET = "/api/todos/set";

// local/session keys
const sessionUserKey = "todo_v3_session_user";
const savedPwKey = (u) => `todo_v3_saved_pw_${u}`;

// DOM
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");

const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const rememberPw = document.getElementById("rememberPw");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");

const helloTitle = document.getElementById("helloTitle");
const logoutBtn = document.getElementById("logoutBtn");
const syncBtn = document.getElementById("syncBtn");

const newTodoInput = document.getElementById("newTodoInput");
const newDeadlineInput = document.getElementById("newDeadlineInput");
const addBtn = document.getElementById("addBtn");
const todoList = document.getElementById("todoList");
const appMsg = document.getElementById("appMsg");

// state
let currentUser = null;
let siteSecret = null;
let todos = [];
let busy = false;

// ------------------ helpers ------------------
function setView(isAuthed) {
  loginView.classList.toggle("hidden", isAuthed);
  appView.classList.toggle("hidden", !isAuthed);
}

function showLoginMsg(s) { loginMsg.textContent = s || ""; }
function showAppMsg(s) { appMsg.textContent = s || ""; }

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function compareISODate(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function withBusy(fn) {
  return async (...args) => {
    if (busy) return;
    busy = true;
    try { await fn(...args); }
    finally { busy = false; }
  };
}

// ------------------ API ------------------
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

async function remoteGetTodos(username, password) {
  const data = await api(END_GET, { username, password });
  return data.todos || [];
}

async function remoteSetTodos(username, password, list) {
  await api(END_SET, { username, password, todos: list });
}

// ------------------ render ------------------
function deadlineBadge(deadline) {
  if (!deadline) return null;

  const t = todayISO();
  if (deadline < t) return { text: `逾期 ${deadline}`, cls: "badge overdue" };

  const dt = new Date(deadline + "T00:00:00");
  const now = new Date(t + "T00:00:00");
  const diffDays = Math.round((dt - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 3) return { text: `临近 ${deadline}`, cls: "badge soon" };
  return { text: `DDL ${deadline}`, cls: "badge" };
}

function render() {
  todoList.innerHTML = "";

  const sorted = [...todos].sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    const cd = compareISODate(a.deadline || "", b.deadline || "");
    if (cd !== 0) return cd;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  for (const t of sorted) {
    const li = document.createElement("li");
    li.className = "item" + (t.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!t.done;
    checkbox.addEventListener("change", withBusy(async () => {
      t.done = checkbox.checked;
      t.updatedAt = Date.now();
      await persist();
      render();
    }));

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = t.title;

    title.addEventListener("click", () => {
      title.setAttribute("contenteditable", "true");
      title.focus();
    });

    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); title.blur(); }
      if (e.key === "Escape") { e.preventDefault(); title.textContent = t.title; title.blur(); }
    });

    title.addEventListener("blur", withBusy(async () => {
      title.removeAttribute("contenteditable");
      const newText = (title.textContent || "").trim();
      if (!newText) { title.textContent = t.title; return; }
      if (newText !== t.title) {
        t.title = newText;
        t.updatedAt = Date.now();
        await persist();
        render();
      }
    }));

    const deadline = document.createElement("input");
    deadline.type = "date";
    deadline.value = t.deadline || "";
    deadline.addEventListener("change", withBusy(async () => {
      t.deadline = deadline.value || "";
      t.updatedAt = Date.now();
      await persist();
      render();
    }));

    const badgeInfo = deadlineBadge(t.deadline);
    const badge = document.createElement("span");
    badge.className = badgeInfo ? badgeInfo.cls : "badge";
    badge.textContent = badgeInfo ? badgeInfo.text : "无截止日期";

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "删除";
    del.addEventListener("click", withBusy(async () => {
      todos = todos.filter(x => x.id !== t.id);
      await persist();
      render();
    }));

    li.appendChild(checkbox);
    li.appendChild(title);
    li.appendChild(deadline);
    li.appendChild(badge);
    li.appendChild(del);
    todoList.appendChild(li);
  }
}

// ------------------ sync/persist ------------------
async function persist() {
  showAppMsg("保存中…");
  await remoteSetTodos(currentUser, siteSecret, todos);
  showAppMsg("已保存 ✅");
  setTimeout(() => showAppMsg(""), 900);
}

const syncFromRemote = withBusy(async () => {
  showAppMsg("同步中…");
  const remote = await remoteGetTodos(currentUser, siteSecret);

  const byId = new Map();
  for (const t of remote) byId.set(t.id, t);

  for (const t of todos) {
    const r = byId.get(t.id);
    if (!r) byId.set(t.id, t);
    else byId.set(t.id, (r.updatedAt || 0) >= (t.updatedAt || 0) ? r : t);
  }

  todos = Array.from(byId.values());
  await remoteSetTodos(currentUser, siteSecret, todos);

  render();
  showAppMsg("同步完成 ✅");
  setTimeout(() => showAppMsg(""), 900);
});

// ------------------ login/logout ------------------
async function loginAs(u, pw) {
  // ✅ 关键修复：先验证口令是否能从 Worker 拉到数据；成功后才进入 appView
  const fetchedTodos = await remoteGetTodos(u, pw);

  currentUser = u;
  siteSecret = pw;
  todos = fetchedTodos;

  sessionStorage.setItem(sessionUserKey, u);
  if (rememberPw && rememberPw.checked) {
    localStorage.setItem(savedPwKey(u), pw);
  } else {
    localStorage.removeItem(savedPwKey(u));
  }

  helloTitle.textContent = `Hi, ${u}`;
  setView(true);
  render();
}

loginBtn.addEventListener("click", withBusy(async () => {
  try {
    const u = (usernameInput.value || "").trim();
    const pw = (passwordInput.value || "").trim();
    if (!u || !pw) { showLoginMsg("请输入用户名和站点口令。"); return; }

    showLoginMsg("登录中…");
    await loginAs(u, pw);

    showLoginMsg("");
    passwordInput.value = "";
  } catch (e) {
    // ✅ 关键修复：失败时确保回到登录界面
    setView(false);
    showLoginMsg(String(e.message || e));
  }
}));

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(sessionUserKey);
  currentUser = null;
  siteSecret = null;
  todos = [];
  setView(false);
});

syncBtn.addEventListener("click", syncFromRemote);

// 自动登录（同浏览器）
(async function tryAutoLogin() {
  setView(false);
  const u = sessionStorage.getItem(sessionUserKey);
  if (!u) return;

  const saved = localStorage.getItem(savedPwKey(u));
  if (!saved) return;

  usernameInput.value = u;
  if (rememberPw) rememberPw.checked = true;

  try {
    showLoginMsg("恢复会话…");
    await loginAs(u, saved);
    showLoginMsg("");
  } catch (e) {
    localStorage.removeItem(savedPwKey(u));
    sessionStorage.removeItem(sessionUserKey);
    showLoginMsg("自动登录失败：口令可能不对或后端出错。");
    setView(false);
  }
})();

// ------------------ CRUD: add ------------------
const addTodo = withBusy(async () => {
  const text = (newTodoInput.value || "").trim();
  const ddl = (newDeadlineInput.value || "").trim();
  if (!text) return;

  todos.push({
    id: uid(),
    title: text,
    done: false,
    deadline: ddl,
    updatedAt: Date.now(),
  });

  newTodoInput.value = "";
  newDeadlineInput.value = "";

  await persist();
  render();
});

addBtn.addEventListener("click", addTodo);
newTodoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTodo();
});
