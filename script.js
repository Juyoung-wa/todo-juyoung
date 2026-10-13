// 화면에서 사용할 요소들
const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const addButton = form.querySelector("button");
const list = document.getElementById("todo-list");
const emptyMessage = document.getElementById("empty-message");
const errorMessage = document.getElementById("error-message");
const remainingCount = document.getElementById("remaining-count");
const doneCount = document.getElementById("done-count");

// 할 일 목록 (Supabase의 todos 표에서 불러온 내용을 화면용으로 들고 있음)
let todos = [];

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

// 할 일 목록을 화면에 다시 그리기
function render() {
  list.innerHTML = "";

  for (const todo of todos) {
    const item = document.createElement("li");
    item.className = "todo-item" + (todo.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = todo.text;

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = "✕";
    deleteButton.title = "삭제";
    deleteButton.addEventListener("click", () => deleteTodo(todo.id));

    item.append(checkbox, text, deleteButton);
    list.append(item);
  }

  emptyMessage.hidden = todos.length > 0;

  // 전광판 점수 갱신
  const done = todos.filter((t) => t.done).length;
  doneCount.textContent = done;
  remainingCount.textContent = todos.length - done;
}

function loadTodos() {
  return run("할 일을 불러오지 못했어요", async () => {
    todos = await request("todos?select=id,text,done&order=id.asc");
  });
}

function addTodo(text) {
  return run("할 일을 추가하지 못했어요", async () => {
    const [created] = await request("todos", {
      method: "POST",
      body: JSON.stringify({ text }),
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
  });
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
  await addTodo(text);
  addButton.disabled = false;

  // 저장에 성공했을 때만 입력칸 비우기 (실패하면 다시 시도할 수 있게 남겨 둠)
  if (errorMessage.hidden) input.value = "";
  input.focus();
});

loadTodos();
