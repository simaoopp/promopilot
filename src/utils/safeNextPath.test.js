import { safeNextPath } from './safeNextPath';
const origin='https://app.example.test';
test.each(['//outside.example','/\\outside.example','/%5coutside.example','/%2foutside.example','/\noutside.example','https://outside.example','javascript:alert(1)','/%zz'])('unsafe login return path is rejected (%s)',path=>{
 expect(safeNextPath(path,origin)).toBe('/Homepage');
});
test('campaign deep links and query parameters survive authentication',()=>{
 const path='/Campanhas/terminadas/synthetic-id?view=items#details';
 expect(safeNextPath(path,origin)).toBe(path);
});
