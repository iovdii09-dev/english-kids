import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = (id) => document.getElementById(id);
const status = $('connectionStatus');
const modal = $('loginModal');
const message = $('authMessage');
let supabase;

function say(text, error = false) {
  message.textContent = text;
  message.style.color = error ? '#b42318' : '#287653';
}
function showLogin() { modal.classList.add('show'); }
function hideLogin() { modal.classList.remove('show'); }
function setSignedOut() {
  window.setEnglishKidsUser(null);
  $('studentBadge').textContent = 'Гість';
  $('loginBtn').textContent = 'Увійти / Реєстрація';
  $('teacherBtn').style.display = 'none';
}
async function loadProfile(user) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, class_id')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw new Error('Профіль не знайдено. Перевірте тригер створення профілю в Supabase.');
  if (!['teacher', 'student'].includes(profile.role)) throw new Error('Для облікового запису не призначено роль.');
  if (profile.role === 'student' && !profile.class_id) throw new Error('Учню ще не призначено клас. Попросіть учителя перевірити код.');
  window.setEnglishKidsUser({ name: profile.full_name || user.email || 'Учень', id: user.id, role: profile.role });
  $('loginBtn').textContent = 'Вийти';
  $('teacherBtn').style.display = profile.role === 'teacher' ? 'inline-block' : 'none';
}

if (SUPABASE_URL.startsWith('https://') && SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  status.textContent = 'Supabase підключено. Учнівська реєстрація — за кодом.';
  $('studentSignupFields').style.display = 'block';

  $('loginBtn').addEventListener('click', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { error } = await supabase.auth.signOut();
      if (error) return say(error.message, true);
      setSignedOut();
      say('Ви вийшли з облікового запису.');
    } else showLogin();
  });
  $('cancelLogin').addEventListener('click', hideLogin);

  // Учитель входить у вже створений обліковий запис email + пароль.
  $('authSignIn').addEventListener('click', async () => {
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    if (!email || !password) return say('Для входу вчителя введіть email і пароль.', true);
    say('Перевіряємо вхід учителя…');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return say(error.message, true);
    try {
      await loadProfile(data.user);
      if (data.user.is_anonymous) throw new Error('Це анонімний учнівський сеанс. Спочатку вийдіть.');
      hideLogin();
      say('Вхід учителя виконано.');
    } catch (e) { say(e.message, true); }
  });

  // Учень не вводить email або пароль: створюється анонімний сеанс на цьому пристрої.
  $('authSignUp').addEventListener('click', async () => {
    const fullName = $('authFullName').value.trim();
    const code = $('authInviteCode').value.trim().toUpperCase();
    if (fullName.length < 2 || code.length < 4) return say('Введіть ім’я учня та код від учителя.', true);
    say('Створюємо захищений учнівський сеанс…');
    const { data: current } = await supabase.auth.getSession();
    if (current.session) {
      const { error: outError } = await supabase.auth.signOut();
      if (outError) return say(outError.message, true);
    }
    const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) return say('Не вдалося створити учнівський сеанс: ' + anonError.message, true);
    const { data, error } = await supabase.functions.invoke('student-invite', {
      body: { code, full_name: fullName }
    });
    if (error || data?.error) {
      await supabase.auth.signOut();
      setSignedOut();
      return say(data?.error || error?.message || 'Не вдалося активувати код.', true);
    }
    try {
      await loadProfile(anonData.user);
      hideLogin();
      say('Готово! Учень підключений до свого класу.');
    } catch (e) {
      say(e.message, true);
    }
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) setSignedOut();
    else loadProfile(session.user).catch(e => say(e.message, true));
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    try { await loadProfile(session.user); }
    catch (e) { say(e.message, true); }
  } else setSignedOut();
} else {
  status.textContent = 'Додайте Project URL і publishable key у config.js.';
  $('loginBtn').addEventListener('click', showLogin);
  $('cancelLogin').addEventListener('click', hideLogin);
  $('authSignIn').disabled = true;
  $('authSignUp').disabled = true;
  say('Спочатку підключимо ключі Supabase. Секретний ключ сюди не вставляйте.', true);
}
