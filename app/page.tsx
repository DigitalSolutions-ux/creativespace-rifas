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
import { toPng } from "html-to-image";
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
          throw new Error("Uno de los boletos ya fue apartado por otra persona.");
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
      const text = `¡Hola! Aparte boletos para: *${activeRaffle.title}*\n*Números:* ${selectedTickets.join(", ")}\n*Total:* $${selectedTickets.length * activeRaffle.price} MXN\n*Nombre:* ${formData.name}`;
      window.open(`https://api.whatsapp.com/send?phone=528332583222&text=${encodeURIComponent(text)}`, '_blank');
      
      setSelectedTickets([]);
      setIsModalOpen(false);
      setFormData({ name: "", phone: "", city: "" });
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("Error al procesar el apartado");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTicket = async () => {
  if (!ticketRef.current) return;

  try {
    toast.info("Generando pase VIP estelar...");

    // Usamos html2canvas para mayor compatibilidad en móviles y Vercel
    const html2canvas = (await import('html2canvas')).default; // Import dinámico para no pesar al inicio
    
    const canvas = await html2canvas(ticketRef.current, {
      scale: 3,            // Triple resolución para que no se pixelee
      useCORS: true,       // CRÍTICO: Permite que el logo salga en la foto
      backgroundColor: null, // Mantiene la transparencia si tu diseño la tiene
      logging: false,
    });

    // Generamos la URL de la imagen
    const dataUrl = canvas.toDataURL("image/png");
    
    // Formateo seguro de nombres (evita errores si el objeto es undefined)
    const userName = foundTickets[0]?.name?.replace(/\s+/g, "_") || "Cliente";
    const raffleTitle = activeRaffle?.title?.replace(/\s+/g, "_") || "Sorteo";

    const link = document.createElement('a');
    link.download = `Pase-VIP-${userName}-${raffleTitle}.png`;
    link.href = dataUrl;
    
    // Truco de Ingeniero: Añadir y quitar el link del DOM mejora compatibilidad en iOS/Safari
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("¡Pase VIP descargado con éxito!");
  } catch (error) {
    console.error("Error al generar el pase:", error);
    toast.error("No se pudo generar la imagen. Intenta de nuevo.");
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
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] font-sans selection:bg-[#8B5CF6]/30 flex flex-col">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#8B5CF6]/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#3B82F6]/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 flex-grow max-w-6xl mx-auto px-4 pt-16 pb-32 w-full">
        
        {/* ================= HERO CENTRADO BRANDING ================= */}
        <div className="text-center mb-16">
          <motion.img 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            src="/logo-nvo.png" 
            alt="Creative Space Logo" 
            className="w-32 h-32 md:w-40 md:h-40 mx-auto rounded-full object-cover border-4 border-white/10 shadow-[0_0_50px_rgba(139,92,246,0.3)] mb-6"
          />
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4">CREATIVE<span className="text-[#8B5CF6]">SPACE</span></h1>
          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto font-medium">
            Participa en nuestras dinámicas exclusivas y gana premios increíbles de forma segura y totalmente transparente.
          </p>
        </div>

        {!activeRaffle ? (
          <div className="bg-white/[0.02] border border-white/5 rounded-[3rem] p-20 text-center backdrop-blur-xl">
            <Trophy className="w-16 h-16 text-zinc-800 mx-auto mb-6" />
            <h2 className="text-2xl font-black mb-2">Próximamente</h2>
            <p className="text-zinc-500">Estamos preparando una dinámica increíble para ti.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* SECCIÓN DE LA RIFA */}
            <section className="relative bg-[#0A0A0A] border border-white/10 rounded-[3rem] p-8 md:p-14 shadow-2xl overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 hidden md:block">
                 <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Precio</p>
                    <p className="text-4xl font-black text-white">${activeRaffle.price}<span className="text-sm text-zinc-500 font-bold ml-1">MXN</span></p>
                 </div>
              </div>

              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-3 py-1.5 rounded-full mb-6">
                  <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  <span className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-tighter">Sorteo Activo</span>
                </div>
                <h2 className="text-4xl md:text-6xl font-black mb-6 leading-[1.1] tracking-tighter">
                  {activeRaffle.title}
                </h2>
                <p className="text-zinc-400 text-lg max-w-lg leading-relaxed mb-6">{activeRaffle.description}</p>
                <div className="md:hidden inline-block bg-white/5 border border-white/10 px-6 py-3 rounded-xl mb-6">
                    <span className="text-xl font-black text-[#8B5CF6]">${activeRaffle.price} MXN / boleto</span>
                </div>
              </div>

              {/* LEYENDA DE COLORES */}
              <div className="flex flex-wrap items-center gap-4 mb-8 p-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
                 <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-[#111111] border border-white/10"></div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Disponible</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-[#8B5CF6]"></div>
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Tu Selección</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-[#F59E0B]"></div>
                    <span className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-widest">Apartado</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-red-500"></div>
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Pagado</span>
                 </div>
              </div>

              {/* Paginación */}
              <div className="mt-8 flex items-center justify-between bg-black/40 border border-white/5 p-2 rounded-2xl backdrop-blur-md">
                <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="p-3 hover:bg-white/5 rounded-xl disabled:opacity-20 transition-all">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-sm font-bold text-zinc-400">
                  <span className="text-white">{start.toString().padStart(pad, '0')}</span> - <span className="text-white">{(end - 1).toString().padStart(pad, '0')}</span>
                </div>
                <button onClick={() => setCurrentPage(p => Math.min(pages - 1, p + 1))} disabled={currentPage === pages - 1} className="p-3 hover:bg-white/5 rounded-xl disabled:opacity-20 transition-all">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* GRID DE BOLETOS */}
              <div className="mt-6 grid grid-cols-5 sm:grid-cols-10 gap-2.5 relative z-10">
                {visible.map((num) => {
                  const status = ticketStatuses[num];
                  const isSelected = selectedTickets.includes(num);
                  
                  let btnClass = "";
                  if (isSelected) {
                     btnClass = "bg-[#8B5CF6] border-transparent text-white shadow-lg shadow-purple-500/40 z-10 scale-110";
                  } else if (status === "paid") {
                     btnClass = "bg-red-500 border-transparent text-white cursor-not-allowed opacity-80";
                  } else if (status === "reserved") {
                     btnClass = "bg-[#F59E0B] border-transparent text-black cursor-not-allowed opacity-90";
                  } else {
                     btnClass = "bg-[#111111] border-white/5 text-zinc-400 hover:border-[#8B5CF6] hover:text-white";
                  }

                  return (
                    <motion.button
                      whileHover={!status ? { scale: 1.05, y: -2 } : {}}
                      whileTap={!status ? { scale: 0.95 } : {}}
                      key={num}
                      onClick={() => toggleTicket(num)}
                      disabled={!!status}
                      className={`h-14 rounded-2xl font-black text-sm transition-all duration-200 border ${btnClass}`}
                    >
                      {num.toString().padStart(pad, '0')}
                    </motion.button>
                  );
                })}
              </div>
            </section>

            {/* SECCIÓN DE BÚSQUEDA Y AYUDA */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-[#0A0A0A] border border-white/10 p-8 rounded-[2.5rem] flex flex-col justify-center relative overflow-hidden">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10"><Search className="w-5 h-5 text-zinc-400" /></div>
                  <h3 className="text-xl font-bold">Mis Boletos</h3>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input type="tel" placeholder="Tu número de WhatsApp" value={searchPhone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchPhone(e.target.value)} className="flex-1 bg-black/50 border border-white/10 p-4 rounded-2xl text-white focus:border-[#8B5CF6] transition-all outline-none" />
                  <button onClick={handleSearch} disabled={isSearching} className="bg-white text-black px-8 py-4 rounded-2xl font-black hover:bg-zinc-200 transition-all flex items-center justify-center gap-2">
                    {isSearching ? <Loader2 className="animate-spin w-5 h-5" /> : 'Consultar'}
                  </button>
                </div>
                <AnimatePresence>
                  {foundTickets.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 pt-8 border-t border-white/5">
                      <div className="bg-white/[0.03] border border-white/10 p-6 rounded-3xl flex justify-between items-center">
                        <div>
                          <p className="text-[10px] text-zinc-500 font-black uppercase mb-1">Nombre</p>
                          <p className="font-bold">{foundTickets[0].name}</p>
                          <p className="text-sm text-zinc-400 mt-1">{foundTickets.length} boletos</p>
                        </div>
                        <button onClick={downloadTicket} className="bg-[#8B5CF6] p-4 rounded-2xl hover:scale-105 transition-transform"><DownloadCloud className="w-6 h-6 text-white" /></button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="bg-gradient-to-br from-[#8B5CF6]/5 to-transparent border border-white/10 p-8 rounded-[2.5rem] flex flex-col items-center justify-center text-center">
                 <div className="w-16 h-16 bg-[#8B5CF6]/10 rounded-full flex items-center justify-center mb-6"><Info className="text-[#8B5CF6] w-8 h-8" /></div>
                 <h4 className="text-lg font-bold mb-2">Ayuda</h4>
                 <p className="text-zinc-500 text-sm">¿Dudas con tu pago? Contáctanos de inmediato para validar tus boletos.</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER CORPORATIVO CON SVGS */}
      <footer className="relative z-10 border-t border-white/5 bg-[#050505] mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black tracking-tighter text-white">CREATIVE<span className="text-[#8B5CF6]">SPACE</span></h2>
          </div>
          {/* Centro: Redes Sociales */}
<div className="flex items-center gap-4">
  {/* FACEBOOK */}
  <a 
    href="https://www.facebook.com/people/Creative-Space/61560473976903/" 
    target="_blank" 
    rel="noopener noreferrer"
    className="w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center rounded-2xl text-zinc-400 hover:text-white transition-all"
  >
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
  </a>

  {/* INSTAGRAM */}
  <a 
    href="https://www.instagram.com/creative_space.mx" 
    target="_blank" 
    rel="noopener noreferrer"
    className="w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center rounded-2xl text-zinc-400 hover:text-white transition-all"
  >
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
  </a>

  {/* WHATSAPP (Directo al chat) */}
  <a 
    href="https://wa.me/528332583222" 
    target="_blank" 
    rel="noopener noreferrer"
    className="w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center rounded-2xl text-zinc-400 hover:text-white transition-all"
  >
    <MessageCircle className="w-5 h-5" />
  </a>
</div>
          <div className="text-center md:text-right">
             <p className="text-sm font-bold text-white">CREATIVE SPACE</p>
             <p className="text-xs font-bold text-zinc-500 mt-1">x Digital Solutions</p>
          </div>
        </div>
      </footer>

      {/* Floating Checkout */}
      <AnimatePresence>
        {selectedTickets.length > 0 && !isModalOpen && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="fixed bottom-8 left-4 right-4 z-50 flex justify-center">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 p-4 pl-8 rounded-full shadow-2xl flex items-center gap-8">
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Resumen</p>
                <p className="text-2xl font-black">${selectedTickets.length * (activeRaffle?.price || 0)} <span className="text-xs text-[#8B5CF6] font-bold">MXN</span></p>
              </div>
              <button onClick={() => setIsModalOpen(true)} className="bg-white text-black px-10 py-4 rounded-full font-black flex items-center gap-2 hover:scale-105 transition-all">
                Apartar <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Registro */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#0A0A0A] border border-white/10 p-8 md:p-12 rounded-[3rem] w-full max-w-md relative shadow-2xl">
              <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X /></button>
              <h3 className="text-3xl font-black mb-2">Tus Datos</h3>
              <p className="text-zinc-500 text-sm mb-8">Información necesaria para registrar tus números.</p>
              <form onSubmit={handleCheckout} className="space-y-4">
                <input required placeholder="Nombre Completo" value={formData.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, name: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-[#8B5CF6]" />
                <input required type="tel" placeholder="WhatsApp (10 dígitos)" value={formData.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, phone: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-[#8B5CF6]" />
                <input required placeholder="Ciudad" value={formData.city} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, city: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-[#8B5CF6]" />
                <button type="submit" disabled={isSubmitting} className="w-full bg-[#25D366] py-5 rounded-2xl font-black text-white hover:bg-[#1EBE5C] transition-all flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Confirmar en WhatsApp'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================== */}
      {/* =================  NUEVO DISEÑO VIP TICKET  ================== */}
      {/* Seccion Oculta para Descarga */}
      <div className="absolute left-[-9999px] top-0">
        <div ref={ticketRef} className="w-[550px] bg-[#050505] p-10 text-white font-sans overflow-hidden">
          {/* Fondo Holográfico/Frost con bordes Glow */}
          <div className="relative border border-white/10 rounded-[2.5rem] bg-[#0A0A0A]/60 backdrop-blur-3xl overflow-hidden shadow-[0_0_80px_rgba(139,92,246,0.15)]">
             
             {/* Luces de fondo decorativas */}
             <div className="absolute top-[-50px] left-[-50px] w-40 h-40 bg-[#8B5CF6]/10 blur-[60px] rounded-full" />
             <div className="absolute bottom-[-50px] right-[-50px] w-40 h-40 bg-[#3B82F6]/05 blur-[60px] rounded-full" />

             {/* Header Holográfico */}
             <div className="bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] p-10 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-black/20" />
                <img src="/logo.png" alt="Creative Space Logo VIP" className="w-20 h-20 mx-auto rounded-full object-cover border-4 border-white/20 shadow-lg mb-4 relative z-10" />
                <h1 className="text-3xl font-black tracking-tighter relative z-10 text-white shadow-sm">CREATIVE SPACE</h1>
                <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full mt-3 relative z-10 border border-white/10">
                   <Star className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                   <p className="text-[11px] font-bold uppercase tracking-widest text-white">Pase VIP Oficial de Participación</p>
                </div>
             </div>
             
             {/* Contenido Principal */}
             <div className="p-10 space-y-10 relative z-10">
                {/* Premio */}
                <div className="text-center">
                   <p className="text-zinc-500 text-[10px] font-bold uppercase mb-1 tracking-widest">Premio Estelar</p>
                   <h2 className="text-4xl font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)]">
                      {activeRaffle?.title || "Cargando Premio..."}
                   </h2>
                </div>

                {/* Separador con Glow */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent shadow-[0_0_10px_rgba(139,92,246,0.5)]" />

                {/* Datos del Participante */}
                <div className="grid grid-cols-2 gap-8 text-center">
                   <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-medium tracking-widest">Participante</p>
                      <p className="text-xl font-bold text-white mt-1.5">{foundTickets[0]?.name || "Cliente VIP"}</p>
                   </div>
                   <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-medium tracking-widest">WhatsApp</p>
                      <p className="text-xl font-bold text-white mt-1.5">
                         {foundTickets[0]?.phone ? `+52 ${foundTickets[0].phone}` : "No Registrado"}
                      </p>
                   </div>
                </div>

                {/* TUS NÚMEROS ESTELARES */}
                <div className="bg-black/50 border border-white/05 p-8 rounded-3xl text-center shadow-inner relative overflow-hidden group">
                   <div className="absolute inset-0 bg-gradient-to-b from-[#8B5CF6]/05 to-transparent opacity-50" />
                   <p className="text-[11px] text-zinc-400 uppercase font-black mb-6 tracking-[0.2em] relative z-10">Tus Números Estelares</p>
                   <div className="flex flex-wrap justify-center gap-4 relative z-10">
                      {foundTickets.length > 0 ? (
                         foundTickets.map(t => (
                           <motion.span 
                              key={t.number} 
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-zinc-400 drop-shadow-[0_2px_15px_rgba(139,92,246,0.3)] tabular-nums"
                           >
                              {t.number.toString().padStart(pad, '0')}
                           </motion.span>
                         ))
                      ) : (
                         <span className="text-xl font-bold text-zinc-600">No hay números confirmados.</span>
                      )}
                   </div>
                </div>

                {/* Estado y Sello */}
                <div className="flex justify-between items-center pt-8 border-t border-white/05">
                   <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-medium tracking-widest">Estado</p>
                      <div className="inline-flex items-center gap-1.5 bg-[#25D366]/10 text-[#25D366] px-3 py-1 rounded-full mt-1 border border-[#25D366]/20">
                         <Star className="w-3 h-3 fill-[#25D366]" />
                         <span className="text-xs font-bold uppercase tracking-widest">Confirmado</span>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-tighter text-zinc-600">Firma Digital Solutions</p>
                      <p className="text-xs font-bold text-zinc-300 mt-1">Creative Space <span className="text-[#8B5CF6]">x Digital Solutions</span></p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}