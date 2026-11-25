
/* ==========================================
   CALCULATOR VAULT
   Supabase + Calculator + Private File Vault
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

let failedAttempts = 0;
let lockUntil = 0;
let previewUrl = null;

const screens = [
  "authScreen",
  "pinScreen",
  "calculatorScreen",
  "vaultScreen"
];

/* ==========================================
   SCREEN MANAGEMENT
========================================== */

function showScreen(id) {
  screens.forEach(screen => {
    $(screen).classList.add("hidden");
  });

  $(id).classList.remove("hidden");
}

function showMessage(id, text) {
  $(id).textContent = text || "";
}

/* ==========================================
   SECURE PIN HASHING
========================================== */

function toHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin, existingSalt = null) {
  const salt = existingSalt
    ? Uint8Array.from(
        existingSalt.match(/.{2}/g),
        value => parseInt(value, 16)
      )
    : crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return {
    salt: toHex(salt),
    hash: toHex(result)
  };
}

async function savePin(pin) {
  const result = await hashPin(pin);

  localStorage.setItem("vault_pin_salt", result.salt);
  localStorage.setItem("vault_pin_hash", result.hash);
}

async function verifyPin(pin) {
  const salt = localStorage.getItem("vault_pin_salt");
  const savedHash = localStorage.getItem("vault_pin_hash");

  if (!salt || !savedHash) return false;

  const result = await hashPin(pin, salt);

  return result.hash === savedHash;
}

function hasPin() {
  return Boolean(
    localStorage.getItem("vault_pin_hash") &&
    localStorage.getItem("vault_pin_salt")
  );
}

/* ==========================================
   PIN SCREEN
========================================== */

function showPinSetup(mode = "setup") {
  pinMode = mode;
  firstPin = "";

  $("pinInput").value = "";

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

  $("pinContinue").textContent = "Continue";

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

  const { data, error } = await db.auth.signUp({
    email,
    password
  });

  if (error) {
    return showMessage("authMessage", error.message);
  }

  if (data.session) {
    user = data.user;
    afterLogin();
  } else {
    showMessage(
      "authMessage",
      "Account created. Verify your email, then sign in."
    );
  }
});

$("loginBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("accountPassword").value;

  if (!email || !password) {
    return showMessage(
      "authMessage",
      "Enter your email and password."
    );
  }

  showMessage("authMessage", "Signing in...");

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return showMessage("authMessage", error.message);
  }

  user = data.user;
  afterLogin();
});

function afterLogin() {
  if (hasPin()) {
    showCalculator();
  } else {
    showPinSetup("setup");
  }
}

/* ==========================================
   PIN CREATION, CONFIRMATION AND CHANGE
========================================== */

$("pinContinue").addEventListener("click", async () => {
  const pin = $("pinInput").value;

  if (!/^\d{4,8}$/.test(pin)) {
    return showMessage(
      "pinMessage",
      "PIN must contain 4 to 8 digits."
    );
  }

  // Verify existing PIN before allowing a change.
  if (pinMode === "verifyCurrent") {
    const valid = await verifyPin(pin);

    if (!valid) {
      $("pinInput").value = "";

      return showMessage(
        "pinMessage",
        "Incorrect current PIN."
      );
    }

    showPinSetup("change");
    return;
  }

  // First PIN entry.
  if (pinMode === "setup" || pinMode === "change") {
    firstPin = pin;
    pinMode = "confirm";

    $("pinInput").value = "";
    $("pinTitle").textContent = "Confirm your PIN";
    $("pinDescription").textContent =
      "Enter the same PIN again";

    showMessage("pinMessage", "");
    return;
  }

  // Confirm PIN.
  if (pinMode === "confirm") {
    if (pin !== firstPin) {
      firstPin = "";
      $("pinInput").value = "";

      pinMode = hasPin() ? "change" : "setup";

      $("pinTitle").textContent =
        pinMode === "change"
          ? "Create new PIN"
          : "Create your PIN";

      $("pinDescription").textContent =
        "PINs did not match. Try again.";

      return showMessage(
        "pinMessage",
        "The PINs do not match."
      );
    }

    await savePin(pin);

    firstPin = "";
    showCalculator();
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
      // A 4–8 digit number entered alone is treated as a PIN.
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
  if (Date.now() < lockUntil) {
    return showMessage(
      "expression",
      "Too many attempts. Please wait."
    );
  }

  const valid = await verifyPin(pin);

  if (!valid) {
    failedAttempts++;

    $("expression").textContent = "Incorrect PIN";

    if (failedAttempts >= 5) {
      lockUntil = Date.now() + 30000;
      failedAttempts = 0;

      $("expression").textContent =
        "Locked for 30 seconds";
    }

    return;
  }

  failedAttempts = 0;

  await openVault();
}

async function openVault() {
  currentFolder = null;
  folderStack = [];

  showScreen("vaultScreen");

  await loadVault();
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
  const name = prompt("Enter folder name:");

  if (!name || !name.trim()) return;

  const { error } = await db
    .from("vault_folders")
    .insert({
      user_id: user.id,
      name: name.trim(),
      parent_id: currentFolder
    });

  if (error) {
    return showMessage("vaultMessage", error.message);
  }

  await loadVault();
});

/* ==========================================
   LOAD FOLDERS AND FILES
========================================== */

async function loadVault() {
  showMessage("vaultMessage", "Loading...");

  const { data: folders, error: folderError } = await db
    .from("vault_folders")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  if (folderError) {
    return showMessage(
      "vaultMessage",
      folderError.message
    );
  }

  const { data: files, error: fileError } = await db
    .from("vault_files")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (fileError) {
    return showMessage(
      "vaultMessage",
      fileError.message
    );
  }

  $("folderPath").textContent =
    folderStack.length > 0
      ? "Inside folder"
      : "My files";

  const folderItems = folders.filter(
    folder => folder.parent_id === currentFolder
  );

  const fileItems = files.filter(
    file => file.folder_id === currentFolder
  );

  const list = $("fileList");
  list.replaceChildren();

  folderItems.forEach(folder => {
    const item = document.createElement("div");
    item.className = "file-item";

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = "📁";

    const info = document.createElement("div");
    info.className = "file-info";
    info.textContent = folder.name;

    const open = document.createElement("button");
    open.textContent = "Open";

    open.addEventListener("click", async () => {
      folderStack.push(currentFolder);
      currentFolder = folder.id;
      await loadVault();
    });

    const rename = document.createElement("button");
    rename.textContent = "Rename";
    rename.addEventListener(
      "click",
      () => renameFolder(folder)
    );

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener(
      "click",
      () => deleteFolder(folder)
    );

    item.append(icon, info, open, rename, remove);
    list.append(item);
  });

  fileItems.forEach(file => {
    const item = document.createElement("div");
    item.className = "file-item";

    const icon = document.createElement("span");
    icon.className = "file-icon";

    icon.textContent =
      file.mime_type?.startsWith("video/")
        ? "🎬"
        : "🖼️";

    const info = document.createElement("div");
    info.className = "file-info";
    info.textContent = file.file_name;

    const preview = document.createElement("button");
    preview.textContent = "View";
    preview.addEventListener(
      "click",
      () => previewFile(file)
    );

    const rename = document.createElement("button");
    rename.textContent = "Rename";
    rename.addEventListener(
      "click",
      () => renameFile(file)
    );

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener(
      "click",
      () => deleteFile(file)
    );

    item.append(icon, info, preview, rename, remove);
    list.append(item);
  });

  showMessage(
    "vaultMessage",
    folderItems.length || fileItems.length
      ? ""
      : "This folder is empty."
  );
}

/* ==========================================
   FILE UPLOAD
========================================== */

$("uploadBtn").addEventListener("click", () => {
  $("fileInput").click();
});

$("fileInput").addEventListener("change", async event => {
  const files = [...event.target.files];

  if (!files.length) return;

  showMessage("vaultMessage", "Uploading files...");

  for (const file of files) {
    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      continue;
    }

    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const objectPath =
      `${user.id}/${crypto.randomUUID()}_${safeName}`;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(objectPath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      showMessage(
        "vaultMessage",
        uploadError.message
      );
      continue;
    }

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
      await db.storage
        .from(BUCKET)
        .remove([objectPath]);

      showMessage(
        "vaultMessage",
        databaseError.message
      );
    }
  }

  event.target.value = "";

  await loadVault();
});

/* ==========================================
   FILE PREVIEW
========================================== */

async function previewFile(file) {
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(file.object_path, 300);

  if (error) {
    return showMessage(
      "vaultMessage",
      error.message
    );
  }

  $("previewName").textContent = file.file_name;

  const content = $("previewContent");
  content.replaceChildren();

  const media = document.createElement(
    file.mime_type?.startsWith("video/")
      ? "video"
      : "img"
  );

  media.src = data.signedUrl;

  if (media.tagName === "VIDEO") {
    media.controls = true;
    media.playsInline = true;
  } else {
    media.alt = file.file_name;
  }

  content.append(media);

  $("previewDialog").showModal();
}

$("closePreviewBtn").addEventListener("click", () => {
  $("previewDialog").close();
  $("previewContent").replaceChildren();
});

/* ==========================================
   RENAME FILE
========================================== */

async function renameFile(file) {
  const newName = prompt(
    "Enter new file name:",
    file.file_name
  );

  if (!newName || !newName.trim()) return;

  const { error } = await db
    .from("vault_files")
    .update({
      file_name: newName.trim()
    })
    .eq("id", file.id)
    .eq("user_id", user.id);

  if (error) {
    return showMessage(
      "vaultMessage",
      error.message
    );
  }

  await loadVault();
}

/* ==========================================
   DELETE FILE
========================================== */

async function deleteFile(file) {
  if (!confirm(`Delete ${file.file_name}?`)) return;

  const { error: storageError } = await db.storage
    .from(BUCKET)
    .remove([file.object_path]);

  if (storageError) {
    return showMessage(
      "vaultMessage",
      storageError.message
    );
  }

  const { error } = await db
    .from("vault_files")
    .delete()
    .eq("id", file.id)
    .eq("user_id", user.id);

  if (error) {
    return showMessage(
      "vaultMessage",
      error.message
    );
  }

  await loadVault();
}

/* ==========================================
   RENAME FOLDER
========================================== */

async function renameFolder(folder) {
  const name = prompt(
    "Enter new folder name:",
    folder.name
  );

  if (!name || !name.trim()) return;

  const { error } = await db
    .from("vault_folders")
    .update({
      name: name.trim()
    })
    .eq("id", folder.id)
    .eq("user_id", user.id);

  if (error) {
    return showMessage(
      "vaultMessage",
      error.message
    );
  }

  await loadVault();
}

/* ==========================================
   DELETE EMPTY FOLDER
========================================== */

async function deleteFolder(folder) {
  const { count: folderCount, error: folderError } =
    await db
      .from("vault_folders")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("parent_id", folder.id);

  if (folderError) {
    return showMessage(
      "vaultMessage",
      folderError.message
    );
  }

  const { count: fileCount, error: fileError } =
    await db
      .from("vault_files")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("folder_id", folder.id);

  if (fileError) {
    return showMessage(
      "vaultMessage",
      fileError.message
    );
  }

  if (folderCount || fileCount) {
    return showMessage(
      "vaultMessage",
      "This folder is not empty. Delete or move its contents first."
    );
  }

  if (!confirm(`Delete folder ${folder.name}?`)) return;

  const { error } = await db
    .from("vault_folders")
    .delete()
    .eq("id", folder.id)
    .eq("user_id", user.id);

  if (error) {
    return showMessage(
      "vaultMessage",
      error.message
    );
  }

  await loadVault();
}

/* ==========================================
   SETTINGS
========================================== */

$("settingsBtn").addEventListener("click", () => {
  $("settingsDialog").showModal();
});

$("closeSettingsBtn").addEventListener("click", () => {
  $("settingsDialog").close();
});

$("changePinBtn").addEventListener("click", () => {
  $("settingsDialog").close();
  showPinSetup("verifyCurrent");
});

$("signOutBtn").addEventListener("click", async () => {
  if (!confirm("Sign out of your account?")) return;

  const { error } = await db.auth.signOut();

  if (error) {
    return showMessage(
      "authMessage",
      error.message
    );
  }

  user = null;

  $("settingsDialog").close();
  showScreen("authScreen");
});

/* ==========================================
   APP STARTUP
========================================== */

async function startApp() {
  if (!window.crypto?.subtle) {
    showScreen("authScreen");

    return showMessage(
      "authMessage",
      "HTTPS is required for secure PIN storage."
    );
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    showScreen("authScreen");
    return showMessage("authMessage", error.message);
  }

  user = data.session?.user || null;

  if (!user) {
    showScreen("authScreen");
    return;
  }

  if (hasPin()) {
    showCalculator();
  } else {
    showPinSetup("setup");
  }
}

db.auth.onAuthStateChange((_event, session) => {
  user = session?.user || null;
});

startApp();
