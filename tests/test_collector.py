"""Synthetic browser fixtures only; never contacts SISMADAK."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'collector'))
from collect import MONTHS, RekapIMUTAdapter, capture, inventory


def table(rows, extra=''):
    headers = ['No', 'Kategori', 'Indikator', *MONTHS, 'Benchmark']
    return '<table><thead><tr>' + ''.join(f'<th>{h}</th>' for h in headers) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f'<td>{v}</td>' for v in [n, 'Sintetis', f'Indikator {n}', *(['0'] * 12), '80%']) + '</tr>' for n in rows) + '</tbody></table>' + extra


class CollectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, executable_path=os.environ.get('SISMADAK_TEST_CHROMIUM', '/usr/bin/chromium'))
    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
    def setUp(self):
        self.page = self.browser.new_page()
        self.page.route('https://example.test/**', lambda route: route.fulfill(status=200, content_type='text/html', body='<html><body></body></html>'))
        self.page.goto('https://example.test/rekap')
        self.project = {'schemaVersion': 1, 'inventory': [], 'datasets': []}
        self.tmp = tempfile.TemporaryDirectory()
        self.output = Path(self.tmp.name) / 'project.json'
        self.source = {'menu': 'Rekap IMUT RS', 'period': '2025', 'year': '2025', 'unit': 'Contoh', 'url': 'https://example.test/rekap', 'check': 'unchecked'}
    def tearDown(self):
        self.page.close()
        self.tmp.cleanup()
    def test_complete_and_resume_replace(self):
        self.page.set_content('<div class="dt-container">Showing 1 to 112 of 112 entries' + table(range(1, 113)) + '</div>')
        capture(self.page, self.project, self.output, self.source.copy())
        d = self.project['datasets'][0]
        self.assertEqual(len(d['rows']), 112)
        self.assertEqual(d['source']['check'], 'passed')
        capture(self.page, self.project, self.output, self.source.copy())
        self.assertEqual(len(self.project['datasets']), 1)
        self.assertEqual(json.loads(self.output.read_text())['datasets'][0]['rows'][0]['Januari'], '0')
    def test_row_mismatch(self):
        self.page.set_content('<div class="dt-container">Showing 1 to 2 of 112 entries' + table([1, 2]) + '</div>')
        capture(self.page, self.project, self.output, self.source.copy())
        self.assertEqual(self.project['datasets'][0]['source']['check'], 'failed')
    def test_unknown_adapter(self):
        self.page.set_content('<table><tr><th>Format lain</th></tr><tr><td>1</td></tr></table>')
        capture(self.page, self.project, self.output, self.source.copy())
        self.assertIn('adapter belum tersedia', self.project['datasets'][0]['source']['errors'])
    def test_no_total_is_unchecked(self):
        self.page.set_content(table([1, 2]))
        capture(self.page, self.project, self.output, self.source.copy())
        self.assertEqual(self.project['datasets'][0]['source']['check'], 'unchecked')
    def test_pagination_actual_control(self):
        first = '<div class="dt-container">Showing 1 to 2 of 4 entries' + table([1, 2]) + '<div class="dt-paging"><button onclick="nextPage()">Next</button></div></div>'
        second = '<div class="dt-container">Showing 3 to 4 of 4 entries' + table([3, 4]) + '</div>'
        self.page.set_content(first + '<script>function nextPage(){document.body.innerHTML=' + json.dumps(second) + ';}</script>')
        with patch('builtins.input', return_value='y'):
            capture(self.page, self.project, self.output, self.source.copy())
        self.assertEqual(len(self.project['datasets'][0]['rows']), 4)
        self.assertEqual(self.project['datasets'][0]['source']['check'], 'passed')
    def test_inventory_same_host_and_strips_query(self):
        self.page.set_content('<a href="https://example.test/menu?token=secret">Menu</a><a href="https://other.test/">External</a>')
        inventory(self.page, self.project, 'example.test')
        self.assertEqual(len(self.project['inventory']), 1)
        self.assertEqual(self.project['inventory'][0]['url'], 'https://example.test/menu')
    def test_scroll_table(self):
        self.page.set_content('<div style="height:100px;overflow:auto">' + table(range(1, 113)) + '</div>')
        capture(self.page, self.project, self.output, self.source.copy())
        self.assertEqual(len(self.project['datasets'][0]['rows']), 112)
    def test_spanned_cells_rejected(self):
        snap = {'headers': ['No'], 'rows': [['1']], 'spans': True}
        with self.assertRaises(ValueError):
            RekapIMUTAdapter.extract(snap)

if __name__ == '__main__':
    unittest.main()
