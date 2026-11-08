const express=require('express');
const path=require('path');
const crypto=require('crypto');
const {put,list}=require('@vercel/blob');
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use((req,res,next)=>{
 res.set('X-Content-Type-Options','nosniff');
 res.set('Referrer-Policy','strict-origin-when-cross-origin');
 res.set('X-Frame-Options','DENY');
 res.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 next();
});
const rateBuckets=new Map();
function rateLimit({limit,windowMs}){
 return (req,res,next)=>{
  const now=Date.now(),key=req.ip||req.socket.remoteAddress||'unknown';
  let bucket=rateBuckets.get(key);
  if(!bucket||now-bucket.start>=windowMs){bucket={start:now,count:0};rateBuckets.set(key,bucket);}
  bucket.count++;
  if(rateBuckets.size>5000){for(const [k,v] of rateBuckets)if(now-v.start>=windowMs)rateBuckets.delete(k);}
  if(bucket.count>limit){res.set('Retry-After',String(Math.ceil((bucket.start+windowMs-now)/1000)));return res.status(429).json({error:'Too many requests. Please wait a little and try again.'});}
  next();
 };
}
const strictUuid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

app.use(express.json({limit:'64kb'}));
async function loadQuiz(id){
 const result=await list({prefix:'quizzes/'+id+'.json',limit:1});
 const blob=result.blobs.find(item=>item.pathname==='quizzes/'+id+'.json');
 if(!blob)return null;
 const response=await fetch(blob.url);
 if(!response.ok)throw new Error('Quiz could not be loaded');
 return await response.json();
}
app.post('/api/quizzes',rateLimit({limit:20,windowMs:60*60*1000}),async(req,res)=>{
 try{
  const quiz=req.body||{};
  if(!['friendship','personality'].includes(quiz.type)||typeof quiz.title!=='string'||!quiz.title.trim()||quiz.title.length>70||typeof quiz.creator!=='string'||quiz.creator.length>35||!Array.isArray(quiz.questions)||quiz.questions.length<1||quiz.questions.length>50)return res.status(400).json({error:'Invalid quiz. Check the title, creator name and question count.'});
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
  if(!strictUuid(id))return res.status(400).json({error:'Invalid quiz link'});
  const quiz=await loadQuiz(id);
  if(!quiz)return res.status(404).json({error:'Quiz not found'});
  const safe={...quiz,questions:quiz.questions.map(q=>quiz.type==='friendship'?{q:q.q,opts:q.opts}:{q:q.q,opts:q.opts})};
  res.set('Cache-Control','no-store').json(safe);
 }catch(error){console.error('Quiz load failed:',error.message);res.status(503).json({error:'Quiz is temporarily unavailable'});}
});
app.post('/api/quiz-result',rateLimit({limit:60,windowMs:60*60*1000}),async(req,res)=>{
 try{
  const {quizId,answers,name,shareScore}=req.body||{};
  if(typeof quizId!=='string'||!strictUuid(quizId)||!Array.isArray(answers))return res.status(400).json({error:'Invalid quiz result'});
  const quiz=await loadQuiz(quizId);
  if(!quiz||!Array.isArray(quiz.questions)||answers.length!==quiz.questions.length||answers.some((a,i)=>!Number.isInteger(a)||a<0||!Array.isArray(quiz.questions[i].opts)||a>=quiz.questions[i].opts.length))return res.status(400).json({error:'Please answer every question'});
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
app.get('/api/leaderboard',rateLimit({limit:120,windowMs:60*60*1000}),async(req,res)=>{
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
const policyPages={
 '/privacy.html':`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Privacy — AskSphere</title><body style="font:16px/1.6 system-ui;max-width:760px;margin:50px auto;padding:20px"><a href="/">← AskSphere</a><h1>Privacy Policy</h1><p><strong>Last updated: 8 November 2026</strong></p><p>AskSphere lets people create and play friendship and personality quizzes. There are no user accounts in this version.</p><h2>Information we store</h2><ul><li><strong>Quiz content:</strong> Friendship quiz titles, creator names, questions, answer choices and correct answers are stored so share links work and results can be calculated. Personality quiz content is carried in its share link.</li><li><strong>Public leaderboard:</strong> A player's nickname and score are stored and displayed only if the player checks the explicit sharing consent box. Do not use your real name if you do not want it public.</li><li><strong>Answers:</strong> Individual player answers are processed to calculate results and are not saved as a response history.</li><li><strong>Technical data:</strong> Hosting and storage providers may process request metadata and logs to operate and secure the service.</li></ul><h2>Storage and retention</h2><p>Quiz data and opted-in leaderboard entries use Vercel Blob. There is no self-service deletion feature or automatic retention period; records may remain until the operator deletes them. Treat share links as public to anyone who receives them.</p><h2>Advertising and cookies</h2><p>Advertising is not guaranteed to be active. If Google AdSense or other advertising is enabled, partners may use cookies or similar technologies under their own policies. The operator must configure required consent tools and regional disclosures before serving ads.</p><h2>Third-party providers</h2><p>AskSphere is hosted on Vercel and uses Vercel Blob for quiz and leaderboard storage. Those providers process information as needed to provide the service.</p><h2>Your choices and requests</h2><p>Do not submit sensitive personal information. To request access to or deletion of quiz or leaderboard data, contact the operator using the support contact on the Contact page. A monitored support email and deletion process must be configured before public launch. This policy is general information, not legal advice.</p></body></html>`,
 '/terms.html':`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Terms — AskSphere</title><body style="font:16px/1.6 system-ui;max-width:760px;margin:50px auto;padding:20px"><a href="/">← AskSphere</a><h1>Terms of Use</h1><p><strong>Last updated: 8 November 2026</strong></p><p>Use AskSphere lawfully and respectfully. You are responsible for quiz content you create and share.</p><ul><li>Do not create quizzes that harass, threaten, impersonate, expose private information or encourage harmful behavior.</li><li>Do not include passwords, financial details, sensitive personal information or information about another person without permission.</li><li>Only opt in to the public leaderboard if you are comfortable displaying your nickname and score publicly.</li><li>Do not disrupt the service, submit abusive content or manipulate leaderboards.</li></ul><p>Quiz links may be shared with anyone who receives them. AskSphere is provided as-is and may change or become unavailable.</p><p>The operator must add accurate business/contact details, governing-law information and obtain appropriate legal review before public launch. These starter terms are not legal advice.</p></body></html>`,
 '/contact.html':`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Contact — AskSphere</title><body style="font:16px/1.6 system-ui;max-width:760px;margin:50px auto;padding:20px"><a href="/">← AskSphere</a><h1>Contact AskSphere</h1><p>For support, privacy requests, data deletion requests or content concerns, contact the website operator.</p><p><strong>Support email: not configured yet.</strong></p><p>The operator must publish a monitored support email address before opening the service to the public or applying for advertising approval. Do not submit private information until a verified contact channel is available.</p></body></html>`
};
for(const [route,content] of Object.entries(policyPages))app.get(route,(req,res)=>res.type('html').send(content));
app.use(express.static(__dirname,{extensions:['html']}));
app.get('/health',(req,res)=>res.json({ok:true,app:'AskSphere'}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));

app.use((err,req,res,next)=>{
 if(err&&err.type==='entity.too.large')return res.status(413).json({error:'Request is too large.'});
 if(err instanceof SyntaxError&&err.status===400&&'body' in err)return res.status(400).json({error:'Please send valid JSON.'});
 console.error('Request error:',err?.message||err);
 res.status(500).json({error:'Something went wrong. Please try again.'});
});
const port=process.env.PORT||3000;
app.listen(port,'0.0.0.0',()=>console.log('AskSphere listening on '+port));
