import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowRight, Bookmark, Check, ChevronDown, ChevronLeft, ChevronUp, CircleUserRound,
  Database, Droplets, FileText, FlaskConical, History, Home, Info, Leaf, LogIn, LogOut,
  Menu, MapPin, MessageCircle, Plus, Search, Settings, ShieldCheck, Sparkles, Sprout, UserPlus, X, Wheat,
  Wifi, Zap, Mic, Volume2, ImagePlus, Camera, CheckCircle2, AlertTriangle, Languages
} from 'lucide-react'

const API = '/api'
const tokenKey = 'ruraladapt_token'
const guestKeyStorage = 'ruraladapt_guest_key'
function getGuestKey() { let key = localStorage.getItem(guestKeyStorage); if (!key) { key = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem(guestKeyStorage, key) } return key }

const defaultForm = {
  problemType: 'Water',
  responseLanguage: 'English',
  problem: '',
  cropActivity: '',
  location: '',
  farmSize: '',
  budget: '',
  waterAvailability: '',
  electricityAvailability: '',
  environment: { temperature: '', rainfall: '', humidity: '', season: '' },
  hasExtraData: false,
  soil: { name: '', confidence: '', source: '' },
  fertilizer: { name: '', type: '', amount: '', frequency: '', lastApplied: '' },
  soilTest: { available: '', lastTest: '' }
}

const categories = [
  { id: 'Water', label: 'Water', icon: Droplets },
  { id: 'Soil', label: 'Soil', icon: Leaf },
  { id: 'Crop', label: 'Crop', icon: Wheat },
  { id: 'Pest', label: 'Pest', icon: Sprout },
  { id: 'Storage', label: 'Storage', icon: Database },
  { id: 'Market', label: 'Market', icon: Search }
]

function App() {
  const [view, setView] = useState('home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [result, setResult] = useState(null)
  const [saved, setSaved] = useState([])
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [auth, setAuth] = useState({ name: '', email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [activeStep, setActiveStep] = useState(0)
  const [selectedSaved, setSelectedSaved] = useState(null)
  const [largeText, setLargeText] = useState(false)
  const [caseId, setCaseId] = useState('')
  const [similarCases, setSimilarCases] = useState([])
  const [caseConsent, setCaseConsent] = useState(false)
  const [cropPhoto, setCropPhoto] = useState(null)
  const [photoAnalysis, setPhotoAnalysis] = useState(null)
  const [photoLoading, setPhotoLoading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem(tokenKey)
    if (token) loadSession()
  }, [])

  useEffect(() => {
    if (user) loadSaved()
  }, [user])

  async function api(path, options = {}) {
    const token = localStorage.getItem(tokenKey)
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await fetch(`${API}${path}`, { ...options, headers })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Something went wrong.')
    return data
  }

  async function loadSession() {
    try {
      const data = await api('/me')
      setUser(data.user)
      setProfile(data.profile)
    } catch {
      localStorage.removeItem(tokenKey)
    }
  }

  async function loadSaved() {
    try { setSaved((await api('/saved')).solutions || []) } catch { setSaved([]) }
  }

  function go(next) {
    setView(next)
    setSidebarOpen(false)
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function update(key, value) { setForm(prev => ({ ...prev, [key]: value })) }
  function updateNested(group, key, value) { setForm(prev => ({ ...prev, [group]: { ...prev[group], [key]: value } })) }

  function openCreate(initialCategory = '') {
    let soilContext = {}
    try { soilContext = JSON.parse(localStorage.getItem('ruraladapt_soil_analysis') || '{}') } catch {}
    setForm(prev => ({ ...defaultForm, problemType: initialCategory || prev.problemType || defaultForm.problemType, location: profile?.location || '', cropActivity: profile?.crop_activity || '', farmSize: profile?.farm_size || '', budget: profile?.budget || '', waterAvailability: profile?.water_availability || '', electricityAvailability: profile?.electricity_availability || '', hasExtraData: Boolean(soilContext.parameters?.length), soilTest: { ...defaultForm.soilTest, available: soilContext.parameters?.length ? 'Yes' : '', values: soilContext.parameters || [] }, soil: { ...defaultForm.soil, name: soilContext.soilType || '' } }))
    setResult(null); setActiveStep(0); go('create')
  }

  async function generate() {
    if (!form.problem.trim()) return setMessage('Tell us the main problem first.')
    setLoading(true); setMessage('')
    try {
      const data = await api('/adapt', { method: 'POST', body: JSON.stringify(form) })
      setResult(data.result); setActiveStep(0); setCaseId(''); setCaseConsent(false); setSimilarCases([]); go('result');
      try { const savedCase = await api('/cases', { method: 'POST', body: JSON.stringify({ guestKey: getGuestKey(), inputData: form, resultData: data.result }) }); setCaseId(savedCase.caseId) } catch {}
      try { const similar = await api(`/cases/similar?type=${encodeURIComponent(form.problemType)}&crop=${encodeURIComponent(form.cropActivity || '')}&q=${encodeURIComponent(form.problem || '')}`); setSimilarCases(similar.cases || []) } catch {}
    } catch (error) { setMessage(error.message) }
    finally { setLoading(false) }
  }

  async function saveSolution() {
    if (!user) { setAuthMode('login'); setAuthOpen(true); return }
    if (!result) return
    try {
      await api('/saved', { method: 'POST', body: JSON.stringify({ title: result.title, inputData: form, result }) })
      await loadSaved(); setMessage('Solution saved to your library.')
    } catch (error) { setMessage(error.message) }
  }

  async function deleteSaved(id) {
    try { await api(`/saved/${id}`, { method: 'DELETE' }); await loadSaved(); if (selectedSaved?.id === id) setSelectedSaved(null) }
    catch (error) { setMessage(error.message) }
  }

  async function submitAuth() {
    setAuthError('')
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register'
      const data = await api(endpoint, { method: 'POST', body: JSON.stringify(auth) })
      localStorage.setItem(tokenKey, data.token); setUser(data.user); setAuthOpen(false); setAuth({ name: '', email: '', password: '' }); setMessage(`Welcome, ${data.user.name}.`)
    } catch (error) { setAuthError(error.message) }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }) } catch {}
    localStorage.removeItem(tokenKey); setUser(null); setProfile(null); setSaved([]); go('home')
  }

  const navItems = [
    ['home', 'Home', Home], ['create', 'Find a Solution', Search], ['saved', 'Saved Solutions', Bookmark], ['history', 'History', History],
    ['soil-analysis', 'Soil Analysis', FileText], ['profile', 'My Farm Profile', CircleUserRound]
  ]

  return <div className={`app-shell ${largeText ? 'large-text-mode' : ''}`}>
    <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} open={sidebarOpen} setOpen={setSidebarOpen} navItems={navItems} view={view} go={go} onCreate={openCreate} user={user} onLogin={() => { setAuthMode('login'); setAuthOpen(true) }} onLogout={logout} />

    <div className={`app-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu /></button>
        <div className="mobile-brand"><span className="brand-mark"><Leaf size={18} /></span> RuralAdapt AI</div>
        <div className="topbar-search"><Search size={17} /><span>Ask RuralAdapt about a rural problem...</span></div>
        <div className="topbar-actions">
          <button className="top-action accessibility-toggle" onClick={() => setLargeText(v => !v)} aria-pressed={largeText} title="Toggle larger text"><span aria-hidden="true">A+</span><span>{largeText ? 'Normal text' : 'Larger text'}</span></button>
          <button className="top-action" onClick={() => go('soil-analysis')}><FileText size={17} /> <span>Soil Analysis</span></button>
          {user ? <button className="avatar" onClick={() => go('profile')}>{user.name.slice(0,1).toUpperCase()}</button> : <button className="login-top" onClick={() => { setAuthMode('login'); setAuthOpen(true) }}>Log in</button>}
        </div>
      </header>

      {view === 'home' && <HomeView user={user} onCreate={openCreate} savedCount={saved.length} onSaved={() => go('saved')} />}
      {view === 'create' && <CreateView form={form} update={update} updateNested={updateNested} categories={categories} generate={generate} loading={loading} message={message} cropPhoto={cropPhoto} setCropPhoto={setCropPhoto} photoAnalysis={photoAnalysis} setPhotoAnalysis={setPhotoAnalysis} photoLoading={photoLoading} setPhotoLoading={setPhotoLoading} api={api} />}
      {view === 'result' && <ResultView result={result} resultLanguage={form.responseLanguage || 'English'} activeStep={activeStep} setActiveStep={setActiveStep} saveSolution={saveSolution} saved={saved.some(s => s.title === result?.title)} message={message} onCreate={openCreate} caseId={caseId} similarCases={similarCases} caseConsent={caseConsent} setCaseConsent={setCaseConsent} api={api} />}
      {view === 'saved' && <SavedView saved={saved} onOpen={s => { setSelectedSaved(s); setResult(s.result_data); setForm(s.input_data || defaultForm); setActiveStep(0); go('result') }} onDelete={deleteSaved} onLogin={() => { setAuthMode('login'); setAuthOpen(true) }} onCreate={openCreate} user={user} />}
      {view === 'history' && <HistoryView saved={saved} onOpen={s => { setResult(s.result_data); setForm(s.input_data || defaultForm); setActiveStep(0); go('result') }} />}
      {view === 'soil-analysis' && <SoilAnalysisView user={user} profile={profile} onLogin={() => { setAuthMode('login'); setAuthOpen(true) }} onCreate={openCreate} />}
      {view === 'profile' && <ProfileView user={user} profile={profile} onLogin={() => { setAuthMode('login'); setAuthOpen(true) }} onSave={async p => { try { await api('/profile', { method: 'PUT', body: JSON.stringify(p) }); const data = await api('/me'); setProfile(data.profile); setMessage('Farm profile updated.') } catch (e) { setMessage(e.message) } }} />}
      {view === 'settings' && <SettingsView />}
    </div>

    {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} auth={auth} setAuth={setAuth} error={authError} onSubmit={submitAuth} onClose={() => setAuthOpen(false)} />}
  </div>
}

function Sidebar({ collapsed, setCollapsed, open, setOpen, navItems, view, go, onCreate, user, onLogin, onLogout }) {
  return <>
    {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${open ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand"><div className="brand-symbol"><Leaf size={21} /></div>{!collapsed && <div><strong>RuralAdapt</strong><span>AI</span></div>}<button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} title="Collapse navigation">{collapsed ? <ArrowRight size={16} /> : <ChevronLeft size={16} />}</button></div>
      <button className="create-nav" onClick={onCreate}><Plus size={20} /><span>{!collapsed && 'Create Solution'}</span></button>
      <nav className="sidebar-nav">
        {navItems.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => id === 'create' ? onCreate() : go(id)} title={label}><Icon size={19} /><span>{!collapsed && label}</span>{id === 'saved' && savedBadge(user)}</button>)}
      </nav>
      <div className="sidebar-divider" />
      <div className="sidebar-mini-title">{!collapsed && 'YOUR FARM'}</div>
      <button className="sidebar-link" onClick={() => go('profile')} title="Soil & Farm Data"><Leaf size={18} /><span>{!collapsed && 'Soil & Farm Data'}</span></button>
      <button className="sidebar-link" onClick={() => go('soil-analysis')} title="Soil Analysis"><FileText size={18} /><span>{!collapsed && 'Soil Analysis'}</span></button>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <button className="sidebar-link" onClick={() => go('settings')} title="Settings"><Settings size={18} /><span>{!collapsed && 'Settings'}</span></button>
        {user ? <button className="user-strip" onClick={onLogout}><span className="avatar small">{user.name.slice(0,1).toUpperCase()}</span>{!collapsed && <span><b>{user.name}</b><small>Log out</small></span>}<LogOut size={16} /></button> : <button className="user-strip" onClick={onLogin}><span className="avatar small"><UserPlus size={16} /></span>{!collapsed && <span><b>Guest</b><small>Log in to save</small></span>}<LogIn size={16} /></button>}
      </div>
    </aside>
  </>
}

function savedBadge(user) { return null }

function HomeView({ user, onCreate, savedCount, onSaved }) {
  return <main className="page home-page">
    <section className="hero-panel">
      <div className="hero-copy">
        <span className="eyebrow"><Sparkles size={14} /> AI-powered rural adaptation</span>
        <h1>Global ideas.<br /><em>Local solutions.</em></h1>
        <p>Describe a real farming or rural challenge. RuralAdapt AI builds a practical path from traditional knowledge to affordable improvements and smart technology.</p>
        <div className="hero-actions"><button className="primary-btn large" onClick={onCreate}><Plus size={19} /> Find a solution <ArrowRight size={18} /></button><button className="secondary-btn" onClick={onSaved}><Bookmark size={17} /> {savedCount ? `${savedCount} saved` : 'Saved solutions'}</button></div>
        <div className="hero-trust"><span><Check size={14} /> Optional soil data</span><span><Check size={14} /> Gemini AI</span><span><Check size={14} /> Data-driven recommendations</span></div>
      </div>
      <div className="hero-visual">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="visual-card main"><div className="visual-card-top"><span className="tiny-label">ADAPTATION JOURNEY</span><span className="status-dot" /></div><h3>Water shortage</h3><div className="journey-mini"><MiniJourney icon={Leaf} title="Traditional" /><MiniJourney icon={Zap} title="Low-cost" /><MiniJourney icon={Wheat} title="Community" /><MiniJourney icon={Wifi} title="Smart" /></div><div className="visual-note"><Droplets size={15} /><span>Start with what the community already has.</span></div></div>
        <div className="floating-card"><span className="float-icon"><MapPin size={16} /></span><div><b>Context-aware</b><small>Location + crop + constraints</small></div></div>
      </div>
    </section>

    <section className="section-block"><div className="section-title-row"><div><span className="eyebrow">START WITH A REAL PROBLEM</span><h2>What do you need help with?</h2></div><span className="section-count">06 categories</span></div><div className="category-grid">{categories.map(({ id, label, icon: Icon }) => <button key={id} className="category-card" onClick={() => onCreateWithCategory(onCreate, id)}><span className="category-icon"><Icon size={22} /></span><strong>{label}</strong><small>Explore practical adaptations</small><ArrowRight size={16} /></button>)}</div></section>

    <section className="farmer-feedback-panel">
      <div><span className="eyebrow">BUILT WITH FARMERS, NOT ASSUMPTIONS</span><h2>Validate every idea in the real world.</h2><p>Before acting on an AI suggestion, discuss it with farmers or a qualified local agriculture professional. Record the real problem, available resources, budget and feedback so RuralAdapt can be improved around actual needs.</p></div>
      <div className="farmer-feedback-points"><div><Check size={17}/><span>Ask farmers what they currently do</span></div><div><Check size={17}/><span>Check affordability and local feasibility</span></div><div><Check size={17}/><span>Test small and record the outcome</span></div></div>
    </section>
    <section className="feature-strip"><div><span className="eyebrow">WHY RURALADAPT</span><h2>Progressive, not one-size-fits-all.</h2></div><div className="feature-points"><Feature icon={Leaf} title="Traditional first" text="Start with local knowledge and existing resources." /><Feature icon={FileText} title="Soil report analysis" text="Upload a soil test report and use its measured values to improve recommendations." /><Feature icon={Sparkles} title="AI adaptation" text="Gemini turns context into a practical solution journey." /></div></section>
  </main>
}

function onCreateWithCategory(onCreate, id) { onCreate(id) }
function MiniJourney({ icon: Icon, title }) { return <div className="mini-step"><span><Icon size={15} /></span><small>{title}</small></div> }
function Feature({ icon: Icon, title, text }) { return <div className="feature"><span><Icon size={18} /></span><div><b>{title}</b><p>{text}</p></div></div> }

function CreateView({ form, update, updateNested, categories, generate, loading, message, cropPhoto, setCropPhoto, photoAnalysis, setPhotoAnalysis, photoLoading, setPhotoLoading, api }) {
  const [soilReportFile, setSoilReportFile] = useState(null)
  const [soilReportLoading, setSoilReportLoading] = useState(false)
  const [soilReportError, setSoilReportError] = useState('')
  const [soilReportAnalysis, setSoilReportAnalysis] = useState(null)
  const [soilValuesConfirmed, setSoilValuesConfirmed] = useState(false)

  async function analyzeSoilReport() {
    if (!soilReportFile) return setSoilReportError('Choose a soil test report first.')
    if (soilReportFile.size > 10 * 1024 * 1024) return setSoilReportError('Please choose a report under 10 MB.')
    setSoilReportLoading(true); setSoilReportError(''); setSoilReportAnalysis(null); setSoilValuesConfirmed(false)
    try {
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(soilReportFile) })
      const response = await api('/soil/analyze', { method: 'POST', body: JSON.stringify({ fileName: soilReportFile.name, mimeType: soilReportFile.type, data: dataUrl, context: { location: form.location, cropActivity: form.cropActivity, farmSize: form.farmSize } }) })
      setSoilReportAnalysis(response.analysis)
    } catch (e) { setSoilReportError(e.message || 'Could not read this report. Please try a clearer image or PDF.') }
    finally { setSoilReportLoading(false) }
  }

  function applySoilValues() {
    if (!soilReportAnalysis) return
    const parameters = (soilReportAnalysis.parameters || []).map(p => ({ name: String(p.name || ''), value: String(p.value ?? ''), unit: String(p.unit || ''), status: p.status === 'reported' && String(p.value ?? '').trim() ? 'reported' : 'not_reported', note: String(p.note || '') }))
    const applied = { ...soilReportAnalysis, parameters }
    update('hasExtraData', true)
    update('soilTest', { ...(form.soilTest || {}), available: 'Yes', values: parameters, reportSummary: applied.reportSummary, fileName: soilReportFile?.name || '' })
    update('soil', { ...(form.soil || {}), confidence: 'Extracted from uploaded soil test report', source: soilReportFile?.name || 'Uploaded soil report' })
    localStorage.setItem('ruraladapt_soil_analysis', JSON.stringify(applied))
    setSoilValuesConfirmed(true)
  }

  return <main className="page create-page">
    <div className="page-head"><div><span className="eyebrow">CREATE A SOLUTION</span><h1>Tell us what is happening.</h1><p>Share what you know. Skip anything you don't. RuralAdapt adapts the recommendation to your real constraints.</p></div><div className="page-head-badge"><Sprout size={18} /><span>Context-aware AI</span></div></div>
    <div className="progress-line"><span className="done">01 Problem</span><span>02 Context</span><span>03 Optional data</span><span>04 Adaptation</span></div>

    <section className="form-card"><div className="form-card-head"><div className="step-pill">01</div><div><h2>The problem</h2><p>What challenge should RuralAdapt help you solve?</p></div></div>
      <div className="problem-grid">{categories.map(({ id, label, icon: Icon }) => <button key={id} className={`problem-choice ${form.problemType === id ? 'selected' : ''}`} onClick={() => update('problemType', id)}><span><Icon size={20} /></span><b>{label}</b></button>)}</div>
      <label className="big-field"><span>Describe the problem</span><textarea value={form.problem} onChange={e => update('problem', e.target.value)} placeholder="Example: My vegetable crop does not get enough water during dry weeks..." rows="4" /></label>
      <div className="photo-review-box"><div className="photo-review-title"><Camera size={19}/><div><b>Have a crop or farm photo?</b><small>Optional · JPG, PNG or WEBP · AI observations must be confirmed by you</small></div></div><input aria-label="Upload crop or farm photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { setCropPhoto(e.target.files?.[0] || null); setPhotoAnalysis(null) }}/><button className="secondary-btn" disabled={!cropPhoto || photoLoading} onClick={async () => { try { setPhotoLoading(true); const reader = new FileReader(); const data = await new Promise((resolve,reject) => { reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(cropPhoto) }); const mimeType = cropPhoto.type; const response = await api('/crop/analyze',{method:'POST',body:JSON.stringify({data,mimeType,context:{crop:form.cropActivity,problem:form.problem}})}); setPhotoAnalysis(response.analysis) } catch(e) { setPhotoAnalysis({error:e.message}) } finally { setPhotoLoading(false) } }}>{photoLoading ? 'Checking image…' : 'Check photo clarity and observations'}</button>
      {photoAnalysis && <div className={`photo-analysis-result ${photoAnalysis.imageClear ? 'clear' : 'unclear'}`}>{photoAnalysis.error ? <p>{photoAnalysis.error}</p> : <>{photoAnalysis.imageClear ? <><b><CheckCircle2 size={16}/> Please confirm these visible observations</b><ul>{(photoAnalysis.observations||[]).map((x,i)=><li key={i}>{x}</li>)}</ul>{(photoAnalysis.possibleCauses||[]).length>0 && <p><b>Possible causes (not a diagnosis):</b> {photoAnalysis.possibleCauses.join('; ')}</p>}<label className="confirm-observations"><input type="checkbox" onChange={e => { if(e.target.checked) update('problem', `${form.problem}${form.problem ? '\n\n' : ''}Photo observations confirmed by farmer: ${(photoAnalysis.observations||[]).join('; ')}. Possible causes are unconfirmed.`) }}/> I confirm these observations are visible in my photo</label></> : <><b><AlertTriangle size={16}/> The image is not clear enough</b><p>{photoAnalysis.retakeAdvice || 'Please retake the photo in good light, hold the camera steady and keep the crop or report text visible.'}</p></>}</>}</div>}</div>
      <div className="voice-tools"><button className="secondary-btn" onClick={() => { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if(!SR) { alert('Voice typing is not supported in this browser. Please type your question.'); return } const recognition = new SR(); recognition.lang = ({English:'en-IN',Hindi:'hi-IN',Marathi:'mr-IN',Konkani:'kok-IN'})[form.responseLanguage] || 'en-IN'; recognition.onresult = e => update('problem', `${form.problem}${form.problem ? ' ' : ''}${e.results[0][0].transcript}`); recognition.onerror = () => alert('Voice input did not work. Please try again or type your question.'); recognition.start() }}><Mic size={17}/> Speak your problem ({form.responseLanguage || 'English'})</button><span>Voice recognition depends on your browser and language support. Typing is always available.</span></div>
    </section>

    <section className="form-card"><div className="form-card-head"><div className="step-pill">02</div><div><h2>Your context</h2><p>These details help the AI avoid generic recommendations.</p></div></div>
      <div className="form-grid two"><Field label="Language for AI answer"><select value={form.responseLanguage || 'English'} onChange={e => update('responseLanguage', e.target.value)}><option>English</option><option>Hindi</option><option>Marathi</option><option>Konkani</option></select></Field><Field label="Crop or activity"><input value={form.cropActivity} onChange={e => update('cropActivity', e.target.value)} placeholder="e.g. cashew, paddy, fishing" /></Field><Field label="Farm / activity size"><input value={form.farmSize} onChange={e => update('farmSize', e.target.value)} placeholder="e.g. 2 acres" /></Field><Field label="Location"><input value={form.location} onChange={e => update('location', e.target.value)} placeholder="Village, taluka, district, state" /></Field><Field label="Available budget"><input value={form.budget} onChange={e => update('budget', e.target.value)} placeholder="e.g. ₹5,000" /></Field><Field label="Water availability"><select value={form.waterAvailability} onChange={e => update('waterAvailability', e.target.value)}><option value="">Select if known</option><option>Regular</option><option>Seasonal</option><option>Irregular</option><option>Very limited</option></select></Field><Field label="Electricity"><select value={form.electricityAvailability} onChange={e => update('electricityAvailability', e.target.value)}><option value="">Select if known</option><option>Reliable</option><option>Intermittent</option><option>Not available</option></select></Field></div>
      <div className="environment-note"><div><span className="eyebrow">OPTIONAL ENVIRONMENT DATA</span><h3>Do you know anything about the local atmosphere?</h3><p>Adding temperature, rainfall, humidity or season information can make the recommendation more precise. Leave it blank if you do not know it.</p></div></div>
      <div className="form-grid two environment-grid"><Field label="Temperature"><input value={form.environment?.temperature || ''} onChange={e => updateNested('environment','temperature',e.target.value)} placeholder="e.g. 28°C" /></Field><Field label="Rainfall"><input value={form.environment?.rainfall || ''} onChange={e => updateNested('environment','rainfall',e.target.value)} placeholder="e.g. 1200 mm/year" /></Field><Field label="Humidity"><input value={form.environment?.humidity || ''} onChange={e => updateNested('environment','humidity',e.target.value)} placeholder="e.g. 75%" /></Field><Field label="Season / climate note"><input value={form.environment?.season || ''} onChange={e => updateNested('environment','season',e.target.value)} placeholder="e.g. monsoon, dry season" /></Field></div>
    </section>

    <section className="form-card soil-auto-fill-card">
      <div className="form-card-head"><div className="step-pill"><FileText size={17}/></div><div><h2>Upload a soil test report (optional)</h2><p>Upload a report photo or PDF to automatically fill the soil values below. Check every extracted value before using it.</p></div></div>
      <div className="soil-report-upload-row"><label className="upload-drop compact-upload"><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e => { setSoilReportFile(e.target.files?.[0] || null); setSoilReportError(''); setSoilReportAnalysis(null); setSoilValuesConfirmed(false) }}/><FileText size={25}/><strong>{soilReportFile ? soilReportFile.name : 'Choose soil report photo or PDF'}</strong><span>{soilReportFile ? `${Math.round(soilReportFile.size / 1024)} KB` : 'JPG, PNG, WEBP or PDF · max 10 MB'}</span></label><button className="primary-btn" disabled={!soilReportFile || soilReportLoading} onClick={analyzeSoilReport}>{soilReportLoading ? <><span className="spinner"/> Reading report…</> : <><Sparkles size={17}/> Extract soil values</>}</button></div>
      {soilReportError && <div className="message error"><AlertTriangle size={16}/>{soilReportError}</div>}
      {soilReportAnalysis && <div className="soil-extraction-review"><div className="review-heading"><CheckCircle2 size={19}/><div><b>Review extracted values</b><p>Only readable values are filled. Missing or unclear values remain marked.</p></div></div><div className="soil-parameter-grid">{(soilReportAnalysis.parameters || []).map((p,i)=><div className="parameter-card editable-parameter-card" key={`${p.name}-${i}`}><small>{p.name || 'Parameter'}</small><input aria-label={`${p.name} value`} value={p.value ?? ''} placeholder={p.status === 'not_reported' ? 'Not found — leave blank if unknown' : 'Check value'} onChange={e => { setSoilReportAnalysis(prev => ({ ...prev, parameters: (prev.parameters || []).map((item,j) => j === i ? { ...item, value: e.target.value, status: e.target.value.trim() ? 'reported' : 'not_reported', note: e.target.value.trim() ? 'Value checked/edited by farmer' : 'No confirmed value' } : item) })); setSoilValuesConfirmed(false) }}/><input aria-label={`${p.name} unit`} value={p.unit || ''} placeholder="Unit (as printed)" onChange={e => { setSoilReportAnalysis(prev => ({ ...prev, parameters: (prev.parameters || []).map((item,j) => j === i ? { ...item, unit: e.target.value } : item) })); setSoilValuesConfirmed(false) }}/><span>{p.value ? (p.note || 'Extracted value — verify against report') : 'Missing or unreadable; do not guess'}</span></div>)}</div>{soilReportAnalysis.reportSummary && <p className="muted">{soilReportAnalysis.reportSummary}</p>}{!soilValuesConfirmed ? <button className="primary-btn" onClick={applySoilValues}><Check size={17}/> Confirm and auto-fill soil section</button> : <div className="message success"><CheckCircle2 size={16}/> Confirmed. Soil values have been added to this solution and will be sent to the AI.</div>}</div>}
    </section>

    <section className="optional-banner"><div className="optional-icon"><FlaskConical size={22} /></div><div><strong>Do you have soil or fertilizer information?</strong><p>If you have it, adding it can make the recommendation more specific. <b>It is completely optional.</b></p></div><label className="switch"><input type="checkbox" checked={form.hasExtraData} onChange={e => update('hasExtraData', e.target.checked)} /><span /></label></section>

    {form.hasExtraData && <section className="optional-grid">
      <div className="data-card"><div className="data-card-head"><span className="data-icon"><Leaf size={18} /></span><div><h3>Soil information</h3><p>Enter the soil type manually if you know it. Location will never auto-fill soil type.</p></div></div><Field label="Soil type"><select value={form.soil.name} onChange={e => updateNested('soil', 'name', e.target.value)}><option value="">I don't know</option><option>Laterite</option><option>Coastal alluvial / estuarine</option><option>Red sandy / gravelly</option><option>Mixed red & black / lowland</option><option>Clayey</option><option>Loamy</option><option>Sandy</option><option>Other / manually describe</option></select></Field><div className="soil-status"><Leaf size={15} /><span>{form.soil.name || 'No soil type provided'}</span></div>{form.soilTest?.values?.length > 0 && <div className="auto-filled-values"><b><CheckCircle2 size={15}/> Soil test values added from report</b><div className="soil-parameter-grid">{form.soilTest.values.map((p,i)=><div className="parameter-card" key={`${p.name}-${i}`}><small>{p.name}</small><strong>{p.value ? `${p.value} ${p.unit || ''}`.trim() : 'Not found'}</strong><span>{p.status === 'reported' ? 'Confirm against the original report' : 'Missing or unreadable in report'}</span></div>)}</div></div>}</div>
      <div className="data-card"><div className="data-card-head"><span className="data-icon"><FlaskConical size={18} /></span><div><h3>Fertilizer history</h3><p>Add only what you remember or have recorded.</p></div></div><div className="form-grid two"><Field label="Fertilizer / manure"><input value={form.fertilizer.name} onChange={e => updateNested('fertilizer','name',e.target.value)} placeholder="e.g. compost, urea, NPK" /></Field><Field label="Type"><select value={form.fertilizer.type} onChange={e => updateNested('fertilizer','type',e.target.value)}><option value="">Not sure</option><option>Organic</option><option>Chemical</option><option>Bio-fertilizer</option><option>Mixed</option></select></Field><Field label="Amount"><input value={form.fertilizer.amount} onChange={e => updateNested('fertilizer','amount',e.target.value)} placeholder="e.g. 10 kg" /></Field><Field label="Frequency"><input value={form.fertilizer.frequency} onChange={e => updateNested('fertilizer','frequency',e.target.value)} placeholder="e.g. monthly" /></Field><Field label="Last applied"><input type="date" value={form.fertilizer.lastApplied} onChange={e => updateNested('fertilizer','lastApplied',e.target.value)} /></Field></div></div>

    </section>}

    <div className="generate-bar"><div><span className="ready"><span /> Ready</span><p>Start with what you know. Missing information stays unknown.</p></div><button className="primary-btn large" onClick={generate} disabled={loading}>{loading ? <><span className="spinner" /> Thinking...</> : <><Sparkles size={19} /> Generate solution <ArrowRight size={18} /></>}</button></div>
    {message && <div className="message"><Info size={16} /> {message}</div>}
  </main>
}

function ResultView({ result, resultLanguage = 'English', activeStep, setActiveStep, saveSolution, saved, message, onCreate, caseId, similarCases, caseConsent, setCaseConsent, api }) {
  if (!result) return <main className="page empty-page"><div className="empty-card"><Sparkles size={34} /><h2>No solution yet</h2><p>Start a new problem and let RuralAdapt build the journey.</p><button className="primary-btn" onClick={onCreate}>Create a solution</button></div></main>
  const steps = result.steps || []
  return <main className="page result-page">
    <div className="result-head"><div><span className="eyebrow">ADAPTATION JOURNEY · {result.confidence || 'Medium'} CONFIDENCE</span><h1>{result.title}</h1><p>{result.summary}</p></div><div className="result-actions"><button className="save-large" onClick={() => { const text = `${result.title}\n\n${result.summary}\n\nRuralAdapt AI — Global Ideas. Local Solutions.`; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer') }}><MessageCircle size={18} /> Share on WhatsApp</button><button className={`save-large ${saved ? 'saved' : ''}`} onClick={saveSolution}><Bookmark size={18} /> {saved ? 'Saved' : 'Save solution'}</button></div></div>
    {(result.soilReasoning || result.fertilizerConsideration) && <div className="context-insight">{result.soilReasoning && <div><Leaf size={18} /><div><b>Soil context</b><p>{result.soilReasoning}</p></div></div>}{result.fertilizerConsideration && <div><FlaskConical size={18} /><div><b>Fertilizer context</b><p>{result.fertilizerConsideration}</p></div></div>}</div>}
    <div className="journey-header"><div><span className="eyebrow">THE RURALADAPT PATH</span><h2>Start simple. Move forward only when needed.</h2></div><span className="journey-count">{steps.length} stages</span></div>
    <div className="journey-list">{steps.map((step, i) => <div key={step.key || i} className={`journey-item ${i === activeStep ? 'active' : ''}`}>
      <button className="journey-card" onClick={() => setActiveStep(i)}><div className="journey-number">0{i + 1}</div><div className="journey-card-body"><div className="stage-label">{stageIcon(i)} {step.title}</div><h3>{step.solution}</h3><p>{step.how}</p><div className="journey-meta"><span><b>Cost:</b> {step.cost || 'Context dependent'}</span><span><b>Benefit:</b> {step.benefit || 'See details'}</span></div></div><span className="expand-icon">{i === activeStep ? <ChevronUp /> : <ChevronDown />}</span></button>
      {i === activeStep && <div className="journey-detail"><div><b>How to implement</b><p>{step.how}</p></div><div><b>When to move on</b><p>{step.whenToMoveOn || 'Move to the next level only if this approach is not enough for the problem.'}</p></div></div>}
      {i < steps.length - 1 && <div className="journey-connector"><span /><ArrowDown size={16} /><small>Next level only if needed</small></div>}
    </div>)}</div>

    <div className="result-grid"><InfoList icon={Sparkles} title="Global inspiration" items={result.globalInspiration} /><InfoList icon={ShieldCheck} title="Constraints considered" items={result.constraints} /><InfoList icon={Check} title="Pilot plan" items={result.pilot} /><InfoList icon={Info} title="Risks & uncertainties" items={result.risks} /></div>
    {result.dataUsed?.length > 0 && <section className="sources-card"><div><span className="eyebrow">DATA USED</span><h3>What influenced this recommendation</h3></div><div className="source-chips">{result.dataUsed.map((k, i) => <span key={i}><Check size={13} /> {k}</span>)}</div></section>}
    {result.missingData?.length > 0 && <section className="data-note-card"><div><span className="eyebrow">DATA GAPS</span><h3>Information that could improve accuracy</h3></div>{result.missingData.map((k, i) => <p key={i}><Info size={14} /> {k}</p>)}</section>}
    <section className="similar-cases-panel"><div><span className="eyebrow">LEARN FROM PREVIOUS CASES</span><h2>Similar farmer experiences</h2><p>Only cases whose farmers opted in to anonymized learning can appear here. A reported outcome is not proof that a solution will work in every situation.</p></div>{similarCases?.length ? <div className="similar-case-list">{similarCases.map((c,i)=><article key={i}><div className="case-meta"><b>{c.crop_activity || c.problem_type || 'Farm case'}</b><span>{c.verification || 'Farmer-reported'}</span></div><p>{c.problem}</p><small>Previous approach: {c.solution_summary}</small><small>Reported outcome: {({helped:'Helped',no_change:'No change',worsened:'Worsened',unknown:'Not yet known'})[c.outcome] || c.outcome}</small></article>)}</div> : <div className="empty-similar"><Search size={20}/><span>No opted-in similar cases found yet. As farmers consent and report outcomes, relevant examples may appear here.</span></div>}</section>
    <section className="privacy-consent-panel"><div><span className="eyebrow">YOUR CASE IS PRIVATE BY DEFAULT</span><h3>Help other farmers learn?</h3><p>Your case is saved privately to support this session. If you opt in, RuralAdapt will share a minimized anonymized version (problem context, solution summary and outcome) for similar-case learning. Your name, account details, guest key and precise location are not included. You can still use RuralAdapt if you decline.</p></div><label className="consent-check"><input type="checkbox" checked={caseConsent} onChange={e => setCaseConsent(e.target.checked)}/> I agree to share an anonymized version of this case for learning</label><button className="primary-btn" disabled={!caseConsent || !caseId} onClick={async () => { try { await api(`/cases/${caseId}/consent`,{method:'POST',body:JSON.stringify({guestKey:getGuestKey(),consent:true})}); alert('Consent recorded. Thank you for helping improve shared learning.'); } catch(e) { alert(e.message) } }}>Give separate consent</button><small>Consent is optional. This prototype stores cases in local JSON; configure secure hosted storage before real public deployment.</small></section>
    <section className="outcome-panel"><b>Later, tell us how this worked</b><span>Outcome feedback helps compare similar cases, but should not be treated as scientific proof.</span><div>{[['helped','It helped'],['no_change','No change'],['worsened','It got worse'],['unknown','Not sure yet']].map(([value,label])=><button key={value} className="secondary-btn" onClick={async()=>{if(!caseId)return;try{await api(`/cases/${caseId}/outcome`,{method:'POST',body:JSON.stringify({guestKey:getGuestKey(),outcome:value})});alert('Outcome recorded.')}catch(e){alert(e.message)}}}>{label}</button>)}</div></section>
    <div className="speak-answer"><button className="secondary-btn" onClick={() => { if(!('speechSynthesis' in window)) { alert('Spoken answers are not supported in this browser.'); return } const utterance = new SpeechSynthesisUtterance(`${result.title}. ${result.summary}. Traditional option: ${steps[0]?.solution || ''}.`); utterance.lang=({English:'en-IN',Hindi:'hi-IN',Marathi:'mr-IN',Konkani:'kok-IN'})[resultLanguage] || 'en-IN'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance) }}><Volume2 size={17}/> Read answer aloud ({resultLanguage})</button><span>Voice support varies by device and browser. This reads the summary and first step.</span></div>
    {message && <div className="message"><Info size={16} /> {message}</div>}
  </main>
}

function stageIcon(i) { return [<Leaf size={14} />, <Zap size={14} />, <Wheat size={14} />, <Wifi size={14} />][i] || <Sparkles size={14} /> }

function SavedView({ saved, onOpen, onDelete, onLogin, onCreate, user }) {
  return <main className="page"><div className="page-head"><div><span className="eyebrow">YOUR LIBRARY</span><h1>Saved solutions</h1><p>Keep useful adaptation journeys close and revisit them when conditions change.</p></div><button className="primary-btn" onClick={() => { if (!user) onLogin(); else onCreate() }}><Plus size={17} /> New solution</button></div>{!user ? <Empty title="Log in to save solutions" text="Your saved recommendations will appear here once you create an account." onClick={onLogin} action="Log in" /> : saved.length === 0 ? <Empty title="Your library is empty" text="Generate a solution and save it here for later." action="Create solution" onClick={onCreate} /> : <div className="saved-grid">{saved.map(s => <article className="saved-card" key={s.id}><div className="saved-card-top"><span className="saved-date">{new Date(s.created_at).toLocaleDateString()}</span><button onClick={() => onDelete(s.id)} title="Delete"><X size={16} /></button></div><div className="saved-card-icon"><Bookmark size={20} /></div><h3>{s.title}</h3><p>{s.result_data?.summary || 'Saved RuralAdapt solution.'}</p><button className="text-btn" onClick={() => onOpen(s)}>Open solution <ArrowRight size={15} /></button></article>)}</div>}</main>
}

function HistoryView({ saved, onOpen }) {
  return <main className="page"><div className="page-head"><div><span className="eyebrow">RECENT WORK</span><h1>History</h1><p>Every saved solution is kept with its original context so you can revisit the reasoning.</p></div></div>{saved.length === 0 ? <Empty title="No history yet" text="Your saved solution history will appear here." /> : <div className="timeline">{saved.map(s => <button className="timeline-item" key={s.id} onClick={() => onOpen(s)}><span className="timeline-dot" /><div><small>{new Date(s.created_at).toLocaleString()}</small><h3>{s.title}</h3><p>{s.result_data?.summary}</p></div><ArrowRight size={17} /></button>)}</div>}</main>
}

function SoilAnalysisView({ user, profile, onLogin, onCreate }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')

  async function analyze() {
    if (!file) return setError('Choose a soil test report first.')
    setLoading(true); setError(''); setAnalysis(null)
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const token = localStorage.getItem(tokenKey)
      const response = await fetch(`${API}/soil/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, data, context: { location: profile?.location || '', cropActivity: profile?.crop_activity || '', farmSize: profile?.farm_size || '' } }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to analyze the report.')
      setAnalysis(result.analysis)
    } catch (e) { setError(e.message || 'Unable to analyze the soil report.') }
    finally { setLoading(false) }
  }

  return <main className="page soil-analysis-page">
    <div className="page-head"><div><span className="eyebrow"><FileText size={14} /> SOIL ANALYSIS</span><h1>Understand your soil before choosing a crop.</h1><p>Upload a soil test report. RuralAdapt AI will read the measured values, explain what they indicate, suggest potentially suitable crops, and tell you what additional testing may be useful.</p></div><div className="page-head-badge"><Sparkles size={17} /> AI report analysis</div></div>
    <section className="soil-upload-card form-card">
      <div className="form-card-head"><div className="step-pill">01</div><div><h2>Upload your soil test report</h2><p>PDF, JPG, PNG or WEBP. Upload only a report you have permission to use.</p></div></div>
      <label className="upload-drop"><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e => { setFile(e.target.files?.[0] || null); setError(''); setAnalysis(null) }} /><FileText size={30} /><strong>{file ? file.name : 'Choose a soil report'}</strong><span>{file ? `${Math.round(file.size / 1024)} KB · Ready to analyze` : 'Click to browse or drag a report here'}</span></label>
      {!user && <div className="hint-card"><Info size={16} /><span>You can analyze a report without logging in. <button className="text-btn inline" onClick={onLogin}>Log in</button> if you also want your analysis history saved.</span></div>}
      <div className="generate-bar"><div><span className="ready"><span /> Ready</span><p>The AI will only use values it can read from the report.</p></div><button className="primary-btn large" onClick={analyze} disabled={!file || loading}>{loading ? <><span className="spinner" /> Analyzing report...</> : <><Sparkles size={19} /> Analyze soil report</>}</button></div>
      {error && <div className="message error"><Info size={16} /> {error}</div>}
    </section>
    {analysis && <><div className="analysis-use-bar"><div><b>Want RuralAdapt to use these soil results?</b><span>The measured parameters can be carried into the solution workflow.</span></div><button className="primary-btn" onClick={() => { localStorage.setItem('ruraladapt_soil_analysis', JSON.stringify(analysis)); onCreate() }}><ArrowRight size={17} /> Use in a solution</button></div><section className="soil-analysis-results">
      <div className="analysis-summary"><span className="eyebrow">REPORT SUMMARY</span><h2>{analysis.reportSummary || 'Soil report analyzed'}</h2></div>
      <div className="analysis-grid"><InfoList icon={Leaf} title="Soil characteristics" items={analysis.soilCharacteristics} /><InfoList icon={Check} title="Strengths" items={analysis.strengths} /><InfoList icon={ShieldCheck} title="Concerns" items={analysis.concerns} /><InfoList icon={Info} title="Limitations" items={analysis.limitations} /></div>
      <section className="form-card"><div className="form-card-head"><div className="step-pill">02</div><div><h2>Reported soil parameters</h2><p>Only values that the AI could read from the uploaded report are shown.</p></div></div><div className="soil-parameter-grid">{(analysis.parameters || []).map((p, i) => <div className="parameter-card" key={i}><small>{p.name}</small><strong>{p.value || 'Not reported'} {p.unit || ''}</strong><span>{p.status === 'reported' ? p.note || 'Reported in the test' : 'Not reported in this document'}</span></div>)}</div></section>
      <section className="form-card"><div className="form-card-head"><div className="step-pill">03</div><div><h2>Potentially suitable crops</h2><p>These are suggestions based on the available soil evidence, not guarantees.</p></div></div><div className="crop-recommendation-grid">{(analysis.potentialCrops || []).map((c, i) => <article className="crop-recommendation" key={i}><div><Leaf size={18} /><span>{c.confidence || 'Context dependent'}</span></div><h3>{c.crop}</h3><p>{c.why}</p>{c.conditions && <small>Conditions to check: {c.conditions}</small>}</article>)}</div></section>
      <section className="form-card"><div className="form-card-head"><div className="step-pill">04</div><div><h2>Should you do another soil test?</h2><p>RuralAdapt identifies missing measurements that could improve confidence.</p></div></div><div className="test-list">{(analysis.recommendedTests || []).length ? analysis.recommendedTests.map((t, i) => <div className="test-item" key={i}><span>{t.priority || 'Recommended'}</span><div><h3>{t.test}</h3><p>{t.reason}</p></div></div>) : <p className="muted">No additional test was specifically suggested from the available report.</p>}</div></section>
    </section></>}
  </main>
}

function ProfileView({ user, profile, onLogin, onSave }) {
  const [p, setP] = useState({ location: profile?.location || '', farmSize: profile?.farm_size || '', cropActivity: profile?.crop_activity || '', waterAvailability: profile?.water_availability || '', electricityAvailability: profile?.electricity_availability || '', budget: profile?.budget || '' })
  useEffect(() => setP({ location: profile?.location || '', farmSize: profile?.farm_size || '', cropActivity: profile?.crop_activity || '', waterAvailability: profile?.water_availability || '', electricityAvailability: profile?.electricity_availability || '', budget: profile?.budget || '' }), [profile])
  if (!user) return <main className="page"><Empty title="Your farm profile" text="Log in to save your farm context and reuse it across future solutions." action="Log in" onClick={onLogin} /></main>
  return <main className="page"><div className="page-head"><div><span className="eyebrow">YOUR FARM</span><h1>{user.name}'s profile</h1><p>Save context once, then reuse it whenever you create a solution.</p></div><div className="profile-avatar">{user.name.slice(0,1).toUpperCase()}</div></div><section className="form-card profile-card"><div className="form-card-head"><div className="step-pill">01</div><div><h2>Farm context</h2><p>These fields are optional and can be updated anytime.</p></div></div><div className="form-grid two"><Field label="Location"><input value={p.location} onChange={e => setP({ ...p, location: e.target.value })} /></Field><Field label="Farm / activity size"><input value={p.farmSize} onChange={e => setP({ ...p, farmSize: e.target.value })} /></Field><Field label="Crop / activity"><input value={p.cropActivity} onChange={e => setP({ ...p, cropActivity: e.target.value })} /></Field><Field label="Budget"><input value={p.budget} onChange={e => setP({ ...p, budget: e.target.value })} /></Field><Field label="Water availability"><input value={p.waterAvailability} onChange={e => setP({ ...p, waterAvailability: e.target.value })} /></Field><Field label="Electricity"><input value={p.electricityAvailability} onChange={e => setP({ ...p, electricityAvailability: e.target.value })} /></Field></div><div className="profile-save"><button className="primary-btn" onClick={() => onSave(p)}><Check size={17} /> Save profile</button></div></section></main>
}

function SettingsView() { return <main className="page"><div className="page-head"><div><span className="eyebrow">SETTINGS</span><h1>Application settings</h1><p>RuralAdapt keeps the interface simple and the AI context transparent.</p></div></div><div className="settings-grid"><div className="setting-card"><ShieldCheck size={20} /><div><h3>API key security</h3><p>Your Gemini key is used on the backend only. It is never placed in the React client.</p></div></div><div className="setting-card"><Database size={20} /><div><h3>Storage and privacy</h3><p>This prototype uses local JSON storage. Farmer cases are private by default; only cases with explicit opt-in are used for similar-case learning. Before public deployment, configure Supabase, row-level access rules and private file storage.</p></div></div><div className="setting-card"><Sparkles size={20} /><div><h3>AI transparency</h3><p>Optional soil and fertilizer fields are only used when you provide them. Missing data is not invented.</p></div></div></div></main> }

function InfoList({ icon: Icon, title, items = [] }) { return <article className="info-list"><div className="info-list-head"><span><Icon size={16} /></span><h3>{title}</h3></div>{items?.length ? items.map((x, i) => <p key={i}><Check size={14} /> {x}</p>) : <p><Info size={14} /> No additional information supplied.</p>}</article> }
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label> }
function Empty({ title, text, action, onClick }) { return <div className="empty-card"><Bookmark size={34} /><h2>{title}</h2><p>{text}</p>{action && <button className="primary-btn" onClick={onClick}>{action}</button>}</div> }

function AuthModal({ mode, setMode, auth, setAuth, error, onSubmit, onClose }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="auth-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={onClose}><X /></button><span className="eyebrow">RURALADAPT ACCOUNT</span><h2>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2><p>Save useful adaptation journeys and keep your farm context ready.</p>{mode === 'register' && <Field label="Name"><input value={auth.name} onChange={e => setAuth({ ...auth, name: e.target.value })} placeholder="Your name" /></Field>}<Field label="Email"><input type="email" value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })} placeholder="you@example.com" /></Field><Field label="Password"><input type="password" value={auth.password} onChange={e => setAuth({ ...auth, password: e.target.value })} placeholder="At least 6 characters" /></Field>{error && <div className="error-text">{error}</div>}<button className="primary-btn large full" onClick={onSubmit}>{mode === 'login' ? <><LogIn size={18} /> Log in</> : <><UserPlus size={18} /> Create account</>}</button><button className="switch-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}</button></div></div>
}

export default App
