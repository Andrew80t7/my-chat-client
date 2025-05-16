// src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom';
import axios from 'axios';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import './App.css';

export interface AuthResponse {
  token: string;
  userId: number;
  username: string;
}

// 1) AuthForm
const AuthForm: React.FC<{ onAuth: (d: AuthResponse) => void }> = ({ onAuth }) => {
  const [isReg, setIsReg] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const ep = isReg ? '/register' : '/login';
      const { data } = await axios.post<AuthResponse>(
        `http://localhost:8080${ep}`,
        form
      );
      onAuth(data);
    } catch (e: any) {
      const m = e.response?.data || e.message;
      setErr(isReg ? `Регистрация не удалась: ${m}` : `Вход не удался: ${m}`);
    }
  };

  return (
    <div className="auth-container">
      <h2>{isReg ? 'Регистрация' : 'Вход'}</h2>
      {err && <div className="error">{err}</div>}
      <form onSubmit={submit} className="auth-form">
        <input
          type="text"
          placeholder="Имя пользователя"
          value={form.username}
          onChange={e => setForm({ ...form, username: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          required
          minLength={6}
        />
        <button type="submit" className="auth-btn">
          {isReg ? 'Зарегистрироваться' : 'Войти'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setIsReg(!isReg)}
        className="toggle-mode"
      >
        {isReg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
      </button>
    </div>
  );
};

// 2) ChatList
interface ChatSummary { id: number; participants: { username: string }[]; }

const ChatList: React.FC<{ token: string }> = ({ token }) => {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const uid = localStorage.getItem('userId')!;

  useEffect(() => {
    axios
      .get<ChatSummary[]>(`http://localhost:8080/chats/user/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(res => setChats(res.data))
      .catch(console.error);
  }, [token, uid]);

  return (
    <div className="chat-list">
      <h2>Мои чаты</h2>
      <ul>
        {chats.map(c => (
          <li key={c.id}>
            <Link to={`/chat/${c.id}`}>
              Чат {c.id}: {c.participants.map(u => u.username).join(', ')}
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/create-chat" className="create-link">
        + Новый чат
      </Link>
    </div>
  );
};

// 3) CreateChat
interface UserSummary { id: number; username: string; }

const CreateChat: React.FC<{ token: string }> = ({ token }) => {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    axios
      .get<UserSummary[]>(`http://localhost:8080/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(res => setUsers(res.data))
      .catch(console.error);
  }, [token]);

  const toggle = (id: number) =>
    setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const create = () => {
    axios
      .post<{ id: number }>(
        `http://localhost:8080/chats/create`,
        { participantIds: sel },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(res => nav(`/chat/${res.data.id}`))
      .catch(console.error);
  };

  return (
    <div className="create-chat">
      <h2>Создать чат</h2>
      <ul>
        {users.map(u => (
          <li key={u.id}>
            <label>
              <input
                type="checkbox"
                checked={sel.includes(u.id)}
                onChange={() => toggle(u.id)}
              />{' '}
              {u.username}
            </label>
          </li>
        ))}
      </ul>
      <button onClick={create} disabled={sel.length === 0}>
        Создать
      </button>
    </div>
  );
};

// 4) ChatWindow
interface Message { senderId: number; text: string; timestamp: string; }

const ChatWindow: React.FC<{ token: string }> = ({ token }) => {
  const { chatId } = useParams<{ chatId: string }>();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const clientRef = useRef<Client | null>(null);
  const uid = Number(localStorage.getItem('userId'));

  // история
  useEffect(() => {
    if (!chatId) return;
    axios
      .get<Message[]>(`http://localhost:8080/messages/chat/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { userId: uid },
      })
      .then(res => setMsgs(res.data))
      .catch(console.error);
  }, [chatId, token, uid]);

  // WS
  useEffect(() => {
    if (!chatId) return;
    const socket = new SockJS('http://localhost:8080/ws');
    const client = new Client({
      webSocketFactory: () => socket,
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        client.subscribe(`/topic/chat/${chatId}`, (msg: IMessage) => {
          setMsgs(prev => [...prev, JSON.parse(msg.body)]);
        });
      },
    });
    client.activate();
    clientRef.current = client;
    return () => { client.deactivate(); };
  }, [chatId, token]);

  const send = () => {
    if (!input.trim() || !clientRef.current?.connected) return;
    const m = {
      senderId: uid,
      chatId: Number(chatId),
      text: input,
      timestamp: new Date().toISOString(),
    };
    clientRef.current.publish({
      destination: '/app/send',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(m),
    });
    setInput('');
  };

  return (
    <div className="chat-window">
      <h2>Чат {chatId}</h2>
      <div className="chat-history">
        {msgs.map((m, i) => (
          <div key={i} className={m.senderId === uid ? 'mine' : 'other'}>
            <strong>{m.senderId}</strong>: {m.text}{' '}
            <span className="time">
              {new Date(m.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && send()}
        />
        <button onClick={send}>Отправить</button>
      </div>
    </div>
  );
};

// Main App
const AppContent: React.FC = () => {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const nav = useNavigate();

  const onAuth = (d: AuthResponse) => {
    localStorage.setItem('token', d.token);
    localStorage.setItem('userId', String(d.userId));
    localStorage.setItem('username', d.username);
    setAuth(d);
    nav('/chats');
  };

  const logout = () => {
    localStorage.clear();
    setAuth(null);
    nav('/');
  };

  return (
    <div className="app-container">
      {auth ? (
        <>
          <nav className="navbar">
            <span>{auth.username}</span>
            <button onClick={logout}>Выйти</button>
            <Link to="/chats">Мои чаты</Link>
          </nav>
          <Routes>
            <Route path="/chats" element={<ChatList token={auth.token} />} />
            <Route path="/create-chat" element={<CreateChat token={auth.token} />} />
            <Route path="/chat/:chatId" element={<ChatWindow token={auth.token} />} />
          </Routes>
        </>
      ) : (
        <Routes>
          <Route path="/*" element={<AuthForm onAuth={onAuth} />} />
        </Routes>
      )}
    </div>
  );
};

export default AppContent;