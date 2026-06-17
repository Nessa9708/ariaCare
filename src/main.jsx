import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Bell,
  CalendarDays,
  Clock3,
  Download,
  Droplets,
  FileText,
  Heart,
  Home,
  Lock,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Soup,
  Syringe,
  TrendingUp,
  Users,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FAMILY_ID, supabase, supabaseConfigured, usernameToEmail } from './supabaseClient';
import './styles.css';

const STORAGE_KEY = 'ariacare.entries.v1';
const USER_KEY = 'ariacare.currentUser.v1';
const PROFILE_KEY = 'ariacare.profile.v1';
const EXPORT_HISTORY_KEY = 'ariacare.exportHistory.v1';
const PASSWORDS_KEY = 'ariacare.passwords.v1';
const THEME_KEY = 'ariacare.theme.v1';
const NOTIFIED_KEY = 'ariacare.notifiedReminders.v1';

const nowIso = () => new Date().toISOString();
const todayDate = () => new Date().toISOString().slice(0, 10);

const initialEntries = [];


function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

function getEntryTime(entry) {
  return entry.loggedAt || entry.injectedAt || nowIso();
}

function addMinutes(value, minutes) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'Due now';
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

function convertGlucoseValue(value, fromUnit = 'mmol/L', toUnit = 'mmol/L') {
  const number = Number(value);
  if (Number.isNaN(number)) return null;
  if (fromUnit === toUnit) return number;
  if (fromUnit === 'mmol/L' && toUnit === 'mg/dL') return number * 18.0182;
  if (fromUnit === 'mg/dL' && toUnit === 'mmol/L') return number / 18.0182;
  return number;
}

function isWithinRange(dateValue, range) {
  const date = new Date(dateValue);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = startOfToday.getDay() || 7;
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfToday.getDate() - dayOfWeek + 1);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
  const endOfLastWeek = new Date(startOfThisWeek);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLast30 = new Date(startOfToday);
  startOfLast30.setDate(startOfToday.getDate() - 29);

  if (range === 'thisWeek') return date >= startOfThisWeek;
  if (range === 'lastWeek') return date >= startOfLastWeek && date < endOfLastWeek;
  if (range === 'thisMonth') return date >= startOfThisMonth;
  if (range === 'last30') return date >= startOfLast30;
  return true;
}

function rangeLabel(range) {
  return {
    thisWeek: 'This week',
    lastWeek: 'Last week',
    thisMonth: 'This month',
    last30: 'Last 30 days',
    all: 'All records',
  }[range] || 'This week';
}

function toLocalDate(value = nowIso()) {
  return new Date(value).toISOString().slice(0, 10);
}

function toLocalTime(value = nowIso()) {
  return new Date(value).toTimeString().slice(0, 5);
}

function combineDateAndTime(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue || '00:00'}:00`).toISOString();
}

function rowToEntry(row) {
  return {
    ...row.payload,
    id: row.id,
    kind: row.kind,
    loggedAt: row.payload?.loggedAt || row.logged_at,
    injectedAt: row.payload?.injectedAt,
    loggedBy: row.logged_by,
    archived: row.archived,
    cloudSynced: true,
  };
}

function entryToPayload(entry) {
  const { cloudSynced, ...payload } = entry;
  return payload;
}

function greetingName(user) {
  const username = (user?.username || '').toLowerCase();
  return username.includes('dad') ? 'Nick' : 'Meg';
}

function App() {
  const [user, setUser] = useState(() => {
    if (supabaseConfigured) return null;
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [tab, setTab] = useState('home');
  const [loading, setLoading] = useState(supabaseConfigured);
  const [cloudMode, setCloudMode] = useState(supabaseConfigured);
  const [entries, setEntries] = useState(() => {
    if (supabaseConfigured) return [];
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : initialEntries;
  });
  const [profile, setProfile] = useState(() => {
    const saved = localStorage.getItem(PROFILE_KEY);
    return saved ? JSON.parse(saved) : { childName: 'Aria', unit: 'mmol/L' };
  });
  const [exportHistory, setExportHistory] = useState(() => {
    const saved = localStorage.getItem(EXPORT_HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    async function initCloud() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const email = data.session.user.email || '';
        const username = email.split('@')[0];
        const displayName = username.includes('dad') ? 'Dad' : 'Mom';
        setUser({ id: data.session.user.id, username, displayName, email });
        await loadCloudEntries();
      }
      setLoading(false);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      const email = session.user.email || '';
      const username = email.split('@')[0];
      const displayName = username.includes('dad') ? 'Dad' : 'Mom';
      setUser({ id: session.user.id, username, displayName, email });
    });

    initCloud();
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(exportHistory));
  }, [exportHistory]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  async function loadCloudEntries() {
    if (!supabaseConfigured) return;
    const { data, error } = await supabase
      .from('ariacare_entries')
      .select('*')
      .eq('family_id', FAMILY_ID)
      .order('logged_at', { ascending: false });
    if (error) {
      alert(`Could not load Supabase records: ${error.message}`);
      return;
    }
    setEntries((data || []).map(rowToEntry));
  }

  async function insertCloudEntry(entry) {
    const row = {
      family_id: FAMILY_ID,
      kind: entry.kind,
      logged_at: getEntryTime(entry),
      logged_by: user.displayName,
      archived: Boolean(entry.archived),
      payload: entryToPayload(entry),
      created_by: user.id,
    };
    const { data, error } = await supabase.from('ariacare_entries').insert(row).select('*').single();
    if (error) throw error;
    return rowToEntry(data);
  }

  async function updateCloudEntry(entry) {
    const { data, error } = await supabase
      .from('ariacare_entries')
      .update({
        kind: entry.kind,
        logged_at: getEntryTime(entry),
        logged_by: entry.loggedBy || user.displayName,
        archived: Boolean(entry.archived),
        payload: entryToPayload(entry),
        updated_at: nowIso(),
      })
      .eq('id', entry.id)
      .select('*')
      .single();
    if (error) throw error;
    return rowToEntry(data);
  }

  async function deleteCloudEntry(entry) {
    const { error } = await supabase.from('ariacare_entries').delete().eq('id', entry.id);
    if (error) throw error;
  }

  async function handleLogin(username, password = '', remember = true) {
    if (supabaseConfigured) {
      const email = usernameToEmail(username);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        alert(`Login failed: ${error.message}. Check Supabase URL/key and then mom/dad password.`);
        return;
      }
      const displayName = username.toLowerCase().includes('dad') ? 'Dad' : 'Mom';
      const newUser = { id: data.user.id, username, displayName, email };
      setUser(newUser);
      await loadCloudEntries();
      return;
    }

    const displayName = username.toLowerCase().includes('dad') ? 'Dad' : 'Mom';
    const newUser = { username, displayName };
    if (remember) localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    const savedEntries = localStorage.getItem(STORAGE_KEY);
    setEntries(savedEntries ? JSON.parse(savedEntries) : []);
    setUser(newUser);
  }

  async function handleLogout() {
    if (supabaseConfigured) {
      await supabase.auth.signOut();
      setEntries([]);
    }
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  async function addEntry(entry) {
    const timestamp = entry.loggedAt || entry.injectedAt || nowIso();
    const savedEntry = {
      ...entry,
      id: crypto.randomUUID(),
      loggedAt: entry.kind === 'insulin' ? entry.loggedAt : timestamp,
      injectedAt: entry.kind === 'insulin' ? (entry.injectedAt || timestamp) : entry.injectedAt,
      createdAt: nowIso(),
      loggedBy: user.displayName,
      archived: false,
    };

    try {
      if (supabaseConfigured && user?.id) {
        const cloudEntry = await insertCloudEntry(savedEntry);
        setEntries((current) => [cloudEntry, ...current]);
      } else {
        setEntries((current) => [savedEntry, ...current]);
      }
      setToast(`${entry.kind.charAt(0).toUpperCase() + entry.kind.slice(1)} saved`);
      window.setTimeout(() => setToast(''), 2500);
      setTab('home');
    } catch (error) {
      alert(`Save failed: ${error.message}`);
    }
  }

  async function updateEntry(updatedEntry) {
    try {
      if (supabaseConfigured && user?.id) {
        const cloudEntry = await updateCloudEntry(updatedEntry);
        setEntries((current) => current.map((entry) => entry.id === cloudEntry.id ? cloudEntry : entry));
      } else {
        setEntries((current) => current.map((entry) => entry.id === updatedEntry.id ? updatedEntry : entry));
      }
      setToast('Entry updated');
      window.setTimeout(() => setToast(''), 2500);
    } catch (error) {
      alert(`Update failed: ${error.message}`);
    }
  }

  async function deleteEntry(entryToDelete) {
    if (!confirm('Delete this entry?')) return;
    try {
      if (supabaseConfigured && user?.id) await deleteCloudEntry(entryToDelete);
      setEntries((current) => current.filter((entry) => entry.id !== entryToDelete.id));
      setToast('Entry deleted');
      window.setTimeout(() => setToast(''), 2500);
    } catch (error) {
      alert(`Delete failed: ${error.message}`);
    }
  }

  function editEntry(entry) {
    const date = prompt('Entry date (YYYY-MM-DD):', toLocalDate(getEntryTime(entry)));
    if (!date) return;
    const time = prompt('Entry time (HH:MM):', toLocalTime(getEntryTime(entry)));
    if (!time) return;
    const updatedTime = combineDateAndTime(date, time);
    let updated = { ...entry, loggedAt: updatedTime, updatedAt: nowIso() };
    if (entry.kind === 'insulin') updated = { ...updated, injectedAt: updatedTime };

    if (entry.kind === 'glucose') {
      const value = prompt('Glucose reading:', entry.value || '');
      if (value === null) return;
      updated.value = value;
    }
    if (entry.kind === 'meal') {
      const mealType = prompt('Meal type:', entry.mealType || 'Breakfast');
      if (mealType === null) return;
      updated.mealType = mealType;
    }
    if (entry.kind === 'insulin') {
      const dose = prompt('Insulin dose:', entry.dose || '');
      if (dose === null) return;
      updated.dose = dose;
    }
    if (entry.kind === 'note') {
      const notes = prompt('Note:', entry.notes || '');
      if (notes === null) return;
      updated.notes = notes;
    }
    updateEntry(updated);
  }

  if (loading) return <div className="login-page"><div className="brand-card"><h1>AriaCare</h1><p className="subtle">Loading...</p></div></div>;
  if (!user) return <LoginScreen onLogin={handleLogin} cloudMode={cloudMode} />;

  return (
    <div className="app-shell">
      <main className="phone-frame">
        {tab === 'home' && <Dashboard user={user} profile={profile} entries={entries} setEntries={setEntries} setTab={setTab} onEdit={editEntry} onDelete={deleteEntry} />}
        {tab === 'log' && <LogEntry unit={profile.unit} onAdd={addEntry} />}
        {tab === 'insights' && <Insights entries={entries} unit={profile.unit} />}
        {tab === 'timeline' && <TimelineScreen entries={entries} onEdit={editEntry} onDelete={deleteEntry} />}
        {tab === 'settings' && <SettingsPage profile={profile} setProfile={setProfile} entries={entries} setEntries={setEntries} exportHistory={exportHistory} setExportHistory={setExportHistory} theme={theme} setTheme={setTheme} isOnline={isOnline} onLogout={handleLogout} />}
        <div className={`online-pill ${isOnline ? 'online' : 'offline'}`}>{isOnline ? 'Online' : 'Offline mode'}</div>
        <div className={`cloud-pill ${supabaseConfigured ? 'cloud' : 'local'}`}>{supabaseConfigured ? 'Cloud sync' : 'Local test'}</div>
        {toast && <div className="toast">{toast}</div>}
        <BottomNav active={tab} setTab={setTab} />
      </main>
    </div>
  );
}

function LoginScreen({ onLogin, cloudMode }) {
  const [username, setUsername] = useState('mom');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  function submit(event) {
    event.preventDefault();
    if (!username.trim()) return;
    const savedPasswords = JSON.parse(localStorage.getItem(PASSWORDS_KEY) || '{}');
    const expected = savedPasswords[username.trim().toLowerCase()];
    if (expected && password !== expected) {
      alert('Incorrect password for this demo user.');
      return;
    }
    onLogin(username.trim(), password, remember);
  }

  function forgotPassword() {
    alert('For the demo, Vanessa/admin would reset this. In Supabase we will add a proper admin reset flow.');
  }

  return (
    <div className="login-page">
      <div className="brand-card">
        <div className="logo-mark"><Heart size={32} /></div>
        <h1>AriaCare</h1>
        <p className="tagline">Track. Share. Care.</p>
        <p className="subtle">Simple daily tracking for Aria’s glucose, meals and insulin.</p>{cloudMode && <p className="cloud-note">Cloud sync mode</p>}
      </div>

      <form className="login-card" onSubmit={submit}>
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="mom or dad" />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Enter password" />
        <button type="submit" className="primary-button">Log in</button>
        <div className="login-actions"><label className="remember-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label><button type="button" onClick={forgotPassword}>Forgot password?</button></div>
      </form>
    </div>
  );
}

function Dashboard({ user, profile, entries, setEntries, setTab, onEdit, onDelete }) {
  const activeEntries = entries.filter((entry) => !entry.archived);
  const todayEntries = useMemo(() => {
    const today = todayDate();
    return activeEntries.filter((entry) => getEntryTime(entry).slice(0, 10) === today).sort((a, b) => new Date(getEntryTime(b)) - new Date(getEntryTime(a)));
  }, [entries]);

  const wakeUp = todayEntries.find((e) => e.kind === 'glucose' && e.type === 'Wake-up');
  const meals = todayEntries.filter((e) => e.kind === 'meal');
  const latestMeal = meals[0];
  const insulin = todayEntries.find((e) => e.kind === 'insulin');
  const pendingCount = todayEntries.filter((entry) => (entry.kind === 'meal' && !entry.thirtyMinGlucose) || (entry.kind === 'insulin' && !entry.twoHourGlucose)).length;

  return (
    <section className="screen dashboard-screen">
      <div className="top-row">
        <div>
          <h2>Hi {greetingName(user)} 💜</h2>
          <p className="muted">{`Here’s ${profile.childName}’s overview for today.`}</p>
        </div>
        <div className="avatar">{profile.childName.slice(0, 1)}</div>
      </div>

      <div className="section-title"><span>Today at a glance</span><button onClick={() => setTab('log')}>Add</button></div>
      <div className="stat-grid">
        <StatCard icon={<Droplets />} label="Wake-up" value={wakeUp?.value || '—'} detail={wakeUp?.unit || profile.unit} />
        <StatCard icon={<Soup />} label="Meals today" value={meals.length} detail={latestMeal ? `Latest: ${latestMeal.mealType}` : 'No meal yet'} />
        <StatCard icon={<Syringe />} label="Insulin" value={insulin ? formatTime(insulin.injectedAt) : '—'} detail={insulin?.dose ? `${insulin.dose} units` : 'No log yet'} />
        <StatCard icon={<Clock3 />} label="Follow-ups" value={pendingCount} detail="Pending" />
      </div>

      <ReminderCard entries={todayEntries} setEntries={setEntries} setTab={setTab} />

      <div className="section-title"><span>Today’s timeline</span><button onClick={() => setTab('timeline')}>View all</button></div>
      <div className="timeline">
        {todayEntries.length ? todayEntries.map((entry) => <TimelineItem key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} />) : <EmptyState text="No logs added today yet." />}
      </div>
    </section>
  );
}

function StatCard({ icon, label, value, detail }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <small>{detail}</small>
        <span>{label}</span>
      </div>
    </div>
  );
}

function TimelineItem({ entry, onEdit, onDelete }) {
  const icon = entry.kind === 'meal' ? <Soup /> : entry.kind === 'insulin' ? <Syringe /> : entry.kind === 'note' ? <FileText /> : <Droplets />;
  const title = entry.kind === 'meal'
    ? `${entry.mealType}: ${entry.foods?.map((f) => `${f.name} ${f.weight || ''}${f.unit || ''}${f.carbs ? `, ${f.carbs}g carbs` : ''}`).join(', ')}${entry.beforeGlucose ? ` • Before ${entry.beforeGlucose} ${entry.glucoseUnit || entry.unit || 'mmol/L'}` : ''}${entry.thirtyMinGlucose ? ` • 30-min ${entry.thirtyMinGlucose}` : ''}`
    : entry.kind === 'insulin'
      ? `${entry.insulinType} insulin, ${entry.dose || '—'} units${entry.glucoseAtInjection ? ` • Glucose ${entry.glucoseAtInjection} ${entry.glucoseUnit || 'mmol/L'}` : ''}`
      : entry.kind === 'note'
        ? `Note: ${entry.notes || 'No details'}`
        : `${entry.type} glucose: ${entry.value} ${entry.unit}`;

  return (
    <div className="timeline-item">
      <div className="timeline-icon">{icon}</div>
      <div className="timeline-content">
        <div><strong>{formatTime(getEntryTime(entry))}</strong><span>{title}</span></div>
        <small>Logged by {entry.loggedBy}</small>
        {onEdit && onDelete && <div className="entry-actions"><button onClick={() => onEdit(entry)}>Edit</button><button onClick={() => onDelete(entry)}>Delete</button></div>}
      </div>
    </div>
  );
}

function LogEntry({ unit, onAdd }) {
  const [kind, setKind] = useState('glucose');

  return (
    <section className="screen">
      <h2>Log Entry</h2>
      <div className="log-tabs">
        <button className={kind === 'glucose' ? 'active' : ''} onClick={() => setKind('glucose')}><Droplets />Glucose</button>
        <button className={kind === 'meal' ? 'active' : ''} onClick={() => setKind('meal')}><Soup />Meal</button>
        <button className={kind === 'insulin' ? 'active' : ''} onClick={() => setKind('insulin')}><Syringe />Insulin</button>
        <button className={kind === 'note' ? 'active' : ''} onClick={() => setKind('note')}><FileText />Note</button>
      </div>
      {kind === 'glucose' && <GlucoseForm unit={unit} onAdd={onAdd} />}
      {kind === 'meal' && <MealForm unit={unit} onAdd={onAdd} />}
      {kind === 'insulin' && <InsulinForm unit={unit} onAdd={onAdd} />}
      {kind === 'note' && <NoteForm onAdd={onAdd} />}
    </section>
  );
}

function GlucoseForm({ unit, onAdd }) {
  const [value, setValue] = useState('');
  const [type, setType] = useState('Wake-up');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toLocalDate());
  const [time, setTime] = useState(toLocalTime());
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onAdd({ kind: 'glucose', type, value, unit, loggedAt: combineDateAndTime(date, time), notes, archived: false }); }}>
      <div className="date-time-grid"><label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label></div>
      <label>Glucose reading</label>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="6.2" />
      <label>Type</label>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option>Wake-up</option><option>Before food</option><option>After food</option><option>30-min post food</option><option>Insulin time</option><option>2-hours after insulin</option><option>Other</option>
      </select>
      <label>Notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note..." />
      <button className="primary-button">Save Entry</button>
    </form>
  );
}

function MealForm({ unit, onAdd }) {
  const [mealType, setMealType] = useState('Breakfast');
  const [beforeGlucose, setBeforeGlucose] = useState('');
  const [afterGlucose, setAfterGlucose] = useState('');
  const [thirtyMinGlucose, setThirtyMinGlucose] = useState('');
  const [foods, setFoods] = useState([{ name: '', weight: '', unit: 'g', carbs: '' }]);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toLocalDate());
  const [time, setTime] = useState(toLocalTime());

  function updateFood(index, field, value) {
    setFoods((current) => current.map((food, i) => i === index ? { ...food, [field]: value } : food));
  }

  function addFood() {
    setFoods((current) => [...current, { name: '', weight: '', unit: 'g', carbs: '' }]);
  }

  function removeFood(index) {
    setFoods((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
  }

  return (
    <form className="form" onSubmit={(e) => {
      e.preventDefault();
      const cleanFoods = foods
        .map((food) => ({ ...food, name: food.name || 'Food' }))
        .filter((food) => food.name || food.weight || food.carbs);
      onAdd({ kind: 'meal', mealType, beforeGlucose, afterGlucose, thirtyMinGlucose, glucoseUnit: unit, foods: cleanFoods.length ? cleanFoods : [{ name: 'Food', weight: '', unit: 'g', carbs: '' }], loggedAt: combineDateAndTime(date, time), notes, archived: false });
    }}>
      <div className="date-time-grid"><label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label></div>
      <label>Meal type</label>
      <select value={mealType} onChange={(e) => setMealType(e.target.value)}><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option></select>
      <label>Before-food glucose</label><input value={beforeGlucose} onChange={(e) => setBeforeGlucose(e.target.value)} placeholder="6.2" />
      <div className="food-list-header"><label>Food items</label><button type="button" onClick={addFood}>+ Add food</button></div>
      {foods.map((food, index) => (
        <div className="food-item" key={index}>
          <input value={food.name} onChange={(e) => updateFood(index, 'name', e.target.value)} placeholder="Food name" />
          <div className="food-grid">
            <input value={food.weight} onChange={(e) => updateFood(index, 'weight', e.target.value)} placeholder="Weight" />
            <select value={food.unit} onChange={(e) => updateFood(index, 'unit', e.target.value)}><option>g</option><option>ml</option><option>portion</option></select>
            <input value={food.carbs} onChange={(e) => updateFood(index, 'carbs', e.target.value)} placeholder="Carbs" />
          </div>
          {foods.length > 1 && <button className="remove-food" type="button" onClick={() => removeFood(index)}>Remove</button>}
        </div>
      ))}
      <label>After-food glucose</label><input value={afterGlucose} onChange={(e) => setAfterGlucose(e.target.value)} placeholder="Optional" />
      <label>30-min glucose</label><input value={thirtyMinGlucose} onChange={(e) => setThirtyMinGlucose(e.target.value)} placeholder="Optional" />
      <label>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="primary-button">Save Meal</button>
    </form>
  );
}

function InsulinForm({ unit, onAdd }) {
  const [insulinType, setInsulinType] = useState('Rapid acting');
  const [dose, setDose] = useState('');
  const [glucoseAtInjection, setGlucoseAtInjection] = useState('');
  const [twoHourGlucose, setTwoHourGlucose] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toLocalDate());
  const [time, setTime] = useState(toLocalTime());
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onAdd({ kind: 'insulin', insulinType, dose, glucoseAtInjection, twoHourGlucose, glucoseUnit: unit, injectedAt: combineDateAndTime(date, time), notes, archived: false }); }}>
      <div className="date-time-grid"><label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label></div>
      <label>Insulin type</label><input value={insulinType} onChange={(e) => setInsulinType(e.target.value)} />
      <label>Dose</label><input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Units" />
      <label>Glucose at injection</label><input value={glucoseAtInjection} onChange={(e) => setGlucoseAtInjection(e.target.value)} placeholder="7.1" />
      <label>2-hour glucose</label><input value={twoHourGlucose} onChange={(e) => setTwoHourGlucose(e.target.value)} placeholder="Optional" />
      <label>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="primary-button">Save Insulin</button>
    </form>
  );
}

function NoteForm({ onAdd }) {
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toLocalDate());
  const [time, setTime] = useState(toLocalTime());
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onAdd({ kind: 'note', notes, loggedAt: combineDateAndTime(date, time), archived: false }); }}>
      <div className="date-time-grid"><label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label></div>
      <label>Note</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything useful for today..." />
      <button className="primary-button">Save Note</button>
    </form>
  );
}

function Insights({ entries, unit }) {
  const [range, setRange] = useState('thisWeek');
  const activeEntries = entries
    .filter((entry) => !entry.archived)
    .filter((entry) => isWithinRange(getEntryTime(entry), range));

  const glucoseValues = activeEntries.flatMap((entry) => {
    if (entry.kind === 'glucose' && entry.value) {
      return [convertGlucoseValue(entry.value, entry.unit || unit, unit)];
    }
    if (entry.kind === 'meal') {
      return [entry.beforeGlucose, entry.afterGlucose, entry.thirtyMinGlucose]
        .filter(Boolean)
        .map((value) => convertGlucoseValue(value, entry.glucoseUnit || unit, unit));
    }
    if (entry.kind === 'insulin') {
      return [entry.glucoseAtInjection, entry.twoHourGlucose]
        .filter(Boolean)
        .map((value) => convertGlucoseValue(value, entry.glucoseUnit || unit, unit));
    }
    return [];
  }).filter((v) => v !== null && !Number.isNaN(v));

  const avg = glucoseValues.length ? (glucoseValues.reduce((a, b) => a + b, 0) / glucoseValues.length).toFixed(unit === 'mg/dL' ? 0 : 1) : '—';
  const missing = activeEntries.filter((entry) => (entry.kind === 'meal' && !entry.thirtyMinGlucose) || (entry.kind === 'insulin' && !entry.twoHourGlucose)).length;

  return (
    <section className="screen">
      <h2>Insights</h2>
      <div className="insight-card large">
        <div className="section-title insight-title">
          <span>Average glucose</span>
          <label className="range-picker"><CalendarDays size={15} /><select value={range} onChange={(e) => setRange(e.target.value)}><option value="thisWeek">This week</option><option value="lastWeek">Last week</option><option value="thisMonth">This month</option><option value="last30">Last 30 days</option><option value="all">All records</option></select></label>
        </div>
        <strong className="big-number">{avg}</strong><span> {unit}</span>
        <p className="muted small-copy">Based on {glucoseValues.length} glucose values for {rangeLabel(range).toLowerCase()}.</p>
        <div className="mini-chart"><i /><i /><i /><i /><i /><i /><i /></div>
      </div>
      <div className="insight-list">
        <Insight icon={<TrendingUp />} title={`${rangeLabel(range)} trends will become more useful as more data is logged.`} />
        <Insight icon={<Clock3 />} title={`${missing} follow-up readings are currently missing for this period.`} />
        <Insight icon={<ShieldCheck />} title="Insights are tracking only and do not give medical advice." />
      </div>
      <MonthlySummary entries={entries} unit={unit} />
      <AdvancedTrends entries={entries} unit={unit} />
    </section>
  );
}

function getEntryGlucoseValues(entry, unit) {
  if (entry.kind === 'glucose' && entry.value) return [convertGlucoseValue(entry.value, entry.unit || unit, unit)];
  if (entry.kind === 'meal') return [entry.beforeGlucose, entry.afterGlucose, entry.thirtyMinGlucose].filter(Boolean).map((value) => convertGlucoseValue(value, entry.glucoseUnit || unit, unit));
  if (entry.kind === 'insulin') return [entry.glucoseAtInjection, entry.twoHourGlucose].filter(Boolean).map((value) => convertGlucoseValue(value, entry.glucoseUnit || unit, unit));
  return [];
}

function average(values, unit) {
  const clean = values.filter((value) => value !== null && !Number.isNaN(value));
  if (!clean.length) return '—';
  const avg = clean.reduce((a, b) => a + b, 0) / clean.length;
  return avg.toFixed(unit === 'mg/dL' ? 0 : 1);
}

function MonthlySummary({ entries, unit }) {
  const summaries = Object.values(entries.filter((entry) => !entry.archived).reduce((acc, entry) => {
    const date = new Date(getEntryTime(entry));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = { key, label: date.toLocaleDateString([], { month: 'long', year: 'numeric' }), values: [], meals: 0, insulin: 0 };
    acc[key].values.push(...getEntryGlucoseValues(entry, unit));
    if (entry.kind === 'meal') acc[key].meals += 1;
    if (entry.kind === 'insulin') acc[key].insulin += 1;
    return acc;
  }, {})).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 3);

  return (
    <div className="settings-group summary-group">
      <h3>Monthly summaries</h3>
      {summaries.length === 0 && <p className="muted">No monthly data yet.</p>}
      {summaries.map((summary) => <div className="summary-row" key={summary.key}><strong>{summary.label}</strong><span>Avg {average(summary.values, unit)} {unit} • {summary.meals} meals • {summary.insulin} insulin logs</span></div>)}
    </div>
  );
}

function AdvancedTrends({ entries, unit }) {
  const activeEntries = entries.filter((entry) => !entry.archived);
  const currentWeekValues = activeEntries.filter((entry) => isWithinRange(getEntryTime(entry), 'thisWeek')).flatMap((entry) => getEntryGlucoseValues(entry, unit));
  const lastWeekValues = activeEntries.filter((entry) => isWithinRange(getEntryTime(entry), 'lastWeek')).flatMap((entry) => getEntryGlucoseValues(entry, unit));
  const currentAvg = average(currentWeekValues, unit);
  const lastAvg = average(lastWeekValues, unit);
  const mealCounts = activeEntries.reduce((acc, entry) => {
    if (entry.kind === 'meal') acc[entry.mealType] = (acc[entry.mealType] || 0) + 1;
    return acc;
  }, {});
  const mostLoggedMeal = Object.entries(mealCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="settings-group summary-group">
      <h3>Advanced trends</h3>
      <div className="summary-row"><strong>This week vs last week</strong><span>{currentAvg} {unit} vs {lastAvg} {unit}</span></div>
      <div className="summary-row"><strong>Most logged meal</strong><span>{mostLoggedMeal ? `${mostLoggedMeal[0]} (${mostLoggedMeal[1]} logs)` : 'No meals yet'}</span></div>
    </div>
  );
}

function Insight({ icon, title }) {
  return <div className="insight-row"><span>{icon}</span><p>{title}</p></div>;
}

function TimelineScreen({ entries, onEdit, onDelete }) {
  const activeEntries = entries.filter((entry) => !entry.archived).sort((a, b) => new Date(getEntryTime(b)) - new Date(getEntryTime(a)));
  return (
    <section className="screen">
      <h2>Full Timeline</h2>
      <p className="muted">All active records, newest first.</p>
      <div className="timeline full">
        {activeEntries.length ? activeEntries.map((entry) => <TimelineItem key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} />) : <EmptyState text="No active records yet." />}
      </div>
    </section>
  );
}

function ReminderCard({ entries, setEntries, setTab }) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const reminders = entries
    .flatMap((entry) => {
      if (entry.kind === 'meal' && !entry.thirtyMinGlucose) {
        const dueAt = addMinutes(entry.loggedAt, 30);
        return [{ entry, dueAt, title: `${entry.mealType} 30-min reading`, type: 'meal' }];
      }
      if (entry.kind === 'insulin' && !entry.twoHourGlucose) {
        const dueAt = addMinutes(entry.injectedAt, 120);
        return [{ entry, dueAt, title: 'Insulin 2-hour reading', type: 'insulin' }];
      }
      return [];
    })
    .sort((a, b) => a.dueAt - b.dueAt);

  function completeFollowUp(reminder) {
    const isDue = reminder.dueAt.getTime() <= Date.now();
    if (!isDue) return;
    const value = prompt(reminder.type === 'meal' ? 'Enter the 30-minute post-food glucose reading:' : 'Enter the 2-hour post-insulin glucose reading:');
    if (!value) return;
    setEntries((current) => current.map((item) => {
      if (item.id !== reminder.entry.id) return item;
      return reminder.type === 'meal'
        ? { ...item, thirtyMinGlucose: value, followUpCompletedAt: nowIso() }
        : { ...item, twoHourGlucose: value, followUpCompletedAt: nowIso() };
    }));
  }

  return (
    <div className="reminder-card">
      <div className="reminder-header"><Bell size={18} /> Timers & reminders</div>
      {reminders.length === 0 && <p>All follow-up readings are complete for today.</p>}
      {reminders.map((reminder) => {
        const remaining = reminder.dueAt.getTime() - tick;
        const isDue = remaining <= 0;
        return (
          <button
            key={reminder.entry.id}
            className={`reminder-action ${isDue ? 'due' : 'waiting'}`}
            onClick={() => completeFollowUp(reminder)}
            disabled={!isDue}
          >
            <span className="reminder-main">
              <strong>{reminder.title}</strong>
              <em>{isDue ? 'Reading due now' : `Due at ${formatTime(reminder.dueAt)}`}</em>
            </span>
            <span className="countdown-pill">{formatCountdown(remaining)}</span>
          </button>
        );
      })}
      <button className="secondary-button" onClick={() => setTab('log')}>Add new log</button>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function SettingsPage({ profile, setProfile, entries, setEntries, exportHistory, setExportHistory, theme, setTheme, isOnline, onLogout }) {
  const [archiveDays, setArchiveDays] = useState(365);
  const [showArchived, setShowArchived] = useState(false);
  const activeEntries = entries.filter((entry) => !entry.archived);
  const archivedEntries = entries.filter((entry) => entry.archived);
  const storageEstimate = Math.min(500, Math.ceil(JSON.stringify(entries).length / 1024));

  function exportPdf() {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text('AriaCare Export', 14, 20);
    doc.setFontSize(11);
    doc.text(`Child: ${profile.childName}`, 14, 29);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 37);
    doc.text('This report is a tracking summary only and does not replace medical advice.', 14, 45);

    const rows = activeEntries.map((entry) => [
      formatDate(getEntryTime(entry)),
      formatTime(getEntryTime(entry)),
      entry.kind,
      entry.kind === 'glucose' ? `${entry.type}: ${entry.value} ${entry.unit}` : entry.kind === 'meal' ? `${entry.mealType}: ${entry.foods?.map((f) => `${f.name} ${f.weight || ''}${f.unit || ''}${f.carbs ? `, ${f.carbs}g carbs` : ''}`).join(', ')} | Before: ${entry.beforeGlucose || '-'} | After: ${entry.afterGlucose || '-'} | 30-min: ${entry.thirtyMinGlucose || '-'}` : entry.kind === 'insulin' ? `${entry.insulinType}: ${entry.dose} units | At injection: ${entry.glucoseAtInjection || '-'} | 2-hour: ${entry.twoHourGlucose || '-'}` : entry.notes,
      entry.loggedBy || '',
    ]);

    autoTable(doc, {
      head: [['Date', 'Time', 'Type', 'Details', 'Logged by']],
      body: rows,
      startY: 53,
    });
    doc.save('AriaCare-export.pdf');
    const historyItem = { id: crypto.randomUUID(), generatedAt: nowIso(), recordCount: activeEntries.length, fileName: 'AriaCare-export.pdf' };
    setExportHistory((current) => [historyItem, ...current].slice(0, 10));
  }

  function archiveOldRecords() {
    const retention = Number(archiveDays);
    if (!retention) {
      alert('Retention is set to keep everything, so no records were archived.');
      return;
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retention);
    const count = entries.filter((entry) => !entry.archived && new Date(getEntryTime(entry)) < cutoff).length;
    if (count === 0) {
      alert('No records are old enough to archive yet.');
      return;
    }
    if (!confirm(`Archive ${count} records older than the retention period? Make sure a PDF export was saved first.`)) return;
    setEntries((current) => current.map((entry) => new Date(getEntryTime(entry)) < cutoff ? { ...entry, archived: true, archivedAt: nowIso() } : entry));
  }

  function restoreArchivedRecords() {
    if (archivedEntries.length === 0) {
      alert('There are no archived records to restore.');
      return;
    }
    if (!confirm(`Restore ${archivedEntries.length} archived records?`)) return;
    setEntries((current) => current.map((entry) => entry.archived ? { ...entry, archived: false, restoredAt: nowIso() } : entry));
  }

  function permanentCleanup() {
    if (archivedEntries.length === 0) {
      alert('There are no archived records to permanently delete.');
      return;
    }
    if (!confirm(`Permanently delete ${archivedEntries.length} archived records? This cannot be undone.`)) return;
    setEntries((current) => current.filter((entry) => !entry.archived));
  }

  function editProfile() {
    const childName = prompt('Child name:', profile.childName) || profile.childName;
    setProfile((current) => ({ ...current, childName }));
  }

  function showUsers() {
    alert('Users linked to this family: Mom and Dad. Supabase will store these as separate app users linked to the same child profile.');
  }

  async function changePassword() {
    if (supabaseConfigured) {
      const password = prompt('Enter a new Supabase password for the currently logged-in user:');
      if (!password) return;
      if (password.length < 6) {
        alert('Please use at least 6 characters.');
        return;
      }
      const confirmPassword = prompt('Confirm the new Supabase password:');
      if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        alert(`Password update failed: ${error.message}`);
        return;
      }

      alert('Password updated in Supabase. Use the new password next time you log in.');
      if (confirm('Log out now to test the new password?')) {
        onLogout();
      }
      return;
    }

    const username = prompt('Which username should we update? mom or dad');
    if (!username) return;
    const password = prompt(`Enter new demo password for ${username}:`);
    if (!password) return;
    const saved = JSON.parse(localStorage.getItem(PASSWORDS_KEY) || '{}');
    saved[username.toLowerCase()] = password;
    localStorage.setItem(PASSWORDS_KEY, JSON.stringify(saved));
    alert(`Demo password updated for ${username}.`);
  }

  function storageDetails() {
    alert(`Estimated local demo storage: ${storageEstimate} KB. Supabase free database limit target: 500 MB. Active records: ${activeEntries.length}. Archived records: ${archivedEntries.length}.`);
  }

  async function enableNotifications() {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    alert(permission === 'granted' ? 'Browser reminders enabled for this device.' : 'Notifications were not enabled.');
  }

  return (
    <section className="screen">
      <h2>Settings</h2>
      <button className="profile-card profile-button" onClick={editProfile}><div className="avatar small">{profile.childName.slice(0, 1)}</div><div><strong>{profile.childName}</strong><p>Manage child profile</p></div></button>
      <div className="settings-group">
        <h3>Data & Storage</h3>
        <SettingRow icon={<Activity />} title="Storage usage" detail={`${storageEstimate} KB / 500 MB`} action={storageDetails} />
        <label className="setting-field">Glucose unit<select value={profile.unit} onChange={(e) => setProfile((current) => ({ ...current, unit: e.target.value }))}><option value="mmol/L">mmol/L</option><option value="mg/dL">mg/dL</option></select></label>
        <SettingRow icon={<Download />} title="Export records as PDF" action={exportPdf} />
        <SettingRow icon={<FileText />} title="Archive old records" detail={`${archivedEntries.length} archived`} action={archiveOldRecords} />
        <SettingRow icon={<ShieldCheck />} title="Restore archived records" detail="Undo archive" action={restoreArchivedRecords} />
        <SettingRow icon={<FileText />} title="Permanent cleanup" detail="Delete archived" action={permanentCleanup} />
        <SettingRow icon={<FileText />} title="Clear all demo data" detail="Testing only" action={() => { if (confirm('Clear all local demo records and start empty?')) setEntries([]); }} />
        <label className="setting-field">Retention period<select value={archiveDays} onChange={(e) => setArchiveDays(e.target.value)}><option value="365">12 months</option><option value="730">24 months</option><option value="0">Keep everything</option></select></label>
      </div>
      <div className="settings-group">
        <h3>Export History</h3>
        {exportHistory.length === 0 && <p className="muted">No exports generated yet.</p>}
        {exportHistory.map((item) => <div className="history-row" key={item.id}><strong>{item.fileName}</strong><span>{formatDate(item.generatedAt)} • {item.recordCount} records</span></div>)}
      </div>
      <div className="settings-group">
        <h3>Account</h3>
        <SettingRow icon={<Users />} title="Users & access" detail="Mom, Dad" action={showUsers} />
        <SettingRow icon={<Bell />} title="Enable browser reminders" detail="This device" action={enableNotifications} />
        <SettingRow icon={<Activity />} title="Connection status" detail={isOnline ? 'Online' : 'Offline mode'} />
        <SettingRow icon={<Activity />} title="Data mode" detail={supabaseConfigured ? 'Cloud sync' : 'Local test'} />
        <label className="setting-field">Theme<select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <SettingRow icon={<Lock />} title="Change password" detail={supabaseConfigured ? "Supabase" : "Demo only"} action={changePassword} />
      </div>
      <button className="secondary-button" onClick={() => setShowArchived((value) => !value)}>{showArchived ? 'Hide' : 'Show'} archived records</button>
      {showArchived && <div className="timeline full archived-list">{archivedEntries.length ? archivedEntries.map((entry) => <TimelineItem key={entry.id} entry={entry} />) : <EmptyState text="No archived records yet." />}</div>}
      <button className="logout-button" onClick={onLogout}><LogOut size={16} /> Log out</button>
    </section>
  );
}

function SettingRow({ icon, title, detail, action }) {
  return <button className="setting-row" onClick={action || (() => {})}><span>{icon}</span><strong>{title}</strong><em>{detail || '›'}</em></button>;
}

function BottomNav({ active, setTab }) {
  const items = [
    ['home', Home, 'Home'],
    ['log', Plus, 'Log'],
    ['insights', TrendingUp, 'Insights'],
    ['settings', Settings, 'Settings'],
  ];
  return (
    <nav className="bottom-nav">
      {items.map(([key, Icon, label]) => <button key={key} className={active === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={20} /><span>{label}</span></button>)}
    </nav>
  );
}

createRoot(document.getElementById('root')).render(<App />);
