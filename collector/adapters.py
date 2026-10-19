"""Conservative schema adapters. Original headers/values are retained in exported rows."""
import re
import calendar

MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

def token(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()

ALIASES = {
    'date': {'tanggal', 'tgl', 'tanggal pengukuran', 'tanggal pelaksanaan'},
    'indicator': {'indikator', 'nama indikator'},
    'value': {'nilai', 'hasil', 'capaian'},
    'numerator': {'pembilang', 'numerator'},
    'denominator': {'penyebut', 'denominator'},
    'activity': {'kegiatan', 'nama kegiatan'},
    'parameter': {'parameter', 'komponen'},
    'description': {'keterangan', 'deskripsi', 'uraian', 'nilai'},
    'file': {'nama file', 'nama berkas', 'lampiran'},
    'file_info': {'jenis', 'ukuran', 'keterangan', 'tipe'},
}

def roles(headers):
    result = {}
    for role, aliases in ALIASES.items():
        matches = [h for h in headers if token(h.split(' / ')[-1]) in aliases]
        if len(matches) == 1:
            result[role] = matches[0]
    return result

class TableAdapter:
    name = ''
    menus = ()
    required_roles = ()

    @classmethod
    def recognizes(cls, headers, menu=''):
        mapped = roles(headers)
        return any(m in token(menu) for m in cls.menus) and all(r in mapped for r in cls.required_roles)

    @staticmethod
    def extract(snapshot):
        headers, cells = snapshot['headers'], snapshot['rows']
        if not headers or len(set(headers)) != len(headers):
            raise ValueError('Header kosong/berulang: adapter belum tersedia untuk struktur ini.')
        if snapshot.get('spans'):
            raise ValueError('Colspan pada isi tabel belum didukung; baris tidak boleh ditebak.')
        if any(len(row) != len(headers) for row in cells):
            raise ValueError('Jumlah sel tidak sesuai header.')
        return [dict(zip(headers, row)) for row in cells]

    @classmethod
    def metadata(cls, headers, source=None):
        mapped = roles(headers)
        return {'columnRoles': mapped, 'requiredColumns': [mapped[r] for r in cls.required_roles if r in mapped],
                'adapterValidation': 'schema-fixtures-only'}

class RekapIMUTAdapter(TableAdapter):
    name = 'rekap-imut-rs'
    @staticmethod
    def recognizes(headers, menu=''):
        leaves = [h.split(' / ')[-1] for h in headers]
        return all(leaves.count(h) == 1 for h in ['No', 'Kategori', 'Indikator', *MONTHS, 'Benchmark'])
    @classmethod
    def metadata(cls, headers, source=None):
        result = super().metadata(headers, source)
        result['columnRoles'].update({f'month:{month}': next(h for h in headers if h.split(' / ')[-1] == month) for month in MONTHS})
        result['requiredColumns'] = headers
        return result

class DailyAdapter(TableAdapter):
    required_roles = ('date', 'indicator')
    @classmethod
    def recognizes(cls, headers, menu=''):
        mapped = roles(headers)
        return super().recognizes(headers, menu) and ('value' in mapped or all(r in mapped for r in ('numerator', 'denominator')))
    @classmethod
    def metadata(cls, headers, source=None):
        result = super().metadata(headers, source)
        mapped = result['columnRoles']
        result['requiredColumns'] += [mapped['value']] if 'value' in mapped else [mapped['numerator'], mapped['denominator']]
        return result

class ManagementDailyAdapter(DailyAdapter):
    name = 'area-manajemen-harian'
    menus = ('area manajemen',)

class ClinicalDailyAdapter(DailyAdapter):
    name = 'area-klinik-harian'
    menus = ('area klinik',)

class DailyMatrixAdapter(TableAdapter):
    @classmethod
    def recognizes(cls, headers, menu=''):
        mapped = roles(headers)
        days = [h.split(' / ')[-1] for h in headers if re.fullmatch(r'(?:0?[1-9]|[12][0-9]|3[01])', h.split(' / ')[-1])]
        return any(m in token(menu) for m in cls.menus) and 'indicator' in mapped and 'date' not in mapped and len({int(d) for d in days}) >= 28 and len({int(d) for d in days}) == len(days)
    @classmethod
    def metadata(cls, headers, source=None):
        result = super().metadata(headers, source)
        day_columns = {int(h.split(' / ')[-1]): h for h in headers if re.fullmatch(r'(?:0?[1-9]|[12][0-9]|3[01])', h.split(' / ')[-1])}
        result['columnRoles'].update({f'day:{d}': h for d, h in day_columns.items()})
        result['requiredColumns'] = [result['columnRoles']['indicator']]
        source = source or {}
        months = [i+1 for i,m in enumerate(MONTHS) if re.search(r'\b'+m.lower()+r'\b', source.get('period','').lower())]
        if len(months)==1 and re.fullmatch(r'[12][0-9]{3}', source.get('year','')):
            count = calendar.monthrange(int(source['year']), months[0])[1]
            result['requiredColumns'] += [day_columns.get(d,str(d)) for d in range(1,count+1)]
        else:
            result['contentWarnings'] = ['Bulan/tahun matriks harian belum dikenali; jumlah hari periode belum dapat diperiksa.']
        return result

class ManagementMatrixAdapter(DailyMatrixAdapter):
    name = 'area-manajemen-matriks-harian'
    menus = ('area manajemen',)

class ClinicalMatrixAdapter(DailyMatrixAdapter):
    name = 'area-klinik-matriks-harian'
    menus = ('area klinik',)

class IndicatorDetailAdapter(TableAdapter):
    name = 'rincian-indikator'
    menus = ('rincian indikator', 'detail indikator')
    required_roles = ('parameter', 'description')

class IndicatorMeasurementAdapter(DailyAdapter):
    name = 'rincian-indikator-harian'
    menus = ('rincian indikator', 'detail indikator')

class ActivityAdapter(TableAdapter):
    name = 'kegiatan'
    menus = ('kegiatan',)
    required_roles = ('date', 'activity')

class AttachmentListAdapter(TableAdapter):
    name = 'daftar-lampiran'
    menus = ('lampiran',)
    required_roles = ('file', 'file_info')

ADAPTERS = [RekapIMUTAdapter, ManagementDailyAdapter, ClinicalDailyAdapter, ManagementMatrixAdapter, ClinicalMatrixAdapter, IndicatorDetailAdapter, IndicatorMeasurementAdapter, ActivityAdapter, AttachmentListAdapter]

# Expand header spans and body rowspans. Reject body colspan because it may be a total/summary.
SNAPSHOT = r"""t => {
 const all=Array.from(t.rows).filter(r=>r.parentElement.tagName!=='TFOOT');
 const explicit=all.filter(r=>r.parentElement.tagName==='THEAD');
 const head=explicit.length?explicit:all.slice(0,1);
 if(!head.length||!head[0].querySelector('th,td'))return {headers:[],rows:[],spans:false};
 function grid(rows,isHeader){const out=[];let invalid=false;
 rows.forEach((r,y)=>{out[y]??=[];let x=0;for(const c of r.cells){while(out[y][x]!==undefined)x++;
 if(!isHeader&&c.colSpan>1)invalid=true;
 for(let dy=0;dy<c.rowSpan;dy++){out[y+dy]??=[];for(let dx=0;dx<c.colSpan;dx++)out[y+dy][x+dx]=c.innerText.trim();}x+=c.colSpan;}});
 return {out,invalid};}
 const hg=grid(head,true).out;const width=Math.max(...hg.map(r=>r.length));
 const headers=Array.from({length:width},(_,x)=>Array.from(new Set(hg.map(r=>r[x]).filter(Boolean))).join(' / '));
 const bg=grid(all.filter(r=>!head.includes(r)),false);
 return {headers,rows:bg.out.map(r=>Array.from({length:r.length},(_,i)=>r[i]??'')),spans:bg.invalid};
}"""
