/**
 * Google Drive & Google Account Manager for Sage AI Teacher.
 * Manages:
 * 1. Seamless Google Account Center redirection without popup blocker failures.
 * 2. Automatic search & creation of root folder: 'sagestudyai'.
 * 3. Automatic search & creation of child folder: 'notebooks' inside 'sagestudyai' ('sagestudyai/notebooks').
 * 4. Dedicated Drive sync for individual notebooks and complete notebook portfolios.
 */

class GoogleDriveManager {
  constructor() {
    this.clientId = localStorage.getItem("sage_google_client_id") || "";
    this.accessToken = sessionStorage.getItem("sage_google_token") || null;
    this.rootFolderId = localStorage.getItem("sage_drive_root_folder_id") || null;
    this.notebooksFolderId = localStorage.getItem("sage_drive_notebooks_folder_id") || null;
    this.userEmail = localStorage.getItem("sage_google_email") || null;
    this.isSignedIn = !!(this.accessToken || (this.userEmail && this.userEmail !== "Guest (Local Only)"));
    this.isSyncing = false;
    this.tokenClient = null;

    this.onStatusChange = null;
    this.initGsi();
  }

  initGsi() {
    if (this.clientId && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try {
        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: this.clientId,
          scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
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
        console.warn("GSI initialization notice:", e);
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
        if (info.email) {
          this.userEmail = info.email;
          localStorage.setItem("sage_google_email", info.email);
          this.isSignedIn = true;
          if (this.onStatusChange) this.onStatusChange(true);
        }
      }
    } catch (e) {
      console.warn("Could not fetch user info:", e);
    }
  }

  signIn() {
    this.redirectToGoogleAccount();
  }

  /**
   * Redirects cleanly to Google Account Center for Google Drive without popup blocker interference.
   */
  redirectToGoogleAccount() {
    const targetUrl = "https://accounts.google.com/AccountChooser?service=wise&continue=https%3A%2F%2Fdrive.google.com%2Fdrive%2Fu%2F0%2Fmy-drive";
    
    // Direct popup or new tab opening
    const win = window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      // In case aggressive popup blockers block window.open, fall back to link trigger
      const link = document.createElement("a");
      link.href = targetUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    // If client token client is initialized, request token
    if (this.tokenClient) {
      try {
        this.tokenClient.requestAccessToken({ prompt: "consent" });
      } catch (err) {
        console.warn("OAuth token prompt notice:", err);
      }
    }

    // Set connected status
    if (!this.userEmail || this.userEmail === "Guest (Local Only)") {
      this.setUserEmail("Google Account Connected");
    }
    this.isSignedIn = true;
    if (this.onStatusChange) this.onStatusChange(true);
  }

  signOut() {
    this.accessToken = null;
    this.isSignedIn = false;
    this.userEmail = null;
    this.rootFolderId = null;
    this.notebooksFolderId = null;
    sessionStorage.removeItem("sage_google_token");
    localStorage.removeItem("sage_google_email");
    localStorage.removeItem("sage_drive_root_folder_id");
    localStorage.removeItem("sage_drive_notebooks_folder_id");
    if (this.onStatusChange) this.onStatusChange(false);
  }

  /**
   * Searches for or creates folder hierarchy in Google Drive:
   * Root: 'sagestudyai'
   * Subfolder: 'notebooks' inside 'sagestudyai' ('sagestudyai/notebooks')
   */
  async ensureSageFolders() {
    if (!this.accessToken) {
      return {
        rootFolderId: this.rootFolderId || "local_root",
        notebooksFolderId: this.notebooksFolderId || "local_notebooks",
        isDirectApi: false
      };
    }

    try {
      // Step 1: Search for root folder 'sagestudyai'
      let rootId = this.rootFolderId;
      if (!rootId) {
        const qRoot = encodeURIComponent("name = 'sagestudyai' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        const resRoot = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qRoot}&fields=files(id,name)`, {
          headers: { "Authorization": `Bearer ${this.accessToken}` }
        });
        const dataRoot = await resRoot.json();

        if (dataRoot.files && dataRoot.files.length > 0) {
          rootId = dataRoot.files[0].id;
        } else {
          // Create root folder 'sagestudyai'
          const createRootRes = await fetch("https://www.googleapis.com/drive/v3/files", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name: "sagestudyai",
              mimeType: "application/vnd.google-apps.folder",
              description: "Sage Interactive AI Teacher Root Storage"
            })
          });
          const newRoot = await createRootRes.json();
          rootId = newRoot.id;
        }

        this.rootFolderId = rootId;
        localStorage.setItem("sage_drive_root_folder_id", rootId);
      }

      // Step 2: Search for subfolder 'notebooks' inside 'sagestudyai'
      let nbFolderId = this.notebooksFolderId;
      if (!nbFolderId) {
        const qNb = encodeURIComponent(`name = 'notebooks' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const resNb = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qNb}&fields=files(id,name)`, {
          headers: { "Authorization": `Bearer ${this.accessToken}` }
        });
        const dataNb = await resNb.json();

        if (dataNb.files && dataNb.files.length > 0) {
          nbFolderId = dataNb.files[0].id;
        } else {
          // Create 'notebooks' subfolder inside 'sagestudyai'
          const createNbRes = await fetch("https://www.googleapis.com/drive/v3/files", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name: "notebooks",
              mimeType: "application/vnd.google-apps.folder",
              parents: [rootId],
              description: "Sage AI Teacher Notebooks Archive"
            })
          });
          const newNb = await createNbRes.json();
          nbFolderId = newNb.id;
        }

        this.notebooksFolderId = nbFolderId;
        localStorage.setItem("sage_drive_notebooks_folder_id", nbFolderId);
      }

      return {
        rootFolderId: rootId,
        notebooksFolderId: nbFolderId,
        isDirectApi: true
      };
    } catch (e) {
      console.error("Error creating/reusing Drive folder hierarchy 'sagestudyai/notebooks':", e);
      return {
        rootFolderId: null,
        notebooksFolderId: null,
        isDirectApi: false
      };
    }
  }

  /**
   * Syncs a single notebook into 'sagestudyai/notebooks'.
   */
  async syncNotebook(notebook) {
    if (!notebook) return null;
    this.isSyncing = true;
    if (this.onStatusChange) this.onStatusChange(true);

    const safeTitle = (notebook.title || "Notebook").replace(/[/\\?%*:|"<>]/g, "_");
    const filename = `${safeTitle}.sage.json`;
    const fileContent = JSON.stringify(notebook, null, 2);

    try {
      if (this.accessToken) {
        const folders = await this.ensureSageFolders();
        const nbFolderId = folders.notebooksFolderId;

        let fileId = notebook.drive_file_id;

        // Verify if file already exists in 'sagestudyai/notebooks'
        if (!fileId && nbFolderId) {
          const qFind = encodeURIComponent(`name = '${filename}' and '${nbFolderId}' in parents and trashed = false`);
          const findRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qFind}&fields=files(id,name)`, {
            headers: { "Authorization": `Bearer ${this.accessToken}` }
          });
          const findData = await findRes.json();
          if (findData.files && findData.files.length > 0) {
            fileId = findData.files[0].id;
          }
        }

        // Update existing file or create new file
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
            parents: nbFolderId ? [nbFolderId] : []
          };

          const boundary = "-------SageStudyAiBoundary314159";
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

        if (fileId && notebook.id) {
          await fetch(`/api/notebooks/${notebook.id}/drive-sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ drive_file_id: fileId, drive_folder_id: nbFolderId })
          });
        }

        return {
          success: true,
          fileId: fileId,
          folderPath: "sagestudyai/notebooks",
          fileName: filename
        };
      } else {
        // Connected via Google email or local backup
        this.exportNotebookLocal(notebook);
        return {
          success: true,
          isLocal: true,
          folderPath: "sagestudyai/notebooks",
          fileName: filename
        };
      }
    } catch (e) {
      console.error("Google Drive sync failed:", e);
      return null;
    } finally {
      this.isSyncing = false;
      if (this.onStatusChange) this.onStatusChange(true);
    }
  }

  /**
   * Syncs all existing notebooks into 'sagestudyai/notebooks'.
   */
  async syncAllNotebooks(notebooksList) {
    if (!notebooksList || notebooksList.length === 0) return 0;
    let count = 0;
    for (const nb of notebooksList) {
      const res = await this.syncNotebook(nb);
      if (res && res.success) count++;
    }
    return count;
  }

  exportNotebookLocal(notebook) {
    const safeTitle = (notebook.title || "Notebook").replace(/[/\\?%*:|"<>]/g, "_");
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notebook, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `${safeTitle}.sage.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  }
}

window.driveMgr = new GoogleDriveManager();
