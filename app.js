/* ==========================================
   CALCULATOR VAULT
   Supabase Authentication + Cloud PIN
   Private File Vault
========================================== */

const SUPABASE_URL = "https://rtvdmtsdzybqrlwtowrx.supabase.co";
const SUPABASE_KEY = "sb_publishable_OGre_FJbbrbXyaE5w9YvNw_BO1ZZ7w8";
const BUCKET = "vault-files";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = id => document.getElementById(id);

let user = null;
let currentFolder = null;
let folderStack = [];
let currentFolderMedia = [];
let activeViewerIndex = -1;

let calculatorValue = "";
let pinMode = "setup";
let firstPin = "";
let currentPinForChange = "";
let snackbarTimer = null;

const screens = [
  "authScreen",
  "pinScreen",
  "calculatorScreen",
  "vaultScreen"
];

/* ==========================================
   MULTI-BILLION DOLLAR LAUNCH OVERLAY
========================================== */

function setLaunchOverlay(visible, percent = 0, status = "", title = "Initializing Vault") {
  const overlay = $("vaultLaunchOverlay");
  const meter = $("launchMeterFill");
  const statusEl = $("launchStatus");
  const titleEl = $("launchTitle");

  if (!overlay) return;

  if (!visible) {
    overlay.classList.add("hidden");
    if (meter) meter.style.width = "12%";
    return;
  }

  overlay.classList.remove("hidden");
  if (titleEl && title) titleEl.textContent = title;
  if (statusEl && status) statusEl.textContent = status;
  if (meter) {
    const clamped = Math.max(8, Math.min(100, Math.round(percent)));
    meter.style.width = `${clamped}%`;
  }
}

/* ==========================================
   INBUILT WEBSITE UI MODALS & SNACKBAR
========================================== */

function showSnackbar(message, durationMs = 3600) {
  const bar = $("appSnackbar");
  const text = $("appSnackbarText");
  if (!bar || !text) return;

  text.textContent = message;
  bar.classList.remove("hidden");

  if (snackbarTimer) clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => {
    bar.classList.add("hidden");
  }, durationMs);
}

$("appSnackbarClose")?.addEventListener("click", () => {
  if (snackbarTimer) clearTimeout(snackbarTimer);
  $("appSnackbar")?.classList.add("hidden");
});

function openAppModal({
  eyebrow = "Vault",
  title = "",
  description = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  withInput = false,
  defaultValue = "",
  placeholder = ""
}) {
  return new Promise(resolve => {
    const dialog = $("appModalDialog");
    const eyebrowEl = $("appModalEyebrow");
    const titleEl = $("appModalTitle");
    const descEl = $("appModalDescription");
    const inputWrap = $("appModalInputWrap");
    const inputEl = $("appModalInput");
    const cancelBtn = $("appModalCancelBtn");
    const confirmBtn = $("appModalConfirmBtn");

    eyebrowEl.textContent = eyebrow;
    titleEl.textContent = title;
    descEl.textContent = description;
    descEl.classList.toggle("hidden", !description);

    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    confirmBtn.classList.toggle("is-danger", Boolean(danger));

    if (withInput) {
      inputWrap.classList.remove("hidden");
      inputEl.value = defaultValue;
      inputEl.placeholder = placeholder;
    } else {
      inputWrap.classList.add("hidden");
      inputEl.value = "";
    }

    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      cleanup();
      if (dialog.open) dialog.close();
      resolve(result);
    };

    const onConfirm = () => {
      if (withInput) {
        finish(inputEl.value);
      } else {
        finish(true);
      }
    };

    const onCancel = () => {
      finish(withInput ? null : false);
    };

    const onKeyDown = e => {
      if (e.key === "Enter" && withInput) {
        e.preventDefault();
        onConfirm();
      }
    };

    const onBackdropClick = e => {
      if (e.target === dialog) {
        onCancel();
      }
    };

    const onDialogClose = () => {
      onCancel();
    };

    function cleanup() {
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      inputEl.removeEventListener("keydown", onKeyDown);
      dialog.removeEventListener("click", onBackdropClick);
      dialog.removeEventListener("close", onDialogClose);
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    inputEl.addEventListener("keydown", onKeyDown);
    dialog.addEventListener("click", onBackdropClick);
    dialog.addEventListener("close", onDialogClose);

    dialog.showModal();

    if (withInput) {
      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.select();
      });
    }
  });
}

function showConfirmModal({ eyebrow, title, description, confirmText = "Confirm", danger = false }) {
  return openAppModal({
    eyebrow,
    title,
    description,
    confirmText,
    danger,
    withInput: false
  });
}

function showPromptModal({ eyebrow, title, description = "", defaultValue = "", placeholder = "", confirmText = "Save" }) {
  return openAppModal({
    eyebrow,
    title,
    description,
    confirmText,
    withInput: true,
    defaultValue,
    placeholder
  });
}

/* ==========================================
   GENERAL HELPERS
========================================== */

function showScreen(id) {
  screens.forEach(screen => {
    const element = $(screen);
    if (element) element.classList.add("hidden");
  });

  if ($(id)) $(id).classList.remove("hidden");
}

function showMessage(id, message) {
  if ($(id)) $(id).textContent = message || "";
}

function showError(id, error) {
  console.error(error);
  showMessage(
    id,
    error?.message || String(error) || "Something went wrong."
  );
}

function requireUser() {
  if (!user?.id) {
    throw new Error("You are not signed in. Please sign in again.");
  }
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function updatePinDots() {
  const dotsContainer = $("pinDots");
  if (!dotsContainer) return;
  const currentLength = ($("pinInput")?.value || "").length;
  const dots = dotsContainer.querySelectorAll(".pin-dot");
  dots.forEach((dot, index) => {
    dot.classList.toggle("filled", index < currentLength);
  });
}

function setUploadProgress(visible, percent = 0, label = "") {
  const wrap = $("uploadProgressWrap");
  const bar = $("uploadProgressBar");
  const pct = $("uploadProgressPercent");
  const lbl = $("uploadProgressLabel");

  if (!wrap) return;
  if (!visible) {
    wrap.classList.add("hidden");
    if (bar) bar.style.width = "0%";
    if (pct) pct.textContent = "0%";
    if (lbl) lbl.textContent = "";
    return;
  }

  wrap.classList.remove("hidden");
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (bar) bar.style.width = `${clamped}%`;
  if (pct) pct.textContent = `${clamped}%`;
  if (lbl && label) lbl.textContent = label;
}

function populateSettingsAccountInfo() {
  if ($("settingsAccountEmail")) {
    $("settingsAccountEmail").textContent = user?.email || "Signed in account";
  }
  if ($("settingsAccountId")) {
    $("settingsAccountId").textContent = user?.id ? `${user.id.slice(0, 8)}…` : "—";
  }
}

function resetClientSessionState() {
  user = null;
  currentFolder = null;
  folderStack = [];
  currentFolderMedia = [];
  activeViewerIndex = -1;
  currentPinForChange = "";
  firstPin = "";
  calculatorValue = "";
  if ($("fileList")) $("fileList").replaceChildren();
  if ($("email")) $("email").value = "";
  if ($("accountPassword")) $("accountPassword").value = "";
}

/* ==========================================
   CLOUD PIN FUNCTIONS
========================================== */

async function callPinFunction(payload) {
  const { data, error } = await db.functions.invoke(
    "vault-pin",
    { body: payload }
  );

  if (error) {
    let serverMessage = "";

    try {
      const response = error.context;

      if (response && typeof response.clone === "function") {
        const body = await response.clone().json();
        serverMessage = body?.error || body?.message || "";
      }
    } catch (_) {}

    throw new Error(
      serverMessage ||
      error.message ||
      "Unable to contact the PIN server."
    );
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

async function checkCloudPin() {
  const result = await callPinFunction({ action: "status" });
  return Boolean(result.hasPin);
}

async function createCloudPin(pin) {
  return callPinFunction({ action: "setup", pin: String(pin) });
}

async function verifyCloudPin(pin) {
  return callPinFunction({ action: "verify", pin: String(pin) });
}

async function changeCloudPin(oldPin, newPin) {
  return callPinFunction({
    action: "change",
    pin: String(oldPin),
    newPin: String(newPin)
  });
}

/* ==========================================
   PIN SCREEN
========================================== */

function showPinSetup(mode = "setup") {
  pinMode = mode;
  firstPin = "";

  $("pinInput").value = "";
  updatePinDots();
  $("pinContinue").disabled = false;
  $("pinContinue").textContent = "Continue";

  if (mode === "verifyCurrent") {
    $("pinTitle").textContent = "Verify current PIN";
    $("pinDescription").textContent = "Enter your existing calculator PIN";
  } else if (mode === "change") {
    $("pinTitle").textContent = "Create new PIN";
    $("pinDescription").textContent = "Choose your new 4–8 digit PIN";
  } else {
    $("pinTitle").textContent = "Create your PIN";
    $("pinDescription").textContent = "Choose your private calculator PIN";
  }

  showMessage("pinMessage", "");
  showScreen("pinScreen");
}

function showCalculator() {
  calculatorValue = "";
  $("display").textContent = "0";
  $("expression").textContent = "";
  showScreen("calculatorScreen");
}

/* ==========================================
   AUTHENTICATION
========================================== */

$("signupBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("accountPassword").value;

  if (!email || password.length < 8) {
    return showMessage(
      "authMessage",
      "Enter a valid email and password of at least 8 characters."
    );
  }

  showMessage("authMessage", "Creating account...");
  $("signupBtn").disabled = true;

  try {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session) {
      user = data.user;
      await afterLogin();
    } else {
      showMessage("authMessage", "Account created. Sign in to continue.");
    }
  } catch (error) {
    showError("authMessage", error);
  } finally {
    $("signupBtn").disabled = false;
  }
});

$("loginBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("accountPassword").value;

  if (!email || !password) {
    return showMessage("authMessage", "Enter your email and password.");
  }

  showMessage("authMessage", "Signing in...");
  $("loginBtn").disabled = true;

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;

    user = data.user;
    await afterLogin();
  } catch (error) {
    showError("authMessage", error);
  } finally {
    $("loginBtn").disabled = false;
  }
});

async function afterLogin() {
  try {
    requireUser();
    showMessage("authMessage", "Checking your secure PIN...");

    const hasPin = await checkCloudPin();
    if (hasPin) {
      showCalculator();
    } else {
      showPinSetup("setup");
    }
  } catch (error) {
    showScreen("authScreen");
    showError("authMessage", error);
  }
}

/* ==========================================
   PIN CREATION AND CHANGE
========================================== */

$("pinInput").addEventListener("input", () => {
  $("pinInput").value = $("pinInput").value.replace(/\D/g, "").slice(0, 8);
  updatePinDots();
});

document.querySelectorAll("[data-pin-digit]").forEach(btn => {
  btn.addEventListener("click", () => {
    const digit = btn.dataset.pinDigit;
    const current = $("pinInput").value;
    if (current.length < 8) {
      $("pinInput").value = current + digit;
      updatePinDots();
      showMessage("pinMessage", "");
    }
  });
});

document.querySelectorAll("[data-pin-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.pinAction;
    if (action === "clear") {
      $("pinInput").value = "";
    } else if (action === "backspace") {
      $("pinInput").value = $("pinInput").value.slice(0, -1);
    }
    updatePinDots();
    showMessage("pinMessage", "");
  });
});

$("pinContinue").addEventListener("click", async () => {
  const pin = $("pinInput").value;

  if (!/^\d{4,8}$/.test(pin)) {
    return showMessage("pinMessage", "PIN must contain 4 to 8 digits.");
  }

  $("pinContinue").disabled = true;
  showMessage("pinMessage", "Please wait...");

  try {
    if (pinMode === "verifyCurrent") {
      await verifyCloudPin(pin);
      currentPinForChange = pin;
      showPinSetup("change");
      return;
    }

    if (pinMode === "setup" || pinMode === "change") {
      firstPin = pin;
      pinMode = "confirm";

      $("pinInput").value = "";
      updatePinDots();
      $("pinTitle").textContent = "Confirm your PIN";
      $("pinDescription").textContent = "Enter the same PIN again";
      showMessage("pinMessage", "");
      return;
    }

    if (pinMode === "confirm") {
      if (pin !== firstPin) {
        firstPin = "";
        $("pinInput").value = "";
        updatePinDots();

        pinMode = currentPinForChange ? "change" : "setup";
        $("pinTitle").textContent =
          currentPinForChange ? "Create new PIN" : "Create your PIN";
        $("pinDescription").textContent =
          "The PINs did not match. Try again.";
        showMessage("pinMessage", "The PINs do not match.");
        return;
      }

      if (currentPinForChange) {
        await changeCloudPin(currentPinForChange, pin);
        currentPinForChange = "";
      } else {
        await createCloudPin(pin);
      }

      firstPin = "";
      showCalculator();
      showSnackbar("PIN saved securely to your account.");
    }
  } catch (error) {
    showError("pinMessage", error);
  } finally {
    $("pinContinue").disabled = false;
  }
});

/* ==========================================
   CALCULATOR
========================================== */

function updateDisplay() {
  $("display").textContent = calculatorValue || "0";
}

document.querySelectorAll(".key").forEach(button => {
  button.addEventListener("click", async () => {
    const action = button.dataset.action;
    const value = button.dataset.value;

    if (action === "clear") {
      calculatorValue = "";
      $("expression").textContent = "";
      updateDisplay();
      return;
    }

    if (action === "delete") {
      calculatorValue = calculatorValue.slice(0, -1);
      updateDisplay();
      return;
    }

    if (action === "equals") {
      if (/^\d{4,8}$/.test(calculatorValue)) {
        const enteredPin = calculatorValue;
        calculatorValue = "";
        updateDisplay();
        await unlockVault(enteredPin);
        return;
      }

      calculate();
      return;
    }

    if (value !== undefined) {
      calculatorValue += value;
      updateDisplay();
    }
  });
});

function calculate() {
  if (!calculatorValue) return;

  try {
    if (!/^[0-9+\-*/().% ]+$/.test(calculatorValue)) {
      throw new Error("Invalid calculation");
    }

    const result = math.evaluate(calculatorValue);

    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error("Invalid result");
    }

    $("expression").textContent = calculatorValue;
    calculatorValue = String(Number(result.toPrecision(12)));
    updateDisplay();
  } catch {
    $("expression").textContent = "Error";
    calculatorValue = "";
    updateDisplay();
  }
}

/* ==========================================
   VAULT UNLOCK & STRICT READINESS GATE
========================================== */

async function unlockVault(pin) {
  $("expression").textContent = "Verifying PIN...";
  setLaunchOverlay(true, 18, "Verifying PIN with cloud enclave...", "Unlocking Vault");

  try {
    await verifyCloudPin(pin);
    setLaunchOverlay(true, 45, "PIN verified. Preparing vault & card previews...", "Preparing Vault");

    currentFolder = null;
    folderStack = [];
    populateSettingsAccountInfo();

    await loadVault({
      onProgress: (pct, msg) => setLaunchOverlay(true, pct, msg, "Preparing Vault"),
      requireAllCardsReady: true
    });

    setLaunchOverlay(true, 100, "All cards loaded and verified.", "Vault Ready");
    await new Promise(resolve => setTimeout(resolve, 480));

    setLaunchOverlay(false);
    $("expression").textContent = "";
    showScreen("vaultScreen");
  } catch (error) {
    setLaunchOverlay(false);
    $("expression").textContent = error?.message || "Vault not ready";
    showSnackbar(error?.message || "Could not verify all vault cards.", 4200);
    calculatorValue = "";
    updateDisplay();
  }
}

/* ==========================================
   FOLDER NAVIGATION
========================================== */

$("backBtn").addEventListener("click", async () => {
  if (folderStack.length > 0) {
    currentFolder = folderStack.pop();
    await loadVault();
  } else {
    showCalculator();
  }
});

$("addFolderBtn").addEventListener("click", async () => {
  const name = await showPromptModal({
    eyebrow: "New Folder",
    title: "Create folder",
    description: "Organize your private photos and videos inside a new folder.",
    placeholder: "Folder name",
    confirmText: "Create"
  });

  if (!name || !name.trim()) return;

  try {
    requireUser();

    const { error } = await db
      .from("vault_folders")
      .insert({
        user_id: user.id,
        name: name.trim(),
        parent_id: currentFolder
      });

    if (error) throw error;

    await loadVault();
    showSnackbar(`Folder "${name.trim()}" created.`);
  } catch (error) {
    showError("vaultMessage", error);
  }
});

/* ==========================================
   LOAD FOLDERS AND VERIFIED MEDIA CARDS
========================================== */

function detectMediaKind(file) {
  const lowerName = (file.file_name || "").toLowerCase();
  const lowerPath = (file.object_path || "").toLowerCase();
  const mime = (file.mime_type || "").toLowerCase();

  const isVideo =
    mime.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|mkv|avi|3gp)$/.test(lowerName) ||
    /\.(mp4|webm|mov|m4v|mkv|avi|3gp)$/.test(lowerPath);

  if (isVideo) return "video";

  const isImage =
    mime.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|heic|heif)$/.test(lowerName) ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|heic|heif)$/.test(lowerPath);

  if (isImage) return "image";

  return "image";
}

function loadAndDecodeImage(url, altText) {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.className = "gallery-media";
    img.alt = altText || "Vault image";
    img.decoding = "async";

    let done = false;
    const finishSuccess = () => {
      if (done) return;
      done = true;
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };

    const finishError = () => {
      if (done) return;
      done = true;
      reject(new Error(`Image failed to load: ${altText || "file"}`));
    };

    img.onload = finishSuccess;
    img.onerror = finishError;
    img.src = url;

    if (img.complete && img.naturalWidth > 0) {
      finishSuccess();
    }
  });
}

function loadVideoFrame(url) {
  return new Promise((resolve, reject) => {
    const vid = document.createElement("video");
    vid.className = "gallery-media";
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "metadata";

    let done = false;
    const finishSuccess = () => {
      if (done) return;
      done = true;
      resolve(vid);
    };

    const finishError = () => {
      if (done) return;
      done = true;
      reject(new Error("Video preview failed to load."));
    };

    vid.onloadedmetadata = finishSuccess;
    vid.onloadeddata = finishSuccess;
    vid.onerror = finishError;
    vid.src = `${url}#t=0.1`;
  });
}

async function getSignedUrlForFile(file) {
  if (!file?.object_path) {
    throw new Error(`Missing storage path for "${file?.file_name || "file"}".`);
  }

  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(file.object_path, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message || `Unable to sign URL for "${file.file_name}".`
    );
  }

  return data.signedUrl;
}

async function loadVault(options = {}) {
  const { onProgress = null, requireAllCardsReady = false } = options;

  try {
    requireUser();

    showMessage("vaultMessage", "Loading your files...");
    if (onProgress) onProgress(52, "Fetching folders and media index...");

    const { data: folders, error: folderError } = await db
      .from("vault_folders")
      .select("id, user_id, name, parent_id, created_at")
      .eq("user_id", user.id)
      .order("name");

    if (folderError) throw folderError;

    const { data: files, error: fileError } = await db
      .from("vault_files")
      .select("id, user_id, folder_id, file_name, object_path, mime_type, size_bytes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (fileError) throw fileError;

    const folderItems = (folders || []).filter(
      folder => folder.parent_id === currentFolder
    );

    const fileItems = (files || []).filter(
      file => file.folder_id === currentFolder
    );

    currentFolderMedia = fileItems;

    $("folderPath").textContent =
      currentFolder ? "Inside folder" : "My files";

    const list = $("fileList");
    const fragment = document.createDocumentFragment();

    folderItems.forEach(folder => {
      const item = document.createElement("div");
      item.className = "folder-card";

      const thumb = document.createElement("div");
      thumb.className = "folder-thumb";
      thumb.textContent = "📁";
      thumb.addEventListener("click", async () => {
        folderStack.push(currentFolder);
        currentFolder = folder.id;
        await loadVault();
      });

      const title = document.createElement("div");
      title.className = "folder-title";
      title.textContent = folder.name;

      const actions = document.createElement("div");
      actions.className = "folder-actions";

      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "Open";
      open.addEventListener("click", async () => {
        folderStack.push(currentFolder);
        currentFolder = folder.id;
        await loadVault();
      });

      const rename = document.createElement("button");
      rename.type = "button";
      rename.textContent = "Rename";
      rename.addEventListener("click", () => renameFolder(folder));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteFolder(folder));

      actions.append(open, rename, remove);
      item.append(thumb, title, actions);
      fragment.append(item);
    });

    const totalMedia = fileItems.length;
    const failedCards = [];

    for (let index = 0; index < totalMedia; index++) {
      const file = fileItems[index];
      const kind = detectMediaKind(file);
      const isVideo = kind === "video";

      const stepPct = 55 + Math.round(((index + 1) / Math.max(1, totalMedia)) * 40);
      if (onProgress) {
        onProgress(stepPct, `Rendering card ${index + 1} of ${totalMedia}: ${file.file_name}`);
      }

      const card = document.createElement("div");
      card.className = "media-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", file.file_name);

      const fallback = document.createElement("span");
      fallback.className = "gallery-placeholder";
      fallback.textContent = isVideo ? "🎬" : "🖼️";
      card.append(fallback);

      if (isVideo) {
        const badge = document.createElement("span");
        badge.className = "gallery-video-pill";
        badge.textContent = "▶";
        card.append(badge);
      }

      card.addEventListener("click", () => openViewerAtIndex(index));
      card.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openViewerAtIndex(index);
        }
      });

      try {
        const signedUrl = await getSignedUrlForFile(file);
        const mediaEl = isVideo
          ? await loadVideoFrame(signedUrl)
          : await loadAndDecodeImage(signedUrl, file.file_name);

        fallback.remove();
        card.prepend(mediaEl);
      } catch (mediaErr) {
        console.error("Card render error:", mediaErr);
        failedCards.push(`${file.file_name}: ${mediaErr?.message || "Failed to load"}`);
      }

      fragment.append(card);
    }

    if (!folderItems.length && !fileItems.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <div class="empty-icon-wrap" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <div class="font-semibold text-sm text-[var(--text)]">This folder is empty</div>
        <div class="text-xs mt-1">Tap Add Files above to store photos or videos here.</div>
      `;
      fragment.append(empty);
    }

    if (requireAllCardsReady && failedCards.length > 0) {
      throw new Error(failedCards[0]);
    }

    list.replaceChildren(fragment);

    if (failedCards.length > 0) {
      showMessage("vaultMessage", failedCards.join(" | "));
    } else {
      showMessage("vaultMessage", "");
    }
  } catch (error) {
    showError("vaultMessage", error);
    if (requireAllCardsReady) {
      throw error;
    }
  }
}

/* ==========================================
   FILE UPLOAD
========================================== */

$("uploadBtn").addEventListener("click", () => {
  $("fileInput").click();
});

$("fileInput").addEventListener("change", async event => {
  const selectedFiles = [...event.target.files];

  if (!selectedFiles.length) return;

  try {
    requireUser();

    showMessage("vaultMessage", "");
    setUploadProgress(true, 5, `Preparing ${selectedFiles.length} file(s)...`);

    let uploadedCount = 0;
    const failedFiles = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const basePercent = (i / selectedFiles.length) * 100;

      setUploadProgress(
        true,
        basePercent + 10,
        `Uploading (${i + 1}/${selectedFiles.length}): ${file.name}`
      );

      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        failedFiles.push(`${file.name}: Unsupported file type`);
        continue;
      }

      const objectPath = `${user.id}/${crypto.randomUUID()}_${safeFileName(file.name)}`;

      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(objectPath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        failedFiles.push(`${file.name}: ${uploadError.message}`);
        continue;
      }

      setUploadProgress(true, basePercent + 65, `Saving record: ${file.name}`);

      const { error: databaseError } = await db
        .from("vault_files")
        .insert({
          user_id: user.id,
          folder_id: currentFolder,
          file_name: file.name,
          object_path: objectPath,
          mime_type: file.type,
          size_bytes: file.size
        });

      if (databaseError) {
        await db.storage.from(BUCKET).remove([objectPath]);
        failedFiles.push(`${file.name}: ${databaseError.message}`);
        continue;
      }

      uploadedCount++;
      setUploadProgress(
        true,
        ((i + 1) / selectedFiles.length) * 100,
        `Uploaded ${uploadedCount} of ${selectedFiles.length}`
      );
    }

    event.target.value = "";
    await loadVault();

    if (failedFiles.length) {
      showMessage("vaultMessage", `${uploadedCount} uploaded. ${failedFiles.join(" | ")}`);
    } else {
      showSnackbar(`${uploadedCount} file(s) uploaded successfully.`);
    }
  } catch (error) {
    showError("vaultMessage", error);
  } finally {
    setTimeout(() => setUploadProgress(false), 900);
  }
});

/* ==========================================
   FULL-SCREEN GALLERY VIEWER & FOLDER SWIPE
========================================== */

function pauseActiveViewerVideo() {
  const video = $("viewerSlide")?.querySelector("video");
  if (video) video.pause();
}

async function renderViewerSlide(index) {
  const slide = $("viewerSlide");
  const counter = $("viewerCounter");
  if (!slide) return;

  pauseActiveViewerVideo();
  slide.style.transition = "none";
  slide.style.transform = "translateX(0px)";
  slide.style.opacity = "1";
  slide.replaceChildren();

  const file = currentFolderMedia[index];
  if (!file) return;

  if (counter) {
    counter.textContent = currentFolderMedia.length > 1
      ? `${index + 1} / ${currentFolderMedia.length}`
      : "";
  }

  try {
    const signedUrl = await getSignedUrlForFile(file);
    if (activeViewerIndex !== index || !$("previewDialog")?.open) return;

    const kind = detectMediaKind(file);
    const media = document.createElement(
      kind === "video" ? "video" : "img"
    );
    media.src = signedUrl;

    if (media.tagName === "VIDEO") {
      media.controls = true;
      media.playsInline = true;
    } else {
      media.alt = file.file_name;
      media.draggable = false;
    }

    slide.append(media);
  } catch (error) {
    showError("vaultMessage", error);
  }
}

async function openViewerAtIndex(index) {
  if (index < 0 || index >= currentFolderMedia.length) return;
  activeViewerIndex = index;

  const dialog = $("previewDialog");
  if (!dialog.open) {
    dialog.showModal();
  }
  await renderViewerSlide(activeViewerIndex);
}

async function swipeViewerBy(delta) {
  const nextIndex = activeViewerIndex + delta;
  const slide = $("viewerSlide");

  if (nextIndex < 0 || nextIndex >= currentFolderMedia.length) {
    if (slide) {
      slide.style.transition = "transform 0.18s ease";
      slide.style.transform = "translateX(0px)";
    }
    return;
  }

  if (slide) {
    slide.style.transition = "transform 0.16s ease, opacity 0.16s ease";
    slide.style.transform = `translateX(${delta > 0 ? "-36px" : "36px"})`;
    slide.style.opacity = "0.25";
  }

  setTimeout(async () => {
    activeViewerIndex = nextIndex;
    await renderViewerSlide(activeViewerIndex);
  }, 110);
}

function setupViewerSwipe() {
  const stage = $("viewerStage");
  const slide = $("viewerSlide");
  if (!stage || !slide) return;

  let startX = 0;
  let startY = 0;
  let currentDx = 0;
  let isTracking = false;
  let isHorizontalSwipe = false;

  stage.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentDx = 0;
    isTracking = true;
    isHorizontalSwipe = false;
    slide.style.transition = "none";
  }, { passive: true });

  stage.addEventListener("touchmove", e => {
    if (!isTracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!isHorizontalSwipe) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        isHorizontalSwipe = true;
      } else if (Math.abs(dy) > 12) {
        isTracking = false;
        return;
      }
    }

    if (isHorizontalSwipe) {
      currentDx = dx;
      const atStart = activeViewerIndex <= 0 && currentDx > 0;
      const atEnd = activeViewerIndex >= currentFolderMedia.length - 1 && currentDx < 0;
      const dampedDx = (atStart || atEnd) ? currentDx * 0.25 : currentDx;
      slide.style.transform = `translateX(${dampedDx}px)`;
    }
  }, { passive: true });

  stage.addEventListener("touchend", async () => {
    if (!isTracking) return;
    isTracking = false;

    if (!isHorizontalSwipe) {
      slide.style.transition = "transform 0.18s ease";
      slide.style.transform = "translateX(0px)";
      return;
    }

    const threshold = 64;
    if (currentDx <= -threshold) {
      await swipeViewerBy(1);
    } else if (currentDx >= threshold) {
      await swipeViewerBy(-1);
    } else {
      slide.style.transition = "transform 0.18s ease";
      slide.style.transform = "translateX(0px)";
    }
    currentDx = 0;
  });
}

setupViewerSwipe();

$("closePreviewBtn").addEventListener("click", () => {
  pauseActiveViewerVideo();
  activeViewerIndex = -1;
  $("previewDialog").close();
  $("viewerSlide").replaceChildren();
});

$("viewerRenameBtn").addEventListener("click", async () => {
  const file = currentFolderMedia[activeViewerIndex];
  if (!file) return;
  await renameFile(file, true);
});

$("viewerDeleteBtn").addEventListener("click", async () => {
  const file = currentFolderMedia[activeViewerIndex];
  if (!file) return;
  await deleteFile(file, true);
});

/* ==========================================
   RENAME & DELETE FILE
========================================== */

async function renameFile(file, keepViewerOpen = false) {
  const newName = await showPromptModal({
    eyebrow: "Rename Media",
    title: "Rename file",
    defaultValue: file.file_name,
    placeholder: "File name",
    confirmText: "Rename"
  });

  if (!newName || !newName.trim() || newName.trim() === file.file_name) return;

  try {
    const { error } = await db
      .from("vault_files")
      .update({ file_name: newName.trim() })
      .eq("id", file.id)
      .eq("user_id", user.id);

    if (error) throw error;

    await loadVault();
    if (keepViewerOpen && activeViewerIndex >= 0) {
      await renderViewerSlide(activeViewerIndex);
    }
    showSnackbar("Renamed.");
  } catch (error) {
    showError("vaultMessage", error);
  }
}

async function deleteFile(file, fromViewer = false) {
  const confirmed = await showConfirmModal({
    eyebrow: "Permanent Action",
    title: "Delete file?",
    description: `"${file.file_name}" will be permanently removed from your vault.`,
    confirmText: "Delete",
    danger: true
  });

  if (!confirmed) return;

  try {
    const { error: storageError } = await db.storage
      .from(BUCKET)
      .remove([file.object_path]);

    if (storageError) throw storageError;

    const { error } = await db
      .from("vault_files")
      .delete()
      .eq("id", file.id)
      .eq("user_id", user.id);

    if (error) throw error;

    await loadVault();

    if (fromViewer) {
      if (currentFolderMedia.length === 0) {
        $("closePreviewBtn").click();
      } else {
        const nextIdx = Math.min(activeViewerIndex, currentFolderMedia.length - 1);
        await openViewerAtIndex(nextIdx);
      }
    }

    showSnackbar("Deleted.");
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   RENAME & DELETE FOLDER
========================================== */

async function renameFolder(folder) {
  const name = await showPromptModal({
    eyebrow: "Rename Folder",
    title: "Rename folder",
    defaultValue: folder.name,
    placeholder: "Folder name",
    confirmText: "Rename"
  });

  if (!name || !name.trim() || name.trim() === folder.name) return;

  try {
    const { error } = await db
      .from("vault_folders")
      .update({ name: name.trim() })
      .eq("id", folder.id)
      .eq("user_id", user.id);

    if (error) throw error;

    await loadVault();
    showSnackbar("Folder renamed.");
  } catch (error) {
    showError("vaultMessage", error);
  }
}

async function deleteFolder(folder) {
  try {
    const { count: folderCount, error: folderError } = await db
      .from("vault_folders")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", folder.id);

    if (folderError) throw folderError;

    const { count: fileCount, error: fileError } = await db
      .from("vault_files")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", folder.id);

    if (fileError) throw fileError;

    if (folderCount || fileCount) {
      return showSnackbar(
        "This folder is not empty. Delete or move its contents first."
      );
    }

    const confirmed = await showConfirmModal({
      eyebrow: "Permanent Action",
      title: "Delete folder?",
      description: `Are you sure you want to delete "${folder.name}"?`,
      confirmText: "Delete",
      danger: true
    });

    if (!confirmed) return;

    const { error } = await db
      .from("vault_folders")
      .delete()
      .eq("id", folder.id)
      .eq("user_id", user.id);

    if (error) throw error;

    await loadVault();
    showSnackbar("Folder deleted.");
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   SETTINGS, SIGN OUT & DELETE ACCOUNT
========================================== */

$("settingsBtn").addEventListener("click", () => {
  populateSettingsAccountInfo();
  $("settingsDialog").showModal();
});

$("closeSettingsBtn").addEventListener("click", () => {
  $("settingsDialog").close();
});

$("settingsDialog")?.addEventListener("click", e => {
  if (e.target === $("settingsDialog")) {
    $("settingsDialog").close();
  }
});

$("changePinBtn").addEventListener("click", () => {
  $("settingsDialog").close();
  currentPinForChange = "";
  showPinSetup("verifyCurrent");
});

async function handleSignOut() {
  if ($("settingsDialog")?.open) $("settingsDialog").close();

  const confirmed = await showConfirmModal({
    eyebrow: "Account Session",
    title: "Sign out?",
    description: "You will need to sign back in with your email and password to access your vault.",
    confirmText: "Sign out",
    danger: true
  });

  if (!confirmed) return;

  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;

    resetClientSessionState();
    showScreen("authScreen");
    showMessage("authMessage", "You have signed out.");
  } catch (error) {
    showError("authMessage", error);
  }
}

async function handleDeleteAccount() {
  if ($("settingsDialog")?.open) $("settingsDialog").close();

  const confirmed = await showConfirmModal({
    eyebrow: "Permanent Account Deletion",
    title: "Delete your account?",
    description: "This will permanently delete all your stored files, folders, PIN settings, and vault data. This action cannot be undone.",
    confirmText: "Delete everything",
    danger: true
  });

  if (!confirmed) return;

  try {
    requireUser();
    const targetUserId = user.id;

    showSnackbar("Deleting all files, folders, and account data...", 8000);

    const { data: userFiles, error: fetchFilesError } = await db
      .from("vault_files")
      .select("id, object_path")
      .eq("user_id", targetUserId);

    if (fetchFilesError) throw fetchFilesError;

    const pathsToRemove = (userFiles || [])
      .map(f => f.object_path)
      .filter(Boolean);

    if (pathsToRemove.length > 0) {
      const { error: storageRemoveError } = await db.storage
        .from(BUCKET)
        .remove(pathsToRemove);

      if (storageRemoveError) throw storageRemoveError;
    }

    const { data: listedObjects } = await db.storage
      .from(BUCKET)
      .list(targetUserId, { limit: 1000 });

    if (listedObjects && listedObjects.length > 0) {
      const orphanPaths = listedObjects
        .filter(obj => obj.name)
        .map(obj => `${targetUserId}/${obj.name}`);
      if (orphanPaths.length > 0) {
        await db.storage.from(BUCKET).remove(orphanPaths);
      }
    }

    const { error: deleteFilesError } = await db
      .from("vault_files")
      .delete()
      .eq("user_id", targetUserId);

    if (deleteFilesError) throw deleteFilesError;

    let remainingFolders = true;
    let safetyPasses = 0;
    while (remainingFolders && safetyPasses < 20) {
      safetyPasses++;
      const { data: foldersLeft } = await db
        .from("vault_folders")
        .select("id, parent_id")
        .eq("user_id", targetUserId);

      if (!foldersLeft || foldersLeft.length === 0) {
        remainingFolders = false;
        break;
      }

      const parentIds = new Set(
        foldersLeft.map(f => f.parent_id).filter(Boolean)
      );
      const leafIds = foldersLeft
        .filter(f => !parentIds.has(f.id))
        .map(f => f.id);

      const idsToDelete = leafIds.length > 0
        ? leafIds
        : foldersLeft.map(f => f.id);

      const { error: delFolderErr } = await db
        .from("vault_folders")
        .delete()
        .in("id", idsToDelete)
        .eq("user_id", targetUserId);

      if (delFolderErr) throw delFolderErr;
    }

    try {
      await callPinFunction({ action: "delete" });
    } catch (_) {}

    try {
      await db.rpc("delete_user");
    } catch (_) {}

    await db.auth.signOut();
    resetClientSessionState();
    showScreen("authScreen");
    showMessage("authMessage", "Your account data and files have been permanently deleted.");
    showSnackbar("Account and all vault data deleted.");
  } catch (error) {
    showError("vaultMessage", error);
    showSnackbar(error?.message || "Failed to delete account data.");
  }
}

$("signOutBtn").addEventListener("click", handleSignOut);
$("deleteAccountBtn").addEventListener("click", handleDeleteAccount);

/* ==========================================
   APP STARTUP
========================================== */

async function startApp() {
  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    user = data.session?.user || null;

    if (!user) {
      showScreen("authScreen");
      return;
    }

    await afterLogin();
  } catch (error) {
    showScreen("authScreen");
    showError("authMessage", error);
  }
}

db.auth.onAuthStateChange((_event, session) => {
  user = session?.user || null;
});

startApp();
