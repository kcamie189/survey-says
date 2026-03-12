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

function getCodeKey() {
  return eventCode || "NO_CODE";
}

// ---------- setup ----------
window.addEventListener("DOMContentLoaded", () => {
  buildCodeBar();
  buildEntryModal();

  const codeInput = document.getElementById("eventCode");
  const codeStatus = document.getElementById("codeStatus");

  if (eventCode && codeInput) {
    codeInput.value = eventCode;
    codeStatus.textContent = `Code saved: ${eventCode}`;
  } else if (codeStatus) {
    codeStatus.textContent = "No code entered. That's fine — you can still play.";
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

      <div id="entryFormWrap" style="display:flex; flex-direction:column; gap:12px; margin:16px 0;">
        <input id="entryName" type="text" placeholder="Your name" maxlength="120" style="padding:10px; font-size:16px;" />
        <input id="entryEmail" type="email" placeholder="Your email" maxlength="200" style="padding:10px; font-size:16px;" />
      </div>

      <div id="entrySavedInfo" style="display:none; margin:16px 0; padding:12px; background:#f3f4f6; border-radius:10px;"></div>

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

  eventCode = (codeInput.value || "").trim().toUpperCase();
  localStorage.setItem("ss_event_code", eventCode);

  if (eventCode) {
    codeStatus.textContent = `Code saved: ${eventCode}`;
  } else {
    codeStatus.textContent = "No code entered. That's fine — you can still play.";
  }
}

// ---------- core survey ----------
async function loadQuestion() {
  const answeredCount = await getAnsweredCount();
  const sessionEntriesClaimed = await getSessionEntryCount();

  const codeKey = getCodeKey();

  // answered questions for this session + code
  const { data: answeredRows, error: ansErr } = await client
    .from("responses")
    .select("question_id")
    .eq("session_id", sessionId)
    .eq("event_code", codeKey);

  if (ansErr) {
    document.getElementById("questionBox").innerHTML =
      `<p>Error: ${escapeHtml(ansErr.message)}</p>`;
    return;
  }

  const answeredIds = [...new Set((answeredRows || []).map(r => r.question_id))];

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
      <p><strong>No more new questions for this code in this session.</strong></p>
      <div class="buttonRow">
        <button id="doneBtn" class="primary">I'm Done</button>
      </div>
    `;

    document.getElementById("doneBtn").addEventListener("click", finish);
    return;
  }

  currentQuestion = remaining[Math.floor(Math.random() * remaining.length)];

  const progressHtml = getProgressMarkup(answeredCount, sessionEntriesClaimed);

  document.getElementById("questionBox").innerHTML = `
    ${eventCode ? `<div style="margin-bottom:10px; font-size:14px; opacity:0.8;">Event Code: <strong>${escapeHtml(eventCode)}</strong></div>` : `<div style="margin-bottom:10px; font-size:14px; opacity:0.8;">No event code</div>`}

    ${progressHtml}

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

function getProgressMarkup(answeredCount, entriesClaimed) {
  if (entriesClaimed >= 3) {
    return `
      <div style="margin-bottom:18px;">
        <div style="font-size:15px; font-weight:700; margin-bottom:8px;">All 3 entries earned for this code</div>
        <div style="height:14px; background:#e5e7eb; border-radius:999px; overflow:hidden;">
          <div style="width:100%; height:100%; background:linear-gradient(90deg, #10b981, #059669);"></div>
        </div>
        <div style="font-size:14px; margin-top:8px; color:#374151;">
          You can keep answering questions, but there are no more entries to claim for this code today.
        </div>
      </div>
    `;
  }

  const nextEntryNumber = entriesClaimed + 1;
  const target = nextEntryNumber * 25;
  const previousTarget = entriesClaimed * 25;
  const currentSegmentProgress = answeredCount - previousTarget;
  const percent = Math.max(0, Math.min(100, (currentSegmentProgress / 25) * 100));
  const remaining = Math.max(0, target - answeredCount);

  return `
    <div style="margin-bottom:18px;">
      <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; font-size:15px; font-weight:700;">
        <span>Progress to entry #${nextEntryNumber}</span>
        <span>${Math.min(currentSegmentProgress, 25)} / 25</span>
      </div>
      <div style="height:14px; background:#e5e7eb; border-radius:999px; overflow:hidden;">
        <div style="width:${percent}%; height:100%; background:linear-gradient(90deg, #fbbf24, #f59e0b); transition:width 0.25s ease;"></div>
      </div>
      <div style="font-size:14px; margin-top:8px; color:#374151;">
        ${remaining === 0 ? `You earned entry #${nextEntryNumber}!` : `${remaining} more answered question${remaining === 1 ? "" : "s"} until your next entry for this code.`}
      </div>
    </div>
  `;
}

async function submitAnswer() {
  if (!currentQuestion) return;

  const answer = (document.getElementById("answer").value || "").trim();
  if (!answer) {
    alert("Type an answer first.");
    return;
  }

  const codeKey = getCodeKey();

  const { error } = await client.from("responses").insert({
    session_id: sessionId,
    question_id: currentQuestion.id,
    answer_raw: answer,
    event_code: codeKey
  });

  if (error) {
    alert("Error saving answer: " + error.message);
    return;
  }

  await client.rpc("increment_question_count", {
    qid: currentQuestion.id
  });

  const answeredCount = await getAnsweredCount();
  const prompted = await maybePromptForEntry(answeredCount);

  if (!prompted) {
    loadQuestion();
  }
}

async function skipQuestion() {
  if (!currentQuestion) return;
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
  const codeKey = getCodeKey();

  const { count, error } = await client
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("event_code", codeKey);

  if (error) {
    console.error("Error counting answers:", error);
    return 0;
  }

  return count || 0;
}

async function getSessionEntryCount() {
  const codeKey = getCodeKey();

  const { count, error } = await client
    .from("contest_entries")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("event_code", codeKey);

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
    await showEntryModal(nextEntryNumber, answeredCount);
    return true;
  }

  return false;
}

// ---------- daily email limit by code ----------
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
  const codeKey = getCodeKey();
  const { startIso, endIso } = getTodayRangeLocal();

  const { count, error } = await client
    .from("contest_entries")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .eq("event_code", codeKey)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) {
    console.error("Error counting daily email entries:", error);
    return 0;
  }

  return count || 0;
}

async function getFirstSessionEntry() {
  const codeKey = getCodeKey();

  const { data, error } = await client
    .from("contest_entries")
    .select("name, email, entry_number, created_at")
    .eq("session_id", sessionId)
    .eq("event_code", codeKey)
    .order("entry_number", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Error getting first session entry:", error);
    return null;
  }

  return data && data.length ? data[0] : null;
}

// ---------- entry modal ----------
async function showEntryModal(entryNumber, answeredCount) {
  const modal = document.getElementById("entryModal");
  const title = document.getElementById("entryTitle");
  const blurb = document.getElementById("entryBlurb");
  const errorBox = document.getElementById("entryError");
  const nameInput = document.getElementById("entryName");
  const emailInput = document.getElementById("entryEmail");
  const submitBtn = document.getElementById("submitEntryBtn");
  const skipBtn = document.getElementById("skipEntryBtn");
  const formWrap = document.getElementById("entryFormWrap");
  const savedInfo = document.getElementById("entrySavedInfo");

  title.textContent = `You earned entry #${entryNumber}!`;
  errorBox.textContent = "";
  modal.style.display = "flex";

  if (entryNumber === 1) {
    formWrap.style.display = "flex";
    savedInfo.style.display = "none";
    nameInput.value = "";
    emailInput.value = "";

    blurb.textContent =
      `You have submitted ${answeredCount} answers for this code. Enter your name and email to claim your first entry. Limit 3 entries per day per email per code.`;

    submitBtn.textContent = "Claim Entry";

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
        errorBox.textContent = "That email has already claimed the maximum 3 entries for this code today.";
        return;
      }

      const { error } = await client.from("contest_entries").insert({
        session_id: sessionId,
        event_code: getCodeKey(),
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
  } else {
    const firstEntry = await getFirstSessionEntry();

    if (!firstEntry) {
      hideEntryModal();
      alert("Please claim entry #1 for this code first.");
      await loadQuestion();
      return;
    }

    formWrap.style.display = "none";
    savedInfo.style.display = "block";
    savedInfo.innerHTML = `
      <strong>Claiming with:</strong><br>
      ${escapeHtml(firstEntry.name)}<br>
      ${escapeHtml(firstEntry.email)}
    `;

    blurb.textContent =
      `You have submitted ${answeredCount} answers for this code. Click below to claim entry #${entryNumber} using the same info from your first entry.`;

    submitBtn.textContent = `Claim Entry #${entryNumber}`;

    submitBtn.onclick = async () => {
      const dailyCount = await getTodayEntryCountByEmail(firstEntry.email);
      if (dailyCount >= 3) {
        errorBox.textContent = "That email has already claimed the maximum 3 entries for this code today.";
        return;
      }

      const { error } = await client.from("contest_entries").insert({
        session_id: sessionId,
        event_code: getCodeKey(),
        entry_number: entryNumber,
        name: firstEntry.name,
        email: firstEntry.email
      });

      if (error) {
        errorBox.textContent = "Error saving entry: " + error.message;
        return;
      }

      hideEntryModal();
      loadQuestion();
    };
  }

  skipBtn.onclick = async () => {
    hideEntryModal();
    await loadQuestion();
  };
}

function hideEntryModal() {
  const modal = document.getElementById("entryModal");
  if (modal) modal.style.display = "none";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}