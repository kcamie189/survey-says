// Supabase → Settings → Data API
const SUPABASE_URL = "https://asadyqbzmofzgydivizr.supabase.co";
const SUPABASE_KEY = "sb_publishable_WaDBD_zc4FjsDq2l15atZg_EyYzPG--";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentQuestion = null;

// one session per browser (for now)
let sessionId =
  localStorage.getItem("ss_session_id") ||
  Math.random().toString(36).slice(2) + Date.now().toString(36);
localStorage.setItem("ss_session_id", sessionId);

window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("startBtn");
  if (btn) btn.addEventListener("click", loadQuestion);
});

async function loadQuestion() {
  // 1) get answered ids this session
  const { data: answeredRows, error: ansErr } = await client
    .from("responses")
    .select("question_id")
    .eq("session_id", sessionId);

  if (ansErr) {
    document.getElementById("questionBox").innerHTML =
      `<p>Error: ${escapeHtml(ansErr.message)}</p>`;
    return;
  }

  const answeredIds = [...new Set((answeredRows || []).map((r) => r.question_id))];

  // 2) get collecting questions
  const { data: questions, error: qErr } = await client
    .from("questions")
    .select("id, question_text")
    .eq("status", "collecting");

  if (qErr) {
    document.getElementById("questionBox").innerHTML =
      `<p>Error: ${escapeHtml(qErr.message)}</p>`;
    return;
  }

  // 3) filter out ones already answered this session
  const remaining = (questions || []).filter((q) => !answeredIds.includes(q.id));

  if (remaining.length === 0) {
    document.getElementById("questionBox").innerHTML = `
      <p><strong>No more new questions for this session.</strong></p>
      <button id="doneBtn">I’m Done</button>
    `;
    document.getElementById("doneBtn").addEventListener("click", finish);
    return;
  }

  // 4) pick random question
  currentQuestion = remaining[Math.floor(Math.random() * remaining.length)];

  // 5) render
  document.getElementById("questionBox").innerHTML = `
    <h2>${escapeHtml(currentQuestion.question_text)}</h2>
    <input id="answer" type="text" placeholder="Type your answer..." maxlength="500" />
    <div>
      <button id="nextBtn">Next Question</button>
      <button id="doneBtn">I’m Done</button>
    </div>
  `;

  document.getElementById("nextBtn").addEventListener("click", submitAnswer);
  document.getElementById("doneBtn").addEventListener("click", finish);
}

async function submitAnswer() {
  if (!currentQuestion) return;

  const answer = (document.getElementById("answer").value || "").trim();
  if (!answer) {
    alert("Type an answer first.");
    return;
  }

const { error } = await client.from("responses").insert({
  session_id: sessionId,
  question_id: currentQuestion.id,
  answer_raw: answer,
});

await client.rpc("increment_question_count", {
  qid: currentQuestion.id
});

  if (error) {
    alert("Error saving answer: " + error.message);
    return;
  }

  loadQuestion();
}

function finish() {
  document.getElementById("questionBox").innerHTML = `
    <h2>Thanks for helping!</h2>
    <p>Your answers were recorded.</p>
    <button id="startAgainBtn">Start Again</button>
  `;
  document.getElementById("startAgainBtn").addEventListener("click", loadQuestion);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&quot;")
    .replaceAll("'", "&#039;");
}