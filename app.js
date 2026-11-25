
/* ==========================================
   FILE UPLOAD
========================================== */

$("uploadBtn").addEventListener("click", () => {
  $("fileInput").click();
});

$("fileInput").addEventListener("change", async event => {
  const files = [...event.target.files];

  if (!files.length) return;

  if (!user) {
    showMessage("vaultMessage", "Please sign in again.");
    return;
  }

  showMessage("vaultMessage", "Uploading files...");

  const errors = [];
  let uploadedCount = 0;

  for (const file of files) {
    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      errors.push(`${file.name}: Unsupported file type`);
      continue;
    }

    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const objectPath =
      `${user.id}/${crypto.randomUUID()}_${safeName}`;

    try {
      // Step 1: Upload actual file to Storage.
      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(objectPath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        errors.push(`${file.name}: ${uploadError.message}`);
        continue;
      }

      // Step 2: Save file information in database.
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
        console.error("Database insert error:", databaseError);

        // Remove uploaded object if database insertion fails.
        const { error: cleanupError } = await db.storage
          .from(BUCKET)
          .remove([objectPath]);

        if (cleanupError) {
          console.error("Storage cleanup error:", cleanupError);
        }

        errors.push(`${file.name}: ${databaseError.message}`);
        continue;
      }

      uploadedCount++;

    } catch (error) {
      console.error("Unexpected upload error:", error);
      errors.push(`${file.name}: ${error.message}`);
    }
  }

  event.target.value = "";

  // Refresh first, then show the actual result.
  await loadVault();

  if (errors.length > 0) {
    showMessage(
      "vaultMessage",
      errors.join(" | ")
    );
  } else {
    showMessage(
      "vaultMessage",
      `${uploadedCount} file(s) uploaded successfully.`
    );
  }
});
