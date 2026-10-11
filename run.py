"""
Sage AI Interactive Teacher - Startup Runner
Supports local browser, LAN Wi-Fi access (phones & tablets),
and global public HTTPS sharing via Cloudflare quick tunnel (--share).
"""

import os
import sys
import socket
import argparse
import webbrowser
import threading
import subprocess
import time
import urllib.request
import uvicorn

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def start_cloudflare_tunnel(port):
    """Starts a free temporary Cloudflare tunnel to expose Sage globally via HTTPS."""
    exe_name = "cloudflared.exe" if sys.platform == "win32" else "cloudflared"
    project_root = os.path.dirname(os.path.abspath(__file__))
    cf_path = os.path.join(project_root, exe_name)

    if not os.path.exists(cf_path):
        print("📥 Downloading Cloudflare Tunnel binary for instant global sharing...")
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" if sys.platform == "win32" else "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        try:
            urllib.request.urlretrieve(url, cf_path)
            if sys.platform != "win32":
                os.chmod(cf_path, 0o755)
            print("✓ Cloudflare Tunnel binary ready.")
        except Exception as e:
            print(f"⚠️ Could not auto-download cloudflared: {e}")
            return None

    cmd = [cf_path, "tunnel", "--url", f"http://127.0.0.1:{port}"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)

    tunnel_url = None
    import re
    # Scan output for trycloudflare URL
    for line in iter(proc.stdout.readline, ""):
        match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
        if match:
            tunnel_url = match.group(0)
            break
        if "error" in line.lower() and "failed" in line.lower():
            break

    return tunnel_url

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Start Sage Interactive AI Teacher")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default 8000)")
    parser.add_argument("--share", action="store_true", help="Generate public HTTPS tunnel link for any device worldwide")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open local browser")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.abspath(__file__))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    port = args.port
    local_ip = get_local_ip()

    print("=" * 68)
    print("🎓 SAGE: Interactive Live AI Teacher")
    print("NotebookLM Live Mode • Multi-Device • Anti-Drift Guardian")
    print("=" * 68)
    print(f"💻 Local Computer:             http://localhost:{port}")
    if local_ip != "127.0.0.1":
        print(f"📱 Phone/Tablet (Same Wi-Fi):   http://{local_ip}:{port}")

    if args.share:
        print("\n⏳ Initializing global HTTPS tunnel...")
        tunnel_url = start_cloudflare_tunnel(port)
        if tunnel_url:
            print(f"🌍 Worldwide Mobile Link:      {tunnel_url}")
            print("   (Open this on ANY phone, tablet, or device anywhere in the world!)")
        else:
            print("⚠️ Tunnel setup timed out. Local network link remains active.")
    else:
        print("\n💡 Tip: Run 'python run.py --share' to generate a public HTTPS link")
        print("   that you can open on any phone anywhere via cellular data or internet!")
    print("=" * 68)

    if not args.no_browser:
        def open_browser():
            time.sleep(1.2)
            webbrowser.open(f"http://localhost:{port}")
        threading.Thread(target=open_browser, daemon=True).start()

    # Bind to 0.0.0.0 so all network interfaces and devices can access
    uvicorn.run("backend.app:app", host="0.0.0.0", port=port, reload=False, log_level="info")
