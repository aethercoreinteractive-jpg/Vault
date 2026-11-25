
const SUPABASE_URL = "https://rtvdmtsdzybqrlwtowrx.supabase.co";
const SUPABASE_KEY = "sb_publishable_OGre_FJbbrbXyaE5w9YvNw_BO1ZZ7w8";
const BUCKET = "vault-files";

const supabase = window.supabase.createClient(
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
let previewUrl = null;
let failedAttempts = 0;
let lockUntil = 0;

function showScreen(id) {
  ["authScreen", "pinScreen", "calculatorScreen", "vaultScreen"]
    .forEach(name => $(name).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function message(id, value) {
  $(id).textContent = value || "";
}

// PIN hashing: PBKDF2 with a random salt.
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin, saltHex) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g), x => parseInt(x, 16))
    : crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const result = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: 250000,
    hash: "SHA-256"
  }, key, 256);

  return {
    salt: bytesToHex(salt),
    hash: bytesToHex(result)
  };
}

async function savePin(pin) {
  const result = await hashPin(pin);
  localStorage.setItem("vault_pin_salt", result.salt);
  localStorage.setItem("vault_pin_hash", result.hash);
}

async function verifyPin(pin) {
  const salt = localStorage.getItem("vault_pin_salt");
  const expected = localStorage.getItem("vault_pin_hash");

  if (!salt || !expected) return false;

  const result = await hashPin(pin, salt);
  return result.hash === expected;
}

function hasPin() {
  return !!localStorage.getItem("vault_pin_hash");
}

function showPinSetup(mode = "setup") {
  pinMode = mode;
  firstPin = "";
  $("pinInput").value = "";
  $("pinTitle").textContent =
    mode === "change" ? "Change your PIN" : "Create your PIN";
  $("pinDescription").textContent =
    mode === "confirm" ? "Confirm your new PIN" : "Enter a PIN (4–8 digits)";
  $("pinContinue").textContent = "Continue";
  message("pinMessage", "");
  showScreen("pinScreen");
}

function showCalculator() {
  calculatorValue = "";
  $("display").textContent = "0";
  $("expression").textContent = "";
  showScreen("calculatorScreen");
}

// Authentication
$("signupBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("accountPassword").value;

  if (!email || password.length < 8) {
    return message("authMessage", "Enter an email and password of at least 8 characters.");
  }

  message("authMessage", "Creating account...");

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) return message("authMessage", error.message);

  if (data.session) {
    user = data.user;
    afterAuthentication();
  } else {
    message("authMessage", "Check your email for the confirmation link, then sign in.");
  }
});

$("loginBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("accountPassword").value;

  message("authMessage", "Signing in...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) return message("authMessage", error.message);

  user = data.user;
  afterAuthentication();
});

function afterAuthentication() {
  if (hasPin()) {
    showCalculator();
  } else {
    showPinSetup("setup");
  }
}

// PIN creation and confirmation
$("pinContinue").addEventListener("click", async () => {
  const pin = $("pinInput").value;

  if (!/^\d{4,8}$/.test(pin)) {
    return message("pinMessage", "Enter 4 to 8 digits.");
  }

  if (pinMode === "setup" || pinMode === "change") {
    firstPin = pin;
    pinMode = "confirm";
    $("pinInput").value = "";
    $("pinTitle").textContent = "Confirm your PIN";
    $("pinDescription").textContent = "Enter the same PIN again";
    message("pinMessage", "");
    return;
  }

  if (pin !== firstPin) {
    firstPin = "";
    pinMode = pinMode === "change" ? "change" : "setup";
    $("pinInput").value = "";
    $("pinTitle").textContent =
      pinMode === "change" ? "Change your PIN" : "Create your PIN";
    $("pinDescription").textContent = "PINs did not match. Try again.";
    return message("pinMessage", "The PINs do not match.");
  }

  await savePin(pin);
  showCalculator();
});

// Calculator
function updateDisplay() {
  $("display").textContent = calculatorValue || "0";
}

document.querySelectorAll(".key").forEach(button => {
  button.addEventListener("click", () => {
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
      // A numeric PIN entered on the calculator opens the vault.
      if (/^\d{4,8}$/.test(calculatorValue)) {
        const entered = calculatorValue;
        calculatorValue = "";
        updateDisplay();
        unlockVault(entered);
        return;
      }

      calculate();
      return;
    }

    if (value) {
      calculatorValue += value;
      updateDisplay();
    }
  });
});

async function unlockVault(pin) {
  if (Date.now() < lockUntil) {
    return message("expression", "Please wait before trying again.");
  }

  const valid = await verifyPin(pin);

  if (!valid) {
    failedAttempts++;
    if (failedAttempts >= 5) {
      lockUntil = Date.now() + 30000;
      failedAttempts = 0;
    }
    $("expression").textContent = "Incorrect PIN";
    return;
  }

  failedAttempts = 0;
  await openVault();
}

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

// Vault navigation
async function openVault() {
  showScreen("vaultScreen");
  currentFolder = null;
  folderStack = [];
  await loadVault();
}

$("backBtn").addEventListener("click", async () => {
  if (folderStack.length) {
    currentFolder = folderStack.pop();
    await loadVault();
  } else {
    showCalculator();
  }
});

$("addFolderBtn").addEventListener("click", async () => {
  const name = prompt("Enter folder name:");
  if (!name || !name.trim()) return;

  const { error } = await supabase.from("vault_folders").insert({
    user_id: user.id,
    name: name.trim(),
    parent_id: currentFolder
  });

  if (error) return message("vaultMessage", error.message);

  await loadVault();
});

async function loadVault() {
  message("vaultMessage", "Loading...");

  const { data: folders, error: folderError } = await supabase
    .from("vault_folders")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  if (folderError) {
    return message("vaultMessage", folderError.message);
  }

  const { data: files, error: fileError } = await supabase
    .from("vault_files")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (fileError) {
    return message("vaultMessage", fileError.message);
  }

  $("folderPath").textContent =
    folderStack.length ? "Inside folder" : "My files";

  const folderItems = folders.filter(f =>
    f.parent_id === currentFolder
  );

  const fileItems = files.filter(f =>
    f.folder_id === currentFolder
  );

  const list = $("fileList");
  list.replaceChildren();

  for (const folder of folderItems) {
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
    rename.addEventListener("click", () => renameFolder(folder));

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteFolder(folder));

    item.append(icon, info, open, rename, remove);
    list.append(item);
  }

  for (const file of fileItems) {
    const item = document.createElement("div");
    item.className = "file-item";

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = file.mime_type?.startsWith("video/")
      ? "🎬" : "🖼️";

    const info = document.createElement("div");
    info.className = "file-info";
    info.textContent = file.file_name;

    const preview = document.createElement("button");
    preview.textContent = "View";
    preview.addEventListener("click", () => previewFile(file));

    const rename = document.createElement("button");
    rename.textContent = "Rename";
    rename.addEventListener("click", () => renameFile(file));

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteFile(file));

    item.append(icon, info, preview, rename, remove);
    list.append(item);
  }

  message("vaultMessage",
    folderItems.length || fileItems.length ? "" : "This folder is empty.");
}

// Upload photos and videos
$("uploadBtn").addEventListener("click", () => $("fileInput").click());

$("fileInput").addEventListener("change", async event => {
  const files = [...event.target.files];
  if (!files.length) return;

  message("vaultMessage", "Uploading...");

  for (const file of files) {
    if (!file.type.startsWith("image/") &&
        !file.type.startsWith("video/")) continue;

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${user.id}/${crypto.randomUUID()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      message("vaultMessage", uploadError.message);
      continue;
    }

    const { error: dbError } = await supabase.from("vault_files").insert({
      user_id: user.id,
      folder_id: currentFolder,
      file_name: file.name,
      object_path: objectPath,
      mime_type: file.type,
      size_bytes: file.size
    });

    if (dbError) {
      await supabase.storage.from(BUCKET).remove([objectPath]);
      message("vaultMessage", dbError.message);
    }
  }

  event.target.value = "";
  await loadVault();
});

// Preview
async function previewFile(file) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.object_path, 300);

  if (error) return message("vaultMessage", error.message);

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = data.signedUrl;

  $("previewName").textContent = file.file_name;
  const content = $("previewContent");
  content.replaceChildren();

  const media = document.createElement(
    file.mime_type?.startsWith("video/") ? "video" : "img"
  );

  media.src = previewUrl;
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
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
});

// Rename and delete
async function renameFile(file) {
  const newName = prompt("New file name:", file.file_name);
  if (!newName || !newName.trim()) return;

  const { error } = await supabase.from("vault_files")
    .update({ file_name: newName.trim() })
    .eq("id", file.id)
    .eq("user_id", user.id);

  if (error) return message("vaultMessage", error.message);
  await loadVault();
}

async function deleteFile(file) {
  if (!confirm(`Delete ${file.file_name}?`)) return;

  const { error: storageError } = await supabase.storage
    .from(BUCKET).remove([file.object_path]);

  if (storageError) return message("vaultMessage", storageError.message);

  const { error } = await supabase.from("vault_files")
    .delete().eq("id", file.id).eq("user_id", user.id);

  if (error) return message("vaultMessage", error.message);
  await loadVault();
}

async function renameFolder(folder) {
  const name = prompt("New folder name:", folder.name);
  if (!name || !name.trim()) return;

  const { error } = await supabase.from("vault_folders")
    .update({ name: name.trim() })
    .eq("id", folder.id).eq("user_id", user.id);

  if (error) return message("vaultMessage", error.message);
  await loadVault();
}

async function deleteFolder(folder) {
  const { count, error: countError } = await supabase
    .from("vault_folders")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", folder.id);

  if (countError) return message("vaultMessage", countError.message);

  const { count: fileCount, error: fileError } = await supabase
    .from("vault_files")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", folder.id);

  if (fileError) return message("vaultMessage", fileError.message);

  if (count || fileCount) {
    return message("vaultMessage",
      "Move or delete the folder's contents before deleting it.");
  }

  if (!confirm(`Delete folder ${folder.name}?`)) return;

  const { error } = await supabase.from("vault_folders")
    .delete().eq("id", folder.id).eq("user_id", user.id);

  if (error) return message("vaultMessage", error.message);
  await loadVault();
}

// Settings
$("settingsBtn").addEventListener("click", () => {
  $("settingsDialog").showModal();
});

$("closeSettingsBtn").addEventListener("click", () => {
  $("settingsDialog").close();
});

$("changePinBtn").addEventListener("click", () => {
  $("settingsDialog").close();
  showPinSetup("change");
});

$("signOutBtn").addEventListener("click", async () => {
  if (!confirm("Sign out of your cloud account?")) return;

  await supabase.auth.signOut();
  user = null;
  $("settingsDialog").close();
  showScreen("authScreen");
});

// Start application
async function startApp() {
  if (!window.crypto?.subtle) {
    showScreen("authScreen");
    return message("authMessage", "Secure PIN storage requires HTTPS.");
  }

  const { data } = await supabase.auth.getSession();
  user = data.session?.user || null;

  if (!user) {
    showScreen("authScreen");
  } else if (hasPin()) {
    showCalculator();
  } else {
    showPinSetup("setup");
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  user = session?.user || null;
});

startApp();
