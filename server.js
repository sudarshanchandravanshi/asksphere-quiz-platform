const express=require('express');
const path=require('path');
const crypto=require('crypto');
const {put,list}=require('@vercel/blob');
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'20kb'}));
async function loadQuiz(id){
 const result=await list({prefix:'quizzes/'+id+'.json',limit:1});
 const blob=result.blobs.find(item=>item.pathname==='quizzes/'+id+'.json');
 if(!blob)return null;
 const response=await fetch(blob.url);
 if(!response.ok)throw new Error('Quiz could not be loaded');
 return await response.json();
}
app.post('/api/quizzes',async(req,res)=>{
 try{
  const quiz=req.body||{};
  if(!['friendship','personality'].includes(quiz.type)||typeof quiz.title!=='string'||!quiz.title.trim()||quiz.title.length>70||!Array.isArray(quiz.questions)||quiz.questions.length<1||quiz.questions.length>50)return res.status(400).json({error:'Invalid quiz'});
  if(quiz.type==='friendship'){
   for(const q of quiz.questions)if(typeof q.q!=='string'||!q.q.trim()||q.q.length>140||!Array.isArray(q.opts)||q.opts.length!==4||q.opts.some(x=>typeof x!=='string'||!x.trim()||x.length>80)||!Number.isInteger(q.a)||q.a<0||q.a>3)return res.status(400).json({error:'Complete every question and choose its correct answer'});
  }else{
   if(!Array.isArray(quiz.outcomes)||quiz.outcomes.length<2||quiz.outcomes.length>8||quiz.outcomes.some(x=>typeof x!=='string'||!x.trim()||x.length>40)||new Set(quiz.outcomes.map(x=>x.toLowerCase())).size!==quiz.outcomes.length)return res.status(400).json({error:'Invalid personality outcomes'});
   for(const q of quiz.questions)if(typeof q.q!=='string'||!q.q.trim()||q.q.length>140||!Array.isArray(q.opts)||q.opts.length!==4||q.opts.some(x=>!x||typeof x.text!=='string'||!x.text.trim()||x.text.length>100||!Number.isInteger(x.out)||x.out<0||x.out>=quiz.outcomes.length))return res.status(400).json({error:'Complete every question and assign each answer to a result'});
  }
  const id=crypto.randomUUID();
  await put('quizzes/'+id+'.json',JSON.stringify(quiz),{access:'public',addRandomSuffix:false,contentType:'application/json'});
  res.status(201).json({quizId:id});
 }catch(error){console.error('Quiz save failed:',error.message);res.status(503).json({error:'Could not create the share link. Please try again.'});}
});
app.get('/api/quizzes/:id',async(req,res)=>{
 try{
  const id=String(req.params.id||'');
  if(!/^[a-f0-9-]{36}$/.test(id))return res.status(400).json({error:'Invalid quiz link'});
  const quiz=await loadQuiz(id);
  if(!quiz)return res.status(404).json({error:'Quiz not found'});
  const safe={...quiz,questions:quiz.questions.map(q=>quiz.type==='friendship'?{q:q.q,opts:q.opts}:{q:q.q,opts:q.opts})};
  res.set('Cache-Control','no-store').json(safe);
 }catch(error){console.error('Quiz load failed:',error.message);res.status(503).json({error:'Quiz is temporarily unavailable'});}
});
app.post('/api/quiz-result',async(req,res)=>{
 try{
  const {quizId,answers,name,shareScore}=req.body||{};
  if(typeof quizId!=='string'||!/^[a-f0-9-]{36}$/.test(quizId)||!Array.isArray(answers))return res.status(400).json({error:'Invalid quiz result'});
  const quiz=await loadQuiz(quizId);
  if(!quiz||answers.length!==quiz.questions.length||answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=quiz.questions[i].opts.length))return res.status(400).json({error:'Please answer every question'});
  let result;
  if(quiz.type==='friendship'){
   const score=answers.reduce((sum,a,i)=>sum+(a===quiz.questions[i].a?1:0),0);
   result={score,total:quiz.questions.length,percent:Math.round(score/quiz.questions.length*100)};
   if(shareScore===true){
    if(typeof name!=='string'||!name.trim()||name.trim().length>35)return res.status(400).json({error:'Enter a nickname to share your score'});
    const entry={name:name.trim().replace(/[<>]/g,''),...result,createdAt:new Date().toISOString()};
    await put('scores/'+quizId+'/'+crypto.randomUUID()+'.json',JSON.stringify(entry),{access:'public',addRandomSuffix:false,contentType:'application/json'});
   }
  }else{
   const counts=quiz.outcomes.map(()=>0);
   answers.forEach((answer,i)=>{const outcome=quiz.questions[i].opts[answer].out;if(counts[outcome]!==undefined)counts[outcome]++;});
   result={outcome:quiz.outcomes[counts.indexOf(Math.max(...counts))]||'One of a kind'};
  }
  res.set('Cache-Control','no-store').json(result);
 }catch(error){console.error('Quiz result failed:',error.message);res.status(503).json({error:'Could not calculate your result. Please try again.'});}
});
app.get('/api/leaderboard',async(req,res)=>{
 try{
  const quizId=String(req.query.quizId||'');
  if(!/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/.test(quizId))return res.status(400).json({error:'Invalid quiz ID'});
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
