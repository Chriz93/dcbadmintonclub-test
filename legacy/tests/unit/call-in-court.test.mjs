// p66: the court a player without a seat tonight is called in to (Call In, Seat, the Players tag): their earned court
// when it is in use tonight (or above the bottom court in use), otherwise the bottom court in use tonight. Found by the
// Call In tests: on a four-court night Call In aimed at Court 6 and was refused ("would be alone on Court 6").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnSource } from './load-app.mjs';

const at=(assignments)=>new Function('S','NC',fnSource('callInCourt')+'\nreturn callInCourt')({current:{assignments}},6);
const four={1:[1,2,3,4],2:[5,6,7,8],3:[9,10,11,12],4:[13,14,15,16,17],5:[],6:[]};
const six={1:[1,2,3,4],2:[5,6,7,8],3:[9,10,11,12],4:[13,14,15,16],5:[17,18,19,20],6:[21,22]};

test('p66 · no court: the bottom court in use tonight (callInCourt)',()=>{
 assert.equal(at(four)(0),4,'a four-court night: Court 4, not the empty Court 6');
 assert.equal(at(six)(0),6,'a six-court night: Court 6');
});
test('p66 · an earned court in use tonight is kept',()=>{
 for(const c of [1,2,3,4])assert.equal(at(four)(c),c);
 for(const c of [1,2,3,4,5,6])assert.equal(at(six)(c),c);
});
test('p66 · an earned court below the bottom court in use tonight becomes the bottom court in use',()=>{
 assert.equal(at(four)(5),4);assert.equal(at(four)(6),4);
});
test('p66 · an unused court above the bottom court in use (a gap) is kept',()=>{
 assert.equal(at({1:[1,2,3,4],2:[],3:[5,6,7,8],4:[],5:[],6:[]})(2),2);
});
test('p66 · nobody seated yet: the earned court, or Court 6 without one',()=>{
 const empty={1:[],2:[],3:[],4:[],5:[],6:[]};
 assert.equal(at(empty)(3),3);assert.equal(at(empty)(0),6);
});
test('p66 · no session: the earned court, or Court 6 without one',()=>{
 const f=new Function('S','NC',fnSource('callInCourt')+'\nreturn callInCourt')({current:null},6);
 assert.equal(f(2),2);assert.equal(f(0),6);
});
