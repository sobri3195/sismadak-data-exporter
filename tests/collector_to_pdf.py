"""Download the shipped kit, capture a synthetic table, import its manifest, export PDF."""
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_collector import table

BASE = os.environ.get('SISMADAK_TEST_URL', 'http://127.0.0.1:3000')
for attempt in range(60):
    try:
        with urllib.request.urlopen(BASE, timeout=1):
            break
    except OSError:
        if attempt == 59:
            raise
        time.sleep(0.5)

with tempfile.TemporaryDirectory(prefix='sismadak-flow-') as tmp, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('SISMADAK_TEST_CHROMIUM', '/usr/bin/chromium'))
    app = browser.new_page(accept_downloads=True)
    errors = []
    app.on('pageerror', lambda error: errors.append(str(error)))
    app.goto(BASE)
    assert app.get_by_role('button', name='Buat PDF gabungan', exact=True).is_disabled()
    with app.expect_download() as event:
        app.get_by_role('link', name='↓ Unduh collector (.zip)', exact=True).click()
    archive = zipfile.ZipFile(io.BytesIO(event.value.path().read_bytes()))
    assert set(archive.namelist()) == {'collect.py', 'requirements.txt', 'PANDUAN.md', 'mulai.cmd', 'mulai.sh', 'SHA256SUMS.txt'}
    archive.extractall(tmp)
    spec = importlib.util.spec_from_file_location('downloaded_collector', Path(tmp) / 'collect.py')
    collector = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(collector)
    source_page = browser.new_page()
    source_page.route('https://example.test/**', lambda route: route.fulfill(status=200, content_type='text/html', body='<html></html>'))
    source_page.goto('https://example.test/rekap')
    source_page.set_content('<div class="dt-container">Showing 1 to 112 of 112 entries' + table(range(1, 113)) + '</div>')
    project = {'schemaVersion': 1, 'synthetic': True, 'inventory': [{'menu':'Rekap IMUT RS', 'period':'2025'}], 'datasets': []}
    source = {'menu':'Rekap IMUT RS', 'unit':'RS Sintetis', 'period':'2025', 'year':'2025', 'url':'https://example.test/rekap', 'check':'unchecked'}
    output = Path(tmp) / 'collector-output/project.json'
    collector.capture(source_page, project, output, source)
    saved = json.loads(output.read_text())
    assert len(saved['datasets'][0]['rows']) == 112
    assert saved['datasets'][0]['source']['check'] == 'passed'
    app.locator('input[type=file]').set_input_files(output)
    app.get_by_role('heading', name='Pratinjau tabel').wait_for()
    app.wait_for_function("document.querySelectorAll('.metrics article strong')[1].textContent === '112'")
    assert 'lengkap terverifikasi' in app.locator('#coverage').inner_text()
    with app.expect_download() as event:
        app.get_by_role('button', name='Buat PDF gabungan', exact=True).click()
    pdf = Path(tmp) / 'result.pdf'
    event.value.save_as(pdf)
    text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-'], text=True)
    for expected in ['Daftar isi', 'Indikator 112', 'Desember', 'lengkap terverifikasi', 'Halaman 1 dari', 'SINTETIS']:
        assert expected in text, expected
    assert not errors, errors
    browser.close()
print('PASS: downloaded kit → Playwright synthetic capture (112 × 12) → manifest import → combined PDF with verified section status')
