import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { GoogleGenAI } from '@google/genai'
import { supabase } from './supabaseClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, 'data', 'db.json')
const app = express()
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'ruraladapt-local-development-secret'
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || JWT_SECRET.length < 32)) { throw new Error('Set a strong JWT_SECRET (at least 32 characters) before running in production.') }
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'

app.use(cors())
app.use(express.json({ limit: '15mb' }))

let writeQueue = Promise.resolve()
async function readDb() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')) }
  catch { return { users: [], profiles: [], savedSolutions: [], soilAnalyses: [], farmerCases: [] } }
}
async function writeDb(db) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true })
  writeQueue = writeQueue.then(() => fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8'))
  return writeQueue
}
const publicUser = user => ({ id: user.id, name: user.name, email: user.email })
const signToken = user => jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
function cleanText(value) { return typeof value === 'string' ? value.trim() : '' }
function normalize(value) { return cleanText(value).toLowerCase() }

async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Login required.' })
    const decoded = jwt.verify(token, JWT_SECRET)
    const db = await readDb()
    const user = db.users.find(u => u.id === decoded.sub)
    if (!user) return res.status(401).json({ error: 'User not found.' })
    req.user = user
    next()
  } catch { res.status(401).json({ error: 'Session expired. Please login again.' }) }
}

app.get('/api/health', async (_req, res) => {
  const db = await readDb()
  res.json({ ok: true, database: false, storage: 'local-json', user_count: db.users.length, aiConfigured: Boolean(ai), model: GEMINI_MODEL })
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = cleanText(req.body?.name), email = normalize(req.body?.email), password = String(req.body?.password || '')
    if (!name || !email || password.length < 6) return res.status(400).json({ error: 'Enter a name, valid email and a password of at least 6 characters.' })
    const db = await readDb()
    if (db.users.some(u => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists.' })
    const user = { id: crypto.randomUUID(), name, email, password_hash: await bcrypt.hash(password, 12), created_at: new Date().toISOString() }
    db.users.push(user); await writeDb(db)
    res.json({ token: signToken(user), user: publicUser(user) })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to create the account.' }) }
})

app.post('/api/auth/login', async (req, res) => {
  const email = normalize(req.body?.email), password = String(req.body?.password || '')
  const db = await readDb(); const user = db.users.find(u => u.email === email)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' })
  res.json({ token: signToken(user), user: publicUser(user) })
})
app.post('/api/auth/logout', auth, (_req, res) => res.json({ ok: true }))

app.get('/api/me', auth, async (req, res) => {
  const db = await readDb(); const profile = db.profiles.find(p => p.user_id === req.user.id) || null
  res.json({ user: publicUser(req.user), profile })
})
app.put('/api/profile', auth, async (req, res) => {
  const p = req.body || {}, db = await readDb(); let profile = db.profiles.find(x => x.user_id === req.user.id)
  const next = { user_id: req.user.id, location: p.location || '', farm_size: p.farmSize || '', crop_activity: p.cropActivity || '', water_availability: p.waterAvailability || '', electricity_availability: p.electricityAvailability || '', budget: p.budget || '', updated_at: new Date().toISOString() }
  if (profile) Object.assign(profile, next); else db.profiles.push(next)
  await writeDb(db); res.json({ ok: true })
})

function buildAdaptPrompt(input) {
  const soil = input.soil || {}
  const fertilizer = input.fertilizer || {}
  const soilTest = input.soilTest || {}
  const environment = input.environment || {}
  return `Create a practical, data-driven RuralAdapt solution.

USER-PROVIDED CONTEXT ONLY:
Location: ${input.location || 'Not provided'}
Problem: ${input.problem || 'Not provided'}
Problem type: ${input.problemType || 'Not provided'}
Required response language: ${input.responseLanguage || 'English'} (write all farmer-facing text in this language; preserve scientific units and names clearly)
Crop/activity: ${input.cropActivity || 'Not provided'}
Farm size: ${input.farmSize || 'Not provided'}
Budget: ${input.budget || 'Not provided'}
Water availability: ${input.waterAvailability || 'Not provided'}
Electricity: ${input.electricityAvailability || 'Not provided'}
Soil type (manual only): ${soil.name || 'Not provided'}
Soil confidence/source: ${soil.confidence || 'Not provided'} / ${soil.source || 'Not provided'}
Soil-test history: ${soilTest.available || 'Not provided'}; last test: ${soilTest.lastTest || 'Not provided'}
Soil-test values: ${soilTest.values ? JSON.stringify(soilTest.values) : 'Not provided'}
Fertilizer/manure history: ${fertilizer.name ? JSON.stringify(fertilizer) : 'Not provided'}
Atmospheric/environment information explicitly supplied by user: ${Object.keys(environment).length ? JSON.stringify(environment) : 'Not provided'}

RULES:
1. Base the recommendation primarily on the data the user actually provided.
2. Consider soil factors, environmental/atmospheric factors, water, electricity, budget, farm scale and crop/activity together when available.
3. Never invent soil test values, weather, climate, fertilizer history, local statistics, costs, or other missing facts.
4. Location is contextual only. Do NOT infer or auto-fill soil type from location.
5. If important data is missing, say what is missing and whether a soil test, weather observation, water test, or other measurement would improve confidence.
6. Recommendations are decision support, not guarantees. Avoid claiming a crop or treatment is certain to succeed.
7. Use the four-stage Adaptation Ladder: TRADITIONAL (existing local practices and knowledge), LOW-COST, COMMUNITY, and SMART. Escalate only when justified.
8. Keep the language practical and easy to understand.
9. Write all farmer-facing text in the requested response language: ${input.responseLanguage || 'English'}. Do not mix languages unless a technical term needs a brief explanation.

Return only valid JSON in exactly this shape:
{"title":"short title","summary":"2-3 sentence summary explaining how the supplied data influenced the recommendation","confidence":"High|Medium|Low","dataUsed":[],"missingData":[],"soilReasoning":"","environmentReasoning":"","fertilizerConsideration":"","steps":[{"key":"traditional","title":"Traditional","solution":"","how":"","cost":"","benefit":"","whenToMoveOn":""},{"key":"lowCost","title":"Low-Cost Improvement","solution":"","how":"","cost":"","benefit":"","whenToMoveOn":""},{"key":"community","title":"Community-Level","solution":"","how":"","cost":"","benefit":"","whenToMoveOn":""},{"key":"smart","title":"Smart / Technology","solution":"","how":"","cost":"","benefit":"","whenToMoveOn":""}],"globalInspiration":[],"constraints":[],"pilot":[],"risks":[]}`
}

app.post('/api/adapt', async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: 'Gemini is not configured. Add GEMINI_API_KEY to .env on the backend.' })
    const input = req.body || {}
    const systemInstruction = `You are RuralAdapt AI, a careful agricultural and rural adaptation assistant. Your core principle is Global Ideas. Local Solutions. Use user-provided evidence first. Never invent missing soil, climate, weather, fertilizer, crop, water, cost or location facts. Do not infer soil type from location. If the user provides soil-test values or an uploaded soil analysis, use those values explicitly. If data is insufficient for a precise recommendation, state the limitation and suggest what should be measured or tested next. Return only valid JSON.`
    const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: buildAdaptPrompt(input), config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.2 } })
    let result
    try { result = JSON.parse(response.text || '') } catch { return res.status(502).json({ error: 'Gemini returned an invalid response. Please try again.' }) }
    res.json({ result })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Unable to generate the adapted solution.', detail: error.message })
  }
})

app.post('/api/soil/analyze', async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: 'Gemini is not configured. Add GEMINI_API_KEY to .env on the backend.' })
    const { fileName, mimeType, data, context = {} } = req.body || {}
    if (!data || !mimeType) return res.status(400).json({ error: 'Upload a soil test report first.' })
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) return res.status(400).json({ error: 'Please upload a PDF, PNG, JPG or WEBP soil report.' })
    const prompt = `Analyze this soil test report for RuralAdapt AI.

User-provided context:
Location: ${context.location || 'Not provided'}
Crop/activity: ${context.cropActivity || 'Not provided'}
Farm size: ${context.farmSize || 'Not provided'}

IMPORTANT:
- Extract only values actually visible/readable in the uploaded report.
- Do not invent missing laboratory values.
- Explain units when shown.
- Distinguish measured values from interpretation.
- Suggest potentially suitable crops based on the soil evidence and the user's supplied context, but do not guarantee success.
- If climate, water, salinity, drainage or another factor is needed to judge crop suitability and is not in the report/context, explicitly say so.
- Tell the user which additional soil tests or field information would improve the assessment.
- This is decision support, not a laboratory diagnosis or guaranteed agronomic prescription.

Return only JSON:
{"reportSummary":"","parameters":[{"name":"pH","value":"","unit":"","status":"reported|not_reported","note":""}],"soilCharacteristics":[],"strengths":[],"concerns":[],"potentialCrops":[{"crop":"","why":"","confidence":"High|Medium|Low","conditions":""}],"recommendedTests":[{"test":"","reason":"","priority":"High|Medium|Low"}],"limitations":[]}`
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ text: prompt }, { inlineData: { mimeType, data } }],
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    })
    let analysis
    try { analysis = JSON.parse(response.text || '') } catch { return res.status(502).json({ error: 'The soil report could not be interpreted as structured data.' }) }
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace(/^Bearer\s+/i, '')
        const decoded = jwt.verify(token, JWT_SECRET)
        const db = await readDb()
        if (db.users.some(u => u.id === decoded.sub)) {
          db.soilAnalyses = db.soilAnalyses || []
          db.soilAnalyses.push({ id: crypto.randomUUID(), user_id: decoded.sub, file_name: fileName || 'soil-report', analysis, created_at: new Date().toISOString() })
          await writeDb(db)
        }
      } catch {}
    }
    res.json({ analysis, fileName: fileName || 'soil-report' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Unable to analyze the soil report.', detail: error.message })
  }
})

app.get('/api/saved', auth, async (req, res) => { const db = await readDb(); res.json({ solutions: db.savedSolutions.filter(x => x.user_id === req.user.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) }) })
app.post('/api/saved', auth, async (req, res) => { const db = await readDb(); const item = { id: crypto.randomUUID(), user_id: req.user.id, title: cleanText(req.body?.title) || 'RuralAdapt solution', input_data: req.body?.inputData || {}, result_data: req.body?.result || {}, created_at: new Date().toISOString() }; db.savedSolutions.push(item); await writeDb(db); res.status(201).json({ id: item.id, ok: true }) })
app.delete('/api/saved/:id', auth, async (req, res) => { const db = await readDb(); db.savedSolutions = db.savedSolutions.filter(x => !(x.id === req.params.id && x.user_id === req.user.id)); await writeDb(db); res.json({ ok: true }) })


// Private-by-default farmer cases. Shared learning is opt-in and uses minimized, anonymized fields.
app.post('/api/cases', async (req, res) => {
  try {
    const { guestKey, inputData, resultData } = req.body || {}
    if (!guestKey || typeof guestKey !== 'string' || guestKey.length < 20) return res.status(400).json({ error: 'A valid guest key is required.' })
    if (!inputData || !resultData) return res.status(400).json({ error: 'Case details are missing.' })
    const db = await readDb(); db.farmerCases ||= []
    const item = { id: crypto.randomUUID(), guest_key_hash: crypto.createHash('sha256').update(guestKey).digest('hex'), user_id: null, input_data: inputData, result_data: resultData, share_consent: false, outcome: 'unknown', created_at: new Date().toISOString() }
    db.farmerCases.push(item); await writeDb(db)
    res.status(201).json({ caseId: item.id })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not save this case privately.' }) }
})
app.post('/api/cases/:id/consent', async (req, res) => {
  try {
    const { guestKey, consent } = req.body || {}
    if (consent !== true) return res.status(400).json({ error: 'This endpoint records explicit opt-in consent only.' })
    const db = await readDb(); db.farmerCases ||= []
    const item = db.farmerCases.find(x => x.id === req.params.id && x.guest_key_hash === crypto.createHash('sha256').update(String(guestKey || '')).digest('hex'))
    if (!item) return res.status(404).json({ error: 'Private case not found for this browser.' })
    item.share_consent = true; item.consent_at = new Date().toISOString()
    // Shared record contains only minimized problem context and outcome; no guest key, name, or precise location.
    item.shared_case = { problem_type: item.input_data.problemType || '', crop_activity: item.input_data.cropActivity || '', problem: String(item.input_data.problem || '').slice(0, 500), broad_conditions: { farm_size: item.input_data.farmSize || '', water: item.input_data.waterAvailability || '', soil: item.input_data.soil?.name || '' }, solution_summary: String(item.result_data.summary || '').slice(0, 800), outcome: item.outcome || 'unknown', created_at: item.created_at, verification: 'farmer-reported; not independently verified' }
    await writeDb(db); res.json({ ok: true, message: 'Consent recorded. This anonymized case may be used for similar-case learning.' })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not record consent.' }) }
})
app.post('/api/cases/:id/outcome', async (req, res) => {
  const { guestKey, outcome } = req.body || {}
  if (!['helped', 'no_change', 'worsened', 'unknown'].includes(outcome)) return res.status(400).json({ error: 'Choose a valid outcome.' })
  const db = await readDb(); db.farmerCases ||= []
  const item = db.farmerCases.find(x => x.id === req.params.id && x.guest_key_hash === crypto.createHash('sha256').update(String(guestKey || '')).digest('hex'))
  if (!item) return res.status(404).json({ error: 'Private case not found for this browser.' })
  item.outcome = outcome; item.outcome_updated_at = new Date().toISOString()
  if (item.share_consent && item.shared_case) item.shared_case.outcome = outcome
  await writeDb(db); res.json({ ok: true })
})
app.get('/api/cases/similar', async (req, res) => {
  const db = await readDb(); db.farmerCases ||= []
  const q = String(req.query.q || '').toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 3)
  const type = String(req.query.type || '').toLowerCase(), crop = String(req.query.crop || '').toLowerCase()
  const rows = db.farmerCases.filter(x => x.share_consent && x.shared_case).map(x => x.shared_case).map(c => {
    const hay = `${c.problem_type} ${c.crop_activity} ${c.problem} ${c.solution_summary}`.toLowerCase()
    const hits = q.filter(t => hay.includes(t)).length + (type && String(c.problem_type).toLowerCase() === type ? 2 : 0) + (crop && String(c.crop_activity).toLowerCase().includes(crop) ? 2 : 0)
    return { ...c, relevance: hits }
  }).filter(c => c.relevance > 0).sort((a,b) => b.relevance-a.relevance).slice(0,5)
  res.json({ cases: rows })
})

app.post('/api/crop/analyze', async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: 'Gemini is not configured. Add GEMINI_API_KEY to the backend .env file.' })
    const { data, mimeType, context = {} } = req.body || {}
    if (!data || !['image/jpeg','image/png','image/webp'].includes(mimeType)) return res.status(400).json({ error: 'Upload a JPG, PNG or WEBP crop/farm photo.' })
    const raw = String(data).replace(/^data:[^;]+;base64,/, '')
    if (raw.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'This image is too large. Please choose an image under about 6 MB.' })
    const prompt = `Review this farmer-provided crop/farm photo for RuralAdapt AI. First assess whether the image is clear enough to interpret. If blurry, too dark, too distant, or not showing the subject, set imageClear=false and give a simple retake instruction. Never guess from an unclear image. If clear, describe only visible observations, list possible causes as possibilities (not diagnosis), and ask the farmer to confirm/correct the observations before advice. Crop/activity: ${context.crop || 'not provided'}. Problem: ${context.problem || 'not provided'}. Return JSON: {"imageClear":true,"qualityReason":"","retakeAdvice":"","observations":[],"possibleCauses":[],"questionsForFarmer":[],"disclaimer":"Photo observations are not a confirmed diagnosis."}`
    const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: raw } }] }], config: { responseMimeType: 'application/json', temperature: 0.1 } })
    let analysis; try { analysis = JSON.parse(response.text || '') } catch { return res.status(502).json({ error: 'The photo could not be assessed. Please try another image.' }) }
    res.json({ analysis })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to assess this photo safely.' }) }
})

app.listen(PORT, () => console.log(`RuralAdapt API running at http://localhost:${PORT}`))
