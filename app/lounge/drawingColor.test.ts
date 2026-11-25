import test from 'node:test';
import assert from 'node:assert/strict';
import {hexToHsv,hsvToHex} from './drawingColor.ts';
test('HSV canonical colors and grayscale preserve precision',()=>{
 for(const [h,hex] of [[0,'#ff0000'],[60,'#ffff00'],[120,'#00ff00'],[180,'#00ffff'],[240,'#0000ff'],[300,'#ff00ff'],[360,'#ff0000']] as const)assert.equal(hsvToHex({h,s:100,v:100}),hex);
 assert.equal(hsvToHex({h:220,s:0,v:100}),'#ffffff');assert.equal(hsvToHex({h:220,s:100,v:0}),'#000000');
 assert.equal(hexToHsv('#808080',207).h,207);assert.equal(hexToHsv('#000000',310).h,310);
 for(const hex of ['#172033','#FFF2A8','#A97951','#ff0000','#ffffff','#808080','#000000','#123456'])assert.equal(hsvToHex(hexToHsv(hex)),hex.toLowerCase());
 assert.throws(()=>hexToHsv('#badhex'));assert.equal(hsvToHex({h:0,s:120,v:110}),'#ff0000');
});
