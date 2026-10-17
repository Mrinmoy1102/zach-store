"""Zach Store Label Maker — desktop window.

Watches the inventory workbook (and Item Specs.xlsx) and rebuilds the label PDF whenever either is saved.
"""
import ctypes
import json
import os
import queue
import socket
import sys
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

TOOL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOL_DIR))
LOG_FILE = TOOL_DIR / "label_maker.log"
CONFIG_FILE = TOOL_DIR / "config.json"
ICON = TOOL_DIR / "icon.ico"
POLL_MS = 2000
RETRY_SECONDS = 10
LOCK_PORT = 47613  # only one copy of the app watches the files at a time


def file_log(msg: str):
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S}  {msg}\n")
    except OSError:
        pass


try:
    import label_maker as lm
except Exception:  # missing packages etc. — show it, since pythonw has no console
    file_log(traceback.format_exc())
    tk.Tk().withdraw()
    messagebox.showerror("Zach Store Label Maker", "The label maker couldn't start:\n\n" + traceback.format_exc(limit=1)
                         + "\nInstall the requirements with:\npython -m pip install openpyxl reportlab pillow requests")
    sys.exit(1)


def load_config() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def mtime(path: Path):
    try:
        return path.stat().st_mtime
    except OSError:
        return None


class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.cfg = load_config()
        self.inventory = Path(self.cfg.get("inventory") or lm.default_inventory())
        self.auto = tk.BooleanVar(value=self.cfg.get("auto_update", True))
        self.events: queue.Queue = queue.Queue()
        self.busy = False
        self.seen = {}          # path -> mtime used for the last successful build
        self.pending = {}       # path -> mtime noticed but not yet stable
        self.retry = False      # last build failed (or was requested mid-build); try again shortly
        self.retry_at = 0.0

        root.title("Zach Store Label Maker")
        root.geometry("640x460")
        root.minsize(520, 380)
        if ICON.exists():
            root.iconbitmap(default=str(ICON))
        self._build_ui()
        self._show_paths()
        root.after(300, lambda: self.rebuild("Starting up"))
        root.after(POLL_MS, self.poll)
        root.after(100, self.drain)

    # ── UI ──
    def _build_ui(self):
        style = ttk.Style()
        style.configure("Title.TLabel", font=("Segoe UI", 15, "bold"))
        style.configure("Status.TLabel", font=("Segoe UI", 10))
        style.configure("Accent.TButton", font=("Segoe UI", 10, "bold"))

        frame = ttk.Frame(self.root, padding=16)
        frame.pack(fill="both", expand=True)

        head = ttk.Frame(frame)
        head.pack(fill="x")
        try:
            from PIL import Image, ImageTk
            img = Image.open(lm.LOGO)
            img.thumbnail((84, 50))
            self._logo = ImageTk.PhotoImage(img)
            ttk.Label(head, image=self._logo).pack(side="left", padx=(0, 12))
        except Exception:
            pass
        titles = ttk.Frame(head)
        titles.pack(side="left", fill="x", expand=True)
        ttk.Label(titles, text="Item list & shelf labels", style="Title.TLabel").pack(anchor="w")
        self.status = ttk.Label(titles, text="Starting…", style="Status.TLabel", foreground="#605d5d")
        self.status.pack(anchor="w")

        files = ttk.LabelFrame(frame, text="Files", padding=10)
        files.pack(fill="x", pady=(14, 10))
        files.columnconfigure(1, weight=1)
        ttk.Label(files, text="Inventory:").grid(row=0, column=0, sticky="w")
        self.inv_label = ttk.Label(files, text="", foreground="#201e1d")
        self.inv_label.grid(row=0, column=1, sticky="w", padx=6)
        ttk.Button(files, text="Change…", command=self.choose_inventory).grid(row=0, column=2)
        ttk.Label(files, text="PDF:").grid(row=1, column=0, sticky="w", pady=(6, 0))
        self.pdf_label = ttk.Label(files, text="")
        self.pdf_label.grid(row=1, column=1, sticky="w", padx=6, pady=(6, 0))

        buttons = ttk.Frame(frame)
        buttons.pack(fill="x")
        self.update_btn = ttk.Button(buttons, text="Update PDF now", style="Accent.TButton", command=lambda: self.rebuild("Manual update"))
        self.update_btn.pack(side="left")
        ttk.Button(buttons, text="Open PDF", command=lambda: self.open(self.pdf_path())).pack(side="left", padx=6)
        ttk.Button(buttons, text="Edit inventory", command=lambda: self.open(self.inventory)).pack(side="left")
        ttk.Button(buttons, text="Edit specs & images", command=lambda: self.open(lm.specs_path_for(self.inventory))).pack(side="left", padx=6)
        ttk.Button(buttons, text="Photos folder", command=lambda: self.open(lm.IMAGES_DIR)).pack(side="left")

        ttk.Checkbutton(frame, text="Auto-update the PDF whenever the inventory or specs file is saved",
                        variable=self.auto, command=self.toggle_auto).pack(anchor="w", pady=(12, 2))
        ttk.Label(frame, text="Keep this window open (minimised is fine) for auto-update to work.",
                  foreground="#605d5d").pack(anchor="w")

        logbox = ttk.LabelFrame(frame, text="Activity", padding=6)
        logbox.pack(fill="both", expand=True, pady=(10, 0))
        self.log_text = tk.Text(logbox, height=8, wrap="word", font=("Consolas", 9), relief="flat",
                                background="#f3f2f2", foreground="#201e1d", state="disabled")
        scroll = ttk.Scrollbar(logbox, command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.log_text.pack(fill="both", expand=True)

    def _show_paths(self):
        self.inv_label.config(text=str(self.inventory))
        self.pdf_label.config(text=str(self.pdf_path()))

    def pdf_path(self) -> Path:
        return self.inventory.with_name(lm.PDF_NAME)

    def log(self, msg: str):
        """Thread-safe: queue a line for the activity box."""
        self.events.put(("log", msg))

    def _append(self, msg: str):
        file_log(msg)
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"{datetime.now():%H:%M:%S}  {msg}\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    # ── actions ──
    def open(self, path: Path):
        if not Path(path).exists():
            messagebox.showinfo("Zach Store Label Maker", f"{Path(path).name} doesn't exist yet.")
            return
        os.startfile(str(path))

    def choose_inventory(self):
        picked = filedialog.askopenfilename(title="Choose the inventory workbook", initialdir=str(self.inventory.parent),
                                            filetypes=[("Excel workbook", "*.xlsx *.xlsm"), ("All files", "*.*")])
        if not picked:
            return
        self.inventory = Path(picked)
        self.cfg["inventory"] = str(self.inventory)
        save_config(self.cfg)
        self.seen.clear()
        self.pending.clear()
        self._show_paths()
        self.rebuild("Inventory changed")

    def toggle_auto(self):
        self.cfg["auto_update"] = self.auto.get()
        save_config(self.cfg)
        self._append("Auto-update on." if self.auto.get() else "Auto-update off. Use “Update PDF now”.")

    def watched(self):
        return [self.inventory, lm.specs_path_for(self.inventory)]

    def rebuild(self, reason: str):
        if self.busy:
            self.retry = True
            return
        if not self.inventory.exists():
            self.status.config(text="Inventory file not found — use “Change…” to pick it.")
            return
        self.busy = True
        self.update_btn.state(["disabled"])
        self.status.config(text="Updating the PDF…")
        snapshot = {p: mtime(p) for p in self.watched()}
        self._append(f"{reason}: building PDF…")

        def work():
            try:
                pdf, count = lm.generate(self.inventory, log=self.log)
                self.events.put(("done", (pdf, count, snapshot)))
            except PermissionError as e:
                self.events.put(("fail", f"A file is locked ({Path(e.filename or '').name or 'PDF'}). "
                                         "If the PDF is open in a viewer that locks it, close it — I'll retry."))
            except Exception as e:  # noqa: BLE001
                file_log(traceback.format_exc())
                self.events.put(("fail", f"{e.__class__.__name__}: {e}"))

        threading.Thread(target=work, daemon=True).start()

    def drain(self):
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "log":
                    self._append(payload)
                elif kind == "done":
                    pdf, count, snapshot = payload
                    self.busy, self.retry = False, False
                    # The build itself may add rows to Item Specs.xlsx; take its fresh time so that doesn't retrigger.
                    # The inventory keeps its pre-build time, so a save made during the build still triggers a rebuild.
                    specs = lm.specs_path_for(self.inventory)
                    self.seen = {p: (mtime(p) if p == specs else m) for p, m in snapshot.items()}
                    self.update_btn.state(["!disabled"])
                    self.status.config(text=f"Up to date · {count} items · last built {datetime.now():%H:%M:%S}")
                    self._append(f"PDF ready: {pdf.name} ({count} items).")
                elif kind == "fail":
                    self.busy, self.retry = False, True
                    self.retry_at = time.monotonic() + RETRY_SECONDS
                    self.update_btn.state(["!disabled"])
                    self.status.config(text="Couldn't update the PDF — see Activity below.")
                    self._append("Problem: " + payload)
        except queue.Empty:
            pass
        self.root.after(150, self.drain)

    def poll(self):
        """Rebuild once a watched file's save time has changed and then stayed the same for one poll."""
        try:
            if self.auto.get() and not self.busy:
                changed = False
                for p in self.watched():
                    m = mtime(p)
                    if m is None or m == self.seen.get(p):
                        self.pending.pop(p, None)
                        continue
                    if self.pending.get(p) == m:
                        changed = True
                    else:
                        self.pending[p] = m      # just saved — wait a moment in case Excel is still writing
                if changed or (self.retry and time.monotonic() >= self.retry_at):
                    self.pending.clear()
                    self.rebuild("Inventory updated" if changed else "Retrying")
        finally:
            self.root.after(POLL_MS, self.poll)


def main():
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", LOCK_PORT))
    except OSError:
        tk.Tk().withdraw()
        messagebox.showinfo("Zach Store Label Maker", "The label maker is already running — check your taskbar.")
        return
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ZachStore.LabelMaker")
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    root = tk.Tk()
    App(root)
    root.report_callback_exception = lambda *exc: file_log("".join(traceback.format_exception(*exc)))
    root.mainloop()


if __name__ == "__main__":
    main()
