"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Ticket, Search, ArrowRight, X, Loader2, Trophy, 
  Sparkles, DownloadCloud, ChevronLeft, ChevronRight, Info,
  MessageCircle, Star
} from "lucide-react";
import { db } from "../lib/firebase";
import { 
  collection, onSnapshot, doc, runTransaction, serverTimestamp, 
  query, where, getDocs, limit, orderBy 
} from "firebase/firestore";
import { toast } from "sonner";

interface Raffle {
  id: string;
  title: string;
  description: string;
  price: number;
  totalTickets: number;
  status: string;
}

interface TicketResult {
  name: string;
  phone: string;
  city: string;
  number: number;
  raffleId: string;
}

const TICKETS_PER_PAGE = 100;

export default function Home() {
  const [activeRaffle, setActiveRaffle] = useState<Raffle | null>(null);
  const [ticketStatuses, setTicketStatuses] = useState<Record<number, string>>({});
  const [selectedTickets, setSelectedTickets] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchPhone, setSearchPhone] = useState("");
  const [foundTickets, setFoundTickets] = useState<TicketResult[]>([]);
  const [formData, setFormData] = useState({ name: "", phone: "", city: "" });

  const ticketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, "raffles"), 
      where("status", "==", "active"), 
      orderBy("createdAt", "desc"), 
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setActiveRaffle({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Raffle);
      } else {
        setActiveRaffle(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!activeRaffle) return;
    const q = query(collection(db, "tickets"), where("raffleId", "==", activeRaffle.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const statuses: Record<number, string> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        statuses[data.number] = data.status; 
      });
      setTicketStatuses(statuses);
    });
    return () => unsubscribe();
  }, [activeRaffle]);

  const toggleTicket = (num: number) => {
    if (ticketStatuses[num]) return; 
    if (selectedTickets.includes(num)) {
      setSelectedTickets(prev => prev.filter(t => t !== num));
    } else {
      if (selectedTickets.length >= 20) {
        return toast.warning("Límite alcanzado", { description: "Máximo 20 boletos por persona." });
      }
      setSelectedTickets(prev => [...prev, num]);
    }
  };

  const handleSearch = async () => {
    if (!searchPhone) return toast.error("Ingresa un número");
    setIsSearching(true);
    try {
      const q = query(
        collection(db, "tickets"), 
        where("phone", "==", searchPhone), 
        where("raffleId", "==", activeRaffle?.id || "")
      );
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => doc.data() as TicketResult);
      setFoundTickets(results);
      if (results.length === 0) toast.error("No se encontraron boletos");
      else toast.success(`¡Encontrados ${results.length} boletos!`);
    } catch {
      toast.error("Error en la búsqueda");
    } finally {
      setIsSearching(false);
    }
  };

  const handleCheckout = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRaffle) return;
    setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const ticketRefs = selectedTickets.map(n => doc(db, "tickets", `${activeRaffle.id}_${n}`));
        const ticketDocs = await Promise.all(ticketRefs.map(ref => transaction.get(ref)));
        if (ticketDocs.some(d => d.exists())) {
          throw new Error("Uno de los boletos ya fue apartado.");
        }
        ticketRefs.forEach((ref, i) => {
          transaction.set(ref, {
            number: selectedTickets[i],
            raffleId: activeRaffle.id,
            raffleTitle: activeRaffle.title,
            status: "reserved",
            name: formData.name,
            phone: formData.phone,
            city: formData.city,
            createdAt: serverTimestamp()
          });
        });
      });
      toast.success("¡Boletos apartados!");
      const text = `¡Hola! Aparte boletos para: *${activeRaffle.title}*\n*Números:* ${selectedTickets.join(", ")}\n*Nombre:* ${formData.name}`;
      window.open(`https://wa.me/528332583222?text=${encodeURIComponent(text)}`, '_blank');
      setSelectedTickets([]);
      setIsModalOpen(false);
      setFormData({ name: "", phone: "", city: "" });
    } catch (err: any) {
      toast.error(err.message || "Error al procesar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTicket = async () => {
    if (!ticketRef.current) return;
    try {
      toast.info("Generando pase VIP estelar...");
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(ticketRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#050505",
        logging: false,
        imageTimeout: 0,
        // Forzamos el renderizado sin colores modernos
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('ticket-capture-area');
          if (el) el.style.display = 'block';
        }
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.download = `Pase-VIP-${foundTickets[0]?.name || 'Cliente'}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("¡Pase VIP descargado!");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error de compatibilidad. Toma una captura de pantalla.");
    }
  };

  if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-[#8B5CF6] w-12 h-12" /></div>;

  const total = activeRaffle?.totalTickets || 0;
  const pages = Math.ceil(total / TICKETS_PER_PAGE);
  const start = currentPage * TICKETS_PER_PAGE;
  const end = Math.min(start + TICKETS_PER_PAGE, total);
  const pad = total.toString().length;
  const visible = Array.from({ length: end - start }, (_, i) => start + i);

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] selection:bg-[#8B5CF6]/30 flex flex-col">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[rgba(139,92,246,0.1)] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[rgba(59,130,246,0.1)] blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 flex-grow max-w-6xl mx-auto px-4 pt-16 pb-32 w-full">
        <div className="text-center mb-16">
          <img src="/logo.png" alt="Logo" className="w-32 h-32 mx-auto rounded-full object-cover border-4 border-white/10 shadow-2xl mb-6" />
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4">CREATIVE<span className="text-[#8B5CF6]">SPACE</span></h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">Dinámicas exclusivas con premios increíbles.</p>
        </div>

        {!activeRaffle ? (
          <div className="bg-white/5 border border-white/10 rounded-[3rem] p-20 text-center">
            <Trophy className="w-16 h-16 text-zinc-800 mx-auto mb-6" />
            <h2 className="text-2xl font-black">Próximamente</h2>
          </div>
        ) : (
          <div className="space-y-10">
            <section className="bg-[#0A0A0A] border border-white/10 rounded-[3rem] p-8 md:p-14 shadow-2xl relative overflow-hidden">
              <div className="max-w-2xl">
                <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tighter">{activeRaffle.title}</h2>
                <p className="text-zinc-400 text-lg mb-6">{activeRaffle.description}</p>
                <p className="text-3xl font-black text-[#8B5CF6] mb-8">${activeRaffle.price} MXN</p>
              </div>

              {/* Grid Boletos */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {visible.map((num) => {
                  const status = ticketStatuses[num];
                  const isSelected = selectedTickets.includes(num);
                  return (
                    <button
                      key={num}
                      disabled={!!status}
                      onClick={() => toggleTicket(num)}
                      className={`h-12 rounded-xl font-bold text-xs border transition-all ${
                        isSelected ? "bg-[#8B5CF6] border-transparent text-white" :
                        status === "paid" ? "bg-red-500 border-transparent text-white" :
                        status === "reserved" ? "bg-amber-500 border-transparent text-black" :
                        "bg-zinc-900 border-white/5 text-zinc-500 hover:border-white/20"
                      }`}
                    >
                      {num.toString().padStart(pad, '0')}
                    </button>
                  );
                })}
              </div>

              {/* Paginación */}
              <div className="mt-8 flex justify-center gap-4">
                <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} className="p-2 bg-white/5 rounded-lg"><ChevronLeft /></button>
                <button onClick={() => setCurrentPage(p => Math.min(pages - 1, p + 1))} className="p-2 bg-white/5 rounded-lg"><ChevronRight /></button>
              </div>
            </section>

            {/* Buscador */}
            <div className="bg-[#0A0A0A] border border-white/10 p-8 rounded-[2.5rem]">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Search /> Mis Boletos</h3>
              <div className="flex gap-2">
                <input type="tel" placeholder="Tu WhatsApp" value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} className="flex-1 bg-black border border-white/10 p-4 rounded-xl outline-none" />
                <button onClick={handleSearch} className="bg-white text-black px-6 rounded-xl font-bold">Consultar</button>
              </div>
              {foundTickets.length > 0 && (
                <div className="mt-6 p-6 bg-white/5 rounded-2xl flex justify-between items-center border border-white/10">
                  <div>
                    <p className="font-bold text-lg">{foundTickets[0].name}</p>
                    <p className="text-zinc-500">{foundTickets.length} boletos encontrados</p>
                  </div>
                  <button onClick={downloadTicket} className="bg-[#8B5CF6] p-4 rounded-xl"><DownloadCloud /></button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-10 border-t border-white/5 text-center">
        <p className="font-black text-white">CREATIVE<span className="text-[#8B5CF6]">SPACE</span></p>
        <div className="flex justify-center gap-4 mt-4">
            <a href="https://wa.me/528332583222" className="p-3 bg-white/5 rounded-xl"><MessageCircle /></a>
        </div>
      </footer>

      {/* Checkout Bar */}
      <AnimatePresence>
        {selectedTickets.length > 0 && !isModalOpen && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed bottom-8 inset-x-4 z-50 flex justify-center">
            <div className="bg-zinc-900 border border-white/20 p-4 rounded-full flex items-center gap-6 shadow-2xl">
              <p className="pl-4 font-bold text-xl">${selectedTickets.length * (activeRaffle?.price || 0)} MXN</p>
              <button onClick={() => setIsModalOpen(true)} className="bg-white text-black px-8 py-3 rounded-full font-black">Apartar Ahora</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-[#0A0A0A] border border-white/10 p-8 rounded-[2rem] w-full max-w-md relative">
              <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-zinc-500"><X /></button>
              <h3 className="text-2xl font-black mb-6">Tus Datos</h3>
              <form onSubmit={handleCheckout} className="space-y-4">
                <input required placeholder="Nombre Completo" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-black border border-white/10 p-4 rounded-xl" />
                <input required type="tel" placeholder="WhatsApp" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full bg-black border border-white/10 p-4 rounded-xl" />
                <input required placeholder="Ciudad" value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} className="w-full bg-black border border-white/10 p-4 rounded-xl" />
                <button type="submit" disabled={isSubmitting} className="w-full bg-[#25D366] py-4 rounded-xl font-black text-white">{isSubmitting ? 'Procesando...' : 'Confirmar en WhatsApp'}</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================== */}
      {/* AREA DE CAPTURA (CORREGIDA PARA HTML2CANVAS) */}
      <div className="absolute left-[-9999px] top-0 pointer-events-none">
        <div ref={ticketRef} id="ticket-capture-area" className="w-[500px] bg-[#050505] p-0 font-sans">
          <div style={{ border: '1px solid #333', borderRadius: '40px', backgroundColor: '#0a0a0a', overflow: 'hidden' }}>
              {/* Header con colores sólidos (No LAB/OKLCH) */}
              <div style={{ backgroundColor: '#7c3aed', padding: '40px', textAlign: 'center' }}>
                 <img 
                    src="/logo.png" 
                    crossOrigin="anonymous"
                    style={{ width: '80px', height: '80px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', marginBottom: '15px' }} 
                 />
                 <h1 style={{ color: '#ffffff', fontSize: '24px', fontWeight: '900', margin: '0' }}>CREATIVE SPACE</h1>
                 <p style={{ color: '#ffffff', fontSize: '10px', opacity: '0.8', marginTop: '5px', letterSpacing: '2px' }}>PASE VIP OFICIAL</p>
              </div>
              
              <div style={{ padding: '40px' }}>
                 <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <p style={{ color: '#666', fontSize: '10px', fontWeight: 'bold' }}>PREMIO</p>
                    <h2 style={{ color: '#fff', fontSize: '32px', fontWeight: '900', margin: '10px 0' }}>{activeRaffle?.title || "SORTEO"}</h2>
                 </div>

                 <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '20px', marginBottom: '30px' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                       <p style={{ color: '#666', fontSize: '9px' }}>PARTICIPANTE</p>
                       <p style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>{foundTickets[0]?.name || "CLIENTE"}</p>
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                       <p style={{ color: '#666', fontSize: '9px' }}>ESTADO</p>
                       <p style={{ color: '#25D366', fontSize: '16px', fontWeight: 'bold' }}>CONFIRMADO</p>
                    </div>
                 </div>

                 <div style={{ backgroundColor: '#000', padding: '30px', borderRadius: '25px', textAlign: 'center', border: '1px solid #222' }}>
                    <p style={{ color: '#444', fontSize: '10px', marginBottom: '15px', fontWeight: 'bold' }}>TUS NÚMEROS</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '15px' }}>
                       {foundTickets.map(t => (
                         <span key={t.number} style={{ color: '#fff', fontSize: '40px', fontWeight: '900' }}>
                            {t.number.toString().padStart(pad, '0')}
                         </span>
                       ))}
                    </div>
                 </div>

                 <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', opacity: '0.5' }}>
                    <span style={{ color: '#fff', fontSize: '9px' }}>DIGITAL SOLUTIONS</span>
                    <span style={{ color: '#fff', fontSize: '9px' }}>CREATIVE SPACE MX</span>
                 </div>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}