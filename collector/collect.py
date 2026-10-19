"""Read-only, user-directed SISMADAK collector. No credentials are persisted."""
import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, urljoin
from playwright.sync_api import sync_playwright

from adapters import MONTHS, ADAPTERS, SNAPSHOT, RekapIMUTAdapter

def safe_url(url):
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path, '', ''))

def now():
    return datetime.now(timezone.utc).isoformat()

def save(path, project):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_suffix('.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(project, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def discover_tables(page, menu):
    found = []
    tables = page.locator('table')
    for i in range(tables.count()):
        table = tables.nth(i)
        if not table.is_visible():
            continue
        snapshot = table.evaluate(SNAPSHOT)
        matching = [a for a in ADAPTERS if a.recognizes(snapshot['headers'], menu)]
        adapter = matching[0] if len(matching) == 1 else None
        found.append({'index': i, 'headers': snapshot['headers'], 'adapter': adapter,
                      'reason': 'adapter belum tersedia' if not adapter else 'skema dikenali; belum diuji pada SISMADAK asli'})
    return found

def inventory(page, project, origin):
    links = page.locator('a[href]').evaluate_all("els => els.map(a=>({menu:a.innerText.trim(),url:a.href}))")
    existing = {(i['menu'], i.get('url')) for i in project['inventory']}
    for link in links:
        p = urlsplit(link['url'])
        if not link['menu'] or p.scheme != 'https' or p.netloc != origin:
            continue
        item = {'menu': link['menu'], 'url': safe_url(link['url']), 'status': 'tautan ditemukan; periode dan adapter belum diperiksa'}
        if (item['menu'], item['url']) not in existing:
            project['inventory'].append(item)
            existing.add((item['menu'], item['url']))


def scroll_rows(table, adapter):
    """Preserve ordinary DOM duplicates; require explicit No identity for virtualized views."""
    table.evaluate("t=>{let e=t.parentElement;while(e){if(e.scrollHeight>e.clientHeight+5&&['auto','scroll'].includes(getComputedStyle(e).overflowY)){e.scrollTop=0;break;}e=e.parentElement;}}")
    table.page.wait_for_timeout(200)
    views = []
    for step in range(500):
        rows = adapter.extract(table.evaluate(SNAPSHOT))
        if not views or views[-1] != rows:
            views.append(rows)
        moved = table.evaluate("t=>{let e=t.parentElement;while(e){if(e.scrollHeight>e.clientHeight+5&&['auto','scroll'].includes(getComputedStyle(e).overflowY)){const before=e.scrollTop;e.scrollTop+=Math.max(1,e.clientHeight*0.8);return e.scrollTop>before;}e=e.parentElement;}return false;}")
        if not moved:
            break
        table.page.wait_for_timeout(100)
    errors = [] if step < 499 else ['Batas pengguliran tercapai; pengambilan sebagian.']
    if len(views) == 1:
        return views[0], errors
    by_number = {}
    for view in views:
        numbers = [row.get('No') for row in view]
        if not all(numbers) or len(set(numbers)) != len(numbers):
            return views[0], errors + ['Tabel virtual tanpa identitas No unik belum didukung.']
        for row in view:
            number = row['No']
            if number in by_number and by_number[number] != row:
                errors.append('Nomor baris berulang dengan nilai berbeda pada tabel virtual.')
            by_number[number] = row
    return list(by_number.values()), list(dict.fromkeys(errors))


def expected_total(table):
    # Only standard, explicit pagination summaries are accepted as evidence.
    text = table.evaluate("t => {const scope=t.closest('.dataTables_wrapper, .dt-container')||t.parentElement;return scope.querySelectorAll('table').length===1?scope.innerText:'';}")
    matches = re.findall(r'(?:Showing\s+[\d,.]+\s+to\s+[\d,.]+\s+of\s+([\d,.]+)\s+entries|Menampilkan\s+[\d,.]+\s+(?:sampai|hingga)\s+[\d,.]+\s+dari\s+([\d,.]+)\s+(?:entri|data))', text, re.I)
    totals = {int(re.sub(r'[^0-9]', '', a or b)) for a, b in matches}
    return totals.pop() if len(totals) == 1 else None


def capture(page, project, output, source, confirm=None, on_progress=None, table_index=None, should_stop=None):
    discovery_error = None
    try:
        recognized = [(t['index'], t['adapter']) for t in discover_tables(page, source['menu']) if t['adapter'] and (table_index is None or t['index'] == table_index)]
    except Exception as exc:
        recognized = []
        discovery_error = f'Pembacaan struktur tabel gagal ({type(exc).__name__}).'
    key = hashlib.sha256(json.dumps([source['menu'], source['unit'], source['year'], source['period'], source['url']], ensure_ascii=False).encode()).hexdigest()[:20]
    dataset = {'id': key, 'name': f"{source['menu']} · {source['period']}", 'source': source, 'rows': []}
    source['rowCount'] = 0
    source['pages'] = []
    project['datasets'] = [d for d in project['datasets'] if d['id'] != key] + [dataset]
    if len(recognized) != 1:
        source.update(check='failed', errors=[discovery_error or ('adapter belum tersedia' if not recognized else 'Beberapa tabel cocok; pemilihan tabel memerlukan adapter khusus.')])
        save(output, project)
        return
    index, adapter = recognized[0]
    source['adapter'] = adapter.name
    headers = page.locator('table').nth(index).evaluate(SNAPSHOT)['headers']
    source.update(adapter.metadata(headers, source))
    source['columns'] = headers
    total = expected_total(page.locator('table').nth(index))
    if total is not None:
        source['expectedRows'] = total
    seen_pages = set()
    errors = []
    try:
        for page_index in range(1000):
            if should_stop and should_stop():
                errors.append('Dihentikan pengguna; progres tersimpan.'); break
            table = page.locator('table').nth(index)
            rows, scroll_errors = scroll_rows(table, adapter)
            errors.extend(scroll_errors)
            fingerprint = json.dumps(rows, sort_keys=True, ensure_ascii=False)
            if fingerprint in seen_pages:
                errors.append('Halaman berulang; pagination dihentikan tanpa mengklaim lengkap.')
                break
            seen_pages.add(fingerprint)
            current_headers = table.evaluate(SNAPSHOT)['headers']
            if current_headers != headers:
                errors.append('Struktur kolom berubah saat pagination; pengambilan dihentikan.'); break
            observed_total = expected_total(table)
            if total is not None and observed_total is not None and total != observed_total:
                errors.append('Total sumber berubah saat penarikan; ulangi setelah data stabil.'); break
            dataset['rows'].extend(rows)
            source['pages'].append({'page': page_index + 1, 'rowCount': len(rows), 'rowsHash': hashlib.sha256(fingerprint.encode()).hexdigest(), 'capturedAt': now()})
            source.update(check='unchecked', errors=['Pengambilan belum selesai.'], pagesCaptured=page_index+1, rowCount=len(dataset['rows']))
            save(output, project)
            if on_progress:
                on_progress(f"{len(dataset['rows'])} baris tersimpan; halaman {page_index+1}.")
            # Only actual, visible pagination controls with explicit next semantics.
            pagination_scope = table.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," dataTables_wrapper ") or contains(concat(" ",normalize-space(@class)," ")," dt-container ")][1]')
            scope = pagination_scope if pagination_scope.count() else table.locator('..')
            candidates = scope.locator('[aria-label="pagination" i] a, [aria-label="pagination" i] button, .dataTables_paginate a, .dataTables_paginate button, .dt-paging button, a[rel="next"]')
            next_controls = []
            for j in range(candidates.count()):
                c = candidates.nth(j)
                label = ((c.get_attribute('aria-label') or '') + ' ' + c.inner_text()).strip()
                if c.is_visible() and c.is_enabled() and c.get_attribute('aria-disabled') != 'true' and not re.search(r'disabled', (c.get_attribute('class') or '') + ' ' + (c.locator('..').get_attribute('class') or ''), re.I) and (re.fullmatch(r'(next|berikutnya|selanjutnya|›|»)(\s+(next|berikutnya|selanjutnya|›|»))?', label, re.I) or c.get_attribute('rel') == 'next'):
                    next_controls.append(c)
            if not next_controls:
                break
            if len(next_controls) != 1:
                errors.append('Kontrol halaman berikutnya ambigu.'); break
            print(f"{len(dataset['rows'])} baris tersimpan. Kontrol berikutnya ditemukan: {next_controls[0].inner_text()!r}")
            proceed = confirm('Lanjut ke halaman berikutnya yang ditemukan?') if confirm else input('Lanjut klik navigasi pagination ini? [y/N] ').strip().lower() == 'y'
            if not proceed:
                errors.append('Pagination dihentikan pengguna.'); break
            before_url = urlsplit(page.url)
            href = next_controls[0].get_attribute('href')
            if href and href.lower().startswith(('javascript:', 'data:')):
                errors.append('Tautan pagination nonstandar memerlukan adapter khusus.'); break
            if href and href != '#':
                destination = urlsplit(urljoin(page.url, href))
                if destination.scheme != 'https' or destination.netloc != before_url.netloc:
                    errors.append('Pagination harus tetap HTTPS pada host sumber.'); break
            before_text = table.inner_text()
            next_controls[0].click()
            page.wait_for_timeout(800)
            if urlsplit(page.url).netloc != before_url.netloc or urlsplit(page.url).scheme != 'https':
                errors.append('Navigasi keluar host sumber; pengambilan dihentikan.'); break
            page.wait_for_function("arg => {const t=document.querySelectorAll('table')[arg.index];return t && t.innerText!==arg.before;}", arg={'index': index, 'before': before_text}, timeout=10000)
        else:
            errors.append('Batas 1000 halaman tercapai.')
        if total is not None and total != len(dataset['rows']):
            errors.append(f"Jumlah baris {len(dataset['rows'])} tidak sesuai total tampilan {total}.")
        source['check'] = 'failed' if errors else 'passed' if total is not None else 'unchecked'
        source['errors'] = list(dict.fromkeys(errors))
        source['capturedAt'] = now()
        source['rowCount'] = len(dataset['rows'])
    except Exception as exc:
        source.update(check='failed', errors=[*errors, f'Pengambilan terputus ({type(exc).__name__}); ulangi bagian ini dari halaman pertama.'], rowCount=len(dataset['rows']))
    finally:
        save(output, project)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='URL HTTPS SISMADAK yang diketahui pengguna')
    parser.add_argument('--output', type=Path, default=Path('collector-output/project.json'))
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    url = args.url or input('Masukkan URL HTTPS SISMADAK: ').strip()
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        parser.error('Gunakan URL HTTPS tanpa kredensial.')
    if args.output.exists() and not args.resume:
        parser.error('Output sudah ada. Gunakan --resume atau nama output baru.')
    project = json.loads(args.output.read_text(encoding='utf-8')) if args.resume and args.output.exists() else {'schemaVersion': 1, 'inventory': [], 'datasets': []}
    if project.get('schemaVersion') != 1 or not isinstance(project.get('datasets'), list):
        parser.error('Format progres tidak didukung.')
    os.umask(0o077)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context(accept_downloads=False)
        page = context.new_page()
        page.goto(url, wait_until='domcontentloaded')
        print('Login sendiri di browser. Collector tidak menyimpan password, cookie, atau token.')
        print('Buka menu dan atur filter sendiri. Jangan lakukan pengubahan data. Ketik q untuk selesai.')
        while True:
            if input('\nEnter setelah halaman siap; q untuk keluar: ').strip().lower() == 'q':
                break
            if urlsplit(page.url).netloc != parsed.netloc or urlsplit(page.url).scheme != 'https':
                print('Kembali ke host SISMADAK awal sebelum mengambil data.'); continue
            inventory(page, project, parsed.netloc)
            menu = input('Nama menu persis seperti tampilan: ').strip()
            period = input('Periode/filter aktif (mis. 2025; unit X): ').strip()
            unit = input('Unit aktif (kosong bila tidak berlaku): ').strip()
            year = input('Tahun aktif (kosong bila tidak berlaku): ').strip()
            if not menu or not period:
                print('Nama menu dan periode wajib dicatat.'); continue
            source = {'menu': menu, 'period': period, 'unit': unit, 'year': year, 'url': safe_url(page.url), 'capturedAt': now(), 'check': 'unchecked'}
            project['inventory'].append({'menu': menu, 'period': period, 'unit': unit, 'year': year, 'url': source['url'], 'status': 'halaman dikunjungi; filter dicatat pengguna'})
            save(args.output, project)
            print('Mulai dari halaman pagination pertama. Pengambilan ulang mengganti bagian dengan konteks yang sama.')
            if input('Halaman pertama sudah aktif dan filter benar? [y/N] ').strip().lower() == 'y':
                capture(page, project, args.output, source)
                print(f"Progres tersimpan: {args.output}. Tidak ada klaim cakupan seluruh akun.")
        save(args.output, project)
        browser.close()

if __name__ == '__main__':
    main()
