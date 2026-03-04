// ====== 0) 轻量“门禁”配置 ======
// 方案C本质不安全：这些都会暴露在前端源码里。
// 你可以把口令写得长一点、随机一点（至少 16 位）。
const USERS = {
  // username: password
  "chosen": "my-super-long-secret-1",
  "friendA": "my-super-long-secret-2",
  "friendB": "my-super-long-secret-3",
};

// 每个用户的 todo 都存在 localStorage 的不同 key 里
const storageKey = (u) => `todo_v1_${u}`;
// 用 sessionStorage 记录“已登录用户”（关闭标签页会清掉）
const sessionKey = "todo_v1_session_user";

// ====== 1) DOM ======
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");

const helloTitle = document.getElementById("helloTitle");
const logoutBtn = document.getElementById("logoutBtn");
const newTodoInput = document.getElementById("newTodoInput");
const addBtn = document.getElementById("addBtn");
const todoList = document.getElementById("todoList");

// ====== 2) 状态 ======
let currentUser = null;
let todos = []; // [{id, title, done, updatedAt}]

// ====== 3) 工具函数 ======
function uid() {
  // 简单唯一ID
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadTodos(u) {
  const raw = localStorage.getItem(storageKey(u));
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

function saveTodos(u, list) {
  localStorage.setItem(storageKey(u), JSON.stringify(list));
}

function setView(isAuthed) {
  loginView.classList.toggle("hidden", isAuthed);
  appView.classList.toggle("hidden", !isAuthed);
}

function render() {
  todoList.innerHTML = "";
  // 最近更新的放前面
  const sorted = [...todos].sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));

  for (const t of sorted) {
    const li = document.createElement("li");
    li.className = "item" + (t.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!t.done;
    checkbox.addEventListener("change", () => {
      t.done = checkbox.checked;
      t.updatedAt = Date.now();
      persistAndRender();
    });

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = t.title;

    // 点击可编辑
    title.addEventListener("click", () => {
      title.setAttribute("contenteditable", "true");
      title.focus();

      const range = document.createRange();
      range.selectNodeContents(title);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    // Enter保存 / Esc取消
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        title.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        title.textContent = t.title;
        title.blur();
      }
    });

    title.addEventListener("blur", () => {
      title.removeAttribute("contenteditable");
      const newText = (title.textContent || "").trim();
      if (!newText) {
        title.textContent = t.title; // 不允许空
        return;
      }
      if (newText !== t.title) {
        t.title = newText;
        t.updatedAt = Date.now();
        persistAndRender();
      }
    });

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "删除";
    del.addEventListener("click", () => {
      todos = todos.filter(x => x.id !== t.id);
      persistAndRender();
    });

    li.appendChild(checkbox);
    li.appendChild(title);
    li.appendChild(del);
    todoList.appendChild(li);
  }
}

function persistAndRender() {
  saveTodos(currentUser, todos);
  render();
}

// ====== 4) 登录/退出 ======
function tryAutoLogin() {
  const u = sessionStorage.getItem(sessionKey);
  if (u && USERS[u]) {
    loginAs(u);
  }
}

function loginAs(u) {
  currentUser = u;
  sessionStorage.setItem(sessionKey, u);
  todos = loadTodos(u);
  helloTitle.textContent = `Hi, ${u}`;
  setView(true);
  render();
}

loginBtn.addEventListener("click", () => {
  const u = (usernameInput.value || "").trim();
  const p = (passwordInput.value || "").trim();
  if (!u || !p) {
    loginMsg.textContent = "请输入用户名和口令。";
    return;
  }
  if (!USERS[u] || USERS[u] !== p) {
    loginMsg.textContent = "用户名或口令不对。";
    return;
  }
  loginMsg.textContent = "";
  passwordInput.value = "";
  loginAs(u);
});

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(sessionKey);
  currentUser = null;
  todos = [];
  setView(false);
});

// ====== 5) CRUD：新增 ======
function addTodo() {
  const text = (newTodoInput.value || "").trim();
  if (!text) return;
  todos.push({ id: uid(), title: text, done: false, updatedAt: Date.now() });
  newTodoInput.value = "";
  persistAndRender();
}

addBtn.addEventListener("click", addTodo);
newTodoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTodo();
});

// ====== init ======
setView(false);
tryAutoLogin();
