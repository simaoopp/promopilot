import * as XLSX from 'xlsx';

const rows=[['Código','Artigo','PVP','Início','Fim'],['00.001.001.00001','Artigo sintético',1049.99,'15-10','02-11'],['00.001.001.00002','Preço zero',0,'15-10','02-11']];
test.each(['xlsx','xls','ods','csv'])('spreadsheet import/export preserves codes, prices and partial dates (%s)',bookType=>{
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Campanha');
 const buffer=XLSX.write(workbook,{bookType,type:'array'});
 const parsed=XLSX.read(buffer,{type:'array',raw:true});
 const actual=XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]],{header:1,defval:''});
 expect(actual[1][0]).toBe(rows[1][0]);expect(actual[1][1]).toBe(rows[1][1]);expect(Number(actual[1][2])).toBe(1049.99);
 expect(actual[1][3]).toBe('15-10');expect(actual[1][4]).toBe('02-11');expect(Number(actual[2][2])).toBe(0);
});
