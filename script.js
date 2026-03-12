// Supabase → Settings → Data API
const SUPABASE_URL = "https://asadyqbzmofzgydivizr.supabase.co";
const SUPABASE_KEY = "sb_publishable_WaDBD_zc4FjsDq2l15atZg_EyYzPG--";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentQuestion = null;
let eventCode = (localStorage.getItem("ss_event_code") || "").trim().toUpperCase();
let sessionId = "";

// ---------- helpers ----------
function makeSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function setSessionForCode(code) {
  eventCode = (code || "").trim().toUpperCase();
  localStorage.setItem("ss_event_code", eventCode);

  const sessionKey = `ss_session_id_${eventCode}`;
  sessionId = localStorage.getItem(sessionKey) || makeSessionId();
  localStorage.setItem(sessionKey, sessionId);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getNextThresholdMessage(nextEntryNumber) {
  if (nextEntryNumber === 1) {
    return "Answer 25 questions to earn your first entry.";
  }
  if (nextEntryNumber === 2) {
    return "Keep going — 50 total answered questions earns entry #2.";
  }
  if (nextEntryNumber === 3) {
    return "Keep going — 75 total answered questions earns entry #3.";
  }
  return "You have earned the maximum number of entries.";
}

// ---------- setup UI ----------
window.addEventListener("DOMContentLoaded", () => {
  buildCodeBar();
  buildEntryModal();

  if (eventCode) {
    setSessionForCode(eventCode);
    const codeInput = document.getElementById("eventCode");
    const codeStatus = document.getElementById("codeStatus");
    if (codeInput) codeInput.value = eventCode;
    if (codeStatus) codeStatus.textContent = `Code saved: ${eventCode}`;
  }

  const btn = document.getElementById("startBtn");
  if (btn) {
    btn.addEventListener("click", async () => {
      if (!eventCode) {
        alert("Enter the event code first.");
        return;
      }
      await loadQuestion();
    });
  }
});

function buildCodeBar() {
  const startBtn = document.getElementById("startBtn");
  if (!startBtn) return;

  const wrapper = document.createElement("div");
  wrapper.id = "codeBar";
  wrapper.style.marginBottom = "16px";
  wrapper.innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:center;">
      <input
        id="eventCode"
        type="text"
        placeholder="Enter event code"
        maxlength="30"
        style="padding:10px 12px; font-size:16px; text-transform:uppercase; min-width:220px;"
      />
      <button id="saveCodeBtn" class="secondary" type="button">Save Code</button>
    </div>
    <div id="codeStatus" style="margin-top:8px; text-align:center; font-size:14px;"></div>
  `;

  startBtn.parentNode.insertBefore(wrapper, startBtn);

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

async function saveEventCode() {
  const codeInput = document.getElementById("eventCode");
  const codeStatus = document.getElementById("codeStatus");

  const enteredCode = (codeInput.value || "").trim().toUpperCase();

  if (!enteredCode) {
    codeStatus.textContent = "Please enter a code.";
    return;
  }

  setSessionForCode(enteredCode);
  codeInput.value = eventCode;
  codeStatus.textContent = `Code saved: ${eventCode}`;
}

// ---------- core survey ----------
async function loadQuestion() {
  if (!eventCode || !sessionId) {
    alert("Enter the event code first.");
    return;
  }

  // Get answered questions for this session + code
  const { data: answeredRows, error: ansErr } = await client
    .from("responses")
    .select("question_id")
    .eq("session_id", sessionId)
    .eq("event_code", eventCode);

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
      <p>You can stop here or come back later with a different event code.</p>

      <div class="buttonRow">
        <button id="doneBtn" class="primary">I'm Done</button>
      </div>
    `;

    document.getElementById("doneBtn").addEventListener("click", finish);
    return;
  }

  currentQuestion = remaining[Math.floor(Math.random() * remaining.length)];

  document.getElementById("questionBox").innerHTML = `
    <div style="margin-bottom:10px; font-size:14px; opacity:0.8;">
      Event Code: <strong>${escapeHtml(eventCode)}</strong>
    </div>

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
  if (!eventCode || !sessionId) {
    alert("Enter the event code first.");
    return;
  }

  const answer = (document.getElementById("answer").value || "").trim();

  if (!answer) {
    alert("Type an answer first.");
    return;
  }

  const payload = {
    session_id: sessionId,
    question_id: currentQuestion.id,
    answer_raw: answer,
    event_code: eventCode
  };

  const { error } = await client.from("responses").insert(payload);

  if (error) {
    alert("Error saving answer: " + error.message);
    return;
  }

  // Increment response counter
  await client.rpc("increment_question_count", {
    qid: currentQuestion.id
  });

  // Only non-skipped, successfully saved answers count
  const answeredCount = await getAnsweredCount();
  const prompted = await maybePromptForEntry(answeredCount);

  if (!prompted) {
    await loadQuestion();
  }
}

async function skipQuestion() {
  if (!currentQuestion) return;
  // Skip does not save, so it does not count toward 25/50/75
  await loadQuestion();
}

function finish() {
  document.getElementById("questionBox").innerHTML = `
    <h2>Thanks for helping!</h2>
    <p>Your answers were recorded.</p>

    <div class="buttonRow">
      <button id="startAgainBtn" class="primary">Continue Answering</button>
    </div>
  `;

  document.getElementById("startAgainBtn").addEventListener("click", loadQuestion);
}

// ---------- counting + entries ----------
async function getAnsweredCount() {
  const { count, error } = await client
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("event_code", eventCode);

  if (error) {
    console.error("Error counting answers:", error);
    return 0;
  }

  return count || 0;
}

async function getEntryCount() {
  const { count, error } = await client
    .from("contest_entries")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("event_code", eventCode);

  if (error) {
    console.error("Error counting entries:", error);
    return 0;
  }

  return count || 0;
}

async function maybePromptForEntry(answeredCount) {
  const entriesClaimed = await getEntryCount();
  const nextEntryNumber = entriesClaimed + 1;

  if (nextEntryNumber > 3) return false;

  const threshold = nextEntryNumber * 25;

  if (answeredCount >= threshold) {
    showEntryModal(nextEntryNumber, answeredCount);
    return true;
  }

  return false;
}

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
    nextMsg = "Answer 25 more questions to earn entry #2, and 25 after that for entry #3.";
  } else if (entryNumber === 2) {
    nextMsg = "Answer 25 more questions to earn your final entry.";
  } else {
    nextMsg = "This is your final available entry.";
  }

  blurb.textContent =
    `You have submitted ${answeredCount} answers. Enter your name and email to claim entry #${entryNumber}. ${nextMsg}`;

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

    const { error } = await client.from("contest_entries").insert({
      session_id: sessionId,
      event_code: eventCode,
      entry_number: entryNumber,
      name,
      email
    });

    if (error) {
      if (String(error.message || "").toLowerCase().includes("duplicate")) {
        errorBox.textContent = "That entry was already claimed for this session.";
      } else {
        errorBox.textContent = "Error saving entry: " + error.message;
      }
      return;
    }

    hideEntryModal();
    await loadQuestion();
  };

  skipBtn.onclick = async () => {
    hideEntryModal();
    await loadQuestion();
  };
}

function hideEntryModal() {
  const modal = document.getElementById("entryModal");
  if (modal) modal.style.display = "none";
}