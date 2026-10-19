"""All fixtures are synthetic. Schema support does not establish a live integration."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'collector'))
from collect import capture, discover_tables
from adapters import MONTHS

class AdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, executable_path=os.environ.get('SISMADAK_TEST_CHROMIUM','/usr/bin/chromium'))
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop()
    def setUp(self):
        self.page = self.browser.new_page()
        self.tmp = tempfile.TemporaryDirectory()
    def tearDown(self):
        self.page.close(); self.tmp.cleanup()
    def capture(self, html, menu):
        self.page.set_content(html)
        project={'schemaVersion':1,'datasets':[],'inventory':[]}
        source={'menu':menu,'unit':'Sintetis','year':'2025','period':'Januari','url':'https://example.test/','check':'unchecked'}
        capture(self.page,project,Path(self.tmp.name)/'project.json',source)
        return project['datasets'][0]
    def test_supported_schemas_and_raw_headers(self):
        for fixture,menu,adapter,count in [('area-manajemen','Area Manajemen','area-manajemen-harian',2),('area-klinik','Area Klinik','area-klinik-harian',2),('rincian','Rincian Indikator','rincian-indikator',2),('kegiatan','Kegiatan','kegiatan',2),('lampiran','Lampiran','daftar-lampiran',1)]:
            with self.subTest(menu=menu):
                d=self.capture((Path(__file__).parent/'fixtures'/f'{fixture}.html').read_text(),menu)
                self.assertEqual(d['source']['adapter'],adapter)
                self.assertEqual(d['source']['check'],'passed')
                self.assertEqual(len(d['rows']),count)
                self.assertEqual(d['source']['pages'][0]['rowCount'],count)
                self.assertEqual(d['source']['adapterValidation'],'schema-fixtures-only')
                if fixture=='area-manajemen':
                    self.assertEqual(d['rows'][0]['Pengukuran / Pembilang'],'0')
                    self.assertEqual(d['rows'][1]['Pengukuran / Pembilang'],'')
                    self.assertEqual(d['source']['columnRoles']['numerator'],'Pengukuran / Pembilang')
                if fixture=='area-klinik':
                    self.assertEqual(d['rows'][1]['Catatan tambahan'],'Dipertahankan')
    def test_menu_context_required(self):
        html=(Path(__file__).parent/'fixtures/area-klinik.html').read_text()
        d=self.capture(html,'Format lain')
        self.assertEqual(d['source']['check'],'failed')
        self.assertIn('adapter belum tersedia',d['source']['errors'])
    def test_body_colspan_not_guessed(self):
        d=self.capture('<table><tr><th>Tanggal</th><th>Kegiatan</th></tr><tr><td colspan="2">Total</td></tr></table>','Kegiatan')
        self.assertEqual(d['source']['check'],'failed')
    def test_multiple_tables_require_explicit_selection(self):
        html=(Path(__file__).parent/'fixtures/kegiatan.html').read_text()
        self.page.set_content(html+html)
        self.assertEqual(len(discover_tables(self.page,'Kegiatan')),2)
        project={'schemaVersion':1,'datasets':[],'inventory':[]}
        source={'menu':'Kegiatan','unit':'','year':'2025','period':'Januari','url':'https://example.test/'}
        capture(self.page,project,Path(self.tmp.name)/'project.json',source,table_index=1)
        self.assertEqual(len(project['datasets'][0]['rows']),2)
        self.assertEqual(source['check'],'passed')
    def test_scroll_without_number_preserves_duplicate_rows(self):
        html='<div style="height:50px;overflow:auto"><table><tr><th>Tanggal</th><th>Kegiatan</th></tr>'+('<tr><td>2025-01-01</td><td>Sama</td></tr>'*20)+'</table></div>'
        d=self.capture(html,'Kegiatan')
        self.assertEqual(len(d['rows']),20)
        self.assertEqual(d['source']['errors'],[])
    def test_daily_matrix_requires_calendar_columns(self):
        html='<div class="dt-container">Showing 1 to 1 of 1 entries<table><tr><th>Indikator</th>'+''.join(f'<th>{d}</th>' for d in range(1,29))+'</tr><tr><td>Sintetis</td>'+('<td>0</td>'*28)+'</tr></table></div>'
        d=self.capture(html,'Area Klinik')
        self.assertEqual(d['source']['adapter'],'area-klinik-matriks-harian')
        self.assertIn('31',d['source']['requiredColumns'])
        self.assertEqual(d['rows'][0]['1'],'0')
        self.assertEqual(d['source']['columnRoles']['day:28'],'28')
    def test_daily_matrix_unknown_period_is_explicit(self):
        html='<table><tr><th>Indikator</th>'+''.join(f'<th>{d}</th>' for d in range(1,29))+'</tr><tr><td>Sintetis</td>'+('<td>0</td>'*28)+'</tr></table>'
        self.page.set_content(html)
        project={'schemaVersion':1,'datasets':[],'inventory':[]}
        source={'menu':'Area Manajemen','unit':'','year':'','period':'Tidak diketahui','url':'https://example.test/'}
        capture(self.page,project,Path(self.tmp.name)/'project.json',source)
        self.assertTrue(source['contentWarnings'])
    def test_rekap_grouped_headers(self):
        header='<tr>'+''.join(f'<th rowspan="2">{h}</th>' for h in ['No','Kategori','Indikator','Benchmark'])+'<th colspan="12">Hasil</th></tr><tr>'+''.join(f'<th>{m}</th>' for m in MONTHS)+'</tr>'
        cells='<tr>'+''.join(f'<td>{v}</td>' for v in ['1','Sintetis','Contoh','80%',*['0']*12])+'</tr>'
        d=self.capture(f'<table><thead>{header}</thead><tbody>{cells}</tbody></table>','Rekap IMUT RS')
        self.assertEqual(d['source']['adapter'],'rekap-imut-rs')
        self.assertEqual(d['source']['columnRoles']['month:Januari'],'Hasil / Januari')
        self.assertEqual(d['rows'][0]['Hasil / Desember'],'0')

if __name__=='__main__': unittest.main()
