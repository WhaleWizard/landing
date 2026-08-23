import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { AdminButton, AdminPanel, AdminSectionHeading } from './AdminUI';
import { notify, useConfirm } from './AdminFeedback';

/**
 * Вход в админку: двухфакторная защита и выход.
 *
 * За одним паролем здесь лежат контакты клиентов, финансы и договоры, поэтому
 * пароля мало. Второй фактор — обычный одноразовый код из приложения
 * (Google Authenticator и любое совместимое).
 *
 * QR-кода нет намеренно: ради одной страницы настройки пришлось бы тащить в
 * сборку генератор QR. Google Authenticator умеет «Ввести ключ настройки»
 * руками, а ключ показывается группами по четыре символа, чтобы его можно
 * было спокойно перепечатать.
 */

interface TwoFactorState {
  configured: boolean;
  enabled: boolean;
  backupCodesLeft: number;
  migrationRequired?: boolean;
}

type SetupData = {
  secretForHuman: string;
  otpauthUri: string;
  account: string;
};

const ERROR_TEXT: Record<string, string> = {
  invalid_code: 'Код не подошёл. Проверьте время на телефоне и введите свежий',
  password_required: 'Введите пароль от админки',
  invalid_credentials: 'Неверный пароль',
  setup_required: 'Сначала создайте ключ',
};

async function callAuth(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> | null }> {
  const res = await fetch('/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null) as Record<string, unknown> | null;
  return { ok: res.ok && payload?.success === true, status: res.status, payload };
}

function describeError(payload: Record<string, unknown> | null): string {
  const code = String(payload?.error || '');
  return ERROR_TEXT[code] || 'Не получилось. Попробуйте ещё раз';
}

export default function AdminSecurity() {
  const confirmAsk = useConfirm();
  const [state, setState] = useState<TwoFactorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { payload } = await callAuth({ action: 'status' });
    const twoFactor = payload?.twoFactor as TwoFactorState | undefined;
    setState(twoFactor || { configured: false, enabled: false, backupCodesLeft: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const startSetup = async () => {
    if (!password.trim()) {
      notify.error('Нужен пароль', 'Введите пароль от админки — он подтверждает, что это вы.');
      return;
    }
    setBusy(true);
    const { ok, payload } = await callAuth({ action: 'setup', password });
    setBusy(false);
    if (!ok) {
      notify.error('Не удалось создать ключ', describeError(payload));
      return;
    }
    setSetup({
      secretForHuman: String(payload?.secretForHuman || ''),
      otpauthUri: String(payload?.otpauthUri || ''),
      account: String(payload?.account || ''),
    });
    setBackupCodes(null);
  };

  const confirmSetup = async () => {
    setBusy(true);
    const { ok, payload } = await callAuth({ action: 'enable', password, code });
    setBusy(false);
    if (!ok) {
      notify.error('Код не принят', describeError(payload));
      return;
    }
    const codes = Array.isArray(payload?.backupCodes) ? (payload.backupCodes as string[]) : [];
    setBackupCodes(codes);
    setSetup(null);
    setCode('');
    setPassword('');
    await refresh();
    notify.success('Двухфакторная защита включена', 'Сохраните резервные коды — они показываются один раз.');
  };

  const disable = async () => {
    const sure = await confirmAsk({
      title: 'Выключить двухфакторную защиту?',
      description: 'Админка снова будет открываться одним паролем. За ним лежат контакты клиентов и финансы.',
      confirmLabel: 'Выключить',
      tone: 'danger',
    });
    if (!sure) return;

    setBusy(true);
    const { ok, payload } = await callAuth({ action: 'disable', password, code });
    setBusy(false);
    if (!ok) {
      notify.error('Не выключено', describeError(payload));
      return;
    }
    setCode('');
    setPassword('');
    await refresh();
    notify.success('Двухфакторная защита выключена', 'Включить обратно можно в любой момент.');
  };

  const logout = async () => {
    await callAuth({ action: 'logout' });
    window.location.reload();
  };

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify.success('Скопировано', what);
    } catch {
      notify.error('Не удалось скопировать', 'Выделите текст и скопируйте вручную.');
    }
  };

  if (loading) {
    return (
      <AdminPanel className="p-6 admin-stack">
        <AdminSectionHeading title="Вход в админку" description="Проверяю настройки…" />
      </AdminPanel>
    );
  }

  return (
    <AdminPanel className="p-6 admin-stack">
      <AdminSectionHeading
        title="Вход в админку"
        description="Пароль плюс одноразовый код из приложения на телефоне."
        action={<AdminButton tone="quiet" onClick={() => { void logout(); }}><LogOut aria-hidden="true" /> Выйти</AdminButton>}
      />

      {state?.migrationRequired ? (
        <p className="admin-meta">
          Двухфакторная защита требует миграции <code>0036_admin_2fa.sql</code>. Примените её в консоли D1 — вход по паролю
          продолжает работать.
        </p>
      ) : state?.enabled ? (
        <div className="admin-stack">
          <p className="admin-meta">
            <ShieldCheck aria-hidden="true" /> Защита включена. Резервных кодов осталось: {state.backupCodesLeft}.
          </p>
          <div className="admin-field">
            <label htmlFor="sec-password" className="admin-label">Пароль от админки</label>
            <input id="sec-password" type="password" autoComplete="current-password" className="admin-input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="admin-field">
            <label htmlFor="sec-code" className="admin-label">Код из приложения или резервный код</label>
            <input id="sec-code" type="text" inputMode="numeric" autoComplete="one-time-code" className="admin-input" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <AdminButton tone="danger" disabled={busy} onClick={() => { void disable(); }}>
            <ShieldOff aria-hidden="true" /> Выключить защиту
          </AdminButton>
        </div>
      ) : setup ? (
        <div className="admin-stack">
          <p className="admin-meta">
            Откройте Google Authenticator → «Добавить» → <b>«Ввести ключ настройки»</b>. Название — {setup.account},
            тип ключа — «По времени».
          </p>
          <div className="admin-field">
            <span className="admin-label">Ключ</span>
            <p className="admin-secret">{setup.secretForHuman}</p>
            <AdminButton compact tone="quiet" onClick={() => { void copy(setup.secretForHuman.replace(/\s+/g, ''), 'Ключ настройки'); }}>
              <Copy aria-hidden="true" /> Скопировать ключ
            </AdminButton>
          </div>
          <div className="admin-field">
            <label htmlFor="sec-confirm" className="admin-label">Код из приложения</label>
            <input id="sec-confirm" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="6 цифр" className="admin-input" value={code} onChange={(e) => setCode(e.target.value)} />
            <p className="admin-meta">Введите текущий код — так проверяется, что приложение настроено верно.</p>
          </div>
          <div className="admin-row-actions">
            <AdminButton tone="primary" disabled={busy} onClick={() => { void confirmSetup(); }}>Включить защиту</AdminButton>
            <AdminButton tone="quiet" disabled={busy} onClick={() => { setSetup(null); setCode(''); }}>Отмена</AdminButton>
          </div>
        </div>
      ) : backupCodes ? (
        <div className="admin-stack">
          <p className="admin-meta">
            <ShieldCheck aria-hidden="true" /> Готово. <b>Сохраните резервные коды в менеджер паролей прямо сейчас</b> — второй раз
            они не показываются. Каждый работает один раз и заменяет код из приложения, если телефон потерян.
          </p>
          <p className="admin-secret">{backupCodes.join('   ')}</p>
          <div className="admin-row-actions">
            <AdminButton tone="quiet" onClick={() => { void copy(backupCodes.join('\n'), 'Резервные коды'); }}>
              <Copy aria-hidden="true" /> Скопировать коды
            </AdminButton>
            <AdminButton tone="primary" onClick={() => setBackupCodes(null)}>Я сохранил</AdminButton>
          </div>
        </div>
      ) : (
        <div className="admin-stack">
          <p className="admin-meta">
            Сейчас админка открывается одним паролем. Второй фактор закрывает случай, когда пароль утёк: без телефона
            войти всё равно нельзя.
          </p>
          <div className="admin-field">
            <label htmlFor="sec-start-password" className="admin-label">Пароль от админки</label>
            <input id="sec-start-password" type="password" autoComplete="current-password" className="admin-input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <AdminButton tone="primary" disabled={busy} onClick={() => { void startSetup(); }}>
            <KeyRound aria-hidden="true" /> Настроить код на телефоне
          </AdminButton>
        </div>
      )}
    </AdminPanel>
  );
}
