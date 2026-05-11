export default function Loading() {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4">
        {/* Un spinner elegante con los colores de Creative Space */}
        <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
        <p className="text-zinc-400 animate-pulse font-medium">Cargando dinámicas...</p>
      </div>
    </div>
  );
}