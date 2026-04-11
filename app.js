import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update, set, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDFwECdwELB_wPHR_9rkkY9MRcNBjQSUks",
    authDomain: "viaz-1e406.firebaseapp.com",
    databaseURL: "https://viaz-1e406-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "viaz-1e406",
    storageBucket: "viaz-1e406.firebasestorage.app",
    messagingSenderId: "73407200033",
    appId: "1:73407200033:web:0fd45cbe87500fb4645c60",
    measurementId: "G-26YTWXHSTY"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUser = null;
let allServices = [];
let currentServiceData = null;
let editingId = null;
let monthOffset = 0;
let allUserProfiles = {};

// ============================================
// 1. AUTH & UNIQUE NAMES
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-shell').style.display = 'flex';
        const myName = (await get(ref(db, `work_pro/directory/${user.uid}/name`))).val();
        if (!myName) {
            const fallback = user.displayName || user.email.split('@')[0];
            const isUnique = await checkUniqueName(fallback, user.uid);
            if (isUnique) await saveIdentity(user, fallback);
            else {
                const asked = prompt("Nome já em uso. Escolha um único (Nome + Apelido):", fallback);
                if (asked && await checkUniqueName(asked, user.uid)) await saveIdentity(user, asked);
                else alert("Nome não é único.");
            }
        }
        const nameLabel = (await get(ref(db, `work_pro/directory/${user.uid}/name`))).val() || user.email.split('@')[0];
        document.getElementById('user-display').innerText = nameLabel;
        initAppData(user.uid);
        fetchGlobalProfiles();
    } else {
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    }
});

async function checkUniqueName(name, myUid) {
    const snap = await get(ref(db, `work_pro/directory`));
    const all = snap.val();
    if (!all) return true;
    return !Object.keys(all).some(uid => uid !== myUid && all[uid].name?.toLowerCase() === name.toLowerCase());
}
async function saveIdentity(user, name) {
    if (!(await checkUniqueName(name, user.uid))) return alert("Nome já em uso!");
    await updateProfile(user, { displayName: name });
    const payload = { name, email: user.email, updatedAt: Date.now() };
    await update(ref(db, `work_pro/users/${user.uid}/profile`), payload);
    await update(ref(db, `work_pro/directory/${user.uid}`), payload);
}
function fetchGlobalProfiles() {
    onValue(ref(db, `work_pro/directory`), (snap) => { allUserProfiles = snap.val() || {}; });
}

window.handleAuth = async (type) => {
    const e = document.getElementById('auth-email').value, p = document.getElementById('auth-pass').value, n = document.getElementById('auth-name').value;
    if (!e || !p) return alert("Preencha campos.");
    try {
        if (type === 'login') await signInWithEmailAndPassword(auth, e, p);
        else {
            if (!n) return alert("Nome obrigatório.");
            if (!(await checkUniqueName(n, ""))) return alert("Nome já em uso.");
            const cr = await createUserWithEmailAndPassword(auth, e, p);
            await saveIdentity(cr.user, n);
        }
    } catch (err) { alert(err.message); }
};
window.logout = () => signOut(auth);

// ============================================
// 2. NAVIGATION (STRICT ISOLATION)
// ============================================
window.switchTab = (id) => {
    document.querySelectorAll('.tab-content').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    const target = document.getElementById(id);
    if (target) { target.style.display = 'block'; target.classList.add('active'); }
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    const btn = Array.from(document.querySelectorAll('.tab-item')).find(x => x.getAttribute('onclick')?.includes(id));
    if (btn) btn.classList.add('active');
    if (id === 'view-admin' && !editingId) resetAdminForm();
    window.scrollTo({ top: 0 });
};

// ============================================
// 3. DATA SYNC & RENDERING
// ============================================
function initAppData(uid) {
    onValue(ref(db, `work_pro/users/${uid}/active`), (snap) => {
        allServices = snap.exists() ? Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] })) : [];
        refreshUI();
    });
    onValue(ref(db, `work_pro/users/${uid}/inbox`), (snap) => {
        const items = snap.exists() ? Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k], isInbox: true })) : [];
        renderInbox(items);
    });
}

function refreshUI() { filterToday(); filterWeek(); renderTasks(); renderMonth(); checkAlerts(); }

function filterToday() {
    const list = document.getElementById('today-list'); if (!list) return; list.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === today);
    if (!items.length) return list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Livre hoje.</p>';
    items.sort((a, b) => (a.time || '').localeCompare(b.time || '')).forEach(s => list.appendChild(createServiceCard(s)));
}

function filterWeek() {
    const cont = document.getElementById('week-container'); if (!cont) return; cont.innerHTML = '';
    const today = new Date(); const tStr = today.toISOString().split('T')[0];
    const next7 = new Date(); next7.setDate(today.getDate() + 7); const n7Str = next7.toISOString().split('T')[0];
    const items = allServices.filter(s => s.date > tStr && s.date <= n7Str);
    if (!items.length) return cont.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Sem serviços esta semana.</p>';
    const grps = {};
    items.forEach(s => { if (!grps[s.date]) grps[s.date] = []; grps[s.date].push(s); });
    Object.keys(grps).sort().forEach(d => {
        const h = document.createElement('div'); h.className = 'week-day-title';
        h.innerText = new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' });
        cont.appendChild(h); grps[d].forEach(s => cont.appendChild(createServiceCard(s)));
    });
}

function renderTasks() {
    const list = document.getElementById('tasks-list'); if (!list) return; list.innerHTML = '';
    const tasks = allServices.filter(s => !s.date || s.date === "");
    if (!tasks.length) return list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Backlog vazio.</p>';
    tasks.forEach(t => list.appendChild(createServiceCard(t)));
}

function renderMonth() {
    const grid = document.getElementById('month-grid'); if (!grid) return; grid.innerHTML = '';
    const tgt = new Date(); tgt.setMonth(tgt.getMonth() + monthOffset);
    const m = tgt.getMonth(), y = tgt.getFullYear();
    const totalDays = new Date(y, m + 1, 0).getDate();
    document.getElementById('month-label').innerText = tgt.toLocaleDateString('pt-PT', { month: 'long' });
    document.getElementById('year-label').innerText = y;
    for (let i = 1; i <= totalDays; i++) {
        const dsStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const items = allServices.filter(s => s.date === dsStr);
        const el = document.createElement('div'); el.className = 'month-day'; el.innerHTML = `<span>${i}</span>`;
        if (items.length) { el.innerHTML += `<div class="day-dot"></div>`; el.onclick = () => openDaySelector(dsStr, items); }
        grid.appendChild(el);
    }
}

function renderInbox(items) {
    const list = document.getElementById('inbox-list'); if (!list) return; list.innerHTML = '';
    if (!items.length) return list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Caixa de Entrada Vazia.</p>';
    items.forEach(it => {
        const card = document.createElement('div'); card.className = 'list-card';
        card.innerHTML = `
            <div class="card-info" style="cursor:pointer" id="inbox-card-${it.id}">
                <span class="card-title">${it.title}</span>
                <span class="card-meta">De: ${it.senderName} · 📅 ${it.date || '--'} · 🕒 ${it.time || '--'}</span>
                <span style="font-size:0.7rem; color:var(--accent); font-weight:600;">Ver Detalhes</span>
            </div>
            <button class="primary-btn" style="width:auto; margin:0;" onclick="acceptService('${it.id}')">ACEITAR</button>
        `;
        list.appendChild(card);
        document.getElementById(`inbox-card-${it.id}`).onclick = () => openServiceModal(it);
    });
}

// CUSTOMIZABLE ALERT (reads alertHours instead of boolean)
function checkAlerts() {
    const now = Date.now();
    const banner = document.getElementById('sticky-alert');
    let has = false;
    allServices.forEach(s => {
        if (!s.date || !s.time || s.status === 'transferred') return;
        const alertH = parseInt(s.alertHours) || 0;
        if (alertH === 0) return;
        const diff = new Date(`${s.date}T${s.time}`).getTime() - now;
        if (diff > 0 && diff <= alertH * 60 * 60 * 1000) {
            document.getElementById('alert-msg').innerText = `🚨 ${s.title} — ${s.client || ''} em ${alertH}h!`;
            has = true;
        }
    });
    banner.style.display = has ? 'block' : 'none';
}

document.getElementById('confirm-presence')?.addEventListener('click', () => {
    document.getElementById('sticky-alert').style.display = 'none';
});

// ============================================
// 4. CRUD: DELETE
// ============================================
window.confirmDelete = async () => {
    if (!currentServiceData?.id) return alert("Nenhum serviço selecionado.");
    if (!confirm(`Eliminar "${currentServiceData.title}"?`)) return;
    try {
        await remove(ref(db, `work_pro/users/${currentUser.uid}/active/${currentServiceData.id}`));
        alert("Eliminado."); closeModal();
    } catch (e) { alert("Erro: " + e.message); }
};

// TOGGLE COMPLETE / REACTIVATE
window.toggleComplete = async () => {
    if (!currentServiceData?.id) return;
    const newStatus = currentServiceData.status === 'completed' ? 'active' : 'completed';
    try {
        await update(ref(db, `work_pro/users/${currentUser.uid}/active/${currentServiceData.id}`), {
            status: newStatus,
            completedAt: newStatus === 'completed' ? Date.now() : null
        });
        closeModal();
    } catch (e) { alert("Erro: " + e.message); }
};

// ============================================
// 5. CRUD: EDIT (Modal Inline — all new fields)
// ============================================
window.toggleEditMode = (on) => {
    document.getElementById('dtl-view-mode').style.display = on ? 'none' : 'block';
    document.getElementById('dtl-edit-mode').style.display = on ? 'block' : 'none';
    if (on && currentServiceData) {
        document.getElementById('edit-title').value = currentServiceData.title || '';
        document.getElementById('edit-client').value = currentServiceData.client || '';
        document.getElementById('edit-whatsapp').value = currentServiceData.whatsapp || '';
        document.getElementById('edit-flight').value = currentServiceData.flight || '';
        document.getElementById('edit-date').value = currentServiceData.date || '';
        document.getElementById('edit-time').value = currentServiceData.time || '';
        document.getElementById('edit-pickup').value = currentServiceData.pickup || '';
        document.getElementById('edit-destination').value = currentServiceData.destination || '';
        document.getElementById('edit-notes').value = currentServiceData.notes || '';
        document.getElementById('edit-alert-time').value = currentServiceData.alertHours || '4';
    }
};

window.saveChanges = async () => {
    if (!currentServiceData?.id) return alert("ID não encontrado.");
    const newTitle = document.getElementById('edit-title').value;
    if (!newTitle) return alert("Título obrigatório.");
    const data = {
        title: newTitle,
        client: document.getElementById('edit-client').value,
        whatsapp: document.getElementById('edit-whatsapp').value,
        flight: document.getElementById('edit-flight').value,
        date: document.getElementById('edit-date').value,
        time: document.getElementById('edit-time').value,
        pickup: document.getElementById('edit-pickup').value,
        destination: document.getElementById('edit-destination').value,
        notes: document.getElementById('edit-notes').value,
        alertHours: document.getElementById('edit-alert-time').value
    };
    try {
        await update(ref(db, `work_pro/users/${currentUser.uid}/active/${currentServiceData.id}`), data);
        alert("Alterações guardadas!"); closeModal();
    } catch (e) { alert("Erro: " + e.message); }
};

// ============================================
// 6. CRUD: CREATE / SAVE (edit-aware)
// ============================================
function resetAdminForm() {
    editingId = null;
    ['adm-title', 'adm-client', 'adm-whatsapp', 'adm-flight', 'adm-date', 'adm-time', 'adm-pickup', 'adm-destination', 'adm-notes'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('adm-alert-time').value = '4';
    document.getElementById('save-btn').innerText = 'SALVAR NO FIREBASE';
}

window.editInAdmin = (serviceId) => {
    const s = allServices.find(x => x.id === serviceId);
    if (!s) return;
    editingId = s.id;
    document.getElementById('adm-title').value = s.title || '';
    document.getElementById('adm-client').value = s.client || '';
    document.getElementById('adm-whatsapp').value = s.whatsapp || '';
    document.getElementById('adm-flight').value = s.flight || '';
    document.getElementById('adm-date').value = s.date || '';
    document.getElementById('adm-time').value = s.time || '';
    document.getElementById('adm-pickup').value = s.pickup || '';
    document.getElementById('adm-destination').value = s.destination || '';
    document.getElementById('adm-notes').value = s.notes || '';
    document.getElementById('adm-alert-time').value = s.alertHours || '4';
    document.getElementById('save-btn').innerText = 'ATUALIZAR SERVIÇO';
    closeModal();
    switchTab('view-admin');
};

document.getElementById('save-btn')?.addEventListener('click', async () => {
    const t = document.getElementById('adm-title').value;
    if (!t) return alert("Título necessário.");
    const data = {
        title: t,
        client: document.getElementById('adm-client').value,
        whatsapp: document.getElementById('adm-whatsapp').value,
        flight: document.getElementById('adm-flight').value,
        date: document.getElementById('adm-date').value,
        time: document.getElementById('adm-time').value,
        pickup: document.getElementById('adm-pickup').value,
        destination: document.getElementById('adm-destination').value,
        notes: document.getElementById('adm-notes').value,
        alertHours: document.getElementById('adm-alert-time').value,
        status: 'active'
    };
    try {
        if (editingId) {
            await update(ref(db, `work_pro/users/${currentUser.uid}/active/${editingId}`), data);
            alert("Atualizado!");
        } else {
            data.createdAt = Date.now();
            await push(ref(db, `work_pro/users/${currentUser.uid}/active`), data);
            alert("Salvo!");
        }
        resetAdminForm();
        switchTab('view-today');
    } catch (e) { alert("Erro: " + e.message); }
});

// ============================================
// 6.5. OCR: AUTO-FILL COM IMAGEM
// ============================================
window.handleOCR = async () => {
    const fileInput = document.getElementById('ocr-image');
    const statusMsg = document.getElementById('ocr-status');
    const file = fileInput.files[0];
    
    if (!file) {
        alert("Por favor, selecione uma imagem primeiro.");
        return;
    }
    
    if (!window.Tesseract) {
        alert("Erro: Biblioteca OCR não carregada. Verifique a internet e tente novamente.");
        return;
    }

    try {
        statusMsg.style.display = 'block';
        statusMsg.style.color = '#888';
        statusMsg.innerText = 'A processar imagem (pode demorar alguns segundos)...';
        
        const { data: { text } } = await Tesseract.recognize(
            file,
            'por+eng', 
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                       statusMsg.innerText = `A analisar texto: ${Math.round(m.progress * 100)}%`;
                    }
                }
            }
        );
        
        statusMsg.innerText = 'Extração concluída. A preencher os campos...';
        console.log("=== Texto Extraído (OCR) ===", text); // Útil para debugging
        
        const rawText = text;

        // 1. Extração de Nome (Ex. "Nome do passageiro: Barry Scott" ou "Lead: Barry Scott")
        const nameMatch = rawText.match(/Nome do passageiro:\s*([^\n]+)|Lead:\s*([^\n]+)/i);
        if (nameMatch) {
            // Pode vir algum "lixo" no final como icones, limpar se preciso. Aqui pego no que bater.
            let name = (nameMatch[1] || nameMatch[2] || "").trim();
            // removemos caracteres estranhos no fim se possível
            name = name.split(/(\[|■|⚫)/)[0].trim();
            
            document.getElementById('adm-client').value = name;
            
            // O título podemos já prefixar por uma palavra como Transfer
            if(document.getElementById('adm-title').value === '') {
                document.getElementById('adm-title').value = "Transfer " + name.split(" ")[0]; // Transfer + Primeiro Nome
            }
        }

        // 2. Extração de Telefone (Ex. "Celular: +18656031304")
        const phoneMatch = rawText.match(/(?:Celular|Phone|Telemóvel|Contact):\s*(\+?[\d\s]+)/i);
        if (phoneMatch) {
            document.getElementById('adm-whatsapp').value = phoneMatch[1].trim().replace(/\s/g, '');
        }

        // 3. Extração de Voo (Ex. "Voo / Trem: TBA" ou "Flight: TP1234")
        const flightMatch = rawText.match(/(?:Voo \/ Trem|Flight\s*\/|Voo)\s*:\s*([^\n]+)/i);
        if (flightMatch) {
            let voo = flightMatch[1].trim();
            if (!voo.toLowerCase().includes('tba')) {
                document.getElementById('adm-flight').value = voo;
            }
        }

        // 4. Data e Hora (Ex. "01 out. 2025 16:00")
        const dateMatch = rawText.match(/(\d{1,2})\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s*(\d{4})\s*(\d{2}:\d{2})/i);
        if (dateMatch) {
            const day = dateMatch[1].padStart(2, '0');
            const monthStr = dateMatch[2].toLowerCase();
            const year = dateMatch[3];
            const time = dateMatch[4];
            
            const months = { 'jan':'01','fev':'02','mar':'03','abr':'04','mai':'05','jun':'06','jul':'07','ago':'08','set':'09','out':'10','nov':'11','dez':'12' };
            
            document.getElementById('adm-date').value = `${year}-${months[monthStr]}-${day}`;
            document.getElementById('adm-time').value = time;
        }

        // 5. Rota (Tentativa de salvar o bloco inteiro em Notas para não perders as moradas já que é complexo separar corretamente)
        // Guardamos as primeiras 300 palavras ou o texto todo só para ter o contexto da morada guardado.
        document.getElementById('adm-notes').value = "--- OCR Dados ---\nVerifique as moradas no texto caso não sejam exatas.\n\n" + rawText.substring(0, 400);

        setTimeout(() => { 
            statusMsg.style.display = 'none'; 
            statusMsg.innerText = '';
        }, 3000);

    } catch (err) {
        console.error("Erro OCR:", err);
        statusMsg.innerText = 'Falha ao processar a imagem OCR.';
        statusMsg.style.color = "var(--accent-red)";
    }
};

// ============================================
// 7. ACCEPT (ATOMIC CLONE — all fields)
// ============================================
window.acceptService = async (inboxId) => {
    const uid = currentUser.uid;
    const snap = await get(ref(db, `work_pro/users/${uid}/inbox/${inboxId}`));
    if (!snap.exists()) return alert("Convite expirado.");
    const it = snap.val();

    if (it.date && it.time) {
        const pStart = new Date(`${it.date}T${it.time}`).getTime();
        const gap = 150 * 60 * 1000;
        const conflict = allServices.some(s => {
            if (!s.date || !s.time || s.status === 'transferred') return false;
            if (s.date !== it.date) return false;
            return Math.abs(pStart - new Date(`${s.date}T${s.time}`).getTime()) < gap;
        });
        if (conflict) return alert("Conflito de horário (Margem < 90min).");
    }

    try {
        const myName = (await get(ref(db, `work_pro/directory/${uid}/name`))).val() || "Colega";
        const newRef = push(ref(db, `work_pro/users/${uid}/active`));
        const updates = {};
        updates[`work_pro/users/${uid}/active/${newRef.key}`] = {
            title: it.title, client: it.client || '', whatsapp: it.whatsapp || '',
            flight: it.flight || '', date: it.date || '', time: it.time || '',
            pickup: it.pickup || '', destination: it.destination || '',
            notes: it.notes || '', alertHours: it.alertHours || '0',
            status: 'active', createdAt: Date.now()
        };
        if (it.senderUid && it.originalId) {
            updates[`work_pro/users/${it.senderUid}/active/${it.originalId}/status`] = 'transferred';
            updates[`work_pro/users/${it.senderUid}/active/${it.originalId}/transferredToName`] = myName;
        }
        updates[`work_pro/users/${uid}/inbox/${inboxId}`] = null;
        await update(ref(db), updates);
        alert("Serviço Aceite!"); switchTab('view-today'); closeModal();
    } catch (err) { alert("Erro: " + err.message); }
};

// ============================================
// 8. TRANSFER & AVAILABILITY
// ============================================
window.openTransferSelector = async () => {
    if (!currentServiceData?.date || !currentServiceData?.time) return alert("Data/Hora necessárias.");
    const list = document.getElementById('users-availability-list');
    list.innerHTML = '<p style="opacity:0.3;text-align:center;padding:20px;">Verificando...</p>';
    document.getElementById('transfer-modal').style.display = 'flex';
    const pStart = new Date(`${currentServiceData.date}T${currentServiceData.time}`).getTime();
    const gap = 150 * 60 * 1000;
    const uids = Object.keys(allUserProfiles).filter(uid => uid !== currentUser.uid);
    list.innerHTML = '';
    for (const uid of uids) {
        const profil = allUserProfiles[uid];
        const uCal = await get(ref(db, `work_pro/users/${uid}/active`));
        const acts = uCal.val() ? Object.values(uCal.val()) : [];
        const isBusy = acts.some(a => {
            if (!a.date || !a.time || a.status === 'transferred') return false;
            if (a.date !== currentServiceData.date) return false;
            return Math.abs(pStart - new Date(`${a.date}T${a.time}`).getTime()) < gap;
        });
        const d = document.createElement('div'); d.className = 'list-card'; d.style.opacity = isBusy ? '0.4' : '1';
        d.innerHTML = `<div class="card-info"><span class="card-title">${profil.name || profil.email}</span><span class="card-meta">${isBusy ? '🔴 Ocupado (Margem < 90m)' : '🟢 Disponível'}</span></div>${!isBusy ? `<button class="primary-btn" style="width:auto; margin:0;" onclick="sendTransferInvitation('${uid}', this)">ENVIAR</button>` : ''}`;
        list.appendChild(d);
    }
};

window.sendTransferInvitation = async (targetUid, btn) => {
    const me = (await get(ref(db, `work_pro/directory/${currentUser.uid}/name`))).val() || "Colega";
    btn.innerText = 'Enviando...'; btn.disabled = true;
    try {
        const inv = { ...currentServiceData, senderUid: currentUser.uid, senderName: me, originalId: currentServiceData.id, sentAt: Date.now() };
        await push(ref(db, `work_pro/users/${targetUid}/inbox`), inv);
        btn.innerText = '✅ Enviado!';
        await update(ref(db, `work_pro/users/${currentUser.uid}/active/${currentServiceData.id}`), { status: 'pending_acceptance' });
        setTimeout(() => { document.getElementById('transfer-modal').style.display = 'none'; closeModal(); }, 1500);
    } catch (err) { btn.disabled = false; btn.innerText = 'Erro'; alert(err.message); }
};

// ============================================
// 9. SERVICE CARD & MODALS
// ============================================
function createServiceCard(s) {
    const card = document.createElement('div');
    const isT = s.status === 'transferred', isP = s.status === 'pending_acceptance', isC = s.status === 'completed';
    card.className = 'list-card' + (isT ? ' transferred' : '') + (isP ? ' pending' : '') + (isC ? ' completed' : '');
    card.dataset.id = s.id;
    if (isT || isP) card.style.opacity = '0.5';
    let label = '';
    if (isT) label = `<span class="card-transfer-label">📤 Transferido para: ${s.transferredToName}</span>`;
    if (isP) label = `<span class="card-transfer-label" style="color:var(--accent-gold)">⏳ Pendente</span>`;
    if (isC) label = `<span class="card-completed-label">✅ Completado</span>`;
    const clientTag = s.client ? `<span style="color:var(--accent); font-size:0.8rem;">👤 ${s.client}</span>` : '';
    card.innerHTML = `
        <div class="card-info">
            <span class="card-title">${s.title}</span>
            ${clientTag}
            <div class="card-meta"><span>🕒 ${s.time || 'S/H'}</span></div>
            ${label}
        </div>
        <span style="opacity:0.2;">❯</span>
    `;
    return card;
}

document.addEventListener('click', (e) => {
    const c = e.target.closest('.list-card');
    if (c && c.dataset.id && !e.target.closest('button')) {
        const s = allServices.find(it => it.id === c.dataset.id);
        if (s) openServiceModal(s);
    }
});

// DETAIL MODAL WITH QUICK ACTIONS
window.openServiceModal = (s) => {
    currentServiceData = s;
    toggleEditMode(false);
    document.getElementById('dtl-title-display').innerText = s.title;
    document.getElementById('dtl-client').innerText = s.client ? `👤 ${s.client}` : '';
    document.getElementById('dtl-date').innerText = s.date || '--';
    document.getElementById('dtl-time').innerText = s.time || '--:--';
    document.getElementById('dtl-notes').innerText = s.notes || 'Sem notas.';

    // Flight row
    const flightRow = document.getElementById('dtl-flight-row');
    if (s.flight) { document.getElementById('dtl-flight').innerText = s.flight; flightRow.style.display = 'block'; }
    else flightRow.style.display = 'none';

    // Alert badge
    const alertH = parseInt(s.alertHours) || 0;
    const alertBadge = document.getElementById('dtl-alert-status');
    if (alertBadge) alertBadge.innerText = alertH > 0 ? `🔔 Alerta ${alertH}h antes` : '🔕 Sem Alerta';

    // COMPLETE BUTTON STATE
    const completeBtn = document.getElementById('btn-complete');
    if (completeBtn) {
        if (s.status === 'completed') {
            completeBtn.innerText = '🔄 Reativar Serviço';
            completeBtn.classList.add('is-completed');
        } else {
            completeBtn.innerText = '✅ Marcar como Completado';
            completeBtn.classList.remove('is-completed');
        }
    }

    // QUICK ACTIONS
    setupQuickAction('qa-whatsapp', s.whatsapp, (num) => {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        if (/android/i.test(ua)) return `intent://send?phone=${num}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`;
        if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return `whatsapp-smb://send?phone=${num}`;
        return `https://wa.me/${num}`;
    });
    setupQuickAction('qa-flight', s.flight, (f) => `https://www.google.com/search?q=flight+status+${encodeURIComponent(f)}`);
    setupQuickAction('qa-pickup-waze', s.pickup, (addr) => `https://waze.com/ul?q=${encodeURIComponent(addr)}`);
    setupQuickAction('qa-pickup-maps', s.pickup, (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
    setupQuickAction('qa-dest-waze', s.destination, (addr) => `https://waze.com/ul?q=${encodeURIComponent(addr)}`);
    setupQuickAction('qa-dest-maps', s.destination, (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);

    document.getElementById('details-modal').style.display = 'flex';
};

function setupQuickAction(elementId, value, urlFn) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (value && value.trim()) {
        el.href = urlFn(value.trim());
        el.style.display = 'flex';
    } else {
        el.style.display = 'none';
    }
}

window.closeModal = () => { document.getElementById('details-modal').style.display = 'none'; };

window.openDaySelector = (dateStr, items) => {
    const modal = document.getElementById('day-selector-modal');
    document.getElementById('selector-date-display').innerText =
        new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    const list = document.getElementById('selector-list'); list.innerHTML = '';
    items.forEach(s => {
        const card = createServiceCard(s);
        card.onclick = () => { modal.style.display = 'none'; openServiceModal(s); };
        list.appendChild(card);
    });
    modal.style.display = 'flex';
};

window.changeMonth = (dir) => { monthOffset += dir; renderMonth(); };
