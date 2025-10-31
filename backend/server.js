require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const mammoth = require('mammoth');
const multer = require('multer');
const Stripe = require('stripe');
const cors = require('cors');
const tfidf = require('tfidf-weighted-distance');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname,'../frontend')));

const upload = multer({dest:'uploads/'});
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const bias = {
  cookbooks:['recipe','food','ingredient'],
  'self-help':['mindset','growth','motivation'],
  business:['profit','strategy','scale']
};

app.post('/smart-place', upload.array('images'), async (req,res)=>{
  const {chapters,category} = req.body;
  const chapterTexts = chapters.map(c=>c.content);
  const imageTexts = req.files.map(f=>f.originalname);
  const vectors = chapterTexts.map(tfidf);
  const imgVec = imageTexts.map(tfidf);
  const threshold = category==='memoir'?0.4:0.5;
  const result = chapters.map((c,i)=>{
    let best={score:0,idx:0};
    imgVec.forEach((v,j)=>{
      const s = tfidf.cosineSimilarity(vectors[i],v);
      if(s>best.score && s>threshold) best={score:s,idx:j};
    });
    return {...c,imageIdx:best.idx};
  });
  res.json(result);
});

app.post('/export/pdf', upload.array('images'), async (req,res)=>{
  const html = req.body.html;
  const browser = await puppeteer.launch({headless:true});
  const page = await browser.newPage();
  await page.setContent(html,{waitUntil:'networkidle0'});
  const pdf = await page.pdf({
    format:'6x9in',
    printBackground:true,
    margin:{top:'0.5in',right:'0.5in',bottom:'0.5in',left:'0.5in'}
  });
  await browser.close();
  res.set('Content-Type','application/pdf');
  res.send(pdf);
});

app.post('/create-checkout', async (req,res)=>{
  const {priceId} = req.body;
  const session = await stripe.checkout.sessions.create({
    payment_method_types:['card'],
    line_items:[{price:priceId,quantity:1}],
    mode:'payment',
    success_url:`${process.env.FRONTEND_URL}?success=1`,
    cancel_url:`${process.env.FRONTEND_URL}?canceled=1`
  });
  res.json({id:session.id});
});

const PORT = process.env.PORT||3000;
app.listen(PORT,()=>console.log(`Server on ${PORT}`));
