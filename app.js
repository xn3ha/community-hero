// ── Image Compressor ──────────────────────────────────
function compressImage(file, maxWidth = 600, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width  = img.width  * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Utility ───────────────────────────────────────────
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show ' + type;
  setTimeout(() => { t.className = ''; }, 3200);
}

function getCategoryBadge(cat) {
  const map = {
    pothole:    { cls: 'badge-pothole', icon: '🕳️' },
    water:      { cls: 'badge-water',   icon: '💧' },
    streetlight:{ cls: 'badge-light',   icon: '💡' },
    waste:      { cls: 'badge-waste',   icon: '🗑️' },
    other:      { cls: 'badge-other',   icon: '📌' },
  };
  const c = map[cat] || map.other;
  return `<span class="badge ${c.cls}">${c.icon} ${cat}</span>`;
}

function getStatusBadge(status) {
  const map = {
    open:         { cls: 'badge-open',     label: '🔴 Open' },
    'in-progress':{ cls: 'badge-progress', label: '🟡 In Progress' },
    resolved:     { cls: 'badge-resolved', label: '🟢 Resolved' },
  };
  const s = map[status] || map.open;
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

// ── Gemini AI ─────────────────────────────────────────
async function analyzeImageWithGemini(base64Image, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`;

  const prompt = `You are an AI assistant for a community issue reporting platform.
  Analyze this image and return ONLY a JSON object (no markdown, no extra text) with:
  {
    "category": one of ["pothole", "water", "streetlight", "waste", "other"],
    "title": "short 5-8 word title describing the issue",
    "description": "2-3 sentence description of the problem and its impact",
    "severity": one of ["low", "medium", "high"],
    "confidence": number 0-100
  }`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64Image } }
        ]
      }]
    })
  });

  const data = await res.json();
  console.log('Gemini raw response:', JSON.stringify(data));

  if (data.error) throw new Error(data.error.message);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch(e) {
    console.log('Raw text was:', text);
    return {
      category: 'other',
      title: 'Community Issue',
      description: text.substring(0, 150),
      severity: 'medium',
      confidence: 50
    };
  }
}

// ── Report Page ───────────────────────────────────────
function initReportPage() {
  const uploadZone = document.getElementById('upload-zone');
  const fileInput  = document.getElementById('file-input');
  const previewImg = document.getElementById('preview-img');
  const aiBox      = document.getElementById('ai-box');
  const analyzeBtn = document.getElementById('analyze-btn');
  const submitBtn  = document.getElementById('submit-btn');
  const form       = document.getElementById('report-form');

  if (!form) return;

  let uploadedFile = null;
  let base64Data   = null;
  let mimeType     = null;
  let aiResult     = null;
  let userLat      = null;
  let userLng      = null;

  // Get location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      document.getElementById('location-text').textContent =
        `📍 Location detected (${userLat.toFixed(4)}, ${userLng.toFixed(4)})`;
    }, () => {
      document.getElementById('location-text').textContent = '📍 Location not available — will use default';
    });
  }

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) { toast('Please upload an image file', 'error'); return; }
    uploadedFile = file;
    mimeType = file.type;
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target.result;
      base64Data = result.split(',')[1];
      previewImg.src = result;
      previewImg.style.display = 'block';
      analyzeBtn.style.display = 'inline-flex';
      uploadZone.querySelector('p').textContent = file.name;
    };
    reader.readAsDataURL(file);
  }

  // Analyze with AI
  analyzeBtn.addEventListener('click', async () => {
    if (!base64Data) return;
    analyzeBtn.innerHTML = '<span class="loader"></span> Analyzing...';
    analyzeBtn.disabled = true;
    try {
      aiResult = await analyzeImageWithGemini(base64Data, mimeType);
      document.getElementById('ai-category').textContent    = aiResult.category || 'other';
      document.getElementById('ai-title').value             = aiResult.title || '';
      document.getElementById('ai-description').value       = aiResult.description || '';
      document.getElementById('ai-severity').textContent    = aiResult.severity || 'medium';
      document.getElementById('ai-confidence').textContent  = (aiResult.confidence || 0) + '%';
      aiBox.style.display = 'block';
      toast('✅ AI analysis complete!', 'success');
    } catch (err) {
      console.error('AI error:', err);
      toast('AI analysis failed: ' + err.message, 'error');
    }
    analyzeBtn.innerHTML = '🤖 Re-analyze';
    analyzeBtn.disabled = false;
  });

  // Submit
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const title        = document.getElementById('ai-title').value.trim();
    const description  = document.getElementById('ai-description').value.trim();
    const category     = aiResult?.category || document.getElementById('manual-category').value;
    const reporterName = document.getElementById('reporter-name').value.trim() || 'Anonymous';

    if (!title || !description) { toast('Please fill in title and description', 'error'); return; }
    if (!uploadedFile)          { toast('Please upload a photo of the issue', 'error'); return; }

    submitBtn.innerHTML = '<span class="loader"></span> Submitting...';
    submitBtn.disabled = true;

    try {
      const imageUrl = await compressImage(uploadedFile, 600, 0.7);
      await db.collection('issues').add({
        title, description,
        category: category || 'other',
        severity: aiResult?.severity || 'medium',
        status: 'open',
        imageUrl,
        reporterName,
        lat: userLat || 18.5204,
        lng: userLng || 73.8567,
        upvotes: 0,
        upvotedBy: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        aiConfidence: aiResult?.confidence || null,
      });
      toast('🎉 Issue reported successfully!', 'success');
      setTimeout(() => { window.location.href = 'issues.html'; }, 1500);
    } catch (err) {
      console.error(err);
      toast('Submission failed. Check your Firebase config.', 'error');
      submitBtn.innerHTML = '📤 Submit Report';
      submitBtn.disabled = false;
    }
  });
}

// ── Issues Page ───────────────────────────────────────
function initIssuesPage() {
  const grid         = document.getElementById('issues-grid');
  const searchInput  = document.getElementById('search-input');
  const filterStatus = document.getElementById('filter-status');

  if (!grid) return;

  let allIssues = [];
  let activeCategory = 'all';

  function renderIssues(issues) {
    if (issues.length === 0) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="icon">🌿</div><p>No issues found. Be the first to report one!</p></div>`;
      return;
    }
    grid.innerHTML = issues.map(issue => `
      <div class="issue-card" onclick="openIssueModal('${issue.id}')">
        <img src="${issue.imageUrl}" alt="${issue.title}" loading="lazy"
          onerror="this.src='https://placehold.co/400x180/e5e7eb/9ca3af?text=No+Image'">
        <div class="issue-card-body">
          <div class="issue-card-header">
            <div class="issue-title">${issue.title}</div>
            ${getStatusBadge(issue.status)}
          </div>
          <div class="issue-meta">
            ${getCategoryBadge(issue.category)}
            <span>⏱ ${timeAgo(issue.createdAt)}</span>
            <span>👤 ${issue.reporterName || 'Anonymous'}</span>
          </div>
          <div class="issue-desc">${issue.description}</div>
          <div class="issue-footer">
            <button class="upvote-btn ${issue._upvoted ? 'voted' : ''}"
              onclick="event.stopPropagation(); upvoteIssue('${issue.id}', this)">
              👍 <span>${issue.upvotes || 0}</span>
            </button>
            <span class="text-xs text-gray">Severity: <strong>${issue.severity || 'medium'}</strong></span>
          </div>
        </div>
      </div>
    `).join('');
  }

  function applyFilters() {
    const q      = searchInput.value.toLowerCase();
    const status = filterStatus.value;
    let filtered = allIssues;
    if (activeCategory !== 'all') filtered = filtered.filter(i => i.category === activeCategory);
    if (status) filtered = filtered.filter(i => i.status === status);
    if (q)      filtered = filtered.filter(i => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    renderIssues(filtered);
  }

  db.collection('issues').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allIssues = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    applyFilters();
    updateHeroStats(allIssues);
  });

  searchInput?.addEventListener('input', applyFilters);
  filterStatus?.addEventListener('change', applyFilters);

  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.dataset.cat;
      applyFilters();
    });
  });
}

// ── Upvote ────────────────────────────────────────────
async function upvoteIssue(id, btn) {
  const key = 'upvoted_' + id;
  if (localStorage.getItem(key)) { toast('You already upvoted this issue', ''); return; }
  try {
    await db.collection('issues').doc(id).update({
      upvotes: firebase.firestore.FieldValue.increment(1)
    });
    localStorage.setItem(key, '1');
    btn.classList.add('voted');
    const span = btn.querySelector('span');
    span.textContent = parseInt(span.textContent) + 1;
    toast('👍 Upvoted!', 'success');
  } catch (e) {
    toast('Failed to upvote', 'error');
  }
}

// ── Issue Detail Modal ────────────────────────────────
async function openIssueModal(id) {
  const overlay = document.getElementById('issue-modal');
  const body    = document.getElementById('modal-body');
  if (!overlay) return;

  overlay.classList.add('open');
  body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--gray-400)">Loading...</div>';

  try {
    const doc  = await db.collection('issues').doc(id).get();
    const data = doc.data();
    body.innerHTML = `
      <img src="${data.imageUrl}" alt="${data.title}"
        style="width:100%;height:220px;object-fit:cover;border-radius:var(--radius);margin-bottom:1rem"
        onerror="this.src='https://placehold.co/540x220/e5e7eb/9ca3af?text=No+Image'">
      <div class="flex gap-2 mb-4" style="flex-wrap:wrap">
        ${getStatusBadge(data.status)}
        ${getCategoryBadge(data.category)}
      </div>
      <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:.5rem">${data.title}</h2>
      <p style="color:var(--gray-600);font-size:.9rem;margin-bottom:1rem">${data.description}</p>
      <div class="grid-2" style="font-size:.85rem;color:var(--gray-600);gap:.5rem;margin-bottom:1rem">
        <div>👤 <strong>${data.reporterName || 'Anonymous'}</strong></div>
        <div>⏱ <strong>${timeAgo(data.createdAt)}</strong></div>
        <div>🔥 Severity: <strong>${data.severity}</strong></div>
        <div>👍 Upvotes: <strong>${data.upvotes || 0}</strong></div>
        ${data.aiConfidence ? `<div>🤖 AI Confidence: <strong>${data.aiConfidence}%</strong></div>` : ''}
        <div>📍 <strong>${data.lat?.toFixed(4)}, ${data.lng?.toFixed(4)}</strong></div>
      </div>
      <div class="form-group">
        <label>Update Status</label>
        <select id="status-select" style="max-width:200px">
          <option value="open" ${data.status==='open'?'selected':''}>🔴 Open</option>
          <option value="in-progress" ${data.status==='in-progress'?'selected':''}>🟡 In Progress</option>
          <option value="resolved" ${data.status==='resolved'?'selected':''}>🟢 Resolved</option>
        </select>
      </div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="updateStatus('${id}')">💾 Save Status</button>
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>
    `;
  } catch (e) {
    body.innerHTML = '<p style="color:var(--red)">Failed to load issue details.</p>';
  }
}

async function updateStatus(id) {
  const sel = document.getElementById('status-select');
  try {
    await db.collection('issues').doc(id).update({ status: sel.value });
    toast('✅ Status updated!', 'success');
    closeModal();
  } catch (e) {
    toast('Failed to update status', 'error');
  }
}

function closeModal() {
  document.getElementById('issue-modal')?.classList.remove('open');
}

// ── Dashboard ─────────────────────────────────────────
function initDashboard() {
  if (!document.getElementById('dash-total')) return;

  db.collection('issues').onSnapshot(snap => {
    const issues   = snap.docs.map(d => d.data());
    const total    = issues.length;
    const open     = issues.filter(i => i.status === 'open').length;
    const progress = issues.filter(i => i.status === 'in-progress').length;
    const resolved = issues.filter(i => i.status === 'resolved').length;

    document.getElementById('dash-total').textContent    = total;
    document.getElementById('dash-open').textContent     = open;
    document.getElementById('dash-progress').textContent = progress;
    document.getElementById('dash-resolved').textContent = resolved;

    const pct = total ? Math.round((resolved / total) * 100) : 0;
    document.getElementById('resolve-pct').textContent = pct + '%';
    document.getElementById('resolve-bar').style.width = pct + '%';

    const cats = { pothole:0, water:0, streetlight:0, waste:0, other:0 };
    issues.forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1; });
    const catEl = document.getElementById('cat-breakdown');
    if (catEl) {
      catEl.innerHTML = Object.entries(cats).map(([cat, count]) => `
        <div class="flex items-center justify-between" style="margin-bottom:.6rem">
          <span>${getCategoryBadge(cat)}</span>
          <div style="flex:1;margin:0 .75rem">
            <div class="progress-wrap"><div class="progress-bar" style="width:${total ? (count/total*100) : 0}%"></div></div>
          </div>
          <span class="text-sm font-bold">${count}</span>
        </div>
      `).join('');
    }

    const recentEl = document.getElementById('recent-issues');
    if (recentEl) {
      const recent = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 5);
      recentEl.innerHTML = recent.length ? recent.map(i => `
        <div class="flex items-center gap-3" style="padding:.75rem 0;border-bottom:1px solid var(--gray-100)">
          <img src="${i.imageUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0"
            onerror="this.src='https://placehold.co/44x44/e5e7eb/9ca3af?text=?'">
          <div style="flex:1;min-width:0">
            <div class="font-bold text-sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${i.title}</div>
            <div class="text-xs text-gray">${timeAgo(i.createdAt)} · ${i.category}</div>
          </div>
          ${getStatusBadge(i.status)}
        </div>
      `).join('') : '<div class="empty"><p>No issues yet</p></div>';
    }
  });
}

// ── Hero stats ────────────────────────────────────────
function updateHeroStats(issues) {
  const totalEl    = document.getElementById('hero-total');
  const resolvedEl = document.getElementById('hero-resolved');
  const openEl     = document.getElementById('hero-open');
  if (totalEl)    totalEl.textContent    = issues.length;
  if (resolvedEl) resolvedEl.textContent = issues.filter(i => i.status === 'resolved').length;
  if (openEl)     openEl.textContent     = issues.filter(i => i.status === 'open').length;
}

// ── Boot ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });
  initReportPage();
  initIssuesPage();
  initDashboard();
});