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

// optional event code
let eventCode = (localStorage.getItem("ss_event_code") || "").trim().toUpperCase();

// ---------- setup ----------
window.addEventListener("DOMContentLoaded", () => {
  buildCodeBar();
  buildEntryModal();

  const codeInput = document.getElementById("eventCode");
  const codeStatus = document.getElementById("codeStatus");

  if (eventCode && codeInput) {
    codeInput.value = eventCode;
    codeStatus.textContent = `Code saved: ${eventCode}`;
  }

  const btn = document.getElementById("startBtn");
  if (btn) btn.addEventListener("click", loadQuestion);
});

// ---------- UI helpers ----------
function buildCodeBar() {
  const questionBox = document.getElementById("questionBox");
  if (!questionBox) return;

  const wrapper = document.createElement("div");
  wrapper.id = "codeBar";
  wrapper.style.marginBottom = "16px";
  wrapper.innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:center;">
      <input
        id="eventCode"
        type="text"
        placeholder="Event code (optional)"
        maxlength="30"
        style="padding:10px 12px; font-size:16px; text-transform:uppercase; min-width:220px;"
      />
      <button id="saveCodeBtn" class="secondary" type="button">Save Code</button>
    </div>
    <div id="codeStatus" style="margin-top:8px; text-align:center; font-size:14px;"></div>
  `;

  questionBox.parentNode.insertBefore(wrapper, questionBox);

  document.getElementById("saveCodeBtn").addEventListener("click", saveEventCode);
  document.getElementById("eventCode").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEventCode();
    }
  });
}

function buildEntryModal() {
  const modal = document.createElement("div");
  modal.id = "entryModal";
  modal.style.display = "none";
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background = "rgba(0,0,0,0.7)";
  modal.style.zIndex = "9999";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.padding = "20px";

  modal.innerHTML = `
    <div style="background:#fff; color:#000; max-width:520px; width:100%; border-radius:12px; padding:24px;">
      <h2 id="entryTitle" style="margin-top:0;">You earned an entry!</h2>
      <p id="entryBlurb"></p>

      <div style="display:flex; flex-direction:column; gap:12px; margin:16px 0;">
        <input id="entryName" type="text" placeholder="Your name" maxlength="120" style="padding:10px; font-size:16px;" />
        <input id="entryEmail" type="email" placeholder="Your email" maxlength="200" style="padding:10px; font-size:16px;" />
      </div>

      <div id="entryError" style="color:#b00020; min-height:20px; margin-bottom:12px;"></div>

      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button id="submitEntryBtn" class="primary" type="button">Claim Entry</button>
        <button id="skipEntryBtn" class="secondary" type="button">Maybe Later</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function saveEventCode() {
  const codeInput = document.getElementById("eventCode");
  const codeStatus = document.getElementById("codeStatus");

  const enteredCode = (codeInput.value || "").trim().toUpperCase();
  eventCode = enteredCode;
  localStorage.setItem("ss_event_code", eventCode);

  if (eventCode) {
    codeStatus.textContent = `Code saved: ${eventCode}`;
  } else {
    codeStatus.textContent = "No code entered. That's fine — you can still play.";
  }
}

// ---------- core survey ----------
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

  currentQuestion = remaining[Math.floor(Math.random() * remaining.length)];

  document.getElementById("questionBox").innerHTML = `
    ${eventCode ? `<div style="margin-bottom:10px; font-size:14px; opacity:0.8;">Event Code: <strong>${escapeHtml(eventCode)}</strong></div>` : ""}

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

  answerInput.focus();
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
    event_code: eventCode || null
  });

  if (error) {
    alert("Error saving answer: " + error.message);
    return;
  }

  await client.rpc("increment_question_count", {
    qid: currentQuestion.id
  });

  // only successfully saved, non-skipped answers count
  const answeredCount = await getAnsweredCount();
  const prompted = await maybePromptForEntry(answeredCount);

  if (!prompted) {
    loadQuestion();
  }
}

async function skipQuestion() {
  if (!currentQuestion) return;

  // skipped questions do not get saved and do not count
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

// ---------- counting ----------
async function getAnsweredCount() {
  const { count, error } = await client
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (error) {
    console.error("Error counting answers:", error);
    return 0;
  }

  return count || 0;
}

async function getSessionEntryCount() {
  const { count, error } = await client
    .from("contest_entries")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (error) {
    console.error("Error counting session entries:", error);
    return 0;
  }

  return count || 0;
}

async function maybePromptForEntry(answeredCount) {
  const sessionEntriesClaimed = await getSessionEntryCount();
  const nextEntryNumber = sessionEntriesClaimed + 1;

  if (nextEntryNumber > 3) return false;

  const threshold = nextEntryNumber * 25;

  if (answeredCount >= threshold) {
    showEntryModal(nextEntryNumber, answeredCount);
    return true;
  }

  return false;
}

// ---------- daily email limit ----------
function getTodayRangeLocal() {
  const now = new Date();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

async function getTodayEntryCountByEmail(email) {
  const { startIso, endIso } = getTodayRangeLocal();

  const { count, error } = await client
    .from("contest_entries")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) {
    console.error("Error counting daily email entries:", error);
    return 0;
  }

  return count || 0;
}

// ---------- entry modal ----------
function showEntryModal(entryNumber, answeredCount) {
  const modal = document.getElementById("entryModal");
  const title = document.getElementById("entryTitle");
  const blurb = document.getElementById("entryBlurb");
  const errorBox = document.getElementById("entryError");
  const nameInput = document.getElementById("entryName");
  const emailInput = document.getElementById("entryEmail");
  const submitBtn = document.getElementById("submitEntryBtn");
  const skipBtn = document.getElementById("skipEntryBtn");

  title.textContent = `You earned entry #${entryNumber}!`;

  let nextMsg = "";
  if (entryNumber === 1) {
    nextMsg = "Answer 25 more questions for entry #2, and 25 more after that for entry #3.";
  } else if (entryNumber === 2) {
    nextMsg = "Answer 25 more questions for your final entry.";
  } else {
    nextMsg = "This is your final available session entry.";
  }

  blurb.textContent =
    `You have submitted ${answeredCount} answers. Enter your name and email to claim this entry. Limit 3 entries per day per email. ${nextMsg}`;

  errorBox.textContent = "";
  nameInput.value = "";
  emailInput.value = "";

  modal.style.display = "flex";

  submitBtn.onclick = async () => {
    const name = (nameInput.value || "").trim();
    const email = (emailInput.value || "").trim().toLowerCase();

    if (!name || !email) {
      errorBox.textContent = "Please enter both name and email.";
      return;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      errorBox.textContent = "Please enter a valid email address.";
      return;
    }

    const dailyCount = await getTodayEntryCountByEmail(email);

    if (dailyCount >= 3) {
      errorBox.textContent = "That email has already claimed the maximum 3 entries for today.";
      return;
    }

    const { error } = await client.from("contest_entries").insert({
      session_id: sessionId,
      event_code: eventCode || null,
      entry_number: entryNumber,
      name,
      email
    });

    if (error) {
      errorBox.textContent = "Error saving entry: " + error.message;
      return;
    }

    hideEntryModal();
    loadQuestion();
  };

  skipBtn.onclick = async () => {
    hideEntryModal();
    loadQuestion();
  };
}

function hideEntryModal() {
  const modal = document.getElementById("entryModal");
  if (modal) modal.style.display = "none";
}

// ---------- misc ----------
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}