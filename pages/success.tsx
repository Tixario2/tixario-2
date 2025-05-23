import { useEffect } from 'react';
import { useCart } from '@/context/cartContext';
import Link from 'next/link';

export default function SuccessPage() {
  const { clearCart } = useCart();

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof clearCart === 'function') {
      console.log("✅ clearCart déclenché");
      clearCart();
    }
  }, []);
  



  return (
    <div className="min-h-screen bg-black text-white px-6 py-12 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-xl w-full text-center shadow-xl">
        <h1 className="text-3xl font-bold text-green-400 mb-4">✅ Paiement confirmé</h1>
        <p className="text-lg mb-6">Merci pour ta commande !</p>

        <div className="bg-gray-800 rounded-lg p-4 text-left text-sm text-gray-300 mb-6">
          <p className="mb-2">🎟️ Ton paiement a bien été pris en compte. Nous préparons ta commande avec soin.</p>
          <p className="mb-2">📩 Tu recevras tes billets par email dans les prochaines heures.</p>
          <p className="mb-2">📱 En cas d'urgence, tu peux nous écrire directement sur <a href="https://instagram.com/tixario" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Instagram</a>.</p>
        </div>

        {/* <div className="text-sm text-gray-500 italic mb-4">
          Tu pourrais aussi aimer : <br /> (à activer plus tard)
        </div> */}

        <Link href="/" className="inline-block bg-white text-black px-6 py-2 rounded font-semibold hover:bg-gray-200 transition">
          Retourner à l’accueil
        </Link>
      </div>
    </div>
  );
}

