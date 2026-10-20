"""Scraper tests use intercepted HTTPS fixtures only, with no live account."""
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'collector'))
from collect import eligible_pages, scrape_tabs
from report import create_pdf
from test_collector import table


class ScraperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, executable_path=os.environ.get('SISMADAK_TEST_CHROMIUM', '/usr/bin/chromium'))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def setUp(self):
        self.context = self.browser.new_context()
        self.context.route('**/*', lambda route: route.fulfill(status=200, content_type='text/html', body='<html><body></body></html>'))
        self.project = {'schemaVersion': 1, 'synthetic': True, 'inventory': [], 'datasets': []}
        self.tmp = tempfile.TemporaryDirectory()
        self.output = Path(self.tmp.name) / 'project.json'

    def tearDown(self):
        self.context.close()
        self.tmp.cleanup()

    def page(self, path, content):
        page = self.context.new_page()
        page.goto('https://example.test/' + path)
        page.set_content(content)
        return page

    def metadata(self, page, index, total):
        return {'menu': 'Rekap IMUT RS', 'period': str(2023 + index), 'unit': 'Sintetis', 'year': str(2023 + index)}

    def paginated(self):
        first = '<div class="dt-container">Showing 1 to 2 of 4 entries' + table([1, 2]) + '<div class="dt-paging"><button type="button" onclick="nextPage()">Next</button></div></div>'
        second = '<div class="dt-container">Showing 3 to 4 of 4 entries' + table([3, 4]) + '</div>'
        return first + '<script>function nextPage(){document.body.innerHTML=' + json.dumps(second) + ';}</script>'

    def test_batch_auto_pagination_multiple_periods_and_unknown_adapter(self):
        first = self.page('rekap?year=2024', self.paginated())
        self.page('rekap?year=2025', '<div class="dt-container">Showing 1 to 112 of 112 entries' + table(range(1, 113)) + '</div>')
        self.page('unknown', '<table><tr><th>Tidak dikenal</th></tr><tr><td>1</td></tr></table>')
        confirmations = []
        summary = scrape_tabs(self.context, self.project, self.output, 'example.test', self.metadata,
                              confirm=lambda text: confirmations.append(text) or True, auto_pagination=True)
        self.assertEqual(summary, {'tabs': 3, 'captured': 2, 'failed': 1, 'skipped': 0})
        self.assertEqual(len(confirmations), 3)  # Consent once per tab, not once per Next.
        self.assertEqual([len(d['rows']) for d in self.project['datasets']], [4, 112, 0])
        self.assertEqual(len(self.project['datasets'][0]['source']['pages']), 2)
        self.assertEqual(self.project['datasets'][1]['rows'][-1]['Indikator'], 'Indikator 112')
        self.assertEqual(self.project['datasets'][1]['rows'][-1]['Desember'], '0')
        self.assertIn('adapter belum tersedia', self.project['datasets'][2]['source']['errors'])
        self.assertNotIn('?', self.project['datasets'][0]['source']['url'])
        self.assertEqual(json.loads(self.output.read_text()), self.project)
        self.assertEqual(first.url, 'https://example.test/rekap?year=2024')
        pdf = create_pdf(self.project, Path(self.tmp.name) / 'batch.pdf')
        text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-']).decode()
        self.assertIn('Indikator 112', text)
        self.assertIn('Desember', text)
        self.assertIn('gagal', text)

    def test_same_host_tabs_only_and_metadata_redirect_is_skipped(self):
        good = self.page('rekap', table([1]))
        for url in ['https://other.test/menu', 'http://example.test/menu', 'about:blank']:
            self.context.new_page().goto(url)
        self.assertEqual(eligible_pages(self.context, 'example.test'), [good])
        def redirect(page, *_):
            page.goto('https://other.test/login')
            return self.metadata(page, 1, 1)
        summary = scrape_tabs(self.context, self.project, self.output, 'example.test', redirect, lambda _: True)
        self.assertEqual(summary['skipped'], 1)
        self.assertEqual(self.project['datasets'], [])

    def test_manual_pagination_requires_each_confirmation_and_saves_partial(self):
        self.page('rekap', self.paginated())
        answers = iter([True, False])
        summary = scrape_tabs(self.context, self.project, self.output, 'example.test', self.metadata, lambda _: next(answers))
        self.assertEqual(summary['failed'], 1)
        self.assertEqual(len(self.project['datasets'][0]['rows']), 2)
        self.assertIn('Pagination dihentikan pengguna.', self.project['datasets'][0]['source']['errors'])

    def test_navigation_during_confirmation_is_skipped(self):
        page = self.page('rekap', table([1]))
        def confirm(_):
            page.goto('https://other.test/changed')
            return True
        summary = scrape_tabs(self.context, self.project, self.output, 'example.test', self.metadata, confirm)
        self.assertEqual(summary['skipped'], 1)
        self.assertEqual(self.project['datasets'], [])

    def test_resume_replaces_same_context_and_inventory_is_not_duplicated(self):
        self.page('rekap', '<div class="dt-container">Showing 1 to 2 of 2 entries' + table([1, 2]) + '</div>')
        scrape_tabs(self.context, self.project, self.output, 'example.test', self.metadata, lambda _: True)
        resumed = json.loads(self.output.read_text())
        scrape_tabs(self.context, resumed, self.output, 'example.test', self.metadata, lambda _: True)
        self.assertEqual(len(resumed['datasets']), 1)
        self.assertEqual(len(resumed['inventory']), 1)
        self.assertEqual(resumed['datasets'][0]['source']['check'], 'passed')

    def test_form_submit_next_is_never_clicked(self):
        page = self.page('rekap', '<form onsubmit="window.submitted=true;return false"><div class="dt-container">Showing 1 to 2 of 4 entries' + table([1, 2]) + '<div class="dt-paging"><button type="submit">Next</button></div></div></form>')
        summary = scrape_tabs(self.context, self.project, self.output, 'example.test', self.metadata, lambda _: True, auto_pagination=True)
        self.assertEqual(summary['failed'], 1)
        self.assertFalse(page.evaluate('!!window.submitted'))
        self.assertTrue(any('submit formulir' in error for error in self.project['datasets'][0]['source']['errors']))


if __name__ == '__main__':
    unittest.main()
