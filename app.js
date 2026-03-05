// ================== 你只需要改这里 ==================
const API_BASE = "https://floral-flower-7c16.chen-qiu.workers.dev";
// ====================================================

const END_REGISTER = "/api/auth/register";
const END_LOGIN    = "/api/auth/login";
const END_GET      = "/api/todos/get";
const END_SET      = "/api/todos/set";

// local keys
const kUser = "todo_v4_user";
const kSite = "todo_v4_site";
const kPw   = "todo_v4_pw";
const kSess = "todo_v4_session"; // session marker

// DOM (auth)
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

// DOM (app)
const appView = document.getElementById("appView");
const helloTitle = document.getElementById("helloTitle");
const logoutBtn = document.getElementById("logoutBtn");
const syncBtn = document.getElementById("syncBtn");

const newTodoInput = document.getElementById("newTodoInput");
const newDeadlineInput = document.getElementById("newDeadlineInput");
const addBtn = document.getElementById("addBtn");
const todoList = document.getElementById("todoList");
const appMsg = document.getElementById("appMsg");

// state
let mode = "login"; // "login" | "register"
let busy = false;

let username = null;
let siteSecret = null;
let userPassword = null;
let todos = [];

// ---------- UI helpers ----------
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

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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
function validUsername(u) {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(u);
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
  return await api(END_REGISTER, {
    site_secret: site,
    username: u,
    user_password: pw,
  });
}

async function doLogin(u, site, pw) {
  // 后端 login 会返回 todos（我们 Worker 代码就是这么写的）
  return await api(END_LOGIN, {
    site_secret: site,
    username: u,
    user_password: pw,
  });
}

async function remoteGetTodos(u, site, pw) {
  const data = await api(END_GET, {
    site_secret: site,
    username: u,
    user_password: pw,
  });
  return data.todos || [];
}

async function remoteSetTodos(u, site, pw, list) {
  await api(END_SET, {
    site_secret: site,
    username: u,
    user_password: pw,
    todos: list,
  });
}

// ---------- render ----------
function deadlineBadge(deadline) {
  if (!deadline) return { text: "无截止日期", cls: "badge" };
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
    badge.className = badgeInfo.cls;
    badge.textContent = badgeInfo.text;

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

// ---------- persist/sync ----------
async function persist() {
  setAppMsg("保存中…");
  await remoteSetTodos(username, siteSecret, userPassword, todos);
  setAppMsg("已保存 ✅");
  setTimeout(() => setAppMsg(""), 900);
}

const syncFromRemote = withBusy(async () => {
  setAppMsg("同步中…");
  const remote = await remoteGetTodos(username, siteSecret, userPassword);

  // 合并：id 相同取 updatedAt 新的
  const byId = new Map();
  for (const t of remote) byId.set(t.id, t);

  for (const t of todos) {
    const r = byId.get(t.id);
    if (!r) byId.set(t.id, t);
    else byId.set(t.id, (r.updatedAt || 0) >= (t.updatedAt || 0) ? r : t);
  }

  todos = Array.from(byId.values());
  await remoteSetTodos(username, siteSecret, userPassword, todos);

  render();
  setAppMsg("同步完成 ✅");
  setTimeout(() => setAppMsg(""), 900);
});

// ---------- auth flow ----------
async function enterApp(u, site, pw, fetchedTodos) {
  username = u;
  siteSecret = site;
  userPassword = pw;
  todos = fetchedTodos || [];

  helloTitle.textContent = `Hi, ${u}`;
  sessionStorage.setItem(kSess, "1");

  // remember options
  if (rememberUser.checked) localStorage.setItem(kUser, u);
  else localStorage.removeItem(kUser);

  if (rememberSite.checked) localStorage.setItem(kSite, site);
  else localStorage.removeItem(kSite);

  if (rememberPw.checked) localStorage.setItem(kPw, pw);
  else localStorage.removeItem(kPw);

  setView(true);
  render();
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

      // 注册成功后直接登录并进入
      setAuthMsg("注册成功，登录中…");
      const data = await doLogin(u, site, pw);
      await enterApp(u, site, pw, data.todos || []);
      setAuthMsg("");
      userPw2Input.value = "";
      return;
    }

    // login
    setAuthMsg("登录中…");
    const data = await doLogin(u, site, pw);
    await enterApp(u, site, pw, data.todos || []);
    setAuthMsg("");
  } catch (e) {
    setView(false);
    setAuthMsg(String(e.message || e));
  }
});

authBtn.addEventListener("click", handleAuth);

toLoginBtn.addEventListener("click", () => setMode("login"));
toRegisterBtn.addEventListener("click", () => setMode("register"));

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(kSess);
  username = null; siteSecret = null; userPassword = null; todos = [];
  setView(false);
  setAuthMsg("");
});

syncBtn.addEventListener("click", syncFromRemote);

// ---------- CRUD add ----------
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

// ---------- init ----------
(function init() {
  setMode("login");
  setView(false);

  // load remembered fields
  const savedUser = localStorage.getItem(kUser);
  const savedSite = localStorage.getItem(kSite);
  const savedPw = localStorage.getItem(kPw);

  if (savedUser) { usernameInput.value = savedUser; rememberUser.checked = true; }
  if (savedSite) { siteSecretInput.value = savedSite; rememberSite.checked = true; }
  if (savedPw) { userPwInput.value = savedPw; rememberPw.checked = true; }

  // 你也可以在这里做自动登录，但通常不建议（安全）
})();
