"""Run against npm start. Uses only synthetic fixtures, no external data."""
import json
import os
import subprocess
from io import BytesIO
from zipfile import ZipFile
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE = os.environ.get('SISMADAK_TEST_URL', 'http://127.0.0.1:3000')
ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get('SISMADAK_TEST_CHROMIUM', '/usr/bin/chromium'))
    page = browser.new_page(accept_downloads=True)
    errors = []
    external = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: external.append(r.url) if not r.url.startswith(BASE) else None)
    page.goto(BASE)
    page.get_by_role('button', name='Coba 112 indikator sintetis →').click()
    page.get_by_role('heading', name='Pratinjau tabel').wait_for()
    assert page.get_by_text('112 baris · Halaman 1 / 5').is_visible()
    assert page.get_by_text('— kosong', exact=True).is_visible()
    assert page.locator('.cell-0\\/0').is_visible()
    coverage = page.locator('#coverage')
    assert 'Penarikan:' in coverage.inner_text() and 'Isi:' in coverage.inner_text()
    assert 'perlu diperiksa' in coverage.inner_text()
    coverage.locator('details').first.locator('summary').click()
    coverage.get_by_role('button', name='Baris 2, Januari: kosong', exact=True).click()
    page.locator('.focused-row').wait_for()
    assert 'Indikator sintetis 2' in page.locator('.focused-row').inner_text()
    with page.expect_download() as event:
        page.get_by_role('button', name='Unduh laporan pemeriksaan JSON', exact=True).click()
    report=json.loads(event.value.path().read_text())
    assert report['sections'][0]['captureStatus']=='lengkap terverifikasi'
    assert report['sections'][0]['contentStatus']=='perlu diperiksa'
    assert report['sections'][0]['issues'][0]['row']==2
    page.get_by_placeholder('Cari dalam tabel…').fill('tidak-ada-indikator-yang-cocok')
    with page.expect_download() as event:
        page.get_by_role('button', name='↓ Unduh paket ZIP', exact=True).click()
    assert event.value.suggested_filename == 'sismadak-paket.zip'
    with ZipFile(BytesIO(event.value.path().read_bytes())) as bundle:
        project = json.loads(bundle.read('project.json'))
        assert len(project['datasets'][0]['rows']) == 112
        assert project['datasets'][0]['rows'][0]['Januari'] == '0'
        assert project['datasets'][0]['rows'][1]['Januari'] == ''
        assert project['datasets'][0]['rows'][2]['Januari'] == '0/0'
        assert bundle.read('sismadak-gabungan.pdf').startswith(b'%PDF')
        pdf_text = subprocess.run(['pdftotext', '-layout', '-', '-'], input=bundle.read('sismadak-gabungan.pdf'), capture_output=True, check=True).stdout.decode()
        assert 'Indikator sintetis 112' in pdf_text and 'Desember' in pdf_text
        assert json.loads(bundle.read('manifest.json'))['rows'] == 112
        assert json.loads(bundle.read('pemeriksaan.json'))['sections'][0]['contentStatus'] == 'perlu diperiksa'
        assert {'arsip.csv','baris.csv','pemeriksaan.csv','BACA-SAYA.txt'}.issubset(bundle.namelist())
    page.get_by_placeholder('Cari dalam tabel…').fill('')
    with page.expect_download() as event:
        page.get_by_role('button', name='↓ CSV arsip', exact=True).click()
    archive = event.value.path().read_bytes()
    page.locator('input[type=file]').set_input_files({'name':'archive.csv','mimeType':'text/csv','buffer':archive})
    page.get_by_role('status').wait_for()
    page.wait_for_function("document.querySelectorAll('.metrics article strong')[2].textContent === '112'")
    assert page.locator('.metrics article').nth(2).locator('strong').inner_text() == '112'
    with page.expect_download() as event:
        page.get_by_role('button', name='↓ Unduh PDF', exact=False).click()
    assert event.value.path().read_bytes().startswith(b'%PDF')
    page.reload()
    assert page.get_by_role('heading', name='Mulai dengan mengimpor data').is_visible()
    html = b'<table><tr><th>No</th><th>Indikator</th><th>Januari</th></tr><tr><td>1</td><td>Contoh HTML</td><td>0/0</td></tr></table><script>window.__unsafe_import_executed=true</script><img src="https://example.invalid/leak">'
    page.locator('input[type=file]').set_input_files({'name':'synthetic.html','mimeType':'text/html','buffer':html})
    page.get_by_role('cell', name='Contoh HTML', exact=True).wait_for()
    assert page.get_by_role('cell', name='Contoh HTML', exact=True).is_visible()
    assert page.evaluate('window.__unsafe_import_executed !== true')
    page.locator('input[type=file]').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{bad'})
    page.locator('.error[role=alert]').wait_for()
    assert page.locator('.error[role=alert]').is_visible()
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path='/tmp/sismadak-mobile.png', full_page=True)
    page.set_viewport_size({'width':1440,'height':1000})
    page.screenshot(path='/tmp/sismadak-desktop.png', full_page=True)
    assert not errors, errors
    assert not external, external
    print('PASS: import HTML/CSV, duplicate detection, blank/0/0, PDF and complete ZIP download, invalid JSON, mobile layout, no external requests')
    browser.close()
