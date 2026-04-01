import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDFwECdwELB_wPHR_9rkkY9MRcNBjQSUks",
    authDomain: "viaz-1e406.firebaseapp.com",
    databaseURL: "https://viaz-1e406-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "viaz-1e406",
    storageBucket: "viaz-1e406.firebasestorage.app"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentServiceData = null; // State para o Modal

// ============================================
// 1. SPA NAVIGATION
// ============================================
document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.spa-view').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

function updateHeader() {
    const d = new Date();
    document.getElementById('current-date').innerText = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
}
updateHeader();

// ============================================
// 2. RENDERING ENGINE (HOJE / SEMANA / MÊS)
// ============================================

onValue(ref(db, 'work_pro/services'), (snapshot) => {
    const data = snapshot.val();
    const services = data ? Object.keys(data).map(id => ({ id, ...data[id] })) : [];
    
    renderToday(services);
    renderWeek(services);
    renderMonth(services);
    
    checkAlerts(services);
});

// --- HOJE: Cronológico Minimalista ---
function renderToday(services) {
    const list = document.getElementById('today-list');
    if (!list) return;
    list.innerHTML = '';
    
    const todayStr = new Date().toISOString().split('T')[0];
    const todayItems = services.filter(s => s.date === todayStr);
    
    if (todayItems.length === 0) return list.innerHTML = '<p class="dtl-info" style="padding:20px;">Nenhum serviço para hoje.</p>';

    todayItems.sort((a,b) => (a.time || '').localeCompare(b.time || ''));

    todayItems.forEach(s => {
        const card = document.createElement('div');
        card.className = 'list-card';
        card.onclick = () => openDetails(s);
        card.innerHTML = `
            <div class="card-info">
                <span class="card-title">${s.title}</span>
                <div class="card-meta">
                    <span>🕒 ${s.time || '--:--'}</span>
                    ${s.alertEnabled ? '<span>🔔</span>' : ''}
                </div>
            </div>
            <span style="opacity:0.3;">❯</span>
        `;
        list.appendChild(card);
    });
}

// --- SEMANA: Lista por Dias ---
function renderWeek(services) {
    const container = document.getElementById('week-container');
    if (!container) return;
    container.innerHTML = '';

    const daysMap = { 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado', 0:'Domingo' };
    const today = new Date();

    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(today.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        const dayName = daysMap[d.getDay()];
        
        const dayItems = services.filter(s => s.date === dStr);
        
        const dayHeader = document.createElement('div');
        dayHeader.className = 'week-day-title';
        dayHeader.innerText = i === 0 ? 'Hoje' : (i === 1 ? 'Amanhã' : dayName);
        container.appendChild(dayHeader);

        if (dayItems.length === 0) {
            container.innerHTML += `<p style="font-size:0.85rem; opacity:0.3; padding-left:5px;">Vazio</p>`;
        } else {
            dayItems.sort((a,b) => (a.time || '').localeCompare(b.time || ''));
            dayItems.forEach(s => {
                const card = document.createElement('div');
                card.className = 'list-card';
                card.onclick = () => openDetails(s);
                card.innerHTML = `<div class="card-info"><span class="card-title">${s.title}</span><span class="card-meta">${s.time}</span></div>`;
                container.appendChild(card);
            });
        }
    }
}

// --- MÊS: Grelha com Pontos ---
function renderMonth(services) {
    const grid = document.getElementById('month-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const count = services.filter(s => s.date === dateStr).length;
        
        const dayEl = document.createElement('div');
        dayEl.className = 'month-day';
        dayEl.innerHTML = `<span>${day}</span>`;
        if (count > 0) dayEl.innerHTML += `<div class="day-dot" style="width:${Math.min(4+count, 12)}px; opacity:${0.4+(count*0.2)}"></div>`;
        grid.appendChild(dayEl);
    }
}

// ============================================
// 3. MODAL LOGIC (DETAILS / EDIT / DELETE)
// ============================================
window.openDetails = (item) => {
    currentServiceData = item;
    toggleEditMode(false);
    
    document.getElementById('dtl-title-display').innerText = item.title;
    document.getElementById('dtl-date').innerText = item.date || '--';
    document.getElementById('dtl-time').innerText = item.time || '--:--';
    document.getElementById('dtl-notes').innerText = item.notes || 'Sem notas registradas.';
    document.getElementById('dtl-alert-status').style.display = item.alertEnabled ? 'inline-block' : 'none';
    
    document.getElementById('details-modal').style.display = 'flex';
};

window.closeModal = () => {
    document.getElementById('details-modal').style.display = 'none';
};

window.toggleEditMode = (isEditing) => {
    document.getElementById('dtl-view-mode').style.display = isEditing ? 'none' : 'block';
    document.getElementById('dtl-edit-mode').style.display = isEditing ? 'block' : 'none';
    
    if (isEditing) {
        document.getElementById('edit-title').value = currentServiceData.title;
        document.getElementById('edit-date').value = currentServiceData.date;
        document.getElementById('edit-time').value = currentServiceData.time;
        document.getElementById('edit-notes').value = currentServiceData.notes || '';
        document.getElementById('edit-alert').checked = currentServiceData.alertEnabled;
    }
};

window.saveChanges = async () => {
    if (!currentServiceData) return;
    
    const upd = {
        title: document.getElementById('edit-title').value,
        date: document.getElementById('edit-date').value,
        time: document.getElementById('edit-time').value,
        notes: document.getElementById('edit-notes').value,
        alertEnabled: document.getElementById('edit-alert').checked
    };

    try {
        await update(ref(db, `work_pro/services/${currentServiceData.id}`), upd);
        navigator.vibrate(100);
        
        // Feedback visual
        const btn = document.querySelector('.save-changes-btn');
        btn.innerText = 'GUARDADO! ✔️';
        setTimeout(() => closeModal(), 800);
    } catch(e) { alert('Erro ao atualizar.'); }
};

window.confirmDelete = () => {
    if (confirm("Tem a certeza que deseja APAGAR este serviço?")) {
        deleteItem();
    }
};

async function deleteItem() {
    try {
        await remove(ref(db, `work_pro/services/${currentServiceData.id}`));
        navigator.vibrate([50, 50, 50]);
        closeModal();
    } catch(e) {}
}

// --- TAREFAS LIST SYNC ---
onValue(ref(db, 'work_pro/tasks'), (snapshot) => {
    const data = snapshot.val();
    const list = document.getElementById('tasks-list');
    if (!list) return;
    list.innerHTML = '';
    if (!data) return;

    Object.keys(data).forEach(id => {
        const t = data[id];
        const card = document.createElement('div');
        card.className = 'list-card';
        card.style.borderLeftColor = 'var(--accent-gold)';
        card.innerHTML = `<div class="card-info"><span class="card-title">${t.title}</span></div> <button class="banner-btn" style="background:rgba(255,59,48,0.1); color:var(--accent-red);" onclick="deleteTask('${id}')">OK</button>`;
        list.appendChild(card);
    });
});

window.deleteTask = async (id) => {
    if (confirm("Concluir tarefa?")) {
        await remove(ref(db, `work_pro/tasks/${id}`));
    }
};

// ============================================
// 4. RADAR DE ALERTAS 4H
// ============================================
let activeAlerts = JSON.parse(localStorage.getItem('activeWorkAlerts') || '[]');

function checkAlerts(events) {
    const now = new Date();
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

    events.forEach(ev => {
        if (!ev.date || !ev.time || !ev.alertEnabled) return;
        const evDate = new Date(`${ev.date}T${ev.time}`);
        const diff = evDate - now;

        if (diff > 0 && diff <= FOUR_HOURS_MS) {
            const alertId = `alert_${ev.id}_${ev.date}_${ev.time}`; // Unique id includes time
            if (!activeAlerts.includes(alertId)) {
                triggerAlert(ev.title, alertId);
            }
        }
    });
}

function triggerAlert(title, id) {
    document.getElementById('alert-msg').innerText = `Serviço em 4h: ${title}`;
    document.getElementById('sticky-alert').style.display = 'block';
    
    if (!activeAlerts.includes(id)) {
        activeAlerts.push(id);
        localStorage.setItem('activeWorkAlerts', JSON.stringify(activeAlerts));
    }
}

document.getElementById('dismiss-alert').addEventListener('click', () => {
    document.getElementById('sticky-alert').style.display = 'none';
});

// ============================================
// 5. ADMIN SAVE
// ============================================
document.getElementById('save-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('adm-title').value;
    const date = document.getElementById('adm-date').value;
    const time = document.getElementById('adm-time').value;
    const notes = document.getElementById('adm-notes').value;
    const alertOn = document.getElementById('adm-alert').checked;

    if (!title) return alert('Insira título.');

    try {
        if (date) {
            await push(ref(db, 'work_pro/services'), { title, date, time, notes, alertEnabled: alertOn, createdAt: new Date().toISOString() });
        } else {
            await push(ref(db, 'work_pro/tasks'), { title, createdAt: new Date().toISOString() });
        }
        document.getElementById('adm-title').value = '';
        document.getElementById('adm-notes').value = '';
        alert('Gravado com sucesso!');
    } catch(e) { alert('Erro.'); }
});
