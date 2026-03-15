// ===== Firebase Config (embedded) =====
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD4sMwshDPUsh8bnWeSuB9XDe6840W-5ew",
  authDomain: "family-shedule.firebaseapp.com",
  projectId: "family-shedule",
  storageBucket: "family-shedule.firebasestorage.app",
  messagingSenderId: "541785971340",
  appId: "1:541785971340:web:002f400e54d2b562f2b9a9",
  measurementId: "G-LCGCXJ6GJ1"
};

// ===== Constants =====
const CATEGORIES = {
  cleaning:{name:'掃除',color:'#5b9bd5',icon:'🧹'},
  pest:{name:'害虫対策',color:'#e67e22',icon:'🪲'},
  garden:{name:'庭・植物',color:'#27ae60',icon:'🌿'},
  maintenance:{name:'メンテナンス',color:'#8e44ad',icon:'🔧'},
  seasonal:{name:'季節行事',color:'#e74c3c',icon:'🎍'},
  health:{name:'健康・検診',color:'#1abc9c',icon:'🏥'},
  event:{name:'イベント',color:'#f39c12',icon:'🎉'},
  pet:{name:'ペット',color:'#e91e63',icon:'🐾'},
  other:{name:'その他',color:'#95a5a6',icon:'📌'}
};
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const MEMBER_COLORS = ['#5b9bd5','#e67e22','#27ae60','#8e44ad','#e74c3c','#1abc9c','#f39c12','#e91e63'];

// Feature 6: Points per category
const CATEGORY_POINTS = {
  cleaning: 10, pest: 15, maintenance: 20, garden: 10,
  seasonal: 15, health: 10, event: 5, pet: 10, other: 5
};

// Feature 4: Appliance categories
const APPLIANCE_CATEGORIES = ['エアコン','洗濯機','冷蔵庫','給湯器','食洗機','テレビ','電子レンジ','掃除機','乾燥機','その他'];

// Feature 7: Stock units
const STOCK_UNITS = ['個','本','箱','袋','パック','枚','セット','kg','L'];

// ===== State =====
let currentYear = new Date().getFullYear();
let tasks = [];
let members = [];
let completions = {};
let activityLog = [];
let currentSort = 'date';
let editingId = null;
let reminderEnabled = false;
let wizardAnswers = {};

// New feature states
let shoppingList = [];       // Feature 2
let appliances = [];          // Feature 4
let stockItems = [];          // Feature 7
let rewards = [];             // Feature 6
let pointsHistory = [];       // Feature 6
let weatherData = null;       // Feature 8
let weatherSettings = { lat: 35.6762, lon: 139.6503 }; // Feature 8: Tokyo default

// ===== View/Router State =====
let currentView = 'schedule';
const VIEW_TITLES = {
  schedule: '年間スケジュール',
  upcoming: '次にやること',
  cost: 'コスト管理',
  shopping: '買い物リスト',
  report: '年間レポート',
  appliance: '家電・設備管理',
  rewards: 'ポイント & ごほうび',
  stock: 'ストック管理',
  activity: '変更履歴',
  members: '家族メンバー管理',
  settings: '設定'
};

// ===== Firebase State =====
let db = null;
let fbMode = false;
let roomCode = null;
let currentUserId = null;
let currentUserName = 'ゲスト';
let unsubscribers = [];

// ===== Data Layer =====
const DL = {
  async saveTask(task, isNew) {
    if (fbMode && db && roomCode) {
      const data = { ...task, modifiedAt: firebase.firestore.FieldValue.serverTimestamp(), modifiedBy: currentUserName };
      if (isNew) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('familyRooms').doc(roomCode).collection('tasks').doc(task.id).set(data);
      await this.log(isNew ? 'task_created' : 'task_updated', `「${task.name}」を${isNew ? '追加' : '更新'}しました`);
    } else {
      const idx = tasks.findIndex(t=>t.id===task.id);
      task.modifiedAt = new Date().toISOString();
      task.modifiedBy = currentUserName;
      if (idx >= 0) tasks[idx] = task; else tasks.push(task);
      this.logLocal(isNew ? 'task_created' : 'task_updated', `「${task.name}」を${isNew ? '追加' : '更新'}しました`);
      this.saveLocal();
    }
  },

  async deleteTask(taskId, taskName) {
    if (fbMode && db && roomCode) {
      await db.collection('familyRooms').doc(roomCode).collection('tasks').doc(taskId).delete();
      const snaps = await db.collection('familyRooms').doc(roomCode).collection('completions')
        .where(firebase.firestore.FieldPath.documentId(), '>=', taskId)
        .where(firebase.firestore.FieldPath.documentId(), '<=', taskId + '\uf8ff').get();
      const batch = db.batch();
      snaps.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await this.log('task_deleted', `「${taskName}」を削除しました`);
    } else {
      tasks = tasks.filter(t=>t.id!==taskId);
      Object.keys(completions).forEach(k => { if(k.startsWith(taskId)) delete completions[k]; });
      this.logLocal('task_deleted', `「${taskName}」を削除しました`);
      this.saveLocal();
    }
  },

  async toggleCompletion(taskId, year, done) {
    const key = `${taskId}-${year}`;
    const taskName = (tasks.find(t=>t.id===taskId)||{}).name||'';
    if (fbMode && db && roomCode) {
      await db.collection('familyRooms').doc(roomCode).collection('completions').doc(key).set({
        done, modifiedAt: firebase.firestore.FieldValue.serverTimestamp(), modifiedBy: currentUserName
      });
      await this.log(done ? 'task_completed' : 'task_uncompleted',
        `「${taskName}」(${year}年)を${done ? '完了に' : '未完了に戻'}しました`);
    } else {
      completions[key] = done;
      this.logLocal(done ? 'task_completed' : 'task_uncompleted',
        `「${taskName}」(${year}年)を${done ? '完了に' : '未完了に戻'}しました`);
      this.saveLocal();
    }
  },

  async addMember(member) {
    if (fbMode && db && roomCode) {
      await db.collection('familyRooms').doc(roomCode).collection('members').doc(member.id).set(member);
      await this.log('member_added', `メンバー「${member.name}」を追加しました`);
    } else {
      members.push(member);
      this.logLocal('member_added', `メンバー「${member.name}」を追加しました`);
      this.saveLocal();
    }
  },

  async removeMember(memberId) {
    const mem = members.find(m=>m.id===memberId);
    const name = mem ? mem.name : '';
    if (fbMode && db && roomCode) {
      await db.collection('familyRooms').doc(roomCode).collection('members').doc(memberId).delete();
      const snap = await db.collection('familyRooms').doc(roomCode).collection('tasks')
        .where('member','==',memberId).get();
      const batch = db.batch();
      snap.forEach(d => batch.update(d.ref, {member:''}));
      await batch.commit();
      await this.log('member_removed', `メンバー「${name}」を削除しました`);
    } else {
      members = members.filter(m=>m.id!==memberId);
      tasks.forEach(t => { if(t.member===memberId) t.member=''; });
      this.logLocal('member_removed', `メンバー「${name}」を削除しました`);
      this.saveLocal();
    }
  },

  // Feature 2: Shopping List
  async saveShopping() {
    if (fbMode && db && roomCode) {
      const batch = db.batch();
      const ref = db.collection('familyRooms').doc(roomCode).collection('shopping');
      // Delete all then re-add
      const snap = await ref.get();
      snap.forEach(d => batch.delete(d.ref));
      shoppingList.forEach(item => batch.set(ref.doc(item.id), item));
      await batch.commit();
    }
    localStorage.setItem('fs-shopping', JSON.stringify(shoppingList));
  },

  // Feature 4: Appliances
  async saveAppliances() {
    if (fbMode && db && roomCode) {
      const batch = db.batch();
      const ref = db.collection('familyRooms').doc(roomCode).collection('appliances');
      const snap = await ref.get();
      snap.forEach(d => batch.delete(d.ref));
      appliances.forEach(item => batch.set(ref.doc(item.id), item));
      await batch.commit();
    }
    localStorage.setItem('fs-appliances', JSON.stringify(appliances));
  },

  // Feature 7: Stock
  async saveStock() {
    if (fbMode && db && roomCode) {
      const batch = db.batch();
      const ref = db.collection('familyRooms').doc(roomCode).collection('stock');
      const snap = await ref.get();
      snap.forEach(d => batch.delete(d.ref));
      stockItems.forEach(item => batch.set(ref.doc(item.id), item));
      await batch.commit();
    }
    localStorage.setItem('fs-stock', JSON.stringify(stockItems));
  },

  // Feature 6: Rewards & Points
  async saveRewards() {
    if (fbMode && db && roomCode) {
      const batch = db.batch();
      const ref = db.collection('familyRooms').doc(roomCode).collection('rewards');
      const snap = await ref.get();
      snap.forEach(d => batch.delete(d.ref));
      rewards.forEach(item => batch.set(ref.doc(item.id), item));
      await batch.commit();
    }
    localStorage.setItem('fs-rewards', JSON.stringify(rewards));
  },

  async savePoints() {
    if (fbMode && db && roomCode) {
      const batch = db.batch();
      const ref = db.collection('familyRooms').doc(roomCode).collection('points');
      const snap = await ref.get();
      snap.forEach(d => batch.delete(d.ref));
      pointsHistory.forEach(item => batch.set(ref.doc(item.id), item));
      await batch.commit();
    }
    localStorage.setItem('fs-points', JSON.stringify(pointsHistory));
  },

  async log(action, details) {
    if (!fbMode || !db || !roomCode) return;
    await db.collection('familyRooms').doc(roomCode).collection('activityLog').add({
      action, details, performedBy: currentUserName,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  logLocal(action, details) {
    activityLog.unshift({
      action, details, performedBy: currentUserName,
      timestamp: new Date().toISOString()
    });
    if (activityLog.length > 200) activityLog.length = 200;
    localStorage.setItem('fs-activity', JSON.stringify(activityLog));
  },

  saveLocal() {
    localStorage.setItem('fs-tasks', JSON.stringify(tasks));
    localStorage.setItem('fs-members', JSON.stringify(members));
    localStorage.setItem('fs-completions', JSON.stringify(completions));
  }
};

// ===== View Router =====
function navigateTo(viewName) {
  if (!VIEW_TITLES[viewName]) viewName = 'schedule';
  currentView = viewName;

  // Update URL hash
  window.location.hash = viewName === 'schedule' ? '' : viewName;

  // Save last view
  localStorage.setItem('fs-last-view', viewName);

  // Hide all views, show target
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewName);
  if (target) target.classList.add('active');

  // Update page title
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = VIEW_TITLES[viewName] || '';

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewName);
  });

  // Update mobile tab bar active state
  document.querySelectorAll('.tab-item[data-view]').forEach(t => {
    t.classList.toggle('active', t.dataset.view === viewName);
  });

  // Show/hide schedule-specific controls
  const schedCtrl = document.getElementById('scheduleControls');
  if (schedCtrl) schedCtrl.style.display = viewName === 'schedule' ? 'flex' : 'none';

  // Close sidebar on mobile after navigation
  closeSidebar();

  // Render the target view content
  renderCurrentView();
}

function renderCurrentView() {
  switch (currentView) {
    case 'schedule': render(); break;
    case 'upcoming': renderUpcomingView(); break;
    case 'cost': renderCostView(); break;
    case 'shopping': renderShoppingList(); break;
    case 'report': renderReportView(); break;
    case 'appliance': renderApplianceList(); break;
    case 'rewards': renderRewardsView(); break;
    case 'stock': renderStockList(); break;
    case 'activity': renderActivityView(); break;
    case 'members': renderMemberView(); break;
    case 'settings': renderSettingsView(); break;
  }
}

function initRouter() {
  // Listen for hash changes (browser back/forward)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '') || 'schedule';
    if (hash.startsWith('join=')) return; // Ignore join links, handled in init
    if (hash !== currentView) navigateTo(hash);
  });

  // Determine initial view
  const hash = window.location.hash.replace('#', '');
  const lastView = localStorage.getItem('fs-last-view');
  const initialView = (hash && !hash.startsWith('join=')) ? hash : (lastView || 'schedule');
  navigateTo(initialView);
}

// ===== Sidebar Toggle =====
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

// ===== Load =====
function loadLocal() {
  try {
    const t = localStorage.getItem('fs-tasks');
    const m = localStorage.getItem('fs-members');
    const c = localStorage.getItem('fs-completions');
    const a = localStorage.getItem('fs-activity');
    tasks = t ? JSON.parse(t) : [];
    members = m ? JSON.parse(m) : [];
    completions = c ? JSON.parse(c) : {};
    activityLog = a ? JSON.parse(a) : [];
    reminderEnabled = localStorage.getItem('fs-reminders') === 'true';
    currentUserId = localStorage.getItem('fs-current-user-id') || null;
    currentUserName = localStorage.getItem('fs-current-user-name') || 'ゲスト';
    // Load new feature data
    const sh = localStorage.getItem('fs-shopping');
    shoppingList = sh ? JSON.parse(sh) : [];
    const ap = localStorage.getItem('fs-appliances');
    appliances = ap ? JSON.parse(ap) : [];
    const st = localStorage.getItem('fs-stock');
    stockItems = st ? JSON.parse(st) : [];
    const rw = localStorage.getItem('fs-rewards');
    rewards = rw ? JSON.parse(rw) : [];
    const pt = localStorage.getItem('fs-points');
    pointsHistory = pt ? JSON.parse(pt) : [];
    const ws = localStorage.getItem('fs-weather-settings');
    if (ws) weatherSettings = JSON.parse(ws);
  } catch(e) { tasks=[]; members=[]; completions={}; activityLog=[]; }
}

function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// ===== Firebase Init =====
let auth = null;
let googleUser = null;

async function initFirebase(config) {
  try {
    if (firebase.apps.length) await firebase.app().delete();
    firebase.initializeApp(config);
    db = firebase.firestore();
    auth = firebase.auth();
    await db.enablePersistence({synchronizeTabs:true}).catch(()=>{});

    // Process any pending redirect result FIRST (mobile Google login)
    // This must complete before onAuthStateChanged is set up,
    // otherwise onAuthStateChanged fires with null before redirect is processed
    try {
      await auth.getRedirectResult();
    } catch(e) { /* no pending redirect, that's fine */ }

    // NOW set up auth state listener - user state is correct at this point
    auth.onAuthStateChanged(async user => {
      googleUser = user;
      if (user) {
        currentUserName = user.displayName || 'ゲスト';
        localStorage.setItem('fs-current-user-name', currentUserName);
        hideLoginScreen();
        updateUserBadgeWithGoogle();

        // Connect to room if not already
        if (!fbMode) {
          // Check for invite link first: #join=ROOMCODE
          const hash = window.location.hash;
          const joinMatch = hash.match(/[#&]join=([A-Z0-9]{6})/i);
          if (joinMatch) {
            const code = joinMatch[1].toUpperCase();
            const joined = await joinRoom(code);
            if (joined) {
              window.location.hash = '#schedule';
              await autoAddGoogleMember();
            } else {
              alert('ルームコード「' + code + '」は見つかりません');
            }
          } else {
            const savedRoom = localStorage.getItem('fs-room-code');
            if (savedRoom) {
              roomCode = savedRoom;
              fbMode = true;
              await attachListeners();
              await autoAddGoogleMember();
            } else {
              setTimeout(() => showJoinRoomModal(), 300);
            }
          }
        }

        // Show wizard if first visit
        if (!localStorage.getItem('fs-wizard-done') && tasks.length === 0) {
          setTimeout(() => openWizard(), 500);
        }
      } else {
        // Not logged in (redirect already processed, so this is definitive)
        if (sessionStorage.getItem('fs-login-skipped')) {
          hideLoginScreen();
          if (!localStorage.getItem('fs-wizard-done') && tasks.length === 0) {
            setTimeout(() => openWizard(), 500);
          }
        } else {
          showLoginScreen();
        }
      }
      updateUserBadgeWithGoogle();
    });

    setSyncStatus('connected');
    return true;
  } catch(e) {
    console.error('Firebase init error:', e);
    setSyncStatus('error');
    return false;
  }
}

async function googleSignIn() {
  if (!auth) { alert('Firebaseの初期化に失敗しました'); return; }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    // Use redirect on mobile (popup is blocked by in-app browsers)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      await auth.signInWithRedirect(provider);
      return; // Page will reload after redirect
    }
    const result = await auth.signInWithPopup(provider);
    googleUser = result.user;
    currentUserName = googleUser.displayName || 'ユーザー';
    localStorage.setItem('fs-current-user-name', currentUserName);
    updateUserBadgeWithGoogle();

    // Auto-create member from Google profile if not exists
    const existingMember = members.find(m => m.googleUid === googleUser.uid);
    if (existingMember) {
      setCurrentUser(existingMember.id);
    }

    // Hide login screen
    hideLoginScreen();

    // Check if already in a room
    const savedRoom = localStorage.getItem('fs-room-code');
    if (savedRoom) {
      roomCode = savedRoom;
      fbMode = true;
      await attachListeners();
      await autoAddGoogleMember();
    } else {
      // Show room selection
      showJoinRoomModal();
    }

    // Hide error
    const errEl = document.getElementById('googleLoginError');
    if (errEl) errEl.style.display = 'none';
  } catch(e) {
    console.error('Google sign-in error:', e);
    const errEl = document.getElementById('googleLoginError');
    if (errEl) { errEl.textContent = 'ログインに失敗しました: ' + e.message; errEl.style.display = 'block'; }
  }
}

async function googleSignOut() {
  if (auth) await auth.signOut();
  googleUser = null;
  updateUserBadgeWithGoogle();
  showLoginScreen();
}

function hideLoginScreen() {
  const el = document.getElementById('loginScreen');
  if (el) el.classList.add('hidden');
}
function showLoginScreen() {
  const el = document.getElementById('loginScreen');
  if (el) el.classList.remove('hidden');
}
function skipLogin() {
  sessionStorage.setItem('fs-login-skipped', 'true');
  hideLoginScreen();
  // Show wizard if first time
  if(!localStorage.getItem('fs-wizard-done')&&tasks.length===0){setTimeout(()=>openWizard(),300)}
}

function updateUserBadgeWithGoogle() {
  const photo = document.getElementById('badgePhoto');
  const dot = document.getElementById('badgeDot');
  const nameEl = document.getElementById('badgeName');
  if (!photo || !dot || !nameEl) return;

  if (googleUser) {
    if (googleUser.photoURL) {
      photo.src = googleUser.photoURL;
      photo.style.display = 'inline';
      dot.style.display = 'none';
    }
    // If there's a matching member, show that name; otherwise Google name
    const mem = members.find(m => m.id === currentUserId);
    nameEl.textContent = mem ? mem.name : googleUser.displayName || 'ユーザー';
  } else {
    photo.style.display = 'none';
    dot.style.display = 'inline';
    updateUserBadge();
  }
}

function setSyncStatus(status) {
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  dot.className = 'sync-dot';
  if (status==='connected') { dot.classList.add('connected'); dot.title='Firebase接続中'; if(label) label.textContent='接続中'; }
  else if (status==='error') { dot.classList.add('error'); dot.title='接続エラー'; if(label) label.textContent='エラー'; }
  else if (status==='syncing') { dot.classList.add('syncing'); dot.title='同期中...'; if(label) label.textContent='同期中'; }
  else { dot.title='ローカルモード'; if(label) label.textContent='ローカル'; }
}

async function attachListeners() {
  unsubscribers.forEach(u=>u());
  unsubscribers = [];
  if (!db || !roomCode) return;

  const roomRef = db.collection('familyRooms').doc(roomCode);
  let renderPending = false;
  function scheduleRender() {
    if (!renderPending) { renderPending = true; requestAnimationFrame(()=>{ renderPending=false; render(); }); }
  }

  unsubscribers.push(
    roomRef.collection('tasks').onSnapshot(snap => {
      tasks = snap.docs.map(d => ({id:d.id,...d.data()}));
      tasks.forEach(t => {
        if (t.modifiedAt && t.modifiedAt.toDate) t.modifiedAt = t.modifiedAt.toDate().toISOString();
        if (t.createdAt && t.createdAt.toDate) t.createdAt = t.createdAt.toDate().toISOString();
      });
      scheduleRender();
    }, err => { console.error('Tasks listener error:', err); setSyncStatus('error'); })
  );

  unsubscribers.push(
    roomRef.collection('members').onSnapshot(snap => {
      members = snap.docs.map(d => ({id:d.id,...d.data()}));
      scheduleRender();
      updateUserBadge();
    }, err => console.error('Members listener error:', err))
  );

  unsubscribers.push(
    roomRef.collection('completions').onSnapshot(snap => {
      completions = {};
      snap.docs.forEach(d => { completions[d.id] = d.data().done; });
      scheduleRender();
    }, err => console.error('Completions listener error:', err))
  );

  unsubscribers.push(
    roomRef.collection('activityLog').orderBy('timestamp','desc').limit(100).onSnapshot(snap => {
      activityLog = snap.docs.map(d => {
        const data = d.data();
        if (data.timestamp && data.timestamp.toDate) data.timestamp = data.timestamp.toDate().toISOString();
        return data;
      });
    }, err => console.error('Activity listener error:', err))
  );

  // New feature listeners
  unsubscribers.push(
    roomRef.collection('shopping').onSnapshot(snap => {
      shoppingList = snap.docs.map(d => ({id:d.id,...d.data()}));
    }, err => console.error('Shopping listener error:', err))
  );

  unsubscribers.push(
    roomRef.collection('appliances').onSnapshot(snap => {
      appliances = snap.docs.map(d => ({id:d.id,...d.data()}));
    }, err => console.error('Appliances listener error:', err))
  );

  unsubscribers.push(
    roomRef.collection('stock').onSnapshot(snap => {
      stockItems = snap.docs.map(d => ({id:d.id,...d.data()}));
    }, err => console.error('Stock listener error:', err))
  );

  unsubscribers.push(
    roomRef.collection('rewards').onSnapshot(snap => {
      rewards = snap.docs.map(d => ({id:d.id,...d.data()}));
    }, err => console.error('Rewards listener error:', err))
  );

  unsubscribers.push(
    roomRef.collection('points').onSnapshot(snap => {
      pointsHistory = snap.docs.map(d => ({id:d.id,...d.data()}));
    }, err => console.error('Points listener error:', err))
  );
}

// ===== Room Management =====
function generateRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i=0; i<6; i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

async function createRoom(familyName) {
  if (!db) return;
  const code = generateRoomCode();
  await db.collection('familyRooms').doc(code).set({
    name: familyName, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUserName
  });

  if (tasks.length || members.length) {
    const batch = db.batch();
    const roomRef = db.collection('familyRooms').doc(code);
    tasks.forEach(t => batch.set(roomRef.collection('tasks').doc(t.id), {...t, modifiedAt: firebase.firestore.FieldValue.serverTimestamp(), modifiedBy:currentUserName}));
    members.forEach(m => batch.set(roomRef.collection('members').doc(m.id), m));
    Object.entries(completions).forEach(([k,v]) => batch.set(roomRef.collection('completions').doc(k), {done:v, modifiedBy:currentUserName, modifiedAt: firebase.firestore.FieldValue.serverTimestamp()}));
    await batch.commit();
  }

  roomCode = code;
  fbMode = true;
  localStorage.setItem('fs-room-code', code);
  await attachListeners();
  renderRoomInfo();
}

async function joinRoom(code) {
  if (!db) return false;
  code = code.toUpperCase().trim();
  const doc = await db.collection('familyRooms').doc(code).get();
  if (!doc.exists) return false;

  roomCode = code;
  fbMode = true;
  localStorage.setItem('fs-room-code', code);
  await attachListeners();
  renderRoomInfo();
  return true;
}

function leaveRoom() {
  unsubscribers.forEach(u=>u());
  unsubscribers = [];
  roomCode = null;
  fbMode = false;
  localStorage.removeItem('fs-room-code');
  loadLocal();
  render();
  renderRoomInfo();
}

function renderRoomInfo() {
  const section = document.getElementById('roomSection');
  const userSection = document.getElementById('userSelectSection');
  if (!section || !userSection) return;

  if (!db) { section.style.display='none'; userSection.style.display='none'; return; }
  section.style.display = 'block';
  userSection.style.display = roomCode ? 'block' : 'none';

  if (roomCode) {
    section.innerHTML = `<h3>家族ルーム</h3>
      <p>ルームコードを家族と共有してください</p>
      <div class="room-code-display">${roomCode}</div>
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${roomCode}');alert('コピーしました')">コードをコピー</button>
        <button class="btn btn-primary" onclick="copyInviteLink()">招待リンクをコピー</button>
        <button class="btn btn-danger" onclick="if(confirm('ルームから退出しますか？'))leaveRoom()">退出</button>
      </div>`;
    renderUserSelectList();
  } else {
    section.innerHTML = `<h3>家族ルーム</h3>
      <p>ルームを作成するか、既存のルームに参加してください</p>
      <div style="display:flex;gap:8px;margin-top:8px">
        <div style="flex:1">
          <input type="text" id="newRoomName" placeholder="家族名（例: 田中家）" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:8px;font-size:0.8rem;margin-bottom:6px">
          <button class="btn btn-primary" style="width:100%" onclick="createRoomFromUI()">ルームを作成</button>
        </div>
        <div style="flex:1">
          <input type="text" id="joinRoomCode" placeholder="ルームコード" maxlength="6" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:8px;font-size:0.8rem;text-transform:uppercase;margin-bottom:6px">
          <button class="btn btn-primary" style="width:100%" onclick="joinRoomFromUI()">参加する</button>
        </div>
      </div>`;
  }
}

async function createRoomFromUI() {
  const name = document.getElementById('newRoomName').value.trim();
  if (!name) { alert('家族名を入力してください'); return; }
  await createRoom(name);
}

async function joinRoomFromUI() {
  const code = document.getElementById('joinRoomCode').value.trim();
  if (code.length !== 6) { alert('6桁のルームコードを入力してください'); return; }
  const ok = await joinRoom(code);
  if (!ok) alert('このコードのルームは見つかりません');
}

// ===== User Identity =====
function setCurrentUser(memberId) {
  const mem = members.find(m=>m.id===memberId);
  if (!mem) return;
  currentUserId = memberId;
  currentUserName = mem.name;
  localStorage.setItem('fs-current-user-id', memberId);
  localStorage.setItem('fs-current-user-name', mem.name);
  updateUserBadge();
}

function updateUserBadge() {
  const badgeDot = document.getElementById('badgeDot');
  const badgeName = document.getElementById('badgeName');
  if (!badgeDot || !badgeName) return;
  const mem = members.find(m=>m.id===currentUserId);
  if (mem) {
    badgeDot.style.background = mem.color;
    badgeName.textContent = mem.name;
  } else {
    badgeDot.style.background = '#999';
    badgeName.textContent = 'ゲスト';
  }
}

function renderUserSelectList() {
  const container = document.getElementById('userSelectSection');
  if (!container) return;
  container.innerHTML = `<h3>あなたはだれ？</h3>
    <p style="font-size:0.7rem;color:var(--text-light);margin-bottom:8px">変更履歴に名前が記録されます</p>
    ${members.map(m => `
      <div class="member-item" style="cursor:pointer;${m.id===currentUserId?'border:2px solid var(--accent)':''}" onclick="setCurrentUser('${m.id}');renderUserSelectList()">
        <div class="member-color" style="background:${m.color}"></div>
        <span class="member-name-display">${escHtml(m.name)}</span>
        ${m.id===currentUserId?'<span style="color:var(--accent);font-size:0.7rem;font-weight:600">選択中</span>':''}
      </div>
    `).join('')}`;
}

function openUserSelect() {
  const list = document.getElementById('userSelectQuickList');
  list.innerHTML = members.map(m => `
    <div class="member-item" style="cursor:pointer;margin-bottom:4px;${m.id===currentUserId?'border:2px solid var(--accent)':''}" onclick="setCurrentUser('${m.id}');closeUserSelect()">
      <div class="member-color" style="background:${m.color}"></div>
      <span class="member-name-display">${escHtml(m.name)}</span>
      ${m.id===currentUserId?'<span style="color:var(--accent);font-size:0.7rem;font-weight:600">選択中</span>':''}
    </div>
  `).join('') || '<p style="font-size:0.8rem;color:var(--text-light)">まずメンバーを登録してください</p>';
  document.getElementById('userSelectOverlay').classList.add('active');
}
function closeUserSelect() { document.getElementById('userSelectOverlay').classList.remove('active'); }

// ===== Settings Modal =====
function openSettingsModal() { navigateTo('settings'); }
function closeSettingsModal() { navigateTo('schedule'); }

function saveWeatherSettings() {
  weatherSettings.lat = parseFloat(document.getElementById('weatherLat').value) || 35.6762;
  weatherSettings.lon = parseFloat(document.getElementById('weatherLon').value) || 139.6503;
  localStorage.setItem('fs-weather-settings', JSON.stringify(weatherSettings));
  sessionStorage.removeItem('fs-weather-cache');
  weatherData = null;
  fetchWeather();
  alert('天気設定を保存しました');
}

async function saveFirebaseConfig() {
  const raw = document.getElementById('fbConfigInput').value.trim();
  if (!raw) { alert('Firebase Configを入力してください'); return; }
  try {
    const config = JSON.parse(raw);
    if (!config.apiKey || !config.projectId) throw new Error('Invalid config');
    localStorage.setItem('fs-firebase-config', raw);
    const ok = await initFirebase(config);
    if (ok) {
      const savedRoom = localStorage.getItem('fs-room-code');
      if (savedRoom) {
        roomCode = savedRoom;
        fbMode = true;
        await attachListeners();
      }
      renderRoomInfo();
      const st = document.getElementById('fbStatus');
      st.className='settings-status on'; st.textContent='接続中';
      alert('Firebase接続に成功しました！');
    } else {
      alert('Firebase接続に失敗しました。設定を確認してください');
    }
  } catch(e) {
    alert('JSONの形式が正しくありません。Firebase Consoleからコピーした設定を貼り付けてください');
  }
}

function clearFirebaseConfig() {
  if (!confirm('Firebase設定をクリアしてローカルモードに戻りますか？')) return;
  leaveRoom();
  localStorage.removeItem('fs-firebase-config');
  db = null; fbMode = false;
  setSyncStatus('local');
  const st = document.getElementById('fbStatus');
  st.className='settings-status off'; st.textContent='未設定';
  renderRoomInfo();
}

// ===== Helpers =====
function daysInMonth(y,m){return new Date(y,m+1,0).getDate()}
function daysInYear(y){return((y%4===0&&y%100!==0)||y%400===0)?366:365}
function dayOfYear(ds){const d=new Date(ds);return Math.floor((d-new Date(d.getFullYear(),0,0))/864e5)}
function escHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function isTaskDone(taskId){return!!completions[`${taskId}-${currentYear}`]}
function getMemberById(id){return members.find(m=>m.id===id)}

function relativeTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff/60)}分前`;
  if (diff < 86400) return `${Math.floor(diff/3600)}時間前`;
  if (diff < 604800) return `${Math.floor(diff/86400)}日前`;
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function formatYen(n) { return '¥' + (n||0).toLocaleString(); }

// ===== Year Nav =====
function changeYear(d){currentYear+=d;document.getElementById('currentYear').textContent=currentYear;render()}
function goToday(){currentYear=new Date().getFullYear();document.getElementById('currentYear').textContent=currentYear;render()}
function setSort(type){currentSort=type;document.querySelectorAll('.sort-btn').forEach(b=>b.classList.toggle('active',b.dataset.sort===type));render()}

// ===== Toggle Completion =====
function toggleDone(taskId, e) {
  e.stopPropagation();
  const wasDone = isTaskDone(taskId);
  const done = !wasDone;
  completions[`${taskId}-${currentYear}`] = done;

  // Feature 6: Award points on completion
  if (done) {
    awardPoints(taskId);
  } else {
    revokePoints(taskId);
  }

  render();
  DL.toggleCompletion(taskId, currentYear, done);
}

// ===== Feature 6: Points System =====
function getPointMultiplier(task) {
  const today = new Date().toISOString().split('T')[0];
  let displayEnd = task.end;
  if (task.recurring) {
    const s = new Date(task.start);
    const e = new Date(task.end);
    const diff = Math.round((e - s) / 864e5);
    const ne = new Date(currentYear, s.getMonth(), s.getDate() + diff);
    displayEnd = ne.toISOString().split('T')[0];
  }
  if (today < displayEnd) return 1.5; // Before due
  if (today === displayEnd) return 1.0; // On due date
  return 0.5; // Late
}

function awardPoints(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const basePoints = CATEGORY_POINTS[task.category] || 5;
  const multiplier = getPointMultiplier(task);
  const points = Math.round(basePoints * multiplier);
  const memberId = task.member || currentUserId || 'unknown';
  const memberName = (getMemberById(memberId) || {}).name || currentUserName;

  pointsHistory.push({
    id: genId(),
    taskId,
    memberId,
    memberName,
    points,
    type: 'earned',
    year: currentYear,
    date: new Date().toISOString(),
    taskName: task.name,
    category: task.category
  });
  DL.savePoints();
}

function revokePoints(taskId) {
  // Remove the most recent point entry for this task/year
  const idx = pointsHistory.findIndex(p => p.taskId === taskId && p.year === currentYear && p.type === 'earned');
  if (idx >= 0) {
    pointsHistory.splice(idx, 1);
    DL.savePoints();
  }
}

function getMemberPoints(memberId) {
  return pointsHistory
    .filter(p => p.memberId === memberId && p.year === currentYear && (p.type === 'earned'))
    .reduce((sum, p) => sum + p.points, 0)
    - pointsHistory
    .filter(p => p.memberId === memberId && p.year === currentYear && p.type === 'redeemed')
    .reduce((sum, p) => sum + Math.abs(p.points), 0);
}

function getMemberTotalEarned(memberId) {
  return pointsHistory
    .filter(p => p.memberId === memberId && p.year === currentYear && p.type === 'earned')
    .reduce((sum, p) => sum + p.points, 0);
}

// ===== Visible Tasks =====
function getVisibleTasks() {
  const fc=document.getElementById('filterCategory').value;
  const fm=document.getElementById('filterMember').value;
  const searchEl=document.getElementById('filterSearch');
  const searchText=(searchEl?searchEl.value:'').trim().toLowerCase();
  let vis=[];
  tasks.forEach(t=>{
    const sy=new Date(t.start).getFullYear(),ey=new Date(t.end).getFullYear();
    let show=false,ds=t.start,de=t.end;
    if(sy===currentYear||ey===currentYear){show=true}
    else if(t.recurring){
      const s=new Date(t.start),e=new Date(t.end),diff=Math.round((e-s)/864e5);
      ds=`${currentYear}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}`;
      const ne=new Date(currentYear,s.getMonth(),s.getDate()+diff);
      de=`${ne.getFullYear()}-${String(ne.getMonth()+1).padStart(2,'0')}-${String(ne.getDate()).padStart(2,'0')}`;
      show=true;
    }
    if(searchText&&!t.name.toLowerCase().includes(searchText))show=false;
    if(show&&(fc==='all'||fc===t.category)&&(fm==='all'||fm===t.member)){
      vis.push({...t,displayStart:ds,displayEnd:de,done:isTaskDone(t.id)});
    }
  });
  vis.sort((a,b)=>{
    if(currentSort==='date')return a.displayStart.localeCompare(b.displayStart);
    if(currentSort==='category')return a.category.localeCompare(b.category)||a.displayStart.localeCompare(b.displayStart);
    if(currentSort==='member')return(a.member||'').localeCompare(b.member||'')||a.displayStart.localeCompare(b.displayStart);
    return 0;
  });
  return vis;
}

// ===== Render =====
function render(){renderMonthsHeader();renderBody();renderLegend();renderFilters();renderMascot();updateUserBadge();renderMobileCards();renderPointsDisplay();renderSidebarMascot()}

function renderMonthsHeader(){
  document.getElementById('monthsHeader').innerHTML=MONTHS.map((m,i)=>
    `<div class="month-col" onclick="openMonthZoom(${i})"><span class="month-name">${m}</span><span class="month-days">${daysInMonth(currentYear,i)}日</span></div>`
  ).join('');
}

function renderBody(){
  const body=document.getElementById('ganttBody');
  const vis=getVisibleTasks();
  document.getElementById('taskCount').textContent=`${vis.length} 件`;
  if(!vis.length){
    body.innerHTML=`<div style="text-align:center;padding:50px 20px;color:var(--text-light)"><div style="font-size:2rem;margin-bottom:10px;opacity:0.4">📋</div><p style="font-size:0.85rem">スケジュールがまだありません</p><p style="font-size:0.7rem;color:#aaa">「+ 追加」または「テンプレ」から登録</p></div>`;
    updateTodayLine(null);return;
  }
  const total=daysInYear(currentYear);
  body.innerHTML=vis.map(t=>{
    const cat=CATEGORIES[t.category]||CATEGORIES.other;
    const sd=dayOfYear(t.displayStart),ed=dayOfYear(t.displayEnd);
    const lp=((sd-1)/total)*100,wp=Math.max(((ed-sd+1)/total)*100,0.5);
    const sD=new Date(t.displayStart),eD=new Date(t.displayEnd);
    const dt=t.displayStart===t.displayEnd?`${sD.getMonth()+1}/${sD.getDate()}`:`${sD.getMonth()+1}/${sD.getDate()} 〜 ${eD.getMonth()+1}/${eD.getDate()}`;
    const mem=t.member?getMemberById(t.member):null;
    const rc=t.done?'is-done':t.paused?'is-paused':'';
    const bc=t.done?'is-done':t.paused?'is-paused':'';
    const nc=t.done?'done-text':'';
    const bl=wp>5?escHtml(t.name):'';
    const modInfo=t.modifiedBy?`<span class="task-modified">${escHtml(t.modifiedBy)} ${relativeTime(t.modifiedAt)}</span>`:'';
    const costInfo=t.cost?`<span style="color:#e65100;font-size:0.55rem">${formatYen(t.cost)}</span>`:'';

    return `<div class="gantt-row ${rc}" onclick="openTaskModal('${t.id}')">
      <div class="task-label">
        <div class="task-check ${t.done?'checked':''}" onclick="toggleDone('${t.id}',event)">${t.done?'✓':''}</div>
        <div class="task-cat-dot" style="background:${cat.color}"></div>
        <div class="task-info">
          <div class="task-name ${nc}">${escHtml(t.name)}</div>
          <div class="task-meta">
            <span>${dt}</span>
            ${t.recurring?'<span>🔄</span>':''}
            ${t.paused?'<span style="color:#e67e22">⏸</span>':''}
            ${mem?`<span class="task-member-badge" style="background:${mem.color}">${escHtml(mem.name)}</span>`:''}
            ${costInfo}
            ${modInfo}
          </div>
        </div>
      </div>
      <div class="task-timeline">
        ${Array.from({length:12},()=>'<div class="month-cell"></div>').join('')}
        <div class="task-bar ${bc}" style="left:${lp}%;width:${wp}%;background:${cat.color}">${bl}</div>
      </div>
    </div>`;
  }).join('');
  updateTodayLine(total);
}

function updateTodayLine(total){
  const w=document.getElementById('ganttBodyWrapper');
  let l=w.querySelector('.today-line-global');if(l)l.remove();
  if(!total)return;
  const today=new Date();if(today.getFullYear()!==currentYear)return;
  const doy=dayOfYear(today.toISOString().split('T')[0]);
  const pct=((doy-0.5)/total)*100;
  l=document.createElement('div');l.className='today-line-global';
  l.style.left=`calc(300px + (100% - 300px) * ${pct/100})`;
  w.appendChild(l);
}

function renderLegend(){
  document.getElementById('legend').innerHTML=Object.entries(CATEGORIES).map(([k,c])=>
    `<div class="legend-item" onclick="toggleFilter('${k}')"><div class="legend-dot" style="background:${c.color}"></div>${c.name}</div>`
  ).join('');
}

function renderFilters(){
  const cs=document.getElementById('filterCategory'),cv=cs.value;
  cs.innerHTML='<option value="all">すべて</option>'+Object.entries(CATEGORIES).map(([k,c])=>`<option value="${k}">${c.name}</option>`).join('');cs.value=cv;
  const ms=document.getElementById('filterMember'),mv=ms.value;
  ms.innerHTML='<option value="all">全員</option>'+members.map(m=>`<option value="${m.id}">${escHtml(m.name)}</option>`).join('');ms.value=mv;
}

function toggleFilter(cat){const s=document.getElementById('filterCategory');s.value=s.value===cat?'all':cat;render()}

// ===== Mascot =====
function renderMascot(){
  const todayStr=new Date().toISOString().split('T')[0];
  const vis=getVisibleTasks();
  let done=0,remain=0,overdue=0;
  vis.forEach(t=>{if(t.paused)return;if(t.done){done++;return}if(t.displayEnd<todayStr)overdue++;else remain++});
  const total=done+remain+overdue,rate=total>0?done/total:1,overdueRate=total>0?overdue/total:0;
  document.getElementById('statDone').textContent=done;
  document.getElementById('statRemain').textContent=remain;
  document.getElementById('statOverdue').textContent=overdue;
  const hearts=5;let filled=Math.round((1-overdueRate)*hearts);
  if(overdue>0&&filled===hearts)filled=hearts-1;filled=Math.max(0,Math.min(hearts,filled));
  document.getElementById('heartsRow').innerHTML=Array.from({length:hearts},(_,i)=>`<span class="heart ${i<filled?'':'empty'}">❤️</span>`).join('');
  document.getElementById('deco1').classList.toggle('visible',rate>0.3);
  document.getElementById('deco2').classList.toggle('visible',rate>0.6);
  document.getElementById('deco3').classList.toggle('visible',rate>0.85);
  const scene=document.getElementById('mascotArea');scene.className='mascot-area';
  if(localStorage.getItem('fs-mascot-collapsed')==='true') scene.classList.add('collapsed');
  let state,msg,sub;
  if(!total){state='good';msg='スケちゃんが待ってるよ！';sub='タスクを追加してみよう'}
  else if(overdueRate===0&&rate>=0.8){state='great';msg='すごい！みんな最高だよ！';sub='スケちゃんがとっても嬉しそう'}
  else if(overdueRate===0){state='good';msg='いい調子だね！';sub='この調子でがんばろう'}
  else if(overdueRate<0.2){state='ok';msg='ちょっと忘れてることがあるかも？';sub=`期限切れが${overdue}件あるよ`}
  else if(overdueRate<0.5){state='sad';msg='スケちゃんが心配してるよ...';sub=`期限切れが${overdue}件...確認してね`}
  else{state='bad';msg='スケちゃんが元気ないよ...';sub='タスクを片付けて元気にしてあげよう！'}
  scene.classList.add(`mascot-state-${state}`);
  document.getElementById('mascotMessage').textContent=msg;
  document.getElementById('mascotSub').textContent=sub;
}

// ===== Sidebar Mascot =====
function renderSidebarMascot() {
  const todayStr = new Date().toISOString().split('T')[0];
  const vis = getVisibleTasks();
  let done=0, overdue=0;
  vis.forEach(t => { if(t.paused) return; if(t.done) done++; else if(t.displayEnd<todayStr) overdue++; });
  const total = vis.filter(t=>!t.paused).length;
  const overdueRate = total > 0 ? overdue/total : 0;
  const hearts = 5;
  let filled = Math.round((1-overdueRate)*hearts);
  if(overdue>0 && filled===hearts) filled = hearts-1;
  filled = Math.max(0, Math.min(hearts, filled));

  const heartsRow = document.querySelector('.sidebar-mascot-info .hearts-row');
  if (heartsRow) {
    heartsRow.innerHTML = Array.from({length:hearts},(_,i)=>`<span class="heart ${i<filled?'':'empty'}">❤️</span>`).join('');
  }

  let msg = 'スケちゃん';
  if (!total) msg = 'タスクを追加してね';
  else if (overdueRate === 0 && done/total >= 0.8) msg = 'すごい！最高！';
  else if (overdueRate === 0) msg = 'いい調子！';
  else if (overdueRate < 0.3) msg = 'ちょっと確認してね';
  else msg = '元気にしてあげて...';

  const msgEl = document.getElementById('mascotMessageMini');
  if (msgEl) msgEl.textContent = msg;

  // Apply mascot state class to body for sidebar mascot coloring
  const scene = document.getElementById('mascotArea');
  if (scene) {
    const stateClass = Array.from(scene.classList).find(c => c.startsWith('mascot-state-'));
    const sidebarMascot = document.getElementById('sidebarMascot');
    if (sidebarMascot && stateClass) {
      sidebarMascot.className = 'sidebar-mascot';
      // We apply it to the parent that contains the mini mascot
      const parent = sidebarMascot.closest('.sidebar');
      if (parent) {
        parent.classList.remove('mascot-state-great','mascot-state-good','mascot-state-ok','mascot-state-sad','mascot-state-bad');
        parent.classList.add(stateClass);
      }
    }
  }
}

// ===== Feature 6: Points Display in Mascot Area =====
function renderPointsDisplay() {
  const container = document.getElementById('pointsDisplay');
  if (!container) return;
  if (!members.length) { container.innerHTML = ''; return; }

  const items = members.map(m => {
    const pts = getMemberPoints(m.id);
    return `<span class="points-badge" style="border-left:3px solid ${m.color}">
      ${escHtml(m.name)}: ${pts}pt
    </span>`;
  }).join('');
  container.innerHTML = items;
}

// ===== Task Modal =====
function openTaskModal(id){
  editingId=id||null;
  document.getElementById('taskCategory').innerHTML=Object.entries(CATEGORIES).map(([k,c])=>`<option value="${k}">${c.icon} ${c.name}</option>`).join('');
  document.getElementById('taskMember').innerHTML='<option value="">未定</option>'+members.map(m=>`<option value="${m.id}">${escHtml(m.name)}</option>`).join('');

  // Feature 4: Populate appliance dropdown
  const appSelect = document.getElementById('taskAppliance');
  appSelect.innerHTML = '<option value="">なし</option>' + appliances.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('');

  document.getElementById('taskForm').reset();
  document.getElementById('taskPaused').checked=false;
  const modInfo=document.getElementById('taskModifiedInfo');
  modInfo.style.display='none';

  // Feature 5: Clear comments
  const commentsList = document.getElementById('taskCommentsList');
  commentsList.innerHTML = '';
  document.getElementById('taskCommentInput').value = '';
  document.getElementById('commentsSection').style.display = editingId ? 'block' : 'none';

  if(editingId){
    const t=tasks.find(x=>x.id===editingId);if(!t)return;
    document.getElementById('taskModalTitle').textContent='スケジュール編集';
    document.getElementById('taskName').value=t.name;
    document.getElementById('taskCategory').value=t.category;
    document.getElementById('taskMember').value=t.member||'';
    document.getElementById('taskStart').value=t.start;
    document.getElementById('taskEnd').value=t.end;
    document.getElementById('taskRecurring').checked=t.recurring;
    document.getElementById('taskPaused').checked=!!t.paused;
    document.getElementById('taskMemo').value=t.memo||'';
    document.getElementById('taskCost').value=t.cost||'';
    document.getElementById('taskShoppingItems').value=t.shoppingItems||'';
    document.getElementById('taskAppliance').value=t.applianceId||'';
    document.getElementById('btnDelete').style.display='inline-block';
    document.getElementById('btnDuplicate').style.display='inline-block';
    if(t.modifiedBy){
      modInfo.style.display='block';
      modInfo.textContent=`最終更新: ${t.modifiedBy}${t.modifiedAt?' ('+relativeTime(t.modifiedAt)+')':''}`;
    }
    // Feature 5: Render comments
    renderTaskComments(t);
  } else {
    document.getElementById('taskModalTitle').textContent='スケジュール追加';
    const td=new Date().toISOString().split('T')[0];
    document.getElementById('taskStart').value=td;document.getElementById('taskEnd').value=td;
    document.getElementById('btnDelete').style.display='none';
    document.getElementById('btnDuplicate').style.display='none';
  }
  document.getElementById('taskModalOverlay').classList.add('active');
  setTimeout(()=>document.getElementById('taskName').focus(),100);
}
function closeTaskModal(){document.getElementById('taskModalOverlay').classList.remove('active');editingId=null}

// Feature 5: Comments
function renderTaskComments(task) {
  const list = document.getElementById('taskCommentsList');
  const comments = task.comments || [];
  if (!comments.length) {
    list.innerHTML = '<p style="font-size:0.7rem;color:var(--text-light);text-align:center;padding:8px">コメントはまだありません</p>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <span class="comment-author">${escHtml(c.author)}</span>
      <span class="comment-time">${relativeTime(c.timestamp)}</span>
      <div class="comment-text">${escHtml(c.text)}</div>
    </div>
  `).join('');
  list.scrollTop = list.scrollHeight;
}

function addTaskComment() {
  if (!editingId) return;
  const input = document.getElementById('taskCommentInput');
  const text = input.value.trim();
  if (!text) return;

  const task = tasks.find(t => t.id === editingId);
  if (!task) return;

  if (!task.comments) task.comments = [];
  task.comments.push({
    text,
    author: currentUserName,
    timestamp: new Date().toISOString()
  });

  DL.saveTask(task, false);
  renderTaskComments(task);
  input.value = '';
}

function saveTask(e){
  e.preventDefault();
  const name=document.getElementById('taskName').value.trim();
  const category=document.getElementById('taskCategory').value;
  const member=document.getElementById('taskMember').value;
  const start=document.getElementById('taskStart').value;
  const end=document.getElementById('taskEnd').value;
  const recurring=document.getElementById('taskRecurring').checked;
  const paused=document.getElementById('taskPaused').checked;
  const memo=document.getElementById('taskMemo').value.trim();
  const cost=parseInt(document.getElementById('taskCost').value)||0;
  const shoppingItems=document.getElementById('taskShoppingItems').value.trim();
  const applianceId=document.getElementById('taskAppliance').value;
  if(!name||!start||!end)return;
  if(new Date(end)<new Date(start)){alert('終了日は開始日以降にしてください');return}

  const isNew=!editingId;
  const existingTask = editingId ? tasks.find(t=>t.id===editingId) : null;
  const task = editingId
    ? {...existingTask,name,category,member,start,end,recurring,paused,memo,cost,shoppingItems,applianceId}
    : {id:genId(),name,category,member,start,end,recurring,paused,memo,cost,shoppingItems,applianceId,comments:[]};

  // Feature 2: Auto-add shopping items from task
  if (shoppingItems) {
    const items = shoppingItems.split(/[,、\n]/).map(s=>s.trim()).filter(Boolean);
    items.forEach(itemName => {
      if (!shoppingList.find(si => si.name === itemName && si.linkedTaskId === task.id)) {
        shoppingList.push({
          id: genId(), name: itemName, checked: false,
          addedBy: currentUserName, linkedTaskId: task.id
        });
      }
    });
    DL.saveShopping();
  }

  if (!fbMode) {
    const idx=tasks.findIndex(t=>t.id===task.id);
    if(idx>=0)tasks[idx]=task;else tasks.push(task);
  }
  DL.saveTask(task, isNew);
  closeTaskModal();
  if(!fbMode)render();
}

let deletedTaskBackup=null;
let deleteUndoTimer=null;

function deleteTask(){
  if(!editingId)return;
  const t=tasks.find(x=>x.id===editingId);
  if(!t)return;
  const taskCopy={...t};
  const taskId=editingId;
  const compBackup={};
  Object.keys(completions).forEach(k=>{if(k.startsWith(taskId))compBackup[k]=completions[k]});

  if(!fbMode){tasks=tasks.filter(x=>x.id!==taskId);Object.keys(compBackup).forEach(k=>delete completions[k])}
  DL.deleteTask(taskId,taskCopy.name);
  closeTaskModal();
  if(!fbMode)render();

  deletedTaskBackup={task:taskCopy,completions:compBackup};
  showUndoToast(taskCopy.name);
}

function showUndoToast(name){
  if(deleteUndoTimer)clearTimeout(deleteUndoTimer);
  const container=document.getElementById('toastContainer');
  container.innerHTML=`<div class="toast"><span>「${escHtml(name)}」を削除しました</span><button class="toast-undo" onclick="undoDelete()">元に戻す</button></div>`;
  deleteUndoTimer=setTimeout(()=>{container.innerHTML='';deletedTaskBackup=null;deleteUndoTimer=null},5000);
}

function undoDelete(){
  if(!deletedTaskBackup)return;
  if(deleteUndoTimer){clearTimeout(deleteUndoTimer);deleteUndoTimer=null}
  const {task,completions:comp}=deletedTaskBackup;
  if(!fbMode){tasks.push(task);Object.assign(completions,comp)}
  DL.saveTask(task,true);
  Object.entries(comp).forEach(([k,v])=>{
    completions[k]=v;
    const parts=k.split('-');
    if(parts.length>=2){
      const yr=parseInt(parts[parts.length-1]);
      if(!isNaN(yr))DL.toggleCompletion(task.id,yr,v);
    }
  });
  deletedTaskBackup=null;
  document.getElementById('toastContainer').innerHTML='';
  if(!fbMode)render();
}

function duplicateTask(){
  if(!editingId)return;
  const t=tasks.find(x=>x.id===editingId);
  if(!t)return;
  const newTask={...t,id:genId(),name:t.name+' (コピー)',comments:[]};
  if(!fbMode)tasks.push(newTask);
  DL.saveTask(newTask,true);
  closeTaskModal();
  if(!fbMode)render();
}

// ===== Member Modal =====
function openMemberModal() { navigateTo('members'); }
function closeMemberModal() { navigateTo('schedule'); render(); }

function renderMemberList(){
  // Render in the view-based member list
  renderMemberView();
}

function addMember(){
  const name=document.getElementById('newMemberName').value.trim();
  const color=document.getElementById('newMemberColor').value;
  if(!name)return;
  const member={id:genId(),name,color};
  if(!fbMode)members.push(member);
  DL.addMember(member);
  document.getElementById('newMemberName').value='';
  document.getElementById('newMemberColor').value=MEMBER_COLORS[members.length%MEMBER_COLORS.length];
  if(!fbMode)renderMemberView();
  else setTimeout(renderMemberView,500);
}

function removeMember(id){
  if(!confirm('このメンバーを削除しますか？'))return;
  if(!fbMode){members=members.filter(m=>m.id!==id);tasks.forEach(t=>{if(t.member===id)t.member=''})}
  DL.removeMember(id);
  if(!fbMode)renderMemberView();
  else setTimeout(renderMemberView,500);
}

// ===== Template Modal =====
const TEMPLATES={
  '掃除':[{name:'大掃除',cat:'cleaning',s:'12-27',e:'12-30',memo:'年末の大掃除'},{name:'換気扇掃除',cat:'cleaning',s:'06-01',e:'06-01',memo:''},{name:'窓拭き',cat:'cleaning',s:'03-15',e:'03-15',memo:''},{name:'排水口掃除',cat:'cleaning',s:'03-01',e:'03-01',memo:''},{name:'カーテン洗濯',cat:'cleaning',s:'10-01',e:'10-01',memo:''}],
  '害虫対策':[{name:'ゴキブリ駆除剤セット',cat:'pest',s:'02-02',e:'02-02',memo:'各部屋にブラックキャップ設置'},{name:'ダニ対策（布団乾燥）',cat:'pest',s:'06-01',e:'06-01',memo:''},{name:'蚊取り対策スタート',cat:'pest',s:'05-15',e:'05-15',memo:''},{name:'防虫剤交換（衣類）',cat:'pest',s:'04-01',e:'04-01',memo:''}],
  'メンテナンス':[{name:'エアコンフィルター掃除（春）',cat:'maintenance',s:'05-15',e:'05-15',memo:''},{name:'エアコンフィルター掃除（秋）',cat:'maintenance',s:'10-01',e:'10-01',memo:''},{name:'防災用品チェック',cat:'maintenance',s:'09-01',e:'09-01',memo:'防災の日'},{name:'火災報知器点検',cat:'maintenance',s:'11-01',e:'11-01',memo:''},{name:'浄水器カートリッジ交換',cat:'maintenance',s:'06-01',e:'06-01',memo:''}],
  '季節行事':[{name:'お正月準備',cat:'seasonal',s:'12-25',e:'12-31',memo:'おせち注文・飾り付け'},{name:'衣替え（春）',cat:'seasonal',s:'04-01',e:'04-07',memo:''},{name:'衣替え（秋）',cat:'seasonal',s:'10-01',e:'10-07',memo:''},{name:'年賀状準備',cat:'seasonal',s:'12-01',e:'12-20',memo:''}],
  '庭・植物':[{name:'庭の草むしり期間',cat:'garden',s:'04-01',e:'09-30',memo:'月1回程度'},{name:'庭木の剪定',cat:'garden',s:'02-01',e:'02-28',memo:''},{name:'肥料やり',cat:'garden',s:'03-15',e:'03-15',memo:''}],
  '健康':[{name:'健康診断',cat:'health',s:'06-10',e:'06-10',memo:''},{name:'歯科検診',cat:'health',s:'04-01',e:'04-01',memo:''},{name:'インフルエンザ予防接種',cat:'health',s:'10-15',e:'10-15',memo:''}],
  'ペット':[{name:'予防接種',cat:'pet',s:'04-01',e:'04-01',memo:''},{name:'フィラリア予防開始',cat:'pet',s:'05-01',e:'05-01',memo:''},{name:'ノミ・ダニ対策',cat:'pet',s:'04-01',e:'10-31',memo:''}]
};

function openTemplateModal(){
  const existNames=new Set(tasks.map(t=>t.name));
  document.getElementById('templateList').innerHTML=Object.entries(TEMPLATES).map(([g,items])=>
    `<div class="template-group"><h4>${g}</h4>${items.map(item=>{
      const added=existNames.has(item.name);
      return`<div class="template-item"><div class="template-item-info"><div class="legend-dot" style="background:${(CATEGORIES[item.cat]||CATEGORIES.other).color}"></div><span>${escHtml(item.name)}</span><span style="font-size:0.6rem;color:#aaa">${item.s} 〜 ${item.e}</span></div><button class="template-item-add ${added?'added':''}" ${added?'disabled':''} onclick="addFromTemplate(this,'${escHtml(item.name)}','${item.cat}','${item.s}','${item.e}','${escHtml(item.memo||'')}')">${added?'追加済':'+ 追加'}</button></div>`;
    }).join('')}</div>`
  ).join('');
  document.getElementById('templateModalOverlay').classList.add('active');
}
function closeTemplateModal(){document.getElementById('templateModalOverlay').classList.remove('active');render()}

function addFromTemplate(btn,name,cat,s,e,memo){
  const y=currentYear;
  const task={id:genId(),name,category:cat,start:`${y}-${s}`,end:`${y}-${e}`,recurring:true,paused:false,member:'',memo,cost:0,shoppingItems:'',applianceId:'',comments:[]};
  if(!fbMode)tasks.push(task);
  DL.saveTask(task,true);
  btn.textContent='追加済';btn.classList.add('added');btn.disabled=true;
}

// ===== Activity Modal =====
function openActivityModal() { navigateTo('activity'); }
function closeActivityModal() { navigateTo('schedule'); }

function renderActivityList(){
  // Now delegates to the view render
  renderActivityView();
}

// ===== Data Modal =====
function openDataModal() { navigateTo('settings'); }
function closeDataModal() { navigateTo('schedule'); }

function exportData(){
  const data={tasks,members,completions,activityLog,shoppingList,appliances,stockItems,rewards,pointsHistory,exportDate:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`family-schedule-${new Date().toISOString().split('T')[0]}.json`;
  a.click();URL.revokeObjectURL(a.href);
}

function importData(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=function(ev){
    try{
      const data=JSON.parse(ev.target.result);
      if(!data.tasks||!Array.isArray(data.tasks))throw new Error('Invalid');
      if(!confirm(`${data.tasks.length}件のタスクをインポートします。よろしいですか？`))return;
      tasks=data.tasks;members=data.members||[];completions=data.completions||{};
      activityLog=data.activityLog||[];
      if(data.shoppingList) shoppingList=data.shoppingList;
      if(data.appliances) appliances=data.appliances;
      if(data.stockItems) stockItems=data.stockItems;
      if(data.rewards) rewards=data.rewards;
      if(data.pointsHistory) pointsHistory=data.pointsHistory;
      if(fbMode&&db&&roomCode){
        const roomRef=db.collection('familyRooms').doc(roomCode);
        const batch=db.batch();
        tasks.forEach(t=>batch.set(roomRef.collection('tasks').doc(t.id),{...t,modifiedAt:firebase.firestore.FieldValue.serverTimestamp(),modifiedBy:currentUserName}));
        members.forEach(m=>batch.set(roomRef.collection('members').doc(m.id),m));
        Object.entries(completions).forEach(([k,v])=>batch.set(roomRef.collection('completions').doc(k),{done:v,modifiedBy:currentUserName,modifiedAt:firebase.firestore.FieldValue.serverTimestamp()}));
        batch.commit().then(()=>alert('インポート完了！'));
      } else {
        DL.saveLocal();
        localStorage.setItem('fs-shopping', JSON.stringify(shoppingList));
        localStorage.setItem('fs-appliances', JSON.stringify(appliances));
        localStorage.setItem('fs-stock', JSON.stringify(stockItems));
        localStorage.setItem('fs-rewards', JSON.stringify(rewards));
        localStorage.setItem('fs-points', JSON.stringify(pointsHistory));
        render();closeDataModal();alert('インポート完了！');
      }
    }catch(err){alert('ファイルの読み込みに失敗しました')}
  };
  reader.readAsText(file);e.target.value='';
}

// Drop zone
document.addEventListener('DOMContentLoaded', () => {
  const dz=document.getElementById('dropZone');
  if(dz){
    dz.addEventListener('dragover',e=>{e.preventDefault();dz.style.borderColor='var(--accent)'});
    dz.addEventListener('dragleave',()=>{dz.style.borderColor=''});
    dz.addEventListener('drop',e=>{e.preventDefault();dz.style.borderColor='';if(e.dataTransfer.files[0]){document.getElementById('fileInput').files=e.dataTransfer.files;importData({target:document.getElementById('fileInput')})}});
  }
});

// ===== Reminders =====
function toggleReminders(){
  if(!reminderEnabled){
    if('Notification'in window){
      Notification.requestPermission().then(p=>{
        if(p==='granted'){reminderEnabled=true;localStorage.setItem('fs-reminders','true');checkReminders();document.getElementById('btnReminder').textContent='通知をオフにする';alert('通知をオンにしました')}
        else alert('通知の許可が必要です');
      });
    }else alert('このブラウザは通知に対応していません');
  }else{reminderEnabled=false;localStorage.setItem('fs-reminders','false');document.getElementById('btnReminder').textContent='通知をオンにする';alert('通知をオフにしました')}
}

function checkReminders(){
  if(!reminderEnabled||!('Notification'in window)||Notification.permission!=='granted')return;
  const today=new Date().toISOString().split('T')[0];
  const tmrw=new Date(new Date().getTime()+864e5).toISOString().split('T')[0];
  getVisibleTasks().filter(t=>!t.done&&!t.paused&&(t.displayStart===today||t.displayStart===tmrw)).forEach(t=>{
    new Notification(`📋 ${t.displayStart===today?'今日':'明日'}のタスク`,{body:t.name,tag:t.id});
  });
}
setTimeout(checkReminders,2000);setInterval(checkReminders,3600000);

// ===== Month Zoom =====
function openMonthZoom(mi){
  const zoom=document.getElementById('monthZoom');
  const days=daysInMonth(currentYear,mi);
  const vis=getVisibleTasks().filter(t=>{
    const s=new Date(t.displayStart),e=new Date(t.displayEnd);
    return s<=new Date(currentYear,mi,days)&&e>=new Date(currentYear,mi,1);
  });
  const todayStr=new Date().toISOString().split('T')[0];
  const dayNames=['日','月','火','水','木','金','土'];
  const dh=Array.from({length:days},(_,i)=>{
    const d=new Date(currentYear,mi,i+1);const dow=d.getDay();
    return`<div class="zoom-day-col ${dow===0||dow===6?'weekend':''} ${d.toISOString().split('T')[0]===todayStr?'today':''}">${i+1}<br><span style="font-size:0.45rem">${dayNames[dow]}</span></div>`;
  }).join('');
  const tr=vis.map(t=>{
    const cat=CATEGORIES[t.category]||CATEGORIES.other;
    const s=new Date(t.displayStart),e=new Date(t.displayEnd);
    const sd=Math.max(1,s.getMonth()===mi?s.getDate():1);
    const ed=Math.min(days,e.getMonth()===mi?e.getDate():days);
    const lp=((sd-1)/days)*100,wp=((ed-sd+1)/days)*100;
    const dc=Array.from({length:days},(_,i)=>{const d=new Date(currentYear,mi,i+1);return`<div class="zoom-day-cell ${d.getDay()===0||d.getDay()===6?'weekend':''}"></div>`}).join('');
    return`<div class="zoom-task-row"><div class="zoom-task-label"><div class="legend-dot" style="background:${cat.color}"></div><span>${escHtml(t.name)}</span></div><div class="zoom-task-timeline" style="grid-template-columns:repeat(${days},1fr)">${dc}<div class="zoom-bar" style="left:${lp}%;width:${wp}%;background:${cat.color}"></div></div></div>`;
  }).join('');
  zoom.innerHTML=`<div class="month-zoom-header"><h3>${currentYear}年 ${MONTHS[mi]}</h3><button class="month-zoom-close" onclick="closeMonthZoom()">✕</button></div>
    <div class="zoom-task-row" style="border-bottom:2px solid var(--border)"><div class="zoom-task-label" style="font-weight:600;font-size:0.65rem;color:var(--text-light)">タスク</div><div style="display:grid;grid-template-columns:repeat(${days},1fr)">${dh}</div></div>
    ${tr||'<div style="padding:20px;text-align:center;color:var(--text-light);font-size:0.8rem">この月にタスクはありません</div>'}`;
  zoom.classList.add('active');zoom.scrollIntoView({behavior:'smooth',block:'start'});
}
function closeMonthZoom(){document.getElementById('monthZoom').classList.remove('active')}

// ===== Wizard =====
let wizardStep=0;const WIZARD_STEPS=5;
function openWizard(){wizardStep=0;wizardAnswers={};updateWizardUI();document.getElementById('wizardOverlay').classList.add('active')}
function updateWizardUI(){
  document.querySelectorAll('.wizard-step').forEach(s=>s.classList.remove('active'));
  const step=document.querySelector(`.wizard-step[data-step="${wizardStep}"]`);if(step)step.classList.add('active');
  document.getElementById('wizardProgress').innerHTML=Array.from({length:WIZARD_STEPS},(_,i)=>`<div class="wizard-dot ${i<=wizardStep?'active':''}"></div>`).join('');
  document.getElementById('wizBtnBack').style.display=wizardStep>0?'inline-block':'none';
  document.getElementById('wizBtnNext').textContent=wizardStep===WIZARD_STEPS-1?'完了！':'次へ';
  if(wizardStep===4)buildWizardSuggestions();
}
function wizardSelect(el){wizardAnswers[el.dataset.key]=el.dataset.val;el.parentElement.querySelectorAll('.wizard-opt').forEach(o=>o.classList.remove('selected'));el.classList.add('selected')}
function wizardNext(){
  if(wizardStep<WIZARD_STEPS-1){
    if(wizardStep===3){
      document.querySelectorAll('.wiz-member-input').forEach((n,i)=>{
        const name=n.value.trim();
        if(name){const color=document.querySelectorAll('.wiz-member-color')[i].value;const member={id:genId(),name,color};members.push(member);DL.addMember(member)}
      });
    }
    wizardStep++;updateWizardUI();
  }else{
    document.querySelectorAll('#wizardSuggestions input[type="checkbox"]:checked').forEach(cb=>{
      const d=JSON.parse(cb.dataset.task);const y=currentYear;
      const task={id:genId(),name:d.name,category:d.cat,start:`${y}-${d.s}`,end:`${y}-${d.e}`,recurring:true,paused:false,member:'',memo:d.memo||'',cost:0,shoppingItems:'',applianceId:'',comments:[]};
      tasks.push(task);DL.saveTask(task,true);
    });
    localStorage.setItem('fs-wizard-done','true');DL.saveLocal();
    document.getElementById('wizardOverlay').classList.remove('active');render();
    // Auto-select user after wizard
    setTimeout(promptWhoAreYou, 500);
  }
}
function wizardBack(){if(wizardStep>0){wizardStep--;updateWizardUI()}}
function buildWizardSuggestions(){
  let suggested=[...TEMPLATES['掃除'],...TEMPLATES['メンテナンス'],...TEMPLATES['季節行事'],...TEMPLATES['健康'],...TEMPLATES['害虫対策']];
  if(wizardAnswers.garden==='yes')suggested.push(...TEMPLATES['庭・植物']);
  if(wizardAnswers.pet==='yes')suggested.push(...TEMPLATES['ペット']);
  document.getElementById('wizardSuggestions').innerHTML=suggested.map(item=>
    `<label style="display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:6px;margin-bottom:2px;cursor:pointer;font-size:0.75rem"><input type="checkbox" checked data-task='${JSON.stringify(item).replace(/'/g,"\\'")}'>
    <div class="legend-dot" style="background:${(CATEGORIES[item.cat]||CATEGORIES.other).color};flex-shrink:0"></div><span>${escHtml(item.name)}</span><span style="font-size:0.55rem;color:#aaa;margin-left:auto">${item.s}</span></label>`
  ).join('');
}

// ===== Menu Dropdown (legacy stubs) =====
function toggleMenuDropdown(e){ if(e) e.stopPropagation(); }
function closeMenuDropdown(){}

// ===== Mascot Collapse =====
function toggleMascotCollapse(){
  const area=document.getElementById('mascotArea');
  const btn=document.getElementById('mascotToggle');
  const collapsed=!area.classList.contains('collapsed');
  area.classList.toggle('collapsed',collapsed);
  btn.innerHTML=collapsed?'&#9650;':'&#9660;';
  localStorage.setItem('fs-mascot-collapsed',collapsed?'true':'false');
}
function initMascotCollapse(){
  if(localStorage.getItem('fs-mascot-collapsed')==='true'){
    document.getElementById('mascotArea').classList.add('collapsed');
    document.getElementById('mascotToggle').innerHTML='&#9650;';
  }
}

// ===== Dark Mode =====
function toggleDarkMode(){
  const isDark=document.body.classList.toggle('dark');
  localStorage.setItem('fs-dark-mode',isDark?'true':'false');
  updateDarkModeLabel();
}
function updateDarkModeLabel(){
  const el=document.getElementById('darkModeMenuItem');
  if(el){
    const isDark=document.body.classList.contains('dark');
    el.innerHTML=isDark?'&#9728;&#65039; ライトモード':'&#127769; ダークモード';
  }
  const btn=document.getElementById('darkModeBtn');
  if(btn){
    const isDark=document.body.classList.contains('dark');
    btn.textContent=isDark?'☀️ ライトモード':'🌙 ダークモード';
  }
}
function initDarkMode(){
  if(localStorage.getItem('fs-dark-mode')==='true'){
    document.body.classList.add('dark');
  }
  updateDarkModeLabel();
}

// ===== Upcoming Tasks =====
let upcomingDays=7;
function renderUpcoming() {
  // Old function - now handled by renderUpcomingView in the view system
  if (currentView === 'upcoming') renderUpcomingView();
}
function toggleUpcomingRange(){upcomingDays=upcomingDays===7?30:7;if(currentView==='upcoming')renderUpcomingView()}

// ===== Feature 8: Weather Integration =====
function getWeatherIcon(code) {
  if (code <= 1) return '☀️';
  if (code <= 3) return '🌤️';
  if (code <= 48) return '☁️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '❄️';
  return '⛈️';
}

function isOutdoorTask(task) {
  return ['garden'].includes(task.category) ||
    (task.category === 'cleaning' && /窓|外|ベランダ|庭/.test(task.name)) ||
    (task.category === 'maintenance' && /外|屋根|庭|ベランダ/.test(task.name));
}

function getWeatherForTask(task) {
  if (!isOutdoorTask(task) || !weatherData) return '';
  const dateStr = task.displayStart;
  const idx = weatherData.daily.time.indexOf(dateStr);
  if (idx < 0) return '';
  const code = weatherData.daily.weather_code[idx];
  const temp = weatherData.daily.temperature_2m_max[idx];
  const icon = getWeatherIcon(code);
  return `<span class="upcoming-weather">${icon} ${temp}°</span>`;
}

async function fetchWeather() {
  const cached = sessionStorage.getItem('fs-weather-cache');
  if (cached) {
    try {
      weatherData = JSON.parse(cached);
      return;
    } catch(e) {}
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${weatherSettings.lat}&longitude=${weatherSettings.lon}&daily=weather_code,temperature_2m_max&timezone=Asia/Tokyo&forecast_days=7`;
    const res = await fetch(url);
    if (res.ok) {
      weatherData = await res.json();
      sessionStorage.setItem('fs-weather-cache', JSON.stringify(weatherData));
      renderUpcoming();
    }
  } catch(e) {
    console.log('Weather fetch failed:', e);
  }
}

// ===== Mobile Card View =====
function renderMobileCards(){
  const container=document.getElementById('mobileCardView');
  if(!container)return;
  const vis=getVisibleTasks();
  if(!vis.length){
    container.innerHTML=`<div style="text-align:center;padding:30px 20px;color:var(--text-light)"><p style="font-size:0.85rem">スケジュールがまだありません</p></div>`;
    return;
  }
  container.innerHTML=`<div class="mobile-filter-bar">
    <select onchange="document.getElementById('filterCategory').value=this.value;render()">
      <option value="all">すべて</option>${Object.entries(CATEGORIES).map(([k,c])=>`<option value="${k}" ${document.getElementById('filterCategory').value===k?'selected':''}>${c.name}</option>`).join('')}
    </select>
    <select onchange="document.getElementById('filterMember').value=this.value;render()">
      <option value="all">全員</option>${members.map(m=>`<option value="${m.id}" ${document.getElementById('filterMember').value===m.id?'selected':''}>${escHtml(m.name)}</option>`).join('')}
    </select>
    <input type="text" class="filter-search" placeholder="検索..." value="${escHtml(document.getElementById('filterSearch')?document.getElementById('filterSearch').value:'')}" oninput="if(document.getElementById('filterSearch'))document.getElementById('filterSearch').value=this.value;render()">
    <span style="margin-left:auto;font-size:0.7rem;color:var(--text-light)">${vis.length}件</span>
  </div>`+vis.map(t=>{
    const cat=CATEGORIES[t.category]||CATEGORIES.other;
    const mem=t.member?getMemberById(t.member):null;
    const sD=new Date(t.displayStart),eD=new Date(t.displayEnd);
    const dt=t.displayStart===t.displayEnd?`${sD.getMonth()+1}/${sD.getDate()}`:`${sD.getMonth()+1}/${sD.getDate()} - ${eD.getMonth()+1}/${eD.getDate()}`;
    return`<div class="mobile-card" onclick="openTaskModal('${t.id}')">
      <div class="mc-check ${t.done?'checked':''}" onclick="event.stopPropagation();toggleDone('${t.id}',event)">${t.done?'&#10003;':''}</div>
      <div class="mc-cat-dot" style="background:${cat.color}"></div>
      <div class="mc-info">
        <div class="mc-name ${t.done?'done-text':''}">${escHtml(t.name)}</div>
        <div class="mc-meta">
          <span>${dt}</span>
          ${t.recurring?'<span>&#128260;</span>':''}
          ${mem?`<span class="mc-member" style="background:${mem.color}">${escHtml(mem.name)}</span>`:''}
          ${t.cost?`<span style="color:#e65100">${formatYen(t.cost)}</span>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ===================================================================
// FEATURE 1: Cost Tracking
// ===================================================================
function openCostModal() { navigateTo('cost'); }
function closeCostModal() { navigateTo('schedule'); }

function renderCostContent(container) {
  if (!container) container = document.getElementById('costViewContent');
  if (!container) return;
  const vis = getVisibleTasks();
  const costTasks = vis.filter(t => t.cost > 0);

  // Category breakdown
  const catCosts = {};
  costTasks.forEach(t => {
    catCosts[t.category] = (catCosts[t.category] || 0) + t.cost;
  });
  const maxCost = Math.max(...Object.values(catCosts), 1);
  const totalCost = costTasks.reduce((s, t) => s + t.cost, 0);

  let chartHtml = '<h3 style="font-size:0.85rem;margin-bottom:8px">カテゴリ別コスト</h3><div class="cost-chart">';
  Object.entries(catCosts).sort((a,b) => b[1]-a[1]).forEach(([cat, cost]) => {
    const c = CATEGORIES[cat] || CATEGORIES.other;
    const pct = (cost / maxCost) * 100;
    chartHtml += `<div class="cost-bar-row">
      <span class="cost-bar-label">${c.icon} ${c.name}</span>
      <div class="cost-bar-track"><div class="cost-bar-fill" style="width:${pct}%;background:${c.color}">${pct>20?formatYen(cost):''}</div></div>
      <span class="cost-bar-value">${formatYen(cost)}</span>
    </div>`;
  });
  chartHtml += '</div>';
  chartHtml += `<div class="cost-total">年間合計: ${formatYen(totalCost)}</div>`;

  // Year-over-year comparison
  const prevYear = currentYear - 1;
  const prevCostTasks = tasks.filter(t => {
    const sy = new Date(t.start).getFullYear();
    return (sy === prevYear || t.recurring) && t.cost > 0;
  });
  const prevTotal = prevCostTasks.reduce((s,t) => s + t.cost, 0);
  if (prevTotal > 0) {
    const diff = totalCost - prevTotal;
    const diffStr = diff >= 0 ? `+${formatYen(diff)}` : formatYen(diff);
    chartHtml += `<div style="font-size:0.7rem;color:var(--text-light);margin-top:4px">前年比: ${formatYen(prevTotal)} → ${formatYen(totalCost)} (${diffStr})</div>`;
  }

  // Task list
  chartHtml += '<h3 style="font-size:0.85rem;margin:12px 0 8px">タスク別コスト</h3>';
  chartHtml += '<div class="cost-task-list">';
  if (costTasks.length) {
    costTasks.sort((a,b) => b.cost - a.cost).forEach(t => {
      const c = CATEGORIES[t.category] || CATEGORIES.other;
      chartHtml += `<div class="cost-task-item"><span><span style="color:${c.color}">●</span> ${escHtml(t.name)}</span><span style="font-weight:600">${formatYen(t.cost)}</span></div>`;
    });
  } else {
    chartHtml += '<p style="font-size:0.75rem;color:var(--text-light);text-align:center;padding:12px">コスト設定されたタスクはありません</p>';
  }
  chartHtml += '</div>';

  container.innerHTML = chartHtml;
}

// ===================================================================
// FEATURE 2: Shopping List
// ===================================================================
function openShoppingModal() { navigateTo('shopping'); }
function closeShoppingModal() { navigateTo('schedule'); }

function renderShoppingList() {
  const list = document.getElementById('shoppingListContent');
  if (!list) return;
  const unchecked = shoppingList.filter(i => !i.checked);
  const checked = shoppingList.filter(i => i.checked);

  let html = '';
  if (!shoppingList.length) {
    html = '<p style="font-size:0.75rem;color:var(--text-light);text-align:center;padding:20px">リストは空です</p>';
  } else {
    [...unchecked, ...checked].forEach(item => {
      const linkedTask = item.linkedTaskId ? tasks.find(t => t.id === item.linkedTaskId) : null;
      html += `<div class="shopping-item ${item.checked?'checked-item':''}">
        <div class="shopping-check ${item.checked?'checked':''}" onclick="toggleShoppingItem('${item.id}')">${item.checked?'✓':''}</div>
        <span class="shopping-name">${escHtml(item.name)}</span>
        ${linkedTask?`<span class="shopping-meta">📋${escHtml(linkedTask.name)}</span>`:''}
        <span class="shopping-meta">${escHtml(item.addedBy||'')}</span>
        <button class="shopping-delete" onclick="deleteShoppingItem('${item.id}')">✕</button>
      </div>`;
    });
  }
  list.innerHTML = html;
}

function addShoppingItem() {
  const input = document.getElementById('shoppingNewItem');
  const name = input.value.trim();
  if (!name) return;
  shoppingList.push({ id: genId(), name, checked: false, addedBy: currentUserName, linkedTaskId: null });
  DL.saveShopping();
  input.value = '';
  renderShoppingList();
}

function toggleShoppingItem(id) {
  const item = shoppingList.find(i => i.id === id);
  if (item) { item.checked = !item.checked; DL.saveShopping(); renderShoppingList(); }
}

function deleteShoppingItem(id) {
  shoppingList = shoppingList.filter(i => i.id !== id);
  DL.saveShopping();
  renderShoppingList();
}

function clearCheckedShopping() {
  shoppingList = shoppingList.filter(i => !i.checked);
  DL.saveShopping();
  renderShoppingList();
}

// ===================================================================
// FEATURE 3: Annual Report
// ===================================================================
function openReportModal() { navigateTo('report'); }
function closeReportModal() { navigateTo('schedule'); }

function renderReport() { renderReportContent(); }
function renderReportContent(container) {
  if (!container) container = document.getElementById('reportViewContent');
  if (!container) return;
  const vis = getVisibleTasks();
  const todayStr = new Date().toISOString().split('T')[0];
  let done=0, total=0, overdue=0;
  vis.forEach(t => { if(t.paused) return; total++; if(t.done) done++; else if(t.displayEnd < todayStr) overdue++; });
  const rate = total > 0 ? Math.round((done/total)*100) : 0;

  // Circular progress
  const circumference = 2 * Math.PI * 35;
  const offset = circumference - (rate/100) * circumference;

  let html = `<div class="report-section">
    <h3>全体の達成率</h3>
    <div class="progress-circle">
      <svg viewBox="0 0 80 80"><circle class="bg" cx="40" cy="40" r="35"/><circle class="fg" cx="40" cy="40" r="35" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/></svg>
      <div class="pct-text">${rate}%</div>
    </div>
    <div style="text-align:center;font-size:0.75rem;color:var(--text-light)">完了 ${done} / 全 ${total} 件 (期限切れ ${overdue}件)</div>
  </div>`;

  // Category breakdown
  html += '<div class="report-section"><h3>カテゴリ別達成率</h3>';
  const catStats = {};
  vis.forEach(t => {
    if(t.paused) return;
    if(!catStats[t.category]) catStats[t.category] = {done:0, total:0};
    catStats[t.category].total++;
    if(t.done) catStats[t.category].done++;
  });
  Object.entries(catStats).forEach(([cat, s]) => {
    const c = CATEGORIES[cat] || CATEGORIES.other;
    const pct = s.total > 0 ? Math.round((s.done/s.total)*100) : 0;
    html += `<div class="cost-bar-row">
      <span class="cost-bar-label">${c.icon} ${c.name}</span>
      <div class="cost-bar-track"><div class="cost-bar-fill" style="width:${pct}%;background:${c.color}">${pct}%</div></div>
      <span class="cost-bar-value">${s.done}/${s.total}</span>
    </div>`;
  });
  html += '</div>';

  // Member ranking
  html += '<div class="report-section"><h3>メンバーランキング</h3>';
  const memberDone = {};
  vis.forEach(t => {
    if(!t.done || !t.member) return;
    memberDone[t.member] = (memberDone[t.member]||0) + 1;
  });
  const ranked = Object.entries(memberDone).sort((a,b) => b[1]-a[1]);
  const maxDone = ranked.length ? ranked[0][1] : 1;
  if (ranked.length) {
    ranked.forEach(([mid, cnt], i) => {
      const m = getMemberById(mid);
      if (!m) return;
      const pct = (cnt/maxDone)*100;
      html += `<div class="ranking-item">
        <span class="ranking-num">${i+1}</span>
        <div class="member-color" style="background:${m.color};width:14px;height:14px"></div>
        <span style="min-width:50px;font-size:0.7rem">${escHtml(m.name)}</span>
        <div class="ranking-bar"><div class="ranking-bar-fill" style="width:${pct}%;background:${m.color}"></div></div>
        <span class="ranking-count">${cnt}件</span>
      </div>`;
    });
  } else {
    html += '<p style="font-size:0.75rem;color:var(--text-light);text-align:center">完了タスクがありません</p>';
  }
  html += '</div>';

  // Total cost
  const totalCost = vis.filter(t=>t.cost>0).reduce((s,t)=>s+t.cost, 0);
  html += `<div class="report-section"><h3>年間コスト</h3><div style="font-size:1.1rem;font-weight:700;text-align:center">${formatYen(totalCost)}</div></div>`;

  // Previous year comparison
  const prevYear = currentYear - 1;
  const prevTasks = tasks.filter(t => {
    const sy = new Date(t.start).getFullYear();
    return sy === prevYear || (t.recurring && sy < currentYear);
  });
  if (prevTasks.length > 0) {
    let prevDone = 0;
    prevTasks.forEach(t => { if(completions[`${t.id}-${prevYear}`]) prevDone++; });
    const prevRate = prevTasks.length > 0 ? Math.round((prevDone/prevTasks.length)*100) : 0;
    html += `<div class="report-section"><h3>前年比較 (${prevYear}年)</h3>
      <div style="font-size:0.75rem;color:var(--text-light)">前年達成率: ${prevRate}% → 今年: ${rate}%</div>
      <div style="font-size:0.75rem;color:${rate>=prevRate?'#4caf50':'#f44336'};font-weight:600">${rate>=prevRate?'改善':'低下'} (${rate-prevRate>=0?'+':''}${rate-prevRate}%)</div>
    </div>`;
  }

  // Mascot message
  let mascotMsg = '';
  if (rate >= 80) mascotMsg = 'すばらしい！スケちゃんが大喜びだよ！来年もこの調子で頑張ろう！';
  else if (rate >= 60) mascotMsg = 'いい感じ！もう少しでパーフェクトだよ！';
  else if (rate >= 40) mascotMsg = 'まだまだこれから！一緒に頑張ろうね！';
  else mascotMsg = 'スケちゃんを元気にするために、タスクをこなしていこう！';
  html += `<div class="report-section" style="text-align:center">
    <div style="font-size:1.5rem;margin-bottom:4px">🌿</div>
    <div style="font-size:0.8rem;font-weight:600">スケちゃんより</div>
    <div style="font-size:0.75rem;color:var(--text-light);margin-top:4px">${mascotMsg}</div>
  </div>`;

  container.innerHTML = html;
}

// ===================================================================
// FEATURE 4: Appliance Management
// ===================================================================
function openApplianceModal() { navigateTo('appliance'); }
function closeApplianceModal() { navigateTo('schedule'); }

function renderApplianceList() {
  const list = document.getElementById('applianceListContent');
  if (!list) return;
  if (!appliances.length) {
    list.innerHTML = '<p style="font-size:0.75rem;color:var(--text-light);text-align:center;padding:20px">家電が登録されていません</p>';
    return;
  }
  const today = new Date();
  list.innerHTML = appliances.map(a => {
    const warranty = a.warrantyEndDate ? new Date(a.warrantyEndDate) : null;
    let statusClass = 'valid', statusText = '保証内';
    if (warranty) {
      const daysLeft = Math.ceil((warranty - today) / 864e5);
      if (daysLeft < 0) { statusClass = 'expired'; statusText = '保証切れ'; }
      else if (daysLeft < 90) { statusClass = 'expiring'; statusText = `残${daysLeft}日`; }
    } else {
      statusClass = ''; statusText = '';
    }

    const purchaseDate = a.purchaseDate ? new Date(a.purchaseDate) : null;
    const ageYears = purchaseDate ? Math.floor((today - purchaseDate) / (365.25 * 864e5)) : 0;
    const replaceAlert = ageYears >= 10 ? `<div class="appliance-alert">⚠️ ${ageYears}年使用中 - そろそろ買い替え</div>` : '';

    return `<div class="appliance-item">
      ${statusClass ? `<div class="appliance-status ${statusClass}" title="${statusText}"></div>` : '<div style="width:10px"></div>'}
      <div class="appliance-info">
        <div class="appliance-name">${escHtml(a.name)}</div>
        <div class="appliance-meta">
          <span>${escHtml(a.category||'')}</span>
          ${a.purchaseDate?`<span>購入: ${a.purchaseDate}</span>`:''}
          ${warranty?`<span>保証: ${statusText}</span>`:''}
          ${a.location?`<span>📍${escHtml(a.location)}</span>`:''}
        </div>
        ${replaceAlert}
      </div>
      <div class="feature-item-actions">
        <button onclick="editAppliance('${a.id}')">編集</button>
        <button onclick="deleteAppliance('${a.id}')">削除</button>
      </div>
    </div>`;
  }).join('');
}

let editingApplianceId = null;

function showApplianceForm(id) {
  editingApplianceId = id || null;
  const form = document.getElementById('applianceForm');
  form.style.display = 'block';
  document.getElementById('applianceFormTitle').textContent = id ? '家電編集' : '家電登録';

  if (id) {
    const a = appliances.find(x => x.id === id);
    if (!a) return;
    document.getElementById('appName').value = a.name;
    document.getElementById('appCategory').value = a.category || '';
    document.getElementById('appPurchaseDate').value = a.purchaseDate || '';
    document.getElementById('appWarrantyEnd').value = a.warrantyEndDate || '';
    document.getElementById('appMaintenanceCycle').value = a.maintenanceCycle || '';
    document.getElementById('appLocation').value = a.location || '';
    document.getElementById('appMemo').value = a.memo || '';
  } else {
    document.getElementById('appName').value = '';
    document.getElementById('appCategory').value = APPLIANCE_CATEGORIES[0];
    document.getElementById('appPurchaseDate').value = '';
    document.getElementById('appWarrantyEnd').value = '';
    document.getElementById('appMaintenanceCycle').value = '';
    document.getElementById('appLocation').value = '';
    document.getElementById('appMemo').value = '';
  }
}

function hideApplianceForm() {
  document.getElementById('applianceForm').style.display = 'none';
  editingApplianceId = null;
}

function saveAppliance() {
  const name = document.getElementById('appName').value.trim();
  if (!name) { alert('名前を入力してください'); return; }

  const data = {
    name,
    category: document.getElementById('appCategory').value,
    purchaseDate: document.getElementById('appPurchaseDate').value,
    warrantyEndDate: document.getElementById('appWarrantyEnd').value,
    maintenanceCycle: parseInt(document.getElementById('appMaintenanceCycle').value) || 0,
    location: document.getElementById('appLocation').value.trim(),
    memo: document.getElementById('appMemo').value.trim()
  };

  if (editingApplianceId) {
    const idx = appliances.findIndex(a => a.id === editingApplianceId);
    if (idx >= 0) appliances[idx] = { ...appliances[idx], ...data };
  } else {
    appliances.push({ id: genId(), ...data });
  }
  DL.saveAppliances();
  hideApplianceForm();
  renderApplianceList();
}

function editAppliance(id) { showApplianceForm(id); }

function deleteAppliance(id) {
  if (!confirm('この家電を削除しますか？')) return;
  appliances = appliances.filter(a => a.id !== id);
  DL.saveAppliances();
  renderApplianceList();
}

// ===================================================================
// FEATURE 6: Rewards System
// ===================================================================
function openRewardsModal() { navigateTo('rewards'); }
function closeRewardsModal() { navigateTo('schedule'); }

function renderRewardsContent(container) {
  if (!container) container = document.getElementById('rewardsViewContent');
  if (!container) return;

  // Show member points
  let html = '<h3 style="font-size:0.85rem;margin-bottom:8px">メンバーポイント</h3>';
  if (members.length) {
    html += members.map(m => {
      const earned = getMemberTotalEarned(m.id);
      const available = getMemberPoints(m.id);
      return `<div class="reward-item" style="border-left:3px solid ${m.color}">
        <span style="font-weight:500">${escHtml(m.name)}</span>
        <span style="margin-left:auto;font-size:0.65rem;color:var(--text-light)">累計 ${earned}pt</span>
        <span class="reward-cost">${available}pt</span>
      </div>`;
    }).join('');
  } else {
    html += '<p style="font-size:0.75rem;color:var(--text-light)">メンバーを登録してください</p>';
  }

  // Rewards list
  html += '<h3 style="font-size:0.85rem;margin:16px 0 8px">ごほうび一覧</h3>';
  if (rewards.length) {
    html += rewards.map(r => {
      const canRedeem = currentUserId && getMemberPoints(currentUserId) >= r.cost;
      return `<div class="reward-item">
        <span style="font-weight:500">${escHtml(r.name)}</span>
        <span class="reward-cost">${r.cost}pt</span>
        <button class="reward-redeem" ${canRedeem?'':`disabled`} onclick="redeemReward('${r.id}')">交換</button>
        <button class="shopping-delete" onclick="deleteReward('${r.id}')">✕</button>
      </div>`;
    }).join('');
  } else {
    html += '<p style="font-size:0.75rem;color:var(--text-light);text-align:center;padding:8px">ごほうびが登録されていません</p>';
  }

  // Point history (recent)
  html += '<h3 style="font-size:0.85rem;margin:16px 0 8px">最近のポイント履歴</h3>';
  const recent = pointsHistory.filter(p => p.year === currentYear).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
  if (recent.length) {
    html += '<div style="max-height:200px;overflow-y:auto">';
    recent.forEach(p => {
      const icon = p.type === 'earned' ? '⭐' : '🎁';
      html += `<div style="font-size:0.7rem;padding:3px 0;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center">
        <span>${icon}</span>
        <span style="flex:1">${escHtml(p.memberName||'')} - ${escHtml(p.taskName||p.rewardName||'')}</span>
        <span style="font-weight:600;color:${p.type==='earned'?'#4caf50':'#e65100'}">${p.type==='earned'?'+':'-'}${Math.abs(p.points)}pt</span>
        <span style="font-size:0.6rem;color:#aaa">${relativeTime(p.date)}</span>
      </div>`;
    });
    html += '</div>';
  } else {
    html += '<p style="font-size:0.75rem;color:var(--text-light);text-align:center">履歴はありません</p>';
  }

  container.innerHTML = html;
}

function addReward() {
  const nameEl = document.getElementById('rewardNewName');
  const costEl = document.getElementById('rewardNewCost');
  const name = nameEl.value.trim();
  const cost = parseInt(costEl.value) || 0;
  if (!name || cost <= 0) { alert('ごほうび名とポイントを入力してください'); return; }
  rewards.push({ id: genId(), name, cost });
  DL.saveRewards();
  nameEl.value = '';
  costEl.value = '';
  renderRewardsContent();
}

function deleteReward(id) {
  rewards = rewards.filter(r => r.id !== id);
  DL.saveRewards();
  renderRewardsContent();
}

function redeemReward(id) {
  const reward = rewards.find(r => r.id === id);
  if (!reward || !currentUserId) return;
  const available = getMemberPoints(currentUserId);
  if (available < reward.cost) { alert('ポイントが足りません'); return; }
  if (!confirm(`「${reward.name}」を${reward.cost}ptで交換しますか？`)) return;

  pointsHistory.push({
    id: genId(),
    memberId: currentUserId,
    memberName: currentUserName,
    points: reward.cost,
    type: 'redeemed',
    year: currentYear,
    date: new Date().toISOString(),
    rewardName: reward.name
  });
  DL.savePoints();
  renderRewardsContent();
}

// ===================================================================
// FEATURE 7: Stock Management
// ===================================================================
function openStockModal() { navigateTo('stock'); }
function closeStockModal() { navigateTo('schedule'); }

function renderStockList() {
  const list = document.getElementById('stockListContent');
  if (!list) return;
  if (!stockItems.length) {
    list.innerHTML = '<p style="font-size:0.75rem;color:var(--text-light);text-align:center;padding:20px">ストックが登録されていません</p>';
    return;
  }
  list.innerHTML = stockItems.map(s => {
    let statusClass = 'plenty';
    if (s.currentStock <= 0) statusClass = 'empty';
    else if (s.currentStock <= s.minStock) statusClass = 'low';

    return `<div class="appliance-item">
      <div class="stock-status ${statusClass}"></div>
      <div class="appliance-info">
        <div class="appliance-name">${escHtml(s.name)}</div>
        <div class="appliance-meta">
          <span>在庫: ${s.currentStock}${s.unit||'個'}</span>
          <span>最低: ${s.minStock}${s.unit||'個'}</span>
          ${s.category?`<span>${escHtml(s.category)}</span>`:''}
          ${s.lastPurchaseDate?`<span>最終購入: ${s.lastPurchaseDate}</span>`:''}
        </div>
      </div>
      <div class="feature-item-actions">
        <button onclick="adjustStock('${s.id}',-1)">-</button>
        <button onclick="adjustStock('${s.id}',1)">+</button>
        <button onclick="editStockItem('${s.id}')">編集</button>
        <button onclick="deleteStockItem('${s.id}')">削除</button>
      </div>
    </div>`;
  }).join('');
}

function adjustStock(id, delta) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  item.currentStock = Math.max(0, item.currentStock + delta);
  DL.saveStock();
  renderStockList();
}

let editingStockId = null;

function showStockForm(id) {
  editingStockId = id || null;
  const form = document.getElementById('stockForm');
  form.style.display = 'block';
  document.getElementById('stockFormTitle').textContent = id ? 'ストック編集' : 'ストック登録';

  if (id) {
    const s = stockItems.find(x => x.id === id);
    if (!s) return;
    document.getElementById('stockName').value = s.name;
    document.getElementById('stockCategory').value = s.category || '';
    document.getElementById('stockCurrent').value = s.currentStock;
    document.getElementById('stockMin').value = s.minStock;
    document.getElementById('stockUnit').value = s.unit || '個';
    document.getElementById('stockLastPurchase').value = s.lastPurchaseDate || '';
  } else {
    document.getElementById('stockName').value = '';
    document.getElementById('stockCategory').value = '';
    document.getElementById('stockCurrent').value = 0;
    document.getElementById('stockMin').value = 1;
    document.getElementById('stockUnit').value = '個';
    document.getElementById('stockLastPurchase').value = '';
  }
}

function hideStockForm() {
  document.getElementById('stockForm').style.display = 'none';
  editingStockId = null;
}

function saveStockItem() {
  const name = document.getElementById('stockName').value.trim();
  if (!name) { alert('名前を入力してください'); return; }

  const data = {
    name,
    category: document.getElementById('stockCategory').value.trim(),
    currentStock: parseInt(document.getElementById('stockCurrent').value) || 0,
    minStock: parseInt(document.getElementById('stockMin').value) || 1,
    unit: document.getElementById('stockUnit').value,
    lastPurchaseDate: document.getElementById('stockLastPurchase').value
  };

  if (editingStockId) {
    const idx = stockItems.findIndex(s => s.id === editingStockId);
    if (idx >= 0) stockItems[idx] = { ...stockItems[idx], ...data };
  } else {
    stockItems.push({ id: genId(), ...data });
  }
  DL.saveStock();
  hideStockForm();
  renderStockList();
}

function editStockItem(id) { showStockForm(id); }

function deleteStockItem(id) {
  if (!confirm('このストックを削除しますか？')) return;
  stockItems = stockItems.filter(s => s.id !== id);
  DL.saveStock();
  renderStockList();
}

function addLowStockToShopping() {
  const lowItems = stockItems.filter(s => s.currentStock <= s.minStock);
  if (!lowItems.length) { alert('不足しているストックはありません'); return; }
  let added = 0;
  lowItems.forEach(s => {
    if (!shoppingList.find(si => si.name === s.name && !si.checked)) {
      shoppingList.push({ id: genId(), name: s.name, checked: false, addedBy: currentUserName, linkedTaskId: null });
      added++;
    }
  });
  DL.saveShopping();
  alert(`${added}件を買い物リストに追加しました`);
}

// ===== View Render Functions =====
// These render content into page views instead of modals

function renderUpcomingView() {
  const container = document.getElementById('upcomingViewContent');
  if (!container) return;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const limit = new Date(today); limit.setDate(limit.getDate()+upcomingDays);
  const limitStr = limit.toISOString().split('T')[0];

  const upcoming = [];
  tasks.forEach(t => {
    const done = isTaskDone(t.id);
    if (done || t.paused) return;
    let ds=t.start, de=t.end;
    const sy=new Date(t.start).getFullYear(), ey=new Date(t.end).getFullYear();
    if (t.recurring && sy!==currentYear && ey!==currentYear) {
      const s=new Date(t.start), e=new Date(t.end), diff=Math.round((e-s)/864e5);
      ds=`${currentYear}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}`;
      const ne=new Date(currentYear,s.getMonth(),s.getDate()+diff);
      de=`${ne.getFullYear()}-${String(ne.getMonth()+1).padStart(2,'0')}-${String(ne.getDate()).padStart(2,'0')}`;
    }
    if (de>=todayStr && ds<=limitStr) {
      upcoming.push({...t, displayStart:ds, displayEnd:de, done:false});
    }
  });
  upcoming.sort((a,b) => a.displayStart.localeCompare(b.displayStart));

  const toggleBtn = document.getElementById('upcomingToggleBtn');
  if (toggleBtn) toggleBtn.textContent = upcomingDays===7 ? '30日表示' : '7日表示';

  if (!upcoming.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-light)">
      <div style="font-size:2rem;margin-bottom:10px;opacity:0.4">📅</div>
      <p style="font-size:0.9rem">${upcomingDays}日以内にやることはありません</p>
      <p style="font-size:0.75rem;color:#aaa;margin-top:4px">タスクを追加するか、表示期間を変更してみてください</p>
    </div>`;
    return;
  }

  container.innerHTML = `<p style="font-size:0.8rem;color:var(--text-light);margin-bottom:12px;padding:0 24px">${upcomingDays}日以内: ${upcoming.length}件</p>
    <div class="upcoming-list-full" style="padding:0 24px">${upcoming.map(t => {
      const cat = CATEGORIES[t.category] || CATEGORIES.other;
      const mem = t.member ? getMemberById(t.member) : null;
      const sD = new Date(t.displayStart);
      const eD = new Date(t.displayEnd);
      const dateLabel = t.displayStart===t.displayEnd
        ? `${sD.getMonth()+1}/${sD.getDate()}`
        : `${sD.getMonth()+1}/${sD.getDate()} - ${eD.getMonth()+1}/${eD.getDate()}`;
      const weatherHtml = getWeatherForTask(t);
      const daysLeft = Math.ceil((new Date(t.displayStart) - new Date(todayStr)) / 864e5);
      const urgency = daysLeft <= 0 ? '<span style="color:var(--today);font-weight:600;font-size:0.7rem">今日</span>'
        : daysLeft <= 1 ? '<span style="color:#ff9800;font-weight:600;font-size:0.7rem">明日</span>'
        : `<span style="font-size:0.7rem;color:var(--text-light)">${daysLeft}日後</span>`;
      return `<div class="upcoming-item-full" onclick="openTaskModal('${t.id}')">
        <div class="upcoming-check" onclick="event.stopPropagation();toggleDone('${t.id}',event)"></div>
        <div class="task-cat-dot" style="background:${cat.color}"></div>
        <span class="upcoming-date-full">${dateLabel}</span>
        <span class="upcoming-name-full">${escHtml(t.name)}</span>
        ${weatherHtml}
        ${urgency}
        ${mem ? `<span class="task-member-badge" style="background:${mem.color}">${escHtml(mem.name)}</span>` : ''}
      </div>`;
    }).join('')}</div>`;
}

function renderCostView() {
  const container = document.getElementById('costViewContent');
  if (!container) return;
  renderCostContent(container);
}

function renderReportView() {
  const container = document.getElementById('reportViewContent');
  if (!container) return;
  renderReportContent(container);
}

function renderRewardsView() {
  const container = document.getElementById('rewardsViewContent');
  if (!container) return;
  renderRewardsContent(container);
}

function renderActivityView() {
  const list = document.getElementById('activityViewList');
  if (!list) return;
  if (!activityLog.length) {
    list.innerHTML = '<p style="font-size:0.85rem;color:var(--text-light);text-align:center;padding:30px">履歴はまだありません</p>';
    return;
  }
  const icons = {task_created:'📝',task_updated:'✏️',task_deleted:'🗑️',task_completed:'✅',task_uncompleted:'↩️',member_added:'👤',member_removed:'👤'};
  list.innerHTML = activityLog.slice(0,100).map(a =>
    `<div class="activity-item">
      <div class="activity-icon">${icons[a.action]||'📋'}</div>
      <div class="activity-content">
        <div class="activity-desc"><span class="activity-who">${escHtml(a.performedBy||'')}</span> ${escHtml(a.details||'')}</div>
        <div class="activity-time">${relativeTime(a.timestamp)}</div>
      </div>
    </div>`
  ).join('');
}

function renderMemberView() {
  const list = document.getElementById('memberViewList');
  if (!list) return;
  list.innerHTML = members.length === 0
    ? '<p style="font-size:0.8rem;color:var(--text-light);padding:10px 0">まだメンバーがいません</p>'
    : members.map(m => `<div class="member-item">
        <div class="member-color" style="background:${m.color}"></div>
        <span class="member-name-display">${escHtml(m.name)}</span>
        ${m.id===currentUserId ? '<span style="color:var(--accent);font-size:0.7rem;font-weight:600">選択中</span>' : ''}
        <button class="member-remove" onclick="removeMember('${m.id}')">✕</button>
      </div>`).join('');
}

function renderSettingsView() {
  // Account info
  const accountEl = document.getElementById('accountInfo');
  if (accountEl) {
    if (googleUser) {
      accountEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--bg);border-radius:10px">
          <img src="${googleUser.photoURL || ''}" style="width:40px;height:40px;border-radius:50%;${googleUser.photoURL ? '' : 'display:none'}">
          <div>
            <div style="font-weight:600;font-size:0.9rem">${escHtml(googleUser.displayName || '')}</div>
            <div style="font-size:0.7rem;color:var(--text-light)">${escHtml(googleUser.email || '')}</div>
          </div>
          <button class="btn btn-secondary" onclick="googleSignOut()" style="margin-left:auto;font-size:0.7rem;padding:5px 12px">ログアウト</button>
        </div>`;
    } else {
      accountEl.innerHTML = `
        <p style="font-size:0.8rem;color:var(--text-light);margin-bottom:8px">Googleアカウントでログインすると、自動的に本人が識別されます。</p>
        <button class="btn btn-primary" onclick="googleSignIn()" style="font-size:0.8rem">Googleでログイン</button>`;
    }
  }

  // Settings content is mostly static HTML; just update dynamic parts
  const config = localStorage.getItem('fs-firebase-config');
  const input = document.getElementById('fbConfigInput');
  if (config && input) input.value = config;

  const st = document.getElementById('fbStatus');
  if (st) {
    if (fbMode) { st.className='settings-status on'; st.textContent='接続中'; }
    else if (config) { st.className='settings-status off'; st.textContent='未接続'; }
    else { st.className='settings-status off'; st.textContent='未設定'; }
  }

  // Weather settings
  const latEl = document.getElementById('weatherLat');
  const lonEl = document.getElementById('weatherLon');
  if (latEl) latEl.value = weatherSettings.lat;
  if (lonEl) lonEl.value = weatherSettings.lon;

  renderRoomInfo();

  const btnReminder = document.getElementById('btnReminder');
  if (btnReminder) btnReminder.textContent = reminderEnabled ? '通知をオフにする' : '通知をオンにする';

  // Dark mode button
  const darkBtn = document.getElementById('darkModeBtn');
  if (darkBtn) {
    const isDark = document.body.classList.contains('dark');
    darkBtn.textContent = isDark ? '☀️ ライトモード' : '🌙 ダークモード';
  }
}

// ===== PWA Registration =====
function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(function(e){console.log('SW registration failed:',e)});
  }
}

// ===== Keyboard =====
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeTaskModal();closeTemplateModal();closeMonthZoom();closeUserSelect();
    closeSidebar();
  }
});

// ===== Init =====
(async function init(){
  initDarkMode();
  initMascotCollapse();
  loadLocal();
  document.getElementById('currentYear').textContent=currentYear;
  render();
  updateUserBadge();
  registerSW();
  fetchWeather();
  initRouter();

  // Auto-connect Firebase - auth handling is done in onAuthStateChanged (in initFirebase)
  try {
    await initFirebase(FIREBASE_CONFIG);
  } catch(e) {
    console.error('Firebase auto-connect failed:', e);
    hideLoginScreen();
  }
})();

// Show join/create room modal for first-time users
function showJoinRoomModal() {
  if (roomCode) return; // Already in a room
  const overlay = document.getElementById('joinRoomOverlay');
  if (!overlay) return;

  // If already logged in with Google, skip to room selection
  if (googleUser) {
    const loginSection = document.getElementById('googleLoginSection');
    const roomSection = document.getElementById('roomSelectSection');
    if (loginSection) loginSection.style.display = 'none';
    if (roomSection) roomSection.style.display = 'block';
  }

  overlay.classList.add('active');
}
function closeJoinRoomModal() {
  const overlay = document.getElementById('joinRoomOverlay');
  if (overlay) overlay.classList.remove('active');
}
async function quickCreateRoom() {
  const name = document.getElementById('quickRoomName').value.trim();
  if (!name) { alert('家族名を入力してください'); return; }
  await createRoom(name);
  // Auto-add current Google user as member
  await autoAddGoogleMember();
  closeJoinRoomModal();
}
async function quickJoinRoom() {
  const code = document.getElementById('quickRoomCode').value.trim();
  if (code.length !== 6) { alert('6桁のルームコードを入力してください'); return; }
  const ok = await joinRoom(code);
  if (ok) {
    // Auto-add current Google user as member if not already in room
    await autoAddGoogleMember();
    closeJoinRoomModal();
  } else {
    alert('このコードのルームは見つかりません');
  }
}

// Auto-create a member from Google profile and select it
async function autoAddGoogleMember() {
  if (!googleUser) { setTimeout(promptWhoAreYou, 600); return; }

  // Wait for members to sync from Firestore
  await new Promise(r => setTimeout(r, 800));

  // Check if this Google user already has a member
  const existing = members.find(m => m.googleUid === googleUser.uid);
  if (existing) {
    setCurrentUser(existing.id);
    return;
  }

  // Create new member from Google profile
  const colors = ['#5b9bd5','#e67e22','#27ae60','#8e44ad','#e74c3c','#1abc9c','#f39c12','#e91e63'];
  const member = {
    id: genId(),
    name: googleUser.displayName || 'ユーザー',
    color: colors[members.length % colors.length],
    googleUid: googleUser.uid,
    photoURL: googleUser.photoURL || ''
  };
  await DL.addMember(member);
  // Wait for sync then select
  await new Promise(r => setTimeout(r, 500));
  setCurrentUser(member.id);
}

// Automatically ask "who are you" if not set, or auto-select if only 1 member
function promptWhoAreYou() {
  if (currentUserId && members.find(m => m.id === currentUserId)) return; // Already set
  if (members.length === 0) return; // No members yet
  if (members.length === 1) {
    // Only one member - auto select
    setCurrentUser(members[0].id);
    return;
  }
  // Multiple members - ask
  openUserSelect();
}
function getInviteLink() {
  if (!roomCode) return '';
  return window.location.origin + window.location.pathname + '#join=' + roomCode;
}
function copyInviteLink() {
  const link = getInviteLink();
  if (!link) { alert('まずルームを作成してください'); return; }
  navigator.clipboard.writeText(link).then(() => alert('招待リンクをコピーしました！\n' + link));
}
