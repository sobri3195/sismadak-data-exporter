"""Local desktop collector. All browser operations run in one worker thread."""
import argparse
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlsplit
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from playwright.sync_api import sync_playwright
from report import create_pdf
from profiles import DEFAULT_LOGIN_URL
from collect import capture, discover_tables, inventory, now, safe_url

if getattr(sys, 'frozen', False):
    os.environ['PLAYWRIGHT_BROWSERS_PATH'] = str(Path(sys._MEIPASS) / 'chromium')


def validate_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Gunakan alamat HTTPS tanpa password/token dalam URL.')
    if parsed.query or parsed.fragment:
        raise ValueError('Masukkan alamat awal tanpa query/fragment. Pilih filter setelah login.')
    return parsed.netloc


def self_test(output):
    """CI exercises the packaged GUI runtime, bundled Chromium, and real adapter capture."""
    root = tk.Tk()
    root.withdraw()
    gui = Desktop(root)
    root.update()
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, **({'executable_path': os.environ['SISMADAK_TEST_CHROMIUM']} if os.environ.get('SISMADAK_TEST_CHROMIUM') else {}))
        page = browser.new_page()
        page.set_content('<div class="dt-container">Showing 1 to 1 of 1 entries<table><tr><th>Tanggal</th><th>Indikator</th><th>Pembilang</th><th>Penyebut</th></tr><tr><td>2025-01-01</td><td>Sintetis</td><td>0</td><td>0</td></tr></table></div>')
        project = {'schemaVersion': 1, 'synthetic': True, 'inventory': [], 'datasets': []}
        source = {'menu': 'Area Klinik', 'unit': 'Contoh', 'year': '2025', 'period': 'Januari', 'url': 'https://example.test/', 'check': 'unchecked'}
        capture(page, project, Path(tmp) / 'project.json', source)
        assert source['check'] == 'passed'
        assert source['adapter'] == 'area-klinik-harian'
        assert project['datasets'][0]['rows'][0]['Pembilang'] == '0'
        assert source['pages'][0]['rowCount'] == 1
        pdf = create_pdf(project, Path(tmp) / 'self-test.pdf')
        assert pdf.read_bytes().startswith(b'%PDF') and pdf.stat().st_size > 1000
        browser.close()
    gui.close()
    root.after(5000, root.destroy)
    root.mainloop()
    Path(output).write_text(json.dumps({'passed': True, 'frozen': bool(getattr(sys, 'frozen', False)), 'gui': True, 'chromium': True, 'pdf': True, 'adapter': source['adapter']}))


class Desktop:
    def __init__(self, root):
        self.root = root
        self.jobs, self.events = queue.Queue(), queue.Queue()
        self.stop = threading.Event()
        self.closing = False
        self.tables = []
        self.folder = Path.home() / 'SISMADAK-Collector'
        root.title('SISMADAK Collector · lokal')
        root.geometry('830x740')
        root.minsize(680, 650)
        frame = ttk.Frame(root, padding=20)
        frame.pack(fill='both', expand=True)
        ttk.Label(frame, text='Tarik data SISMADAK', font=('Segoe UI', 18, 'bold')).pack(anchor='w')
        ttk.Label(frame, text='Login sendiri pada browser. Tidak ada password/cookie yang disimpan.').pack(anchor='w', pady=(6, 14))
        self.values = {}
        self.inputs = []
        for key, label in [('url', 'Alamat HTTPS SISMADAK (tanpa query)'), ('menu', 'Nama menu aktif'), ('unit', 'Unit aktif'), ('year', 'Tahun aktif'), ('period', 'Periode/filter aktif')]:
            row = ttk.Frame(frame)
            row.pack(fill='x', pady=4)
            ttk.Label(row, text=label, width=34).pack(side='left')
            value = tk.StringVar(value=DEFAULT_LOGIN_URL if key=='url' else '')
            field = ttk.Entry(row, textvariable=value)
            field.pack(side='left', fill='x', expand=True)
            self.values[key] = value
            self.inputs.append(field)
        buttons = ttk.Frame(frame)
        buttons.pack(fill='x', pady=12)
        self.actions = []
        for text, command in [('1. Buka browser / login', lambda: self.submit('open')), ('2. Periksa tabel', lambda: self.submit('scan')), ('3. Ambil tabel', lambda: self.submit('capture'))]:
            button = ttk.Button(buttons, text=text, command=command)
            button.pack(side='left', padx=(0, 6))
            self.actions.append(button)
        ttk.Label(frame, text='Tabel yang ditemukan (pilih satu):').pack(anchor='w')
        self.choice = ttk.Combobox(frame, state='readonly')
        self.choice.pack(fill='x', pady=6)
        ttk.Label(frame, text='Adapter berbasis skema; kecocokan pada SISMADAK asli belum diverifikasi.', wraplength=740).pack(anchor='w')
        self.folder_label = ttk.Label(frame, text=f'Hasil lokal: {self.folder}', wraplength=740)
        self.folder_label.pack(anchor='w', pady=10)
        lower = ttk.Frame(frame)
        lower.pack(fill='x')
        ttk.Button(lower, text='Pilih folder hasil', command=self.choose_folder).pack(side='left')
        ttk.Button(lower, text='Buka folder hasil', command=self.open_folder).pack(side='left', padx=6)
        self.stop_button=ttk.Button(lower,text='Hentikan setelah halaman aktif',command=self.stop.set)
        self.stop_button.pack(side='left')
        export_row=ttk.Frame(frame)
        export_row.pack(fill='x',pady=(12,0))
        pdf_button=ttk.Button(export_row,text='4. Simpan PDF langsung',command=lambda:self.submit('pdf'))
        pdf_button.pack(side='left')
        self.actions.append(pdf_button)
        ttk.Label(export_row,text='Tidak memerlukan login aktif atau upload ke server.').pack(side='left',padx=8)
        self.status = tk.StringVar(value='Siap. Buka browser, login, lalu pilih menu/filter di SISMADAK.')
        ttk.Label(frame, textvariable=self.status, wraplength=750).pack(anchor='w', pady=12)
        self.log = tk.Text(frame, height=10, state='disabled', wrap='word')
        self.log.pack(fill='both', expand=True)
        ttk.Label(frame, text='Setelah menarik data, klik Simpan PDF langsung. Anda juga dapat mengimpor project.json ke web untuk pemeriksaan per baris.', wraplength=750).pack(anchor='w', pady=(12, 0))
        root.protocol('WM_DELETE_WINDOW', self.close)
        threading.Thread(target=self.worker, daemon=True).start()
        root.after(100, self.poll)

    def choose_folder(self):
        selected = filedialog.askdirectory(title='Folder hasil pribadi')
        if selected:
            self.folder = Path(selected)
            self.folder_label.configure(text=f'Hasil lokal: {self.folder}')

    def open_folder(self):
        self.folder.mkdir(parents=True, exist_ok=True)
        if sys.platform == 'win32':
            os.startfile(self.folder)
        else:
            subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(self.folder)])

    def submit(self, kind):
        data = {key: value.get().strip() for key, value in self.values.items()}
        if kind not in ('open','pdf') and not data['menu']:
            messagebox.showerror('Metadata belum lengkap', 'Isi nama menu aktif terlebih dahulu.'); return
        if kind == 'capture':
            if not data['period'] or self.choice.current() < 0:
                messagebox.showerror('Metadata belum lengkap', 'Isi periode dan periksa/pilih tabel terlebih dahulu.'); return
            selected = self.tables[self.choice.current()]
            if not selected['adapter']:
                messagebox.showerror('Adapter belum tersedia', 'Tabel ini belum cocok dengan skema yang didukung.'); return
            data['table_index'] = selected['index']
            if not messagebox.askyesno('Konfirmasi sumber', 'Pastikan menu/filter benar dan pagination berada pada halaman pertama. Mulai mengambil tabel ini?'):
                return
        data['output'] = self.folder / 'project.json'
        if kind == 'pdf':
            if not data['output'].is_file():
                selected=filedialog.askopenfilename(title='Pilih JSON hasil collector',filetypes=[('Proyek JSON','*.json')])
                if not selected: return
                data['output']=Path(selected)
            selected=filedialog.asksaveasfilename(title='Simpan PDF gabungan',initialdir=data['output'].parent,initialfile='sismadak-gabungan.pdf',defaultextension='.pdf',filetypes=[('PDF','*.pdf')])
            if not selected: return
            data['pdf_output']=Path(selected)
        for button in self.actions:
            button.configure(state='disabled')
        for field in self.inputs:
            field.configure(state='disabled')
        self.choice.configure(state='disabled')
        self.stop.clear()
        self.stop_button.configure(state='disabled' if kind=='pdf' else 'normal')
        if kind=='pdf':self.status.set('Menyusun PDF lokal; mohon tunggu hingga pesan berhasil.')
        self.jobs.put((kind, data))

    def confirm(self, text):
        response = {'ready': threading.Event(), 'value': False}
        self.events.put(('confirm', (text, response)))
        while not response['ready'].wait(0.2):
            if self.stop.is_set():
                return False
        return response['value']

    def worker(self):
        pw = browser = context = None
        origin = None
        try:
            while True:
                kind, data = self.jobs.get()
                if kind == 'close':
                    break
                try:
                    if kind == 'pdf':
                        project=json.loads(data['output'].read_text(encoding='utf-8'))
                        create_pdf(project,data['pdf_output'])
                        self.events.put(('log',f"PDF berhasil disimpan: {data['pdf_output']}. Status penarikan dan isi tercantum dalam dokumen."))
                    elif kind == 'open':
                        origin = validate_url(data['url'])
                        if browser:
                            browser.close()
                        if not pw:
                            pw = sync_playwright().start()
                        browser = pw.chromium.launch(headless=False)
                        context = browser.new_context(accept_downloads=False)
                        context.new_page().goto(data['url'], wait_until='domcontentloaded')
                        self.events.put(('log', 'Browser dibuka. Login dan pilih menu/filter sendiri.'))
                    else:
                        if not context:
                            raise ValueError('Buka browser dan login terlebih dahulu.')
                        pages = [p for p in context.pages if not p.is_closed() and urlsplit(p.url).scheme == 'https' and urlsplit(p.url).netloc == origin]
                        if not pages:
                            raise ValueError('Kembali ke halaman HTTPS SISMADAK awal setelah login.')
                        page = pages[-1]
                        if kind == 'scan':
                            found = discover_tables(page, data['menu'])
                            self.events.put(('tables', [{'index': t['index'], 'adapter': t['adapter'].name if t['adapter'] else None, 'headers': t['headers'], 'reason': t['reason']} for t in found]))
                        else:
                            output = data['output']
                            project = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {'schemaVersion': 1, 'datasets': [], 'inventory': []}
                            if project.get('schemaVersion') != 1 or not isinstance(project.get('datasets'), list) or not isinstance(project.get('inventory'), list):
                                raise ValueError('Format project.json tidak didukung. Pilih folder lain atau periksa file.')
                            inventory(page, project, origin)
                            project['inventory'].append({'menu': data['menu'], 'period': data['period'], 'unit': data['unit'], 'year': data['year'], 'status': 'halaman dikunjungi; filter dikonfirmasi pengguna'})
                            source = {key: data[key] for key in ('menu', 'unit', 'year', 'period')}
                            source.update(url=safe_url(page.url), capturedAt=now(), check='unchecked')
                            capture(page, project, output, source, confirm=self.confirm, on_progress=lambda text: self.events.put(('log', text)), table_index=data['table_index'], should_stop=self.stop.is_set)
                            self.events.put(('log', f"Selesai: {source['check']}, {source.get('rowCount', 0)} baris. Hasil: {output}. " + ' '.join(source.get('errors', []))))
                except Exception as exc:
                    text = str(exc) if isinstance(exc, ValueError) else f'{type(exc).__name__}: proses gagal; periksa koneksi, browser, atau instalasi Chromium. Progres tersimpan tetap tersedia.'
                    self.events.put(('log', text))
                finally:
                    self.events.put(('done', None))
        finally:
            if browser:
                browser.close()
            if pw:
                pw.stop()
            self.events.put(('closed', None))

    def poll(self):
        while not self.events.empty():
            kind, data = self.events.get()
            if kind == 'closed':
                self.root.destroy(); return
            if kind == 'confirm':
                text, response = data
                response['value'] = False if self.closing or self.stop.is_set() else messagebox.askyesno('Pagination', text)
                response['ready'].set()
            elif kind == 'tables':
                self.tables = data
                self.choice.configure(values=[f"Tabel {t['index']+1} · {t['adapter'] or 'adapter belum tersedia'} · {', '.join(t['headers'][:3])}" for t in data])
                if data:
                    self.choice.current(0)
                self.status.set(f'{len(data)} tabel ditemukan. Pilih tabel yang sesuai.')
            elif kind == 'log':
                self.status.set(data)
                self.log.configure(state='normal')
                self.log.insert('end', data + '\n')
                self.log.see('end')
                self.log.configure(state='disabled')
            elif kind == 'done' and not self.closing:
                self.stop_button.configure(state='normal')
                for button in self.actions:
                    button.configure(state='normal')
                for field in self.inputs:
                    field.configure(state='normal')
                self.choice.configure(state='readonly')
        self.root.after(100, self.poll)

    def close(self):
        self.closing = True
        self.stop.set()
        self.status.set('Menutup browser setelah operasi aktif selesai…')
        self.jobs.put(('close', {}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--self-test-output', default='desktop-self-test.json')
    args = parser.parse_args()
    if args.self_test:
        try:
            self_test(args.self_test_output)
        except Exception as exc:
            Path(args.self_test_output).write_text(json.dumps({'passed':False,'error':f'{type(exc).__name__}: {exc}'}))
            raise SystemExit(1)
    else:
        root = tk.Tk()
        Desktop(root)
        root.mainloop()

if __name__ == '__main__':
    main()
