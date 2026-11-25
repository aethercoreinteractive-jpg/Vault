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
   OUR OWN WEBSITE BOXES & SNACKBAR
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

function openOverlay(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function closeOverlay(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

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
    const overlay = $("appModalOverlay");
    const eyebrowEl = $("appModalEyebrow");
    const titleEl = $("appModalTitle");
    const descEl = $("appModalDescription");
    const inputWrap = $("appModalInputWrap");
    const inputEl = $("appModalInput");
    const cancelBtn = $("appModalCancelBtn");
    const confirmBtn = $("appModalConfirmBtn");

    if (!overlay || !cancelBtn || !confirmBtn) {
      resolve(withInput ? null : false);
      return;
    }

    eyebrowEl.textContent = eyebrow;
    titleEl.textContent = title;
    descEl.textContent = description;
    descEl.classList.toggle("hidden", !description);

    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    confirmBtn.classList.toggle("is-danger", Boolean(danger));

    if (withInput && inputWrap && inputEl) {
      inputWrap.classList.remove("hidden");
      inputEl.value = defaultValue;
      inputEl.placeholder = placeholder;
    } else if (inputWrap && inputEl) {
      inputWrap.classList.add("hidden");
      inputEl.value = "";
    }

    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      cleanup();
      closeOverlay("appModalOverlay");
      resolve(result);
    };

    const onConfirm = () => {
      if (withInput) {
        finish(inputEl ? inputEl.value : "");
      } else {
        finish(true);
      }
    };

    const onCancel = () => {
      finish(withInput ? null : false);
    };

    const onKeyDown = e => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && withInput) {
        e.preventDefault();
        onConfirm();
      }
    };

    const onBackdropClick = e => {
      if (e.target === overlay) {
        onCancel();
      }
    };

    function cleanup() {
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      inputEl?.removeEventListener("keydown", onKeyDown);
      overlay.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onKeyDown);
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    inputEl?.addEventListener("keydown", onKeyDown);
    overlay.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeyDown);

    openOverlay("appModalOverlay");

    if (withInput && inputEl) {
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 40);
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
  const msg = error?.message || String(error) || "Something went wrong.";
  showMessage(id, msg);
  showSnackbar(msg);
}

async function ensureUser() {
  if (user?.id) return user;
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  user = data.session?.user || null;
  if (!user?.id) {
    throw new Error("You are not signed in. Please sign in again.");
  }
  return user;
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) {
    return "";
  }
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

function formatShortType(mimeType, fileName) {
  if (mimeType?.startsWith("video/")) {
    const ext = mimeType.split("/")[1]?.toUpperCase();
    return ext ? `VIDEO · ${ext}` : "VIDEO";
  }
  if (mimeType?.startsWith("image/")) {
    const subtype = mimeType.split("/")[1]?.replace("jpeg", "jpg")?.toUpperCase();
    return subtype ? `IMAGE · ${subtype}` : "IMAGE";
  }
  const fallbackExt = fileName?.split(".").pop()?.toUpperCase();
  return fallbackExt || "FILE";
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
  currentPinForChange = "";
  firstPin = "";
  calculatorValue = "";
  if ($("fileList")) $("fileList").replaceChildren();
  if ($("email")) $("email").value = "";
  if ($("accountPassword")) $("accountPassword").value = "";
}

/* ==========================================
   CLOUD PIN FUNCTIONS
   PIN is never saved in localStorage.
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
    } catch (_) {
      // Use the normal Supabase error below.
    }

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
  const result = await callPinFunction({
    action: "status"
  });

  return Boolean(result.hasPin);
}

async function createCloudPin(pin) {
  return callPinFunction({
    action: "setup",
    pin: String(pin)
  });
}

async function verifyCloudPin(pin) {
  return callPinFunction({
    action: "verify",
    pin: String(pin)
  });
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
    $("pinDescription").textContent =
      "Enter your existing calculator PIN";
  } else if (mode === "change") {
    $("pinTitle").textContent = "Create new PIN";
    $("pinDescription").textContent =
      "Choose your new 4–8 digit PIN";
  } else {
    $("pinTitle").textContent = "Create your PIN";
    $("pinDescription").textContent =
      "Choose your private calculator PIN";
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

$("signupBtn")?.addEventListener("click", async () => {
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
    const { data, error } = await db.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    if (data.session) {
      user = data.user;
      await afterLogin();
    } else {
      showMessage(
        "authMessage",
        "Account created. Sign in to continue."
      );
    }
  } catch (error) {
    showError("authMessage", error);
  } finally {
    $("signupBtn").disabled = false;
  }
});

$("loginBtn")?.addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("accountPassword").value;

  if (!email || !password) {
    return showMessage(
      "authMessage",
      "Enter your email and password."
    );
  }

  showMessage("authMessage", "Signing in...");
  $("loginBtn").disabled = true;

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

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
    await ensureUser();

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

$("pinInput")?.addEventListener("input", () => {
  $("pinInput").value =
    $("pinInput").value.replace(/\D/g, "").slice(0, 8);
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

$("pinContinue")?.addEventListener("click", async () => {
  const pin = $("pinInput").value;

  if (!/^\d{4,8}$/.test(pin)) {
    return showMessage(
      "pinMessage",
      "PIN must contain 4 to 8 digits."
    );
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
      $("pinDescription").textContent =
        "Enter the same PIN again";

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

    if (
      typeof result !== "number" ||
      !Number.isFinite(result)
    ) {
      throw new Error("Invalid result");
    }

    $("expression").textContent = calculatorValue;

    calculatorValue = String(
      Number(result.toPrecision(12))
    );

    updateDisplay();
  } catch {
    $("expression").textContent = "Error";
    calculatorValue = "";
    updateDisplay();
  }
}

/* ==========================================
   VAULT UNLOCK
========================================== */

async function unlockVault(pin) {
  $("expression").textContent = "Checking PIN...";

  try {
    await verifyCloudPin(pin);
    await openVault();
  } catch (error) {
    $("expression").textContent =
      error.message || "Incorrect PIN";

    calculatorValue = "";
    updateDisplay();
  }
}

async function openVault() {
  currentFolder = null;
  folderStack = [];

  await ensureUser().catch(() => {});
  populateSettingsAccountInfo();
  showScreen("vaultScreen");
  await loadVault();
}

/* ==========================================
   FOLDER NAVIGATION & CREATION
========================================== */

$("backBtn")?.addEventListener("click", async () => {
  if (folderStack.length > 0) {
    currentFolder = folderStack.pop();
    await loadVault();
  } else {
    showCalculator();
  }
});

async function handleCreateFolder() {
  const rawName = await showPromptModal({
    eyebrow: "New Folder",
    title: "Create folder",
    description: "Organize your private photos and videos inside a new folder.",
    placeholder: "Folder name",
    confirmText: "Create"
  });

  if (rawName === null) return;
  const trimmedName = String(rawName).trim();
  if (!trimmedName) {
    showSnackbar("Folder name cannot be empty.");
    return;
  }

  try {
    const activeUser = await ensureUser();

    const { error } = await db
      .from("vault_folders")
      .insert({
        user_id: activeUser.id,
        name: trimmedName,
        parent_id: currentFolder
      });

    if (error) throw error;

    await loadVault();
    showSnackbar(`Folder "${trimmedName}" created.`);
  } catch (error) {
    showError("vaultMessage", error);
  }
}

$("addFolderBtn")?.addEventListener("click", handleCreateFolder);

/* ==========================================
   LOAD FOLDERS AND FILES
========================================== */

async function loadVault() {
  try {
    const activeUser = await ensureUser();

    showMessage("vaultMessage", "Loading your files...");

    const { data: folders, error: folderError } = await db
      .from("vault_folders")
      .select("id, user_id, name, parent_id, created_at")
      .eq("user_id", activeUser.id)
      .order("name");

    if (folderError) throw folderError;

    const { data: files, error: fileError } = await db
      .from("vault_files")
      .select("id, user_id, folder_id, file_name, object_path, mime_type, size_bytes, created_at")
      .eq("user_id", activeUser.id)
      .order("created_at", { ascending: false });

    if (fileError) throw fileError;

    const folderItems = (folders || []).filter(
      folder => folder.parent_id === currentFolder
    );

    const fileItems = (files || []).filter(
      file => file.folder_id === currentFolder
    );

    $("folderPath").textContent =
      currentFolder ? "Inside folder" : "My files";

    const list = $("fileList");
    list.replaceChildren();

    folderItems.forEach(folder => {
      const item = document.createElement("div");
      item.className = "file-item";

      const icon = document.createElement("div");
      icon.className = "file-icon";
      icon.textContent = "📁";

      const info = document.createElement("div");
      info.className = "file-info";
      info.textContent = folder.name;

      const meta = document.createElement("div");
      meta.className = "file-meta";
      meta.textContent = "FOLDER";
      info.append(meta);

      const actions = document.createElement("div");
      actions.className = "file-actions";

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
      item.append(icon, info, actions);
      list.append(item);
    });

    fileItems.forEach(file => {
      const item = document.createElement("div");
      item.className = "file-item";

      const isVideo = file.mime_type?.startsWith("video/");
      const isImage = file.mime_type?.startsWith("image/");

      const icon = document.createElement("div");
      icon.className = "file-icon";

      if (isImage && file.object_path) {
        const fallbackGlyph = document.createElement("span");
        fallbackGlyph.textContent = "🖼️";
        icon.append(fallbackGlyph);

        const thumb = document.createElement("img");
        thumb.className = "file-thumb";
        thumb.alt = file.file_name;
        thumb.loading = "lazy";
        thumb.style.display = "none";

        db.storage
          .from(BUCKET)
          .createSignedUrl(file.object_path, 300)
          .then(({ data, error }) => {
            if (!error && data?.signedUrl && thumb.isConnected) {
              thumb.src = data.signedUrl;
              thumb.onload = () => {
                fallbackGlyph.style.display = "none";
                thumb.style.display = "block";
              };
            }
          })
          .catch(() => {});

        icon.append(thumb);
      } else {
        icon.textContent = isVideo ? "🎬" : "📄";
      }

      const badge = document.createElement("span");
      badge.className = "file-badge";
      badge.textContent = isVideo ? "VIDEO" : "IMAGE";
      icon.append(badge);

      const info = document.createElement("div");
      info.className = "file-info";
      info.textContent = file.file_name;

      const metaParts = [formatShortType(file.mime_type, file.file_name)];
      const formattedSize = formatBytes(file.size_bytes);
      if (formattedSize) metaParts.push(formattedSize);

      const meta = document.createElement("div");
      meta.className = "file-meta";
      meta.textContent = metaParts.join(" · ");
      info.append(meta);

      const actions = document.createElement("div");
      actions.className = "file-actions";

      const preview = document.createElement("button");
      preview.type = "button";
      preview.textContent = "View";
      preview.addEventListener("click", () => previewFile(file));

      const rename = document.createElement("button");
      rename.type = "button";
      rename.textContent = "Rename";
      rename.addEventListener("click", () => renameFile(file));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteFile(file));

      actions.append(preview, rename, remove);
      item.append(icon, info, actions);
      list.append(item);
    });

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
      list.append(empty);
      showMessage("vaultMessage", "");
    } else {
      showMessage("vaultMessage", "");
    }
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   FILE UPLOAD
========================================== */

$("uploadBtn")?.addEventListener("click", () => {
  $("fileInput").click();
});

$("fileInput")?.addEventListener("change", async event => {
  const selectedFiles = [...event.target.files];

  if (!selectedFiles.length) return;

  try {
    const activeUser = await ensureUser();

    showMessage("vaultMessage", "");
    setUploadProgress(
      true,
      5,
      `Preparing ${selectedFiles.length} file(s)...`
    );

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

      if (
        !file.type.startsWith("image/") &&
        !file.type.startsWith("video/")
      ) {
        failedFiles.push(`${file.name}: Unsupported file type`);
        continue;
      }

      const objectPath =
        `${activeUser.id}/${crypto.randomUUID()}_${safeFileName(file.name)}`;

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

      setUploadProgress(
        true,
        basePercent + 65,
        `Saving record: ${file.name}`
      );

      const { error: databaseError } = await db
        .from("vault_files")
        .insert({
          user_id: activeUser.id,
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
      showMessage(
        "vaultMessage",
        `${uploadedCount} uploaded. ${failedFiles.join(" | ")}`
      );
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
   FILE PREVIEW
========================================== */

async function previewFile(file) {
  try {
    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(file.object_path, 300);

    if (error) throw error;

    $("previewName").textContent = file.file_name;

    if ($("previewMeta")) {
      const parts = [formatShortType(file.mime_type, file.file_name)];
      const sizeStr = formatBytes(file.size_bytes);
      if (sizeStr) parts.push(sizeStr);
      $("previewMeta").textContent = parts.join(" · ");
    }

    const content = $("previewContent");
    content.replaceChildren();

    const media = document.createElement(
      file.mime_type?.startsWith("video/") ? "video" : "img"
    );

    media.src = data.signedUrl;

    if (media.tagName === "VIDEO") {
      media.controls = true;
      media.playsInline = true;
      media.autoplay = true;
    } else {
      media.alt = file.file_name;
    }

    content.append(media);
    openOverlay("previewOverlay");
  } catch (error) {
    showError("vaultMessage", error);
  }
}

$("closePreviewBtn")?.addEventListener("click", () => {
  const video = $("previewContent")?.querySelector("video");
  if (video) video.pause();
  closeOverlay("previewOverlay");
  $("previewContent").replaceChildren();
});

$("previewOverlay")?.addEventListener("click", e => {
  if (e.target === $("previewOverlay")) {
    $("closePreviewBtn").click();
  }
});

/* ==========================================
   RENAME FILE
========================================== */

async function renameFile(file) {
  const newName = await showPromptModal({
    eyebrow: "Rename File",
    title: "Rename file",
    defaultValue: file.file_name,
    placeholder: "File name",
    confirmText: "Rename"
  });

  if (newName === null) return;
  const trimmed = String(newName).trim();
  if (!trimmed || trimmed === file.file_name) return;

  try {
    const activeUser = await ensureUser();

    const { error } = await db
      .from("vault_files")
      .update({ file_name: trimmed })
      .eq("id", file.id)
      .eq("user_id", activeUser.id);

    if (error) throw error;

    await loadVault();
    showSnackbar("File renamed.");
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   DELETE FILE
========================================== */

async function deleteFile(file) {
  const confirmed = await showConfirmModal({
    eyebrow: "Permanent Action",
    title: "Delete file?",
    description: `"${file.file_name}" will be permanently removed from your vault.`,
    confirmText: "Delete",
    danger: true
  });

  if (!confirmed) return;

  try {
    const activeUser = await ensureUser();

    const { error: storageError } = await db.storage
      .from(BUCKET)
      .remove([file.object_path]);

    if (storageError) throw storageError;

    const { error } = await db
      .from("vault_files")
      .delete()
      .eq("id", file.id)
      .eq("user_id", activeUser.id);

    if (error) throw error;

    await loadVault();
    showSnackbar("File deleted.");
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   RENAME FOLDER
========================================== */

async function renameFolder(folder) {
  const name = await showPromptModal({
    eyebrow: "Rename Folder",
    title: "Rename folder",
    defaultValue: folder.name,
    placeholder: "Folder name",
    confirmText: "Rename"
  });

  if (name === null) return;
  const trimmed = String(name).trim();
  if (!trimmed || trimmed === folder.name) return;

  try {
    const activeUser = await ensureUser();

    const { error } = await db
      .from("vault_folders")
      .update({ name: trimmed })
      .eq("id", folder.id)
      .eq("user_id", activeUser.id);

    if (error) throw error;

    await loadVault();
    showSnackbar("Folder renamed.");
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   DELETE EMPTY FOLDER
========================================== */

async function deleteFolder(folder) {
  try {
    const activeUser = await ensureUser();

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
      .eq("user_id", activeUser.id);

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

async function handleOpenSettings() {
  await ensureUser().catch(() => {});
  populateSettingsAccountInfo();
  openOverlay("settingsOverlay");
}

$("settingsBtn")?.addEventListener("click", handleOpenSettings);

$("closeSettingsBtn")?.addEventListener("click", () => {
  closeOverlay("settingsOverlay");
});

$("settingsOverlay")?.addEventListener("click", e => {
  if (e.target === $("settingsOverlay")) {
    closeOverlay("settingsOverlay");
  }
});

$("changePinBtn")?.addEventListener("click", () => {
  closeOverlay("settingsOverlay");
  currentPinForChange = "";
  showPinSetup("verifyCurrent");
});

async function handleSignOut() {
  closeOverlay("settingsOverlay");

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
  closeOverlay("settingsOverlay");

  const confirmed = await showConfirmModal({
    eyebrow: "Permanent Account Deletion",
    title: "Delete your account?",
    description: "This will permanently delete all your stored files, folders, PIN settings, and vault data. This action cannot be undone.",
    confirmText: "Delete everything",
    danger: true
  });

  if (!confirmed) return;

  try {
    const activeUser = await ensureUser();
    const targetUserId = activeUser.id;

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
    } catch (_) {
      // Ignore if Edge Function only exposes status/setup/verify/change
    }

    try {
      await db.rpc("delete_user");
    } catch (_) {
      // Proceed to sign out even if RPC is not deployed
    }

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

$("signOutBtn")?.addEventListener("click", handleSignOut);
$("deleteAccountBtn")?.addEventListener("click", handleDeleteAccount);

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
