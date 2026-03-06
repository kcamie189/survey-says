// Supabase → Settings → Data API
const SUPABASE_URL = "https://asadyqbzmofzgydivizr.supabase.co";
const SUPABASE_KEY = "sb_publishable_WaDBD_zc4FjsDq2l15atZg_EyYzPG--";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentQuestion = null;

// one session per browser
let sessionId =
  localStorage.getItem("ss_session_id") ||
  Math.random().toString(36).slice(2) + Date.now().toString(36);

localStorage.setItem("ss_session_id", sessionId);

// Start button
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("startBtn");
  if (btn) btn.addEventListener("click", loadQuestion);
});

async function loadQuestion() {
  // Get answered questions this session
  const { data: answeredRows, error: ansErr } = await client
    .from("responses")
    .select("question_id")
    .eq("session_id", sessionId);

  if (ansErr) {
    document.getElementById("questionBox").innerHTML =
      `<p>Error: ${escapeHtml(ansErr.message)}</p>`;
    return;
  }

  const answeredIds = [...new Set((answeredRows || []).map(r => r.question_id))];

  // Get available questions
  const { data: questions, error: qErr } = await client
    .from("questions")
    .select("id, question_text")
    .eq("status", "collecting");

  if (qErr) {
    document.getElementById("questionBox").innerHTML =
      `<p>Error: ${escapeHtml(qErr.message)}</p>`;
    return;
  }

  const remaining = (questions || []).filter(q => !answeredIds.includes(q.id));

  if (remaining.length === 0) {
    document.getElementById("questionBox").innerHTML = `
      <p><strong>No more new questions for this session.</strong></p>

      <div class="buttonRow">
        <button id="doneBtn" class="primary">I'm Done</button>
      </div>
    `;

    document.getElementById("doneBtn").addEventListener("click", finish);
    return;
  }

  // Pick random question
  currentQuestion = remaining[Math.floor(Math.random() * remaining.length)];

  // Render question
  document.getElementById("questionBox").innerHTML = `
    <h2>${escapeHtml(currentQuestion.question_text)}</h2>

    <input
      id="answer"
      type="text"
      placeholder="Type your answer..."
      maxlength="500"
    />

    <div class="buttonRow">
      <button id="nextBtn" class="primary">Next Question</button>
      <button id="skipBtn" class="secondary">Skip</button>
      <button id="doneBtn" class="secondary">I'm Done</button>
    </div>
  `;

  const answerInput = document.getElementById("answer");
  const nextBtn = document.getElementById("nextBtn");
  const skipBtn = document.getElementById("skipBtn");
  const doneBtn = document.getElementById("doneBtn");

  nextBtn.addEventListener("click", submitAnswer);
  skipBtn.addEventListener("click", skipQuestion);
  doneBtn.addEventListener("click", finish);

  answerInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAnswer();
    }
  });

  // Auto-select the input so the cursor is ready immediately
  answerInput.focus();
}

async function submitAnswer() {
  if (!currentQuestion) return;

  const answer = (document.getElementById("answer").value || "").trim();

  if (!answer) {
    alert("Type an answer first.");
    return;
  }

  // Save response
  const { error } = await client.from("responses").insert({
    session_id: sessionId,
    question_id: currentQuestion.id,
    answer_raw: answer,
  });

  if (error) {
    alert("Error saving answer: " + error.message);
    return;
  }

  // Increment response counter
  await client.rpc("increment_question_count", {
    qid: currentQuestion.id
  });

  loadQuestion();
}

async function skipQuestion() {
  if (!currentQuestion) return;

  // Do not record anything for skipped questions
  loadQuestion();
}

function finish() {
  document.getElementById("questionBox").innerHTML = `
    <h2>Thanks for helping!</h2>
    <p>Your answers were recorded.</p>

    <div class="buttonRow">
      <button id="startAgainBtn" class="primary">Start Again</button>
    </div>
  `;

  document.getElementById("startAgainBtn").addEventListener("click", loadQuestion);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}