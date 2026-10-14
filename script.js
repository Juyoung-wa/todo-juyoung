// 화면에서 사용할 요소들
const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const authorInput = document.getElementById("author-input");
const dueInput = document.getElementById("due-input");
const addButton = form.querySelector("button");
const list = document.getElementById("todo-list");
const emptyMessage = document.getElementById("empty-message");
const errorMessage = document.getElementById("error-message");
const remainingCount = document.getElementById("remaining-count");
const doneCount = document.getElementById("done-count");
const remainingText = document.getElementById("remaining-text");
const filterButtons = document.querySelectorAll(".filter-button");

// 지금 골라 보는 목록: "all"(전체), "active"(진행 중), "done"(완료)
let filter = "all";

// 할 일 목록 (Supabase의 todos 표에서 불러온 내용을 화면용으로 들고 있음)
let todos = [];

// 지금 고치고 있는 할 일의 번호(없으면 null)와, 고치는 중인 글자
let editingId = null;
let editDraft = "";
let savingEdit = false;

// Supabase의 todos 표에 요청을 보내고, 결과(할 일 배열)를 돌려받기
// SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY는 config.js에 있음
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation", // 바뀐 할 일을 응답으로 돌려받기
      },
    });
  } catch {
    throw new Error("Supabase에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `요청이 실패했어요 (${response.status})`);
  }
  return response.json();
}

// 오류 메시지를 화면에 보이기 (빈 글자면 숨기기)
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = message === "";
}

// 작업을 실행하고, 실패하면 오류를 화면에 보여 준 뒤 목록을 다시 그리기
async function run(failMessage, action) {
  try {
    await action();
    showError("");
  } catch (error) {
    showError(`${failMessage}: ${error.message}`);
  }
  render();
}

// 마감이 가까운 순서로 정렬. 마감일이 없는 할 일은 맨 아래, 같으면 먼저 추가한 순서
// 마감일은 "2026-10-15" 같은 글자라서 글자 순서로 비교해도 날짜 순서와 같음
function sortTodos() {
  todos.sort((a, b) => {
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    return a.id - b.id;
  });
}

// 마감일을 "10월 15일 (D-2)"처럼 바꾸고, 오늘/지남 여부도 함께 돌려주기
function describeDueDate(dueDate) {
  const [year, month, day] = dueDate.split("-").map(Number);
  const due = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((due - today) / (24 * 60 * 60 * 1000));

  let dDay;
  if (daysLeft > 0) dDay = `D-${daysLeft}`;
  else if (daysLeft === 0) dDay = "오늘";
  else dDay = `${-daysLeft}일 지남`;

  const yearText = year === today.getFullYear() ? "" : `${year}년 `;
  return {
    label: `📅 ${yearText}${month}월 ${day}일 (${dDay})`,
    state: daysLeft === 0 ? "today" : daysLeft < 0 ? "overdue" : "",
  };
}

// 할 일 목록을 화면에 다시 그리기
function render() {
  list.innerHTML = "";
  sortTodos();
  let editInput = null;

  // 고른 버튼에 맞는 할 일만 보여 주기
  const visibleTodos = todos.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  for (const todo of visibleTodos) {
    const item = document.createElement("li");
    item.className = "todo-item" + (todo.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    // 할 일 내용과, 그 아래 작은 글씨로 작성자 · 마감일 (있는 것만)
    const body = document.createElement("div");
    body.className = "body";

    let text;
    if (todo.id === editingId) {
      // 고치는 중이면 글자 대신 입력칸을 보여 줌
      text = document.createElement("input");
      text.className = "edit-input";
      text.value = editDraft;
      text.addEventListener("input", () => (editDraft = text.value));
      text.addEventListener("keydown", (event) => {
        if (event.isComposing) return; // 한글 조합 중에 누른 Enter/Esc는 무시
        if (event.key === "Enter") saveEdit(todo.id);
        else if (event.key === "Escape") cancelEdit();
      });
      editInput = text;
    } else {
      text = document.createElement("div");
      text.className = "text";
      text.textContent = todo.text;
      text.title = "두 번 눌러서 고치기";
      text.addEventListener("dblclick", () => startEdit(todo.id));
    }
    body.append(text);

    const meta = document.createElement("div");
    meta.className = "meta";

    if (todo.author) {
      const author = document.createElement("span");
      author.textContent = `✎ ${todo.author}`;
      meta.append(author);
    }

    if (todo.due_date) {
      const { label, state } = describeDueDate(todo.due_date);
      const due = document.createElement("span");
      due.className = `due ${state}`;
      due.textContent = label;
      meta.append(due);
    }

    if (meta.childElementCount > 0) body.append(meta);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = "✕";
    deleteButton.title = "삭제";
    deleteButton.addEventListener("click", () => deleteTodo(todo.id));

    item.append(checkbox, body, deleteButton);
    list.append(item);
  }

  // 고치는 입력칸이 있으면 바로 입력할 수 있게 커서를 글자 끝에 둠
  if (editInput) {
    editInput.focus();
    editInput.setSelectionRange(editInput.value.length, editInput.value.length);
  }

  // 보여 줄 할 일이 없으면 상황에 맞는 안내 문구
  if (todos.length === 0) emptyMessage.textContent = "킥오프! 첫 할 일을 추가해 보세요.";
  else if (filter === "active") emptyMessage.textContent = "진행 중인 할 일이 없어요. 모두 끝냈어요! 🎉";
  else emptyMessage.textContent = "아직 완료한 할 일이 없어요.";
  emptyMessage.hidden = visibleTodos.length > 0;

  // 고른 버튼을 초록색으로 표시
  for (const button of filterButtons) {
    const selected = button.dataset.filter === filter;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected);
  }

  // 전광판 점수와 목록 위 남은 개수 갱신 (어떤 버튼을 골랐든 전체 기준)
  const done = todos.filter((t) => t.done).length;
  doneCount.textContent = done;
  remainingCount.textContent = todos.length - done;
  remainingText.textContent = todos.length - done;
}

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    render();
  });
}

function loadTodos() {
  return run("할 일을 불러오지 못했어요", async () => {
    todos = await request("todos?select=id,text,done,author,due_date");
  });
}

// author, dueDate가 빈 글자면 없음(null)으로 저장
function addTodo(text, author, dueDate) {
  return run("할 일을 추가하지 못했어요", async () => {
    const [created] = await request("todos", {
      method: "POST",
      body: JSON.stringify({ text, author: author || null, due_date: dueDate || null }),
    });
    todos.push(created);
  });
}

function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  return run("완료 표시를 바꾸지 못했어요", async () => {
    const [updated] = await request(`todos?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ done: !todo.done }),
    });
    // 오류 없이 아무것도 안 바뀌는 경우(권한이 없을 때 등)도 실패로 알려 주기
    if (!updated) throw new Error("바뀐 할 일이 없어요. 권한이 없거나 이미 지워졌을 수 있어요.");
    todo.done = updated.done;

    // 완료로 바꿨을 때만 배경의 선수가 슛! 완료 비율이 높을수록 골문 가까이 (shot.js)
    if (todo.done) shoot(todos.filter((t) => t.done).length, todos.length);
  });
}

// 할 일 글자를 두 번 누르면 고치기 시작 (다른 할 일을 고치던 중이면 그건 취소됨)
function startEdit(id) {
  editingId = id;
  editDraft = todos.find((t) => t.id === id).text;
  render();
}

// Esc: 고친 내용을 버리고 원래 글자로 돌아가기
function cancelEdit() {
  editingId = null;
  render();
}

// Enter: 고친 내용을 Supabase에 저장
async function saveEdit(id) {
  if (savingEdit) return; // 저장 중에 Enter를 또 누르면 무시
  const todo = todos.find((t) => t.id === id);
  const newText = editDraft.trim();

  // 비웠거나 바뀐 게 없으면 저장하지 않고 원래대로
  if (newText === "" || newText === todo.text) {
    cancelEdit();
    return;
  }

  savingEdit = true;
  await run("할 일을 고치지 못했어요", async () => {
    const [updated] = await request(`todos?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text: newText }),
    });
    if (!updated) throw new Error("바뀐 할 일이 없어요. 권한이 없거나 이미 지워졌을 수 있어요.");
    todo.text = updated.text;
    editingId = null; // 성공했을 때만 고치기 끝 (실패하면 입력칸과 고친 글자를 그대로 둠)
  });
  savingEdit = false;
}

function deleteTodo(id) {
  return run("할 일을 지우지 못했어요", async () => {
    const deleted = await request(`todos?id=eq.${id}`, { method: "DELETE" });
    if (deleted.length === 0) throw new Error("지워진 할 일이 없어요. 권한이 없거나 이미 지워졌을 수 있어요.");
    todos = todos.filter((t) => t.id !== id);
  });
}

// 한글 조합 중에 누른 Enter는 무시해서 할 일이 두 번 추가되지 않게 함
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.isComposing) {
    event.preventDefault();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault(); // 페이지가 새로고침되지 않게 막기

  const text = input.value.trim();
  if (text === "") return;

  // 저장하는 동안 버튼을 잠가서 같은 할 일이 두 번 저장되지 않게 함
  addButton.disabled = true;
  // 이름 칸은 비워도 됨. 다음 할 일에도 같은 이름을 쓰기 쉽게 지우지 않고 둠
  // 마감일 칸도 비워도 됨 (값은 "2026-10-15" 같은 글자)
  await addTodo(text, authorInput.value.trim(), dueInput.value);
  addButton.disabled = false;

  // 저장에 성공했을 때만 할 일·마감일 칸 비우기 (실패하면 다시 시도할 수 있게 남겨 둠)
  if (errorMessage.hidden) {
    input.value = "";
    dueInput.value = "";
  }
  input.focus();
});

loadTodos();
