"""AaaliceTavern launcher — manages backend + frontend as child processes."""

import json
import os
import signal
import socket
import subprocess
import sys
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, "config.json")


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg.get("backendPort", 18000), cfg.get("frontendPort", 15173)


def port_in_use(port):
    # Try both IPv4 and IPv6 (vite may listen on ::1 only)
    for family, addr in [(socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")]:
        try:
            with socket.socket(family, socket.SOCK_STREAM) as s:
                if s.connect_ex((addr, port)) == 0:
                    return True
        except OSError:
            continue
    return False


def kill_port(port):
    """Kill process occupying a port (Windows)."""
    try:
        result = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                pid = line.strip().split()[-1]
                subprocess.run(["taskkill", "/F", "/PID", pid],
                               capture_output=True)
                return True
    except Exception:
        pass
    return False


def wait_for_port(port, timeout=30):
    """Wait until a port is accepting connections."""
    start = time.time()
    while time.time() - start < timeout:
        if port_in_use(port):
            return True
        time.sleep(0.5)
    return False


def ensure_dependencies():
    """Auto-install backend and frontend dependencies if missing."""
    backend_dir = os.path.join(ROOT, "backend")
    frontend_dir = os.path.join(ROOT, "frontend")
    venv_dir = os.path.join(backend_dir, "venv")
    venv_python = os.path.join(venv_dir, "Scripts", "python.exe")
    node_modules = os.path.join(frontend_dir, "node_modules")

    # --- Backend: create venv + pip install ---
    if not os.path.exists(venv_python):
        print("[*] First run: setting up Python virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)
        print("[*] Installing backend dependencies...")
        pip = os.path.join(venv_dir, "Scripts", "pip.exe")
        req = os.path.join(backend_dir, "requirements.txt")
        subprocess.run([pip, "install", "-r", req], check=True)
        print("[+] Backend dependencies installed.")

    # --- Frontend: npm install ---
    if not os.path.exists(node_modules):
        print("[*] First run: installing frontend dependencies...")
        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        subprocess.run([npm, "install"], cwd=frontend_dir, check=True)
        print("[+] Frontend dependencies installed.")


def main():
    # --- Auto-setup ---
    try:
        ensure_dependencies()
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"[x] Dependency setup failed: {e}")
        print("    Please install Python 3.9+ and Node.js 18+ first.")
        input("Press Enter to exit...")
        return

    backend_port, frontend_port = load_config()

    # --- Check ports ---
    for name, port in [("Backend", backend_port), ("Frontend", frontend_port)]:
        if port_in_use(port):
            print(f"[!] {name} port {port} is already in use.")
            ans = input("    Kill existing process and continue? (Y/n): ").strip().lower()
            if ans in ("", "y", "yes"):
                kill_port(port)
                time.sleep(1)
                if port_in_use(port):
                    print(f"[x] Failed to free port {port}. Please close it manually.")
                    input("Press Enter to exit...")
                    return
            else:
                print("Aborted.")
                return

    print("=" * 44)
    print("  AaaliceTavern")
    print(f"  http://localhost:{frontend_port}")
    print("  Press Ctrl+C to stop")
    print("=" * 44)
    print()

    procs = []

    try:
        # --- Start backend ---
        backend_dir = os.path.join(ROOT, "backend")
        venv_python = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
        if not os.path.exists(venv_python):
            venv_python = sys.executable  # fallback

        print("[*] Starting backend...")
        backend = subprocess.Popen(
            [venv_python, "main.py"],
            cwd=backend_dir,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        procs.append(backend)

        # --- Start frontend ---
        print("[*] Starting frontend...")
        npx = "npx.cmd" if sys.platform == "win32" else "npx"
        frontend = subprocess.Popen(
            [npx, "vite"],
            cwd=os.path.join(ROOT, "frontend"),
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        procs.append(frontend)

        # --- Wait for backend ready ---
        print("[*] Waiting for backend...")
        if not wait_for_port(backend_port, timeout=30):
            print("[x] Backend failed to start.")
            raise KeyboardInterrupt

        # --- Wait for frontend ready ---
        print("[*] Waiting for frontend...")
        if not wait_for_port(frontend_port, timeout=30):
            print("[x] Frontend failed to start.")
            raise KeyboardInterrupt

        url = f"http://localhost:{frontend_port}"
        print(f"[+] Ready! Opening {url}")
        # Use os.startfile on Windows (more reliable than webbrowser)
        if sys.platform == "win32":
            os.startfile(url)
        else:
            webbrowser.open(url)

        # --- Keep alive until Ctrl+C or child dies ---
        while True:
            for p in procs:
                if p.poll() is not None:
                    print(f"[!] Process exited unexpectedly (pid={p.pid}).")
                    raise KeyboardInterrupt
            time.sleep(1)

    except KeyboardInterrupt:
        pass
    finally:
        print("\n[*] Shutting down...")
        for p in procs:
            if p.poll() is None:
                try:
                    # Send CTRL_BREAK to process group for graceful shutdown
                    os.kill(p.pid, signal.CTRL_BREAK_EVENT)
                except Exception:
                    pass
        # Give processes a moment to exit gracefully
        time.sleep(2)
        for p in procs:
            if p.poll() is None:
                try:
                    p.kill()
                except Exception:
                    pass
        # Final cleanup: make sure ports are free
        for port in [backend_port, frontend_port]:
            if port_in_use(port):
                kill_port(port)
        print("[+] Stopped.")


if __name__ == "__main__":
    main()
