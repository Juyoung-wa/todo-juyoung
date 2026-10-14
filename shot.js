// 할 일을 체크할 때마다 배경의 선수가 슛을 차는 기능
// 완료한 비율(완료 ÷ 전체)이 높을수록 공이 골문 가까이 날아가고, 전부 완료하면 골!
// 아래 숫자 좌표는 모두 배경 그림(가로 1600 × 세로 900) 안에서의 위치

// 화면에서 사용할 요소들
const scene = document.querySelector(".scene");
const sceneSvgs = document.querySelectorAll(".scene svg");
const fanRow = document.getElementById("fans");
const kickLeg = document.getElementById("kick-leg");
const keeper = document.getElementById("keeper");
const goalNet = document.getElementById("goal-net");
const goalFrame = document.getElementById("goal-frame");
const restBall = document.getElementById("rest-ball");
const flyingBall = document.getElementById("flying-ball");
const hitSpark = document.getElementById("hit-spark");
const shotMessage = document.getElementById("shot-message");

// 골대: 왼쪽 골포스트 x, 오른쪽 골포스트 x, 크로스바 y
const GOAL = { left: 1180, right: 1500, top: 470 };
const KEEPER_X = 1340; // 골키퍼가 서 있는 곳
const BALL_RADIUS = 24;
const BALL_START = { x: 424, y: 697 }; // 선수 발 앞에 공이 놓인 자리
const FLIGHT_TIME = 900; // 공이 골대까지 날아가는 시간 (1000 = 1초)

// 슛을 찰 때마다 1씩 늘어나는 번호.
// 슛이 끝나기 전에 또 체크하면 번호가 바뀌어서, 앞의 슛은 그 자리에서 멈춤
let shotNumber = 0;

// ---------- 관중 ----------

// SVG 그림 요소 하나 만들기 (예: svgElement("circle", { r: 9 }))
function svgElement(tag, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

// 관중석 맨 앞줄 관중 36명 만들기
// 몸 아래쪽은 광고판에 가려져서, 앉아 있을 때는 머리와 어깨만 보임
function buildFans() {
  const shirts = ["#e03131", "#f1f3f5", "#4dabf7", "#ffd43b"];
  const skins = ["#e8b08a", "#c68e65", "#f3c9a6", "#8d5a3b"];

  for (let i = 0; i < 36; i++) {
    const shirt = shirts[i % shirts.length];
    const seat = svgElement("g", { transform: `translate(${22 + i * 44} 412)` });
    const fan = svgElement("g", { class: "fan" });
    const arms = svgElement("g", { class: "arms", stroke: shirt, "stroke-width": 6, "stroke-linecap": "round" });
    arms.append(
      svgElement("line", { x1: -8, y1: -24, x2: -19, y2: -50 }),
      svgElement("line", { x1: 8, y1: -24, x2: 19, y2: -50 })
    );
    fan.append(
      arms,
      svgElement("rect", { x: -11, y: -30, width: 22, height: 34, rx: 8, fill: shirt }),
      svgElement("circle", { cy: -40, r: 9, fill: skins[(i * 3) % skins.length] })
    );
    // 다 같이 똑같은 박자로 뛰면 어색하니까 사람마다 조금씩 다르게
    fan.style.animationDelay = `${-Math.random()}s`;
    seat.append(fan);
    fanRow.append(seat);
  }
}

// ---------- 화면 크기에 맞추기 ----------

// 가로로 넓은 화면: 그림으로 화면을 꽉 채움 (위아래가 조금 잘림)
// 세로로 긴 화면(핸드폰 등): 선수와 골대가 잘리지 않게 그림 전체를 화면 아래쪽에 맞춤
function fitScene() {
  const wide = innerWidth / innerHeight >= 1600 / 900;
  for (const svg of sceneSvgs) {
    svg.setAttribute("preserveAspectRatio", wide ? "xMidYMid slice" : "xMidYMax meet");
  }
}

// ---------- 공이 날아가는 길 ----------

// 기다리기 (1000 = 1초)
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 곡선 길 위에서 t만큼 간 지점 (t: 0=출발점, 1=도착점, 1보다 크면 도착점을 지나 계속 날아간 곳)
// 곡선은 출발점(from)에서 휘는 기준점(curve) 쪽으로 끌려가며 도착점(to)으로 감
function pointOnPath({ from, curve, to }, t) {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * curve.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * curve.y + t * t * to.y,
  };
}

// 공을 곡선 길을 따라 duration 동안 빙글빙글 돌리며 움직이기
// vanish가 true면 멀어지듯 작아지면서 사라짐
function flyBall(path, duration, { tFrom = 0, tTo = 1, vanish = false } = {}) {
  const shot = shotNumber;
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now) {
      if (shot !== shotNumber) return resolve(); // 새 슛이 시작됐으면 멈춤
      const progress = Math.min((now - start) / duration, 1);
      const { x, y } = pointOnPath(path, tFrom + (tTo - tFrom) * progress);
      const size = vanish ? 1 - progress * 0.5 : 1;
      flyingBall.setAttribute("transform", `translate(${x} ${y}) rotate(${now * 0.8}) scale(${size})`);
      flyingBall.style.opacity = vanish ? 1 - progress : 1;
      if (progress < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// 완료 비율에 따라 공이 갈 곳(to)과 휘는 모양(curve) 정하기
// kind: "goal"(골) / "post"(골대 맞음) / "near"(살짝 빗나감) / "far"(크게 빗나감)
function planShot(ratio) {
  const pick = (choices) => choices[Math.floor(Math.random() * choices.length)];
  const between = (min, max) => min + Math.random() * (max - min);
  // 보통 슛: 출발점과 도착점 사이에서 위로 솟는 곡선 (height가 클수록 높이 뜸)
  const arc = (to, height = 220) => ({ x: (BALL_START.x + to.x) / 2, y: Math.min(BALL_START.y, to.y) - height });

  // 다 했으면 골! 골키퍼 손이 닿지 않는 골문 위쪽 구석으로
  // 너무 높이 띄우면 크로스바를 위에서 뚫고 들어가는 것처럼 보여서, 낮고 강하게
  if (ratio === 1) {
    const to = { x: pick([1250, 1430]), y: between(515, 545) };
    return { kind: "goal", to, curve: arc(to, 120) };
  }

  // 80% 이상: 왼쪽 골포스트, 오른쪽 골포스트, 크로스바 중 하나를 맞고 튕겨 나옴
  if (ratio >= 0.8) {
    const side = pick(["left", "right", "bar"]);
    let to, bounce;
    let height = 220;
    if (side === "left") {
      to = { x: GOAL.left - 8, y: between(530, 640) };
      bounce = { curve: { x: to.x - 80, y: to.y - 100 }, to: { x: to.x - 240, y: 760 } };
    } else if (side === "right") {
      // 골문 앞을 가로질러 반대편 골포스트로 가니까, 크로스바 아래로 지나가게 낮게
      to = { x: GOAL.right + 8, y: between(530, 640) };
      bounce = { curve: { x: to.x + 70, y: to.y - 80 }, to: { x: to.x + 160, y: 780 } };
      height = 120;
    } else {
      to = { x: between(1240, 1440), y: GOAL.top - 8 };
      bounce = { curve: { x: to.x - 40, y: to.y - 150 }, to: { x: to.x - 200, y: 760 } };
    }
    return { kind: "post", to, curve: arc(to, height), bounce: { from: to, ...bounce } };
  }

  // 그 밑은 빗나감. 비율이 낮을수록 골대에서 멀리 (제곱을 해서 비율이 낮아질수록 거리가 빠르게 커짐)
  // 80%에 가까우면 25 정도로 아슬아슬, 0%에 가까우면 425 정도로 한참 멀리
  const miss = 25 + 400 * ((0.8 - ratio) / 0.8) ** 2;
  const kind = ratio < 0.4 ? "far" : "near";
  // 크게 빗나갈 땐 왼쪽으로 보내면 공이 골대까지 가지도 못하고 떨어져서 어색하니, 오른쪽이나 위로만
  const side = pick(kind === "far" ? ["right", "over"] : ["left", "right", "over"]);

  if (side === "left") {
    // 왼쪽 골포스트 바깥으로 휘어져 나감 (curve를 도착점보다 오른쪽에 둬서, 끝에서 왼쪽으로 휨)
    const to = { x: GOAL.left - BALL_RADIUS - miss, y: between(530, 630) };
    return { kind, to, curve: { x: to.x + 80, y: to.y - 260 } };
  }
  if (side === "right") {
    // 오른쪽 골포스트 바깥으로 (많이 빗나가면 화면 밖까지)
    // 골문 앞을 지나가야 해서, 들어가는 것처럼 보이지 않게 크로스바 위로 높이 띄움
    const to = { x: GOAL.right + BALL_RADIUS + miss, y: between(440, 520) };
    return { kind, to, curve: arc(to, 300) };
  }
  // 크로스바 위로 (curve를 도착점보다 아래에 둬서, 끝까지 위로 솟아오르며 넘어감)
  const to = { x: between(1240, 1440), y: GOAL.top - BALL_RADIUS - miss };
  return { kind, to, curve: { x: (BALL_START.x + to.x) / 2, y: to.y + 120 } };
}

// ---------- 선수·골키퍼·골대 움직임 ----------

// 선수가 다리를 뒤로 더 젖혔다가 힘껏 앞으로 차고, 다시 원래 자세로
function kick() {
  kickLeg.animate(
    [
      { transform: "rotate(140deg)" },
      { transform: "rotate(155deg)", offset: 0.15 },
      { transform: "rotate(-5deg)", offset: 0.35 },
      { transform: "rotate(-5deg)", offset: 0.6 },
      { transform: "rotate(140deg)" },
    ],
    { duration: 800 }
  );
}

// 골키퍼가 공이 오는 쪽으로 몸을 날림 (가운데로 오면 제자리에서 점프)
function diveKeeper(to) {
  let move = "translateY(-40px)";
  if (to.x < KEEPER_X - 60) move = "translate(-50px, -30px) rotate(-65deg)";
  else if (to.x > KEEPER_X + 60) move = "translate(50px, -30px) rotate(65deg)";

  keeper.animate(
    [
      { transform: "none" },
      { transform: "none", offset: 0.2 },
      { transform: move, offset: 0.5 },
      { transform: move, offset: 0.8 },
      { transform: "none" },
    ],
    { duration: 1800, easing: "ease-out" }
  );
}

// 공이 골대를 "땅!" 맞은 자리에 번쩍 퍼지는 동그라미 + 골대가 부르르 떨림
function hitWoodwork(at) {
  hitSpark.setAttribute("cx", at.x);
  hitSpark.setAttribute("cy", at.y);
  hitSpark.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(3)", opacity: 0 },
    ],
    { duration: 400 }
  );
  goalFrame.animate(
    [
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(3px)" },
      { transform: "none" },
    ],
    { duration: 300 }
  );
}

// 그물이 공을 받아서 출렁
function shakeNet() {
  goalNet.animate(
    [{ transform: "none" }, { transform: "scale(1.06)" }, { transform: "scale(0.98)" }, { transform: "none" }],
    { duration: 600 }
  );
}

// ---------- 결과 문구 ----------

function showMessage(kind, title, detail) {
  shotMessage.className = `shot-message show ${kind}`;
  shotMessage.querySelector("strong").textContent = title;
  shotMessage.querySelector("span").textContent = detail;
}

function hideMessage() {
  shotMessage.classList.remove("show");
}

// ---------- 슛! ----------

// 할 일을 하나 완료할 때마다 script.js가 부르는 함수 (done: 완료한 개수, total: 전체 개수)
async function shoot(done, total) {
  const shot = ++shotNumber;
  const plan = planShot(done / total);
  const left = total - done;

  // 앞의 슛이 아직 안 끝났으면 정리하고 처음부터
  hideMessage();
  scene.classList.remove("cheering");
  flyingBall.style.opacity = 0;
  restBall.classList.remove("hidden");

  kick();
  await wait(200); // 발이 공에 닿을 때까지
  if (shot !== shotNumber) return;

  // 발 앞의 공을 숨기고, 카드 앞쪽의 공이 대신 날아감
  restBall.classList.add("hidden");
  diveKeeper(plan.to);
  await flyBall({ from: BALL_START, curve: plan.curve, to: plan.to }, FLIGHT_TIME);
  if (shot !== shotNumber) return;

  if (plan.kind === "goal") {
    // 골! 그물이 출렁이고 공은 골문 안 바닥으로 툭. 관중들이 일어나서 환호
    shakeNet();
    flyBall({ from: plan.to, curve: { x: plan.to.x + 15, y: plan.to.y }, to: { x: plan.to.x + 20, y: 670 } }, 400);
    scene.classList.add("cheering");
    showMessage("goal", "GOAL!", "할 일을 모두 끝냈어요! 🎉");
    await wait(3500);
  } else if (plan.kind === "post") {
    // 골대를 맞고 튕겨 나옴
    hitWoodwork(plan.to);
    showMessage("post", "땅! 골대 맞고 나왔어요", `골까지 남은 할 일 ${left}개`);
    await flyBall(plan.bounce, 700, { vanish: true });
    await wait(1300);
  } else {
    // 빗나감: 같은 곡선을 따라 조금 더 날아가며 멀리 사라짐
    const title = plan.kind === "far" ? "어디로 찬 거야?!" : "아깝다! 살짝 빗나갔어요";
    showMessage(plan.kind, title, `골까지 남은 할 일 ${left}개`);
    await flyBall({ from: BALL_START, curve: plan.curve, to: plan.to }, 400, { tFrom: 1, tTo: 1.3, vanish: true });
    await wait(1600);
  }
  if (shot !== shotNumber) return;

  // 끝: 문구를 숨기고 공을 다시 선수 발 앞에
  hideMessage();
  scene.classList.remove("cheering");
  flyingBall.style.opacity = 0;
  restBall.classList.remove("hidden");
}

buildFans();
fitScene();
addEventListener("resize", fitScene);
