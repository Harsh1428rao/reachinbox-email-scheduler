import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { Mail, AlertCircle, Plus, Search, ExternalLink } from 'lucide-react';
import { ComposeModal } from './components/ComposeModal';

export const App = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [activeTab, setActiveTab] = useState<'SCHEDULED' | 'SENT'>('SCHEDULED');
  const [searchQuery, setSearchQuery] = useState('');
  const [emailList, setEmailList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchEmails = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get('http://localhost:5000/api/emails/search', {
        headers: { Authorization: `Bearer ${token}` },
        params: { status: activeTab, query: searchQuery }
      });
      setEmailList(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [activeTab, searchQuery, token]);

  const handleGoogleSuccess = async (response: any) => {
    const res = await axios.post('http://localhost:5000/api/auth/google', { credential: response.credential });
    setToken(res.data.token);
    setUser(res.data.user);
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.clear();
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-6 text-white">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-700 text-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Mail className="text-white" size={24} />
          </div>
          <h2 className="text-2xl font-bold mb-2">ReachInbox Scheduler</h2>
          <p className="text-slate-400 text-sm mb-6">Scale email distribution with BullMQ concurrency & rate-limiting.</p>
          <div className="flex justify-center">
            <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => alert('Authentication Failed')} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <Mail size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">ReachInbox Engine</h1>
            <span className="text-xs text-slate-400 font-medium">Production Job Dispatcher</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="http://localhost:5000/admin/queues"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
          >
            Live Bull-Board <ExternalLink size={14} />
          </a>
          <div className="flex items-center gap-3 border-l pl-4 border-slate-200">
            <img src={user?.avatar} alt={user?.name} className="w-8 h-8 rounded-full ring-2 ring-indigo-600/20" />
            <div className="text-left text-xs">
              <p className="font-semibold">{user?.name}</p>
              <p className="text-slate-400">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="text-xs text-red-500 hover:underline ml-2">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 bg-slate-200 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('SCHEDULED')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'SCHEDULED' ? 'bg-white shadow text-indigo-600' : 'text-slate-600'}`}
            >
              Scheduled Queue
            </button>
            <button
              onClick={() => setActiveTab('SENT')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'SENT' ? 'bg-white shadow text-indigo-600' : 'text-slate-600'}`}
            >
              Dispatched History
            </button>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition"
          >
            <Plus size={18} /> Compose Sequence
          </button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search email body, subject or recipient via Elasticsearch..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Syncing queue state...</div>
          ) : emailList.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <AlertCircle className="mx-auto mb-2 text-slate-300" size={32} />
              <p className="text-sm font-medium">No records found matching criteria.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-400 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Recipient</th>
                  <th className="px-6 py-3">Subject</th>
                  <th className="px-6 py-3">Execution Time</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emailList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-medium text-slate-900">{item.recipientEmail}</td>
                    <td className="px-6 py-4">{item.subject}</td>
                    <td className="px-6 py-4 text-xs font-mono">
                      {new Date(item.sentAt || item.scheduledAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        item.status === 'SENT' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <ComposeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchEmails}
        token={token}
      />
    </div>
  );
};

export default function Root() {
  return (
    <GoogleOAuthProvider clientId="655194319318-lm40ndiocqvkagskble3ps19ooqbpm57.apps.googleusercontent.com">
      <App />
    </GoogleOAuthProvider>
  );
}
