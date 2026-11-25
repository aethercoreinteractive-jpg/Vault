
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

const screens = [
  "authScreen",
  "pinScreen",
  "calculatorScreen",
  "vaultScreen"
];

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
  $("pinInput").value =
    $("pinInput").value.replace(/\D/g, "").slice(0, 8);
});

$("pinContinue").addEventListener("click", async () => {
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

      alert("PIN saved securely to your account.");
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
  } catch (error) {
    showError("vaultMessage", error);
  }
});

/* ==========================================
   LOAD FOLDERS AND FILES
========================================== */

async function loadVault() {
  try {
    requireUser();

    showMessage("vaultMessage", "Loading your files...");

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

    $("folderPath").textContent =
      currentFolder ? "Inside folder" : "My files";

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
      rename.addEventListener("click", () => renameFolder(folder));

      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteFolder(folder));

      item.append(icon, info, open, rename, remove);
      list.append(item);
    });

    fileItems.forEach(file => {
      const item = document.createElement("div");
      item.className = "file-item";

      const icon = document.createElement("span");
      icon.className = "file-icon";
      icon.textContent =
        file.mime_type?.startsWith("video/") ? "🎬" : "🖼️";

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
    });

    showMessage(
      "vaultMessage",
      folderItems.length || fileItems.length
        ? ""
        : "This folder is empty."
    );
  } catch (error) {
    showError("vaultMessage", error);
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

    showMessage("vaultMessage", "Uploading files...");

    let uploadedCount = 0;
    const failedFiles = [];

    for (const file of selectedFiles) {
      if (
        !file.type.startsWith("image/") &&
        !file.type.startsWith("video/")
      ) {
        failedFiles.push(`${file.name}: Unsupported file type`);
        continue;
      }

      const objectPath =
        `${user.id}/${crypto.randomUUID()}_${safeFileName(file.name)}`;

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
    }

    event.target.value = "";

    await loadVault();

    if (failedFiles.length) {
      showMessage(
        "vaultMessage",
        `${uploadedCount} uploaded. ${failedFiles.join(" | ")}`
      );
    } else {
      showMessage(
        "vaultMessage",
        `${uploadedCount} file(s) uploaded successfully.`
      );
    }
  } catch (error) {
    showError("vaultMessage", error);
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

    const content = $("previewContent");
    content.replaceChildren();

    const media = document.createElement(
      file.mime_type?.startsWith("video/") ? "video" : "img"
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
  } catch (error) {
    showError("vaultMessage", error);
  }
}

$("closePreviewBtn").addEventListener("click", () => {
  $("previewDialog").close();
  $("previewContent").replaceChildren();
});

/* ==========================================
   RENAME FILE
========================================== */

async function renameFile(file) {
  const newName = prompt("Enter new file name:", file.file_name);

  if (!newName || !newName.trim()) return;

  try {
    const { error } = await db
      .from("vault_files")
      .update({ file_name: newName.trim() })
      .eq("id", file.id)
      .eq("user_id", user.id);

    if (error) throw error;

    await loadVault();
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   DELETE FILE
========================================== */

async function deleteFile(file) {
  if (!confirm(`Delete ${file.file_name}?`)) return;

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
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   RENAME FOLDER
========================================== */

async function renameFolder(folder) {
  const name = prompt("Enter new folder name:", folder.name);

  if (!name || !name.trim()) return;

  try {
    const { error } = await db
      .from("vault_folders")
      .update({ name: name.trim() })
      .eq("id", folder.id)
      .eq("user_id", user.id);

    if (error) throw error;

    await loadVault();
  } catch (error) {
    showError("vaultMessage", error);
  }
}

/* ==========================================
   DELETE EMPTY FOLDER
========================================== */

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

    if (error) throw error;

    await loadVault();
  } catch (error) {
    showError("vaultMessage", error);
  }
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
  currentPinForChange = "";
  showPinSetup("verifyCurrent");
});

$("signOutBtn").addEventListener("click", async () => {
  if (!confirm("Sign out of your account?")) return;

  try {
    const { error } = await db.auth.signOut();

    if (error) throw error;

    user = null;
    currentPinForChange = "";
    firstPin = "";
    calculatorValue = "";

    $("settingsDialog").close();
    showScreen("authScreen");
    showMessage("authMessage", "You have signed out.");
  } catch (error) {
    showError("authMessage", error);
  }
});

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
