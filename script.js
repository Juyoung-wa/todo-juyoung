// 화면에서 사용할 요소들
const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const list = document.getElementById("todo-list");
const emptyMessage = document.getElementById("empty-message");
const remainingCount = document.getElementById("remaining-count");
const doneCount = document.getElementById("done-count");

// 할 일 목록 (저장하지 않으므로 새로고침하면 비워짐)
let todos = [];
let nextId = 1;

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

function addTodo(text) {
  todos.push({ id: nextId++, text, done: false });
  render();
}

function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  todo.done = !todo.done;
  render();
}

function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  render();
}

// 한글 조합 중에 누른 Enter는 무시해서 할 일이 두 번 추가되지 않게 함
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.isComposing) {
    event.preventDefault();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault(); // 페이지가 새로고침되지 않게 막기

  const text = input.value.trim();
  if (text === "") return;

  addTodo(text);
  input.value = "";
  input.focus();
});

render();
