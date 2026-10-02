import React, { useState, useMemo } from 'react';
import employeesData from './employees.json';
import { 
  Users, Calendar, Clock, CheckCircle2, Copy, Search, ExternalLink, 
  Sparkles, ShieldCheck, Terminal, Layers, ArrowUpRight, Zap, Globe, X
} from 'lucide-react';

interface Connection {
  capability: string;
  providers: string[];
  required: boolean;
  readonly: boolean;
}

interface Routine {
  id: string;
  days: string;
  fire: string;
  window_start: string;
  window_end: string;
  budget: string;
  browser: string;
}

interface Employee {
  slug: string;
  name: string;
  role: string;
  version: string;
  requires: {
    node: string;
    harness: string[];
  };
  connections: Connection[];
  routines: Routine[];
  install_prompt: string;
  role_content: string;
}

const employees = employeesData as Employee[];

const THEMES: Record<string, { bg: string; text: string; border: string; badge: string; gradient: string }> = {
  'gtm-engineer': {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    gradient: 'from-emerald-500 to-teal-700',
  },
  'seo-employee': {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    gradient: 'from-cyan-500 to-blue-700',
  },
  'web-dev-employee': {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    gradient: 'from-blue-500 to-indigo-700',
  },
  'social-media-employee': {
    bg: 'bg-pink-500/10',
    text: 'text-pink-400',
    border: 'border-pink-500/30',
    badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    gradient: 'from-pink-500 to-rose-700',
  },
  'ad-manager-employee': {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    gradient: 'from-amber-500 to-orange-700',
  },
  'sales-employee': {
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    badge: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    gradient: 'from-violet-500 to-purple-700',
  },
  'customer-satisfaction-employee': {
    bg: 'bg-teal-500/10',
    text: 'text-teal-400',
    border: 'border-teal-500/30',
    badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    gradient: 'from-teal-500 to-emerald-700',
  },
  'chief-of-staff': {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    gradient: 'from-purple-500 to-fuchsia-700',
  },
};

export default function App() {
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [activeModal, setActiveModal] = useState<Employee | null>(null);
  const [modalTab, setModalTab] = useState<'routines' | 'contract' | 'prompt'>('routines');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const totalRoutines = useMemo(() => {
    return employees.reduce((acc, curr) => acc + (curr.routines?.length || 0), 0);
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase()) ||
        emp.role.toLowerCase().includes(search.toLowerCase()) ||
        emp.routines.some(r => r.id.toLowerCase().includes(search.toLowerCase()));
      
      if (selectedRole === 'all') return matchSearch;
      if (selectedRole === 'growth') return matchSearch && ['gtm-engineer', 'seo-employee', 'ad-manager-employee', 'sales-employee'].includes(emp.slug);
      if (selectedRole === 'tech') return matchSearch && ['web-dev-employee', 'seo-employee'].includes(emp.slug);
      if (selectedRole === 'ops') return matchSearch && ['chief-of-staff', 'customer-satisfaction-employee', 'social-media-employee'].includes(emp.slug);
      return matchSearch;
    });
  }, [search, selectedRole]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight text-white">AI Employees</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  v1.9.0
                </span>
              </div>
              <p className="text-xs text-slate-400">8 Scheduled Business Roles · 60 Routines · Open Source</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a 
              href="https://github.com/markfulton/ai-employees" 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              <span>GitHub Repo</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl p-8 border border-indigo-500/20 bg-gradient-to-b from-indigo-950/40 via-slate-900/40 to-slate-950/60 backdrop-blur-md">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Autonomous Business Workforce</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-3">
                Eight AI Employees. <span className="gradient-text">Each runs a whole business role.</span>
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                60 scheduled routines running autonomously on Claude Code, Antigravity, OpenClaw and 10+ harnesses. 
                They execute daily business workflows, maintain error-free logs, and operate on your own files.
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold text-indigo-400">8</span>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Active Roles</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold text-purple-400">{totalRoutines}</span>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Routines</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center text-center col-span-2 sm:col-span-1">
                <span className="text-2xl font-bold text-pink-400">12+</span>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Harnesses</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 rounded-xl border border-slate-800 w-full sm:w-auto">
            {[
              { id: 'all', label: 'All Roles (8)' },
              { id: 'growth', label: 'Growth & Marketing' },
              { id: 'tech', label: 'Tech & Search' },
              { id: 'ops', label: 'Operations & CS' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedRole(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedRole === tab.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search roles or routines..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Employees Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredEmployees.map(emp => {
            const theme = THEMES[emp.slug] || THEMES['gtm-engineer'];
            return (
              <div 
                key={emp.slug}
                className="glass-card rounded-2xl p-5 flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Glow accent */}
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-15 pointer-events-none ${theme.bg}`} />

                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white bg-gradient-to-tr ${theme.gradient} shadow-md`}>
                      {emp.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${theme.badge}`}>
                      {emp.routines.length} routines
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-white group-hover:text-indigo-300 transition-colors">
                    {emp.name}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 line-clamp-1">{emp.role}</p>

                  {/* Capabilities / Connections tags */}
                  <div className="mb-5">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                      Integrations
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {emp.connections.slice(0, 4).map(c => (
                        <span 
                          key={c.capability}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60"
                        >
                          {c.capability.split('.')[0]}
                        </span>
                      ))}
                      {emp.connections.length > 4 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                          +{emp.connections.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex flex-col gap-2 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => {
                      setActiveModal(emp);
                      setModalTab('routines');
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-xs font-semibold text-white transition-colors"
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>View 60-Schedule</span>
                  </button>

                  <button
                    onClick={() => handleCopy(emp.install_prompt, emp.slug)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-xs font-semibold text-indigo-300 transition-colors"
                  >
                    {copiedId === emp.slug ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied Prompt!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Copy Install Prompt</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Detail Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white bg-gradient-to-tr ${THEMES[activeModal.slug]?.gradient || 'from-indigo-500 to-purple-700'}`}>
                  {activeModal.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{activeModal.name}</h3>
                  <p className="text-xs text-slate-400">{activeModal.role}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(activeModal.install_prompt, 'modal')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                >
                  {copiedId === 'modal' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Prompt</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center gap-4 px-6 border-b border-slate-800 bg-slate-950/20 text-xs font-semibold">
              <button
                onClick={() => setModalTab('routines')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'routines'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Scheduled Routines ({activeModal.routines.length})</span>
              </button>
              <button
                onClick={() => setModalTab('contract')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'contract'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Role Contract & SOP</span>
              </button>
              <button
                onClick={() => setModalTab('prompt')}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  modalTab === 'prompt'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>Install Prompt</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 font-sans">
              {modalTab === 'routines' && (
                <div className="flex flex-col gap-3">
                  <div className="text-xs text-slate-400 mb-1">
                    Automated routines executed by {activeModal.name} according to business schedules:
                  </div>
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-4">Routine ID</th>
                          <th className="py-2.5 px-3">Days</th>
                          <th className="py-2.5 px-3">Fire Time</th>
                          <th className="py-2.5 px-3">Budget</th>
                          <th className="py-2.5 px-3">Browser</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {activeModal.routines.map(r => (
                          <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-4 font-semibold text-indigo-300">{r.id}</td>
                            <td className="py-3 px-3 text-slate-300 font-sans">{r.days}</td>
                            <td className="py-3 px-3 text-amber-300">{r.fire}</td>
                            <td className="py-3 px-3 text-slate-400 font-sans">{r.budget}</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-sans uppercase font-bold ${
                                r.browser === 'never' ? 'bg-slate-800 text-slate-400' :
                                r.browser === 'heavy' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                                'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}>
                                {r.browser}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {modalTab === 'contract' && (
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                  {activeModal.role_content || 'No contract details found.'}
                </div>
              )}

              {modalTab === 'prompt' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Paste this prompt into Claude Code, Antigravity, OpenClaw or your AI harness:
                    </span>
                  </div>
                  <pre className="bg-slate-950 p-5 rounded-xl border border-slate-800 font-mono text-xs text-indigo-200 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                    {activeModal.install_prompt}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
