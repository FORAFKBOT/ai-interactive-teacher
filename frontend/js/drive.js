/**
 * Google Drive & Google Account Integration for Sage AI Teacher.
 * Manages Google Account connection, Google Drive API sync,
 * and 1-Click Drive backups with zero confusing prompt popups.
 */

class GoogleDriveManager {
  constructor() {
    this.clientId = localStorage.getItem("sage_google_client_id") || "";
    this.accessToken = sessionStorage.getItem("sage_google_token") || null;
    this.tokenClient = null;
    this.folderId = localStorage.getItem("sage_drive_folder_id") || null;
    this.isSignedIn = !!sessionStorage.getItem("sage_google_token");
    this.userEmail = localStorage.getItem("sage_google_email") || null;
    this.isSyncing = false;
    
    this.onStatusChange = null;
    this.initGsi();
  }

  initGsi() {
    if (this.clientId && window.google && window.google.accounts) {
      try {
        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: this.clientId,
          scope: "https://www.googleapis.com/auth/drive.file",
          callback: (resp) => {
            if (resp.access_token) {
              this.accessToken = resp.access_token;
              sessionStorage.setItem("sage_google_token", resp.access_token);
              this.isSignedIn = true;
              this.fetchUserInfo();
              if (this.onStatusChange) this.onStatusChange(true);
            }
          }
        });
      } catch (e) {
        console.warn("GSI init warning:", e);
      }
    }
  }

  setClientId(clientId) {
    this.clientId = (clientId || "").trim();
    if (this.clientId) {
      localStorage.setItem("sage_google_client_id", this.clientId);
    } else {
      localStorage.removeItem("sage_google_client_id");
    }
    this.initGsi();
  }

  setUserEmail(email) {
    this.userEmail = (email || "").trim();
    if (this.userEmail) {
      localStorage.setItem("sage_google_email", this.userEmail);
      this.isSignedIn = true;
    } else {
      localStorage.removeItem("sage_google_email");
      this.isSignedIn = false;
    }
    if (this.onStatusChange) this.onStatusChange(this.isSignedIn);
  }

  async fetchUserInfo() {
    if (!this.accessToken) return;
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { "Authorization": `Bearer ${this.accessToken}` }
      });
      if (res.ok) {
        const info = await res.json();
        this.userEmail = info.email;
        localStorage.setItem("sage_google_email", info.email);
        this.isSignedIn = true;
        if (this.onStatusChange) this.onStatusChange(true);
      }
    } catch (e) {
      console.warn("Could not fetch user info:", e);
    }
  }

  signIn() {
    if (this.clientId && this.tokenClient) {
      this.tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
      // Instead of an alert prompt, open the unified settings modal to the Google tab!
      if (typeof openSettingsModal === "function") {
        openSettingsModal("google");
      }
    }
  }

  signOut() {
    this.accessToken = null;
    this.isSignedIn = false;
    this.userEmail = null;
    sessionStorage.removeItem("sage_google_token");
    localStorage.removeItem("sage_google_email");
    if (this.onStatusChange) this.onStatusChange(false);
  }

  async ensureSageFolder() {
    if (!this.accessToken) return null;
    if (this.folderId) return this.folderId;

    try {
      const q = encodeURIComponent("name = 'Sage AI Teacher - Notebooks' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
        headers: { "Authorization": `Bearer ${this.accessToken}` }
      });
      const data = await res.json();

      if (data.files && data.files.length > 0) {
        this.folderId = data.files[0].id;
      } else {
        const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: "Sage AI Teacher - Notebooks",
            mimeType: "application/vnd.google-apps.folder"
          })
        });
        const newFolder = await createRes.json();
        this.folderId = newFolder.id;
      }

      localStorage.setItem("sage_drive_folder_id", this.folderId);
      return this.folderId;
    } catch (e) {
      console.error("Error ensuring Drive folder:", e);
      return null;
    }
  }

  async syncNotebook(notebook) {
    if (!notebook) return null;
    this.isSyncing = true;
    if (this.onStatusChange) this.onStatusChange(true);

    try {
      if (this.accessToken) {
        const folderId = await this.ensureSageFolder();
        const filename = `${notebook.title || 'Notebook'}.sage.json`;
        const fileContent = JSON.stringify(notebook, null, 2);

        let fileId = notebook.drive_file_id;

        if (fileId) {
          const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
          const updateRes = await fetch(updateUrl, {
            method: "PATCH",
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "Content-Type": "application/json"
            },
            body: fileContent
          });
          if (!updateRes.ok) fileId = null;
        }

        if (!fileId) {
          const metadata = {
            name: filename,
            mimeType: "application/json",
            parents: folderId ? [folderId] : []
          };

          const boundary = "-------314159265358979323846";
          const delimiter = `\r\n--${boundary}\r\n`;
          const closeDelim = `\r\n--${boundary}--`;

          const multipartBody =
            delimiter +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(metadata) +
            delimiter +
            "Content-Type: application/json\r\n\r\n" +
            fileContent +
            closeDelim;

          const createRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "Content-Type": `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
          });
          const created = await createRes.json();
          fileId = created.id;
        }

        if (fileId) {
          await fetch(`/api/notebooks/${notebook.id}/drive-sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ drive_file_id: fileId, drive_folder_id: folderId })
          });
        }
        return fileId;
      } else {
        // Fallback: Trigger instant clean download to local/Drive folder
        this.exportNotebookLocal(notebook);
        return "local_backup";
      }
    } catch (e) {
      console.error("Google Drive sync failed:", e);
      return null;
    } finally {
      this.isSyncing = false;
      if (this.onStatusChange) this.onStatusChange(true);
    }
  }

  exportNotebookLocal(notebook) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notebook, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `${(notebook.title || "Notebook").replace(/[^a-zA-Z0-9_-]/g, "_")}.sage.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  }
}

window.driveMgr = new GoogleDriveManager();
