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

function normalizeEventCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function getCodeKey() {
  const normalized = normalizeEventCode(eventCode);
  return normalized || "NO_CODE";
}

function isMicroworkersCode() {
  return getCodeKey() === "MICROWORKERS";
}

// America/New_York day key like 2026-03-20
function getDayKey() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(new Date());
}

function getLocalDayRangeForEastern() {
  const now = new Date();
  const easternNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );

  const startEastern = new Date(easternNow);
  startEastern.setHours(0, 0, 0, 0);

  const endEastern = new Date(easternNow);
  endEastern.setHours(23, 59, 59, 999);

  const offsetNow =
    new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getTime() -
    now.getTime();

  const startUtc = new Date(startEastern.getTime() - offsetNow);
  const endUtc = new Date(endEastern.getTime() - offsetNow);

  return {
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString()
  };
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

  hideEntryModal();
  loadQuestion();
}

// ---------- core survey ----------
async function loadQuestion() {
  const answeredCount = await getAnsweredCount();
  const sessionEntriesClaimed = isMicroworkersCode() ? 0 : await getSessionEntryCount();

  if (isMicroworkersCode() && answeredCount >= 25) {
    await showMicroworkersCompletionScreen();
    return;
  }

  const codeKey = getCodeKey();
  const { startIso, endIso } = getLocalDayRangeForEastern();

  const { data: answeredRows, error: ansErr } = await client
    .from("responses")
    .select("question_id")
    .eq("session_id", sessionId)
    .eq("event_code", codeKey)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (ansErr) {
    document.getElementById("questionBox").innerHTML =
      `<p>Error: ${escapeHtml(ansErr.message)}</p>`;
    return;
  }

  const answeredIds = [...new Set((answeredRows || []).map((r) => r.question_id))];

  const { data: questions, error: qErr } = await client
    .from("questions")
    .select("id, question_text")
    .eq("status", "collecting");

  if (qErr) {
    document.getElementById("questionBox").innerHTML =
      `<p>Error: ${escapeHtml(qErr.message)}</p>`;
    return;
  }

  const remaining = (questions || []).filter((q) => !answeredIds.includes(q.id));

  if (remaining.length === 0) {
    document.getElementById("questionBox").innerHTML = `
      <p><strong>No more new questions for this code today.</strong></p>
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
    ${eventCode
      ? `<div style="margin-bottom:10px; font-size:14px; opacity:0.8;">Event Code: <strong>${escapeHtml(eventCode)}</strong></div>`
      : `<div style="margin-bottom:10px; font-size:14px; opacity:0.8;">No event code</div>`}

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
  if (isMicroworkersCode()) {
    const progress = Math.min(answeredCount, 25);
    const percent = Math.max(0, Math.min(100, (progress / 25) * 100));
    const remaining = Math.max(0, 25 - progress);

    return `
      <div style="margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; font-size:15px; font-weight:700;">
          <span>Progress to completion code</span>
          <span>${progress} / 25</span>
        </div>
        <div style="height:14px; background:#e5e7eb; border-radius:999px; overflow:hidden;">
          <div style="width:${percent}%; height:100%; background:linear-gradient(90deg, #60a5fa, #2563eb); transition:width 0.25s ease;"></div>
        </div>
        <div style="font-size:14px; margin-top:8px; color:#374151;">
          ${remaining === 0
            ? `You earned your completion code.`
            : `${remaining} more answered question${remaining === 1 ? "" : "s"} until your completion code.`}
        </div>
      </div>
    `;
  }

  if (entriesClaimed >= 3) {
    return `
      <div style="margin-bottom:18px;">
        <div style="font-size:15px; font-weight:700; margin-bottom:8px;">All 3 entries earned for this code today</div>
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
  const previousTarget = entriesClaimed * 25;
  const currentSegmentProgress = Math.max(0, answeredCount - previousTarget);
  const percent = Math.max(0, Math.min(100, (currentSegmentProgress / 25) * 100));
  const remaining = Math.max(0, 25 - currentSegmentProgress);

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
        ${remaining === 0
          ? `You earned entry #${nextEntryNumber}!`
          : `${remaining} more answered question${remaining === 1 ? "" : "s"} until your next entry for this code today.`}
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

  await client.rpc("increment_question_count", { qid: currentQuestion.id });

  const answeredCount = await getAnsweredCount();

  if (isMicroworkersCode()) {
    if (answeredCount >= 25) {
      await showMicroworkersCompletionScreen();
      return;
    }

    await loadQuestion();
    return;
  }

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
  hideEntryModal();

  document.getElementById("questionBox").innerHTML = `
    <h2>Thanks for helping!</h2>
    <p>Your answers were recorded.</p>

    <div class="buttonRow">
      <button id="startAgainBtn" class="primary">Start Again</button>
    </div>
  `;

  document.getElementById("startAgainBtn").addEventListener("click", loadQuestion);
}

// ---------- MICROWORKERS code assignment ----------
async function getAssignedMicroworkersCode() {
  const codeKey = getCodeKey();
  const { startIso, endIso } = getLocalDayRangeForEastern();

  const { data: existingRows, error: existingErr } = await client
    .from("microworker_codes")
    .select("id, code")
    .eq("assigned_session_id", sessionId)
    .eq("assigned_event_code", codeKey)
    .gte("assigned_at", startIso)
    .lte("assigned_at", endIso)
    .limit(1);

  if (existingErr) {
    throw new Error("Could not check existing completion code: " + existingErr.message);
  }

  if (existingRows && existingRows.length) {
    return existingRows[0].code;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: availableRows, error: availErr } = await client
      .from("microworker_codes")
      .select("id, code")
      .eq("is_assigned", false)
      .order("id", { ascending: true })
      .limit(1);

    if (availErr) {
      throw new Error("Could not fetch an available completion code: " + availErr.message);
    }

    if (!availableRows || !availableRows.length) {
      throw new Error("No completion codes remain in microworker_codes.");
    }

    const candidate = availableRows[0];

    const { data: claimedRows, error: claimErr } = await client
      .from("microworker_codes")
      .update({
        is_assigned: true,
        assigned_at: new Date().toISOString(),
        assigned_session_id: sessionId,
        assigned_event_code: codeKey
      })
      .eq("id", candidate.id)
      .eq("is_assigned", false)
      .select("code");

    if (claimErr) {
      continue;
    }

    if (claimedRows && claimedRows.length) {
      return claimedRows[0].code;
    }
  }

  throw new Error("Could not safely assign a completion code. Please try again.");
}

async function showMicroworkersCompletionScreen() {
  hideEntryModal();

  const questionBox = document.getElementById("questionBox");

  questionBox.innerHTML = `
    <div style="margin-bottom:10px; font-size:14px; opacity:0.8;">
      Event Code: <strong>${escapeHtml(getCodeKey())}</strong>
    </div>

    <div style="margin-bottom:18px;">
      <div style="font-size:15px; font-weight:700; margin-bottom:8px;">Task completed</div>
      <div style="height:14px; background:#e5e7eb; border-radius:999px; overflow:hidden;">
        <div style="width:100%; height:100%; background:linear-gradient(90deg, #60a5fa, #2563eb);"></div>
      </div>
    </div>

    <h2>Loading completion code...</h2>
  `;

  try {
    const completionCode = await getAssignedMicroworkersCode();

    questionBox.innerHTML = `
      <div style="margin-bottom:10px; font-size:14px; opacity:0.8;">
        Event Code: <strong>${escapeHtml(getCodeKey())}</strong>
      </div>

      <div style="margin-bottom:18px;">
        <div style="font-size:15px; font-weight:700; margin-bottom:8px;">Task completed</div>
        <div style="height:14px; background:#e5e7eb; border-radius:999px; overflow:hidden;">
          <div style="width:100%; height:100%; background:linear-gradient(90deg, #60a5fa, #2563eb);"></div>
        </div>
      </div>

      <h2>Completion Code</h2>
      <p>You have answered 25 questions. Submit this code in Microworkers:</p>

      <div style="
        margin:20px 0;
        padding:16px;
        border-radius:12px;
        background:#f3f4f6;
        font-size:30px;
        font-weight:800;
        letter-spacing:2px;
        text-align:center;
      ">
        ${escapeHtml(completionCode)}
      </div>

      <div class="buttonRow">
        <button id="copyCodeBtn" class="primary">Copy Code</button>
        <button id="doneBtn" class="secondary">I'm Done</button>
      </div>
    `;

    const copyBtn = document.getElementById("copyCodeBtn");
    const doneBtn = document.getElementById("doneBtn");

    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(completionCode);
          copyBtn.textContent = "Copied!";
        } catch (err) {
          alert("Could not copy automatically. Please copy the code manually.");
        }
      });
    }

    if (doneBtn) {
      doneBtn.addEventListener("click", finish);
    }
  } catch (err) {
    questionBox.innerHTML = `
      <div style="margin-bottom:10px; font-size:14px; opacity:0.8;">
        Event Code: <strong>${escapeHtml(getCodeKey())}</strong>
      </div>
      <h2>Completion Code Error</h2>
      <p>${escapeHtml(err.message || "Unknown error")}</p>
      <div class="buttonRow">
        <button id="retryMwBtn" class="primary">Try Again</button>
      </div>
    `;

    const retryBtn = document.getElementById("retryMwBtn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        showMicroworkersCompletionScreen();
      });
    }
  }
}

// ---------- counting ----------
async function getAnsweredCount() {
  const codeKey = getCodeKey();
  const { startIso, endIso } = getLocalDayRangeForEastern();

  const { count, error } = await client
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("event_code", codeKey)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) {
    console.error("Error counting answers:", error);
    return 0;
  }

  return count || 0;
}

async function getSessionEntryCount() {
  const codeKey = getCodeKey();
  const { startIso, endIso } = getLocalDayRangeForEastern();

  const { count, error } = await client
    .from("contest_entries")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("event_code", codeKey)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) {
    console.error("Error counting session entries:", error);
    return 0;
  }

  return count || 0;
}

async function maybePromptForEntry(answeredCount) {
  if (isMicroworkersCode()) {
    if (answeredCount >= 25) {
      await showMicroworkersCompletionScreen();
      return true;
    }
    return false;
  }

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
async function getTodayEntryCountByEmail(email) {
  const codeKey = getCodeKey();
  const { startIso, endIso } = getLocalDayRangeForEastern();

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

async function getFirstSessionEntryToday() {
  const codeKey = getCodeKey();
  const { startIso, endIso } = getLocalDayRangeForEastern();

  const { data, error } = await client
    .from("contest_entries")
    .select("name, email, entry_number, created_at")
    .eq("session_id", sessionId)
    .eq("event_code", codeKey)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
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
  if (isMicroworkersCode()) {
    await showMicroworkersCompletionScreen();
    return;
  }

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
      `You have submitted ${answeredCount} answers for this code today. Enter your name and email to claim your first entry. Limit 3 entries per day per email per code.`;

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
        entry_number: 1,
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
    const firstEntry = await getFirstSessionEntryToday();

    if (!firstEntry) {
      hideEntryModal();
      alert("Please claim entry #1 for this code today first.");
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
      `You have submitted ${answeredCount} answers for this code today. Click below to claim entry #${entryNumber} using the same info from your first entry today.`;

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