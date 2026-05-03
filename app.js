// ==========================================
// ORI Speaking Coach — App Logic
// ==========================================

// ===== CONFIG =====
const TOPICS = [
  { id: 'introduce', label: '👋 Introduce Yourself', prompt: 'Ask the student to introduce themselves.' },
  { id: 'family', label: '👨‍👩‍👧 Family & Friends', prompt: 'Talk about family and relationships.' },
  { id: 'food', label: '🍜 Food & Restaurant', prompt: 'Discuss favorite foods and ordering at a restaurant.' },
  { id: 'travel', label: '✈️ Travel', prompt: 'Discuss travel experiences and dream destinations.' },
  { id: 'work', label: '💼 Job Interview', prompt: 'Simulate a job interview scenario.' },
  { id: 'hobby', label: '🎨 Hobbies', prompt: 'Talk about hobbies and free time activities.' },
  { id: 'shopping', label: '🛒 Shopping', prompt: 'Practice shopping and bargaining conversations.' },
  { id: 'health', label: '🏥 Health & Doctor', prompt: 'Practice seeing a doctor and describing symptoms.' },
  { id: 'school', label: '🎓 School & Study', prompt: 'Talk about education and learning experiences.' },
  { id: 'weather', label: '🌤️ Weather & Seasons', prompt: 'Discuss weather and seasonal activities.' },
  { id: 'tech', label: '📱 Technology', prompt: 'Talk about technology and social media.' },
  { id: 'environment', label: '🌍 Environment', prompt: 'Discuss environmental issues and solutions.' },
];

const SYSTEM_PROMPTS = {
  free: `You are a friendly and encouraging English speaking coach for Vietnamese students at ORI Academy.
Rules:
- ALWAYS respond in English.
- Keep responses SHORT (2-3 sentences max) to maintain conversational flow.
- After responding, ask a follow-up question to keep the conversation going.
- If the student makes a grammar or vocabulary mistake, gently correct it in your response.
- Be warm, patient, and encouraging.
- Adapt to the student's level.`,

  topic: `You are a friendly English speaking coach at ORI Academy. 
Rules:
- ALWAYS respond in English.
- Keep responses SHORT (2-3 sentences max).
- Stay focused on the given topic.
- After responding, ask a follow-up question related to the topic.
- Gently correct any mistakes.
- Be encouraging and supportive.`,

  reflex: `You are a fast-paced English speaking drill coach at ORI Academy.
Rules:
- ALWAYS respond in English.
- Ask ONE short, direct question that requires a quick response.
- Questions should be simple daily life scenarios.
- After the student responds, briefly acknowledge, then immediately ask the NEXT question.
- Do NOT give long explanations.
- Examples of questions: "What did you have for breakfast?", "How do you get to work?", "What would you do if it rained tomorrow?"
- Keep the energy high and the pace fast.`
};

const DEFAULT_API_KEY = ''; // KHÔNG BAO GIỜ ĐỂ API KEY Ở ĐÂY NẾU CODE PUBLIC

// ===== GOOGLE SHEET AUTH CONFIG =====
// Bạn (Kate) cần:
// 1. Tạo Google Sheet với 3 cột: Tên | Mật khẩu | Trạng thái
// 2. Chia sẻ sheet: "Anyone with the link can view"
// 3. Dán Sheet ID vào đây (phần giữa /d/ và /edit trong URL)
const SHEET_ID = ''; // <-- DÁN SHEET ID VÀO ĐÂY
const SHEET_TAB = 'TaiKhoan'; // Tên tab chứa danh sách học viên
const FALLBACK_PASSWORD = 'ori2026'; // Mật khẩu dự phòng nếu chưa có Sheet

// ===== STATE =====
let currentUser = null;
let currentMode = null;
let currentTopic = null;
let chatHistory = [];
let recognition = null;
let isListening = false;
let reflexTimer = null;
let reflexSeconds = 10;
let studentList = []; // Danh sách học viên từ Google Sheet

document.addEventListener('DOMContentLoaded', () => {
  // Fetch student list from Google Sheet
  fetchStudents();

  const saved = localStorage.getItem('ori_speaking_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    showApp();
  }

  renderTopics();
  initSpeechRecognition();
});

// ===== FETCH STUDENTS FROM GOOGLE SHEET =====
async function fetchStudents() {
  if (!SHEET_ID) {
    console.log('No Sheet ID configured, using fallback password.');
    return;
  }

  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_TAB)}`;
    const res = await fetch(url);
    const text = await res.text();
    
    // Parse Google Visualization API response
    const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
    if (!jsonStr) return;
    
    const data = JSON.parse(jsonStr[1]);
    const cols = data.table.cols.map(c => c.label);
    const rows = data.table.rows;

    studentList = rows.map(row => {
      const obj = {};
      row.c.forEach((cell, i) => {
        obj[cols[i]] = cell ? (cell.v || '') : '';
      });
      return obj;
    }).filter(s => s['Tên'] || s['Ten']); // Filter out empty rows

    console.log(`Loaded ${studentList.length} students from Google Sheet.`);
  } catch (err) {
    console.error('Failed to fetch students:', err);
    showToast('⚠️ Không tải được danh sách học viên. Dùng mật khẩu mặc định.', 'error');
  }
}

// ===== LOGIN =====
function handleLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pass = document.getElementById('loginPass').value.trim();
  const errEl = document.getElementById('loginError');
  const btn = document.querySelector('.btn-login');

  if (!name) { errEl.textContent = '⚠️ Vui lòng nhập tên.'; return; }
  if (!pass) { errEl.textContent = '⚠️ Vui lòng nhập mật khẩu.'; return; }

  // If we have a student list from Google Sheet, validate against it
  if (studentList.length > 0) {
    const student = studentList.find(s => {
      const sName = (s['Tên'] || s['Ten'] || '').trim().toLowerCase();
      const sPass = String(s['Mật khẩu'] || s['Mat khau'] || s['Password'] || '').trim();
      const sStatus = (s['Trạng thái'] || s['Trang thai'] || s['Status'] || 'Active').trim();
      return sName === name.toLowerCase() && sPass === pass && sStatus !== 'Khóa';
    });

    if (!student) {
      errEl.textContent = '❌ Sai tên hoặc mật khẩu. Liên hệ giáo viên nếu cần hỗ trợ.';
      return;
    }

    currentUser = { name: student['Tên'] || student['Ten'] || name };
  } else {
    // Fallback: use default password if no Sheet is configured
    if (pass !== FALLBACK_PASSWORD) {
      errEl.textContent = '❌ Sai mật khẩu.';
      return;
    }
    currentUser = { name };
  }

  localStorage.setItem('ori_speaking_user', JSON.stringify(currentUser));
  errEl.textContent = '';
  showApp();
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('ori_speaking_user');
  document.getElementById('appScreen').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
}

function showApp() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');
  document.getElementById('userBadge').textContent = currentUser.name;
}

// ===== MODE SELECTION =====
function showTopics() {
  const picker = document.getElementById('topicPicker');
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

function renderTopics() {
  const grid = document.getElementById('topicGrid');
  grid.innerHTML = TOPICS.map(t =>
    `<button class="topic-chip" onclick="startSession('topic', '${t.id}')">${t.label}</button>`
  ).join('');
}

// ===== SESSION =====
function startSession(mode, topicId) {
  currentMode = mode;
  chatHistory = [];

  document.getElementById('modeSelection').style.display = 'none';
  document.getElementById('conversationView').style.display = 'flex';
  document.getElementById('chatArea').innerHTML = '';
  document.getElementById('feedbackPanel').style.display = 'none';
  document.getElementById('transcriptPreview').textContent = '';

  // Set label
  if (mode === 'free') {
    document.getElementById('convModeLabel').textContent = '💬 Free Talk';
    document.getElementById('convTimer').style.display = 'none';
  } else if (mode === 'topic') {
    const topic = TOPICS.find(t => t.id === topicId);
    currentTopic = topic;
    document.getElementById('convModeLabel').textContent = '📖 ' + topic.label;
    document.getElementById('convTimer').style.display = 'none';
  } else if (mode === 'reflex') {
    document.getElementById('convModeLabel').textContent = '⚡ Reflex Challenge';
    document.getElementById('convTimer').style.display = 'flex';
  }

  // Send first AI message
  let systemPrompt = SYSTEM_PROMPTS[mode];
  if (mode === 'topic' && currentTopic) {
    systemPrompt += `\nCurrent topic: ${currentTopic.label}. ${currentTopic.prompt}`;
  }

  chatHistory.push({ role: 'system', content: systemPrompt });
  chatHistory.push({ role: 'user', content: `The student "${currentUser.name}" just joined. Start the conversation with a warm greeting and your first question.` });

  sendToAI();
}

function endSession() {
  if (reflexTimer) clearInterval(reflexTimer);
  document.getElementById('conversationView').style.display = 'none';
  document.getElementById('modeSelection').style.display = 'block';
  document.getElementById('topicPicker').style.display = 'none';
  chatHistory = [];
  currentMode = null;
  currentTopic = null;
}

// ===== SPEECH RECOGNITION =====
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech Recognition not supported.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalTranscript = '';

  recognition.onresult = (event) => {
    let interim = '';
    finalTranscript = '';
    for (let i = 0; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += t;
      } else {
        interim += t;
      }
    }
    document.getElementById('transcriptPreview').textContent = finalTranscript || interim || '...';
  };

  recognition.onerror = (e) => {
    console.error('Speech error:', e.error);
    if (e.error !== 'no-speech') {
      showToast('⚠️ Lỗi micro: ' + e.error, 'error');
    }
    stopListeningUI();
  };

  recognition.onend = () => {
    if (isListening) {
      // It auto-stopped, send what we have
      if (finalTranscript.trim()) {
        processUserSpeech(finalTranscript.trim());
      }
      stopListeningUI();
    }
  };
}

function startListening() {
  if (!recognition) {
    showToast('⚠️ Trình duyệt không hỗ trợ. Dùng Chrome!', 'error');
    return;
  }
  isListening = true;
  document.getElementById('btnMic').classList.add('listening');
  document.getElementById('micHint').textContent = 'Đang nghe...';
  document.getElementById('transcriptPreview').textContent = '🎙️ Đang nghe...';
  try { recognition.start(); } catch(e) { /* already started */ }
}

function stopListening() {
  if (!recognition || !isListening) return;
  isListening = false;
  try { recognition.stop(); } catch(e) { /* already stopped */ }
  stopListeningUI();
}

function stopListeningUI() {
  isListening = false;
  document.getElementById('btnMic').classList.remove('listening');
  document.getElementById('micHint').textContent = 'Giữ nút để nói';
}

function processUserSpeech(text) {
  if (!text) return;
  
  // Clear reflex timer if active
  if (reflexTimer) { clearInterval(reflexTimer); reflexTimer = null; }

  addMessage('user', text);
  document.getElementById('transcriptPreview').textContent = '';
  
  chatHistory.push({ role: 'user', content: text });
  sendToAI();
}

// ===== TEXT INPUT =====
function toggleTextInput() {
  const row = document.getElementById('textInputRow');
  const shown = row.style.display !== 'none';
  row.style.display = shown ? 'none' : 'flex';
  if (!shown) document.getElementById('textInput').focus();
}

function sendTextMessage() {
  const input = document.getElementById('textInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  processUserSpeech(text);
}

// ===== AI BACKEND =====
async function sendToAI() {
  // Show loading
  const loadingId = addMessage('ai', '💭 Đang suy nghĩ...', true);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });

    const data = await res.json();

    // Remove loading
    removeMessage(loadingId);

    if (data.error) {
      addMessage('ai', '⚠️ Lỗi: ' + data.error);
      return;
    }

    const aiText = data.text || 'Sorry, I could not generate a response.';
    
    chatHistory.push({ role: 'assistant', content: aiText });

    // Parse feedback if present
    const feedbackMatch = aiText.match(/\[FEEDBACK\](.*?)\[\/FEEDBACK\]/s);
    let displayText = aiText;
    let feedbackText = null;

    if (feedbackMatch) {
      feedbackText = feedbackMatch[1].trim();
      displayText = aiText.replace(/\[FEEDBACK\].*?\[\/FEEDBACK\]/s, '').trim();
    }

    addMessage('ai', displayText);
    speakText(displayText);

    if (feedbackText) {
      showFeedback(feedbackText);
    }

    // Reflex timer
    if (currentMode === 'reflex') {
      startReflexTimer();
    }

  } catch (err) {
    removeMessage(loadingId);
    addMessage('ai', '❌ Lỗi kết nối máy chủ: ' + err.message);
    console.error(err);
  }
}

// ===== TTS =====
function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 0.9;
    utter.pitch = 1;
    
    // Try to get a good English voice
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Samantha'))
      || voices.find(v => v.lang.startsWith('en-US'))
      || voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utter.voice = enVoice;
    
    window.speechSynthesis.speak(utter);
  }
}

function replayMessage(text) {
  speakText(text);
}

// ===== REFLEX TIMER =====
function startReflexTimer() {
  reflexSeconds = 10;
  const timerEl = document.getElementById('timerText');
  const timerContainer = document.getElementById('convTimer');
  timerEl.textContent = reflexSeconds;
  timerContainer.classList.remove('urgent');

  reflexTimer = setInterval(() => {
    reflexSeconds--;
    timerEl.textContent = reflexSeconds;
    if (reflexSeconds <= 3) timerContainer.classList.add('urgent');
    if (reflexSeconds <= 0) {
      clearInterval(reflexTimer);
      reflexTimer = null;
      // Time's up!
      addMessage('user', '(⏰ Hết giờ — không trả lời kịp)');
      chatHistory.push({ role: 'user', content: "(The student ran out of time and didn't answer. Encourage them and ask the next question.)" });
      sendToAI();
    }
  }, 1000);
}

// ===== UI HELPERS =====
let msgIdCounter = 0;

function addMessage(role, text, isLoading = false) {
  const area = document.getElementById('chatArea');
  const id = 'msg_' + (++msgIdCounter);
  
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.id = id;

  let replayBtn = '';
  if (role === 'ai' && !isLoading) {
    replayBtn = `<button class="btn-replay" onclick="replayMessage(\`${text.replace(/`/g, "'")}\`)"><i class="ri-volume-up-line"></i> Phát lại</button>`;
  }

  div.innerHTML = `
    <span class="msg-label">${role === 'ai' ? '🤖 AI Coach' : '👤 ' + (currentUser?.name || 'You')}</span>
    <div class="msg-text">${escapeHtml(text)}</div>
    ${replayBtn}
  `;
  
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return id;
}

function removeMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function showFeedback(text) {
  const panel = document.getElementById('feedbackPanel');
  const body = document.getElementById('feedbackBody');
  body.innerHTML = `<div class="correction">${escapeHtml(text)}</div>`;
  panel.style.display = 'block';
}

function closeFeedback() {
  document.getElementById('feedbackPanel').style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Load voices
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}
