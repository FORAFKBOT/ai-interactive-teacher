/**
 * Google Drive & Google Account Integration for Sage AI Teacher.
 * Creates and manages a dedicated folder in Google Drive ("Sage AI Teacher - Notebooks"),
 * and synchronizes notebook memory on-demand when actively in use.
 */

class GoogleDriveManager {
  constructor() {
    this.clientId = localStorage.getItem("sage_google_client_id") || "";
    this.accessToken = sessionStorage.getItem("sage_google_token") || null;
    this.tokenClient = null;
    this.folderId = localStorage.getItem("sage_drive_folder_id") || null;
    this.isSignedIn = false;
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
    this.clientId = clientId.trim();
    localStorage.setItem("sage_google_client_id", this.clientId);
    this.initGsi();
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
        if (this.onStatusChange) this.onStatusChange(true);
      }
    } catch (e) {
      console.warn("Could not fetch user info:", e);
    }
  }

  signIn() {
    if (!this.clientId) {
      const id = prompt("Please enter your Google Cloud OAuth Client ID (or leave blank to use local backup):");
      if (id) {
        this.setClientId(id);
      } else {
        return;
      }
    }
    if (this.tokenClient) {
      this.tokenClient.requestAccessToken({ prompt: "consent" });
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
      // Check if folder exists
      const q = encodeURIComponent("name = 'Sage AI Teacher - Notebooks' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
        headers: { "Authorization": `Bearer ${this.accessToken}` }
      });
      const data = await res.json();

      if (data.files && data.files.length > 0) {
        this.folderId = data.files[0].id;
      } else {
        // Create folder
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
    if (!this.accessToken || !notebook) return null;
    this.isSyncing = true;
    if (this.onStatusChange) this.onStatusChange(true);

    try {
      const folderId = await this.ensureSageFolder();
      const filename = `${notebook.title || 'Notebook'}.sage.json`;
      const fileContent = JSON.stringify(notebook, null, 2);

      let fileId = notebook.drive_file_id;

      if (fileId) {
        // Update existing file in Drive on-demand
        const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
        const updateRes = await fetch(updateUrl, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${this.accessToken}`,
            "Content-Type": "application/json"
          },
          body: fileContent
        });
        if (!updateRes.ok) {
          fileId = null; // Fallback to recreate if file was deleted
        }
      }

      if (!fileId) {
        // Create multipart file upload inside the dedicated Sage folder
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

      // Record sync status in backend
      if (fileId) {
        await fetch(`/api/notebooks/${notebook.id}/drive-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ drive_file_id: fileId, drive_folder_id: folderId })
        });
      }

      return fileId;
    } catch (e) {
      console.error("Google Drive sync failed:", e);
      return null;
    } finally {
      this.isSyncing = false;
      if (this.onStatusChange) this.onStatusChange(true);
    }
  }

  // Backup / Export helper without OAuth required
  exportNotebookLocal(notebook) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notebook, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `${notebook.title.replace(/[^a-zA-Z0-9_-]/g, "_")}_backup.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  }
}

window.driveMgr = new GoogleDriveManager();
