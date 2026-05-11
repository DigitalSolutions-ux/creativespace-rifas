"use client";

import { useState, useEffect } from "react";
import { auth, db } from "../../lib/firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User,
  signInWithEmailAndPassword 
} from "firebase/auth";
import { 
  collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc, 
  serverTimestamp, query, orderBy 
} from "firebase/firestore";
import { 
  Ticket, LogOut, ShieldCheck, CheckCircle2, Trash2, Check, 
  Clock, Plus, Edit2, Trophy, LayoutDashboard, Users, Loader2, 
  DollarSign, Activity, X, AlertTriangle, Sparkles, Mail, Lock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface TicketData { 
  id: string; number: number; status: "reserved" | "paid"; name: string; phone: string; city: string; raffleId?: string; 
}

interface RaffleData { 
  id: string; title: string; description: string; price: number; totalTickets: number; status: "active" | "finished"; winnerNumber: number | null; 
}

// Configuración de acceso restringido (Todo en minúsculas estrictamente)
const ALLOWED_ADMINS = ["creativespace@ds.com", "angelantonioh882@gmail.com"];

export default function AdminPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"raffles" | "tickets">("raffles");
  
  // Estados para Login Manual
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [raffles, setRaffles] = useState<RaffleData[]>([]);
  
  // Estados para Modales de Rifa
  const [isRaffleModalOpen, setIsRaffleModalOpen] = useState(false);
  const [editingRaffle, setEditingRaffle] = useState<RaffleData | null>(null);
  const [raffleForm, setRaffleForm] = useState({ title: "", description: "", price: 150, totalTickets: 100 });

  // Estados para Alertas
  const [ticketToRelease, setTicketToRelease] = useState<TicketData | null>(null);
  const [raffleToDelete, setRaffleToDelete] = useState<RaffleData | null>(null);
  
  // Estados para la Animación del Sorteo
  const [raffleToDraw, setRaffleToDraw] = useState<RaffleData | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawNumber, setCurrentDrawNumber] = useState<number>(0);
  const [drawFinished, setDrawFinished] = useState(false);

  const activeRaffleCount = raffles.filter(r => r.status === 'active').length;

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      // Verificamos si el correo del usuario está en nuestra lista blanca
      if (currentUser && ALLOWED_ADMINS.includes(currentUser.email?.toLowerCase() || "")) {
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const qRaffles = query(collection(db, "raffles"), orderBy("createdAt", "desc"));
    const unsubRaffles = onSnapshot(qRaffles, (snapshot) => {
      setRaffles(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RaffleData)));
    });
    const unsubTickets = onSnapshot(collection(db, "tickets"), (snapshot) => {
      const t = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TicketData));
      t.sort((a, b) => a.number - b.number);
      setTickets(t);
    });
    return () => { unsubRaffles(); unsubTickets(); };
  }, [user]);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const res = await signInWithPopup(auth, provider);
      if (!ALLOWED_ADMINS.includes(res.user.email?.toLowerCase() || "")) {
        await signOut(auth);
        toast.error("Este correo no tiene permisos de administrador.");
      } else {
        toast.success("Bienvenido de nuevo.");
      }
    } catch { toast.error("Error al conectar con Google."); }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Completa todos los campos.");
    
    setIsLoggingIn(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
      if (!ALLOWED_ADMINS.includes(res.user.email?.toLowerCase() || "")) {
        await signOut(auth);
        toast.error("Acceso denegado: Email no autorizado.");
      } else {
        toast.success("Sesión iniciada correctamente.");
      }
    } catch (err: any) {
      toast.error("Credenciales incorrectas.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const saveRaffle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (editingRaffle) {
        await updateDoc(doc(db, "raffles", editingRaffle.id), { ...raffleForm });
        toast.success("Dinámica actualizada");
      } else {
        if (activeRaffleCount > 0) return toast.error("Ya tienes una rifa activa");
        await addDoc(collection(db, "raffles"), { ...raffleForm, status: "active", winnerNumber: null, createdAt: serverTimestamp() });
        toast.success("Nueva dinámica creada");
      }
      setIsRaffleModalOpen(false);
      setEditingRaffle(null);
    } catch { toast.error("Error al guardar. Revisa tus reglas de Firebase."); }
  };

  const confirmDeleteRaffle = async () => {
    if (!raffleToDelete) return;
    try {
      await deleteDoc(doc(db, "raffles", raffleToDelete.id));
      toast.success("Dinámica eliminada.");
      setRaffleToDelete(null);
    } catch { toast.error("Error al eliminar."); }
  };

  const startCinematicDraw = async () => {
    if (!raffleToDraw) return;
    setIsDrawing(true);
    setDrawFinished(false);
    const total = raffleToDraw.totalTickets;
    let iterations = 0;
    const interval = setInterval(() => {
      setCurrentDrawNumber(Math.floor(Math.random() * total));
      iterations++;
      if (iterations >= 40) {
        clearInterval(interval);
        const winningNum = Math.floor(Math.random() * total);
        setCurrentDrawNumber(winningNum);
        setIsDrawing(false);
        setDrawFinished(true);
        finalizeDrawInDB(raffleToDraw.id, winningNum);
      }
    }, 100);
  };

  const finalizeDrawInDB = async (id: string, winningNum: number) => {
    try {
      await updateDoc(doc(db, "raffles", id), { status: "finished", winnerNumber: winningNum });
    } catch { toast.error("Error al guardar ganador."); }
  };

  const markAsPaid = async (id: string) => {
    try {
      await updateDoc(doc(db, "tickets", id), { status: "paid" });
      toast.success("Pago confirmado");
    } catch { toast.error("Error"); }
  };

  const confirmReleaseTicket = async () => {
    if (!ticketToRelease) return;
    try {
      await deleteDoc(doc(db, "tickets", ticketToRelease.id));
      toast.success(`Boleto #${ticketToRelease.number.toString().padStart(2, '0')} liberado`);
      setTicketToRelease(null);
    } catch { toast.error("Error"); }
  };

  if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#8B5CF6] w-12 h-12" /></div>;

  // ================= PANTALLA DE LOGIN =================
  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#8B5CF6]/5 blur-[100px]" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0A0A0A] border border-white/10 p-10 rounded-[3rem] text-center shadow-2xl max-w-md w-full relative z-10"
        >
          <div className="w-16 h-16 bg-[#8B5CF6]/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
            <ShieldCheck className="w-10 h-10 text-[#8B5CF6]" />
          </div>
          
          <h1 className="text-3xl font-black mb-2 text-white tracking-tighter">COMANDO CENTRAL</h1>
          <p className="text-zinc-500 mb-8 text-sm font-medium">Ingresa para gestionar Creative Space</p>

          <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input 
                type="email" 
                placeholder="Email corporativo" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 pl-12 rounded-2xl text-white outline-none focus:border-[#8B5CF6] transition-colors"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input 
                type="password" 
                placeholder="Contraseña" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 pl-12 rounded-2xl text-white outline-none focus:border-[#8B5CF6] transition-colors"
              />
            </div>
            <button 
              type="submit" 
              disabled={isLoggingIn}
              className="w-full bg-white text-black py-4 rounded-2xl font-black hover:scale-[1.02] transition-transform flex justify-center items-center gap-2"
            >
              {isLoggingIn ? <Loader2 className="animate-spin w-5 h-5" /> : "Entrar al Sistema"}
            </button>
          </form>

          <div className="relative flex items-center gap-4 mb-6">
            <div className="flex-grow h-px bg-white/5" />
            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">O</span>
            <div className="flex-grow h-px bg-white/5" />
          </div>

          <button 
            onClick={handleGoogleLogin} 
            className="w-full bg-white/5 border border-white/10 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-white/10 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google Admin
          </button>
        </motion.div>
      </div>
    );
  }

  // ================= PANEL DE ADMINISTRADOR =================
  const confirmedRev = tickets.filter(t => t.status === 'paid').length * (raffles[0]?.price || 150);
  const pendingRev = tickets.filter(t => t.status === 'reserved').length * (raffles[0]?.price || 150);

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] font-sans selection:bg-[#8B5CF6]/30">
      <nav className="bg-white/5 backdrop-blur-2xl border-b border-white/5 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-[#8B5CF6] p-2 rounded-xl"><Ticket className="w-5 h-5 text-white" /></div>
            <span className="font-black text-lg tracking-tight">ADMIN<span className="text-[#8B5CF6]">WORKSPACE</span></span>
          </div>
          <button onClick={() => signOut(auth)} className="text-zinc-500 hover:text-white bg-white/5 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors">
            <LogOut className="w-4 h-4"/> Salir
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-6 flex items-center gap-6 shadow-xl">
            <div className="w-14 h-14 bg-[#25D366]/10 rounded-2xl flex justify-center items-center"><DollarSign className="text-[#25D366] w-7 h-7" /></div>
            <div><p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Confirmado</p><p className="text-3xl font-black">${confirmedRev}</p></div>
          </div>
          <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-6 flex items-center gap-6 shadow-xl">
            <div className="w-14 h-14 bg-[#F59E0B]/10 rounded-2xl flex justify-center items-center"><Activity className="text-[#F59E0B] w-7 h-7" /></div>
            <div><p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Pendiente</p><p className="text-3xl font-black">${pendingRev}</p></div>
          </div>
          <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-6 flex items-center gap-6 shadow-xl">
            <div className="w-14 h-14 bg-[#3B82F6]/10 rounded-2xl flex justify-center items-center"><Trophy className="text-[#3B82F6] w-7 h-7" /></div>
            <div><p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Rifas Totales</p><p className="text-3xl font-black">{raffles.length}</p></div>
          </div>
        </div>

        <div className="flex gap-2 mb-8 bg-[#0A0A0A] p-2 rounded-2xl border border-white/5 w-max">
          <button onClick={() => setActiveTab("raffles")} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === "raffles" ? "bg-white/10 text-white shadow-xl" : "text-zinc-500 hover:text-white"}`}><LayoutDashboard className="w-4 h-4 inline mr-2" />Gestión Rifas</button>
          <button onClick={() => setActiveTab("tickets")} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === "tickets" ? "bg-white/10 text-white shadow-xl" : "text-zinc-500 hover:text-white"}`}><Users className="w-4 h-4 inline mr-2" />Control Pagos</button>
        </div>

        {activeTab === "raffles" ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black">Sorteos</h2>
              <div className="flex flex-col items-end">
                <button onClick={() => { setEditingRaffle(null); setRaffleForm({ title: "", description: "", price: 150, totalTickets: 100 }); setIsRaffleModalOpen(true); }} disabled={activeRaffleCount > 0} className={`px-6 py-3 rounded-xl font-black flex items-center gap-2 transition-all ${activeRaffleCount > 0 ? 'bg-white/5 text-white/20' : 'bg-white text-black hover:scale-105'}`}><Plus className="w-4 h-4"/> Crear Rifa</button>
                {activeRaffleCount > 0 && <p className="text-[10px] text-[#F59E0B] mt-2 font-bold uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Tienes una rifa activa</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {raffles.map(r => (
                <div key={r.id} className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8 flex flex-col h-full shadow-xl relative overflow-hidden group">
                  <div className={`absolute top-6 right-6 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${r.status === 'active' ? 'text-[#8B5CF6] border-[#8B5CF6]/30 bg-[#8B5CF6]/10' : 'text-zinc-500 border-white/5 bg-white/5'}`}>{r.status}</div>
                  <h3 className="text-2xl font-black mb-2 mt-4 pr-16">{r.title}</h3>
                  <p className="text-zinc-500 text-sm mb-6 flex-grow">{r.description || "Sin descripción"}</p>
                  
                  {r.status === "finished" && (
                     <div className="mb-6 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-4">
                        <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center"><Trophy className="w-5 h-5 text-yellow-500" /></div>
                        <div>
                           <p className="text-[10px] font-black text-yellow-500/80 uppercase tracking-widest">Ganador</p>
                           <p className="text-2xl font-black text-yellow-500">#{r.winnerNumber?.toString().padStart(r.totalTickets.toString().length, '0')}</p>
                        </div>
                     </div>
                  )}

                  <div className="flex gap-2 mt-auto pt-4 border-t border-white/5">
                    <button onClick={() => { setEditingRaffle(r); setRaffleForm({ title: r.title, description: r.description, price: r.price, totalTickets: r.totalTickets }); setIsRaffleModalOpen(true); }} className="flex-1 bg-white/5 hover:bg-white/10 transition-colors py-3 rounded-xl font-bold text-xs flex justify-center items-center gap-2"><Edit2 className="w-3 h-3"/>Editar</button>
                    {r.status === "active" && <button onClick={() => setRaffleToDraw(r)} className="flex-1 bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 transition-opacity py-3 rounded-xl font-black text-xs text-white flex justify-center items-center gap-2 shadow-lg shadow-purple-500/25"><Trophy className="w-3 h-3"/>Sortear</button>}
                    
                    <button onClick={() => setRaffleToDelete(r)} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors px-4 py-3 rounded-xl flex justify-center items-center" title="Eliminar dinámica">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
            <table className="w-full text-left">
              <thead className="bg-black/40 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-white/5">
                <tr><th className="p-6">Boleto</th><th className="p-6">Comprador</th><th className="p-6">Estado</th><th className="p-6 text-right">Acciones</th></tr>
              </thead>
              <tbody className="text-sm">
                {tickets.map(t => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="p-6">
                       <span className="bg-white/10 px-3 py-1 rounded-lg font-black text-white border border-white/5 shadow-inner">#{t.number.toString().padStart(2, '0')}</span>
                    </td>
                    <td className="p-6"><p className="font-bold text-white">{t.name}</p><p className="text-xs text-zinc-500">{t.phone}</p></td>
                    <td className="p-6">
                       {t.status === "paid" ? 
                         <span className="text-[#25D366] font-black text-[10px] uppercase tracking-widest flex items-center gap-1 w-max"><CheckCircle2 className="w-3 h-3" /> Pagado</span> : 
                         <span className="text-[#F59E0B] font-black text-[10px] uppercase tracking-widest flex items-center gap-1 w-max"><Clock className="w-3 h-3" /> Pendiente</span>
                       }
                    </td>
                    <td className="p-6 flex justify-end gap-3">
                      {t.status === "reserved" && <button onClick={() => markAsPaid(t.id)} className="p-3 bg-[#25D366]/10 text-[#25D366] rounded-xl hover:bg-[#25D366] hover:text-white transition-colors" title="Aprobar Pago"><Check className="w-4 h-4"/></button>}
                      <button onClick={() => setTicketToRelease(t)} className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors" title="Liberar Boleto"><Trash2 className="w-4 h-4"/></button>
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-zinc-500 font-medium">Aún no hay transacciones para mostrar.</td></tr>}
              </tbody>
            </table>
          </motion.div>
        )}
      </main>

      {/* ================= REDISEÑO: MODAL DE NUEVA DINÁMICA (Glassmorphism) ================= */}
      <AnimatePresence>
        {isRaffleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#0A0A0A]/80 backdrop-blur-2xl border border-white/10 p-10 rounded-[3rem] w-full max-w-lg relative shadow-[0_0_50px_rgba(139,92,246,0.1)]">
              <button onClick={() => setIsRaffleModalOpen(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white bg-white/5 p-2 rounded-full transition-colors"><X className="w-5 h-5"/></button>
              
              <div className="w-16 h-16 bg-[#8B5CF6]/10 rounded-2xl flex items-center justify-center mb-6 border border-[#8B5CF6]/20">
                 <Sparkles className="w-8 h-8 text-[#8B5CF6]" />
              </div>
              <h3 className="text-3xl font-black mb-2 text-white tracking-tight">{editingRaffle ? "Configurar Dinámica" : "Nueva Dinámica"}</h3>
              <p className="text-zinc-500 text-sm mb-8">Define los parámetros de tu próximo sorteo estelar.</p>
              
              <form onSubmit={saveRaffle} className="space-y-5">
                <div className="space-y-2">
                   <label className="text-[10px] text-zinc-500 font-black uppercase tracking-widest ml-1">Título de la Dinámica</label>
                   <input required value={raffleForm.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRaffleForm({...raffleForm, title: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-2xl outline-none focus:border-[#8B5CF6] text-white transition-all focus:bg-white/5" placeholder="Ej. PC Gamer RTX 4090" />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] text-zinc-500 font-black uppercase tracking-widest ml-1">Descripción del Premio</label>
                   <textarea value={raffleForm.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRaffleForm({...raffleForm, description: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-2xl outline-none focus:border-[#8B5CF6] text-white h-28 resize-none transition-all focus:bg-white/5" placeholder="Especificaciones, detalles del envío..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <label className="text-[10px] text-zinc-500 font-black uppercase tracking-widest ml-1">Precio ($)</label>
                     <input type="number" required min="1" value={raffleForm.price} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRaffleForm({...raffleForm, price: Number(e.target.value)})} className="w-full bg-black/50 border border-white/10 p-4 rounded-2xl outline-none focus:border-[#8B5CF6] text-white transition-all focus:bg-white/5" />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] text-zinc-500 font-black uppercase tracking-widest ml-1">Total Boletos</label>
                     <input type="number" required min="10" value={raffleForm.totalTickets} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRaffleForm({...raffleForm, totalTickets: Number(e.target.value)})} className="w-full bg-black/50 border border-white/10 p-4 rounded-2xl outline-none focus:border-[#8B5CF6] text-white transition-all focus:bg-white/5" />
                  </div>
                </div>
                <button type="submit" className="w-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white py-5 rounded-2xl font-black mt-8 hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/25 flex justify-center items-center gap-2">
                  {editingRaffle ? <Edit2 className="w-5 h-5"/> : <Plus className="w-5 h-5" />} 
                  {editingRaffle ? "Guardar Cambios" : "Crear y Activar Sorteo"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= OTROS MODALES DE CONFIRMACIÓN ================= */}
      <AnimatePresence>
        {ticketToRelease && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#0A0A0A] border border-white/10 p-8 rounded-[2.5rem] w-full max-w-sm text-center shadow-2xl relative">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">¿Liberar Boleto?</h3>
              <p className="text-zinc-400 text-sm mb-8">El boleto <span className="text-white font-bold">#{ticketToRelease.number.toString().padStart(2, '0')}</span> de <span className="text-white font-bold">{ticketToRelease.name}</span> volverá a estar disponible.</p>
              <div className="flex gap-3">
                <button onClick={() => setTicketToRelease(null)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-bold transition-colors">Cancelar</button>
                <button onClick={confirmReleaseTicket} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-black transition-colors shadow-lg shadow-red-500/20">Liberar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {raffleToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#0A0A0A] border border-white/10 p-8 rounded-[2.5rem] w-full max-w-sm text-center shadow-2xl relative">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">¿Eliminar Dinámica?</h3>
              <p className="text-zinc-400 text-sm mb-8">Borrarás de tu historial <span className="text-white font-bold">"{raffleToDelete.title}"</span>. Esta acción es permanente y no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={() => setRaffleToDelete(null)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-bold transition-colors">Cancelar</button>
                <button onClick={confirmDeleteRaffle} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-black transition-colors shadow-lg shadow-red-500/20">Eliminar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {raffleToDraw && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 overflow-hidden">
             {drawFinished && <div className="absolute inset-0 bg-yellow-500/10 blur-[150px] z-0" />}

            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="relative z-10 w-full max-w-lg text-center">
              {!isDrawing && !drawFinished ? (
                <div className="bg-[#0A0A0A] border border-white/10 p-10 rounded-[3rem] shadow-2xl">
                   <div className="w-20 h-20 bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-500/30">
                     <Sparkles className="w-10 h-10 text-white" />
                   </div>
                   <h2 className="text-3xl font-black text-white mb-2">Iniciar Sorteo</h2>
                   <p className="text-zinc-400 mb-8">El sistema elegirá un número al azar para <strong className="text-white">{raffleToDraw.title}</strong>. Esta acción es irrevocable.</p>
                   
                   <div className="flex flex-col gap-3">
                      <button onClick={startCinematicDraw} className="w-full bg-white text-black py-5 rounded-2xl font-black text-lg hover:scale-[1.02] transition-transform">
                         Comenzar Ruleta
                      </button>
                      <button onClick={() => setRaffleToDraw(null)} className="w-full bg-transparent text-zinc-500 hover:text-white py-4 font-bold transition-colors">
                         Cancelar
                      </button>
                   </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                   <p className="text-zinc-400 font-bold uppercase tracking-[0.3em] mb-8">{drawFinished ? 'Número Ganador' : 'Sorteando...'}</p>
                   
                   <motion.div 
                     key={currentDrawNumber}
                     initial={isDrawing ? { opacity: 0.5, y: 50, scale: 0.8 } : { scale: 0.5, opacity: 0 }}
                     animate={isDrawing ? { opacity: 1, y: 0, scale: 1 } : { scale: 1, opacity: 1 }}
                     transition={{ duration: isDrawing ? 0.05 : 0.5, ease: "easeOut" }}
                     className={`text-8xl md:text-[150px] font-black tracking-tighter leading-none tabular-nums
                       ${drawFinished ? 'text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 to-yellow-600 drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]' : 'text-white blur-[1px]'}`
                     }
                   >
                     #{currentDrawNumber.toString().padStart(raffleToDraw.totalTickets.toString().length, '0')}
                   </motion.div>

                   {drawFinished && (
                     <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-12">
                        <button onClick={() => setRaffleToDraw(null)} className="bg-white text-black px-10 py-4 rounded-full font-black flex items-center gap-2 hover:scale-105 transition-transform">
                          Continuar <Check className="w-5 h-5" />
                        </button>
                     </motion.div>
                   )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}