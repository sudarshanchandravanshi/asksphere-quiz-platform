const express=require('express');
const path=require('path');
const crypto=require('crypto');
const {put,list}=require('@vercel/blob');
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'20kb'}));
app.post('/api/scores',async(req,res)=>{
 try{
  const {quizId,name,score,total}=req.body||{};
  if(typeof quizId!=='string'||! /^[a-f0-9]{64}$/.test(quizId)||typeof name!=='string'||!name.trim()||name.trim().length>35||!Number.isInteger(score)||!Number.isInteger(total)||total<1||total>50||score<0||score>total)return res.status(400).json({error:'Invalid score submission'});
  const entry={name:name.trim().replace(/[<>]/g,''),score,total,percent:Math.round(score/total*100),createdAt:new Date().toISOString()};
  const blob=await put('scores/'+quizId+'/'+crypto.randomUUID()+'.json',JSON.stringify(entry),{access:'public',addRandomSuffix:false,contentType:'application/json'});
  res.status(201).json({ok:true,id:blob.pathname});
 }catch(error){console.error('Score save failed:',error.message);res.status(503).json({error:'Scores are temporarily unavailable'});}
});
app.get('/api/leaderboard',async(req,res)=>{
 try{
  const quizId=String(req.query.quizId||'');
  if(!/^[a-f0-9]{64}$/.test(quizId))return res.status(400).json({error:'Invalid quiz ID'});
  let cursor;const blobs=[];
  for(let page=0;page<5;page++){const result=await list({prefix:'scores/'+quizId+'/',limit:100,cursor});blobs.push(...result.blobs);cursor=result.cursor;if(!cursor)break;}
  const entries=await Promise.all(blobs.map(async blob=>{try{const response=await fetch(blob.url);if(!response.ok)return null;const d=await response.json();return {name:String(d.name||'Friend').slice(0,35),score:Number(d.score),total:Number(d.total),percent:Number(d.percent),createdAt:d.createdAt};}catch{return null;}}));
  const clean=entries.filter(x=>x&&Number.isFinite(x.score)&&Number.isFinite(x.total));clean.sort((a,b)=>b.score-a.score||String(a.createdAt).localeCompare(String(b.createdAt)));
  res.set('Cache-Control','no-store').json({entries:clean.slice(0,10)});
 }catch(error){console.error('Leaderboard read failed:',error.message);res.status(503).json({error:'Leaderboard is temporarily unavailable'});}
});
app.use(express.static(__dirname,{extensions:['html']}));
app.get('/health',(req,res)=>res.json({ok:true,app:'AskSphere'}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
const port=process.env.PORT||3000;
app.listen(port,'0.0.0.0',()=>console.log('AskSphere listening on '+port));
